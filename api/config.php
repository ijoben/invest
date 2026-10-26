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

// Default server-side SMTP password (never exposed to client/browser)
define('DEFAULT_SMTP_PASS', 'WSxYuJKO+idDc6?H');

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
// Jangan bocorkan versi PHP (memudahkan pencarian exploit versi EOL).
@header_remove('X-Powered-By');

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
    if (!empty($_GET['sessionToken'])) {
        return trim((string)$_GET['sessionToken']);
    }
    if (!empty($_POST['sessionToken'])) {
        return trim((string)$_POST['sessionToken']);
    }
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
    return '';
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------
function currentSessionUserId() {
    $token = getRequestAuthToken();
    if ($token !== '') {
        $parsed = parseSessionToken($token);
        if ($parsed && !empty($parsed['uid'])) {
            $_SESSION['uid'] = (string)$parsed['uid'];
            $_SESSION['role'] = (string)($parsed['role'] ?? 'user');
            return $_SESSION['uid'];
        }
    }
    if (isset($_SESSION['uid']) && is_string($_SESSION['uid']) && $_SESSION['uid'] !== '') {
        return $_SESSION['uid'];
    }
    return '';
}

function currentSessionRole() {
    $uid = currentSessionUserId();
    // SECURITY: role tidak lagi ditentukan oleh ID yang di-hardcode. Dulu uid
    // 'usr-admin' otomatis dianggap admin tanpa melihat database, sehingga
    // siapa pun yang berhasil menaruh uid tersebut di sesi langsung mendapat
    // hak administrator. Otoritas sekarang selalu berasal dari DB atau dari
    // role yang melekat pada sesi hasil login (server-signed).
    if (isset($_SESSION['role']) && is_string($_SESSION['role']) && $_SESSION['role'] !== '') {
        return $_SESSION['role'];
    }
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
// Robust file-based rate limiter (per IP + action)
// ---------------------------------------------------------------------------
function getRateLimitFile($bucket) {
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'cli';
    $key = preg_replace('/[^a-zA-Z0-9_\-]/', '', $bucket) . '_' . md5($ip);
    return rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'at_rl_' . $key . '.json';
}

function checkRateLimit($bucket, $maxAttempts, $windowSeconds) {
    $file = getRateLimitFile($bucket);
    if (!is_file($file)) return true;
    $raw = @file_get_contents($file);
    $decoded = $raw ? json_decode($raw, true) : null;
    if (!is_array($decoded) || !isset($decoded['start'], $decoded['count'])) return true;
    $now = time();
    if (($now - (int)$decoded['start']) > $windowSeconds) {
        @unlink($file);
        return true;
    }
    return (int)$decoded['count'] < $maxAttempts;
}

function recordRateLimitHit($bucket, $windowSeconds) {
    $file = getRateLimitFile($bucket);
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
    return $data['count'];
}

function clearRateLimit($bucket) {
    $file = getRateLimitFile($bucket);
    if (is_file($file)) {
        @unlink($file);
    }
}

function rateLimit($bucket, $maxAttempts, $windowSeconds) {
    if (!checkRateLimit($bucket, $maxAttempts, $windowSeconds)) {
        return false;
    }
    $count = recordRateLimitHit($bucket, $windowSeconds);
    return $count <= $maxAttempts;
}

function setAuthSessionCookie($token) {
    $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    $lifetime = time() + (86400 * 60); // 60 days
    if (PHP_VERSION_ID >= 70300) {
        @setcookie('AT_TOKEN', $token, [
            'expires' => $lifetime,
            'path' => '/',
            'domain' => '',
            'secure' => $secure,
            'httponly' => true,
            'samesite' => 'Lax'
        ]);
    } else {
        @setcookie('AT_TOKEN', $token, $lifetime, '/; samesite=Lax', '', $secure, true);
    }
}

function clearAuthSessionCookie() {
    $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    if (PHP_VERSION_ID >= 70300) {
        @setcookie('AT_TOKEN', '', [
            'expires' => time() - 86400,
            'path' => '/',
            'domain' => '',
            'secure' => $secure,
            'httponly' => true,
            'samesite' => 'Lax'
        ]);
    } else {
        @setcookie('AT_TOKEN', '', time() - 86400, '/; samesite=Lax', '', $secure, true);
    }
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

function saveBase64ImageFile($base64Data, $prefix = 'proof') {
    if (empty($base64Data) || !is_string($base64Data)) return null;
    
    // If it's already a URL, return it directly
    if (strpos($base64Data, 'http://') === 0 || strpos($base64Data, 'https://') === 0 || strpos($base64Data, '/uploads/') === 0) {
        return $base64Data;
    }
    
    // Check if it's data URI
    if (!preg_match('/^data:image\/([a-zA-Z0-9\+\-\.]+);base64,(.+)$/', $base64Data, $matches)) {
        return $base64Data;
    }
    
    $rawMime = strtolower($matches[1]);
    if ($rawMime === 'jpeg') $ext = 'jpg';
    elseif (in_array($rawMime, ['png', 'webp', 'gif'], true)) $ext = $rawMime;
    else return null; // SVG/ICO and dangerous formats blocked
    
    $binary = base64_decode($matches[2]);
    if ($binary === false || strlen($binary) === 0) return null;
    
    $uploadDir = dirname(__DIR__) . '/uploads';
    if (!is_dir($uploadDir)) {
        @mkdir($uploadDir, 0755, true);
    }
    
    // Deterministic filename so ETag remains rock-solid stable and avoids redundant writes
    $safeName = preg_replace('/[^a-zA-Z0-9_-]/', '_', $prefix) . '.' . $ext;
    $filePath = $uploadDir . '/' . $safeName;
    $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (isset($_SERVER['SERVER_PORT']) && $_SERVER['SERVER_PORT'] == 443) ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'autotrading.my.id';
    $publicUrl = $protocol . '://' . $host . '/uploads/' . $safeName;

    if (file_exists($filePath) && filesize($filePath) > 0) {
        return $publicUrl;
    }

    $binary = base64_decode($matches[2]);
    if ($binary === false || strlen($binary) === 0) return null;

    if (file_put_contents($filePath, $binary) !== false) {
        return $publicUrl;
    }
    
    return $base64Data;
}

function sanitizeStateData(&$data) {
    if (!is_array($data)) return;
    if (isset($data['users']) && is_array($data['users'])) {
        foreach ($data['users'] as &$u) stripUserSecrets($u);
        unset($u);
    }
    // Never expose SMTP passwords to client responses or stored state
    if (isset($data['settings']['email']['smtp']['pass'])) {
        unset($data['settings']['email']['smtp']['pass']);
    }
    if (isset($data['transactions']) && is_array($data['transactions'])) {
        foreach ($data['transactions'] as &$t) {
            if (!empty($t['proofImage']) && is_string($t['proofImage']) && strpos($t['proofImage'], 'data:image') === 0) {
                $tId = preg_replace('/[^a-zA-Z0-9]/', '', $t['id'] ?? 'trx');
                $url = saveBase64ImageFile($t['proofImage'], 'proof_' . $tId);
                if ($url) {
                    $t['proofImage'] = $url;
                }
            }
        }
        unset($t);
    }
}

function safeUserPayload($u) {
    if (!is_array($u)) return [];
    $copy = $u;
    stripUserSecrets($copy);
    return $copy;
}

// ---------------------------------------------------------------------------
// Text sanitizer: member-supplied free text (testimoni & catatan transaksi)
// ---------------------------------------------------------------------------
// Nilai-nilai ini dirender ke tabel admin / kartu testimoni publik. Menyimpan
// karakter '<' '>' memungkinkan stored XSS lintas-peran (member -> admin), jadi
// dibersihkan di sumber sebelum state disimpan, bukan hanya di sisi tampilan.
function sanitizeUserFreeText(&$data) {
    if (!is_array($data)) return;

    if (isset($data['testimonials']) && is_array($data['testimonials'])) {
        foreach ($data['testimonials'] as &$t) {
            if (!is_array($t)) continue;
            foreach (['name', 'city', 'bank', 'comment'] as $k) {
                if (isset($t[$k]) && is_string($t[$k])) {
                    $clean = trim(preg_replace('/\s+/u', ' ', str_replace(['<', '>'], '', strip_tags($t[$k]))));
                    if (function_exists('mb_substr') && mb_strlen($clean, 'UTF-8') > 400) {
                        $clean = mb_substr($clean, 0, 400, 'UTF-8');
                    } elseif (strlen($clean) > 400) {
                        $clean = substr($clean, 0, 400);
                    }
                    $t[$k] = $clean;
                }
            }
        }
        unset($t);
    }

    if (isset($data['transactions']) && is_array($data['transactions'])) {
        foreach ($data['transactions'] as &$trx) {
            if (!is_array($trx) || !isset($trx['note']) || !is_string($trx['note'])) continue;
            $trx['note'] = str_replace(['<', '>'], '', $trx['note']);
        }
        unset($trx);
    }

    if (isset($data['redemptions']) && is_array($data['redemptions'])) {
        foreach ($data['redemptions'] as &$rd) {
            if (!is_array($rd)) continue;
            foreach (['note', 'deliveryAddress', 'targetContact', 'rewardTitle'] as $k) {
                if (isset($rd[$k]) && is_string($rd[$k])) {
                    $rd[$k] = str_replace(['<', '>'], '', $rd[$k]);
                }
            }
        }
        unset($rd);
    }
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

    // 1b. Session-derived keys are never client-writable state. Persisting them
    // (admin "full trust" saves included) leaked one browser's currentUser/isAdmin
    // into shared state that was then served to every guest on action=get.
    foreach (['currentUser', 'currentSession', 'isAdmin', 'isGuest'] as $sessionStateKey) {
        unset($parsed[$sessionStateKey]);
    }

    // 1c. Free text dari member dibersihkan dari payload HTML (anti stored XSS).
    sanitizeUserFreeText($parsed);

    if ($isSessionAdmin) return; // Full trust for authenticated admin sessions

    $hasExisting = is_array($existing) && count($existing) > 0;

    // 2. Admin-managed sections can only be edited by an admin session
    if ($hasExisting) {
        $authoritativePlans = null;
        if ($pdo) {
            try {
                $pStmt = $pdo->prepare("SELECT `setting_value` FROM `settings` WHERE `setting_key` = 'platform_plans' LIMIT 1");
                $pStmt->execute();
                $pRow = $pStmt->fetch();
                if ($pRow && !empty($pRow['setting_value'])) {
                    $dbP = json_decode($pRow['setting_value'], true);
                    if (is_array($dbP) && count($dbP) > 0) $authoritativePlans = $dbP;
                }
            } catch (Exception $eP) {}
        }

        foreach (['settings', 'plans', 'banners', 'announcements', 'signals'] as $adminKey) {
            if ($adminKey === 'plans' && $authoritativePlans) {
                $parsed['plans'] = $authoritativePlans;
            } elseif (array_key_exists($adminKey, $existing)) {
                $parsed[$adminKey] = $existing[$adminKey];
            }
        }
        // Protect investments from unauthorized creation/tampering, but preserve valid history updates for own investments
        if (array_key_exists('investments', $existing)) {
            $baseInvs = $existing['investments'];
            if (is_array($baseInvs) && isset($parsed['investments']) && is_array($parsed['investments'])) {
                $incomingMap = [];
                foreach ($parsed['investments'] as $pi) {
                    if (!empty($pi['id']) && ($pi['userId'] ?? '') === (string)$sessionUid) {
                        $incomingMap[$pi['id']] = $pi;
                    }
                }
                foreach ($baseInvs as &$bi) {
                    $bid = $bi['id'] ?? '';
                    if ($bid !== '' && isset($incomingMap[$bid])) {
                        $inc = $incomingMap[$bid];
                        if (isset($inc['history']) && is_array($inc['history'])) {
                            $bi['history'] = $inc['history'];
                        }
                        if (isset($inc['lastProfitYieldDate'])) {
                            $bi['lastProfitYieldDate'] = $inc['lastProfitYieldDate'];
                        }
                    }
                }
                unset($bi);
            }
            $parsed['investments'] = $baseInvs;
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
            // Identitas akun ikut dibekukan: snapshot client tidak boleh mengubah
            // email/username akun lain (dipakai untuk takeover via reset password).
            'identity' => [
                'email'        => (string)($eu['email'] ?? ''),
                'phone'        => (string)($eu['phone'] ?? ''),
                'username'     => (string)($eu['username'] ?? ''),
                'fullName'     => (string)($eu['fullName'] ?? ''),
                'city'         => (string)($eu['city'] ?? ''),
                'referralCode' => (string)($eu['referralCode'] ?? ''),
                'referredBy'   => (string)($eu['referredBy'] ?? ''),
            ],
        ];
    }
    if ($pdo) {
        try {
            $rows = $pdo->query("SELECT `id`, `username`, `full_name`, `email`, `phone`, `wallet_balance`, `affiliate_balance`, `points`, `role`, `status`, `is_blocked`, `blocked_reason` FROM `users`")->fetchAll();
            foreach ($rows as $r) {
                $rid = (string)$r['id'];
                if (!isset($baseline[$rid])) {
                    $baseline[$rid] = [
                        'wallet' => 0, 'affiliate' => 0, 'points' => 0,
                        'role' => 'user', 'status' => 'active', 'isBlocked' => false,
                        'blockedReason' => '', 'blockHistory' => [], 'bankAccount' => null, 'identity' => [],
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
                // Identitas akun dari tabel MySQL juga dibekukan, supaya user yang
                // hanya ada di DB (belum ada di JSON state) tetap tidak bisa
                // diubah emailnya lewat snapshot save milik member lain.
                foreach (['username' => 'username', 'fullName' => 'full_name', 'email' => 'email', 'phone' => 'phone'] as $stateKey => $dbCol) {
                    $dbVal = (string)($r[$dbCol] ?? '');
                    if ($dbVal !== '') {
                        if (!isset($baseline[$rid]['identity']) || !is_array($baseline[$rid]['identity'])) {
                            $baseline[$rid]['identity'] = [];
                        }
                        if (empty($baseline[$rid]['identity'][$stateKey])) {
                            $baseline[$rid]['identity'][$stateKey] = $dbVal;
                        }
                    }
                }
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
    $creditTypes = ['deposit', 'profit_claim', 'capital_refund', 'capital_return', 'bonus', 'commission', 'referral_bonus',
                    'rabat', 'rabat_bonus', 'leader_bonus', 'affiliate_transfer', 'member_transfer', 'member_transfer_in', 'reward', 'matching_bonus', 'sponsor_bonus', 'checkin', 'daily_checkin', 'check_in', 'ppob_refund', 'adjustment', 'manual_adjustment'];
    $debitTypes = ['invest_plan', 'withdraw', 'ppob_conversion', 'member_transfer_out'];
    $creditByUser = [];
    $debitByUser = [];
    // Money that legitimately LEAVES the "Wallet Tambah Teman" (affiliate/team) wallet:
    // affiliate -> main wallet transfers, plus withdrawals/PPOB paid from that wallet.
    // Without this the affiliate balance could never go down (it was clamped back to the
    // baseline), so a member kept their team balance even after transferring it to the
    // main wallet - money appeared out of nowhere.
    $affiliateOutByUser = [];
    $pointsByUser = [];
    $newTrxCount = [];
    if (isset($parsed['transactions']) && is_array($parsed['transactions'])) {
        foreach ($parsed['transactions'] as $t) {
            $tid = (string)($t['id'] ?? '');
            $uid = (string)($t['userId'] ?? '');
            if ($tid === '' || $uid === '') continue;
            $tType = (string)($t['type'] ?? '');
            $amt = (int)($t['amount'] ?? 0);

            if ((in_array($tType, $debitTypes, true) || strpos($tid, 'TRX-TRFO-') === 0) && $amt > 0) {
                $debitByUser[$uid] = ($debitByUser[$uid] ?? 0) + $amt;
            }

            $src = (string)($t['walletSource'] ?? $t['source'] ?? '');
            $isAffiliateOut = ($tType === 'affiliate_transfer' || strpos($tid, 'TRX-TRF-') === 0)
                || (in_array($tType, ['withdraw', 'ppob_conversion'], true)
                    && in_array($src, ['affiliate', 'Wallet Tambah Teman'], true));
            // Only NEW ledger rows in this payload justify a fresh decrease (no replay).
            if ($isAffiliateOut && $amt > 0 && !isset($existingTrxIds[$tid])) {
                $affiliateOutByUser[$uid] = ($affiliateOutByUser[$uid] ?? 0) + $amt;
            }

            if (isset($existingTrxIds[$tid])) continue;
            $newTrxCount[$uid] = ($newTrxCount[$uid] ?? 0) + 1;
            if ($tType === 'invest_plan') {
                $pointsByUser[$uid] = ($pointsByUser[$uid] ?? 0) + 60;
            } elseif ($tType === 'deposit') {
                $pointsByUser[$uid] = ($pointsByUser[$uid] ?? 0) + 10;
            } elseif ($tType === 'profit_claim') {
                $pointsByUser[$uid] = ($pointsByUser[$uid] ?? 0) + 5;
            }
            if (($t['status'] ?? 'pending') !== 'approved') continue;
            if (!in_array($tType, $creditTypes, true)) continue;
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

        // SECURITY: identitas (email/telepon/username/nama/kota) akun LAIN tidak
        // boleh diubah lewat snapshot save. Mengubah email korban ke mailbox
        // penyerang akan mengalihkan kode reset password = account takeover.
        if (!$isSelf && !empty($b['identity']) && is_array($b['identity'])) {
            foreach ($b['identity'] as $idKey => $idVal) {
                if ($idVal !== '') $u[$idKey] = $idVal;
            }
        }

        $inW = (int)($u['walletBalance'] ?? 0);
        $inA = (int)($u['affiliateBalance'] ?? 0);
        $inP = (int)($u['points'] ?? 0);
        $allowedCredit = (int)($creditByUser[$uid] ?? 0);
        $allowedDebit = (int)($debitByUser[$uid] ?? 0);
        $allowedPoints = max(10 * (int)($newTrxCount[$uid] ?? 0), (int)($pointsByUser[$uid] ?? 0));

        // Credit legitimate check-in bonus if checked in today
        $dci = $u['dailyCheckIn'] ?? null;
        if (is_array($dci) && !empty($dci['lastCheckInDate']) && $dci['lastCheckInDate'] === date('Y-m-d')) {
            $allowedCredit += 1000;
        }

        // Balances: increases must be justified by the transaction ledger
        $userAllTxs = array_filter($parsed['transactions'] ?? [], function($tx) use ($uid) {
            return ($tx['userId'] ?? '') === $uid && ($tx['status'] ?? 'approved') === 'approved';
        });
        $ledgerDep = 0; $ledgerInv = 0; $ledgerWd = 0; $ledgerProfit = 0; $ledgerBonus = 0; $ledgerRefund = 0;
        $ledgerSps = 0; $ledgerRbt = 0; $ledgerWdAff = 0; $ledgerP2pIn = 0; $ledgerP2pOut = 0;
        foreach ($userAllTxs as $ut) {
            $uAmt = (int)($ut['amount'] ?? 0);
            $uTyp = (string)($ut['type'] ?? '');
            $uSrc = (string)($ut['walletSource'] ?? $ut['source'] ?? '');
            $uNote = (string)($ut['note'] ?? '');
            $uId = (string)($ut['id'] ?? '');
            if ($uTyp === 'deposit') $ledgerDep += $uAmt;
            elseif ($uTyp === 'invest_plan') $ledgerInv += $uAmt;
            elseif ($uTyp === 'withdraw') {
                if ($uSrc === 'Wallet Tambah Teman' || $uSrc === 'affiliate') $ledgerWdAff += $uAmt;
                else $ledgerWd += $uAmt;
            }
            elseif ($uTyp === 'profit_claim') $ledgerProfit += $uAmt;
            elseif ($uTyp === 'bonus' || $uTyp === 'checkin' || $uTyp === 'daily_checkin' || $uTyp === 'check_in' || strpos($uId, 'TX-CHK-') === 0 || stripos($uNote, 'absen') !== false) $ledgerBonus += $uAmt;
            elseif ($uTyp === 'capital_refund') $ledgerRefund += $uAmt;
            elseif ($uTyp === 'leader_bonus') {
                if (stripos($uNote, 'Saldo Utama') !== false) $ledgerBonus += $uAmt;
                else $ledgerSps += $uAmt;
            }
            elseif ($uTyp === 'sponsor_bonus') {
                if (stripos($uNote, 'ditransfer ke Saldo Utama') !== false) $ledgerBonus += $uAmt;
                else $ledgerSps += $uAmt;
            }
            elseif ($uTyp === 'rabat_bonus') $ledgerRbt += $uAmt;
            elseif ($uTyp === 'ppob_conversion') {
                if ($uSrc === 'Wallet Tambah Teman' || $uSrc === 'affiliate') $ledgerWdAff += $uAmt;
                else $ledgerWd += $uAmt;
            }
            elseif ($uTyp === 'member_transfer' || $uTyp === 'member_transfer_in' || strpos($uId, 'TRX-TRFI-') === 0 || stripos($uNote, 'Terima transfer') !== false) {
                $ledgerP2pIn += $uAmt;
            }
            elseif ($uTyp === 'member_transfer_out' || strpos($uId, 'TRX-TRFO-') === 0 || stripos($uNote, 'Transfer saldo ke member') !== false) {
                $ledgerP2pOut += $uAmt;
            }
        }
        $ledgerMaxW = max(0, $ledgerDep - $ledgerInv - $ledgerWd + $ledgerProfit + $ledgerBonus + $ledgerRefund + $ledgerP2pIn - $ledgerP2pOut);
        $ledgerMaxA = max(0, $ledgerSps + $ledgerRbt - $ledgerWdAff);

        $incW = max(0, $inW - $b['wallet']);
        $incA = max(0, $inA - $b['affiliate']);
        $pos = $incW + $incA;
        if ($pos > $allowedCredit) {
            // Allow if justified by the full transaction ledger
            if ($inW <= $ledgerMaxW && $inA <= $ledgerMaxA) {
                $u['walletBalance'] = $inW;
                $u['affiliateBalance'] = $inA;
            } else {
                $takeW = $pos > 0 ? (int)floor($incW * $allowedCredit / $pos) : 0;
                $takeA = (int)min(max(0, $allowedCredit - $takeW), $incA);
                $u['walletBalance'] = $b['wallet'] + $takeW;
                $u['affiliateBalance'] = $b['affiliate'] + $takeA;
            }
        }

        // Never let wallet balance drop below baseline unless justified by debit transactions
        if ((int)$u['walletBalance'] < $b['wallet']) {
            $allowedMinW = max(0, $b['wallet'] - $allowedDebit);
            if ((int)$u['walletBalance'] < $allowedMinW) {
                $u['walletBalance'] = $b['wallet'];
            }
        }
        // Affiliate balance may decrease, but only by the amount of the affiliate debits
        // recorded in this payload (transfer to main wallet, affiliate withdrawal, PPOB)
        // and only for the session's own account - nobody may debit someone else's wallet.
        if ((int)$u['affiliateBalance'] < $b['affiliate']) {
            $allowedAffiliateOut = $isSelf ? (int)($affiliateOutByUser[$uid] ?? 0) : 0;
            $allowedMinA = max(0, $b['affiliate'] - $allowedAffiliateOut);
            if ((int)$u['affiliateBalance'] < $allowedMinA) {
                $u['affiliateBalance'] = $allowedMinA;
            }
        }
        if ($inP < $b['points']) {
            $u['points'] = $b['points'];
        }

        // Loyalty points: increase only with new recorded activity
        $incP = (int)$u['points'] - $b['points'];
        if ($incP > $allowedPoints) $u['points'] = $b['points'] + $allowedPoints;

        // Strip any secret a client tried to sneak in again
        stripUserSecrets($u);
    }
    unset($u);
}

// ---------------------------------------------------------------------------
// Platform configuration freeze
// ---------------------------------------------------------------------------
// Platform configuration (settings, plans, banners, running text, signals,
// reward catalog, testimonials, market tickers) may only be changed through the
// dedicated admin endpoints:
//   admin_save_settings / admin_save_plans / admin_save_rewards /
//   admin_save_signals / admin_save_announcements / save_banner /
//   delete_banner / toggle_banner
//
// action=save carries a COMPLETE browser snapshot. Without this guard any stale
// tab (a fresh admin login, another phone, a browser whose local DB fell back to
// the built-in defaults) silently rolls every admin edit back to whatever that
// old snapshot contained - the real cause of banners / running text / signals /
// rabat levels / bonus target OMSET reverting to their defaults hours later.
function platformConfigSections() {
    // NOTE: 'testimonials' is intentionally NOT frozen - members submit their own
    // withdrawal testimonials through the normal save flow and the admin moderates them.
    return ['settings', 'plans', 'banners', 'announcements', 'signals', 'rewards', 'marketTickers'];
}

function freezePlatformConfig(&$parsed, $existing, $allowConfigWrite = false) {
    if (!is_array($parsed) || $allowConfigWrite) return;
    if (!is_array($existing) || count($existing) === 0) return;
    foreach (platformConfigSections() as $cfgKey) {
        if (array_key_exists($cfgKey, $existing)) {
            $parsed[$cfgKey] = $existing[$cfgKey];
        } else {
            // Never let a client introduce a configuration section the server does not own.
            unset($parsed[$cfgKey]);
        }
    }
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
