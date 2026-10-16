import { api } from './api';

export type TipoAddebitoSospeso = 'ADDEBITO' | 'MEMO';

export interface AddebitoSospeso {
  id:          string;
  padroncinoId: string;
  tipo:        TipoAddebitoSospeso;
  descrizione: string;
  importo:     number | null;
  meseOrigine: string | null;
  meseTarget:  string;
  stato:       'PENDENTE' | 'EVASO';
  note:        string | null;
  createdAt:   string;
  updatedAt:   string;
  padroncino?: { id: string; ragioneSociale: string };
}

export interface CreateAddebitoSospesoDto {
  padroncinoId: string;
  tipo?:        TipoAddebitoSospeso;
  descrizione:  string;
  importo?:     number;
  meseOrigine?: string;
  meseTarget:   string;
  note?:        string;
}

export interface UpdateAddebitoSospesoDto {
  padroncinoId?: string;
  tipo?:        TipoAddebitoSospeso;
  descrizione?:  string;
  importo?:      number | null;
  meseOrigine?:  string | null;
  meseTarget?:   string;
  note?:         string | null;
}

export const addebitivSospesoApi = {
  list: (params?: { padroncinoId?: string; meseTarget?: string; stato?: 'PENDENTE' | 'EVASO' }) => {
    const qs = new URLSearchParams();
    if (params?.padroncinoId) qs.set('padroncinoId', params.padroncinoId);
    if (params?.meseTarget)   qs.set('meseTarget',   params.meseTarget);
    if (params?.stato)        qs.set('stato',         params.stato);
    const q = qs.toString();
    return api.get<AddebitoSospeso[]>(`/addebiti-sospesi${q ? `?${q}` : ''}`);
  },
  get: (id: string) => api.get<AddebitoSospeso>(`/addebiti-sospesi/${id}`),
  create: (dto: CreateAddebitoSospesoDto) =>
    api.post<AddebitoSospeso>('/addebiti-sospesi', dto),
  update: (id: string, dto: UpdateAddebitoSospesoDto) =>
    api.put<AddebitoSospeso>(`/addebiti-sospesi/${id}`, dto),
  evadi: (id: string) =>
    api.patch<AddebitoSospeso>(`/addebiti-sospesi/${id}/evadi`, {}),
  riapri: (id: string) =>
    api.patch<AddebitoSospeso>(`/addebiti-sospesi/${id}/riapri`, {}),
  delete: (id: string) =>
    api.delete<{ message: string }>(`/addebiti-sospesi/${id}`),
};
