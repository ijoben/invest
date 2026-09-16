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

    const pendingRedemptionsCount = (db.redemptions || [])
      .filter(r => r.status === 'pending').length;

    const totalRewardsCount = (db.rewards || []).length;

    return {
      totalUsers,
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

  // Process / Approve Redemption (Set to processing)
  approveRedemption(redemptionId, adminNote = 'Hadiah sedang diproses / dikirim') {
    const db = DB.get();
    const rdm = (db.redemptions || []).find(r => r.id === redemptionId);
    if (!rdm) return { success: false, message: 'Data penukaran tidak ditemukan!' };

    rdm.status = 'processing';
    rdm.adminNote = adminNote;
    rdm.updatedAt = new Date().toISOString();

    DB.save(db);
    return { success: true, message: `Penukaran ${rdm.id} (${rdm.rewardTitle}) berhasil disetujui dan sedang diproses!` };
  },

  // Complete Redemption (Set to completed / delivered)
  completeRedemption(redemptionId, adminNote = 'Hadiah telah berhasil dikirim / ditransfer ke pengguna') {
    const db = DB.get();
    const rdm = (db.redemptions || []).find(r => r.id === redemptionId);
    if (!rdm) return { success: false, message: 'Data penukaran tidak ditemukan!' };

    rdm.status = 'completed';
    rdm.adminNote = adminNote;
    rdm.updatedAt = new Date().toISOString();

    DB.save(db);
    return { success: true, message: `Penukaran ${rdm.id} telah diselesaikan!` };
  },

  // Reject Redemption (Refunds user points & restocks reward)
  rejectRedemption(redemptionId, reason = 'Data kontak atau alamat tidak valid') {
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

    DB.save(db);
    return {
      success: true,
      message: `Penukaran ${rdm.id} ditolak. Poin ${rdm.pointsSpent} telah dikembalikan secara otomatis ke pengguna ${rdm.username}.`
    };
  },

  // Trigger Daily Profit Yield manually from Admin
  triggerProfitYield() {
    return Plans.yieldDailyProfits();
  }
};
