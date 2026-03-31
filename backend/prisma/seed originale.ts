import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ─── ADMIN USER ──────────────────────────────────
  const adminPassword = await bcrypt.hash('admin123', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@gestionale.it' },
    update: {},
    create: {
      email: 'admin@gestionale.it',
      password: adminPassword,
      nome: 'Amministratore',
      cognome: '',
      ruolo: 'ADMIN',
    },
  });
  console.log('  ✅ Admin:', admin.email);

  // ─── PADRONCINI ──────────────────────────────────
  const padroncini = await Promise.all([
    prisma.padroncino.create({
      data: {
        ragioneSociale: 'MEN LOGISTIC',
        partitaIva: '03456789012',
        email: 'info@menlogistic.it',
        telefono: '0984123456',
        scadenzaDurc: new Date('2026-06-15'),
        scadenzaDvr: new Date('2026-12-01'),
      },
    }),
    prisma.padroncino.create({
      data: {
        ragioneSociale: 'DI NARDO',
        partitaIva: '04567890123',
        email: 'info@dinardo.it',
        scadenzaDurc: new Date('2026-04-01'),
        scadenzaDvr: new Date('2026-10-15'),
      },
    }),
    prisma.padroncino.create({
      data: {
        ragioneSociale: 'EL SPEDIZIONI',
        partitaIva: '05678901234',
        email: 'info@elspedizioni.it',
        scadenzaDurc: new Date('2026-03-20'),
      },
    }),
    prisma.padroncino.create({
      data: {
        ragioneSociale: 'IB EXPRESS SRLS',
        partitaIva: '06789012345',
        email: 'info@ibexpress.it',
        scadenzaDurc: new Date('2026-08-10'),
      },
    }),
    prisma.padroncino.create({
      data: {
        ragioneSociale: 'QUICK EXPRESS SRLS',
        partitaIva: '07890123456',
        email: 'info@quickexpress.it',
        scadenzaDurc: new Date('2026-07-20'),
      },
    }),
  ]);
  console.log(`  ✅ ${padroncini.length} padroncini creati`);

  // ─── MEZZI ───────────────────────────────────────
  const mezziData = [
    { targa: 'GH627TF', marca: 'Ford', modello: 'TRANSIT', tipo: 'FURGONE' as const, alimentazione: 'GASOLIO' as const, stato: 'ASSEGNATO' as const, kmAttuali: 185449, kmLimite: 200000, scadenzaAssicurazione: new Date('2026-04-10'), scadenzaRevisione: new Date('2026-05-05') },
    { targa: 'GH628TF', marca: 'Ford', modello: 'TRANSIT', tipo: 'FURGONE' as const, alimentazione: 'GASOLIO' as const, stato: 'ASSEGNATO' as const, kmAttuali: 158048, kmLimite: 200000, scadenzaAssicurazione: new Date('2026-04-10'), scadenzaRevisione: new Date('2026-05-05') },
    { targa: 'GJ198RL', marca: 'Volkswagen', modello: 'CRAFTER', tipo: 'FURGONE' as const, alimentazione: 'GASOLIO' as const, stato: 'DISMESSO' as const, kmAttuali: 74853, kmLimite: 150000, scadenzaAssicurazione: new Date('2026-08-15'), scadenzaRevisione: new Date('2027-02-10') },
    { targa: 'GM098FB', marca: 'Ford', modello: 'E-TRANSIT', tipo: 'FURGONE' as const, alimentazione: 'ELETTRICO' as const, stato: 'ASSEGNATO' as const, rataNoleggio: 850, kmAttuali: 107271, kmLimite: 130000, scadenzaAssicurazione: new Date('2026-12-01'), scadenzaRevisione: new Date('2026-06-20') },
    { targa: 'GM099FB', marca: 'Ford', modello: 'E-TRANSIT', tipo: 'FURGONE' as const, alimentazione: 'ELETTRICO' as const, stato: 'ASSEGNATO' as const, rataNoleggio: 850, kmAttuali: 104209, kmLimite: 130000, scadenzaAssicurazione: new Date('2026-12-01'), scadenzaRevisione: new Date('2026-06-20') },
    { targa: 'GM100FB', marca: 'Ford', modello: 'E-TRANSIT', tipo: 'FURGONE' as const, alimentazione: 'ELETTRICO' as const, stato: 'ASSEGNATO' as const, rataNoleggio: 930, kmAttuali: 84714, kmLimite: 130000, scadenzaAssicurazione: new Date('2026-12-01'), scadenzaRevisione: new Date('2026-06-20') },
    { targa: 'GM709PN', marca: 'Ford', modello: 'E-TRANSIT', tipo: 'FURGONE' as const, alimentazione: 'ELETTRICO' as const, stato: 'ASSEGNATO' as const, rataNoleggio: 850, kmAttuali: 81891, kmLimite: 130000, scadenzaAssicurazione: new Date('2026-10-15'), scadenzaRevisione: new Date('2026-06-20') },
    { targa: 'GR184MD', marca: 'Ford', modello: 'TRANSIT', tipo: 'FURGONE' as const, alimentazione: 'GASOLIO_MHEV' as const, stato: 'ASSEGNATO' as const, rataNoleggio: 800, kmAttuali: 80313, kmLimite: 200000, scadenzaAssicurazione: new Date('2026-10-15'), scadenzaRevisione: new Date('2027-07-01') },
    { targa: 'GR496EZ', marca: 'Ford', modello: 'TRANSIT', tipo: 'FURGONE' as const, alimentazione: 'GASOLIO_MHEV' as const, stato: 'ASSEGNATO' as const, rataNoleggio: 150, kmAttuali: 66153, kmLimite: 200000, scadenzaAssicurazione: new Date('2026-10-15'), scadenzaRevisione: new Date('2027-07-01') },
    { targa: 'GR498EZ', marca: 'Ford', modello: 'TRANSIT', tipo: 'FURGONE' as const, alimentazione: 'GASOLIO_MHEV' as const, stato: 'ASSEGNATO' as const, rataNoleggio: 750, kmAttuali: 76419, kmLimite: 200000, scadenzaAssicurazione: new Date('2026-10-15'), scadenzaRevisione: new Date('2027-07-01') },
    { targa: 'GR500EZ', marca: 'Ford', modello: 'TRANSIT', tipo: 'FURGONE' as const, alimentazione: 'GASOLIO_MHEV' as const, stato: 'ASSEGNATO' as const, rataNoleggio: 750, kmAttuali: 32018, kmLimite: 200000, scadenzaAssicurazione: new Date('2026-10-15'), scadenzaRevisione: new Date('2027-08-01') },
    { targa: 'GR507EZ', marca: 'Ford', modello: 'TRANSIT', tipo: 'FURGONE' as const, alimentazione: 'GASOLIO_MHEV' as const, stato: 'ASSEGNATO' as const, rataNoleggio: 750, kmAttuali: 111814, kmLimite: 200000, scadenzaAssicurazione: new Date('2026-10-15'), scadenzaRevisione: new Date('2027-07-01') },
    { targa: 'GR628XD', marca: 'Ford', modello: 'E-TRANSIT', tipo: 'FURGONE' as const, alimentazione: 'ELETTRICO' as const, stato: 'ASSEGNATO' as const, rataNoleggio: 850, kmAttuali: 64813, kmLimite: 130000, scadenzaAssicurazione: new Date('2026-10-15'), scadenzaRevisione: new Date('2027-07-01') },
    { targa: 'GR637XD', marca: 'Ford', modello: 'E-TRANSIT', tipo: 'FURGONE' as const, alimentazione: 'ELETTRICO' as const, stato: 'ASSEGNATO' as const, rataNoleggio: 800, kmAttuali: 28520, kmLimite: 130000, scadenzaAssicurazione: new Date('2026-10-15'), scadenzaRevisione: new Date('2027-07-01') },
    { targa: 'GS610JM', marca: 'Cupra', modello: 'BORN', tipo: 'AUTO' as const, alimentazione: 'ELETTRICO' as const, categoria: 'AUTO_AZIENDALE' as const, stato: 'DISPONIBILE' as const, kmAttuali: 31786, scadenzaAssicurazione: new Date('2026-08-15'), scadenzaRevisione: new Date('2027-04-01') },
    { targa: 'GS690EP', marca: 'Cupra', modello: 'BORN', tipo: 'AUTO' as const, alimentazione: 'ELETTRICO' as const, categoria: 'AUTO_AZIENDALE' as const, stato: 'DISPONIBILE' as const, kmAttuali: 32543, scadenzaAssicurazione: new Date('2026-08-15'), scadenzaRevisione: new Date('2027-04-01') },
    { targa: 'GS691VF', marca: 'Man', modello: 'ETGE', tipo: 'AUTOCARRO' as const, alimentazione: 'ELETTRICO' as const, stato: 'ASSEGNATO' as const, rataNoleggio: 1032, kmAttuali: 5780, kmLimite: 80000, scadenzaAssicurazione: new Date('2026-08-15'), scadenzaRevisione: new Date('2027-10-01') },
  ];

  const mezzi = [];
  for (const m of mezziData) {
    const mezzo = await prisma.mezzo.create({ data: m as any });
    mezzi.push(mezzo);
  }
  console.log(`  ✅ ${mezzi.length} mezzi creati`);

  // ─── ASSEGNAZIONI MEZZI ──────────────────────────
  const assegnazioni = [
    { mezzoIdx: 0, padroncinoIdx: 0 }, // GH627TF -> MEN LOGISTIC
    { mezzoIdx: 1, padroncinoIdx: 0 }, // GH628TF -> MEN LOGISTIC
    { mezzoIdx: 3, padroncinoIdx: 0 }, // GM098FB -> MEN LOGISTIC
    { mezzoIdx: 4, padroncinoIdx: 1 }, // GM099FB -> DI NARDO
    { mezzoIdx: 5, padroncinoIdx: 0 }, // GM100FB -> MEN LOGISTIC
    { mezzoIdx: 6, padroncinoIdx: 0 }, // GM709PN -> MEN LOGISTIC
    { mezzoIdx: 7, padroncinoIdx: 3 }, // GR184MD -> IB EXPRESS
    { mezzoIdx: 8, padroncinoIdx: 2 }, // GR496EZ -> EL SPEDIZIONI
    { mezzoIdx: 9, padroncinoIdx: 0 }, // GR498EZ -> MEN LOGISTIC
    { mezzoIdx: 10, padroncinoIdx: 0 }, // GR500EZ -> MEN LOGISTIC
    { mezzoIdx: 11, padroncinoIdx: 0 }, // GR507EZ -> MEN LOGISTIC
    { mezzoIdx: 12, padroncinoIdx: 0 }, // GR628XD -> MEN LOGISTIC
    { mezzoIdx: 13, padroncinoIdx: 4 }, // GR637XD -> QUICK EXPRESS
    { mezzoIdx: 16, padroncinoIdx: 0 }, // GS691VF -> MEN LOGISTIC
  ];

  for (const a of assegnazioni) {
    await prisma.assegnazioneMezzo.create({
      data: {
        mezzoId: mezzi[a.mezzoIdx].id,
        padroncinoId: padroncini[a.padroncinoIdx].id,
        dataInizio: new Date('2025-01-01'),
      },
    });
  }
  console.log(`  ✅ ${assegnazioni.length} assegnazioni mezzi create`);

  // ─── PALMARI ─────────────────────────────────────
  const palmari = [];
  for (let i = 1; i <= 8; i++) {
    const p = await prisma.palmare.create({
      data: {
        codice: `PAL-${String(i).padStart(3, '0')}`,
        marca: 'Zebra',
        modello: 'TC21',
        tariffaMensile: 35,
        stato: i <= 6 ? 'ASSEGNATO' : 'DISPONIBILE',
      },
    });
    palmari.push(p);
  }
  console.log(`  ✅ ${palmari.length} palmari creati`);

  // Assegnazioni palmari
  for (let i = 0; i < 6; i++) {
    await prisma.assegnazionePalmare.create({
      data: {
        palmareId: palmari[i].id,
        padroncinoId: padroncini[i % padroncini.length].id,
        dataInizio: new Date('2025-01-01'),
      },
    });
  }
  console.log('  ✅ Assegnazioni palmari create');

  // ─── CODICI AUTISTI ──────────────────────────────
  const codiciAutisti = [];
  const nomiAutisti = [
    { codice: 'AUT001', nome: 'Marco', cognome: 'Rossi' },
    { codice: 'AUT002', nome: 'Giuseppe', cognome: 'Bianchi' },
    { codice: 'AUT003', nome: 'Antonio', cognome: 'Esposito' },
    { codice: 'AUT004', nome: 'Luigi', cognome: 'Russo' },
    { codice: 'AUT005', nome: 'Francesco', cognome: 'Romano' },
    { codice: 'AUT006', nome: 'Paolo', cognome: 'Colombo' },
  ];

  for (const a of nomiAutisti) {
    const ca = await prisma.codiceAutista.create({ data: a });
    codiciAutisti.push(ca);
  }
  console.log(`  ✅ ${codiciAutisti.length} codici autista creati`);

  // Assegnazioni autisti a padroncini
  for (let i = 0; i < codiciAutisti.length; i++) {
    await prisma.assegnazioneCodiceAutista.create({
      data: {
        codiceAutistaId: codiciAutisti[i].id,
        padroncinoId: padroncini[i % padroncini.length].id,
        dataInizio: new Date('2025-01-01'),
      },
    });
  }
  console.log('  ✅ Assegnazioni codici autista create');

  // ─── ACCONTI ─────────────────────────────────────
  for (let i = 0; i < 4; i++) {
    await prisma.acconto.create({
      data: {
        codiceAutistaId: codiciAutisti[i].id,
        importo: 200 + i * 50,
        data: new Date('2026-03-15'),
        mese: '2026-03',
        descrizione: `Acconto marzo ${codiciAutisti[i].nome}`,
      },
    });
  }
  console.log('  ✅ Acconti creati');

  console.log('\n🎉 Seed completato!');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
