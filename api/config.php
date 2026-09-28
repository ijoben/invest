<?php
/**
 * FGT PRO - CPANEL MYSQL DATABASE CONFIGURATION
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

// Database Credentials
define('DB_HOST', 'localhost');
define('DB_NAME', 'fgt_pro_invest'); // Ganti dengan Nama Database cPanel Anda (misal: u1234567_invest)
define('DB_USER', 'root');           // Ganti dengan Username Database cPanel Anda (misal: u1234567_admin)
define('DB_PASS', '');               // Ganti dengan Password Database cPanel Anda

// CORS & Headers
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Content-Type: application/json; charset=UTF-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
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
