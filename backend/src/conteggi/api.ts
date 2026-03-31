const API_BASE = process.env.API_URL || 'http://localhost:3000/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      // TODO: aggiungere Authorization header
    },
    ...options,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message || 'Errore API');
  }
  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(data) }),
  put: <T>(path: string, data: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(data) }),
  delete: <T>(path: string) =>
    request<T>(path, { method: 'DELETE' }),
};

// ─── MEZZI API ────────────────────────────────────────
export const mezziApi = {
  list: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.get<MezziListResponse>(`/mezzi${qs}`);
  },
  stats: () => api.get<MezziStats>('/mezzi/stats'),
  detail: (id: string) => api.get<Mezzo>(`/mezzi/${id}`),
  create: (data: CreateMezzoPayload) => api.post<Mezzo>('/mezzi', data),
  update: (id: string, data: Partial<CreateMezzoPayload>) => api.put<Mezzo>(`/mezzi/${id}`, data),
  delete: (id: string) => api.delete(`/mezzi/${id}`),
  scadenze: (giorni?: number) => api.get<Mezzo[]>(`/mezzi/scadenze?giorni=${giorni || 30}`),
  assegna: (mezzoId: string, data: AssegnazioneMezzoPayload) =>
    api.post(`/mezzi/${mezzoId}/assegnazioni`, data),
  chiudiAssegnazione: (assegnazioneId: string) =>
    api.put(`/mezzi/assegnazioni/${assegnazioneId}/chiudi`, {}),
};

// ─── TYPES ────────────────────────────────────────────
export interface Mezzo {
  id: string;
  targa: string;
  marca: string;
  modello: string;
  tipo: string;
  alimentazione: string;
  categoria: string;
  stato: string;
  rataNoleggio: number | null;
  canoneNoleggio: number | null;
  kmAttuali: number | null;
  kmLimite: number | null;
  scadenzaAssicurazione: string | null;
  scadenzaRevisione: string | null;
  assegnazioni?: Assegnazione[];
  tags?: Tag[];
}

export interface Assegnazione {
  id: string;
  dataInizio: string;
  dataFine: string | null;
  padroncino: { id: string; ragioneSociale: string };
}

export interface Tag {
  id: string;
  nome: string;
  colore: string;
}

export interface MezziListResponse {
  data: Mezzo[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface MezziStats {
  totali: number;
  disponibili: number;
  assegnati: number;
  entrateNoleggio: number;
  margine: number;
  scadenzeImminenti: number;
}

export interface CreateMezzoPayload {
  targa: string;
  marca: string;
  modello: string;
  tipo?: string;
  alimentazione?: string;
  categoria?: string;
  stato?: string;
  rataNoleggio?: number;
  canoneNoleggio?: number;
  kmAttuali?: number;
  kmLimite?: number;
  scadenzaAssicurazione?: string;
  scadenzaRevisione?: string;
}

export interface AssegnazioneMezzoPayload {
  padroncinoId: string;
  dataInizio: string;
  dataFine?: string;
}
