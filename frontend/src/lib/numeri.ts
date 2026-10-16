// src/lib/numeri.ts
/**
 * Converte un numero scritto "all'italiana" o "all'inglese" in number.
 *
 * Accetta:  "1250"  "1250,50"  "1.250,50"  "1250.50"  "1,250.50"  "€ 1.250,50"  "-12,5"
 * Regola: se ci sono sia punti sia virgole, l'ULTIMO dei due è il separatore decimale
 * e l'altro è il separatore delle migliaia. Se c'è solo la virgola è decimale.
 * Se ci sono più punti e nessuna virgola ("1.250.000") sono migliaia.
 *
 * Restituisce NaN se il testo non contiene un numero valido.
 */
export function parseDecimale(raw: string | number | null | undefined): number {
  if (raw === null || raw === undefined) return NaN;
  if (typeof raw === 'number') return raw;
  let s = String(raw).trim().replace(/[€\s ]/g, '');
  if (!s) return NaN;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');

  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.'); // 1.250,50
    else s = s.replace(/,/g, '');                                          // 1,250.50
  } else if (lastComma !== -1) {
    s = s.replace(/,/g, '.');                                              // 1250,50
    if ((s.match(/\./g) || []).length > 1) return NaN;                     // "1,2,3"
  } else if ((s.match(/\./g) || []).length > 1) {
    s = s.replace(/\./g, '');                                              // 1.250.000
  }

  if (!/^-?\d*\.?\d+$|^-?\d+\.$/.test(s)) return NaN;
  return parseFloat(s);
}

/** Come parseDecimale ma restituisce `fallback` (default 0) invece di NaN. */
export function parseDecimaleOr(raw: string | number | null | undefined, fallback = 0): number {
  const n = parseDecimale(raw);
  return Number.isFinite(n) ? n : fallback;
}
