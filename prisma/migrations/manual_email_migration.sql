-- Step 1: Add email column as nullable first
ALTER TABLE "Notification" ADD COLUMN "email" TEXT;

-- Step 2: Populate email from user relation for existing notifications
UPDATE "Notification" n
SET "email" = u."email"
FROM "User" u
WHERE n."userId" = u."id" AND n."email" IS NULL;

-- Step 3: Delete orphaned notifications (no user, no email)
DELETE FROM "Notification" WHERE "email" IS NULL;

-- Step 4: Make userId nullable
ALTER TABLE "Notification" ALTER COLUMN "userId" DROP NOT NULL;

-- Step 5: Make email required
ALTER TABLE "Notification" ALTER COLUMN "email" SET NOT NULL;

-- Step 6: Create indexes
CREATE INDEX "Notification_email_idx" ON "Notification"("email");
CREATE INDEX "Notification_email_userId_idx" ON "Notification"("email", "userId");
