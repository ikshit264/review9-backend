-- AlterTable
ALTER TABLE "User" RENAME COLUMN "resumeBase64" TO "resumeUrl";

-- Change column type from TEXT to VARCHAR (standard string)
ALTER TABLE "User" ALTER COLUMN "resumeUrl" TYPE VARCHAR;
