-- CreateEnum
CREATE TYPE "ExpirationAction" AS ENUM ('STOP', 'DELETE');

-- AlterTable
ALTER TABLE "VirtualMachine"
ADD COLUMN "autoStopAt" TIMESTAMP(3),
ADD COLUMN "expiresAt" TIMESTAMP(3),
ADD COLUMN "expirationAction" "ExpirationAction" NOT NULL DEFAULT 'STOP',
ADD COLUMN "lastAutomatedActionAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "VirtualMachine_autoStopAt_deletedAt_idx" ON "VirtualMachine"("autoStopAt", "deletedAt");

-- CreateIndex
CREATE INDEX "VirtualMachine_expiresAt_expirationAction_deletedAt_idx" ON "VirtualMachine"("expiresAt", "expirationAction", "deletedAt");
