/* Literal hex values, not the design tokens' CSS custom properties --
   Canvas 2D's strokeStyle/fillStyle can't resolve var(--dss-ink-*) itself,
   and these are exported straight into the signature PNG, so the swatches
   and the drawn/typed ink have to be the same literal colour. Kept in sync
   with design/tokens.css by hand; there are only four. */
export const INK_COLORS = [
  { key: 'black', hex: '#101010' },
  { key: 'blue', hex: '#1B3FA8' },
  { key: 'green', hex: '#0F5C34' },
  { key: 'red', hex: '#A81B1B' },
] as const;

export type InkColorKey = (typeof INK_COLORS)[number]['key'];

export function inkHex(key: InkColorKey): string {
  return INK_COLORS.find((c) => c.key === key)!.hex;
}

// Blue is the default: in francophone administrative practice a blue
// signature marks an original (design/tokens.css, HANDOFF.md non-negotiable #9).
export const DEFAULT_INK: InkColorKey = 'blue';
