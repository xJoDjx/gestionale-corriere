const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
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
  patch: <T>(path: string, data: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

// ─── TYPES ────────────────────────────────────────────

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
  scadenzaBollo?: string | null;
  scadenzaTachigrafo?: string | null;
  annoImmatricolazione?: string | null;
  colore?: string | null;
  portata?: number | null;
  volume?: number | null;
  tipoCassone?: string | null;
  targaRimorchio?: string | null;
  telaio?: string | null;
  note?: string | null;
  proprietario?: string | null;
  nContratto?: string | null;
  inizioNoleggio?: string | null;
  fineNoleggio?: string | null;
  maggiorazioneRicarica?: number | null;
  autista?: string | null;
  assegnazioni?: Assegnazione[];
  tags?: Tag[];
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
  scadenzaBollo?: string;
  scadenzaTachigrafo?: string;
  annoImmatricolazione?: string;
  colore?: string;
  portata?: number;
  volume?: number;
  tipoCassone?: string;
  targaRimorchio?: string;
  telaio?: string;
  note?: string;
  proprietario?: string;
  nContratto?: string;
  inizioNoleggio?: string;
  fineNoleggio?: string;
  maggiorazioneRicarica?: number;
}

export interface AssegnazioneMezzoPayload {
  padroncinoId: string;
  dataInizio: string;
  dataFine?: string;
}

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
  importaExcel: (file: File): Promise<{ creati: number; saltati: number; errori: string[] }> => {
    const formData = new FormData();
    formData.append('file', file);
    return fetch(`${API_BASE}/mezzi/importa-excel`, { method: 'POST', body: formData })
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({ message: res.statusText }));
          throw new Error(err.message || 'Errore importazione');
        }
        return res.json();
      });
  },
};

// ─── PALMARI TYPES ────────────────────────────────────
export interface AssegnazionePalmare {
  id: string;
  padroncinoId: string;
  ragioneSociale: string;
  dataInizio: string;
  dataFine?: string | null;
}

export interface Palmare {
  id: string;
  codice: string;
  marca: string | null;
  modello: string | null;
  imei: string | null;
  simNumero: string | null;
  tariffaMensile: number | null;
  stato: 'DISPONIBILE' | 'ASSEGNATO' | 'GUASTO' | 'DISMESSO';
  note: string | null;
  createdAt: string;
  assegnazioni: AssegnazionePalmare[];
}

export interface PalmariListResponse {
  data: Palmare[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PalmariStats {
  totali: number;
  disponibili: number;
  assegnati: number;
  guasti: number;
  entrateMensili: number;
}

export interface CreatePalmarePayload {
  codice: string;
  marca?: string;
  modello?: string;
  imei?: string;
  simNumero?: string;
  tariffaMensile?: number;
  stato?: string;
  note?: string;
}

// ─── PALMARI API ──────────────────────────────────────
export const palmariApi = {
  list: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.get<PalmariListResponse>(`/palmari${qs}`);
  },
  stats: () => api.get<PalmariStats>('/palmari/stats'),
  detail: (id: string) => api.get<Palmare>(`/palmari/${id}`),
  create: (data: CreatePalmarePayload) => api.post<Palmare>('/palmari', data),
  update: (id: string, data: Partial<CreatePalmarePayload>) => api.put<Palmare>(`/palmari/${id}`, data),
  delete: (id: string) => api.delete(`/palmari/${id}`),
  assegna: (id: string, payload: { padroncinoId: string; dataInizio: string }) =>
    api.post(`/palmari/${id}/assegnazioni`, payload),
  chiudiAssegnazione: (assegnazioneId: string) =>
    api.put(`/palmari/assegnazioni/${assegnazioneId}/chiudi`, {}),
};

// ─── PADRONCINI TYPES ─────────────────────────────────
export interface PadroncinoMezzo {
  id: string;
  targa: string;
  marca: string;
  modello: string;
  alimentazione: string;
  dataInizio: string;
  dataFine?: string | null;
  tariffa?: number | null;
  tariffaIvata?: number | null;
}

export interface PadroncinoPalmare {
  id: string;
  codice: string;
  tariffa: number;
  dataInizio: string;
  dataFine?: string | null;
}

export interface PadroncinoCodiceAutista {
  id: string;
  codice: string;
  nome: string | null;
  cognome: string | null;
  dataInizio: string;
  dataFine?: string | null;
}

export interface Padroncino {
  id: string;
  ragioneSociale: string;
  codice?: string;
  partitaIva: string;
  codiceFiscale: string | null;
  indirizzo: string | null;
  telefono: string | null;
  email: string | null;
  pec: string | null;
  iban: string | null;
  scadenzaDurc: string | null;
  scadenzaDvr: string | null;
  attivo: boolean;
  note: string | null;
  mezziAssegnati: PadroncinoMezzo[];
  palmariAssegnati: PadroncinoPalmare[];
  codiciAutista: PadroncinoCodiceAutista[];
  conteggiCount: number;
  fatturatoMese?: number;
  bonifico?: number;
}

export interface PadronciniListResponse {
  data: Padroncino[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PadronciniStats {
  attivi: number;
  dismissi: number;
  totali: number;
  alertDocumenti: number;
  flottaMezzi: number;
  flottaDisponibili: number;
  palmariAttivi: number;
  palmariTotali: number;
}

export interface CreatePadroncinoPayload {
  ragioneSociale: string;
  partitaIva: string;
  codiceFiscale?: string;
  indirizzo?: string;
  telefono?: string;
  email?: string;
  pec?: string;
  iban?: string;
  scadenzaDurc?: string;
  scadenzaDvr?: string;
  note?: string;
}

// ─── PADRONCINI API ───────────────────────────────────
export const padronciniApi = {
  list: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.get<PadronciniListResponse>(`/padroncini${qs}`);
  },
  stats: () => api.get<PadronciniStats>('/padroncini/stats'),
  detail: (id: string) => api.get<Padroncino>(`/padroncini/${id}`),
  create: (data: CreatePadroncinoPayload) => api.post<Padroncino>('/padroncini', data),
  update: (id: string, data: Partial<CreatePadroncinoPayload>) =>
    api.put<Padroncino>(`/padroncini/${id}`, data),
  delete: (id: string) => api.delete(`/padroncini/${id}`),
  assegnaMezzo: (id: string, payload: { mezzoId: string; dataInizio: string }) =>
    api.post(`/padroncini/${id}/mezzi`, payload),
  assegnaPalmare: (id: string, payload: { palmareId: string; dataInizio: string }) =>
    api.post(`/padroncini/${id}/palmari`, payload),
  assegnaCodice: (id: string, payload: { codiceAutistaId: string; dataInizio: string }) =>
    api.post(`/padroncini/${id}/codici-autista`, payload),
  rimuoviMezzo: (padroncinoId: string, assegnazioneId: string) =>
    api.delete(`/padroncini/${padroncinoId}/mezzi/${assegnazioneId}`),
  rimuoviPalmare: (padroncinoId: string, assegnazioneId: string) =>
    api.delete(`/padroncini/${padroncinoId}/palmari/${assegnazioneId}`),
  rimuoviCodice: (padroncinoId: string, assegnazioneId: string) =>
    api.delete(`/padroncini/${padroncinoId}/codici-autista/${assegnazioneId}`),
};

// ─── CODICI AUTISTI TYPES ─────────────────────────────
export interface AssegnazioneCodiceAutista {
  id: string;
  padroncinoId: string;
  ragioneSociale: string;
  dataInizio: string;
  dataFine?: string | null;
}

export interface CodiceAutista {
  id: string;
  codice: string;
  nome: string | null;
  cognome: string | null;
  note: string | null;
  attivo: boolean;
  createdAt: string;
  tariffaFissa?: number | null;
  tariffaRitiro?: number | null;
  target?: number | null;
  assegnazioni: AssegnazioneCodiceAutista[];
}

export interface CodiciAutistaListResponse {
  data: CodiceAutista[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CodiciAutistaStats {
  totali: number;
  disponibili: number;
  assegnati: number;
  tariffaFissaMedia: number;
  tariffaRitiroMedia: number;
}

export interface CreateCodiceAutistaPayload {
  codice: string;
  nome?: string;
  cognome?: string;
  note?: string;
  tariffaFissa?: number;
  tariffaRitiro?: number;
  target?: number;
}

// ─── CODICI AUTISTI API ───────────────────────────────
export const codiciAutistaApi = {
  list: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.get<CodiciAutistaListResponse>(`/codici-autista${qs}`);
  },
  stats: () => api.get<CodiciAutistaStats>('/codici-autista/stats'),
  detail: (id: string) => api.get<CodiceAutista>(`/codici-autista/${id}`),
  create: (data: CreateCodiceAutistaPayload) => api.post<CodiceAutista>('/codici-autista', data),
  update: (id: string, data: Partial<CreateCodiceAutistaPayload>) =>
    api.put<CodiceAutista>(`/codici-autista/${id}`, data),
  delete: (id: string) => api.delete(`/codici-autista/${id}`),
  toggleAttivo: (id: string) => api.put(`/codici-autista/${id}/toggle-attivo`, {}),
  assegna: (id: string, payload: { padroncinoId: string; dataInizio: string }) =>
    api.post(`/codici-autista/${id}/assegnazioni`, payload),
  chiudiAssegnazione: (assegnazioneId: string) =>
    api.put(`/codici-autista/assegnazioni/${assegnazioneId}/chiudi`, {}),
};
