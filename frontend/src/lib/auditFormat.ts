// src/lib/auditFormat.ts
//
// Utility condivise per formattare le entry dell'Audit Log (/audit) in modo
// leggibile. Estratte da LogStorico.tsx per poter essere riusate anche nei
// widget "riepilogo modifiche recenti" delle altre pagine (es. FlottaMezzi).

export interface AuditEntry {
  id: string;
  entityType: string;
  entityId: string;
  azione: string;
  createdAt: string;
  dataPrima: Record<string, any> | null;
  dataDopo: Record<string, any> | null;
  user: { nome: string; cognome: string; email?: string } | null;
}

export const ENTITY_LABELS: Record<string, string> = {
  mezzo: '🚚 Mezzo',
  padroncino: '👤 Padroncino',
  palmare: '📱 Palmare',
  codice_autista: '🏷️ Autista',
  codiceAutista: '🏷️ Autista',
  acconto: '💰 Acconto',
  documento: '📄 Documento',
  conteggio_mensile: '📊 Conteggio',
  statistica_cod: '📊 Statistiche COD',
  conteggio_riga: '📋 Riga conteggio',
  assegnazione_mezzo: '🔗 Ass. Mezzo',
  assegnazione_palmare: '🔗 Ass. Palmare',
  assegnazione_codice_autista: '🔗 Ass. Autista',
  utente: '🔑 Utente',
};

export const AZIONE_COLORS: Record<string, string> = {
  CREATE: 'log-action-create',
  UPDATE: 'log-action-update',
  DELETE: 'log-action-delete',
  RESTORE: 'log-action-restore',
  ASSEGNA: 'log-action-assegna',
  CHIUDI_ASSEGNAZIONE: 'log-action-chiudi',
  GENERA_CONTRATTO: 'log-action-contratto',
  GENERA_CONTRATTO_PALMARE: 'log-action-contratto',
  GENERA_CONTRATTO_CODICI: 'log-action-contratto',
  GENERA_CONTRATTO_MEZZI: 'log-action-contratto',
  LOGIN: 'log-action-login',
};

export const AZIONE_LABELS: Record<string, string> = {
  CREATE: '+ Creazione',
  UPDATE: '✏️ Modifica',
  DELETE: '🗑 Eliminazione',
  RESTORE: '♻️ Ripristino',
  ASSEGNA: '🔗 Assegnazione',
  CHIUDI_ASSEGNAZIONE: '🔓 Fine assegnazione',
  GENERA_CONTRATTO: '📝 Contratto',
  GENERA_CONTRATTO_PALMARE: '📝 Contratto palmari',
  GENERA_CONTRATTO_CODICI: '📝 Contratto codici',
  GENERA_CONTRATTO_MEZZI: '📝 Contratto mezzi',
  LOGIN: '🔑 Accesso',
};

const TIPO_RIGA_LABELS: Record<string, string> = {
  FATTURATO: 'fatturato',
  NOLEGGIO: 'noleggio',
  PALMARE: 'palmare',
  RICARICA: 'ricarica',
  ACCONTO: 'acconto',
  ADDEBITO: 'addebito',
  ACCREDITO: 'accredito',
  BONUS: 'bonus',
  FINE_MESE: 'fine mese',
  ACCONTO_FATTURA: 'acconto fattura',
  TRATTENUTA: 'trattenuta',
};

// Campi mezzo con label leggibile (in ordine di priorità da mostrare)
export const MEZZO_FIELD_PRIORITY: [string, string][] = [
  ['kmAttuali', 'km attuali'],
  ['rataNoleggio', 'rata noleggio'],
  ['stato', 'stato'],
  ['targa', 'targa'],
  ['scadenzaAssicurazione', 'scad. assicurazione'],
  ['scadenzaRevisione', 'scad. revisione'],
  ['scadenzaBollo', 'scad. bollo'],
  ['scadenzaTagliando', 'scad. tagliando'],
  ['scadenzaTachigrafo', 'scad. tachigrafo'],
  ['societaNoleggio', 'società noleggio'],
  ['marca', 'marca'],
  ['modello', 'modello'],
  ['km', 'km'],
  ['alimentazione', 'alimentazione'],
];

// Campi codice autista con label leggibile (in ordine di priorità da mostrare)
export const CODICE_AUTISTA_FIELD_PRIORITY: [string, string][] = [
  ['tariffaFissa', 'tariffa fissa'],
  ['tariffaRitiro', 'tariffa ritiro'],
  ['target', 'target'],
  ['bonus', 'bonus'],
  ['malus', 'malus'],
  ['zone', 'zone'],
  ['attivo', 'stato'],
  ['nome', 'nome'],
  ['cognome', 'cognome'],
  ['note', 'note'],
];

// Campi palmare con label leggibile (in ordine di priorità da mostrare)
export const PALMARE_FIELD_PRIORITY: [string, string][] = [
  ['tariffaMensile', 'tariffa giornaliera'],
  ['stato', 'stato'],
  ['codiceAssociato', 'codice associato'],
  ['marca', 'marca'],
  ['modello', 'modello'],
  ['imei', 'imei'],
  ['simNumero', 'numero sim'],
  ['note', 'note'],
];

// Campi padroncino con label leggibile (in ordine di priorità da mostrare)
export const PADRONCINO_FIELD_PRIORITY: [string, string][] = [
  ['ragioneSociale', 'ragione sociale'],
  ['partitaIva', 'partita IVA'],
  ['codiceFiscale', 'codice fiscale'],
  ['iban', 'IBAN'],
  ['telefono', 'telefono'],
  ['email', 'email'],
  ['pec', 'pec'],
  ['indirizzo', 'indirizzo'],
  ['scadenzaDurc', 'scad. DURC'],
  ['scadenzaDvr', 'scad. DVR'],
  ['dvrEsente', 'DVR esente'],
  ['note', 'note'],
];

// Campi da ignorare sempre nei diff
const SKIP_FIELDS = new Set([
  'createdAt', 'updatedAt', 'deletedAt',
  'conteggioMensileId', 'padroncinoId', 'mezzoId', 'palmareId',
  'codiceAutistaId', 'userId', 'ordine', 'modificaManuale',
  'id', 'mese', 'padroncino',
  // Campi derivati/di relazione: cambiano insieme ad altri campi "veri"
  // (es. kmAttualiAl si aggiorna insieme a kmAttuali) o sono rumore di forma
  // dell'oggetto (assegnazioni/acconti possono comparire/sparire solo perché
  // una delle due versioni confrontate include la relazione e l'altra no).
  'kmAttualiAl', 'assegnazioni', 'acconti',
]);

// Traduzioni leggibili dei nomi campo grezzi, usate come fallback quando si
// elenca un elenco di campi modificati senza un formattatore dedicato.
const FIELD_LABELS: Record<string, string> = {
  segno: 'segno', riferimentoId: 'riferimento', descrizione: 'descrizione', importo: 'importo',
  tipo: 'tipo', codice: 'codice', nome: 'nome', cognome: 'cognome', note: 'note', zone: 'zone',
  target: 'target', bonus: 'bonus', malus: 'malus', attivo: 'stato',
  tariffaFissa: 'tariffa fissa', tariffaRitiro: 'tariffa ritiro', tariffaMensile: 'tariffa giornaliera',
  stato: 'stato', codiceAssociato: 'codice associato', marca: 'marca', modello: 'modello',
  imei: 'imei', simNumero: 'numero sim',
  ragioneSociale: 'ragione sociale', partitaIva: 'partita IVA', codiceFiscale: 'codice fiscale',
  iban: 'IBAN', telefono: 'telefono', email: 'email', pec: 'pec', indirizzo: 'indirizzo',
  scadenzaDurc: 'scad. DURC', scadenzaDvr: 'scad. DVR', dvrEsente: 'DVR esente',
  targa: 'targa', km: 'km', kmAttuali: 'km attuali', rataNoleggio: 'rata noleggio',
  societaNoleggio: 'società noleggio', alimentazione: 'alimentazione',
  scadenzaAssicurazione: 'scad. assicurazione', scadenzaRevisione: 'scad. revisione',
  scadenzaBollo: 'scad. bollo', scadenzaTagliando: 'scad. tagliando', scadenzaTachigrafo: 'scad. tachigrafo',
};

export function prettyField(k: string): string {
  return FIELD_LABELS[k] ?? k;
}

export function formatMese(mese: string | undefined): string {
  if (!mese) return '';
  const [anno, m] = String(mese).split('-');
  const nomi = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
  const label = nomi[parseInt(m, 10) - 1] ?? m;
  return `${label} ${anno}`;
}

export function euro(v: any): string {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (isNaN(n)) return String(v);
  return new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + '€';
}

export function changedFields(prima: Record<string, any> | null, dopo: Record<string, any> | null): string[] {
  if (!prima || !dopo) return [];
  return Object.keys({ ...prima, ...dopo }).filter(
    (k) => !SKIP_FIELDS.has(k) && JSON.stringify(prima[k]) !== JSON.stringify(dopo[k]),
  );
}

/**
 * Genera una descrizione leggibile dell'operazione, senza dover espandere
 * la riga (usata sia dalla tabella Log Storico completa che dai widget
 * "ultime modifiche" nelle singole pagine).
 */
export function getHumanReadableDescription(entry: AuditEntry, opts?: { hideIdentifier?: boolean; hideContext?: boolean }): string {
  const d = entry.dataDopo ?? entry.dataPrima;
  const prima = entry.dataPrima;
  const dopo = entry.dataDopo;

  // ─── GENERAZIONE CONTRATTI ───────────────────────────
  // Loggati sia sull'entità coinvolta (mezzo/palmare/codice) sia sul
  // padroncino: gestiti qui in base all'azione, indipendentemente
  // dall'entityType su cui è agganciato l'evento.
  if (entry.azione === 'GENERA_CONTRATTO') {
    const targa = d?.targa ? ` mezzo ${d.targa}` : '';
    const pad = d?.padroncino ? ` — ${d.padroncino}` : '';
    return `Generato contratto noleggio${targa}${pad}`;
  }
  if (entry.azione === 'GENERA_CONTRATTO_MEZZI') {
    const n = Array.isArray(d?.mezzi) ? d.mezzi.length : null;
    const pad = d?.padroncino ? ` — ${d.padroncino}` : '';
    return `Generato contratto noleggio mezzi${n ? ` (${n})` : ''}${pad}`;
  }
  if (entry.azione === 'GENERA_CONTRATTO_PALMARE') {
    const n = Array.isArray(d?.palmari) ? d.palmari.length : null;
    const pad = d?.padroncino ? ` — ${d.padroncino}` : '';
    return `Generato contratto noleggio palmari${n ? ` (${n})` : ''}${pad}`;
  }
  if (entry.azione === 'GENERA_CONTRATTO_CODICI') {
    const n = Array.isArray(d?.codici) ? d.codici.length : null;
    const pad = d?.padroncino ? ` — ${d.padroncino}` : '';
    return `Generato contratto appalto codici${n ? ` (${n})` : ''}${pad}`;
  }

  // ─── RIGA CONTEGGIO ─────────────────────────────────
  if (entry.entityType === 'conteggio_riga') {
    const tipo = TIPO_RIGA_LABELS[d?.tipo] ?? d?.tipo ?? 'riga';
    const desc = d?.descrizione ? `"${d.descrizione}"` : tipo;
    const mese = formatMese(d?.mese);
    const pad = d?.padroncino ? ` — ${d.padroncino}` : '';
    const ctx = opts?.hideContext ? '' : (mese ? `, ${mese}${pad}` : pad);

    if (entry.azione === 'CREATE') {
      const importo = d?.importo != null ? ` di ${euro(d.importo)}` : '';
      return `Aggiunto ${tipo} ${desc}${importo}${ctx}`;
    }

    if (entry.azione === 'UPDATE') {
      const changed = changedFields(prima, dopo);
      // Importo cambiato → caso più comune e più importante
      if (changed.includes('importo')) {
        const descLabel = dopo?.descrizione ?? prima?.descrizione ?? tipo;
        return `Modificato importo "${descLabel}" da ${euro(prima?.importo)} a ${euro(dopo?.importo)}${ctx}`;
      }
      // Descrizione cambiata
      if (changed.includes('descrizione')) {
        return `Rinominata riga "${prima?.descrizione}" → "${dopo?.descrizione}"${ctx}`;
      }
      // Tipo cambiato
      if (changed.includes('tipo')) {
        return `Cambiato tipo "${TIPO_RIGA_LABELS[prima?.tipo] ?? prima?.tipo}" → "${TIPO_RIGA_LABELS[dopo?.tipo] ?? dopo?.tipo}": ${desc}${ctx}`;
      }
      if (changed.length > 0) {
        return `Modificata riga ${desc} (${changed.slice(0, 2).map(prettyField).join(', ')})${ctx}`;
      }
      return `Modificata riga ${desc}${ctx}`;
    }

    if (entry.azione === 'DELETE') {
      const importo = d?.importo != null ? ` (${euro(d.importo)})` : '';
      return `Eliminata riga ${desc}${importo}${ctx}`;
    }
  }

  // ─── STATISTICHE COD ─────────────────────────────────
  if (entry.entityType === 'statistica_cod') {
    const mese = formatMese(prima?.mese ?? d?.mese ?? entry.entityId);
    return `Azzerate statistiche COD${mese ? ` ${mese}` : ''}`;
  }

  // ─── CONTEGGIO MENSILE ───────────────────────────────
  if (entry.entityType === 'conteggio_mensile') {
    const mese = formatMese(d?.mese);
    const pad = d?.padroncino ? ` — ${d.padroncino}` : '';
    const ctx = opts?.hideContext ? '' : (mese ? ` ${mese}${pad}` : pad);

    if (entry.azione === 'CREATE') {
      return `Creato conteggio${ctx}`;
    }

    if (entry.azione === 'UPDATE') {
      const az = d?.azione;
      if (az === 'cambio_stato') {
        const prima_stato = prima?.stato ?? '?';
        return `Stato cambiato: ${prima_stato} → ${d!.stato}${ctx}`;
      }
      if (az === 'rigenerazione_righe_automatiche') {
        return `Righe auto-rigenerate${ctx}`;
      }
      if (az === 'duplica_da_mese') {
        const righeCopiate = d!.righeCopiate ? ` (${d!.righeCopiate} righe)` : '';
        return `Duplicato da ${formatMese(d!.meseSorgente)} → ${formatMese(d!.meseDestinazione)}${pad}${righeCopiate}`;
      }
      if (az === 'salva_netto') {
        return `Netto salvato: ${euro(d!.nettoSalvato)}${ctx}`;
      }
      if (az === 'aggiorna_note') {
        return `Note aggiornate${ctx}`;
      }
      // Salvataggio generico con righe (replaceRighe)
      if (d?.righe != null) {
        const netto = d.netto != null ? `, netto ${euro(d.netto)}` : '';
        return `Salvato conteggio (${d.righe} righe${netto})${ctx}`;
      }
      return `Modificato conteggio${ctx}`;
    }

    if (entry.azione === 'DELETE') {
      return `Eliminato conteggio${ctx}`;
    }

    if (entry.azione === 'RESTORE') {
      return `Ripristinato conteggio${ctx}`;
    }
  }

  // ─── MEZZO ───────────────────────────────────────────
  if (entry.entityType === 'mezzo') {
    const targa = d?.targa ? `mezzo ${d.targa}` : 'mezzo';
    const modello = d?.marca && d?.modello ? ` (${d.marca} ${d.modello})` : '';

    if (entry.azione === 'CREATE') {
      return `Aggiunto ${targa}${modello}`;
    }
    if (entry.azione === 'DELETE') {
      return `Eliminato ${targa}${modello}`;
    }
    if (entry.azione === 'RESTORE') {
      return `♻️ Ripristinato ${targa}${modello}`;
    }
    if (entry.azione === 'UPDATE') {
      const targaLabel = opts?.hideIdentifier
        ? ''
        : (dopo?.targa ?? prima?.targa) ? `${dopo?.targa ?? prima?.targa}: ` : '';
      // Cerca il primo campo modificato per ordine di priorità
      for (const [field, label] of MEZZO_FIELD_PRIORITY) {
        if (prima?.[field] !== undefined && dopo?.[field] !== undefined &&
            JSON.stringify(prima[field]) !== JSON.stringify(dopo[field])) {
          const pv = prima[field];
          const dv = dopo[field];
          // Formatta importi
          const fmtVal = (v: any) => {
            if (field === 'rataNoleggio') return euro(v);
            if (field === 'kmAttuali') {
              return v == null ? '—' : `${Number(v).toLocaleString('it-IT')} km`;
            }
            if (typeof v === 'string' && v.match(/^\d{4}-\d{2}-\d{2}/)) {
              return new Date(v).toLocaleDateString('it-IT');
            }
            return String(v ?? '—');
          };
          return `${targaLabel}${label} da ${fmtVal(pv)} a ${fmtVal(dv)}`;
        }
      }
      const changed = changedFields(prima, dopo);
      if (changed.length > 0) {
        return `${targaLabel}modificati: ${changed.slice(0, 3).map(prettyField).join(', ')}`;
      }
      return `Modificato ${targa}`;
    }
    if (entry.azione === 'ASSEGNA') return `Assegnato ${targa}`;
    if (entry.azione === 'CHIUDI_ASSEGNAZIONE') return `Fine assegnazione ${targa}`;
  }

  // ─── PADRONCINO ──────────────────────────────────────
  if (entry.entityType === 'padroncino') {
    const nome = d?.ragioneSociale ?? `#${entry.entityId.slice(-8)}`;
    if (entry.azione === 'CREATE') return `Aggiunto padroncino: ${nome}`;
    if (entry.azione === 'UPDATE') {
      const changed = changedFields(prima, dopo);
      if (changed.includes('attivo')) {
        return `${nome}: ${dopo?.attivo ? 'riattivato' : 'disattivato'}`;
      }
      // Cerca il primo campo modificato per ordine di priorità
      for (const [field, flabel] of PADRONCINO_FIELD_PRIORITY) {
        if (prima?.[field] !== undefined && dopo?.[field] !== undefined &&
            JSON.stringify(prima[field]) !== JSON.stringify(dopo[field])) {
          const pv = prima[field];
          const dv = dopo[field];
          const fmtVal = (v: any) => {
            if (field === 'dvrEsente') return v ? 'sì' : 'no';
            if (typeof v === 'string' && v.match(/^\d{4}-\d{2}-\d{2}/)) return new Date(v).toLocaleDateString('it-IT');
            return v == null || v === '' ? '—' : String(v);
          };
          return `${nome}: ${flabel} da ${fmtVal(pv)} a ${fmtVal(dv)}`;
        }
      }
      if (changed.length > 0) {
        return `${nome}: modificati ${changed.slice(0, 3).map(prettyField).join(', ')}`;
      }
      return `Modificato: ${nome}`;
    }
    if (entry.azione === 'DELETE') return `Eliminato padroncino: ${nome}`;
    if (entry.azione === 'RESTORE') return `♻️ Ripristinato padroncino: ${nome}`;
    // Assegnazioni loggate anche sull'entità padroncino
    if (entry.azione === 'ASSEGNA') {
      const tipo = d?.tipo ?? 'risorsa';
      const risorsa = d?.targa ?? d?.codicePalmare ?? d?.codiceAutista ?? '';
      return `Assegnato ${tipo} ${risorsa} a ${nome}`;
    }
    if (entry.azione === 'CHIUDI_ASSEGNAZIONE') {
      const tipo = d?.tipo ?? 'risorsa';
      const risorsa = d?.targa ?? d?.codicePalmare ?? d?.codiceAutista ?? '';
      return `Fine assegnazione ${tipo} ${risorsa} — ${nome}`;
    }
  }

  // ─── ACCONTO ─────────────────────────────────────────
  if (entry.entityType === 'acconto') {
    const codice = d?.codiceAutista ?? '';
    const pad = d?.padroncinoCollegato ? ` (${d.padroncinoCollegato})` : '';
    if (entry.azione === 'CREATE') {
      const importo = d?.importo != null ? ` di ${euro(d.importo)}` : '';
      const autista = codice ? ` per ${codice}` : '';
      return `Nuovo acconto${autista}${importo}${pad}`;
    }
    if (entry.azione === 'UPDATE') {
      const changed = changedFields(prima, dopo);
      if (changed.includes('importo')) {
        return `Acconto ${codice}${pad}: importo da ${euro(prima?.importo)} a ${euro(dopo?.importo)}`;
      }
      return `Modificato acconto ${codice}${pad}`;
    }
    if (entry.azione === 'DELETE') {
      const importo = d?.importo != null ? ` di ${euro(d.importo)}` : '';
      return `Eliminato acconto ${codice}${importo}${pad}`;
    }
    if (entry.azione === 'RESTORE') {
      const importo = d?.importo != null ? ` di ${euro(d.importo)}` : '';
      return `♻️ Ripristinato acconto${importo}${pad}`;
    }
  }

  // ─── DOCUMENTO ───────────────────────────────────────
  if (entry.entityType === 'documento') {
    const nome = d?.nome ?? d?.tipo ?? 'documento';
    const tipo = d?.tipo ? ` (${d.tipo})` : '';
    if (entry.azione === 'CREATE') return `Caricato "${nome}"${tipo}`;
    if (entry.azione === 'DELETE') return `Eliminato "${nome}"${tipo}`;
    return `Modificato documento "${nome}"`;
  }

  // ─── PALMARE ─────────────────────────────────────────
  if (entry.entityType === 'palmare') {
    const codice = d?.codice ? `palmare ${d.codice}` : 'palmare';
    if (entry.azione === 'CREATE') return `Aggiunto ${codice}`;
    if (entry.azione === 'UPDATE') {
      // Cerca il primo campo modificato per ordine di priorità
      for (const [field, flabel] of PALMARE_FIELD_PRIORITY) {
        if (prima?.[field] !== undefined && dopo?.[field] !== undefined &&
            JSON.stringify(prima[field]) !== JSON.stringify(dopo[field])) {
          const pv = prima[field];
          const dv = dopo[field];
          const fmtVal = (v: any) => {
            if (field === 'tariffaMensile') return euro(v);
            return v == null || v === '' ? '—' : String(v);
          };
          return `${codice}: ${flabel} da ${fmtVal(pv)} a ${fmtVal(dv)}`;
        }
      }
      const changed = changedFields(prima, dopo);
      if (changed.length > 0) {
        return `${codice}: modificati ${changed.slice(0, 3).map(prettyField).join(', ')}`;
      }
      return `Modificato ${codice}`;
    }
    if (entry.azione === 'DELETE') return `Eliminato ${codice}`;
    if (entry.azione === 'RESTORE') return `♻️ Ripristinato ${codice}`;
  }

  // ─── CODICE AUTISTA ──────────────────────────────────
  if (entry.entityType === 'codice_autista' || entry.entityType === 'codiceAutista') {
    const codice = d?.codice ?? `#${entry.entityId.slice(-8)}`;
    const nome = [d?.nome, d?.cognome].filter(Boolean).join(' ');
    const label = nome ? `${codice} (${nome})` : codice;
    const labelPrefix = opts?.hideIdentifier ? '' : `${label}: `;
    if (entry.azione === 'CREATE') return `Aggiunto codice autista ${label}`;
    if (entry.azione === 'UPDATE') {
      // Cerca il primo campo modificato per ordine di priorità
      for (const [field, flabel] of CODICE_AUTISTA_FIELD_PRIORITY) {
        if (prima?.[field] !== undefined && dopo?.[field] !== undefined &&
            JSON.stringify(prima[field]) !== JSON.stringify(dopo[field])) {
          const pv = prima[field];
          const dv = dopo[field];
          const fmtVal = (v: any) => {
            if (['tariffaFissa', 'tariffaRitiro', 'bonus', 'malus'].includes(field)) return euro(v);
            if (field === 'attivo') return v ? 'attivo' : 'dismesso';
            return v == null || v === '' ? '—' : String(v);
          };
          return `${labelPrefix}${flabel} da ${fmtVal(pv)} a ${fmtVal(dv)}`;
        }
      }
      const changed = changedFields(prima, dopo);
      if (changed.length > 0) {
        return `${labelPrefix}modificati: ${changed.slice(0, 3).map(prettyField).join(', ')}`;
      }
      return `Modificato codice autista ${label}`;
    }
    if (entry.azione === 'DELETE') return `Eliminato codice autista ${label}`;
    if (entry.azione === 'RESTORE') return `♻️ Ripristinato codice autista ${label}`;
    if (entry.azione === 'ASSEGNA') {
      const codice = d?.codice ? `[${d.codice}] ` : '';
      const ragSoc = d?.ragioneSociale ?? '';
      const dataI = d?.dataInizio ? new Date(d.dataInizio).toLocaleDateString('it-IT') : '';
      return `${codice}Assegnato a ${ragSoc}${dataI ? ` dal ${dataI}` : ''}`;
    }
    if (entry.azione === 'CHIUDI_ASSEGNAZIONE') {
      const codice = d?.codice ? `[${d.codice}] ` : '';
      const ragSoc = d?.ragioneSociale ?? '';
      const dataF = d?.dataFine ? new Date(d.dataFine).toLocaleDateString('it-IT') : '';
      return `${codice}Fine assegnazione con ${ragSoc}${dataF ? ` (al ${dataF})` : ''}`;
    }
  }

  // ─── ASSEGNAZIONI ────────────────────────────────────
  if (entry.entityType === 'assegnazione_mezzo') {
    const targa = d?.targa ?? '?';
    const pad = d?.ragioneSociale ? ` → ${d.ragioneSociale}` : '';
    if (entry.azione === 'ASSEGNA') return `Assegnato mezzo ${targa}${pad}`;
    if (entry.azione === 'CHIUDI_ASSEGNAZIONE') return `Fine assegnazione mezzo ${targa}${pad}`;
    return `Assegnazione mezzo ${targa}${pad}`;
  }
  if (entry.entityType === 'assegnazione_palmare') {
    const codice = d?.codicePalmare ?? '?';
    const pad = d?.ragioneSociale ? ` → ${d.ragioneSociale}` : '';
    if (entry.azione === 'ASSEGNA') return `Assegnato palmare ${codice}${pad}`;
    if (entry.azione === 'CHIUDI_ASSEGNAZIONE') return `Fine assegnazione palmare ${codice}${pad}`;
    return `Assegnazione palmare ${codice}${pad}`;
  }
  if (entry.entityType === 'assegnazione_codice_autista') {
    const codice = d?.codiceAutista ?? '?';
    const pad = d?.ragioneSociale ? ` → ${d.ragioneSociale}` : '';
    if (entry.azione === 'ASSEGNA') return `Assegnato autista ${codice}${pad}`;
    if (entry.azione === 'CHIUDI_ASSEGNAZIONE') return `Fine assegnazione autista ${codice}${pad}`;
    return `Assegnazione autista ${codice}${pad}`;
  }

  // ─── UTENTE / LOGIN ──────────────────────────────────
  if (entry.entityType === 'utente') {
    if (entry.azione === 'LOGIN') {
      const nome = [d?.nome, d?.cognome].filter(Boolean).join(' ') || d?.email || 'Utente';
      return `${nome} ha effettuato l'accesso`;
    }
  }

  // ─── FALLBACK ────────────────────────────────────────
  return `#${entry.entityId.slice(-8)}`;
}

export function fmtDate(d: string) {
  return new Date(d).toLocaleString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}
