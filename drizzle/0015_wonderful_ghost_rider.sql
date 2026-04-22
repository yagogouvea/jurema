CREATE TABLE `wa_ai_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`instanceId` int NOT NULL,
	`enabled` boolean NOT NULL DEFAULT false,
	`aiName` varchar(100) NOT NULL DEFAULT 'Ju',
	`personality` text,
	`businessContext` text,
	`greetingMessage` text,
	`awayMessage` text,
	`awayEnabled` boolean NOT NULL DEFAULT false,
	`awayStart` varchar(5),
	`awayEnd` varchar(5),
	`catalogLink` text,
	`groupLink` text,
	`instagramLink` text,
	`maxContextMessages` int NOT NULL DEFAULT 10,
	`responseDelayMin` int NOT NULL DEFAULT 1000,
	`responseDelayMax` int NOT NULL DEFAULT 3000,
	`escalateKeywords` json,
	`systemPrompt` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `wa_ai_config_id` PRIMARY KEY(`id`),
	CONSTRAINT `wa_ai_config_instanceId_unique` UNIQUE(`instanceId`)
);
--> statement-breakpoint
CREATE TABLE `wa_ai_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`action` enum('ai_enabled','ai_disabled','ai_responded','escalated_to_human','error') NOT NULL,
	`performedBy` varchar(100),
	`details` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `wa_ai_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wa_conversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`instanceId` int NOT NULL,
	`remoteJid` varchar(100) NOT NULL,
	`contactName` varchar(255),
	`contactPhone` varchar(20),
	`contactAvatar` text,
	`lastMessage` text,
	`lastMessageAt` timestamp,
	`unreadCount` int NOT NULL DEFAULT 0,
	`aiEnabled` boolean NOT NULL DEFAULT true,
	`aiDisabledBy` varchar(100),
	`aiDisabledAt` timestamp,
	`status` enum('open','resolved','archived') NOT NULL DEFAULT 'open',
	`tags` json,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `wa_conversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wa_instances` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`phone` varchar(20) NOT NULL,
	`instanceId` varchar(100),
	`apiKey` varchar(255),
	`status` enum('disconnected','connecting','connected','error') NOT NULL DEFAULT 'disconnected',
	`webhookUrl` varchar(500),
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `wa_instances_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wa_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`instanceId` int NOT NULL,
	`messageId` varchar(255),
	`fromMe` boolean NOT NULL DEFAULT false,
	`senderType` enum('ai','human','customer') NOT NULL DEFAULT 'customer',
	`senderName` varchar(100),
	`type` enum('text','image','audio','video','document','sticker','location','contact','reaction') NOT NULL DEFAULT 'text',
	`content` text,
	`mediaUrl` text,
	`mediaCaption` text,
	`quotedMessageId` varchar(255),
	`status` enum('pending','sent','delivered','read','failed') NOT NULL DEFAULT 'pending',
	`timestamp` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `wa_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wa_quick_replies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`instanceId` int,
	`title` varchar(100) NOT NULL,
	`shortcut` varchar(50),
	`content` text NOT NULL,
	`category` varchar(50),
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `wa_quick_replies_id` PRIMARY KEY(`id`)
);
