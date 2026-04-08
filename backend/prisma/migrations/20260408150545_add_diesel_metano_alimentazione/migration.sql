-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Alimentazione" ADD VALUE 'DIESEL';
ALTER TYPE "Alimentazione" ADD VALUE 'METANO';

-- DropForeignKey
ALTER TABLE "conteggi_righe" DROP CONSTRAINT "fk_righe_acconto";

-- DropForeignKey
ALTER TABLE "conteggi_righe" DROP CONSTRAINT "fk_righe_mezzo";

-- DropForeignKey
ALTER TABLE "conteggi_righe" DROP CONSTRAINT "fk_righe_palmare";

-- DropForeignKey
ALTER TABLE "documenti" DROP CONSTRAINT "fk_doc_mezzo";

-- DropForeignKey
ALTER TABLE "documenti" DROP CONSTRAINT "fk_doc_padroncino";

-- DropForeignKey
ALTER TABLE "documenti" DROP CONSTRAINT "fk_doc_palmare";

-- DropForeignKey
ALTER TABLE "note" DROP CONSTRAINT "fk_nota_mezzo";

-- DropForeignKey
ALTER TABLE "note" DROP CONSTRAINT "fk_nota_padroncino";

-- DropForeignKey
ALTER TABLE "tags" DROP CONSTRAINT "fk_tag_mezzo";

-- DropForeignKey
ALTER TABLE "tags" DROP CONSTRAINT "fk_tag_padroncino";

-- DropForeignKey
ALTER TABLE "tags" DROP CONSTRAINT "fk_tag_palmare";

-- AlterTable
ALTER TABLE "mezzi" ADD COLUMN     "km_attuali_al" TIMESTAMP(3);
