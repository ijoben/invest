-- ==============================================================================
-- FGT PRO INVESTMENT SYSTEM - CPANEL MYSQL DATABASE SCHEMA
-- Version: 2.0 (Official Production Release)
-- Target Server: MySQL 5.7+ / MySQL 8.0+ / MariaDB 10.3+
-- ==============================================================================

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+07:00";

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

-- ------------------------------------------------------------------------------
-- 1. Table: fgt_system_state (High-Performance Realtime JSON State Store)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `fgt_system_state` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `state_key` VARCHAR(64) NOT NULL UNIQUE,
  `data_json` LONGTEXT NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 2. Table: users (Member & Admin Records)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `username` VARCHAR(64) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `salt` VARCHAR(64) NOT NULL,
  `full_name` VARCHAR(128) DEFAULT NULL,
  `email` VARCHAR(128) DEFAULT NULL,
  `phone` VARCHAR(32) DEFAULT NULL,
  `city` VARCHAR(64) DEFAULT NULL,
  `wallet_balance` BIGINT(20) DEFAULT 0,
  `affiliate_balance` BIGINT(20) DEFAULT 0,
  `points` INT(11) DEFAULT 0,
  `referral_code` VARCHAR(32) NOT NULL UNIQUE,
  `referred_by` VARCHAR(32) DEFAULT NULL,
  `is_blocked` TINYINT(1) DEFAULT 0,
  `blocked_reason` TEXT DEFAULT NULL,
  `blocked_at` DATETIME DEFAULT NULL,
  `bank_name` VARCHAR(64) DEFAULT NULL,
  `account_number` VARCHAR(64) DEFAULT NULL,
  `account_holder` VARCHAR(128) DEFAULT NULL,
  `role` ENUM('admin', 'member') DEFAULT 'member',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 3. Table: investments (Active & Completed Investment Plans)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `investments` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(64) NOT NULL,
  `plan_id` VARCHAR(64) NOT NULL,
  `plan_name` VARCHAR(128) NOT NULL,
  `capital` BIGINT(20) NOT NULL,
  `min_rate` DECIMAL(5,2) DEFAULT 0.00,
  `max_rate` DECIMAL(5,2) DEFAULT 0.00,
  `total_profit_earned` BIGINT(20) DEFAULT 0,
  `pending_profit_claim` BIGINT(20) DEFAULT 0,
  `days_elapsed` INT(11) DEFAULT 0,
  `duration_days` INT(11) DEFAULT 30,
  `status` ENUM('active', 'completed', 'refunded') DEFAULT 'active',
  `start_date` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `last_profit_yield_date` DATETIME DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_user_status` (`user_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 4. Table: transactions (Deposits, Withdrawals & Payouts)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `transactions` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(64) NOT NULL,
  `username` VARCHAR(64) NOT NULL,
  `type` ENUM('deposit', 'withdraw', 'profit_claim', 'sponsor_bonus', 'rabat_bonus', 'plan_buy', 'plan_refund') NOT NULL,
  `amount` BIGINT(20) NOT NULL,
  `net_amount` BIGINT(20) DEFAULT NULL,
  `status` ENUM('pending', 'approved', 'rejected', 'completed') DEFAULT 'pending',
  `payment_method` VARCHAR(64) DEFAULT NULL,
  `wallet_source` VARCHAR(64) DEFAULT NULL,
  `destination_account` VARCHAR(128) DEFAULT NULL,
  `txid` VARCHAR(128) DEFAULT NULL,
  `unique_code` VARCHAR(32) DEFAULT NULL,
  `proof_image` LONGTEXT DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_trx_user` (`user_id`),
  INDEX `idx_trx_type_status` (`type`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 5. Table: settings (Platform & Business Configuration)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `settings` (
  `setting_key` VARCHAR(64) NOT NULL PRIMARY KEY,
  `setting_value` LONGTEXT NOT NULL,
  `description` VARCHAR(255) DEFAULT NULL,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
