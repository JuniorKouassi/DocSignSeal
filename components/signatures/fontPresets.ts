/* Four system-font presets for the Type signature screen -- no web font is
   loaded (HANDOFF.md: ask before adding a dependency), so every stack ends
   in a generic fallback. "sans" and "serif" literally repeat
   design/tokens.css's --dss-font-ui/--dss-font-doc rather than referencing
   them, because a canvas 2D context's `font` string can't resolve a CSS
   custom property -- keep both in sync by hand if tokens.css changes. The
   two script stacks lean on fonts that ship with Windows (Segoe Script,
   Segoe Print) for two visually distinct handwriting styles; platforms
   without them fall back to the generic `cursive` family. */
export const FONT_PRESETS = [
  { key: 'sans', family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
  { key: 'serif', family: 'Georgia, "Times New Roman", serif' },
  { key: 'scriptA', family: '"Brush Script MT", "Segoe Script", cursive' },
  { key: 'scriptB', family: '"Segoe Print", "Bradley Hand", cursive' },
] as const;

export type FontPresetKey = (typeof FONT_PRESETS)[number]['key'];

export function fontFamilyFor(key: FontPresetKey): string {
  return FONT_PRESETS.find((f) => f.key === key)!.family;
}
