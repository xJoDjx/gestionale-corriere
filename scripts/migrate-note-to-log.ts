import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrate() {
  let totale = 0;

  // MEZZI
  const mezzi = await (prisma as any).mezzo.findMany({
    where: { note: { not: null }, deletedAt: null },
    select: { id: true, targa: true, note: true },
  });
  console.log('Mezzi con note: ' + mezzi.length);
  for (const m of mezzi) {
    const exists = await (prisma as any).nota.findFirst({ where: { entityType: 'mezzo', entityId: m.id } });
    if (!exists) {
      await (prisma as any).nota.create({ data: { entityType: 'mezzo', entityId: m.id, contenuto: '[Nota originale] ' + m.note } });
      console.log('  ok Mezzo ' + m.targa);
      totale++;
    } else {
      console.log('  skip Mezzo ' + m.targa + ' (ha gia note)');
    }
  }

  // PALMARI
  const palmari = await (prisma as any).palmare.findMany({
    where: { note: { not: null }, deletedAt: null },
    select: { id: true, codice: true, note: true },
  });
  console.log('Palmari con note: ' + palmari.length);
  for (const p of palmari) {
    const exists = await (prisma as any).nota.findFirst({ where: { entityType: 'palmare', entityId: p.id } });
    if (!exists) {
      await (prisma as any).nota.create({ data: { entityType: 'palmare', entityId: p.id, contenuto: '[Nota originale] ' + p.note } });
      console.log('  ok Palmare ' + p.codice);
      totale++;
    } else {
      console.log('  skip Palmare ' + p.codice + ' (ha gia note)');
    }
  }

  // CODICI AUTISTA
  const autisti = await (prisma as any).codiceAutista.findMany({
    where: { note: { not: null }, deletedAt: null },
    select: { id: true, codice: true, note: true },
  });
  console.log('Codici autista con note: ' + autisti.length);
  for (const a of autisti) {
    const exists = await (prisma as any).nota.findFirst({ where: { entityType: 'codice_autista', entityId: a.id } });
    if (!exists) {
      await (prisma as any).nota.create({ data: { entityType: 'codice_autista', entityId: a.id, contenuto: '[Nota originale] ' + a.note } });
      console.log('  ok Autista ' + a.codice);
      totale++;
    } else {
      console.log('  skip Autista ' + a.codice + ' (ha gia note)');
    }
  }

  console.log('\nMigrazione completata: ' + totale + ' note migrate.');
}

migrate()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
