-- ==============================================================================
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
CREATE TABLE IF NOT EXISTS `autotrading_system_state` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `state_key` VARCHAR(64) NOT NULL UNIQUE,
  `data_json` LONGTEXT NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Legacy table alias (fgt_system_state) - kept for backward compatibility
CREATE TABLE IF NOT EXISTS `fgt_system_state` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `state_key` VARCHAR(64) NOT NULL UNIQUE,
  `data_json` LONGTEXT NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 2. Table: users (Member & Admin Relational Records)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `username` VARCHAR(64) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `salt` VARCHAR(64) DEFAULT "",
  `full_name` VARCHAR(128) DEFAULT NULL,
  `email` VARCHAR(128) DEFAULT NULL,
  `phone` VARCHAR(32) DEFAULT NULL,
  `city` VARCHAR(64) DEFAULT NULL,
  `wallet_balance` BIGINT(20) DEFAULT 0,
  `affiliate_balance` BIGINT(20) DEFAULT 0,
  `points` INT(11) DEFAULT 0,
  `referral_code` VARCHAR(32) NOT NULL UNIQUE,
  `referred_by` VARCHAR(32) DEFAULT NULL,
  `status` VARCHAR(32) DEFAULT "active",
  `is_blocked` TINYINT(1) DEFAULT 0,
  `blocked_reason` TEXT DEFAULT NULL,
  `blocked_at` DATETIME DEFAULT NULL,
  `bank_name` VARCHAR(64) DEFAULT NULL,
  `account_number` VARCHAR(64) DEFAULT NULL,
  `account_holder` VARCHAR(128) DEFAULT NULL,
  `role` VARCHAR(32) DEFAULT "member",
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
  `capital_returned` TINYINT(1) DEFAULT 0,
  `status` VARCHAR(32) DEFAULT "active",
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
  `type` VARCHAR(32) NOT NULL,
  `amount` BIGINT(20) NOT NULL,
  `net_amount` BIGINT(20) DEFAULT NULL,
  `status` VARCHAR(32) DEFAULT "pending",
  `payment_method` VARCHAR(64) DEFAULT NULL,
  `wallet_source` VARCHAR(64) DEFAULT NULL,
  `destination_account` VARCHAR(128) DEFAULT NULL,
  `txid` VARCHAR(128) DEFAULT NULL,
  `unique_code` VARCHAR(32) DEFAULT NULL,
  `proof_image` LONGTEXT DEFAULT NULL,
  `note` TEXT DEFAULT NULL,
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

-- ------------------------------------------------------------------------------
-- 6. Table: banners (Slider Carousel Banners)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `banners` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 7. Table: redemptions (Point Loyalty Reward Redemptions)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `redemptions` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==============================================================================
-- SEED DATA (INITIAL REAL RECORDS FOR PHPMYADMIN - CLEAN PRODUCTION)
-- ==============================================================================

-- 1. Users Seed (Master Administrator Only - Balances 0)
INSERT INTO `users` (`id`, `username`, `password_hash`, `salt`, `full_name`, `email`, `phone`, `city`, `wallet_balance`, `affiliate_balance`, `points`, `referral_code`, `referred_by`, `is_blocked`, `bank_name`, `account_number`, `account_holder`, `role`, `created_at`) VALUES
('usr-admin', 'admin', 'BOOTSTRAP', '', 'System Administrator', 'admin@autotrading.my.id', '081299990000', 'Jakarta', 0, 0, 0, 'ADMINVIP', NULL, 0, '', '', '', 'admin', '2026-01-01 00:00:00')
ON DUPLICATE KEY UPDATE `username` = VALUES(`username`);

-- 2. Investments Seed: Empty in Production (No demo records)
-- No demo investments

-- 3. Transactions Seed: Empty in Production (No demo records)
-- No demo transactions

-- 4. Settings Seed
INSERT INTO `settings` (`setting_key`, `setting_value`, `description`) VALUES
('general_settings', '{"appName":"AUTOTRADING","currency":"IDR","usdIdrRate":16250,"minDeposit":50000,"minWithdraw":50000,"withdrawFeePercent":10,"withdrawSchedule":{"enabled":true,"startHour":9,"endHour":21,"offMessage":"Layanan penarikan dana (WD) buka setiap hari pukul 09:00 - 21:00 WIB. Saldo Anda aman dan dapat ditarik pada jam operasional."},"withdrawTerms":["Minimal Penarikan: Rp 50.000 per transaksi.","Biaya Admin: 10.0% dari nominal penarikan dana.","Jam Operasional WD: Buka setiap hari pukul 09:00 - 21:00 WIB. Penarikan di luar jam operasional akan diproses pada jam kerja berikutnya.","Waktu Proses: Saldo masuk dalam hitungan 5 - 30 menit (maksimal 1x24 jam kerja).","Proteksi Modal Terkunci: Modal paket investasi yang sedang aktif dikunci otomatis oleh sistem hingga durasi kontrak selesai dan tidak dapat ditarik mendahului periode."],"apkDownload":{"url":"https://autotrading.my.id/downloads/autotrading-v2.4.apk","version":"v2.4.2 (Official Release)","size":"18.5 MB","updatedAt":"2026-10-01","enabled":true},"dailyCheckIn":{"enabled":true,"rewardAmount":1000,"totalDays":7},"email":{"verificationRequired":false,"adminNotificationOnRegister":true,"adminNotificationEmail":"admin@autotrading.my.id","welcomeEmailEnabled":true,"mailMethod":"cpanel","smtp":{"host":"mail.autotrading.my.id","port":465,"secure":"ssl","user":"noreply@autotrading.my.id","pass":"","fromName":"AUTOTRADING Official","fromEmail":"noreply@autotrading.my.id"}},"profitCycleDurationHours":24,"autoProfitIntervalSeconds":86400,"weekendProfit":{"enabled":true,"offMessage":"Pasar Keuangan & Trading Libur di Akhir Pekan (Sabtu & Minggu). Dividen profit akan kembali berjalan aktif hari Senin."},"weekendProfitEnabled":true,"todayProfitLossMode":{"isLoss":false,"lossRate":0,"message":"Hari ini pasar mengalami fluktuasi / Loss (Dividen Profit 0%). Fitur proteksi modal menjaga saldo pokok Anda tetap 100% aman."},"weeklyProfitHistory":[{"dayName":"Senin","date":"Senin","rate":1,"isLoss":false,"isWeekend":false},{"dayName":"Selasa","date":"Selasa","rate":1.5,"isLoss":false,"isWeekend":false},{"dayName":"Rabu","date":"Rabu","rate":1.2,"isLoss":false,"isWeekend":false},{"dayName":"Kamis","date":"Kamis","rate":1.35,"isLoss":false,"isWeekend":false},{"dayName":"Jumat","date":"Jumat","rate":1.15,"isLoss":false,"isWeekend":false},{"dayName":"Sabtu","date":"Sabtu","rate":null,"isLoss":false,"isWeekend":true},{"dayName":"Minggu","date":"Minggu","rate":null,"isLoss":false,"isWeekend":true}],"cs":{"whatsapp":"6281234567890","telegram":"https://t.me/autotrading_cs","waMessage":"Halo CS Resmi AUTOTRADING, saya ingin berkonsultasi seputar layanan platform..."},"kelasTrading":{"whatsapp":"https://wa.me/6281234567890?text=Halo%20Mentor%20AUTOTRADING,%20saya%20ingin%20bergabung%20ke%20Kelas%20Trading%20Resmi","telegram":"https://t.me/autotrading_official_channel","desc":"Komunitas edukasi trading AI, webinar eksklusif & sinyal pasar harian"},"sponsorBonusPercent":10,"rabatLevels":[{"level":1,"percent":5},{"level":2,"percent":3},{"level":3,"percent":1.5},{"level":4,"percent":0.5},{"level":5,"percent":0.2}],"levelTurnoverMilestones":[{"name":"Bronze Leader","minTurnover":25000000,"reward":1000000},{"name":"Silver Director","minTurnover":100000000,"reward":5000000},{"name":"Gold Ambassador","minTurnover":500000000,"reward":30000000},{"name":"Crown Diamond","minTurnover":2000000000,"reward":150000000}],"paymentGateways":{"banks":[{"id":"bca","name":"Bank Central Asia (BCA)","accountNo":"8271928374","accountName":"PT AUTOTRADING INVESTASI","active":true},{"id":"mandiri","name":"Bank Mandiri","accountNo":"1370029384721","accountName":"PT AUTOTRADING INVESTASI","active":true},{"id":"bri","name":"Bank BRI","accountNo":"034101002938531","accountName":"PT AUTOTRADING INVESTASI","active":true}],"qris":{"active":true,"merchantName":"AUTOTRADING OFFICIAL QRIS","nmid":"ID1029384756201","imageUrl":"https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=00020101021226580016ID.CO.QRIS.WWW01189360001400001029385204581253033605802ID5920AUTOTRADING_OFFICIAL6007JAKARTA61051234062070703A016304E8A2"},"usdt":{"trc20Address":"TXv7qL98HqN8sP2uYx9B9m34j9KxL0qWp1","bep20Address":"0x71C4982aF12B76295328B83716d1029C837A5982"}}}', 'Platform global settings, withdraw rules, and commission rates')
ON DUPLICATE KEY UPDATE `setting_value` = VALUES(`setting_value`);

-- 5. Unified System State Seed (Clean Production)
INSERT INTO `autotrading_system_state` (`state_key`, `data_json`) VALUES
('main_state', '{"settings":{"appName":"AUTOTRADING","currency":"IDR","usdIdrRate":16250,"minDeposit":50000,"minWithdraw":50000,"withdrawFeePercent":10,"withdrawSchedule":{"enabled":true,"startHour":9,"endHour":21,"offMessage":"Layanan penarikan dana (WD) buka setiap hari pukul 09:00 - 21:00 WIB. Saldo Anda aman dan dapat ditarik pada jam operasional."},"withdrawTerms":["Minimal Penarikan: Rp 50.000 per transaksi.","Biaya Admin: 10.0% dari nominal penarikan dana.","Jam Operasional WD: Buka setiap hari pukul 09:00 - 21:00 WIB. Penarikan di luar jam operasional akan diproses pada jam kerja berikutnya.","Waktu Proses: Saldo masuk dalam hitungan 5 - 30 menit (maksimal 1x24 jam kerja).","Proteksi Modal Terkunci: Modal paket investasi yang sedang aktif dikunci otomatis oleh sistem hingga durasi kontrak selesai dan tidak dapat ditarik mendahului periode."],"apkDownload":{"url":"https://autotrading.my.id/downloads/autotrading-v2.4.apk","version":"v2.4.2 (Official Release)","size":"18.5 MB","updatedAt":"2026-10-01","enabled":true},"dailyCheckIn":{"enabled":true,"rewardAmount":1000,"totalDays":7},"email":{"verificationRequired":false,"adminNotificationOnRegister":true,"adminNotificationEmail":"admin@autotrading.my.id","welcomeEmailEnabled":true,"mailMethod":"cpanel","smtp":{"host":"mail.autotrading.my.id","port":465,"secure":"ssl","user":"noreply@autotrading.my.id","pass":"","fromName":"AUTOTRADING Official","fromEmail":"noreply@autotrading.my.id"}},"profitCycleDurationHours":24,"autoProfitIntervalSeconds":86400,"weekendProfit":{"enabled":true,"offMessage":"Pasar Keuangan & Trading Libur di Akhir Pekan (Sabtu & Minggu). Dividen profit akan kembali berjalan aktif hari Senin."},"weekendProfitEnabled":true,"todayProfitLossMode":{"isLoss":false,"lossRate":0,"message":"Hari ini pasar mengalami fluktuasi / Loss (Dividen Profit 0%). Fitur proteksi modal menjaga saldo pokok Anda tetap 100% aman."},"weeklyProfitHistory":[{"dayName":"Senin","date":"Senin","rate":1,"isLoss":false,"isWeekend":false},{"dayName":"Selasa","date":"Selasa","rate":1.5,"isLoss":false,"isWeekend":false},{"dayName":"Rabu","date":"Rabu","rate":1.2,"isLoss":false,"isWeekend":false},{"dayName":"Kamis","date":"Kamis","rate":1.35,"isLoss":false,"isWeekend":false},{"dayName":"Jumat","date":"Jumat","rate":1.15,"isLoss":false,"isWeekend":false},{"dayName":"Sabtu","date":"Sabtu","rate":null,"isLoss":false,"isWeekend":true},{"dayName":"Minggu","date":"Minggu","rate":null,"isLoss":false,"isWeekend":true}],"cs":{"whatsapp":"6281234567890","telegram":"https://t.me/autotrading_cs","waMessage":"Halo CS Resmi AUTOTRADING, saya ingin berkonsultasi seputar layanan platform..."},"kelasTrading":{"whatsapp":"https://wa.me/6281234567890?text=Halo%20Mentor%20AUTOTRADING,%20saya%20ingin%20bergabung%20ke%20Kelas%20Trading%20Resmi","telegram":"https://t.me/autotrading_official_channel","desc":"Komunitas edukasi trading AI, webinar eksklusif & sinyal pasar harian"},"sponsorBonusPercent":10,"rabatLevels":[{"level":1,"percent":5},{"level":2,"percent":3},{"level":3,"percent":1.5},{"level":4,"percent":0.5},{"level":5,"percent":0.2}],"levelTurnoverMilestones":[{"name":"Bronze Leader","minTurnover":25000000,"reward":1000000},{"name":"Silver Director","minTurnover":100000000,"reward":5000000},{"name":"Gold Ambassador","minTurnover":500000000,"reward":30000000},{"name":"Crown Diamond","minTurnover":2000000000,"reward":150000000}],"paymentGateways":{"banks":[{"id":"bca","name":"Bank Central Asia (BCA)","accountNo":"8271928374","accountName":"PT AUTOTRADING INVESTASI","active":true},{"id":"mandiri","name":"Bank Mandiri","accountNo":"1370029384721","accountName":"PT AUTOTRADING INVESTASI","active":true},{"id":"bri","name":"Bank BRI","accountNo":"034101002938531","accountName":"PT AUTOTRADING INVESTASI","active":true}],"qris":{"active":true,"merchantName":"AUTOTRADING OFFICIAL QRIS","nmid":"ID1029384756201","imageUrl":"https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=00020101021226580016ID.CO.QRIS.WWW01189360001400001029385204581253033605802ID5920AUTOTRADING_OFFICIAL6007JAKARTA61051234062070703A016304E8A2"},"usdt":{"trc20Address":"TXv7qL98HqN8sP2uYx9B9m34j9KxL0qWp1","bep20Address":"0x71C4982aF12B76295328B83716d1029C837A5982"}}},"plans":[{"id":"plan-learn","name":"Learn","theme":"theme-learn","minDeposit":100000,"maxDeposit":1000000,"minDailyProfit":1.2,"maxDailyProfit":2.2,"durationDays":15,"description":"Paket Pemula & Edukasi Trading Algoritma AUTOTRADING","activeCount":0},{"id":"plan-rookie","name":"Rookie","theme":"theme-rookie","minDeposit":1000000,"maxDeposit":10000000,"minDailyProfit":2,"maxDailyProfit":3.5,"durationDays":30,"description":"Paket Standard Otomasi Profit dengan Proteksi Modal","activeCount":0},{"id":"plan-sophomore","name":"Sophomore","theme":"theme-sophomore","minDeposit":10000000,"maxDeposit":50000000,"minDailyProfit":3.5,"maxDailyProfit":5,"durationDays":45,"description":"Paket Menengah High Frequency AI Trading Signal","activeCount":0},{"id":"plan-vip","name":"VIP Master","theme":"theme-vip","minDeposit":50000000,"maxDeposit":500000000,"minDailyProfit":5,"maxDailyProfit":7.5,"durationDays":60,"description":"Paket Eksklusif Prof GPT Institutional Hedge Fund","activeCount":0}],"users":[{"id":"usr-admin","username":"admin","fullName":"System Administrator","email":"admin@autotrading.my.id","phone":"081299990000","password":"admin","role":"admin","walletBalance":0,"affiliateBalance":0,"points":0,"referralCode":"ADMINVIP","referredBy":null,"kycStatus":"verified","isBlocked":false,"blockedReason":"","blockedAt":null,"blockHistory":[],"registeredAt":"2026-01-01T00:00:00.000Z"}],"investments":[],"transactions":[],"signals":[{"id":"sig-001","pair":"GBPNZD","action":"SELL","entry":"2.1450","tp":"2.1280","sl":"2.1520","confidence":88,"timeAgo":"25 min(s) ago","flags":["GB","NZ"],"status":"active"},{"id":"sig-002","pair":"EURJPY","action":"SELL","entry":"162.80","tp":"161.40","sl":"163.50","confidence":92,"timeAgo":"29 min(s) ago","flags":["EU","JP"],"status":"active"},{"id":"sig-003","pair":"XAUUSD","action":"BUY","entry":"4340.00","tp":"4380.00","sl":"4320.00","confidence":95,"timeAgo":"42 min(s) ago","flags":["AU","US"],"status":"active"},{"id":"sig-004","pair":"BTCUSDT","action":"BUY","entry":"68500.00","tp":"72000.00","sl":"66800.00","confidence":89,"timeAgo":"1 hour ago","flags":["BTC","USD"],"status":"active"}],"marketTickers":[{"id":"EURUSD","name":"EURUSD","pair":"EUR/USD","desc":"Euro / US Dollar","price":1.1538,"change":0.12,"isUp":true,"time":"Live","code1":"EU","code2":"US"},{"id":"GBPUSD","name":"GBPUSD","pair":"GBP/USD","desc":"British Pound / US Dollar","price":1.3456,"change":-0.09,"isUp":false,"time":"Live","code1":"GB","code2":"US"},{"id":"USDJPY","name":"USDJPY","pair":"USD/JPY","desc":"US Dollar / Japanese Yen","price":148.85,"change":0.25,"isUp":true,"time":"Live","code1":"US","code2":"JP"},{"id":"AUDUSD","name":"AUDUSD","pair":"AUD/USD","desc":"Australian Dollar / US Dollar","price":0.6542,"change":0.18,"isUp":true,"time":"Live","code1":"AU","code2":"US"},{"id":"USDCHF","name":"USDCHF","pair":"USD/CHF","desc":"US Dollar / Swiss Franc","price":0.8924,"change":-0.05,"isUp":false,"time":"Live","code1":"US","code2":"CH"},{"id":"XAUUSD","name":"XAUUSD","pair":"XAU/USD","desc":"Gold Spot / US Dollar","price":4343.65,"change":1.18,"isUp":true,"time":"Live","code1":"AU","code2":"US"},{"id":"BTCUSDT","name":"BTCUSDT","pair":"BTC/USDT","desc":"Bitcoin / Tether USDT","price":68420,"change":3.42,"isUp":true,"time":"Live","code1":"BTC","code2":"USD"}],"announcements":[{"id":"ann-1","text":"Selamat datang di AUTOTRADING Platform Investasi AI Trading Resmi 2026. Dapatkan bonus sponsor 10% dan profit harian otomatis 24/7!","active":true,"createdAt":"2026-09-15T00:00:00.000Z"},{"id":"ann-2","text":"Deposit instant via QRIS & Transfer Bank BCA, Mandiri, BRI serta USDT TRC20/BEP20 telah aktif otomatis tanpa antre.","active":true,"createdAt":"2026-09-15T01:00:00.000Z"},{"id":"ann-3","text":"Sinyal akurasi tinggi Prof GPT telah diperbarui. Cek menu Signal untuk eksekusi order trading dengan akurasi 94%+.","active":true,"createdAt":"2026-09-15T02:00:00.000Z"}],"banners":[{"id":"ban-1","title":"AI Trading Algoritma AUTOTRADING v4.2","subtitle":"Otomasi profit harian dengan akurasi eksekusi 94.8% dan proteksi modal terintegrasi.","badge":"PROMO UNGGULAN","imageUrl":"https://images.unsplash.com/photo-1642543492481-44e81e3914a7?w=900&auto=format&fit=crop&q=80","actionUrl":"plans","active":true,"createdAt":"2026-09-15T00:00:00.000Z"},{"id":"ban-2","title":"Bonus Kemitraan & Rabat Multi-Level","subtitle":"Dapatkan komisi sponsor instan 10% + passive income matching ROI hingga 5 kedalaman.","badge":"KOMISI TINGGI","imageUrl":"https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=900&auto=format&fit=crop&q=80","actionUrl":"profile","active":true,"createdAt":"2026-09-15T01:00:00.000Z"},{"id":"ban-3","title":"Deposit Instant 24/7 QRIS & USDT","subtitle":"Proses deposit cepat otomatis melalui QRIS dinamis dan jaringan blockchain USDT TRC20/BEP20.","badge":"GATEWAY TERCEPAT","imageUrl":"https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=900&auto=format&fit=crop&q=80","actionUrl":"deposit","active":true,"createdAt":"2026-09-15T02:00:00.000Z"}],"rewards":[{"id":"rew-1","title":"Saldo E-Wallet Rp 50.000 (DANA / OVO / GoPay)","category":"E-Wallet","badge":"POPULER","pointsCost":50,"stock":100,"description":"Penukaran saldo e-wallet instant langsung ke nomor akun DANA / OVO / GoPay kamu.","imageUrl":"https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=600&auto=format&fit=crop&q=80","active":true,"createdAt":"2026-09-15T00:00:00.000Z"},{"id":"rew-2","title":"Saldo E-Wallet Rp 100.000 (Semua Bank / E-Wallet)","category":"E-Wallet","badge":"TERLARIS","pointsCost":100,"stock":50,"description":"Voucher transfer saldo tunai Rp 100.000 ke rekening bank atau e-wallet pilihan kamu.","imageUrl":"https://images.unsplash.com/photo-1580519542036-c47de6196ba5?w=600&auto=format&fit=crop&q=80","active":true,"createdAt":"2026-09-15T01:00:00.000Z"},{"id":"rew-3","title":"Kaos Eksklusif AUTOTRADING Trader 2026 Edition","category":"Merchandise","badge":"OFFICIAL","pointsCost":150,"stock":35,"description":"T-Shirt Cotton Combed 24s premium dengan bordir emas logo AUTOTRADING Trading AI.","imageUrl":"https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=600&auto=format&fit=crop&q=80","active":true,"createdAt":"2026-09-15T02:00:00.000Z"},{"id":"rew-4","title":"Smartwatch Fitness & Crypto Price Tracker","category":"Gadget","badge":"PREMIUM","pointsCost":500,"stock":15,"description":"Smartwatch layar AMOLED dengan fitur notifikasi harga trading forex dan crypto realtime.","imageUrl":"https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=80","active":true,"createdAt":"2026-09-15T03:00:00.000Z"},{"id":"rew-5","title":"Logam Mulia Emas Antam 0.5 Gram Bersertifikat","category":"Emas Fisik","badge":"INVESTASI","pointsCost":850,"stock":10,"description":"Emas murni 99.99% bersertifikat resmi PT ANTAM Tbk dikirim aman ke alamat kamu.","imageUrl":"https://images.unsplash.com/photo-1610375461246-83df859d849d?w=600&auto=format&fit=crop&q=80","active":true,"createdAt":"2026-09-15T04:00:00.000Z"},{"id":"rew-6","title":"Smartphone Flagship 5G (Trading Edition)","category":"Gadget","badge":"SPECIAL VIP","pointsCost":2500,"stock":3,"description":"Smartphone 5G performa tinggi layar 120Hz untuk eksekusi order trading super mulus.","imageUrl":"https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600&auto=format&fit=crop&q=80","active":true,"createdAt":"2026-09-15T05:00:00.000Z"}],"redemptions":[],"currentSession":null,"testimonials":[]}')
ON DUPLICATE KEY UPDATE `data_json` = VALUES(`data_json`);

INSERT INTO `fgt_system_state` (`state_key`, `data_json`) VALUES
('main_state', '{"settings":{"appName":"AUTOTRADING","currency":"IDR","usdIdrRate":16250,"minDeposit":50000,"minWithdraw":50000,"withdrawFeePercent":10,"withdrawSchedule":{"enabled":true,"startHour":9,"endHour":21,"offMessage":"Layanan penarikan dana (WD) buka setiap hari pukul 09:00 - 21:00 WIB. Saldo Anda aman dan dapat ditarik pada jam operasional."},"withdrawTerms":["Minimal Penarikan: Rp 50.000 per transaksi.","Biaya Admin: 10.0% dari nominal penarikan dana.","Jam Operasional WD: Buka setiap hari pukul 09:00 - 21:00 WIB. Penarikan di luar jam operasional akan diproses pada jam kerja berikutnya.","Waktu Proses: Saldo masuk dalam hitungan 5 - 30 menit (maksimal 1x24 jam kerja).","Proteksi Modal Terkunci: Modal paket investasi yang sedang aktif dikunci otomatis oleh sistem hingga durasi kontrak selesai dan tidak dapat ditarik mendahului periode."],"apkDownload":{"url":"https://autotrading.my.id/downloads/autotrading-v2.4.apk","version":"v2.4.2 (Official Release)","size":"18.5 MB","updatedAt":"2026-10-01","enabled":true},"dailyCheckIn":{"enabled":true,"rewardAmount":1000,"totalDays":7},"email":{"verificationRequired":false,"adminNotificationOnRegister":true,"adminNotificationEmail":"admin@autotrading.my.id","welcomeEmailEnabled":true,"mailMethod":"cpanel","smtp":{"host":"mail.autotrading.my.id","port":465,"secure":"ssl","user":"noreply@autotrading.my.id","pass":"","fromName":"AUTOTRADING Official","fromEmail":"noreply@autotrading.my.id"}},"profitCycleDurationHours":24,"autoProfitIntervalSeconds":86400,"weekendProfit":{"enabled":true,"offMessage":"Pasar Keuangan & Trading Libur di Akhir Pekan (Sabtu & Minggu). Dividen profit akan kembali berjalan aktif hari Senin."},"weekendProfitEnabled":true,"todayProfitLossMode":{"isLoss":false,"lossRate":0,"message":"Hari ini pasar mengalami fluktuasi / Loss (Dividen Profit 0%). Fitur proteksi modal menjaga saldo pokok Anda tetap 100% aman."},"weeklyProfitHistory":[{"dayName":"Senin","date":"Senin","rate":1,"isLoss":false,"isWeekend":false},{"dayName":"Selasa","date":"Selasa","rate":1.5,"isLoss":false,"isWeekend":false},{"dayName":"Rabu","date":"Rabu","rate":1.2,"isLoss":false,"isWeekend":false},{"dayName":"Kamis","date":"Kamis","rate":1.35,"isLoss":false,"isWeekend":false},{"dayName":"Jumat","date":"Jumat","rate":1.15,"isLoss":false,"isWeekend":false},{"dayName":"Sabtu","date":"Sabtu","rate":null,"isLoss":false,"isWeekend":true},{"dayName":"Minggu","date":"Minggu","rate":null,"isLoss":false,"isWeekend":true}],"cs":{"whatsapp":"6281234567890","telegram":"https://t.me/autotrading_cs","waMessage":"Halo CS Resmi AUTOTRADING, saya ingin berkonsultasi seputar layanan platform..."},"kelasTrading":{"whatsapp":"https://wa.me/6281234567890?text=Halo%20Mentor%20AUTOTRADING,%20saya%20ingin%20bergabung%20ke%20Kelas%20Trading%20Resmi","telegram":"https://t.me/autotrading_official_channel","desc":"Komunitas edukasi trading AI, webinar eksklusif & sinyal pasar harian"},"sponsorBonusPercent":10,"rabatLevels":[{"level":1,"percent":5},{"level":2,"percent":3},{"level":3,"percent":1.5},{"level":4,"percent":0.5},{"level":5,"percent":0.2}],"levelTurnoverMilestones":[{"name":"Bronze Leader","minTurnover":25000000,"reward":1000000},{"name":"Silver Director","minTurnover":100000000,"reward":5000000},{"name":"Gold Ambassador","minTurnover":500000000,"reward":30000000},{"name":"Crown Diamond","minTurnover":2000000000,"reward":150000000}],"paymentGateways":{"banks":[{"id":"bca","name":"Bank Central Asia (BCA)","accountNo":"8271928374","accountName":"PT AUTOTRADING INVESTASI","active":true},{"id":"mandiri","name":"Bank Mandiri","accountNo":"1370029384721","accountName":"PT AUTOTRADING INVESTASI","active":true},{"id":"bri","name":"Bank BRI","accountNo":"034101002938531","accountName":"PT AUTOTRADING INVESTASI","active":true}],"qris":{"active":true,"merchantName":"AUTOTRADING OFFICIAL QRIS","nmid":"ID1029384756201","imageUrl":"https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=00020101021226580016ID.CO.QRIS.WWW01189360001400001029385204581253033605802ID5920AUTOTRADING_OFFICIAL6007JAKARTA61051234062070703A016304E8A2"},"usdt":{"trc20Address":"TXv7qL98HqN8sP2uYx9B9m34j9KxL0qWp1","bep20Address":"0x71C4982aF12B76295328B83716d1029C837A5982"}}},"plans":[{"id":"plan-learn","name":"Learn","theme":"theme-learn","minDeposit":100000,"maxDeposit":1000000,"minDailyProfit":1.2,"maxDailyProfit":2.2,"durationDays":15,"description":"Paket Pemula & Edukasi Trading Algoritma AUTOTRADING","activeCount":0},{"id":"plan-rookie","name":"Rookie","theme":"theme-rookie","minDeposit":1000000,"maxDeposit":10000000,"minDailyProfit":2,"maxDailyProfit":3.5,"durationDays":30,"description":"Paket Standard Otomasi Profit dengan Proteksi Modal","activeCount":0},{"id":"plan-sophomore","name":"Sophomore","theme":"theme-sophomore","minDeposit":10000000,"maxDeposit":50000000,"minDailyProfit":3.5,"maxDailyProfit":5,"durationDays":45,"description":"Paket Menengah High Frequency AI Trading Signal","activeCount":0},{"id":"plan-vip","name":"VIP Master","theme":"theme-vip","minDeposit":50000000,"maxDeposit":500000000,"minDailyProfit":5,"maxDailyProfit":7.5,"durationDays":60,"description":"Paket Eksklusif Prof GPT Institutional Hedge Fund","activeCount":0}],"users":[{"id":"usr-admin","username":"admin","fullName":"System Administrator","email":"admin@autotrading.my.id","phone":"081299990000","password":"admin","role":"admin","walletBalance":0,"affiliateBalance":0,"points":0,"referralCode":"ADMINVIP","referredBy":null,"kycStatus":"verified","isBlocked":false,"blockedReason":"","blockedAt":null,"blockHistory":[],"registeredAt":"2026-01-01T00:00:00.000Z"}],"investments":[],"transactions":[],"signals":[{"id":"sig-001","pair":"GBPNZD","action":"SELL","entry":"2.1450","tp":"2.1280","sl":"2.1520","confidence":88,"timeAgo":"25 min(s) ago","flags":["GB","NZ"],"status":"active"},{"id":"sig-002","pair":"EURJPY","action":"SELL","entry":"162.80","tp":"161.40","sl":"163.50","confidence":92,"timeAgo":"29 min(s) ago","flags":["EU","JP"],"status":"active"},{"id":"sig-003","pair":"XAUUSD","action":"BUY","entry":"4340.00","tp":"4380.00","sl":"4320.00","confidence":95,"timeAgo":"42 min(s) ago","flags":["AU","US"],"status":"active"},{"id":"sig-004","pair":"BTCUSDT","action":"BUY","entry":"68500.00","tp":"72000.00","sl":"66800.00","confidence":89,"timeAgo":"1 hour ago","flags":["BTC","USD"],"status":"active"}],"marketTickers":[{"id":"EURUSD","name":"EURUSD","pair":"EUR/USD","desc":"Euro / US Dollar","price":1.1538,"change":0.12,"isUp":true,"time":"Live","code1":"EU","code2":"US"},{"id":"GBPUSD","name":"GBPUSD","pair":"GBP/USD","desc":"British Pound / US Dollar","price":1.3456,"change":-0.09,"isUp":false,"time":"Live","code1":"GB","code2":"US"},{"id":"USDJPY","name":"USDJPY","pair":"USD/JPY","desc":"US Dollar / Japanese Yen","price":148.85,"change":0.25,"isUp":true,"time":"Live","code1":"US","code2":"JP"},{"id":"AUDUSD","name":"AUDUSD","pair":"AUD/USD","desc":"Australian Dollar / US Dollar","price":0.6542,"change":0.18,"isUp":true,"time":"Live","code1":"AU","code2":"US"},{"id":"USDCHF","name":"USDCHF","pair":"USD/CHF","desc":"US Dollar / Swiss Franc","price":0.8924,"change":-0.05,"isUp":false,"time":"Live","code1":"US","code2":"CH"},{"id":"XAUUSD","name":"XAUUSD","pair":"XAU/USD","desc":"Gold Spot / US Dollar","price":4343.65,"change":1.18,"isUp":true,"time":"Live","code1":"AU","code2":"US"},{"id":"BTCUSDT","name":"BTCUSDT","pair":"BTC/USDT","desc":"Bitcoin / Tether USDT","price":68420,"change":3.42,"isUp":true,"time":"Live","code1":"BTC","code2":"USD"}],"announcements":[{"id":"ann-1","text":"Selamat datang di AUTOTRADING Platform Investasi AI Trading Resmi 2026. Dapatkan bonus sponsor 10% dan profit harian otomatis 24/7!","active":true,"createdAt":"2026-09-15T00:00:00.000Z"},{"id":"ann-2","text":"Deposit instant via QRIS & Transfer Bank BCA, Mandiri, BRI serta USDT TRC20/BEP20 telah aktif otomatis tanpa antre.","active":true,"createdAt":"2026-09-15T01:00:00.000Z"},{"id":"ann-3","text":"Sinyal akurasi tinggi Prof GPT telah diperbarui. Cek menu Signal untuk eksekusi order trading dengan akurasi 94%+.","active":true,"createdAt":"2026-09-15T02:00:00.000Z"}],"banners":[{"id":"ban-1","title":"AI Trading Algoritma AUTOTRADING v4.2","subtitle":"Otomasi profit harian dengan akurasi eksekusi 94.8% dan proteksi modal terintegrasi.","badge":"PROMO UNGGULAN","imageUrl":"https://images.unsplash.com/photo-1642543492481-44e81e3914a7?w=900&auto=format&fit=crop&q=80","actionUrl":"plans","active":true,"createdAt":"2026-09-15T00:00:00.000Z"},{"id":"ban-2","title":"Bonus Kemitraan & Rabat Multi-Level","subtitle":"Dapatkan komisi sponsor instan 10% + passive income matching ROI hingga 5 kedalaman.","badge":"KOMISI TINGGI","imageUrl":"https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=900&auto=format&fit=crop&q=80","actionUrl":"profile","active":true,"createdAt":"2026-09-15T01:00:00.000Z"},{"id":"ban-3","title":"Deposit Instant 24/7 QRIS & USDT","subtitle":"Proses deposit cepat otomatis melalui QRIS dinamis dan jaringan blockchain USDT TRC20/BEP20.","badge":"GATEWAY TERCEPAT","imageUrl":"https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=900&auto=format&fit=crop&q=80","actionUrl":"deposit","active":true,"createdAt":"2026-09-15T02:00:00.000Z"}],"rewards":[{"id":"rew-1","title":"Saldo E-Wallet Rp 50.000 (DANA / OVO / GoPay)","category":"E-Wallet","badge":"POPULER","pointsCost":50,"stock":100,"description":"Penukaran saldo e-wallet instant langsung ke nomor akun DANA / OVO / GoPay kamu.","imageUrl":"https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=600&auto=format&fit=crop&q=80","active":true,"createdAt":"2026-09-15T00:00:00.000Z"},{"id":"rew-2","title":"Saldo E-Wallet Rp 100.000 (Semua Bank / E-Wallet)","category":"E-Wallet","badge":"TERLARIS","pointsCost":100,"stock":50,"description":"Voucher transfer saldo tunai Rp 100.000 ke rekening bank atau e-wallet pilihan kamu.","imageUrl":"https://images.unsplash.com/photo-1580519542036-c47de6196ba5?w=600&auto=format&fit=crop&q=80","active":true,"createdAt":"2026-09-15T01:00:00.000Z"},{"id":"rew-3","title":"Kaos Eksklusif AUTOTRADING Trader 2026 Edition","category":"Merchandise","badge":"OFFICIAL","pointsCost":150,"stock":35,"description":"T-Shirt Cotton Combed 24s premium dengan bordir emas logo AUTOTRADING Trading AI.","imageUrl":"https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=600&auto=format&fit=crop&q=80","active":true,"createdAt":"2026-09-15T02:00:00.000Z"},{"id":"rew-4","title":"Smartwatch Fitness & Crypto Price Tracker","category":"Gadget","badge":"PREMIUM","pointsCost":500,"stock":15,"description":"Smartwatch layar AMOLED dengan fitur notifikasi harga trading forex dan crypto realtime.","imageUrl":"https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=80","active":true,"createdAt":"2026-09-15T03:00:00.000Z"},{"id":"rew-5","title":"Logam Mulia Emas Antam 0.5 Gram Bersertifikat","category":"Emas Fisik","badge":"INVESTASI","pointsCost":850,"stock":10,"description":"Emas murni 99.99% bersertifikat resmi PT ANTAM Tbk dikirim aman ke alamat kamu.","imageUrl":"https://images.unsplash.com/photo-1610375461246-83df859d849d?w=600&auto=format&fit=crop&q=80","active":true,"createdAt":"2026-09-15T04:00:00.000Z"},{"id":"rew-6","title":"Smartphone Flagship 5G (Trading Edition)","category":"Gadget","badge":"SPECIAL VIP","pointsCost":2500,"stock":3,"description":"Smartphone 5G performa tinggi layar 120Hz untuk eksekusi order trading super mulus.","imageUrl":"https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600&auto=format&fit=crop&q=80","active":true,"createdAt":"2026-09-15T05:00:00.000Z"}],"redemptions":[],"currentSession":null,"testimonials":[]}')
-- 6. Banners Seed (Slider Carousel)
INSERT INTO `banners` (`id`, `title`, `subtitle`, `badge`, `image_url`, `action_url`, `active`, `sort_order`, `created_at`) VALUES
('ban-1', 'AI Trading Algoritma AUTOTRADING v4.2', 'Otomasi profit harian dengan akurasi eksekusi 94.8% dan proteksi modal terintegrasi.', 'PROMO UNGGULAN', 'https://images.unsplash.com/photo-1642543492481-44e81e3914a7?w=900&auto=format&fit=crop&q=80', 'plans', 1, 1, '2026-09-15 00:00:00'),
('ban-2', 'Bonus Kemitraan & Rabat Multi-Level', 'Dapatkan komisi sponsor instan 10% + passive income matching ROI hingga 5 kedalaman.', 'KOMISI TINGGI', 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=900&auto=format&fit=crop&q=80', 'profile', 1, 2, '2026-09-15 01:00:00'),
('ban-3', 'Deposit Instant 24/7 QRIS & USDT', 'Proses deposit cepat otomatis melalui QRIS dinamis dan jaringan blockchain USDT TRC20/BEP20.', 'GATEWAY TERCEPAT', 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=900&auto=format&fit=crop&q=80', 'deposit', 1, 3, '2026-09-15 02:00:00')
ON DUPLICATE KEY UPDATE `title` = VALUES(`title`);

COMMIT;
