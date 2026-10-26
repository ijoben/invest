# Laporan Uji Sinkronisasi Simpan & Toggle Admin

**Tanggal:** 22 Oktober 2026
**Target:** https://autotrading.my.id/admin.html (produksi, MySQL cPanel)
**Metode:** setiap tombol **Simpan** / **Toggle** dijalankan lewat handler UI aslinya (`AdminPage.*`), lalu hasilnya dibaca ulang langsung dari MySQL (`settings`, `banners`, `autotrading_system_state`) — bukan dari state browser. Setelah itu nilai dikembalikan ke kondisi semula dan diverifikasi lagi.

## Ringkasan

| Item | Hasil |
|---|---|
| Total langkah uji | 69 |
| PASS | 67 |
| FAIL | 2 (1 bug aplikasi yang sudah diperbaiki + retest PASS, 1 kesalahan skrip uji) |
| Area diuji | 18 grup pengaturan + 7 panel CRUD + tombol sinkronisasi member |
| Kondisi akhir database | Identik dengan baseline sebelum pengujian |

### Dua kegagalan dan penyelesaiannya

1. **`Paket: hapus QA Plan` (langkah 60) — bug nyata, diperbaiki.**
   Penyebab: `Admin.savePlan()` / `deletePlan()` menulis lewat endpoint khusus `admin_save_plans`, lalu **menimpa lagi** dengan `DB.save()` (snapshot state penuh). Snapshot yang tertunda/retry bisa membawa daftar paket lama sehingga paket yang baru diedit kembali ke durasi lama dan paket yang dihapus muncul lagi.
   Perbaikan: [js/admin.js](../js/admin.js) tidak lagi memanggil `DB.save()` pada simpan/hapus paket (endpoint khusus sudah menulis `platform_plans` + `state.plans`), dan [js/admin-page.js](../js/admin-page.js) sekarang **membaca ulang dari MySQL** setelah simpan/hapus serta menampilkan error bila paket tidak benar-benar tersimpan/terhapus. Retest langkah 64–66 PASS.
2. **`Ketentuan WD: restore 5 baris` (langkah 68) — kesalahan skrip uji, bukan aplikasi.**
   Skrip uji mengirim sebuah fungsi, bukan array/teks, sehingga tersimpan kosong. Langkah 69 langsung memulihkan 5 baris ketentuan dan PASS.

### Bug tambahan yang ditemukan saat uji

**Field pengaturan web tidak bisa dikosongkan.** `collectAllWebSettings()` memakai pola `nilaiInput || nilaiLama`, jadi menghapus isi Tagline / SEO Title / Description / Social / WhatsApp lalu klik Simpan akan diam-diam menyimpan nilai lama. Ini terbukti saat uji SEO Title (nilai QA tidak mau hilang). Perbaikan: helper `readField()` membaca nilai field apa adanya bila elemennya ada; fallback hanya dipakai jika elemen tidak dirender. Diuji ulang lewat langkah 32 (`SEO: clear title`) dan PASS.

## Log kronologis (waktu server, WIB)

| # | Waktu | Aksi | Hasil | Durasi |
|---|---|---|---|---|
| 1 | 02:44:40 | Pasar: OFF | ✅ PASS | 1431 ms |
| 2 | 02:44:41 | Pasar: restore ON | ✅ PASS | 1352 ms |
| 3 | 02:44:43 | Weekend profit: OFF | ✅ PASS | 1296 ms |
| 4 | 02:44:44 | Weekend profit: restore ON | ✅ PASS | 1272 ms |
| 5 | 02:44:55 | Mode Loss: ON | ✅ PASS | 1546 ms |
| 6 | 02:44:57 | Mode Loss: restore OFF | ✅ PASS | 1426 ms |
| 7 | 02:44:58 | Jadwal WD: OFF + jam 10 | ✅ PASS | 1835 ms |
| 8 | 02:45:00 | Jadwal WD: restore ON + jam 9 | ✅ PASS | 1924 ms |
| 9 | 02:45:13 | Afiliasi: sponsor 11 + rabat L3 1.5 | ✅ PASS | 1565 ms |
| 10 | 02:45:14 | Afiliasi: restore 10 / 1 | ✅ PASS | 1693 ms |
| 11 | 02:45:16 | Leader: rename Bronze | ✅ PASS | 1301 ms |
| 12 | 02:45:17 | Leader: restore | ✅ PASS | 1313 ms |
| 13 | 02:45:25 | QRIS: OFF + NMID QA | ✅ PASS | 1342 ms |
| 14 | 02:45:26 | QRIS: restore ON + NMID | ✅ PASS | 1313 ms |
| 15 | 02:45:27 | Gateway: kurs 16300 | ✅ PASS | 1318 ms |
| 16 | 02:45:28 | Gateway: restore kurs 16250 | ✅ PASS | 1423 ms |
| 17 | 02:45:37 | APK: versi QA | ✅ PASS | 1879 ms |
| 18 | 02:45:39 | APK: restore versi | ✅ PASS | 1330 ms |
| 19 | 02:45:40 | Absensi: reward 1200 | ✅ PASS | 1368 ms |
| 20 | 02:45:41 | Absensi: restore reward 1000 | ✅ PASS | 1333 ms |
| 21 | 02:45:51 | PPOB: adminFee 2500 | ✅ PASS | 1849 ms |
| 22 | 02:45:53 | PPOB: restore adminFee 0 | ✅ PASS | 1403 ms |
| 23 | 02:45:54 | CS: telegram QA | ✅ PASS | 1335 ms |
| 24 | 02:45:56 | CS: restore telegram | ✅ PASS | 1337 ms |
| 25 | 02:46:03 | Kelas Trading: desc QA | ✅ PASS | 1516 ms |
| 26 | 02:46:04 | Kelas Trading: restore desc | ✅ PASS | 1350 ms |
| 27 | 02:46:06 | Web general: appName QA | ✅ PASS | 1356 ms |
| 28 | 02:46:07 | Web general: restore appName | ✅ PASS | 1354 ms |
| 29 | 02:46:24 | Tampilan: primary #3B82F6 | ✅ PASS | 1364 ms |
| 30 | 02:46:25 | Tampilan: restore #C89338 | ✅ PASS | 1345 ms |
| 31 | 02:46:27 | SEO: title QA | ✅ PASS | 1200 ms |
| 32 | 02:46:28 | SEO: clear title (fix empty-field) | ✅ PASS | 1241 ms |
| 33 | 02:46:36 | Social: instagram QA | ✅ PASS | 1480 ms |
| 34 | 02:46:37 | Social: restore instagram | ✅ PASS | 1397 ms |
| 35 | 02:46:38 | Maintenance: ON | ✅ PASS | 1328 ms |
| 36 | 02:46:40 | Maintenance: restore OFF | ✅ PASS | 1722 ms |
| 37 | 02:46:46 | WD master: KUNCI (OFF) | ✅ PASS | 1675 ms |
| 38 | 02:46:48 | WD master: BUKA (ON) | ✅ PASS | 1273 ms |
| 39 | 02:46:49 | Profil admin: fullName QA | ✅ PASS | 951 ms |
| 40 | 02:46:50 | Profil admin: restore fullName | ✅ PASS | 944 ms |
| 41 | 02:46:58 | Running text: tambah QA | ✅ PASS | 1510 ms |
| 42 | 02:46:59 | Running text: toggle OFF | ✅ PASS | 1514 ms |
| 43 | 02:47:01 | Running text: speed 45s | ✅ PASS | 1330 ms |
| 44 | 02:47:02 | Running text: speed restore 50s | ✅ PASS | 1316 ms |
| 45 | 02:47:11 | Running text: hapus QA | ✅ PASS | 1581 ms |
| 46 | 02:47:12 | Banner: tambah QA | ✅ PASS | 1319 ms |
| 47 | 02:47:14 | Banner: toggle OFF | ✅ PASS | 1488 ms |
| 48 | 02:47:15 | Banner: hapus QA | ✅ PASS | 1798 ms |
| 49 | 02:47:24 | Reward: tambah QA | ✅ PASS | 1435 ms |
| 50 | 02:47:25 | Reward: toggle OFF | ✅ PASS | 1790 ms |
| 51 | 02:47:27 | Reward: hapus QA | ✅ PASS | 1524 ms |
| 52 | 02:47:28 | Testimoni: tambah QA | ✅ PASS | 1058 ms |
| 53 | 02:47:35 | Testimoni: toggle OFF | ✅ PASS | 1010 ms |
| 54 | 02:47:36 | Testimoni: hapus QA | ✅ PASS | 1200 ms |
| 55 | 02:47:37 | Bank: tambah QA | ✅ PASS | 1592 ms |
| 56 | 02:47:39 | Bank: toggle OFF | ✅ PASS | 1501 ms |
| 57 | 02:47:54 | Bank: hapus QA | ✅ PASS | 1640 ms |
| 58 | 02:47:56 | Paket: tambah QA Plan | ✅ PASS | 1496 ms |
| 59 | 02:47:57 | Paket: edit QA Plan (12 hari) | ✅ PASS | 1612 ms |
| 60 | 02:48:05 | Paket: hapus QA Plan | ❌ FAIL (bug, lihat #1) | 1607 ms |
| 61 | 02:48:07 | Sinyal: terbitkan QAUSD | ✅ PASS | 1665 ms |
| 62 | 02:48:08 | Sinyal: hapus QAUSD | ✅ PASS | 1503 ms |
| 63 | 02:48:10 | Sinkron data member (admin) | ✅ PASS | 1382 ms |
| 64 | 02:50:26 | Paket: tambah QA Plan (retest) | ✅ PASS | 1524 ms |
| 65 | 02:50:27 | Paket: edit QA Plan 12 hari (retest) | ✅ PASS | 3223 ms |
| 66 | 02:50:30 | Paket: hapus QA Plan (retest) | ✅ PASS | 1577 ms |
| 67 | 02:54:19 | Ketentuan WD: tambah baris QA | ✅ PASS | 2058 ms |
| 68 | 02:54:21 | Ketentuan WD: restore 5 baris | ❌ FAIL (skrip uji, lihat #2) | 1592 ms |
| 69 | 02:54:32 | Ketentuan WD: restore 5 baris (fix) | ✅ PASS | 1557 ms |

## Cakupan pengaturan & nilai akhir (dibaca ulang dari MySQL)

| Pengaturan | Diuji | Nilai akhir |
|---|---|---|
| Status pasar ON/OFF | toggle 2 arah | `open` / `marketOpen = true` |
| Profit Sabtu–Minggu | toggle 2 arah | `enabled = true` |
| Mode Loss hari ini | toggle 2 arah | `isLoss = false` |
| Jadwal & jam operasional WD | ubah jam + toggle | `enabled = true, 09–15` |
| Ketentuan WD | ubah + restore | 5 baris |
| Sponsor & rabat L1/L2/L3 | ubah + restore | `10`, `3 / 2 / 1 %` |
| Target leader | ubah + restore | `Bronze Leader` |
| QRIS (aktif, NMID) | toggle + ubah + restore | `active = true`, `ID1025434761348` |
| Crypto USDT & kurs | ubah + restore | `active = true`, `16250` |
| APK download | ubah + restore | `v2.4.0 (Official Release)` |
| Absensi harian | ubah + restore | `reward = 1000`, `enabled = true` |
| PPOB (biaya admin) | ubah + restore | `adminFee = 0` |
| Kontak CS | ubah + restore | `https://t.me/autotrading_cs` |
| Kelas Trading | ubah + restore | deskripsi asli |
| Identitas web (appName) | ubah + restore | `AUTOTRADING` |
| Tampilan (warna primary) | ubah + restore | `#C89338` |
| SEO title (termasuk kosongkan) | ubah, kosongkan | kosong |
| Media sosial | ubah + restore | Instagram resmi |
| Mode maintenance | ON → OFF | `enabled = false` |
| Master switch WD (topbar) | KUNCI → BUKA | `enabled = true` |
| Profil admin | ubah nama + restore | `System Administrator` |
| Teks berjalan (speed) | 45 → 50 | `50` detik |
| CRUD teks berjalan | tambah → toggle → hapus | 4 pengumuman aktif |
| CRUD banner | tambah → toggle → hapus | 4 banner |
| CRUD reward | tambah → toggle → hapus | 7 hadiah |
| CRUD testimoni | tambah → toggle → hapus | 3 testimoni |
| CRUD rekening bank | tambah → toggle → hapus | 4 rekening (1 aktif) |
| CRUD paket investasi | tambah → edit → hapus | 3 paket default |
| CRUD sinyal | terbitkan → hapus | 4 sinyal |
| Sinkronisasi data member | jalankan | sukses, idempoten |

## Bukti tampilan frontend

- **Teks berjalan** tampil di halaman publik dengan 4 pengumuman aktif dan kecepatan 50 detik.
- **Rabat** tampil `3%` (sesuai setting, bukan 5%).
- **Rekening aktif** `SEABANK` tampil di halaman deposit.
- **Nama platform** `AUTOTRADING` dan title halaman mengikuti pengaturan web.
- **Maintenance OFF** → situs publik normal (tidak ada overlay pemeliharaan).

![Frontend publik dengan running text dari database](screenshots/admin-sync-frontend-home.png)
![Panel Pengaturan Web terisi dari MySQL](screenshots/admin-sync-settings-general.png)

## Tidak dijalankan (sengaja) dan alasannya

| Aksi | Alasan |
|---|---|
| Simpan Email & OTP (SMTP) | Form mengirim password SMTP kosong dari browser; menyimpan berisiko menimpa kredensial email produksi. Hanya dibaca, tidak diubah. |
| Ganti password admin | Butuh password lama yang tidak boleh ditebak/diubah saat audit. |
| Reset Pengaturan Web / Reset Database Demo | Destruktif: menghapus seluruh konfigurasi & data. |
| Trigger Daily Profit | Mengubah saldo/profit seluruh member secara nyata. |
| Kirim email uji | Mengirim email keluar nyata ke kotak masuk. |
| Backup/Export (JSON/SQL/CSV) | Hanya unduhan file, tidak menulis state; tidak termasuk simpan/toggle. |

## Berkas yang diubah

- [js/admin-page.js](../js/admin-page.js) — `readField()` agar field kosong benar-benar tersimpan kosong; verifikasi baca-ulang MySQL pada simpan/hapus paket.
- [js/admin.js](../js/admin.js) — hapus `DB.save()` setelah `admin_save_plans` agar snapshot lama tidak menimpa paket.

## Deploy & verifikasi pascadeploy

1. `node --check js/admin.js` dan `node --check js/admin-page.js` — lolos.
2. Deploy cPanel (`npm run deploy`) — **COMPLETED SUCCESSFULLY (100%)**, 28 file terunggah; versi di server sudah memuat `readField()` (20 kemunculan di `admin-page.js`).
3. Uji asap tanpa probe: toggle Pasar OFF → `marketOpen=false`, lalu ON → `marketOpen=true`, dibaca dari `action=get` terautentikasi. PASS.
4. `https://autotrading.my.id/` → 200, `admin.html` → 200, `api/index.php?action=get` → 200, tanpa `fatal error`/`parse error`.
5. File uji sementara dihapus dari server: `api/_probe_admin.php`, `api/_probe.php`, `api/_qa_sync_test.php` → semuanya **404**.

## Catatan

- Log mentah: [admin-sync-test-log.json](admin-sync-test-log.json); snapshot akhir database: [admin-sync-final-state.json](admin-sync-final-state.json).
- Dua peringatan console `Cloud sync get error: Failed to fetch` muncul saat halaman pertama dimuat (request yang dibatalkan), bukan dari proses simpan; seluruh request simpan tercatat HTTP 200.
