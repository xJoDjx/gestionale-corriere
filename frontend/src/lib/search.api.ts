import { api } from './api';

export type SearchEntityType =
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

export interface SearchHit {
  entityType: SearchEntityType;
  entityId: string;
  parentId?: string;
  title: string;
  field: string;
  snippet: string;
  href: string;
  meta?: Record<string, string | number | boolean | null>;
}

export interface SearchResponse {
  query: string;
  total: number;
  groups: Record<string, { label: string; icon: string; hits: SearchHit[] }>;
}

export const searchApi = {
  search: (q: string, limit = 200) =>
    api.get<SearchResponse>(`/search?q=${encodeURIComponent(q)}&limit=${limit}`),
};
