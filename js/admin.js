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
    const activeInvUsers = new Set((db.investments || []).filter(i => i.status === 'active').map(i => i.userId));
    const activeUsers = activeInvUsers.size > 0 ? activeInvUsers.size : nonAdminUsers.filter(u => !u.isBlocked && u.status !== 'blocked').length;
    
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

  // Approve Deposit Request
  async approveDeposit(transactionId) {
    const db = DB.get();
    const trx = db.transactions.find(t => t.id === transactionId);
    if (!trx || trx.status !== 'pending') {
      return { success: false, message: 'Transaksi tidak valid atau sudah diproses!' };
    }

    const user = db.users.find(u => u.id === trx.userId);
    if (!user) {
      return { success: false, message: 'User tidak ditemukan!' };
    }

    // Credit user's wallet balance
    user.walletBalance = (user.walletBalance || 0) + trx.amount;

    // Credit loyalty points reward for successful deposit (Requirement 8)
    const pointsReward = Number(db.settings && db.settings.depositPointsReward !== undefined ? db.settings.depositPointsReward : 5);
    if (pointsReward > 0) {
      user.points = (user.points || 0) + pointsReward;
      trx.pointsAwarded = pointsReward;
    }

    trx.status = 'approved';
    trx.updatedAt = new Date().toISOString();

    await DB.save(db);

    return {
      success: true,
      message: `Deposit ${DB.formatIDR(trx.amount)} untuk ${user.username} berhasil disetujui!${pointsReward > 0 ? ` (+${pointsReward} Poin ditambahkan)` : ''}`
    };
  },

  // Reject Deposit Request
  async rejectDeposit(transactionId, reason = 'Bukti transfer tidak valid') {
    const db = DB.get();
    const trx = db.transactions.find(t => t.id === transactionId);
    if (!trx || trx.status !== 'pending') {
      return { success: false, message: 'Transaksi tidak valid atau sudah diproses!' };
    }

    trx.status = 'rejected';
    trx.rejectReason = reason;
    trx.updatedAt = new Date().toISOString();

    await DB.save(db);
    return { success: true, message: `Deposit ${trx.id} berhasil ditolak.` };
  },

  // Approve Withdrawal / PPOB Request
  async approveWithdrawal(transactionId) {
    const db = DB.get();
    const trx = db.transactions.find(t => t.id === transactionId);
    if (!trx || trx.status !== 'pending') {
      return { success: false, message: 'Transaksi tidak valid atau sudah diproses!' };
    }

    trx.status = 'approved';
    trx.updatedAt = new Date().toISOString();

    await DB.save(db);
    if (trx.type === 'ppob_conversion') {
      const typeLabel = trx.category === 'pln' ? 'Token Listrik PLN' : 'Pulsa Seluler';
      return {
        success: true,
        message: `Konversi PPOB ${typeLabel} ${DB.formatIDR(trx.amount)} ke ${trx.targetNumber || '-'} berhasil disetujui!`
      };
    }
    return {
      success: true,
      message: `Penarikan ${DB.formatIDR(trx.amount)} ke ${trx.destinationAccount} berhasil disetujui!`
    };
  },

  // Reject Withdrawal / PPOB Request (Refunds user balance)
  async rejectWithdrawal(transactionId, reason = 'Data rekening / nomor tujuan tidak sesuai') {
    const db = DB.get();
    const trx = db.transactions.find(t => t.id === transactionId);
    if (!trx || trx.status !== 'pending') {
      return { success: false, message: 'Transaksi tidak valid atau sudah diproses!' };
    }

    const user = db.users.find(u => u.id === trx.userId);
    if (user) {
      // Refund balance to appropriate wallet
      if (trx.walletSource === 'Wallet Tambah Teman' || trx.source === 'affiliate') {
        user.affiliateBalance = (user.affiliateBalance || 0) + trx.amount;
      } else {
        user.walletBalance = (user.walletBalance || 0) + trx.amount;
      }
    }

    trx.status = 'rejected';
    trx.rejectReason = reason;
    trx.updatedAt = new Date().toISOString();

    await DB.save(db);
    return { success: true, message: `Transaksi ${trx.type === 'ppob_conversion' ? 'konversi PPOB' : 'penarikan'} ${trx.id} ditolak dan saldo telah dikembalikan ke user.` };
  },

  // Save / Update Plan
  async savePlan(planData) {
    const db = DB.get();
    const existingIdx = db.plans.findIndex(p => p.id === planData.id);

    if (existingIdx !== -1) {
      db.plans[existingIdx] = { ...db.plans[existingIdx], ...planData };
    } else {
      db.plans.push({
        id: 'plan-' + Date.now(),
        theme: 'theme-learn',
        activeCount: 0,
        ...planData
      });
    }

    await DB.save(db);
    return { success: true, message: 'Paket investasi berhasil disimpan!' };
  },

  // Delete Plan
  async deletePlan(planId) {
    const db = DB.get();
    db.plans = db.plans.filter(p => p.id !== planId);
    await DB.save(db);
    return { success: true, message: 'Paket investasi berhasil dihapus.' };
  },

  // Update Settings (Affiliate, Rates, Payment Details)
  async updateSettings(newSettings) {
    const db = DB.get();
    db.settings = { ...db.settings, ...newSettings };
    await DB.save(db);
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
    return { success: true, message: 'Rekening bank berhasil disimpan!' };
  },

  async deleteBank(bankId) {
    const db = DB.get();
    if (!db.settings.paymentGateways || !db.settings.paymentGateways.banks) {
      return { success: false, message: 'Data bank tidak ditemukan!' };
    }
    db.settings.paymentGateways.banks = db.settings.paymentGateways.banks.filter(b => b.id !== bankId);
    await DB.save(db);
    return { success: true, message: 'Rekening bank berhasil dihapus.' };
  },

  async toggleBankStatus(bankId) {
    const db = DB.get();
    const banks = (db.settings.paymentGateways && db.settings.paymentGateways.banks) || [];
    const bank = banks.find(b => b.id === bankId);
    if (!bank) return { success: false, message: 'Rekening bank tidak ditemukan!' };

    bank.active = !bank.active;
    await DB.save(db);
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
    return { success: true, message: 'Pengaturan QRIS berhasil disimpan!' };
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

    const txs = db.transactions.filter(t => t.userId === userId || t.username === user.username);
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
      mailMethod: 'cpanel',
      smtp: {
        host: 'mail.autotrading.my.id',
        port: 465,
        secure: 'ssl',
        user: 'noreply@autotrading.my.id',
        pass: '',
        fromName: 'AUTOTRADING Official',
        fromEmail: 'noreply@autotrading.my.id'
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

  async sendTestEmail(targetEmail) {
    return await DB.dispatchMailApi('test', { targetEmail });
  },

  async manuallyVerifyUser(userId) {
    return await DB.adminVerifyUserEmail(userId);
  }
};

