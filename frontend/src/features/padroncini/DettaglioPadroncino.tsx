// src/features/padroncini/DettaglioPadroncino.tsx
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { padronciniApi } from '../../lib/api';
import type { Padroncino } from '../../lib/api';
import { PadroncinoDetail } from './Padroncini';
import './Padroncini.css';
import { Page, Card, Empty, Alert, Button } from '../../components/ds';

export default function DettaglioPadroncino() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [p, setP] = useState<Padroncino | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const data = await padronciniApi.detail(id);
      setP(data);
    } catch (e: any) {
      setError(e.message || 'Errore caricamento');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Page><Card pad><Empty>Caricamento padroncino…</Empty></Card></Page>;
  if (error || !p) return (
    <Page>
      <Alert tone="ko" title={error || 'Padroncino non trovato'} actions={<Button size="sm" onClick={() => navigate('/padroncini')}>Torna alla lista</Button>} />
    </Page>
  );

  return (
    <PadroncinoDetail
      p={p}
      onRefresh={load}
      onBack={() => navigate('/padroncini')}
    />
  );
}
