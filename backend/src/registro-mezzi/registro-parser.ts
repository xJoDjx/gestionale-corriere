// Riconoscimento di targa, tipo, numero e data dalla descrizione di un addebito.
// Esempi:
//   "VERBALE N. T326134 DEL 30/10/2026 TARGA HA661MF"
//   "FRANCHIGIA TARGA GS820JN (Sinistro del 07/08/2026)"
//   "RIFATTURAZIONE FATT. VOLKSWAGEN N. 20260860865V3 TARG:GV870VV"
//   "RIFATTURAZIONE FATTURA ARVAL FS0014263485 (GR500EZ)"

export type TipoRegistro = 'VERBALE' | 'FRANCHIGIA' | 'RIFATTURAZIONE' | 'ALTRO';

export interface DatiRiconosciuti {
  targa: string | null;        // targa normalizzata (senza spazi)
  inFlotta: boolean;           // la targa corrisponde a un mezzo della flotta
  tipo: TipoRegistro;
  numero: string | null;
  dataEvento: Date | null;
}

export const normTarga = (t: string) => String(t ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const TARGA_STD = /^[A-Z]{2}[0-9]{3}[A-Z]{2}$/;

/** Cerca la targa: prima tra le targhe della flotta, poi il formato standard AA000AA. */
export function trovaTarga(descrizione: string, targheFlotta: Set<string>): { targa: string; inFlotta: boolean } | null {
  const tok = String(descrizione ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  // candidati: token singoli e unioni di 2-3 token consecutivi (es. "GM 098 FB")
  const cand: string[] = [];
  for (let i = 0; i < tok.length; i++) {
    cand.push(tok[i]);
    if (i + 1 < tok.length) cand.push(tok[i] + tok[i + 1]);
    if (i + 2 < tok.length) cand.push(tok[i] + tok[i + 1] + tok[i + 2]);
  }
  for (const c of cand) if (c.length >= 5 && targheFlotta.has(c)) return { targa: c, inFlotta: true };
  for (const c of cand) if (TARGA_STD.test(c)) return { targa: c, inFlotta: false };
  return null;
}

export function riconosciTipo(descrizione: string): TipoRegistro {
  const d = String(descrizione ?? '').toUpperCase();
  if (/FRANCHIGI/.test(d)) return 'FRANCHIGIA';
  if (/VERBAL|\bSANZ|\bMULTA|\bCDS\b|INFRAZION/.test(d)) return 'VERBALE';
  if (/RIFATTURAZ|\bFATT(URA)?\b|\bFATT\./.test(d)) return 'RIFATTURAZIONE';
  return 'ALTRO';
}

export function riconosciData(descrizione: string): Date | null {
  const m = String(descrizione ?? '').match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4}|\d{2})\b/);
  if (!m) return null;
  const g = +m[1], me = +m[2];
  let a = +m[3]; if (a < 100) a += 2000;
  if (g < 1 || g > 31 || me < 1 || me > 12 || a < 2000 || a > 2100) return null;
  return new Date(Date.UTC(a, me - 1, g));
}

export function riconosciNumero(descrizione: string, targa: string | null): string | null {
  const d = String(descrizione ?? '').replace(/\s+/g, ' ').trim();
  const stop = '(?=\\s+DEL\\b|\\s+DEL\\s|\\s+TARG|\\s*\\(|\\s+-\\s|$)';
  // "N. xxx", "NR. xxx", "N° xxx"
  let m = d.match(new RegExp(`\\bN(?:R|°)?\\.?\\s+(.+?)${stop}`, 'i'));
  if (m && /\d/.test(m[1])) return m[1].replace(/^VERBALE\s+/i, '').trim();
  // "VERBALE 1321/T/2026 DEL ..." · "PROT SANZ 0032/2026"
  m = d.match(new RegExp(`\\b(?:VERBALE|SANZ\\.?)\\s+((?:CDS\\s+)?[A-Z0-9][A-Z0-9\\/\\-.]*\\d[A-Z0-9\\/\\-.]*)${stop}`, 'i'));
  if (m) return m[1].trim();
  // codice con almeno 5 cifre che non sia la targa né una data (es. FS0014263485)
  const t = targa ? normTarga(targa) : '';
  for (const tok of d.toUpperCase().split(/[\s()]+/)) {
    const c = tok.replace(/[^A-Z0-9\/\-]/g, '');
    if (!c || normTarga(c) === t) continue;
    if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(c)) continue;
    if ((c.match(/\d/g) ?? []).length >= 5) return c;
  }
  return null;
}

export function riconosci(descrizione: string, targheFlotta: Set<string>): DatiRiconosciuti {
  const t = trovaTarga(descrizione, targheFlotta);
  return {
    targa: t?.targa ?? null,
    inFlotta: !!t?.inFlotta,
    tipo: riconosciTipo(descrizione),
    numero: riconosciNumero(descrizione, t?.targa ?? null),
    dataEvento: riconosciData(descrizione),
  };
}
