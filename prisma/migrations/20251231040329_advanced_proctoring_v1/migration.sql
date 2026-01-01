-- AlterTable
ALTER TABLE "InterviewResponse" ADD COLUMN     "aiFlagged" BOOLEAN DEFAULT false,
ADD COLUMN     "overfitScore" INTEGER;

-- AlterTable
ALTER TABLE "InterviewSession" ADD COLUMN     "isFlagged" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "warningCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "fullScreenMode" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "micRequired" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "noTextTyping" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "videoRequired" BOOLEAN NOT NULL DEFAULT true;
