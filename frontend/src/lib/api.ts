const API_BASE = import.meta.env.VITE_API_URL || '/api';

function getAuthToken(): string | null {
  // Prima prova lo storage diretto usato dall'auth store
  const direct = localStorage.getItem('token');
  if (direct) return direct;
  // Fallback: Zustand persist middleware (chiave auth-storage)
  try {
    return JSON.parse(localStorage.getItem('auth-storage') || '{}')?.state?.token ?? null;
  } catch { return null; }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  });

  // Token scaduto o non valido → pulizia e redirect al login
  if (res.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('auth-storage');
    window.location.href = '/login';
    throw new Error('Sessione scaduta. Effettua nuovamente il login.');
  }

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

export type TipoPossessoMezzo = 'PROPRIETA' | 'NOLEGGIO' | 'ESTERNO';

export interface Mezzo {
  id: string;
  targa: string;
  marca: string;
  modello: string;
  tipo: string;
  alimentazione: string;
  categoria: string;
  tipoPossesso: TipoPossessoMezzo;
  stato: string;
  rataNoleggio: number | null;
  canoneNoleggio: number | null;
  kmAttuali: number | null;
  kmAttualiAl: string | null;
  kmLimite: number | null;
  scadenzaAssicurazione: string | null;
  costoAssicurazione?: number | null;
  scadenzaRevisione: string | null;
  costoRevisione?: number | null;
  scadenzaBollo?: string | null;
  costoBollo?: number | null;
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
  societaNoleggio?: string | null;
  nContratto?: string | null;
  inizioNoleggio?: string | null;
  fineNoleggio?: string | null;
  maggiorazioneRicarica?: number | null;
  autista?: string | null;
  utilizzatore?: string | null;
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
  sommaRate: number;
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
  kmAttualiAl?: string | null;
  kmLimite?: number;
  scadenzaAssicurazione?: string | null;
  costoAssicurazione?: number | null;
  scadenzaRevisione?: string | null;
  costoRevisione?: number | null;
  scadenzaBollo?: string | null;
  costoBollo?: number | null;
  scadenzaTachigrafo?: string | null;
  annoImmatricolazione?: string;
  colore?: string;
  portata?: number;
  volume?: number;
  tipoCassone?: string;
  targaRimorchio?: string;
  telaio?: string;
  note?: string;
  tipoPossesso?: TipoPossessoMezzo;
  proprietario?: string;
  nContratto?: string;
  inizioNoleggio?: string | null;
  fineNoleggio?: string | null;
  maggiorazioneRicarica?: number;
  utilizzatore?: string;
}

export interface AssegnazioneMezzoPayload {
  padroncinoId: string;
  dataInizio: string;
  dataFine?: string;
}

// ─── MEZZI API ────────────────────────────────────────
export interface GeneraContrattoPdaPayload {
  padroncinoId: string;
  nomeRapp?: string;
  cognomeRapp?: string;
  cfRapp?: string;
  qualificaRapp?: string;
  dataFirma?: string;
  rataNoleggio?: number;
  kmInclusi?: number;
  eccedenzaKm?: number;
  // usati solo lato frontend per costruire il nome file
  _targa?: string;
  _ragioneSociale?: string;
}

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
  duplica: (id: string) => api.post<Mezzo>(`/mezzi/${id}/duplica`, {}),
  scadenze: (giorni?: number) => api.get<Mezzo[]>(`/mezzi/scadenze?giorni=${giorni || 30}`),
  assegna: (mezzoId: string, data: AssegnazioneMezzoPayload) =>
    api.post(`/mezzi/${mezzoId}/assegnazioni`, data),
  chiudiAssegnazione: (assegnazioneId: string, dataFine?: string) =>
    api.put(`/mezzi/assegnazioni/${assegnazioneId}/chiudi`, dataFine ? { dataFine } : {}),
  deleteAssegnazione: (assegnazioneId: string) =>
    api.delete(`/mezzi/assegnazioni/${assegnazioneId}`),
  importaExcel: (file: File): Promise<{ creati: number; saltati: number; errori: string[] }> => {
    const formData = new FormData();
    formData.append('file', file);
    const token = getAuthToken();
    return fetch(`${API_BASE}/mezzi/importa-excel`, {
      method: 'POST',
      body: formData,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(async (res) => {
        if (res.status === 401) { localStorage.removeItem('token'); localStorage.removeItem('auth-storage'); window.location.href = '/login'; throw new Error('Sessione scaduta'); }
        if (!res.ok) {
          const err = await res.json().catch(() => ({ message: res.statusText }));
          throw new Error(err.message || 'Errore importazione');
        }
        return res.json();
      });
  },
  generaContrattoPda: async (mezzoId: string, payload: GeneraContrattoPdaPayload): Promise<void> => {
    // Estrai i campi frontend-only prima di inviare al backend
    const { _targa, _ragioneSociale, ...backendPayload } = payload;
    const token = getAuthToken();

    const res = await fetch(`${API_BASE}/mezzi/${mezzoId}/contratto-pda`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(backendPayload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(err.message || 'Errore generazione contratto');
    }
    const blob = await res.blob();

    // Costruiamo il filename nel frontend (Content-Disposition non è esposto da CORS)
    const oggi = payload.dataFirma ? new Date(payload.dataFirma) : new Date();
    const dd   = String(oggi.getDate()).padStart(2, '0');
    const mm   = String(oggi.getMonth() + 1).padStart(2, '0');
    const yyyy = oggi.getFullYear();
    const targa = (_targa || mezzoId).toUpperCase();
    const pda   = (_ragioneSociale || '')
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, '')
      .trim()
      .substring(0, 30)
      .trim();
    const filename = `CONTRATTO DI NOLEGGIO - ${targa} - ${pda} - DEL ${dd}-${mm}-${yyyy}.docx`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
  chiudiAssegnazione: (assegnazioneId: string, dataFine?: string) =>
    api.put(`/palmari/assegnazioni/${assegnazioneId}/chiudi`, dataFine ? { dataFine } : {}),
  importaExcel: (file: File): Promise<{ creati: number; saltati: number; errori: string[] }> => {
    const formData = new FormData();
    formData.append('file', file);
    const token = getAuthToken();
    return fetch(`${API_BASE}/palmari/importa-excel`, {
      method: 'POST',
      body: formData,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(async (res) => {
        if (res.status === 401) { localStorage.removeItem('token'); localStorage.removeItem('auth-storage'); window.location.href = '/login'; throw new Error('Sessione scaduta'); }
        if (!res.ok) {
          const err = await res.json().catch(() => ({ message: res.statusText }));
          throw new Error(err.message || 'Errore importazione');
        }
        return res.json();
      });
  },
};

// ─── PADRONCINI TYPES ─────────────────────────────────
export interface PadroncinoMezzo {
  id: string;
  mezzoId: string;
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
  palmareId: string;
  codice: string;
  tariffa: number;
  dataInizio: string;
  dataFine?: string | null;
}

export interface PadroncinoCodiceAutista {
  id: string;
  codiceId: string;
  codice: string;
  nome: string | null;
  cognome: string | null;
  tariffaFissa: number | null;
  tariffaRitiro: number | null;
  target: number | null;
  bonus: number | null;
  malus: number | null;
  note: string | null;
  zone: string | null;
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
  dvrEsente: boolean;
  note: string | null;
  rappresentanteNome: string | null;
  rappresentanteCognome: string | null;
  cfRappresentante: string | null;
  qualificaRappresentante: string | null;
  mezziAssegnati: PadroncinoMezzo[];
  palmariAssegnati: PadroncinoPalmare[];
  codiciAutista: PadroncinoCodiceAutista[];
  conteggiCount: number;
  fatturatoMese?: number;
  bonifico?: number;
  fatturatoTotale?: number;
  addebitiTotali?: number;
  daBonificare?: number;
  mediaMensile?: number;
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
  attivo?: boolean;
  dvrEsente?: boolean;
  rappresentanteNome?: string;
  rappresentanteCognome?: string;
  cfRappresentante?: string;
  qualificaRappresentante?: string;
}

export interface GeneraContrattoPalmarePayload {
  nomeRapp?: string;
  cognomeRapp?: string;
  cfRapp?: string;
  qualificaRapp?: string;
  dataFirma?: string;
  palmareIds?: string[];
  // usato solo lato frontend per costruire il nome file
  _ragioneSociale?: string;
}

export interface GeneraContrattoCodiciPayload {
  dataContratto?: string;
  codiceAutistaIds?: string[];
  // usato solo lato frontend per costruire il nome file
  _ragioneSociale?: string;
}

export interface GeneraContrattoMezziPayload {
  nomeRapp?: string;
  cognomeRapp?: string;
  cfRapp?: string;
  qualificaRapp?: string;
  dataFirma?: string;
  mezzoIds?: string[];
  eccedenzaKm?: number;
  // usato solo lato frontend per costruire il nome file
  _ragioneSociale?: string;
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
  andamento: (id: string, dal?: string, al?: string) => {
    const qs = new URLSearchParams();
    if (dal) qs.append('dal', dal);
    if (al) qs.append('al', al);
    const q = qs.toString();
    return api.get<Array<{ mese: string; fatturato: number; addebiti: number; daBonificare: number }>>(
      `/padroncini/${id}/andamento${q ? '?' + q : ''}`,
    );
  },
  storicoConteggi: (id: string) =>
    api.get<Array<{
      id: string;
      mese: string;
      stato: 'BOZZA' | 'CHIUSO' | 'CONFERMATO';
      fatturato: number;
      fatturatoLordo: number;
      addebiti: number;
      compensazioni: number;
      netto: number;
      nSpedizioni: number | null;
    }>>(`/padroncini/${id}/storico-conteggi`),
  importaExcel: (file: File): Promise<{ creati: number; saltati: number; errori: string[] }> => {
    const formData = new FormData();
    formData.append('file', file);
    const token = getAuthToken();
    return fetch(`${API_BASE}/padroncini/importa-excel`, {
      method: 'POST',
      body: formData,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(async (res) => {
        if (res.status === 401) { localStorage.removeItem('token'); localStorage.removeItem('auth-storage'); window.location.href = '/login'; throw new Error('Sessione scaduta'); }
        if (!res.ok) {
          const err = await res.json().catch(() => ({ message: res.statusText }));
          throw new Error(err.message || 'Errore importazione');
        }
        return res.json();
      });
  },
  generaContrattoPalmari: async (padroncinoId: string, payload: GeneraContrattoPalmarePayload): Promise<void> => {
    const { _ragioneSociale, ...backendPayload } = payload;
    const token = getAuthToken();

    const res = await fetch(`${API_BASE}/padroncini/${padroncinoId}/contratto-palmari`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(backendPayload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(err.message || 'Errore generazione contratto');
    }
    const blob = await res.blob();

    const oggi = payload.dataFirma ? new Date(payload.dataFirma) : new Date();
    const dd   = String(oggi.getDate()).padStart(2, '0');
    const mm   = String(oggi.getMonth() + 1).padStart(2, '0');
    const yyyy = oggi.getFullYear();
    const pda  = (_ragioneSociale || '')
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, '')
      .trim()
      .substring(0, 30)
      .trim();
    const filename = `CONTRATTO NOLEGGIO PALMARE - ${pda} - DEL ${dd}-${mm}-${yyyy}.docx`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
  generaContrattoCodici: async (padroncinoId: string, payload: GeneraContrattoCodiciPayload): Promise<void> => {
    const { _ragioneSociale, ...backendPayload } = payload;
    const token = getAuthToken();

    const res = await fetch(`${API_BASE}/padroncini/${padroncinoId}/contratto-codici`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(backendPayload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(err.message || 'Errore generazione contratto');
    }
    const blob = await res.blob();

    const oggi = payload.dataContratto ? new Date(payload.dataContratto) : new Date();
    const dd   = String(oggi.getDate()).padStart(2, '0');
    const mm   = String(oggi.getMonth() + 1).padStart(2, '0');
    const yyyy = oggi.getFullYear();
    const pda  = (_ragioneSociale || '')
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, '')
      .trim()
      .substring(0, 30)
      .trim();
    const filename = `CONTRATTO APPALTO CODICI - ${pda} - DEL ${dd}-${mm}-${yyyy}.docx`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
  generaContrattoMezzi: async (padroncinoId: string, payload: GeneraContrattoMezziPayload): Promise<void> => {
    const { _ragioneSociale, ...backendPayload } = payload;
    const token = getAuthToken();

    const res = await fetch(`${API_BASE}/padroncini/${padroncinoId}/contratto-mezzi`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(backendPayload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(err.message || 'Errore generazione contratto');
    }
    const blob = await res.blob();

    const oggi = payload.dataFirma ? new Date(payload.dataFirma) : new Date();
    const dd   = String(oggi.getDate()).padStart(2, '0');
    const mm   = String(oggi.getMonth() + 1).padStart(2, '0');
    const yyyy = oggi.getFullYear();
    const pda  = (_ragioneSociale || '')
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, '')
      .trim()
      .substring(0, 30)
      .trim();
    const filename = `CONTRATTO DI NOLEGGIO MEZZI - ${pda} - DEL ${dd}-${mm}-${yyyy}.docx`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
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
  bonusMalus?: string | null;
  bonus?: number | null;
  malus?: number | null;
  zone?: string | null;
  zonaControllo?: string | null;
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
  bonusMalus?: string;
  bonus?: number;
  malus?: number;
  zone?: string;
  zonaControllo?: string | null;
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
  chiudiAssegnazione: (assegnazioneId: string, dataFine?: string) =>
    api.put(`/codici-autista/assegnazioni/${assegnazioneId}/chiudi`, dataFine ? { dataFine } : {}),
  importaExcel: (file: File): Promise<{ creati: number; saltati: number; errori: string[] }> => {
    const formData = new FormData();
    formData.append('file', file);
    const token = getAuthToken();
    return fetch(`${API_BASE}/codici-autista/importa-excel`, {
      method: 'POST',
      body: formData,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(async (res) => {
        if (res.status === 401) { localStorage.removeItem('token'); localStorage.removeItem('auth-storage'); window.location.href = '/login'; throw new Error('Sessione scaduta'); }
        if (!res.ok) {
          const err = await res.json().catch(() => ({ message: res.statusText }));
          throw new Error(err.message || 'Errore importazione');
        }
        return res.json();
      });
  },
};

// ─── DASHBOARD / CONTEGGI / AUDIT / RICARICHE / ACCONTI ─────────────
export interface ConteggiStats {
  mese: string;
  totali: number;
  bozza: number;
  chiuso: number;
  confermato: number;
  fatturato: number;
  addebiti: number;
  compensazioni: number; // ACCREDITO + BONUS + ACCONTO auto (escluso ACCONTO_FATTURA)
  bonifici: number;
  daBonificare: number;
}

export interface AndamentoMese {
  mese: string;
  fatturato: number;
  addebiti: number;
  bonifici: number;
  daBonificare: number;
}

export interface TopDaBonificare {
  padroncinoId: string;
  ragioneSociale: string;
  conteggioId: string;
  stato: 'BOZZA' | 'CHIUSO' | 'CONFERMATO';
  daBonificare: number;
}

export interface CompetenzeAttive {
  mese: string;
  valore: number | null;
}

export const conteggiApi = {
  stats: (mese?: string) =>
    api.get<ConteggiStats>(`/conteggi/stats${mese ? `?mese=${mese}` : ''}`),
  andamento: (mesi = 12) =>
    api.get<AndamentoMese[]>(`/conteggi/andamento?mesi=${mesi}`),
  topDaBonificare: (mese?: string, limit = 5) => {
    const qs = new URLSearchParams();
    if (mese) qs.append('mese', mese);
    qs.append('limit', String(limit));
    return api.get<TopDaBonificare[]>(`/conteggi/top-da-bonificare?${qs.toString()}`);
  },
  generaBulk: (mese: string) =>
    api.post<unknown>(`/conteggi/bulk`, { mese }),
  getCompetenzeAttive: (mese: string) =>
    api.get<CompetenzeAttive>(`/conteggi/competenze-attive/${mese}`),
  setCompetenzeAttive: (mese: string, valore: number | null) =>
    api.put<CompetenzeAttive>(`/conteggi/competenze-attive/${mese}`, { valore }),
};

export interface AuditLogEntry {
  id: string;
  entityType: string;
  entityId: string;
  azione: string;
  dataPrima: any;
  dataDopo: any;
  createdAt: string;
  user: { nome: string | null; cognome: string | null; email: string } | null;
}

export const auditApi = {
  list: (params?: { entityType?: string; entityId?: string; azione?: string; limit?: number; page?: number }) => {
    const qs = new URLSearchParams();
    if (params?.entityType) qs.append('entityType', params.entityType);
    if (params?.entityId) qs.append('entityId', params.entityId);
    if (params?.azione) qs.append('azione', params.azione);
    if (params?.limit) qs.append('limit', String(params.limit));
    if (params?.page) qs.append('page', String(params.page));
    const q = qs.toString();
    return api.get<{ data: AuditLogEntry[]; total: number; page: number; limit: number; totalPages: number }>(
      `/audit${q ? '?' + q : ''}`,
    );
  },
};

export const ricaricheApi = {
  riepilogo: (mese: string) =>
    api.get<Array<{ padroncinoId: string; ragioneSociale: string; totale: number; numero: number }>>(
      `/ricariche/riepilogo-padroncini?mese=${mese}`,
    ),
};

export const accontiApi = {
  list: (mese?: string) =>
    api.get<Array<{ id: string; importo: number; mese: string; data: string }>>(
      `/acconti${mese ? `?mese=${mese}` : ''}`,
    ),
};

// ─── DOCUMENTI ──────────────────────────────────
export interface Documento {
  id: string;
  entityType: string;
  entityId: string;
  nome: string;
  tipo?: string | null;
  filePath: string;
  mimeType?: string | null;
  dimensione?: number | null;
  scadenza?: string | null;
  note?: string | null;
  createdAt: string;
}

export const documentiApi = {
  list: (entityType: string, entityId: string) =>
    api.get<Documento[]>(`/documenti?entityType=${entityType}&entityId=${entityId}`),

  upload: async (
    entityType: string,
    entityId: string,
    nome: string,
    file: File,
    opts?: { tipo?: string; scadenza?: string; note?: string },
  ): Promise<Documento> => {
    const token = getAuthToken();
    const fd = new FormData();
    fd.append('file', file);
    fd.append('entityType', entityType);
    fd.append('entityId', entityId);
    fd.append('nome', nome);
    if (opts?.tipo) fd.append('tipo', opts.tipo);
    if (opts?.scadenza) fd.append('scadenza', opts.scadenza);
    if (opts?.note) fd.append('note', opts.note);
    const res = await fetch(`${API_BASE}/documenti/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || 'Upload fallito'); }
    return res.json();
  },

  download: (id: string) => {
    const token = getAuthToken();
    fetch(`${API_BASE}/documenti/${id}/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).then(async (r) => {
      if (r.status === 401) { localStorage.removeItem('token'); localStorage.removeItem('auth-storage'); window.location.href = '/login'; return; }
      if (!r.ok) { alert(`Errore download documento: ${r.statusText}`); return; }
      const blob = await r.blob();
      const cd = r.headers.get('content-disposition') || '';
      const name = cd.match(/filename="?([^"]+)"?/)?.[1] ?? 'documento';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = name; a.click();
      URL.revokeObjectURL(url);
    }).catch(() => alert('Errore download: controlla la connessione'));
  },

  update: (id: string, data: { nome?: string; tipo?: string; scadenza?: string; note?: string }) =>
    api.patch<Documento>(`/documenti/${id}`, data),

  remove: (id: string) => api.delete<{ ok: boolean }>(`/documenti/${id}`),
};

// ─── MANUTENZIONI ───────────────────────────────
export interface Manutenzione {
  id: string;
  mezzoId: string;
  dataInizio: string;
  dataFine?: string | null;
  descrizione: string;
  costo?: number | null;
  fatturaPath?: string | null;
  fatturaNome?: string | null;
  fornitore?: string | null;
  note?: string | null;
  createdAt: string;
}

const manutenzioniUpload = async (
  url: string,
  method: 'POST' | 'PATCH',
  data: Record<string, string | number | undefined>,
  file?: File,
): Promise<Manutenzione> => {
  const token = getAuthToken();
  const fd = new FormData();
  Object.entries(data).forEach(([k, v]) => { if (v !== undefined) fd.append(k, String(v)); });
  if (file) fd.append('fattura', file);
  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || 'Errore'); }
  return res.json();
};

export const manutenzioniApi = {
  list: (mezzoId: string) =>
    api.get<Manutenzione[]>(`/manutenzioni?mezzoId=${mezzoId}`),

  create: (data: {
    mezzoId: string; dataInizio: string; dataFine?: string;
    descrizione: string; costo?: number; note?: string;
  }, file?: File) => manutenzioniUpload('/manutenzioni', 'POST', data as any, file),

  update: (id: string, data: Partial<{
    dataInizio: string; dataFine: string; descrizione: string; costo: number; note: string;
  }>, file?: File) => manutenzioniUpload(`/manutenzioni/${id}`, 'PATCH', data as any, file),

  remove: (id: string) => api.delete<{ ok: boolean }>(`/manutenzioni/${id}`),

  downloadFattura: (id: string, nome: string) => {
    const token = getAuthToken();
    fetch(`${API_BASE}/manutenzioni/${id}/fattura`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).then(async (r) => {
      if (r.status === 401) { localStorage.removeItem('token'); localStorage.removeItem('auth-storage'); window.location.href = '/login'; return; }
      if (!r.ok) { alert(`Errore download fattura: ${r.statusText}`); return; }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = nome; a.click();
      URL.revokeObjectURL(url);
    }).catch(() => alert('Errore download fattura: controlla la connessione'));
  },
};

// ─── NOTE (polimorfiche) ─────────────────────────────
export interface Nota {
  id: string;
  entityType: string;
  entityId: string;
  contenuto: string;
  userId: string | null;
  createdAt: string;
  user: { id: string; nome: string; cognome: string } | null;
}

export const noteApi = {
  list: (entityType: string, entityId?: string, limit = 20) => {
    const params = new URLSearchParams({ entityType, limit: String(limit) });
    if (entityId) params.set('entityId', entityId);
    return api.get<Nota[]>(`/note?${params.toString()}`);
  },
  create: (data: { entityType: string; entityId: string; contenuto: string }) =>
    api.post<Nota>('/note', data),
  remove: (id: string) => api.delete<{ ok: boolean }>(`/note/${id}`),
};

// ─── TASK (cose da fare, polimorfiche) ───────────────
export interface TaskItem {
  id: string;
  entityType: string;
  entityId: string;
  testo: string;
  targa: string | null;
  codiceAutista: string | null;
  palmare: string | null;
  padroncino: string | null;
  completata: boolean;
  userId: string | null;
  createdAt: string;
  completedAt: string | null;
  user: { id: string; nome: string; cognome: string } | null;
}

export interface TaskUpdatePayload {
  testo?: string;
  targa?: string;
  codiceAutista?: string;
  palmare?: string;
  padroncino?: string;
  completata?: boolean;
}

export const taskApi = {
  list: (entityType: string, entityId?: string) => {
    const params = new URLSearchParams({ entityType });
    if (entityId) params.set('entityId', entityId);
    return api.get<TaskItem[]>(`/task?${params.toString()}`);
  },
  create: (data: { entityType: string; entityId: string; testo: string; targa?: string; codiceAutista?: string; palmare?: string; padroncino?: string }) =>
    api.post<TaskItem>('/task', data),
  update: (id: string, data: TaskUpdatePayload) =>
    api.patch<TaskItem>(`/task/${id}`, data),
  toggle: (id: string, completata: boolean) =>
    api.patch<TaskItem>(`/task/${id}`, { completata }),
  remove: (id: string) => api.delete<{ ok: boolean }>(`/task/${id}`),
};

// ─── CARTE ENI ────────────────────────────────────────
export interface CartaEni {
  id: string;
  numeroCarta: string;
  utilizzatore: string | null;
  padroncinoId: string | null;
  padroncino: { id: string; ragioneSociale: string } | null;
  targaAbituale: string | null;
  attiva: boolean;
  note: string | null;
  _count?: { transazioni: number };
}

export interface CreateCartaEniPayload {
  numeroCarta: string;
  utilizzatore?: string;
  padroncinoId?: string;
  targaAbituale?: string;
  attiva?: boolean;
  note?: string;
}

export interface TransazioneCartaEni {
  id: string;
  numeroCarta: string;
  utilizzatore: string | null;
  padroncino: string | null;
  data: string;
  tipoTransazione: string | null;
  statoAutorizzativo: string;
  codiceImpianto: string | null;
  localita: string | null;
  agevolata: boolean;
  targa: string | null;
  prodotto: string | null;
  quantita: number;
  prezzoImportato: number | null;
  prezzoUnitario: number | null;
  importoImportato: number | null;
  importo: number;
  codiceAutista: string | null;
  numeroAutorizzazione: string | null;
}

export interface StazioneEni {
  id: string;
  codiceImpianto: string;
  localita: string | null;
  agevolata: boolean;
  note: string | null;
}

export interface MeseCarteEniEntry { mese: string; count: number; totale: number; litri: number }
export type CategoriaProdottoEni = 'DIESEL' | 'HVO' | 'BENZINA' | 'ALTRO';
export interface PrezzoGiornoEni { data: string; prodotto: CategoriaProdottoEni; prezzoUnitario: number }

export interface ImportaCarteEniResult {
  mese: string;
  importate: number;
  carteNuove: number;
  stazioniNuove: number;
  fuoriMese: number;
  esclusiStatoOTipo: number;
  righeSenzaData: number;
}

export const carteEniApi = {
  listMesi: () => api.get<MeseCarteEniEntry[]>('/carte-eni/mesi'),
  findByMese: (mese: string) => api.get<{ mese: string; transazioni: TransazioneCartaEni[] }>(`/carte-eni?mese=${mese}`),
  eliminaMese: (mese: string) => api.delete(`/carte-eni/${mese}`),

  listCarte: () => api.get<CartaEni[]>('/carte-eni/carte'),
  createCarta: (data: CreateCartaEniPayload) => api.post<CartaEni>('/carte-eni/carte', data),
  updateCarta: (id: string, data: Partial<CreateCartaEniPayload>) => api.put<CartaEni>(`/carte-eni/carte/${id}`, data),
  deleteCarta: (id: string) => api.delete(`/carte-eni/carte/${id}`),

  listStazioni: () => api.get<StazioneEni[]>('/carte-eni/stazioni'),
  createStazione: (data: Pick<StazioneEni, 'codiceImpianto'> & Partial<Pick<StazioneEni, 'localita' | 'agevolata' | 'note'>>) =>
    api.post<StazioneEni>('/carte-eni/stazioni', data),
  updateStazione: (id: string, data: Partial<Pick<StazioneEni, 'localita' | 'agevolata' | 'note'>>) =>
    api.put<StazioneEni>(`/carte-eni/stazioni/${id}`, data),

  listPrezziGiorno: (mese: string) => api.get<PrezzoGiornoEni[]>(`/carte-eni/prezzi?mese=${mese}`),
  aggiornaPrezzoGiorno: (data: string, prodotto: CategoriaProdottoEni, prezzoUnitario: number) =>
    api.put(`/carte-eni/prezzi/${data}/${prodotto}`, { prezzoUnitario }),

  importa: (file: File, mese: string): Promise<ImportaCarteEniResult> => {
    const formData = new FormData();
    formData.append('file', file);
    const token = getAuthToken();
    return fetch(`${API_BASE}/carte-eni/importa?mese=${mese}`, {
      method: 'POST',
      body: formData,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).then(async (res) => {
      if (res.status === 401) { localStorage.removeItem('token'); localStorage.removeItem('auth-storage'); window.location.href = '/login'; throw new Error('Sessione scaduta'); }
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(err.message || 'Errore importazione');
      }
      return res.json();
    });
  },

  importaPrezzi: (file: File): Promise<{ giorniImportati: number; transazioniAggiornate: number }> => {
    const formData = new FormData();
    formData.append('file', file);
    const token = getAuthToken();
    return fetch(`${API_BASE}/carte-eni/prezzi/importa`, {
      method: 'POST',
      body: formData,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).then(async (res) => {
      if (res.status === 401) { localStorage.removeItem('token'); localStorage.removeItem('auth-storage'); window.location.href = '/login'; throw new Error('Sessione scaduta'); }
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(err.message || 'Errore importazione prezzi');
      }
      return res.json();
    });
  },
};
