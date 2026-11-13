#!/usr/bin/env node
/**
 * Benchmark de ponta a ponta do CAD-WEB no navegador (Playwright + Chromium).
 *
 * Pré-requisitos: app rodando (`npm run dev`) e Playwright instalado. Variáveis opcionais:
 *   PLAYWRIGHT_MODULE  caminho do módulo playwright (padrão: "playwright")
 *   CHROMIUM_PATH      executável do Chromium (padrão: o do Playwright)
 *   CAD_URL            URL do app (padrão: http://127.0.0.1:5173/)
 *
 * Uso: node scripts/perf/browser-bench.mjs <arquivo.dxf> [rótulo] [saida.json]
 *
 * Mede, por fase: tempo até estabilizar, intervalos entre quadros (p50/p95/máx) e tarefas longas
 * (>50 ms) da thread principal, que são o travamento percebido pelo usuário.
 */
import { writeFileSync } from "node:fs";

const [file, label = "bench", outputPath] = process.argv.slice(2);

if (file === undefined) {
  console.error("Uso: node scripts/perf/browser-bench.mjs <arquivo.dxf> [rótulo] [saida.json]");
  process.exit(1);
}

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await (await browser.newContext({ viewport: { width: 1440, height: 860 } })).newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
await page.goto(process.env.CAD_URL ?? "http://127.0.0.1:5173/", { waitUntil: "networkidle" });
await page.waitForTimeout(600);

// Amostrador de quadros e tarefas longas dentro da página.
await page.evaluate(() => {
  window.__bench = { frames: [], longTasks: [], running: false, last: 0 };
  new PerformanceObserver((list) => {
    if (window.__bench.running) for (const entry of list.getEntries()) window.__bench.longTasks.push({ start: entry.startTime, duration: entry.duration });
  }).observe({ entryTypes: ["longtask"] });
  const tick = (now) => {
    if (window.__bench.running) window.__bench.frames.push(now - window.__bench.last);
    window.__bench.last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

// Latência de cada movimento do mouse (o CDP só responde depois que o evento foi tratado pela página).
const MOVES = Number(process.env.BENCH_MOVES ?? 40);
let moveLatencies = [];
async function timedMove(x, y) {
  const started = Date.now();
  await page.mouse.move(x, y);
  moveLatencies.push(Date.now() - started);
}

const quantile = (values, q) => (values.length === 0 ? 0 : [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * q))]);
const results = {};

// BENCH_PROFILE="<fase>" liga o profiler de CPU do Chromium durante a fase e imprime as funções mais pesadas.
const PROFILE_PHASE = process.env.BENCH_PROFILE;
async function phase(name, action) {
  const profiling = PROFILE_PHASE !== undefined && name.startsWith(PROFILE_PHASE);
  let cdp = null;
  if (profiling) {
    cdp = await page.context().newCDPSession(page);
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: 500 });
    await cdp.send("Profiler.start");
  }
  try {
    await runPhase(name, action);
  } finally {
    if (cdp !== null) {
      const { profile } = await cdp.send("Profiler.stop");
      const byId = new Map(profile.nodes.map((node) => [node.id, node]));
      const self = new Map();
      profile.samples.forEach((id, index) => {
        const frame = byId.get(id).callFrame;
        const key = `${frame.functionName || "(anon)"} ${frame.url.split("/").pop()}:${frame.lineNumber}`;
        self.set(key, (self.get(key) ?? 0) + profile.timeDeltas[index] / 1000);
      });
      console.log([...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([key, ms]) => `    ${ms.toFixed(0).padStart(7)} ms  ${key}`).join("\n"));
    }
  }
}
async function runPhase(name, action) {
  await page.evaluate(() => { window.__bench.frames = []; window.__bench.longTasks = []; window.__bench.running = true; });
  const start = Date.now();
  await action();
  // Estabiliza: aguarda 400 ms sem tarefas longas novas.
  let quietSince = Date.now();
  let seen = 0;
  while (Date.now() - quietSince < 400 && Date.now() - start < 90_000) {
    await page.waitForTimeout(60);
    const count = await page.evaluate(() => window.__bench.longTasks.length);
    if (count !== seen) { seen = count; quietSince = Date.now(); }
  }
  const wallMs = Date.now() - start - 400;
  const moves = moveLatencies; moveLatencies = [];
  const data = await page.evaluate(() => { window.__bench.running = false; return { frames: window.__bench.frames, longTasks: window.__bench.longTasks }; });
  const frames = data.frames.slice(1);
  results[name] = {
    wallMs: Math.max(0, wallMs),
    frames: frames.length,
    frameP50: +quantile(frames, 0.5).toFixed(1),
    frameP95: +quantile(frames, 0.95).toFixed(1),
    frameMax: +Math.max(0, ...frames).toFixed(1),
    longTasks: data.longTasks.length,
    blockedMs: Math.round(data.longTasks.reduce((sum, task) => sum + task.duration, 0)),
    longestTaskMs: Math.round(Math.max(0, ...data.longTasks.map((task) => task.duration))),
    ...(moves.length > 0 ? { moveP50: quantile(moves, 0.5), moveMax: Math.max(...moves) } : {})
  };
  console.log(`${name.padEnd(22)} ${JSON.stringify(results[name])}`);
}

const canvas = page.locator("canvas.cad-canvas-overlay");
const box = await canvas.boundingBox();
const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

await phase("importar", async () => {
  await page.locator('input[type="file"][accept*="dxf"]').setInputFiles(file);
  await page.locator(".cad-import-report").waitFor({ timeout: 120_000 });
});
const summary = (await page.locator(".cad-import-report").textContent())?.replace(/\s+/g, " ");
console.log("  resumo:", summary);
await page.locator(".cad-import-report-title button").click();
await page.addStyleTag({ content: ".cad-diagnostic-panel { display: none !important; }" });

await phase("pan (40 passos)", async () => {
  await page.mouse.move(center.x, center.y);
  await page.mouse.down({ button: "middle" });
  for (let step = 0; step < 40; step += 1) {
    await page.mouse.move(center.x + step * 6, center.y + step * 3);
    await page.waitForTimeout(16);
  }
  await page.mouse.up({ button: "middle" });
});

await phase("zoom (12 passos)", async () => {
  await page.mouse.move(center.x, center.y);
  for (let step = 0; step < 12; step += 1) {
    await page.mouse.wheel(0, step < 6 ? -300 : 300);
    await page.waitForTimeout(16);
  }
});

await phase("zoom total (Fit)", async () => {
  await page.locator(".cad-statusbar button", { hasText: /^Fit$/ }).click();
});

await phase(`mover mouse (${MOVES}x)`, async () => {
  for (let step = 0; step < MOVES; step += 1) {
    await timedMove(center.x + (step % 30) * 5, center.y + (step % 17) * 4);
    await page.waitForTimeout(8);
  }
});

await phase("selecionar tudo", async () => {
  await page.mouse.move(box.x + 6, box.y + 6);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 6, box.y + box.height - 6, { steps: 4 });
  await page.mouse.up();
  await page.waitForFunction(() => /Múltiplas \(\d+\)/.test(document.querySelector(".cad-right-panel")?.textContent ?? ""), null, { timeout: 120_000 });
});
const selected = (await page.locator(".cad-right-panel").textContent())?.match(/Múltiplas \((\d+)\)/)?.[1];
console.log("  selecionados:", selected);

await phase("mover mouse c/ seleção", async () => {
  for (let step = 0; step < MOVES; step += 1) {
    await timedMove(center.x + (step % 30) * 5, center.y + (step % 17) * 4);
    await page.waitForTimeout(8);
  }
});

await phase("pan c/ seleção", async () => {
  await page.mouse.move(center.x, center.y);
  await page.mouse.down({ button: "middle" });
  for (let step = 0; step < 20; step += 1) {
    await page.mouse.move(center.x - step * 6, center.y - step * 3);
    await page.waitForTimeout(16);
  }
  await page.mouse.up({ button: "middle" });
});

// Pré-visualização interativa do Move: o fantasma de todas as entidades selecionadas segue o mouse.
await phase("Move: preview (8x)", async () => {
  const command = page.locator("#cad-command");
  await command.click(); await command.fill("move"); await command.press("Enter");
  await page.mouse.click(center.x, center.y);
  for (let step = 0; step < 8; step += 1) {
    await timedMove(center.x + 20 + step * 15, center.y + step * 5);
    await page.waitForTimeout(8);
  }
  await page.keyboard.press("Escape");
});
await page.keyboard.press("Escape");

await phase("mover seleção", async () => {
  const command = page.locator("#cad-command");
  await command.click(); await command.fill("move"); await command.press("Enter");
  await page.mouse.click(center.x, center.y);
  await command.click(); await command.fill("@10,0"); await command.press("Enter");
});

await phase("desfazer", async () => {
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.keyboard.press("Control+z");
});

await phase("apagar seleção", async () => {
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.keyboard.press("Delete");
});

await phase("desfazer apagar", async () => {
  await page.keyboard.press("Control+z");
});

// O recarregamento destrói o amostrador da página, então é medido só pelo relógio.
{
  await page.waitForTimeout(2500);
  const started = Date.now();
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => /Entities\s*[1-9]/.test(document.querySelector(".cad-statusbar")?.textContent ?? ""), null, { timeout: 120_000 });
  results["recarregar (persistência)"] = { wallMs: Date.now() - started };
  console.log(`${"recarregar (persistência)".padEnd(22)} ${JSON.stringify(results["recarregar (persistência)"])}`);
}

console.log(`erros: ${errors.filter((error) => !error.includes("404")).join(" | ") || "nenhum"}`);
if (outputPath !== undefined) writeFileSync(outputPath, JSON.stringify({ label, file, summary, selected, results }, null, 2));
await browser.close();
