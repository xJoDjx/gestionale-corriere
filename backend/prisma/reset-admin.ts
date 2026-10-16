/**
 * Script one-shot per resettare la password dell'admin.
 * Uso: npx ts-node prisma/reset-admin.ts
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const NUOVA_PASSWORD = 'admin123';

async function main() {
  const hashed = await bcrypt.hash(NUOVA_PASSWORD, 12);

  const updated = await prisma.user.updateMany({
    where: { ruolo: 'ADMIN', deletedAt: null },
    data: { password: hashed, passwordPlain: NUOVA_PASSWORD },
  });

  console.log(`✅ Password resettata per ${updated.count} utente/i admin → "${NUOVA_PASSWORD}"`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
