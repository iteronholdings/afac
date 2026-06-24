CREATE TABLE `campaigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(200) NOT NULL,
	`category` varchar(50),
	`keyword` varchar(200) NOT NULL,
	`thumbnailUrl` text,
	`productUrl` text,
	`description` text,
	`productPrice` int NOT NULL DEFAULT 0,
	`commission` int NOT NULL DEFAULT 0,
	`slots` int NOT NULL DEFAULT 1,
	`status` enum('open','closed') NOT NULL DEFAULT 'open',
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `campaigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `participations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`userId` int NOT NULL,
	`status` enum('applied','purchased','reviewed','approved','paid','rejected') NOT NULL DEFAULT 'applied',
	`purchaseProofUrl` text,
	`reviewProofUrl` text,
	`adminMemo` text,
	`appliedAt` timestamp NOT NULL DEFAULT (now()),
	`purchasedAt` timestamp,
	`reviewedAt` timestamp,
	`approvedAt` timestamp,
	`paidAt` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `participations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`loginId` varchar(64),
	`passwordHash` varchar(255),
	`fullName` varchar(100),
	`phone` varchar(32),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`),
	CONSTRAINT `users_loginId_unique` UNIQUE(`loginId`)
);
