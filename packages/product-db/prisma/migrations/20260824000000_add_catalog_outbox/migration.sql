-- CreateEnum
CREATE TYPE "CatalogSyncStatus" AS ENUM ('PENDING', 'SYNCED', 'FAILED');

-- CreateEnum
CREATE TYPE "CatalogSyncOperation" AS ENUM ('UPSERT', 'ARCHIVE');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PUBLISHED');

-- AlterTable
ALTER TABLE "Product"
ADD COLUMN "catalogVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "stripeSyncStatus" "CatalogSyncStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "stripeSyncedVersion" INTEGER,
ADD COLUMN "stripeSyncedAt" TIMESTAMP(3),
ADD COLUMN "stripeSyncError" TEXT;
ALTER TABLE "Product"
ADD COLUMN "stripeSyncResultRevision" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ProductOutboxEvent" (
    "id" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "aggregateVersion" INTEGER NOT NULL,
    "operation" "CatalogSyncOperation" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "claimToken" TEXT,
    "publishedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductOutboxEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductOutboxEvent_aggregateId_aggregateVersion_operation_key"
ON "ProductOutboxEvent"("aggregateId", "aggregateVersion", "operation");

CREATE INDEX "ProductOutboxEvent_status_nextAttemptAt_idx"
ON "ProductOutboxEvent"("status", "nextAttemptAt");
