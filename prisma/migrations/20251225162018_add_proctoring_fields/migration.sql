-- AlterEnum
ALTER TYPE "CandidateStatus" ADD VALUE 'EXPIRED';

-- AlterEnum
ALTER TYPE "Status" ADD VALUE 'PAUSED';

-- AlterTable
ALTER TABLE "InterviewSession" ADD COLUMN     "hasStarted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isInterrupted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "malpracticeCount" INTEGER NOT NULL DEFAULT 0;
