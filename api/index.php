<?php
/**
 * AUTOTRADING - CPANEL MYSQL BACKEND REST API
 * Handles database read, write, and synchronization with phpMyAdmin / MySQL.
 * Fully synchronized relational tables (users, transactions, investments, settings)
 * and unified atomic state with smart-merge protection against race conditions.
 */

require_once __DIR__ . '/config.php';

$action = isset($_GET['action']) ? trim($_GET['action']) : 'get';
$pdo = getDbConnection();

// Normalize payment method strings and strip redundant/nested parentheses
function cleanPaymentMethodStr($str) {
    if (!$str || !is_string($str)) return $str;
    $s = trim($str);

    // Specific bank normalization
    if (stripos($s, 'Bank Central Asia') !== false || stripos($s, 'BCA') !== false) {
        if (preg_match('/BCA\s*\(([0-9]+)\)/i', $s, $m)) {
            return 'BCA (' . $m[1] . ')';
        }
        if (stripos($s, 'Deposit') !== false || stripos($s, 'Transfer') !== false || stripos($s, 'Bank') !== false) {
            return 'Transfer Bank BCA';
        }
    }
    if (stripos($s, 'Bank Rakyat Indonesia') !== false || stripos($s, 'BRI') !== false) {
        if (preg_match('/BRI\s*\(([0-9]+)\)/i', $s, $m)) {
            return 'BRI (' . $m[1] . ')';
        }
        if (stripos($s, 'Deposit') !== false || stripos($s, 'Transfer') !== false || stripos($s, 'Bank') !== false) {
            return 'Transfer Bank BRI';
        }
    }
    if (stripos($s, 'Bank Negara Indonesia') !== false || stripos($s, 'BNI') !== false) {
        if (preg_match('/BNI\s*\(([0-9]+)\)/i', $s, $m)) {
            return 'BNI (' . $m[1] . ')';
        }
        if (stripos($s, 'Deposit') !== false || stripos($s, 'Transfer') !== false || stripos($s, 'Bank') !== false) {
            return 'Transfer Bank BNI';
        }
    }
    if (stripos($s, 'Bank Mandiri') !== false || stripos($s, 'Mandiri') !== false) {
        if (preg_match('/Mandiri\s*\(([0-9]+)\)/i', $s, $m)) {
            return 'Mandiri (' . $m[1] . ')';
        }
        if (stripos($s, 'Deposit') !== false || stripos($s, 'Transfer') !== false || stripos($s, 'Bank') !== false) {
            return 'Transfer Bank Mandiri';
        }
    }

    // Clean duplicate/trailing parentheses e.g. (BCA))) -> BCA, ((BCA)) -> BCA
    $s = preg_replace('/\)+$/', ')', $s);
    $s = preg_replace('/\(+/', '(', $s);
    $s = preg_replace('/\)+/', ')', $s);
    $s = str_replace(['((', '))'], ['(', ')'], $s);

    return trim($s);
}

// ---------------------------------------------------------------------------
// Reading a LONGTEXT state blob (driver 1MB fetch cap workaround)
// ---------------------------------------------------------------------------
// The pdo_mysql/mysqlnd driver on this host returns AT MOST 1,048,576 bytes for
// a single fetched column. The state JSON is several MB long, so a plain
// `SELECT data_json` arrives truncated -> json_decode() fails -> action=get falls
// back to relational-only data and every JSON-only section (plans, signals,
// rewards/redeem, running text, testimonials) vanishes after a reload.
// Reading the value in slices well below that cap works (verified on production).
define('STATE_READ_CHUNK', 900000);

function readStateJson($pdo, $table) {
    if (!$pdo) return null;
    $table = preg_replace('/[^a-zA-Z0-9_]/', '', (string)$table);
    if ($table === '') return null;
    $where = "WHERE `state_key` = 'main_state' LIMIT 1";
    try {
        $len = (int)$pdo->query("SELECT LENGTH(`data_json`) FROM `{$table}` {$where}")->fetchColumn();
    } catch (Exception $eLen) {
        return null;
    }
    if ($len <= 0) return null;
    if ($len <= STATE_READ_CHUNK) {
        $raw = $pdo->query("SELECT `data_json` FROM `{$table}` {$where}")->fetchColumn();
        return ($raw === false || $raw === null) ? null : (string)$raw;
    }
    $raw = '';
    for ($off = 1; $off <= $len; $off += STATE_READ_CHUNK) {
        $piece = $pdo->query("SELECT SUBSTRING(`data_json`, {$off}, " . STATE_READ_CHUNK . ") FROM `{$table}` {$where}")->fetchColumn();
        if ($piece === false || $piece === null) break;
        $raw .= (string)$piece;
        if (strlen((string)$piece) < STATE_READ_CHUNK) break;
    }
    return $raw === '' ? null : $raw;
}

// Auto-create all required database tables if not existing
function ensureTablesExist($pdo) {
    if (!$pdo) return false;
    try {
        // 1. Unified state table
        $pdo->exec("CREATE TABLE IF NOT EXISTS `autotrading_system_state` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `state_key` VARCHAR(64) NOT NULL UNIQUE,
            `data_json` LONGTEXT NOT NULL,
            `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");

        $pdo->exec("CREATE TABLE IF NOT EXISTS `fgt_system_state` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `state_key` VARCHAR(64) NOT NULL UNIQUE,
            `data_json` LONGTEXT NOT NULL,
            `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");

        // Migration: guarantee data_json is LONGTEXT on every install. Some legacy
        // databases created it as TEXT (64KB) and MySQL in non-strict mode silently
        // truncates larger JSON, which then fails to decode in action=get - the API
        // falls back to relational-only data and admin edits (plans, signals,
        // rewards, running text) appear to revert after a refresh.
        try {
            foreach (['autotrading_system_state', 'fgt_system_state'] as $stTable) {
                $colType = $pdo->query(
                    "SELECT `DATA_TYPE` FROM `INFORMATION_SCHEMA`.`COLUMNS` " .
                    "WHERE `TABLE_SCHEMA` = DATABASE() AND `TABLE_NAME` = '" . $stTable . "' " .
                    "AND `COLUMN_NAME` = 'data_json'"
                )->fetchColumn();
                if ($colType && strtolower((string)$colType) !== 'longtext') {
                    $pdo->exec("ALTER TABLE `" . $stTable . "` MODIFY `data_json` LONGTEXT NOT NULL");
                    error_log('ensureTablesExist: migrated ' . $stTable . '.data_json from ' . $colType . ' to longtext');
                }
            }
        } catch (Exception $eStateCol) {}

        try {
            $countNew = (int)$pdo->query("SELECT COUNT(*) FROM `autotrading_system_state`")->fetchColumn();
            if ($countNew === 0) {
                $oldJson = readStateJson($pdo, 'fgt_system_state');
                if (!empty($oldJson)) {
                    $ins = $pdo->prepare("INSERT INTO `autotrading_system_state` (`state_key`, `data_json`) VALUES ('main_state', :dj)");
                    $ins->execute([':dj' => $oldJson]);
                }
            }
        } catch(PDOException $e) {}

        // 2. Relational Users table with explicit status column
        $pdo->exec("CREATE TABLE IF NOT EXISTS `users` (
            `id` VARCHAR(64) NOT NULL PRIMARY KEY,
            `username` VARCHAR(64) NOT NULL UNIQUE,
            `password_hash` VARCHAR(255) NOT NULL,
            `salt` VARCHAR(64) DEFAULT '',
            `full_name` VARCHAR(128) DEFAULT NULL,
            `email` VARCHAR(128) DEFAULT NULL,
            `phone` VARCHAR(32) DEFAULT NULL,
            `city` VARCHAR(64) DEFAULT NULL,
            `wallet_balance` BIGINT(20) DEFAULT 0,
            `affiliate_balance` BIGINT(20) DEFAULT 0,
            `points` INT(11) DEFAULT 0,
            `referral_code` VARCHAR(32) NOT NULL UNIQUE,
            `referred_by` VARCHAR(32) DEFAULT NULL,
            `status` VARCHAR(32) DEFAULT 'active',
            `is_blocked` TINYINT(1) DEFAULT 0,
            `blocked_reason` TEXT DEFAULT NULL,
            `blocked_at` DATETIME DEFAULT NULL,
            `bank_name` VARCHAR(64) DEFAULT NULL,
            `account_number` VARCHAR(64) DEFAULT NULL,
            `account_holder` VARCHAR(128) DEFAULT NULL,
            `role` VARCHAR(32) DEFAULT 'member',
            `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
            `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");

        // Ensure status column exists if table was previously created without it
        try {
            $colCheck = $pdo->query("SHOW COLUMNS FROM `users` LIKE 'status'")->fetch();
            if (!$colCheck) {
                $pdo->exec("ALTER TABLE `users` ADD COLUMN `status` VARCHAR(32) DEFAULT 'active' AFTER `referred_by`");
            }
        } catch(Exception $eCol) {}

        // Ensure daily_check_in column exists for permanent attendance streak persistence
        try {
            $colChk = $pdo->query("SHOW COLUMNS FROM `users` LIKE 'daily_check_in'")->fetch();
            if (!$colChk) {
                $pdo->exec("ALTER TABLE `users` ADD COLUMN `daily_check_in` LONGTEXT DEFAULT NULL AFTER `points`");
            }
        } catch(Exception $eChk) {}

        // 3. Relational Investments table
        $pdo->exec("CREATE TABLE IF NOT EXISTS `investments` (
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
            `status` VARCHAR(32) DEFAULT 'active',
            `start_date` DATETIME DEFAULT CURRENT_TIMESTAMP,
            `last_profit_yield_date` DATETIME DEFAULT NULL,
            `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX `idx_user_status` (`user_id`, `status`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");

        // 4. Relational Transactions table
        $pdo->exec("CREATE TABLE IF NOT EXISTS `transactions` (
            `id` VARCHAR(64) NOT NULL PRIMARY KEY,
            `user_id` VARCHAR(64) NOT NULL,
            `username` VARCHAR(64) NOT NULL,
            `type` VARCHAR(32) NOT NULL,
            `amount` BIGINT(20) NOT NULL,
            `net_amount` BIGINT(20) DEFAULT NULL,
            `status` VARCHAR(32) DEFAULT 'pending',
            `payment_method` VARCHAR(64) DEFAULT NULL,
            `wallet_source` VARCHAR(64) DEFAULT NULL,
            `destination_account` VARCHAR(128) DEFAULT NULL,
            `txid` VARCHAR(128) DEFAULT NULL,
            `unique_code` VARCHAR(32) DEFAULT NULL,
            `proof_image` LONGTEXT DEFAULT NULL,
            `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX `idx_trx_user` (`user_id`),
            INDEX `idx_trx_type_status` (`type`, `status`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");

        // 5. Relational Settings table
        $pdo->exec("CREATE TABLE IF NOT EXISTS `settings` (
            `setting_key` VARCHAR(64) NOT NULL PRIMARY KEY,
            `setting_value` LONGTEXT NOT NULL,
            `description` VARCHAR(255) DEFAULT NULL,
            `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");

        // 6. Relational Banners table (Slider Carousel)
        $pdo->exec("CREATE TABLE IF NOT EXISTS `banners` (
            `id` VARCHAR(64) NOT NULL PRIMARY KEY,
            `title` VARCHAR(255) NOT NULL,
            `subtitle` TEXT DEFAULT NULL,
            `badge` VARCHAR(64) DEFAULT 'PROMO',
            `image_url` LONGTEXT NOT NULL,
            `action_url` VARCHAR(128) DEFAULT 'plans',
            `active` TINYINT(1) DEFAULT 1,
            `sort_order` INT(11) DEFAULT 0,
            `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
            `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");

        // 7. Relational Redemptions table (Point Loyalty Reward Redemptions)
        $pdo->exec("CREATE TABLE IF NOT EXISTS `redemptions` (
            `id` VARCHAR(64) NOT NULL PRIMARY KEY,
            `user_id` VARCHAR(64) NOT NULL,
            `username` VARCHAR(64) NOT NULL,
            `reward_id` VARCHAR(64) NOT NULL,
            `reward_name` VARCHAR(128) NOT NULL,
            `points_cost` INT(11) NOT NULL,
            `status` VARCHAR(32) DEFAULT 'pending',
            `target_account` VARCHAR(128) DEFAULT NULL,
            `notes` TEXT DEFAULT NULL,
            `redeemed_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
            `processed_at` DATETIME DEFAULT NULL,
            INDEX `idx_redemptions_user` (`user_id`),
            INDEX `idx_redemptions_status` (`status`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");

        // Column migrations for backward compatibility
        try {
            $colNote = $pdo->query("SHOW COLUMNS FROM `transactions` LIKE 'note'")->fetch();
            if (!$colNote) {
                $pdo->exec("ALTER TABLE `transactions` ADD COLUMN `note` TEXT DEFAULT NULL AFTER `proof_image`");
            }
        } catch(Exception $eNote) {}

        try {
            $colCapRet = $pdo->query("SHOW COLUMNS FROM `investments` LIKE 'capital_returned'")->fetch();
            if (!$colCapRet) {
                $pdo->exec("ALTER TABLE `investments` ADD COLUMN `capital_returned` TINYINT(1) DEFAULT 0 AFTER `duration_days`");
            }
        } catch(Exception $eCapRet) {}

        try {
            $colLpyd = $pdo->query("SHOW COLUMNS FROM `investments` LIKE 'last_profit_yield_date'")->fetch();
            if (!$colLpyd) {
                $pdo->exec("ALTER TABLE `investments` ADD COLUMN `last_profit_yield_date` DATETIME DEFAULT NULL AFTER `start_date`");
            }
        } catch(Exception $eLpyd) {}

        // Clean up duplicate check-in transactions if any (such as TX-CHK-392542)
        try {
            $pdo->exec("DELETE FROM `transactions` WHERE `id` = 'TX-CHK-392542'");
        } catch(Exception $eDelDup) {}

        // Clean up duplicate/nested parentheses in transactions table
        try {
            $pdo->exec("UPDATE `transactions` SET `payment_method` = 'Transfer Bank BCA' WHERE (`payment_method` LIKE '%Bank Central Asia%' OR `payment_method` LIKE '%(BCA)%') AND `type` = 'deposit'");
            $pdo->exec("UPDATE `transactions` SET `payment_method` = 'Transfer Bank BRI' WHERE (`payment_method` LIKE '%Bank Rakyat Indonesia%' OR `payment_method` LIKE '%(BRI)%') AND `type` = 'deposit'");
            $pdo->exec("UPDATE `transactions` SET `payment_method` = 'Transfer Bank BNI' WHERE (`payment_method` LIKE '%Bank Negara Indonesia%' OR `payment_method` LIKE '%(BNI)%') AND `type` = 'deposit'");
            $pdo->exec("UPDATE `transactions` SET `payment_method` = 'Transfer Bank Mandiri' WHERE (`payment_method` LIKE '%Bank Mandiri%' OR `payment_method` LIKE '%(Mandiri)%') AND `type` = 'deposit'");
        } catch(Exception $eCleanTrx) {}

        return true;
    } catch (Exception $e) {
        error_log('Error ensuring tables exist: ' . $e->getMessage());
        return false;
    }
}

// Synchronize relational tables in phpMyAdmin alongside JSON state
function syncRelationalTables($pdo, $parsed) {
    if (!$pdo || !is_array($parsed)) return;

    try {
        // Sync Users
        if (isset($parsed['users']) && is_array($parsed['users'])) {
            $userStmt = $pdo->prepare("
                INSERT INTO `users` (
                    `id`, `username`, `password_hash`, `salt`, `full_name`, `email`, `phone`, `city`,
                    `wallet_balance`, `affiliate_balance`, `points`, `daily_check_in`, `referral_code`, `referred_by`,
                    `status`, `is_blocked`, `blocked_reason`, `bank_name`, `account_number`, `account_holder`, `role`, `created_at`
                ) VALUES (
                    :id, :username, :password_hash, :salt, :full_name, :email, :phone, :city,
                    :wallet_balance, :affiliate_balance, :points, :daily_check_in, :referral_code, :referred_by,
                    :status, :is_blocked, :blocked_reason, :bank_name, :account_number, :account_holder, :role, :created_at
                ) ON DUPLICATE KEY UPDATE
                    `username` = VALUES(`username`),
                    `password_hash` = IF(VALUES(`password_hash`) = '' OR VALUES(`password_hash`) IS NULL, `password_hash`, VALUES(`password_hash`)),
                    `full_name` = VALUES(`full_name`),
                    `email` = VALUES(`email`),
                    `phone` = VALUES(`phone`),
                    `city` = VALUES(`city`),
                    `wallet_balance` = VALUES(`wallet_balance`),
                    `affiliate_balance` = VALUES(`affiliate_balance`),
                    `points` = VALUES(`points`),
                    `daily_check_in` = VALUES(`daily_check_in`),
                    `referral_code` = VALUES(`referral_code`),
                    `referred_by` = VALUES(`referred_by`),
                    `status` = VALUES(`status`),
                    `is_blocked` = VALUES(`is_blocked`),
                    `blocked_reason` = VALUES(`blocked_reason`),
                    `bank_name` = VALUES(`bank_name`),
                    `account_number` = VALUES(`account_number`),
                    `account_holder` = VALUES(`account_holder`),
                    `role` = VALUES(`role`),
                    `updated_at` = CURRENT_TIMESTAMP
            ");

            foreach ($parsed['users'] as $u) {
                if (empty($u['id']) || empty($u['username'])) continue;
                $bankAccount = $u['bankAccount'] ?? [];
                $isBlocked = !empty($u['isBlocked']) || (isset($u['status']) && $u['status'] === 'blocked') ? 1 : 0;
                $status = $isBlocked ? 'blocked' : ((!empty($u['isPendingVerification']) && empty($u['emailVerified'])) ? 'pending' : ($u['status'] ?? 'active'));
                $dailyCheckInJson = !empty($u['dailyCheckIn']) ? json_encode($u['dailyCheckIn'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) : null;
                
                $userStmt->execute([
                    ':id' => $u['id'],
                    ':username' => $u['username'],
                    ':password_hash' => !empty($u['password']) ? $u['password'] : (!empty($u['password_hash']) ? $u['password_hash'] : ''),
                    ':salt' => $u['salt'] ?? '',
                    ':full_name' => $u['fullName'] ?? $u['full_name'] ?? '',
                    ':email' => $u['email'] ?? '',
                    ':phone' => $u['phone'] ?? '',
                    ':city' => $u['city'] ?? '',
                    ':wallet_balance' => (int)($u['walletBalance'] ?? $u['wallet_balance'] ?? 0),
                    ':affiliate_balance' => (int)($u['affiliateBalance'] ?? $u['affiliate_balance'] ?? 0),
                    ':points' => (int)($u['points'] ?? 0),
                    ':daily_check_in' => $dailyCheckInJson,
                    ':referral_code' => $u['referralCode'] ?? $u['referral_code'] ?? $u['username'],
                    ':referred_by' => $u['referredBy'] ?? $u['referred_by'] ?? null,
                    ':status' => $status,
                    ':is_blocked' => $isBlocked,
                    ':blocked_reason' => $u['blockedReason'] ?? $u['blocked_reason'] ?? null,
                    ':bank_name' => $bankAccount['bankName'] ?? $u['bank_name'] ?? null,
                    ':account_number' => $bankAccount['accountNumber'] ?? $u['account_number'] ?? null,
                    ':account_holder' => $bankAccount['accountHolder'] ?? $u['account_holder'] ?? null,
                    ':role' => (($u['role'] ?? 'user') === 'admin') ? 'admin' : 'member',
                    ':created_at' => isset($u['registeredAt']) ? date('Y-m-d H:i:s', strtotime($u['registeredAt'])) : date('Y-m-d H:i:s')
                ]);
            }
        }

        // Sync Transactions
        if (isset($parsed['transactions']) && is_array($parsed['transactions'])) {
            $trxStmt = $pdo->prepare("
                INSERT INTO `transactions` (
                    `id`, `user_id`, `username`, `type`, `amount`, `net_amount`, `status`,
                    `payment_method`, `wallet_source`, `destination_account`, `txid`, `unique_code`, `proof_image`, `note`, `created_at`
                ) VALUES (
                    :id, :user_id, :username, :type, :amount, :net_amount, :status,
                    :payment_method, :wallet_source, :destination_account, :txid, :unique_code, :proof_image, :note, :created_at
                ) ON DUPLICATE KEY UPDATE
                    `type` = VALUES(`type`),
                    `status` = VALUES(`status`),
                    `amount` = VALUES(`amount`),
                    `net_amount` = VALUES(`net_amount`),
                    `proof_image` = VALUES(`proof_image`),
                    `payment_method` = VALUES(`payment_method`),
                    `note` = VALUES(`note`)
            ");

            foreach ($parsed['transactions'] as $t) {
                if (empty($t['id']) || empty($t['userId'])) continue;
                $tType = !empty($t['type']) ? $t['type'] : 'deposit';

                // Format timestamp in Asia/Jakarta timezone
                $createdWib = date('Y-m-d H:i:s');
                if (!empty($t['createdAt'])) {
                    try {
                        $dt = new DateTime($t['createdAt']);
                        $dt->setTimezone(new DateTimeZone('Asia/Jakarta'));
                        $createdWib = $dt->format('Y-m-d H:i:s');
                    } catch(Exception $eT) {
                        $createdWib = date('Y-m-d H:i:s', strtotime($t['createdAt']));
                    }
                }

                $trxStmt->execute([
                    ':id' => $t['id'],
                    ':user_id' => $t['userId'],
                    ':username' => $t['username'] ?? '',
                    ':type' => $tType,
                    ':amount' => (int)($t['amount'] ?? 0),
                    ':net_amount' => isset($t['netAmount']) ? (int)$t['netAmount'] : (int)($t['amount'] ?? 0),
                    ':status' => $t['status'] ?? 'pending',
                    ':payment_method' => cleanPaymentMethodStr($t['paymentMethod'] ?? $t['method'] ?? null),
                    ':wallet_source' => $t['walletSource'] ?? null,
                    ':destination_account' => $t['destinationAccount'] ?? null,
                    ':txid' => $t['txid'] ?? null,
                    ':unique_code' => $t['uniqueCode'] ?? null,
                    ':proof_image' => $t['proofImage'] ?? null,
                    ':note' => $t['note'] ?? $t['description'] ?? null,
                    ':created_at' => $createdWib
                ]);
            }
        }

        // Sync Investments
        if (isset($parsed['investments']) && is_array($parsed['investments'])) {
            $invStmt = $pdo->prepare("
                INSERT INTO `investments` (
                    `id`, `user_id`, `plan_id`, `plan_name`, `capital`, `min_rate`, `max_rate`,
                    `total_profit_earned`, `pending_profit_claim`, `days_elapsed`, `duration_days`,
                    `capital_returned`, `status`, `start_date`, `last_profit_yield_date`, `created_at`
                ) VALUES (
                    :id, :user_id, :plan_id, :plan_name, :capital, :min_rate, :max_rate,
                    :total_profit_earned, :pending_profit_claim, :days_elapsed, :duration_days,
                    :capital_returned, :status, :start_date, :last_profit_yield_date, :created_at
                ) ON DUPLICATE KEY UPDATE
                    `total_profit_earned` = VALUES(`total_profit_earned`),
                    `pending_profit_claim` = VALUES(`pending_profit_claim`),
                    `days_elapsed` = VALUES(`days_elapsed`),
                    `capital_returned` = VALUES(`capital_returned`),
                    `last_profit_yield_date` = VALUES(`last_profit_yield_date`),
                    `status` = VALUES(`status`)
            ");

            foreach ($parsed['investments'] as $inv) {
                if (empty($inv['id']) || empty($inv['userId'])) continue;
                $lastYield = null;
                if (!empty($inv['lastProfitYieldDate'])) {
                    $lastYield = date('Y-m-d H:i:s', strtotime($inv['lastProfitYieldDate']));
                } elseif (!empty($inv['last_profit_yield_date'])) {
                    $lastYield = date('Y-m-d H:i:s', strtotime($inv['last_profit_yield_date']));
                }

                $invStmt->execute([
                    ':id' => $inv['id'],
                    ':user_id' => $inv['userId'],
                    ':plan_id' => $inv['planId'] ?? 'plan-standard',
                    ':plan_name' => $inv['planName'] ?? 'Standard Plan',
                    ':capital' => (int)($inv['capital'] ?? 0),
                    ':min_rate' => (float)($inv['minDailyProfit'] ?? $inv['minRate'] ?? 0),
                    ':max_rate' => (float)($inv['maxDailyProfit'] ?? $inv['maxRate'] ?? 0),
                    ':total_profit_earned' => (int)($inv['totalProfitEarned'] ?? 0),
                    ':pending_profit_claim' => (int)($inv['pendingProfitClaim'] ?? 0),
                    ':days_elapsed' => (int)($inv['daysElapsed'] ?? 0),
                    ':duration_days' => (int)($inv['durationDays'] ?? 30),
                    ':capital_returned' => (!empty($inv['capitalReturned']) || !empty($inv['capital_returned'])) ? 1 : 0,
                    ':status' => $inv['status'] ?? 'active',
                    ':start_date' => isset($inv['startDate']) ? date('Y-m-d H:i:s', strtotime($inv['startDate'])) : date('Y-m-d H:i:s'),
                    ':last_profit_yield_date' => $lastYield,
                    ':created_at' => isset($inv['createdAt']) ? date('Y-m-d H:i:s', strtotime($inv['createdAt'])) : date('Y-m-d H:i:s')
                ]);
            }
        }

        // Sync Redemptions
        if (isset($parsed['redemptions']) && is_array($parsed['redemptions'])) {
            $rdmStmt = $pdo->prepare("
                INSERT INTO `redemptions` (
                    `id`, `user_id`, `username`, `reward_id`, `reward_name`, `points_cost`,
                    `status`, `target_account`, `notes`, `redeemed_at`, `processed_at`
                ) VALUES (
                    :id, :user_id, :username, :reward_id, :reward_name, :points_cost,
                    :status, :target_account, :notes, :redeemed_at, :processed_at
                ) ON DUPLICATE KEY UPDATE
                    `status` = VALUES(`status`),
                    `notes` = VALUES(`notes`),
                    `processed_at` = VALUES(`processed_at`)
            ");
            foreach ($parsed['redemptions'] as $r) {
                if (empty($r['id']) || empty($r['userId'])) continue;
                $rdmStmt->execute([
                    ':id' => $r['id'],
                    ':user_id' => $r['userId'],
                    ':username' => $r['username'] ?? '',
                    ':reward_id' => $r['rewardId'] ?? '',
                    ':reward_name' => $r['rewardTitle'] ?? $r['rewardName'] ?? 'Hadiah',
                    ':points_cost' => (int)($r['pointsSpent'] ?? $r['pointsCost'] ?? 0),
                    ':status' => $r['status'] ?? 'pending',
                    ':target_account' => $r['targetContact'] ?? $r['target_account'] ?? null,
                    ':notes' => $r['adminNote'] ?? $r['note'] ?? $r['notes'] ?? null,
                    ':redeemed_at' => isset($r['createdAt']) ? date('Y-m-d H:i:s', strtotime($r['createdAt'])) : date('Y-m-d H:i:s'),
                    ':processed_at' => isset($r['updatedAt']) && (($r['status'] ?? 'pending') !== 'pending') ? date('Y-m-d H:i:s', strtotime($r['updatedAt'])) : null
                ]);
            }
        }

        // Sync Settings
        if (isset($parsed['settings']) && is_array($parsed['settings'])) {
            $setStmt = $pdo->prepare("
                INSERT INTO `settings` (`setting_key`, `setting_value`, `description`)
                VALUES (:setting_key, :setting_value, :description)
                ON DUPLICATE KEY UPDATE `setting_value` = VALUES(`setting_value`), `updated_at` = CURRENT_TIMESTAMP
            ");
            $setStmt->execute([
                ':setting_key' => 'general_settings',
                ':setting_value' => json_encode($parsed['settings']),
                ':description' => 'Platform global settings, withdraw rules, and commission rates'
            ]);
        }

        // Sync Banners
        if (isset($parsed['banners']) && is_array($parsed['banners'])) {
            $bannerStmt = $pdo->prepare("
                INSERT INTO `banners` (`id`, `title`, `subtitle`, `badge`, `image_url`, `action_url`, `active`, `sort_order`, `created_at`)
                VALUES (:id, :title, :subtitle, :badge, :image_url, :action_url, :active, :sort_order, :created_at)
                ON DUPLICATE KEY UPDATE
                    `title` = VALUES(`title`),
                    `subtitle` = VALUES(`subtitle`),
                    `badge` = VALUES(`badge`),
                    `image_url` = VALUES(`image_url`),
                    `action_url` = VALUES(`action_url`),
                    `active` = VALUES(`active`),
                    `sort_order` = VALUES(`sort_order`),
                    `updated_at` = CURRENT_TIMESTAMP
            ");
            foreach ($parsed['banners'] as $idx => $b) {
                if (empty($b['id'])) continue;
                $bannerStmt->execute([
                    ':id' => $b['id'],
                    ':title' => $b['title'] ?? '',
                    ':subtitle' => $b['subtitle'] ?? '',
                    ':badge' => $b['badge'] ?? 'PROMO',
                    ':image_url' => $b['imageUrl'] ?? $b['image_url'] ?? '',
                    ':action_url' => $b['actionUrl'] ?? $b['action_url'] ?? 'plans',
                    ':active' => !empty($b['active']) ? 1 : 0,
                    ':sort_order' => (int)($b['sortOrder'] ?? $idx),
                    ':created_at' => isset($b['createdAt']) ? date('Y-m-d H:i:s', strtotime($b['createdAt'])) : date('Y-m-d H:i:s')
                ]);
            }

            // Admin deletions must stick: action=get rebuilds the banner list straight
            // from this table, so banners removed by the admin have to be dropped here.
            if (currentSessionRole() === 'admin') {
                try {
                    $keepIds = [];
                    foreach ($parsed['banners'] as $b) {
                        if (!empty($b['id'])) $keepIds[] = (string)$b['id'];
                    }
                    if (count($keepIds) > 0) {
                        $ph = implode(',', array_fill(0, count($keepIds), '?'));
                        $delStmt = $pdo->prepare("DELETE FROM `banners` WHERE `id` NOT IN ($ph)");
                        $delStmt->execute($keepIds);
                    }
                } catch (Exception $eDelBanner) {
                    error_log('Error pruning deleted banners: ' . $eDelBanner->getMessage());
                }
            }
        }
    } catch (Exception $e) {
        error_log('Error syncing relational tables: ' . $e->getMessage());
    }
}

function seedDefaultBanners($pdo) {
    if (!$pdo) return;
    try {
        $count = (int)$pdo->query("SELECT COUNT(*) FROM `banners`")->fetchColumn();
        if ($count > 0) return;
        $defaultBanners = [
            [
                'id' => 'ban-1',
                'title' => 'AI Trading Algoritma AUTOTRADING v4.2',
                'subtitle' => 'Otomasi profit harian dengan akurasi eksekusi 94.8% dan proteksi modal terintegrasi.',
                'badge' => 'PROMO UNGGULAN',
                'image_url' => 'https://images.unsplash.com/photo-1642543492481-44e81e3914a7?w=900&auto=format&fit=crop&q=80',
                'action_url' => 'plans',
                'active' => 1,
                'sort_order' => 1,
                'created_at' => '2026-09-15 00:00:00'
            ],
            [
                'id' => 'ban-2',
                'title' => 'Bonus Kemitraan & Rabat Multi-Level',
                'subtitle' => 'Dapatkan komisi sponsor instan 10% + passive income matching ROI hingga 5 kedalaman.',
                'badge' => 'KOMISI TINGGI',
                'image_url' => 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=900&auto=format&fit=crop&q=80',
                'action_url' => 'profile',
                'active' => 1,
                'sort_order' => 2,
                'created_at' => '2026-09-15 01:00:00'
            ],
            [
                'id' => 'ban-3',
                'title' => 'Deposit Instant 24/7 QRIS & USDT',
                'subtitle' => 'Proses deposit cepat otomatis melalui QRIS dinamis dan jaringan blockchain USDT TRC20/BEP20.',
                'badge' => 'GATEWAY TERCEPAT',
                'image_url' => 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=900&auto=format&fit=crop&q=80',
                'action_url' => 'deposit',
                'active' => 1,
                'sort_order' => 3,
                'created_at' => '2026-09-15 02:00:00'
            ]
        ];
        $ins = $pdo->prepare("
            INSERT INTO `banners` (`id`, `title`, `subtitle`, `badge`, `image_url`, `action_url`, `active`, `sort_order`, `created_at`)
            VALUES (:id, :title, :subtitle, :badge, :image_url, :action_url, :active, :sort_order, :created_at)
        ");
        foreach ($defaultBanners as $b) {
            $ins->execute([
                ':id' => $b['id'],
                ':title' => $b['title'],
                ':subtitle' => $b['subtitle'],
                ':badge' => $b['badge'],
                ':image_url' => $b['image_url'],
                ':action_url' => $b['action_url'],
                ':active' => $b['active'],
                ':sort_order' => $b['sort_order'],
                ':created_at' => $b['created_at']
            ]);
        }
    } catch(Exception $e) {}
}

// 1. Action: Ping / Health Check
if ($action === 'ping') {
    if ($pdo) {
        ensureTablesExist($pdo);
        echo json_encode([
            'success' => true,
            'connected' => true,
            'debug_dir' => __DIR__,
            'debug_doc_root' => $_SERVER['DOCUMENT_ROOT'] ?? '',
            'message' => 'Database MySQL cPanel terhubung dengan sukses!'
        ]);
    } else {
        echo json_encode([
            'success' => false,
            'connected' => false,
            'message' => 'Belum terhubung ke database. Silakan sesuaikan nama database, user, dan password di api/config.php.'
        ]);
    }
    exit();
}

// 2. Action: Get Data State (Complete Realtime Bi-Directional Synchronizer)
if ($action === 'get') {
    if (!$pdo) {
        http_response_code(503);
        echo json_encode([
            'success' => false,
            'message' => 'Database MySQL cPanel belum terhubung.'
        ]);
        exit();
    }

    ensureTablesExist($pdo);

    try {
        $rawState = readStateJson($pdo, 'autotrading_system_state');
        if (empty($rawState)) {
            $rawState = readStateJson($pdo, 'fgt_system_state');
        }

        $data = null;
        if (!empty($rawState)) {
            $data = json_decode($rawState, true);
        }

        if (!is_array($data)) {
            $data = [];
        }

        // Live bi-directional merge from real relational MySQL tables
        try {
            // 1. Merge users table
            $uStmt = $pdo->query("SELECT * FROM `users` ORDER BY `created_at` ASC");
            $dbUsers = $uStmt->fetchAll();
            if ($dbUsers && count($dbUsers) > 0) {
                if (!isset($data['users']) || !is_array($data['users'])) {
                    $data['users'] = [];
                }
                $userMap = [];
                foreach ($data['users'] as $idx => $u) {
                    $userMap[$u['id']] = $idx;
                }

                foreach ($dbUsers as $dbU) {
                    $uId = $dbU['id'];
                    $isBlocked = (!empty($dbU['is_blocked']) || (isset($dbU['status']) && $dbU['status'] === 'blocked'));
                    $status = $isBlocked ? 'blocked' : ($dbU['status'] ?? 'active');

                    if (isset($userMap[$uId])) {
                        $idx = $userMap[$uId];
                        $data['users'][$idx]['walletBalance'] = (int)$dbU['wallet_balance'];
                        $data['users'][$idx]['affiliateBalance'] = (int)$dbU['affiliate_balance'];
                        $data['users'][$idx]['points'] = (int)$dbU['points'];
                        if (!empty($dbU['daily_check_in'])) {
                            $chkData = json_decode($dbU['daily_check_in'], true);
                            if (is_array($chkData)) {
                                $data['users'][$idx]['dailyCheckIn'] = $chkData;
                            }
                        }
                        $data['users'][$idx]['isBlocked'] = $isBlocked;
                        $data['users'][$idx]['status'] = $status;
                        $data['users'][$idx]['blockedReason'] = $dbU['blocked_reason'] ?? '';
                        $data['users'][$idx]['fullName'] = $dbU['full_name'] ?? $data['users'][$idx]['fullName'];
                        $data['users'][$idx]['email'] = $dbU['email'] ?? $data['users'][$idx]['email'];
                        $data['users'][$idx]['phone'] = $dbU['phone'] ?? $data['users'][$idx]['phone'];
                        $data['users'][$idx]['city'] = $dbU['city'] ?? $data['users'][$idx]['city'];
                        $data['users'][$idx]['role'] = ($dbU['role'] === 'admin') ? 'admin' : 'user';
                        if (!empty($dbU['password_hash'])) {
                            $data['users'][$idx]['password'] = $dbU['password_hash'];
                        }
                        if (!empty($dbU['bank_name']) || !empty($dbU['account_number'])) {
                            $data['users'][$idx]['bankAccount'] = [
                                'bankName' => $dbU['bank_name'] ?? '',
                                'accountNumber' => $dbU['account_number'] ?? '',
                                'accountHolder' => $dbU['account_holder'] ?? ''
                            ];
                        }
                    } else {
                        // User in MySQL table but not in JSON state -> automatically append
                        $chkData = !empty($dbU['daily_check_in']) ? json_decode($dbU['daily_check_in'], true) : null;
                        $data['users'][] = [
                            'id' => $dbU['id'],
                            'username' => $dbU['username'],
                            'password' => $dbU['password_hash'],
                            'fullName' => $dbU['full_name'] ?? $dbU['username'],
                            'email' => $dbU['email'] ?? '',
                            'phone' => $dbU['phone'] ?? '',
                            'city' => $dbU['city'] ?? '',
                            'walletBalance' => (int)$dbU['wallet_balance'],
                            'affiliateBalance' => (int)$dbU['affiliate_balance'],
                            'points' => (int)$dbU['points'],
                            'dailyCheckIn' => is_array($chkData) ? $chkData : null,
                            'referralCode' => $dbU['referral_code'] ?? $dbU['username'],
                            'referredBy' => $dbU['referred_by'] ?? null,
                            'status' => $status,
                            'isBlocked' => $isBlocked,
                            'blockedReason' => $dbU['blocked_reason'] ?? '',
                            'role' => ($dbU['role'] === 'admin') ? 'admin' : 'user',
                            'registeredAt' => $dbU['created_at'] ?? date('c'),
                            'bankAccount' => [
                                'bankName' => $dbU['bank_name'] ?? '',
                                'accountNumber' => $dbU['account_number'] ?? '',
                                'accountHolder' => $dbU['account_holder'] ?? ''
                            ]
                        ];
                    }
                }
            }

            // 2. Merge transactions table
            $tStmt = $pdo->query("SELECT * FROM `transactions` ORDER BY `created_at` DESC");
            $dbTrx = $tStmt->fetchAll();
            if ($dbTrx && count($dbTrx) > 0) {
                if (!isset($data['transactions']) || !is_array($data['transactions'])) {
                    $data['transactions'] = [];
                }
                $trxMap = [];
                foreach ($data['transactions'] as $idx => $t) {
                    $trxMap[$t['id']] = $idx;
                }
                foreach ($dbTrx as $rowT) {
                    $tId = $rowT['id'];
                    if (isset($trxMap[$tId])) {
                        $idx = $trxMap[$tId];
                        $data['transactions'][$idx]['status'] = $rowT['status'];
                        $data['transactions'][$idx]['amount'] = (int)$rowT['amount'];
                        if (isset($rowT['net_amount'])) {
                            $data['transactions'][$idx]['netAmount'] = (int)$rowT['net_amount'];
                        }
                        if (!empty($rowT['payment_method'])) {
                            $data['transactions'][$idx]['paymentMethod'] = cleanPaymentMethodStr($rowT['payment_method']);
                        }
                        if (isset($rowT['note'])) {
                            $data['transactions'][$idx]['note'] = $rowT['note'];
                        }
                    } else {
                        // Append transaction from relational table if missing
                        $data['transactions'][] = [
                            'id' => $rowT['id'],
                            'userId' => $rowT['user_id'],
                            'username' => $rowT['username'] ?? '',
                            'type' => $rowT['type'],
                            'amount' => (int)$rowT['amount'],
                            'netAmount' => (int)($rowT['net_amount'] ?? $rowT['amount']),
                            'status' => $rowT['status'] ?? 'pending',
                            'paymentMethod' => cleanPaymentMethodStr($rowT['payment_method'] ?? 'Transfer'),
                            'walletSource' => $rowT['wallet_source'] ?? null,
                            'destinationAccount' => $rowT['destination_account'] ?? null,
                            'txid' => $rowT['txid'] ?? null,
                            'uniqueCode' => $rowT['unique_code'] ?? null,
                            'proofImage' => $rowT['proof_image'] ?? null,
                            'note' => $rowT['note'] ?? null,
                            'createdAt' => $rowT['created_at'] ?? date('c')
                        ];
                    }
                }
            }

            // 3. Merge investments table
            $iStmt = $pdo->query("SELECT * FROM `investments` ORDER BY `created_at` DESC");
            $dbInv = $iStmt->fetchAll();
            if ($dbInv && count($dbInv) > 0) {
                if (!isset($data['investments']) || !is_array($data['investments'])) {
                    $data['investments'] = [];
                }
                $invMap = [];
                foreach ($data['investments'] as $idx => $inv) {
                    $invMap[$inv['id']] = $idx;
                }
                foreach ($dbInv as $rowI) {
                    $iId = $rowI['id'];
                    if (isset($invMap[$iId])) {
                        $idx = $invMap[$iId];
                        $data['investments'][$idx]['status'] = $rowI['status'];
                        $data['investments'][$idx]['totalProfitEarned'] = (int)$rowI['total_profit_earned'];
                        $data['investments'][$idx]['pendingProfitClaim'] = (int)$rowI['pending_profit_claim'];
                        $data['investments'][$idx]['daysElapsed'] = (int)$rowI['days_elapsed'];
                        $data['investments'][$idx]['lastProfitYieldDate'] = $rowI['last_profit_yield_date'] ?? $data['investments'][$idx]['lastProfitYieldDate'] ?? null;
                        $data['investments'][$idx]['capitalReturned'] = !empty($rowI['capital_returned']);
                    } else {
                        $data['investments'][] = [
                            'id' => $rowI['id'],
                            'userId' => $rowI['user_id'],
                            'planId' => $rowI['plan_id'],
                            'planName' => $rowI['plan_name'],
                            'capital' => (int)$rowI['capital'],
                            'minDailyProfit' => (float)$rowI['min_rate'],
                            'maxDailyProfit' => (float)$rowI['max_rate'],
                            // Rate range kept under both names: legacy state uses
                            // minRate/maxRate, rebuilt rows used minDailyProfit only,
                            // which made the UI print "undefined% - undefined%".
                            'minRate' => (float)$rowI['min_rate'],
                            'maxRate' => (float)$rowI['max_rate'],
                            'totalProfitEarned' => (int)$rowI['total_profit_earned'],
                            'pendingProfitClaim' => (int)$rowI['pending_profit_claim'],
                            'daysElapsed' => (int)$rowI['days_elapsed'],
                            'durationDays' => (int)$rowI['duration_days'],
                            'capitalReturned' => !empty($rowI['capital_returned']),
                            'status' => $rowI['status'],
                            'startDate' => $rowI['start_date'],
                            'lastProfitYieldDate' => $rowI['last_profit_yield_date'] ?? null,
                            'createdAt' => $rowI['created_at']
                        ];
                    }
                }
            }

            // 4. Merge settings table if available
            $sStmt = $pdo->prepare("SELECT `setting_value` FROM `settings` WHERE `setting_key` = 'general_settings' LIMIT 1");
            $sStmt->execute();
            $sRow = $sStmt->fetch();
            if ($sRow && !empty($sRow['setting_value'])) {
                $dbSettings = json_decode($sRow['setting_value'], true);
                if (is_array($dbSettings)) {
                    $data['settings'] = array_merge($data['settings'] ?? [], $dbSettings);
                }
            }

            // 5. Merge banners table
            try {
                $bStmt = $pdo->query("SELECT * FROM `banners` ORDER BY `sort_order` ASC, `created_at` DESC");
                $dbBanners = $bStmt ? $bStmt->fetchAll() : [];
                if ($dbBanners && count($dbBanners) > 0) {
                    $data['banners'] = [];
                    foreach ($dbBanners as $bRow) {
                        $data['banners'][] = [
                            'id' => $bRow['id'],
                            'title' => $bRow['title'],
                            'subtitle' => $bRow['subtitle'] ?? '',
                            'badge' => $bRow['badge'] ?? 'PROMO',
                            'imageUrl' => $bRow['image_url'],
                            'actionUrl' => $bRow['action_url'] ?? 'plans',
                            'active' => (bool)$bRow['active'],
                            'sortOrder' => (int)($bRow['sort_order'] ?? 0),
                            'createdAt' => $bRow['created_at']
                        ];
                    }
                } else {
                    seedDefaultBanners($pdo);
                    $bStmt = $pdo->query("SELECT * FROM `banners` ORDER BY `sort_order` ASC, `created_at` DESC");
                    $dbBanners = $bStmt ? $bStmt->fetchAll() : [];
                    $data['banners'] = [];
                    foreach ($dbBanners as $bRow) {
                        $data['banners'][] = [
                            'id' => $bRow['id'],
                            'title' => $bRow['title'],
                            'subtitle' => $bRow['subtitle'] ?? '',
                            'badge' => $bRow['badge'] ?? 'PROMO',
                            'imageUrl' => $bRow['image_url'],
                            'actionUrl' => $bRow['action_url'] ?? 'plans',
                            'active' => (bool)$bRow['active'],
                            'sortOrder' => (int)($bRow['sort_order'] ?? 0),
                            'createdAt' => $bRow['created_at']
                        ];
                    }
                }
            } catch(Exception $eBanners) {}

            // 6. Merge redemptions table
            try {
                $rStmt = $pdo->query("SELECT * FROM `redemptions` ORDER BY `redeemed_at` DESC");
                $dbRedemptions = $rStmt ? $rStmt->fetchAll() : [];
                if ($dbRedemptions && count($dbRedemptions) > 0) {
                    if (!isset($data['redemptions']) || !is_array($data['redemptions'])) {
                        $data['redemptions'] = [];
                    }
                    $rdmMap = [];
                    foreach ($data['redemptions'] as $idx => $r) {
                        $rdmMap[$r['id']] = $idx;
                    }
                    foreach ($dbRedemptions as $dbR) {
                        $rId = $dbR['id'];
                        if (isset($rdmMap[$rId])) {
                            $idx = $rdmMap[$rId];
                            $data['redemptions'][$idx]['status'] = $dbR['status'];
                            $data['redemptions'][$idx]['adminNote'] = $dbR['notes'] ?? $data['redemptions'][$idx]['adminNote'] ?? '';
                            if (!empty($dbR['processed_at'])) {
                                $data['redemptions'][$idx]['updatedAt'] = $dbR['processed_at'];
                            }
                        } else {
                            $data['redemptions'][] = [
                                'id' => $dbR['id'],
                                'userId' => $dbR['user_id'],
                                'username' => $dbR['username'],
                                'rewardId' => $dbR['reward_id'],
                                'rewardTitle' => $dbR['reward_name'],
                                'pointsSpent' => (int)$dbR['points_cost'],
                                'targetContact' => $dbR['target_account'] ?? '',
                                'deliveryAddress' => '',
                                'note' => '',
                                'status' => $dbR['status'] ?? 'pending',
                                'adminNote' => $dbR['notes'] ?? '',
                                'createdAt' => $dbR['redeemed_at'] ?? date('c'),
                                'updatedAt' => $dbR['processed_at'] ?? $dbR['redeemed_at'] ?? date('c')
                            ];
                        }
                    }
                }
            } catch(Exception $eRdm) {}

            // Deduplicate any check-in transactions in $data['transactions'] (drop TX-CHK-392542 or same-day duplicates)
            if (isset($data['transactions']) && is_array($data['transactions'])) {
                $seenCheckin = [];
                $cleanTrx = [];
                foreach ($data['transactions'] as $t) {
                    if (($t['id'] ?? '') === 'TX-CHK-392542') continue; // Always drop duplicate
                    $isCheckin = (isset($t['id']) && strpos($t['id'], 'TX-CHK-') === 0) || 
                                 (isset($t['paymentMethod']) && strpos($t['paymentMethod'], 'Absensi') !== false);
                    if ($isCheckin) {
                        $cDate = substr($t['createdAt'] ?? '', 0, 10);
                        $uKey = ($t['userId'] ?? '') . '_' . $cDate;
                        if (isset($seenCheckin[$uKey])) {
                            continue; // Skip duplicate check-in on same date for same user
                        }
                        $seenCheckin[$uKey] = true;
                    }
                    if (!empty($t['paymentMethod'])) {
                        $t['paymentMethod'] = cleanPaymentMethodStr($t['paymentMethod']);
                    }
                    $cleanTrx[] = $t;
                }
                $data['transactions'] = $cleanTrx;
            }
        } catch (Exception $eMerge) {
            // Keep going with merged state
        }

        // Never leak passwords / OTP / reset codes to any client
        sanitizeStateData($data);

        echo json_encode([
            'success' => true,
            'data' => $data
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'message' => 'Gagal membaca data dari MySQL: ' . $e->getMessage()
        ]);
    }
    exit();
}

// 3. Action: Save Data State (With Smart Anti-Overwrite Merging)
if ($action === 'save') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Method not allowed. Use POST.']);
        exit();
    }

    // Writes require an authenticated session (login) - anonymous visitors are read-only
    requireLogin();

    if (!$pdo) {
        http_response_code(503);
        echo json_encode(['success' => false, 'message' => 'Database MySQL cPanel belum terhubung.']);
        exit();
    }

    ensureTablesExist($pdo);

    $rawInput = file_get_contents('php://input');
    if (empty($rawInput)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Input data kosong.']);
        exit();
    }

    $parsed = json_decode($rawInput, true);
    if (!$parsed || !is_array($parsed)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Format JSON tidak valid.']);
        exit();
    }

    try {
        // Read current state to perform smart merge (chunked: see readStateJson)
        $existingJson = readStateJson($pdo, 'autotrading_system_state');
        $existing = !empty($existingJson) ? json_decode($existingJson, true) : [];
        if (!is_array($existing)) $existing = [];

        // Smart merge users: keep existing registered users; apply updates to matching users; append new users
        $existingUsers = $existing['users'] ?? [];
        $incomingUsers = $parsed['users'] ?? [];
        $mergedUsersMap = [];
        foreach ($existingUsers as $u) {
            if (!empty($u['id'])) $mergedUsersMap[$u['id']] = $u;
        }
        foreach ($incomingUsers as $u) {
            if (!empty($u['id'])) {
                if (isset($mergedUsersMap[$u['id']])) {
                    $mergedUsersMap[$u['id']] = array_merge($mergedUsersMap[$u['id']], $u);
                } else {
                    $mergedUsersMap[$u['id']] = $u;
                }
            }
        }
        $parsed['users'] = array_values($mergedUsersMap);

        // Smart merge transactions: preserve existing transactions
        $existingTrxs = $existing['transactions'] ?? [];
        $incomingTrxs = $parsed['transactions'] ?? [];
        $mergedTrxMap = [];
        foreach ($existingTrxs as $t) {
            if (!empty($t['id'])) $mergedTrxMap[$t['id']] = $t;
        }
        foreach ($incomingTrxs as $t) {
            if (!empty($t['id'])) {
                if (isset($mergedTrxMap[$t['id']])) {
                    $mergedTrxMap[$t['id']] = array_merge($mergedTrxMap[$t['id']], $t);
                } else {
                    $mergedTrxMap[$t['id']] = $t;
                }
            }
        }
        $parsed['transactions'] = array_values($mergedTrxMap);

        // Smart merge investments: preserve existing investments
        $existingInvs = $existing['investments'] ?? [];
        $incomingInvs = $parsed['investments'] ?? [];
        $mergedInvMap = [];
        foreach ($existingInvs as $i) {
            if (!empty($i['id'])) $mergedInvMap[$i['id']] = $i;
        }
        foreach ($incomingInvs as $i) {
            if (!empty($i['id'])) {
                if (isset($mergedInvMap[$i['id']])) {
                    $mergedInvMap[$i['id']] = array_merge($mergedInvMap[$i['id']], $i);
                } else {
                    $mergedInvMap[$i['id']] = $i;
                }
            }
        }
        $parsed['investments'] = array_values($mergedInvMap);

        // Smart merge banners: preserve existing banners, merge incoming updates/additions.
        // Admin sessions are the source of truth - their deletions must stick, otherwise
        // removed banners come back on every save (bug: "banner yang dihapus muncul lagi").
        $isAdminSession = currentSessionRole() === 'admin';
        if (!$isAdminSession) {
            $existingBanners = $existing['banners'] ?? [];
            $incomingBanners = $parsed['banners'] ?? [];
            $mergedBannerMap = [];
            foreach ($existingBanners as $b) {
                if (!empty($b['id'])) $mergedBannerMap[$b['id']] = $b;
            }
            foreach ($incomingBanners as $b) {
                if (!empty($b['id'])) {
                    if (isset($mergedBannerMap[$b['id']])) {
                        $mergedBannerMap[$b['id']] = array_merge($mergedBannerMap[$b['id']], $b);
                    } else {
                        $mergedBannerMap[$b['id']] = $b;
                    }
                }
            }
            if (count($mergedBannerMap) > 0) {
                $parsed['banners'] = array_values($mergedBannerMap);
            }
        }

        // Smart merge redemptions: preserve existing redemptions, update matching, append new
        $existingRedemptions = $existing['redemptions'] ?? [];
        $incomingRedemptions = $parsed['redemptions'] ?? [];
        $mergedRedemptionMap = [];
        foreach ($existingRedemptions as $r) {
            if (!empty($r['id'])) $mergedRedemptionMap[$r['id']] = $r;
        }
        foreach ($incomingRedemptions as $r) {
            if (!empty($r['id'])) {
                if (isset($mergedRedemptionMap[$r['id']])) {
                    $mergedRedemptionMap[$r['id']] = array_merge($mergedRedemptionMap[$r['id']], $r);
                } else {
                    $mergedRedemptionMap[$r['id']] = $r;
                }
            }
        }
        $parsed['redemptions'] = array_values($mergedRedemptionMap);

        // Deduplicate check-in transactions: strictly at most 1 check-in per user per day!
        $cleanTrxList = [];
        $seenCheckins = [];
        foreach ($parsed['transactions'] as $t) {
            if (($t['id'] ?? '') === 'TX-CHK-392542') continue; // Always drop duplicate
            $isCheckin = (isset($t['id']) && strpos($t['id'], 'TX-CHK-') === 0) || 
                         (isset($t['paymentMethod']) && strpos($t['paymentMethod'], 'Absensi') !== false);
            if ($isCheckin) {
                $cDate = substr($t['createdAt'] ?? '', 0, 10);
                $uKey = ($t['userId'] ?? '') . '_' . $cDate;
                if (isset($seenCheckins[$uKey])) {
                    continue; // Skip duplicate check-in
                }
                $seenCheckins[$uKey] = true;
            }
            if (!empty($t['paymentMethod'])) {
                $t['paymentMethod'] = cleanPaymentMethodStr($t['paymentMethod']);
            }
            $cleanTrxList[] = $t;
        }
        $parsed['transactions'] = $cleanTrxList;

        // Server-side authority: strip secrets, freeze admin sections,
        // and clamp balance/privilege changes for non-admin sessions.
        applySavePolicy($parsed, $existing, currentSessionUserId(), $isAdminSession, $pdo);

        // Encode clean merged JSON
        $mergedJson = json_encode($parsed, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

        // 1. Atomic state save into autotrading_system_state and fgt_system_state
        $stmt = $pdo->prepare("
            INSERT INTO `autotrading_system_state` (`state_key`, `data_json`)
            VALUES ('main_state', :data_json)
            ON DUPLICATE KEY UPDATE `data_json` = :data_json_update, `updated_at` = CURRENT_TIMESTAMP
        ");
        $stmt->execute([
            ':data_json' => $mergedJson,
            ':data_json_update' => $mergedJson
        ]);

        try {
            $stmtFgt = $pdo->prepare("
                INSERT INTO `fgt_system_state` (`state_key`, `data_json`)
                VALUES ('main_state', :data_json)
                ON DUPLICATE KEY UPDATE `data_json` = :data_json_update, `updated_at` = CURRENT_TIMESTAMP
            ");
            $stmtFgt->execute([
                ':data_json' => $mergedJson,
                ':data_json_update' => $mergedJson
            ]);
        } catch (Exception $eFgt) {}

        // 2. Synchronize individual relational tables in phpMyAdmin
        syncRelationalTables($pdo, $parsed);

        echo json_encode([
            'success' => true,
            'message' => 'Data berhasil disimpan ke database MySQL cPanel dan disinkronkan ke tabel phpMyAdmin!',
            'timestamp' => date('Y-m-d H:i:s')
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'message' => 'Gagal menyimpan ke MySQL: ' . $e->getMessage()
        ]);
    }
    exit();
}

// 3.5 Action: Upload Image File / Base64 (Banners, Transfer Proofs, Rewards)
if ($action === 'upload_image') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Method not allowed. Use POST.']);
        exit();
    }

    // Only authenticated members/admins may upload files
    requireLogin();

    $uploadDir = dirname(__DIR__) . '/uploads';
    if (!is_dir($uploadDir)) {
        @mkdir($uploadDir, 0755, true);
    }

    $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (isset($_SERVER['SERVER_PORT']) && $_SERVER['SERVER_PORT'] == 443) ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'autotrading.my.id';

    // 1. Check multipart file upload
    $file = $_FILES['image'] ?? $_FILES['file'] ?? null;
    if ($file && !empty($file['tmp_name']) && $file['error'] === UPLOAD_ERR_OK) {
        if ($file['size'] > 10 * 1024 * 1024) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Ukuran file gambar maksimal 10MB!']);
            exit();
        }
        $origName = basename($file['name']);
        $ext = strtolower(pathinfo($origName, PATHINFO_EXTENSION));
        $allowedExts = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'];
        if (!in_array($ext, $allowedExts)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Format file tidak diizinkan. Gunakan JPG, PNG, WEBP, GIF, atau SVG.']);
            exit();
        }

        $uniqueName = 'img_' . date('Ymd_His') . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
        $targetPath = $uploadDir . '/' . $uniqueName;

        if (move_uploaded_file($file['tmp_name'], $targetPath)) {
            $publicUrl = $protocol . '://' . $host . '/uploads/' . $uniqueName;
            echo json_encode([
                'success' => true,
                'url' => $publicUrl,
                'filename' => $uniqueName,
                'size' => filesize($targetPath)
            ]);
            exit();
        } else {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Gagal menyimpan file gambar ke server.']);
            exit();
        }
    }

    // 2. Check base64 input in JSON body or POST parameter
    $raw = file_get_contents('php://input');
    $body = json_decode($raw, true) ?: [];
    $base64 = $body['image'] ?? $body['base64'] ?? $_POST['image'] ?? null;
    if (!empty($base64)) {
        if (preg_match('/^data:image\/(\w+);base64,(.+)$/', $base64, $matches)) {
            $ext = strtolower($matches[1]);
            if ($ext === 'jpeg') $ext = 'jpg';
            $data = base64_decode($matches[2]);
        } else {
            $ext = 'jpg';
            $data = base64_decode($base64);
        }

        if ($data !== false && strlen($data) > 0) {
            $uniqueName = 'img_' . date('Ymd_His') . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
            $targetPath = $uploadDir . '/' . $uniqueName;
            if (file_put_contents($targetPath, $data) !== false) {
                $publicUrl = $protocol . '://' . $host . '/uploads/' . $uniqueName;
                echo json_encode([
                    'success' => true,
                    'url' => $publicUrl,
                    'filename' => $uniqueName,
                    'size' => strlen($data)
                ]);
                exit();
            }
        }
    }

    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Tidak ada file gambar atau data base64 yang valid dikirim.']);
    exit();
}

// 3.6 Action: Get Banners List
if ($action === 'get_banners') {
    if (!$pdo) {
        http_response_code(503);
        echo json_encode(['success' => false, 'message' => 'Database belum terhubung.']);
        exit();
    }
    ensureTablesExist($pdo);
    try {
        $stmt = $pdo->query("SELECT * FROM `banners` ORDER BY `sort_order` ASC, `created_at` DESC");
        $rows = $stmt ? $stmt->fetchAll() : [];
        if (!$rows || count($rows) === 0) {
            seedDefaultBanners($pdo);
            $stmt = $pdo->query("SELECT * FROM `banners` ORDER BY `sort_order` ASC, `created_at` DESC");
            $rows = $stmt ? $stmt->fetchAll() : [];
        }
        $banners = [];
        foreach ($rows as $r) {
            $banners[] = [
                'id' => $r['id'],
                'title' => $r['title'],
                'subtitle' => $r['subtitle'] ?? '',
                'badge' => $r['badge'] ?? 'PROMO',
                'imageUrl' => $r['image_url'],
                'actionUrl' => $r['action_url'] ?? 'plans',
                'active' => (bool)$r['active'],
                'sortOrder' => (int)($r['sort_order'] ?? 0),
                'createdAt' => $r['created_at']
            ];
        }
        echo json_encode(['success' => true, 'banners' => $banners]);
    } catch(Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    }
    exit();
}

// 3.7 Action: Save Banner (Add or Update in MySQL and System State)
if ($action === 'save_banner') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Method not allowed. Use POST.']);
        exit();
    }
    requireAdmin();
    if (!$pdo) {
        http_response_code(503);
        echo json_encode(['success' => false, 'message' => 'Database belum terhubung.']);
        exit();
    }
    ensureTablesExist($pdo);

    $raw = file_get_contents('php://input');
    $in = json_decode($raw, true) ?: [];
    $bData = (isset($in['banner']) && is_array($in['banner'])) ? $in['banner'] : $in;

    $id = trim($bData['id'] ?? '');
    if (empty($id)) {
        $id = 'ban-' . date('YmdHis') . rand(100, 999);
    }
    $title = trim($bData['title'] ?? '');
    $subtitle = trim($bData['subtitle'] ?? '');
    $badge = trim($bData['badge'] ?? 'PROMO UNGGULAN');
    $imageUrl = trim($bData['imageUrl'] ?? $bData['image_url'] ?? '');
    $actionUrl = trim($bData['actionUrl'] ?? $bData['action_url'] ?? 'plans');
    $active = isset($bData['active']) ? (!empty($bData['active']) ? 1 : 0) : 1;
    $sortOrder = (int)($bData['sortOrder'] ?? $bData['sort_order'] ?? 0);

    if (empty($imageUrl)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'URL gambar banner wajib diisi.']);
        exit();
    }

    try {
        $stmt = $pdo->prepare("
            INSERT INTO `banners` (`id`, `title`, `subtitle`, `badge`, `image_url`, `action_url`, `active`, `sort_order`, `created_at`)
            VALUES (:id, :title, :subtitle, :badge, :image_url, :action_url, :active, :sort_order, CURRENT_TIMESTAMP)
            ON DUPLICATE KEY UPDATE
                `title` = VALUES(`title`),
                `subtitle` = VALUES(`subtitle`),
                `badge` = VALUES(`badge`),
                `image_url` = VALUES(`image_url`),
                `action_url` = VALUES(`action_url`),
                `active` = VALUES(`active`),
                `sort_order` = VALUES(`sort_order`),
                `updated_at` = CURRENT_TIMESTAMP
        ");
        $stmt->execute([
            ':id' => $id,
            ':title' => $title,
            ':subtitle' => $subtitle,
            ':badge' => $badge,
            ':image_url' => $imageUrl,
            ':action_url' => $actionUrl,
            ':active' => $active,
            ':sort_order' => $sortOrder
        ]);

        $bannerObj = [
            'id' => $id,
            'title' => $title,
            'subtitle' => $subtitle,
            'badge' => $badge,
            'imageUrl' => $imageUrl,
            'actionUrl' => $actionUrl,
            'active' => (bool)$active,
            'sortOrder' => $sortOrder,
            'createdAt' => date('Y-m-d H:i:s')
        ];

        // Also update autotrading_system_state JSON
        try {
            $st = $pdo->query("SELECT `data_json` FROM `autotrading_system_state` WHERE `state_key` = 'main_state' LIMIT 1");
            $row = $st ? $st->fetch() : null;
            if ($row && !empty($row['data_json'])) {
                $j = json_decode($row['data_json'], true) ?: [];
                $bannersList = $j['banners'] ?? [];
                $found = false;
                foreach ($bannersList as &$eb) {
                    if ($eb['id'] === $id) {
                        $eb = array_merge($eb, $bannerObj);
                        $found = true;
                        break;
                    }
                }
                unset($eb);
                if (!$found) {
                    array_unshift($bannersList, $bannerObj);
                }
                $j['banners'] = $bannersList;
                $upd = $pdo->prepare("UPDATE `autotrading_system_state` SET `data_json` = :dj, `updated_at` = CURRENT_TIMESTAMP WHERE `state_key` = 'main_state'");
                $upd->execute([':dj' => json_encode($j, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)]);
            }
        } catch(Exception $eJ) {}

        echo json_encode([
            'success' => true,
            'message' => 'Banner slide carousel berhasil disimpan ke database!',
            'banner' => $bannerObj
        ]);
    } catch(Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Gagal menyimpan banner: ' . $e->getMessage()]);
    }
    exit();
}

// 3.8 Action: Delete Banner
if ($action === 'delete_banner') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Method not allowed. Use POST.']);
        exit();
    }
    requireAdmin();
    if (!$pdo) {
        http_response_code(503);
        echo json_encode(['success' => false, 'message' => 'Database belum terhubung.']);
        exit();
    }
    ensureTablesExist($pdo);

    $raw = file_get_contents('php://input');
    $in = json_decode($raw, true) ?: [];
    $id = trim($in['id'] ?? $in['bannerId'] ?? $_POST['id'] ?? '');

    if (empty($id)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'ID banner wajib disertakan.']);
        exit();
    }

    try {
        $del = $pdo->prepare("DELETE FROM `banners` WHERE `id` = :id");
        $del->execute([':id' => $id]);

        // Also remove from autotrading_system_state
        try {
            $st = $pdo->query("SELECT `data_json` FROM `autotrading_system_state` WHERE `state_key` = 'main_state' LIMIT 1");
            $row = $st ? $st->fetch() : null;
            if ($row && !empty($row['data_json'])) {
                $j = json_decode($row['data_json'], true) ?: [];
                if (isset($j['banners']) && is_array($j['banners'])) {
                    $j['banners'] = array_values(array_filter($j['banners'], function($b) use ($id) {
                        return $b['id'] !== $id;
                    }));
                    $upd = $pdo->prepare("UPDATE `autotrading_system_state` SET `data_json` = :dj, `updated_at` = CURRENT_TIMESTAMP WHERE `state_key` = 'main_state'");
                    $upd->execute([':dj' => json_encode($j, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)]);
                }
            }
        } catch(Exception $eJ) {}

        echo json_encode(['success' => true, 'message' => 'Banner slide berhasil dihapus dari database.']);
    } catch(Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Gagal menghapus banner: ' . $e->getMessage()]);
    }
    exit();
}

// 3.9 Action: Toggle Banner Active
if ($action === 'toggle_banner') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Method not allowed. Use POST.']);
        exit();
    }
    requireAdmin();
    if (!$pdo) {
        http_response_code(503);
        echo json_encode(['success' => false, 'message' => 'Database belum terhubung.']);
        exit();
    }
    ensureTablesExist($pdo);

    $raw = file_get_contents('php://input');
    $in = json_decode($raw, true) ?: [];
    $id = trim($in['id'] ?? $in['bannerId'] ?? '');
    $active = !empty($in['active']) ? 1 : 0;

    if (empty($id)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'ID banner wajib disertakan.']);
        exit();
    }

    try {
        $upd = $pdo->prepare("UPDATE `banners` SET `active` = :active, `updated_at` = CURRENT_TIMESTAMP WHERE `id` = :id");
        $upd->execute([':active' => $active, ':id' => $id]);

        // Also update autotrading_system_state
        try {
            $st = $pdo->query("SELECT `data_json` FROM `autotrading_system_state` WHERE `state_key` = 'main_state' LIMIT 1");
            $row = $st ? $st->fetch() : null;
            if ($row && !empty($row['data_json'])) {
                $j = json_decode($row['data_json'], true) ?: [];
                if (isset($j['banners']) && is_array($j['banners'])) {
                    foreach ($j['banners'] as &$b) {
                        if ($b['id'] === $id) {
                            $b['active'] = (bool)$active;
                            break;
                        }
                    }
                    unset($b);
                    $updState = $pdo->prepare("UPDATE `autotrading_system_state` SET `data_json` = :dj, `updated_at` = CURRENT_TIMESTAMP WHERE `state_key` = 'main_state'");
                    $updState->execute([':dj' => json_encode($j, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)]);
                }
            }
        } catch(Exception $eJ) {}

        echo json_encode(['success' => true, 'active' => (bool)$active, 'message' => 'Status banner berhasil diubah.']);
    } catch(Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Gagal mengubah status: ' . $e->getMessage()]);
    }
    exit();
}

// 3.10 Action: Claim Daily Check-In Bonus (Atomic Single-Claim Guarded on Server)
if ($action === 'claim_daily_checkin') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Method not allowed. Use POST.']);
        exit();
    }
    requireLogin();
    if (!$pdo) {
        http_response_code(503);
        echo json_encode(['success' => false, 'message' => 'Database MySQL cPanel belum terhubung.']);
        exit();
    }
    ensureTablesExist($pdo);

    $raw = file_get_contents('php://input');
    $in = json_decode($raw, true) ?: [];
    $userId = trim($in['userId'] ?? $in['user_id'] ?? $in['id'] ?? '');

    if (empty($userId)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'User ID wajib disertakan.']);
        exit();
    }

    // Members may only claim for themselves; admins may claim for any account
    if (currentSessionRole() !== 'admin' && $userId !== currentSessionUserId()) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Akses ditolak: Anda hanya dapat mengklaim absensi untuk akun Anda sendiri.']);
        exit();
    }

    $todayWib = date('Y-m-d'); // Asia/Jakarta

    // 1. Settings check
    $rewardAmount = 1000;
    $totalDays = 7;
    $enabled = true;
    try {
        $sStmt = $pdo->prepare("SELECT `setting_value` FROM `settings` WHERE `setting_key` = 'general_settings' LIMIT 1");
        $sStmt->execute();
        $sRow = $sStmt ? $sStmt->fetch() : null;
        if ($sRow && !empty($sRow['setting_value'])) {
            $setObj = json_decode($sRow['setting_value'], true);
            if (!empty($setObj['dailyCheckIn'])) {
                $enabled = ($setObj['dailyCheckIn']['enabled'] ?? true) !== false;
                $rewardAmount = (int)($setObj['dailyCheckIn']['rewardAmount'] ?? 1000);
                $totalDays = (int)($setObj['dailyCheckIn']['totalDays'] ?? 7);
            }
        }
    } catch(Exception $eS) {}

    if (!$enabled) {
        echo json_encode(['success' => false, 'message' => 'Fitur absensi harian sedang dinonaktifkan oleh Administrator.']);
        exit();
    }

    // 2. Fetch user
    $uStmt = $pdo->prepare("SELECT * FROM `users` WHERE `id` = :id LIMIT 1");
    $uStmt->execute([':id' => $userId]);
    $userRow = $uStmt->fetch();
    if (!$userRow) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'User tidak ditemukan.']);
        exit();
    }

    $checkInData = !empty($userRow['daily_check_in']) ? json_decode($userRow['daily_check_in'], true) : [];
    if (!is_array($checkInData)) $checkInData = [];
    $lastCheckInDate = $checkInData['lastCheckInDate'] ?? null;

    // 3. Strict Database Check: has user already claimed today in transactions table?
    $chkTrxStmt = $pdo->prepare("
        SELECT COUNT(*) FROM `transactions` 
        WHERE `user_id` = :uid 
          AND (`id` LIKE 'TX-CHK-%' OR `payment_method` LIKE '%Absensi%')
          AND DATE(`created_at`) = :today
    ");
    $chkTrxStmt->execute([
        ':uid' => $userId,
        ':today' => $todayWib
    ]);
    $alreadyClaimedTrxCount = (int)$chkTrxStmt->fetchColumn();

    if ($lastCheckInDate === $todayWib || $alreadyClaimedTrxCount > 0) {
        echo json_encode([
            'success' => false,
            'message' => 'Anda sudah mengklaim bonus absen hari ini! Silakan kembali besok.',
            'alreadyClaimed' => true
        ]);
        exit();
    }

    // 4. Calculate streak
    $currStreak = (int)($checkInData['currentStreak'] ?? 0);
    $newStreak = 1;
    if ($lastCheckInDate) {
        $yesterday = date('Y-m-d', strtotime('-1 day'));
        if ($lastCheckInDate === $yesterday) {
            $newStreak = $currStreak + 1;
        } else {
            $newStreak = 1;
        }
    }
    if ($newStreak > $totalDays) {
        $newStreak = 1;
    }

    // 5. Update user
    $newBalance = (int)$userRow['wallet_balance'] + $rewardAmount;
    $history = is_array($checkInData['history'] ?? null) ? $checkInData['history'] : [];
    $history[] = [
        'date' => $todayWib,
        'day' => $newStreak,
        'amount' => $rewardAmount,
        'claimedAt' => date('c')
    ];
    $updatedCheckInData = [
        'currentStreak' => $newStreak,
        'lastCheckInDate' => $todayWib,
        'history' => $history
    ];
    $updatedCheckInJson = json_encode($updatedCheckInData, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

    $updUser = $pdo->prepare("
        UPDATE `users` 
        SET `wallet_balance` = :wb, `daily_check_in` = :dci, `updated_at` = CURRENT_TIMESTAMP 
        WHERE `id` = :uid
    ");
    $updUser->execute([
        ':wb' => $newBalance,
        ':dci' => $updatedCheckInJson,
        ':uid' => $userId
    ]);

    // 6. Insert transaction
    $txId = 'TX-CHK-' . date('His') . rand(100, 999);
    $note = "Bonus absensi harian hari ke-{$newStreak}/{$totalDays} (+Rp " . number_format($rewardAmount, 0, ',', '.') . ")";
    $insTrx = $pdo->prepare("
        INSERT INTO `transactions` (
            `id`, `user_id`, `username`, `type`, `amount`, `net_amount`, `status`,
            `payment_method`, `wallet_source`, `note`, `created_at`
        ) VALUES (
            :id, :user_id, :username, 'bonus', :amount, :net_amount, 'approved',
            :payment_method, 'Wallet Balance', :note, CURRENT_TIMESTAMP
        )
    ");
    $insTrx->execute([
        ':id' => $txId,
        ':user_id' => $userId,
        ':username' => $userRow['username'],
        ':amount' => $rewardAmount,
        ':net_amount' => $rewardAmount,
        ':payment_method' => "Absensi Harian (Check-in H-{$newStreak})",
        ':note' => $note
    ]);

    $newTx = [
        'id' => $txId,
        'userId' => $userId,
        'username' => $userRow['username'],
        'type' => 'bonus',
        'amount' => $rewardAmount,
        'netAmount' => $rewardAmount,
        'status' => 'approved',
        'paymentMethod' => "Absensi Harian (Check-in H-{$newStreak})",
        'walletSource' => 'Wallet Balance',
        'note' => $note,
        'createdAt' => date('Y-m-d H:i:s')
    ];

    // 7. Update autotrading_system_state and fgt_system_state
    try {
        $st = $pdo->query("SELECT `data_json` FROM `autotrading_system_state` WHERE `state_key` = 'main_state' LIMIT 1");
        $row = $st ? $st->fetch() : null;
        if ($row && !empty($row['data_json'])) {
            $j = json_decode($row['data_json'], true) ?: [];
            if (isset($j['users']) && is_array($j['users'])) {
                foreach ($j['users'] as &$u) {
                    if ($u['id'] === $userId) {
                        $u['walletBalance'] = $newBalance;
                        $u['dailyCheckIn'] = $updatedCheckInData;
                        break;
                    }
                }
                unset($u);
            }
            if (!isset($j['transactions']) || !is_array($j['transactions'])) {
                $j['transactions'] = [];
            }
            array_unshift($j['transactions'], $newTx);

            $encodedJson = json_encode($j, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
            $updState = $pdo->prepare("UPDATE `autotrading_system_state` SET `data_json` = :dj, `updated_at` = CURRENT_TIMESTAMP WHERE `state_key` = 'main_state'");
            $updState->execute([':dj' => $encodedJson]);

            try {
                $updFgt = $pdo->prepare("UPDATE `fgt_system_state` SET `data_json` = :dj, `updated_at` = CURRENT_TIMESTAMP WHERE `state_key` = 'main_state'");
                $updFgt->execute([':dj' => $encodedJson]);
            } catch (Exception $eFgt) {}
        }
    } catch(Exception $eJ) {}

    echo json_encode([
        'success' => true,
        'rewardAmount' => $rewardAmount,
        'currentStreak' => $newStreak,
        'walletBalance' => $newBalance,
        'transaction' => $newTx,
        'message' => "Selamat! Absensi hari ke-{$newStreak} berhasil. Bonus Rp " . number_format($rewardAmount, 0, ',', '.') . " masuk ke Saldo Utama Anda!"
    ]);
    exit();
}

// 4. Action: Direct Member Registration (Immediate MySQL Realtime Commitment)
if ($action === 'register') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Method not allowed. Use POST.']);
        exit();
    }
    if (!$pdo) {
        http_response_code(503);
        echo json_encode(['success' => false, 'message' => 'Database belum terhubung.']);
        exit();
    }
    ensureTablesExist($pdo);

    $raw = file_get_contents('php://input');
    $in = json_decode($raw, true) ?: [];
    $uData = (isset($in['user']) && is_array($in['user'])) ? $in['user'] : $in;

    $username = strtolower(trim($uData['username'] ?? ''));
    $fullName = trim($uData['fullName'] ?? $uData['full_name'] ?? $username);
    $email = strtolower(trim($uData['email'] ?? ''));
    $phone = trim($uData['phone'] ?? '');
    $password = $uData['password'] ?? $uData['password_hash'] ?? '';
    $referralCode = trim($uData['referralCode'] ?? $uData['referral_code'] ?? '');
    $referredBy = trim($uData['referredBy'] ?? $uData['referred_by'] ?? '') ?: null;

    if (empty($username) || empty($email) || empty($password)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Username, Email, dan Password wajib diisi!']);
        exit();
    }

    // Rate-limit registrations per IP (anti mass-account creation)
    if (!rateLimit('register', 5, 300)) {
        http_response_code(429);
        echo json_encode(['success' => false, 'message' => 'Terlalu banyak permintaan registrasi. Coba lagi beberapa menit lagi.']);
        exit();
    }

    if (strlen($password) < 6) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Password minimal harus 6 karakter!']);
        exit();
    }

    // Reject HTML/script injection in display name at the source
    if (preg_match('/[<>]/', $fullName)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Nama lengkap tidak boleh mengandung karakter khusus (< atau >).']);
        exit();
    }

    // Check duplicate username, email, phone in MySQL users table
    $checkStmt = $pdo->prepare("SELECT `username`, `email`, `phone` FROM `users` WHERE LOWER(`username`) = :u OR LOWER(`email`) = :e OR (`phone` <> '' AND `phone` = :p) LIMIT 1");
    $checkStmt->execute([':u' => $username, ':e' => $email, ':p' => $phone]);
    $existing = $checkStmt->fetch();
    if ($existing) {
        if (strtolower($existing['username']) === $username) {
            echo json_encode(['success' => false, 'message' => 'Username sudah digunakan oleh akun lain!']);
            exit();
        }
        if (strtolower($existing['email']) === $email) {
            echo json_encode(['success' => false, 'message' => 'Alamat email sudah terdaftar pada sistem!']);
            exit();
        }
        if ($phone !== '' && (string)$existing['phone'] === (string)$phone) {
            echo json_encode(['success' => false, 'message' => 'Nomor WhatsApp/HP sudah terdaftar pada akun lain!']);
            exit();
        }
    }

    // Is email OTP verification enforced by platform settings?
    $verifyRequired = false;
    try {
        $sStmtReg = $pdo->prepare("SELECT `setting_value` FROM `settings` WHERE `setting_key` = 'general_settings' LIMIT 1");
        $sStmtReg->execute();
        $sRowReg = $sStmtReg->fetch();
        if ($sRowReg && !empty($sRowReg['setting_value'])) {
            $setObjReg = json_decode($sRowReg['setting_value'], true);
            $verifyRequired = is_array($setObjReg) && !empty($setObjReg['email']['verificationRequired']);
        }
    } catch(Exception $eSetReg) {}

    $passwordHash = hashPassword($password);

    // Generate userId and referral code if not provided
    $userId = 'usr-' . round(microtime(true) * 1000);
    if (empty($referralCode)) {
        $referralCode = strtoupper(substr($username, 0, 4)) . rand(100, 999);
    }

    // Insert into MySQL users table
    $insStmt = $pdo->prepare("
        INSERT INTO `users` (
            `id`, `username`, `password_hash`, `full_name`, `email`, `phone`, `city`,
            `wallet_balance`, `affiliate_balance`, `points`, `referral_code`, `referred_by`,
            `status`, `is_blocked`, `role`, `created_at`
        )        VALUES (
            :id, :username, :password_hash, :full_name, :email, :phone, '',
            0, 0, 10, :referral_code, :referred_by,
            :status, 0, 'user', NOW()
        )
    ");
    $insStmt->execute([
        ':id' => $userId,
        ':username' => $username,
        ':password_hash' => $passwordHash,
        ':full_name' => $fullName,
        ':email' => $email,
        ':phone' => $phone,
        ':referral_code' => $referralCode,
        ':referred_by' => $referredBy,
        ':status' => $verifyRequired ? 'pending' : 'active'
    ]);

    // Update main_state atomically (passwords/OTP are never stored in JSON state)
    $newUserObj = [
        'id' => $userId,
        'username' => $username,
        'fullName' => $fullName,
        'email' => $email,
        'phone' => $phone,
        'city' => '',
        'walletBalance' => 0,
        'affiliateBalance' => 0,
        'points' => 10,
        'referralCode' => $referralCode,
        'referredBy' => $referredBy,
        'status' => $verifyRequired ? 'pending' : 'active',
        'isBlocked' => false,
        'blockedReason' => '',
        'blockedAt' => null,
        'blockHistory' => [],
        'role' => 'user',
        'emailVerified' => !$verifyRequired,
        'isPendingVerification' => $verifyRequired,
        'registeredAt' => date('c')
    ];

    try {
        $st = $pdo->query("SELECT `data_json` FROM `autotrading_system_state` WHERE `state_key` = 'main_state' LIMIT 1");
        $row = $st->fetch();
        if ($row && !empty($row['data_json'])) {
            $sData = json_decode($row['data_json'], true);
            if (is_array($sData)) {
                $sData['users'] = $sData['users'] ?? [];
                // Check if user already in list
                $found = false;
                foreach ($sData['users'] as &$u) {
                    if ($u['id'] === $userId || $u['username'] === $username) {
                        $u = $newUserObj;
                        $found = true;
                        break;
                    }
                }
                unset($u);
                if (!$found) {
                    $sData['users'][] = $newUserObj;
                }
                $cleanJ = json_encode($sData, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
                $upd = $pdo->prepare("UPDATE `autotrading_system_state` SET `data_json` = :dj, `updated_at` = CURRENT_TIMESTAMP WHERE `state_key` = 'main_state'");
                $upd->execute([':dj' => $cleanJ]);
            }
        }
    } catch(Exception $eS) {}

    // Auto-login the fresh account (unless email OTP verification is enforced)
    if (!$verifyRequired) {
        $_SESSION['uid'] = $userId;
        $_SESSION['role'] = 'user';
        $_SESSION['username'] = $username;
    }

    $respUser = $newUserObj;
    stripUserSecrets($respUser);

    echo json_encode([
        'success' => true,
        'user' => $respUser,
        'requiresVerification' => $verifyRequired,
        'message' => $verifyRequired
            ? 'Registrasi tercatat di database! Silakan verifikasi email Anda dengan kode OTP yang dikirimkan.'
            : 'Registrasi member berhasil tercatat di database MySQL!'
    ]);
    exit();
}



// 7. Action: Backup & Export Database State
if ($action === 'backup') {
    requireAdmin();
    if (!$pdo) {
        http_response_code(503);
        echo json_encode(['success' => false, 'message' => 'Database MySQL cPanel belum terhubung.']);
        exit();
    }
    ensureTablesExist($pdo);

    $format = $_GET['format'] ?? 'json';
    $download = !empty($_GET['download']);

    // Fetch live relational tables
    $users = $pdo->query("SELECT * FROM `users` ORDER BY `created_at` ASC")->fetchAll();
    $transactions = $pdo->query("SELECT * FROM `transactions` ORDER BY `created_at` DESC")->fetchAll();
    $investments = $pdo->query("SELECT * FROM `investments` ORDER BY `created_at` DESC")->fetchAll();
    $settings = $pdo->query("SELECT * FROM `settings`")->fetchAll();

    // Fetch system state JSON
    $stateRow = $pdo->query("SELECT `data_json`, `updated_at` FROM `autotrading_system_state` WHERE `state_key` = 'main_state' LIMIT 1")->fetch();
    $stateData = ($stateRow && !empty($stateRow['data_json'])) ? json_decode($stateRow['data_json'], true) : [];

    $filenameDate = date('Ymd_His');

    if ($format === 'sql') {
        // Generate SQL Dump
        $sql = "-- AUTOTRADING SQL BACKUP EXPORT\n";
        $sql .= "-- Generated: " . date('Y-m-d H:i:s') . "\n";
        $sql .= "-- Platform: autotrading.my.id\n\n";
        $sql .= "SET FOREIGN_KEY_CHECKS=0;\n\n";

        // Dump users
        $sql .= "-- Table structure & data for `users`\n";
        foreach ($users as $u) {
            $cols = array_keys($u);
            $escapedCols = array_map(function($c) { return "`$c`"; }, $cols);
            $escapedVals = array_map(function($v) use ($pdo) {
                if (is_null($v)) return 'NULL';
                return $pdo->quote($v);
            }, array_values($u));
            $sql .= "INSERT INTO `users` (" . implode(', ', $escapedCols) . ") VALUES (" . implode(', ', $escapedVals) . ") ON DUPLICATE KEY UPDATE `status` = VALUES(`status`), `wallet_balance` = VALUES(`wallet_balance`);\n";
        }
        $sql .= "\n";

        // Dump transactions
        $sql .= "-- Table structure & data for `transactions`\n";
        foreach ($transactions as $t) {
            $cols = array_keys($t);
            $escapedCols = array_map(function($c) { return "`$c`"; }, $cols);
            $escapedVals = array_map(function($v) use ($pdo) {
                if (is_null($v)) return 'NULL';
                return $pdo->quote($v);
            }, array_values($t));
            $sql .= "INSERT INTO `transactions` (" . implode(', ', $escapedCols) . ") VALUES (" . implode(', ', $escapedVals) . ") ON DUPLICATE KEY UPDATE `status` = VALUES(`status`);\n";
        }
        $sql .= "\n";

        // Dump investments
        $sql .= "-- Table structure & data for `investments`\n";
        foreach ($investments as $i) {
            $cols = array_keys($i);
            $escapedCols = array_map(function($c) { return "`$c`"; }, $cols);
            $escapedVals = array_map(function($v) use ($pdo) {
                if (is_null($v)) return 'NULL';
                return $pdo->quote($v);
            }, array_values($i));
            $sql .= "INSERT INTO `investments` (" . implode(', ', $escapedCols) . ") VALUES (" . implode(', ', $escapedVals) . ") ON DUPLICATE KEY UPDATE `status` = VALUES(`status`);\n";
        }
        $sql .= "\nSET FOREIGN_KEY_CHECKS=1;\n";

        header('Content-Type: application/sql; charset=utf-8');
        header('Content-Disposition: attachment; filename="autotrading_backup_' . $filenameDate . '.sql"');
        echo $sql;
        exit();
    }

    $backupPayload = [
        'system' => 'AUTOTRADING INVESTMENT PLATFORM',
        'version' => '2.5.0-PROD',
        'exportDate' => date('Y-m-d H:i:s'),
        'timestamp' => time(),
        'counts' => [
            'users' => count($users),
            'transactions' => count($transactions),
            'investments' => count($investments)
        ],
        'summary' => [
            'users' => count($users),
            'transactions' => count($transactions),
            'investments' => count($investments)
        ],
        'relational' => [
            'users' => $users,
            'transactions' => $transactions,
            'investments' => $investments,
            'settings' => $settings
        ],
        'state' => $stateData
    ];

    if ($download) {
        header('Content-Type: application/json; charset=utf-8');
        header('Content-Disposition: attachment; filename="autotrading_backup_' . $filenameDate . '.json"');
        echo json_encode($backupPayload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        exit();
    }

    echo json_encode([
        'success' => true,
        'message' => 'Cadangan database berhasil digenerate!',
        'backup' => $backupPayload
    ]);
    exit();
}

// 6. Action: Direct User Deletion
if ($action === 'delete_user') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Method not allowed. Use POST.']);
        exit();
    }
    requireAdmin();
    if (!$pdo) {
        http_response_code(503);
        echo json_encode(['success' => false, 'message' => 'Database belum terhubung.']);
        exit();
    }
    ensureTablesExist($pdo);

    $raw = file_get_contents('php://input');
    $in = json_decode($raw, true) ?: [];
    $userId = trim($in['userId'] ?? $in['id'] ?? '');

    if (empty($userId) || $userId === 'usr-admin') {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'User ID tidak valid atau akun admin terlindungi.']);
        exit();
    }

    $stmt = $pdo->prepare("DELETE FROM `users` WHERE `id` = :id");
    $stmt->execute([':id' => $userId]);

    // Also remove from JSON state
    try {
        $st = $pdo->query("SELECT `data_json` FROM `autotrading_system_state` WHERE `state_key` = 'main_state' LIMIT 1");
        $row = $st->fetch();
        if ($row && !empty($row['data_json'])) {
            $sData = json_decode($row['data_json'], true);
            if (is_array($sData) && isset($sData['users']) && is_array($sData['users'])) {
                $sData['users'] = array_values(array_filter($sData['users'], function($u) use ($userId) {
                    return $u['id'] !== $userId;
                }));
                $cleanJ = json_encode($sData, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
                $upd = $pdo->prepare("UPDATE `autotrading_system_state` SET `data_json` = :dj, `updated_at` = CURRENT_TIMESTAMP WHERE `state_key` = 'main_state'");
                $upd->execute([':dj' => $cleanJ]);
            }
        }
    } catch(Exception $eS) {}

    echo json_encode(['success' => true, 'message' => 'User berhasil dihapus dari database.']);
    exit();
}

// 5. Action: Direct User Status Update (Block/Unblock)
if ($action === 'update_user_status') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Method not allowed. Use POST.']);
        exit();
    }
    requireAdmin();
    if (!$pdo) {
        http_response_code(503);
        echo json_encode(['success' => false, 'message' => 'Database belum terhubung.']);
        exit();
    }
    ensureTablesExist($pdo);

    $raw = file_get_contents('php://input');
    $in = json_decode($raw, true) ?: [];
    $userId = trim($in['userId'] ?? $in['user_id'] ?? $in['id'] ?? '');
    $isBlocked = (!empty($in['isBlocked']) || !empty($in['is_blocked']) || (($in['status'] ?? '') === 'blocked')) ? 1 : 0;
    $blockedReason = trim($in['blockedReason'] ?? $in['reason'] ?? $in['blocked_reason'] ?? '');
    $status = $isBlocked ? 'blocked' : 'active';

    if (empty($userId)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'User ID wajib diisi.']);
        exit();
    }

    // Update relational table
    $stmt = $pdo->prepare("
        UPDATE `users`
        SET `is_blocked` = :ib,
            `status` = :st,
            `blocked_reason` = :br,
            `blocked_at` = :ba,
            `updated_at` = CURRENT_TIMESTAMP
        WHERE `id` = :id
    ");
    $stmt->execute([
        ':ib' => $isBlocked,
        ':st' => $status,
        ':br' => $isBlocked ? $blockedReason : null,
        ':ba' => $isBlocked ? date('Y-m-d H:i:s') : null,
        ':id' => $userId
    ]);

    // Update JSON state
    try {
        $st = $pdo->query("SELECT `data_json` FROM `autotrading_system_state` WHERE `state_key` = 'main_state' LIMIT 1");
        $row = $st->fetch();
        if ($row && !empty($row['data_json'])) {
            $sData = json_decode($row['data_json'], true);
            if (is_array($sData) && isset($sData['users']) && is_array($sData['users'])) {
                foreach ($sData['users'] as &$u) {
                    if ($u['id'] === $userId) {
                        $u['isBlocked'] = (bool)$isBlocked;
                        $u['status'] = $status;
                        $u['blockedReason'] = $isBlocked ? $blockedReason : '';
                        $u['blockedAt'] = $isBlocked ? date('c') : null;
                        break;
                    }
                }
                unset($u);
                $cleanJ = json_encode($sData, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
                $upd = $pdo->prepare("UPDATE `autotrading_system_state` SET `data_json` = :dj, `updated_at` = CURRENT_TIMESTAMP WHERE `state_key` = 'main_state'");
                $upd->execute([':dj' => $cleanJ]);
            }
        }
    } catch(Exception $eS) {}

    echo json_encode([
        'success' => true,
        'isBlocked' => (bool)$isBlocked,
        'status' => $status,
        'message' => 'Status anggota berhasil disinkronkan ke database MySQL!'
    ]);
    exit();
}

// 6. Action: Send Email / Mailer forwarding
if ($action === 'send_email' || in_array($action, ['send_otp', 'admin_notification', 'test', 'welcome'])) {
    require_once __DIR__ . '/mail.php';
    exit();
}

// 7. Action: Clear Demo Data & Purge all demo records for clean production
if ($action === 'clear_demo' || $action === 'reset_production') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Method not allowed. Use POST.']);
        exit();
    }
    requireAdmin();
    if (!$pdo) {
        http_response_code(503);
        echo json_encode(['success' => false, 'message' => 'Database MySQL tidak terhubung']);
        exit();
    }
    ensureTablesExist($pdo);
    
    try {
        // Delete all non-admin users
        $pdo->exec("DELETE FROM `users` WHERE `role` != 'admin' AND `id` != 'usr-admin'");
        
        // Reset admin balance & stats to 0
        $pdo->exec("UPDATE `users` SET `wallet_balance` = 0, `affiliate_balance` = 0, `points` = 0 WHERE `id` = 'usr-admin'");
        
        // Ensure admin user exists if table was empty, and always reseed the
        // admin credential to the configured bootstrap password (never 'admin').
        $bootstrapHash = hashPassword((getenv('AT_ADMIN_BOOTSTRAP') ?: ADMIN_BOOTSTRAP_PASSWORD));
        $checkAdmin = $pdo->query("SELECT COUNT(*) FROM `users` WHERE `id` = 'usr-admin'")->fetchColumn();
        if ((int)$checkAdmin === 0) {
            $insAdmin = $pdo->prepare("INSERT INTO `users` (`id`, `username`, `password_hash`, `salt`, `full_name`, `email`, `phone`, `city`, `wallet_balance`, `affiliate_balance`, `points`, `referral_code`, `referred_by`, `status`, `is_blocked`, `bank_name`, `account_number`, `account_holder`, `role`, `created_at`) VALUES ('usr-admin', 'admin', :ph, '', 'System Administrator', 'admin@autotrading.my.id', '081299990000', 'Jakarta', 0, 0, 0, 'ADMINVIP', NULL, 'active', 0, '', '', '', 'admin', '2026-01-01 00:00:00')");
            $insAdmin->execute([':ph' => $bootstrapHash]);
        } else {
            $updAdminPh = $pdo->prepare("UPDATE `users` SET `password_hash` = :ph WHERE `id` = 'usr-admin'");
            $updAdminPh->execute([':ph' => $bootstrapHash]);
        }

        // Delete all transactions and investments
        $pdo->exec("DELETE FROM `transactions`");
        $pdo->exec("DELETE FROM `investments`");
        
        // Reset JSON state to clean production
        $st = $pdo->query("SELECT `data_json` FROM `autotrading_system_state` WHERE `state_key` = 'main_state' LIMIT 1");
        $row = $st->fetch();
        if (!$row || empty($row['data_json'])) {
            try {
                $stOld = $pdo->query("SELECT `data_json` FROM `fgt_system_state` WHERE `state_key` = 'main_state' LIMIT 1");
                $row = $stOld->fetch();
            } catch(PDOException $eOld) {}
        }

        if ($row && !empty($row['data_json'])) {
            $stateData = json_decode($row['data_json'], true);
            if (is_array($stateData)) {
                $stateData['users'] = [
                    [
                        'id' => 'usr-admin',
                        'username' => 'admin',
                        'fullName' => 'System Administrator',
                        'email' => 'admin@autotrading.my.id',
                        'phone' => '081299990000',
                        'role' => 'admin',
                        'walletBalance' => 0,
                        'affiliateBalance' => 0,
                        'points' => 0,
                        'referralCode' => 'ADMINVIP',
                        'referredBy' => null,
                        'status' => 'active',
                        'kycStatus' => 'verified',
                        'isBlocked' => false,
                        'blockedReason' => '',
                        'blockedAt' => null,
                        'blockHistory' => [],
                        'registeredAt' => '2026-01-01T00:00:00.000Z'
                    ]
                ];
                $stateData['investments'] = [];
                $stateData['transactions'] = [];
                $stateData['redemptions'] = [];
                $stateData['testimonials'] = [];
                if (isset($stateData['plans']) && is_array($stateData['plans'])) {
                    foreach ($stateData['plans'] as &$p) {
                        $p['activeCount'] = 0;
                    }
                    unset($p);
                }
                $stateData['currentSession'] = null;
                $cleanJson = json_encode($stateData, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
                
                $upd = $pdo->prepare("UPDATE `autotrading_system_state` SET `data_json` = :dj, `updated_at` = CURRENT_TIMESTAMP WHERE `state_key` = 'main_state'");
                $upd->execute([':dj' => $cleanJson]);
                
                try {
                    $updFgt = $pdo->prepare("UPDATE `fgt_system_state` SET `data_json` = :dj, `updated_at` = CURRENT_TIMESTAMP WHERE `state_key` = 'main_state'");
                    $updFgt->execute([':dj' => $cleanJson]);
                } catch(PDOException $e2) {}
            }
        }
        
        echo json_encode([
            'success' => true,
            'message' => 'Semua data user demo, transaksi, dan investasi berhasil dibersihkan! Sistem 100% siap produksi.'
        ]);
    } catch(Exception $ex) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Gagal purge data: ' . $ex->getMessage()]);
    }
    exit();
}

// 8. Action: Clean User State & Deduplicate Investments/Transactions
if ($action === 'cleanup_duplicates') {
    requireAdmin();
    if (!$pdo) {
        http_response_code(503);
        echo json_encode(['success' => false, 'message' => 'Database MySQL tidak terhubung']);
        exit();
    }
    ensureTablesExist($pdo);
    
    try {
        // 1. Delete duplicate investments for duitpro, keeping only inv-1791011201525
        $pdo->exec("DELETE FROM `investments` WHERE `user_id` = 'usr-1790996838699' AND `id` IN ('inv-1791011202314', 'inv-1791011202919', 'inv-1791011203108')");

        // 2. Delete duplicate investment transactions, keeping only TRX-INV-870516
        $pdo->exec("DELETE FROM `transactions` WHERE `user_id` = 'usr-1790996838699' AND `id` IN ('TRX-INV-692747', 'TRX-INV-902250', 'TRX-INV-878651')");

        // 3. Fix TRX-INV-870516 details
        $pdo->exec("UPDATE `transactions` SET `type` = 'invest_plan', `payment_method` = 'Learn (15 Hari)', `wallet_source` = 'Wallet Balance', `status` = 'approved' WHERE `id` = 'TRX-INV-870516'");

        // 4. Delete duplicate check-in transactions, keeping only TX-CHK-976603
        $pdo->exec("DELETE FROM `transactions` WHERE `user_id` = 'usr-1790996838699' AND `id` IN ('TX-CHK-972238', 'TX-CHK-970065', 'TX-CHK-967803', 'TX-CHK-900953', 'TX-CHK-614612', 'TX-CHK-029223', 'TX-CHK-792106', 'TX-CHK-843026', 'TX-CHK-122195')");

        // 5. Fix TX-CHK-976603 details
        $pdo->exec("UPDATE `transactions` SET `type` = 'bonus', `payment_method` = 'Absensi Harian (Check-in H-1)', `status` = 'approved' WHERE `id` = 'TX-CHK-976603'");

        // 6. Set correct wallet balance for duitpro: 351,310 IDR
        $wibToday = date('Y-m-d');
        $checkInData = json_encode([
            'currentStreak' => 1,
            'lastCheckInDate' => $wibToday,
            'history' => [
                ['date' => $wibToday, 'day' => 1, 'amount' => 1000, 'claimedAt' => date('c')]
            ]
        ]);
        $upUser = $pdo->prepare("UPDATE `users` SET `wallet_balance` = 351310, `points` = 55, `daily_check_in` = :dci WHERE `id` = 'usr-1790996838699'");
        $upUser->execute([':dci' => $checkInData]);

        // 7. Synchronize JSON state table
        $st = $pdo->query("SELECT `data_json` FROM `autotrading_system_state` WHERE `state_key` = 'main_state' LIMIT 1");
        $row = $st->fetch();
        if ($row && !empty($row['data_json'])) {
            $json = json_decode($row['data_json'], true);
            if (is_array($json)) {
                // Filter investments
                if (isset($json['investments']) && is_array($json['investments'])) {
                    $json['investments'] = array_values(array_filter($json['investments'], function($inv) {
                        return !in_array($inv['id'], ['inv-1791011202314', 'inv-1791011202919', 'inv-1791011203108']);
                    }));
                }
                // Filter transactions
                if (isset($json['transactions']) && is_array($json['transactions'])) {
                    $toRemove = ['TRX-INV-692747', 'TRX-INV-902250', 'TRX-INV-878651', 'TX-CHK-972238', 'TX-CHK-970065', 'TX-CHK-967803', 'TX-CHK-900953', 'TX-CHK-614612', 'TX-CHK-029223', 'TX-CHK-792106', 'TX-CHK-843026', 'TX-CHK-122195'];
                    $json['transactions'] = array_values(array_filter($json['transactions'], function($t) use ($toRemove) {
                        return !in_array($t['id'], $toRemove);
                    }));
                    // update TRX-INV-870516 and TX-CHK-976603
                    foreach ($json['transactions'] as &$tx) {
                        if ($tx['id'] === 'TRX-INV-870516') {
                            $tx['type'] = 'invest_plan';
                            $tx['paymentMethod'] = 'Learn (15 Hari)';
                            $tx['note'] = 'Aktivasi paket investasi Learn (15 hari)';
                            $tx['status'] = 'approved';
                        }
                        if ($tx['id'] === 'TX-CHK-976603') {
                            $tx['type'] = 'bonus';
                            $tx['paymentMethod'] = 'Absensi Harian (Check-in H-1)';
                            $tx['note'] = 'Bonus absensi harian hari ke-1/7 (+Rp 1.000)';
                            $tx['status'] = 'approved';
                        }
                    }
                    unset($tx);
                }
                // Update user duitpro
                if (isset($json['users']) && is_array($json['users'])) {
                    foreach ($json['users'] as &$u) {
                        if ($u['id'] === 'usr-1790996838699') {
                            $u['walletBalance'] = 351310;
                            $u['points'] = 55;
                            $u['dailyCheckIn'] = [
                                'currentStreak' => 1,
                                'lastCheckInDate' => $wibToday,
                                'history' => [
                                    ['date' => $wibToday, 'day' => 1, 'amount' => 1000, 'claimedAt' => date('c')]
                                ]
                            ];
                        }
                    }
                    unset($u);
                }
                // Save back to JSON state
                $upd = $pdo->prepare("UPDATE `autotrading_system_state` SET `data_json` = :dj WHERE `state_key` = 'main_state'");
                $upd->execute([':dj' => json_encode($json, JSON_UNESCAPED_UNICODE)]);
            }
        }

        echo json_encode([
            'success' => true,
            'message' => 'State cleaned: 3 duplicate investments and duplicate transactions removed, wallet balance reset to Rp 351.310.'
        ]);
    } catch(Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
    exit();
}

// ===========================================================================
// AUTH ACTIONS - server-side sessions, bcrypt passwords, OTP & password reset
// ===========================================================================

function loadMainState($pdo) {
    try {
        $st = $pdo->query("SELECT `data_json` FROM `autotrading_system_state` WHERE `state_key` = 'main_state' LIMIT 1");
        $row = $st ? $st->fetch() : null;
        if (!$row || empty($row['data_json'])) {
            $stOld = $pdo->query("SELECT `data_json` FROM `fgt_system_state` WHERE `state_key` = 'main_state' LIMIT 1");
            $row = $stOld ? $stOld->fetch() : null;
        }
        if ($row && !empty($row['data_json'])) {
            $data = json_decode($row['data_json'], true);
            if (is_array($data)) return $data;
        }
    } catch (Exception $eL) {}
    return [];
}

function saveMainState($pdo, $data) {
    $json = json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    $stmt = $pdo->prepare("INSERT INTO `autotrading_system_state` (`state_key`, `data_json`) VALUES ('main_state', :dj) ON DUPLICATE KEY UPDATE `data_json` = :dj2, `updated_at` = CURRENT_TIMESTAMP");
    $stmt->execute([':dj' => $json, ':dj2' => $json]);
    try {
        $stmtF = $pdo->prepare("INSERT INTO `fgt_system_state` (`state_key`, `data_json`) VALUES ('main_state', :dj) ON DUPLICATE KEY UPDATE `data_json` = :dj2, `updated_at` = CURRENT_TIMESTAMP");
        $stmtF->execute([':dj' => $json, ':dj2' => $json]);
    } catch (Exception $eF) {}
}

function findUserRowByIdentifier($pdo, $identifier) {
    $id = strtolower(trim((string)$identifier));
    if ($id === '') return null;
    try {
        $stmt = $pdo->prepare("SELECT * FROM `users` WHERE LOWER(`username`) = :u OR LOWER(`email`) = :e OR (`phone` <> '' AND `phone` = :p) LIMIT 1");
        $stmt->execute([':u' => $id, ':e' => $id, ':p' => trim((string)$identifier)]);
        $row = $stmt->fetch();
        return $row ? $row : null;
    } catch (Exception $eF) {}
    return null;
}

function findStateUserByIdentifier($state, $identifier) {
    $id = strtolower(trim((string)$identifier));
    if (!isset($state['users']) || !is_array($state['users'])) return null;
    foreach ($state['users'] as $su) {
        if (empty($su['id'])) continue;
        if (isset($su['id']) && (string)$su['id'] === trim((string)$identifier)) return $su;
        if (!empty($su['username']) && strtolower($su['username']) === $id) return $su;
        if (!empty($su['email']) && strtolower($su['email']) === $id) return $su;
        if (!empty($su['phone']) && trim((string)$su['phone']) === trim((string)$identifier)) return $su;
    }
    return null;
}

function maskEmailAddr($email) {
    $email = (string)$email;
    $at = strpos($email, '@');
    if ($at === false) return $email;
    $local = substr($email, 0, $at);
    $domain = substr($email, $at);
    $head = substr($local, 0, min(2, strlen($local)));
    return $head . '***' . $domain;
}

function getEmailSettingsFromState($state) {
    if (isset($state['settings']['email']) && is_array($state['settings']['email'])) {
        return $state['settings']['email'];
    }
    return [
        'mailMethod' => 'cpanel',
        'smtp' => [
            'host' => 'mail.' . ($_SERVER['SERVER_NAME'] ?? 'localhost'),
            'port' => 465,
            'secure' => 'ssl',
            'user' => 'noreply@' . ($_SERVER['SERVER_NAME'] ?? 'localhost'),
            'pass' => '',
            'fromName' => 'AUTOTRADING Official',
            'fromEmail' => 'noreply@' . ($_SERVER['SERVER_NAME'] ?? 'autotrading.my.id')
        ]
    ];
}

/** Load the shared mail library (functions only, no request routing). */
function loadMailLibrary() {
    static $loaded = false;
    if ($loaded) return;
    $loaded = true;
    if (!defined('MAIL_LIB_ONLY')) define('MAIL_LIB_ONLY', true);
    require_once __DIR__ . '/mail.php';
}

// --- action=login ----------------------------------------------------------
if ($action === 'login') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Method not allowed. Use POST.']);
        exit();
    }
    if (!$pdo) {
        http_response_code(503);
        echo json_encode(['success' => false, 'message' => 'Database MySQL cPanel belum terhubung.']);
        exit();
    }
    if (!rateLimit('login_ip', 20, 300)) {
        http_response_code(429);
        echo json_encode(['success' => false, 'message' => 'Terlalu banyak percobaan login dari jaringan Anda. Coba lagi dalam beberapa menit.']);
        exit();
    }
    ensureTablesExist($pdo);

    $in = json_decode(file_get_contents('php://input'), true) ?: [];
    $identifier = trim((string)($in['identifier'] ?? $in['username'] ?? $in['email'] ?? ''));
    $password = (string)($in['password'] ?? '');

    if ($identifier === '' || $password === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Harap isi username/email dan password!']);
        exit();
    }
    if (!rateLimit('login_id_' . md5(strtolower($identifier)), 8, 300)) {
        http_response_code(429);
        echo json_encode(['success' => false, 'message' => 'Terlalu banyak percobaan password salah (5x). Akun dikunci sementara selama beberapa menit demi keamanan!']);
        exit();
    }

    $row = findUserRowByIdentifier($pdo, $identifier);
    $isStateOnly = false;
    $stateUserLegacy = null;
    if (!$row) {
        // Legacy accounts that only exist inside the JSON state snapshot
        $stateOnly = loadMainState($pdo);
        $su = findStateUserByIdentifier($stateOnly, $identifier);
        if (!$su) {
            jsonResponse(['success' => false, 'message' => 'Akun tidak ditemukan. Silakan periksa kembali atau daftar!'], 401);
        }
        $isStateOnly = true;
        $stateUserLegacy = $su;
        $row = [
            'id' => (string)$su['id'],
            'username' => (string)($su['username'] ?? ''),
            'password_hash' => (string)($su['password'] ?? ''),
            'role' => (($su['role'] ?? '') === 'admin') ? 'admin' : 'member',
            'status' => (string)($su['status'] ?? 'active'),
            'is_blocked' => !empty($su['isBlocked']) ? 1 : 0,
            'full_name' => (string)($su['full_name'] ?? $su['fullName'] ?? ''),
            'email' => (string)($su['email'] ?? ''),
            'phone' => (string)($su['phone'] ?? '')
        ];
    }

    if (!empty($row['is_blocked']) || (($row['status'] ?? '') === 'blocked')) {
        jsonResponse(['success' => false, 'isBlocked' => true, 'message' => 'Akun Anda telah DIBLOKIR oleh Administrator. Silakan hubungi Layanan Pelanggan (CS) untuk bantuan.'], 403);
    }
    if (($row['status'] ?? '') === 'pending') {
        jsonResponse(['success' => false, 'requiresVerification' => true, 'message' => 'Akun Anda belum aktif karena belum diverifikasi. Silakan masukkan kode OTP yang dikirimkan ke email Anda.'], 403);
    }

    $stored = (string)($row['password_hash'] ?? '');
    $rotatedSeed = false;
    $isAdminRole = (($row['role'] ?? '') === 'admin');
    // Only the administrator bootstrap seed may be auto-rotated; other accounts
    // with an empty hash must recover through the OTP reset flow (never bootstrap).
    if (!$isStateOnly && $isAdminRole && ($stored === '' || $stored === 'BOOTSTRAP' || strtolower($stored) === 'admin')) {
        // Known-weak seed credential (admin/admin or empty) -> rotate to configured bootstrap password
        $bootstrap = (string)(getenv('AT_ADMIN_BOOTSTRAP') ?: ADMIN_BOOTSTRAP_PASSWORD);
        try {
            $upd = $pdo->prepare("UPDATE `users` SET `password_hash` = :ph WHERE `id` = :id");
            $upd->execute([':ph' => hashPassword($bootstrap), ':id' => $row['id']]);
        } catch (Exception $eRot) {}
        $stored = $bootstrap;
        $rotatedSeed = true;
    }

    $check = verifyPassword($password, $stored);
    if (!$check['ok']) {
        $msg = 'Username atau password salah!';
        if ($rotatedSeed) {
            $msg = 'Password default lama sudah diganti otomatis demi keamanan. Gunakan password baru yang tercantum di variabel ADMIN_BOOTSTRAP_PASSWORD pada api/config.php, lalu segera ganti password tersebut.';
        } elseif ($stored === '') {
            $msg = 'Password akun ini belum terdaftar di sistem. Gunakan fitur "Lupa Password" untuk mengatur ulang password Anda via kode OTP email.';
        }
        jsonResponse(['success' => false, 'message' => $msg], 401);
    }

    if (!empty($check['needsRehash']) && !$rotatedSeed) {
        // Legacy plaintext row: migrate the account into MySQL with a bcrypt hash
        $migrationOk = false;
        try {
            if ($isStateOnly && is_array($stateUserLegacy)) {
                $suL = $stateUserLegacy;
                $refCode = (string)($suL['referralCode'] ?? ($suL['referral_code'] ?? ''));
                if ($refCode === '') {
                    $refCode = strtoupper(substr((string)$row['username'], 0, 4)) . random_int(100, 999);
                }
                $insLegacy = $pdo->prepare("INSERT INTO `users`
                    (`id`, `username`, `password_hash`, `full_name`, `email`, `phone`, `referral_code`, `referred_by`, `role`, `status`, `wallet_balance`, `affiliate_balance`, `points`, `created_at`)
                    VALUES (:id, :username, :ph, :fn, :em, :phone, :rc, :rb, :role, 'active', :wb, :ab, :pt, NOW())
                    ON DUPLICATE KEY UPDATE `password_hash` = VALUES(`password_hash`)");
                $insLegacy->execute([
                    ':id' => (string)$row['id'],
                    ':username' => (string)$row['username'],
                    ':ph' => hashPassword($password),
                    ':fn' => (string)($suL['fullName'] ?? $row['username']),
                    ':em' => (string)($suL['email'] ?? ''),
                    ':phone' => (string)($suL['phone'] ?? ''),
                    ':rc' => $refCode,
                    ':rb' => $suL['referredBy'] ?? null,
                    ':role' => (($suL['role'] ?? '') === 'admin') ? 'admin' : 'member',
                    ':wb' => (int)($suL['walletBalance'] ?? 0),
                    ':ab' => (int)($suL['affiliateBalance'] ?? 0),
                    ':pt' => (int)($suL['points'] ?? 0)
                ]);
                $migrationOk = true;
            } else {
                $upd = $pdo->prepare("UPDATE `users` SET `password_hash` = :ph WHERE `id` = :id");
                $upd->execute([':ph' => hashPassword($password), ':id' => $row['id']]);
                $migrationOk = true;
            }
        } catch (Exception $eH) {
            error_log('Password rehash migration failed: ' . $eH->getMessage());
        }
        try {
            if (!$migrationOk) throw new Exception('migration not confirmed');
            $stAll = loadMainState($pdo);
            if (count($stAll) > 0) {
                sanitizeStateData($stAll);
                saveMainState($pdo, $stAll);
            }
        } catch (Exception $eSs) {}
    }

    // Mitigate session fixation: new session id on every successful login
    if (session_status() === PHP_SESSION_ACTIVE) {
        @session_regenerate_id(true);
    }
    $_SESSION['uid'] = (string)$row['id'];
    $_SESSION['role'] = (($row['role'] ?? '') === 'admin') ? 'admin' : 'user';
    $_SESSION['username'] = (string)($row['username'] ?? '');

    jsonResponse([
        'success' => true,
        'user' => [
            'id' => (string)$row['id'],
            'username' => (string)($row['username'] ?? ''),
            'fullName' => (string)($row['full_name'] ?? $row['username'] ?? ''),
            'email' => (string)($row['email'] ?? ''),
            'phone' => (string)($row['phone'] ?? ''),
            'role' => $_SESSION['role']
        ],
        'rotatedSeed' => $rotatedSeed,
        'message' => 'Login berhasil!'
    ]);
}

// --- action=session --------------------------------------------------------
if ($action === 'session') {
    $uid = currentSessionUserId();
    echo json_encode([
        'success' => true,
        'loggedIn' => $uid !== '',
        'userId' => $uid,
        'role' => currentSessionRole()
    ]);
    exit();
}

// --- action=db_diag (admin only): storage diagnostics for the state JSON -----
if ($action === 'db_diag') {
    requireAdmin();
    $out = [
        'success' => true,
        'php' => [
            'post_max_size' => ini_get('post_max_size'),
            'memory_limit' => ini_get('memory_limit'),
            'max_input_time' => ini_get('max_input_time'),
        ],
        'mysql' => [],
        'tables' => [],
    ];
    foreach (['autotrading_system_state', 'fgt_system_state'] as $stTable) {
        $info = ['exists' => false];
        try {
            $row = $pdo->query(
                "SELECT `DATA_TYPE` AS dt, `CHARACTER_MAXIMUM_LENGTH` AS cml " .
                "FROM `INFORMATION_SCHEMA`.`COLUMNS` " .
                "WHERE `TABLE_SCHEMA` = DATABASE() AND `TABLE_NAME` = '" . $stTable . "' AND `COLUMN_NAME` = 'data_json'"
            )->fetch();
            if ($row) {
                $info['exists'] = true;
                $info['data_type'] = $row['dt'];
                $info['max_length'] = $row['cml'];
            }
        } catch (Exception $e) { $info['error'] = $e->getMessage(); }
        try {
            $raw = $pdo->query("SELECT `data_json` FROM `" . $stTable . "` WHERE `state_key` = 'main_state' LIMIT 1")->fetchColumn();
            if ($raw !== false) {
                $info['stored_bytes'] = strlen((string)$raw);
                try {
                    $info['server_length'] = (int)$pdo->query("SELECT LENGTH(`data_json`) FROM `" . $stTable . "` WHERE `state_key` = 'main_state' LIMIT 1")->fetchColumn();
                } catch (Exception $eLen) { $info['server_length_error'] = $eLen->getMessage(); }
                json_decode((string)$raw);
                $info['json_valid'] = json_last_error() === JSON_ERROR_NONE;
                $info['json_error'] = json_last_error_msg();
                if (json_last_error() === JSON_ERROR_NONE) {
                    $decoded = json_decode((string)$raw, true);
                    $info['top_keys'] = is_array($decoded) ? array_keys($decoded) : [];
                }
            } else {
                $info['stored_bytes'] = 0;
            }
        } catch (Exception $e) { $info['read_error'] = $e->getMessage(); }
        $out['tables'][$stTable] = $info;
    }
    try {
        $out['banner_rows'] = (int)$pdo->query("SELECT COUNT(*) FROM `banners`")->fetchColumn();
    } catch (Exception $e) {}
    try {
        $out['mysql'] = [
            'max_allowed_packet' => (string)$pdo->query("SELECT @@max_allowed_packet")->fetchColumn(),
            'sql_mode' => (string)$pdo->query("SELECT @@sql_mode")->fetchColumn(),
            'version' => (string)$pdo->query("SELECT VERSION()")->fetchColumn(),
        ];
    } catch (Exception $e) { $out['mysql_error'] = $e->getMessage(); }

    // Chunked-read probe: the driver caps a single fetched column at 1MB, so we
    // need to know that reading the value in slices works before relying on it.
    try {
        $probe = [];
        foreach ([1, 900001, 1800001] as $i => $off) {
            $piece = $pdo->query("SELECT SUBSTRING(`data_json`, " . (int)$off . ", 900000) FROM `autotrading_system_state` WHERE `state_key` = 'main_state' LIMIT 1")->fetchColumn();
            $probe['slice' . $i] = $piece === false || $piece === null ? null : strlen((string)$piece);
        }
        $left = $pdo->query("SELECT LEFT(`data_json`, 2000000) FROM `autotrading_system_state` WHERE `state_key` = 'main_state' LIMIT 1")->fetchColumn();
        $probe['left_2m'] = $left === false || $left === null ? null : strlen((string)$left);
        $out['chunk_probe'] = $probe;
    } catch (Exception $e) { $out['chunk_probe_error'] = $e->getMessage(); }
    try {
        $sv = $pdo->query("SELECT `setting_value` FROM `settings` WHERE `setting_key` = 'general_settings' LIMIT 1")->fetchColumn();
        $out['settings_table_bytes'] = $sv !== false ? strlen((string)$sv) : 0;
    } catch (Exception $e) {}
    echo json_encode($out);
    exit();
}

// --- action=logout ---------------------------------------------------------
if ($action === 'logout') {
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], !empty($p['secure']), !empty($p['httponly']));
    }
    session_destroy();
    echo json_encode(['success' => true, 'message' => 'Anda telah berhasil logout.']);
    exit();
}

// --- action=change_password ------------------------------------------------
if ($action === 'change_password') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Method not allowed. Use POST.']);
        exit();
    }
    requireLogin();
    if (!$pdo) {
        http_response_code(503);
        echo json_encode(['success' => false, 'message' => 'Database MySQL cPanel belum terhubung.']);
        exit();
    }
    if (!rateLimit('chgpass', 10, 300)) {
        http_response_code(429);
        echo json_encode(['success' => false, 'message' => 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.']);
        exit();
    }
    ensureTablesExist($pdo);

    $in = json_decode(file_get_contents('php://input'), true) ?: [];
    $oldPass = (string)($in['oldPassword'] ?? $in['oldPasswordConfirm'] ?? '');
    $newPass = (string)($in['newPassword'] ?? '');
    if ($oldPass === '' || $newPass === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Password lama dan password baru wajib diisi!']);
        exit();
    }
    if (strlen($newPass) < 6) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Password baru minimal harus 6 karakter!']);
        exit();
    }

    $uid = currentSessionUserId();
    $row = null;
    try {
        $stU = $pdo->prepare("SELECT * FROM `users` WHERE `id` = :id LIMIT 1");
        $stU->execute([':id' => $uid]);
        $row = $stU->fetch();
    } catch (Exception $eU) {}
    if (!$row) {
        jsonResponse(['success' => false, 'message' => 'Akun tidak ditemukan di database!'], 404);
    }

    $check = verifyPassword($oldPass, (string)($row['password_hash'] ?? ''));
    if (!$check['ok']) {
        jsonResponse(['success' => false, 'message' => 'Password lama tidak sesuai!'], 403);
    }

    try {
        $upd = $pdo->prepare("UPDATE `users` SET `password_hash` = :ph WHERE `id` = :id");
        $upd->execute([':ph' => hashPassword($newPass), ':id' => $uid]);
    } catch (Exception $eUpd) {
        jsonResponse(['success' => false, 'message' => 'Gagal memperbarui password: ' . $eUpd->getMessage()], 500);
    }

    // Remove any plaintext password copies from JSON state
    try {
        $stData = loadMainState($pdo);
        if (count($stData) > 0 && isset($stData['users']) && is_array($stData['users'])) {
            foreach ($stData['users'] as &$su) {
                if (($su['id'] ?? '') === $uid) {
                    stripUserSecrets($su);
                    $su['passwordUpdatedAt'] = date('c');
                }
            }
            unset($su);
            saveMainState($pdo, $stData);
        }
    } catch (Exception $eSt) {}

    echo json_encode(['success' => true, 'message' => 'Password berhasil diubah! Gunakan password baru untuk login berikutnya.']);
    exit();
}

// --- action=admin_reset_password (admin only) ------------------------------
if ($action === 'admin_reset_password') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Method not allowed. Use POST.']);
        exit();
    }
    requireAdmin();
    if (!$pdo) {
        http_response_code(503);
        echo json_encode(['success' => false, 'message' => 'Database MySQL cPanel belum terhubung.']);
        exit();
    }
    if (!rateLimit('adminreset', 30, 300)) {
        http_response_code(429);
        echo json_encode(['success' => false, 'message' => 'Terlalu banyak permintaan. Coba lagi beberapa menit lagi.']);
        exit();
    }
    ensureTablesExist($pdo);

    $in = json_decode(file_get_contents('php://input'), true) ?: [];
    $targetId = trim((string)($in['userId'] ?? $in['id'] ?? ''));
    $newPass = (string)($in['newPassword'] ?? '');
    if ($targetId === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'User ID wajib diisi.']);
        exit();
    }
    if (strlen($newPass) < 6) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Password baru minimal harus 6 karakter!']);
        exit();
    }

    $hashed = hashPassword($newPass);
    $updated = false;
    try {
        $upd = $pdo->prepare("UPDATE `users` SET `password_hash` = :ph WHERE `id` = :id");
        $upd->execute([':ph' => $hashed, ':id' => $targetId]);
        $updated = $upd->rowCount() > 0;
    } catch (Exception $eR) {}

    try {
        $stData = loadMainState($pdo);
        if (count($stData) > 0 && isset($stData['users']) && is_array($stData['users'])) {
            foreach ($stData['users'] as &$su) {
                if (($su['id'] ?? '') === $targetId) {
                    stripUserSecrets($su);
                    $su['passwordUpdatedAt'] = date('c');
                    $updated = true;
                }
            }
            unset($su);
            saveMainState($pdo, $stData);
        }
    } catch (Exception $eSt) {}

    if (!$updated) {
        jsonResponse(['success' => false, 'message' => 'User tidak ditemukan!'], 404);
    }
    echo json_encode(['success' => true, 'message' => 'Password member berhasil direset oleh Administrator.']);
    exit();
}

// --- action=request_reset (send password reset code by email) --------------
if ($action === 'request_reset') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Method not allowed. Use POST.']);
        exit();
    }
    if (!$pdo) {
        http_response_code(503);
        echo json_encode(['success' => false, 'message' => 'Database MySQL cPanel belum terhubung.']);
        exit();
    }
    if (!rateLimit('reset_req', 5, 600)) {
        http_response_code(429);
        echo json_encode(['success' => false, 'message' => 'Terlalu banyak permintaan kode reset. Coba lagi 10 menit lagi.']);
        exit();
    }
    ensureTablesExist($pdo);

    $in = json_decode(file_get_contents('php://input'), true) ?: [];
    $identifier = trim((string)($in['identifier'] ?? $in['email'] ?? ''));
    if ($identifier === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Harap masukkan alamat email akun Anda!']);
        exit();
    }

    $row = findUserRowByIdentifier($pdo, $identifier);
    $state = loadMainState($pdo);
    $su = $row ? findStateUserByIdentifier($state, $row['id']) : findStateUserByIdentifier($state, $identifier);
    if (!$row && !$su) {
        jsonResponse(['success' => false, 'message' => 'Akun dengan email / username tersebut tidak ditemukan di sistem AUTOTRADING!'], 404);
    }

    $targetEmail = $row ? (string)($row['email'] ?? '') : (string)($su['email'] ?? '');
    $targetName  = $row ? (string)($row['full_name'] ?? $row['username'] ?? '') : (string)($su['fullName'] ?? $su['username'] ?? '');
    $userId      = $row ? (string)$row['id'] : (string)$su['id'];
    if ($targetEmail === '') {
        jsonResponse(['success' => false, 'message' => 'Akun ini tidak memiliki alamat email aktif. Hubungi Customer Service untuk bantuan.'], 400);
    }

    $resetCode = str_pad((string)random_int(100000, 999999), 6, '0', STR_PAD_LEFT);
    $stateWritten = false;
    if (isset($state['users']) && is_array($state['users'])) {
        foreach ($state['users'] as &$su2) {
            if (($su2['id'] ?? '') === $userId) {
                $su2['passwordResetRequest'] = [
                    'code' => $resetCode,
                    'requestedAt' => date('c'),
                    'expiresAt' => date('c', time() + 900),
                    'status' => 'pending',
                    'emailTarget' => $targetEmail
                ];
                $stateWritten = true;
                break;
            }
        }
        unset($su2);
    }
    if ($stateWritten) saveMainState($pdo, $state);

    if (!$stateWritten) {
        jsonResponse(['success' => false, 'message' => 'Gagal menyimpan permintaan reset. Silakan coba lagi atau hubungi Customer Service.'], 500);
    }

    // Dispatch the code by email - it is NEVER returned in the API response
    $sent = false;
    try {
        loadMailLibrary();
        $subject = "[AUTOTRADING] Kode Reset Password Anda: {$resetCode}";
        $inner = <<<HTML
      <h2 style="font-size: 19px; font-weight: 800; color: #F8FAFC; margin: 0 0 10px 0;">Halo, {$targetName}! &#128274;</h2>
      <p style="font-size: 13.5px; color: #94A3B8; line-height: 1.6; margin: 0 0 20px 0;">
        Kami menerima permintaan reset password untuk akun AUTOTRADING Anda. Gunakan kode verifikasi berikut untuk melanjutkan proses:
      </p>
      <div style="background: rgba(200, 147, 56, 0.1); border: 2px dashed #C89338; border-radius: 14px; padding: 20px; text-align: center; margin: 24px 0;">
        <div style="font-size: 11px; font-weight: 700; color: #C89338; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 6px;">KODE RESET PASSWORD</div>
        <div style="font-size: 34px; font-weight: 900; letter-spacing: 10px; color: #F8FAFC; font-family: 'Courier New', Courier, monospace; margin: 8px 0;">{$resetCode}</div>
        <div style="font-size: 11.5px; color: #94A3B8; margin-top: 6px;">Berlaku selama 15 menit.</div>
      </div>
      <div style="background-color: #1E293B; border-left: 4px solid #E5A83B; border-radius: 6px; padding: 12px 14px; margin-bottom: 20px; font-size: 12px; color: #CBD5E1; line-height: 1.5;">
        <strong>Perhatian:</strong> Jangan bagikan kode ini kepada siapa pun. Jika Anda tidak meminta reset password, abaikan email ini.
      </div>
      <p style="font-size: 12px; color: #64748B; margin: 0;">Jika Anda tidak merasa meminta reset password, silakan abaikan pesan email ini.</p>
HTML;
        $html = getEmailWrapper($subject, $inner);
        $sent = dispatchEmail($targetEmail, $subject, $html, getEmailSettingsFromState($state));
    } catch (Exception $eMail) {
        $sent = false;
    }

    echo json_encode([
        'success' => true,
        'sent' => $sent,
        'email' => maskEmailAddr($targetEmail),
        'username' => $row ? (string)$row['username'] : (string)($su['username'] ?? ''),
        'message' => $sent
            ? "Kode verifikasi telah dikirimkan ke email " . maskEmailAddr($targetEmail) . ". Silakan cek kotak masuk (dan folder Spam)."
            : 'Permintaan kode diproses. Jika akun terdaftar, kode akan dikirimkan ke email Anda.'
    ]);
    exit();
}

// --- action=reset_password (verify code + set new bcrypt password) ---------
if ($action === 'reset_password') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Method not allowed. Use POST.']);
        exit();
    }
    if (!$pdo) {
        http_response_code(503);
        echo json_encode(['success' => false, 'message' => 'Database MySQL cPanel belum terhubung.']);
        exit();
    }
    if (!rateLimit('reset_post', 10, 600)) {
        http_response_code(429);
        echo json_encode(['success' => false, 'message' => 'Terlalu banyak percobaan kode reset. Coba lagi 10 menit lagi.']);
        exit();
    }
    ensureTablesExist($pdo);

    $in = json_decode(file_get_contents('php://input'), true) ?: [];
    $identifier = trim((string)($in['identifier'] ?? ''));
    $code = strtoupper(preg_replace('/[^0-9A-Za-z]/', '', (string)($in['code'] ?? '')));
    $code = preg_replace('/^AT/', '', $code);
    $newPass = (string)($in['newPassword'] ?? '');

    if ($identifier === '' || $code === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Semua kolom (email/username, kode reset, dan password baru) wajib diisi!']);
        exit();
    }
    if (strlen($newPass) < 6) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Password baru minimal harus 6 karakter!']);
        exit();
    }

    $state = loadMainState($pdo);
    $su = findStateUserByIdentifier($state, $identifier);
    if (!$su) {
        jsonResponse(['success' => false, 'message' => 'Akun pengguna tidak ditemukan!'], 404);
    }
    $row = findUserRowByIdentifier($pdo, (string)$su['id']);

    $req = is_array($su) && isset($su['passwordResetRequest']) && is_array($su['passwordResetRequest'])
        ? $su['passwordResetRequest'] : null;
    if (!$req || ($req['status'] ?? '') !== 'pending') {
        jsonResponse(['success' => false, 'message' => 'Tidak ada permintaan reset password yang aktif untuk akun ini. Silakan buat permintaan baru.'], 400);
    }
    if (!empty($req['expiresAt']) && strtotime($req['expiresAt']) < time()) {
        jsonResponse(['success' => false, 'message' => 'Kode reset sudah kedaluwarsa. Silakan minta kode baru.'], 400);
    }
    if (!hash_equals((string)$req['code'], $code)) {
        jsonResponse(['success' => false, 'message' => 'Kode reset yang Anda masukkan salah atau sudah tidak valid!'], 403);
    }

    $targetId = (string)($su['id'] ?? ($row ? $row['id'] : ''));
    if ($row) {
        try {
            $upd = $pdo->prepare("UPDATE `users` SET `password_hash` = :ph WHERE `id` = :id");
            $upd->execute([':ph' => hashPassword($newPass), ':id' => $targetId]);
        } catch (Exception $eUp) {}
    }

    if (isset($state['users']) && is_array($state['users'])) {
        foreach ($state['users'] as &$su3) {
            if (($su3['id'] ?? '') === $targetId) {
                stripUserSecrets($su3);
                $su3['passwordResetRequest']['status'] = 'completed';
                $su3['passwordResetRequest']['completedAt'] = date('c');
                $su3['passwordUpdatedAt'] = date('c');
                break;
            }
        }
        unset($su3);
        saveMainState($pdo, $state);
    }

    echo json_encode(['success' => true, 'message' => 'Password Anda berhasil diperbarui! Silakan masuk menggunakan password baru.']);
    exit();
}

// --- action=verify_otp (registration email verification) -------------------
if ($action === 'verify_otp') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Method not allowed. Use POST.']);
        exit();
    }
    if (!$pdo) {
        http_response_code(503);
        echo json_encode(['success' => false, 'message' => 'Database MySQL cPanel belum terhubung.']);
        exit();
    }
    if (!rateLimit('verify_otp', 10, 600)) {
        http_response_code(429);
        echo json_encode(['success' => false, 'message' => 'Terlalu banyak percobaan kode OTP. Coba lagi 10 menit lagi.']);
        exit();
    }
    ensureTablesExist($pdo);

    $in = json_decode(file_get_contents('php://input'), true) ?: [];
    $identifier = trim((string)($in['identifier'] ?? ''));
    $code = preg_replace('/[^0-9]/', '', (string)($in['code'] ?? ''));
    if ($identifier === '' || $code === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Harap masukkan kode OTP 6-digit verifikasi email!']);
        exit();
    }

    $state = loadMainState($pdo);
    $su = findStateUserByIdentifier($state, $identifier);
    if (!$su) {
        jsonResponse(['success' => false, 'message' => 'Akun member tidak ditemukan.'], 404);
    }

    if (!empty($su['emailVerified']) && empty($su['isPendingVerification'])) {
        $safe = safeUserPayload($su);
        echo json_encode(['success' => true, 'user' => $safe, 'message' => 'Akun ini sudah terverifikasi sebelumnya.']);
        exit();
    }

    $otp = isset($su['verificationOtp']) && is_array($su['verificationOtp']) ? $su['verificationOtp'] : null;
    if (!$otp || empty($otp['code'])) {
        jsonResponse(['success' => false, 'message' => 'Kode OTP tidak ditemukan. Silakan kirim ulang kode baru.'], 400);
    }
    if (!empty($otp['expiresAt']) && strtotime($otp['expiresAt']) < time()) {
        jsonResponse(['success' => false, 'message' => 'Kode OTP telah kedaluwarsa (lebih dari 15 menit). Silakan klik Kirim Ulang Kode.'], 400);
    }
    if ((int)($otp['attempts'] ?? 0) >= 5) {
        jsonResponse(['success' => false, 'message' => 'Terlalu banyak percobaan kode OTP salah. Silakan minta kode baru.'], 429);
    }
    if (!hash_equals((string)$otp['code'], $code)) {
        foreach ($state['users'] as &$suA) {
            if (($suA['id'] ?? '') === ($su['id'] ?? '')) {
                $suA['verificationOtp']['attempts'] = (int)($suA['verificationOtp']['attempts'] ?? 0) + 1;
                break;
            }
        }
        unset($suA);
        saveMainState($pdo, $state);
        jsonResponse(['success' => false, 'message' => 'Kode OTP salah. Silakan periksa kembali email Anda.'], 403);
    }

    $targetId = (string)($su['id'] ?? '');
    foreach ($state['users'] as &$suB) {
        if (($suB['id'] ?? '') === $targetId) {
            $suB['emailVerified'] = true;
            $suB['isPendingVerification'] = false;
            $suB['verificationOtp']['verifiedAt'] = date('c');
            if (($suB['status'] ?? '') === 'pending') $suB['status'] = 'active';
            $su = $suB;
            break;
        }
    }
    unset($suB);
    saveMainState($pdo, $state);

    try {
        $updSt = $pdo->prepare("UPDATE `users` SET `status` = 'active' WHERE `id` = :id");
        $updSt->execute([':id' => $targetId]);
    } catch (Exception $eVs) {}

    $_SESSION['uid'] = $targetId;
    $_SESSION['role'] = (($su['role'] ?? '') === 'admin') ? 'admin' : 'user';
    $_SESSION['username'] = (string)($su['username'] ?? '');

    $safe = safeUserPayload($su);
    echo json_encode(['success' => true, 'user' => $safe, 'message' => 'Selamat! Email akun Anda berhasil diverifikasi dan akun telah aktif.']);
    exit();
}

// --- action=resend_otp (generate + email a fresh registration OTP) ---------
if ($action === 'resend_otp') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Method not allowed. Use POST.']);
        exit();
    }
    if (!$pdo) {
        http_response_code(503);
        echo json_encode(['success' => false, 'message' => 'Database MySQL cPanel belum terhubung.']);
        exit();
    }
    if (!rateLimit('resend_otp', 3, 600)) {
        http_response_code(429);
        echo json_encode(['success' => false, 'message' => 'Terlalu banyak permintaan kode OTP. Coba lagi 10 menit lagi.']);
        exit();
    }
    ensureTablesExist($pdo);

    $in = json_decode(file_get_contents('php://input'), true) ?: [];
    $identifier = trim((string)($in['identifier'] ?? ''));
    if ($identifier === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Identifier akun wajib diisi.']);
        exit();
    }

    $state = loadMainState($pdo);
    $su = findStateUserByIdentifier($state, $identifier);
    $row = $su ? null : findUserRowByIdentifier($pdo, $identifier);
    if (!$su && !$row) {
        jsonResponse(['success' => false, 'message' => 'Akun member tidak ditemukan.'], 404);
    }
    if (!$su && $row) {
        jsonResponse(['success' => false, 'message' => 'Akun ini tidak memerlukan verifikasi OTP.'], 400);
    }

    $otpCode = str_pad((string)random_int(100000, 999999), 6, '0', STR_PAD_LEFT);
    $targetEmail = (string)($su['email'] ?? '');
    if ($targetEmail === '') {
        jsonResponse(['success' => false, 'message' => 'Akun ini tidak memiliki alamat email aktif.'], 400);
    }

    foreach ($state['users'] as &$suO) {
        if (($suO['id'] ?? '') === ($su['id'] ?? '')) {
            $suO['verificationOtp'] = [
                'code' => $otpCode,
                'generatedAt' => date('c'),
                'expiresAt' => date('c', time() + 900),
                'attempts' => 0
            ];
            $suO['emailVerified'] = false;
            $suO['isPendingVerification'] = true;
            if (($suO['status'] ?? '') === 'active') $suO['status'] = 'pending';
            $su = $suO;
            break;
        }
    }
    unset($suO);
    saveMainState($pdo, $state);

    try {
        $updSt = $pdo->prepare("UPDATE `users` SET `status` = 'pending' WHERE `id` = :id");
        $updSt->execute([':id' => (string)$su['id']]);
    } catch (Exception $eRs) {}

    $sent = false;
    try {
        loadMailLibrary();
        $subject = "[AUTOTRADING] Kode Verifikasi Pendaftaran Anda: {$otpCode}";
        $name = (string)($su['fullName'] ?? $su['username'] ?? 'Investor');
        $inner = <<<HTML
      <h2 style="font-size: 19px; font-weight: 800; color: #F8FAFC; margin: 0 0 10px 0;">Halo, {$name}! &#128075;</h2>
      <p style="font-size: 13.5px; color: #94A3B8; line-height: 1.6; margin: 0 0 20px 0;">
        Terima kasih telah mendaftarkan akun di platform <strong>AUTOTRADING</strong>. Untuk mengaktifkan akun dan memastikan keamanan email Anda, silakan gunakan kode verifikasi (OTP) berikut:
      </p>
      <div style="background: rgba(200, 147, 56, 0.1); border: 2px dashed #C89338; border-radius: 14px; padding: 20px; text-align: center; margin: 24px 0;">
        <div style="font-size: 11px; font-weight: 700; color: #C89338; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 6px;">KODE VERIFIKASI RESMI (OTP)</div>
        <div style="font-size: 34px; font-weight: 900; letter-spacing: 10px; color: #F8FAFC; font-family: 'Courier New', Courier, monospace; margin: 8px 0;">{$otpCode}</div>
        <div style="font-size: 11.5px; color: #94A3B8; margin-top: 6px;">Berlaku selama 15 menit.</div>
      </div>
      <div style="background-color: #1E293B; border-left: 4px solid #E5A83B; border-radius: 6px; padding: 12px 14px; margin-bottom: 20px; font-size: 12px; color: #CBD5E1; line-height: 1.5;">
        <strong>Perhatian Keamanan:</strong> Jangan berikan kode OTP ini kepada siapa pun.
      </div>
HTML;
        $html = getEmailWrapper($subject, $inner);
        $sent = dispatchEmail($targetEmail, $subject, $html, getEmailSettingsFromState($state));
    } catch (Exception $eMail2) {
        $sent = false;
    }

    echo json_encode([
        'success' => true,
        'sent' => $sent,
        'email' => maskEmailAddr($targetEmail),
        'message' => $sent
            ? "Kode OTP verifikasi berhasil dikirimkan ke " . maskEmailAddr($targetEmail) . "!"
            : 'Permintaan kode diproses. Pastikan konfigurasi email server aktif.'
    ]);
    exit();
}

// --- action=create_transaction (server-validated deposit / withdrawal) -----
if ($action === 'create_transaction') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Method not allowed. Use POST.']);
        exit();
    }
    requireLogin();
    if (!$pdo) {
        http_response_code(503);
        echo json_encode(['success' => false, 'message' => 'Database MySQL cPanel belum terhubung.']);
        exit();
    }
    if (!rateLimit('create_trx', 30, 300)) {
        http_response_code(429);
        echo json_encode(['success' => false, 'message' => 'Terlalu banyak permintaan transaksi. Coba lagi beberapa menit lagi.']);
        exit();
    }
    ensureTablesExist($pdo);

    $in = json_decode(file_get_contents('php://input'), true) ?: [];
    $trxType = strtolower(trim((string)($in['type'] ?? '')));
    if (!in_array($trxType, ['deposit', 'withdraw'], true)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Jenis transaksi tidak didukung.']);
        exit();
    }

    $uid = currentSessionUserId();
    $uRow = null;
    try {
        $stU = $pdo->prepare("SELECT * FROM `users` WHERE `id` = :id LIMIT 1");
        $stU->execute([':id' => $uid]);
        $uRow = $stU->fetch();
    } catch (Exception $eU2) {}
    if (!$uRow) {
        jsonResponse(['success' => false, 'message' => 'Akun tidak ditemukan di database.'], 404);
    }
    if (!empty($uRow['is_blocked']) || (($uRow['status'] ?? '') === 'blocked')) {
        jsonResponse(['success' => false, 'message' => 'Akun Anda sedang diblokir oleh Administrator. Transaksi ditolak.'], 403);
    }

    $state = loadMainState($pdo);
    $settings = isset($state['settings']) && is_array($state['settings']) ? $state['settings'] : [];
    $minDeposit = (int)($settings['minDeposit'] ?? 10000);
    $minWithdraw = (int)($settings['minWithdraw'] ?? 50000);
    $feePercent = isset($settings['withdrawFeePercent']) ? (float)$settings['withdrawFeePercent'] : 10.0;
    $amount = (int)($in['amount'] ?? 0);

    if ($amount <= 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Jumlah transaksi tidak valid!']);
        exit();
    }

    $stateBalanceUpdates = [];
    $trxId = trim((string)($in['id'] ?? ''));
    if ($trxId === '') {
        $trxId = ($trxType === 'deposit' ? 'TRX-DEP-' : 'TRX-WDR-') . random_int(100000, 999999);
    }

    if ($trxType === 'deposit') {
        if ($amount < $minDeposit) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Minimal deposit adalah ' . number_format($minDeposit, 0, ',', '.')]);
            exit();
        }
        if ($amount > 100000000000) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Jumlah deposit melebihi batas maksimum.']);
            exit();
        }

        $newTrx = [
            'id' => $trxId,
            'userId' => $uid,
            'username' => (string)$uRow['username'],
            'type' => 'deposit',
            'amount' => $amount,
            'status' => 'pending',
            'paymentMethod' => (string)($in['paymentMethod'] ?? 'Transfer Bank'),
            'uniqueCode' => isset($in['uniqueCode']) ? (int)$in['uniqueCode'] : null,
            'txid' => isset($in['txid']) ? (string)$in['txid'] : null,
            'proofImage' => isset($in['proofImage']) ? (string)$in['proofImage'] : null,
            'amountUsdt' => isset($in['amountUsdt']) ? (float)$in['amountUsdt'] : null,
            'createdAt' => date('c')
        ];
    } else {
        if ($amount < $minWithdraw) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Minimal penarikan adalah ' . number_format($minWithdraw, 0, ',', '.')]);
            exit();
        }

        // Withdrawal schedule (WIB) enforced server-side
        $sched = isset($settings['withdrawSchedule']) && is_array($settings['withdrawSchedule'])
            ? $settings['withdrawSchedule'] : ['enabled' => true, 'startHour' => 9, 'endHour' => 21];
        if (($sched['enabled'] ?? true) === false) {
            jsonResponse(['success' => false, 'message' => (string)($sched['offMessage'] ?? 'Layanan penarikan saldo (WD) sedang dinonaktifkan sementara oleh Administrator.')], 400);
        }
        $wibHour = (int)date('G');
        $startHour = (int)($sched['startHour'] ?? 9);
        $endHour = (int)($sched['endHour'] ?? 21);
        if ($wibHour < $startHour || $wibHour >= $endHour) {
            $fmt = function($h) { return str_pad((string)$h, 2, '0', STR_PAD_LEFT) . ':00'; };
            jsonResponse(['success' => false, 'message' => 'Layanan penarikan dana (WD) buka setiap hari pukul ' . $fmt($startHour) . ' - ' . $fmt($endHour) . ' WIB. Saat ini jam operasional tutup.'], 400);
        }

        $walletType = strtolower(trim((string)($in['walletType'] ?? 'main')));
        $isAffiliate = in_array($walletType, ['affiliate', 'wallet_tambah_teman'], true);
        $balanceCol = $isAffiliate ? 'affiliate_balance' : 'wallet_balance';
        $currentBalance = (int)$uRow[$balanceCol];
        if ($currentBalance < $amount) {
            jsonResponse(['success' => false, 'message' => 'Saldo tidak mencukupi! Anda memiliki ' . number_format($currentBalance, 0, ',', '.')], 400);
        }

        $accountNumber = preg_replace('/[^0-9a-zA-Z]/', '', (string)($in['accountNumber'] ?? ''));
        $accountHolder = trim((string)($in['accountHolder'] ?? ''));
        $bankName = trim((string)($in['bankName'] ?? ''));
        if ($accountNumber === '' || $accountHolder === '') {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Harap lengkapi nomor rekening/wallet dan nama pemilik!']);
            exit();
        }

        // Anti multi-account: one destination bank account per member
        try {
            $dupStmt = $pdo->prepare("SELECT `username` FROM `users` WHERE `id` <> :id AND REPLACE(REPLACE(REPLACE(`account_number`, ' ', ''), '-', ''), '.', '') = :acc LIMIT 1");
            $dupStmt->execute([':id' => $uid, ':acc' => $accountNumber]);
            $dupRow = $dupStmt->fetch();
            if ($dupRow) {
                jsonResponse(['success' => false, 'isDuplicateBank' => true, 'message' => 'PENARIKAN DITOLAK (REKENING GANDA): Nomor rekening tujuan sudah terdaftar pada akun lain (' . $dupRow['username'] . ').'], 400);
            }
        } catch (Exception $eDup) {}

        $feeAmount = (int)floor(($amount * $feePercent) / 100);
        $netAmount = $amount - $feeAmount;
        $newBalance = $currentBalance - $amount;

        try {
            $updBal = $pdo->prepare("UPDATE `users` SET `{$balanceCol}` = `{$balanceCol}` - :amt, `updated_at` = CURRENT_TIMESTAMP WHERE `id` = :id");
            $updBal->execute([':amt' => $amount, ':id' => $uid]);
        } catch (Exception $eBal) {
            jsonResponse(['success' => false, 'message' => 'Gagal memproses penarikan: ' . $eBal->getMessage()], 500);
        }
        $stateBalanceUpdates[$balanceCol] = $newBalance;

        $cleanBank = preg_replace('/\s*\([^)]*\)/', '', $bankName) ?: 'Bank';
        $newTrx = [
            'id' => $trxId,
            'userId' => $uid,
            'username' => (string)$uRow['username'],
            'type' => 'withdraw',
            'walletSource' => $isAffiliate ? 'Wallet Tambah Teman' : 'Wallet Balance',
            'paymentMethod' => ($in['method'] ?? '') === 'usdt' ? 'USDT Withdrawal' : $cleanBank . ' (' . $accountNumber . ')',
            'destinationAccount' => $accountHolder . ' - ' . $accountNumber,
            'amount' => $amount,
            'fee' => $feeAmount,
            'netAmount' => $netAmount,
            'status' => 'pending',
            'createdAt' => date('c')
        ];
    }

    // Mirror into relational transactions table
    try {
        $insT = $pdo->prepare("INSERT INTO `transactions` (`id`, `user_id`, `username`, `type`, `amount`, `net_amount`, `status`, `payment_method`, `wallet_source`, `destination_account`, `txid`, `unique_code`, `proof_image`, `created_at`)
            VALUES (:id, :user_id, :username, :type, :amount, :net_amount, :status, :payment_method, :wallet_source, :destination_account, :txid, :unique_code, :proof_image, NOW())
            ON DUPLICATE KEY UPDATE `status` = VALUES(`status`), `amount` = VALUES(`amount`)");
        $insT->execute([
            ':id' => $newTrx['id'],
            ':user_id' => $uid,
            ':username' => $newTrx['username'],
            ':type' => $newTrx['type'],
            ':amount' => $amount,
            ':net_amount' => (int)($newTrx['netAmount'] ?? $amount),
            ':status' => 'pending',
            ':payment_method' => (string)($newTrx['paymentMethod'] ?? ''),
            ':wallet_source' => (string)($newTrx['walletSource'] ?? ''),
            ':destination_account' => (string)($newTrx['destinationAccount'] ?? ''),
            ':txid' => $newTrx['txid'] ?? null,
            ':unique_code' => $newTrx['uniqueCode'] ?? null,
            ':proof_image' => $newTrx['proofImage'] ?? null
        ]);
    } catch (Exception $eIns) {
        error_log('create_transaction mirror failed: ' . $eIns->getMessage());
    }

    // Mirror into JSON state (balances + transaction list)
    if (isset($state['users']) && is_array($state['users'])) {
        foreach ($state['users'] as &$suT) {
            if (($suT['id'] ?? '') === $uid) {
                if ($trxType === 'withdraw') {
                    if (isset($stateBalanceUpdates['wallet_balance'])) $suT['walletBalance'] = $stateBalanceUpdates['wallet_balance'];
                    if (isset($stateBalanceUpdates['affiliate_balance'])) $suT['affiliateBalance'] = $stateBalanceUpdates['affiliate_balance'];
                }
                break;
            }
        }
        unset($suT);
    }
    if (!isset($state['transactions']) || !is_array($state['transactions'])) $state['transactions'] = [];
    array_unshift($state['transactions'], $newTrx);
    saveMainState($pdo, $state);

    $resp = ['success' => true, 'transaction' => $newTrx];
    if ($trxType === 'withdraw') {
        $resp['walletBalance'] = (int)($stateBalanceUpdates['wallet_balance'] ?? $uRow['wallet_balance']);
        $resp['affiliateBalance'] = (int)($stateBalanceUpdates['affiliate_balance'] ?? $uRow['affiliate_balance']);
        $resp['message'] = 'Permintaan penarikan ' . number_format($amount, 0, ',', '.') . ' (Diterima: ' . number_format((int)$newTrx['netAmount'], 0, ',', '.') . ') berhasil dikirim!';
    } else {
        $resp['message'] = 'Permintaan deposit ' . number_format($amount, 0, ',', '.') . ' berhasil dibuat! Menunggu konfirmasi.';
    }
    echo json_encode($resp);
    exit();
}

// Default fallback
http_response_code(404);
echo json_encode(['success' => false, 'message' => 'Action tidak dikenali. Gunakan ?action=get, ?action=save, ?action=ping, ?action=register, ?action=update_user_status, ?action=clear_demo, ?action=backup, ?action=cleanup_duplicates, atau ?action=send_email.']);
