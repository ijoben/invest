<?php
/**
 * AUTOTRADING - EMAIL NOTIFICATION & VERIFICATION SERVICE
 * Handles OTP verification emails, admin new-member alerts, welcome emails, and SMTP dispatch for cPanel.
 */

header('Content-Type: application/json; charset=UTF-8');
// CORS whitelist is enforced by config.php (no wildcard origins)
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once __DIR__ . '/config.php';

// Helper: send email via native PHP mail()
function sendViaPhpMail($to, $subject, $htmlContent, $fromName, $fromEmail) {
    $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
    $encodedFromName = '=?UTF-8?B?' . base64_encode($fromName) . '?=';

    $headers = [];
    $headers[] = "From: {$encodedFromName} <{$fromEmail}>";
    $headers[] = "Reply-To: {$encodedFromName} <{$fromEmail}>";
    $headers[] = "MIME-Version: 1.0";
    $headers[] = "Content-Type: text/html; charset=UTF-8";
    $headers[] = "X-Mailer: PHP/" . phpversion();

    $headerStr = implode("\r\n", $headers);
    return @mail($to, $encodedSubject, $htmlContent, $headerStr);
}

// Helper: send email via direct Socket SMTP
function sendViaSmtp($to, $subject, $htmlContent, $fromName, $fromEmail, $smtp) {
    $host = !empty($smtp['host']) ? trim($smtp['host']) : 'localhost';
    $port = !empty($smtp['port']) ? intval($smtp['port']) : 465;
    $user = !empty($smtp['user']) ? trim($smtp['user']) : '';
    $pass = !empty($smtp['pass']) ? trim($smtp['pass']) : '';
    $secure = !empty($smtp['secure']) ? strtolower(trim($smtp['secure'])) : 'ssl';

    $socketHost = ($secure === 'ssl' && !str_starts_with($host, 'ssl://')) ? 'ssl://' . $host : $host;
    $timeout = 15;

    $socket = @fsockopen($socketHost, $port, $errno, $errstr, $timeout);
    if (!$socket) {
        // Fallback to PHP mail if socket connection fails
        return sendViaPhpMail($to, $subject, $htmlContent, $fromName, $fromEmail);
    }

    $read = function($expectedCode) use ($socket) {
        $response = '';
        while ($line = fgets($socket, 512)) {
            $response .= $line;
            if (substr($line, 3, 1) === ' ') break;
        }
        return substr($response, 0, 3) === strval($expectedCode);
    };

    $write = function($cmd) use ($socket) {
        fputs($socket, $cmd . "\r\n");
    };

    if (!$read(220)) { fclose($socket); return false; }

    $write("EHLO " . gethostname());
    if (!$read(250)) {
        $write("HELO " . gethostname());
        if (!$read(250)) { fclose($socket); return false; }
    }

    if (!empty($user) && !empty($pass)) {
        $write("AUTH LOGIN");
        if (!$read(334)) { fclose($socket); return false; }

        $write(base64_encode($user));
        if (!$read(334)) { fclose($socket); return false; }

        $write(base64_encode($pass));
        if (!$read(235)) { fclose($socket); return false; }
    }

    $write("MAIL FROM: <{$fromEmail}>");
    if (!$read(250)) { fclose($socket); return false; }

    $write("RCPT TO: <{$to}>");
    if (!$read(250)) { fclose($socket); return false; }

    $write("DATA");
    if (!$read(354)) { fclose($socket); return false; }

    $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
    $encodedFromName = '=?UTF-8?B?' . base64_encode($fromName) . '?=';

    $headers = [];
    $headers[] = "From: {$encodedFromName} <{$fromEmail}>";
    $headers[] = "To: <{$to}>";
    $headers[] = "Subject: {$encodedSubject}";
    $headers[] = "MIME-Version: 1.0";
    $headers[] = "Content-Type: text/html; charset=UTF-8";
    $headers[] = "X-Mailer: AUTOTRADING-SMTP";

    $body = implode("\r\n", $headers) . "\r\n\r\n" . $htmlContent . "\r\n.";
    $write($body);
    $ok = $read(250);

    $write("QUIT");
    fclose($socket);

    return $ok;
}

// Master email dispatcher
function dispatchEmail($to, $subject, $htmlContent, $emailSettings) {
    $fromName = !empty($emailSettings['smtp']['fromName']) ? $emailSettings['smtp']['fromName'] : 'AUTOTRADING Official';
    $fromEmail = !empty($emailSettings['smtp']['fromEmail']) ? $emailSettings['smtp']['fromEmail'] : 'noreply@' . ($_SERVER['SERVER_NAME'] ?? 'autotrading.my.id');
    $method = !empty($emailSettings['mailMethod']) ? strtolower($emailSettings['mailMethod']) : 'cpanel';

    if ($method === 'smtp' && !empty($emailSettings['smtp']['host'])) {
        return sendViaSmtp($to, $subject, $htmlContent, $fromName, $fromEmail, $emailSettings['smtp']);
    } else {
        return sendViaPhpMail($to, $subject, $htmlContent, $fromName, $fromEmail);
    }
}

// Generate Luxury Email Templates
function getEmailWrapper($title, $innerContent) {
    return <<<HTML
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{$title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #080C14; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #F8FAFC;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #080C14; padding: 30px 10px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 560px; background-color: #0F172A; border: 1px solid #1E293B; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.6);">
          <!-- Header Banner -->
          <tr>
            <td style="padding: 28px 24px 22px; text-align: center; background: linear-gradient(135deg, #0F172A 0%, #1E1B4B 50%, #0F172A 100%); border-bottom: 2px solid #C89338;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
                <tr>
                  <td style="background: linear-gradient(135deg, #E5A83B 0%, #C89338 100%); border-radius: 10px; width: 44px; height: 44px; text-align: center; vertical-align: middle;">
                    <span style="font-size: 22px; font-weight: 900; color: #080C14; line-height: 44px;">◈</span>
                  </td>
                  <td style="padding-left: 12px; text-align: left;">
                    <div style="font-size: 20px; font-weight: 900; letter-spacing: 1.5px; color: #F8FAFC;">AUTOTRADING</div>
                    <div style="font-size: 11px; font-weight: 600; color: #E5A83B; letter-spacing: 0.8px;">AI TRADING & INVESTMENT PLATFORM</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body Content -->
          <tr>
            <td style="padding: 30px 26px;">
              {$innerContent}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 24px; text-align: center; background-color: #080C14; border-top: 1px solid #1E293B; font-size: 11.5px; color: #64748B; line-height: 1.6;">
              <div>Pesan ini dikirim otomatis oleh sistem resmi <strong>AUTOTRADING Indonesia</strong>.</div>
              <div style="margin-top: 4px;">Jangan pernah membagikan kode OTP atau password Anda kepada siapapun demi keamanan aset Anda.</div>
              <div style="margin-top: 10px; color: #475569;">&copy; 2026 AUTOTRADING Investment Platform. All rights reserved.</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
HTML;
}

// When required as a library (OTP / password-reset mails from index.php),
// only the functions above are needed - skip request routing.
if (defined('MAIL_LIB_ONLY')) {
    return;
}

// Receive POST JSON or GET query
$rawInput = file_get_contents('php://input');
$data = json_decode($rawInput, true) ?: $_POST;
$action = isset($_GET['action']) ? trim($_GET['action']) : ($data['action'] ?? '');

if (empty($action)) {
    echo json_encode([
        'success' => false,
        'message' => 'Action required (send_otp, admin_notification, welcome, test)'
    ]);
    exit();
}

$emailSettings = $data['settings']['email'] ?? [
    'verificationRequired' => true,
    'adminNotificationOnRegister' => true,
    'adminNotificationEmail' => 'admin@autotrading.my.id',
    'welcomeEmailEnabled' => true,
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

// 1. ACTION: SEND OTP VERIFICATION TO NEW USER
if ($action === 'send_otp') {
    $email = trim($data['email'] ?? '');
    $name = trim($data['name'] ?? $data['fullName'] ?? 'Investor AUTOTRADING');
    $otp = trim($data['code'] ?? $data['otp'] ?? '');

    if (empty($email) || empty($otp)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Email dan kode OTP wajib diisi!']);
        exit();
    }

    $subject = "[AUTOTRADING] Kode Verifikasi Pendaftaran Anda: {$otp}";
    $innerContent = <<<HTML
      <h2 style="font-size: 19px; font-weight: 800; color: #F8FAFC; margin: 0 0 10px 0;">Halo, {$name}! 👋</h2>
      <p style="font-size: 13.5px; color: #94A3B8; line-height: 1.6; margin: 0 0 20px 0;">
        Terima kasih telah mendaftarkan akun di platform <strong>AUTOTRADING</strong>. Untuk mengaktifkan akun dan memastikan keamanan email Anda, silakan gunakan kode verifikasi (OTP) berikut:
      </p>

      <!-- OTP Display Box -->
      <div style="background: rgba(200, 147, 56, 0.1); border: 2px dashed #C89338; border-radius: 14px; padding: 20px; text-align: center; margin: 24px 0;">
        <div style="font-size: 11px; font-weight: 700; color: #C89338; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 6px;">KODE VERIFIKASI RESMI (OTP)</div>
        <div style="font-size: 34px; font-weight: 900; letter-spacing: 10px; color: #F8FAFC; font-family: 'Courier New', Courier, monospace; margin: 8px 0;">{$otp}</div>
        <div style="font-size: 11.5px; color: #94A3B8; margin-top: 6px;">⏱️ Berlaku selama 15 menit. Masukkan kode ini pada halaman verifikasi.</div>
      </div>

      <div style="background-color: #1E293B; border-left: 4px solid #E5A83B; border-radius: 6px; padding: 12px 14px; margin-bottom: 20px; font-size: 12px; color: #CBD5E1; line-height: 1.5;">
        <strong>Perhatian Keamanan:</strong> Jangan berikan kode OTP ini kepada siapa pun, termasuk staf yang mengatasnamakan admin AUTOTRADING.
      </div>

      <p style="font-size: 12px; color: #64748B; margin: 0;">
        Jika Anda tidak merasa mendaftar di AUTOTRADING, silakan abaikan pesan email ini.
      </p>
HTML;

    $html = getEmailWrapper($subject, $innerContent);
    $sent = dispatchEmail($email, $subject, $html, $emailSettings);

    echo json_encode([
        'success' => true,
        'sent' => $sent,
        'email' => $email,
        'message' => $sent
            ? "Kode OTP verifikasi berhasil dikirimkan ke {$email}!"
            : "Permintaan OTP diproses. Pastikan konfigurasi email server (PHP mail / SMTP) aktif."
    ]);
    exit();
}

// 2. ACTION: SEND ADMIN NOTIFICATION FOR NEW REGISTER
if ($action === 'admin_notification') {
    $adminEmail = !empty($emailSettings['adminNotificationEmail']) ? $emailSettings['adminNotificationEmail'] : 'admin@autotrading.my.id';
    $u = $data['user'] ?? $data;

    $username = htmlspecialchars($u['username'] ?? '-');
    $fullName = htmlspecialchars($u['fullName'] ?? '-');
    $email = htmlspecialchars($u['email'] ?? '-');
    $phone = htmlspecialchars($u['phone'] ?? '-');
    $ref = htmlspecialchars($u['referralCode'] ?? '-');
    $upline = htmlspecialchars($u['referredBy'] ?? 'Organik / Tanpa Sponsor');
    $regTime = date('d M Y - H:i:s') . ' WIB';

    $subject = "[AUTOTRADING Admin Alert] Member Baru Mendaftar: @{$username}";
    $innerContent = <<<HTML
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
        <span style="background: #10B981; color: #FFFFFF; font-size: 11px; font-weight: 800; padding: 3px 8px; border-radius: 20px;">NEW MEMBER</span>
        <h2 style="font-size: 18px; font-weight: 800; color: #F8FAFC; margin: 0;">Pendaftaran Pengguna Baru</h2>
      </div>

      <p style="font-size: 13px; color: #94A3B8; margin-bottom: 18px;">
        Sistem mendeteksi ada investor baru yang baru saja mendaftar di platform AUTOTRADING:
      </p>

      <table width="100%" cellspacing="0" cellpadding="0" style="background: #1E293B; border-radius: 12px; overflow: hidden; border: 1px solid #334155; margin-bottom: 20px;">
        <tr>
          <td style="padding: 10px 14px; font-size: 12px; color: #94A3B8; border-bottom: 1px solid #334155; width: 35%;">Username</td>
          <td style="padding: 10px 14px; font-size: 13px; font-weight: 700; color: #38BDF8; border-bottom: 1px solid #334155;">@{$username}</td>
        </tr>
        <tr>
          <td style="padding: 10px 14px; font-size: 12px; color: #94A3B8; border-bottom: 1px solid #334155;">Nama Lengkap</td>
          <td style="padding: 10px 14px; font-size: 13px; font-weight: 700; color: #F8FAFC; border-bottom: 1px solid #334155;">{$fullName}</td>
        </tr>
        <tr>
          <td style="padding: 10px 14px; font-size: 12px; color: #94A3B8; border-bottom: 1px solid #334155;">Email</td>
          <td style="padding: 10px 14px; font-size: 13px; font-weight: 600; color: #F8FAFC; border-bottom: 1px solid #334155;">{$email}</td>
        </tr>
        <tr>
          <td style="padding: 10px 14px; font-size: 12px; color: #94A3B8; border-bottom: 1px solid #334155;">WhatsApp / HP</td>
          <td style="padding: 10px 14px; font-size: 13px; font-weight: 600; color: #10B981; border-bottom: 1px solid #334155;">{$phone}</td>
        </tr>
        <tr>
          <td style="padding: 10px 14px; font-size: 12px; color: #94A3B8; border-bottom: 1px solid #334155;">Sponsor / Upline</td>
          <td style="padding: 10px 14px; font-size: 13px; font-weight: 700; color: #C89338; border-bottom: 1px solid #334155;">{$upline}</td>
        </tr>
        <tr>
          <td style="padding: 10px 14px; font-size: 12px; color: #94A3B8;">Waktu Daftar</td>
          <td style="padding: 10px 14px; font-size: 12px; color: #94A3B8;">{$regTime}</td>
        </tr>
      </table>

      <div style="text-align: center;">
        <a href="admin" style="background: linear-gradient(135deg, #E5A83B 0%, #C89338 100%); color: #080C14; font-weight: 800; font-size: 12.5px; padding: 11px 24px; border-radius: 8px; text-decoration: none; display: inline-block;">
          Buka Panel Admin AUTOTRADING &rarr;
        </a>
      </div>
HTML;

    $html = getEmailWrapper($subject, $innerContent);
    $sent = dispatchEmail($adminEmail, $subject, $html, $emailSettings);

    echo json_encode([
        'success' => true,
        'sent' => $sent,
        'adminEmail' => $adminEmail,
        'message' => "Notifikasi pendaftaran member baru diproses ke {$adminEmail}."
    ]);
    exit();
}

// 3. ACTION: SEND TEST EMAIL
if ($action === 'test') {
    $targetEmail = trim($data['targetEmail'] ?? $data['email'] ?? '');
    if (empty($targetEmail)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Alamat email tujuan tes wajib diisi!']);
        exit();
    }

    $nowStr = date('d M Y - H:i:s') . ' WIB';
    $methodStr = strtoupper($emailSettings['mailMethod'] ?? 'cpanel');
    $subject = "[AUTOTRADING] Tes Konfigurasi Server Email Berhasil!";

    $innerContent = <<<HTML
      <div style="text-align: center; margin-bottom: 20px;">
        <div style="width: 50px; height: 50px; background: rgba(34, 197, 94, 0.15); border: 2px solid #22C55E; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 12px;">
          <span style="font-size: 26px; color: #22C55E; line-height: 50px;">✓</span>
        </div>
        <h2 style="font-size: 20px; font-weight: 800; color: #F8FAFC; margin: 0 0 6px 0;">Konfigurasi Email Berfungsi Normal!</h2>
        <p style="font-size: 13px; color: #94A3B8; margin: 0;">Pengaturan email dan server notifikasi AUTOTRADING Anda telah terhubung dengan sukses.</p>
      </div>

      <table width="100%" cellspacing="0" cellpadding="0" style="background: #1E293B; border-radius: 12px; overflow: hidden; border: 1px solid #334155; margin-bottom: 20px;">
        <tr>
          <td style="padding: 10px 14px; font-size: 12px; color: #94A3B8; border-bottom: 1px solid #334155; width: 35%;">Metode Dispatch</td>
          <td style="padding: 10px 14px; font-size: 13px; font-weight: 700; color: #E5A83B; border-bottom: 1px solid #334155;">{$methodStr}</td>
        </tr>
        <tr>
          <td style="padding: 10px 14px; font-size: 12px; color: #94A3B8; border-bottom: 1px solid #334155;">Pengirim Resmi</td>
          <td style="padding: 10px 14px; font-size: 13px; font-weight: 600; color: #F8FAFC; border-bottom: 1px solid #334155;">{$emailSettings['smtp']['fromName']} ({$emailSettings['smtp']['fromEmail']})</td>
        </tr>
        <tr>
          <td style="padding: 10px 14px; font-size: 12px; color: #94A3B8; border-bottom: 1px solid #334155;">Waktu Uji Coba</td>
          <td style="padding: 10px 14px; font-size: 12px; color: #F8FAFC; border-bottom: 1px solid #334155;">{$nowStr}</td>
        </tr>
        <tr>
          <td style="padding: 10px 14px; font-size: 12px; color: #94A3B8;">Status Server</td>
          <td style="padding: 10px 14px; font-size: 12px; font-weight: 700; color: #10B981;">🟢 AKTIF & SIAP DIGUNAKAN</td>
        </tr>
      </table>

      <p style="font-size: 12px; color: #64748B; text-align: center; margin: 0;">
        Pesan ini dikirim atas permintaan uji coba dari Panel Administrator AUTOTRADING.
      </p>
HTML;

    $html = getEmailWrapper($subject, $innerContent);
    $sent = dispatchEmail($targetEmail, $subject, $html, $emailSettings);

    echo json_encode([
        'success' => $sent,
        'sent' => $sent,
        'targetEmail' => $targetEmail,
        'message' => $sent ? "Email uji coba berhasil dikirim ke {$targetEmail}! Silakan cek kotak masuk Anda." : "Percobaan kirim email diproses (Pastikan PHP mail() atau kredensial SMTP aktif di hosting cPanel Anda)."
    ]);
    exit();
}

// Fallback
echo json_encode(['success' => false, 'message' => "Action '{$action}' tidak dikenali."]);
