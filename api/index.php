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

    // Clean legacy polluted mask artifacts (e.g. 0812****XXX -> 081274619XXX, 8966****XXX -> 8966234XXX)
    $s = preg_replace('/(?:\b|DANA\s*\(?)4619[xX]{3}\)?/i', 'DANA (081274619XXX)', $s);
    $s = preg_replace('/(\b\d{4})5345678[xX]{3}/i', '$1234XXX', $s);
    $s = preg_replace_callback('/(08\d{2})[\*]+[xX]+/i', function($m) {
        return $m[1] . '74619XXX';
    }, $s);
    $s = preg_replace_callback('/(\b\d{4})[\*]+[xX]+/i', function($m) {
        return $m[1] . '234XXX';
    }, $s);
    $s = preg_replace('/(\*+[xX]+)+/i', '5345678XXX', $s);
    $s = preg_replace('/\s*\((?:XXX|xxx)\)/i', ' (5345678XXX)', $s);

    // Specific bank normalization
    if (stripos($s, 'Bank Central Asia') !== false || stripos($s, 'BCA') !== false) {
        if (preg_match('/BCA\s*\(([0-9a-zA-Z*]+)\)/i', $s, $m)) {
            return 'BCA (' . maskAccountForPrivacy($m[1]) . ')';
        }
        if (stripos($s, 'Deposit') !== false || stripos($s, 'Transfer') !== false || stripos($s, 'Bank') !== false) {
            return 'Transfer Bank BCA';
        }
    }
    if (stripos($s, 'Bank Rakyat Indonesia') !== false || stripos($s, 'BRI') !== false) {
        if (preg_match('/BRI\s*\(([0-9a-zA-Z*]+)\)/i', $s, $m)) {
            return 'BRI (' . maskAccountForPrivacy($m[1]) . ')';
        }
        if (stripos($s, 'Deposit') !== false || stripos($s, 'Transfer') !== false || stripos($s, 'Bank') !== false) {
            return 'Transfer Bank BRI';
        }
    }
    if (stripos($s, 'Bank Negara Indonesia') !== false || stripos($s, 'BNI') !== false) {
        if (preg_match('/BNI\s*\(([0-9a-zA-Z*]+)\)/i', $s, $m)) {
            return 'BNI (' . maskAccountForPrivacy($m[1]) . ')';
        }
        if (stripos($s, 'Deposit') !== false || stripos($s, 'Transfer') !== false || stripos($s, 'Bank') !== false) {
            return 'Transfer Bank BNI';
        }
    }
    if (stripos($s, 'Bank Mandiri') !== false || stripos($s, 'Mandiri') !== false) {
        if (preg_match('/Mandiri\s*\(([0-9a-zA-Z*]+)\)/i', $s, $m)) {
            return 'Mandiri (' . maskAccountForPrivacy($m[1]) . ')';
        }
        if (stripos($s, 'Deposit') !== false || stripos($s, 'Transfer') !== false || stripos($s, 'Bank') !== false) {
            return 'Transfer Bank Mandiri';
        }
    }
    if (stripos($s, 'dana') !== false) {
        if (preg_match('/dana\s*\(([0-9a-zA-Z*]+)\)/i', $s, $m)) {
            return 'DANA (' . maskAccountForPrivacy($m[1]) . ')';
        }
        if (stripos($s, 'Deposit') !== false || stripos($s, 'Transfer') !== false) {
            return 'E-Wallet DANA';
        }
    }

    // Clean duplicate/trailing parentheses e.g. (BCA))) -> BCA, ((BCA)) -> BCA
    $s = preg_replace('/\)+$/', ')', $s);
    $s = preg_replace('/\(+/', '(', $s);
    $s = preg_replace('/\)+/', ')', $s);
    $s = str_replace(['((', '))'], ['(', ')'], $s);

    return trim($s);
}

// Mask trailing digits of DANA phone numbers and bank account numbers with uppercase XXX for privacy (only 3 trailing digits)
function maskAccountForPrivacy($str) {
    if (!$str || !is_string($str)) return $str;
    $s = trim($str);

    // Clean legacy polluted mask artifacts (e.g. 0812****XXX -> 081274619XXX, 8966****XXX -> 8966234XXX)
    $s = preg_replace('/(?:\b|DANA\s*\(?)4619[xX]{3}\)?/i', 'DANA (081274619XXX)', $s);
    $s = preg_replace('/(\b\d{4})5345678[xX]{3}/i', '$1234XXX', $s);
    $s = preg_replace_callback('/(08\d{2})[\*]+[xX]+/i', function($m) {
        return $m[1] . '74619XXX';
    }, $s);
    $s = preg_replace_callback('/(\b\d{4})[\*]+[xX]+/i', function($m) {
        return $m[1] . '234XXX';
    }, $s);
    $s = preg_replace('/(\*+[xX]+)+/i', '5345678XXX', $s);
    $s = preg_replace('/\s*\((?:XXX|xxx)\)/i', ' (5345678XXX)', $s);

    // If string is already properly masked with XXX at the end, preserve it!
    if (preg_match('/^(\d{3,20})[xX]{3}$/i', $s, $mAlready)) {
        return $mAlready[1] . 'XXX';
    }

    // DANA or Indonesian phone number masking (e.g. 081234567890 -> 081234567XXX) - only 3 trailing digits
    if (preg_match('/^(?:08|\+628|628)\d{7,13}$/', $s)) {
        return substr($s, 0, -3) . 'XXX';
    }

    // If string explicitly mentions DANA e.g. "DANA 08123456789" or "DANA (08123456789)"
    if (stripos($s, 'dana') !== false) {
        $s = preg_replace_callback('/\b((?:08|\+628|628)\d{4,12})\b/i', function($m) {
            $num = $m[1];
            if (strlen($num) <= 3) return 'XXX';
            return substr($num, 0, -3) . 'XXX';
        }, $s);
        return $s;
    }

    // General bank account number masking (4+ digits) - only 3 trailing digits
    $s = preg_replace_callback('/\b\d{4,24}\b/', function($m) {
        $num = $m[0];
        if (strlen($num) <= 3) return 'XXX';
        return substr($num, 0, -3) . 'XXX';
    }, $s);

    // Normalize any lowercase xxx to uppercase XXX
    $s = preg_replace('/xxx/i', 'XXX', $s);
    return trim($s);
}

// ---------------------------------------------------------------------------
// Withdrawal destination details (bank / e-wallet / USDT)
// ---------------------------------------------------------------------------
// Baris transaksi lama hanya menyimpan `payment_method` ("BCA (123456)") dan
// `destination_account` ("NAMA - 123456"). Nomor bisa sudah terkena masking
// ("1234XXX") dan nama pemilik terpisah. Helper ini menyatukan sumbernya supaya
// admin selalu melihat bank/e-wallet + nomor + pemilik dalam satu bentuk.
function normalizeAccountNumberStr($str) {
    return preg_replace('/[^0-9a-zA-Z]/', '', (string)$str);
}

function parseWithdrawBankDetails($paymentMethod = '', $destinationAccount = '', $fallback = []) {
    $pm = trim((string)$paymentMethod);
    $dest = trim((string)$destinationAccount);
    $bankName = '';
    $accountNumber = '';
    $accountHolder = '';

    if ($dest !== '') {
        if (strpos($dest, ' - ') !== false) {
            $parts = explode(' - ', $dest);
            $accountHolder = trim((string)array_shift($parts));
            $accountNumber = trim(implode(' - ', $parts));
        } elseif (preg_match('/^(.+?)\s*\(([^()]+)\)\s*$/', $dest, $mDest)) {
            $bankName = trim($mDest[1]);
            $accountNumber = trim($mDest[2]);
        } else {
            $accountNumber = $dest;
        }
    }

    if (preg_match('/^(.+?)\s*\(([^()]*)\)\s*$/', $pm, $mPm)) {
        if ($bankName === '') $bankName = trim($mPm[1]);
        if ($accountNumber === '') $accountNumber = trim($mPm[2]);
    } elseif ($pm !== '' && !preg_match('/^(transfer bank|withdraw|withdrawal|penarikan)\b/i', $pm) && stripos($pm, 'withdrawal') === false) {
        if ($bankName === '') $bankName = $pm;
    }

    if (is_array($fallback)) {
        if ($bankName === '' && !empty($fallback['bankName'])) $bankName = trim((string)$fallback['bankName']);
        if ($accountNumber === '' && !empty($fallback['accountNumber'])) $accountNumber = trim((string)$fallback['accountNumber']);
        if ($accountHolder === '' && !empty($fallback['accountHolder'])) $accountHolder = trim((string)$fallback['accountHolder']);
    }

    // Nama generik ("Bank", "Transfer Bank", ...) bukan identitas tujuan.
    if (in_array(strtolower($bankName), ['bank', 'transfer', 'transfer bank', 'withdraw', 'withdrawal', 'penarikan', 'penarikan dana'], true)) {
        $bankName = '';
    }
    if ($bankName === '' && stripos($pm, 'usdt') !== false) {
        $bankName = 'USDT';
    }

    // Nomor yang sudah ter-mask (mis. 1234XXX) bukan tujuan transfer yang sah.
    // Bila profil member menyimpan nomor lengkap, nomor profil yang dipakai.
    if ($accountNumber !== '' && preg_match('/[xX]{2,}|\*/', $accountNumber)) {
        $fbAcc = is_array($fallback) ? trim((string)($fallback['accountNumber'] ?? '')) : '';
        if ($fbAcc !== '' && !preg_match('/[xX]{2,}|\*/', $fbAcc)) {
            $accountNumber = $fbAcc;
        }
    }

    $accountNumber = trim($accountNumber);
    $accountHolder = trim($accountHolder);
    $bankName = trim($bankName);

    return [
        'bankName' => $bankName,
        'accountNumber' => $accountNumber,
        'accountHolder' => $accountHolder,
        'masked' => (bool)preg_match('/[xX]{2,}|\*/', $accountNumber),
        // Nomor + nama pemilik adalah syarat transfer. Jenis bank/e-wallet yang
        // belum tercatat ditandai terpisah (tidak memblokir transfer).
        'complete' => ($accountHolder !== '' && strlen(normalizeAccountNumberStr($accountNumber)) >= 4)
    ];
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

// ---------------------------------------------------------------------------
// RESET TOMBSTONE
// Setelah admin mereset total sebuah member, tab browser yang masih menyimpan
// snapshot lama bisa mengirim ulang transaksi/paket lamanya lewat action=save
// (merge-nya aditif per id) sehingga data yang baru dihapus muncul kembali.
// Kolom users.reset_at mencatat kapan reset terjadi; entri milik member tsb
// yang dibuat SEBELUM reset dibuang baik saat save maupun saat get.
// ---------------------------------------------------------------------------
function getResetTombstones($pdo) {
    $map = [];
    if (!$pdo) return $map;
    try {
        $rows = $pdo->query("SELECT `id`, `reset_at` FROM `users` WHERE `reset_at` IS NOT NULL")->fetchAll();
        foreach ($rows as $rTomb) {
            $ts = strtotime((string)($rTomb['reset_at'] ?? ''));
            if ($ts !== false) $map[(string)$rTomb['id']] = $ts;
        }
    } catch (Exception $eTomb) {}
    return $map;
}

function stripResetItems(array $items, array $tombstones) {
    if (empty($items) || empty($tombstones)) return $items;
    $kept = [];
    foreach ($items as $item) {
        if (!is_array($item)) {
            $kept[] = $item;
            continue;
        }
        $uid = (string)($item['userId'] ?? $item['user_id'] ?? '');
        $cut = ($uid !== '' && isset($tombstones[$uid])) ? $tombstones[$uid] : null;
        if ($cut === null) {
            $kept[] = $item;
            continue;
        }
        $rawCreated = (string)($item['createdAt'] ?? $item['created_at'] ?? $item['redeemedAt'] ?? $item['date'] ?? '');
        $created = ($rawCreated === '') ? false : strtotime($rawCreated);
        // Data lama sebelum reset -> dibuang. Tanpa tanggal juga dibuang karena
        // transaksi/paket yang sah selalu ada di tabel relasional dan akan
        // disatukan kembali oleh action=get.
        if ($created === false || $created < $cut) continue;
        $kept[] = $item;
    }
    return $kept;
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

        // Skema live lama memakai `status ENUM('pending','approved','rejected','completed')`.
        // Nilai baru seperti `awaiting_payment` DIAM-DIAM di-coerce menjadi ''
        // (sql_mode non-strict) sehingga status tiket hilang dan guard persetujuan
        // terlewati. Tabel baru hasil CREATE TABLE sudah VARCHAR(32); migrasi ini
        // hanya jalan satu kali untuk tabel lama.
        try {
            $colStatus = $pdo->query("SHOW COLUMNS FROM `transactions` LIKE 'status'")->fetch();
            if ($colStatus && stripos((string)($colStatus['Type'] ?? ''), 'enum') === 0) {
                $pdo->exec("ALTER TABLE `transactions` MODIFY `status` VARCHAR(32) DEFAULT 'pending'");
                // Perbaiki baris tiket deposit yang statusnya terkorupsi menjadi ''
                $pdo->exec("UPDATE `transactions` SET `status` = 'awaiting_payment' WHERE `type` = 'deposit' AND `status` = '' AND `proof_image` IS NULL");
                // Perbaiki salinan yang sama di state JSON - kalau tidak,
                // save berikutnya akan menuliskan '' kembali ke MySQL
                try {
                    $rawStateFix = readStateJson($pdo, 'autotrading_system_state');
                    if (!empty($rawStateFix)) {
                        $stFix = json_decode($rawStateFix, true);
                        $stateFixed = false;
                        if (isset($stFix['transactions']) && is_array($stFix['transactions'])) {
                            foreach ($stFix['transactions'] as &$stFixTx) {
                                if (($stFixTx['type'] ?? '') === 'deposit'
                                    && ($stFixTx['status'] ?? null) === ''
                                    && empty($stFixTx['proofImage'])) {
                                    $stFixTx['status'] = 'awaiting_payment';
                                    $stateFixed = true;
                                }
                            }
                            unset($stFixTx);
                        }
                        if ($stateFixed) saveMainState($pdo, $stFix);
                    }
                } catch(Exception $eStFix) {}
            }
        } catch(Exception $eStatEnum) {}

        // Kolom penanda reset total data member (dipakai untuk menolak data lama
        // dari tab browser yang belum sinkron kembali masuk lewat action=save).
        try {
            $colResetAt = $pdo->query("SHOW COLUMNS FROM `users` LIKE 'reset_at'")->fetch();
            if (!$colResetAt) {
                $pdo->exec("ALTER TABLE `users` ADD COLUMN `reset_at` DATETIME DEFAULT NULL");
            }
        } catch(Exception $eResetAt) {}

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
            $colUpdInv = $pdo->query("SHOW COLUMNS FROM `investments` LIKE 'updated_at'")->fetch();
            if (!$colUpdInv) {
                $pdo->exec("ALTER TABLE `investments` ADD COLUMN `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
            }
        } catch(Exception $eLpyd) {}

        // Clean up duplicate check-in transactions if any (such as TX-CHK-392542)
        try {
            $pdo->exec("DELETE FROM `transactions` WHERE `id` = 'TX-CHK-392542'");
        } catch(Exception $eDelDup) {}

        // Clean up duplicate transactions if any
        try {
            $pdo->exec("DELETE FROM `transactions` WHERE `id` = 'TRX-PRF-917036'");
        } catch(Exception $eCln) {}

        // Clean up duplicate/nested parentheses in transactions table
        try {
            $pdo->exec("UPDATE `transactions` SET `payment_method` = 'Transfer Bank BCA' WHERE (`payment_method` LIKE '%Bank Central Asia%' OR `payment_method` LIKE '%(BCA)%') AND `type` = 'deposit'");
            $pdo->exec("UPDATE `transactions` SET `payment_method` = 'Transfer Bank BRI' WHERE (`payment_method` LIKE '%Bank Rakyat Indonesia%' OR `payment_method` LIKE '%(BRI)%') AND `type` = 'deposit'");
            $pdo->exec("UPDATE `transactions` SET `payment_method` = 'Transfer Bank BNI' WHERE (`payment_method` LIKE '%Bank Negara Indonesia%' OR `payment_method` LIKE '%(BNI)%') AND `type` = 'deposit'");
            $pdo->exec("UPDATE `transactions` SET `payment_method` = 'Transfer Bank Mandiri' WHERE (`payment_method` LIKE '%Bank Mandiri%' OR `payment_method` LIKE '%(Mandiri)%') AND `type` = 'deposit'");
            $pdo->exec("UPDATE `transactions` SET `type` = 'member_transfer' WHERE (`id` LIKE 'TRX-TRFI-%' OR `note` LIKE 'Terima transfer saldo%') AND `type` != 'member_transfer'");
            $pdo->exec("UPDATE `transactions` SET `type` = 'member_transfer_out' WHERE (`id` LIKE 'TRX-TRFO-%' OR `note` LIKE 'Transfer saldo ke member%') AND `type` != 'member_transfer_out'");
        } catch(Exception $eCleanTrx) {}

        // 8. Audit log tindakan admin yang tidak bisa dibatalkan (reset data member)
        $pdo->exec("CREATE TABLE IF NOT EXISTS `admin_audit_log` (
            `id` BIGINT(20) NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `admin_id` VARCHAR(64) NOT NULL,
            `admin_username` VARCHAR(64) NOT NULL DEFAULT '',
            `action` VARCHAR(64) NOT NULL,
            `target_user_id` VARCHAR(64) NOT NULL DEFAULT '',
            `target_username` VARCHAR(64) NOT NULL DEFAULT '',
            `reason` VARCHAR(255) NOT NULL DEFAULT '',
            `details` TEXT DEFAULT NULL,
            `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX `idx_audit_action` (`action`, `created_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");

        return true;
    } catch (Exception $e) {
        error_log('Error ensuring tables exist: ' . $e->getMessage());
        return false;
    }
}

/**
 * Recursively merge configuration arrays.
 * Associative arrays are merged recursively.
 * Indexed arrays (lists like banks, rabatLevels, withdrawTerms, levelTurnoverMilestones)
 * are overwritten completely by the override, preventing numerical index merge corruptions.
 */
function mergeSettingsData(array $base, array $override): array {
    foreach ($override as $k => $v) {
        if (is_array($v)) {
            $isAssoc = false;
            foreach (array_keys($v) as $ak) {
                if (!is_int($ak)) {
                    $isAssoc = true;
                    break;
                }
            }
            if ($isAssoc && isset($base[$k]) && is_array($base[$k])) {
                $base[$k] = mergeSettingsData($base[$k], $v);
            } else {
                $base[$k] = $v;
            }
        } else {
            $base[$k] = $v;
        }
    }
    return $base;
}

/**
 * Authoritative, privacy-safe platform leaderboard computed from all active members,
 * investments, and transactions. Masked usernames protect PII while reflecting real rankings.
 */
function getPlatformLeaderboard(array $users, array $investments, array $transactions): array {
    $maskUser = function($u) {
        if (!is_string($u) || trim($u) === '') return 'mem***';
        $clean = trim($u);
        if (strlen($clean) <= 3) return substr($clean, 0, 1) . '***';
        return substr($clean, 0, 3) . '***';
    };

    // 1. Group investments & transactions by user ID
    $invsByUser = [];
    foreach ($investments as $inv) {
        $uid = $inv['userId'] ?? $inv['user_id'] ?? '';
        if ($uid !== '') {
            $invsByUser[$uid][] = $inv;
        }
    }

    $txsByUser = [];
    foreach ($transactions as $tx) {
        $uid = $tx['userId'] ?? $tx['user_id'] ?? '';
        if ($uid !== '') {
            $txsByUser[$uid][] = $tx;
        }
    }

    // 2. Compute Top Profits
    $profitList = [];
    foreach ($users as $u) {
        $uid = $u['id'] ?? '';
        if ($uid === '') continue;
        if (($u['role'] ?? '') === 'admin') continue;
        if (!empty($u['isBlocked']) || !empty($u['is_blocked']) || ($u['status'] ?? '') === 'blocked') continue;

        $userInvs = $invsByUser[$uid] ?? [];
        $userTxs = $txsByUser[$uid] ?? [];

        $txProfit = 0;
        foreach ($userTxs as $t) {
            $tType = $t['type'] ?? '';
            $tId = (string)($t['id'] ?? '');
            $isProfit = ($tType === 'profit_claim' || strpos($tId, 'TRX-PRF-') === 0);
            if ($isProfit && ($t['status'] ?? '') !== 'rejected') {
                $txProfit += (int)($t['amount'] ?? 0);
            }
        }

        $invProfit = 0;
        $activeCap = 0;
        $totalCap = 0;
        $activePlans = [];
        foreach ($userInvs as $inv) {
            $cap = (int)($inv['capital'] ?? 0);
            $totalCap += $cap;
            $invProfit += (int)($inv['totalProfitEarned'] ?? $inv['total_profit_earned'] ?? 0);
            if (($inv['status'] ?? '') === 'active') {
                $activeCap += $cap;
                $pName = trim((string)($inv['planName'] ?? $inv['plan_name'] ?? ''));
                if ($pName !== '') $activePlans[] = $pName;
            }
        }

        $totalProfit = max($txProfit, $invProfit);
        $activePlanName = !empty($activePlans) ? $activePlans[0] : (!empty($userInvs) ? 'Kontrak Selesai' : 'Member Aktif');
        $capToDisplay = $activeCap > 0 ? $activeCap : $totalCap;

        $profitList[] = [
            'id' => $uid,
            'username' => $maskUser($u['username'] ?? ''),
            'maskedUsername' => $maskUser($u['username'] ?? ''),
            'fullName' => $u['fullName'] ?? $u['username'] ?? 'Member',
            'totalProfit' => $totalProfit,
            'totalCapital' => $capToDisplay,
            'activePlan' => $activePlanName,
            'activePlansCount' => count($activePlans),
            'winRate' => $totalProfit > 0 ? 98.8 : 98.4
        ];
    }

    $activeProfits = array_values(array_filter($profitList, function($p) {
        return ($p['totalProfit'] > 0) || ($p['totalCapital'] > 0);
    }));
    if (empty($activeProfits)) {
        $activeProfits = $profitList;
    }
    usort($activeProfits, function($a, $b) {
        if ($b['totalProfit'] !== $a['totalProfit']) {
            return $b['totalProfit'] <=> $a['totalProfit'];
        }
        return $b['totalCapital'] <=> $a['totalCapital'];
    });
    $topProfits = array_values(array_slice($activeProfits, 0, 15));

    // 3. Compute Top Sponsors
    $codeToUser = [];
    $allActiveUsers = [];
    foreach ($users as $u) {
        if (!empty($u['isBlocked']) || !empty($u['is_blocked']) || ($u['status'] ?? '') === 'blocked') continue;
        $uid = $u['id'] ?? '';
        if ($uid === '') continue;
        $allActiveUsers[] = $u;
        $refCode = strtolower(trim((string)($u['referralCode'] ?? $u['referral_code'] ?? $u['username'] ?? '')));
        $uName = strtolower(trim((string)($u['username'] ?? '')));
        if ($refCode !== '') $codeToUser[$refCode] = $uid;
        if ($uName !== '') $codeToUser[$uName] = $uid;
    }

    $l1Downlines = [];
    foreach ($allActiveUsers as $u) {
        $by = strtolower(trim((string)($u['referredBy'] ?? $u['referred_by'] ?? '')));
        if ($by !== '' && isset($codeToUser[$by])) {
            $sponsorId = $codeToUser[$by];
            $l1Downlines[$sponsorId][] = $u;
        }
    }

    $sponsorList = [];
    foreach ($allActiveUsers as $u) {
        $uid = $u['id'] ?? '';
        if ($uid === '') continue;
        if (($u['role'] ?? '') === 'admin') continue;
        $l1 = $l1Downlines[$uid] ?? [];
        $directCount = count($l1);

        $allDownlineIds = [];
        $l1Codes = [];
        foreach ($l1 as $d1) {
            $d1Id = $d1['id'] ?? '';
            if ($d1Id !== '') {
                $allDownlineIds[$d1Id] = true;
                $c = strtolower(trim((string)($d1['referralCode'] ?? $d1['referral_code'] ?? $d1['username'] ?? '')));
                if ($c !== '') $l1Codes[$c] = true;
                $uN = strtolower(trim((string)($d1['username'] ?? '')));
                if ($uN !== '') $l1Codes[$uN] = true;
            }
        }

        $l2Codes = [];
        if (!empty($l1Codes)) {
            foreach ($allActiveUsers as $d2) {
                $by = strtolower(trim((string)($d2['referredBy'] ?? $d2['referred_by'] ?? '')));
                if ($by !== '' && isset($l1Codes[$by])) {
                    $d2Id = $d2['id'] ?? '';
                    if ($d2Id !== '' && !isset($allDownlineIds[$d2Id])) {
                        $allDownlineIds[$d2Id] = true;
                        $c = strtolower(trim((string)($d2['referralCode'] ?? $d2['referral_code'] ?? $d2['username'] ?? '')));
                        if ($c !== '') $l2Codes[$c] = true;
                        $uN = strtolower(trim((string)($d2['username'] ?? '')));
                        if ($uN !== '') $l2Codes[$uN] = true;
                    }
                }
            }
        }

        if (!empty($l2Codes)) {
            foreach ($allActiveUsers as $d3) {
                $by = strtolower(trim((string)($d3['referredBy'] ?? $d3['referred_by'] ?? '')));
                if ($by !== '' && isset($l2Codes[$by])) {
                    $d3Id = $d3['id'] ?? '';
                    if ($d3Id !== '' && !isset($allDownlineIds[$d3Id])) {
                        $allDownlineIds[$d3Id] = true;
                    }
                }
            }
        }

        $totalTeam = count($allDownlineIds);
        $turnover = 0;
        foreach (array_keys($allDownlineIds) as $dlId) {
            $dlInvs = $invsByUser[$dlId] ?? [];
            foreach ($dlInvs as $di) {
                $turnover += (int)($di['capital'] ?? 0);
            }
        }

        $commission = 0;
        $userTxs = $txsByUser[$uid] ?? [];
        foreach ($userTxs as $t) {
            $tType = $t['type'] ?? '';
            $tId = (string)($t['id'] ?? '');
            $isBonus = in_array($tType, ['sponsor_bonus', 'rabat_bonus', 'leader_bonus'], true) ||
                       strpos($tId, 'TRX-SPS-') === 0 || strpos($tId, 'TRX-RBT-') === 0 || strpos($tId, 'TRX-LDR-') === 0;
            if ($isBonus && ($t['status'] ?? '') !== 'rejected') {
                $commission += (int)($t['amount'] ?? 0);
            }
        }

        $badge = 'Member Aktif';
        if ($turnover >= 500000000) $badge = 'Crown Diamond';
        else if ($turnover >= 100000000) $badge = 'Gold Master';
        else if ($turnover >= 25000000) $badge = 'Silver Pro';
        else if ($directCount >= 5) $badge = 'Super Sponsor';
        else if ($directCount >= 1) $badge = 'Rising Star';

        $sponsorList[] = [
            'id' => $uid,
            'username' => $maskUser($u['username'] ?? ''),
            'maskedUsername' => $maskUser($u['username'] ?? ''),
            'fullName' => $u['fullName'] ?? $u['username'] ?? 'Member',
            'directCount' => $directCount,
            'sponsorCount' => $directCount,
            'totalTeam' => $totalTeam,
            'turnover' => $turnover,
            'commission' => $commission,
            'badge' => $badge
        ];
    }

    // Only rank members who have actual affiliate activity (commission > 0, directCount > 0, turnover > 0, or team > 0)
    $activeSponsors = array_values(array_filter($sponsorList, function($s) {
        return ($s['commission'] > 0) || ($s['directCount'] > 0) || ($s['turnover'] > 0) || ($s['totalTeam'] > 0);
    }));
    if (empty($activeSponsors)) {
        $activeSponsors = $sponsorList;
    }
    usort($activeSponsors, function($a, $b) {
        if ($b['commission'] !== $a['commission']) {
            return $b['commission'] <=> $a['commission'];
        }
        if ($b['turnover'] !== $a['turnover']) {
            return $b['turnover'] <=> $a['turnover'];
        }
        return $b['directCount'] <=> $a['directCount'];
    });
    $topSponsors = array_values(array_slice($activeSponsors, 0, 15));

    return [
        'topProfits' => $topProfits,
        'topSponsors' => $topSponsors
    ];
}

// Synchronize relational tables in phpMyAdmin alongside JSON state
function syncRelationalTables($pdo, $parsed, $allowConfigWrite = false) {
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
                    `full_name` = VALUES(`full_name`),
                    `email` = VALUES(`email`),
                    `phone` = VALUES(`phone`),
                    `city` = VALUES(`city`),
                    `wallet_balance` = VALUES(`wallet_balance`),
                    `affiliate_balance` = VALUES(`affiliate_balance`),
                    `points` = VALUES(`points`),
                    `daily_check_in` = CASE WHEN VALUES(`daily_check_in`) IS NOT NULL AND VALUES(`daily_check_in`) != '' THEN VALUES(`daily_check_in`) ELSE `daily_check_in` END,
                    `referral_code` = VALUES(`referral_code`),
                    `referred_by` = VALUES(`referred_by`),
                    `status` = VALUES(`status`),
                    `is_blocked` = VALUES(`is_blocked`),
                    `blocked_reason` = VALUES(`blocked_reason`),
                    `bank_name` = IF(VALUES(`bank_name`) IS NULL OR VALUES(`bank_name`) = '', `bank_name`, VALUES(`bank_name`)),
                    `account_number` = IF(VALUES(`account_number`) IS NULL OR VALUES(`account_number`) = '', `account_number`, VALUES(`account_number`)),
                    `account_holder` = IF(VALUES(`account_holder`) IS NULL OR VALUES(`account_holder`) = '', `account_holder`, VALUES(`account_holder`)),
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
                if (($t['id'] ?? '') === 'TRX-PRF-917036') {
                    continue;
                }
                $tType = !empty($t['type']) ? $t['type'] : 'deposit';
                if (strpos($t['id'], 'TRX-INV-') === 0 || stripos($t['note'] ?? '', 'Aktivasi paket') !== false) {
                    $tType = 'invest_plan';
                } elseif (strpos($t['id'], 'TX-CHK-') === 0 || stripos($t['note'] ?? '', 'Bonus absensi') !== false || stripos($t['paymentMethod'] ?? '', 'Absensi') !== false) {
                    $tType = 'bonus';
                } elseif (strpos($t['id'], 'TRX-PRF-') === 0 || stripos($t['note'] ?? '', 'Klaim profit') !== false) {
                    $tType = 'profit_claim';
                } elseif (strpos($t['id'], 'TRX-DEP-') === 0) {
                    $tType = 'deposit';
                } elseif (strpos($t['id'], 'TRX-WDR-') === 0) {
                    $tType = 'withdraw';
                } elseif (strpos($t['id'], 'TRX-SPS-') === 0) {
                    $tType = 'sponsor_bonus';
                } elseif (strpos($t['id'], 'TRX-RBT-') === 0) {
                    $tType = 'rabat_bonus';
                } elseif (strpos($t['id'], 'TRX-LDR-') === 0 || stripos($t['note'] ?? '', 'Kepemimpinan') !== false) {
                    $tType = 'leader_bonus';
                } elseif (strpos($t['id'], 'TRX-POB-') === 0 || ($t['type'] ?? '') === 'ppob_conversion') {
                    $tType = 'ppob_conversion';
                } elseif (strpos($t['id'], 'TRX-TRFI-') === 0 || ($t['type'] ?? '') === 'member_transfer' || ($t['type'] ?? '') === 'member_transfer_in' || stripos($t['note'] ?? '', 'Terima transfer') !== false) {
                    $tType = 'member_transfer';
                } elseif (strpos($t['id'], 'TRX-TRFO-') === 0 || ($t['type'] ?? '') === 'member_transfer_out' || stripos($t['note'] ?? '', 'Transfer saldo ke member') !== false) {
                    $tType = 'member_transfer_out';
                }


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
                    ':status' => (($t['status'] ?? '') === '') ? 'pending' : $t['status'],
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
                    `total_profit_earned` = GREATEST(`total_profit_earned`, VALUES(`total_profit_earned`)),
                    `pending_profit_claim` = VALUES(`pending_profit_claim`),
                    `days_elapsed` = GREATEST(`days_elapsed`, VALUES(`days_elapsed`)),
                    `capital_returned` = GREATEST(`capital_returned`, VALUES(`capital_returned`)),
                    `last_profit_yield_date` = VALUES(`last_profit_yield_date`),
                    `status` = CASE WHEN `status` = 'completed' AND VALUES(`status`) = 'active' THEN 'completed' ELSE VALUES(`status`) END
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

        // General settings are only written by an explicit admin configuration save.
        // (Any other full-state save carries a stale copy and must not touch them.)
        if ($allowConfigWrite && isset($parsed['settings']) && is_array($parsed['settings']) && count($parsed['settings']) > 0) {
            $curSettings = [];
            try {
                $stCur = $pdo->prepare("SELECT `setting_value` FROM `settings` WHERE `setting_key` = 'general_settings' LIMIT 1");
                $stCur->execute();
                $rCur = $stCur->fetch();
                if ($rCur && !empty($rCur['setting_value'])) {
                    $curSettings = json_decode($rCur['setting_value'], true) ?: [];
                }
            } catch (Exception $eCur) {}
            $setStmt = $pdo->prepare("
                INSERT INTO `settings` (`setting_key`, `setting_value`, `description`)
                VALUES (:setting_key, :setting_value, :description)
                ON DUPLICATE KEY UPDATE `setting_value` = VALUES(`setting_value`), `updated_at` = CURRENT_TIMESTAMP
            ");
            $setStmt->execute([
                ':setting_key' => 'general_settings',
                ':setting_value' => json_encode(mergeSettingsData($curSettings, $parsed['settings']), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
                ':description' => 'Platform global settings, withdraw rules, and commission rates'
            ]);
        }

        // Only an explicit admin configuration write may update platform plans, rewards, signals and banners.
        // Regular member saves (checkin, profit claim, etc.) must NEVER overwrite platform configuration!
        if ($allowConfigWrite) {
            // Sync Plans to settings table
            if (isset($parsed['plans']) && is_array($parsed['plans'])) {
                $setStmt = $pdo->prepare("
                    INSERT INTO `settings` (`setting_key`, `setting_value`, `description`)
                    VALUES ('platform_plans', :setting_value, 'Platform investment plans packages')
                    ON DUPLICATE KEY UPDATE `setting_value` = VALUES(`setting_value`), `updated_at` = CURRENT_TIMESTAMP
                ");
                $setStmt->execute([
                    ':setting_value' => json_encode($parsed['plans'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
                ]);
            }

            // Sync Rewards to settings table
            if (isset($parsed['rewards']) && is_array($parsed['rewards'])) {
                $setStmt = $pdo->prepare("
                    INSERT INTO `settings` (`setting_key`, `setting_value`, `description`)
                    VALUES ('platform_rewards', :setting_value, 'Platform loyalty points rewards catalog')
                    ON DUPLICATE KEY UPDATE `setting_value` = VALUES(`setting_value`), `updated_at` = CURRENT_TIMESTAMP
                ");
                $setStmt->execute([
                    ':setting_value' => json_encode($parsed['rewards'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
                ]);
            }

            // Sync Signals to settings table (Permanent sync across Admin & Frontend)
            if (isset($parsed['signals']) && is_array($parsed['signals'])) {
                $setStmt = $pdo->prepare("
                    INSERT INTO `settings` (`setting_key`, `setting_value`, `description`)
                    VALUES ('platform_signals', :setting_value, 'Platform live trading signals feed')
                    ON DUPLICATE KEY UPDATE `setting_value` = VALUES(`setting_value`), `updated_at` = CURRENT_TIMESTAMP
                ");
                $setStmt->execute([
                    ':setting_value' => json_encode($parsed['signals'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
                ]);
            }

            // Sync Settings to general_settings table (Permanent sync for branding, colors, webSettings)
            if (isset($parsed['settings']) && is_array($parsed['settings']) && count($parsed['settings']) > 0) {
                $curSettings = [];
                try {
                    $stCur = $pdo->prepare("SELECT `setting_value` FROM `settings` WHERE `setting_key` = 'general_settings' LIMIT 1");
                    $stCur->execute();
                    $rCur = $stCur->fetch();
                    if ($rCur && !empty($rCur['setting_value'])) {
                        $curSettings = json_decode($rCur['setting_value'], true) ?: [];
                    }
                } catch (Exception $eCur) {}
                $mSettings = mergeSettingsData($curSettings, $parsed['settings']);
                $setStmt = $pdo->prepare("
                    INSERT INTO `settings` (`setting_key`, `setting_value`, `description`)
                    VALUES ('general_settings', :setting_value, 'Platform global settings and web configuration')
                    ON DUPLICATE KEY UPDATE `setting_value` = VALUES(`setting_value`), `updated_at` = CURRENT_TIMESTAMP
                ");
                $setStmt->execute([
                    ':setting_value' => json_encode($mSettings, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
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

// ---------------------------------------------------------------------------
// DATA INTEGRITY HELPERS — single source of truth for check-in, investasi,
// dan rabat. Dipakai oleh endpoint klaim dan oleh admin_sync_integrity.
// ---------------------------------------------------------------------------
function getGeneralSettings($pdo) {
    static $cached = null;
    if ($cached !== null) return $cached;
    $cached = [];
    try {
        $stmt = $pdo->prepare("SELECT `setting_value` FROM `settings` WHERE `setting_key` = 'general_settings' LIMIT 1");
        $stmt->execute();
        $row = $stmt->fetch();
        if ($row && !empty($row['setting_value'])) {
            $decoded = json_decode($row['setting_value'], true);
            if (is_array($decoded)) $cached = $decoded;
        }
    } catch (Exception $e) {}
    return $cached;
}

/**
 * Persentase rabat per level, PERSIS seperti yang disimpan admin
 * di Pengaturan -> Sponsor & Rabat. Dulu bagikan rabat memakai angka
 * hard-code 5/3/1.5/0.5/0.2 sehingga transaksi 5% walau admin set 3%.
 */
function getRabatLevelPercentages($pdo) {
    $defaults = [1 => 5.0, 2 => 3.0, 3 => 1.5, 4 => 0.5, 5 => 0.2];
    $cfg = getGeneralSettings($pdo);
    if (empty($cfg['rabatLevels']) || !is_array($cfg['rabatLevels'])) return $defaults;
    $levels = [];
    foreach ($cfg['rabatLevels'] as $row) {
        if (!is_array($row)) continue;
        $lvl = (int)($row['level'] ?? 0);
        if ($lvl > 0) $levels[$lvl] = (float)($row['percent'] ?? 0);
    }
    if (empty($levels)) return $defaults;
    for ($i = 1; $i <= 5; $i++) {
        if (!isset($levels[$i])) $levels[$i] = 0.0;
    }
    return $levels;
}

/**
 * Bangun riwayat absensi dari ledger transaksi (1 baris per hari klaim).
 * Nomor hari dihitung dari urutan tanggal sehingga hilangnya satu entri
 * di history (mis. karena save dari browser lama) tidak merusak hitungan.
 */
function buildCheckInRecordFromLedger(array $txRows, $totalDays = 7) {
    $totalDays = max(1, (int)$totalDays);
    $byDate = [];
    foreach ($txRows as $row) {
        $createdAt = (string)($row['created_at'] ?? '');
        $dateStr = substr($createdAt, 0, 10);
        if ($dateStr === '') continue;
        $amount = (int)($row['amount'] ?? 0);
        if (!isset($byDate[$dateStr])) {
            $byDate[$dateStr] = [
                'date' => $dateStr,
                'amount' => $amount,
                'claimedAt' => $createdAt
            ];
        } else {
            $byDate[$dateStr]['amount'] = max($byDate[$dateStr]['amount'], $amount);
        }
    }
    ksort($byDate);
    $history = [];
    $prevTs = null;
    $streak = 0;
    foreach ($byDate as $entry) {
        $ts = strtotime($entry['date'] . ' 00:00:00');
        $day = 1;
        if ($prevTs !== null) {
            $diff = abs($ts - $prevTs);
            // Toleransi: selisih hari (86400 detik) +/- 2 jam (7200 detik)
            // Mengakomodasi perbedaan timezone, DST, atau timestamp tidak pas exactly 24:00:00
            $isSameDay = ($diff <= 86400 + 7200) && ($diff >= 86400 - 7200);
            if ($isSameDay) {
                $day = $streak + 1;
                if ($day > $totalDays) $day = 1;
            }
        }
        $history[] = [
            'date' => $entry['date'],
            'day' => $day,
            'amount' => $entry['amount'],
            'claimedAt' => $entry['claimedAt']
        ];
        $streak = $day;
        $prevTs = $ts;
    }
    $lastDate = !empty($history) ? $history[count($history) - 1]['date'] : null;
    return [
        'currentStreak' => $streak,
        'lastCheckInDate' => $lastDate,
        'history' => $history
    ];
}

/** Gabungkan dua record absensi dengan urutan tanggal; tanggal ganda dibuang. */
function mergeCheckInRecords($existing, $incoming, $totalDays = 7) {
    $totalDays = max(1, (int)$totalDays);
    $rows = [];
    foreach ([$existing, $incoming] as $rec) {
        if (!is_array($rec) || empty($rec['history']) || !is_array($rec['history'])) continue;
        foreach ($rec['history'] as $h) {
            $rawDate = (string)($h['date'] ?? $h['claimedAt'] ?? '');
            $dateStr = substr($rawDate, 0, 10);
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateStr)) continue;
            if (!isset($rows[$dateStr])) {
                $rows[$dateStr] = [
                    'date' => $dateStr,
                    'amount' => (int)($h['amount'] ?? 0),
                    'claimedAt' => (string)($h['claimedAt'] ?? ($dateStr . ' 00:00:00'))
                ];
            }
        }
    }
    if (empty($rows)) {
        return ['currentStreak' => 0, 'lastCheckInDate' => null, 'history' => []];
    }
    ksort($rows);
    $history = [];
    $prevTs = null;
    $streak = 0;
    foreach ($rows as $entry) {
        $ts = strtotime($entry['date'] . ' 00:00:00');
        $day = 1;
        if ($prevTs !== null) {
            $diff = abs($ts - $prevTs);
            // Toleransi: selisih hari (86400 detik) +/- 2 jam (7200 detik)
            $isSameDay = ($diff <= 86400 + 7200) && ($diff >= 86400 - 7200);
            if ($isSameDay) {
                $day = $streak + 1;
                if ($day > $totalDays) $day = 1;
            }
        }
        $history[] = [
            'date' => $entry['date'],
            'day' => $day,
            'amount' => $entry['amount'],
            'claimedAt' => $entry['claimedAt']
        ];
        $streak = $day;
        $prevTs = $ts;
    }
    return [
        'currentStreak' => $streak,
        'lastCheckInDate' => $history[count($history) - 1]['date'],
        'history' => $history
    ];
}

/**
 * Rate profit harian (persen) untuk satu paket investasi pada satu tanggal WIB.
 *
 * Ini SATU-SATUNYA rumus rate profit harian di server. Rumus yang sama
 * diimplementasikan di js/plans.js (getDeterministicDailyRate) memakai hash
 * 32-bit `hash = hash * 31 + charCode` yang di-mask ke 32-bit signed. Tujuannya:
 * nominal yang dikreditkan, riwayat harian yang ditampilkan, dan angka persen
 * di kartu mingguan selalu berasal dari rate yang sama persis.
 */
function deterministicProfitRate($invId, $minRate, $maxRate, $ymd) {
    $min = (float)$minRate;
    $max = (float)$maxRate;
    if ($max < $min) $max = $min;
    if ($max == $min) return round($min, 2);

    $str = (string)$invId . '_' . (string)$ymd;
    $hash = 0;
    $len = strlen($str);
    for ($i = 0; $i < $len; $i++) {
        // Emulasi 32-bit signed overflow JavaScript: (hash << 5) - hash + code
        $hash = ((($hash * 31) & 0xFFFFFFFF) + ord($str[$i])) & 0xFFFFFFFF;
        if ($hash > 0x7FFFFFFF) $hash -= 0x100000000;
    }
    $normalized = (abs($hash) % 10000) / 10000;
    return round($min + ($normalized * ($max - $min)), 2);
}

/** Nominal profit dari modal & rate (basis point, tanpa pembulatan ganda). */
function profitAmountFromRate($capital, $rate) {
    $bp = (int)round(((float)$rate) * 100);
    return (int)floor(((int)$capital) * $bp / 10000);
}

/** Rate (%) yang benar-benar dibayar, dihitung dari nominal / modal. */
function impliedProfitRate($amount, $capital) {
    $cap = (int)$capital;
    if ($cap <= 0) return 0.0;
    return round((((float)$amount / (float)$cap) * 100), 2);
}

/** Normalisasi tanggal history (dd/mm/yyyy, ISO, atau teks lain) ke Y-m-d. */
function normalizeHistoryDate($raw) {
    $raw = trim((string)$raw);
    if ($raw === '') return null;
    if (preg_match('#^(\d{1,2})/(\d{1,2})/(\d{4})$#', $raw, $m)) {
        return sprintf('%04d-%02d-%02d', (int)$m[3], (int)$m[2], (int)$m[1]);
    }
    if (preg_match('/^(\d{4})-(\d{2})-(\d{2})/', $raw, $m)) {
        return $m[1] . '-' . $m[2] . '-' . $m[3];
    }
    $ts = strtotime($raw);
    return $ts ? date('Y-m-d', $ts) : null;
}

/**
 * Rekonsiliasi menyeluruh & idempoten:
 *  1. Absensi  -> dibangun ulang dari ledger transaksi absensi.
 *  2. Investasi-> days_elapsed & total_profit_earned diselaraskan dengan
 *                 jumlah klaim profit yang benar-benar tercatat.
 *  3. Rabat    -> persentase & nominal transaksi diselaraskan dengan setting
 *                 admin (termasuk koreksi saldo upline atas kelebihan lama).
 *  4. State JSON (users/investments/transactions) disamakan dengan MySQL.
 */
function reconcilePlatformIntegrity($pdo) {
    $summary = ['checkins' => 0, 'investments' => 0, 'rabat' => 0, 'stateSynced' => false, 'details' => []];
    $cfg = getGeneralSettings($pdo);
    $totalDays = (int)($cfg['dailyCheckIn']['totalDays'] ?? 7);
    if ($totalDays < 1) $totalDays = 7;

    $stateData = [];
    try {
        $st = $pdo->query("SELECT `data_json` FROM `autotrading_system_state` WHERE `state_key` = 'main_state' LIMIT 1");
        $rowS = $st ? $st->fetch() : null;
        if ($rowS && !empty($rowS['data_json'])) $stateData = json_decode($rowS['data_json'], true) ?: [];
    } catch (Exception $e) {}
    if (!is_array($stateData)) $stateData = [];

    $userRows = $pdo->query("SELECT `id`, `username`, `daily_check_in`, `affiliate_balance` FROM `users`")->fetchAll();
    $userMap = [];
    foreach ($userRows as $u) $userMap[$u['id']] = $u;

    // 1. CHECK-IN ------------------------------------------------------------
    $chkByUser = [];
    try {
        $chkRows = $pdo->query("SELECT `user_id`, `amount`, `created_at` FROM `transactions` WHERE (`id` LIKE 'TX-CHK-%' OR `payment_method` LIKE '%Absensi%' OR `note` LIKE '%absen%') ORDER BY `created_at` ASC")->fetchAll();
        foreach ($chkRows as $r) $chkByUser[$r['user_id']][] = $r;
    } catch (Exception $eChk) {}
    $updChk = $pdo->prepare("UPDATE `users` SET `daily_check_in` = :dci, `updated_at` = CURRENT_TIMESTAMP WHERE `id` = :uid");
    foreach ($chkByUser as $uid => $rows) {
        if (!isset($userMap[$uid])) continue;
        $rec = buildCheckInRecordFromLedger($rows, $totalDays);
        $newJson = json_encode($rec, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        $oldJson = (string)($userMap[$uid]['daily_check_in'] ?? '');
        $oldRec = $oldJson !== '' ? json_decode($oldJson, true) : null;
        $same = is_array($oldRec)
            && (int)($oldRec['currentStreak'] ?? 0) === (int)$rec['currentStreak']
            && (string)($oldRec['lastCheckInDate'] ?? '') === (string)$rec['lastCheckInDate']
            && count($oldRec['history'] ?? []) === count($rec['history']);
        if (!$same) {
            try {
                $updChk->execute([':dci' => $newJson, ':uid' => $uid]);
                $summary['checkins']++;
                $summary['details'][] = 'Absensi ' . ($userMap[$uid]['username'] ?? $uid) . ': H-' . $rec['currentStreak'] . '/Hari ke-' . count($rec['history']);
            } catch (Exception $eUpdChk) {
                $summary['details'][] = 'GAGAL absensi ' . ($userMap[$uid]['username'] ?? $uid) . ': ' . $eUpdChk->getMessage();
            }
        }
        $userMap[$uid]['daily_check_in'] = $newJson;
    }

    // 2. INVESTASI -----------------------------------------------------------
    $invRows = $pdo->query("SELECT * FROM `investments`")->fetchAll();
    $profitByUser = [];
    try {
        $profitRows = $pdo->query("SELECT `user_id`, `amount`, `created_at` FROM `transactions` WHERE (`type` = 'profit_claim' OR `id` LIKE 'TRX-PRF-%') AND `status` = 'approved' ORDER BY `created_at` ASC")->fetchAll();
        foreach ($profitRows as $r) $profitByUser[$r['user_id']][] = $r;
    } catch (Exception $ePrf) {}
    $invCountByUser = [];
    foreach ($invRows as $inv) $invCountByUser[$inv['user_id']] = ($invCountByUser[$inv['user_id']] ?? 0) + 1;
    $stateInvMap = [];
    foreach (($stateData['investments'] ?? []) as $si) {
        if (!empty($si['id'])) $stateInvMap[$si['id']] = $si;
    }
    $updInv = $pdo->prepare("UPDATE `investments` SET `days_elapsed` = :d, `total_profit_earned` = :t, `status` = :s, `pending_profit_claim` = :p WHERE `id` = :id");
    $invUpdates = [];
    foreach ($invRows as $inv) {
        $uid = $inv['user_id'];
        $claimedDays = 0;
        $claimedAmount = 0;
        $claimTxList = [];
        if (($invCountByUser[$uid] ?? 0) <= 1) {
            $startTs = strtotime($inv['start_date'] ?: ($inv['created_at'] ?: '1970-01-01'));
            foreach (($profitByUser[$uid] ?? []) as $t) {
                if (strtotime($t['created_at']) >= $startTs) {
                    $claimTxList[] = $t;
                    $claimedDays++;
                    $claimedAmount += (int)$t['amount'];
                }
            }
        } else {
            $si = $stateInvMap[$inv['id']] ?? null;
            if ($si && !empty($si['history']) && is_array($si['history'])) {
                foreach ($si['history'] as $h) {
                    if (($h['status'] ?? '') === 'claimed') {
                        $claimedDays++;
                        $claimedAmount += (int)($h['amount'] ?? 0);
                    }
                }
            }
        }
        $si = $stateInvMap[$inv['id']] ?? null;

        // Bangun ulang history: 1 baris = 1 klaim (ledger transaksi), lalu
        // pertahankan hanya yield berjalan yang BELUM diklaim. Ini menghapus
        // baris 'pending_claim' palsu yang dulu membuat profit dibayar dua kali.
        $newHistory = null;
        $newPending = null;
        if ($si && !empty($claimTxList)) {
            $durationH = (int)($inv['duration_days'] ?: 30);
            $newHistory = [];
            $n = 0;
            foreach ($claimTxList as $t) {
                $n++;
                $newHistory[] = [
                    'day' => min($n, $durationH),
                    'date' => date('Y-m-d', strtotime($t['created_at'])),
                    // `rate` WAJIB ikut disimpan. Dulu baris hasil rekonsiliasi tidak
                    // punya rate, sehingga kartu mingguan tidak menemukan rate nyata
                    // dan menampilkan rate global (mis. Jumat 1,15% padahal dibayar
                    // 1,73%) — sumber keluhan "profit tidak cocok dengan persen".
                    'rate' => impliedProfitRate((int)$t['amount'], (int)($inv['capital'] ?? 0)),
                    'amount' => (int)$t['amount'],
                    'status' => 'claimed',
                    'claimedAt' => $t['created_at']
                ];
            }
            $lastClaimTs = strtotime($claimTxList[count($claimTxList) - 1]['created_at']);
            $keepRow = null;
            $keepTs = 0;
            if (!empty($si['history']) && is_array($si['history'])) {
                foreach ($si['history'] as $h) {
                    $st = (string)($h['status'] ?? '');
                    if ($st !== 'pending_claim' && $st !== 'in_progress') continue;
                    $iso = normalizeHistoryDate($h['date'] ?? ($h['claimedAt'] ?? ''));
                    if (!$iso) continue;
                    $ts = strtotime($iso);
                    if ($ts <= $lastClaimTs) continue;
                    if ($keepRow === null || $ts > $keepTs) {
                        $keepRow = [
                            'day' => min(count($newHistory) + 1, $durationH),
                            'date' => $iso,
                            'rate' => (isset($h['rate']) && is_numeric($h['rate']))
                                ? (float)$h['rate']
                                : impliedProfitRate((int)($h['amount'] ?? 0), (int)($inv['capital'] ?? 0)),
                            'amount' => (int)($h['amount'] ?? 0),
                            'status' => $st,
                            'claimedAt' => $h['claimedAt'] ?? null
                        ];
                        $keepTs = $ts;
                    }
                }
            }
            if ($keepRow) $newHistory[] = $keepRow;
            $newPending = 0;
            foreach ($newHistory as $h) {
                if (($h['status'] ?? '') === 'pending_claim') $newPending += (int)($h['amount'] ?? 0);
            }
        }

        if ($claimedDays <= 0 && $newHistory === null) continue;
        $duration = (int)($inv['duration_days'] ?: 30);
        $newDays = min($duration, max((int)$inv['days_elapsed'], $claimedDays));
        $newEarned = max((int)$inv['total_profit_earned'], $claimedAmount);
        $newStatus = ($newDays >= $duration) ? 'completed' : $inv['status'];
        $pending = ($newStatus === 'completed') ? 0 : (($newPending !== null) ? $newPending : (int)$inv['pending_profit_claim']);
        $historyChanged = false;
        if ($newHistory !== null && $si) {
            $historyChanged = json_encode($si['history'] ?? []) !== json_encode($newHistory);
        }
        if (!$historyChanged && $newDays === (int)$inv['days_elapsed'] && $newEarned === (int)$inv['total_profit_earned'] && $newStatus === $inv['status'] && $pending === (int)$inv['pending_profit_claim']) {
            $invUpdates[$inv['id']] = ['days' => $newDays, 'earned' => $newEarned, 'status' => $newStatus, 'pending' => $pending, 'history' => $newHistory];
            continue;
        }
        try {
            $updInv->execute([':d' => $newDays, ':t' => $newEarned, ':s' => $newStatus, ':p' => $pending, ':id' => $inv['id']]);
            $summary['investments']++;
            $summary['details'][] = 'Paket ' . $inv['id'] . ': ' . $newDays . '/' . $duration . ' hari, profit IDR ' . number_format($newEarned, 0, ',', '.') . ', pending IDR ' . number_format($pending, 0, ',', '.');
        } catch (Exception $eUpdInv) {}
        $invUpdates[$inv['id']] = ['days' => $newDays, 'earned' => $newEarned, 'status' => $newStatus, 'pending' => $pending, 'history' => $newHistory];
    }

    // 3. RABAT ---------------------------------------------------------------
    $levels = getRabatLevelPercentages($pdo);
    $rabatTxUpdates = [];
    $affDelta = [];
    try {
        $rabatRows = $pdo->query("SELECT * FROM `transactions` WHERE (`type` = 'rabat_bonus' OR `id` LIKE 'TRX-RBT-%')")->fetchAll();
        $updTx = $pdo->prepare("UPDATE `transactions` SET `amount` = :a, `net_amount` = :n, `note` = :note WHERE `id` = :id");
        $updAff = $pdo->prepare("UPDATE `users` SET `affiliate_balance` = GREATEST(0, `affiliate_balance` + :delta), `updated_at` = CURRENT_TIMESTAMP WHERE `id` = :id");
        foreach ($rabatRows as $r) {
            $note = (string)($r['note'] ?? '');
            if (!preg_match('/Level\s*(\d+)/i', $note, $mLvl)) continue;
            $lvl = (int)$mLvl[1];
            if (!isset($levels[$lvl])) continue;
            $pct = round((float)$levels[$lvl], 2);
            if (!preg_match('/\(([0-9]+(?:\.[0-9]+)?)%\)/', $note, $mPct)) continue;
            $curPct = (float)$mPct[1];
            if (!preg_match('/\(IDR\s*([0-9\.]+)\)/i', $note, $mBase)) continue;
            $base = (int)str_replace('.', '', $mBase[1]);
            if ($base <= 0) continue;
            $expected = (int)floor(($base * $pct) / 100);
            if ($expected === (int)$r['amount'] && abs($curPct - $pct) < 0.005) continue;
            $pctLabel = rtrim(rtrim(number_format($pct, 2, '.', ''), '0'), '.');
            $newNote = preg_replace('/\([0-9]+(?:\.[0-9]+)?%\)/', '(' . $pctLabel . '%)', $note, 1);
            $delta = $expected - (int)$r['amount'];
            try {
                $updTx->execute([':a' => $expected, ':n' => $expected, ':note' => $newNote, ':id' => $r['id']]);
                if ($delta !== 0 && !empty($r['user_id'])) {
                    $updAff->execute([':delta' => $delta, ':id' => $r['user_id']]);
                }
                $summary['rabat']++;
                $summary['details'][] = 'Rabat ' . $r['id'] . ' L' . $lvl . ': ' . $curPct . '% -> ' . $pctLabel . '% (IDR ' . number_format($expected, 0, ',', '.') . ')';
            } catch (Exception $eUpdRb) {}
            $rabatTxUpdates[$r['id']] = ['amount' => $expected, 'note' => $newNote];
            if ($delta !== 0) $affDelta[$r['user_id']] = ($affDelta[$r['user_id']] ?? 0) + $delta;
        }
    } catch (Exception $eRb) {}

    // 4. STATE JSON ----------------------------------------------------------
    try {
        $freshUsers = $pdo->query("SELECT `id`, `username`, `wallet_balance`, `affiliate_balance`, `points`, `daily_check_in` FROM `users`")->fetchAll();
        $freshMap = [];
        foreach ($freshUsers as $fu) $freshMap[$fu['id']] = $fu;
        if (isset($stateData['users']) && is_array($stateData['users'])) {
            foreach ($stateData['users'] as &$su) {
                if (!is_array($su) || empty($su['id']) || !isset($freshMap[$su['id']])) continue;
                $fu = $freshMap[$su['id']];
                $su['affiliateBalance'] = (int)$fu['affiliate_balance'];
                if (!empty($fu['daily_check_in'])) {
                    $chk = json_decode($fu['daily_check_in'], true);
                    if (is_array($chk)) $su['dailyCheckIn'] = $chk;
                }
            }
            unset($su);
        }
        if (isset($stateData['investments']) && is_array($stateData['investments'])) {
            foreach ($stateData['investments'] as &$si) {
                if (!is_array($si) || empty($si['id']) || !isset($invUpdates[$si['id']])) continue;
                $iv = $invUpdates[$si['id']];
                $si['daysElapsed'] = (int)$iv['days'];
                $si['totalProfitEarned'] = (int)$iv['earned'];
                $si['status'] = $iv['status'];
                $si['pendingProfitClaim'] = (int)($iv['pending'] ?? 0);
                if (is_array($iv['history'] ?? null)) {
                    $si['history'] = $iv['history'];
                }
                if ($iv['status'] === 'completed') {
                    $si['refundReady'] = true;
                    $si['pendingProfitClaim'] = 0;
                }
            }
            unset($si);
        }
        if (!empty($rabatTxUpdates) && isset($stateData['transactions']) && is_array($stateData['transactions'])) {
            foreach ($stateData['transactions'] as &$stx) {
                if (!is_array($stx) || empty($stx['id']) || !isset($rabatTxUpdates[$stx['id']])) continue;
                $stx['amount'] = (int)$rabatTxUpdates[$stx['id']]['amount'];
                $stx['netAmount'] = (int)$rabatTxUpdates[$stx['id']]['amount'];
                $stx['note'] = $rabatTxUpdates[$stx['id']]['note'];
            }
            unset($stx);
        }
        $summary['stateSynced'] = true;
    } catch (Throwable $eState) {
        $summary['stateError'] = $eState->getMessage();
    }

    $logEntry = [
        'id' => 'LOG-SYNC-' . date('YmdHis'),
        'type' => 'system_sync',
        'title' => 'Sinkronisasi data member (absensi, profit, rabat)',
        'message' => 'Absensi diperbaiki: ' . $summary['checkins'] . ', investasi: ' . $summary['investments'] . ', rabat: ' . $summary['rabat'] . '.',
        'actor' => 'admin',
        'createdAt' => date('c')
    ];
    if (!isset($stateData['system_logs']) || !is_array($stateData['system_logs'])) $stateData['system_logs'] = [];
    array_unshift($stateData['system_logs'], $logEntry);
    if (count($stateData['system_logs']) > 100) $stateData['system_logs'] = array_slice($stateData['system_logs'], 0, 100);
    try {
        saveMainState($pdo, $stateData);
    } catch (Exception $eSave) {}

    return $summary;
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

// 1.5 Action: Get Client IP & Device Detection (Requirement 7)
if ($action === 'get_ip') {
    $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
    if (!empty($_SERVER['HTTP_CF_CONNECTING_IP'])) {
        $ip = trim($_SERVER['HTTP_CF_CONNECTING_IP']);
    } elseif (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        $parts = explode(',', $_SERVER['HTTP_X_FORWARDED_FOR']);
        $ip = trim($parts[0]);
    }
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'success' => true,
        'ip' => $ip,
        'userAgent' => $_SERVER['HTTP_USER_AGENT'] ?? ''
    ]);
    exit();
}

// 1.6 Action: Public Member Stats (Realtime Sync MySQL & Frontend)
if ($action === 'public_stats' || $action === 'get_member_stats') {
    header('Content-Type: application/json; charset=utf-8');
    if (!$pdo) {
        http_response_code(503);
        echo json_encode(['success' => false, 'message' => 'Database belum terhubung.']);
        exit();
    }
    ensureTablesExist($pdo);
    try {
        // Total registered non-admin members
        $stmtTot = $pdo->query("SELECT COUNT(*) AS total FROM `users` WHERE `role` != 'admin'");
        $totalMembers = (int)($stmtTot->fetch()['total'] ?? 0);

        // Members with active trading investments
        $stmtAct = $pdo->query("SELECT COUNT(DISTINCT `user_id`) AS active FROM `investments` WHERE `status` = 'active'");
        $activeTradingMembers = (int)($stmtAct->fetch()['active'] ?? 0);

        // Unblocked members count
        $stmtUnb = $pdo->query("SELECT COUNT(*) AS unblocked FROM `users` WHERE `role` != 'admin' AND (`is_blocked` = 0 OR `is_blocked` IS NULL) AND (`status` != 'blocked' OR `status` IS NULL)");
        $unblockedMembers = (int)($stmtUnb->fetch()['unblocked'] ?? 0);

        // Active count: users with active trading contracts, or non-blocked fallback
        $activeCount = $activeTradingMembers > 0 ? $activeTradingMembers : $unblockedMembers;

        echo json_encode([
            'success' => true,
            'totalMembers' => $totalMembers,
            'activeMembers' => $activeCount,
            'activeTradingMembers' => $activeTradingMembers,
            'unblockedMembers' => $unblockedMembers
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    }
    exit();
}

// 1.7 Action: Check Referral Code Exists in MySQL
if ($action === 'check_referral') {
    $code = strtoupper(trim($_GET['code'] ?? ''));
    if ($code === '') {
        echo json_encode(['success' => false, 'exists' => false, 'message' => 'Kode referral kosong.']);
        exit();
    }
    if (!$pdo) {
        http_response_code(503);
        echo json_encode(['success' => false, 'exists' => false, 'message' => 'Database MySQL belum terhubung.']);
        exit();
    }
    ensureTablesExist($pdo);
    try {
        $stmt = $pdo->prepare("SELECT `username`, `full_name`, `referral_code` FROM `users` WHERE UPPER(`referral_code`) = :c OR UPPER(`username`) = :u LIMIT 1");
        $stmt->execute([':c' => $code, ':u' => $code]);
        $row = $stmt->fetch();
        if ($row) {
            echo json_encode([
                'success' => true,
                'exists' => true,
                'referralCode' => $row['referral_code'] ?? $code,
                'username' => $row['username'] ?? '',
                'fullName' => $row['full_name'] ?? $row['username'] ?? ''
            ]);
        } else {
            echo json_encode(['success' => false, 'exists' => false, 'message' => 'Kode sponsor tidak ditemukan di database.']);
        }
    } catch (Exception $eRef) {
        echo json_encode(['success' => false, 'exists' => false, 'message' => $eRef->getMessage()]);
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
                $data['users'] = array_values(array_filter($data['users'], function($u) {
                    return ($u['id'] ?? '') !== 'usr-1791275394006';
                }));
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
                    if ($tId === 'TRX-PRF-917036') {
                        continue;
                    }
                    $tType = !empty($rowT['type']) ? $rowT['type'] : '';
                    if ($tType === '' || $tType === 'deposit' || $tType === 'checkin' || $tType === 'daily_checkin' || $tType === 'check_in') {
                        if (strpos($tId, 'TRX-INV-') === 0 || stripos($rowT['note'] ?? '', 'Aktivasi paket') !== false) {
                            $tType = 'invest_plan';
                        } elseif (strpos($tId, 'TX-CHK-') === 0 || $tType === 'checkin' || $tType === 'daily_checkin' || $tType === 'check_in' || stripos($rowT['note'] ?? '', 'absen') !== false || stripos($rowT['payment_method'] ?? '', 'Absensi') !== false) {
                            $tType = 'bonus';
                        } elseif (strpos($tId, 'TRX-PRF-') === 0 || stripos($rowT['note'] ?? '', 'Klaim profit') !== false) {
                            $tType = 'profit_claim';
                        } elseif (strpos($tId, 'TRX-DEP-') === 0) {
                            $tType = 'deposit';
                        } elseif (strpos($tId, 'TRX-WDR-') === 0) {
                            $tType = 'withdraw';
                        } elseif (strpos($tId, 'TRX-SPS-') === 0) {
                            $tType = 'sponsor_bonus';
                        } elseif (strpos($tId, 'TRX-RBT-') === 0) {
                            $tType = 'rabat_bonus';
                        } elseif (strpos($tId, 'TRX-LDR-') === 0 || stripos($rowT['note'] ?? '', 'Kepemimpinan') !== false) {
                            $tType = 'leader_bonus';
                        } elseif (strpos($tId, 'TRX-POB-') === 0) {
                            $tType = 'ppob_conversion';
                        } elseif (strpos($tId, 'TRX-TRFI-') === 0 || stripos($rowT['note'] ?? '', 'Terima transfer') !== false) {
                            $tType = 'member_transfer';
                        } elseif (strpos($tId, 'TRX-TRFO-') === 0 || stripos($rowT['note'] ?? '', 'Transfer saldo ke member') !== false) {
                            $tType = 'member_transfer_out';
                        }
                    }

                    if (isset($trxMap[$tId])) {
                        $idx = $trxMap[$tId];
                        $data['transactions'][$idx]['status'] = $rowT['status'];
                        $data['transactions'][$idx]['amount'] = (int)$rowT['amount'];
                        $data['transactions'][$idx]['type'] = $tType ?: ($data['transactions'][$idx]['type'] ?? 'deposit');
                        if (isset($rowT['net_amount'])) {
                            $data['transactions'][$idx]['netAmount'] = (int)$rowT['net_amount'];
                        }
                        if (!empty($rowT['payment_method'])) {
                            $data['transactions'][$idx]['paymentMethod'] = cleanPaymentMethodStr($rowT['payment_method']);
                        }
                        // Detail tujuan penarikan ikut disinkronkan dari tabel
                        // relasional; dulu cabang ini hanya memperbarui status
                        // sehingga nomor rekening yang tersimpan di DB tidak
                        // pernah sampai ke panel admin.
                        if (!empty($rowT['destination_account'])) {
                            $data['transactions'][$idx]['destinationAccount'] = $rowT['destination_account'];
                        }
                        if (!empty($rowT['net_amount'])) {
                            $data['transactions'][$idx]['netAmount'] = (int)$rowT['net_amount'];
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
                            'type' => $tType ?: 'deposit',
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

                // Urutkan transaksi: Transaksi terbaru selalu di paling atas (DESC)
                if (!empty($data['transactions']) && is_array($data['transactions'])) {
                    usort($data['transactions'], function($a, $b) {
                        $tA = strtotime($a['createdAt'] ?? $a['created_at'] ?? '1970-01-01');
                        $tB = strtotime($b['createdAt'] ?? $b['created_at'] ?? '1970-01-01');
                        return $tB <=> $tA;
                    });
                    $data['transactions'] = array_values(array_filter($data['transactions'], function($tx) {
                        return ($tx['id'] ?? '') !== 'TRX-PRF-917036';
                    }));
                }
            }

            // 2b. Detail rekening tujuan penarikan disatukan untuk tampilan
            // admin & riwayat member. Transaksi lama kadang hanya menyimpan
            // payment_method (nomor sudah masked) tanpa pemilik/nomor lengkap,
            // jadi profil member dipakai sebagai sumber cadangan.
            if (!empty($data['transactions']) && is_array($data['transactions'])) {
                $userBankMap = [];
                foreach ((isset($data['users']) && is_array($data['users']) ? $data['users'] : []) as $uB) {
                    if (!empty($uB['id'])) {
                        $userBankMap[(string)$uB['id']] = (isset($uB['bankAccount']) && is_array($uB['bankAccount'])) ? $uB['bankAccount'] : [];
                    }
                }
                foreach ($data['transactions'] as $idxB => $tB) {
                    if (($tB['type'] ?? '') !== 'withdraw') continue;
                    $infoB = parseWithdrawBankDetails(
                        $tB['paymentMethod'] ?? '',
                        $tB['destinationAccount'] ?? ($tB['destination_account'] ?? ''),
                        $userBankMap[(string)($tB['userId'] ?? '')] ?? []
                    );
                    $data['transactions'][$idxB]['bankName'] = $infoB['bankName'];
                    $data['transactions'][$idxB]['accountNumber'] = $infoB['accountNumber'];
                    $data['transactions'][$idxB]['accountHolder'] = $infoB['accountHolder'];
                    $data['transactions'][$idxB]['destinationComplete'] = $infoB['complete'];
                    $data['transactions'][$idxB]['destinationMasked'] = $infoB['masked'];
                    if (empty($tB['destinationAccount']) && $infoB['complete']) {
                        $data['transactions'][$idxB]['destinationAccount'] = $infoB['accountHolder'] . ' - ' . $infoB['accountNumber'];
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
                    $data['settings'] = mergeSettingsData($data['settings'] ?? [], $dbSettings);
                }
            }

            // Merge customized platform_plans if available
            try {
                $pStmt = $pdo->prepare("SELECT `setting_value` FROM `settings` WHERE `setting_key` = 'platform_plans' LIMIT 1");
                $pStmt->execute();
                $pRow = $pStmt->fetch();
                if ($pRow && !empty($pRow['setting_value'])) {
                    $dbPlans = json_decode($pRow['setting_value'], true);
                    if (is_array($dbPlans) && count($dbPlans) > 0) {
                        $data['plans'] = $dbPlans;
                    }
                }
            } catch(Exception $eP) {}

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

            // 7. Merge custom plans and custom rewards from settings table
            try {
                $pStmt = $pdo->prepare("SELECT `setting_value` FROM `settings` WHERE `setting_key` = 'platform_plans' LIMIT 1");
                $pStmt->execute();
                $pRow = $pStmt->fetch();
                if ($pRow && !empty($pRow['setting_value'])) {
                    $savedPlans = json_decode($pRow['setting_value'], true);
                    if (is_array($savedPlans) && count($savedPlans) > 0) {
                        $data['plans'] = $savedPlans;
                    }
                }
            } catch (Exception $eP) {}

            try {
                $rStmt = $pdo->prepare("SELECT `setting_value` FROM `settings` WHERE `setting_key` = 'platform_rewards' LIMIT 1");
                $rStmt->execute();
                $rRow = $rStmt->fetch();
                if ($rRow && !empty($rRow['setting_value'])) {
                    $savedRewards = json_decode($rRow['setting_value'], true);
                    if (is_array($savedRewards) && count($savedRewards) > 0) {
                        $data['rewards'] = $savedRewards;
                    }
                }
            } catch (Exception $eR) {}

            try {
                $sSigStmt = $pdo->prepare("SELECT `setting_value` FROM `settings` WHERE `setting_key` = 'platform_signals' LIMIT 1");
                $sSigStmt->execute();
                $sSigRow = $sSigStmt->fetch();
                if ($sSigRow && !empty($sSigRow['setting_value'])) {
                    $savedSignals = json_decode($sSigRow['setting_value'], true);
                    // An empty array is meaningful here: the admin deleted every signal and
                    // the defaults must not come back.
                    if (is_array($savedSignals)) {
                        $data['signals'] = array_values($savedSignals);
                    }
                }
            } catch (Exception $eSig) {}

            // 8. Running text (announcements + rotation speed) saved by the admin panel
            try {
                $sAnnStmt = $pdo->prepare("SELECT `setting_value` FROM `settings` WHERE `setting_key` = 'platform_announcements' LIMIT 1");
                $sAnnStmt->execute();
                $sAnnRow = $sAnnStmt->fetch();
                if ($sAnnRow && !empty($sAnnRow['setting_value'])) {
                    $savedAnn = json_decode($sAnnRow['setting_value'], true);
                    if (is_array($savedAnn)) {
                        if (array_key_exists('announcements', $savedAnn) && is_array($savedAnn['announcements'])) {
                            $data['announcements'] = array_values($savedAnn['announcements']);
                        }
                        if (!empty($savedAnn['speed'])) {
                            $data['settings'] = is_array($data['settings'] ?? null) ? $data['settings'] : [];
                            $data['settings']['announcementSpeed'] = (int)$savedAnn['speed'];
                        }
                    }
                }
            } catch (Exception $eAnn) {}


            // Comprehensive transaction deduplication across all types (checkins, plans, profits, PPOB, leader, rabat)
            if (isset($data['transactions']) && is_array($data['transactions'])) {
                $seenCheckin = [];
                $seenTrxKeys = [];
                $cleanTrx = [];
                $knownDuplicatesToDrop = [
                    'TRX-INV-962298', 'TRX-INV-468776', 'TRX-POB-850709', 'TRX-POB-524211',
                    'TRX-POB-838271', 'TRX-LDR-949974', 'TRX-LDR-488875', 'TRX-RBT-258092',
                    'TRX-PRF-917036', 'TX-CHK-392542'
                ];
                foreach ($data['transactions'] as $t) {
                    $tId = $t['id'] ?? '';
                    if (in_array($tId, $knownDuplicatesToDrop, true)) continue;

                    // Deduplicate same transaction ID
                    if ($tId !== '') {
                        if (isset($seenTrxKeys['id_' . $tId])) continue;
                        $seenTrxKeys['id_' . $tId] = true;
                    }

                    // Deduplicate identical check-in on same day for same user
                    $isCheckin = (strpos($tId, 'TX-CHK-') === 0) || 
                                 (isset($t['paymentMethod']) && strpos($t['paymentMethod'], 'Absensi') !== false);
                    if ($isCheckin) {
                        $cDate = substr($t['createdAt'] ?? '', 0, 10);
                        $uKey = ($t['userId'] ?? '') . '_' . $cDate;
                        if (isset($seenCheckin[$uKey])) {
                            continue;
                        }
                        $seenCheckin[$uKey] = true;
                    }

                    // Deduplicate near-identical transactions within 60s window (same user, type, amount)
                    $tType = $t['type'] ?? '';
                    $tAmt = (int)($t['amount'] ?? 0);
                    $tTime = isset($t['createdAt']) ? strtotime($t['createdAt']) : 0;
                    if ($tTime > 0 && !empty($t['userId']) && $tType !== '') {
                        $timeBucket = floor($tTime / 60);
                        $approxKey = ($t['userId'] ?? '') . '_' . $tType . '_' . $tAmt . '_' . $timeBucket;
                        if (isset($seenTrxKeys[$approxKey])) {
                            continue;
                        }
                        $seenTrxKeys[$approxKey] = true;
                    }

                    if (!empty($t['paymentMethod'])) {
                        $t['paymentMethod'] = cleanPaymentMethodStr($t['paymentMethod']);
                    }
                    $cleanTrx[] = $t;
                }
                if (!empty($cleanTrx)) {
                    usort($cleanTrx, function($a, $b) {
                        $tA = isset($a['createdAt']) ? strtotime($a['createdAt']) : (isset($a['created_at']) ? strtotime($a['created_at']) : 0);
                        $tB = isset($b['createdAt']) ? strtotime($b['createdAt']) : (isset($b['created_at']) ? strtotime($b['created_at']) : 0);
                        return $tB <=> $tA;
                    });
                }
                $data['transactions'] = $cleanTrx;
            }

            // Synchronize inv-1791445218883 (user bisnis) with TRX-PRF-699521 claimed profit
            if (isset($data['investments']) && is_array($data['investments'])) {
                foreach ($data['investments'] as &$invSync) {
                    if (($invSync['id'] ?? '') === 'inv-1791445218883') {
                        $invSync['pendingProfitClaim'] = 0;
                        $invSync['daysElapsed'] = 3;
                        $invSync['totalProfitEarned'] = 128499;
                        if (isset($invSync['history']) && is_array($invSync['history'])) {
                            foreach ($invSync['history'] as &$h) {
                                if (($h['status'] ?? '') === 'pending_claim') {
                                    $h['status'] = 'claimed';
                                    $h['claimedAt'] = '2026-10-14 07:53:11';
                                }
                            }
                            unset($h);
                        }
                    }
                }
                unset($invSync);
            }
        } catch (Exception $eMerge) {
            // Keep going with merged state
        }

        // Never leak passwords / OTP / reset codes to any client, and convert heavy base64 proof images to static URLs
        sanitizeStateData($data);

        // One-time persist cleaned transactions back to MySQL and system state so DB does not store multi-megabyte base64
        try {
            if (!empty($data['transactions']) && is_array($data['transactions'])) {
                $updTxStmt = $pdo->prepare("UPDATE `transactions` SET `proof_image` = :url WHERE `id` = :id AND (`proof_image` LIKE 'data:image%' OR `proof_image` IS NULL)");
                $hasUpdatedAny = false;
                foreach ($data['transactions'] as $tx) {
                    if (!empty($tx['proofImage']) && strpos($tx['proofImage'], 'http') === 0 && !empty($tx['id'])) {
                        $updTxStmt->execute([':url' => $tx['proofImage'], ':id' => $tx['id']]);
                        if ($updTxStmt->rowCount() > 0) $hasUpdatedAny = true;
                    }
                }
                if ($hasUpdatedAny) {
                    saveMainState($pdo, $data);
                }
            }
        } catch(Exception $eUpdTrx) {}

        // Precomputed public stats directly from live relational MySQL tables (visible to guests and members)
        try {
            $stmtTot = $pdo->query("SELECT COUNT(*) AS total FROM `users` WHERE `role` != 'admin'");
            $totalMembers = (int)($stmtTot->fetch()['total'] ?? 0);
            $stmtAct = $pdo->query("SELECT COUNT(DISTINCT `user_id`) AS active FROM `investments` WHERE `status` = 'active'");
            $activeTradingMembers = (int)($stmtAct->fetch()['active'] ?? 0);
            $stmtUnb = $pdo->query("SELECT COUNT(*) AS unblocked FROM `users` WHERE `role` != 'admin' AND (`is_blocked` = 0 OR `is_blocked` IS NULL) AND (`status` != 'blocked' OR `status` IS NULL)");
            $unblockedMembers = (int)($stmtUnb->fetch()['unblocked'] ?? 0);
            $activeCount = $activeTradingMembers > 0 ? $activeTradingMembers : $unblockedMembers;

            $stmtWdCount = $pdo->query("SELECT COUNT(*) AS total, COALESCE(SUM(`amount`), 0) AS total_amount FROM `transactions` WHERE `type` = 'withdraw' AND `status` = 'approved'");
            $wdStats = $stmtWdCount->fetch();
            $totalWdApproved = (int)($wdStats['total'] ?? 0);
            $totalWdAmount = (int)($wdStats['total_amount'] ?? 0);

            $data['publicStats'] = [
                'totalMembers' => $totalMembers,
                'activeMembers' => $activeCount,
                'activeTradingMembers' => $activeTradingMembers,
                'unblockedMembers' => $unblockedMembers,
                'totalWithdrawals' => $totalWdApproved,
                'totalWithdrawalsAmount' => $totalWdAmount
            ];
        } catch (Exception $eStats) {}

        // Populate testimonials from real approved withdrawals if empty
        if (empty($data['testimonials']) || count($data['testimonials']) === 0) {
            try {
                $stmtRealWd = $pdo->query("SELECT * FROM `transactions` WHERE `type` = 'withdraw' AND `status` = 'approved' ORDER BY `created_at` DESC LIMIT 15");
                $realWds = $stmtRealWd->fetchAll();
                if ($realWds && count($realWds) > 0) {
                    $genTestis = [];
                    foreach ($realWds as $rw) {
                        $rawName = $rw['username'] ?? 'Member';
                        if (!empty($rw['destination_account']) && strpos($rw['destination_account'], '-') !== false) {
                            $parts = explode('-', $rw['destination_account']);
                            $accHolder = trim($parts[0]);
                            if ($accHolder !== '') $rawName = $accHolder;
                        }
                        $cleanName = (strlen($rawName) > 3) ? substr($rawName, 0, 3) . '***' : $rawName . '***';
                        $pm = maskAccountForPrivacy(cleanPaymentMethodStr($rw['payment_method'] ?? 'Transfer Bank'));
                        if (!empty($rw['destination_account'])) {
                            if (stripos($rw['destination_account'], 'dana') !== false || stripos($rw['payment_method'] ?? '', 'dana') !== false) {
                                $pm = 'DANA (081274619XXX)';
                                if (preg_match('/(08\d{2})\d{3,8}(\d{2,3})|\b(08\d{6,12})\b/', $rw['destination_account'], $mD)) {
                                    $pm = 'DANA (' . maskAccountForPrivacy($mD[0]) . ')';
                                }
                            } elseif (preg_match('/\b(BCA|BRI|BNI|Mandiri|CIMB|Permata|SeaBank|BSI)\b/i', $rw['destination_account'], $mB)) {
                                $bankName = strtoupper($mB[1]);
                                if (preg_match('/\b\d{4,24}\b/', $rw['destination_account'], $mAcc)) {
                                    $pm = $bankName . ' (' . maskAccountForPrivacy($mAcc[0]) . ')';
                                } else {
                                    $pm = 'Bank ' . $bankName;
                                }
                            }
                        }
                        $timeAgo = 'Baru saja';
                        if (!empty($rw['created_at'])) {
                            $diff = time() - strtotime($rw['created_at']);
                            if ($diff < 3600) $timeAgo = max(1, floor($diff / 60)) . ' menit lalu';
                            elseif ($diff < 86400) $timeAgo = floor($diff / 3600) . ' jam lalu';
                            elseif ($diff < 604800) $timeAgo = floor($diff / 86400) . ' hari lalu';
                            else $timeAgo = date('d M Y', strtotime($rw['created_at']));
                        }
                        $genTestis[] = [
                            'id' => 'testi-' . $rw['id'],
                            'userId' => $rw['user_id'] ?? null,
                            'name' => $cleanName,
                            'city' => 'Indonesia',
                            'avatar' => 'https://ui-avatars.com/api/?name=' . urlencode($cleanName) . '&background=C89338&color=fff',
                            'bank' => $pm,
                            'amount' => (int)$rw['amount'],
                            'rating' => 5,
                            'comment' => 'Penarikan dana dividen/bonus telah berhasil masuk ke rekening dengan lancar. AUTOTRADING terbukti amanah dan terpercaya!',
                            'receiptImage' => '',
                            'timeAgo' => $timeAgo,
                            'active' => true,
                            'status' => 'approved',
                            'createdAt' => $rw['created_at'] ?? date('c')
                        ];
                    }
                    $data['testimonials'] = $genTestis;
                }
            } catch (Exception $eTesti) {}
        }

        // Also mask existing testimonials if they contain raw bank or DANA phone numbers
        if (!empty($data['testimonials']) && is_array($data['testimonials'])) {
            foreach ($data['testimonials'] as &$exTesti) {
                if (!empty($exTesti['bank'])) {
                    $exTesti['bank'] = maskAccountForPrivacy(cleanPaymentMethodStr($exTesti['bank']));
                }
            }
            unset($exTesti);
        }

        // Populate platform-wide public recent transactions ticker (deposits & withdrawals) for running text
        $publicRecentDeposits = [];
        $publicRecentWithdrawals = [];
        $publicRecentTransactions = [];

        $dbDeposits = [];
        $dbWithdrawals = [];
        if ($pdo) {
            try {
                // Catatan: jangan pernah menimpa `destination_account` di database
                // hanya untuk kebutuhan tampilan publik. Tiga UPDATE masking lama
                // di sini berjalan pada SETIAP action=get sehingga nomor rekening
                // asli hilang berulang kali dan panel admin kehilangan tujuan
                // transfer. Ticker publik sudah di-mask saat membentuk response
                // (lihat maskAccountForPrivacy di bawah), jadi data DB tetap utuh.
                $stDep = $pdo->query("SELECT `id`, `user_id`, `username`, `type`, `amount`, `payment_method`, `destination_account`, `status`, `created_at` FROM `transactions` WHERE `status` = 'approved' AND `type` = 'deposit' ORDER BY `created_at` DESC LIMIT 30");
                $dbDeposits = $stDep ? $stDep->fetchAll() : [];
                $stWd = $pdo->query("SELECT `id`, `user_id`, `username`, `type`, `amount`, `payment_method`, `destination_account`, `status`, `created_at` FROM `transactions` WHERE `status` = 'approved' AND `type` = 'withdraw' ORDER BY `created_at` DESC LIMIT 30");
                $dbWithdrawals = $stWd ? $stWd->fetchAll() : [];
            } catch(Exception $ePub) {}
        }
        if (empty($dbDeposits) || empty($dbWithdrawals)) {
            $allTxs = $data['transactions'] ?? [];
            foreach ($allTxs as $t) {
                if (($t['status'] ?? '') === 'approved') {
                    if (($t['type'] ?? '') === 'deposit' && count($dbDeposits) < 30) $dbDeposits[] = $t;
                    if (($t['type'] ?? '') === 'withdraw' && count($dbWithdrawals) < 30) $dbWithdrawals[] = $t;
                }
            }
        }

        foreach ($dbDeposits as $pt) {
            $rawU = $pt['username'] ?? 'Member';
            $maskedU = (strlen($rawU) > 3) ? substr($rawU, 0, 3) . '***' : $rawU . '***';
            $rawMethod = $pt['paymentMethod'] ?? $pt['payment_method'] ?? 'Transfer Bank BCA';
            $cleanMethod = maskAccountForPrivacy(cleanPaymentMethodStr($rawMethod));
            $publicRecentDeposits[] = [
                'id' => $pt['id'] ?? '',
                'username' => $maskedU,
                'type' => 'deposit',
                'amount' => (int)($pt['amount'] ?? 0),
                'paymentMethod' => $cleanMethod,
                'destinationAccount' => $cleanMethod,
                'status' => 'approved',
                'createdAt' => $pt['createdAt'] ?? $pt['created_at'] ?? date('c')
            ];
        }

        foreach ($dbWithdrawals as $pt) {
            $rawU = $pt['username'] ?? 'Member';
            $maskedU = (strlen($rawU) > 3) ? substr($rawU, 0, 3) . '***' : $rawU . '***';
            $rawMethod = $pt['paymentMethod'] ?? $pt['payment_method'] ?? $pt['destinationAccount'] ?? $pt['destination_account'] ?? 'Bank BCA';
            $cleanMethod = maskAccountForPrivacy(cleanPaymentMethodStr($rawMethod));
            $publicRecentWithdrawals[] = [
                'id' => $pt['id'] ?? '',
                'username' => $maskedU,
                'type' => 'withdraw',
                'amount' => (int)($pt['amount'] ?? 0),
                'paymentMethod' => $cleanMethod,
                'destinationAccount' => $cleanMethod,
                'status' => 'approved',
                'createdAt' => $pt['createdAt'] ?? $pt['created_at'] ?? date('c')
            ];
        }

        $publicRecentTransactions = array_merge($publicRecentDeposits, $publicRecentWithdrawals);
        usort($publicRecentTransactions, function($a, $b) {
            return strcmp($b['createdAt'], $a['createdAt']);
        });

        $data['publicRecentDeposits'] = $publicRecentDeposits;
        $data['publicRecentWithdrawals'] = $publicRecentWithdrawals;
        $data['publicRecentTransactions'] = $publicRecentTransactions;

        // Authoritative, privacy-safe platform leaderboard computed from all active members
        $data['leaderboard'] = getPlatformLeaderboard($data['users'] ?? [], $data['investments'] ?? [], $data['transactions'] ?? []);

        // Enforce strict authorization filtering to prevent unauthorized data exposure (BUG-001)
        $sessionUid = currentSessionUserId();
        $sessionRole = currentSessionRole();
        // SECURITY: tidak ada lagi master key di URL. Dulu ?key=at_clean_2026
        // membuat siapa pun mendapat level admin dan menarik SELURUH data member
        // (PII + saldo + ledger) tanpa login sama sekali.
        $isSessionAdmin = ($sessionRole === 'admin');

        if ($sessionUid === '' && !$isSessionAdmin) {
            // Unauthenticated Guest: Zero access to PII or transaction ledgers
            $data['users'] = [];
            $data['transactions'] = [];
            $data['investments'] = [];
            $data['redemptions'] = [];
            $data['system_logs'] = [];
            $data['isGuest'] = true;
            // Never serve session-derived keys persisted in shared state: they used to
            // leak one browser's identity (currentUser/isAdmin) to every guest and
            // auto-login visitors via the client's re-hydration path.
            unset($data['currentUser'], $data['currentSession'], $data['isAdmin']);
        } elseif (!$isSessionAdmin) {
            $data['isGuest'] = false;
            // Members: identity comes only from the authenticated session below,
            // never from stale state written by another browser.
            unset($data['isAdmin'], $data['currentUser'], $data['currentSession']);
            // Logged-in regular member: Only access own profile and transactions + sanitized downline hierarchy
            $currentUserRecord = null;
            $userRefCode = '';
            $allUsers = $data['users'] ?? [];
            foreach ($allUsers as $u) {
                if (($u['id'] ?? '') === $sessionUid) {
                    $currentUserRecord = $u;
                    $userRefCode = trim((string)($u['referralCode'] ?? $u['username'] ?? ''));
                    break;
                }
            }

            $downlineIds = [];
            $allowedUserRecords = [];
            if ($currentUserRecord) {
                $allowedUserRecords[] = $currentUserRecord;
                $data['currentUser'] = $currentUserRecord;
            }

            if ($userRefCode !== '') {
                $l1Codes = [];
                $l2Codes = [];
                // Level 1 (Direct)
                foreach ($allUsers as $u) {
                    $uRef = trim((string)($u['referredBy'] ?? ''));
                    if ($uRef !== '' && strcasecmp($uRef, $userRefCode) === 0) {
                        $downlineIds[$u['id']] = true;
                        $l1Codes[] = trim((string)($u['referralCode'] ?? $u['username'] ?? ''));
                        $allowedUserRecords[] = [
                            'id' => $u['id'],
                            'username' => $u['username'] ?? '',
                            'fullName' => $u['fullName'] ?? $u['username'] ?? '',
                            'referralCode' => $u['referralCode'] ?? $u['username'] ?? '',
                            'referredBy' => $u['referredBy'] ?? '',
                            'registeredAt' => $u['registeredAt'] ?? '',
                            'status' => $u['status'] ?? 'active',
                            'role' => 'user'
                        ];
                    }
                }
                // Level 2
                if (!empty($l1Codes)) {
                    foreach ($allUsers as $u) {
                        $uRef = trim((string)($u['referredBy'] ?? ''));
                        if ($uRef !== '' && !isset($downlineIds[$u['id']])) {
                            foreach ($l1Codes as $c1) {
                                if ($c1 !== '' && strcasecmp($uRef, $c1) === 0) {
                                    $downlineIds[$u['id']] = true;
                                    $l2Codes[] = trim((string)($u['referralCode'] ?? $u['username'] ?? ''));
                                    $allowedUserRecords[] = [
                                        'id' => $u['id'],
                                        'username' => $u['username'] ?? '',
                                        'fullName' => $u['fullName'] ?? $u['username'] ?? '',
                                        'referralCode' => $u['referralCode'] ?? $u['username'] ?? '',
                                        'referredBy' => $u['referredBy'] ?? '',
                                        'registeredAt' => $u['registeredAt'] ?? '',
                                        'status' => $u['status'] ?? 'active',
                                        'role' => 'user'
                                    ];
                                    break;
                                }
                            }
                        }
                    }
                }
                // Level 3
                if (!empty($l2Codes)) {
                    foreach ($allUsers as $u) {
                        $uRef = trim((string)($u['referredBy'] ?? ''));
                        if ($uRef !== '' && !isset($downlineIds[$u['id']])) {
                            foreach ($l2Codes as $c2) {
                                if ($c2 !== '' && strcasecmp($uRef, $c2) === 0) {
                                    $downlineIds[$u['id']] = true;
                                    $allowedUserRecords[] = [
                                        'id' => $u['id'],
                                        'username' => $u['username'] ?? '',
                                        'fullName' => $u['fullName'] ?? $u['username'] ?? '',
                                        'referralCode' => $u['referralCode'] ?? $u['username'] ?? '',
                                        'referredBy' => $u['referredBy'] ?? '',
                                        'registeredAt' => $u['registeredAt'] ?? '',
                                        'status' => $u['status'] ?? 'active',
                                        'role' => 'user'
                                    ];
                                    break;
                                }
                            }
                        }
                    }
                }
            }

            $data['users'] = $allowedUserRecords;

            // Only user's own transactions
            $data['transactions'] = array_values(array_filter($data['transactions'] ?? [], function($t) use ($sessionUid) {
                return ($t['userId'] ?? '') === $sessionUid;
            }));

            // User's own investments + sanitized downline turnover figures
            $allowedInvestments = [];
            foreach (($data['investments'] ?? []) as $inv) {
                $iUid = $inv['userId'] ?? '';
                if ($iUid === $sessionUid) {
                    $allowedInvestments[] = $inv;
                } elseif (isset($downlineIds[$iUid])) {
                    $allowedInvestments[] = [
                        'id' => $inv['id'],
                        'userId' => $iUid,
                        'capital' => (int)($inv['capital'] ?? 0),
                        'status' => $inv['status'] ?? 'active'
                    ];
                }
            }
            $data['investments'] = $allowedInvestments;

            // Only user's own redemptions
            $data['redemptions'] = array_values(array_filter($data['redemptions'] ?? [], function($r) use ($sessionUid) {
                return ($r['userId'] ?? '') === $sessionUid;
            }));

            $data['system_logs'] = [];
        } else {
            $data['isGuest'] = false;
            $data['isAdmin'] = true;
            $data['currentSession'] = null;
            // Admin identity resolved from the authenticated session roster,
            // never trusted from shared state (it may belong to another browser).
            $adminRecord = null;
            foreach (($data['users'] ?? []) as $au) {
                if (is_array($au) && ($au['id'] ?? '') === $sessionUid) {
                    $adminRecord = $au;
                    break;
                }
            }
            if ($adminRecord) {
                $data['currentUser'] = $adminRecord;
            } else {
                unset($data['currentUser']);
            }
        }

        // Guard reset: entri milik member yang sudah di-reset total dibuang bila
        // dibuat sebelum reset. Menutup celah JSON state yang masih menyimpan
        // salinan lama sehingga data yang sudah dihapus muncul lagi di panel admin.
        $resetTombstones = getResetTombstones($pdo);
        if (!empty($resetTombstones)) {
            foreach (['transactions', 'investments', 'redemptions'] as $resetKey) {
                if (isset($data[$resetKey]) && is_array($data[$resetKey])) {
                    $data[$resetKey] = stripResetItems($data[$resetKey], $resetTombstones);
                }
            }
        }

        $jsonPayload = json_encode([
            'success' => true,
            'data' => $data
        ]);

        $etag = '"' . md5($jsonPayload . '_' . $sessionUid) . '"';
        header('ETag: ' . $etag);
        header('Cache-Control: private, must-revalidate, max-age=0');

        $clientEtag = isset($_SERVER['HTTP_IF_NONE_MATCH']) ? trim($_SERVER['HTTP_IF_NONE_MATCH']) : '';
        $cleanClientEtag = str_replace(['-gzip', '-br', 'W/'], '', $clientEtag);
        $cleanServerEtag = str_replace('W/', '', $etag);

        if (!empty($cleanClientEtag) && $cleanClientEtag === $cleanServerEtag) {
            http_response_code(304);
            exit();
        }

        echo $jsonPayload;
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

        // Enforce authoritative platform plans from settings table
        try {
            $pStmt = $pdo->prepare("SELECT `setting_value` FROM `settings` WHERE `setting_key` = 'platform_plans' LIMIT 1");
            $pStmt->execute();
            $pRow = $pStmt->fetch();
            if ($pRow && !empty($pRow['setting_value'])) {
                $dbPlans = json_decode($pRow['setting_value'], true);
                if (is_array($dbPlans) && count($dbPlans) > 0) {
                    $existing['plans'] = $dbPlans;
                    $parsed['plans'] = $dbPlans;
                }
            }
        } catch (Exception $eP) {}

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

        // Absensi: gabungkan riwayat tersimpan + kiriman browser (union per tanggal).
        // Save dari tab/browser lama tidak boleh menghapus hari yang sudah diklaim.
        $chkTotalDays = 7;
        try {
            $cfgChk = getGeneralSettings($pdo);
            if (!empty($cfgChk['dailyCheckIn']['totalDays'])) $chkTotalDays = max(1, (int)$cfgChk['dailyCheckIn']['totalDays']);
        } catch (Exception $eChkCfg) {}
        $existingUserChk = [];
        foreach ($existingUsers as $eu) {
            if (!empty($eu['id'])) $existingUserChk[$eu['id']] = $eu;
        }
        foreach ($parsed['users'] as &$pu) {
            if (empty($pu['id'])) continue;
            $prevChk = $existingUserChk[$pu['id']]['dailyCheckIn'] ?? null;
            $pu['dailyCheckIn'] = mergeCheckInRecords($prevChk, $pu['dailyCheckIn'] ?? null, $chkTotalDays);
        }
        unset($pu);

        // Smart merge transactions: preserve existing transactions
        $existingTrxs = $existing['transactions'] ?? [];
        $incomingTrxs = $parsed['transactions'] ?? [];
        $mergedTrxMap = [];
        foreach ($existingTrxs as $t) {
            if (!empty($t['id']) && $t['id'] !== 'TRX-PRF-917036') $mergedTrxMap[$t['id']] = $t;
        }
        foreach ($incomingTrxs as $t) {
            if (!empty($t['id']) && $t['id'] !== 'TRX-PRF-917036') {
                // Status kosong tidak PERNAH sah: jangan biarkan payload client
                // lama menimpa status asli (dulu '' bisa menimpa 'awaiting_payment').
                if (($t['status'] ?? null) === '') {
                    unset($t['status']);
                }
                if (isset($mergedTrxMap[$t['id']])) {
                    $mergedTrxMap[$t['id']] = array_merge($mergedTrxMap[$t['id']], $t);
                } else {
                    $mergedTrxMap[$t['id']] = $t;
                }
            }
        }
        foreach ($mergedTrxMap as &$mTx) {
            if (!empty($mTx['proofImage']) && is_string($mTx['proofImage']) && strpos($mTx['proofImage'], 'data:image') === 0) {
                $mTx['proofImage'] = saveBase64ImageFile($mTx['proofImage'], 'proof_' . preg_replace('/[^a-zA-Z0-9]/', '', $mTx['id'] ?? 'trx'));
            }
        }
        unset($mTx);
        $parsed['transactions'] = array_values(array_filter($mergedTrxMap, function($tx) {
            return ($tx['id'] ?? '') !== 'TRX-PRF-917036';
        }));

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
                    $curEarned = (int)($mergedInvMap[$i['id']]['totalProfitEarned'] ?? 0);
                    $incEarned = (int)($i['totalProfitEarned'] ?? 0);
                    $merged = array_merge($mergedInvMap[$i['id']], $i);
                    $merged['totalProfitEarned'] = max($curEarned, $incEarned);
                    // Hari berjalan & status hanya boleh MAJU (monotonic), tidak boleh
                    // mundur karena snapshot lama dari browser member.
                    $merged['daysElapsed'] = max(
                        (int)($mergedInvMap[$i['id']]['daysElapsed'] ?? 0),
                        (int)($i['daysElapsed'] ?? 0)
                    );
                    $curStatus = $mergedInvMap[$i['id']]['status'] ?? 'active';
                    $incStatus = $i['status'] ?? 'active';
                    if ($curStatus === 'completed' || $incStatus === 'completed') {
                        $merged['status'] = 'completed';
                        $merged['refundReady'] = true;
                    }
                    $merged['capitalReturned'] = !empty($mergedInvMap[$i['id']]['capitalReturned']) || !empty($i['capitalReturned']);
                    $mergedInvMap[$i['id']] = $merged;
                } else {
                    $mergedInvMap[$i['id']] = $i;
                }
            }
        }
        foreach ($mergedInvMap as &$mInv) {
            if (($mInv['id'] ?? '') === 'inv-1791262357382') {
                $mInv['pendingProfitClaim'] = 0;
                if ((int)($mInv['daysElapsed'] ?? 0) >= 3) {
                    $mInv['daysElapsed'] = 2;
                }
                if (isset($mInv['history']) && is_array($mInv['history'])) {
                    foreach ($mInv['history'] as &$h) {
                        if ((int)($h['day'] ?? 0) === 3) {
                            $h['status'] = 'in_progress';
                            unset($h['claimedAt']);
                        }
                    }
                    unset($h);
                }
            }
            if (($mInv['id'] ?? '') === 'inv-1791445218883') {
                $mInv['pendingProfitClaim'] = 0;
                $mInv['daysElapsed'] = 3;
                $mInv['totalProfitEarned'] = 128499;
                if (isset($mInv['history']) && is_array($mInv['history'])) {
                    foreach ($mInv['history'] as &$h) {
                        if (($h['status'] ?? '') === 'pending_claim') {
                            $h['status'] = 'claimed';
                            $h['claimedAt'] = '2026-10-14 07:53:11';
                        }
                    }
                    unset($h);
                }
            }
        }
        unset($mInv);
        try {
            $pdo->exec("UPDATE `investments` SET `pending_profit_claim` = 0, `days_elapsed` = 3, `total_profit_earned` = 128499, `last_profit_yield_date` = '2026-10-14 07:53:11' WHERE `id` = 'inv-1791445218883'");
        } catch(Exception $eInvUp) {}
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

        // Smart merge signals: Admin is authoritative source of truth.
        // For non-admin visitor/user sessions, ensure signals are never wiped out.
        if (!$isAdminSession) {
            if (empty($parsed['signals']) && !empty($existing['signals'])) {
                $parsed['signals'] = $existing['signals'];
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
        if (!empty($cleanTrxList)) {
            usort($cleanTrxList, function($a, $b) {
                $tA = isset($a['createdAt']) ? strtotime($a['createdAt']) : (isset($a['created_at']) ? strtotime($a['created_at']) : 0);
                $tB = isset($b['createdAt']) ? strtotime($b['createdAt']) : (isset($b['created_at']) ? strtotime($b['created_at']) : 0);
                return $tB <=> $tA;
            });
        }
        $parsed['transactions'] = $cleanTrxList;

        // Platform configuration is server-authoritative for EVERY session (admin included).
        // A full-state client save may only touch it when the caller explicitly asks for it
        // (admin config endpoint / admin backup restore), otherwise a stale snapshot would
        // roll back banners, running text, signals, rabat levels or OMSET targets.
        $allowConfigWrite = $isAdminSession && !empty($parsed['allowConfigWrite']);
        unset($parsed['allowConfigWrite']);
        freezePlatformConfig($parsed, $existing, $allowConfigWrite);

        // Server-side authority: strip secrets, freeze admin sections,
        // and clamp balance/privilege changes for non-admin sessions.
        applySavePolicy($parsed, $existing, currentSessionUserId(), $isAdminSession, $pdo);

        // Guard reset: entri milik member yang sudah di-reset total dibuang bila
        // dibuat sebelum reset, supaya snapshot tab browser lama tidak
        // menghidupkan lagi transaksi/paket yang baru dihapus admin.
        $resetTombstones = getResetTombstones($pdo);
        if (!empty($resetTombstones)) {
            foreach (['transactions', 'investments', 'redemptions'] as $resetKey) {
                if (isset($parsed[$resetKey]) && is_array($parsed[$resetKey])) {
                    $parsed[$resetKey] = stripResetItems($parsed[$resetKey], $resetTombstones);
                }
            }
        }

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
        syncRelationalTables($pdo, $parsed, $allowConfigWrite);

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

    // Authenticate: check session or token in headers/POST/GET
    $token = getRequestAuthToken();
    if (empty($token) && !empty($_POST['sessionToken'])) {
        $token = trim((string)$_POST['sessionToken']);
    }
    if (empty($token) && !empty($_GET['sessionToken'])) {
        $token = trim((string)$_GET['sessionToken']);
    }
    if (!empty($token)) {
        $parsedToken = parseSessionToken($token);
        if ($parsedToken && !empty($parsedToken['uid'])) {
            $_SESSION['uid'] = (string)$parsedToken['uid'];
            $_SESSION['role'] = (string)($parsedToken['role'] ?? 'user');
        }
    }

    // Only authenticated members/admins may upload files
    requireLogin();

    $uploadDir = dirname(__DIR__) . '/uploads';
    if (!is_dir($uploadDir)) {
        @mkdir($uploadDir, 0755, true);
    }
    @chmod($uploadDir, 0755);

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
        $allowedExts = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
        if (!in_array($ext, $allowedExts)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Format file tidak diizinkan. Gunakan JPG, PNG, WEBP, atau GIF.']);
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
        if (preg_match('/^data:image\/([a-zA-Z0-9\+\-\.]+);base64,(.+)$/', $base64, $matches)) {
            $rawMime = strtolower($matches[1]);
            if ($rawMime === 'jpeg') $ext = 'jpg';
            elseif (in_array($rawMime, ['png', 'webp', 'gif'], true)) $ext = $rawMime;
            else {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Format file gambar tidak diizinkan. Hanya menerima format JPG, PNG, WEBP, atau GIF.']);
                exit();
            }
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
    if (!$pdo) {
        http_response_code(503);
        echo json_encode(['success' => false, 'message' => 'Database MySQL cPanel belum terhubung.']);
        exit();
    }
    ensureTablesExist($pdo);

    $raw = file_get_contents('php://input');
    $in = json_decode($raw, true) ?: [];
    $incomingToken = trim($in['token'] ?? $in['sessionToken'] ?? '');
    if ($incomingToken !== '') {
        $parsedTok = parseSessionToken($incomingToken);
        if ($parsedTok && !empty($parsedTok['uid'])) {
            $_SESSION['uid'] = (string)$parsedTok['uid'];
            $_SESSION['role'] = (string)($parsedTok['role'] ?? 'user');
        }
    }

    // Require authenticated session - never allow unauthenticated claiming or user impersonation (BUG-002)
    requireLogin();
    $sessionUid = currentSessionUserId();
    $sessionRole = currentSessionRole();

    $targetUserId = trim($in['userId'] ?? $in['user_id'] ?? $in['id'] ?? '');
    if ($targetUserId !== '' && $sessionRole !== 'admin' && $targetUserId !== $sessionUid) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Akses ditolak: Anda hanya dapat mengklaim absensi untuk akun Anda sendiri.']);
        exit();
    }
    $userId = ($targetUserId !== '' && $sessionRole === 'admin') ? $targetUserId : $sessionUid;

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
          AND (`id` LIKE 'TX-CHK-%' OR `payment_method` LIKE '%Absensi%' OR `note` LIKE '%absen%')
          AND (`created_at` LIKE :todayPat OR DATE(`created_at`) = :today)
    ");
    $chkTrxStmt->execute([
        ':uid' => $userId,
        ':todayPat' => $todayWib . '%',
        ':today' => $todayWib
    ]);
    $alreadyClaimedTrxCount = (int)$chkTrxStmt->fetchColumn();

    if ($lastCheckInDate === $todayWib || $alreadyClaimedTrxCount > 0) {
        echo json_encode([
            'success' => false,
            'message' => 'Anda sudah mengklaim bonus absen hari ini! Silakan kembali besok.',
            'alreadyClaimed' => true,
            'walletBalance' => (int)$userRow['wallet_balance'],
            'currentStreak' => (int)($checkInData['currentStreak'] ?? 1),
            'sessionToken' => createSessionToken($userId, currentSessionRole() ?: 'user')
        ]);
        exit();
    }

    // 4. Streak dihitung ULANG dari ledger transaksi absensi (bukan dari
    //    history lokal yang bisa hilang/tertimpa save browser lama).
    $yesterday = date('Y-m-d', strtotime('-1 day'));
    $ledgerRows = [];
    try {
        $trxAllStmt = $pdo->prepare("
            SELECT `amount`, `note`, `created_at` FROM `transactions`
            WHERE `user_id` = :uid
              AND (`id` LIKE 'TX-CHK-%' OR `payment_method` LIKE '%Absensi%' OR `note` LIKE '%absen%')
            ORDER BY `created_at` ASC
        ");
        $trxAllStmt->execute([':uid' => $userId]);
        $ledgerRows = $trxAllStmt->fetchAll() ?: [];
    } catch(Exception $eTrxAll) {}

    $ledgerRecord = buildCheckInRecordFromLedger($ledgerRows, $totalDays);
    $newStreak = 1;
    if (($ledgerRecord['lastCheckInDate'] ?? '') === $yesterday) {
        $newStreak = (int)$ledgerRecord['currentStreak'] + 1;
        if ($newStreak > $totalDays) $newStreak = 1;
    }

    // 5. Update user in MySQL (history direkonstruksi dari ledger + hari ini)
    $newBalance = (int)$userRow['wallet_balance'] + $rewardAmount;
    $history = $ledgerRecord['history'];
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
        'sessionToken' => createSessionToken($userId, currentSessionRole() ?: 'user'),
        'message' => "Selamat! Absensi hari ke-{$newStreak} berhasil. Bonus Rp " . number_format($rewardAmount, 0, ',', '.') . " masuk ke Saldo Utama Anda!"
    ]);
    exit();
}

// 3.11 Action: Claim Daily Profit (Atomic Single-Claim Guarded on Server - Once Per Day)
if ($action === 'claim_profit') {
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

    $raw = file_get_contents('php://input');
    $in = json_decode($raw, true) ?: [];
    $incomingToken = trim($in['token'] ?? $in['sessionToken'] ?? '');
    if ($incomingToken !== '') {
        $parsedTok = parseSessionToken($incomingToken);
        if ($parsedTok && !empty($parsedTok['uid'])) {
            $_SESSION['uid'] = (string)$parsedTok['uid'];
            $_SESSION['role'] = (string)($parsedTok['role'] ?? 'user');
        }
    }

    // Require authenticated session - never allow unauthenticated claiming or user impersonation (BUG-002)
    requireLogin();
    $sessionUid = currentSessionUserId();
    $sessionRole = currentSessionRole();

    $targetUserId = trim($in['userId'] ?? $in['user_id'] ?? $in['id'] ?? '');
    if ($targetUserId !== '' && $sessionRole !== 'admin' && $targetUserId !== $sessionUid) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Akses ditolak: Anda hanya dapat mengklaim profit untuk akun Anda sendiri.']);
        exit();
    }
    $userId = ($targetUserId !== '' && $sessionRole === 'admin') ? $targetUserId : $sessionUid;

    $todayWib = date('Y-m-d'); // Asia/Jakarta
    $todayPat = $todayWib . '%';

    // 1. Strict Server Check: Has user already claimed profit today?
    $chkPrfStmt = $pdo->prepare("
        SELECT COUNT(*) FROM `transactions` 
        WHERE `user_id` = :uid 
          AND (`type` = 'profit_claim' OR `id` LIKE 'TRX-PRF-%') 
          AND (`created_at` LIKE :todayPat OR DATE(`created_at`) = :today)
    ");
    $chkPrfStmt->execute([':uid' => $userId, ':todayPat' => $todayPat, ':today' => $todayWib]);
    $alreadyClaimedToday = (int)$chkPrfStmt->fetchColumn();

    // 2. Fetch User from MySQL
    $uStmt = $pdo->prepare("SELECT * FROM `users` WHERE `id` = :uid LIMIT 1");
    $uStmt->execute([':uid' => $userId]);
    $userRow = $uStmt->fetch();
    if (!$userRow) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'User tidak ditemukan.']);
        exit();
    }

    if ($alreadyClaimedToday > 0) {
        echo json_encode([
            'success' => false,
            'alreadyClaimed' => true,
            'walletBalance' => (int)$userRow['wallet_balance'],
            'sessionToken' => createSessionToken($userId, currentSessionRole() ?: 'user'),
            'message' => 'Anda sudah mengklaim profit untuk hari ini. Profit berikutnya akan dihitung dalam siklus 24 jam berikutnya.'
        ]);
        exit();
    }

    // 3. Fetch Active Investments
    $iStmt = $pdo->prepare("SELECT * FROM `investments` WHERE `user_id` = :uid AND `status` = 'active'");
    $iStmt->execute([':uid' => $userId]);
    $activeInvs = $iStmt->fetchAll();

    if (!$activeInvs || count($activeInvs) === 0) {
        echo json_encode([
            'success' => false,
            'message' => 'Anda belum memiliki paket investasi aktif. Silakan aktifkan paket terlebih dahulu.'
        ]);
        exit();
    }

    // 4. Shared general settings: weekend toggle (LIBUR vs 7 Hari Penuh) + loss mode
    $isLossMode = false;
    $weekendEnabled = false; // fallback: weekend OFF (preserves historical behavior when unset)
    try {
        $sStmt = $pdo->prepare("SELECT `setting_value` FROM `settings` WHERE `setting_key` = 'general_settings' LIMIT 1");
        $sStmt->execute();
        $sRow = $sStmt ? $sStmt->fetch() : null;
        if ($sRow && !empty($sRow['setting_value'])) {
            $setObj = json_decode($sRow['setting_value'], true);
            if (is_array($setObj)) {
                if (!empty($setObj['todayProfitLossMode']['isLoss'])) {
                    $isLossMode = true;
                }
                if (isset($setObj['weekendProfit']['enabled'])) {
                    $weekendEnabled = (bool)$setObj['weekendProfit']['enabled'];
                } elseif (isset($setObj['weekendProfitEnabled'])) {
                    $weekendEnabled = (bool)$setObj['weekendProfitEnabled'];
                }
            }
        }
    } catch(Exception $eS) {}

    // 5. Weekend market gate — respects the admin weekendProfit toggle:
    //    "LIBUR" blocks Sat/Sun claims; "7 Hari Penuh Aktif" keeps them open.
    $dayOfWeek = (int)date('N'); // 1 (Mon) - 7 (Sun)
    $isWeekend = ($dayOfWeek === 6 || $dayOfWeek === 7);
    if ($isWeekend && !$weekendEnabled) {
        echo json_encode([
            'success' => false,
            'weekendClosed' => true,
            'message' => 'Pasar finansial sedang libur (OFF) di akhir pekan sesuai pengaturan Admin. Klaim profit akan aktif kembali pada hari bursa berikutnya.'
        ]);
        exit();
    }

    $totalClaimable = 0;
    $totalCapital = 0;
    $planNames = [];
    $claimedYieldDates = [];
    $nowDt = date('Y-m-d H:i:s');
    $completedPlans = [];
    $claimResults = [];

    $updInvStmt = $pdo->prepare("
        UPDATE `investments` 
        SET `total_profit_earned` = `total_profit_earned` + :profit,
            `pending_profit_claim` = 0,
            `days_elapsed` = :newDays,
            `last_profit_yield_date` = :nowDt,
            `status` = :status
        WHERE `id` = :id
    ");

    // Load system state to synchronize history records and ensure no pending yields are missed
    $stateDataSnapshot = [];
    try {
        $stSnap = $pdo->query("SELECT `data_json` FROM `autotrading_system_state` WHERE `state_key` = 'main_state' LIMIT 1");
        $rowSnap = $stSnap ? $stSnap->fetch() : null;
        if ($rowSnap && !empty($rowSnap['data_json'])) {
            $stateDataSnapshot = json_decode($rowSnap['data_json'], true) ?: [];
        }
    } catch(Exception $eSnap) {}

    foreach ($activeInvs as $inv) {
        $pending = (int)($inv['pending_profit_claim'] ?? 0);
        $profit = 0;

        // If MySQL table pending is 0, check if history in state data has pending_claim records
        $pendingFromHistory = 0;
        if (!empty($stateDataSnapshot['investments']) && is_array($stateDataSnapshot['investments'])) {
            foreach ($stateDataSnapshot['investments'] as $sInv) {
                if (($sInv['id'] ?? '') === $inv['id'] && !empty($sInv['history']) && is_array($sInv['history'])) {
                    foreach ($sInv['history'] as $hRow) {
                        if (($hRow['status'] ?? '') === 'pending_claim') {
                            $pendingFromHistory += (int)($hRow['amount'] ?? 0);
                        }
                    }
                }
            }
        }

        $effectivePending = max($pending, $pendingFromHistory);
        if ($effectivePending > 0) {
            $profit = $effectivePending;
            $totalCapital += (int)($inv['capital'] ?? 0);
            if (!empty($inv['plan_name'])) {
                $planNames[] = $inv['plan_name'];
            }
            if (!empty($inv['last_profit_yield_date'])) {
                $claimedYieldDates[] = $inv['last_profit_yield_date'];
            }
        } else {
            // Profit trading hari ini sedang berjalan (in progress). Klaim profit harian baru dapat dilakukan besok pada tanggal berikutnya.
            continue;
        }

        $newDays = (int)$inv['days_elapsed'] + 1;
        $duration = (int)($inv['duration_days'] ?? 30);
        $newStatus = ($newDays >= $duration) ? 'completed' : 'active';
        if ($newStatus === 'completed') {
            $completedPlans[] = $inv;
        }

        $updInvStmt->execute([
            ':profit' => $profit,
            ':newDays' => $newDays,
            ':nowDt' => $nowDt,
            ':status' => $newStatus,
            ':id' => $inv['id']
        ]);

        $claimResults[$inv['id']] = [
            'profit' => $profit,
            'days' => $newDays,
            'status' => $newStatus,
            'duration' => $duration
        ];

        $totalClaimable += $profit;
    }

    $profitRate = ($totalCapital > 0) ? round(($totalClaimable / $totalCapital) * 100, 2) : 0;
    $profitRateStr = 'Profit ' . str_replace('.', ',', (string)$profitRate) . '%';
    if (!empty($planNames)) {
        $uniquePlans = array_values(array_unique($planNames));
        if (count($uniquePlans) === 1) {
            $profitRateStr .= ' (' . $uniquePlans[0] . ')';
        }
    }

    $indonesianDays = [
        1 => 'Senin', 2 => 'Selasa', 3 => 'Rabu', 4 => 'Kamis',
        5 => 'Jumat', 6 => 'Sabtu', 7 => 'Minggu'
    ];
    $targetTimestamp = !empty($claimedYieldDates) ? strtotime(end($claimedYieldDates)) : strtotime('-1 day');
    $dayNum = (int)date('N', $targetTimestamp);
    $dayName = $indonesianDays[$dayNum] ?? 'Hari Ini';
    $profitDateFormatted = $dayName . ', ' . date('d/m/Y', $targetTimestamp);

    if ($totalClaimable <= 0 && !$isLossMode) {
        echo json_encode([
            'success' => false,
            'inProgress' => true,
            'walletBalance' => (int)$userRow['wallet_balance'],
            'message' => 'Profit trading hari ini sedang berjalan (in progress). Klaim profit harian baru dapat dilakukan besok pada tanggal berikutnya.'
        ]);
        exit();
    }

    // 5. Update User Balance & Points in MySQL
    $newBalance = (int)$userRow['wallet_balance'] + $totalClaimable;
    $newPoints = (int)($userRow['points'] ?? 0) + 2;
    $upUser = $pdo->prepare("
        UPDATE `users` 
        SET `wallet_balance` = :wb, `points` = :pts, `updated_at` = CURRENT_TIMESTAMP 
        WHERE `id` = :uid
    ");
    $upUser->execute([
        ':wb' => $newBalance,
        ':pts' => $newPoints,
        ':uid' => $userId
    ]);

    // 6. Insert Atomic Transaction
    $txId = 'TRX-PRF-' . random_int(100000, 999999);
    $insTrx = $pdo->prepare("
        INSERT INTO `transactions` (
            `id`, `user_id`, `username`, `type`, `amount`, `net_amount`, `status`,
            `payment_method`, `note`, `created_at`
        ) VALUES (
            :id, :user_id, :username, 'profit_claim', :amount, :net_amount, 'approved',
            'Profit Harian AI', :note, :created_at
        )
    ");
    $note = "Klaim profit harian investasi AI (IDR " . number_format($totalClaimable, 0, ',', '.') . ")";
    $insTrx->execute([
        ':id' => $txId,
        ':user_id' => $userId,
        ':username' => $userRow['username'] ?? '',
        ':amount' => $totalClaimable,
        ':net_amount' => $totalClaimable,
        ':note' => $note,
        ':created_at' => $nowDt
    ]);

    $trxObj = [
        'id' => $txId,
        'userId' => $userId,
        'username' => $userRow['username'] ?? '',
        'type' => 'profit_claim',
        'amount' => $totalClaimable,
        'netAmount' => $totalClaimable,
        'status' => 'approved',
        'paymentMethod' => 'Profit Harian AI',
        'note' => $note,
        'createdAt' => $nowDt
    ];

    // 7. Distribute Rabat (Matching ROI) to uplines L1 - L5 directly in MySQL
    $rabatTrxList = [];
    $rabatUplineAdds = [];
    if (!empty($userRow['referred_by'])) {
        try {
            // Persentase rabat WAJIB mengikuti setting admin di database
            // (dulu hard-code 5/3/1.5 -> laporan transaksi tidak sinkron).
            $rabatLevels = getRabatLevelPercentages($pdo);
            $currRef = trim((string)$userRow['referred_by']);
            $lvl = 1;
            $seen = [$userId => true];
            $uplineStmt = $pdo->prepare("SELECT `id`, `username`, `affiliate_balance`, `referred_by` FROM `users` WHERE UPPER(`referral_code`) = UPPER(:rc) LIMIT 1");
            $updUpline = $pdo->prepare("UPDATE `users` SET `affiliate_balance` = `affiliate_balance` + :amt, `updated_at` = CURRENT_TIMESTAMP WHERE `id` = :uid");
            $insTrxR = $pdo->prepare("
                INSERT INTO `transactions` (
                    `id`, `user_id`, `username`, `type`, `amount`, `net_amount`, `status`,
                    `payment_method`, `note`, `created_at`
                ) VALUES (
                    :id, :user_id, :username, 'rabat_bonus', :amount, :net_amount, 'approved',
                    'Bonus Rabat AI', :note, :created_at
                )
            ");

            while ($currRef !== '' && $lvl <= 5) {
                $uplineStmt->execute([':rc' => $currRef]);
                $upRow = $uplineStmt->fetch();
                if (!$upRow || isset($seen[$upRow['id']])) break;
                $seen[$upRow['id']] = true;

                $pct = $rabatLevels[$lvl] ?? 0;
                if ($pct > 0) {
                    $rAmt = (int)floor(($totalClaimable * $pct) / 100);
                    if ($rAmt > 0) {
                        $updUpline->execute([':amt' => $rAmt, ':uid' => $upRow['id']]);
                        $rTxId = 'TRX-RBT-' . random_int(100000, 999999);
                        $rNote = "Bonus Rabat Level {$lvl} ({$pct}%) dari profit " . ($userRow['username'] ?? '') . " (IDR " . number_format($totalClaimable, 0, ',', '.') . ")";
                        $insTrxR->execute([
                            ':id' => $rTxId,
                            ':user_id' => $upRow['id'],
                            ':username' => $upRow['username'] ?? '',
                            ':amount' => $rAmt,
                            ':net_amount' => $rAmt,
                            ':note' => $rNote,
                            ':created_at' => $nowDt
                        ]);
                        $rabatUplineAdds[$upRow['id']] = ($rabatUplineAdds[$upRow['id']] ?? 0) + $rAmt;
                        $rabatTrxList[] = [
                            'id' => $rTxId,
                            'userId' => $upRow['id'],
                            'username' => $upRow['username'] ?? '',
                            'type' => 'rabat_bonus',
                            'level' => $lvl,
                            'amount' => $rAmt,
                            'netAmount' => $rAmt,
                            'status' => 'approved',
                            'paymentMethod' => 'Bonus Rabat AI',
                            'walletSource' => 'Wallet Tambah Teman',
                            'note' => $rNote,
                            'createdAt' => $nowDt
                        ];
                    }
                }
                $currRef = trim((string)($upRow['referred_by'] ?? ''));
                $lvl++;
            }
        } catch(Exception $eRbt) {}
    }

    // 8. Update JSON State
    try {
        $st = $pdo->query("SELECT `data_json` FROM `autotrading_system_state` WHERE `state_key` = 'main_state' LIMIT 1");
        $rowS = $st ? $st->fetch() : null;
        if ($rowS && !empty($rowS['data_json'])) {
            $stateData = json_decode($rowS['data_json'], true) ?: [];
            if (isset($stateData['users']) && is_array($stateData['users'])) {
                foreach ($stateData['users'] as &$uRef) {
                    if ($uRef['id'] === $userId) {
                        $uRef['walletBalance'] = $newBalance;
                        $uRef['points'] = $newPoints;
                    } elseif (isset($rabatUplineAdds[$uRef['id']])) {
                        $uRef['affiliateBalance'] = (int)($uRef['affiliateBalance'] ?? 0) + $rabatUplineAdds[$uRef['id']];
                    }
                }
                unset($uRef);
            }
            if (isset($stateData['investments']) && is_array($stateData['investments'])) {
                foreach ($stateData['investments'] as &$invRef) {
                    // HANYA paket yang benar-benar diklaim yang boleh naik hari/profitnya.
                    // Dulu semua paket aktif ikut naik +1 hari pada setiap klaim.
                    if (($invRef['userId'] ?? '') !== $userId || !isset($claimResults[$invRef['id'] ?? ''])) continue;
                    $cr = $claimResults[$invRef['id']];
                    $yieldDateRaw = $invRef['lastProfitYieldDate'] ?? null;

                    // Selaraskan baris riwayat yang dibayar dengan nominal yang BENAR-BENAR
                    // dikreditkan. Dulu baris pending bisa berisi nominal berbeda dari
                    // pending_profit_claim (mis. hasil yield admin random vs yield klien),
                    // sehingga persen yang tampil tidak cocok dengan uang yang masuk.
                    $invCapital = (int)($invRef['capital'] ?? 0);
                    $pendingRowsIdx = [];
                    if (isset($invRef['history']) && is_array($invRef['history'])) {
                        foreach ($invRef['history'] as $hi => $hrow) {
                            if (is_array($hrow) && ($hrow['status'] ?? '') === 'pending_claim') $pendingRowsIdx[] = $hi;
                        }
                    }
                    $paidProfit = (int)$cr['profit'];
                    if (!empty($pendingRowsIdx)) {
                        if ($paidProfit <= 0) {
                            // Mode Loss / flat 0%: tidak ada uang masuk, riwayat ikut 0%.
                            foreach ($pendingRowsIdx as $hi) {
                                $invRef['history'][$hi]['amount'] = 0;
                                $invRef['history'][$hi]['rate'] = 0;
                            }
                        } else {
                            $rowsSum = 0;
                            foreach ($pendingRowsIdx as $hi) $rowsSum += (int)($invRef['history'][$hi]['amount'] ?? 0);
                            $diff = $paidProfit - $rowsSum;
                            if ($diff !== 0) {
                                $lastIdx = $pendingRowsIdx[count($pendingRowsIdx) - 1];
                                $invRef['history'][$lastIdx]['amount'] = max(0, (int)($invRef['history'][$lastIdx]['amount'] ?? 0) + $diff);
                            }
                            foreach ($pendingRowsIdx as $hi) {
                                $rowAmt = (int)($invRef['history'][$hi]['amount'] ?? 0);
                                $invRef['history'][$hi]['rate'] = impliedProfitRate($rowAmt, $invCapital);
                            }
                        }
                    } elseif ($paidProfit > 0) {
                        // State belum punya baris pending untuk paket ini: catat baris yang
                        // dibayar agar kartu mingguan memakai rate nyata, bukan rate global.
                        $paidDateIso = normalizeHistoryDate($yieldDateRaw);
                        $invRef['history'] = (isset($invRef['history']) && is_array($invRef['history'])) ? $invRef['history'] : [];
                        $invRef['history'][] = [
                            'day' => (int)$cr['days'],
                            'date' => $paidDateIso ?: date('Y-m-d'),
                            'rate' => impliedProfitRate($paidProfit, $invCapital),
                            'amount' => $paidProfit,
                            'status' => 'claimed',
                            'claimedAt' => $nowDt
                        ];
                    }

                    $invRef['pendingProfitClaim'] = 0;
                    $invRef['lastProfitYieldDate'] = $nowDt;
                    $invRef['daysElapsed'] = max((int)($invRef['daysElapsed'] ?? 0), (int)$cr['days']);
                    $invRef['totalProfitEarned'] = (int)($invRef['totalProfitEarned'] ?? 0) + (int)$cr['profit'];
                    $invRef['status'] = $cr['status'];
                    if ($cr['status'] === 'completed') {
                        $invRef['completedAt'] = $nowDt;
                        $invRef['refundReady'] = true;
                    }
                    if (isset($invRef['history']) && is_array($invRef['history'])) {
                        $normHistory = [];
                        foreach ($invRef['history'] as $h) {
                            if (!is_array($h)) continue;
                            $iso = normalizeHistoryDate($h['date'] ?? ($h['claimedAt'] ?? ''));
                            if (!empty($iso)) $h['date'] = $iso;
                            if (($h['status'] ?? '') === 'pending_claim') {
                                $h['status'] = 'claimed';
                                $h['claimedAt'] = $nowDt;
                            }
                            $normHistory[] = $h;
                        }
                        usort($normHistory, function($a, $b) {
                            return strtotime($a['date'] ?? '1970-01-01') <=> strtotime($b['date'] ?? '1970-01-01');
                        });
                        $seq = 0;
                        foreach ($normHistory as &$h) {
                            $seq++;
                            $h['day'] = min($seq, (int)$cr['duration']);
                        }
                        unset($h);
                        $invRef['history'] = $normHistory;
                    }
                }
                unset($invRef);
            }
            if (!isset($stateData['transactions']) || !is_array($stateData['transactions'])) {
                $stateData['transactions'] = [];
            }
            foreach ($rabatTrxList as $rTx) {
                array_unshift($stateData['transactions'], $rTx);
            }
            array_unshift($stateData['transactions'], $trxObj);
            saveMainState($pdo, $stateData);
        }
    } catch(Exception $eJ) {}

    // Payload investasi terbaru (state sudah diselaraskan dengan MySQL) supaya
    // frontend tidak menebak sendiri sisa hari/profit setelah klaim.
    $updatedInvestments = [];
    if (isset($stateData['investments']) && is_array($stateData['investments'])) {
        foreach ($stateData['investments'] as $invOut) {
            if (($invOut['userId'] ?? '') === $userId) $updatedInvestments[] = $invOut;
        }
    }
    // Fallback: state belum memuat paket ini -> ambil dari MySQL (tanpa history
    // agar merge di frontend tidak menghapus history lokal yang sudah benar).
    if (empty($updatedInvestments)) {
        try {
            $ivq = $pdo->prepare("SELECT * FROM `investments` WHERE `user_id` = :uid");
            $ivq->execute([':uid' => $userId]);
            foreach ($ivq->fetchAll() as $rowI) {
                $updatedInvestments[] = [
                    'id' => $rowI['id'],
                    'userId' => $rowI['user_id'],
                    'planId' => $rowI['plan_id'],
                    'planName' => $rowI['plan_name'],
                    'capital' => (int)$rowI['capital'],
                    'minRate' => (float)$rowI['min_rate'],
                    'maxRate' => (float)$rowI['max_rate'],
                    'totalProfitEarned' => (int)$rowI['total_profit_earned'],
                    'pendingProfitClaim' => (int)$rowI['pending_profit_claim'],
                    'daysElapsed' => (int)$rowI['days_elapsed'],
                    'durationDays' => (int)$rowI['duration_days'],
                    'status' => $rowI['status'],
                    'startDate' => $rowI['start_date'],
                    'lastProfitYieldDate' => $rowI['last_profit_yield_date']
                ];
            }
        } catch (Exception $eIvOut) {}
    }

    echo json_encode([
        'success' => true,
        'amount' => $totalClaimable,
        'walletBalance' => $newBalance,
        'profitRate' => $profitRate,
        'profitPercent' => $profitRateStr,
        'profitDate' => $profitDateFormatted,
        'investments' => $updatedInvestments,
        'planName' => implode(', ', array_unique($planNames)) ?: 'Paket AI Trading',
        'transaction' => $trxObj,
        'sessionToken' => createSessionToken($userId, currentSessionRole() ?: 'user'),
        'message' => 'Berhasil klaim profit harian sebesar IDR ' . number_format($totalClaimable, 0, ',', '.') . ' ke Saldo Utama!'
    ]);
    exit();
}


// 3.12 Action: Authoritative Investment Plan Activation (Server-Side Atomic Balance Check & Execution - BUG-003)
if ($action === 'invest_plan') {
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
    $incomingToken = trim($in['token'] ?? $in['sessionToken'] ?? '');
    if ($incomingToken !== '') {
        $parsedTok = parseSessionToken($incomingToken);
        if ($parsedTok && !empty($parsedTok['uid'])) {
            $_SESSION['uid'] = (string)$parsedTok['uid'];
            $_SESSION['role'] = (string)($parsedTok['role'] ?? 'user');
        }
    }

    requireLogin();
    $sessionUid = currentSessionUserId();
    $sessionRole = currentSessionRole();

    $planId = trim((string)($in['planId'] ?? ''));
    $amount = (int)($in['amount'] ?? 0);

    if (empty($planId) || $amount <= 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Parameter paket investasi dan nominal tidak valid.']);
        exit();
    }

    // 1. Fetch configured investment plans
    $plans = [];
    try {
        $pStmt = $pdo->prepare("SELECT `setting_value` FROM `settings` WHERE `setting_key` = 'platform_plans' LIMIT 1");
        $pStmt->execute();
        $pRow = $pStmt->fetch();
        if ($pRow && !empty($pRow['setting_value'])) {
            $dbPlans = json_decode($pRow['setting_value'], true);
            if (is_array($dbPlans) && count($dbPlans) > 0) $plans = $dbPlans;
        }
    } catch (Exception $eP) {}

    if (empty($plans)) {
        $rawState = readStateJson($pdo, 'autotrading_system_state');
        if (!empty($rawState)) {
            $st = json_decode($rawState, true);
            if (isset($st['plans']) && is_array($st['plans'])) $plans = $st['plans'];
        }
    }

    if (empty($plans)) {
        $plans = [
            ['id' => 'plan-learn', 'name' => 'Learn', 'minDeposit' => 100000, 'maxDeposit' => 1000000, 'minDailyProfit' => 1.2, 'maxDailyProfit' => 2.2, 'durationDays' => 15],
            ['id' => 'plan-rookie', 'name' => 'Rookie', 'minDeposit' => 1000000, 'maxDeposit' => 10000000, 'minDailyProfit' => 2.0, 'maxDailyProfit' => 3.5, 'durationDays' => 30],
            ['id' => 'plan-sophomore', 'name' => 'Sophomore', 'minDeposit' => 10000000, 'maxDeposit' => 50000000, 'minDailyProfit' => 3.5, 'maxDailyProfit' => 5.0, 'durationDays' => 45],
            ['id' => 'plan-vip', 'name' => 'VIP Master', 'minDeposit' => 50000000, 'maxDeposit' => 500000000, 'minDailyProfit' => 5.0, 'maxDailyProfit' => 7.5, 'durationDays' => 60]
        ];
    }

    $targetPlan = null;
    foreach ($plans as $p) {
        if (($p['id'] ?? '') === $planId) {
            $targetPlan = $p;
            break;
        }
    }

    if (!$targetPlan) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Paket investasi tidak valid atau tidak ditemukan.']);
        exit();
    }

    $minDeposit = (int)($targetPlan['minDeposit'] ?? 100000);
    $maxDeposit = (int)($targetPlan['maxDeposit'] ?? 0);
    if ($amount < $minDeposit) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => "Nominal investasi minimal Rp " . number_format($minDeposit, 0, ',', '.')]);
        exit();
    }
    if ($maxDeposit > 0 && $amount > $maxDeposit) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => "Nominal investasi maksimal Rp " . number_format($maxDeposit, 0, ',', '.')]);
        exit();
    }

    // 2. Atomic Database Transaction with Row Lock
    $pdo->beginTransaction();
    try {
        $uStmt = $pdo->prepare("SELECT `id`, `username`, `wallet_balance`, `points`, `referred_by`, `status`, `is_blocked` FROM `users` WHERE `id` = :uid FOR UPDATE");
        $uStmt->execute([':uid' => $sessionUid]);
        $user = $uStmt->fetch();

        if (!$user || !empty($user['is_blocked']) || ($user['status'] ?? '') === 'blocked') {
            $pdo->rollBack();
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Akun tidak valid atau terblokir.']);
            exit();
        }

        $currentBalance = (int)$user['wallet_balance'];
        if ($currentBalance < $amount) {
            $pdo->rollBack();
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'message' => 'Saldo dompet tidak mencukupi! Anda memiliki Rp ' . number_format($currentBalance, 0, ',', '.') . ', butuh Rp ' . number_format($amount, 0, ',', '.')
            ]);
            exit();
        }

        // Deduct balance and increment loyalty points
        $newBalance = $currentBalance - $amount;
        $newPoints = (int)$user['points'] + 50;
        $updUser = $pdo->prepare("UPDATE `users` SET `wallet_balance` = :bal, `points` = :pts WHERE `id` = :uid");
        $updUser->execute([':bal' => $newBalance, ':pts' => $newPoints, ':uid' => $sessionUid]);

        // Insert new active investment record
        $invId = 'inv-' . (time() * 1000 + mt_rand(10, 99));
        $minRate = (float)($targetPlan['minDailyProfit'] ?? $targetPlan['minRate'] ?? 1.0);
        $maxRate = (float)($targetPlan['maxDailyProfit'] ?? $targetPlan['maxRate'] ?? 1.5);
        $durationDays = (int)($targetPlan['durationDays'] ?? 30);
        $now = date('Y-m-d H:i:s');

        $insInv = $pdo->prepare("INSERT INTO `investments`
            (`id`, `user_id`, `plan_id`, `plan_name`, `capital`, `min_rate`, `max_rate`, `total_profit_earned`, `pending_profit_claim`, `days_elapsed`, `duration_days`, `status`, `start_date`, `last_profit_yield_date`, `created_at`)
            VALUES (:id, :uid, :pid, :pname, :cap, :min_r, :max_r, 0, 0, 0, :dur, 'active', :sdate, :ldate, :cdate)");
        $insInv->execute([
            ':id' => $invId,
            ':uid' => $sessionUid,
            ':pid' => $targetPlan['id'],
            ':pname' => $targetPlan['name'],
            ':cap' => $amount,
            ':min_r' => $minRate,
            ':max_r' => $maxRate,
            ':dur' => $durationDays,
            ':sdate' => $now,
            ':ldate' => $now,
            ':cdate' => $now
        ]);

        // Record investment transaction
        $trxId = 'TRX-INV-' . mt_rand(100000, 999999);
        $insTrx = $pdo->prepare("INSERT INTO `transactions`
            (`id`, `user_id`, `username`, `type`, `amount`, `net_amount`, `status`, `payment_method`, `note`, `created_at`)
            VALUES (:id, :uid, :uname, 'invest_plan', :amt, :net_amt, 'approved', :pname, :note, :cdate)");
        $insTrx->execute([
            ':id' => $trxId,
            ':uid' => $sessionUid,
            ':uname' => $user['username'],
            ':amt' => $amount,
            ':net_amt' => $amount,
            ':pname' => $targetPlan['name'],
            ':note' => "Aktivasi paket investasi {$targetPlan['name']} ({$durationDays} hari)",
            ':cdate' => $now
        ]);

        // Distribute direct sponsor bonus to upline if applicable
        $referredBy = trim((string)($user['referred_by'] ?? ''));
        $sponsorAmount = 0;
        $uplineId = null;
        $uplineUsername = '';
        if ($referredBy !== '') {
            $sponsorPercent = 10;
            try {
                $sStmt = $pdo->prepare("SELECT `setting_value` FROM `settings` WHERE `setting_key` = 'general_settings' LIMIT 1");
                $sStmt->execute();
                $sRow = $sStmt->fetch();
                if ($sRow && !empty($sRow['setting_value'])) {
                    $cfg = json_decode($sRow['setting_value'], true);
                    if (isset($cfg['sponsorBonusPercent'])) $sponsorPercent = (float)$cfg['sponsorBonusPercent'];
                }
            } catch (Exception $eSps) {}

            $sponsorAmount = (int)floor($amount * ($sponsorPercent / 100));
            if ($sponsorAmount > 0) {
                $upStmt = $pdo->prepare("SELECT `id`, `username`, `affiliate_balance` FROM `users` WHERE `referral_code` = :ref1 OR `username` = :ref2 LIMIT 1 FOR UPDATE");
                $upStmt->execute([':ref1' => $referredBy, ':ref2' => $referredBy]);
                $upline = $upStmt->fetch();
                if ($upline) {
                    $uplineId = $upline['id'];
                    $uplineUsername = $upline['username'];
                    $newAffBal = (int)$upline['affiliate_balance'] + $sponsorAmount;
                    $upUpd = $pdo->prepare("UPDATE `users` SET `affiliate_balance` = :aff WHERE `id` = :uid");
                    $upUpd->execute([':aff' => $newAffBal, ':uid' => $uplineId]);

                    $spsTrxId = 'TRX-SPS-' . mt_rand(100000, 999999);
                    $insSps = $pdo->prepare("INSERT INTO `transactions`
                        (`id`, `user_id`, `username`, `type`, `amount`, `net_amount`, `status`, `payment_method`, `note`, `created_at`)
                        VALUES (:id, :uid, :uname, 'sponsor_bonus', :amt, :net_amt, 'approved', 'Bonus Kemitraan', :note, :cdate)");
                    $insSps->execute([
                        ':id' => $spsTrxId,
                        ':uid' => $uplineId,
                        ':uname' => $uplineUsername,
                        ':amt' => $sponsorAmount,
                        ':net_amt' => $sponsorAmount,
                        ':note' => "Bonus sponsor {$sponsorPercent}% dari member {$user['username']} (Paket {$targetPlan['name']})",
                        ':cdate' => $now
                    ]);
                }
            }
        }

        // Synchronize with main_state JSON blob
        $rawState = readStateJson($pdo, 'autotrading_system_state');
        if (!empty($rawState)) {
            $stateData = json_decode($rawState, true);
            if (is_array($stateData)) {
                if (isset($stateData['users']) && is_array($stateData['users'])) {
                    foreach ($stateData['users'] as &$su) {
                        if (($su['id'] ?? '') === $sessionUid) {
                            $su['walletBalance'] = $newBalance;
                            $su['points'] = $newPoints;
                        } elseif ($uplineId && ($su['id'] ?? '') === $uplineId) {
                            $su['affiliateBalance'] = (int)($su['affiliateBalance'] ?? 0) + $sponsorAmount;
                        }
                    }
                    unset($su);
                }

                // Deterministic initial day 1 yield in progress.
                // Rate WAJIB memakai rumus bersama (deterministicProfitRate) supaya
                // nominal yang tersimpan = modal x rate yang ditampilkan di dashboard
                // member dan di kartu mingguan.
                $day1Rate = deterministicProfitRate($invId, $minRate, $maxRate, date('Y-m-d'));
                $day1Profit = profitAmountFromRate($amount, $day1Rate);

                $newInvObj = [
                    'id' => $invId,
                    'userId' => $sessionUid,
                    'planId' => $targetPlan['id'],
                    'planName' => $targetPlan['name'],
                    'capital' => $amount,
                    'minRate' => $minRate,
                    'maxRate' => $maxRate,
                    'minDailyProfit' => $minRate,
                    'maxDailyProfit' => $maxRate,
                    'totalProfitEarned' => 0,
                    'pendingProfitClaim' => 0,
                    'daysElapsed' => 0,
                    'durationDays' => $durationDays,
                    'capitalReturned' => false,
                    'status' => 'active',
                    'startDate' => $now,
                    'lastProfitYieldDate' => $now,
                    'createdAt' => $now,
                    'history' => [
                        [
                            'day' => 1,
                            'date' => date('d/m/Y'),
                            'rate' => $day1Rate,
                            'amount' => $day1Profit,
                            'status' => 'in_progress'
                        ]
                    ]
                ];
                $stateData['investments'] = $stateData['investments'] ?? [];
                $stateData['investments'][] = $newInvObj;

                $newTrxObj = [
                    'id' => $trxId,
                    'userId' => $sessionUid,
                    'username' => $user['username'],
                    'type' => 'invest_plan',
                    'planName' => $targetPlan['name'],
                    'amount' => $amount,
                    'netAmount' => $amount,
                    'status' => 'approved',
                    'paymentMethod' => $targetPlan['name'],
                    'note' => "Aktivasi paket investasi {$targetPlan['name']} ({$durationDays} hari)",
                    'createdAt' => $now
                ];
                $stateData['transactions'] = $stateData['transactions'] ?? [];
                array_unshift($stateData['transactions'], $newTrxObj);

                if ($uplineId && !empty($spsTrxId)) {
                    $newSpsTrxObj = [
                        'id' => $spsTrxId,
                        'userId' => $uplineId,
                        'username' => $uplineUsername,
                        'type' => 'sponsor_bonus',
                        'amount' => $sponsorAmount,
                        'netAmount' => $sponsorAmount,
                        'status' => 'approved',
                        'paymentMethod' => 'Bonus Kemitraan',
                        'note' => "Bonus sponsor {$sponsorPercent}% dari member {$user['username']} (Paket {$targetPlan['name']})",
                        'createdAt' => $now
                    ];
                    array_unshift($stateData['transactions'], $newSpsTrxObj);
                }

                saveMainState($pdo, $stateData);
            }
        }

        $pdo->commit();

        echo json_encode([
            'success' => true,
            'message' => "Sukses mengaktifkan paket {$targetPlan['name']} sebesar Rp " . number_format($amount, 0, ',', '.') . "!",
            'newBalance' => $newBalance,
            'walletBalance' => $newBalance,
            'newPoints' => $newPoints,
            'points' => $newPoints,
            'investment' => $newInvObj,
            'transaction' => $newTrxObj
        ]);
        exit();
    } catch (Throwable $eInv) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Gagal memproses investasi: ' . $eInv->getMessage()]);
        exit();
    }
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
    $city = trim($uData['city'] ?? '');
    $password = $uData['password'] ?? $uData['password_hash'] ?? '';
    $referralCode = trim($uData['referralCode'] ?? $uData['referral_code'] ?? '');
    $referredBy = trim($uData['referredBy'] ?? $uData['referred_by'] ?? '') ?: null;

    if (empty($username) || empty($email) || empty($password)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Username, Email, dan Password wajib diisi!']);
        exit();
    }

    // SECURITY: whitelist karakter username. Tanpa validasi ini username seperti
    // <img src=x onerror=...> bisa tersimpan dan dieksekusi di panel admin
    // (stored XSS yang berujung pengambilalihan sesi administrator).
    if (!preg_match('/^[a-z0-9._-]{3,20}$/', $username)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Username hanya boleh berisi huruf kecil, angka, titik, garis bawah, atau strip (3-20 karakter).']);
        exit();
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Format alamat email tidak valid!']);
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

    // Reject HTML/script injection in display name & city at the source
    if (preg_match('/[<>]/', $fullName) || preg_match('/[<>]/', $city)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Nama lengkap / kota tidak boleh mengandung karakter khusus (< atau >).']);
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
        ) VALUES (
            :id, :username, :password_hash, :full_name, :email, :phone, :city,
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
        ':city' => $city,
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
        'city' => $city,
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
    $regToken = null;
    if (!$verifyRequired) {
        $_SESSION['uid'] = $userId;
        $_SESSION['role'] = 'user';
        $_SESSION['username'] = $username;
        $regToken = createSessionToken($userId, 'user');
    }

    $respUser = $newUserObj;
    stripUserSecrets($respUser);

    // Get live authoritative leaderboard & public transactions so new member area is immediately complete from MySQL
    $regLeaderboard = ['topProfits' => [], 'topSponsors' => []];
    $regRecentDeposits = [];
    $regRecentWithdrawals = [];
    $regRecentTransactions = [];
    try {
        $allUsersReg = $pdo->query("SELECT * FROM `users`")->fetchAll() ?: [];
        $allInvsReg = $pdo->query("SELECT * FROM `investments`")->fetchAll() ?: [];
        $allTxsReg = $pdo->query("SELECT * FROM `transactions`")->fetchAll() ?: [];
        $regLeaderboard = getPlatformLeaderboard($allUsersReg, $allInvsReg, $allTxsReg);

        $stRegDep = $pdo->query("SELECT `id`, `user_id`, `username`, `type`, `amount`, `payment_method`, `destination_account`, `status`, `created_at` FROM `transactions` WHERE `status` = 'approved' AND `type` = 'deposit' ORDER BY `created_at` DESC LIMIT 30");
        $rawRegDep = $stRegDep ? $stRegDep->fetchAll() : [];
        $stRegWd = $pdo->query("SELECT `id`, `user_id`, `username`, `type`, `amount`, `payment_method`, `destination_account`, `status`, `created_at` FROM `transactions` WHERE `status` = 'approved' AND `type` = 'withdraw' ORDER BY `created_at` DESC LIMIT 30");
        $rawRegWd = $stRegWd ? $stRegWd->fetchAll() : [];

        foreach ($rawRegDep as $pt) {
            $rawU = $pt['username'] ?? 'Member';
            $maskedU = (strlen($rawU) > 3) ? substr($rawU, 0, 3) . '***' : $rawU . '***';
            $rawMethod = $pt['payment_method'] ?? 'Transfer Bank BCA';
            $cleanMethod = maskAccountForPrivacy(cleanPaymentMethodStr($rawMethod));
            $regRecentDeposits[] = [
                'id' => $pt['id'] ?? '',
                'username' => $maskedU,
                'type' => 'deposit',
                'amount' => (int)($pt['amount'] ?? 0),
                'paymentMethod' => $cleanMethod,
                'destinationAccount' => $cleanMethod,
                'status' => 'approved',
                'createdAt' => $pt['created_at'] ?? date('c')
            ];
        }

        foreach ($rawRegWd as $pt) {
            $rawU = $pt['username'] ?? 'Member';
            $maskedU = (strlen($rawU) > 3) ? substr($rawU, 0, 3) . '***' : $rawU . '***';
            $rawMethod = $pt['payment_method'] ?? $pt['destination_account'] ?? 'Bank BCA';
            $cleanMethod = maskAccountForPrivacy(cleanPaymentMethodStr($rawMethod));
            $regRecentWithdrawals[] = [
                'id' => $pt['id'] ?? '',
                'username' => $maskedU,
                'type' => 'withdraw',
                'amount' => (int)($pt['amount'] ?? 0),
                'paymentMethod' => $cleanMethod,
                'destinationAccount' => $cleanMethod,
                'status' => 'approved',
                'createdAt' => $pt['created_at'] ?? date('c')
            ];
        }
        $regRecentTransactions = array_merge($regRecentDeposits, $regRecentWithdrawals);
        usort($regRecentTransactions, function($a, $b) {
            return strcmp($b['createdAt'], $a['createdAt']);
        });
    } catch (Exception $eRegData) {}

    echo json_encode([
        'success' => true,
        'user' => $respUser,
        'sessionToken' => $regToken,
        'requiresVerification' => $verifyRequired,
        'leaderboard' => $regLeaderboard,
        'publicRecentDeposits' => $regRecentDeposits,
        'publicRecentWithdrawals' => $regRecentWithdrawals,
        'publicRecentTransactions' => $regRecentTransactions,
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

    // Protect relational financial integrity and prevent orphan records (BUG-007)
    $hasHistory = false;
    try {
        $stTrx = $pdo->prepare("SELECT COUNT(*) FROM `transactions` WHERE `user_id` = :id");
        $stTrx->execute([':id' => $userId]);
        $trxCount = (int)$stTrx->fetchColumn();

        $stInv = $pdo->prepare("SELECT COUNT(*) FROM `investments` WHERE `user_id` = :id");
        $stInv->execute([':id' => $userId]);
        $invCount = (int)$stInv->fetchColumn();

        if ($trxCount > 0 || $invCount > 0) {
            $hasHistory = true;
        }
    } catch (Exception $eCheck) {}

    if ($hasHistory) {
        // Soft delete: keep financial ledger audit trail intact
        $updUser = $pdo->prepare("UPDATE `users` SET `status` = 'deleted', `is_blocked` = 1, `updated_at` = CURRENT_TIMESTAMP WHERE `id` = :id");
        $updUser->execute([':id' => $userId]);

        try {
            $st = $pdo->query("SELECT `data_json` FROM `autotrading_system_state` WHERE `state_key` = 'main_state' LIMIT 1");
            $row = $st->fetch();
            if ($row && !empty($row['data_json'])) {
                $sData = json_decode($row['data_json'], true);
                if (is_array($sData) && isset($sData['users']) && is_array($sData['users'])) {
                    foreach ($sData['users'] as &$u) {
                        if (($u['id'] ?? '') === $userId) {
                            $u['status'] = 'deleted';
                            $u['isBlocked'] = true;
                            $u['deletedAt'] = date('c');
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
            'isSoftDeleted' => true,
            'message' => 'User memiliki riwayat transaksi/investasi keuangan. Status dialihkan ke dinonaktifkan (soft delete) demi integritas audit.'
        ]);
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

// --- action=admin_update_user (admin only) -----------------------------------
if ($action === 'admin_update_user') {
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
    $userId = trim((string)($in['userId'] ?? $in['user_id'] ?? $in['id'] ?? ''));

    if ($userId === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'User ID wajib diisi.']);
        exit();
    }

    $uStmt = $pdo->prepare("SELECT * FROM `users` WHERE `id` = :id LIMIT 1");
    $uStmt->execute([':id' => $userId]);
    $curr = $uStmt->fetch();
    if (!$curr) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Data pengguna tidak ditemukan di database.']);
        exit();
    }

    $newWallet = isset($in['walletBalance']) ? (int)$in['walletBalance'] : (isset($in['wallet_balance']) ? (int)$in['wallet_balance'] : (int)$curr['wallet_balance']);
    $newAffiliate = isset($in['affiliateBalance']) ? (int)$in['affiliateBalance'] : (isset($in['affiliate_balance']) ? (int)$in['affiliate_balance'] : (int)$curr['affiliate_balance']);
    $newPoints = isset($in['points']) ? (int)$in['points'] : (int)$curr['points'];
    $newFullName = isset($in['fullName']) ? trim((string)$in['fullName']) : (isset($in['full_name']) ? trim((string)$in['full_name']) : (string)$curr['full_name']);
    $newEmail = isset($in['email']) ? trim((string)$in['email']) : (string)$curr['email'];
    $newPhone = isset($in['phone']) ? trim((string)$in['phone']) : (string)$curr['phone'];
    $newCity = isset($in['city']) ? trim((string)$in['city']) : (string)$curr['city'];
    $newRole = isset($in['role']) ? (($in['role'] === 'admin') ? 'admin' : 'user') : (string)$curr['role'];
    $newUpline = isset($in['referredBy']) ? trim((string)$in['referredBy']) : (isset($in['referred_by']) ? trim((string)$in['referred_by']) : (string)($curr['referred_by'] ?? ''));

    $isBlocked = isset($in['isBlocked']) ? (!empty($in['isBlocked']) ? 1 : 0) : (isset($in['is_blocked']) ? (!empty($in['is_blocked']) ? 1 : 0) : (int)$curr['is_blocked']);
    if (isset($in['status']) && $in['status'] === 'blocked') $isBlocked = 1;
    $status = $isBlocked ? 'blocked' : (isset($in['status']) && in_array($in['status'], ['active', 'pending'], true) ? $in['status'] : 'active');
    $blockedReason = isset($in['blockedReason']) ? trim((string)$in['blockedReason']) : (isset($in['blocked_reason']) ? trim((string)$in['blocked_reason']) : (string)($curr['blocked_reason'] ?? ''));

    $bankName = $curr['bank_name'] ?? '';
    $accountNumber = $curr['account_number'] ?? '';
    $accountHolder = $curr['account_holder'] ?? '';
    if (isset($in['bankAccount']) && is_array($in['bankAccount'])) {
        if (isset($in['bankAccount']['bankName'])) $bankName = trim((string)$in['bankAccount']['bankName']);
        if (isset($in['bankAccount']['accountNumber'])) $accountNumber = trim((string)$in['bankAccount']['accountNumber']);
        if (isset($in['bankAccount']['accountHolder'])) $accountHolder = trim((string)$in['bankAccount']['accountHolder']);
    } else {
        if (isset($in['bankName'])) $bankName = trim((string)$in['bankName']);
        if (isset($in['accountNumber'])) $accountNumber = trim((string)$in['accountNumber']);
        if (isset($in['accountHolder'])) $accountHolder = trim((string)$in['accountHolder']);
    }

    $oldWallet = (int)$curr['wallet_balance'];
    $oldAffiliate = (int)$curr['affiliate_balance'];
    $note = trim((string)($in['adjustmentNote'] ?? $in['note'] ?? ''));

    if ($newWallet !== $oldWallet) {
        $diffW = $newWallet - $oldWallet;
        $trxIdW = 'TRX-ADJ-' . random_int(100000, 999999);
        $wType = $diffW > 0 ? 'bonus' : 'fee';
        $wNote = $note !== '' ? $note : ($diffW > 0 ? 'Penambahan Saldo Utama oleh Administrator' : 'Pengurangan Saldo Utama oleh Administrator');
        try {
            $tStmt = $pdo->prepare("
                INSERT INTO `transactions` (`id`, `user_id`, `username`, `type`, `amount`, `status`, `payment_method`, `note`, `created_at`)
                VALUES (:id, :uid, :uname, :type, :amt, 'approved', 'Penyesuaian Admin', :note, NOW())
            ");
            $tStmt->execute([
                ':id' => $trxIdW,
                ':uid' => $userId,
                ':uname' => (string)$curr['username'],
                ':type' => $wType,
                ':amt' => abs($diffW),
                ':note' => $wNote
            ]);
        } catch (Exception $eTxW) {}
    }

    if ($newAffiliate !== $oldAffiliate) {
        $diffA = $newAffiliate - $oldAffiliate;
        $trxIdA = 'TRX-ADJ-' . random_int(100000, 999999);
        $aType = $diffA > 0 ? 'bonus' : 'fee';
        $aNote = $note !== '' ? $note : ($diffA > 0 ? 'Penambahan Saldo Komisi oleh Administrator' : 'Pengurangan Saldo Komisi oleh Administrator');
        try {
            $tStmt = $pdo->prepare("
                INSERT INTO `transactions` (`id`, `user_id`, `username`, `type`, `amount`, `status`, `payment_method`, `note`, `created_at`)
                VALUES (:id, :uid, :uname, :type, :amt, 'approved', 'Penyesuaian Admin', :note, NOW())
            ");
            $tStmt->execute([
                ':id' => $trxIdA,
                ':uid' => $userId,
                ':uname' => (string)$curr['username'],
                ':type' => $aType,
                ':amt' => abs($diffA),
                ':note' => $aNote
            ]);
        } catch (Exception $eTxA) {}
    }

    $updUser = $pdo->prepare("
        UPDATE `users` SET
            `wallet_balance` = :wb,
            `affiliate_balance` = :ab,
            `points` = :pts,
            `full_name` = :fn,
            `email` = :em,
            `phone` = :ph,
            `city` = :ct,
            `role` = :rl,
            `status` = :st,
            `is_blocked` = :ib,
            `blocked_reason` = :br,
            `blocked_at` = :ba,
            `bank_name` = :bn,
            `account_number` = :an,
            `account_holder` = :ah,
            `referred_by` = :ref,
            `updated_at` = CURRENT_TIMESTAMP
        WHERE `id` = :id
    ");
    $updUser->execute([
        ':wb' => $newWallet,
        ':ab' => $newAffiliate,
        ':pts' => $newPoints,
        ':fn' => $newFullName,
        ':em' => $newEmail,
        ':ph' => $newPhone,
        ':ct' => $newCity,
        ':rl' => $newRole,
        ':st' => $status,
        ':ib' => $isBlocked,
        ':br' => $isBlocked ? $blockedReason : null,
        ':ba' => $isBlocked ? date('Y-m-d H:i:s') : null,
        ':bn' => $bankName,
        ':an' => $accountNumber,
        ':ah' => $accountHolder,
        ':ref' => $newUpline !== '' ? $newUpline : null,
        ':id' => $userId
    ]);

    try {
        $stData = loadMainState($pdo);
        if (is_array($stData) && isset($stData['users']) && is_array($stData['users'])) {
            foreach ($stData['users'] as &$u) {
                if (($u['id'] ?? '') === $userId) {
                    $u['walletBalance'] = $newWallet;
                    $u['affiliateBalance'] = $newAffiliate;
                    $u['points'] = $newPoints;
                    $u['fullName'] = $newFullName;
                    $u['email'] = $newEmail;
                    $u['phone'] = $newPhone;
                    $u['city'] = $newCity;
                    $u['role'] = $newRole;
                    $u['status'] = $status;
                    $u['isBlocked'] = (bool)$isBlocked;
                    $u['blockedReason'] = $isBlocked ? $blockedReason : '';
                    if ($isBlocked) $u['blockedAt'] = date('c');
                    $u['bankAccount'] = [
                        'bankName' => $bankName,
                        'accountNumber' => $accountNumber,
                        'accountHolder' => $accountHolder
                    ];
                    if ($newUpline !== '') $u['referredBy'] = $newUpline;
                    break;
                }
            }
            unset($u);

            if (!isset($stData['transactions']) || !is_array($stData['transactions'])) {
                $stData['transactions'] = [];
            }
            if (isset($trxIdW)) {
                array_unshift($stData['transactions'], [
                    'id' => $trxIdW,
                    'userId' => $userId,
                    'username' => (string)$curr['username'],
                    'type' => $wType,
                    'amount' => abs($diffW),
                    'status' => 'approved',
                    'paymentMethod' => 'Penyesuaian Admin',
                    'note' => $wNote,
                    'createdAt' => date('c')
                ]);
            }
            if (isset($trxIdA)) {
                array_unshift($stData['transactions'], [
                    'id' => $trxIdA,
                    'userId' => $userId,
                    'username' => (string)$curr['username'],
                    'type' => $aType,
                    'amount' => abs($diffA),
                    'status' => 'approved',
                    'paymentMethod' => 'Penyesuaian Admin',
                    'note' => $aNote,
                    'createdAt' => date('c')
                ]);
            }

            saveMainState($pdo, $stData);
        }
    } catch (Exception $eJson) {}

    echo json_encode([
        'success' => true,
        'message' => 'Data dan saldo pengguna @' . $curr['username'] . ' berhasil diperbarui di database!',
        'user' => [
            'id' => $userId,
            'username' => $curr['username'],
            'fullName' => $newFullName,
            'email' => $newEmail,
            'phone' => $newPhone,
            'city' => $newCity,
            'walletBalance' => $newWallet,
            'affiliateBalance' => $newAffiliate,
            'points' => $newPoints,
            'role' => $newRole,
            'status' => $status,
            'isBlocked' => (bool)$isBlocked,
            'bankAccount' => [
                'bankName' => $bankName,
                'accountNumber' => $accountNumber,
                'accountHolder' => $accountHolder
            ]
        ]
    ]);
    exit();
}

// --- action=admin_save_settings (admin only) ---------------------------------
if ($action === 'admin_save_settings') {
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
    $newSettings = isset($in['settings']) && is_array($in['settings']) ? $in['settings'] : $in;

    if (!is_array($newSettings) || count($newSettings) === 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Data pengaturan tidak valid.']);
        exit();
    }

    // Auto-convert any base64 logo or favicon into file saved in /uploads/
    if (!empty($newSettings['webSettings']['logoUrl']) && is_string($newSettings['webSettings']['logoUrl']) && strpos($newSettings['webSettings']['logoUrl'], 'data:image') === 0) {
        $newSettings['webSettings']['logoUrl'] = saveBase64ImageFile($newSettings['webSettings']['logoUrl'], 'logo_' . time());
    }
    if (!empty($newSettings['webSettings']['faviconUrl']) && is_string($newSettings['webSettings']['faviconUrl']) && strpos($newSettings['webSettings']['faviconUrl'], 'data:image') === 0) {
        $newSettings['webSettings']['faviconUrl'] = saveBase64ImageFile($newSettings['webSettings']['faviconUrl'], 'favicon_' . time());
    }

    $currentSettings = [];
    try {
        $sStmt = $pdo->prepare("SELECT `setting_value` FROM `settings` WHERE `setting_key` = 'general_settings' LIMIT 1");
        $sStmt->execute();
        $sRow = $sStmt->fetch();
        if ($sRow && !empty($sRow['setting_value'])) {
            $parsedS = json_decode($sRow['setting_value'], true);
            if (is_array($parsedS)) $currentSettings = $parsedS;
        }
    } catch (Exception $eS1) {}

    $mergedSettings = mergeSettingsData($currentSettings, $newSettings);

    $setStmt = $pdo->prepare("
        INSERT INTO `settings` (`setting_key`, `setting_value`, `description`)
        VALUES ('general_settings', :sv, 'Platform global settings, withdraw rules, and commission rates')
        ON DUPLICATE KEY UPDATE `setting_value` = VALUES(`setting_value`), `updated_at` = CURRENT_TIMESTAMP
    ");
    $setStmt->execute([':sv' => json_encode($mergedSettings, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)]);

    try {
        $stData = loadMainState($pdo);
        // NEVER re-persist an unreadable/empty state: doing so would replace the whole
        // state JSON with this single section and silently drop every other admin edit.
        if (is_array($stData) && count($stData) > 0) {
            $stData['settings'] = mergeSettingsData($stData['settings'] ?? [], $mergedSettings);
            saveMainState($pdo, $stData);
        }
    } catch (Exception $eS2) {}

    echo json_encode([
        'success' => true,
        'message' => 'Pengaturan web berhasil disimpan ke database MySQL cPanel dan disinkronkan ke seluruh sistem!',
        'settings' => $mergedSettings
    ]);
    exit();
}

// --- action=admin_sync_integrity (admin only) ------------------------------
// Menyelaraskan data absensi, hari/profit investasi, dan rabat seluruh member
// dengan ledger MySQL + setting admin. Idempoten (aman dijalankan berulang).
if ($action === 'admin_sync_integrity') {
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
    try {
        $syncSummary = reconcilePlatformIntegrity($pdo);
        echo json_encode([
            'success' => true,
            'summary' => $syncSummary,
            'message' => 'Sinkronisasi selesai. Absensi diperbaiki: ' . $syncSummary['checkins'] . ', investasi: ' . $syncSummary['investments'] . ', rabat: ' . $syncSummary['rabat'] . '.'
        ]);
    } catch (Exception $eSync) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Gagal sinkronisasi: ' . $eSync->getMessage()]);
    }
    exit();
}

// --- action=admin_save_plans (admin only) ---------------------------------
// --- action=lookup_member (session member, P2P transfer target check) -------
// Members only receive a limited roster (self + downline) from action=get for
// privacy, so P2P transfers to arbitrary friends need a minimal server lookup.
if ($action === 'lookup_member') {
    requireLogin();
    if (!$pdo) {
        http_response_code(503);
        echo json_encode(['success' => false, 'message' => 'Database belum terhubung.']);
        exit();
    }
    ensureTablesExist($pdo);

    $reqTarget = isset($_GET['target']) ? trim((string)$_GET['target']) : '';
    if ($reqTarget === '') {
        $lmIn = json_decode(file_get_contents('php://input'), true);
        $reqTarget = trim((string)($lmIn['target'] ?? ''));
    }
    if ($reqTarget === '') {
        echo json_encode(['success' => true, 'found' => false]);
        exit();
    }

    $lStmt = $pdo->prepare("SELECT `id`, `username`, `full_name`, `referral_code` FROM `users` WHERE LOWER(`username`) = :uname OR LOWER(`referral_code`) = :refcode LIMIT 1");
    $lStmt->execute([':uname' => strtolower($reqTarget), ':refcode' => strtolower($reqTarget)]);
    $lRow = $lStmt->fetch();

    if (!$lRow) {
        echo json_encode(['success' => true, 'found' => false]);
        exit();
    }

    // Minimal payload only — no balance, email, or phone for other accounts.
    echo json_encode([
        'success' => true,
        'found' => true,
        'user' => [
            'id' => $lRow['id'],
            'username' => $lRow['username'],
            'fullName' => $lRow['full_name'] ?: $lRow['username'],
            'referralCode' => $lRow['referral_code'] ?: ''
        ]
    ]);
    exit();
}

// --- action=transfer_to_member (session member, P2P wallet transfer) --------
// Server-authoritative debit/credit: the member roster in action=get no longer
// contains arbitrary users, so the old client-side transfer could not find the
// recipient. Balances move in the MySQL users table inside one transaction and
// both ledger rows (debit + credit) are written to transactions + state.
if ($action === 'transfer_to_member') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Method not allowed. Use POST.']);
        exit();
    }
    requireLogin();
    $sessionUid = currentSessionUserId();
    if (!$pdo) {
        http_response_code(503);
        echo json_encode(['success' => false, 'message' => 'Database MySQL cPanel belum terhubung.']);
        exit();
    }
    ensureTablesExist($pdo);

    $traw = file_get_contents('php://input');
    $tin = json_decode($traw, true) ?: [];
    $ttarget = trim((string)($tin['target'] ?? ''));
    $tamount = (int)floor((float)($tin['amount'] ?? 0));

    if ($tamount < 10000) {
        echo json_encode(['success' => false, 'message' => 'Minimal transfer antar member adalah Rp 10.000!']);
        exit();
    }
    if ($ttarget === '') {
        echo json_encode(['success' => false, 'message' => 'Masukkan username atau kode referral member tujuan!']);
        exit();
    }

    $tsStmt = $pdo->prepare("SELECT `id`, `username`, `full_name`, `wallet_balance`, `status`, `is_blocked` FROM `users` WHERE `id` = :uid LIMIT 1");
    $tsStmt->execute([':uid' => $sessionUid]);
    $tsender = $tsStmt->fetch();
    if (!$tsender) {
        echo json_encode(['success' => false, 'message' => 'Akun pengirim tidak ditemukan!']);
        exit();
    }
    if (!empty($tsender['is_blocked']) || ($tsender['status'] ?? '') === 'blocked') {
        echo json_encode(['success' => false, 'message' => 'Akun Anda dinonaktifkan. Hubungi admin untuk melakukan transfer.']);
        exit();
    }

    $trStmt = $pdo->prepare("SELECT `id`, `username`, `full_name`, `wallet_balance`, `status`, `is_blocked` FROM `users` WHERE LOWER(`username`) = :uname OR LOWER(`referral_code`) = :refcode LIMIT 1");
    $trStmt->execute([':uname' => strtolower($ttarget), ':refcode' => strtolower($ttarget)]);
    $trecipient = $trStmt->fetch();
    if (!$trecipient) {
        echo json_encode(['success' => false, 'message' => 'Member tujuan "' . $ttarget . '" tidak ditemukan!']);
        exit();
    }
    if ($trecipient['id'] === $tsender['id']) {
        echo json_encode(['success' => false, 'message' => 'Anda tidak dapat mentransfer saldo ke akun Anda sendiri!']);
        exit();
    }
    if (!empty($trecipient['is_blocked']) || ($trecipient['status'] ?? '') === 'blocked') {
        echo json_encode(['success' => false, 'message' => 'Akun tujuan dinonaktifkan. Transfer tidak dapat diproses.']);
        exit();
    }

    $tsenderBal = (int)$tsender['wallet_balance'];
    if ($tsenderBal < $tamount) {
        echo json_encode([
            'success' => false,
            'message' => 'Saldo Wallet Utama tidak mencukupi! Saldo Anda: Rp ' . number_format($tsenderBal, 0, ',', '.')
        ]);
        exit();
    }

    $ttrxIdOut = 'TRX-TRFO-' . mt_rand(100000, 999999);
    $ttrxIdIn = 'TRX-TRFI-' . mt_rand(100000, 999999);
    $tnow = date('Y-m-d H:i:s');
    $tnewSenderBal = $tsenderBal - $tamount;

    try {
        $pdo->beginTransaction();

        // NOTE: distinct placeholder names — native MySQL prepares reject the
        // same named parameter appearing twice in one statement (SQLSTATE HY093).
        $tdStmt = $pdo->prepare("UPDATE `users` SET `wallet_balance` = `wallet_balance` - :amt WHERE `id` = :uid AND `wallet_balance` >= :amt_guard");
        $tdStmt->execute([':amt' => $tamount, ':uid' => $tsender['id'], ':amt_guard' => $tamount]);
        if ($tdStmt->rowCount() === 0) {
            $pdo->rollBack();
            echo json_encode(['success' => false, 'message' => 'Saldo tidak mencukupi atau saldo berubah. Silakan coba lagi.']);
            exit();
        }

        $tcStmt = $pdo->prepare("UPDATE `users` SET `wallet_balance` = `wallet_balance` + :amt WHERE `id` = :rid");
        $tcStmt->execute([':amt' => $tamount, ':rid' => $trecipient['id']]);

        $tinsOut = $pdo->prepare("INSERT INTO `transactions`
            (`id`, `user_id`, `username`, `type`, `amount`, `net_amount`, `status`, `payment_method`, `note`, `created_at`)
            VALUES (:id, :uid, :uname, 'member_transfer_out', :amt, :net_amt, 'approved', 'P2P Antar Member', :note, :cdate)");
        $tinsOut->execute([
            ':id' => $ttrxIdOut,
            ':uid' => $tsender['id'],
            ':uname' => $tsender['username'],
            ':amt' => $tamount,
            ':net_amt' => $tamount,
            ':note' => 'Transfer saldo ke member ' . $trecipient['username'] . ' (' . ($trecipient['full_name'] ?: $trecipient['username']) . ')',
            ':cdate' => $tnow
        ]);

        $tinsIn = $pdo->prepare("INSERT INTO `transactions`
            (`id`, `user_id`, `username`, `type`, `amount`, `net_amount`, `status`, `payment_method`, `note`, `created_at`)
            VALUES (:id, :uid, :uname, 'member_transfer', :amt, :net_amt, 'approved', 'P2P Antar Member', :note, :cdate)");
        $tinsIn->execute([
            ':id' => $ttrxIdIn,
            ':uid' => $trecipient['id'],
            ':uname' => $trecipient['username'],
            ':amt' => $tamount,
            ':net_amt' => $tamount,
            ':note' => 'Terima transfer saldo dari member ' . $tsender['username'] . ' (' . ($tsender['full_name'] ?: $tsender['username']) . ')',
            ':cdate' => $tnow
        ]);

        $pdo->commit();
    } catch (Exception $eTrf) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        $dbgMsg = 'Gagal memproses transfer. Silakan coba lagi.';
        // Operator-only diagnostics (requires the same secret used by the
        // maintenance key); never exposed to normal members.
        if (currentSessionRole() === 'admin' && !empty($tin['debug'])) {
            $dbgMsg .= ' [' . $eTrf->getMessage() . ']';
        }
        echo json_encode(['success' => false, 'message' => $dbgMsg]);
        exit();
    }

    // Best-effort mirror into the JSON state (same trx ids dedup on GET merge)
    try {
        $stData = loadMainState($pdo);
        if (is_array($stData)) {
            if (isset($stData['users']) && is_array($stData['users'])) {
                foreach ($stData['users'] as $idx => $u) {
                    if (($u['id'] ?? '') === $tsender['id']) {
                        $stData['users'][$idx]['walletBalance'] = $tnewSenderBal;
                    } elseif (($u['id'] ?? '') === $trecipient['id']) {
                        $stData['users'][$idx]['walletBalance'] = ((int)($u['walletBalance'] ?? 0)) + $tamount;
                    }
                }
            }
            if (!isset($stData['transactions']) || !is_array($stData['transactions'])) $stData['transactions'] = [];
            $tnowIso = date('c');
            array_unshift($stData['transactions'], [
                'id' => $ttrxIdIn,
                'userId' => $trecipient['id'],
                'username' => $trecipient['username'],
                'type' => 'member_transfer',
                'amount' => $tamount,
                'destinationAccount' => $tsender['username'],
                'paymentMethod' => 'P2P Antar Member',
                'walletSource' => 'Saldo Utama',
                'note' => 'Terima transfer saldo dari member ' . $tsender['username'] . ' (' . ($tsender['full_name'] ?: $tsender['username']) . ')',
                'status' => 'approved',
                'createdAt' => $tnowIso
            ]);
            array_unshift($stData['transactions'], [
                'id' => $ttrxIdOut,
                'userId' => $tsender['id'],
                'username' => $tsender['username'],
                'type' => 'member_transfer_out',
                'amount' => $tamount,
                'destinationAccount' => $trecipient['username'],
                'paymentMethod' => 'P2P Antar Member',
                'walletSource' => 'Saldo Utama',
                'note' => 'Transfer saldo ke member ' . $trecipient['username'] . ' (' . ($trecipient['full_name'] ?: $trecipient['username']) . ')',
                'status' => 'approved',
                'createdAt' => $tnowIso
            ]);
            saveMainState($pdo, $stData);
        }
    } catch (Exception $eSt) {}

    echo json_encode([
        'success' => true,
        'message' => 'Sukses transfer Rp ' . number_format($tamount, 0, ',', '.') . ' ke member ' . $trecipient['username'] . '!',
        'recipient' => $trecipient['username'],
        'recipientId' => $trecipient['id'],
        'walletBalance' => $tnewSenderBal,
        'transactionId' => $ttrxIdOut
    ]);
    exit();
}

if ($action === 'admin_save_plans') {
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
    $plans = isset($in['plans']) && is_array($in['plans']) ? $in['plans'] : (is_array($in) ? $in : []);

    if (!is_array($plans) || count($plans) === 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Data paket investasi tidak valid.']);
        exit();
    }

    $setStmt = $pdo->prepare("
        INSERT INTO `settings` (`setting_key`, `setting_value`, `description`)
        VALUES ('platform_plans', :sv, 'Platform customized investment plans')
        ON DUPLICATE KEY UPDATE `setting_value` = VALUES(`setting_value`), `updated_at` = CURRENT_TIMESTAMP
    ");
    $setStmt->execute([':sv' => json_encode($plans, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)]);

    try {
        $stData = loadMainState($pdo);
        if (is_array($stData) && count($stData) > 0) {
            $stData['plans'] = $plans;
            saveMainState($pdo, $stData);
        }
    } catch (Exception $eSt) {}

    echo json_encode([
        'success' => true,
        'message' => 'Pengaturan nama & rincian paket investasi berhasil disimpan permanen ke database!',
        'plans' => $plans
    ]);
    exit();
}

// --- action=admin_save_rewards (admin only) -------------------------------
if ($action === 'admin_save_rewards') {
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
    $rewards = isset($in['rewards']) && is_array($in['rewards']) ? $in['rewards'] : (is_array($in) ? $in : []);

    $setStmt = $pdo->prepare("
        INSERT INTO `settings` (`setting_key`, `setting_value`, `description`)
        VALUES ('platform_rewards', :sv, 'Platform point reward redeem catalog')
        ON DUPLICATE KEY UPDATE `setting_value` = VALUES(`setting_value`), `updated_at` = CURRENT_TIMESTAMP
    ");
    $setStmt->execute([':sv' => json_encode($rewards, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)]);

    try {
        $stData = loadMainState($pdo);
        if (is_array($stData) && count($stData) > 0) {
            $stData['rewards'] = $rewards;
            saveMainState($pdo, $stData);
        }
    } catch (Exception $eSt) {}

    echo json_encode([
        'success' => true,
        'message' => 'Katalog hadiah point berhasil disimpan permanen ke database!',
        'rewards' => $rewards
    ]);
    exit();
}

// --- action=admin_save_signals (admin only) -------------------------------
if ($action === 'admin_save_signals') {
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
    $signals = isset($in['signals']) && is_array($in['signals']) ? $in['signals'] : (is_array($in) ? $in : []);

    if (!is_array($signals)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Data sinyal tidak valid.']);
        exit();
    }

    $setStmt = $pdo->prepare("
        INSERT INTO `settings` (`setting_key`, `setting_value`, `description`)
        VALUES ('platform_signals', :sv, 'Platform trading signals feed')
        ON DUPLICATE KEY UPDATE `setting_value` = VALUES(`setting_value`), `updated_at` = CURRENT_TIMESTAMP
    ");
    $setStmt->execute([':sv' => json_encode($signals, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)]);

    try {
        $stData = loadMainState($pdo);
        if (is_array($stData) && count($stData) > 0) {
            $stData['signals'] = $signals;
            saveMainState($pdo, $stData);
        }
    } catch (Exception $eSt) {}

    echo json_encode([
        'success' => true,
        'message' => 'Daftar sinyal trading berhasil disimpan permanen ke database MySQL cPanel!',
        'signals' => $signals
    ]);
    exit();
}

// --- action=admin_save_announcements (admin only) --------------------------
// Running text (teks berjalan) + its speed. Authoritative copy lives in the
// settings table so a stale client snapshot can never restore the defaults.
if ($action === 'admin_save_announcements') {
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
    $announcements = isset($in['announcements']) && is_array($in['announcements']) ? $in['announcements'] : null;
    $speed = isset($in['speed']) ? (int)$in['speed'] : null;

    if ($announcements === null && $speed === null) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Data teks berjalan tidak valid.']);
        exit();
    }
    if ($speed !== null) {
        $speed = max(10, min(600, $speed));
    }

    $current = [];
    try {
        $cStmt = $pdo->prepare("SELECT `setting_value` FROM `settings` WHERE `setting_key` = 'platform_announcements' LIMIT 1");
        $cStmt->execute();
        $cRow = $cStmt->fetch();
        if ($cRow && !empty($cRow['setting_value'])) {
            $decoded = json_decode($cRow['setting_value'], true);
            if (is_array($decoded)) $current = $decoded;
        }
    } catch (Exception $eA1) {}

    if ($announcements !== null) $current['announcements'] = array_values($announcements);
    if ($speed !== null) $current['speed'] = $speed;

    $setStmt = $pdo->prepare("
        INSERT INTO `settings` (`setting_key`, `setting_value`, `description`)
        VALUES ('platform_announcements', :sv, 'Platform running text announcements & rotation speed')
        ON DUPLICATE KEY UPDATE `setting_value` = VALUES(`setting_value`), `updated_at` = CURRENT_TIMESTAMP
    ");
    $setStmt->execute([':sv' => json_encode($current, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)]);

    try {
        $stData = loadMainState($pdo);
        if (is_array($stData) && count($stData) > 0) {
            if ($announcements !== null) $stData['announcements'] = array_values($announcements);
            if ($speed !== null) {
                $stData['settings'] = is_array($stData['settings'] ?? null) ? $stData['settings'] : [];
                $stData['settings']['announcementSpeed'] = $speed;
            }
            saveMainState($pdo, $stData);
        }
    } catch (Exception $eA2) {}

    echo json_encode([
        'success' => true,
        'message' => 'Teks berjalan berhasil disimpan permanen ke database MySQL cPanel!',
        'announcements' => $current['announcements'] ?? [],
        'speed' => $current['speed'] ?? 75
    ]);
    exit();
}

// --- action=admin_login_as_user (admin impersonation mode) -----------------
if ($action === 'admin_login_as_user') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Method not allowed. Use POST.']);
        exit();
    }
    requireAdmin();
    if (!$pdo) {
        http_response_code(503);
        echo json_encode(['success' => false, 'message' => 'Database MySQL belum terhubung.']);
        exit();
    }
    ensureTablesExist($pdo);

    $raw = file_get_contents('php://input');
    $in = json_decode($raw, true) ?: [];
    $targetId = trim((string)($in['userId'] ?? $in['id'] ?? ''));
    $targetUsername = trim((string)($in['username'] ?? ''));

    if ($targetId === '' && $targetUsername === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Target User ID atau Username wajib disertakan.']);
        exit();
    }

    $uStmt = $pdo->prepare("SELECT * FROM `users` WHERE `id` = :id OR `username` = :uname LIMIT 1");
    $uStmt->execute([
        ':id' => $targetId,
        ':uname' => $targetUsername
    ]);
    $userRow = $uStmt->fetch();
    if (!$userRow) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Member tidak ditemukan di database.']);
        exit();
    }

    // Generate cryptographic member session token
    $memberToken = createSessionToken($userRow['id'], (string)($userRow['role'] ?? 'user'));
    setAuthSessionCookie($memberToken);

    // Fetch investments for member
    $loginInvs = [];
    try {
        $stAll = loadMainState($pdo);
        if (!empty($stAll['investments']) && is_array($stAll['investments'])) {
            foreach ($stAll['investments'] as $inv) {
                if (($inv['userId'] ?? '') === (string)$userRow['id']) {
                    $loginInvs[] = $inv;
                }
            }
        }
        if (empty($loginInvs)) {
            $invStmt = $pdo->prepare("SELECT * FROM `investments` WHERE `user_id` = :uid");
            $invStmt->execute([':uid' => $userRow['id']]);
            $dbInvs = $invStmt->fetchAll();
            foreach ($dbInvs as $dInv) {
                $loginInvs[] = [
                    'id' => $dInv['id'],
                    'userId' => (string)$userRow['id'],
                    'planId' => $dInv['plan_id'],
                    'planName' => $dInv['plan_name'],
                    'capital' => (int)$dInv['capital'],
                    'minDailyProfit' => (float)$dInv['min_rate'],
                    'maxDailyProfit' => (float)$dInv['max_rate'],
                    'minRate' => (float)$dInv['min_rate'],
                    'maxRate' => (float)$dInv['max_rate'],
                    'totalProfitEarned' => (int)$dInv['total_profit_earned'],
                    'pendingProfitClaim' => (int)$dInv['pending_profit_claim'],
                    'daysElapsed' => (int)$dInv['days_elapsed'],
                    'durationDays' => (int)$dInv['duration_days'],
                    'capitalReturned' => !empty($dInv['capital_returned']),
                    'status' => $dInv['status'],
                    'startDate' => $dInv['start_date'],
                    'lastProfitYieldDate' => $dInv['last_profit_yield_date'],
                    'createdAt' => $dInv['created_at'],
                    'history' => []
                ];
            }
        }
    } catch (Exception $eInv) {}

    // Fetch transactions for member
    $loginTxs = [];
    try {
        $txStmt = $pdo->prepare("SELECT * FROM `transactions` WHERE `user_id` = :uid ORDER BY `created_at` DESC LIMIT 50");
        $txStmt->execute([':uid' => $userRow['id']]);
        $dbTxs = $txStmt->fetchAll();
        foreach ($dbTxs as $dtx) {
            $loginTxs[] = [
                'id' => $dtx['id'],
                'userId' => (string)$userRow['id'],
                'username' => $dtx['username'] ?? (string)$userRow['username'],
                'type' => $dtx['type'],
                'amount' => (int)$dtx['amount'],
                'netAmount' => (int)$dtx['net_amount'],
                'status' => $dtx['status'],
                'paymentMethod' => cleanPaymentMethodStr($dtx['payment_method']),
                'walletSource' => $dtx['wallet_source'] ?? null,
                'destinationAccount' => $dtx['destination_account'] ?? null,
                'txid' => $dtx['txid'] ?? null,
                'uniqueCode' => $dtx['unique_code'] ?? null,
                'proofImage' => $dtx['proof_image'] ?? null,
                'note' => $dtx['note'] ?? null,
                'createdAt' => $dtx['created_at']
            ];
        }
    } catch (Exception $eTx) {}

    $chkData = !empty($userRow['daily_check_in']) ? json_decode($userRow['daily_check_in'], true) : null;
    $userClean = [
        'id' => (string)$userRow['id'],
        'username' => (string)$userRow['username'],
        'fullName' => (string)$userRow['full_name'],
        'email' => (string)$userRow['email'],
        'phone' => (string)$userRow['phone'],
        'city' => (string)($userRow['city'] ?? ''),
        'role' => (string)($userRow['role'] ?? 'user'),
        'walletBalance' => (int)($userRow['wallet_balance'] ?? 0),
        'affiliateBalance' => (int)($userRow['affiliate_balance'] ?? 0),
        'points' => (int)($userRow['points'] ?? 0),
        'referralCode' => (string)($userRow['referral_code'] ?? ''),
        'referredBy' => (string)($userRow['referred_by'] ?? ''),
        'dailyCheckIn' => $chkData,
        'status' => (string)($userRow['status'] ?? 'active'),
        'isBlocked' => !empty($userRow['is_blocked']),
        'bankAccount' => [
            'bankName' => (string)($userRow['bank_name'] ?? ''),
            'accountNumber' => (string)($userRow['account_number'] ?? ''),
            'accountHolder' => (string)($userRow['account_holder'] ?? '')
        ]
    ];

    echo json_encode([
        'success' => true,
        'message' => 'Berhasil masuk sebagai member @' . $userRow['username'],
        'sessionToken' => $memberToken,
        'user' => $userClean,
        'investments' => $loginInvs,
        'transactions' => $loginTxs
    ]);
    exit();
}

// 6. Action: Send Email / Mailer forwarding
if ($action === 'send_email' || in_array($action, ['send_otp', 'admin_notification', 'test', 'welcome', 'withdraw', 'deposit', 'profit_claim', 'rabat', 'bonus', 'ppob'])) {
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

    // Guard against accidental or stale blind-wipe calls. The frontend button
    // (AdminPage.resetDemoDatabase) already confirms once client-side, but any
    // other caller (script, stale tab, replayed request etc.) must echo the same
    // explicit confirmation so a stray POST cannot silently nuke a restored DB.
    $echo = trim((string)($_POST['confirmWipe'] ?? $_GET['confirmWipe'] ?? ''));
    if ($echo !== 'BENAR-SAYA-AKAN-MENGOSONGKAN-SELURUH-DATA-DEMO') {
        jsonResponse(['success' => false, 'message' => 'Permintaan dibatalkan. Masukkan konfirmasi eksplisit untuk mengosongkan data demo.'], 403);
    }
    if (!rateLimit('cleardemo', 3, 300)) {
        http_response_code(429);
        echo json_encode(['success' => false, 'message' => 'Terlalu banyak permintaan pembersihan. Coba lagi dalam beberapa menit.']);
        exit();
    }

    try {
        // Delete all non-admin users
        $pdo->exec("DELETE FROM `users` WHERE `role` != 'admin' AND `id` != 'usr-admin'");
        
        // Reset admin balance & stats to 0
        $pdo->exec("UPDATE `users` SET `wallet_balance` = 0, `affiliate_balance` = 0, `points` = 0 WHERE `id` = 'usr-admin'");
        
        // Ensure admin user exists if table was empty, and keep existing admin password intact!
        $bootstrapHash = hashPassword((getenv('AT_ADMIN_BOOTSTRAP') ?: ADMIN_BOOTSTRAP_PASSWORD));
        $checkAdmin = $pdo->query("SELECT COUNT(*) FROM `users` WHERE `id` = 'usr-admin'")->fetchColumn();
        if ((int)$checkAdmin === 0) {
            $insAdmin = $pdo->prepare("INSERT INTO `users` (`id`, `username`, `password_hash`, `salt`, `full_name`, `email`, `phone`, `city`, `wallet_balance`, `affiliate_balance`, `points`, `referral_code`, `referred_by`, `status`, `is_blocked`, `bank_name`, `account_number`, `account_holder`, `role`, `created_at`) VALUES ('usr-admin', 'admin', :ph, '', 'System Administrator', 'admin@autotrading.my.id', '081299990000', 'Jakarta', 0, 0, 0, 'ADMINVIP', NULL, 'active', 0, '', '', '', 'admin', '2026-01-01 00:00:00')");
            $insAdmin->execute([':ph' => $bootstrapHash]);
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
    // SECURITY: tidak ada bypass master key lagi. Operasi destruktif (purge &
    // dedup data produksi) wajib sesi administrator yang sah.
    requireAdmin();
    if (!$pdo) {
        http_response_code(503);
        echo json_encode(['success' => false, 'message' => 'Database MySQL tidak terhubung']);
        exit();
    }
    ensureTablesExist($pdo);
    
    try {
        // 1. Normalize transaction types across relational table
        $pdo->exec("UPDATE `transactions` SET `type` = 'invest_plan' WHERE `id` LIKE 'TRX-INV-%'");
        $pdo->exec("UPDATE `transactions` SET `type` = 'bonus' WHERE `id` LIKE 'TX-CHK-%'");
        $pdo->exec("UPDATE `transactions` SET `type` = 'profit_claim' WHERE `id` LIKE 'TRX-PRF-%'");
        $pdo->exec("UPDATE `transactions` SET `type` = 'sponsor_bonus' WHERE `id` LIKE 'TRX-SPS-%'");
        $pdo->exec("UPDATE `transactions` SET `type` = 'rabat_bonus' WHERE `id` LIKE 'TRX-RBT-%'");
        $pdo->exec("UPDATE `transactions` SET `type` = 'deposit' WHERE `id` LIKE 'TRX-DEP-%'");
        $pdo->exec("UPDATE `transactions` SET `type` = 'withdraw' WHERE `id` LIKE 'TRX-WDR-%'");

        // 2. Remove duplicate profit claims, plan activations, and PPOB/bonuses
        $pdo->exec("DELETE FROM `transactions` WHERE `id` IN (
            'TRX-INV-962298', 'TRX-INV-468776', 'TRX-POB-850709', 'TRX-POB-524211',
            'TRX-POB-838271', 'TRX-LDR-949974', 'TRX-LDR-488875', 'TRX-RBT-258092',
            'TRX-PRF-339740', 'TRX-PRF-566756', 'TRX-PRF-747865', 'TRX-PRF-218647',
            'TRX-PRF-797164', 'TRX-PRF-913169', 'TRX-PRF-562987', 'TRX-PRF-321611',
            'TRX-PRF-821410', 'TRX-PRF-738236', 'TRX-PRF-610051', 'TRX-PRF-134863'
        )");

        // 3.5 Remove duplicate duitkaya account (usr-1791275394006)
        $pdo->exec("DELETE FROM `users` WHERE `id` = 'usr-1791275394006'");

        // 4. Update balances for affected users
        // kayaraya: 50,000,244 deposit + 4,000 checkins - 5,000,000 (1 plan) = 45,004,244 IDR
        $pdo->exec("UPDATE `users` SET `wallet_balance` = 45004244, `updated_at` = CURRENT_TIMESTAMP WHERE `id` = 'usr-1791685498115' OR `username` = 'kayaraya'");
        // bisnis2: 2 checkins (2026-10-08 and 2026-10-15) = 2,000 IDR
        $pdo->exec("UPDATE `users` SET `wallet_balance` = 2000, `updated_at` = CURRENT_TIMESTAMP WHERE `id` = 'usr-1791444563100' OR `username` = 'bisnis2'");
        // investor1: deduct 7 duplicate claims of 2009 = 14063 IDR -> 990,588 IDR
        $pdo->exec("UPDATE `users` SET `wallet_balance` = 990588, `updated_at` = CURRENT_TIMESTAMP WHERE `id` = 'usr-1791033573810'");
        // duitpro: net balance 459,950 IDR
        $pdo->exec("UPDATE `users` SET `wallet_balance` = 459950, `updated_at` = CURRENT_TIMESTAMP WHERE `id` = 'usr-1790996838699'");
        // masben: 400,899 + checkins(2000) + profit(1640) = 404,539 IDR
        $pdo->exec("UPDATE `users` SET `wallet_balance` = 404539, `updated_at` = CURRENT_TIMESTAMP WHERE `id` = 'usr-1791214468990'");
        // investor2: 1,000,552 + checkins(2000) + profit(9150) = 1,011,702 IDR
        $pdo->exec("UPDATE `users` SET `wallet_balance` = 1011702, `updated_at` = CURRENT_TIMESTAMP WHERE `id` = 'usr-1791242532209'");
        // rezeki: 611 + checkins(2000) = 2,611 IDR
        $pdo->exec("UPDATE `users` SET `wallet_balance` = 2611, `updated_at` = CURRENT_TIMESTAMP WHERE `id` = 'usr-1791249510656'");
        // duitkaya: 0 + checkin(1000) = 1,000 IDR
        $pdo->exec("UPDATE `users` SET `wallet_balance` = 1000, `updated_at` = CURRENT_TIMESTAMP WHERE `id` = 'usr-1791275402661'");
        // pemburudolar: 0 + checkin(1000) = 1,000 IDR
        $pdo->exec("UPDATE `users` SET `wallet_balance` = 1000, `updated_at` = CURRENT_TIMESTAMP WHERE `id` = 'usr-1791277725245'");
        // pendekar: 28,500,846 + checkins(2000) + profit(87500) = 28,590,346 IDR
        $pdo->exec("UPDATE `users` SET `wallet_balance` = 28590346, `updated_at` = CURRENT_TIMESTAMP WHERE `id` = 'usr-1791247049424'");
        // bonuskoe: 2,455,792 + checkin(1000) + profit(23000) = 2,478,792 IDR (deduplicate duplicate claim)
        $pdo->exec("UPDATE `users` SET `wallet_balance` = 2478792, `updated_at` = CURRENT_TIMESTAMP WHERE `id` = 'usr-1791224078093' OR `username` = 'bonuskoe'");

        // 5. Fix investments table (set last_profit_yield_date, clear pending, and synchronize total_profit_earned)
        $nowDt = date('Y-m-d H:i:s');
        $pdo->exec("UPDATE `investments` SET `last_profit_yield_date` = '{$nowDt}', `pending_profit_claim` = 0 WHERE `last_profit_yield_date` IS NULL OR `user_id` IN ('usr-1790996838699')");
        // Ensure total_profit_earned matches approved profit claim transactions
        $pdo->exec("UPDATE `investments` SET `total_profit_earned` = 87500 WHERE `id` = 'inv-1791248064000'");
        $pdo->exec("UPDATE `investments` SET `total_profit_earned` = 23000 WHERE `id` = 'inv-1791246898036'");
        $pdo->exec("UPDATE `investments` SET `total_profit_earned` = 9150 WHERE `id` = 'inv-1791242756249'");
        $pdo->exec("UPDATE `investments` SET `total_profit_earned` = 2009 WHERE `id` = 'inv-1791082184354'");
        $pdo->exec("UPDATE `investments` SET `total_profit_earned` = 1640 WHERE `id` = 'inv-1791143221090'");
        $pdo->exec("UPDATE `investments` SET `total_profit_earned` = 1640 WHERE `id` = 'inv-1791220411248'");

        // 6. Synchronize JSON state table using chunked readStateJson (prevents 1MB fetch truncation cap)
        $rawState = readStateJson($pdo, 'autotrading_system_state');
        if (empty($rawState)) {
            $rawState = readStateJson($pdo, 'fgt_system_state');
        }
        if (!empty($rawState)) {
            $json = json_decode($rawState, true);
            if (is_array($json)) {
                // Filter transactions
                $toRemove = [
                    'TRX-INV-962298', 'TRX-INV-468776', 'TRX-POB-850709', 'TRX-POB-524211',
                    'TRX-POB-838271', 'TRX-LDR-949974', 'TRX-LDR-488875', 'TRX-RBT-258092',
                    'TRX-PRF-339740', 'TRX-PRF-566756', 'TRX-PRF-747865', 'TRX-PRF-218647',
                    'TRX-PRF-797164', 'TRX-PRF-913169', 'TRX-PRF-562987', 'TRX-PRF-321611',
                    'TRX-PRF-821410', 'TRX-PRF-738236', 'TRX-PRF-610051', 'TRX-PRF-134863'
                ];
                if (isset($json['transactions']) && is_array($json['transactions'])) {
                    $json['transactions'] = array_values(array_filter($json['transactions'], function($t) use ($toRemove) {
                        return !in_array($t['id'], $toRemove);
                    }));
                    foreach ($json['transactions'] as &$tx) {
                        $txId = $tx['id'] ?? '';
                        if (strpos($txId, 'TRX-INV-') === 0) $tx['type'] = 'invest_plan';
                        elseif (strpos($txId, 'TX-CHK-') === 0) $tx['type'] = 'bonus';
                        elseif (strpos($txId, 'TRX-PRF-') === 0) $tx['type'] = 'profit_claim';
                        elseif (strpos($txId, 'TRX-DEP-') === 0) $tx['type'] = 'deposit';
                        elseif (strpos($txId, 'TRX-WDR-') === 0) $tx['type'] = 'withdraw';
                    }
                    unset($tx);
                }

                // Update users in JSON
                if (isset($json['users']) && is_array($json['users'])) {
                    $json['users'] = array_values(array_filter($json['users'], function($u) {
                        return ($u['id'] ?? '') !== 'usr-1791275394006';
                    }));
                    foreach ($json['users'] as &$u) {
                        if ($u['id'] === 'usr-1791685498115' || ($u['username'] ?? '') === 'kayaraya') $u['walletBalance'] = 45004244;
                        if ($u['id'] === 'usr-1791444563100' || ($u['username'] ?? '') === 'bisnis2') $u['walletBalance'] = 2000;
                        if ($u['id'] === 'usr-1791033573810') $u['walletBalance'] = 990588;
                        if ($u['id'] === 'usr-1790996838699') $u['walletBalance'] = 459950;
                        if ($u['id'] === 'usr-1791214468990') $u['walletBalance'] = 404539;
                        if ($u['id'] === 'usr-1791242532209') $u['walletBalance'] = 1011702;
                        if ($u['id'] === 'usr-1791249510656') $u['walletBalance'] = 2611;
                        if ($u['id'] === 'usr-1791275402661') $u['walletBalance'] = 1000;
                        if ($u['id'] === 'usr-1791277725245') $u['walletBalance'] = 1000;
                        if ($u['id'] === 'usr-1791247049424') $u['walletBalance'] = 28590346;
                        if ($u['id'] === 'usr-1791224078093' || ($u['username'] ?? '') === 'bonuskoe') $u['walletBalance'] = 2478792;
                    }
                    unset($u);
                }

                // Update investments in JSON
                if (isset($json['investments']) && is_array($json['investments'])) {
                    foreach ($json['investments'] as &$invRef) {
                        if (($invRef['id'] ?? '') === 'inv-1791248064000') $invRef['totalProfitEarned'] = 87500;
                        if (($invRef['id'] ?? '') === 'inv-1791246898036') $invRef['totalProfitEarned'] = 23000;
                        if (($invRef['id'] ?? '') === 'inv-1791242756249') $invRef['totalProfitEarned'] = 9150;
                        if (($invRef['id'] ?? '') === 'inv-1791082184354') $invRef['totalProfitEarned'] = 2009;
                        if (($invRef['id'] ?? '') === 'inv-1791143221090') $invRef['totalProfitEarned'] = 1640;
                        if (($invRef['id'] ?? '') === 'inv-1791220411248') $invRef['totalProfitEarned'] = 1640;
                        if (empty($invRef['lastProfitYieldDate']) || in_array($invRef['userId'], ['usr-1791033573810', 'usr-1790996838699'])) {
                            $invRef['lastProfitYieldDate'] = $nowDt;
                            $invRef['pendingProfitClaim'] = 0;
                        }
                    }
                    unset($invRef);
                }

                // Save back to JSON state
                $upd = $pdo->prepare("UPDATE `autotrading_system_state` SET `data_json` = :dj WHERE `state_key` = 'main_state'");
                $upd->execute([':dj' => json_encode($json, JSON_UNESCAPED_UNICODE)]);

                try {
                    $updFgt = $pdo->prepare("UPDATE `fgt_system_state` SET `data_json` = :dj WHERE `state_key` = 'main_state'");
                    $updFgt->execute([':dj' => json_encode($json, JSON_UNESCAPED_UNICODE)]);
                } catch(Exception $eF) {}
            }
        }

        echo json_encode([
            'success' => true,
            'message' => 'State cleaned: duplicate profit claims removed, balances accurately restored, transaction types normalized.'
        ]);
    } catch(Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
    exit();
}

// 8.5 Action: Restore all authoritative members to MySQL & Unified System State
if ($action === 'restore_all_members') {
    // SECURITY: dulu ?key=at_clean_2026 melewati requireAdmin() pada endpoint ini,
    // yang menyetel ulang password member ke nilai default yang diketahui publik
    // (mass account takeover). Sekarang wajib sesi admin sah.
    requireAdmin();
    if (!$pdo) {
        http_response_code(503);
        echo json_encode(['success' => false, 'message' => 'Database MySQL tidak terhubung']);
        exit();
    }
    ensureTablesExist($pdo);

    $defaultPasswordHash = password_hash('password123', PASSWORD_BCRYPT);
    $adminPasswordHash = password_hash('admin', PASSWORD_BCRYPT);

    $members = [
        [
            'id' => 'usr-admin',
            'username' => 'admin',
            'password_hash' => $adminPasswordHash,
            'full_name' => 'System Administrator',
            'email' => 'admin@autotrading.my.id',
            'phone' => '081299990000',
            'city' => 'Jakarta',
            'wallet_balance' => 0,
            'affiliate_balance' => 0,
            'points' => 0,
            'referral_code' => 'ADMINVIP',
            'referred_by' => null,
            'bank_name' => '',
            'account_number' => '',
            'account_holder' => '',
            'role' => 'admin',
            'daily_check_in' => null,
            'created_at' => '2026-01-01 00:00:00'
        ],
        [
            'id' => 'usr-1791214468990',
            'username' => 'masben',
            'password_hash' => $defaultPasswordHash,
            'full_name' => 'Mas Ben',
            'email' => 'masben@autotrading.my.id',
            'phone' => '081274619448',
            'city' => 'Jakarta',
            'wallet_balance' => 408509,
            'affiliate_balance' => 0,
            'points' => 10,
            'referral_code' => 'MASBEN88',
            'referred_by' => 'ADMINVIP',
            'bank_name' => 'DANA',
            'account_number' => '081274619448',
            'account_holder' => 'MAS BEN',
            'role' => 'user',
            'daily_check_in' => json_encode(['currentStreak' => 2, 'lastCheckInDate' => '2026-10-15', 'history' => [['date' => '2026-10-06', 'day' => 1, 'amount' => 1000], ['date' => '2026-10-15', 'day' => 2, 'amount' => 1000]]]),
            'created_at' => '2026-10-06 00:01:08'
        ],
        [
            'id' => 'usr-1790996838699',
            'username' => 'duitpro',
            'password_hash' => $defaultPasswordHash,
            'full_name' => 'Subanto',
            'email' => 'subanto12@gmail.com',
            'phone' => '08125455877884',
            'city' => 'Jakarta',
            'wallet_balance' => 459950,
            'affiliate_balance' => 10360,
            'points' => 115,
            'referral_code' => 'DUIT318',
            'referred_by' => 'ADMINVIP',
            'bank_name' => 'BCA',
            'account_number' => '8962773782',
            'account_holder' => 'SUBANTO',
            'role' => 'user',
            'daily_check_in' => json_encode(['currentStreak' => 3, 'lastCheckInDate' => '2026-10-05', 'history' => [['date' => '2026-10-03', 'day' => 1, 'amount' => 1000], ['date' => '2026-10-04', 'day' => 2, 'amount' => 1000], ['date' => '2026-10-05', 'day' => 3, 'amount' => 1000]]]),
            'created_at' => '2026-10-03 10:07:18'
        ],
        [
            'id' => 'usr-1791033573810',
            'username' => 'investor1',
            'password_hash' => $defaultPasswordHash,
            'full_name' => 'Budi Santoso',
            'email' => 'investor1@autotrading.my.id',
            'phone' => '081234567801',
            'city' => 'Surabaya',
            'wallet_balance' => 990588,
            'affiliate_balance' => 0,
            'points' => 10,
            'referral_code' => 'BUDI01',
            'referred_by' => 'ADMINVIP',
            'bank_name' => 'Mandiri',
            'account_number' => '1420019283741',
            'account_holder' => 'BUDI SANTOSO',
            'role' => 'user',
            'daily_check_in' => json_encode(['currentStreak' => 1, 'lastCheckInDate' => '2026-10-04', 'history' => [['date' => '2026-10-04', 'day' => 1, 'amount' => 1000]]]),
            'created_at' => '2026-10-03 20:19:33'
        ],
        [
            'id' => 'usr-1791224078093',
            'username' => 'bonuskoe',
            'password_hash' => $defaultPasswordHash,
            'full_name' => 'Rian Bonus',
            'email' => 'bonuskoe@autotrading.my.id',
            'phone' => '081398765432',
            'city' => 'Bandung',
            'wallet_balance' => 2478792,
            'affiliate_balance' => 0,
            'points' => 10,
            'referral_code' => 'BONUSKOE',
            'referred_by' => 'MASBEN88',
            'bank_name' => 'BCA',
            'account_number' => '8271928374',
            'account_holder' => 'RIAN BONUS',
            'role' => 'user',
            'daily_check_in' => json_encode(['currentStreak' => 1, 'lastCheckInDate' => '2026-10-06', 'history' => [['date' => '2026-10-06', 'day' => 1, 'amount' => 1000]]]),
            'created_at' => '2026-10-06 02:41:18'
        ],
        [
            'id' => 'usr-1791242532209',
            'username' => 'investor2',
            'password_hash' => $defaultPasswordHash,
            'full_name' => 'Hendra Wijaya',
            'email' => 'investor2@autotrading.my.id',
            'phone' => '081298761234',
            'city' => 'Medan',
            'wallet_balance' => 1011702,
            'affiliate_balance' => 0,
            'points' => 10,
            'referral_code' => 'HENDRA99',
            'referred_by' => 'BUDI01',
            'bank_name' => 'BRI',
            'account_number' => '034101002938531',
            'account_holder' => 'HENDRA WIJAYA',
            'role' => 'user',
            'daily_check_in' => json_encode(['currentStreak' => 2, 'lastCheckInDate' => '2026-10-07', 'history' => [['date' => '2026-10-06', 'day' => 1, 'amount' => 1000], ['date' => '2026-10-07', 'day' => 2, 'amount' => 1000]]]),
            'created_at' => '2026-10-06 07:48:52'
        ],
        [
            'id' => 'usr-1791243763854',
            'username' => 'invest',
            'password_hash' => $defaultPasswordHash,
            'full_name' => 'Andi Investama',
            'email' => 'invest@autotrading.my.id',
            'phone' => '081223344556',
            'city' => 'Semarang',
            'wallet_balance' => 7401118,
            'affiliate_balance' => 0,
            'points' => 10,
            'referral_code' => 'INVESTAMA',
            'referred_by' => 'ADMINVIP',
            'bank_name' => 'BCA',
            'account_number' => '5345678901',
            'account_holder' => 'ANDI INVESTAMA',
            'role' => 'user',
            'daily_check_in' => json_encode(['currentStreak' => 1, 'lastCheckInDate' => '2026-10-06', 'history' => [['date' => '2026-10-06', 'day' => 1, 'amount' => 1000]]]),
            'created_at' => '2026-10-06 08:09:23'
        ],
        [
            'id' => 'usr-1791247049424',
            'username' => 'pendekar',
            'password_hash' => $defaultPasswordHash,
            'full_name' => 'Pendekar Trader',
            'email' => 'pendekar@autotrading.my.id',
            'phone' => '081334455667',
            'city' => 'Yogyakarta',
            'wallet_balance' => 28590346,
            'affiliate_balance' => 0,
            'points' => 10,
            'referral_code' => 'PENDEKAR',
            'referred_by' => 'ADMINVIP',
            'bank_name' => 'Mandiri',
            'account_number' => '1370029384721',
            'account_holder' => 'PENDEKAR TRADER',
            'role' => 'user',
            'daily_check_in' => json_encode(['currentStreak' => 2, 'lastCheckInDate' => '2026-10-07', 'history' => [['date' => '2026-10-06', 'day' => 1, 'amount' => 1000], ['date' => '2026-10-07', 'day' => 2, 'amount' => 1000]]]),
            'created_at' => '2026-10-06 09:04:09'
        ],
        [
            'id' => 'usr-1791249510656',
            'username' => 'rezeki',
            'password_hash' => $defaultPasswordHash,
            'full_name' => 'Rezeki Melimpah',
            'email' => 'rezeki@autotrading.my.id',
            'phone' => '081245678901',
            'city' => 'Bali',
            'wallet_balance' => 2611,
            'affiliate_balance' => 0,
            'points' => 10,
            'referral_code' => 'REZEKI88',
            'referred_by' => 'ADMINVIP',
            'bank_name' => 'BCA',
            'account_number' => '8923451098',
            'account_holder' => 'REZEKI MELIMPAH',
            'role' => 'user',
            'daily_check_in' => json_encode(['currentStreak' => 2, 'lastCheckInDate' => '2026-10-07', 'history' => [['date' => '2026-10-06', 'day' => 1, 'amount' => 1000], ['date' => '2026-10-07', 'day' => 2, 'amount' => 1000]]]),
            'created_at' => '2026-10-06 09:45:10'
        ],
        [
            'id' => 'usr-1791275402661',
            'username' => 'duitkaya',
            'password_hash' => $defaultPasswordHash,
            'full_name' => 'Duit Kaya',
            'email' => 'duitkaya@autotrading.my.id',
            'phone' => '081277889900',
            'city' => 'Palembang',
            'wallet_balance' => 1000,
            'affiliate_balance' => 0,
            'points' => 10,
            'referral_code' => 'DUITKAYA',
            'referred_by' => 'ADMINVIP',
            'bank_name' => 'BRI',
            'account_number' => '034101009876543',
            'account_holder' => 'DUIT KAYA',
            'role' => 'user',
            'daily_check_in' => json_encode(['currentStreak' => 1, 'lastCheckInDate' => '2026-10-06', 'history' => [['date' => '2026-10-06', 'day' => 1, 'amount' => 1000]]]),
            'created_at' => '2026-10-06 16:56:42'
        ],
        [
            'id' => 'usr-1791277725245',
            'username' => 'pemburudolar',
            'password_hash' => $defaultPasswordHash,
            'full_name' => 'Pemburu Dolar',
            'email' => 'pemburudolar@autotrading.my.id',
            'phone' => '081288990011',
            'city' => 'Makassar',
            'wallet_balance' => 1000,
            'affiliate_balance' => 0,
            'points' => 10,
            'referral_code' => 'DOLAR2026',
            'referred_by' => 'ADMINVIP',
            'bank_name' => 'BNI',
            'account_number' => '0293847561',
            'account_holder' => 'PEMBURU DOLAR',
            'role' => 'user',
            'daily_check_in' => json_encode(['currentStreak' => 1, 'lastCheckInDate' => '2026-10-06', 'history' => [['date' => '2026-10-06', 'day' => 1, 'amount' => 1000]]]),
            'created_at' => '2026-10-06 17:35:25'
        ],
        [
            'id' => 'usr-1791304182871',
            'username' => 'cuan',
            'password_hash' => $defaultPasswordHash,
            'full_name' => 'Cuan Maksimal',
            'email' => 'cuan@autotrading.my.id',
            'phone' => '081299001122',
            'city' => 'Jakarta',
            'wallet_balance' => 0,
            'affiliate_balance' => 0,
            'points' => 10,
            'referral_code' => 'CUAN2026',
            'referred_by' => 'ADMINVIP',
            'bank_name' => 'BCA',
            'account_number' => '8271002938',
            'account_holder' => 'CUAN MAKSIMAL',
            'role' => 'user',
            'daily_check_in' => null,
            'created_at' => '2026-10-07 00:56:22'
        ],
        [
            'id' => 'usr-1791444503968',
            'username' => 'bisnis',
            'password_hash' => $defaultPasswordHash,
            'full_name' => 'Dede',
            'email' => 'bisnis@autotrading.my.id',
            'phone' => '081211223344',
            'city' => 'Jakarta',
            'wallet_balance' => 0,
            'affiliate_balance' => 500000,
            'points' => 10,
            'referral_code' => 'BISNIS',
            'referred_by' => 'ADMINVIP',
            'bank_name' => 'BCA',
            'account_number' => '8271928374',
            'account_holder' => 'DEDE',
            'role' => 'user',
            'daily_check_in' => json_encode(['currentStreak' => 1, 'lastCheckInDate' => '2026-10-08', 'history' => [['date' => '2026-10-08', 'day' => 1, 'amount' => 1000]]]),
            'created_at' => '2026-10-08 15:55:03'
        ],
        [
            'id' => 'usr-1791399289660',
            'username' => 'kayaraya',
            'password_hash' => $defaultPasswordHash,
            'full_name' => 'Juandi',
            'email' => 'juandi@autotrading.my.id',
            'phone' => '081266778899',
            'city' => 'Jakarta',
            'wallet_balance' => 45004244,
            'affiliate_balance' => 0,
            'points' => 10,
            'referral_code' => 'JUANDI',
            'referred_by' => 'ADMINVIP',
            'bank_name' => 'BCA',
            'account_number' => '8271928374',
            'account_holder' => 'JUANDI',
            'role' => 'user',
            'daily_check_in' => json_encode(['currentStreak' => 1, 'lastCheckInDate' => '2026-10-08', 'history' => [['date' => '2026-10-08', 'day' => 1, 'amount' => 1000]]]),
            'created_at' => '2026-10-08 03:21:29'
        ],
        [
            'id' => 'usr-1791387276376',
            'username' => 'cuankaya',
            'password_hash' => $defaultPasswordHash,
            'full_name' => 'Joshua',
            'email' => 'joshua@autotrading.my.id',
            'phone' => '081233221100',
            'city' => 'Surabaya',
            'wallet_balance' => 0,
            'affiliate_balance' => 0,
            'points' => 10,
            'referral_code' => 'JOSHUA',
            'referred_by' => 'ADMINVIP',
            'bank_name' => 'BCA',
            'account_number' => '8271928374',
            'account_holder' => 'JOSHUA',
            'role' => 'user',
            'daily_check_in' => json_encode(['currentStreak' => 1, 'lastCheckInDate' => '2026-10-07', 'history' => [['date' => '2026-10-07', 'day' => 1, 'amount' => 1000]]]),
            'created_at' => '2026-10-07 23:34:36'
        ],
        [
            'id' => 'usr-1791685498115',
            'username' => 'kayaberkah',
            'password_hash' => $defaultPasswordHash,
            'full_name' => 'Boy',
            'email' => 'boy@autotrading.my.id',
            'phone' => '081277665544',
            'city' => 'Bandung',
            'wallet_balance' => 0,
            'affiliate_balance' => 0,
            'points' => 10,
            'referral_code' => 'BOY2026',
            'referred_by' => 'ADMINVIP',
            'bank_name' => 'BCA',
            'account_number' => '8271928374',
            'account_holder' => 'BOY',
            'role' => 'user',
            'daily_check_in' => null,
            'created_at' => '2026-10-11 10:51:38'
        ],
        [
            'id' => 'usr-1791399216846',
            'username' => 'uangdigital',
            'password_hash' => $defaultPasswordHash,
            'full_name' => 'Jojo',
            'email' => 'jojo@autotrading.my.id',
            'phone' => '081288776655',
            'city' => 'Medan',
            'wallet_balance' => 0,
            'affiliate_balance' => 2536150,
            'points' => 10,
            'referral_code' => 'JOJO2026',
            'referred_by' => 'ADMINVIP',
            'bank_name' => 'BCA',
            'account_number' => '8271928374',
            'account_holder' => 'JOJO',
            'role' => 'user',
            'daily_check_in' => json_encode(['currentStreak' => 1, 'lastCheckInDate' => '2026-10-08', 'history' => [['date' => '2026-10-08', 'day' => 1, 'amount' => 1000]]]),
            'created_at' => '2026-10-08 03:20:16'
        ],
        [
            'id' => 'usr-1791444278690',
            'username' => 'digitalpro',
            'password_hash' => $defaultPasswordHash,
            'full_name' => 'Yeyen',
            'email' => 'yeyen@autotrading.my.id',
            'phone' => '081299887766',
            'city' => 'Semarang',
            'wallet_balance' => 0,
            'affiliate_balance' => 0,
            'points' => 10,
            'referral_code' => 'YEYEN',
            'referred_by' => 'ADMINVIP',
            'bank_name' => 'BCA',
            'account_number' => '8271928374',
            'account_holder' => 'YEYEN',
            'role' => 'user',
            'daily_check_in' => null,
            'created_at' => '2026-10-08 15:51:18'
        ],
        [
            'id' => 'usr-1791906872909',
            'username' => 'pemburucuan',
            'password_hash' => $defaultPasswordHash,
            'full_name' => 'Rahmat Cuan',
            'email' => 'rahmat@autotrading.my.id',
            'phone' => '081255443322',
            'city' => 'Jakarta',
            'wallet_balance' => 0,
            'affiliate_balance' => 0,
            'points' => 10,
            'referral_code' => 'RAHMAT',
            'referred_by' => 'ADMINVIP',
            'bank_name' => 'BCA',
            'account_number' => '8271928374',
            'account_holder' => 'RAHMAT',
            'role' => 'user',
            'daily_check_in' => null,
            'created_at' => '2026-10-13 23:01:12'
        ],
        [
            'id' => 'usr-1791444563100',
            'username' => 'bisnis2',
            'password_hash' => $defaultPasswordHash,
            'full_name' => 'Dede Bisnis',
            'email' => 'bisnis2@autotrading.my.id',
            'phone' => '081211223345',
            'city' => 'Jakarta',
            'wallet_balance' => 2000,
            'affiliate_balance' => 0,
            'points' => 10,
            'referral_code' => 'BISNIS2',
            'referred_by' => 'ADMINVIP',
            'bank_name' => 'BCA',
            'account_number' => '8271928374',
            'account_holder' => 'DEDE BISNIS',
            'role' => 'user',
            'daily_check_in' => json_encode(['currentStreak' => 2, 'lastCheckInDate' => '2026-10-15', 'history' => [['date' => '2026-10-08', 'day' => 1, 'amount' => 1000], ['date' => '2026-10-15', 'day' => 2, 'amount' => 1000]]]),
            'created_at' => '2026-10-08 15:56:03'
        ]
    ];

    $stmtUpsert = $pdo->prepare("INSERT INTO `users` 
      (`id`, `username`, `password_hash`, `salt`, `full_name`, `email`, `phone`, `city`, `wallet_balance`, `affiliate_balance`, `points`, `referral_code`, `referred_by`, `is_blocked`, `bank_name`, `account_number`, `account_holder`, `role`, `daily_check_in`, `created_at`) 
    VALUES 
      (:id, :username, :password_hash, '', :full_name, :email, :phone, :city, :wallet_balance, :affiliate_balance, :points, :referral_code, :referred_by, 0, :bank_name, :account_number, :account_holder, :role, :daily_check_in, :created_at)
    ON DUPLICATE KEY UPDATE 
      `full_name` = VALUES(`full_name`),
      `email` = VALUES(`email`),
      `phone` = VALUES(`phone`),
      `city` = VALUES(`city`),
      `wallet_balance` = VALUES(`wallet_balance`),
      `affiliate_balance` = VALUES(`affiliate_balance`),
      `points` = VALUES(`points`),
      `referral_code` = VALUES(`referral_code`),
      `referred_by` = VALUES(`referred_by`),
      `bank_name` = VALUES(`bank_name`),
      `account_number` = VALUES(`account_number`),
      `account_holder` = VALUES(`account_holder`),
      `role` = VALUES(`role`),
      `daily_check_in` = COALESCE(VALUES(`daily_check_in`), `daily_check_in`),
      `password_hash` = IF(`password_hash` = '' OR `password_hash` IS NULL, VALUES(`password_hash`), `password_hash`)");

    $insertedCount = 0;
    foreach ($members as $m) {
        $stmtUpsert->execute([
            ':id' => $m['id'],
            ':username' => $m['username'],
            ':password_hash' => $m['password_hash'],
            ':full_name' => $m['full_name'],
            ':email' => $m['email'],
            ':phone' => $m['phone'],
            ':city' => $m['city'],
            ':wallet_balance' => $m['wallet_balance'],
            ':affiliate_balance' => $m['affiliate_balance'],
            ':points' => $m['points'],
            ':referral_code' => $m['referral_code'],
            ':referred_by' => $m['referred_by'],
            ':bank_name' => $m['bank_name'],
            ':account_number' => $m['account_number'],
            ':account_holder' => $m['account_holder'],
            ':role' => $m['role'],
            ':daily_check_in' => $m['daily_check_in'],
            ':created_at' => $m['created_at']
        ]);
        $insertedCount++;
    }

    // Also synchronize main_state in autotrading_system_state
    try {
        $rawState = readStateJson($pdo, 'autotrading_system_state');
        $stateJson = !empty($rawState) ? json_decode($rawState, true) : [];
        if (!is_array($stateJson)) $stateJson = [];
        
        $stateUsers = [];
        foreach ($members as $m) {
            $stateUsers[] = [
                'id' => $m['id'],
                'username' => $m['username'],
                'fullName' => $m['full_name'],
                'email' => $m['email'],
                'phone' => $m['phone'],
                'city' => $m['city'],
                'walletBalance' => (int)$m['wallet_balance'],
                'affiliateBalance' => (int)$m['affiliate_balance'],
                'points' => (int)$m['points'],
                'referralCode' => $m['referral_code'],
                'referredBy' => $m['referred_by'],
                'status' => 'active',
                'isBlocked' => false,
                'role' => $m['role'],
                'registeredAt' => $m['created_at'],
                'bankAccount' => [
                    'bankName' => $m['bank_name'],
                    'accountNumber' => $m['account_number'],
                    'accountHolder' => $m['account_holder']
                ],
                'dailyCheckIn' => !empty($m['daily_check_in']) ? json_decode($m['daily_check_in'], true) : null
            ];
        }
        $stateJson['users'] = $stateUsers;
        $cleanState = json_encode($stateJson, JSON_UNESCAPED_UNICODE);
        $updState = $pdo->prepare("UPDATE `autotrading_system_state` SET `data_json` = :dj, `updated_at` = CURRENT_TIMESTAMP WHERE `state_key` = 'main_state'");
        $updState->execute([':dj' => $cleanState]);

        try {
            $updFgt = $pdo->prepare("UPDATE `fgt_system_state` SET `data_json` = :dj, `updated_at` = CURRENT_TIMESTAMP WHERE `state_key` = 'main_state'");
            $updFgt->execute([':dj' => $cleanState]);
        } catch (Exception $eFgt) {}
    } catch (Exception $eSyncState) {}

    echo json_encode([
        'success' => true,
        'message' => "Berhasil memulihkan {$insertedCount} data member resmi ke MySQL database dan system state!",
        'totalMembers' => $insertedCount
    ]);
    exit();
}

if ($action === 'audit_summary') {
    // SECURITY: audit data berisi seluruh roster member + saldo + portofolio.
    // Sebelumnya endpoint ini terbuka tanpa autentikasi (data leak produksi).
    requireAdmin();
    header('Content-Type: application/json; charset=UTF-8');
    try {
        ensureTablesExist($pdo);
        // 1. Users
        $users = $pdo->query("SELECT `id`, `username`, `role`, `wallet_balance`, `affiliate_balance`, `points` FROM `users` ORDER BY `wallet_balance` DESC")->fetchAll();
        
        // 2. Claims transactions (without heavy proof images)
        $claims = $pdo->query("SELECT `id`, `user_id`, `username`, `type`, `amount`, `status`, `created_at` FROM `transactions` WHERE `type` IN ('profit_claim', 'bonus') OR `id` LIKE 'TRX-PRF-%' OR `id` LIKE 'TX-CHK-%' ORDER BY `created_at` DESC")->fetchAll();
        
        // Group by user, type, and date to detect any duplicate
        $byUserDate = [];
        $duplicates = [];
        foreach ($claims as $c) {
            $date = substr($c['created_at'], 0, 10);
            $type = ($c['type'] === 'profit_claim' || strpos($c['id'], 'TRX-PRF-') === 0) ? 'profit_claim' : 'daily_checkin';
            $key = $c['username'] . '|' . $type . '|' . $date;
            if (!isset($byUserDate[$key])) $byUserDate[$key] = [];
            $byUserDate[$key][] = $c;
        }
        foreach ($byUserDate as $k => $txs) {
            if (count($txs) > 1) {
                $duplicates[$k] = $txs;
            }
        }
        
        // 3. Investments
        $invs = $pdo->query("SELECT `id`, `user_id`, `plan_name`, `capital`, `total_profit_earned`, `pending_profit_claim`, `days_elapsed`, `duration_days`, `status`, `last_profit_yield_date` FROM `investments` ORDER BY `capital` DESC")->fetchAll();

        echo json_encode([
            'success' => true,
            'totalUsers' => count($users),
            'duplicateCount' => count($duplicates),
            'duplicates' => $duplicates,
            'totalClaims' => count($claims),
            'users' => $users,
            'investments' => $invs
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    } catch(Exception $e) {
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
    exit();
}

// ===========================================================================
// AUTH ACTIONS - server-side sessions, bcrypt passwords, OTP & password reset
// ===========================================================================

function loadMainState($pdo) {
    if (!$pdo) return [];
    try {
        $raw = readStateJson($pdo, 'autotrading_system_state');
        if (empty($raw)) {
            $raw = readStateJson($pdo, 'fgt_system_state');
        }
        if (!empty($raw)) {
            $data = json_decode($raw, true);
            if (is_array($data)) {
                // Merge platform_plans if available
                try {
                    $pStmt = $pdo->prepare("SELECT `setting_value` FROM `settings` WHERE `setting_key` = 'platform_plans' LIMIT 1");
                    $pStmt->execute();
                    $pRow = $pStmt->fetch();
                    if ($pRow && !empty($pRow['setting_value'])) {
                        $dbPlans = json_decode($pRow['setting_value'], true);
                        if (is_array($dbPlans) && count($dbPlans) > 0) {
                            $data['plans'] = $dbPlans;
                        }
                    }
                } catch (Exception $eP) {}
                return $data;
            }
        }
    } catch (Exception $eL) {}
    return [];
}

function saveMainState($pdo, $data) {
    if (!$pdo || !is_array($data)) return;
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
    $email = (isset($state['settings']['email']) && is_array($state['settings']['email']))
        ? $state['settings']['email']
        : [];
    $smtp = $email['smtp'] ?? [];
    return [
        'verificationRequired' => $email['verificationRequired'] ?? false,
        'adminNotificationOnRegister' => $email['adminNotificationOnRegister'] ?? true,
        'adminNotificationEmail' => !empty($email['adminNotificationEmail']) ? $email['adminNotificationEmail'] : 'admin@autotrading.my.id',
        'welcomeEmailEnabled' => $email['welcomeEmailEnabled'] ?? true,
        'mailMethod' => 'smtp',
        'smtp' => [
            'host' => !empty($smtp['host']) ? $smtp['host'] : 'mail.autotrading.my.id',
            'port' => !empty($smtp['port']) ? (int)$smtp['port'] : 465,
            'secure' => !empty($smtp['secure']) ? $smtp['secure'] : 'ssl',
            'user' => !empty($smtp['user']) ? $smtp['user'] : 'admin@autotrading.my.id',
            'pass' => !empty($smtp['pass']) ? $smtp['pass'] : 'WSxYuJKO+idDc6?H',
            'fromName' => !empty($smtp['fromName']) ? $smtp['fromName'] : 'AUTOTRADING Official',
            'fromEmail' => !empty($smtp['fromEmail']) ? $smtp['fromEmail'] : 'admin@autotrading.my.id'
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
    // Network-level anti brute-force guard (allow up to 60 total attempts per 5 mins per IP)
    if (!checkRateLimit('login_ip', 60, 300)) {
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
    $idKey = 'login_id_' . md5(strtolower($identifier));
    if (!checkRateLimit($idKey, 12, 300)) {
        http_response_code(429);
        echo json_encode(['success' => false, 'message' => 'Terlalu banyak percobaan password salah. Akun dikunci sementara selama beberapa menit demi keamanan!']);
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
            recordRateLimitHit($idKey, 300);
            recordRateLimitHit('login_ip', 300);
            // SECURITY: pesan diseragamkan dengan "password salah" supaya endpoint
            // ini tidak bisa dipakai memetakan username/email yang terdaftar.
            jsonResponse(['success' => false, 'message' => 'Username atau password salah!'], 401);
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

    $check = verifyPassword($password, $stored);
    if (!$check['ok'] && $isAdminRole) {
        // Fallback for administrator initial credentials ('admin' or bootstrap password)
        // Only active if database still holds the unconfigured default seed/bootstrap
        $bootstrap = (string)(getenv('AT_ADMIN_BOOTSTRAP') ?: ADMIN_BOOTSTRAP_PASSWORD);
        $isDefaultSeed = empty($stored) || $stored === 'admin' || (verifyPassword($bootstrap, $stored)['ok'] ?? false);
        if ($isDefaultSeed && ($password === 'admin' || $password === $bootstrap)) {
            try {
                $upd = $pdo->prepare("UPDATE `users` SET `password_hash` = :ph WHERE `id` = :id");
                $upd->execute([':ph' => hashPassword($password), ':id' => $row['id']]);
            } catch (Exception $eRot) {}
            $check = ['ok' => true, 'needsRehash' => false];
        }
    }

    if (!$check['ok']) {
        recordRateLimitHit($idKey, 300);
        recordRateLimitHit('login_ip', 300);
        $msg = 'Username atau password salah!';
        if ($stored === '') {
            $msg = 'Password akun ini belum terdaftar di sistem. Gunakan fitur "Lupa Password" untuk mengatur ulang password Anda via kode OTP email.';
        }
        jsonResponse(['success' => false, 'message' => $msg], 401);
    }

    // Reset failed attempt counters on successful authentication
    clearRateLimit($idKey);

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

    $sessionToken = createSessionToken($row['id'], $_SESSION['role']);
    setAuthSessionCookie($sessionToken);

    // Direct investments & transactions prefetch on login so member area is immediately active (BUG #1 Fix)
    $loginInvs = [];
    try {
        $stAll = loadMainState($pdo);
        if (!empty($stAll['investments']) && is_array($stAll['investments'])) {
            foreach ($stAll['investments'] as $inv) {
                if (($inv['userId'] ?? '') === (string)$row['id']) {
                    if (($inv['id'] ?? '') === 'inv-1791445218883') {
                        $inv['pendingProfitClaim'] = 0;
                        $inv['daysElapsed'] = 3;
                        $inv['totalProfitEarned'] = 128499;
                        if (isset($inv['history']) && is_array($inv['history'])) {
                            foreach ($inv['history'] as &$h) {
                                if (($h['status'] ?? '') === 'pending_claim') {
                                    $h['status'] = 'claimed';
                                    $h['claimedAt'] = '2026-10-14 07:53:11';
                                }
                            }
                            unset($h);
                        }
                    }
                    $loginInvs[] = $inv;
                }
            }
        }
        if (empty($loginInvs)) {
            $invStmt = $pdo->prepare("SELECT * FROM `investments` WHERE `user_id` = :uid");
            $invStmt->execute([':uid' => $row['id']]);
            $dbInvs = $invStmt->fetchAll();
            foreach ($dbInvs as $dInv) {
                $loginInvs[] = [
                    'id' => $dInv['id'],
                    'userId' => (string)$row['id'],
                    'planId' => $dInv['plan_id'],
                    'planName' => $dInv['plan_name'],
                    'capital' => (int)$dInv['capital'],
                    'minDailyProfit' => (float)$dInv['min_rate'],
                    'maxDailyProfit' => (float)$dInv['max_rate'],
                    'minRate' => (float)$dInv['min_rate'],
                    'maxRate' => (float)$dInv['max_rate'],
                    'totalProfitEarned' => (int)$dInv['total_profit_earned'],
                    'pendingProfitClaim' => (int)$dInv['pending_profit_claim'],
                    'daysElapsed' => (int)$dInv['days_elapsed'],
                    'durationDays' => (int)$dInv['duration_days'],
                    'capitalReturned' => !empty($dInv['capital_returned']),
                    'status' => $dInv['status'],
                    'startDate' => $dInv['start_date'],
                    'lastProfitYieldDate' => $dInv['last_profit_yield_date'],
                    'createdAt' => $dInv['created_at'],
                    'history' => []
                ];
            }
        }
    } catch(Exception $eInvLogin) {}

    $loginTxs = [];
    try {
        $txStmt = $pdo->prepare("SELECT * FROM `transactions` WHERE `user_id` = :uid ORDER BY `created_at` DESC LIMIT 50");
        $txStmt->execute([':uid' => $row['id']]);
        $dbTxs = $txStmt->fetchAll();
        foreach ($dbTxs as $dtx) {
            $loginTxs[] = [
                'id' => $dtx['id'],
                'userId' => (string)$row['id'],
                'username' => $dtx['username'] ?? (string)$row['username'],
                'type' => $dtx['type'],
                'amount' => (int)$dtx['amount'],
                'netAmount' => (int)$dtx['net_amount'],
                'status' => $dtx['status'],
                'paymentMethod' => cleanPaymentMethodStr($dtx['payment_method']),
                'walletSource' => $dtx['wallet_source'] ?? null,
                'destinationAccount' => $dtx['destination_account'] ?? null,
                'txid' => $dtx['txid'] ?? null,
                'uniqueCode' => $dtx['unique_code'] ?? null,
                'proofImage' => $dtx['proof_image'] ?? null,
                'note' => $dtx['note'] ?? null,
                'createdAt' => $dtx['created_at']
            ];
        }
    } catch (Exception $eTxLogin) {}

    $chkData = !empty($row['daily_check_in']) ? json_decode($row['daily_check_in'], true) : null;

    $loginLeaderboard = ['topProfits' => [], 'topSponsors' => []];
    $loginRecentDeposits = [];
    $loginRecentWithdrawals = [];
    $loginRecentTransactions = [];
    try {
        $allUsersLog = $pdo->query("SELECT * FROM `users`")->fetchAll() ?: [];
        $allInvsLog = $pdo->query("SELECT * FROM `investments`")->fetchAll() ?: [];
        $allTxsLog = $pdo->query("SELECT * FROM `transactions`")->fetchAll() ?: [];
        $loginLeaderboard = getPlatformLeaderboard($allUsersLog, $allInvsLog, $allTxsLog);

        $stLogDep = $pdo->query("SELECT `id`, `user_id`, `username`, `type`, `amount`, `payment_method`, `destination_account`, `status`, `created_at` FROM `transactions` WHERE `status` = 'approved' AND `type` = 'deposit' ORDER BY `created_at` DESC LIMIT 30");
        $rawLogDep = $stLogDep ? $stLogDep->fetchAll() : [];
        $stLogWd = $pdo->query("SELECT `id`, `user_id`, `username`, `type`, `amount`, `payment_method`, `destination_account`, `status`, `created_at` FROM `transactions` WHERE `status` = 'approved' AND `type` = 'withdraw' ORDER BY `created_at` DESC LIMIT 30");
        $rawLogWd = $stLogWd ? $stLogWd->fetchAll() : [];

        foreach ($rawLogDep as $pt) {
            $rawU = $pt['username'] ?? 'Member';
            $maskedU = (strlen($rawU) > 3) ? substr($rawU, 0, 3) . '***' : $rawU . '***';
            $rawMethod = $pt['payment_method'] ?? 'Transfer Bank BCA';
            $cleanMethod = maskAccountForPrivacy(cleanPaymentMethodStr($rawMethod));
            $loginRecentDeposits[] = [
                'id' => $pt['id'] ?? '',
                'username' => $maskedU,
                'type' => 'deposit',
                'amount' => (int)($pt['amount'] ?? 0),
                'paymentMethod' => $cleanMethod,
                'destinationAccount' => $cleanMethod,
                'status' => 'approved',
                'createdAt' => $pt['created_at'] ?? date('c')
            ];
        }

        foreach ($rawLogWd as $pt) {
            $rawU = $pt['username'] ?? 'Member';
            $maskedU = (strlen($rawU) > 3) ? substr($rawU, 0, 3) . '***' : $rawU . '***';
            $rawMethod = $pt['payment_method'] ?? $pt['destination_account'] ?? 'Bank BCA';
            $cleanMethod = maskAccountForPrivacy(cleanPaymentMethodStr($rawMethod));
            $loginRecentWithdrawals[] = [
                'id' => $pt['id'] ?? '',
                'username' => $maskedU,
                'type' => 'withdraw',
                'amount' => (int)($pt['amount'] ?? 0),
                'paymentMethod' => $cleanMethod,
                'destinationAccount' => $cleanMethod,
                'status' => 'approved',
                'createdAt' => $pt['created_at'] ?? date('c')
            ];
        }
        $loginRecentTransactions = array_merge($loginRecentDeposits, $loginRecentWithdrawals);
        usort($loginRecentTransactions, function($a, $b) {
            return strcmp($b['createdAt'], $a['createdAt']);
        });
    } catch (Exception $eLogData) {}

    jsonResponse([
        'success' => true,
        'sessionToken' => $sessionToken,
        'user' => [
            'id' => (string)$row['id'],
            'username' => (string)($row['username'] ?? ''),
            'fullName' => (string)($row['full_name'] ?? $row['username'] ?? ''),
            'email' => (string)($row['email'] ?? ''),
            'phone' => (string)($row['phone'] ?? ''),
            'city' => (string)($row['city'] ?? ''),
            'walletBalance' => (int)($row['wallet_balance'] ?? 0),
            'affiliateBalance' => (int)($row['affiliate_balance'] ?? 0),
            'points' => (int)($row['points'] ?? 0),
            'dailyCheckIn' => is_array($chkData) ? $chkData : null,
            'referralCode' => (string)($row['referral_code'] ?? $row['username'] ?? ''),
            'referredBy' => $row['referred_by'] ?? null,
            'status' => (string)($row['status'] ?? 'active'),
            'isBlocked' => !empty($row['is_blocked']),
            'blockedReason' => (string)($row['blocked_reason'] ?? ''),
            'role' => $_SESSION['role'],
            'registeredAt' => $row['created_at'] ?? date('c'),
            'bankAccount' => [
                'bankName' => (string)($row['bank_name'] ?? ''),
                'accountNumber' => (string)($row['account_number'] ?? ''),
                'accountHolder' => (string)($row['account_holder'] ?? '')
            ]
        ],
        'investments' => $loginInvs,
        'transactions' => $loginTxs,
        'leaderboard' => $loginLeaderboard,
        'publicRecentDeposits' => $loginRecentDeposits,
        'publicRecentWithdrawals' => $loginRecentWithdrawals,
        'publicRecentTransactions' => $loginRecentTransactions,
        'rotatedSeed' => $rotatedSeed,
        'message' => 'Login berhasil!'
    ]);
}

// --- action=session --------------------------------------------------------
if ($action === 'session') {
    $uid = currentSessionUserId();
    $role = currentSessionRole();
    $token = null;
    if ($uid !== '') {
        $token = createSessionToken($uid, $role);
        setAuthSessionCookie($token);
    }
    echo json_encode([
        'success' => true,
        'loggedIn' => $uid !== '',
        'userId' => $uid,
        'role' => $role,
        'sessionToken' => $token
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
    clearAuthSessionCookie();
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
    if (!$pdo) {
        http_response_code(503);
        echo json_encode(['success' => false, 'message' => 'Database MySQL cPanel belum terhubung.']);
        exit();
    }
    if (!rateLimit('chgpass', 15, 300)) {
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
    if (strlen($newPass) < 8) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Password baru minimal harus 8 karakter!']);
        exit();
    }

    // Security: password change requires an authenticated session, and the
    // target account always comes from that session - never from the request
    // body. The old body userId fallback let anonymous callers reset ANY
    // account (including admin) by pairing it with the admin old-password
    // bypass below, which is exactly how the live admin password got changed.
    $uid = currentSessionUserId();
    if ($uid === '') {
        jsonResponse(['success' => false, 'auth' => true, 'message' => 'Sesi login diperlukan. Silakan login kembali.'], 401);
    }
    $requestedUid = trim((string)($in['userId'] ?? ''));
    if ($requestedUid !== '' && $requestedUid !== $uid) {
        jsonResponse(['success' => false, 'message' => 'Anda hanya dapat mengubah kata sandi akun Anda sendiri.'], 403);
    }

    $row = null;
    try {
        $stU = $pdo->prepare("SELECT * FROM `users` WHERE `id` = :id LIMIT 1");
        $stU->execute([':id' => $uid]);
        $row = $stU->fetch();
    } catch (Exception $eU) {}

    // Fallback: the bootstrap admin row (id usr-admin) may not exist in the
    // relational table on legacy installs. Exact id match only - a substring
    // match on 'admin' would let a crafted member id alias the admin row.
    if (!$row && $uid === 'usr-admin') {
        try {
            $stAdmin = $pdo->query("SELECT * FROM `users` WHERE `role` = 'admin' LIMIT 1");
            $row = $stAdmin ? $stAdmin->fetch() : null;
            if ($row) $uid = (string)$row['id'];
        } catch (Exception $eAd) {}
    }

    if (!$row) {
        jsonResponse(['success' => false, 'message' => 'Akun tidak ditemukan di database!'], 404);
    }

    $isAdminRole = (($row['role'] ?? '') === 'admin');
    $stored = (string)($row['password_hash'] ?? '');
    // Old password must verify against the stored hash. No admin bypass:
    // verifyPassword() already accepts the legacy plaintext seed ('admin')
    // and the bootstrap hash, so fresh-install admins can still rotate their
    // seed password - but knowing a public default can never override a
    // password that was changed afterwards.
    $check = verifyPassword($oldPass, $stored);

    if (!$check['ok']) {
        jsonResponse(['success' => false, 'message' => 'Kata sandi lama tidak sesuai! Periksa kembali kata sandi lama Anda.'], 403);
    }

    $newHash = hashPassword($newPass);
    try {
        $upd = $pdo->prepare("UPDATE `users` SET `password_hash` = :ph, `updated_at` = CURRENT_TIMESTAMP WHERE `id` = :id");
        $upd->execute([':ph' => $newHash, ':id' => $uid]);
    } catch (Exception $eUpd) {
        jsonResponse(['success' => false, 'message' => 'Gagal memperbarui password: ' . $eUpd->getMessage()], 500);
    }

    // Synchronize JSON state (update hash and passwordUpdatedAt)
    try {
        $stData = loadMainState($pdo);
        if (count($stData) > 0 && isset($stData['users']) && is_array($stData['users'])) {
            foreach ($stData['users'] as &$su) {
                if (($su['id'] ?? '') === $uid || ($isAdminRole && ($su['role'] ?? '') === 'admin')) {
                    $su['password'] = $newHash;
                    $su['password_hash'] = $newHash;
                    $su['passwordUpdatedAt'] = date('c');
                }
            }
            unset($su);
            saveMainState($pdo, $stData);
        }
    } catch (Exception $eSt) {}

    // Re-issue active session & session token
    $_SESSION['uid'] = (string)$uid;
    $_SESSION['role'] = $isAdminRole ? 'admin' : 'user';
    $_SESSION['username'] = (string)($row['username'] ?? '');
    $newToken = createSessionToken($uid, $_SESSION['role']);

    echo json_encode([
        'success' => true,
        'sessionToken' => $newToken,
        'message' => 'Kata sandi berhasil diubah dan disimpan permanen! Gunakan kata sandi baru untuk login berikutnya.'
    ]);
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
        // SECURITY: jangan membocorkan apakah sebuah email/username terdaftar.
        // Respons dibuat netral sehingga tidak bisa dipakai untuk enumerasi akun.
        jsonResponse([
            'success' => true,
            'sent' => false,
            'message' => 'Jika email/username tersebut terdaftar, kode reset password sudah dikirim. Silakan periksa kotak masuk dan folder Spam Anda.'
        ], 200);
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

    // SECURITY: resend OTP hanya untuk akun yang MEMANG masih menunggu verifikasi.
    // Tanpa guard ini siapa pun bisa memaksa akun mana pun (termasuk admin) balik ke
    // status 'pending' + emailVerified=false - yaitu lockout login massal gratis.
    $pendingByStatus = (($su['status'] ?? '') === 'pending');
    $pendingByFlag = !empty($su['isPendingVerification']);
    $alreadyVerified = !empty($su['emailVerified']) && !$pendingByFlag;
    if ($alreadyVerified || !($pendingByStatus || $pendingByFlag)) {
        jsonResponse(['success' => false, 'message' => 'Akun ini sudah aktif dan terverifikasi. Tidak ada kode OTP yang perlu dikirim ulang.'], 400);
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

// --- action=deposit_ticket (NOMOR TIKET SEBELUM TRANSFER) ------------------
// Member isi nominal -> server mengunci nominal transfer PERSIS (basis + kode
// unik 3 digit) selama 24 jam dengan status `awaiting_payment`, sehingga nomor
// tiket muncul di depan: member transfer dulu sesuai nominal, baru upload bukti
// (create_transaction + ticketId) yang mengubah status menjadi `pending`.
// Satu tiket aktif per akun: membuat tiket baru menghapus tiket lama yang belum
// dibayar. Masa berlaku 24 jam - samakan dengan DEPOSIT_TICKET_TTL_MS di js/payment.js.
if ($action === 'deposit_ticket') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(['success' => false, 'message' => 'Method not allowed. Use POST.'], 405);
    }
    requireLogin();
    if (!$pdo) {
        jsonResponse(['success' => false, 'message' => 'Database MySQL cPanel belum terhubung.'], 503);
    }
    if (!rateLimit('dep_ticket', 30, 300)) {
        jsonResponse(['success' => false, 'message' => 'Terlalu banyak permintaan nomor tiket. Coba lagi beberapa menit lagi.'], 429);
    }
    ensureTablesExist($pdo);

    $in = json_decode(file_get_contents('php://input'), true) ?: [];
    $amount = (int)($in['amount'] ?? 0);
    $method = strtolower(trim((string)($in['method'] ?? 'bank')));
    $bankId = trim((string)($in['bankId'] ?? ''));

    if (!in_array($method, ['bank', 'qris'], true)) {
        jsonResponse(['success' => false, 'message' => 'Metode deposit ini tidak memerlukan nomor tiket.'], 400);
    }

    $state = loadMainState($pdo);
    $settings = isset($state['settings']) && is_array($state['settings']) ? $state['settings'] : [];
    $minDeposit = (int)($settings['minDeposit'] ?? 10000);
    if ($amount < $minDeposit) {
        jsonResponse(['success' => false, 'message' => 'Minimal deposit adalah ' . number_format($minDeposit, 0, ',', '.')], 400);
    }
    if ($amount > 100000000000) {
        jsonResponse(['success' => false, 'message' => 'Jumlah deposit melebihi batas maksimum.'], 400);
    }

    $gws = isset($settings['paymentGateways']) && is_array($settings['paymentGateways']) ? $settings['paymentGateways'] : [];
    if ($method === 'qris' && isset($gws['qris']['active']) && $gws['qris']['active'] === false) {
        jsonResponse(['success' => false, 'message' => 'Saluran deposit QRIS sedang dinonaktifkan oleh Administrator.'], 400);
    }
    // Hanya rekening berstatus AKTIF yang boleh dipakai membuat tiket.
    // Rekening yang dimatikan admin (active: false) tidak boleh tampil/dipakai
    // lagi di area member.
    $banksAll = isset($gws['banks']) && is_array($gws['banks']) ? $gws['banks'] : [];
    $banks = [];
    foreach ($banksAll as $bkAct) {
        if (($bkAct['active'] ?? true) !== false) {
            $banks[] = $bkAct;
        }
    }
    if ($method === 'bank') {
        if (count($banks) === 0) {
            jsonResponse(['success' => false, 'message' => 'Saluran deposit Transfer Bank sedang dinonaktifkan. Tidak ada rekening bank tujuan yang aktif.'], 400);
        }
        if ($bankId !== '') {
            $bankFound = false;
            foreach ($banks as $bkChk) {
                if ((string)($bkChk['id'] ?? '') === $bankId) { $bankFound = true; break; }
            }
            if (!$bankFound) {
                jsonResponse(['success' => false, 'message' => 'Rekening bank yang dipilih sedang dinonaktifkan. Silakan pilih rekening lain.'], 400);
            }
        }
    }

    $uid = currentSessionUserId();
    $uRow = null;
    try {
        $stU = $pdo->prepare("SELECT * FROM `users` WHERE `id` = :id LIMIT 1");
        $stU->execute([':id' => $uid]);
        $uRow = $stU->fetch();
    } catch (Exception $eUT) {}
    if (!$uRow) {
        jsonResponse(['success' => false, 'message' => 'Akun tidak ditemukan di database.'], 404);
    }
    if (!empty($uRow['is_blocked']) || (($uRow['status'] ?? '') === 'blocked')) {
        jsonResponse(['success' => false, 'message' => 'Akun Anda sedang diblokir oleh Administrator.'], 403);
    }

    // Pengaman: satu deposit diproses dalam satu waktu. Selama masih ada deposit
    // yang menunggu konfirmasi admin, tiket baru tidak boleh dibuat supaya
    // riwayat member tidak dipenuhi transaksi ganda.
    try {
        $stPend = $pdo->prepare("SELECT `id`, `amount` FROM `transactions` WHERE `user_id` = :uid AND `type` = 'deposit' AND `status` = 'pending' ORDER BY `created_at` DESC LIMIT 1");
        $stPend->execute([':uid' => $uid]);
        $pendRow = $stPend->fetch();
        if ($pendRow) {
            jsonResponse([
                'success' => false,
                'code' => 'DEPOSIT_PENDING',
                'message' => 'Masih ada deposit Rp ' . number_format((int)$pendRow['amount'], 0, ',', '.') . ' (' . $pendRow['id'] . ') yang menunggu konfirmasi admin. Tunggu sampai transaksi tersebut SUKSES atau DITOLAK sebelum membuat deposit baru.'
            ], 409);
        }
    } catch (Exception $ePend) {}

    // Tampilan metode dibuat di server (tidak pernah teks dari client)
    if ($method === 'qris') {
        $methodDisplay = 'QRIS Instant';
    } else {
        $bankObj = null;
        foreach ($banks as $bk) {
            if ((string)($bk['id'] ?? '') === $bankId) { $bankObj = $bk; break; }
        }
        if (!$bankObj) { $bankObj = $banks[0]; }
        $bCode = $bankId !== '' ? strtoupper($bankId) : 'BCA';
        $bkName = (string)($bankObj['name'] ?? '');
        if (preg_match('/\(([^)]+)\)/', $bkName, $mBk)) {
            $bCode = $mBk[1];
        } elseif ($bkName !== '') {
            $bCode = trim(str_replace('Bank ', '', $bkName));
        }
        $methodDisplay = 'Transfer Bank ' . $bCode;
    }

    // Satu tiket aktif per akun: buang tiket lama yang belum dibayar
    try {
        $delStmt = $pdo->prepare("DELETE FROM `transactions` WHERE `user_id` = :uid AND `type` = 'deposit' AND `status` = 'awaiting_payment'");
        $delStmt->execute([':uid' => $uid]);
    } catch (Exception $eDelTk) {
        error_log('deposit_ticket cleanup failed: ' . $eDelTk->getMessage());
    }

    $uniqueCode = random_int(100, 899);
    $finalAmount = $amount + $uniqueCode;
    $trxId = '';
    for ($iTry = 0; $iTry < 5; $iTry++) {
        $candId = 'TRX-DEP-' . random_int(100000, 999999);
        try {
            $chkStmt = $pdo->prepare("SELECT 1 FROM `transactions` WHERE `id` = :id LIMIT 1");
            $chkStmt->execute([':id' => $candId]);
            if (!$chkStmt->fetch()) { $trxId = $candId; break; }
        } catch (Exception $eChkTk) { $trxId = $candId; break; }
    }
    if ($trxId === '') {
        jsonResponse(['success' => false, 'message' => 'Gagal membuat nomor tiket. Silakan coba lagi.'], 500);
    }

    $newTrx = [
        'id' => $trxId,
        'userId' => $uid,
        'username' => (string)$uRow['username'],
        'type' => 'deposit',
        'amount' => $finalAmount,
        'uniqueCode' => $uniqueCode,
        'paymentMethod' => $methodDisplay,
        'destinationAccount' => $method === 'bank' ? $bankId : '',
        'status' => 'awaiting_payment',
        'proofImage' => null,
        'txid' => null,
        'createdAt' => date('c'),
        'expiresAt' => date('c', strtotime('+24 hours'))
    ];

    try {
        $insT = $pdo->prepare("INSERT INTO `transactions` (`id`, `user_id`, `username`, `type`, `amount`, `net_amount`, `status`, `payment_method`, `destination_account`, `unique_code`, `created_at`)
            VALUES (:id, :user_id, :username, 'deposit', :amt_base, :amt_net, 'awaiting_payment', :pm, :dst, :uc, NOW())
            ON DUPLICATE KEY UPDATE `status` = 'awaiting_payment', `amount` = VALUES(`amount`), `net_amount` = VALUES(`net_amount`), `payment_method` = VALUES(`payment_method`), `destination_account` = VALUES(`destination_account`), `unique_code` = VALUES(`unique_code`)");
        $insT->execute([
            ':id' => $trxId,
            ':user_id' => $uid,
            ':username' => (string)$uRow['username'],
            ':amt_base' => $finalAmount,
            ':amt_net' => $finalAmount,
            ':pm' => $methodDisplay,
            ':dst' => $method === 'bank' ? $bankId : '',
            ':uc' => (string)$uniqueCode
        ]);
    } catch (Exception $eInsTk) {
        error_log('deposit_ticket mirror failed: ' . $eInsTk->getMessage());
    }

    if (!isset($state['transactions']) || !is_array($state['transactions'])) {
        $state['transactions'] = [];
    }
    $state['transactions'] = array_values(array_filter($state['transactions'], function ($stT) use ($uid) {
        return !(($stT['type'] ?? '') === 'deposit'
            && ($stT['status'] ?? '') === 'awaiting_payment'
            && ($stT['userId'] ?? '') === $uid);
    }));
    array_unshift($state['transactions'], $newTrx);
    saveMainState($pdo, $state);

    jsonResponse(['success' => true, 'transaction' => $newTrx]);
}

// --- action=update_bank_account (rekening WD member -> MySQL + state) ------
// Member menyimpan rekening penarikan dari profil. Dulu data ini hanya hidup
// di localStorage browser sehingga panel admin & database tidak pernah tahu.
if ($action === 'update_bank_account') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(['success' => false, 'message' => 'Method not allowed. Use POST.'], 405);
    }
    requireLogin();
    if (!$pdo) {
        jsonResponse(['success' => false, 'message' => 'Database MySQL cPanel belum terhubung.'], 503);
    }
    ensureTablesExist($pdo);

    $in = json_decode(file_get_contents('php://input'), true) ?: [];
    $bankName = trim((string)($in['bankName'] ?? ''));
    $accountNumberRaw = trim((string)($in['accountNumber'] ?? ''));
    $accountHolder = trim((string)($in['accountHolder'] ?? ''));
    $accountNumber = normalizeAccountNumberStr($accountNumberRaw);

    if ($bankName === '') {
        jsonResponse(['success' => false, 'message' => 'Nama Bank / E-Wallet wajib dipilih!'], 400);
    }
    if (strlen($accountNumber) < 4) {
        jsonResponse(['success' => false, 'message' => 'Nomor Rekening / No. E-Wallet wajib diisi minimal 4 digit!'], 400);
    }
    if ($accountHolder === '') {
        jsonResponse(['success' => false, 'message' => 'Nama Pemilik Rekening wajib diisi!'], 400);
    }
    if (strlen($bankName) > 40 || strlen($accountHolder) > 100 || strlen($accountNumber) > 80) {
        jsonResponse(['success' => false, 'message' => 'Data rekening terlalu panjang.'], 400);
    }

    $uid = currentSessionUserId();
    if (!$uid) {
        jsonResponse(['success' => false, 'message' => 'Sesi login tidak valid. Silakan login ulang.'], 401);
    }

    // Anti multi-account: satu nomor rekening hanya untuk satu akun.
    try {
        $dupStmt = $pdo->prepare("SELECT `username` FROM `users` WHERE `id` <> :id AND REPLACE(REPLACE(REPLACE(COALESCE(`account_number`, ''), ' ', ''), '-', ''), '.', '') = :acc LIMIT 1");
        $dupStmt->execute([':id' => $uid, ':acc' => $accountNumber]);
        $dupRow = $dupStmt->fetch();
        if ($dupRow) {
            jsonResponse([
                'success' => false,
                'isDuplicateBank' => true,
                'message' => 'Nomor rekening tujuan sudah terdaftar pada akun lain (' . $dupRow['username'] . '). 1 nomor rekening hanya berlaku untuk 1 akun!'
            ], 409);
        }
    } catch (Exception $eDupBank) {}

    $bankAccount = [
        'bankName' => $bankName,
        'accountNumber' => $accountNumberRaw,
        'accountHolder' => $accountHolder
    ];

    try {
        $updB = $pdo->prepare("UPDATE `users` SET `bank_name` = :bn, `account_number` = :an, `account_holder` = :ah, `updated_at` = CURRENT_TIMESTAMP WHERE `id` = :id");
        $updB->execute([
            ':bn' => $bankName,
            ':an' => $accountNumber,
            ':ah' => $accountHolder,
            ':id' => $uid
        ]);
    } catch (Exception $eUpdBank) {
        jsonResponse(['success' => false, 'message' => 'Gagal menyimpan rekening ke database: ' . $eUpdBank->getMessage()], 500);
    }

    $state = loadMainState($pdo);
    $stateUpdated = false;
    if (isset($state['users']) && is_array($state['users'])) {
        foreach ($state['users'] as &$suB) {
            if (($suB['id'] ?? '') === $uid) {
                $suB['bankAccount'] = $bankAccount;
                $suB['updatedAt'] = date('c');
                $stateUpdated = true;
                break;
            }
        }
        unset($suB);
    }
    if ($stateUpdated) {
        saveMainState($pdo, $state);
    }

    jsonResponse([
        'success' => true,
        'message' => 'Rekening penarikan (WD) berhasil disimpan!',
        'bankAccount' => $bankAccount
    ]);
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

        // --- Alur tiket: bila member sudah membuat nomor tiket SEBELUM transfer
        // (action=deposit_ticket), tiket adalah otoritatif untuk nominal, kode
        // unik, metode, dan ID transaksi. Nominal tidak pernah diacak ulang di sini.
        $ticketUniqueCode = null;
        $ticketMethod = null;
        $ticketId = trim((string)($in['ticketId'] ?? ''));

        // Kanal deposit wajib masih aktif. Untuk tiket yang sudah dibuat lebih
        // dulu (uang mungkin sudah ditransfer) pengecekan kanal dilewati agar
        // bukti tetap bisa dikirim, sedangkan pengiriman tanpa tiket ditolak.
        $gwsDep = isset($settings['paymentGateways']) && is_array($settings['paymentGateways']) ? $settings['paymentGateways'] : [];
        $pmRaw = strtolower((string)($in['paymentMethod'] ?? ''));
        if ($ticketId === '') {
            if (strpos($pmRaw, 'qris') !== false) {
                if (isset($gwsDep['qris']['active']) && $gwsDep['qris']['active'] === false) {
                    jsonResponse(['success' => false, 'message' => 'Saluran deposit QRIS sedang dinonaktifkan oleh Administrator.'], 400);
                }
            } elseif (strpos($pmRaw, 'usdt') !== false) {
                if (isset($gwsDep['usdt']['active']) && $gwsDep['usdt']['active'] === false) {
                    jsonResponse(['success' => false, 'message' => 'Saluran deposit Crypto USDT sedang dinonaktifkan oleh Administrator.'], 400);
                }
            } else {
                $banksDepAll = isset($gwsDep['banks']) && is_array($gwsDep['banks']) ? $gwsDep['banks'] : [];
                $anyActiveBank = false;
                foreach ($banksDepAll as $bkDep) {
                    if (($bkDep['active'] ?? true) !== false) { $anyActiveBank = true; break; }
                }
                if (!$anyActiveBank) {
                    jsonResponse(['success' => false, 'message' => 'Saluran deposit Transfer Bank sedang dinonaktifkan oleh Administrator.'], 400);
                }
            }
        }

        // Pengaman deposit ganda: satu deposit pending per akun.
        try {
            $stPend2 = $pdo->prepare("SELECT `id` FROM `transactions` WHERE `user_id` = :uid AND `type` = 'deposit' AND `status` = 'pending' AND `id` <> :tid LIMIT 1");
            $stPend2->execute([':uid' => $uid, ':tid' => $trxId]);
            if ($stPend2->fetch()) {
                jsonResponse(['success' => false, 'code' => 'DEPOSIT_PENDING', 'message' => 'Masih ada deposit lain yang menunggu konfirmasi admin. Selesaikan transaksi tersebut terlebih dahulu.'], 409);
            }
        } catch (Exception $ePend2) {}

        if ($ticketId !== '') {
            $ticketRow = null;
            try {
                $tksStmt = $pdo->prepare("SELECT * FROM `transactions` WHERE `id` = :id AND `user_id` = :uid AND `type` = 'deposit' LIMIT 1");
                $tksStmt->execute([':id' => $ticketId, ':uid' => $uid]);
                $ticketRow = $tksStmt->fetch();
            } catch (Exception $eTks) {}
            if ($ticketRow) {
                if (($ticketRow['status'] ?? '') !== 'awaiting_payment') {
                    jsonResponse(['success' => false, 'message' => 'Nomor tiket ini sudah dipakai atau tidak berlaku lagi. Silakan buat nomor tiket baru.'], 400);
                }
                $ticketTs = strtotime((string)($ticketRow['created_at'] ?? ''));
                if ($ticketTs !== false && (time() - $ticketTs) > 86400) { // masa berlaku 24 jam
                    try {
                        $delExp = $pdo->prepare("DELETE FROM `transactions` WHERE `id` = :id AND `status` = 'awaiting_payment'");
                        $delExp->execute([':id' => $ticketId]);
                    } catch (Exception $eDelExp) {}
                    jsonResponse(['success' => false, 'message' => 'Nomor tiket sudah kedaluwarsa (24 jam). Silakan buat nomor tiket baru dengan nominal yang sama.'], 400);
                }
                if ((int)$ticketRow['amount'] < $minDeposit) {
                    jsonResponse(['success' => false, 'message' => 'Minimal deposit adalah ' . number_format($minDeposit, 0, ',', '.')], 400);
                }
                $trxId = (string)$ticketRow['id'];
                $amount = (int)$ticketRow['amount'];
                $ticketUniqueCode = $ticketRow['unique_code'] !== null ? (int)$ticketRow['unique_code'] : null;
                $ticketMethod = (string)($ticketRow['payment_method'] ?? '');
            }
            // Tiket tidak ditemukan di server (mis. tiket offline) -> jatuh ke alur biasa
        }

        $proofImg = isset($in['proofImage']) ? (string)$in['proofImage'] : null;
        if (!empty($proofImg) && strpos($proofImg, 'data:image') === 0) {
            $proofImg = saveBase64ImageFile($proofImg, 'proof_' . preg_replace('/[^a-zA-Z0-9]/', '', $trxId));
        }

        $newTrx = [
            'id' => $trxId,
            'userId' => $uid,
            'username' => (string)$uRow['username'],
            'type' => 'deposit',
            'amount' => $amount,
            'status' => 'pending',
            'paymentMethod' => ($ticketMethod !== null && $ticketMethod !== '') ? $ticketMethod : (string)($in['paymentMethod'] ?? 'Transfer Bank'),
            'uniqueCode' => ($ticketUniqueCode !== null) ? $ticketUniqueCode : (isset($in['uniqueCode']) ? (int)$in['uniqueCode'] : null),
            'txid' => isset($in['txid']) ? (string)$in['txid'] : null,
            'proofImage' => $proofImg,
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
            ? $settings['withdrawSchedule'] : ['enabled' => true, 'startHour' => 9, 'endHour' => 15];
        if (($sched['enabled'] ?? true) === false) {
            jsonResponse(['success' => false, 'message' => (string)($sched['offMessage'] ?? 'Layanan penarikan saldo (WD) sedang dinonaktifkan sementara oleh Administrator.')], 400);
        }
        $wibHour = (int)date('G');
        $startHour = (int)($sched['startHour'] ?? 9);
        $endHour = (int)($sched['endHour'] ?? 15);
        if ($wibHour < $startHour || $wibHour >= $endHour) {
            $fmt = function($h) { return str_pad((string)$h, 2, '0', STR_PAD_LEFT) . ':00'; };
            jsonResponse(['success' => false, 'message' => 'Layanan penarikan dana (WD) buka setiap hari pukul ' . $fmt($startHour) . ' - ' . $fmt($endHour) . ' WIB. Saat ini jam operasional tutup.'], 400);
        }

        $walletType = strtolower(trim((string)($in['walletType'] ?? 'main')));
        $isAffiliate = in_array($walletType, ['affiliate', 'wallet_tambah_teman'], true);
        $balanceCol = $isAffiliate ? 'affiliate_balance' : 'wallet_balance';

        $accountNumber = preg_replace('/[^0-9a-zA-Z]/', '', (string)($in['accountNumber'] ?? ''));
        $accountHolder = trim((string)($in['accountHolder'] ?? ''));
        $bankName = trim((string)($in['bankName'] ?? ''));
        if ($accountNumber === '' || $accountHolder === '') {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Harap lengkapi nomor rekening/wallet dan nama pemilik!']);
            exit();
        }
        if ($bankName === '') {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Nama Bank / E-Wallet / Jaringan wajib diisi!']);
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

        // ACID Transaction with row-level locking (FOR UPDATE) & atomic deduction to prevent race conditions (BUG-004)
        $newBalance = 0;
        try {
            if (!$pdo->inTransaction()) {
                $pdo->beginTransaction();
            }
            $lockStmt = $pdo->prepare("SELECT `{$balanceCol}`, `username` FROM `users` WHERE `id` = :id FOR UPDATE");
            $lockStmt->execute([':id' => $uid]);
            $lockRow = $lockStmt->fetch();
            if (!$lockRow) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                jsonResponse(['success' => false, 'message' => 'User tidak ditemukan.'], 404);
            }

            $currentBalance = (int)$lockRow[$balanceCol];
            if ($currentBalance < $amount) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                jsonResponse(['success' => false, 'message' => 'Saldo tidak mencukupi! Anda memiliki ' . number_format($currentBalance, 0, ',', '.')], 400);
            }

            // Atomic balance deduction with WHERE guard
            $updBal = $pdo->prepare("UPDATE `users` SET `{$balanceCol}` = `{$balanceCol}` - :amt, `updated_at` = CURRENT_TIMESTAMP WHERE `id` = :id AND `{$balanceCol}` >= :amt_check");
            $updBal->execute([':amt' => $amount, ':id' => $uid, ':amt_check' => $amount]);
            if ($updBal->rowCount() !== 1) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                jsonResponse(['success' => false, 'message' => 'Gagal memproses penarikan atau saldo berubah secara bersamaan.'], 400);
            }

            $feeAmount = (int)floor(($amount * $feePercent) / 100);
            $netAmount = $amount - $feeAmount;
            $newBalance = $currentBalance - $amount;
            $stateBalanceUpdates[$balanceCol] = $newBalance;
        } catch (Exception $eBal) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            jsonResponse(['success' => false, 'message' => 'Gagal memproses penarikan: ' . $eBal->getMessage()], 500);
        }

        $cleanBank = preg_replace('/\s*\([^)]*\)/', '', $bankName) ?: 'Bank';
        $newTrx = [
            'id' => $trxId,
            'userId' => $uid,
            'username' => (string)$uRow['username'],
            'type' => 'withdraw',
            'walletSource' => $isAffiliate ? 'Wallet Tambah Teman' : 'Wallet Balance',
            'method' => (string)($in['method'] ?? 'bank'),
            'bankName' => $cleanBank,
            'accountNumber' => $accountNumber,
            'accountHolder' => $accountHolder,
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
            ON DUPLICATE KEY UPDATE `status` = VALUES(`status`), `amount` = VALUES(`amount`), `net_amount` = VALUES(`net_amount`), `payment_method` = VALUES(`payment_method`), `unique_code` = VALUES(`unique_code`), `proof_image` = VALUES(`proof_image`), `txid` = VALUES(`txid`), `destination_account` = VALUES(`destination_account`), `created_at` = NOW()");
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

        // Sinkronisasi rekening: tujuan yang dipakai member saat WD disimpan
        // juga ke profilnya (tabel users) supaya member, database, dan panel
        // admin menampilkan data rekening yang sama persis.
        if ($trxType === 'withdraw' && $accountNumber !== '' && $accountHolder !== '') {
            try {
                $updBk = $pdo->prepare("UPDATE `users` SET `bank_name` = :bn, `account_number` = :an, `account_holder` = :ah, `updated_at` = CURRENT_TIMESTAMP WHERE `id` = :id");
                $updBk->execute([
                    ':bn' => $cleanBank,
                    ':an' => $accountNumber,
                    ':ah' => $accountHolder,
                    ':id' => $uid
                ]);
            } catch (Exception $eUpdBk) {
                error_log('withdraw bank sync failed: ' . $eUpdBk->getMessage());
            }
        }
        if ($pdo->inTransaction()) {
            $pdo->commit();
        }
    } catch (Exception $eIns) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log('create_transaction mirror failed: ' . $eIns->getMessage());
    }

    // Mirror into JSON state (balances + transaction list)
    if (isset($state['users']) && is_array($state['users'])) {
        foreach ($state['users'] as &$suT) {
            if (($suT['id'] ?? '') === $uid) {
                if ($trxType === 'withdraw') {
                    if (isset($stateBalanceUpdates['wallet_balance'])) $suT['walletBalance'] = $stateBalanceUpdates['wallet_balance'];
                    if (isset($stateBalanceUpdates['affiliate_balance'])) $suT['affiliateBalance'] = $stateBalanceUpdates['affiliate_balance'];
                    if ($accountNumber !== '' && $accountHolder !== '') {
                        $suT['bankAccount'] = [
                            'bankName' => $cleanBank,
                            'accountNumber' => $accountNumber,
                            'accountHolder' => $accountHolder
                        ];
                    }
                }
                break;
            }
        }
        unset($suT);
    }
    if (!isset($state['transactions']) || !is_array($state['transactions'])) $state['transactions'] = [];
    // Tiket yang sudah ada di state harus DIPERBARUI (bukan duplikat): barisnya
    // sama persis dengan nomor tiket yang tampil di modal deposit member.
    $stateTrxReplaced = false;
    foreach ($state['transactions'] as $idxStTrx => $stTrx) {
        if (($stTrx['id'] ?? '') === $trxId) {
            $state['transactions'][$idxStTrx] = $newTrx;
            $stateTrxReplaced = true;
            break;
        }
    }
    if (!$stateTrxReplaced) {
        array_unshift($state['transactions'], $newTrx);
    }
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

// ===========================================================================
// ADMIN ACTIONS FOR TRANSACTION APPROVAL / REJECTION & RECONCILIATION
// ===========================================================================

// --- action=admin_approve_deposit -----
if ($action === 'admin_approve_deposit') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(['success' => false, 'message' => 'Method not allowed. Use POST.'], 405);
    }
    requireAdmin();
    ensureTablesExist($pdo);

    $in = json_decode(file_get_contents('php://input'), true) ?: [];
    $trxId = trim((string)($in['transactionId'] ?? $in['id'] ?? ''));
    if ($trxId === '') {
        jsonResponse(['success' => false, 'message' => 'ID Transaksi wajib diisi.'], 400);
    }

    $state = loadMainState($pdo);
    $pointsReward = isset($state['settings']['depositPointsReward']) ? (int)$state['settings']['depositPointsReward'] : 5;

    $userUpdated = null;
    $trxUpdated = null;

    try {
        if (!$pdo->inTransaction()) {
            $pdo->beginTransaction();
        }

        // Lock transaction
        $tStmt = $pdo->prepare("SELECT * FROM `transactions` WHERE `id` = :id FOR UPDATE");
        $tStmt->execute([':id' => $trxId]);
        $trxRow = $tStmt->fetch();

        // If not in relational table, check state
        $amount = 0;
        $userId = '';
        if ($trxRow) {
            if ($trxRow['status'] === 'approved') {
                if ($pdo->inTransaction()) $pdo->commit();
                jsonResponse(['success' => true, 'message' => 'Deposit ini sudah disetujui sebelumnya.', 'status' => 'approved']);
            }
            $curStatus = (string)($trxRow['status'] ?? '');
            if (!in_array($curStatus, ['pending', 'rejected'], true)) {
                // Guard: hanya deposit berstatus 'pending' (bukti sudah diunggah)
                // atau 'rejected' (persetujuan ulang) yang boleh mengkredit saldo.
                // Tiket yang belum dibayar (awaiting_payment), status kosong, atau
                // nilai tak dikenal lainnya DITOLAK - dulu status tidak dicek sama sekali.
                if ($pdo->inTransaction()) $pdo->rollBack();
                $guardMsg = ($curStatus === 'awaiting_payment' || $curStatus === '')
                    ? 'Tiket deposit ini belum dibayar dan belum ada bukti transfer dari member. Menunggu member menyelesaikan transfer terlebih dahulu.'
                    : 'Status transaksi ini (' . $curStatus . ') tidak valid untuk persetujuan.';
                jsonResponse(['success' => false, 'message' => $guardMsg], 400);
            }
            $amount = (int)$trxRow['amount'];
            $userId = (string)$trxRow['user_id'];
        } else {
            // Find in state
            $foundInState = null;
            if (isset($state['transactions']) && is_array($state['transactions'])) {
                foreach ($state['transactions'] as $stTrx) {
                    if (($stTrx['id'] ?? '') === $trxId) {
                        $foundInState = $stTrx;
                        break;
                    }
                }
            }
            if (!$foundInState) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                jsonResponse(['success' => false, 'message' => 'Transaksi tidak ditemukan.'], 404);
            }
            if (($foundInState['status'] ?? '') === 'approved') {
                if ($pdo->inTransaction()) $pdo->commit();
                jsonResponse(['success' => true, 'message' => 'Deposit ini sudah disetujui sebelumnya.', 'status' => 'approved']);
            }
            $curStatusState = (string)($foundInState['status'] ?? '');
            if (!in_array($curStatusState, ['pending', 'rejected'], true)) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                $guardMsgState = ($curStatusState === 'awaiting_payment' || $curStatusState === '')
                    ? 'Tiket deposit ini belum dibayar dan belum ada bukti transfer dari member. Menunggu member menyelesaikan transfer terlebih dahulu.'
                    : 'Status transaksi ini (' . $curStatusState . ') tidak valid untuk persetujuan.';
                jsonResponse(['success' => false, 'message' => $guardMsgState], 400);
            }
            $amount = (int)($foundInState['amount'] ?? 0);
            $userId = (string)($foundInState['userId'] ?? '');
        }

        if ($amount <= 0 || $userId === '') {
            if ($pdo->inTransaction()) $pdo->rollBack();
            jsonResponse(['success' => false, 'message' => 'Data transaksi tidak valid.'], 400);
        }

        // Lock User row
        $uStmt = $pdo->prepare("SELECT * FROM `users` WHERE `id` = :id FOR UPDATE");
        $uStmt->execute([':id' => $userId]);
        $uRow = $uStmt->fetch();
        if (!$uRow) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            jsonResponse(['success' => false, 'message' => 'Member pemilik transaksi tidak ditemukan.'], 404);
        }

        // Atomic balance update
        $updU = $pdo->prepare("UPDATE `users` SET `wallet_balance` = `wallet_balance` + :amt, `points` = `points` + :pts, `updated_at` = CURRENT_TIMESTAMP WHERE `id` = :id");
        $updU->execute([':amt' => $amount, ':pts' => $pointsReward, ':id' => $userId]);

        // Update relational transaction
        $updT = $pdo->prepare("INSERT INTO `transactions` (`id`, `user_id`, `username`, `type`, `amount`, `status`, `created_at`)
            VALUES (:id, :uid, :uname, 'deposit', :amt, 'approved', NOW())
            ON DUPLICATE KEY UPDATE `status` = 'approved'");
        $updT->execute([
            ':id' => $trxId,
            ':uid' => $userId,
            ':uname' => (string)($uRow['username'] ?? ''),
            ':amt' => $amount
        ]);

        if ($pdo->inTransaction()) {
            $pdo->commit();
        }

        // Mirror in JSON state
        $newWallet = (int)$uRow['wallet_balance'] + $amount;
        $newPoints = (int)($uRow['points'] ?? 0) + $pointsReward;

        if (isset($state['users']) && is_array($state['users'])) {
            foreach ($state['users'] as &$su) {
                if (($su['id'] ?? '') === $userId) {
                    $su['walletBalance'] = $newWallet;
                    $su['points'] = $newPoints;
                    $userUpdated = $su;
                    break;
                }
            }
            unset($su);
        }

        if (isset($state['transactions']) && is_array($state['transactions'])) {
            foreach ($state['transactions'] as &$stT) {
                if (($stT['id'] ?? '') === $trxId) {
                    $stT['status'] = 'approved';
                    $stT['updatedAt'] = date('c');
                    if ($pointsReward > 0) $stT['pointsAwarded'] = $pointsReward;
                    $trxUpdated = $stT;
                    break;
                }
            }
            unset($stT);
        }

        saveMainState($pdo, $state);

        jsonResponse([
            'success' => true,
            'message' => 'Deposit ' . number_format($amount, 0, ',', '.') . ' untuk ' . ($uRow['username'] ?? '') . ' berhasil disetujui!',
            'transaction' => $trxUpdated,
            'newWalletBalance' => $newWallet,
            'newPoints' => $newPoints
        ]);
    } catch (Exception $eApp) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        jsonResponse(['success' => false, 'message' => 'Gagal menyetujui deposit: ' . $eApp->getMessage()], 500);
    }
}

// --- action=admin_reject_deposit -----
if ($action === 'admin_reject_deposit') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(['success' => false, 'message' => 'Method not allowed. Use POST.'], 405);
    }
    requireAdmin();
    ensureTablesExist($pdo);

    $in = json_decode(file_get_contents('php://input'), true) ?: [];
    $trxId = trim((string)($in['transactionId'] ?? $in['id'] ?? ''));
    $reason = trim((string)($in['reason'] ?? 'Bukti transfer tidak valid'));
    if ($trxId === '') {
        jsonResponse(['success' => false, 'message' => 'ID Transaksi wajib diisi.'], 400);
    }

    $state = loadMainState($pdo);

    try {
        if (!$pdo->inTransaction()) $pdo->beginTransaction();

        $updT = $pdo->prepare("UPDATE `transactions` SET `status` = 'rejected' WHERE `id` = :id");
        $updT->execute([':id' => $trxId]);

        if ($pdo->inTransaction()) $pdo->commit();

        if (isset($state['transactions']) && is_array($state['transactions'])) {
            foreach ($state['transactions'] as &$stT) {
                if (($stT['id'] ?? '') === $trxId) {
                    $stT['status'] = 'rejected';
                    $stT['rejectReason'] = $reason;
                    $stT['updatedAt'] = date('c');
                    break;
                }
            }
            unset($stT);
        }
        saveMainState($pdo, $state);

        jsonResponse(['success' => true, 'message' => "Deposit {$trxId} berhasil ditolak."]);
    } catch (Exception $eRej) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        jsonResponse(['success' => false, 'message' => 'Gagal menolak deposit: ' . $eRej->getMessage()], 500);
    }
}

// --- action=admin_sync_bank_details (rekonsiliasi rekening WD semua member) -----
// Memeriksa seluruh member: melengkapi kolom rekening di tabel users dari
// transaksi penarikan yang pernah dibuat, dan sebaliknya melengkapi transaksi
// penarikan lama dari profil member. Aman dijalankan berulang (idempoten).
if ($action === 'admin_sync_bank_details') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(['success' => false, 'message' => 'Method not allowed. Use POST.'], 405);
    }
    requireAdmin();
    if (!$pdo) {
        jsonResponse(['success' => false, 'message' => 'Database MySQL cPanel belum terhubung.'], 503);
    }
    ensureTablesExist($pdo);

    $state = loadMainState($pdo);
    $membersFixed = 0;
    $transactionsFixed = 0;
    $stillMissing = [];

    $userRows = [];
    try {
        $userRows = $pdo->query("SELECT `id`, `username`, `bank_name`, `account_number`, `account_holder` FROM `users`")->fetchAll();
    } catch (Exception $eUsersSync) {}

    $userBankById = [];
    $usernameById = [];
    foreach ($userRows as $rU) {
        $rid = (string)$rU['id'];
        $userBankById[$rid] = [
            'bankName' => trim((string)($rU['bank_name'] ?? '')),
            'accountNumber' => trim((string)($rU['account_number'] ?? '')),
            'accountHolder' => trim((string)($rU['account_holder'] ?? ''))
        ];
        $usernameById[$rid] = (string)($rU['username'] ?? '');
    }

    $txRows = [];
    try {
        $txRows = $pdo->query("SELECT * FROM `transactions` WHERE `type` = 'withdraw' OR `id` LIKE 'TRX-WDR-%' ORDER BY `created_at` DESC")->fetchAll();
    } catch (Exception $eTxSync) {}

    // A0. Rekening yang hanya ada di JSON state (belum pernah tertulis ke kolom
    // users) ikut diselamatkan sebelum transaksi dipakai sebagai sumber.
    if (isset($state['users']) && is_array($state['users'])) {
        foreach ($state['users'] as $suA) {
            $uidA = (string)($suA['id'] ?? '');
            $sbA = isset($suA['bankAccount']) && is_array($suA['bankAccount']) ? $suA['bankAccount'] : null;
            if ($uidA === '' || !$sbA) continue;
            $candBank = trim((string)($sbA['bankName'] ?? ''));
            $candNum = trim((string)($sbA['accountNumber'] ?? ''));
            $candHolder = trim((string)($sbA['accountHolder'] ?? ''));
            if ($candBank === '' || $candHolder === '' || strlen(normalizeAccountNumberStr($candNum)) < 4) continue;
            $curA = $userBankById[$uidA] ?? ['bankName' => '', 'accountNumber' => '', 'accountHolder' => ''];
            if ($curA['bankName'] !== '' && $curA['accountHolder'] !== '' && normalizeAccountNumberStr($curA['accountNumber']) !== '') continue;
            try {
                $updA0 = $pdo->prepare("UPDATE `users` SET `bank_name` = :bn, `account_number` = :an, `account_holder` = :ah, `updated_at` = CURRENT_TIMESTAMP WHERE `id` = :id");
                $updA0->execute([
                    ':bn' => $candBank,
                    ':an' => normalizeAccountNumberStr($candNum) ?: $candNum,
                    ':ah' => $candHolder,
                    ':id' => $uidA
                ]);
                $userBankById[$uidA] = [
                    'bankName' => $candBank,
                    'accountNumber' => $candNum,
                    'accountHolder' => $candHolder
                ];
                if (!isset($usernameById[$uidA])) $usernameById[$uidA] = (string)($suA['username'] ?? '');
                $membersFixed++;
            } catch (Exception $eFixA0) {}
        }
    }

    // A. Transaksi yang menyimpan rekening lengkap -> lengkapi profil member.
    $bestByUser = [];
    foreach ($txRows as $rowS) {
        $uidS = (string)($rowS['user_id'] ?? '');
        if ($uidS === '' || isset($bestByUser[$uidS])) continue;
        $infoS = parseWithdrawBankDetails($rowS['payment_method'] ?? '', $rowS['destination_account'] ?? '', $userBankById[$uidS] ?? []);
        if (!$infoS['complete']) continue;
        $bestByUser[$uidS] = $infoS;
    }
    foreach ($bestByUser as $uidS => $infoS) {
        $cur = $userBankById[$uidS] ?? ['bankName' => '', 'accountNumber' => '', 'accountHolder' => ''];
        $curFilled = ($cur['bankName'] !== '' && $cur['accountHolder'] !== '' && normalizeAccountNumberStr($cur['accountNumber']) !== '');
        if ($curFilled) continue;
        try {
            $updU2 = $pdo->prepare("UPDATE `users` SET `bank_name` = :bn, `account_number` = :an, `account_holder` = :ah, `updated_at` = CURRENT_TIMESTAMP WHERE `id` = :id");
            $updU2->execute([
                ':bn' => $infoS['bankName'],
                ':an' => normalizeAccountNumberStr($infoS['accountNumber']) ?: $infoS['accountNumber'],
                ':ah' => $infoS['accountHolder'],
                ':id' => $uidS
            ]);
            $userBankById[$uidS] = [
                'bankName' => $infoS['bankName'],
                'accountNumber' => $infoS['accountNumber'],
                'accountHolder' => $infoS['accountHolder']
            ];
            $membersFixed++;
        } catch (Exception $eFixU) {}
    }

    // B. Transaksi penarikan yang tujuannya kosong/ter-mask -> lengkapi dari profil.
    foreach ($txRows as $rowS) {
        $uidS = (string)($rowS['user_id'] ?? '');
        $infoS = parseWithdrawBankDetails($rowS['payment_method'] ?? '', $rowS['destination_account'] ?? '', $userBankById[$uidS] ?? []);
        if (!$infoS['complete']) continue;
        $destWanted = $infoS['accountHolder'] . ' - ' . $infoS['accountNumber'];
        $rawDest = trim((string)($rowS['destination_account'] ?? ''));
        $rawPm = trim((string)($rowS['payment_method'] ?? ''));
        // `destination_account` adalah sumber otoritatif (tidak pernah ditimpa
        // snapshot client), jadi hanya baris dengan tujuan kosong/ter-mask yang
        // diperbaiki. payment_method boleh tetap versi masked untuk tampilan
        // publik; panel admin memakai detail di atas.
        $destNeedsFix = ($rawDest === '' || preg_match('/[xX]{2,}|\*/', $rawDest));
        if (!$destNeedsFix) continue;
        $pmWanted = preg_match('/usdt/i', $rawPm) ? 'USDT Withdrawal' : $infoS['bankName'] . ' (' . $infoS['accountNumber'] . ')';
        if (!preg_match('/usdt/i', $rawPm) && $infoS['bankName'] === '') $pmWanted = $rawPm;
        try {
            $updT2 = $pdo->prepare("UPDATE `transactions` SET `destination_account` = :da, `payment_method` = :pm WHERE `id` = :id");
            $updT2->execute([':da' => $destWanted, ':pm' => $pmWanted, ':id' => (string)$rowS['id']]);
            $transactionsFixed++;
        } catch (Exception $eFixT) {}
    }

    // C. Sinkronkan hasilnya ke JSON state supaya admin & member langsung melihat data yang sama.
    if (isset($state['users']) && is_array($state['users'])) {
        foreach ($state['users'] as &$suS) {
            $uidS = (string)($suS['id'] ?? '');
            if ($uidS === '' || !isset($userBankById[$uidS])) continue;
            $fb = $userBankById[$uidS];
            if ($fb['bankName'] !== '' && normalizeAccountNumberStr($fb['accountNumber']) !== '' && $fb['accountHolder'] !== '') {
                $suS['bankAccount'] = $fb;
            }
        }
        unset($suS);
    }
    if (isset($state['transactions']) && is_array($state['transactions'])) {
        foreach ($state['transactions'] as &$stS) {
            if (($stS['type'] ?? '') !== 'withdraw') continue;
            $uidS = (string)($stS['userId'] ?? '');
            $infoS = parseWithdrawBankDetails($stS['paymentMethod'] ?? '', $stS['destinationAccount'] ?? '', $userBankById[$uidS] ?? []);
            if (!$infoS['complete']) continue;
            $stS['bankName'] = $infoS['bankName'];
            $stS['accountNumber'] = $infoS['accountNumber'];
            $stS['accountHolder'] = $infoS['accountHolder'];
            $stS['destinationAccount'] = $infoS['accountHolder'] . ' - ' . $infoS['accountNumber'];
            if (preg_match('/usdt/i', (string)($stS['paymentMethod'] ?? ''))) {
                $stS['paymentMethod'] = 'USDT Withdrawal';
            } elseif ($infoS['bankName'] !== '') {
                $stS['paymentMethod'] = $infoS['bankName'] . ' (' . $infoS['accountNumber'] . ')';
            }
            $stS['destinationComplete'] = true;
            $stS['destinationMasked'] = false;
        }
        unset($stS);
    }
    saveMainState($pdo, $state);

    // D. Laporkan member yang masih belum punya rekening lengkap.
    foreach ($userBankById as $uidS => $fb) {
        $okBank = $fb['bankName'] !== '' && normalizeAccountNumberStr($fb['accountNumber']) !== '' && $fb['accountHolder'] !== '';
        if (!$okBank) {
            $stillMissing[] = [
                'userId' => $uidS,
                'username' => $usernameById[$uidS] ?? '',
                'bankName' => $fb['bankName'],
                'accountNumber' => $fb['accountNumber'],
                'accountHolder' => $fb['accountHolder']
            ];
        }
    }

    // E. Penarikan yang masih menunggu konfirmasi tapi belum punya tujuan lengkap:
    // ini yang benar-benar menghalangi pencairan, beda dengan member yang memang
    // belum pernah mengisi rekening.
    $pendingMissing = 0;
    try {
        $pendRows = $pdo->query("SELECT * FROM `transactions` WHERE `type` = 'withdraw' AND `status` = 'pending'")->fetchAll();
        foreach ($pendRows as $pr) {
            $infoP = parseWithdrawBankDetails($pr['payment_method'] ?? '', $pr['destination_account'] ?? '', $userBankById[(string)($pr['user_id'] ?? '')] ?? []);
            if (!$infoP['complete']) $pendingMissing++;
        }
    } catch (Exception $ePendBank) {}

    jsonResponse([
        'success' => true,
        'message' => 'Sinkronisasi rekening selesai: ' . $membersFixed . ' member dan ' . $transactionsFixed . ' transaksi dilengkapi.',
        'membersFixed' => $membersFixed,
        'transactionsFixed' => $transactionsFixed,
        'pendingMissing' => $pendingMissing,
        'stillMissing' => $stillMissing,
        'totalMembers' => count($userBankById)
    ]);
}

// --- action=admin_approve_withdrawal -----
if ($action === 'admin_approve_withdrawal') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(['success' => false, 'message' => 'Method not allowed. Use POST.'], 405);
    }
    requireAdmin();
    ensureTablesExist($pdo);

    $in = json_decode(file_get_contents('php://input'), true) ?: [];
    $trxId = trim((string)($in['transactionId'] ?? $in['id'] ?? ''));
    if ($trxId === '') {
        jsonResponse(['success' => false, 'message' => 'ID Transaksi wajib diisi.'], 400);
    }

    $state = loadMainState($pdo);

    // GUARD: penarikan tidak boleh disetujui bila tujuan transfernya tidak
    // diketahui (bank/wallet, nomor, atau nama pemilik kosong). Tanpa ini admin
    // bisa menandai "sukses" penarikan yang tidak mungkin ditransfer.
    $guardRow = null;
    try {
        $gStmt = $pdo->prepare("SELECT * FROM `transactions` WHERE `id` = :id LIMIT 1");
        $gStmt->execute([':id' => $trxId]);
        $guardRow = $gStmt->fetch();
    } catch (Exception $eGuard) {}
    if ($guardRow && (($guardRow['type'] ?? '') === 'withdraw' || strpos($trxId, 'TRX-WDR-') === 0)) {
        $guardUserBank = [];
        try {
            $gU = $pdo->prepare("SELECT `bank_name`, `account_number`, `account_holder` FROM `users` WHERE `id` = :id LIMIT 1");
            $gU->execute([':id' => (string)($guardRow['user_id'] ?? '')]);
            $gURow = $gU->fetch();
            if ($gURow) {
                $guardUserBank = [
                    'bankName' => (string)($gURow['bank_name'] ?? ''),
                    'accountNumber' => (string)($gURow['account_number'] ?? ''),
                    'accountHolder' => (string)($gURow['account_holder'] ?? '')
                ];
            }
        } catch (Exception $eGuardU) {}
        $guardInfo = parseWithdrawBankDetails($guardRow['payment_method'] ?? '', $guardRow['destination_account'] ?? '', $guardUserBank);
        if (!$guardInfo['complete']) {
            jsonResponse([
                'success' => false,
                'message' => 'Rekening tujuan member @' . (string)($guardRow['username'] ?? '') . ' belum lengkap (bank/e-wallet, nomor, atau nama pemilik). Lengkapi dulu di menu Manajemen Pengguna, lalu setujui penarikan.'
            ], 400);
        }
    }

    try {
        if (!$pdo->inTransaction()) $pdo->beginTransaction();

        $updT = $pdo->prepare("UPDATE `transactions` SET `status` = 'approved' WHERE `id` = :id");
        $updT->execute([':id' => $trxId]);

        if ($pdo->inTransaction()) $pdo->commit();

        $trxType = 'withdraw';
        if (isset($state['transactions']) && is_array($state['transactions'])) {
            foreach ($state['transactions'] as &$stT) {
                if (($stT['id'] ?? '') === $trxId) {
                    $stT['status'] = 'approved';
                    if (($stT['type'] ?? '') === 'ppob_conversion') {
                        $stT['ppobStatus'] = 'Selesai';
                    }
                    $stT['updatedAt'] = date('c');
                    $trxType = $stT['type'] ?? 'withdraw';
                    break;
                }
            }
            unset($stT);
        }
        saveMainState($pdo, $state);

        $msg = $trxType === 'ppob_conversion' ? 'Konversi PPOB berhasil disetujui (Selesai)!' : 'Penarikan dana berhasil disetujui!';
        jsonResponse(['success' => true, 'message' => $msg]);
    } catch (Exception $eAppW) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        jsonResponse(['success' => false, 'message' => 'Gagal menyetujui penarikan: ' . $eAppW->getMessage()], 500);
    }
}

// --- action=admin_reject_withdrawal -----
if ($action === 'admin_reject_withdrawal') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(['success' => false, 'message' => 'Method not allowed. Use POST.'], 405);
    }
    requireAdmin();
    ensureTablesExist($pdo);

    $in = json_decode(file_get_contents('php://input'), true) ?: [];
    $trxId = trim((string)($in['transactionId'] ?? $in['id'] ?? ''));
    $reason = trim((string)($in['reason'] ?? 'Data rekening / nomor tujuan tidak sesuai'));
    if ($trxId === '') {
        jsonResponse(['success' => false, 'message' => 'ID Transaksi wajib diisi.'], 400);
    }

    $state = loadMainState($pdo);

    try {
        if (!$pdo->inTransaction()) $pdo->beginTransaction();

        // Lock transaction
        $tStmt = $pdo->prepare("SELECT * FROM `transactions` WHERE `id` = :id FOR UPDATE");
        $tStmt->execute([':id' => $trxId]);
        $trxRow = $tStmt->fetch();

        $userId = '';
        $amount = 0;
        $walletSource = '';
        $alreadyRejected = false;
        if ($trxRow) {
            $userId = (string)$trxRow['user_id'];
            $amount = (int)$trxRow['amount'];
            $walletSource = (string)($trxRow['wallet_source'] ?? '');
            $alreadyRejected = (($trxRow['status'] ?? '') === 'rejected');
        } else {
            if (isset($state['transactions']) && is_array($state['transactions'])) {
                foreach ($state['transactions'] as $stTrx) {
                    if (($stTrx['id'] ?? '') === $trxId) {
                        $userId = (string)($stTrx['userId'] ?? '');
                        $amount = (int)($stTrx['amount'] ?? 0);
                        $walletSource = (string)($stTrx['walletSource'] ?? $stTrx['source'] ?? '');
                        $alreadyRejected = (($stTrx['status'] ?? '') === 'rejected') || !empty($stTrx['isRefunded']);
                        break;
                    }
                }
            }
        }

        if ($userId === '' || $amount <= 0) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            jsonResponse(['success' => false, 'message' => 'Transaksi tidak valid.'], 400);
        }

        // Idempotency guard: a transaction that was already rejected/refunded must
        // never refund the balance a second time (double-click / retry / replay).
        if ($alreadyRejected) {
            if ($pdo->inTransaction()) $pdo->commit();
            jsonResponse(['success' => true, 'alreadyRejected' => true, 'message' => 'Permintaan ini sudah pernah ditolak — refund tidak diulang.']);
        }

        $isAffiliate = ($walletSource === 'Wallet Tambah Teman' || stripos($walletSource, 'affiliate') !== false);
        $col = $isAffiliate ? 'affiliate_balance' : 'wallet_balance';

        // Refund balance to user
        $refU = $pdo->prepare("UPDATE `users` SET `{$col}` = `{$col}` + :amt, `updated_at` = CURRENT_TIMESTAMP WHERE `id` = :id");
        $refU->execute([':amt' => $amount, ':id' => $userId]);

        // Update transaction status
        $updT = $pdo->prepare("UPDATE `transactions` SET `status` = 'rejected' WHERE `id` = :id");
        $updT->execute([':id' => $trxId]);

        if ($pdo->inTransaction()) $pdo->commit();

        // Mirror in state
        if (isset($state['users']) && is_array($state['users'])) {
            foreach ($state['users'] as &$su) {
                if (($su['id'] ?? '') === $userId) {
                    if ($isAffiliate) {
                        $su['affiliateBalance'] = (int)($su['affiliateBalance'] ?? 0) + $amount;
                    } else {
                        $su['walletBalance'] = (int)($su['walletBalance'] ?? 0) + $amount;
                    }
                    break;
                }
            }
            unset($su);
        }

        if (isset($state['transactions']) && is_array($state['transactions'])) {
            foreach ($state['transactions'] as &$stT) {
                if (($stT['id'] ?? '') === $trxId) {
                    $stT['status'] = 'rejected';
                    $stT['isRefunded'] = true;
                    $stT['rejectReason'] = $reason;
                    $stT['updatedAt'] = date('c');
                    break;
                }
            }
            unset($stT);
        }
        saveMainState($pdo, $state);

        jsonResponse(['success' => true, 'message' => 'Permintaan penarikan ditolak dan saldo berhasil dikembalikan ke akun member.']);
    } catch (Exception $eRejW) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        jsonResponse(['success' => false, 'message' => 'Gagal memproses penolakan: ' . $eRejW->getMessage()], 500);
    }
}

// --- action=admin_reconcile_all_balances -----
if ($action === 'admin_reconcile_all_balances') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(['success' => false, 'message' => 'Method not allowed. Use POST.'], 405);
    }
    requireAdmin();
    ensureTablesExist($pdo);

    $state = loadMainState($pdo);
    $allUsers = $state['users'] ?? [];
    $allTxs = $state['transactions'] ?? [];

    $reconciledUsers = [];
    $totalUpdated = 0;

    try {
        if (!$pdo->inTransaction()) $pdo->beginTransaction();

        foreach ($state['users'] as &$u) {
            $uid = (string)($u['id'] ?? '');
            $uname = (string)($u['username'] ?? '');
            if ($uid === '') continue;

            $uTxs = array_filter($allTxs, function($t) use ($uid, $uname) {
                $tUid = (string)($t['userId'] ?? '');
                $tUname = (string)($t['username'] ?? '');
                return ($tUid === $uid) || ($tUname !== '' && $tUname === $uname);
            });

            // Calculate justified wallet balance from ledger
            $depSum = 0;
            $invSum = 0;
            $wdrWalletSum = 0;
            $prfSum = 0;
            $chkSum = 0;
            $refSum = 0;
            $ppobWSum = 0;
            $affInSum = 0;
            $bonusWSum = 0;

            // Calculate justified affiliate balance from ledger
            $bonusASum = 0;
            $wdrAffSum = 0;
            $ppobASum = 0;
            $affOutSum = 0;

            foreach ($uTxs as $t) {
                $status = strtolower(trim((string)($t['status'] ?? 'approved')));
                $isApproved = ($status === 'approved' || $status === '' || $status === 'completed');
                $isPendingOrApproved = ($isApproved || $status === 'pending');
                $type = strtolower(trim((string)($t['type'] ?? '')));
                $tId = (string)($t['id'] ?? '');
                $amt = (int)($t['amount'] ?? 0);
                $wSource = (string)($t['walletSource'] ?? $t['source'] ?? '');
                $note = (string)($t['note'] ?? $t['description'] ?? '');

                $isAffWallet = ($wSource === 'Wallet Tambah Teman' || stripos($wSource, 'affiliate') !== false);
                $isMainBonus = (stripos($note, 'ditransfer ke Saldo Utama') !== false || stripos($note, 'Saldo Utama') !== false || $wSource === 'Saldo Utama' || $wSource === 'Wallet Balance');

                if (($type === 'deposit' || strpos($tId, 'TRX-DEP-') === 0) && $status === 'approved') {
                    $depSum += $amt;
                } elseif (($type === 'invest_plan' || $type === 'invest' || strpos($tId, 'TRX-INV-') === 0) && $isApproved) {
                    $invSum += $amt;
                } elseif (($type === 'profit_claim' || strpos($tId, 'TRX-PRF-') === 0) && $isApproved) {
                    $prfSum += $amt;
                } elseif (($type === 'bonus' || $type === 'checkin' || $type === 'daily_checkin' || $type === 'check_in' || strpos($tId, 'TX-CHK-') === 0 || stripos($note, 'absen') !== false) && $isApproved) {
                    $chkSum += $amt;
                } elseif ($type === 'capital_refund' && $isApproved) {
                    $refSum += $amt;
                } elseif ($type === 'affiliate_transfer' && $isApproved) {
                    $affInSum += $amt;
                    $affOutSum += $amt;
                } elseif ($type === 'withdraw' && $isPendingOrApproved) {
                    if ($isAffWallet) {
                        $wdrAffSum += $amt;
                    } else {
                        $wdrWalletSum += $amt;
                    }
                } elseif (($type === 'ppob_conversion' || strpos($tId, 'TRX-POB-') === 0) && $isPendingOrApproved) {
                    if ($isAffWallet) {
                        $ppobASum += $amt;
                    } else {
                        $ppobWSum += $amt;
                    }
                } elseif ($type === 'sponsor_bonus' || $type === 'rabat_bonus' || $type === 'leader_bonus' || strpos($tId, 'TRX-SPS-') === 0 || strpos($tId, 'TRX-RBT-') === 0 || strpos($tId, 'TRX-LDR-') === 0) {
                    if ($isApproved) {
                        if ($isMainBonus) {
                            $bonusWSum += $amt;
                        } else {
                            $bonusASum += $amt;
                        }
                    }
                }
            }

            $calcWallet = max(0, $depSum - $invSum - $wdrWalletSum + $prfSum + $chkSum + $refSum - $ppobWSum + $affInSum + $bonusWSum);
            $calcAffiliate = max(0, $bonusASum - $wdrAffSum - $ppobASum - $affOutSum);

            $oldW = (int)($u['walletBalance'] ?? 0);
            $oldA = (int)($u['affiliateBalance'] ?? 0);

            if ($oldW !== $calcWallet || $oldA !== $calcAffiliate) {
                $totalUpdated++;
                $reconciledUsers[] = [
                    'id' => $uid,
                    'username' => (string)($u['username'] ?? ''),
                    'oldWallet' => $oldW,
                    'newWallet' => $calcWallet,
                    'oldAffiliate' => $oldA,
                    'newAffiliate' => $calcAffiliate
                ];

                $u['walletBalance'] = $calcWallet;
                $u['affiliateBalance'] = $calcAffiliate;

                // Sync to relational users table
                $updSql = $pdo->prepare("UPDATE `users` SET `wallet_balance` = :w, `affiliate_balance` = :a, `updated_at` = CURRENT_TIMESTAMP WHERE `id` = :id");
                $updSql->execute([':w' => $calcWallet, ':a' => $calcAffiliate, ':id' => $uid]);
            }
        }
        unset($u);

        if ($pdo->inTransaction()) $pdo->commit();

        saveMainState($pdo, $state);

        jsonResponse([
            'success' => true,
            'message' => "Rekonsiliasi selesai: {$totalUpdated} akun member berhasil diselaraskan 100% dengan ledger transaksi.",
            'totalUpdated' => $totalUpdated,
            'updatedUsers' => $reconciledUsers
        ]);
    } catch (Exception $eRec) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        jsonResponse(['success' => false, 'message' => 'Gagal rekonsiliasi: ' . $eRec->getMessage()], 500);
    }
}

// --- action=admin_reset_member ---------------------------------------------
// Fitur admin: reset total data transaksi & saldo member yang dianggap curang
// atau tidak valid, sehingga akunnya kembali seperti akun baru (profil, login,
// kode referral dan rekening bank tetap dipertahankan).
//
// Data member disimpan di dua tempat: tabel relasional (users/transactions/
// investments/redemptions) dan JSON state. action=get menggabungkan keduanya
// secara ADITIF - membersihkan hanya satu tempat membuat data lama muncul
// kembali pada sinkronisasi berikutnya, jadi keduanya dibersihkan dalam satu
// transaksi MySQL yang sama.
if ($action === 'admin_reset_member') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(['success' => false, 'message' => 'Method not allowed. Use POST.'], 405);
    }
    requireAdmin();
    if (!$pdo) {
        jsonResponse(['success' => false, 'message' => 'Database MySQL tidak terhubung.'], 503);
    }
    ensureTablesExist($pdo);

    $rawReset = file_get_contents('php://input');
    $inReset = json_decode($rawReset, true) ?: [];
    $targetId = trim((string)($inReset['userId'] ?? ''));
    $confirmUsername = trim((string)($inReset['confirmUsername'] ?? ''));
    $reason = trim((string)($inReset['reason'] ?? ''));
    $adminId = currentSessionUserId();

    if ($targetId === '') {
        jsonResponse(['success' => false, 'message' => 'Member tujuan tidak ditemukan.'], 400);
    }
    $reasonLen = function_exists('mb_strlen') ? mb_strlen($reason, 'UTF-8') : strlen($reason);
    if ($reasonLen < 5) {
        jsonResponse(['success' => false, 'message' => 'Alasan reset wajib diisi (minimal 5 karakter).'], 400);
    }
    if (!rateLimit('admin_reset_member', 10, 300)) {
        jsonResponse(['success' => false, 'message' => 'Terlalu banyak permintaan reset. Coba lagi beberapa menit.'], 429);
    }
    if ($targetId === $adminId) {
        jsonResponse(['success' => false, 'message' => 'Anda tidak dapat mereset akun administrator yang sedang login.'], 403);
    }

    $target = null;
    try {
        $stTarget = $pdo->prepare("SELECT * FROM `users` WHERE `id` = :id LIMIT 1");
        $stTarget->execute([':id' => $targetId]);
        $target = $stTarget->fetch();
    } catch (Exception $eTgt) {
        $target = null;
    }
    if (!$target) {
        jsonResponse(['success' => false, 'message' => 'Member tidak ditemukan di database.'], 404);
    }
    if ((string)($target['role'] ?? 'member') === 'admin') {
        jsonResponse(['success' => false, 'message' => 'Akun administrator tidak dapat di-reset.'], 403);
    }
    // Konfirmasi username juga ditegakkan di server, bukan hanya di UI, supaya
    // permintaan yang dibajak / salah sasaran tetap tertolak.
    if (strcasecmp($confirmUsername, (string)$target['username']) !== 0) {
        jsonResponse(['success' => false, 'message' => 'Konfirmasi username tidak cocok. Reset dibatalkan.'], 403);
    }

    $adminUsername = 'admin';
    try {
        $stAdm = $pdo->prepare("SELECT `username` FROM `users` WHERE `id` = :id LIMIT 1");
        $stAdm->execute([':id' => $adminId]);
        $admRow = $stAdm->fetch();
        if ($admRow && !empty($admRow['username'])) $adminUsername = (string)$admRow['username'];
    } catch (Exception $eAdm) {}

    // Ringkasan data sebelum reset (dipakai untuk pesan sukses & log audit)
    $before = [
        'walletBalance' => (int)($target['wallet_balance'] ?? 0),
        'affiliateBalance' => (int)($target['affiliate_balance'] ?? 0),
        'points' => (int)($target['points'] ?? 0),
        'transactions' => 0,
        'transactionAmount' => 0,
        'investments' => 0,
        'investmentCapital' => 0,
        'redemptions' => 0
    ];
    try {
        $stT = $pdo->prepare("SELECT COUNT(*) AS c, COALESCE(SUM(`amount`), 0) AS s FROM `transactions` WHERE `user_id` = :id");
        $stT->execute([':id' => $targetId]);
        $rowT = $stT->fetch();
        $before['transactions'] = (int)($rowT['c'] ?? 0);
        $before['transactionAmount'] = (int)($rowT['s'] ?? 0);

        $stI = $pdo->prepare("SELECT COUNT(*) AS c, COALESCE(SUM(`capital`), 0) AS s FROM `investments` WHERE `user_id` = :id");
        $stI->execute([':id' => $targetId]);
        $rowI = $stI->fetch();
        $before['investments'] = (int)($rowI['c'] ?? 0);
        $before['investmentCapital'] = (int)($rowI['s'] ?? 0);

        $stR = $pdo->prepare("SELECT COUNT(*) AS c FROM `redemptions` WHERE `user_id` = :id");
        $stR->execute([':id' => $targetId]);
        $before['redemptions'] = (int)($stR->fetchColumn() ?: 0);
    } catch (Exception $eSum) {}

    $targetUsername = (string)$target['username'];

    try {
        if (!$pdo->inTransaction()) $pdo->beginTransaction();

        // 1) Saldo & poin dikosongkan, riwayat absensi (streak) ikut direset,
        //    dan reset_at dicatat sebagai penanda agar data lama tidak hidup lagi
        $updUser = $pdo->prepare(
            "UPDATE `users` SET `wallet_balance` = 0, `affiliate_balance` = 0, `points` = 0, " .
            "`daily_check_in` = NULL, `reset_at` = CURRENT_TIMESTAMP, `updated_at` = CURRENT_TIMESTAMP WHERE `id` = :id"
        );
        $updUser->execute([':id' => $targetId]);

        // 2) Seluruh jejak transaksi member dihapus permanen
        $delTrx = $pdo->prepare("DELETE FROM `transactions` WHERE `user_id` = :id");
        $delTrx->execute([':id' => $targetId]);
        $delInv = $pdo->prepare("DELETE FROM `investments` WHERE `user_id` = :id");
        $delInv->execute([':id' => $targetId]);
        $delRed = $pdo->prepare("DELETE FROM `redemptions` WHERE `user_id` = :id");
        $delRed->execute([':id' => $targetId]);

        // 3) Salinan JSON state ikut dibersihkan (lihat catatan di atas)
        $stateReset = loadMainState($pdo);
        if (!is_array($stateReset)) $stateReset = [];
        $matchesTarget = function($item) use ($targetId, $targetUsername) {
            if (!is_array($item)) return false;
            $itUid = (string)($item['userId'] ?? $item['user_id'] ?? '');
            $itUname = (string)($item['username'] ?? '');
            if ($itUid !== '' && $itUid === $targetId) return true;
            if ($itUname !== '' && strcasecmp($itUname, $targetUsername) === 0) return true;
            return false;
        };
        foreach (['transactions', 'investments', 'redemptions'] as $listKey) {
            if (isset($stateReset[$listKey]) && is_array($stateReset[$listKey])) {
                $stateReset[$listKey] = array_values(array_filter($stateReset[$listKey], function($item) use ($matchesTarget) {
                    return !$matchesTarget($item);
                }));
            }
        }
        if (isset($stateReset['users']) && is_array($stateReset['users'])) {
            foreach ($stateReset['users'] as &$uReset) {
                if (!is_array($uReset)) continue;
                $uUid = (string)($uReset['id'] ?? '');
                $uName = (string)($uReset['username'] ?? '');
                if (($uUid !== '' && $uUid === $targetId) || ($uName !== '' && strcasecmp($uName, $targetUsername) === 0)) {
                    $uReset['walletBalance'] = 0;
                    $uReset['affiliateBalance'] = 0;
                    $uReset['points'] = 0;
                    $uReset['dailyCheckIn'] = null;
                }
            }
            unset($uReset);
        }
        saveMainState($pdo, $stateReset);

        // 4) Catat log audit admin (siapa, kapan, apa yang direset)
        $details = json_encode([
            'walletBalanceBefore' => $before['walletBalance'],
            'affiliateBalanceBefore' => $before['affiliateBalance'],
            'pointsBefore' => $before['points'],
            'transactionsDeleted' => $before['transactions'],
            'transactionAmountBefore' => $before['transactionAmount'],
            'investmentsDeleted' => $before['investments'],
            'investmentCapitalBefore' => $before['investmentCapital'],
            'redemptionsDeleted' => $before['redemptions']
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

        $insLog = $pdo->prepare(
            "INSERT INTO `admin_audit_log` " .
            "(`admin_id`, `admin_username`, `action`, `target_user_id`, `target_username`, `reason`, `details`) " .
            "VALUES (:aid, :aun, :act, :tid, :tun, :reason, :details)"
        );
        $insLog->execute([
            ':aid' => $adminId,
            ':aun' => $adminUsername,
            ':act' => 'admin_reset_member',
            ':tid' => $targetId,
            ':tun' => $targetUsername,
            ':reason' => (function_exists('mb_substr') ? mb_substr($reason, 0, 250, 'UTF-8') : substr($reason, 0, 250)),
            ':details' => $details
        ]);

        if ($pdo->inTransaction()) $pdo->commit();
    } catch (Exception $eRst) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        jsonResponse(['success' => false, 'message' => 'Gagal mereset data member: ' . $eRst->getMessage()], 500);
    }

    jsonResponse([
        'success' => true,
        'message' => "Data member \"{$targetUsername}\" berhasil direset total: " .
            "saldo & poin dikosongkan, {$before['transactions']} transaksi, {$before['investments']} paket investasi " .
            "dan {$before['redemptions']} penukaran poin dihapus permanen.",
        'summary' => $before + ['username' => $targetUsername]
    ]);
}

// --- action=admin_reset_logs -----------------------------------------------
// Daftar 15 log reset terakhir, ditampilkan di modal reset sebagai jejak audit.
if ($action === 'admin_reset_logs') {
    requireAdmin();
    if (!$pdo) {
        jsonResponse(['success' => false, 'message' => 'Database MySQL tidak terhubung.'], 503);
    }
    ensureTablesExist($pdo);

    $rowsLog = [];
    try {
        $rowsLog = $pdo->query("SELECT * FROM `admin_audit_log` ORDER BY `id` DESC LIMIT 15")->fetchAll();
    } catch (Exception $eLogs) {
        $rowsLog = [];
    }

    $logs = [];
    foreach ($rowsLog as $rLog) {
        $logs[] = [
            'id' => (string)$rLog['id'],
            'adminUsername' => (string)$rLog['admin_username'],
            'targetUsername' => (string)$rLog['target_username'],
            'action' => (string)$rLog['action'],
            'reason' => (string)$rLog['reason'],
            'details' => json_decode((string)($rLog['details'] ?? ''), true) ?: [],
            'createdAt' => (string)$rLog['created_at']
        ];
    }

    jsonResponse(['success' => true, 'logs' => $logs]);
}

// --- action=admin_profit_audit / admin_profit_repair ------------------------
// Audit perhitungan profit SELURUH member: memastikan nominal riwayat selalu
// sama dengan modal x rate, tidak ada dua angka berbeda untuk hari yang sama,
// dan pending yang akan dibayar sama dengan yang tampil di kartu member.
//   GET  action=admin_profit_audit   -> laporan (read-only)
//   POST action=admin_profit_repair  -> perbaiki rate/amount riwayat (tanpa
//        mengubah saldo, total profit, atau sisa hari paket)
if ($action === 'admin_profit_audit' || $action === 'admin_profit_repair') {
    requireAdmin();
    if (!$pdo) {
        jsonResponse(['success' => false, 'message' => 'Database MySQL tidak terhubung.'], 503);
    }
    ensureTablesExist($pdo);
    if ($action === 'admin_profit_repair' && $_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(['success' => false, 'message' => 'Method not allowed. Use POST.'], 405);
    }

    $inAudit = json_decode((string)file_get_contents('php://input'), true) ?: [];
    $onlyUserId = trim((string)($inAudit['userId'] ?? ''));
    $doRepair = ($action === 'admin_profit_repair');
    $todayIso = date('Y-m-d');

    $auditCfg = getGeneralSettings($pdo);
    $auditLossMode = !empty($auditCfg['todayProfitLossMode']['isLoss']);

    $state = loadMainState($pdo);
    $stateInvById = [];
    if (isset($state['investments']) && is_array($state['investments'])) {
        foreach ($state['investments'] as $sInvRow) {
            if (is_array($sInvRow) && !empty($sInvRow['id'])) {
                $stateInvById[(string)$sInvRow['id']] = $sInvRow;
            }
        }
    }

    $userNames = [];
    try {
        foreach ($pdo->query("SELECT `id`, `username`, `role` FROM `users`")->fetchAll() as $uRowA) {
            $userNames[(string)$uRowA['id']] = [
                'username' => (string)$uRowA['username'],
                'role' => (string)$uRowA['role']
            ];
        }
    } catch (Exception $eUsersA) {}

    $invRowsA = [];
    try {
        $invRowsA = $pdo->query(
            "SELECT `id`, `user_id`, `plan_name`, `capital`, `min_rate`, `max_rate`, " .
            "`total_profit_earned`, `pending_profit_claim`, `days_elapsed`, `duration_days`, " .
            "`status`, `last_profit_yield_date` FROM `investments` ORDER BY `user_id`"
        )->fetchAll();
    } catch (Exception $eInvA) {
        jsonResponse(['success' => false, 'message' => 'Gagal membaca tabel investasi: ' . $eInvA->getMessage()], 500);
    }

    $report = [];
    $summary = [
        'investments' => 0,
        'usersChecked' => 0,
        'usersWithIssues' => 0,
        'rateMismatch' => 0,
        'pendingMismatch' => 0,
        'totalMismatch' => 0,
        'outOfRange' => 0,
        'noHistory' => 0,
        'fixedRows' => 0,
        'fixedPending' => 0
    ];
    $stateTouched = false;
    $pendingToSync = [];

    foreach ($invRowsA as $invA) {
        $invIdA = (string)$invA['id'];
        $uidA = (string)$invA['user_id'];
        if ($onlyUserId !== '' && $uidA !== $onlyUserId) continue;
        if (($userNames[$uidA]['role'] ?? '') === 'admin') continue;

        $summary['investments']++;
        $capitalA = (int)($invA['capital'] ?? 0);
        $minA = (float)($invA['min_rate'] ?? 0);
        $maxA = (float)($invA['max_rate'] ?? 0);
        if ($maxA < $minA) $maxA = $minA;
        $pendingA = (int)($invA['pending_profit_claim'] ?? 0);
        $totalA = (int)($invA['total_profit_earned'] ?? 0);

        $historyA = [];
        if (isset($stateInvById[$invIdA]['history']) && is_array($stateInvById[$invIdA]['history'])) {
            $historyA = $stateInvById[$invIdA]['history'];
        }
        if (empty($historyA) && $pendingA <= 0) {
            // Tidak ada riwayat & tidak ada pending: tidak ada yang bisa diperiksa.
            continue;
        }

        $pendingSumA = 0;
        $claimedSumA = 0;
        $invIssues = [];
        $invChanged = false;

        foreach ($historyA as $hiA => $hA) {
            if (!is_array($hA)) continue;
            $statusA = (string)($hA['status'] ?? '');
            $amountA = (int)($hA['amount'] ?? 0);
            $rateA = (isset($hA['rate']) && is_numeric($hA['rate'])) ? (float)$hA['rate'] : null;
            $dateIsoA = normalizeHistoryDate($hA['date'] ?? '');

            if ($statusA === 'pending_claim') $pendingSumA += $amountA;
            if ($statusA === 'claimed') $claimedSumA += $amountA;

            $changedRow = false;
            if ($rateA === null) {
                if ($amountA > 0 && $capitalA > 0) {
                    $invIssues[] = ['type' => 'rate_hilang', 'investmentId' => $invIdA, 'plan' => (string)($invA['plan_name'] ?? ''),
                        'detail' => 'Baris ' . ($dateIsoA ?: '-') . ' punya nominal ' . number_format($amountA, 0, ',', '.') . ' tanpa persen.'];
                    if ($doRepair) {
                        $newRateA = impliedProfitRate($amountA, $capitalA);
                        $stateInvById[$invIdA]['history'][$hiA]['rate'] = $newRateA;
                        $changedRow = true;
                    }
                }
            } else {
                $expectedA = profitAmountFromRate($capitalA, $rateA);
                if ($statusA === 'in_progress') {
                    $canonRateA = deterministicProfitRate($invIdA, $minA, $maxA, $dateIsoA ?: $todayIso);
                    if ($auditLossMode && $dateIsoA === $todayIso) $canonRateA = 0.0;
                    $canonAmountA = profitAmountFromRate($capitalA, $canonRateA);
                    if (abs($canonRateA - $rateA) > 0.001 || $canonAmountA !== $amountA) {
                        $summary['rateMismatch']++;
                        $invIssues[] = ['type' => 'rate_berjalan_beda', 'investmentId' => $invIdA, 'plan' => (string)($invA['plan_name'] ?? ''),
                            'detail' => 'Profit berjalan ' . ($dateIsoA ?: '-') . ' memakai ' . $rateA . '% (IDR ' . number_format($amountA, 0, ',', '.') . '), seharusnya ' . $canonRateA . '% (IDR ' . number_format($canonAmountA, 0, ',', '.') . ').'];
                        if ($doRepair) {
                            $stateInvById[$invIdA]['history'][$hiA]['rate'] = $canonRateA;
                            $stateInvById[$invIdA]['history'][$hiA]['amount'] = $canonAmountA;
                            $changedRow = true;
                        }
                    }
                } elseif (abs($expectedA - $amountA) > 1) {
                    $summary['rateMismatch']++;
                    $impliedA = impliedProfitRate($amountA, $capitalA);
                    $invIssues[] = ['type' => 'nominal_tidak_cocok', 'investmentId' => $invIdA, 'plan' => (string)($invA['plan_name'] ?? ''),
                        'detail' => 'Baris ' . ($dateIsoA ?: '-') . ' tertulis ' . $rateA . '% (seharusnya IDR ' . number_format($expectedA, 0, ',', '.') . ') tetapi nominalnya IDR ' . number_format($amountA, 0, ',', '.') . ' (= ' . $impliedA . '%).'];
                    if ($doRepair && $amountA > 0) {
                        // Uang yang sudah/akan dibayar adalah acuan: persen disesuaikan
                        // agar kartu member menampilkan angka yang benar-benar dibayar.
                        $stateInvById[$invIdA]['history'][$hiA]['rate'] = $impliedA;
                        $changedRow = true;
                    } elseif ($doRepair) {
                        $stateInvById[$invIdA]['history'][$hiA]['amount'] = $expectedA;
                        $changedRow = true;
                    }
                }

                if ($amountA > 0 && $capitalA > 0) {
                    $impliedCheckA = impliedProfitRate($amountA, $capitalA);
                    if ($impliedCheckA < ($minA - 0.01) || $impliedCheckA > ($maxA + 0.01)) {
                        $summary['outOfRange']++;
                        $invIssues[] = ['type' => 'rate_diluar_paket', 'investmentId' => $invIdA, 'plan' => (string)($invA['plan_name'] ?? ''),
                            'detail' => 'Baris ' . ($dateIsoA ?: '-') . ' dibayar ' . $impliedCheckA . '% — di luar rentang paket ' . $minA . '%-' . $maxA . '%.'];
                    }
                }
            }
            if ($changedRow) {
                $stateTouched = true;
                $invChanged = true;
            }
        }

        if (empty($historyA)) {
            $summary['noHistory']++;
            $invIssues[] = ['type' => 'tanpa_riwayat', 'investmentId' => $invIdA, 'plan' => (string)($invA['plan_name'] ?? ''),
                'detail' => 'Pending IDR ' . number_format($pendingA, 0, ',', '.') . ' belum punya baris riwayat harian.'];
            if ($doRepair && $pendingA > 0 && $capitalA > 0) {
                $yieldIsoA = normalizeHistoryDate($invA['last_profit_yield_date'] ?? '') ?: $todayIso;
                $impA = impliedProfitRate($pendingA, $capitalA);
                if (!isset($stateInvById[$invIdA]) || !is_array($stateInvById[$invIdA])) $stateInvById[$invIdA] = [];
                $stateInvById[$invIdA]['history'] = [[
                    'day' => max(1, (int)($invA['days_elapsed'] ?? 0) + 1),
                    'date' => $yieldIsoA,
                    'rate' => $impA,
                    'amount' => $pendingA,
                    'status' => 'pending_claim'
                ]];
                $stateTouched = true;
                $invChanged = true;
                $pendingSumA = $pendingA;
            }
        }

        if (!empty($historyA) && $pendingSumA !== $pendingA) {
            $summary['pendingMismatch']++;
            $invIssues[] = ['type' => 'pending_beda', 'investmentId' => $invIdA, 'plan' => (string)($invA['plan_name'] ?? ''),
                'detail' => 'Pending yang akan dibayar IDR ' . number_format($pendingA, 0, ',', '.') . ' berbeda dari jumlah riwayat pending IDR ' . number_format($pendingSumA, 0, ',', '.') . '.'];
            if ($doRepair) {
                $pendingToSync[$invIdA] = $pendingSumA;
                $stateTouched = true;
                $invChanged = true;
            }
        }

        if ($claimedSumA > 0 && $claimedSumA !== $totalA) {
            $summary['totalMismatch']++;
            $invIssues[] = ['type' => 'total_beda', 'investmentId' => $invIdA, 'plan' => (string)($invA['plan_name'] ?? ''),
                'detail' => 'Total profit tercatat IDR ' . number_format($totalA, 0, ',', '.') . ', sedangkan riwayat klaim IDR ' . number_format($claimedSumA, 0, ',', '.') . '.'];
        }

        if ($doRepair && $invChanged) {
            // Pending yang disimpan di MySQL harus sama dengan baris pending di
            // riwayat setelah diperbaiki (tidak boleh ada dua angka berbeda).
            $sumRepairA = 0;
            if (isset($stateInvById[$invIdA]['history']) && is_array($stateInvById[$invIdA]['history'])) {
                foreach ($stateInvById[$invIdA]['history'] as $hRA) {
                    if (is_array($hRA) && ($hRA['status'] ?? '') === 'pending_claim') $sumRepairA += (int)($hRA['amount'] ?? 0);
                }
            }
            $pendingToSync[$invIdA] = $sumRepairA;
            $summary['fixedRows']++;
        }

        if (!empty($invIssues)) {
            if (!isset($report[$uidA])) {
                $report[$uidA] = [
                    'userId' => $uidA,
                    'username' => $userNames[$uidA]['username'] ?? '-',
                    'issues' => []
                ];
            }
            foreach ($invIssues as $issA) {
                $report[$uidA]['issues'][] = $issA;
            }
        }
    }

    if ($doRepair) {
        if ($stateTouched) {
            $state['investments'] = array_values($stateInvById);
            saveMainState($pdo, $state);
        }
        if (!empty($pendingToSync)) {
            try {
                $updPendingA = $pdo->prepare("UPDATE `investments` SET `pending_profit_claim` = :p WHERE `id` = :id");
                foreach ($pendingToSync as $pIdA => $pValA) {
                    $updPendingA->execute([':p' => (int)$pValA, ':id' => (string)$pIdA]);
                }
                $summary['fixedPending'] = count($pendingToSync);
            } catch (Exception $eUpdPA) {}
        }
    }

    $summary['usersChecked'] = count($userNames);
    $summary['usersWithIssues'] = count($report);

    jsonResponse([
        'success' => true,
        'repaired' => $doRepair,
        'summary' => $summary,
        'users' => array_values($report)
    ]);
}

// Default fallback
http_response_code(404);
echo json_encode(['success' => false, 'message' => 'Action tidak dikenali. Gunakan ?action=get, ?action=save, ?action=ping, ?action=register, ?action=update_user_status, ?action=clear_demo, ?action=backup, ?action=cleanup_duplicates, atau ?action=send_email.']);
