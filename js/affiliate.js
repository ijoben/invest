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
    // Security: Prevent self-bonus exploit
    if (!upline || upline.id === buyerUser.id) return;

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
    const seenUplines = new Set([downlineUser.id]); // Security: Prevent circular loop exploit

    while (currentRefCode && currentLevel <= rabatLevels.length) {
      const upline = db.users.find(u => u.referralCode && u.referralCode.toUpperCase() === currentRefCode.toUpperCase());
      if (!upline || seenUplines.has(upline.id)) break;
      seenUplines.add(upline.id);

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
      totalTeamTurnover: 0,
      level1Turnover: 0,
      level2Turnover: 0,
      level3Turnover: 0,
      level1Bonus: 0,
      level2Bonus: 0,
      level3Bonus: 0,
      totalBonusAllLevels: 0
    };

    if (!userReferralCode) return result;

    const uplineUser = db.users.find(u => u.referralCode && u.referralCode.toUpperCase() === userReferralCode.toUpperCase());
    const uplineId = uplineUser ? uplineUser.id : null;

    // Helper to enrich user with active plans and personal turnover
    const enrichMember = (u, lvl, uplineName) => {
      const activeInvs = db.investments.filter(inv => inv.userId === u.id && inv.status === 'active');
      const totalCapital = activeInvs.reduce((sum, inv) => sum + (inv.capital || 0), 0);
      return {
        ...u,
        level: lvl,
        levelStr: `Level ${lvl}`,
        uplineUsername: uplineName || '-',
        activeInvsCount: activeInvs.length,
        personalTurnover: totalCapital,
        joinedDateStr: u.registeredAt ? new Date(u.registeredAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Member Aktif'
      };
    };

    // Level 1 (Direct)
    const rawL1 = db.users.filter(u => u.referredBy && u.referredBy.toUpperCase() === userReferralCode.toUpperCase());
    result.level1 = rawL1.map(u => enrichMember(u, 1, uplineUser ? uplineUser.username : null));

    // Level 2
    rawL1.forEach(l1 => {
      const rawL2 = db.users.filter(u => u.referredBy && u.referredBy.toUpperCase() === (l1.referralCode || '').toUpperCase());
      result.level2.push(...rawL2.map(u => enrichMember(u, 2, l1.username)));
    });

    // Level 3
    result.level2.forEach(l2 => {
      const rawL3 = db.users.filter(u => u.referredBy && u.referredBy.toUpperCase() === (l2.referralCode || '').toUpperCase());
      result.level3.push(...rawL3.map(u => enrichMember(u, 3, l2.username)));
    });

    result.totalMembers = result.level1.length + result.level2.length + result.level3.length;

    // Calculate Turnover per level
    result.level1Turnover = result.level1.reduce((sum, m) => sum + m.personalTurnover, 0);
    result.level2Turnover = result.level2.reduce((sum, m) => sum + m.personalTurnover, 0);
    result.level3Turnover = result.level3.reduce((sum, m) => sum + m.personalTurnover, 0);
    result.totalTeamTurnover = result.level1Turnover + result.level2Turnover + result.level3Turnover;

    // Calculate Bonus Recap per level for this upline user
    if (uplineId) {
      const uplineTxs = db.transactions.filter(t => t.userId === uplineId);

      uplineTxs.forEach(t => {
        if (t.type === 'sponsor_bonus') {
          result.level1Bonus += (t.amount || 0);
        } else if (t.type === 'rabat_bonus') {
          if (t.level === 2) {
            result.level2Bonus += (t.amount || 0);
          } else if (t.level === 3) {
            result.level3Bonus += (t.amount || 0);
          } else {
            // Level 1 rabat
            result.level1Bonus += (t.amount || 0);
          }
        }
      });

      result.totalBonusAllLevels = result.level1Bonus + result.level2Bonus + result.level3Bonus;
    }

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
