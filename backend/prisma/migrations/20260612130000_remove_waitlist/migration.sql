/*
  Warnings:

  - You are about to drop the column `waitlistId` on the `Notification` table. All the data in the column will be lost.
  - You are about to drop the `Waitlist` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_waitlistId_fkey";

-- DropForeignKey
ALTER TABLE "Waitlist" DROP CONSTRAINT "Waitlist_counselorId_fkey";

-- DropForeignKey
ALTER TABLE "Waitlist" DROP CONSTRAINT "Waitlist_customerId_fkey";

-- DropForeignKey
ALTER TABLE "Waitlist" DROP CONSTRAINT "Waitlist_offeredSlotId_fkey";

-- DropIndex
DROP INDEX "Notification_waitlistId_idx";

-- AlterTable
ALTER TABLE "Notification" DROP COLUMN "waitlistId";

-- DropTable
DROP TABLE "Waitlist";

-- DropEnum
DROP TYPE "WaitlistStatus";
