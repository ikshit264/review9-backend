/*
  Warnings:

  - The `status` column on the `Candidate` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('PENDING', 'INVITED', 'REVIEW', 'REJECTED', 'CONSIDERED', 'SHORTLISTED');

-- AlterTable
ALTER TABLE "Candidate" ADD COLUMN     "invitedAt" TIMESTAMP(3),
DROP COLUMN "status",
ADD COLUMN     "status" "CandidateStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "bio" TEXT,
ADD COLUMN     "location" TEXT;
