import { api } from './api';

export interface DistribuzioneStatRow {
  data?: string;
  fatturato: number;
  consegneAffidate: number;
  consegneFatte: number;
  ritiriAffidati: number;
  ritiriFatti: number;
  consegneAffidateShop: number;
  consegneFatteShop: number;
}

export interface DistribuzioneCodice extends DistribuzioneStatRow {
  codice: string;
  righe: DistribuzioneStatRow[];
}

export interface DistribuzioneJson {
  riepilogo: DistribuzioneStatRow;
  codici: DistribuzioneCodice[];
}

export interface ConteggioMensile {
  id: string;
  padroncinoId: string;
  mese: string;
  stato: 'BOZZA' | 'CHIUSO' | 'CONFERMATO';
  note: string | null;
  padroncino: { id: string; ragioneSociale: string };
  righe: ConteggiRiga[];
  distribuzioneJson?: DistribuzioneJson | null;
  totalePositivo?: number;
  totaleNegativo?: number;
  netto?: number;
}

export interface ConteggiRiga {
  id: string;
  tipo: string;
  descrizione: string;
  importo: number;
  segno: 'POSITIVO' | 'NEGATIVO';
  categoria: string | null;
  riferimentoTipo: string | null;
  riferimentoId: string | null;
  ordine: number;
  modificaManuale: boolean;
  contoVoce: string | null;
  note: string | null;
}

export interface BulkResult {
  padroncino: string;
  stato: string;
  id?: string;
  errore?: string;
}

export interface CompetenzeAttive {
  mese: string;
  valore: number | null;
}

// ─── CONTEGGI API ────────────────────────────────────
export const conteggiApi = {
  list: (mese?: string, padroncinoId?: string) => {
    const params = new URLSearchParams();
    if (mese) params.set('mese', mese);
    if (padroncinoId) params.set('padroncinoId', padroncinoId);
    const qs = params.toString();
    return api.get<ConteggioMensile[]>(`/conteggi${qs ? '?' + qs : ''}`);
  },
  detail: (id: string) =>
    api.get<ConteggioMensile>(`/conteggi/${id}`),
  create: (padroncinoId: string, mese: string) =>
    api.post<ConteggioMensile>('/conteggi', { padroncinoId, mese }),
  generaBulk: (mese: string) =>
    api.post<BulkResult[]>('/conteggi/bulk', { mese }),
  duplica: (padroncinoId: string, meseSorgente: string, meseDestinazione: string) =>
    api.post<ConteggioMensile>('/conteggi/duplica', { padroncinoId, meseSorgente, meseDestinazione }),
  duplicaBulk: (meseSorgente: string, meseDestinazione: string) =>
    api.post<BulkResult[]>('/conteggi/duplica-bulk', { meseSorgente, meseDestinazione }),
  updateNetto: (id: string, netto: number) =>
    api.put<ConteggioMensile>(`/conteggi/${id}/netto`, { netto }),
  updateStato: (id: string, stato: string) =>
    api.put<ConteggioMensile>(`/conteggi/${id}/stato`, { stato }),
  updateNote: (id: string, note: string) =>
    api.put<ConteggioMensile>(`/conteggi/${id}/note`, { note }),
  rigenera: (id: string) =>
    api.post<ConteggioMensile>(`/conteggi/${id}/rigenera`, {}),
  addRiga: (conteggioId: string, data: Partial<ConteggiRiga>) =>
    api.post<ConteggiRiga>(`/conteggi/${conteggioId}/righe`, data),
  updateRiga: (rigaId: string, data: Partial<ConteggiRiga>) =>
    api.put<ConteggiRiga>(`/conteggi/righe/${rigaId}`, data),
  deleteRiga: (rigaId: string) =>
    api.delete(`/conteggi/righe/${rigaId}`),
  /** Sostituisce TUTTE le righe in una sola chiamata (un solo evento audit log) */
  replaceRighe: (conteggioId: string, righe: Partial<ConteggiRiga>[], netto?: number) =>
    api.post<ConteggioMensile>(`/conteggi/${conteggioId}/righe/replace`, { righe, netto }),
  remove: (id: string) =>
    api.delete(`/conteggi/${id}`),
  getCompetenzeAttive: (mese: string) =>
    api.get<CompetenzeAttive>(`/conteggi/competenze-attive/${mese}`),
  setCompetenzeAttive: (mese: string, valore: number | null) =>
    api.put<CompetenzeAttive>(`/conteggi/competenze-attive/${mese}`, { valore }),

  applicaFatturaProforma: (file: File, mese: string) => {
    const API_BASE = import.meta.env.VITE_API_URL || '/api';
    const token = localStorage.getItem('token') ?? (() => { try { return JSON.parse(localStorage.getItem('auth-storage') ?? '{}').state?.token ?? null; } catch { return null; } })();
    const fd = new FormData();
    fd.append('file', file);
    fd.append('mese', mese);
    return fetch(`${API_BASE}/conteggi/applica-fattura-proforma`, { method: 'POST', headers: (token ? { Authorization: `Bearer ${token}` } : {}) as Record<string,string>, body: fd })
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({ message: res.statusText }));
          throw new Error(err.message || 'Errore importazione');
        }
        return res.json() as Promise<{
          processati: number;
          saltati: number;
          risultati: { fornitore: string; padroncino?: string; totale: number; azione: string }[];
        }>;
      });
  },
};
