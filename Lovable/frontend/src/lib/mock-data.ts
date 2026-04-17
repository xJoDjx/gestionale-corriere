// Mock data for Padroncini

export interface MezzoAssegnato {
  id: string;
  targa: string;
  marca: string;
  modello: string;
  alimentazione: string;
  dataInizio: string;
  dataFine?: string;
  tariffa?: number;
}

export interface PalmareAssegnato {
  id: string;
  codice: string;
  dataInizio: string;
  dataFine?: string;
  tariffa?: number;
}

export interface CodiceAutista {
  id: string;
  codice: string;
  nome?: string;
  cognome?: string;
  dataInizio: string;
  dataFine?: string;
}

export interface Padroncino {
  id: string;
  codice: string;
  ragioneSociale: string;
  partitaIva: string;
  codiceFiscale?: string;
  indirizzo?: string;
  telefono?: string;
  email?: string;
  pec?: string;
  iban?: string;
  attivo: boolean;
  scadenzaDurc?: string;
  scadenzaDvr?: string;
  dvrEsente?: boolean;
  note?: string;
  fatturatoMese?: number;
  fatturatoTotale?: number;
  addebitiTotali?: number;
  daBonificare?: number;
  mediaMensile?: number;
  mezziAssegnati?: MezzoAssegnato[];
  palmariAssegnati?: PalmareAssegnato[];
  codiciAutista?: CodiceAutista[];
}

export const MOCK_PADRONCINI: Padroncino[] = [
  {
    id: '1',
    codice: 'RT001',
    ragioneSociale: 'ROSSI TRASPORTI SRL',
    partitaIva: '01234567890',
    codiceFiscale: '01234567890',
    indirizzo: 'Via Roma 15, Cosenza (CS)',
    telefono: '0984 123456',
    email: 'info@rossitrasporti.it',
    pec: 'rossi@pec.it',
    iban: 'IT68X0542811101000000123456',
    attivo: true,
    scadenzaDurc: '2025-09-15',
    scadenzaDvr: '2025-12-01',
    note: 'Padroncino storico, ottimo track record',
    fatturatoMese: 11875.00,
    fatturatoTotale: 149608.88,
    addebitiTotali: 26563.66,
    daBonificare: 123045.23,
    mediaMensile: 12467.41,
    mezziAssegnati: [
      { id: 'm1', targa: 'FG123AB', marca: 'IVECO', modello: 'Daily 35S14', alimentazione: 'Diesel', dataInizio: '2024-01-15', tariffa: 850 },
      { id: 'm2', targa: 'CS456CD', marca: 'FIAT', modello: 'Ducato', alimentazione: 'Diesel', dataInizio: '2024-03-01', tariffa: 750 },
      { id: 'm3', targa: 'RC789EF', marca: 'MAN', modello: 'TGE 3.140', alimentazione: 'Elettrico', dataInizio: '2024-06-10', tariffa: 920 },
    ],
    palmariAssegnati: [
      { id: 'p1', codice: 'PAL-001', dataInizio: '2024-01-15', tariffa: 45 },
      { id: 'p2', codice: 'PAL-008', dataInizio: '2024-04-01', tariffa: 45 },
    ],
    codiciAutista: [
      { id: 'a1', codice: 'AUT-101', nome: 'Mario', cognome: 'Rossi', dataInizio: '2024-01-15' },
      { id: 'a2', codice: 'AUT-102', nome: 'Luigi', cognome: 'Verdi', dataInizio: '2024-03-01' },
      { id: 'a3', codice: 'AUT-103', nome: 'Giuseppe', cognome: 'Bianchi', dataInizio: '2024-06-10' },
    ],
  },
  {
    id: '2',
    codice: 'BL002',
    ragioneSociale: 'BIANCHI LOGISTICA DI BIANCHI MARIO',
    partitaIva: '09876543210',
    attivo: true,
    scadenzaDurc: '2024-06-01',
    scadenzaDvr: '2025-12-01',
    fatturatoMese: 8200,
    fatturatoTotale: 98700,
    addebitiTotali: 12300,
    daBonificare: 86400,
    mediaMensile: 8225,
    mezziAssegnati: [
      { id: 'm4', targa: 'MI111AA', marca: 'IVECO', modello: 'Daily', alimentazione: 'Diesel', dataInizio: '2024-02-01', tariffa: 800 },
      { id: 'm5', targa: 'MI222BB', marca: 'FIAT', modello: 'Ducato', alimentazione: 'Diesel', dataInizio: '2024-05-15', tariffa: 700 },
    ],
    palmariAssegnati: [{ id: 'p3', codice: 'PAL-003', dataInizio: '2024-02-01', tariffa: 45 }],
    codiciAutista: [
      { id: 'a4', codice: 'AUT-201', nome: 'Paolo', cognome: 'Neri', dataInizio: '2024-02-01' },
      { id: 'a5', codice: 'AUT-202', nome: 'Franco', cognome: 'Gialli', dataInizio: '2024-05-15' },
    ],
  },
  {
    id: '3',
    codice: 'VE003',
    ragioneSociale: 'VERDI EXPRESS SRLS',
    partitaIva: '11223344556',
    attivo: true,
    scadenzaDurc: '2026-02-15',
    scadenzaDvr: '2024-06-01',
    fatturatoMese: 6500,
    fatturatoTotale: 76300,
    addebitiTotali: 8700,
    daBonificare: 67600,
    mediaMensile: 6358,
    mezziAssegnati: [{ id: 'm6', targa: 'NA333CC', marca: 'RENAULT', modello: 'Master', alimentazione: 'Diesel', dataInizio: '2024-01-10', tariffa: 780 }],
    palmariAssegnati: [{ id: 'p4', codice: 'PAL-005', dataInizio: '2024-01-10', tariffa: 45 }],
    codiciAutista: [{ id: 'a6', codice: 'AUT-301', nome: 'Antonio', cognome: 'Verdi', dataInizio: '2024-01-10' }],
  },
  {
    id: '4',
    codice: 'NF004',
    ragioneSociale: 'NERI & FIGLI CORRIERE SNC',
    partitaIva: '55667788990',
    attivo: true,
    scadenzaDurc: '2025-06-28',
    scadenzaDvr: '2026-03-01',
    fatturatoMese: 18500,
    fatturatoTotale: 215800,
    addebitiTotali: 31200,
    daBonificare: 184600,
    mediaMensile: 17983,
    mezziAssegnati: [
      { id: 'm7', targa: 'RM444DD', marca: 'IVECO', modello: 'Eurocargo', alimentazione: 'Diesel', dataInizio: '2023-09-01', tariffa: 1100 },
      { id: 'm8', targa: 'RM555EE', marca: 'MAN', modello: 'TGL 12', alimentazione: 'Diesel', dataInizio: '2024-01-15', tariffa: 1050 },
      { id: 'm9', targa: 'RM666FF', marca: 'IVECO', modello: 'Daily 50C', alimentazione: 'Diesel', dataInizio: '2024-04-01', tariffa: 900 },
      { id: 'm10', targa: 'RM777GG', marca: 'FIAT', modello: 'Ducato XL', alimentazione: 'Metano', dataInizio: '2024-07-01', tariffa: 820 },
    ],
    palmariAssegnati: [
      { id: 'p5', codice: 'PAL-010', dataInizio: '2023-09-01', tariffa: 45 },
      { id: 'p6', codice: 'PAL-011', dataInizio: '2024-01-15', tariffa: 45 },
      { id: 'p7', codice: 'PAL-012', dataInizio: '2024-04-01', tariffa: 45 },
    ],
    codiciAutista: [
      { id: 'a7', codice: 'AUT-401', nome: 'Marco', cognome: 'Neri', dataInizio: '2023-09-01' },
      { id: 'a8', codice: 'AUT-402', nome: 'Andrea', cognome: 'Blu', dataInizio: '2024-01-15' },
      { id: 'a9', codice: 'AUT-403', nome: 'Luca', cognome: 'Grigi', dataInizio: '2024-04-01' },
      { id: 'a10', codice: 'AUT-404', nome: 'Davide', cognome: 'Rosa', dataInizio: '2024-07-01' },
    ],
  },
  {
    id: '5',
    codice: 'GS005',
    ragioneSociale: 'GIALLI SPEDIZIONI DI GIALLI ANTONIO',
    partitaIva: '44556677889',
    attivo: true,
    scadenzaDurc: '2025-05-10',
    scadenzaDvr: '2026-01-01',
    fatturatoMese: 4500,
    fatturatoTotale: 54200,
    addebitiTotali: 7800,
    daBonificare: 46400,
    mediaMensile: 4517,
    mezziAssegnati: [{ id: 'm11', targa: 'BA888HH', marca: 'CITROEN', modello: 'Jumper', alimentazione: 'Diesel', dataInizio: '2024-03-15', tariffa: 680 }],
    palmariAssegnati: [{ id: 'p8', codice: 'PAL-015', dataInizio: '2024-03-15', tariffa: 45 }],
    codiciAutista: [{ id: 'a11', codice: 'AUT-501', nome: 'Antonio', cognome: 'Gialli', dataInizio: '2024-03-15' }],
  },
  {
    id: '6',
    codice: 'BT006',
    ragioneSociale: 'BLU TRASPORTI SAS',
    partitaIva: '99887766554',
    attivo: false,
    scadenzaDurc: '2023-07-01',
    scadenzaDvr: '2023-12-01',
    fatturatoMese: 0,
    fatturatoTotale: 31200,
    addebitiTotali: 4500,
    daBonificare: 26700,
    mediaMensile: 2600,
    mezziAssegnati: [{ id: 'm12', targa: 'TO999II', marca: 'PEUGEOT', modello: 'Boxer', alimentazione: 'Diesel', dataInizio: '2023-01-15', dataFine: '2024-06-30', tariffa: 650 }],
    palmariAssegnati: [],
    codiciAutista: [],
  },
  {
    id: '7',
    codice: 'MD007',
    ragioneSociale: 'MARRONI DELIVERY SRL',
    partitaIva: '33445566778',
    attivo: true,
    scadenzaDurc: '2025-04-20',
    scadenzaDvr: '2026-06-01',
    fatturatoMese: 14200,
    fatturatoTotale: 167900,
    addebitiTotali: 22100,
    daBonificare: 145800,
    mediaMensile: 13992,
    mezziAssegnati: [
      { id: 'm13', targa: 'FI000LL', marca: 'IVECO', modello: 'Daily 35S16', alimentazione: 'Diesel', dataInizio: '2024-01-01', tariffa: 870 },
      { id: 'm14', targa: 'FI111MM', marca: 'MAN', modello: 'TGE 3.180', alimentazione: 'Elettrico', dataInizio: '2024-05-01', tariffa: 950 },
      { id: 'm15', targa: 'FI222NN', marca: 'FIAT', modello: 'Ducato Maxi', alimentazione: 'Diesel', dataInizio: '2024-08-01', tariffa: 780 },
    ],
    palmariAssegnati: [
      { id: 'p9', codice: 'PAL-020', dataInizio: '2024-01-01', tariffa: 45 },
      { id: 'p10', codice: 'PAL-021', dataInizio: '2024-05-01', tariffa: 45 },
    ],
    codiciAutista: [
      { id: 'a12', codice: 'AUT-701', nome: 'Roberto', cognome: 'Marroni', dataInizio: '2024-01-01' },
      { id: 'a13', codice: 'AUT-702', nome: 'Stefano', cognome: 'Viola', dataInizio: '2024-05-01' },
      { id: 'a14', codice: 'AUT-703', nome: 'Fabio', cognome: 'Arancio', dataInizio: '2024-08-01' },
    ],
  },
  {
    id: '8',
    codice: 'AL008',
    ragioneSociale: 'ARANCIO LOGISTIC SRLS',
    partitaIva: '22334455667',
    attivo: true,
    scadenzaDurc: '2026-03-01',
    scadenzaDvr: '2026-05-15',
    fatturatoMese: 7400,
    fatturatoTotale: 89400,
    addebitiTotali: 11200,
    daBonificare: 78200,
    mediaMensile: 7450,
    mezziAssegnati: [
      { id: 'm16', targa: 'GE333OO', marca: 'IVECO', modello: 'Daily 35C14', alimentazione: 'Diesel', dataInizio: '2024-02-15', tariffa: 800 },
      { id: 'm17', targa: 'GE444PP', marca: 'RENAULT', modello: 'Master L3H2', alimentazione: 'Diesel', dataInizio: '2024-06-01', tariffa: 760 },
    ],
    palmariAssegnati: [{ id: 'p11', codice: 'PAL-025', dataInizio: '2024-02-15', tariffa: 45 }],
    codiciAutista: [
      { id: 'a15', codice: 'AUT-801', nome: 'Giovanni', cognome: 'Arancio', dataInizio: '2024-02-15' },
      { id: 'a16', codice: 'AUT-802', nome: 'Pietro', cognome: 'Celeste', dataInizio: '2024-06-01' },
    ],
  },
];

export const MOCK_FATTURATO_MENSILE = [
  { mese: 'GEN', fatturato: 8500, addebiti: 3200 },
  { mese: 'FEB', fatturato: 12800, addebiti: 4100 },
  { mese: 'MAR', fatturato: 15200, addebiti: 5300 },
  { mese: 'APR', fatturato: 14100, addebiti: 4800 },
  { mese: 'MAG', fatturato: 11500, addebiti: 3900 },
  { mese: 'GIU', fatturato: 7200, addebiti: 2600 },
  { mese: 'LUG', fatturato: 9800, addebiti: 3400 },
  { mese: 'AGO', fatturato: 13400, addebiti: 4600 },
  { mese: 'SET', fatturato: 16500, addebiti: 5100 },
  { mese: 'OTT', fatturato: 14700, addebiti: 4900 },
  { mese: 'NOV', fatturato: 17200, addebiti: 5800 },
  { mese: 'DIC', fatturato: 11875, addebiti: 3900 },
];
