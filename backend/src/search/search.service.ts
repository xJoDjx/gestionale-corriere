import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface SearchHit {
  entityType:
    | 'padroncino'
    | 'mezzo'
    | 'palmare'
    | 'codiceAutista'
    | 'conteggio'
    | 'rigaConteggio'
    | 'acconto'
    | 'ricarica'
    | 'documento'
    | 'nota';
  entityId: string;
  /** id del record genitore (es. conteggio per riga, padroncino per nota), per linkare alla pagina */
  parentId?: string;
  title: string;
  /** estratto del campo che ha matchato, evidenziato lato frontend */
  snippet: string;
  /** etichetta del campo che ha matchato (es. "Note", "Targa", "Email") */
  field: string;
  /** url interno della SPA */
  href: string;
  meta?: Record<string, string | number | boolean | null>;
}

export interface SearchResponse {
  query: string;
  total: number;
  groups: Record<string, { label: string; icon: string; hits: SearchHit[] }>;
}

const GROUPS_META: Record<SearchHit['entityType'], { label: string; icon: string }> = {
  padroncino:    { label: 'Padroncini',         icon: '👤' },
  mezzo:         { label: 'Mezzi',              icon: '🚛' },
  palmare:       { label: 'Palmari',            icon: '📱' },
  codiceAutista: { label: 'Codici Autista',     icon: '🏷️' },
  conteggio:     { label: 'Conteggi',           icon: '📋' },
  rigaConteggio: { label: 'Righe Conteggio',    icon: '📝' },
  acconto:       { label: 'Acconti',            icon: '💰' },
  ricarica:      { label: 'Ricariche',          icon: '⚡' },
  documento:     { label: 'Documenti',          icon: '📎' },
  nota:          { label: 'Note',               icon: '🗒️' },
};

@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService) {}

  /**
   * Costruisce uno snippet evidenziando la query (window di ~80 char attorno al match).
   */
  private snippet(text: string | null | undefined, q: string): string {
    if (!text) return '';
    const t = String(text);
    const idx = t.toLowerCase().indexOf(q.toLowerCase());
    if (idx < 0) return t.slice(0, 100);
    const start = Math.max(0, idx - 30);
    const end = Math.min(t.length, idx + q.length + 50);
    const prefix = start > 0 ? '…' : '';
    const suffix = end < t.length ? '…' : '';
    return prefix + t.slice(start, end) + suffix;
  }

  async search(rawQuery: string, limit = 200): Promise<SearchResponse> {
    const q = (rawQuery || '').trim();
    if (q.length < 2) {
      return { query: q, total: 0, groups: {} };
    }
    const ic = { contains: q, mode: 'insensitive' as const };
    const hits: SearchHit[] = [];

    // ── PADRONCINI ──────────────────────────────────────
    const padroncini = await this.prisma.padroncino.findMany({
      where: {
        deletedAt: null,
        OR: [
          { ragioneSociale: ic },
          { partitaIva:     ic },
          { codiceFiscale:  ic },
          { indirizzo:      ic },
          { telefono:       ic },
          { email:          ic },
          { pec:            ic },
          { iban:           ic },
          { note:           ic },
        ],
      },
      take: 60,
    });
    for (const p of padroncini) {
      const fieldHit =
        p.ragioneSociale?.toLowerCase().includes(q.toLowerCase()) ? { f: 'Ragione Sociale', v: p.ragioneSociale } :
        p.partitaIva?.toLowerCase().includes(q.toLowerCase())     ? { f: 'Partita IVA',    v: p.partitaIva } :
        p.codiceFiscale?.toLowerCase().includes(q.toLowerCase())  ? { f: 'Codice Fiscale', v: p.codiceFiscale } :
        p.email?.toLowerCase().includes(q.toLowerCase())          ? { f: 'Email',          v: p.email } :
        p.pec?.toLowerCase().includes(q.toLowerCase())            ? { f: 'PEC',            v: p.pec } :
        p.telefono?.toLowerCase().includes(q.toLowerCase())       ? { f: 'Telefono',       v: p.telefono } :
        p.iban?.toLowerCase().includes(q.toLowerCase())           ? { f: 'IBAN',           v: p.iban } :
        p.indirizzo?.toLowerCase().includes(q.toLowerCase())      ? { f: 'Indirizzo',      v: p.indirizzo } :
        p.note?.toLowerCase().includes(q.toLowerCase())           ? { f: 'Note',           v: p.note } :
        { f: 'Match', v: p.ragioneSociale };
      hits.push({
        entityType: 'padroncino',
        entityId: p.id,
        title: p.ragioneSociale,
        field: fieldHit.f,
        snippet: this.snippet(fieldHit.v, q),
        href: `/padroncini/${p.id}`,
        meta: { partitaIva: p.partitaIva, attivo: p.attivo },
      });
    }

    // ── MEZZI ───────────────────────────────────────────
    const mezzi = await this.prisma.mezzo.findMany({
      where: {
        deletedAt: null,
        OR: [
          { targa:           ic },
          { marca:           ic },
          { modello:         ic },
          { societaNoleggio: ic },
          { note:            ic },
        ],
      },
      take: 60,
    });
    for (const m of mezzi) {
      const fieldHit =
        m.targa.toLowerCase().includes(q.toLowerCase())                  ? { f: 'Targa',            v: m.targa } :
        m.marca?.toLowerCase().includes(q.toLowerCase())                 ? { f: 'Marca',            v: m.marca } :
        m.modello?.toLowerCase().includes(q.toLowerCase())               ? { f: 'Modello',          v: m.modello } :
        m.societaNoleggio?.toLowerCase().includes(q.toLowerCase())       ? { f: 'Società Noleggio', v: m.societaNoleggio } :
        m.note?.toLowerCase().includes(q.toLowerCase())                  ? { f: 'Note',             v: m.note } :
        { f: 'Match', v: m.targa };
      hits.push({
        entityType: 'mezzo',
        entityId: m.id,
        title: `${m.targa} — ${m.marca ?? ''} ${m.modello ?? ''}`.trim(),
        field: fieldHit.f,
        snippet: this.snippet(fieldHit.v, q),
        href: `/flotta/${m.id}`,
        meta: { stato: m.stato, categoria: m.categoria },
      });
    }

    // ── PALMARI ─────────────────────────────────────────
    const palmari = await this.prisma.palmare.findMany({
      where: {
        deletedAt: null,
        OR: [
          { codice:          ic },
          { codiceAssociato: ic },
          { marca:           ic },
          { modello:         ic },
          { imei:            ic },
          { simNumero:       ic },
          { note:            ic },
        ],
      },
      take: 60,
    });
    for (const p of palmari) {
      const fieldHit =
        p.codice.toLowerCase().includes(q.toLowerCase())                 ? { f: 'Codice',           v: p.codice } :
        p.codiceAssociato?.toLowerCase().includes(q.toLowerCase())       ? { f: 'Codice Associato', v: p.codiceAssociato } :
        p.imei?.toLowerCase().includes(q.toLowerCase())                  ? { f: 'IMEI',             v: p.imei } :
        p.simNumero?.toLowerCase().includes(q.toLowerCase())             ? { f: 'SIM',              v: p.simNumero } :
        p.marca?.toLowerCase().includes(q.toLowerCase())                 ? { f: 'Marca',            v: p.marca } :
        p.modello?.toLowerCase().includes(q.toLowerCase())               ? { f: 'Modello',          v: p.modello } :
        p.note?.toLowerCase().includes(q.toLowerCase())                  ? { f: 'Note',             v: p.note } :
        { f: 'Match', v: p.codice };
      hits.push({
        entityType: 'palmare',
        entityId: p.id,
        title: `${p.codice}${p.marca || p.modello ? ` — ${p.marca ?? ''} ${p.modello ?? ''}`.trim() : ''}`,
        field: fieldHit.f,
        snippet: this.snippet(fieldHit.v, q),
        href: `/palmari/${p.id}`,
        meta: { stato: p.stato },
      });
    }

    // ── CODICI AUTISTA ──────────────────────────────────
    const codici = await this.prisma.codiceAutista.findMany({
      where: {
        deletedAt: null,
        OR: [
          { codice:     ic },
          { nome:       ic },
          { cognome:    ic },
          { note:       ic },
          { zone:       ic },
          { bonusMalus: ic },
        ],
      },
      take: 60,
    });
    for (const c of codici) {
      const fieldHit =
        c.codice.toLowerCase().includes(q.toLowerCase())              ? { f: 'Codice',     v: c.codice } :
        c.nome?.toLowerCase().includes(q.toLowerCase())               ? { f: 'Nome',       v: c.nome } :
        c.cognome?.toLowerCase().includes(q.toLowerCase())            ? { f: 'Cognome',    v: c.cognome } :
        c.zone?.toLowerCase().includes(q.toLowerCase())               ? { f: 'Zone',       v: c.zone } :
        c.bonusMalus?.toLowerCase().includes(q.toLowerCase())         ? { f: 'Bonus/Malus', v: c.bonusMalus } :
        c.note?.toLowerCase().includes(q.toLowerCase())               ? { f: 'Note',       v: c.note } :
        { f: 'Match', v: c.codice };
      hits.push({
        entityType: 'codiceAutista',
        entityId: c.id,
        title: `${c.codice}${c.nome || c.cognome ? ` — ${c.nome ?? ''} ${c.cognome ?? ''}`.trim() : ''}`,
        field: fieldHit.f,
        snippet: this.snippet(fieldHit.v, q),
        href: `/codici-autista/${c.id}`,
        meta: { attivo: c.attivo },
      });
    }

    // ── CONTEGGI MENSILI (note/mese) ───────────────────
    const conteggi = await this.prisma.conteggioMensile.findMany({
      where: {
        deletedAt: null,
        OR: [
          { note: ic },
          { mese: ic },
        ],
      },
      include: { padroncino: { select: { ragioneSociale: true } } },
      take: 60,
    });
    for (const c of conteggi) {
      const fieldHit =
        c.note?.toLowerCase().includes(q.toLowerCase()) ? { f: 'Note',  v: c.note } :
        c.mese.toLowerCase().includes(q.toLowerCase())  ? { f: 'Mese',  v: c.mese } :
        { f: 'Match', v: c.note ?? c.mese };
      hits.push({
        entityType: 'conteggio',
        entityId: c.id,
        title: `${c.padroncino.ragioneSociale} — ${c.mese}`,
        field: fieldHit.f,
        snippet: this.snippet(fieldHit.v, q),
        href: `/conteggi/${c.padroncinoId}?mese=${c.mese}`,
        meta: { stato: c.stato },
      });
    }

    // ── RIGHE CONTEGGIO (descrizione/note/categoria) ────
    const righe = await this.prisma.conteggiRiga.findMany({
      where: {
        OR: [
          { descrizione: ic },
          { note:        ic },
          { categoria:   ic },
        ],
      },
      include: {
        conteggioMensile: {
          include: { padroncino: { select: { ragioneSociale: true } } },
        },
      },
      take: 80,
    });
    for (const r of righe) {
      const fieldHit =
        r.descrizione.toLowerCase().includes(q.toLowerCase()) ? { f: 'Descrizione', v: r.descrizione } :
        r.note?.toLowerCase().includes(q.toLowerCase())       ? { f: 'Note',        v: r.note } :
        r.categoria?.toLowerCase().includes(q.toLowerCase())  ? { f: 'Categoria',   v: r.categoria } :
        { f: 'Match', v: r.descrizione };
      hits.push({
        entityType: 'rigaConteggio',
        entityId: r.id,
        parentId: r.conteggioMensileId,
        title: `${r.conteggioMensile.padroncino.ragioneSociale} — ${r.conteggioMensile.mese} · ${r.descrizione}`,
        field: fieldHit.f,
        snippet: this.snippet(fieldHit.v, q),
        href: `/conteggi/${r.conteggioMensile.padroncinoId}?mese=${r.conteggioMensile.mese}`,
        meta: { tipo: r.tipo, segno: r.segno, importo: Number(r.importo) },
      });
    }

    // ── ACCONTI (descrizione/note) ─────────────────────
    const acconti = await this.prisma.acconto.findMany({
      where: {
        deletedAt: null,
        OR: [
          { descrizione: ic },
          { note:        ic },
        ],
      },
      include: { codiceAutista: { select: { codice: true, nome: true, cognome: true } } },
      take: 60,
    });
    for (const a of acconti) {
      const fieldHit =
        a.descrizione?.toLowerCase().includes(q.toLowerCase()) ? { f: 'Descrizione', v: a.descrizione } :
        a.note?.toLowerCase().includes(q.toLowerCase())        ? { f: 'Note',        v: a.note } :
        { f: 'Match', v: a.descrizione ?? '' };
      const ca = a.codiceAutista;
      hits.push({
        entityType: 'acconto',
        entityId: a.id,
        title: `${ca.codice}${ca.nome ? ` — ${ca.nome} ${ca.cognome ?? ''}`.trim() : ''} · ${Number(a.importo).toFixed(2)} €`,
        field: fieldHit.f,
        snippet: this.snippet(fieldHit.v, q),
        href: `/acconti`,
        meta: { mese: a.mese, data: a.data?.toISOString().slice(0, 10) ?? null },
      });
    }

    // ── RICARICHE ELETTRICHE (fornitore/note) ──────────
    const ricariche = await this.prisma.ricaricaElettrica.findMany({
      where: {
        deletedAt: null,
        OR: [
          { fornitore: ic },
          { note:      ic },
        ],
      },
      take: 60,
    });
    for (const r of ricariche) {
      const fieldHit =
        r.fornitore?.toLowerCase().includes(q.toLowerCase()) ? { f: 'Fornitore', v: r.fornitore } :
        r.note?.toLowerCase().includes(q.toLowerCase())      ? { f: 'Note',      v: r.note } :
        { f: 'Match', v: r.fornitore ?? '' };
      hits.push({
        entityType: 'ricarica',
        entityId: r.id,
        title: `Ricarica ${r.data?.toISOString().slice(0, 10) ?? ''} · ${Number(r.importo).toFixed(2)} €`,
        field: fieldHit.f,
        snippet: this.snippet(fieldHit.v, q),
        href: `/ricariche`,
        meta: { mese: r.mese, fornitore: r.fornitore },
      });
    }

    // ── DOCUMENTI (nome/tipo/note) ─────────────────────
    const documenti = await this.prisma.documento.findMany({
      where: {
        deletedAt: null,
        OR: [
          { nome: ic },
          { tipo: ic },
          { note: ic },
        ],
      },
      take: 60,
    });
    for (const d of documenti) {
      const fieldHit =
        d.nome.toLowerCase().includes(q.toLowerCase()) ? { f: 'Nome',  v: d.nome } :
        d.tipo?.toLowerCase().includes(q.toLowerCase()) ? { f: 'Tipo', v: d.tipo } :
        d.note?.toLowerCase().includes(q.toLowerCase()) ? { f: 'Note', v: d.note } :
        { f: 'Match', v: d.nome };
      // mappa entityType → route
      const route =
        d.entityType === 'mezzo'      ? `/flotta/${d.entityId}` :
        d.entityType === 'padroncino' ? `/padroncini/${d.entityId}` :
        d.entityType === 'palmare'    ? `/palmari/${d.entityId}` : `/`;
      hits.push({
        entityType: 'documento',
        entityId: d.id,
        parentId: d.entityId,
        title: `${d.nome}${d.tipo ? ` (${d.tipo})` : ''}`,
        field: fieldHit.f,
        snippet: this.snippet(fieldHit.v, q),
        href: route,
        meta: { entita: d.entityType, scadenza: d.scadenza?.toISOString().slice(0, 10) ?? null },
      });
    }

    // ── NOTE (sistema unico) ───────────────────────────
    const note = await this.prisma.nota.findMany({
      where: { contenuto: ic },
      take: 60,
    });
    for (const n of note) {
      const route =
        n.entityType === 'mezzo'      ? `/flotta/${n.entityId}` :
        n.entityType === 'padroncino' ? `/padroncini/${n.entityId}` : `/`;
      hits.push({
        entityType: 'nota',
        entityId: n.id,
        parentId: n.entityId,
        title: `Nota su ${n.entityType}`,
        field: 'Contenuto',
        snippet: this.snippet(n.contenuto, q),
        href: route,
        meta: { entita: n.entityType },
      });
    }

    // ── GROUPING ───────────────────────────────────────
    const groups: SearchResponse['groups'] = {};
    let total = 0;
    for (const h of hits.slice(0, limit)) {
      total++;
      const meta = GROUPS_META[h.entityType];
      if (!groups[h.entityType]) {
        groups[h.entityType] = { label: meta.label, icon: meta.icon, hits: [] };
      }
      groups[h.entityType].hits.push(h);
    }

    return { query: q, total, groups };
  }
}
