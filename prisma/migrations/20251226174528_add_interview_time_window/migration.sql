-- AlterTable
ALTER TABLE "Job" RENAME COLUMN "scheduledTime" TO "interviewStartTime";

-- AlterTable
ALTER TABLE "Job" ADD COLUMN "interviewEndTime" TIMESTAMP(3);

-- Update existing jobs to set interviewEndTime to 1 hour after interviewStartTime
UPDATE "Job" SET "interviewEndTime" = "interviewStartTime" + INTERVAL '1 hour' WHERE "interviewEndTime" IS NULL;

-- Make interviewEndTime NOT NULL
ALTER TABLE "Job" ALTER COLUMN "interviewEndTime" SET NOT NULL;
