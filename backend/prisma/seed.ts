import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database: Creazione utente Admin...');

  // ─── ADMIN USER ──────────────────────────────────
  // Hash della password: cambiala se preferisci qualcosa di diverso da 'admin123'
  const adminPassword = await bcrypt.hash('admin123', 12);
  
  const admin = await prisma.user.upsert({
    where: { email: 'admin@gestionale.it' },
    update: {},
    create: {
      email: 'admin@gestionale.it',
      password: adminPassword,
      nome: 'Amministratore',
      cognome: 'Sistema',
      ruolo: 'ADMIN',
    },
  });

  console.log('  ✅ Admin creato correttamente:', admin.email);
  console.log('  🔑 Password provvisoria: admin123');
  console.log('\n🎉 Reset completato! Il database è ora vuoto (tranne l\'admin).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });