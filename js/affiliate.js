/**
 * AUTOTRADING - AFFILIATE, SPONSOR BONUS, RABAT & LEVEL ENGINE
 * Manages Multi-tier referral calculations, sponsor bonus, matching ROI (rabat),
 * turnover milestones, and downline hierarchy.
 */

import { DB } from './db.js';

// Helper: Mask username with xxx on trailing letters for privacy & security
export function maskAffiliateUsername(username) {
  if (!username || typeof username !== 'string') return '-';
  const clean = username.trim();
  if (!clean || clean === '-') return '-';
  if (clean.toLowerCase().endsWith('xxx')) return clean;
  if (clean.length <= 2) return clean.charAt(0) + 'xxx';
  if (clean.length === 3) return clean.slice(0, 2) + 'xxx';
  return clean.slice(0, 3) + 'xxx';
}

// Helper: Mask full name with xxx on trailing letters for each name component
export function maskAffiliateFullName(fullName) {
  if (!fullName || typeof fullName !== 'string') return '-';
  const clean = fullName.trim();
  if (!clean || clean === '-') return '-';
  const words = clean.split(/\s+/);
  return words.map(w => {
    if (!w) return '';
    const match = w.match(/^([^.,!?;:]+)([.,!?;:]*)$/);
    const text = match ? match[1] : w;
    const punct = match ? match[2] : '';
    if (text.toLowerCase().endsWith('xxx')) return w;
    if (text.length <= 1) return w;
    let masked = '';
    if (text.length <= 2) masked = text.charAt(0) + 'xxx';
    else if (text.length === 3) masked = text.slice(0, 2) + 'xxx';
    else masked = text.slice(0, 3) + 'xxx';
    return masked + punct;
  }).join(' ');
}

export const Affiliate = {
  maskUsername: maskAffiliateUsername,
  maskFullName: maskAffiliateFullName,

  // Apply Direct Sponsor Bonus to db in-memory (Atomic)
  applySponsorBonus(db, buyerUser, amount) {
    if (!buyerUser || !buyerUser.referredBy || !amount || amount <= 0) return 0;

    const upline = db.users.find(u => u.referralCode && u.referralCode.toUpperCase() === buyerUser.referredBy.toUpperCase());
    // Security: Prevent self-bonus exploit
    if (!upline || upline.id === buyerUser.id) return 0;

    const percent = (db.settings && db.settings.sponsorBonusPercent) || 10;
    const bonusAmount = Math.floor((amount * percent) / 100);

    if (bonusAmount > 0) {
      // Transfer directly to Upline's Saldo Utama (walletBalance) & sync affiliateBalance
      upline.walletBalance = (upline.walletBalance || 0) + bonusAmount;
      upline.affiliateBalance = (upline.affiliateBalance || 0) + bonusAmount;
      upline.points = (upline.points || 0) + 10; // Extra bonus points

      // Record transaction
      db.transactions = db.transactions || [];
      db.transactions.unshift({
        id: 'TRX-SPS-' + Math.floor(100000 + Math.random() * 900000),
        userId: upline.id,
        username: upline.username,
        type: 'sponsor_bonus',
        amount: bonusAmount,
        note: `Bonus Sponsor ${percent}% dari investasi ${buyerUser.username} (${DB.formatIDR(amount)}) ditransfer ke Saldo Utama`,
        status: 'approved',
        createdAt: new Date().toISOString()
      });
      return bonusAmount;
    }
    return 0;
  },

  // Distribute Direct Sponsor Bonus (Standalone with save)
  async distributeSponsorBonus(buyerUser, amount) {
    const db = DB.get();
    const distributed = this.applySponsorBonus(db, buyerUser, amount);
    if (distributed > 0) {
      await DB.save(db);
    }
  },

  // Apply Rabat (Matching ROI) to uplines L1 - L5 in-memory (Atomic)
  applyRabatBonus(db, downlineUser, claimedProfitAmount) {
    if (!downlineUser || !downlineUser.referredBy || claimedProfitAmount <= 0) return 0;

    const rabatLevels = (db.settings && db.settings.rabatLevels) || [
      { level: 1, percent: 5.0 },
      { level: 2, percent: 3.0 },
      { level: 3, percent: 1.5 },
      { level: 4, percent: 0.5 },
      { level: 5, percent: 0.2 }
    ];

    let currentRefCode = downlineUser.referredBy;
    let currentLevel = 1;
    const seenUplines = new Set([downlineUser.id]); // Security: Prevent circular loop exploit
    let totalDistributed = 0;

    db.transactions = db.transactions || [];

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
          totalDistributed += rabatAmount;
        }
      }

      currentRefCode = upline.referredBy;
      currentLevel++;
    }

    return totalDistributed;
  },

  // Distribute Rabat (Matching ROI) to uplines L1 - L5 (Standalone with save)
  async distributeRabatBonus(downlineUser, claimedProfitAmount) {
    const db = DB.get();
    const distributed = this.applyRabatBonus(db, downlineUser, claimedProfitAmount);
    if (distributed > 0) {
      await DB.save(db);
    }
  },

  // Calculate Leader Milestone Rank based on total team turnover
  getLeaderRank(totalTurnover = 0) {
    const db = DB.get();
    const turnover = Math.max(0, Number(totalTurnover) || 0);
    const milestones = (db.settings && db.settings.levelTurnoverMilestones) || [
      { name: 'Bronze Leader', minTurnover: 25000000, reward: 1500000, badge: '🥉' },
      { name: 'Silver Director', minTurnover: 100000000, reward: 5000000, badge: '🥈' },
      { name: 'Gold Ambassador', minTurnover: 500000000, reward: 25000000, badge: '🥇' },
      { name: 'Crown Diamond', minTurnover: 1500000000, reward: 75000000, badge: '💎' }
    ];

    let currentRank = 'Member Reguler';
    let badge = '👤';
    let reward = 0;
    let nextMilestone = milestones[0];
    let progressPct = 0;
    let nextTurnoverRequired = milestones[0].minTurnover;

    for (let i = 0; i < milestones.length; i++) {
      if (turnover >= milestones[i].minTurnover) {
        currentRank = milestones[i].name;
        badge = milestones[i].badge || '🎖️';
        reward = milestones[i].reward;
        nextMilestone = milestones[i + 1] || null;
      }
    }

    if (nextMilestone) {
      progressPct = Math.min(100, Math.floor((turnover / nextMilestone.minTurnover) * 100));
      nextTurnoverRequired = nextMilestone.minTurnover;
    } else {
      progressPct = 100;
      nextTurnoverRequired = turnover;
    }

    return {
      name: currentRank,
      currentRank: currentRank,
      badge: badge,
      reward: reward,
      nextRank: nextMilestone ? nextMilestone.name : 'Peringkat Tertinggi',
      nextMilestone: nextMilestone,
      progress: progressPct,
      progressPct: progressPct,
      turnoverNeeded: Math.max(0, nextTurnoverRequired - turnover),
      nextTurnoverRequired: nextTurnoverRequired
    };
  },

  // Get status of all leader milestones for user (Reached, Claimed, CanClaim, Progress)
  getLeaderMilestonesStatus(db, user, totalTeamTurnover = 0) {
    const milestones = (db.settings && db.settings.levelTurnoverMilestones) || [
      { name: 'Bronze Leader', minTurnover: 25000000, reward: 1500000, badge: '🥉' },
      { name: 'Silver Director', minTurnover: 100000000, reward: 5000000, badge: '🥈' },
      { name: 'Gold Ambassador', minTurnover: 500000000, reward: 25000000, badge: '🥇' },
      { name: 'Crown Diamond', minTurnover: 1500000000, reward: 75000000, badge: '💎' }
    ];

    const claimedList = (user && user.claimedLeaderMilestones) || [];
    const turnover = Math.max(0, Number(totalTeamTurnover) || 0);

    return milestones.map(m => {
      const isReached = turnover >= m.minTurnover;
      const isClaimed = claimedList.includes(m.name) ||
        (db.transactions || []).some(t => {
          return user && t.userId === user.id &&
            (t.type === 'sponsor_bonus' || t.type === 'leader_bonus' || (t.id && (String(t.id).startsWith('TRX-SPS-') || String(t.id).startsWith('TRX-LDR-')))) &&
            t.note && (t.note.includes(m.name) || t.note.includes(`(${m.name})`));
        });
      const canClaim = isReached && !isClaimed;
      const progressPct = m.minTurnover > 0 ? Math.min(100, Math.floor((turnover / m.minTurnover) * 100)) : 100;
      const turnoverNeeded = Math.max(0, m.minTurnover - turnover);

      return {
        ...m,
        isReached,
        isClaimed,
        canClaim,
        progressPct,
        turnoverNeeded
      };
    });
  },

  // Manual Claim Leader Milestone: transferred directly to Saldo Utama (walletBalance)
  // and recorded as sponsor_bonus in system transactions per user instructions
  async claimLeaderMilestone(userId, milestoneName) {
    const db = DB.get();
    const user = (db.users || []).find(u => u.id === userId);
    if (!user) return { success: false, message: 'User tidak ditemukan' };

    const downlines = this.getDownlines(user.referralCode);
    const turnover = downlines.totalTeamTurnover || 0;

    const milestones = (db.settings && db.settings.levelTurnoverMilestones) || [
      { name: 'Bronze Leader', minTurnover: 25000000, reward: 1500000, badge: '🥉' },
      { name: 'Silver Director', minTurnover: 100000000, reward: 5000000, badge: '🥈' },
      { name: 'Gold Ambassador', minTurnover: 500000000, reward: 25000000, badge: '🥇' },
      { name: 'Crown Diamond', minTurnover: 1500000000, reward: 75000000, badge: '💎' }
    ];

    const m = milestones.find(item => item.name === milestoneName);
    if (!m) return { success: false, message: `Peringkat target ${milestoneName} tidak ditemukan!` };

    if (turnover < m.minTurnover) {
      return {
        success: false,
        message: `Target omset ${m.name} belum tercapai! Dibutuhkan ${DB.formatIDR(m.minTurnover)}, saat ini ${DB.formatIDR(turnover)}.`
      };
    }

    user.claimedLeaderMilestones = user.claimedLeaderMilestones || [];
    const alreadyClaimed = user.claimedLeaderMilestones.includes(m.name) ||
      (db.transactions || []).some(t => {
        return t.userId === user.id &&
          (t.type === 'sponsor_bonus' || t.type === 'leader_bonus' || (t.id && (String(t.id).startsWith('TRX-SPS-') || String(t.id).startsWith('TRX-LDR-')))) &&
          t.note && (t.note.includes(m.name) || t.note.includes(`(${m.name})`));
      });

    if (alreadyClaimed) {
      return { success: false, message: `Bonus target ${m.name} sudah pernah Anda klaim sebelumnya!` };
    }

    // 1. Masuk otomatis ke Saldo Utama (walletBalance)
    user.walletBalance = (user.walletBalance || 0) + m.reward;
    user.claimedLeaderMilestones.push(m.name);

    // 2. Riwayat transaksi masuk ke bonus sponsor disistemnya (type: sponsor_bonus, TRX-SPS-)
    db.transactions = db.transactions || [];
    const txId = 'TRX-SPS-' + Math.floor(100000 + Math.random() * 900000);
    const tx = {
      id: txId,
      userId: user.id,
      username: user.username,
      type: 'sponsor_bonus',
      amount: m.reward,
      note: `Klaim Bonus Target Kepemimpinan Tim (${m.name}) ditransfer ke Saldo Utama (Omset Tim: ${DB.formatIDR(turnover)})`,
      status: 'approved',
      createdAt: new Date().toISOString()
    };
    db.transactions.unshift(tx);

    await DB.save(db);

    return {
      success: true,
      message: `Selamat! Bonus Target Kepemimpinan [${m.name}] sebesar ${DB.formatIDR(m.reward)} berhasil diklaim dan masuk ke Saldo Utama Anda!`,
      amount: m.reward,
      milestone: m,
      txId
    };
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
      totalBonusAllLevels: 0,
      leaderRank: null
    };

    if (!userReferralCode) {
      result.leaderRank = this.getLeaderRank(0);
      return result;
    }

    const uplineUser = db.users.find(u => u.referralCode && u.referralCode.toUpperCase() === userReferralCode.toUpperCase());
    const uplineId = uplineUser ? uplineUser.id : null;

    // Helper to enrich user with active plans and personal turnover
    const enrichMember = (u, lvl, uplineName) => {
      const activeInvs = (db.investments || []).filter(inv => inv.userId === u.id && inv.status === 'active');
      const totalCapital = activeInvs.reduce((sum, inv) => sum + (inv.capital || 0), 0);
      const maskedUser = maskAffiliateUsername(u.username);
      const maskedName = maskAffiliateFullName(u.fullName);
      const maskedUp = uplineName && uplineName !== '-' ? maskAffiliateUsername(uplineName) : '-';
      return {
        ...u,
        level: lvl,
        levelStr: `Level ${lvl}`,
        uplineUsername: uplineName || '-',
        maskedUsername: maskedUser,
        maskedFullName: maskedName,
        maskedUplineUsername: maskedUp,
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
    result.leaderRank = this.getLeaderRank(result.totalTeamTurnover);

    // Get milestone targets claim status (Claimed, Can Claim, Locked)
    result.milestonesStatus = this.getLeaderMilestonesStatus(db, uplineUser, result.totalTeamTurnover);

    // Calculate Bonus Recap per level for this upline user
    if (uplineId) {
      const uplineTxs = (db.transactions || []).filter(t => t.userId === uplineId);

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
  async transferToMainBalance(userId, amount) {
    const db = DB.get();
    const user = db.users.find(u => u.id === userId);
    if (!user) return { success: false, message: 'User tidak ditemukan' };

    const parsedAmount = Math.floor(Number(amount));
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return { success: false, message: 'Jumlah transfer tidak valid!' };
    }

    if ((user.affiliateBalance || 0) < parsedAmount) {
      return { success: false, message: 'Saldo Wallet Tambah Teman tidak mencukupi!' };
    }

    user.affiliateBalance = (user.affiliateBalance || 0) - parsedAmount;
    user.walletBalance = (user.walletBalance || 0) + parsedAmount;

    db.transactions = db.transactions || [];
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

    await DB.save(db);
    return {
      success: true,
      message: `Sukses mentransfer ${DB.formatIDR(parsedAmount)} ke Wallet Balance!`
    };
  },

  // Lookup member details by username or referral code (for P2P transfer verification)
  lookupMember(targetIdentifier, excludeUserId = null) {
    const db = DB.get();
    const cleanTarget = (targetIdentifier || '').trim().toLowerCase();
    if (!cleanTarget) return null;

    const found = (db.users || []).find(u => 
      (u.username && u.username.toLowerCase() === cleanTarget) ||
      (u.referralCode && u.referralCode.toLowerCase() === cleanTarget)
    );

    if (!found) return null;
    if (excludeUserId && found.id === excludeUserId) {
      return { isSelf: true, username: found.username, fullName: found.fullName || found.username };
    }

    return {
      id: found.id,
      username: found.username,
      fullName: found.fullName || found.username,
      referralCode: found.referralCode || ''
    };
  },

  // Member-to-Member (P2P) Wallet Transfer
  async transferToMember(senderUserId, targetIdentifier, amount) {
    const db = DB.get();
    const sender = db.users.find(u => u.id === senderUserId);
    if (!sender) return { success: false, message: 'Akun pengirim tidak ditemukan!' };

    const parsedAmount = Math.floor(Number(amount));
    if (isNaN(parsedAmount) || parsedAmount < 10000) {
      return { success: false, message: 'Minimal transfer antar member adalah Rp 10.000!' };
    }

    if ((sender.walletBalance || 0) < parsedAmount) {
      return { success: false, message: `Saldo Wallet Utama tidak mencukupi! Saldo Anda: ${DB.formatIDR(sender.walletBalance || 0)}` };
    }

    const cleanTarget = (targetIdentifier || '').trim().toLowerCase();
    if (!cleanTarget) {
      return { success: false, message: 'Masukkan username atau kode referral member tujuan!' };
    }

    const recipient = db.users.find(u => 
      (u.username && u.username.toLowerCase() === cleanTarget) ||
      (u.referralCode && u.referralCode.toLowerCase() === cleanTarget)
    );

    if (!recipient) {
      return { success: false, message: `Member tujuan "${targetIdentifier}" tidak ditemukan!` };
    }

    if (recipient.id === sender.id) {
      return { success: false, message: 'Anda tidak dapat mentransfer saldo ke akun Anda sendiri!' };
    }

    // Deduct sender & credit recipient
    sender.walletBalance = (sender.walletBalance || 0) - parsedAmount;
    recipient.walletBalance = (recipient.walletBalance || 0) + parsedAmount;

    const trxIdOut = 'TRX-TRFO-' + Math.floor(100000 + Math.random() * 900000);
    const trxIdIn = 'TRX-TRFI-' + Math.floor(100000 + Math.random() * 900000);
    const nowIso = new Date().toISOString();

    db.transactions = db.transactions || [];

    // Transaction for sender (debit)
    db.transactions.unshift({
      id: trxIdOut,
      userId: sender.id,
      username: sender.username,
      type: 'member_transfer_out',
      amount: parsedAmount,
      destinationAccount: recipient.username,
      note: `Transfer saldo ke member ${recipient.username} (${recipient.fullName || recipient.username})`,
      status: 'approved',
      createdAt: nowIso
    });

    // Transaction for recipient (credit)
    db.transactions.unshift({
      id: trxIdIn,
      userId: recipient.id,
      username: recipient.username,
      type: 'member_transfer',
      amount: parsedAmount,
      destinationAccount: sender.username,
      note: `Terima transfer saldo dari member ${sender.username}`,
      status: 'approved',
      createdAt: nowIso
    });

    await DB.save(db);
    return {
      success: true,
      message: `Sukses transfer ${DB.formatIDR(parsedAmount)} ke member ${recipient.username}!`,
      recipient: recipient.username
    };
  }
};
