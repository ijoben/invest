/**
 * AUTOTRADING - ADMIN CONTROL PANEL ENGINE
 * Manages full platform administrative controls, transaction approvals,
 * plan configurations, affiliate rates, profit engine, and user balances.
 */

import { DB } from './db.js';
import { Plans } from './plans.js';
import { Affiliate } from './affiliate.js';

export const Admin = {
  // Get platform dashboard stats
  getStats() {
    const db = DB.get();
    
    const nonAdminUsers = (db.users || []).filter(u => u.role !== 'admin');
    const totalUsers = nonAdminUsers.length;
    // Member "sudah beli" = punya minimal satu record investasi (aktif maupun selesai).
    // Member "aktif trading" = punya investasi berstatus active. Jangan pernah
    // fallback ke jumlah akun tidak-diblokir: itu mencampur akun yang belum beli
    // paket ke angka investor (dulu membuat dashboard menampilkan angka menyesatkan).
    const investments = db.investments || [];
    const nonAdminIds = new Set(nonAdminUsers.map(u => u.id));
    const buyerIds = new Set(investments.map(i => i && i.userId).filter(id => id && nonAdminIds.has(id)));
    const activeInvUsers = new Set(investments.filter(i => i.status === 'active').map(i => i.userId).filter(id => nonAdminIds.has(id)));
    const activeUsers = activeInvUsers.size;
    const buyerUsers = buyerIds.size;
    const activeAccounts = nonAdminUsers.filter(u => !u.isBlocked && u.status !== 'blocked').length;
    const blockedAccounts = nonAdminUsers.filter(u => u.isBlocked || u.status === 'blocked').length;
    
    const totalDeposits = db.transactions
      .filter(t => t.type === 'deposit' && t.status === 'approved')
      .reduce((sum, t) => sum + (t.amount || 0), 0);

    const totalWithdrawals = db.transactions
      .filter(t => t.type === 'withdraw' && t.status === 'approved')
      .reduce((sum, t) => sum + (t.amount || 0), 0);

    const activeCapital = db.investments
      .filter(i => i.status === 'active')
      .reduce((sum, i) => sum + (i.capital || 0), 0);

    const totalProfitPaid = db.transactions
      .filter(t => t.type === 'profit_claim')
      .reduce((sum, t) => sum + (t.amount || 0), 0);

    const pendingDepositsCount = db.transactions
      .filter(t => t.type === 'deposit' && t.status === 'pending').length;

    const pendingWithdrawalsCount = db.transactions
      .filter(t => (t.type === 'withdraw' || t.type === 'ppob_conversion') && t.status === 'pending').length;

    const pendingRedemptionsCount = (db.redemptions || [])
      .filter(r => r.status === 'pending').length;

    const totalRewardsCount = (db.rewards || []).length;

    return {
      totalUsers,
      activeUsers,
      buyerUsers,
      activeAccounts,
      blockedAccounts,
      totalDeposits,
      totalWithdrawals,
      activeCapital,
      totalProfitPaid,
      pendingDepositsCount,
      pendingWithdrawalsCount,
      pendingRedemptionsCount,
      totalRewardsCount
    };
  },

  // Approve Deposit Request (Calls Authoritative Server API)
  async approveDeposit(transactionId) {
    const res = await DB.adminApproveDeposit(transactionId);
    if (!res || !res.success) {
      return { success: false, message: (res && res.message) || 'Gagal memproses deposit!' };
    }

    const db = DB.get();
    const trx = (db.transactions || []).find(t => t.id === transactionId);
    const user = trx ? (db.users || []).find(u => u.id === trx.userId) : null;

    // Send email notification to member. Status WAJIB 'approved' di sini:
    // template 'pending' dipakai saat member mengunggah bukti (belum masuk saldo),
    // sedangkan email "saldo berhasil masuk" hanya boleh keluar setelah approve.
    if (user && user.email) {
      DB.dispatchMailApi('deposit', {
        status: 'approved',
        user: { email: user.email, username: user.username, fullName: user.fullName },
        transaction: trx || { id: transactionId, amount: trx?.amount }
      });
    }

    return {
      success: true,
      message: res.message || `Deposit ${trx ? DB.formatIDR(trx.amount) : ''} berhasil disetujui!`
    };
  },

  // Reject Deposit Request
  async rejectDeposit(transactionId, reason = 'Bukti transfer tidak valid') {
    const res = await DB.adminRejectDeposit(transactionId, reason);
    if (!res || !res.success) {
      return { success: false, message: (res && res.message) || 'Gagal menolak deposit!' };
    }
    return { success: true, message: res.message || `Deposit ${transactionId} berhasil ditolak.` };
  },

  // Approve Withdrawal / PPOB Request
  async approveWithdrawal(transactionId) {
    const res = await DB.adminApproveWithdrawal(transactionId);
    if (!res || !res.success) {
      return { success: false, message: (res && res.message) || 'Gagal menyetujui penarikan!' };
    }

    const db = DB.get();
    const trx = (db.transactions || []).find(t => t.id === transactionId);
    const user = trx ? (db.users || []).find(u => u.id === trx.userId) : null;

    // Send email notification to member
    if (user && user.email && trx) {
      if (trx.type === 'ppob_conversion') {
        DB.dispatchMailApi('ppob', {
          status: 'approved',
          user: { email: user.email, username: user.username, fullName: user.fullName },
          transaction: trx
        });
      } else {
        DB.dispatchMailApi('withdraw', {
          status: 'approved',
          user: { email: user.email, username: user.username, fullName: user.fullName },
          transaction: trx
        });
      }
    }

    return {
      success: true,
      message: res.message || 'Penarikan berhasil disetujui!'
    };
  },

  // Reject Withdrawal / PPOB Request (Refunds user balance atomically)
  async rejectWithdrawal(transactionId, reason = 'Data rekening / nomor tujuan tidak sesuai') {
    // Client-side idempotency guard: a transaction already rejected & refunded
    // (trx.isRefunded) must never trigger a second refund. Server guards too.
    const preDb = DB.get();
    const preTrx = (preDb.transactions || []).find(t => t.id === transactionId);
    if (preTrx && (preTrx.isRefunded || preTrx.status === 'rejected')) {
      return { success: true, message: 'Permintaan ini sudah pernah ditolak — refund tidak diulang.' };
    }

    const res = await DB.adminRejectWithdrawal(transactionId, reason);
    if (!res || !res.success) {
      return { success: false, message: (res && res.message) || 'Gagal menolak penarikan!' };
    }

    const db = DB.get();
    const trx = (db.transactions || []).find(t => t.id === transactionId);
    const user = trx ? (db.users || []).find(u => u.id === trx.userId) : null;

    // Send email notification to member
    if (user && user.email && trx) {
      if (trx.type === 'ppob_conversion') {
        DB.dispatchMailApi('ppob', {
          status: 'rejected',
          user: { email: user.email, username: user.username, fullName: user.fullName },
          transaction: trx
        });
      } else {
        DB.dispatchMailApi('withdraw', {
          status: 'rejected',
          user: { email: user.email, username: user.username, fullName: user.fullName },
          transaction: trx
        });
      }
    }

    return {
      success: true,
      message: res.message || 'Permintaan penarikan ditolak dan saldo berhasil dikembalikan ke akun member.'
    };
  },

  // Reconcile All User Balances with Ledger
  async reconcileAllBalances() {
    return await DB.adminReconcileAllBalances();
  },

  // Reconcile every member's withdrawal bank/e-wallet details with the database
  async syncBankDetails() {
    return await DB.adminSyncBankDetails();
  },

  // --------------------------------------------------------------------------
  // RESET DATA MEMBER (akun curang / tidak valid)
  // Reset total dijalankan di server: saldo & poin dihapus, seluruh transaksi,
  // paket investasi dan penukaran poin member ikut terhapus permanen.
  // Profil, login, kode referral dan rekening bank tetap dipertahankan.
  // Admin WAJIB mengetik persis username target + alasan (dicek juga di server).
  // --------------------------------------------------------------------------
  async resetMember(userId, confirmUsername, reason) {
    try {
      if (typeof fetch !== 'function') return { success: false, message: 'Fetch tidak tersedia' };
      const res = await fetch(DB.getApiUrl('admin_reset_member'), {
        method: 'POST',
        credentials: 'include',
        headers: DB.getAuthHeaders(),
        body: JSON.stringify({
          userId: userId,
          confirmUsername: (confirmUsername || '').trim(),
          reason: (reason || '').trim()
        })
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json || !json.success) {
        return { success: false, message: (json && json.message) || `Gagal mereset data member (HTTP ${res.status})` };
      }
      return json;
    } catch (e) {
      return { success: false, message: e.message || 'Koneksi ke server gagal.' };
    }
  },

  // Riwayat reset terakhir (log audit admin) untuk ditampilkan di modal reset
  async getResetLogs() {
    try {
      if (typeof fetch !== 'function') return { success: false, logs: [] };
      const res = await fetch(DB.getApiUrl('admin_reset_logs'), {
        credentials: 'include',
        headers: DB.getAuthHeaders()
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json || !json.success) return { success: false, logs: [] };
      return { success: true, logs: Array.isArray(json.logs) ? json.logs : [] };
    } catch (e) {
      return { success: false, logs: [] };
    }
  },

  // --------------------------------------------------------------------------
  // AUDIT PERHITUNGAN PROFIT (semua member)
  // Memeriksa apakah nominal profit harian = modal x rate paket, dan apakah
  // nominal yang akan dibayar (pending) sama dengan yang tampil di kartu member.
  // --------------------------------------------------------------------------
  async profitAudit(userId = '') {
    try {
      if (typeof fetch !== 'function') return { success: false, message: 'Fetch tidak tersedia' };
      const q = userId ? `&userId=${encodeURIComponent(userId)}` : '';
      const res = await fetch(DB.getApiUrl('admin_profit_audit') + q, {
        credentials: 'include',
        headers: DB.getAuthHeaders()
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json || !json.success) {
        return { success: false, message: (json && json.message) || `Gagal memeriksa data profit (HTTP ${res.status})` };
      }
      return json;
    } catch (e) {
      return { success: false, message: e.message || 'Koneksi ke server gagal.' };
    }
  },

  // Perbaiki rate/nominal riwayat profit agar selalu konsisten. TIDAK mengubah
  // saldo, total profit, atau sisa hari paket — hanya menyelaraskan angka yang
  // ditampilkan dengan nominal yang benar-benar dibayar.
  async repairProfitData(userId = '') {
    try {
      if (typeof fetch !== 'function') return { success: false, message: 'Fetch tidak tersedia' };
      const res = await fetch(DB.getApiUrl('admin_profit_repair'), {
        method: 'POST',
        credentials: 'include',
        headers: DB.getAuthHeaders(),
        body: JSON.stringify({ userId: userId || '' })
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json || !json.success) {
        return { success: false, message: (json && json.message) || `Gagal memperbaiki data profit (HTTP ${res.status})` };
      }
      return json;
    } catch (e) {
      return { success: false, message: e.message || 'Koneksi ke server gagal.' };
    }
  },

  // Save / Update Plan
  async savePlan(planData) {
    const db = DB.get();
    db.plans = db.plans || [];
    const data = { ...(planData || {}) };
    // A new plan must always get a real id: spreading planData after the default
    // used to overwrite the generated id with undefined (JSON omitted it), so
    // freshly added plans were saved without an id and could not be edited.
    if (!data.id) delete data.id;
    const existingIdx = data.id ? db.plans.findIndex(p => p.id === data.id) : -1;

    if (existingIdx !== -1) {
      db.plans[existingIdx] = { ...db.plans[existingIdx], ...data };
    } else {
      db.plans.push({
        theme: 'theme-learn',
        activeCount: 0,
        ...data,
        id: data.id || ('plan-' + Date.now())
      });
    }

    // The dedicated endpoint writes both platform_plans and state.plans.
    // Do NOT follow it with a full-state save: a delayed/retried state push can
    // carry an older plan list and silently roll back a just-saved edit.
    const res = await DB.adminSavePlans(db.plans);
    return res && res.success !== false ? res : { success: true, message: 'Paket investasi berhasil disimpan!' };
  },

  // Delete Plan
  async deletePlan(planId) {
    const db = DB.get();
    db.plans = db.plans.filter(p => p.id !== planId);
    // Authoritative endpoint only — see savePlan() above for why a full-state
    // save here could resurrect a deleted plan from a stale snapshot.
    const res = await DB.adminSavePlans(db.plans);
    return res && res.success !== false ? res : { success: true, message: 'Paket investasi berhasil dihapus.' };
  },

  // Update Settings (Affiliate, Rates, Payment Details)
  async updateSettings(newSettings) {
    const db = DB.get();
    db.settings = { ...db.settings, ...newSettings };
    await DB.save(db);
    await DB.adminSaveSettings(newSettings);
    return { success: true, message: 'Pengaturan sistem berhasil diperbarui!' };
  },

  // Bank Accounts Management
  getBanks() {
    const db = DB.get();
    return (db.settings.paymentGateways && db.settings.paymentGateways.banks) || [];
  },

  async saveBank(bankData) {
    const db = DB.get();
    db.settings.paymentGateways = db.settings.paymentGateways || {};
    db.settings.paymentGateways.banks = db.settings.paymentGateways.banks || [];
    const banks = db.settings.paymentGateways.banks;

    const existingIdx = bankData.id ? banks.findIndex(b => b.id === bankData.id) : -1;
    if (existingIdx !== -1) {
      banks[existingIdx] = {
        ...banks[existingIdx],
        name: bankData.name.trim(),
        accountNo: String(bankData.accountNo).trim(),
        accountName: bankData.accountName.trim(),
        active: bankData.active !== undefined ? Boolean(bankData.active) : true
      };
    } else {
      const newBank = {
        id: 'bank-' + Date.now(),
        name: bankData.name.trim(),
        accountNo: String(bankData.accountNo).trim(),
        accountName: bankData.accountName.trim(),
        active: bankData.active !== undefined ? Boolean(bankData.active) : true
      };
      banks.push(newBank);
    }

    await DB.save(db);
    await DB.adminSaveSettings({ paymentGateways: db.settings.paymentGateways });
    return { success: true, message: 'Rekening bank berhasil disimpan!' };
  },

  async deleteBank(bankId) {
    const db = DB.get();
    if (!db.settings.paymentGateways || !db.settings.paymentGateways.banks) {
      return { success: false, message: 'Data bank tidak ditemukan!' };
    }
    db.settings.paymentGateways.banks = db.settings.paymentGateways.banks.filter(b => b.id !== bankId);
    await DB.save(db);
    await DB.adminSaveSettings({ paymentGateways: db.settings.paymentGateways });
    return { success: true, message: 'Rekening bank berhasil dihapus.' };
  },

  async toggleBankStatus(bankId) {
    const db = DB.get();
    const banks = (db.settings.paymentGateways && db.settings.paymentGateways.banks) || [];
    const bank = banks.find(b => b.id === bankId);
    if (!bank) return { success: false, message: 'Rekening bank tidak ditemukan!' };

    bank.active = !bank.active;
    await DB.save(db);
    await DB.adminSaveSettings({ paymentGateways: db.settings.paymentGateways });
    return {
      success: true,
      active: bank.active,
      message: `Status rekening ${bank.name} diubah menjadi ${bank.active ? 'Aktif' : 'Nonaktif'}.`
    };
  },

  // QRIS Management
  async saveQrisSettings({ active, merchantName, nmid, imageUrl }) {
    const db = DB.get();
    db.settings.paymentGateways = db.settings.paymentGateways || {};
    db.settings.paymentGateways.qris = {
      active: active !== undefined ? Boolean(active) : true,
      merchantName: merchantName ? merchantName.trim() : 'AUTOTRADING OFFICIAL QRIS',
      nmid: nmid ? nmid.trim() : '',
      imageUrl: imageUrl ? imageUrl.trim() : ''
    };
    await DB.save(db);
    await DB.adminSaveSettings({ paymentGateways: db.settings.paymentGateways });
    return { success: true, message: 'Pengaturan QRIS berhasil disimpan!' };
  },

  // USDT Crypto Gateway Management
  async saveUsdtSettings({ active, trc20Address, bep20Address, usdIdrRate, withdrawFeePercent, depositPointsReward }) {
    const db = DB.get();
    db.settings.paymentGateways = db.settings.paymentGateways || {};
    db.settings.paymentGateways.usdt = {
      active: active !== undefined ? Boolean(active) : true,
      trc20Address: trc20Address ? trc20Address.trim() : 'TXv7qL98HqN8sP2uYx9B9m34j9KxL0qWp1',
      bep20Address: bep20Address ? bep20Address.trim() : '0x71C4982aF12B76295328B83716d1029C837A5982'
    };
    if (usdIdrRate !== undefined) db.settings.usdIdrRate = Number(usdIdrRate) || 16250;
    if (withdrawFeePercent !== undefined) db.settings.withdrawFeePercent = Number(withdrawFeePercent);
    if (depositPointsReward !== undefined) db.settings.depositPointsReward = Number(depositPointsReward);
    await DB.save(db);
    await DB.adminSaveSettings({
      paymentGateways: db.settings.paymentGateways,
      usdIdrRate: db.settings.usdIdrRate,
      withdrawFeePercent: db.settings.withdrawFeePercent,
      depositPointsReward: db.settings.depositPointsReward
    });
    return { success: true, message: 'Pengaturan Crypto USDT & Kurs berhasil disimpan!' };
  },

  // Adjust User Balance directly (Authoritative via MySQL + Audit Transaction)
  async adjustUserBalance(userId, { walletBalance, affiliateBalance, points, note }) {
    const payload = {};
    if (walletBalance !== undefined) payload.walletBalance = Number(walletBalance);
    if (affiliateBalance !== undefined) payload.affiliateBalance = Number(affiliateBalance);
    if (points !== undefined) payload.points = Number(points);
    if (note !== undefined) payload.note = String(note).trim();

    const res = await DB.adminUpdateUser(userId, payload);
    if (res && res.success) {
      return { success: true, message: res.message || 'Saldo pengguna berhasil diperbarui di database!' };
    }
    return { success: false, message: (res && res.message) || 'Gagal memperbarui saldo pengguna!' };
  },

  // Authoritative Full Member Profile Update (Balance, info, bank, role, status)
  async updateUserFull(userId, payload) {
    return await DB.adminUpdateUser(userId, payload);
  },

  // Process / Approve Redemption (Set to processing)
  async approveRedemption(redemptionId, adminNote = 'Hadiah sedang diproses / dikirim') {
    const db = DB.get();
    const rdm = (db.redemptions || []).find(r => r.id === redemptionId);
    if (!rdm) return { success: false, message: 'Data penukaran tidak ditemukan!' };

    rdm.status = 'processing';
    rdm.adminNote = adminNote;
    rdm.updatedAt = new Date().toISOString();

    await DB.save(db);
    return { success: true, message: `Penukaran ${rdm.id} (${rdm.rewardTitle}) berhasil disetujui dan sedang diproses!` };
  },

  // Complete Redemption (Set to completed / delivered)
  async completeRedemption(redemptionId, adminNote = 'Hadiah telah berhasil dikirim / ditransfer ke pengguna') {
    const db = DB.get();
    const rdm = (db.redemptions || []).find(r => r.id === redemptionId);
    if (!rdm) return { success: false, message: 'Data penukaran tidak ditemukan!' };

    rdm.status = 'completed';
    rdm.adminNote = adminNote;
    rdm.updatedAt = new Date().toISOString();

    await DB.save(db);
    return { success: true, message: `Penukaran ${rdm.id} telah diselesaikan!` };
  },

  // Reject Redemption (Refunds user points & restocks reward)
  async rejectRedemption(redemptionId, reason = 'Data kontak atau alamat tidak valid') {
    const db = DB.get();
    const rdm = (db.redemptions || []).find(r => r.id === redemptionId);
    if (!rdm) return { success: false, message: 'Data penukaran tidak ditemukan!' };

    if (rdm.status === 'rejected') {
      return { success: false, message: 'Penukaran ini sudah pernah ditolak sebelumnya!' };
    }

    // Refund points to user
    const user = db.users.find(u => u.id === rdm.userId);
    if (user) {
      user.points = (Number(user.points) || 0) + Number(rdm.pointsSpent || 0);
    }

    // Restock reward
    const reward = (db.rewards || []).find(r => r.id === rdm.rewardId);
    if (reward) {
      reward.stock = (Number(reward.stock) || 0) + 1;
    }

    rdm.status = 'rejected';
    rdm.adminNote = reason;
    rdm.updatedAt = new Date().toISOString();

    await DB.save(db);
    return {
      success: true,
      message: `Penukaran ${rdm.id} ditolak. Poin ${rdm.pointsSpent} telah dikembalikan secara otomatis ke pengguna ${rdm.username}.`
    };
  },

  // Approve Testimonial (with 5-Star Automatic Points Bonus)
  async approveTestimonial(testimonialId) {
    const db = DB.get();
    db.testimonials = db.testimonials || [];
    const testi = db.testimonials.find(t => t.id === testimonialId);
    if (!testi) return { success: false, message: 'Testimoni tidak ditemukan!' };

    testi.status = 'approved';
    testi.active = true;
    testi.updatedAt = new Date().toISOString();

    let bonusMessage = '';
    // Auto reward +50 loyalty points if 5-star rating and not yet rewarded
    if (Number(testi.rating) === 5 && !testi.pointsRewarded && testi.userId) {
      const user = db.users.find(u => u.id === testi.userId);
      if (user) {
        user.points = (Number(user.points) || 0) + 50;
        testi.pointsRewarded = true;
        bonusMessage = ` & bonus +50 Poin berhasil diberikan kepada ${user.username}!`;
      }
    }

    await DB.save(db);
    return {
      success: true,
      message: `Testimoni dari ${testi.name} berhasil disetujui${bonusMessage}`
    };
  },

  // Reject Testimonial
  async rejectTestimonial(testimonialId, reason = 'Foto bukti atau isi testimoni tidak sesuai ketentuan') {
    const db = DB.get();
    db.testimonials = db.testimonials || [];
    const testi = db.testimonials.find(t => t.id === testimonialId);
    if (!testi) return { success: false, message: 'Testimoni tidak ditemukan!' };

    testi.status = 'rejected';
    testi.rejectReason = reason;
    testi.updatedAt = new Date().toISOString();

    await DB.save(db);
    return { success: true, message: `Testimoni dari ${testi.name} telah ditolak.` };
  },

  // Delete Testimonial
  async deleteTestimonial(testimonialId) {
    await DB.deleteTestimonial(testimonialId);
    return { success: true, message: 'Testimoni berhasil dihapus.' };
  },

  // Save / Update Withdrawal Schedule
  async saveWithdrawSchedule(scheduleConfig) {
    const db = DB.get();
    db.settings.withdrawSchedule = {
      ...db.settings.withdrawSchedule,
      ...scheduleConfig
    };
    await DB.save(db);
    await DB.adminSaveSettings({ withdrawSchedule: db.settings.withdrawSchedule });
    return { success: true, message: 'Jadwal dan status jam operasional WD berhasil disimpan!' };
  },

  // Get Weekend Profit Settings
  getWeekendProfitSettings() {
    const db = DB.get();
    return db.settings.weekendProfit || {
      enabled: db.settings.weekendProfitEnabled !== undefined ? db.settings.weekendProfitEnabled : true,
      offMessage: 'Pasar Keuangan & Trading Libur di Akhir Pekan (Sabtu & Minggu). Dividen profit akan kembali berjalan aktif hari Senin.'
    };
  },

  // Save Weekend Profit Settings (Sabtu & Minggu)
  async saveWeekendProfitSettings({ enabled, offMessage }) {
    const db = DB.get();
    const isEnabled = enabled === true || enabled === 'true' || enabled === 1;
    const message = offMessage ? offMessage.trim() : 'Pasar Keuangan & Trading Libur di Akhir Pekan (Sabtu & Minggu). Dividen profit akan kembali berjalan aktif hari Senin.';

    db.settings.weekendProfit = {
      enabled: isEnabled,
      offMessage: message
    };
    db.settings.weekendProfitEnabled = isEnabled;

    await DB.save(db);
    await DB.adminSaveSettings({
      weekendProfit: db.settings.weekendProfit,
      weekendProfitEnabled: isEnabled
    });
    return {
      success: true,
      enabled: isEnabled,
      message: `Pengaturan profit Sabtu & Minggu berhasil disimpan! Status: ${isEnabled ? 'AKTIF (7 Hari Penuh)' : 'LIBUR (Senin-Jumat Saja)'}.`
    };
  },

  // Delete Signal
  async deleteSignal(signalId) {
    const db = DB.get();
    db.signals = (db.signals || []).filter(s => s.id !== signalId);
    await DB.save(db);
    try {
      if (typeof DB.adminSaveSignals === 'function') {
        await DB.adminSaveSignals(db.signals);
      }
    } catch (e) {
      console.warn('adminSaveSignals error:', e);
    }
    return { success: true, message: 'Sinyal berhasil dihapus.' };
  },

  // Get Market Master Settings
  getMarketMasterSettings() {
    const db = DB.get();
    const isOpen = db.settings.marketStatus !== 'closed' && db.settings.marketOpen !== false;
    return {
      isOpen,
      status: isOpen ? 'open' : 'closed',
      offMessage: db.settings.marketOffMessage || 'Pasar Keuangan Global & AI Trading sedang LIBUR (OFF). Semua instrumen, AI Bot, dan sinyal ditangguhkan.'
    };
  },

  // Save Market Master Settings
  async saveMarketMasterSettings({ isOpen, message }) {
    const db = DB.get();
    const openVal = isOpen === true || isOpen === 'true' || isOpen === 'open';
    db.settings.marketStatus = openVal ? 'open' : 'closed';
    db.settings.marketOpen = openVal;
    if (message) {
      db.settings.marketOffMessage = message.trim();
    }
    await DB.save(db);
    await DB.adminSaveSettings({
      marketStatus: db.settings.marketStatus,
      marketOpen: openVal,
      marketOffMessage: db.settings.marketOffMessage
    });
    return {
      success: true,
      isOpen: openVal,
      message: `Status Operasional Pasar Global berhasil diubah menjadi: ${openVal ? '🟢 BUKA (ON)' : '🔴 TUTUP (OFF)'}.`
    };
  },

  // Today Profit / Loss Mode (Requirement 4: ON/OFF Loss 0% Hari Ini)
  getTodayProfitMode() {
    const db = DB.get();
    return db.settings.todayProfitLossMode || {
      isLoss: false,
      message: 'Hari ini pasar mengalami fluktuasi / Loss (Dividen Profit 0%). Fitur proteksi modal menjaga saldo pokok Anda tetap 100% aman.'
    };
  },

  async saveTodayProfitMode({ isLoss, message }) {
    const db = DB.get();
    const lossVal = isLoss === true || isLoss === 'true';
    db.settings.todayProfitLossMode = {
      isLoss: lossVal,
      message: message ? message.trim() : 'Hari ini pasar mengalami fluktuasi / Loss (Dividen Profit 0%). Fitur proteksi modal menjaga saldo pokok Anda tetap 100% aman.',
      updatedAt: new Date().toISOString()
    };

    // Update today's entry in weeklyProfitHistory
    if (Array.isArray(db.settings.weeklyProfitHistory) && db.settings.weeklyProfitHistory.length > 0) {
      const todayEntry = db.settings.weeklyProfitHistory[db.settings.weeklyProfitHistory.length - 1];
      if (todayEntry) {
        todayEntry.isLoss = lossVal;
        if (lossVal) {
          todayEntry.rate = 0.0;
        } else if (todayEntry.rate === 0) {
          todayEntry.rate = 1.10;
        }
      }
    }

    await DB.save(db);
    await DB.adminSaveSettings({
      todayProfitLossMode: db.settings.todayProfitLossMode,
      weeklyProfitHistory: db.settings.weeklyProfitHistory
    });
    return {
      success: true,
      isLoss: lossVal,
      message: `Status Profit Hari Ini berhasil disimpan: ${lossVal ? '🔴 MODE LOSS / 0% DIAKTIFKAN (Member mendapat 0% hari ini)' : '🟢 NORMAL PROFIT ON (Dividen berjalan normal)'}`
    };
  },

  // Trigger Daily Profit Yield manually from Admin
  async triggerProfitYield(force = false) {
    return await Plans.yieldDailyProfits(force);
  },

  // Save Withdrawal Terms
  async saveWithdrawTerms(terms) {
    const db = DB.get();
    let termsList = [];
    if (Array.isArray(terms)) {
      termsList = terms.map(t => String(t).trim()).filter(Boolean);
    } else if (typeof terms === 'string') {
      termsList = terms.split('\n').map(t => t.trim()).filter(Boolean);
    }
    db.settings.withdrawTerms = termsList;
    await DB.save(db);
    await DB.adminSaveSettings({ withdrawTerms: termsList });
    return { success: true, message: 'Ketentuan dan syarat penarikan dana (WD) berhasil disimpan!' };
  },

  // Save APK Download Settings
  async saveApkSettings(apkConfig) {
    const db = DB.get();
    db.settings.apkDownload = {
      ...(db.settings.apkDownload || {}),
      ...apkConfig
    };
    await DB.save(db);
    await DB.adminSaveSettings({ apkDownload: db.settings.apkDownload });
    return { success: true, message: 'Pengaturan link unduhan APK Android berhasil disimpan!' };
  },

  // Admin Reset User Password
  async resetUserPassword(userId, newPassword) {
    return await DB.adminResetUserPassword(userId, newPassword);
  },

  // Get full member profile for admin support modal
  getUserFullProfile(userId) {
    const db = DB.get();
    const user = db.users.find(u => u.id === userId);
    if (!user) return null;

    const txs = (db.transactions || [])
      .filter(t => t.userId === userId || t.username === user.username)
      .sort((a, b) => {
        const tA = new Date(a.createdAt || a.date || 0).getTime();
        const tB = new Date(b.createdAt || b.date || 0).getTime();
        return tB - tA;
      });
    const investments = db.investments.filter(i => i.userId === userId);
    const downlines = Affiliate.getDownlines(user.referralCode || '');

    return {
      user,
      transactions: txs,
      investments,
      downlines,
      passwordResetRequest: user.passwordResetRequest || null
    };
  },

  // Admin Toggle Block / Unblock User
  async toggleBlockUser(userId, reason = '') {
    return await DB.toggleBlockUser(userId, reason);
  },

  // Admin Login As User (Impersonation Mode)
  async loginAsUser(userId) {
    try {
      if (typeof fetch !== 'function') return { success: false, message: 'Fetch tidak tersedia' };
      const url = DB.getApiUrl('admin_login_as_user');
      const res = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: DB.getAuthHeaders(),
        body: JSON.stringify({ userId })
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json || !json.success) {
        return { success: false, message: (json && json.message) || `Gagal login sebagai member (HTTP ${res.status})` };
      }
      return json;
    } catch (e) {
      return { success: false, message: e.message };
    }
  },

  // --------------------------------------------------------------------------
  // EMAIL & OTP SETTINGS (ADMIN CONFIGURATION)
  // --------------------------------------------------------------------------
  getEmailSettings() {
    const db = DB.get();
    return db.settings.email || {
      verificationRequired: false,
      adminNotificationOnRegister: true,
      adminNotificationEmail: 'admin@autotrading.my.id',
      welcomeEmailEnabled: true,
      mailMethod: 'smtp',
      smtp: {
        host: 'mail.autotrading.my.id',
        port: 465,
        secure: 'ssl',
        user: 'admin@autotrading.my.id',
        pass: '',
        fromName: 'AUTOTRADING Official',
        fromEmail: 'admin@autotrading.my.id'
      }
    };
  },

  async saveEmailSettings(emailConfig) {
    const db = DB.get();
    const emailMerged = {
      ...(db.settings.email || {}),
      ...emailConfig
    };
    db.settings.email = emailMerged;
    const res = await DB.adminSaveSettings({ email: emailMerged });
    if (res && res.success) {
      return { success: true, message: 'Konfigurasi Email & Sistem OTP Pendaftaran berhasil disimpan ke database cPanel!' };
    }
    await DB.save(db);
    return { success: true, message: 'Konfigurasi Email disimpan (local fallback).' };
  },

  // Authoritative Web Settings Save (Deep-merge in MySQL settings table)
  async saveWebSettings(settingsPayload) {
    return await DB.adminSaveSettings(settingsPayload);
  },

  async sendTestEmail(targetEmail, currentSettings = null) {
    const payload = { targetEmail };
    if (currentSettings) payload.currentSettings = currentSettings;
    return await DB.dispatchMailApi('test', payload);
  },

  async manuallyVerifyUser(userId) {
    return await DB.adminVerifyUserEmail(userId);
  },

  getAnnouncementSpeed() {
    return DB.getAnnouncementSpeed();
  },

  async saveAnnouncementSpeed(seconds) {
    return await DB.setAnnouncementSpeed(seconds);
  }
};

