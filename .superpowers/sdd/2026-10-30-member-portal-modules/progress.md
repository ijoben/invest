# SDD ledger — plan: docs/superpowers/plans/2026-10-30-member-portal-modules.md
Pre-flight: Interfaces checked across Task 1 to Task 8. All endpoints and frontend models aligned.
Ruling: Beli perak memotong walletBalance secara instan, Jual perak menambah walletBalance secara instan dengan riwayat transaksi tercatat — sesuai model liquid digital asset trading & WD instan — jika salah, admin bisa mengubah flow ke manual review di settings.
Ruling: Pinjaman leader menghitung sponsor aktif langsung dari database relasional (downline dengan status aktif/deposit/investasi > 0) — sesuai permintaan S&K 10 sponsor aktif — jika salah, ambang batas dapat dikonfigurasi di setting.

Status: COMPLETED
All 8 tasks executed, verified with 61 automated assertions, deployed to cPanel FTP server, and verified with 7 live HTTP endpoints.
