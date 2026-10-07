import type { LayoutFontFamily, LayoutFontStyle, LayoutFontWeight } from "../../contracts";
import coverage from "../../assets/fonts/layout-font-coverage.json";
import { resolveLayoutFontFace } from "./layoutFontFaces";

const decoded = new Map<string, readonly (readonly [number, number])[]>();
function glyphRanges(profile: string) {
  const cached = decoded.get(profile);
  if (cached) return cached;
  const bytes = Uint8Array.from(atob((coverage.profiles as Record<string, string>)[profile]), (character) => character.charCodeAt(0));
  let index = 0, start = 0;
  const read = () => {
    let value = 0, shift = 0, byte;
    do { byte = bytes[index++]; value += (byte & 127) * 2 ** shift; shift += 7; } while (byte & 128);
    return value;
  };
  const ranges: [number, number][] = [];
  while (index < bytes.length) { start += read(); ranges.push([start, start + read()]); }
  decoded.set(profile, ranges);
  return ranges;
}

/** Coverage comes from the same TTF faces as the lossless screen WOFF2 assets. */
export function needsLayoutChineseFallback(family: LayoutFontFamily, text?: string, weight?: LayoutFontWeight, style?: LayoutFontStyle): boolean {
  if (family === "noto-serif-sc" || family === "zcool-kuaile") return false;
  if (text === undefined) return true;
  const face = resolveLayoutFontFace(coverage.families[family], weight, style);
  const ranges = glyphRanges((coverage.glyphs as Record<string, string>)[face.url]);
  return [...text].some((character) => {
    if (character === "\r" || character === "\n") return false;
    const point = character.codePointAt(0)!;
    return !ranges.some(([start, end]) => point >= start && point <= end);
  });
}
