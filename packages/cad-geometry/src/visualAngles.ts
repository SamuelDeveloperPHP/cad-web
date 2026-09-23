import { arcSweepAngle } from "./arc";
import { normalizeEllipseSweep } from "./ellipse";

/**
 * Conversões entre os ângulos do mundo e a convenção visual do AutoCAD.
 *
 * O eixo Y do mundo cresce para baixo na tela, então um ângulo positivo no mundo gira no sentido
 * horário na tela. A convenção visual do AutoCAD mede 0° = Leste e cresce no sentido anti-horário
 * (90° = Norte/cima); por isso o ângulo visual é o ângulo do mundo com sinal trocado.
 * Estas funções ficam só nas fronteiras (painel, ferramentas); a geometria continua no mundo.
 */

const RAD_TO_DEG = 180 / Math.PI;

// Normaliza graus em [0, 360), absorvendo ruído numérico perto de 0 e de 360.
export function normalizeVisualDegrees(degrees: number): number {
  const normalized = ((degrees % 360) + 360) % 360;
  return Math.abs(normalized - 360) < 1e-9 || Math.abs(normalized) < 1e-9 ? 0 : normalized;
}

// Converte graus na convenção visual (anti-horário, Y para cima) para radianos no mundo (Y para baixo).
export function visualDegreesToWorldRadians(degrees: number): number {
  const radians = -degrees / RAD_TO_DEG;
  return Object.is(radians, -0) ? 0 : radians;
}

// Converte radianos do mundo para graus na convenção visual, normalizados em [0, 360).
export function worldRadiansToVisualDegrees(radians: number): number {
  return normalizeVisualDegrees(-radians * RAD_TO_DEG);
}

export type VisualArcAngles = Readonly<{
  // Ângulos inicial e final no sentido anti-horário visual (como o AutoCAD sempre descreve arcos).
  start: number;
  end: number;
  // Ângulo total varrido, em graus (0, 360].
  sweep: number;
}>;

type ArcAngles = Readonly<{ startAngle: number; endAngle: number; clockwise: boolean }>;

/**
 * Ângulos visuais de um arco circular. clockwise = true varre o ângulo do mundo crescente, que na tela
 * é horário; lido no sentido anti-horário visual, o arco começa no fim e termina no início.
 */
export function arcVisualAngles(arc: ArcAngles): VisualArcAngles {
  const sweep = arcSweepAngle(arc.startAngle, arc.endAngle, arc.clockwise) * RAD_TO_DEG;
  const [visualStartWorld, visualEndWorld] = arc.clockwise
    ? [arc.endAngle, arc.startAngle]
    : [arc.startAngle, arc.endAngle];

  return {
    start: worldRadiansToVisualDegrees(visualStartWorld),
    end: worldRadiansToVisualDegrees(visualEndWorld),
    sweep: sweep <= 1e-9 ? 360 : sweep
  };
}

/**
 * Inverso de arcVisualAngles: recebe os ângulos visuais (anti-horários) e devolve startAngle/endAngle
 * no mundo preservando o sentido armazenado (clockwise) da entidade.
 */
export function arcAnglesFromVisual(
  clockwise: boolean,
  visualStart: number,
  visualEnd: number
): Readonly<{ startAngle: number; endAngle: number }> {
  const worldOfVisualStart = visualDegreesToWorldRadians(visualStart);
  const worldOfVisualEnd = visualDegreesToWorldRadians(visualEnd);

  return clockwise
    ? { startAngle: worldOfVisualEnd, endAngle: worldOfVisualStart }
    : { startAngle: worldOfVisualStart, endAngle: worldOfVisualEnd };
}

type EllipseArcAngles = Readonly<{ radiusX: number; radiusY: number; startAngle: number; endAngle: number }>;

/**
 * Ângulos visuais de um arco de elipse, medidos a partir do eixo X local (o eixo da rotação), como o
 * AutoCAD mede os ângulos de início e fim do arco de elipse em relação ao eixo. São os ângulos reais
 * das extremidades (não os paramétricos): o ponto do parâmetro t está em (rx·cos t, ry·sin t).
 * A varredura paramétrica cresce no mundo (horário na tela), então o início visual é o fim armazenado.
 */
export function ellipseArcVisualAngles(ellipse: EllipseArcAngles): VisualArcAngles {
  const geometricAngle = (param: number) =>
    Math.atan2(ellipse.radiusY * Math.sin(param), ellipse.radiusX * Math.cos(param));
  const { sweep } = normalizeEllipseSweep(ellipse.startAngle, ellipse.endAngle);
  const start = worldRadiansToVisualDegrees(geometricAngle(ellipse.endAngle));
  const end = worldRadiansToVisualDegrees(geometricAngle(ellipse.startAngle));
  const visualSweep = normalizeVisualDegrees(end - start);

  return {
    start,
    end,
    // O ângulo real varrido difere do paramétrico; a varredura completa (sweep = 2π) vira 360.
    sweep: sweep >= Math.PI * 2 - 1e-9 || visualSweep <= 1e-9 ? 360 : visualSweep
  };
}
