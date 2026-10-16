import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

// Prima mostra gli utenti esistenti
const users = await p.user.findMany({ select: { email: true, nome: true, cognome: true, ruolo: true } });
console.log('Utenti nel DB:', users);

// Poi resetta la password dell'admin
const hash = await bcrypt.hash('admin123', 12);
const updated = await p.user.update({
  where: { email: 'Admin' },
  data: { password: hash },
});
console.log('Password resettata a "admin123" per:', updated.email);

await p.$disconnect();
