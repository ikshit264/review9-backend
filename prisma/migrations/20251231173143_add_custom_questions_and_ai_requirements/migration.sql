-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "aiSpecificRequirements" TEXT,
ADD COLUMN     "customQuestions" TEXT[] DEFAULT ARRAY[]::TEXT[];
