CREATE TYPE "PaymentStatus" AS ENUM ('CREATING', 'OPEN', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELED', 'EXPIRED');
CREATE TYPE "RefundStatus" AS ENUM ('NONE', 'PARTIAL', 'FULL');
CREATE TYPE "DisputeStatus" AS ENUM ('NONE', 'OPEN', 'WON', 'LOST');
CREATE TYPE "WebhookInboxStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'IGNORED', 'FAILED');

ALTER TABLE "StripeCatalogItem"
ADD COLUMN "desiredSizes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "desiredColors" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "PaymentOutboxEvent"
ADD COLUMN "topic" TEXT,
ADD COLUMN "messageKey" TEXT,
ADD COLUMN "eventType" TEXT,
ADD COLUMN "schemaVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "correlationId" TEXT,
ADD COLUMN "causationId" TEXT;

UPDATE "PaymentOutboxEvent"
SET
  "topic" = 'catalog.product.sync.result',
  "messageKey" = "aggregateId",
  "eventType" = 'catalog.product.sync.result'
WHERE "topic" IS NULL;

ALTER TABLE "PaymentOutboxEvent"
ALTER COLUMN "topic" SET NOT NULL,
ALTER COLUMN "messageKey" SET NOT NULL,
ALTER COLUMN "eventType" SET NOT NULL;

CREATE TABLE "CheckoutAttempt" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "clientRequestId" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'CREATING',
  "refundStatus" "RefundStatus" NOT NULL DEFAULT 'NONE',
  "disputeStatus" "DisputeStatus" NOT NULL DEFAULT 'NONE',
  "version" INTEGER NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'usd',
  "amountTotal" INTEGER NOT NULL,
  "amountRefunded" INTEGER NOT NULL DEFAULT 0,
  "itemsSnapshot" JSONB NOT NULL,
  "email" TEXT,
  "shippingSnapshot" JSONB,
  "stripeCheckoutSessionId" TEXT,
  "stripePaymentIntentId" TEXT,
  "stripeClientSecret" TEXT,
  "lastStripeEventCreatedAt" TIMESTAMP(3),
  "lastStripeReconciledAt" TIMESTAMP(3),
  "lastOrderReplayAt" TIMESTAMP(3),
  "orderAppliedVersion" INTEGER,
  "orderAppliedAt" TIMESTAMP(3),
  "orderExists" BOOLEAN NOT NULL DEFAULT false,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CheckoutAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StripeWebhookInboxEvent" (
  "id" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "stripeCreatedAt" TIMESTAMP(3) NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "WebhookInboxStatus" NOT NULL DEFAULT 'RECEIVED',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseUntil" TIMESTAMP(3),
  "claimToken" TEXT,
  "lastError" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  CONSTRAINT "StripeWebhookInboxEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrderProjectionInboxEvent" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "paymentAttemptId" TEXT NOT NULL,
  "appliedVersion" INTEGER NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderProjectionInboxEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CheckoutAttempt_orderId_key" ON "CheckoutAttempt"("orderId");
CREATE UNIQUE INDEX "CheckoutAttempt_stripeCheckoutSessionId_key" ON "CheckoutAttempt"("stripeCheckoutSessionId");
CREATE UNIQUE INDEX "CheckoutAttempt_stripePaymentIntentId_key" ON "CheckoutAttempt"("stripePaymentIntentId");
CREATE UNIQUE INDEX "CheckoutAttempt_userId_clientRequestId_key" ON "CheckoutAttempt"("userId", "clientRequestId");
CREATE INDEX "CheckoutAttempt_paymentStatus_updatedAt_idx" ON "CheckoutAttempt"("paymentStatus", "updatedAt");
CREATE INDEX "CheckoutAttempt_lastStripeReconciledAt_idx" ON "CheckoutAttempt"("lastStripeReconciledAt");
CREATE INDEX "CheckoutAttempt_lastOrderReplayAt_idx" ON "CheckoutAttempt"("lastOrderReplayAt");
CREATE INDEX "StripeWebhookInboxEvent_status_nextAttemptAt_idx" ON "StripeWebhookInboxEvent"("status", "nextAttemptAt");
CREATE INDEX "OrderProjectionInboxEvent_orderId_appliedVersion_idx" ON "OrderProjectionInboxEvent"("orderId", "appliedVersion");
