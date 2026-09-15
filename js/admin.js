/**
 * FGT PRO - ADMIN CONTROL PANEL ENGINE
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
    
    const totalUsers = db.users.length;
    
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
      .filter(t => t.type === 'withdraw' && t.status === 'pending').length;

    return {
      totalUsers,
      totalDeposits,
      totalWithdrawals,
      activeCapital,
      totalProfitPaid,
      pendingDepositsCount,
      pendingWithdrawalsCount
    };
  },

  // Approve Deposit Request
  approveDeposit(transactionId) {
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
    user.walletBalance += trx.amount;
    trx.status = 'approved';
    trx.updatedAt = new Date().toISOString();

    DB.save(db);

    return {
      success: true,
      message: `Deposit ${DB.formatIDR(trx.amount)} untuk ${user.username} berhasil disetujui!`
    };
  },

  // Reject Deposit Request
  rejectDeposit(transactionId, reason = 'Bukti transfer tidak valid') {
    const db = DB.get();
    const trx = db.transactions.find(t => t.id === transactionId);
    if (!trx || trx.status !== 'pending') {
      return { success: false, message: 'Transaksi tidak valid atau sudah diproses!' };
    }

    trx.status = 'rejected';
    trx.rejectReason = reason;
    trx.updatedAt = new Date().toISOString();

    DB.save(db);
    return { success: true, message: `Deposit ${trx.id} berhasil ditolak.` };
  },

  // Approve Withdrawal Request
  approveWithdrawal(transactionId) {
    const db = DB.get();
    const trx = db.transactions.find(t => t.id === transactionId);
    if (!trx || trx.status !== 'pending') {
      return { success: false, message: 'Transaksi tidak valid atau sudah diproses!' };
    }

    trx.status = 'approved';
    trx.updatedAt = new Date().toISOString();

    DB.save(db);
    return {
      success: true,
      message: `Penarikan ${DB.formatIDR(trx.amount)} ke ${trx.destinationAccount} berhasil disetujui!`
    };
  },

  // Reject Withdrawal Request (Refunds user balance)
  rejectWithdrawal(transactionId, reason = 'Data rekening tidak sesuai') {
    const db = DB.get();
    const trx = db.transactions.find(t => t.id === transactionId);
    if (!trx || trx.status !== 'pending') {
      return { success: false, message: 'Transaksi tidak valid atau sudah diproses!' };
    }

    const user = db.users.find(u => u.id === trx.userId);
    if (user) {
      // Refund balance to appropriate wallet
      if (trx.walletSource === 'Wallet Tambah Teman') {
        user.affiliateBalance += trx.amount;
      } else {
        user.walletBalance += trx.amount;
      }
    }

    trx.status = 'rejected';
    trx.rejectReason = reason;
    trx.updatedAt = new Date().toISOString();

    DB.save(db);
    return { success: true, message: `Penarikan ${trx.id} ditolak dan saldo telah dikembalikan ke user.` };
  },

  // Save / Update Plan
  savePlan(planData) {
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

    DB.save(db);
    return { success: true, message: 'Paket investasi berhasil disimpan!' };
  },

  // Delete Plan
  deletePlan(planId) {
    const db = DB.get();
    db.plans = db.plans.filter(p => p.id !== planId);
    DB.save(db);
    return { success: true, message: 'Paket investasi berhasil dihapus.' };
  },

  // Update Settings (Affiliate, Rates, Payment Details)
  updateSettings(newSettings) {
    const db = DB.get();
    db.settings = { ...db.settings, ...newSettings };
    DB.save(db);
    return { success: true, message: 'Pengaturan sistem berhasil diperbarui!' };
  },

  // Adjust User Balance directly
  adjustUserBalance(userId, { walletBalance, affiliateBalance, points }) {
    const db = DB.get();
    const user = db.users.find(u => u.id === userId);
    if (!user) return { success: false, message: 'User tidak ditemukan' };

    if (walletBalance !== undefined) user.walletBalance = Number(walletBalance);
    if (affiliateBalance !== undefined) user.affiliateBalance = Number(affiliateBalance);
    if (points !== undefined) user.points = Number(points);

    DB.save(db);
    return { success: true, message: `Saldo pengguna ${user.username} berhasil diubah!` };
  },

  // Trigger Daily Profit Yield manually from Admin
  triggerProfitYield() {
    return Plans.yieldDailyProfits();
  }
};
