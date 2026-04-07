CREATE TABLE `admin_users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`username` varchar(100) NOT NULL,
	`password` varchar(255) NOT NULL,
	`name` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `admin_users_id` PRIMARY KEY(`id`),
	CONSTRAINT `admin_users_username_unique` UNIQUE(`username`)
);
--> statement-breakpoint
ALTER TABLE `products` MODIFY COLUMN `category` enum('1linha-nacional','tailandesa-promocao','conj-calor-nacional','conj-calor-tailandesa','tailandesa','infantil','jogador-tailandesa','retro-tailandesa','conj-frio-tailandes','tailandesa-3xl','tailandesa-4xl') NOT NULL DEFAULT 'tailandesa';--> statement-breakpoint
ALTER TABLE `products` ADD `featuredSection` enum('destaque','mais-vendidos','nova-colecao');