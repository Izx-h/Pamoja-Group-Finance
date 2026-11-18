CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupId` int,
	`actorUserId` int,
	`action` varchar(80) NOT NULL,
	`entityType` varchar(64) NOT NULL,
	`entityId` varchar(128),
	`details` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contribution_schedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupId` int NOT NULL,
	`label` varchar(120) NOT NULL,
	`amountMinor` bigint NOT NULL,
	`frequency` enum('weekly','biweekly','monthly','quarterly','annual') NOT NULL,
	`dueDay` int NOT NULL DEFAULT 1,
	`lateAfterDays` int NOT NULL DEFAULT 0,
	`startsOn` timestamp NOT NULL,
	`endsOn` timestamp,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `contribution_schedules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contributions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupId` int NOT NULL,
	`memberId` int NOT NULL,
	`scheduleId` int NOT NULL,
	`periodKey` varchar(32) NOT NULL,
	`dueDate` timestamp NOT NULL,
	`amountDueMinor` bigint NOT NULL,
	`amountPaidMinor` bigint NOT NULL DEFAULT 0,
	`status` enum('pending','partially_paid','settled','late','failed','reversed') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contributions_id` PRIMARY KEY(`id`),
	CONSTRAINT `contributions_group_member_schedule_period_uq` UNIQUE(`groupId`,`memberId`,`scheduleId`,`periodKey`)
);
--> statement-breakpoint
CREATE TABLE `custodian_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupId` int NOT NULL,
	`institutionName` varchar(160) NOT NULL,
	`accountReferenceMasked` varchar(80),
	`currency` varchar(3) NOT NULL DEFAULT 'KES',
	`verifiedBalanceMinor` bigint NOT NULL DEFAULT 0,
	`verifiedAt` timestamp,
	`verificationSource` varchar(120),
	`isDevelopmentMock` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `custodian_accounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `group_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupId` int NOT NULL,
	`userId` int,
	`roleId` int NOT NULL,
	`fullName` varchar(160) NOT NULL,
	`phone` varchar(32),
	`email` varchar(320),
	`status` enum('invited','active','suspended','exited') NOT NULL DEFAULT 'active',
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `group_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `group_members_group_user_uq` UNIQUE(`groupId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `group_roles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupId` int NOT NULL,
	`roleKey` varchar(64) NOT NULL,
	`label` varchar(80) NOT NULL,
	`permissions` json NOT NULL,
	`isDefault` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `group_roles_id` PRIMARY KEY(`id`),
	CONSTRAINT `group_roles_group_key_uq` UNIQUE(`groupId`,`roleKey`)
);
--> statement-breakpoint
CREATE TABLE `group_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupId` int NOT NULL,
	`approvalThreshold` int NOT NULL DEFAULT 2,
	`approvalRoleKeys` json NOT NULL,
	`prohibitSelfApproval` boolean NOT NULL DEFAULT true,
	`allowOverpayments` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `group_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `group_settings_group_uq` UNIQUE(`groupId`)
);
--> statement-breakpoint
CREATE TABLE `groups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`type` enum('merry_go_round','rotating_savings','accumulated_savings','sacco','investment') NOT NULL,
	`description` text,
	`registrationDetails` text,
	`currency` varchar(3) NOT NULL DEFAULT 'KES',
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `groups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `guarantors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`applicationId` int NOT NULL,
	`guarantorMemberId` int NOT NULL,
	`status` enum('requested','accepted','declined') NOT NULL DEFAULT 'requested',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `guarantors_id` PRIMARY KEY(`id`),
	CONSTRAINT `guarantors_application_member_uq` UNIQUE(`applicationId`,`guarantorMemberId`)
);
--> statement-breakpoint
CREATE TABLE `journal_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupId` int NOT NULL,
	`transactionId` varchar(64) NOT NULL,
	`sourceType` varchar(48) NOT NULL,
	`sourceId` varchar(128) NOT NULL,
	`description` text NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'KES',
	`reversalOfId` int,
	`postedByUserId` int,
	`postedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `journal_entries_id` PRIMARY KEY(`id`),
	CONSTRAINT `journal_entries_transaction_uq` UNIQUE(`groupId`,`transactionId`),
	CONSTRAINT `journal_entries_source_uq` UNIQUE(`groupId`,`sourceType`,`sourceId`)
);
--> statement-breakpoint
CREATE TABLE `journal_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`journalEntryId` int NOT NULL,
	`accountId` int NOT NULL,
	`lineNumber` int NOT NULL,
	`debitMinor` bigint NOT NULL DEFAULT 0,
	`creditMinor` bigint NOT NULL DEFAULT 0,
	`description` varchar(255),
	CONSTRAINT `journal_lines_id` PRIMARY KEY(`id`),
	CONSTRAINT `journal_lines_entry_line_uq` UNIQUE(`journalEntryId`,`lineNumber`)
);
--> statement-breakpoint
CREATE TABLE `ledger_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupId` int NOT NULL,
	`code` varchar(48) NOT NULL,
	`name` varchar(120) NOT NULL,
	`type` enum('asset','liability','equity','income','expense') NOT NULL,
	`isCash` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ledger_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `ledger_accounts_group_code_uq` UNIQUE(`groupId`,`code`)
);
--> statement-breakpoint
CREATE TABLE `loan_applications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupId` int NOT NULL,
	`memberId` int NOT NULL,
	`productId` int NOT NULL,
	`requestedAmountMinor` bigint NOT NULL,
	`approvedAmountMinor` bigint,
	`status` enum('submitted','under_review','approved','rejected','withdrawn','disbursed') NOT NULL DEFAULT 'submitted',
	`purpose` text,
	`reviewedByUserId` int,
	`reviewNote` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `loan_applications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `loan_products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`annualRateBps` int NOT NULL DEFAULT 0,
	`maxAmountMinor` bigint NOT NULL,
	`termMonths` int NOT NULL,
	`requiresGuarantors` int NOT NULL DEFAULT 0,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `loan_products_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `loan_repayments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupId` int NOT NULL,
	`loanId` int NOT NULL,
	`paymentId` int,
	`principalMinor` bigint NOT NULL,
	`interestMinor` bigint NOT NULL,
	`paidAt` timestamp,
	`status` enum('pending','confirmed','reversed') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `loan_repayments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `loans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupId` int NOT NULL,
	`applicationId` int NOT NULL,
	`memberId` int NOT NULL,
	`principalMinor` bigint NOT NULL,
	`interestMinor` bigint NOT NULL,
	`outstandingPrincipalMinor` bigint NOT NULL,
	`outstandingInterestMinor` bigint NOT NULL,
	`status` enum('pending_disbursement','active','repaid','defaulted') NOT NULL DEFAULT 'pending_disbursement',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `loans_id` PRIMARY KEY(`id`),
	CONSTRAINT `loans_application_uq` UNIQUE(`applicationId`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupId` int,
	`userId` int NOT NULL,
	`channel` enum('in_app','email','sms','whatsapp') NOT NULL DEFAULT 'in_app',
	`type` varchar(64) NOT NULL,
	`title` varchar(160) NOT NULL,
	`body` text NOT NULL,
	`status` enum('queued','sent','failed','read') NOT NULL DEFAULT 'queued',
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payment_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`provider` varchar(32) NOT NULL,
	`eventKey` varchar(64) NOT NULL,
	`eventType` varchar(80) NOT NULL,
	`providerReference` varchar(128),
	`paymentId` int,
	`signatureValid` boolean NOT NULL,
	`verificationStatus` varchar(32) NOT NULL DEFAULT 'pending',
	`payload` json,
	`receivedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payment_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `payment_event_provider_key_uq` UNIQUE(`provider`,`eventKey`)
);
--> statement-breakpoint
CREATE TABLE `payment_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupId` int,
	`memberId` int,
	`contributionId` int,
	`provider` enum('paystack','sandbox') NOT NULL,
	`providerReference` varchar(128) NOT NULL,
	`providerTransactionId` varchar(128),
	`method` enum('mpesa','pesalink','card','bank','unknown') NOT NULL DEFAULT 'unknown',
	`phone` varchar(32),
	`amountMinor` bigint NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'KES',
	`status` enum('pending','initiated','processing','confirmed','settled','failed','reversed','unmatched') NOT NULL DEFAULT 'pending',
	`checkoutUrl` text,
	`metadata` json,
	`testOnly` boolean NOT NULL DEFAULT false,
	`confirmedAt` timestamp,
	`settledAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payment_transactions_id` PRIMARY KEY(`id`),
	CONSTRAINT `payment_provider_reference_uq` UNIQUE(`providerReference`),
	CONSTRAINT `payment_provider_transaction_uq` UNIQUE(`providerTransactionId`)
);
--> statement-breakpoint
CREATE TABLE `payout_approvals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`payoutId` int NOT NULL,
	`groupId` int NOT NULL,
	`userId` int NOT NULL,
	`decision` enum('approved','rejected') NOT NULL,
	`transactionId` varchar(64) NOT NULL,
	`amountMinor` bigint NOT NULL,
	`beneficiaryMemberId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payout_approvals_id` PRIMARY KEY(`id`),
	CONSTRAINT `payout_approval_payout_user_uq` UNIQUE(`payoutId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `payout_schedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupId` int NOT NULL,
	`contributionScheduleId` int NOT NULL,
	`periodKey` varchar(32) NOT NULL,
	`beneficiaryMemberId` int NOT NULL,
	`sequence` int NOT NULL,
	`payoutDate` timestamp NOT NULL,
	`expectedAmountMinor` bigint NOT NULL,
	`status` enum('scheduled','eligible','paid','deferred') NOT NULL DEFAULT 'scheduled',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payout_schedules_id` PRIMARY KEY(`id`),
	CONSTRAINT `payout_schedule_group_sequence_uq` UNIQUE(`groupId`,`sequence`)
);
--> statement-breakpoint
CREATE TABLE `payouts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`transactionId` varchar(64) NOT NULL,
	`groupId` int NOT NULL,
	`scheduleId` int,
	`beneficiaryMemberId` int NOT NULL,
	`amountMinor` bigint NOT NULL,
	`status` enum('draft','pending_approval','approved_waiting_funds','approved','processing','settled','failed','cancelled') NOT NULL DEFAULT 'pending_approval',
	`initiatedByUserId` int NOT NULL,
	`providerReference` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payouts_id` PRIMARY KEY(`id`),
	CONSTRAINT `payout_transaction_id_uq` UNIQUE(`transactionId`),
	CONSTRAINT `payout_schedule_unique_uq` UNIQUE(`scheduleId`)
);
--> statement-breakpoint
CREATE TABLE `reconciliation_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupId` int NOT NULL,
	`paymentId` int NOT NULL,
	`contributionId` int,
	`actorUserId` int,
	`action` enum('matched','rejected','reversed') NOT NULL,
	`reason` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reconciliation_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_security` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`encryptedTotpSecret` text,
	`totpEnabled` boolean NOT NULL DEFAULT false,
	`confirmedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_security_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_security_user_uq` UNIQUE(`userId`)
);
--> statement-breakpoint
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_groupId_groups_id_fk` FOREIGN KEY (`groupId`) REFERENCES `groups`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_actorUserId_users_id_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contribution_schedules` ADD CONSTRAINT `contribution_schedules_groupId_groups_id_fk` FOREIGN KEY (`groupId`) REFERENCES `groups`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contributions` ADD CONSTRAINT `contributions_groupId_groups_id_fk` FOREIGN KEY (`groupId`) REFERENCES `groups`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contributions` ADD CONSTRAINT `contributions_memberId_group_members_id_fk` FOREIGN KEY (`memberId`) REFERENCES `group_members`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contributions` ADD CONSTRAINT `contributions_scheduleId_contribution_schedules_id_fk` FOREIGN KEY (`scheduleId`) REFERENCES `contribution_schedules`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `custodian_accounts` ADD CONSTRAINT `custodian_accounts_groupId_groups_id_fk` FOREIGN KEY (`groupId`) REFERENCES `groups`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `group_members` ADD CONSTRAINT `group_members_groupId_groups_id_fk` FOREIGN KEY (`groupId`) REFERENCES `groups`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `group_members` ADD CONSTRAINT `group_members_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `group_members` ADD CONSTRAINT `group_members_roleId_group_roles_id_fk` FOREIGN KEY (`roleId`) REFERENCES `group_roles`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `group_roles` ADD CONSTRAINT `group_roles_groupId_groups_id_fk` FOREIGN KEY (`groupId`) REFERENCES `groups`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `group_settings` ADD CONSTRAINT `group_settings_groupId_groups_id_fk` FOREIGN KEY (`groupId`) REFERENCES `groups`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `groups` ADD CONSTRAINT `groups_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `guarantors` ADD CONSTRAINT `guarantors_applicationId_loan_applications_id_fk` FOREIGN KEY (`applicationId`) REFERENCES `loan_applications`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `guarantors` ADD CONSTRAINT `guarantors_guarantorMemberId_group_members_id_fk` FOREIGN KEY (`guarantorMemberId`) REFERENCES `group_members`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `journal_entries` ADD CONSTRAINT `journal_entries_groupId_groups_id_fk` FOREIGN KEY (`groupId`) REFERENCES `groups`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `journal_entries` ADD CONSTRAINT `journal_entries_reversalOfId_journal_entries_id_fk` FOREIGN KEY (`reversalOfId`) REFERENCES `journal_entries`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `journal_entries` ADD CONSTRAINT `journal_entries_postedByUserId_users_id_fk` FOREIGN KEY (`postedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `journal_lines` ADD CONSTRAINT `journal_lines_journalEntryId_journal_entries_id_fk` FOREIGN KEY (`journalEntryId`) REFERENCES `journal_entries`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `journal_lines` ADD CONSTRAINT `journal_lines_accountId_ledger_accounts_id_fk` FOREIGN KEY (`accountId`) REFERENCES `ledger_accounts`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ledger_accounts` ADD CONSTRAINT `ledger_accounts_groupId_groups_id_fk` FOREIGN KEY (`groupId`) REFERENCES `groups`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `loan_applications` ADD CONSTRAINT `loan_applications_groupId_groups_id_fk` FOREIGN KEY (`groupId`) REFERENCES `groups`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `loan_applications` ADD CONSTRAINT `loan_applications_memberId_group_members_id_fk` FOREIGN KEY (`memberId`) REFERENCES `group_members`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `loan_applications` ADD CONSTRAINT `loan_applications_productId_loan_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `loan_products`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `loan_applications` ADD CONSTRAINT `loan_applications_reviewedByUserId_users_id_fk` FOREIGN KEY (`reviewedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `loan_products` ADD CONSTRAINT `loan_products_groupId_groups_id_fk` FOREIGN KEY (`groupId`) REFERENCES `groups`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `loan_repayments` ADD CONSTRAINT `loan_repayments_groupId_groups_id_fk` FOREIGN KEY (`groupId`) REFERENCES `groups`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `loan_repayments` ADD CONSTRAINT `loan_repayments_loanId_loans_id_fk` FOREIGN KEY (`loanId`) REFERENCES `loans`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `loan_repayments` ADD CONSTRAINT `loan_repayments_paymentId_payment_transactions_id_fk` FOREIGN KEY (`paymentId`) REFERENCES `payment_transactions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `loans` ADD CONSTRAINT `loans_groupId_groups_id_fk` FOREIGN KEY (`groupId`) REFERENCES `groups`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `loans` ADD CONSTRAINT `loans_applicationId_loan_applications_id_fk` FOREIGN KEY (`applicationId`) REFERENCES `loan_applications`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `loans` ADD CONSTRAINT `loans_memberId_group_members_id_fk` FOREIGN KEY (`memberId`) REFERENCES `group_members`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_groupId_groups_id_fk` FOREIGN KEY (`groupId`) REFERENCES `groups`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment_events` ADD CONSTRAINT `payment_events_paymentId_payment_transactions_id_fk` FOREIGN KEY (`paymentId`) REFERENCES `payment_transactions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment_transactions` ADD CONSTRAINT `payment_transactions_groupId_groups_id_fk` FOREIGN KEY (`groupId`) REFERENCES `groups`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment_transactions` ADD CONSTRAINT `payment_transactions_memberId_group_members_id_fk` FOREIGN KEY (`memberId`) REFERENCES `group_members`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment_transactions` ADD CONSTRAINT `payment_transactions_contributionId_contributions_id_fk` FOREIGN KEY (`contributionId`) REFERENCES `contributions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payout_approvals` ADD CONSTRAINT `payout_approvals_payoutId_payouts_id_fk` FOREIGN KEY (`payoutId`) REFERENCES `payouts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payout_approvals` ADD CONSTRAINT `payout_approvals_groupId_groups_id_fk` FOREIGN KEY (`groupId`) REFERENCES `groups`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payout_approvals` ADD CONSTRAINT `payout_approvals_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payout_approvals` ADD CONSTRAINT `payout_approvals_beneficiaryMemberId_group_members_id_fk` FOREIGN KEY (`beneficiaryMemberId`) REFERENCES `group_members`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payout_schedules` ADD CONSTRAINT `payout_schedules_groupId_groups_id_fk` FOREIGN KEY (`groupId`) REFERENCES `groups`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payout_schedules` ADD CONSTRAINT `payout_schedule_contribution_schedule_fk` FOREIGN KEY (`contributionScheduleId`) REFERENCES `contribution_schedules`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payout_schedules` ADD CONSTRAINT `payout_schedules_beneficiaryMemberId_group_members_id_fk` FOREIGN KEY (`beneficiaryMemberId`) REFERENCES `group_members`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payouts` ADD CONSTRAINT `payouts_groupId_groups_id_fk` FOREIGN KEY (`groupId`) REFERENCES `groups`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payouts` ADD CONSTRAINT `payouts_scheduleId_payout_schedules_id_fk` FOREIGN KEY (`scheduleId`) REFERENCES `payout_schedules`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payouts` ADD CONSTRAINT `payouts_beneficiaryMemberId_group_members_id_fk` FOREIGN KEY (`beneficiaryMemberId`) REFERENCES `group_members`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payouts` ADD CONSTRAINT `payouts_initiatedByUserId_users_id_fk` FOREIGN KEY (`initiatedByUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reconciliation_records` ADD CONSTRAINT `reconciliation_records_groupId_groups_id_fk` FOREIGN KEY (`groupId`) REFERENCES `groups`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reconciliation_records` ADD CONSTRAINT `reconciliation_records_paymentId_payment_transactions_id_fk` FOREIGN KEY (`paymentId`) REFERENCES `payment_transactions`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reconciliation_records` ADD CONSTRAINT `reconciliation_records_contributionId_contributions_id_fk` FOREIGN KEY (`contributionId`) REFERENCES `contributions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reconciliation_records` ADD CONSTRAINT `reconciliation_records_actorUserId_users_id_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_security` ADD CONSTRAINT `user_security_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `audit_group_date_idx` ON `audit_logs` (`groupId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `audit_entity_idx` ON `audit_logs` (`entityType`,`entityId`);--> statement-breakpoint
CREATE INDEX `contribution_schedules_group_active_idx` ON `contribution_schedules` (`groupId`,`active`);--> statement-breakpoint
CREATE INDEX `contributions_group_period_idx` ON `contributions` (`groupId`,`periodKey`);--> statement-breakpoint
CREATE INDEX `contributions_member_idx` ON `contributions` (`memberId`);--> statement-breakpoint
CREATE INDEX `custodian_group_verified_idx` ON `custodian_accounts` (`groupId`,`verifiedAt`);--> statement-breakpoint
CREATE INDEX `group_members_group_idx` ON `group_members` (`groupId`);--> statement-breakpoint
CREATE INDEX `group_members_user_idx` ON `group_members` (`userId`);--> statement-breakpoint
CREATE INDEX `groups_created_by_idx` ON `groups` (`createdByUserId`);--> statement-breakpoint
CREATE INDEX `journal_entries_group_date_idx` ON `journal_entries` (`groupId`,`postedAt`);--> statement-breakpoint
CREATE INDEX `journal_lines_account_idx` ON `journal_lines` (`accountId`);--> statement-breakpoint
CREATE INDEX `loan_applications_group_status_idx` ON `loan_applications` (`groupId`,`status`);--> statement-breakpoint
CREATE INDEX `loan_applications_member_idx` ON `loan_applications` (`memberId`);--> statement-breakpoint
CREATE INDEX `loan_products_group_active_idx` ON `loan_products` (`groupId`,`active`);--> statement-breakpoint
CREATE INDEX `loan_repayments_group_loan_idx` ON `loan_repayments` (`groupId`,`loanId`);--> statement-breakpoint
CREATE INDEX `loans_group_status_idx` ON `loans` (`groupId`,`status`);--> statement-breakpoint
CREATE INDEX `payment_event_reference_idx` ON `payment_events` (`providerReference`);--> statement-breakpoint
CREATE INDEX `payment_group_status_idx` ON `payment_transactions` (`groupId`,`status`);--> statement-breakpoint
CREATE INDEX `payment_contribution_idx` ON `payment_transactions` (`contributionId`);--> statement-breakpoint
CREATE INDEX `payout_approval_group_idx` ON `payout_approvals` (`groupId`);--> statement-breakpoint
CREATE INDEX `payout_schedule_group_date_idx` ON `payout_schedules` (`groupId`,`payoutDate`);--> statement-breakpoint
CREATE INDEX `payout_schedule_contribution_period_idx` ON `payout_schedules` (`groupId`,`contributionScheduleId`,`periodKey`);--> statement-breakpoint
CREATE INDEX `payout_group_status_idx` ON `payouts` (`groupId`,`status`);--> statement-breakpoint
CREATE INDEX `reconciliation_group_payment_idx` ON `reconciliation_records` (`groupId`,`paymentId`);
