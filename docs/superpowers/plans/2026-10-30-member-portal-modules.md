# 3 Fitur Baru Member Area Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun 3 halaman modul mandiri (`aset.html`, `toko.html`, `pinjaman.html`) yang terhubung ke beranda member di samping PPOB, tersinkronisasi dengan database MySQL dan panel admin, diuji secara menyeluruh dengan uji E2E otomatis, dan di-deploy ke server live via FTP.

**Architecture:** Frontend menggunakan 3 halaman mandiri mobile-first dengan shared session authentication & shared modern theme; Backend menggunakan `api/index.php` dan `api/config.php` dengan penambahan tabel MySQL relasional dan sinkronisasi ke state; Admin dikelola di `admin.html` dan `js/admin.js`; Deployment menggunakan script otomatis `scripts/cpanel-sync.mjs`.

**Tech Stack:** Vanilla JavaScript (ES6+), HTML5, Modern CSS3 Mobile-First, PHP 8+, MySQL / PDO, Basic-FTP, JSDOM & Node.js test harness.

**Spec:** `docs/superpowers/specs/2026-10-30-member-portal-modules-design.md`

## Global Constraints
- Sesi member login (`sessionToken`, `userData`) harus valid dan dapat dipakai di ketiga halaman tanpa login ulang.
- Desain halaman `aset.html` wajib mengadaptasi kartu hijau sesuai gambar referensi: Total Aset, Estimasi Rp, gramasi besar, pill Harga Beli/Jual & Cashback, tombol Beli (hijau) dan Jual (merah).
- Validasi pinjaman leader wajib menghitung direct downline aktif dari database, menolak pengajuan jika sponsor aktif < 10, dan mengizinkan jika >= 10.
- Transaksi harus memotong atau menambah saldo dompet (`walletBalance`) secara atomik dan aman di database MySQL.
- Sebelum push ke server, seluruh flow diuji dengan script pengujian otomatis.

## Review Focus
1. Member dengan saldo tidak cukup mencoba membeli aset perak atau produk toko (harus ditolak dengan pesan jelas dan saldo tidak boleh minus).
2. Member yang mencoba menjual perak melebihi gramasi yang dimiliki (harus ditolak dan gramasi tidak boleh minus).
3. Member dengan downline aktif kurang dari 10 mencoba mengajukan pinjaman (tombol harus terkunci atau backend menolak dengan pesan syarat belum terpenuhi).
4. Sesi kedaluwarsa atau belum login saat membuka salah satu dari ketiga halaman (harus diarahkan kembali ke `index.html#login`).
5. Admin dapat mengupdate harga perak, memproses pesanan toko (isi resi), serta menyetujui pinjaman leader (saldo otomatis masuk ke wallet member pemohon).

---

### Task 1: Database Schema & Backend API Extensions
**Files:**
- Modify: `api/index.php`
- Modify: `database.sql`
- Test: `scratch/test_backend_api_modules.mjs`

**Interfaces:**
- Consumes: `ensureTablesExist($pdo)`, `currentSessionUserId()`, `getDbConnection()`.
- Produces: API endpoints `get_asset_data`, `buy_silver_asset`, `sell_silver_asset`, `admin_save_asset_prices`, `get_shop_data`, `order_shop_product`, `admin_update_order_status`, `get_loan_data`, `apply_leader_loan`, `admin_approve_loan`, `admin_reject_loan`.

- [ ] **Step 1: Write the failing test for new backend endpoints**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement database migrations in `ensureTablesExist` and endpoints in `api/index.php`**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Verify table definitions in `database.sql`**

---

### Task 2: Halaman Aset Perak/Emas (`aset.html`)
**Files:**
- Create: `aset.html`
- Modify: `js/app.js` (helper functions & export jika diperlukan)
- Test: `scratch/test_aset_page.mjs`

**Interfaces:**
- Consumes: `api/index.php?action=get_asset_data`, `buy_silver_asset`, `sell_silver_asset`.
- Produces: Visual kartu aset hijau referensi, kalkulator Beli (gramasi & nominal editable), modal Jual (pencairan ke wallet), riwayat transaksi aset member.

- [ ] **Step 1: Write test for `aset.html` DOM structure, calculations, and buy/sell flow**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Build `aset.html` with responsive styles, green card banner, and interactive modals**
- [ ] **Step 4: Run test to verify it passes**

---

### Task 3: Halaman Toko Produk Fisik (`toko.html`)
**Files:**
- Create: `toko.html`
- Test: `scratch/test_toko_page.mjs`

**Interfaces:**
- Consumes: `api/index.php?action=get_shop_data`, `order_shop_product`.
- Produces: Katalog 3 produk fisik, modal checkout alamat pengiriman, tab riwayat pesanan member.

- [ ] **Step 1: Write test for `toko.html` catalog display and checkout modal flow**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Build `toko.html` with product cards, checkout address form, and order tracking**
- [ ] **Step 4: Run test to verify it passes**

---

### Task 4: Halaman Pinjaman Modal Cepat Leader (`pinjaman.html`)
**Files:**
- Create: `pinjaman.html`
- Test: `scratch/test_pinjaman_page.mjs`

**Interfaces:**
- Consumes: `api/index.php?action=get_loan_data`, `apply_leader_loan`.
- Produces: Syarat & Ketentuan modal cepat, progress counter sponsor aktif (X/10), formulir pengajuan pinjaman (KTP, rekening, nominal), riwayat pengajuan member.

- [ ] **Step 1: Write test for sponsor count verification and loan application form**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Build `pinjaman.html` with eligibility checker and comprehensive application form**
- [ ] **Step 4: Run test to verify it passes**

---

### Task 5: Integrasi Menu Home Member (`index.html`)
**Files:**
- Modify: `index.html`
- Test: `scratch/test_home_navigation.mjs`

**Interfaces:**
- Consumes: `aset.html`, `toko.html`, `pinjaman.html`.
- Produces: 3 tombol menu baru di Quick Menu samping icon PPOB Pulsa/PLN + banner strip akses cepat.

- [ ] **Step 1: Write test verifying presence and links of the 3 new menu buttons next to PPOB**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Update `index.html` Quick Menu with attractive icons for Aset, Toko, and Pinjaman**
- [ ] **Step 4: Run test to verify it passes**

---

### Task 6: Integrasi Admin Panel (`admin.html` & `js/admin.js`)
**Files:**
- Modify: `admin.html`
- Modify: `js/admin.js`
- Test: `scratch/test_admin_modules.mjs`

**Interfaces:**
- Consumes: `admin_save_asset_prices`, `admin_update_order_status`, `admin_approve_loan`, `admin_reject_loan`.
- Produces: Tab pengelolaan harga perak & transaksi aset, tab pesanan toko & nomor resi, tab persetujuan pinjaman leader.

- [ ] **Step 1: Write test for admin tabs and action handlers**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement admin tabs in `admin.html` and logic in `js/admin.js`**
- [ ] **Step 4: Run test to verify it passes**

---

### Task 7: Pengujian Menyeluruh (Master E2E Verification)
**Files:**
- Create: `scratch/test_all_three_modules_master.mjs`
- Test: Jalankan master test menguji seluruh flow dari member hingga admin.

- [ ] **Step 1: Buat master test script menguji seluruh skenario secara end-to-end**
- [ ] **Step 2: Jalankan dan verifikasi semua 100% PASS**

---

### Task 8: Live Deployment ke Server cPanel via FTP
**Files:**
- Modify: `scripts/cpanel-sync.mjs` (pastikan file baru `aset.html`, `toko.html`, `pinjaman.html` masuk dalam daftar sync)
- Run: `node scripts/cpanel-sync.mjs`
- Test: `scratch/test_live_server_endpoints.mjs`

- [ ] **Step 1: Tambahkan `aset.html`, `toko.html`, `pinjaman.html` ke `DEPLOY_ROOT_FILES`**
- [ ] **Step 2: Jalankan sinkronisasi upload FTP ke server live**
- [ ] **Step 3: Verifikasi respons live server di `https://autotrading.my.id/`**

