-- Rename role enum values to product-facing roles
ALTER TYPE "RoleName" RENAME VALUE 'ADMIN' TO 'ADMINISTRADOR';
ALTER TYPE "RoleName" RENAME VALUE 'OPERATOR' TO 'PROFESOR';
ALTER TYPE "RoleName" RENAME VALUE 'VIEWER' TO 'ALUMNO';

-- Extend templates with ownership/source metadata
ALTER TABLE "Template"
ADD COLUMN "createdById" TEXT,
ADD COLUMN "defaultDiskGb" INTEGER NOT NULL DEFAULT 40,
ADD COLUMN "sourceVmId" TEXT;

-- Template assignments from professor/admin to students
CREATE TABLE "TemplateAssignment" (
  "id" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "assignedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TemplateAssignment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Template_createdById_createdAt_idx" ON "Template"("createdById", "createdAt" DESC);
CREATE UNIQUE INDEX "TemplateAssignment_templateId_studentId_key" ON "TemplateAssignment"("templateId", "studentId");
CREATE INDEX "TemplateAssignment_studentId_createdAt_idx" ON "TemplateAssignment"("studentId", "createdAt" DESC);
CREATE INDEX "TemplateAssignment_assignedById_createdAt_idx" ON "TemplateAssignment"("assignedById", "createdAt" DESC);

ALTER TABLE "Template"
ADD CONSTRAINT "Template_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Template"
ADD CONSTRAINT "Template_sourceVmId_fkey" FOREIGN KEY ("sourceVmId") REFERENCES "VirtualMachine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TemplateAssignment"
ADD CONSTRAINT "TemplateAssignment_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TemplateAssignment"
ADD CONSTRAINT "TemplateAssignment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TemplateAssignment"
ADD CONSTRAINT "TemplateAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;