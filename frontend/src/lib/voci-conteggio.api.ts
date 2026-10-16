import { api } from './api';

export type CategoriaVoceConteggio = 'ADDEBITO' | 'FATTURATO' | 'COMPENSAZIONE';

export interface VoceConteggio {
  id: string;
  descrizione: string;
  contoVoce: string | null;
  percIva: number;
  valoreDefault: number | null;
  categoria: CategoriaVoceConteggio;
  attivo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateVoceConteggioInput {
  descrizione: string;
  contoVoce?: string | null;
  percIva?: number;
  valoreDefault?: number | null;
  categoria: CategoriaVoceConteggio;
  attivo?: boolean;
}

export const vociConteggioApi = {
  list: (categoria?: CategoriaVoceConteggio) => {
    const qs = categoria ? `?categoria=${categoria}` : '';
    return api.get<VoceConteggio[]>(`/voci-conteggio${qs}`);
  },
  create: (data: CreateVoceConteggioInput) =>
    api.post<VoceConteggio>('/voci-conteggio', data),
  update: (id: string, data: Partial<CreateVoceConteggioInput>) =>
    api.put<VoceConteggio>(`/voci-conteggio/${id}`, data),
  remove: (id: string) =>
    api.delete(`/voci-conteggio/${id}`),
};
