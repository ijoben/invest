import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DB } from '../js/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.join(__dirname, '..', 'database.sql');

const cleanState = DB.get();
// Explicitly ensure 0 demo artifacts
cleanState.users = [
  {
    id: 'usr-admin',
    username: 'admin',
    fullName: 'System Administrator',
    email: 'admin@autotrading.my.id',
    phone: '081299990000',
    password: 'admin',
    role: 'admin',
    walletBalance: 0,
    affiliateBalance: 0,
    points: 0,
    referralCode: 'ADMINVIP',
    referredBy: null,
    kycStatus: 'verified',
    isBlocked: false,
    blockedReason: '',
    blockedAt: null,
    blockHistory: [],
    registeredAt: '2026-01-01T00:00:00.000Z'
  }
];
cleanState.investments = [];
cleanState.transactions = [];
cleanState.redemptions = [];
cleanState.currentSession = null;

const cleanJsonStr = JSON.stringify(cleanState).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const settingsJsonStr = JSON.stringify(cleanState.settings).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

const sqlContent = `-- ==============================================================================
-- AUTOTRADING INVESTMENT SYSTEM - CPANEL MYSQL DATABASE SCHEMA & SEED DATA
-- Version: 2.2 (Pure MySQL / phpMyAdmin Production Edition - Clean Zero Demo)
-- Target Server: MySQL 5.7+ / MySQL 8.0+ / MariaDB 10.3+
-- ==============================================================================

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+07:00";

-- ------------------------------------------------------------------------------
-- 1. Table: autotrading_system_state (Primary Unified JSON State Store)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS \`autotrading_system_state\` (
  \`id\` INT(11) NOT NULL AUTO_INCREMENT,
  \`state_key\` VARCHAR(64) NOT NULL UNIQUE,
  \`data_json\` LONGTEXT NOT NULL,
  \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Legacy table alias (fgt_system_state) - kept for backward compatibility
CREATE TABLE IF NOT EXISTS \`fgt_system_state\` (
  \`id\` INT(11) NOT NULL AUTO_INCREMENT,
  \`state_key\` VARCHAR(64) NOT NULL UNIQUE,
  \`data_json\` LONGTEXT NOT NULL,
  \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 2. Table: users (Member & Admin Relational Records)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS \`users\` (
  \`id\` VARCHAR(64) NOT NULL PRIMARY KEY,
  \`username\` VARCHAR(64) NOT NULL UNIQUE,
  \`password_hash\` VARCHAR(255) NOT NULL,
  \`salt\` VARCHAR(64) DEFAULT "",
  \`full_name\` VARCHAR(128) DEFAULT NULL,
  \`email\` VARCHAR(128) DEFAULT NULL,
  \`phone\` VARCHAR(32) DEFAULT NULL,
  \`city\` VARCHAR(64) DEFAULT NULL,
  \`wallet_balance\` BIGINT(20) DEFAULT 0,
  \`affiliate_balance\` BIGINT(20) DEFAULT 0,
  \`points\` INT(11) DEFAULT 0,
  \`referral_code\` VARCHAR(32) NOT NULL UNIQUE,
  \`referred_by\` VARCHAR(32) DEFAULT NULL,
  \`is_blocked\` TINYINT(1) DEFAULT 0,
  \`blocked_reason\` TEXT DEFAULT NULL,
  \`blocked_at\` DATETIME DEFAULT NULL,
  \`bank_name\` VARCHAR(64) DEFAULT NULL,
  \`account_number\` VARCHAR(64) DEFAULT NULL,
  \`account_holder\` VARCHAR(128) DEFAULT NULL,
  \`role\` VARCHAR(32) DEFAULT "member",
  \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 3. Table: investments (Active & Completed Investment Plans)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS \`investments\` (
  \`id\` VARCHAR(64) NOT NULL PRIMARY KEY,
  \`user_id\` VARCHAR(64) NOT NULL,
  \`plan_id\` VARCHAR(64) NOT NULL,
  \`plan_name\` VARCHAR(128) NOT NULL,
  \`capital\` BIGINT(20) NOT NULL,
  \`min_rate\` DECIMAL(5,2) DEFAULT 0.00,
  \`max_rate\` DECIMAL(5,2) DEFAULT 0.00,
  \`total_profit_earned\` BIGINT(20) DEFAULT 0,
  \`pending_profit_claim\` BIGINT(20) DEFAULT 0,
  \`days_elapsed\` INT(11) DEFAULT 0,
  \`duration_days\` INT(11) DEFAULT 30,
  \`status\` VARCHAR(32) DEFAULT "active",
  \`start_date\` DATETIME DEFAULT CURRENT_TIMESTAMP,
  \`last_profit_yield_date\` DATETIME DEFAULT NULL,
  \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX \`idx_user_status\` (\`user_id\`, \`status\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 4. Table: transactions (Deposits, Withdrawals & Payouts)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS \`transactions\` (
  \`id\` VARCHAR(64) NOT NULL PRIMARY KEY,
  \`user_id\` VARCHAR(64) NOT NULL,
  \`username\` VARCHAR(64) NOT NULL,
  \`type\` VARCHAR(32) NOT NULL,
  \`amount\` BIGINT(20) NOT NULL,
  \`net_amount\` BIGINT(20) DEFAULT NULL,
  \`status\` VARCHAR(32) DEFAULT "pending",
  \`payment_method\` VARCHAR(64) DEFAULT NULL,
  \`wallet_source\` VARCHAR(64) DEFAULT NULL,
  \`destination_account\` VARCHAR(128) DEFAULT NULL,
  \`txid\` VARCHAR(128) DEFAULT NULL,
  \`unique_code\` VARCHAR(32) DEFAULT NULL,
  \`proof_image\` LONGTEXT DEFAULT NULL,
  \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX \`idx_trx_user\` (\`user_id\`),
  INDEX \`idx_trx_type_status\` (\`type\`, \`status\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 5. Table: settings (Platform & Business Configuration)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS \`settings\` (
  \`setting_key\` VARCHAR(64) NOT NULL PRIMARY KEY,
  \`setting_value\` LONGTEXT NOT NULL,
  \`description\` VARCHAR(255) DEFAULT NULL,
  \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==============================================================================
-- SEED DATA (INITIAL REAL RECORDS FOR PHPMYADMIN - CLEAN PRODUCTION)
-- ==============================================================================

-- 1. Users Seed (Master Administrator Only - Balances 0)
INSERT INTO \`users\` (\`id\`, \`username\`, \`password_hash\`, \`salt\`, \`full_name\`, \`email\`, \`phone\`, \`city\`, \`wallet_balance\`, \`affiliate_balance\`, \`points\`, \`referral_code\`, \`referred_by\`, \`is_blocked\`, \`bank_name\`, \`account_number\`, \`account_holder\`, \`role\`, \`created_at\`) VALUES
('usr-admin', 'admin', 'admin', '', 'System Administrator', 'admin@autotrading.my.id', '081299990000', 'Jakarta', 0, 0, 0, 'ADMINVIP', NULL, 0, '', '', '', 'admin', '2026-01-01 00:00:00')
ON DUPLICATE KEY UPDATE \`username\` = VALUES(\`username\`);

-- 2. Investments Seed: Empty in Production (No demo records)
-- No demo investments

-- 3. Transactions Seed: Empty in Production (No demo records)
-- No demo transactions

-- 4. Settings Seed
INSERT INTO \`settings\` (\`setting_key\`, \`setting_value\`, \`description\`) VALUES
('general_settings', '${settingsJsonStr}', 'Platform global settings, withdraw rules, and commission rates')
ON DUPLICATE KEY UPDATE \`setting_value\` = VALUES(\`setting_value\`);

-- 5. Unified System State Seed (Clean Production)
INSERT INTO \`autotrading_system_state\` (\`state_key\`, \`data_json\`) VALUES
('main_state', '${cleanJsonStr}')
ON DUPLICATE KEY UPDATE \`data_json\` = VALUES(\`data_json\`);

INSERT INTO \`fgt_system_state\` (\`state_key\`, \`data_json\`) VALUES
('main_state', '${cleanJsonStr}')
ON DUPLICATE KEY UPDATE \`data_json\` = VALUES(\`data_json\`);

COMMIT;
`;

fs.writeFileSync(sqlPath, sqlContent, 'utf8');
console.log('✓ Clean Production database.sql generated successfully without demo artifacts!');
