// Elenco "Cose da fare" usato da più pagine. Le azioni restano quelle della pagina.
import type { TaskItem } from '../../lib/api';
import { Icon, Empty } from './index';

interface Props {
  tasks: TaskItem[];
  onToggle: (t: TaskItem) => void;
  onEdit: (t: TaskItem) => void;
  onRemove: (id: string) => void;
  empty?: string;
}

const fmtGiorno = (iso: string) => new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });

export default function TaskList({ tasks, onToggle, onEdit, onRemove, empty = 'Nessuna attività registrata' }: Props) {
  if (tasks.length === 0) return <Empty>{empty}</Empty>;
  return (
    <div className="ds-list">
      {tasks.map(t => (
        <div key={t.id} className="ds-listrow ds-task" onClick={() => onEdit(t)}>
          <input
            type="checkbox"
            aria-label={t.completata ? 'Segna come da fare' : 'Segna come fatta'}
            checked={t.completata}
            onClick={e => e.stopPropagation()}
            onChange={() => onToggle(t)}
          />
          <div className="ds-task-body">
            <span className={t.completata ? 'ds-task-done' : undefined}>{t.testo}</span>
            <span className="ds-task-meta">
              {t.targa && <span className="ds-chip ds-mono">{t.targa}</span>}
              {t.codiceAutista && <span className="ds-chip ds-mono">{t.codiceAutista}</span>}
              {t.palmare && <span className="ds-chip ds-mono">{t.palmare}</span>}
              {t.padroncino && <span className="ds-chip">{t.padroncino}</span>}
              <span>{fmtGiorno(t.createdAt)}{t.user ? ` · ${t.user.nome}` : ''}</span>
            </span>
          </div>
          <button type="button" className="ds-iconbtn ds-iconbtn-danger" aria-label="Elimina attività" title="Elimina"
            onClick={e => { e.stopPropagation(); onRemove(t.id); }}>
            <Icon name="trash" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
