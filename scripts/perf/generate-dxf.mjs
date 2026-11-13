#!/usr/bin/env node
/**
 * Gera DXF sintéticos para medir a performance do CAD-WEB (sem dependências).
 *
 * Uso: node scripts/perf/generate-dxf.mjs <saida.dxf> [entidades=50000] [perfil=random|cluster|utm]
 *
 * Perfis:
 * - random : entidades espalhadas por 4000 × 4000 mm (pior caso de densidade, tudo visível no zoom total).
 * - cluster: 40 "salas" densas, como plantas reais (grande parte do desenho fica fora da janela ao dar zoom).
 * - utm    : coordenadas grandes (E ≈ 500 000, N ≈ 7 000 000, em mm × 1000) e linhas muito longas, como
 *            levantamentos topográficos (testa índice espacial e precisão numérica).
 *
 * O PRNG é determinístico (mulberry32): o mesmo comando gera sempre o mesmo arquivo.
 */
import { writeFileSync } from "node:fs";

const [output, countArg, profileArg] = process.argv.slice(2);

if (output === undefined) {
  console.error("Uso: node scripts/perf/generate-dxf.mjs <saida.dxf> [entidades] [random|cluster|utm]");
  process.exit(1);
}

const count = Number(countArg ?? 50_000);
const profile = profileArg ?? "random";
let seed = 20260101;
const random = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const between = (min, max) => min + random() * (max - min);

const lines = [];
const add = (code, value) => lines.push(`${String(code).padStart(3, " ")}\n${value}`);

add(0, "SECTION"); add(2, "HEADER"); add(9, "$INSUNITS"); add(70, 4); add(0, "ENDSEC");
add(0, "SECTION"); add(2, "TABLES"); add(0, "TABLE"); add(2, "LAYER");
for (let index = 0; index < 10; index += 1) {
  add(0, "LAYER"); add(2, `L${index}`); add(70, 0); add(62, 1 + index); add(6, index % 5 === 4 ? "DASHED" : "CONTINUOUS");
}
add(0, "ENDTAB"); add(0, "ENDSEC");

add(0, "SECTION"); add(2, "BLOCKS");
add(0, "BLOCK"); add(8, "0"); add(2, "TOMADA"); add(70, 0); add(10, 0); add(20, 0);
add(0, "CIRCLE"); add(8, "0"); add(10, 0); add(20, 0); add(40, 2);
add(0, "LINE"); add(8, "0"); add(10, -3); add(20, 0); add(11, 3); add(21, 0);
add(0, "LINE"); add(8, "0"); add(10, 0); add(20, -3); add(11, 0); add(21, 3);
add(0, "ENDBLK"); add(8, "0");
add(0, "ENDSEC");

add(0, "SECTION"); add(2, "ENTITIES");

const extent = profile === "utm" ? 20_000_000 : 4000;
const offsetX = profile === "utm" ? 500_000_000 : 0;
const offsetY = profile === "utm" ? 7_000_000_000 : 0;
const rooms = Array.from({ length: 40 }, () => ({ x: between(0, 4000), y: between(0, 4000), size: between(40, 160) }));

function position() {
  if (profile === "cluster") {
    const room = rooms[Math.floor(random() * rooms.length)];
    return { x: room.x + between(0, room.size), y: room.y + between(0, room.size), spread: 6 };
  }

  return { x: offsetX + between(0, extent), y: offsetY + between(0, extent), spread: profile === "utm" ? 20_000 : 30 };
}

for (let index = 0; index < count; index += 1) {
  const kind = index % 12;
  const layer = `L${index % 10}`;
  const { x, y, spread } = position();

  if (kind <= 3) {
    // No perfil utm, uma em cada 50 linhas atravessa quilômetros (extensão enorme no índice espacial).
    const long = profile === "utm" && index % 50 === 0 ? 5_000_000 : spread;
    add(0, "LINE"); add(8, layer); add(10, x); add(20, y); add(11, x + between(-long, long)); add(21, y + between(-long, long));
  } else if (kind === 4) {
    add(0, "CIRCLE"); add(8, layer); add(10, x); add(20, y); add(40, between(0.03, 0.3) * spread);
  } else if (kind === 5) {
    add(0, "ARC"); add(8, layer); add(10, x); add(20, y); add(40, between(0.07, 0.4) * spread); add(50, between(0, 180)); add(51, between(180, 360));
  } else if (kind === 6 || kind === 7) {
    add(0, "LWPOLYLINE"); add(8, layer); add(90, 5); add(70, 0);
    let px = x; let py = y;
    for (let vertex = 0; vertex < 5; vertex += 1) {
      px += between(-spread / 3, spread / 3); py += between(-spread / 3, spread / 3);
      add(10, px); add(20, py); add(42, vertex === 1 ? 0.3 : 0);
    }
  } else if (kind === 8) {
    add(0, "TEXT"); add(8, layer); add(10, x); add(20, y); add(40, spread / 10); add(1, `T${index}`);
  } else if (kind === 9) {
    add(0, "INSERT"); add(8, layer); add(2, "TOMADA"); add(10, x); add(20, y); add(41, 1); add(42, 1); add(50, [0, 90, 45][index % 3]);
  } else if (kind === 10) {
    // Polilinha longa (curva de nível): muitos vértices, para testar a decimação.
    add(0, "LWPOLYLINE"); add(8, layer); add(90, 200); add(70, 0);
    let px = x; let py = y;
    for (let vertex = 0; vertex < 200; vertex += 1) {
      px += between(0, spread / 60); py += Math.sin(vertex / 9) * spread / 80;
      add(10, px); add(20, py);
    }
  } else {
    add(0, "SPLINE"); add(8, layer); add(70, 8); add(71, 3); add(72, 8); add(73, 4); add(74, 0);
    for (const knot of [0, 0, 0, 0, 1, 1, 1, 1]) add(40, knot);
    for (let point = 0; point < 4; point += 1) { add(10, x + point * spread / 4); add(20, y + (point % 2 === 0 ? 0 : spread / 3)); }
  }
}

add(0, "ENDSEC"); add(0, "EOF");
writeFileSync(output, `${lines.join("\n")}\n`);
console.log(`${output}: ${count} entidades (${profile}), ${(Buffer.byteLength(lines.join("\n")) / 1e6).toFixed(1)} MB`);
