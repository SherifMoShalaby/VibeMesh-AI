/** Shared dot-decimal helpers for the slider value box and range label (UIUX-4).
 *  Extracted here so they can be unit-tested without a DOM environment. */

/** Format a number with a dot decimal separator regardless of the OS locale.
 *  Using Intl with en-US ensures we always write "1.5", never "1,5". */
export function formatDot(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 10, useGrouping: false })
}

/** Parse a user-typed dot-or-comma decimal string into a JS number.
 *  Accepts "1.5", "1,5" (comma-locale keyboards), and plain ints. */
export function parseDot(s: string): number {
  return parseFloat(s.replace(',', '.'))
}

/** Clamp a value to the param's step grid — keeps float noise out of state. */
export function roundToStep(n: number, step: number | undefined): number {
  if (!step || !Number.isFinite(step) || step <= 0) return n
  const decimals = (String(step).split('.')[1] ?? '').length
  return Number((Math.round(n / step) * step).toFixed(decimals))
}
