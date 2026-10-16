# Changelog

Tutte le modifiche rilevanti al gestionale corriere sono documentate in questo file.

## 2026-08-18

### Aggiunto

- **Impostazioni → Gestione DB**: nuova sezione "🆘 Ripristino Emergenza". Le eliminazioni nel gestionale sono quasi tutte soft-delete (il record resta nel database, solo nascosto dalle liste); questo pannello permette a un admin di cercare gli elementi eliminati di recente (Mezzi, Padroncini, Palmari, Codici Autista, Acconti, Conteggi Mensili) e ripristinarli con un click, senza dover intervenire manualmente sul database. Introdotto dopo l'eliminazione accidentale di un mezzo dalla Flotta.
- **Audit Log**: nuova azione `RESTORE`, loggata quando un record viene ripristinato dal pannello di emergenza (visibile in Log Storico con badge dedicato).

### File modificati

- `backend/src/audit/audit.service.ts`
- `backend/src/db-admin/db-admin.controller.ts`, `db-admin.service.ts`
- `frontend/src/features/impostazioni/GestioneDb.tsx`, `Impostazioni.css`
- `frontend/src/features/log/LogStorico.css`
- `frontend/src/lib/auditFormat.ts`

## 2026-08-03

### Aggiunto

- **Analisi Spedizioni**: aggiunto il pulsante "🗑️ Elimina analisi" nella vista di dettaglio del mese, con conferma prima dell'eliminazione. Prima non esisteva un modo per rimuovere un'analisi caricata per errore su un mese sbagliato.
- **Conteggi → Addebiti da Inserire**: nel riquadro "Addebiti Noleggio Palmari" viene ora mostrato anche il totale **senza IVA** (il valore da inserire in fattura), accanto al totale con IVA già presente.

### Corretto

- **Conteggi → Addebiti Noleggi Mezzi** — bug grave: un mezzo con assegnazione chiusa continuava a comparire nei conteggi dei mesi successivi alla chiusura, anche dopo essere stato eliminato manualmente dalla riga e salvato (ricompariva riaprendo la pagina). Corretto con due interventi:
  - i mezzi vengono ora mostrati in un conteggio solo se la loro assegnazione risultava attiva in almeno un giorno di quel mese;
  - l'eliminazione manuale di una riga viene ora persistita in modo permanente (non viene più rigenerata automaticamente al ricaricamento).
- **Conteggi → Addebiti Palmari** — stesso tipo di bug dei mezzi: conteggio storico non filtrato per mese ed eliminazione non persistente. Applicata la stessa correzione.
- **Conteggi → Addebiti Palmari** — bug di **sovra-fatturazione**: nei conteggi creati tramite "Genera conteggi mese" (creazione bulk), un padroncino con 2 o più palmari assegnati vedeva l'importo palmari moltiplicato per il numero di dispositivi invece che sommato correttamente (es. con 2 palmari l'addebito veniva raddoppiato). **Consigliato ricontrollare i conteggi già confermati** di padroncini con 2+ palmari generati con questa modalità.
- **Flotta Mezzi / Dashboard**: i mezzi con stato "Dismesso" o "Venduto" continuavano a comparire tra le scadenze imminenti (assicurazione, revisione, bollo, fine noleggio) sia nel KPI e nella tabella scadenze della Dashboard, sia nel pannello "Prossime scadenze" di Flotta Mezzi — anche se ormai fuori flotta. Ora vengono esclusi in entrambi i punti.

### File modificati

- `backend/src/conta-doppi/conta-doppi.controller.ts`, `conta-doppi.service.ts`
- `backend/src/mezzi/mezzi.service.ts`
- `frontend/src/features/analisi-spedizioni/AnalisiSpedizioni.tsx`, `.css`
- `frontend/src/features/conteggi/DettaglioConteggio.tsx`, `.css`
- `frontend/src/features/mezzi/FlottaMezzi.tsx`
