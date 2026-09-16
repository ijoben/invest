/**
 * FGT PRO - AFFILIATE, SPONSOR BONUS, RABAT & LEVEL ENGINE
 * Manages Multi-tier referral calculations, sponsor bonus, matching ROI (rabat),
 * turnover milestones, and downline hierarchy.
 */

import { DB } from './db.js';

export const Affiliate = {
  // Distribute Direct Sponsor Bonus
  distributeSponsorBonus(buyerUser, amount) {
    if (!buyerUser || !buyerUser.referredBy) return;

    const db = DB.get();
    const upline = db.users.find(u => u.referralCode && u.referralCode.toUpperCase() === buyerUser.referredBy.toUpperCase());
    if (!upline) return;

    const percent = db.settings.sponsorBonusPercent || 10;
    const bonusAmount = Math.floor((amount * percent) / 100);

    if (bonusAmount > 0) {
      // Credit to Upline's "Wallet Tambah Teman" (affiliateBalance)
      upline.affiliateBalance = (upline.affiliateBalance || 0) + bonusAmount;
      upline.points = (upline.points || 0) + 10; // Extra bonus points

      // Record transaction
      db.transactions.unshift({
        id: 'TRX-SPS-' + Math.floor(100000 + Math.random() * 900000),
        userId: upline.id,
        username: upline.username,
        type: 'sponsor_bonus',
        amount: bonusAmount,
        note: `Bonus Sponsor ${percent}% dari investasi ${buyerUser.username} (${DB.formatIDR(amount)})`,
        status: 'approved',
        createdAt: new Date().toISOString()
      });

      DB.save(db);
    }
  },

  // Distribute Rabat (Matching ROI) to uplines L1 - L5
  distributeRabatBonus(downlineUser, claimedProfitAmount) {
    if (!downlineUser || !downlineUser.referredBy || claimedProfitAmount <= 0) return;

    const db = DB.get();
    const rabatLevels = db.settings.rabatLevels || [
      { level: 1, percent: 5.0 },
      { level: 2, percent: 3.0 },
      { level: 3, percent: 1.5 },
      { level: 4, percent: 0.5 },
      { level: 5, percent: 0.2 }
    ];

    let currentRefCode = downlineUser.referredBy;
    let currentLevel = 1;

    while (currentRefCode && currentLevel <= rabatLevels.length) {
      const upline = db.users.find(u => u.referralCode && u.referralCode.toUpperCase() === currentRefCode.toUpperCase());
      if (!upline) break;

      const levelConfig = rabatLevels.find(l => l.level === currentLevel);
      if (levelConfig && levelConfig.percent > 0) {
        const rabatAmount = Math.floor((claimedProfitAmount * levelConfig.percent) / 100);
        if (rabatAmount > 0) {
          upline.affiliateBalance = (upline.affiliateBalance || 0) + rabatAmount;

          db.transactions.unshift({
            id: 'TRX-RBT-' + Math.floor(100000 + Math.random() * 900000),
            userId: upline.id,
            username: upline.username,
            type: 'rabat_bonus',
            level: currentLevel,
            amount: rabatAmount,
            note: `Bonus Rabat Level ${currentLevel} (${levelConfig.percent}%) dari profit ${downlineUser.username} (${DB.formatIDR(claimedProfitAmount)})`,
            status: 'approved',
            createdAt: new Date().toISOString()
          });
        }
      }

      currentRefCode = upline.referredBy;
      currentLevel++;
    }

    DB.save(db);
  },

  // Get Downlines for a specific user categorized by levels
  getDownlines(userReferralCode) {
    const db = DB.get();
    const result = {
      level1: [],
      level2: [],
      level3: [],
      totalMembers: 0,
      totalTeamTurnover: 0
    };

    if (!userReferralCode) return result;

    // Level 1 (Direct)
    result.level1 = db.users.filter(u => u.referredBy === userReferralCode);

    // Level 2
    result.level1.forEach(l1 => {
      const l2List = db.users.filter(u => u.referredBy === l1.referralCode);
      result.level2.push(...l2List);
    });

    // Level 3
    result.level2.forEach(l2 => {
      const l3List = db.users.filter(u => u.referredBy === l2.referralCode);
      result.level3.push(...l3List);
    });

    result.totalMembers = result.level1.length + result.level2.length + result.level3.length;

    // Calculate team turnover from active investments of all downlines
    const allDownlineUserIds = [
      ...result.level1.map(u => u.id),
      ...result.level2.map(u => u.id),
      ...result.level3.map(u => u.id)
    ];

    const teamInvestments = db.investments.filter(inv => allDownlineUserIds.includes(inv.userId));
    result.totalTeamTurnover = teamInvestments.reduce((sum, inv) => sum + (inv.capital || 0), 0);

    return result;
  },

  // Transfer Affiliate Balance ("Wallet Tambah Teman") to Main Wallet Balance
  transferToMainBalance(userId, amount) {
    const db = DB.get();
    const user = db.users.find(u => u.id === userId);
    if (!user) return { success: false, message: 'User tidak ditemukan' };

    const parsedAmount = Number(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return { success: false, message: 'Jumlah transfer tidak valid!' };
    }

    if (user.affiliateBalance < parsedAmount) {
      return { success: false, message: 'Saldo Wallet Tambah Teman tidak mencukupi!' };
    }

    user.affiliateBalance -= parsedAmount;
    user.walletBalance += parsedAmount;

    db.transactions.unshift({
      id: 'TRX-TRF-' + Math.floor(100000 + Math.random() * 900000),
      userId: user.id,
      username: user.username,
      type: 'affiliate_transfer',
      amount: parsedAmount,
      note: 'Transfer dari Wallet Tambah Teman ke Wallet Balance',
      status: 'approved',
      createdAt: new Date().toISOString()
    });

    DB.save(db);
    return {
      success: true,
      message: `Sukses mentransfer ${DB.formatIDR(parsedAmount)} ke Wallet Balance!`
    };
  }
};
