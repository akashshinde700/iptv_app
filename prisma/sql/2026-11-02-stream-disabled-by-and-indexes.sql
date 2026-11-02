-- StreamKaro — audit batch 2 (BUG-07, DB-01)
--
-- The project deploys with `prisma db push` (there is no migrations directory), so this file is
-- the reviewable, idempotent record of the schema change. Apply it on staging, verify, then on
-- production during a maintenance window:
--
--     mysql -u <user> -p <db> < prisma/sql/2026-11-02-stream-disabled-by-and-indexes.sql
--
-- Rollback is at the bottom of the file.

-- 1) Which switch put a stream in DISABLED: "AUTO" (health sweep) or "OPERATOR" (admin).
ALTER TABLE `Stream`
  ADD COLUMN `disabledBy` VARCHAR(191) NULL;

-- Existing disabled rows were disabled by the health sweep (operators had no switch until now),
-- so they stay recoverable by a passing probe. Any row an operator switched off from this point
-- on records OPERATOR and is left alone by probes / client reports.
UPDATE `Stream` SET `disabledBy` = 'AUTO' WHERE `status` = 'DISABLED' AND `disabledBy` IS NULL;

-- 2) Composite indexes for the hot list/sweep queries (DB-01).
CREATE INDEX `Stream_channelId_status_idx` ON `Stream` (`channelId`, `status`);
CREATE INDEX `Stream_status_lastProbeAt_idx` ON `Stream` (`status`, `lastProbeAt`);

CREATE INDEX `Channel_organizationId_isActive_name_idx` ON `Channel` (`organizationId`, `isActive`, `name`);
CREATE INDEX `Channel_organizationId_healthStatus_idx` ON `Channel` (`organizationId`, `healthStatus`);

CREATE INDEX `Customer_organizationId_status_idx` ON `Customer` (`organizationId`, `status`);
CREATE INDEX `Customer_organizationId_accountStatus_idx` ON `Customer` (`organizationId`, `accountStatus`);
CREATE INDEX `Customer_organizationId_createdAt_idx` ON `Customer` (`organizationId`, `createdAt`);

CREATE INDEX `Subscription_customerId_status_idx` ON `Subscription` (`customerId`, `status`);
CREATE INDEX `Subscription_status_endsAt_idx` ON `Subscription` (`status`, `endsAt`);

CREATE INDEX `AuditLog_organizationId_createdAt_idx` ON `AuditLog` (`organizationId`, `createdAt`);

-- ── Rollback ─────────────────────────────────────────────────────────────────
-- DROP INDEX `AuditLog_organizationId_createdAt_idx` ON `AuditLog`;
-- DROP INDEX `Subscription_status_endsAt_idx` ON `Subscription`;
-- DROP INDEX `Subscription_customerId_status_idx` ON `Subscription`;
-- DROP INDEX `Customer_organizationId_createdAt_idx` ON `Customer`;
-- DROP INDEX `Customer_organizationId_accountStatus_idx` ON `Customer`;
-- DROP INDEX `Customer_organizationId_status_idx` ON `Customer`;
-- DROP INDEX `Channel_organizationId_healthStatus_idx` ON `Channel`;
-- DROP INDEX `Channel_organizationId_isActive_name_idx` ON `Channel`;
-- DROP INDEX `Stream_status_lastProbeAt_idx` ON `Stream`;
-- DROP INDEX `Stream_channelId_status_idx` ON `Stream`;
-- ALTER TABLE `Stream` DROP COLUMN `disabledBy`;
