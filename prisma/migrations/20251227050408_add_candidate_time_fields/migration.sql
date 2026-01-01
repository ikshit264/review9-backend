-- AlterTable
ALTER TABLE "Candidate" ADD COLUMN     "interviewEndTime" TIMESTAMP(3),
ADD COLUMN     "interviewStartTime" TIMESTAMP(3),
ADD COLUMN     "isReInterviewed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "resumeUrl" SET DATA TYPE TEXT;
