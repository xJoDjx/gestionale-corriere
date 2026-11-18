// Reimposta la password di un utente nel database indicato in backend/.env
// Uso: node tools/reimposta-accesso.js <email-o-nome-utente> <nuova-password>
// Cambia solo la password: nessun altro dato viene toccato.
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

async function main() {
  const [chi, nuova] = process.argv.slice(2);
  if (!chi || !nuova) {
    console.log('Uso: node tools/reimposta-accesso.js <email-o-nome-utente> <nuova-password>');
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    const utenti = await prisma.user.findMany({ select: { id: true, email: true, nome: true, ruolo: true, attivo: true } });
    const trovato = utenti.find((u) => u.email.trim().toLowerCase() === chi.trim().toLowerCase());
    if (!trovato) {
      console.log(`Nessun utente con email "${chi}". Utenti presenti:`);
      utenti.forEach((u) => console.log(`  - "${u.email}" (${u.nome}, ${u.ruolo}${u.attivo ? '' : ', disattivato'})`));
      process.exit(1);
    }
    const hash = await bcrypt.hash(nuova, 12);
    const data = { password: hash };
    try { await prisma.user.update({ where: { id: trovato.id }, data: { ...data, passwordPlain: nuova } }); }
    catch { await prisma.user.update({ where: { id: trovato.id }, data }); }
    console.log(`Password aggiornata per "${trovato.email}" (${trovato.ruolo}).`);
    console.log(`Per entrare scrivi esattamente: ${JSON.stringify(trovato.email)}`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
