/**
 * FGT PRO - REWARDS & POINT REDEMPTION ENGINE
 * Manages reward catalog querying, user point redemptions, stock deduction, and status tracking.
 */

import { DB } from './db.js';

export const Rewards = {
  // Get all active rewards for frontend display
  getActiveRewards() {
    return DB.getActiveRewards();
  },

  // Get all rewards for admin
  getAllRewards() {
    return DB.getRewards();
  },

  // Get single reward by ID
  getRewardById(rewardId) {
    const rewards = DB.getRewards();
    return rewards.find(r => r.id === rewardId) || null;
  },

  // Redeem a reward for a user using their accumulated points
  redeemReward(userId, rewardId, { targetContact, deliveryAddress, note = '' }) {
    const db = DB.get();
    
    // 1. Validate User
    const user = db.users.find(u => u.id === userId);
    if (!user) {
      return { success: false, message: 'Akun pengguna tidak ditemukan! Silakan login kembali.' };
    }

    // 2. Validate Reward
    const reward = (db.rewards || []).find(r => r.id === rewardId);
    if (!reward || !reward.active) {
      return { success: false, message: 'Hadiah ini sudah tidak tersedia atau nonaktif.' };
    }

    if (reward.stock <= 0) {
      return { success: false, message: 'Maaf, persediaan stok hadiah ini sudah habis!' };
    }

    // 3. Validate Points Sufficiency
    const userPoints = Number(user.points || 0);
    const pointsCost = Number(reward.pointsCost || 0);

    if (userPoints < pointsCost) {
      const diff = pointsCost - userPoints;
      return {
        success: false,
        message: `Poin Anda tidak mencukupi. Anda memiliki ${userPoints} poin, butuh ${pointsCost} poin (kurang ${diff} poin lagi).`
      };
    }

    // 4. Validate Target Contact (Phone / E-Wallet / Bank Account)
    if (!targetContact || !targetContact.trim()) {
      return {
        success: false,
        message: 'Harap masukkan nomor WhatsApp / Akun E-Wallet / Nomor Rekening tujuan penukaran!'
      };
    }

    // 5. Deduct Points & Stock
    user.points = userPoints - pointsCost;
    reward.stock = Math.max(0, reward.stock - 1);

    // 6. Record Redemption Log
    db.redemptions = db.redemptions || [];
    const newRedemption = {
      id: 'RDM-' + Math.floor(1000 + Math.random() * 9000),
      userId: user.id,
      username: user.username,
      rewardId: reward.id,
      rewardTitle: reward.title,
      pointsSpent: pointsCost,
      targetContact: targetContact.trim(),
      deliveryAddress: (deliveryAddress || '').trim(),
      note: (note || '').trim(),
      status: 'pending',
      adminNote: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.redemptions.unshift(newRedemption);

    // Save DB
    DB.save(db);

    return {
      success: true,
      message: `Selamat! Penukaran "${reward.title}" berhasil diproses. Poin Anda terpotong ${pointsCost} poin (Sisa: ${user.points} poin). Admin akan segera memverifikasi dan mengirimkan hadiah Anda!`,
      redemption: newRedemption,
      remainingPoints: user.points
    };
  },

  // Get redemption history for a specific user
  getUserRedemptions(userId) {
    const redemptions = DB.getRedemptions();
    return redemptions.filter(r => r.userId === userId);
  }
};
