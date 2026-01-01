-- AlterTable
ALTER TABLE "InterviewResponse" ADD COLUMN     "commScore" INTEGER,
ADD COLUMN     "techScore" INTEGER,
ADD COLUMN     "turnFeedback" TEXT;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'UTC';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isProfileComplete" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "resumeBase64" TEXT,
ADD COLUMN     "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "timezone" TEXT DEFAULT 'UTC',
ADD COLUMN     "workExperience" JSONB;
