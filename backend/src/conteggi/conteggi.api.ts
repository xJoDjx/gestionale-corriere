import { api } from './api';

export interface ConteggioMensile {
  id: string;
  padroncinoId: string;
  mese: string;
  stato: 'BOZZA' | 'CHIUSO' | 'CONFERMATO';
  note: string | null;
  padroncino: { id: string; ragioneSociale: string };
  righe: ConteggiRiga[];
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
  note: string | null;
}

export interface BulkResult {
  padroncino: string;
  stato: string;
  id?: string;
  errore?: string;
}

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

  updateStato: (id: string, stato: string) =>
    api.put<ConteggioMensile>(`/conteggi/${id}/stato`, { stato }),

  rigenera: (id: string) =>
    api.post<ConteggioMensile>(`/conteggi/${id}/rigenera`, {}),

  addRiga: (conteggioId: string, data: Partial<ConteggiRiga>) =>
    api.post<ConteggiRiga>(`/conteggi/${conteggioId}/righe`, data),

  updateRiga: (rigaId: string, data: Partial<ConteggiRiga>) =>
    api.put<ConteggiRiga>(`/conteggi/righe/${rigaId}`, data),

  deleteRiga: (rigaId: string) =>
    api.delete(`/conteggi/righe/${rigaId}`),

  remove: (id: string) =>
    api.delete(`/conteggi/${id}`),
};
