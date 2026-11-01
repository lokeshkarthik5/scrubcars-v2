/**
 * How much of a scratch card's foil has gone, without reading pixels back: the card is cut
 * into cells and a stroke marks the ones it covers. Same rule as the web's canvas: past 35%,
 * the rest falls away. Pure, so it is unit-tested.
 */
export const CLEAR_AT = 0.35;
export const BRUSH = 30;
export const CELL = 20;

export function cellsUnder(x: number, y: number, size: { width: number; height: number }): string[] {
  const out: string[] = [];
  const reach = Math.ceil(BRUSH / CELL);
  const cx = Math.floor(x / CELL);
  const cy = Math.floor(y / CELL);
  const maxX = Math.ceil(size.width / CELL);
  const maxY = Math.ceil(size.height / CELL);
  for (let i = cx - reach; i <= cx + reach; i += 1) {
    for (let j = cy - reach; j <= cy + reach; j += 1) {
      if (i < 0 || j < 0 || i >= maxX || j >= maxY) continue;
      const dx = (i + 0.5) * CELL - x;
      const dy = (j + 0.5) * CELL - y;
      if (dx * dx + dy * dy <= BRUSH * BRUSH) out.push(`${i}:${j}`);
    }
  }
  return out;
}

export function clearedShare(cleared: number, size: { width: number; height: number }): number {
  const total = Math.ceil(size.width / CELL) * Math.ceil(size.height / CELL);
  return total > 0 ? cleared / total : 0;
}

/** The points along a stroke, close enough that the brush leaves no gaps. */
export function strokeBetween(from: { x: number; y: number }, to: { x: number; y: number }): Array<{ x: number; y: number }> {
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / (BRUSH * 0.8)));
  return Array.from({ length: steps }, (_, i) => ({ x: from.x + ((to.x - from.x) * (i + 1)) / steps, y: from.y + ((to.y - from.y) * (i + 1)) / steps }));
}

/** A finger resting or trembling adds nothing: a new mark only once it has moved this far. */
export const MIN_MOVE = BRUSH * 0.4;
export const movedEnough = (from: { x: number; y: number } | null, to: { x: number; y: number }) => !from || Math.hypot(to.x - from.x, to.y - from.y) >= MIN_MOVE;
