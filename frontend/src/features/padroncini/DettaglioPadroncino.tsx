// src/features/padroncini/DettaglioPadroncino.tsx
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { padronciniApi } from '../../lib/api';
import type { Padroncino } from '../../lib/api';
import { PadroncinoDetail } from './Padroncini';
import './Padroncini.css';

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

  if (loading) return (
    <div className="pd-page">
      <div className="pd-loading"><div className="pd-spinner" /><span>Caricamento padroncino...</span></div>
    </div>
  );
  if (error || !p) return (
    <div className="pd-page">
      <div className="pd-error">⚠️ {error || 'Padroncino non trovato'} <button className="btn-primary btn-sm" onClick={() => navigate('/padroncini')}>← Torna alla lista</button></div>
    </div>
  );

  return (
    <div className="pd-page">
      <PadroncinoDetail
        p={p}
        onRefresh={load}
        onBack={() => navigate('/padroncini')}
      />
    </div>
  );
}
