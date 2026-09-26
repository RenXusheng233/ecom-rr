CREATE TYPE "CatalogOperation" AS ENUM ('UPSERT', 'ARCHIVE');
CREATE TYPE "CatalogTaskStatus" AS ENUM ('PENDING', 'PROCESSING', 'SYNCED', 'FAILED');
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PUBLISHED');

CREATE TABLE "CatalogInboxEvent" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CatalogInboxEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StripeCatalogItem" (
    "productId" TEXT NOT NULL,
    "desiredEventId" TEXT NOT NULL,
    "desiredVersion" INTEGER NOT NULL,
    "desiredOperation" "CatalogOperation" NOT NULL,
    "desiredName" TEXT,
    "desiredUnitAmount" INTEGER,
    "desiredCurrency" TEXT,
    "desiredRunId" TEXT NOT NULL,
    "appliedVersion" INTEGER,
    "stripeProductId" TEXT,
    "stripePriceId" TEXT,
    "status" "CatalogTaskStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "claimToken" TEXT,
    "processingVersion" INTEGER,
    "resultRevision" INTEGER NOT NULL DEFAULT 0,
    "mutationEpoch" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StripeCatalogItem_pkey" PRIMARY KEY ("productId")
);

CREATE TABLE "PaymentOutboxEvent" (
    "id" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "aggregateVersion" INTEGER NOT NULL,
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
    CONSTRAINT "PaymentOutboxEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CatalogInboxEvent_productId_idx" ON "CatalogInboxEvent"("productId");
CREATE INDEX "StripeCatalogItem_status_nextAttemptAt_idx" ON "StripeCatalogItem"("status", "nextAttemptAt");
CREATE INDEX "PaymentOutboxEvent_status_nextAttemptAt_idx" ON "PaymentOutboxEvent"("status", "nextAttemptAt");
