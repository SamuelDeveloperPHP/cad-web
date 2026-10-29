/**
 * Pré-visualizações com seleção grande: o fantasma de dezenas de milhares de entidades custaria clonar tudo e
 * redesenhar tudo a cada movimento do mouse. Acima do limite, o fantasma mostra uma amostra uniforme da seleção
 * (a posição final vem do comando, que sempre atua sobre todas as entidades), o que mantém a interação fluida.
 */
export const GHOST_PREVIEW_LIMIT = 3000;

// Amostra uniforme (passo constante) de no máximo `limit` itens, preservando a ordem; devolve a própria lista se couber.
export function sampleGhostEntities<T>(items: ReadonlyArray<T>, limit: number = GHOST_PREVIEW_LIMIT): ReadonlyArray<T> {
  if (items.length <= limit) {
    return items;
  }

  const step = items.length / limit;
  const sampled: T[] = [];

  for (let index = 0; index < limit; index += 1) {
    sampled.push(items[Math.floor(index * step)]!);
  }

  return sampled;
}
