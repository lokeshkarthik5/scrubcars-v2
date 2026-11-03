/** SVG gradient stops take a colour and an opacity apart: `rgba()` in a stop paints solid on the phone. */
export function stopOf(colour: string): { stopColor: string; stopOpacity: number } {
  const match = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(colour);
  if (!match) return { stopColor: colour, stopOpacity: 1 };
  return { stopColor: `rgb(${match[1]},${match[2]},${match[3]})`, stopOpacity: match[4] === undefined ? 1 : Number(match[4]) };
}
