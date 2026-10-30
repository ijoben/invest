# Design Doc: 3 Fitur Baru Member Area (Aset Perak/Emas, Toko Produk Fisik, Pinjaman Modal Cepat Leader)

## 1. Latar Belakang & Tujuan
Menambahkan 3 menu baru di samping menu PPOB pada beranda member setelah login:
1. **Aset Perak/Emas (`aset.html`)**: Sistem jual beli aset digital perak/emas dengan antarmuka kartu hijau persis seperti referensi visual pengguna (total gramasi, estimasi nominal rupiah, harga beli/jual per gram yang dapat diatur admin, tombol Beli & Jual).
2. **Toko Offline/Fisik (`toko.html`)**: Katalog 2–3 produk fisik dengan tombol beli & formulir alamat pengiriman, layaknya sistem redeem bonus.
3. **Pinjaman Modal Cepat Leader (`pinjaman.html`)**: Fasilitas pinjaman modal usaha untuk leader (misal Rp 300.000) dengan syarat verifikasi otomatis minimal 10 sponsor/downline aktif yang telah aktivasi, dilengkapi formulir pengajuan lengkap.

Ketiga modul harus terhubung penuh ke database MySQL (`autotrading_system_state` & tabel relasional), dapat dikontrol oleh admin di `admin.html`, diuji menyeluruh, lalu di-deploy ke server cPanel FTP live.

## 2. Arsitektur & Antarmuka
- **Frontend Member**: Tiga file halaman mandiri (`aset.html`, `toko.html`, `pinjaman.html`) yang responsif mobile-first, mewarisi header, bottom nav, styling modern, dan validasi sesi login (`sessionToken` & `userData`).
- **Menu Navigasi**: Ditambahkan 3 ikon tombol baru di Quick Menu `index.html` tepat berdampingan dengan ikon PPOB Pulsa/PLN.
- **Backend API (`api/index.php`)**:
  - Endpoint aset: `get_asset_data`, `buy_silver_asset`, `sell_silver_asset`, `admin_save_asset_prices`.
  - Endpoint toko: `get_shop_data`, `order_shop_product`, `admin_update_order_status`.
  - Endpoint pinjaman: `get_loan_data`, `apply_leader_loan`, `admin_approve_loan`, `admin_reject_loan`.
- **Admin Portal (`admin.html` & `js/admin.js`)**:
  - Tab Aset Perak: Atur harga beli/jual per gram, pantau total aset & riwayat transaksi jual/beli member.
  - Tab Toko Produk: Pantau pesanan masuk, alamat kirim, input nomor resi pengiriman, dan update status.
  - Tab Pinjaman Leader: Pantau pemohon, verifikasi jumlah direct downline aktif, foto KTP, dan tombol persetujuan (pencairan otomatis ke saldo wallet) atau penolakan.

## 3. Skema Data (MySQL)
- `silver_buy_price` dan `silver_sell_price` pada tabel `settings`.
- Kolom `silver_balance` (DECIMAL 10,4) pada tabel `users`.
- Tabel `asset_transactions`: `id`, `user_id`, `username`, `type` (buy/sell), `grams`, `price_per_gram`, `total_amount`, `status`, `created_at`.
- Tabel `shop_products`: `id`, `name`, `description`, `price_amount`, `price_type` (saldo/poin), `image_url`, `stock`, `status`.
- Tabel `shop_orders`: `id`, `user_id`, `username`, `product_id`, `product_name`, `amount`, `recipient_name`, `recipient_phone`, `shipping_address`, `notes`, `tracking_number`, `status`, `created_at`.
- Tabel `leader_loans`: `id`, `user_id`, `username`, `loan_amount`, `active_sponsors_count`, `purpose`, `ktp_nik`, `ktp_name`, `ktp_image`, `bank_name`, `account_number`, `account_holder`, `status`, `rejection_reason`, `created_at`.

