/**
 * Calcola i totali di un conteggio mensile a partire dalle sue righe.
 * Logica canonica condivisa tra ConteggiService e PadronciniService.
 *
 * Regole:
 * - FATTURATO, ACCONTO_FATTURA (neg), TRATTENUTA (neg) → imponibile netto
 * - PALMARE → importo è imponibile → moltiplicato ×1.22
 * - NOLEGGIO, RICARICA, ADDEBITO → già con IVA
 * - Bollo virtuale 2€ se imponibili esenti ≥ 77,47€
 * - ACCREDITO, BONUS, FINE_MESE, ACCONTO → compensazioni (riducono netto)
 */
export interface RigaCalcolo {
  tipo: string;
  importo: any;
  percIva?: any;
  segno?: any;
}

export interface TotaliConteggio {
  totalePositivo: number;
  totaleNegativo: number;
  /** Imponibile netto (FATTURATO + ACCONTO_FATTURA + TRATTENUTA) */
  fatturatoImponibile: number;
  /** Imponibile lordo solo FATTURATO + TRATTENUTA (esclude ACCONTO_FATTURA) */
  fatturatoLordoImponibile: number;
  /** fatturatoImponibile × 1.22 */
  fatturatoConIva: number;
  /** fatturatoLordoImponibile × 1.22 */
  fatturatoLordoConIva: number;
  /** Addebiti totali con IVA (PALMARE×1.22 + NOLEGGIO/RICARICA/ADDEBITO + bollo) */
  addebiti: number;
  /** Compensazioni (ACCREDITO, BONUS, FINE_MESE, ACCONTO) */
  compensazioni: number;
  /** fatturatoConIva − addebiti − compensazioni */
  netto: number;
}

const SOGLIA_BOLLO = 77.47;
const COSTO_BOLLO = 2.0;
const COMPENSAZIONI = ['ACCREDITO', 'BONUS', 'FINE_MESE', 'ACCONTO'];

export function calcolaTotaliConteggio(righe: RigaCalcolo[]): TotaliConteggio {
  const fatturatoImponibile = righe
    .filter((r) => r.tipo === 'FATTURATO' || r.tipo === 'ACCONTO_FATTURA' || r.tipo === 'TRATTENUTA')
    .reduce((s, r) => s + Number(r.importo), 0);

  const fatturatoLordoImponibile = righe
    .filter((r) => r.tipo === 'FATTURATO' || r.tipo === 'TRATTENUTA')
    .reduce((s, r) => s + Number(r.importo), 0);

  const palmareConIva = righe
    .filter((r) => r.tipo === 'PALMARE')
    .reduce((s, r) => s + Number(r.importo) * 1.22, 0);

  const addebitiAltri = righe
    .filter((r) => ['NOLEGGIO', 'RICARICA', 'ADDEBITO'].includes(r.tipo))
    .reduce((s, r) => s + Number(r.importo), 0);

  const totEsentiImponibile = righe
    .filter((r) => ['RICARICA', 'ADDEBITO'].includes(r.tipo))
    .reduce((s, r) => {
      const iva = r.percIva != null ? Number(r.percIva) : 22;
      if (iva === 22) return s;
      return s + Number(r.importo) / (1 + iva / 100);
    }, 0);
  const bollo = totEsentiImponibile >= SOGLIA_BOLLO ? COSTO_BOLLO : 0;

  const addebitiTotali = palmareConIva + addebitiAltri + bollo;

  const compensazioni = righe
    .filter((r) => COMPENSAZIONI.includes(r.tipo))
    .reduce((s, r) => s + Number(r.importo), 0);

  const totalePositivo = righe
    .filter((r) => r.segno === 'POSITIVO')
    .reduce((s, r) => s + Number(r.importo), 0);
  const totaleNegativo = righe
    .filter((r) => r.segno === 'NEGATIVO')
    .reduce((s, r) => s + Number(r.importo), 0);

  return {
    totalePositivo: Math.round(totalePositivo * 100) / 100,
    totaleNegativo: Math.round(totaleNegativo * 100) / 100,
    fatturatoImponibile: Math.round(fatturatoImponibile * 100) / 100,
    fatturatoLordoImponibile: Math.round(fatturatoLordoImponibile * 100) / 100,
    fatturatoConIva: Math.round(fatturatoImponibile * 1.22 * 100) / 100,
    fatturatoLordoConIva: Math.round(fatturatoLordoImponibile * 1.22 * 100) / 100,
    addebiti: Math.round(addebitiTotali * 100) / 100,
    compensazioni: Math.round(compensazioni * 100) / 100,
    netto: Math.round((fatturatoImponibile * 1.22 - addebitiTotali - compensazioni) * 100) / 100,
  };
}
