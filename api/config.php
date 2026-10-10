<?php
/**
 * AUTOTRADING - CPANEL MYSQL DATABASE CONFIGURATION
 * Edit the credentials below with your cPanel MySQL Database details.
 */

// Block direct browser access to this configuration file
if (basename($_SERVER['PHP_SELF'] ?? '') === basename(__FILE__)) {
    http_response_code(403);
    header('Content-Type: application/json; charset=UTF-8');
    echo json_encode([
        'success' => false,
        'error' => '403 Forbidden',
        'message' => 'Akses langsung ke file konfigurasi dilarang.'
    ]);
    exit();
}

// Set timezone to Western Indonesia Time (WIB)
date_default_timezone_set('Asia/Jakarta');

// Database Credentials
define('DB_HOST', 'localhost');
define('DB_NAME', 'autotradingmy_good');
define('DB_USER', 'autotradingmy_good');
define('DB_PASS', 'hFQ}?Q^~M7jgl4vY');

// Bootstrap admin password for fresh installs / clear_demo reseeds.
// IMPORTANT: change this password right after the first login.
define('ADMIN_BOOTSTRAP_PASSWORD', 'AT-7qXm42-Vzk9');

// CORS: only allow same-site origins (site itself + local development).
// Credentials (session cookies) are never shared with arbitrary origins.
$allowedOrigins = [
    'https://autotrading.my.id',
    'https://www.autotrading.my.id',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:8000',
    'http://127.0.0.1:8000'
];
$requestOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($requestOrigin !== '' && in_array($requestOrigin, $allowedOrigins, true)) {
    header('Access-Control-Allow-Origin: ' . $requestOrigin);
    header('Vary: Origin');
    header('Access-Control-Allow-Credentials: true');
}
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Content-Type: application/json; charset=UTF-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// ---------------------------------------------------------------------------
// Session bootstrap (httponly, samesite cookie - used by action=login)
// ---------------------------------------------------------------------------
function startAppSession() {
    if (session_status() === PHP_SESSION_ACTIVE) return;
    @ini_set('session.gc_maxlifetime', (string)(86400 * 30));
    $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    $lifetime = 86400 * 30; // 30 days persistent session
    if (PHP_VERSION_ID >= 70300) {
        session_set_cookie_params([
            'lifetime' => $lifetime,
            'path' => '/',
            'domain' => '',
            'secure' => $secure,
            'httponly' => true,
            'samesite' => 'Lax'
        ]);
    } else {
        session_set_cookie_params($lifetime, '/; samesite=Lax', '', $secure, true);
    }
    session_name('ATSESSID');
    @session_start();
}
startAppSession();

// ---------------------------------------------------------------------------
// JSON response helper
// ---------------------------------------------------------------------------
function jsonResponse($payload, $httpCode = 200) {
    http_response_code($httpCode);
    echo json_encode($payload);
    exit();
}

// ---------------------------------------------------------------------------
// Cryptographic Session Token helpers (HMAC-SHA256)
// Provides bulletproof authentication even if PHP session files are cleared by cPanel GC
// ---------------------------------------------------------------------------
function createSessionToken($userId, $role = 'user') {
    $payload = [
        'uid'  => (string)$userId,
        'role' => ($role === 'admin') ? 'admin' : 'user',
        'iat'  => time(),
        'exp'  => time() + (86400 * 60) // 60 days
    ];
    $json = json_encode($payload);
    $sig = hash_hmac('sha256', $json, DB_PASS . '_at_sec_2026');
    return rtrim(strtr(base64_encode($json), '+/', '-_'), '=') . '.' . $sig;
}

function parseSessionToken($token) {
    if (!$token || !is_string($token) || strpos($token, '.') === false) return null;
    $parts = explode('.', $token, 2);
    if (count($parts) !== 2) return null;
    list($b64, $sig) = $parts;
    $json = base64_decode(strtr($b64, '-_', '+/'));
    if (!$json) return null;
    $expectedSig = hash_hmac('sha256', $json, DB_PASS . '_at_sec_2026');
    if (!hash_equals($expectedSig, $sig)) return null;
    $data = json_decode($json, true);
    if (!is_array($data) || empty($data['uid']) || empty($data['exp'])) return null;
    if (time() > (int)$data['exp']) return null;
    return $data;
}

function getRequestAuthToken() {
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if ($authHeader !== '' && preg_match('/Bearer\s+(\S+)/i', $authHeader, $m)) {
        return trim($m[1]);
    }
    if (!empty($_SERVER['HTTP_X_SESSION_TOKEN'])) {
        return trim((string)$_SERVER['HTTP_X_SESSION_TOKEN']);
    }
    if (!empty($_SERVER['HTTP_X_AUTH_TOKEN'])) {
        return trim((string)$_SERVER['HTTP_X_AUTH_TOKEN']);
    }
    if (function_exists('apache_request_headers')) {
        $headers = @apache_request_headers();
        if (is_array($headers)) {
            foreach ($headers as $k => $v) {
                $lk = strtolower($k);
                if ($lk === 'authorization' && preg_match('/Bearer\s+(\S+)/i', $v, $m)) {
                    return trim($m[1]);
                }
                if ($lk === 'x-session-token' || $lk === 'x-auth-token') {
                    return trim((string)$v);
                }
            }
        }
    }
    if (!empty($_COOKIE['AT_TOKEN'])) {
        return trim((string)$_COOKIE['AT_TOKEN']);
    }
    if (!empty($_GET['sessionToken'])) {
        return trim((string)$_GET['sessionToken']);
    }
    return '';
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------
function currentSessionUserId() {
    if (isset($_SESSION['uid']) && is_string($_SESSION['uid']) && $_SESSION['uid'] !== '') {
        return $_SESSION['uid'];
    }
    // Fallback to cryptographic Bearer / X-Session-Token header
    $token = getRequestAuthToken();
    if ($token !== '') {
        $parsed = parseSessionToken($token);
        if ($parsed && !empty($parsed['uid'])) {
            $_SESSION['uid'] = (string)$parsed['uid'];
            $_SESSION['role'] = (string)($parsed['role'] ?? 'user');
            return $_SESSION['uid'];
        }
    }
    return '';
}

function currentSessionRole() {
    if (isset($_SESSION['role']) && is_string($_SESSION['role']) && $_SESSION['role'] !== '') {
        return $_SESSION['role'];
    }
    $uid = currentSessionUserId();
    if ($uid !== '') {
        global $pdo;
        if ($pdo) {
            try {
                $stmt = $pdo->prepare("SELECT `role` FROM `users` WHERE `id` = :uid LIMIT 1");
                $stmt->execute([':uid' => $uid]);
                $row = $stmt->fetch();
                if ($row && !empty($row['role'])) {
                    $_SESSION['role'] = ($row['role'] === 'admin') ? 'admin' : 'user';
                    return $_SESSION['role'];
                }
            } catch (Exception $e) {}
        }
    }
    return '';
}

function requireLogin() {
    if (currentSessionUserId() === '') {
        jsonResponse(['success' => false, 'auth' => true, 'message' => 'Sesi login diperlukan. Silakan login kembali.'], 401);
    }
}

function requireAdmin() {
    requireLogin();
    if (currentSessionRole() !== 'admin') {
        jsonResponse(['success' => false, 'admin' => true, 'message' => 'Akses ditolak: hanya Administrator yang diizinkan.'], 403);
    }
}

// ---------------------------------------------------------------------------
// Simple file-based rate limiter (per IP + action)
// ---------------------------------------------------------------------------
function rateLimit($bucket, $maxAttempts, $windowSeconds) {
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'cli';
    $key = preg_replace('/[^a-zA-Z0-9_\-]/', '', $bucket) . '_' . md5($ip);
    $file = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'at_rl_' . $key . '.json';

    $now = time();
    $data = ['count' => 0, 'start' => $now];
    if (is_file($file)) {
        $raw = @file_get_contents($file);
        $decoded = $raw ? json_decode($raw, true) : null;
        if (is_array($decoded) && isset($decoded['start'], $decoded['count'])) {
            $data = $decoded;
        }
    }
    if (($now - (int)$data['start']) > $windowSeconds) {
        $data = ['count' => 0, 'start' => $now];
    }
    $data['count'] = (int)$data['count'] + 1;
    @file_put_contents($file, json_encode($data), LOCK_EX);

    return $data['count'] <= $maxAttempts;
}

// ---------------------------------------------------------------------------
// Password hashing (bcrypt via password_hash / password_verify)
// ---------------------------------------------------------------------------
function isBcryptHash($value) {
    return is_string($value) && (strpos($value, '$2y$') === 0 || strpos($value, '$2a$') === 0 || strpos($value, '$2b$') === 0);
}

function hashPassword($plain) {
    return password_hash((string)$plain, PASSWORD_BCRYPT);
}

/**
 * Verify a plain password against a stored value.
 * Supports legacy plaintext rows: on success the caller should re-hash (needsRehash).
 * Returns ['ok' => bool, 'needsRehash' => bool]
 */
function verifyPassword($plain, $stored) {
    $plain = (string)$plain;
    $stored = (string)$stored;
    if ($stored === '') return ['ok' => false, 'needsRehash' => false];
    if (isBcryptHash($stored)) {
        return ['ok' => password_verify($plain, $stored), 'needsRehash' => false];
    }
    // Legacy plaintext comparison (pre-migration rows)
    $ok = hash_equals($stored, $plain);
    return ['ok' => $ok, 'needsRehash' => $ok];
}

// ---------------------------------------------------------------------------
// Secret stripping: passwords / OTP / reset codes never leave the server
// ---------------------------------------------------------------------------
function stripUserSecrets(&$u) {
    if (!is_array($u)) return;
    foreach (['password', 'password_hash', 'passwordHash', 'salt', 'verificationOtp',
              'passwordResetRequest', 'resetOtp', 'otp', 'otpCode'] as $secretKey) {
        unset($u[$secretKey]);
    }
}

function sanitizeStateData(&$data) {
    if (!is_array($data)) return;
    if (isset($data['users']) && is_array($data['users'])) {
        foreach ($data['users'] as &$u) stripUserSecrets($u);
        unset($u);
    }
}

function safeUserPayload($u) {
    if (!is_array($u)) return [];
    $copy = $u;
    stripUserSecrets($copy);
    return $copy;
}

// ---------------------------------------------------------------------------
// Server-side save policy: non-admin sessions cannot mint money or privileges
// ---------------------------------------------------------------------------
function applySavePolicy(&$parsed, $existing, $sessionUid, $isSessionAdmin, $pdo) {
    if (!is_array($parsed)) return;
    if (!isset($parsed['users']) || !is_array($parsed['users'])) {
        $parsed['users'] = [];
    }

    // 1. Secrets are never accepted from any client (admin included)
    foreach ($parsed['users'] as &$u) stripUserSecrets($u);
    unset($u);

    if ($isSessionAdmin) return; // Full trust for authenticated admin sessions

    $hasExisting = is_array($existing) && count($existing) > 0;

    // 2. Admin-managed sections can only be edited by an admin session
    if ($hasExisting) {
        foreach (['settings', 'plans', 'banners', 'announcements', 'signals'] as $adminKey) {
            if (array_key_exists($adminKey, $existing)) {
                $parsed[$adminKey] = $existing[$adminKey];
            }
        }
        // Protect rewards catalog from non-admin modification while allowing legitimate stock decrement
        if (array_key_exists('rewards', $existing)) {
            $baseRewards = $existing['rewards'];
            if (is_array($baseRewards)) {
                $incomingRewards = isset($parsed['rewards']) && is_array($parsed['rewards']) ? $parsed['rewards'] : [];
                $stockMap = [];
                foreach ($incomingRewards as $ir) {
                    if (!empty($ir['id']) && isset($ir['stock'])) {
                        $stockMap[$ir['id']] = (int)$ir['stock'];
                    }
                }
                foreach ($baseRewards as &$br) {
                    $bid = $br['id'] ?? '';
                    if ($bid !== '' && isset($stockMap[$bid]) && $stockMap[$bid] >= 0 && $stockMap[$bid] <= (int)($br['stock'] ?? 0)) {
                        $br['stock'] = $stockMap[$bid];
                    }
                }
                unset($br);
            }
            $parsed['rewards'] = $baseRewards;
        }
    }

    $existingUsers = ($hasExisting && isset($existing['users']) && is_array($existing['users']))
        ? $existing['users'] : [];

    // 3. Baseline (source of truth): JSON state merged with relational users table
    $baseline = [];
    foreach ($existingUsers as $eu) {
        if (empty($eu['id'])) continue;
        $baseline[$eu['id']] = [
            'wallet'      => (int)($eu['walletBalance'] ?? 0),
            'affiliate'   => (int)($eu['affiliateBalance'] ?? 0),
            'points'      => (int)($eu['points'] ?? 0),
            'role'        => (($eu['role'] ?? 'user') === 'admin') ? 'admin' : 'user',
            'status'      => (string)($eu['status'] ?? 'active'),
            'isBlocked'   => !empty($eu['isBlocked']),
            'blockedReason' => (string)($eu['blockedReason'] ?? ''),
            'blockHistory'  => isset($eu['blockHistory']) && is_array($eu['blockHistory']) ? $eu['blockHistory'] : [],
            'bankAccount' => isset($eu['bankAccount']) && is_array($eu['bankAccount']) ? $eu['bankAccount'] : null,
            'emailVerified' => !empty($eu['emailVerified']),
            'isPendingVerification' => !empty($eu['isPendingVerification']),
            'hasVerification' => array_key_exists('emailVerified', $eu) || array_key_exists('isPendingVerification', $eu),
            'hasBank'     => array_key_exists('bankAccount', $eu),
            'hasBlockHistory' => array_key_exists('blockHistory', $eu),
        ];
    }
    if ($pdo) {
        try {
            $rows = $pdo->query("SELECT `id`, `wallet_balance`, `affiliate_balance`, `points`, `role`, `status`, `is_blocked`, `blocked_reason` FROM `users`")->fetchAll();
            foreach ($rows as $r) {
                $rid = (string)$r['id'];
                if (!isset($baseline[$rid])) {
                    $baseline[$rid] = [
                        'wallet' => 0, 'affiliate' => 0, 'points' => 0,
                        'role' => 'user', 'status' => 'active', 'isBlocked' => false,
                        'blockedReason' => '', 'blockHistory' => [], 'bankAccount' => null,
                        'emailVerified' => false, 'isPendingVerification' => false,
                        'hasVerification' => false, 'hasBank' => false, 'hasBlockHistory' => false,
                    ];
                }
                $baseline[$rid]['wallet']    = (int)$r['wallet_balance'];
                $baseline[$rid]['affiliate'] = (int)$r['affiliate_balance'];
                $baseline[$rid]['points']    = (int)$r['points'];
                $baseline[$rid]['role']      = (($r['role'] ?? '') === 'admin') ? 'admin' : ($baseline[$rid]['role'] === 'admin' ? 'admin' : 'user');
                $baseline[$rid]['isBlocked'] = !empty($r['is_blocked']);
                $baseline[$rid]['blockedReason'] = (string)($r['blocked_reason'] ?? '');
                if (($r['status'] ?? '') !== '') $baseline[$rid]['status'] = (string)$r['status'];
            }
        } catch (Exception $eRelBase) {}
    }

    $hasBaseline = count($baseline) > 0;

    // 4. Allowed credit = NEW approved money-credit transactions recorded in this payload,
    //    capped by a rolling 24h credit budget read from the transactions table.
    $existingTrxIds = [];
    if ($hasExisting && isset($existing['transactions']) && is_array($existing['transactions'])) {
        foreach ($existing['transactions'] as $t) {
            if (!empty($t['id'])) $existingTrxIds[$t['id']] = true;
        }
    }
    $creditTypes = ['profit_claim', 'capital_refund', 'capital_return', 'bonus', 'commission', 'referral_bonus',
                    'rabat', 'rabat_bonus', 'leader_bonus', 'affiliate_transfer', 'member_transfer', 'reward', 'matching_bonus', 'sponsor_bonus', 'checkin', 'ppob_refund', 'adjustment', 'manual_adjustment'];
    $creditByUser = [];
    $pointsByUser = [];
    $newTrxCount = [];
    if (isset($parsed['transactions']) && is_array($parsed['transactions'])) {
        foreach ($parsed['transactions'] as $t) {
            $tid = (string)($t['id'] ?? '');
            $uid = (string)($t['userId'] ?? '');
            if ($tid === '' || $uid === '' || isset($existingTrxIds[$tid])) continue;
            $newTrxCount[$uid] = ($newTrxCount[$uid] ?? 0) + 1;
            $tType = (string)($t['type'] ?? '');
            if ($tType === 'invest_plan') {
                $pointsByUser[$uid] = ($pointsByUser[$uid] ?? 0) + 60;
            } elseif ($tType === 'deposit') {
                $pointsByUser[$uid] = ($pointsByUser[$uid] ?? 0) + 10;
            } elseif ($tType === 'profit_claim') {
                $pointsByUser[$uid] = ($pointsByUser[$uid] ?? 0) + 5;
            }
            if (($t['status'] ?? 'pending') !== 'approved') continue;
            if (!in_array($tType, $creditTypes, true)) continue;
            $amt = (int)($t['amount'] ?? 0);
            if ($amt > 0) $creditByUser[$uid] = ($creditByUser[$uid] ?? 0) + $amt;
        }
    }

    // Rolling 24h credit cap (anti-abuse tripwire, configurable via settings.serverDailyCreditCap)
    $dailyCap = 250000000;
    if ($hasExisting && isset($existing['settings']['serverDailyCreditCap'])) {
        $cfgCap = (int)$existing['settings']['serverDailyCreditCap'];
        if ($cfgCap > 0) $dailyCap = $cfgCap;
    }
    $recentCredit = [];
    if ($pdo && count($creditByUser) > 0) {
        try {
            $placeholders = implode(',', array_fill(0, count($creditTypes), '?'));
            $sql = "SELECT `user_id`, COALESCE(SUM(`amount`), 0) AS total FROM `transactions`
                    WHERE `status` = 'approved' AND `type` IN ($placeholders)
                      AND `created_at` >= (NOW() - INTERVAL 24 HOUR)
                    GROUP BY `user_id`";
            $stmtR = $pdo->prepare($sql);
            $stmtR->execute($creditTypes);
            foreach ($stmtR->fetchAll() as $rr) {
                $recentCredit[(string)$rr['user_id']] = (int)$rr['total'];
            }
        } catch (Exception $eCap) {}
    }
    foreach ($creditByUser as $cu => $amt) {
        $already = (int)($recentCredit[$cu] ?? 0);
        $creditByUser[$cu] = max(0, min($amt, $dailyCap - $already));
    }

    // 5. Enforce per-user
    foreach ($parsed['users'] as &$u) {
        $uid = (string)($u['id'] ?? '');
        if ($uid === '') continue;

        if (!isset($baseline[$uid])) {
            // Brand-new record written by a non-admin: force neutral values
            $u['walletBalance'] = 0;
            $u['affiliateBalance'] = 0;
            $u['points'] = 10;
            $u['role'] = 'user';
            $u['status'] = 'active';
            $u['isBlocked'] = false;
            $u['blockedReason'] = '';
            unset($u['blockHistory']);
            continue;
        }

        $b = $baseline[$uid];
        $isSelf = ($uid === (string)$sessionUid);

        // Privileges / moderation flags are server-controlled for everyone (admin sessions bypass)
        $u['role'] = $b['role'];
        $u['isBlocked'] = $b['isBlocked'];
        $u['status'] = $b['status'];
        $u['blockedReason'] = $b['blockedReason'];
        if ($b['hasBlockHistory']) $u['blockHistory'] = $b['blockHistory'];
        if ($b['hasVerification']) {
            $u['emailVerified'] = $b['emailVerified'];
            $u['isPendingVerification'] = $b['isPendingVerification'];
        }

        if (!$hasBaseline) continue; // Fresh install restore: keep payload as-is

        // Withdrawal bank details of other users are immutable
        if (!$isSelf && $b['hasBank'] && $b['bankAccount'] !== null) {
            $u['bankAccount'] = $b['bankAccount'];
        }

        $inW = (int)($u['walletBalance'] ?? 0);
        $inA = (int)($u['affiliateBalance'] ?? 0);
        $inP = (int)($u['points'] ?? 0);
        $allowedCredit = (int)($creditByUser[$uid] ?? 0);
        $allowedPoints = max(10 * (int)($newTrxCount[$uid] ?? 0), (int)($pointsByUser[$uid] ?? 0));

        // Balances: increases must be justified by the transaction ledger
        $incW = max(0, $inW - $b['wallet']);
        $incA = max(0, $inA - $b['affiliate']);
        $pos = $incW + $incA;
        if ($pos > $allowedCredit) {
            $takeW = $pos > 0 ? (int)floor($incW * $allowedCredit / $pos) : 0;
            $takeA = (int)min(max(0, $allowedCredit - $takeW), $incA);
            $u['walletBalance'] = $b['wallet'] + $takeW;
            $u['affiliateBalance'] = $b['affiliate'] + $takeA;
        }
        if (!$isSelf) {
            // Other people's balances can never decrease from a member session
            if ((int)$u['walletBalance'] < $b['wallet']) $u['walletBalance'] = $b['wallet'];
            if ((int)$u['affiliateBalance'] < $b['affiliate']) $u['affiliateBalance'] = $b['affiliate'];
            if ($inP < $b['points']) $u['points'] = $b['points'];
        }

        // Loyalty points: increase only with new recorded activity
        $incP = (int)$u['points'] - $b['points'];
        if ($incP > $allowedPoints) $u['points'] = $b['points'] + $allowedPoints;

        // Strip any secret a client tried to sneak in again
        stripUserSecrets($u);
    }
    unset($u);
}

/**
 * Returns a PDO connection instance or null on failure.
 */
function getDbConnection() {
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }

    try {
        $dsn = "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8mb4";
        $options = [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ];
        $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
        return $pdo;
    } catch (PDOException $e) {
        // Return null if connection fails (e.g. before credentials are set)
        return null;
    }
}
