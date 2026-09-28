<?php
/**
 * AUTOTRADING - CPANEL MYSQL BACKEND REST API
 * Handles database read, write, and synchronization with phpMyAdmin / MySQL.
 * Synchronizes both high-performance atomic JSON state and relational tables (users, transactions, investments, settings).
 */

require_once __DIR__ . '/config.php';

$action = isset($_GET['action']) ? trim($_GET['action']) : 'get';
$pdo = getDbConnection();

// Auto-create all required database tables if not existing
function ensureTablesExist($pdo) {
    if (!$pdo) return false;
    try {
        // 1. Unified state table
        $pdo->exec("CREATE TABLE IF NOT EXISTS `fgt_system_state` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `state_key` VARCHAR(64) NOT NULL UNIQUE,
            `data_json` LONGTEXT NOT NULL,
            `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");

        // 2. Relational Users table
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
                    `wallet_balance`, `affiliate_balance`, `points`, `referral_code`, `referred_by`,
                    `is_blocked`, `blocked_reason`, `bank_name`, `account_number`, `account_holder`, `role`, `created_at`
                ) VALUES (
                    :id, :username, :password_hash, :salt, :full_name, :email, :phone, :city,
                    :wallet_balance, :affiliate_balance, :points, :referral_code, :referred_by,
                    :is_blocked, :blocked_reason, :bank_name, :account_number, :account_holder, :role, :created_at
                ) ON DUPLICATE KEY UPDATE
                    `username` = VALUES(`username`),
                    `password_hash` = VALUES(`password_hash`),
                    `full_name` = VALUES(`full_name`),
                    `email` = VALUES(`email`),
                    `phone` = VALUES(`phone`),
                    `city` = VALUES(`city`),
                    `wallet_balance` = VALUES(`wallet_balance`),
                    `affiliate_balance` = VALUES(`affiliate_balance`),
                    `points` = VALUES(`points`),
                    `referral_code` = VALUES(`referral_code`),
                    `referred_by` = VALUES(`referred_by`),
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
                $userStmt->execute([
                    ':id' => $u['id'],
                    ':username' => $u['username'],
                    ':password_hash' => $u['password'] ?? $u['password_hash'] ?? '',
                    ':salt' => $u['salt'] ?? '',
                    ':full_name' => $u['fullName'] ?? $u['full_name'] ?? '',
                    ':email' => $u['email'] ?? '',
                    ':phone' => $u['phone'] ?? '',
                    ':city' => $u['city'] ?? '',
                    ':wallet_balance' => (int)($u['walletBalance'] ?? $u['wallet_balance'] ?? 0),
                    ':affiliate_balance' => (int)($u['affiliateBalance'] ?? $u['affiliate_balance'] ?? 0),
                    ':points' => (int)($u['points'] ?? 0),
                    ':referral_code' => $u['referralCode'] ?? $u['referral_code'] ?? $u['username'],
                    ':referred_by' => $u['referredBy'] ?? $u['referred_by'] ?? null,
                    ':is_blocked' => !empty($u['isBlocked']) ? 1 : 0,
                    ':blocked_reason' => $u['blockedReason'] ?? $u['blocked_reason'] ?? null,
                    ':bank_name' => $bankAccount['bankName'] ?? $u['bank_name'] ?? null,
                    ':account_number' => $bankAccount['accountNumber'] ?? $u['account_number'] ?? null,
                    ':account_holder' => $bankAccount['accountHolder'] ?? $u['account_holder'] ?? null,
                    ':role' => ($u['role'] ?? 'user') === 'admin' ? 'admin' : 'member',
                    ':created_at' => isset($u['registeredAt']) ? date('Y-m-d H:i:s', strtotime($u['registeredAt'])) : date('Y-m-d H:i:s')
                ]);
            }
        }

        // Sync Transactions
        if (isset($parsed['transactions']) && is_array($parsed['transactions'])) {
            $trxStmt = $pdo->prepare("
                INSERT INTO `transactions` (
                    `id`, `user_id`, `username`, `type`, `amount`, `net_amount`, `status`,
                    `payment_method`, `wallet_source`, `destination_account`, `txid`, `unique_code`, `proof_image`, `created_at`
                ) VALUES (
                    :id, :user_id, :username, :type, :amount, :net_amount, :status,
                    :payment_method, :wallet_source, :destination_account, :txid, :unique_code, :proof_image, :created_at
                ) ON DUPLICATE KEY UPDATE
                    `status` = VALUES(`status`),
                    `amount` = VALUES(`amount`),
                    `net_amount` = VALUES(`net_amount`),
                    `proof_image` = VALUES(`proof_image`),
                    `payment_method` = VALUES(`payment_method`)
            ");

            foreach ($parsed['transactions'] as $t) {
                if (empty($t['id']) || empty($t['userId'])) continue;
                $trxStmt->execute([
                    ':id' => $t['id'],
                    ':user_id' => $t['userId'],
                    ':username' => $t['username'] ?? '',
                    ':type' => $t['type'] ?? 'deposit',
                    ':amount' => (int)($t['amount'] ?? 0),
                    ':net_amount' => isset($t['netAmount']) ? (int)$t['netAmount'] : (int)($t['amount'] ?? 0),
                    ':status' => $t['status'] ?? 'pending',
                    ':payment_method' => $t['paymentMethod'] ?? $t['method'] ?? null,
                    ':wallet_source' => $t['walletSource'] ?? null,
                    ':destination_account' => $t['destinationAccount'] ?? null,
                    ':txid' => $t['txid'] ?? null,
                    ':unique_code' => $t['uniqueCode'] ?? null,
                    ':proof_image' => $t['proofImage'] ?? null,
                    ':created_at' => isset($t['createdAt']) ? date('Y-m-d H:i:s', strtotime($t['createdAt'])) : date('Y-m-d H:i:s')
                ]);
            }
        }

        // Sync Investments
        if (isset($parsed['investments']) && is_array($parsed['investments'])) {
            $invStmt = $pdo->prepare("
                INSERT INTO `investments` (
                    `id`, `user_id`, `plan_id`, `plan_name`, `capital`, `min_rate`, `max_rate`,
                    `total_profit_earned`, `pending_profit_claim`, `days_elapsed`, `duration_days`,
                    `status`, `start_date`, `created_at`
                ) VALUES (
                    :id, :user_id, :plan_id, :plan_name, :capital, :min_rate, :max_rate,
                    :total_profit_earned, :pending_profit_claim, :days_elapsed, :duration_days,
                    :status, :start_date, :created_at
                ) ON DUPLICATE KEY UPDATE
                    `total_profit_earned` = VALUES(`total_profit_earned`),
                    `pending_profit_claim` = VALUES(`pending_profit_claim`),
                    `days_elapsed` = VALUES(`days_elapsed`),
                    `status` = VALUES(`status`)
            ");

            foreach ($parsed['investments'] as $inv) {
                if (empty($inv['id']) || empty($inv['userId'])) continue;
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
                    ':status' => $inv['status'] ?? 'active',
                    ':start_date' => isset($inv['startDate']) ? date('Y-m-d H:i:s', strtotime($inv['startDate'])) : date('Y-m-d H:i:s'),
                    ':created_at' => isset($inv['createdAt']) ? date('Y-m-d H:i:s', strtotime($inv['createdAt'])) : date('Y-m-d H:i:s')
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
    } catch (Exception $e) {
        error_log('Error syncing relational tables: ' . $e->getMessage());
    }
}

// 1. Action: Ping / Health Check
if ($action === 'ping') {
    if ($pdo) {
        ensureTablesExist($pdo);
        echo json_encode([
            'success' => true,
            'connected' => true,
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

// 2. Action: Get Data State
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
        $stmt = $pdo->prepare("SELECT `data_json` FROM `fgt_system_state` WHERE `state_key` = 'main_state' LIMIT 1");
        $stmt->execute();
        $row = $stmt->fetch();

        $data = null;
        if ($row && !empty($row['data_json'])) {
            $data = json_decode($row['data_json'], true);
        }

        if (is_array($data)) {
            // Live merge from real relational MySQL tables (phpMyAdmin direct edits reflection)
            try {
                // Merge users table
                $uStmt = $pdo->query("SELECT * FROM `users`");
                $dbUsers = $uStmt->fetchAll();
                if ($dbUsers && count($dbUsers) > 0 && isset($data['users']) && is_array($data['users'])) {
                    $userMap = [];
                    foreach ($data['users'] as $idx => $u) {
                        $userMap[$u['id']] = $idx;
                    }
                    foreach ($dbUsers as $dbU) {
                        $uId = $dbU['id'];
                        if (isset($userMap[$uId])) {
                            $idx = $userMap[$uId];
                            $data['users'][$idx]['walletBalance'] = (int)$dbU['wallet_balance'];
                            $data['users'][$idx]['affiliateBalance'] = (int)$dbU['affiliate_balance'];
                            $data['users'][$idx]['points'] = (int)$dbU['points'];
                            $data['users'][$idx]['isBlocked'] = (bool)$dbU['is_blocked'];
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
                        }
                    }
                }

                // Merge transactions table status changes
                $tStmt = $pdo->query("SELECT `id`, `status`, `amount`, `net_amount` FROM `transactions`");
                $dbTrx = $tStmt->fetchAll();
                if ($dbTrx && count($dbTrx) > 0 && isset($data['transactions']) && is_array($data['transactions'])) {
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
                        }
                    }
                }

                // Merge investments table
                $iStmt = $pdo->query("SELECT `id`, `status`, `total_profit_earned`, `pending_profit_claim`, `days_elapsed` FROM `investments`");
                $dbInv = $iStmt->fetchAll();
                if ($dbInv && count($dbInv) > 0 && isset($data['investments']) && is_array($data['investments'])) {
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
                        }
                    }
                }
            } catch (Exception $eMerge) {
                // If merge encounters any table variance, fallback smoothly to JSON state
            }

            echo json_encode([
                'success' => true,
                'data' => $data
            ]);
        } else {
            echo json_encode([
                'success' => true,
                'data' => null,
                'message' => 'State database masih kosong (menunggu sinkronisasi awal).'
            ]);
        }
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'message' => 'Gagal membaca data dari MySQL: ' . $e->getMessage()
        ]);
    }
    exit();
}

// 3. Action: Save Data State
if ($action === 'save') {
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
        // 1. Atomic state save into fgt_system_state
        $stmt = $pdo->prepare("
            INSERT INTO `fgt_system_state` (`state_key`, `data_json`)
            VALUES ('main_state', :data_json)
            ON DUPLICATE KEY UPDATE `data_json` = :data_json_update, `updated_at` = CURRENT_TIMESTAMP
        ");
        $stmt->execute([
            ':data_json' => $rawInput,
            ':data_json_update' => $rawInput
        ]);

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

// 4. Action: Send Email / Mailer forwarding
if ($action === 'send_email' || in_array($action, ['send_otp', 'admin_notification', 'test', 'welcome'])) {
    require_once __DIR__ . '/mail.php';
    exit();
}

// Default fallback
http_response_code(404);
echo json_encode(['success' => false, 'message' => 'Action tidak dikenali. Gunakan ?action=get, ?action=save, ?action=ping, atau ?action=send_email.']);
