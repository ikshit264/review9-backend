/*
  Warnings:

  - You are about to drop the column `timezone` on the `Job` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Candidate" ADD COLUMN     "addressLine" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "lastName" TEXT,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "zipCode" TEXT;

-- AlterTable
ALTER TABLE "Job" DROP COLUMN "timezone",
ADD COLUMN     "addressLineRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cityRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "countryRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "disableAddressLine" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "disableCity" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "disableCountry" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "disableFirstName" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "disableFullName" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "disableLastName" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "disableState" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "disableZipCode" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "firstNameRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "fullNameRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastNameRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stateRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "zipCodeRequired" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "PaymentTransaction" ALTER COLUMN "currency" DROP DEFAULT,
ALTER COLUMN "dodoProductId" DROP NOT NULL,
ALTER COLUMN "metadata" SET DEFAULT '{}';
