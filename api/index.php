<?php
/**
 * FGT PRO - CPANEL MYSQL BACKEND REST API
 * Handles database read, write, and synchronization seamlessly.
 */

require_once __DIR__ . '/config.php';

$action = isset($_GET['action']) ? trim($_GET['action']) : 'get';
$pdo = getDbConnection();

// Auto-create storage table if connected but table not exists
function ensureTableExists($pdo) {
    if (!$pdo) return false;
    try {
        $sql = "CREATE TABLE IF NOT EXISTS `fgt_system_state` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `state_key` VARCHAR(64) NOT NULL UNIQUE,
            `data_json` LONGTEXT NOT NULL,
            `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
        $pdo->exec($sql);
        return true;
    } catch (Exception $e) {
        return false;
    }
}

// 1. Action: Ping / Health Check
if ($action === 'ping') {
    if ($pdo) {
        ensureTableExists($pdo);
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

    ensureTableExists($pdo);

    try {
        $stmt = $pdo->prepare("SELECT `data_json` FROM `fgt_system_state` WHERE `state_key` = 'main_state' LIMIT 1");
        $stmt->execute();
        $row = $stmt->fetch();

        if ($row && !empty($row['data_json'])) {
            $data = json_decode($row['data_json'], true);
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

    ensureTableExists($pdo);

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
        // Upsert into fgt_system_state
        $stmt = $pdo->prepare("
            INSERT INTO `fgt_system_state` (`state_key`, `data_json`)
            VALUES ('main_state', :data_json)
            ON DUPLICATE KEY UPDATE `data_json` = :data_json_update, `updated_at` = CURRENT_TIMESTAMP
        ");
        $stmt->execute([
            ':data_json' => $rawInput,
            ':data_json_update' => $rawInput
        ]);

        echo json_encode([
            'success' => true,
            'message' => 'Data berhasil disimpan ke database MySQL cPanel!',
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
