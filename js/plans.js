/**
 * FGT PRO - INVESTMENT PLANS & RANDOM DAILY PROFIT ENGINE
 * Calculates fluctuating daily profits within min-max ranges, handles plan activation,
 * and distributes profit claims.
 */

import { DB } from './db.js';
import { Affiliate } from './affiliate.js';

export const Plans = {
  // Get all active plans
  getAllPlans() {
    const db = DB.get();
    return db.plans;
  },

  // Get plan by ID
  getPlanById(planId) {
    const db = DB.get();
    return db.plans.find(p => p.id === planId) || null;
  },

  // Check if a given date (or today) is weekend (Saturday = 6, Sunday = 0)
  isWeekend(date) {
    const d = date ? new Date(date) : new Date();
    const day = d.getDay();
    return day === 0 || day === 6;
  },

  // Check universal market status (Master switch + Weekend schedule)
  isMarketOpen(date) {
    const db = DB.get();
    const masterClosed = db.settings && (db.settings.marketStatus === 'closed' || db.settings.marketOpen === false);
    const weekendStatus = this.isWeekendMarketClosed(date);

    if (masterClosed) {
      return {
        isOpen: false,
        closed: true,
        isWeekend: weekendStatus.isWeekend,
        reason: 'master_off',
        message: (db.settings && db.settings.marketOffMessage) || 'Pasar Keuangan Global & AI Trading sedang LIBUR (OFF). Semua instrumen, AI Bot, dan sinyal ditangguhkan.'
      };
    }

    if (weekendStatus.closed) {
      return {
        isOpen: false,
        closed: true,
        isWeekend: true,
        reason: 'weekend_closed',
        message: weekendStatus.message
      };
    }

    return {
      isOpen: true,
      closed: false,
      isWeekend: weekendStatus.isWeekend,
      reason: 'open',
      message: 'Pasar Keuangan Global & AI Trading Aktif (ON).'
    };
  },

  // Check if market/profit is currently closed due to weekend settings
  isWeekendMarketClosed(date) {
    const db = DB.get();
    const d = date ? new Date(date) : new Date();
    const day = d.getDay();
    const isWknd = (day === 0 || day === 6);

    let weekendEnabled = true;
    if (db.settings) {
      if (db.settings.weekendProfit && typeof db.settings.weekendProfit.enabled === 'boolean') {
        weekendEnabled = db.settings.weekendProfit.enabled;
      } else if (typeof db.settings.weekendProfitEnabled === 'boolean') {
        weekendEnabled = db.settings.weekendProfitEnabled;
      }
    }

    const closed = isWknd && !weekendEnabled;
    const dayName = day === 0 ? 'Minggu' : (day === 6 ? 'Sabtu' : 'Hari Kerja');
    const message = (db.settings && db.settings.weekendProfit && db.settings.weekendProfit.offMessage)
      || 'Pasar Keuangan & Trading Libur di Akhir Pekan (Sabtu & Minggu). Dividen profit akan kembali berjalan aktif hari Senin.';

    return {
      closed,
      isWeekend: isWknd,
      weekendEnabled,
      dayName,
      message
    };
  },

  // Synchronize user investments with real timestamps (handles completed cycles)
  syncUserInvestments(userId) {
    if (!userId) return [];
    const db = DB.get();
    let modified = false;
    const now = Date.now();
    const cycleDurationMs = (db.settings.profitCycleDurationHours || 24) * 3600 * 1000;

    const user = db.users.find(u => u.id === userId);
    if (!user) return [];

    db.investments = db.investments || [];
    const userInvs = db.investments.filter(inv => inv.userId === userId && inv.status === 'active');
    const marketStatus = this.isMarketOpen();

    userInvs.forEach(inv => {
      // 1. Check if investment duration has expired
      // Contract is completed, but capital remains locked until member clicks 'Proses refundkan ke saldo saya'
      if (inv.daysElapsed >= inv.durationDays) {
        inv.status = 'completed';
        inv.completedAt = inv.completedAt || new Date().toISOString();
        inv.refundReady = true;
        if (inv.capitalReturned === undefined) {
          inv.capitalReturned = false;
        }
        modified = true;
        return;
      }

      // 2. If market is closed (either weekend or admin toggle), skip generating new profit claim
      if (!marketStatus.isOpen) {
        return;
      }

      // 3. Check if a real 24-hour cycle has passed and no profit is pending claim
      const lastYieldTime = new Date(inv.lastProfitYieldDate || inv.startDate || now).getTime();
      const elapsedMs = now - lastYieldTime;

      if (elapsedMs >= cycleDurationMs && (!inv.pendingProfitClaim || inv.pendingProfitClaim <= 0)) {
        // Yield exactly 1 day profit for this completed cycle
        const rate = this.generateRandomDailyRate(inv.minRate, inv.maxRate);
        const profitAmount = Math.floor((inv.capital * rate) / 100);

        inv.pendingProfitClaim = profitAmount;
        inv.history = inv.history || [];
        inv.history.push({
          day: (inv.daysElapsed || 0) + 1,
          date: new Date().toLocaleDateString('id-ID'),
          rate: rate,
          amount: profitAmount,
          status: 'pending_claim'
        });
        modified = true;
      }
    });

    if (modified) {
      DB.save(db);
    }

    return db.investments.filter(inv => inv.userId === userId && inv.status === 'active');
  },

  // Get user active investments (auto-synced with real timestamps)
  getUserInvestments(userId) {
    if (!userId) return [];
    this.syncUserInvestments(userId);
    const db = DB.get();
    return (db.investments || []).filter(inv => inv.userId === userId && inv.status === 'active');
  },

  // Get all user investments including completed
  getAllUserInvestments(userId) {
    if (!userId) return [];
    this.syncUserInvestments(userId);
    const db = DB.get();
    return (db.investments || []).filter(inv => inv.userId === userId);
  },

  // Calculate today profit % for a specific user
  getUserTodayProfitRate(userId) {
    if (!userId) return 0;
    const userInvs = this.getUserInvestments(userId);
    if (!userInvs || userInvs.length === 0) return 0;

    const marketStatus = this.isWeekendMarketClosed();
    let totalCapital = 0;
    let totalWeightedRate = 0;
    const todayStr = new Date().toLocaleDateString('id-ID');

    userInvs.forEach(inv => {
      totalCapital += inv.capital;
      // Check if profit yielded today in history
      const todayHistory = inv.history && inv.history.find(h => h.date === todayStr);
      let rate = 0;
      if (todayHistory) {
        rate = todayHistory.rate;
      } else if (marketStatus.closed) {
        rate = 0; // Market is closed today
      } else {
        // Average active range or base daily rate
        rate = (inv.minRate + inv.maxRate) / 2;
      }
      totalWeightedRate += (rate * inv.capital);
    });

    if (totalCapital === 0) return 0;
    return parseFloat((totalWeightedRate / totalCapital).toFixed(2));
  },

  // Buy / Activate Plan
  invest({ userId, planId, amount }) {
    const db = DB.get();
    const user = db.users.find(u => u.id === userId);
    const plan = this.getPlanById(planId);

    if (!user) return { success: false, message: 'User tidak ditemukan!' };
    if (!plan) return { success: false, message: 'Plan tidak ditemukan!' };

    const parsedAmount = Number(amount);
    if (isNaN(parsedAmount) || parsedAmount < plan.minDeposit) {
      return { success: false, message: `Minimal deposit untuk ${plan.name} adalah ${DB.formatIDR(plan.minDeposit)}` };
    }

    if (plan.maxDeposit && parsedAmount > plan.maxDeposit) {
      return { success: false, message: `Maksimal deposit untuk ${plan.name} adalah ${DB.formatIDR(plan.maxDeposit)}` };
    }

    if ((user.walletBalance || 0) < parsedAmount) {
      return { success: false, message: `Saldo Wallet Balance tidak mencukupi! Anda memiliki ${DB.formatIDR(user.walletBalance || 0)}, butuh ${DB.formatIDR(parsedAmount)}` };
    }

    // Deduct user balance
    user.walletBalance -= parsedAmount;
    user.points = (user.points || 0) + 50; // Loyalty points reward for new investment

    // Create active investment record
    const newInvestment = {
      id: 'inv-' + Date.now(),
      userId: user.id,
      planId: plan.id,
      planName: plan.name,
      capital: parsedAmount,
      minRate: plan.minDailyProfit,
      maxRate: plan.maxDailyProfit,
      totalProfitEarned: 0,
      daysElapsed: 0,
      durationDays: plan.durationDays,
      status: 'active',
      startDate: new Date().toISOString(),
      lastProfitYieldDate: new Date().toISOString(),
      pendingProfitClaim: 0,
      capitalReturned: false,
      history: []
    };

    db.investments = db.investments || [];
    db.investments.push(newInvestment);

    // Record Transaction
    db.transactions = db.transactions || [];
    db.transactions.unshift({
      id: 'TRX-INV-' + Math.floor(100000 + Math.random() * 900000),
      userId: user.id,
      username: user.username,
      type: 'invest_plan',
      planName: plan.name,
      amount: parsedAmount,
      note: `Aktivasi paket investasi ${plan.name} (${plan.durationDays} hari)`,
      status: 'approved',
      createdAt: new Date().toISOString()
    });

    DB.save(db);

    // Distribute Sponsor Bonus if user was referred by someone
    if (user.referredBy) {
      Affiliate.distributeSponsorBonus(user, parsedAmount);
    }

    return {
      success: true,
      message: `Sukses mengaktifkan paket ${plan.name} sebesar ${DB.formatIDR(parsedAmount)}!`,
      investment: newInvestment
    };
  },

  // Calculate random daily profit % between minRate and maxRate
  generateRandomDailyRate(minRate, maxRate) {
    const min = parseFloat(minRate);
    const max = parseFloat(maxRate);
    const random = Math.random() * (max - min) + min;
    return parseFloat(random.toFixed(2)); // e.g. 2.45%
  },

  // Trigger Daily Profit Yield (Manual / Scheduled admin maintenance cycle)
  yieldDailyProfits(force = false) {
    const db = DB.get();
    const marketStatus = this.isWeekendMarketClosed();

    if (!force && marketStatus.closed) {
      return {
        success: false,
        isWeekendClosed: true,
        updatedCount: 0,
        totalYielded: 0,
        message: `Distribusi profit dilewati: Hari ini akhir pekan (${marketStatus.dayName}) dan pengaturan Profit Akhir Pekan sedang LIBUR (Nonaktif).`
      };
    }

    let totalYielded = 0;
    let updatedCount = 0;

    db.investments = db.investments || [];
    db.investments.forEach(inv => {
      if (inv.status === 'active') {
        if (inv.daysElapsed < inv.durationDays && (!inv.pendingProfitClaim || inv.pendingProfitClaim <= 0)) {
          const rate = this.generateRandomDailyRate(inv.minRate, inv.maxRate);
          const profitAmount = Math.floor((inv.capital * rate) / 100);

          inv.pendingProfitClaim = profitAmount;
          inv.lastProfitYieldDate = new Date().toISOString();

          inv.history = inv.history || [];
          inv.history.push({
            day: (inv.daysElapsed || 0) + 1,
            date: new Date().toLocaleDateString('id-ID'),
            rate: rate,
            amount: profitAmount,
            status: 'pending_claim'
          });

          totalYielded += profitAmount;
          updatedCount++;
        }
      }
    });

    DB.save(db);
    return { success: true, updatedCount, totalYielded };
  },

  // Claim pending daily profit for a specific user
  claimProfit(userId) {
    const db = DB.get();
    const user = db.users.find(u => u.id === userId);
    if (!user) return { success: false, message: 'User tidak ditemukan' };

    const userInvs = (db.investments || []).filter(inv => inv.userId === userId && inv.status === 'active');
    let totalClaimable = 0;
    let completedPlans = [];

    userInvs.forEach(inv => {
      if (inv.pendingProfitClaim > 0) {
        totalClaimable += inv.pendingProfitClaim;
        inv.totalProfitEarned = (inv.totalProfitEarned || 0) + inv.pendingProfitClaim;
        inv.pendingProfitClaim = 0;
        inv.daysElapsed = (inv.daysElapsed || 0) + 1;
        inv.lastProfitYieldDate = new Date().toISOString();

        // Mark history records as claimed
        if (inv.history) {
          inv.history.forEach(h => {
            if (h.status === 'pending_claim') h.status = 'claimed';
          });
        }

        // Check if plan duration reached upon this claim
        if (inv.daysElapsed >= inv.durationDays) {
          inv.status = 'completed';
          inv.completedAt = inv.completedAt || new Date().toISOString();
          inv.refundReady = true;
          if (inv.capitalReturned === undefined) {
            inv.capitalReturned = false;
          }
          completedPlans.push(inv);
        }
      }
    });

    if (totalClaimable <= 0) {
      return { success: false, message: 'Belum ada profit yang siap diklaim saat ini. Hitung mundur siklus 24 jam sedang berjalan.' };
    }

    // Add to user wallet balance
    user.walletBalance = (user.walletBalance || 0) + totalClaimable;
    user.points = (user.points || 0) + 2; // Daily loyalty points reward

    // Record Transaction
    db.transactions.unshift({
      id: 'TRX-PRF-' + Math.floor(100000 + Math.random() * 900000),
      userId: user.id,
      username: user.username,
      type: 'profit_claim',
      amount: totalClaimable,
      note: `Klaim profit harian investasi AI (${DB.formatIDR(totalClaimable)})`,
      status: 'approved',
      createdAt: new Date().toISOString()
    });

    DB.save(db);

    // Distribute Rabat (ROI match) to uplines based on claimed profit
    if (user.referredBy) {
      Affiliate.distributeRabatBonus(user, totalClaimable);
    }

    let msg = `Berhasil klaim profit harian sebesar ${DB.formatIDR(totalClaimable)} ke Saldo Utama!`;
    if (completedPlans.length > 0) {
      const lockedCap = completedPlans.reduce((sum, p) => sum + p.capital, 0);
      msg += ` Kontrak paket investasi telah selesai (${completedPlans[0].durationDays}/${completedPlans[0].durationDays} hari). Modal sebesar ${DB.formatIDR(lockedCap)} tersimpan di Saldo Terlock. Silakan buka menu Refund dan klik "Proses refundkan ke saldo saya" untuk menarik (WD) atau mengaktifkan paket kembali.`;
    }

    return {
      success: true,
      amount: totalClaimable,
      message: msg
    };
  },

  // Get completed investments that are pending capital refund
  getRefundableInvestments(userId) {
    if (!userId) return [];
    this.syncUserInvestments(userId);
    const db = DB.get();
    return (db.investments || []).filter(inv => {
      return inv.userId === userId && inv.status === 'completed' && inv.capitalReturned !== true;
    });
  },

  // Get total locked completed capital awaiting refund
  getLockedRefundCapital(userId) {
    const list = this.getRefundableInvestments(userId);
    return list.reduce((sum, inv) => sum + (Number(inv.capital) || 0), 0);
  },

  // Process manual refund of completed investment capital to user's wallet balance
  processContractRefund(investmentId, userId) {
    const db = DB.get();
    const user = db.users.find(u => u.id === userId);
    if (!user) return { success: false, message: 'User tidak ditemukan!' };

    db.investments = db.investments || [];
    const inv = db.investments.find(i => i.id === investmentId && i.userId === userId);
    if (!inv) {
      return { success: false, message: 'Paket investasi tidak ditemukan!' };
    }

    if (inv.status !== 'completed' && (inv.daysElapsed || 0) < inv.durationDays) {
      return {
        success: false,
        message: `Masa kontrak paket masih berjalan (${inv.daysElapsed || 0}/${inv.durationDays} hari). Refund modal pokok hanya dapat diproses setelah masa kontrak selesai.`
      };
    }

    if (inv.capitalReturned) {
      return {
        success: false,
        message: 'Modal paket investasi ini sudah pernah direfundkan ke saldo Anda sebelumnya.'
      };
    }

    const refundAmount = Number(inv.capital) || 0;
    user.walletBalance = (user.walletBalance || 0) + refundAmount;
    inv.capitalReturned = true;
    inv.refundedAt = new Date().toISOString();
    inv.refundReady = false;

    // Record capital refund transaction
    db.transactions = db.transactions || [];
    const trxId = 'TRX-REF-' + Math.floor(100000 + Math.random() * 900000);
    db.transactions.unshift({
      id: trxId,
      userId: user.id,
      username: user.username,
      type: 'capital_refund',
      planName: inv.planName,
      amount: refundAmount,
      note: `Refund pengembalian modal paket ${inv.planName} (${inv.durationDays} hari selesai) ke Saldo Utama`,
      status: 'approved',
      createdAt: new Date().toISOString()
    });

    DB.save(db);

    return {
      success: true,
      amount: refundAmount,
      amountRefunded: refundAmount,
      message: `Proses refund berhasil! Modal sebesar ${DB.formatIDR(refundAmount)} telah dikembalikan ke Saldo Utama Anda. Saldo sekarang dapat ditarik (WD) atau digunakan untuk mengaktifkan paket kembali.`
    };
  },

  // Process all pending refundable contracts for user
  processAllContractRefunds(userId) {
    const refundables = this.getRefundableInvestments(userId);
    if (refundables.length === 0) {
      return { success: false, message: 'Tidak ada saldo modal kontrak selesai yang perlu direfund saat ini.' };
    }

    let totalRefunded = 0;
    refundables.forEach(inv => {
      const res = this.processContractRefund(inv.id, userId);
      if (res.success) {
        totalRefunded += res.amount;
      }
    });

    return {
      success: true,
      amount: totalRefunded,
      message: `Total modal sebesar ${DB.formatIDR(totalRefunded)} berhasil diproses dan masuk ke Saldo Utama Anda! Saldo sekarang dapat di-WD atau diaktifkan kembali.`
    };
  },

  // Leaderboard: Top Sponsors (Min 10 Members)
  getTopSponsors(limit = 10) {
    const db = DB.get();
    const users = db.users || [];
    
    // Aggregate data from real users or fallback curated list
    const sponsorStats = users.map(u => {
      const downlines = Affiliate.getDownlines(u.referralCode || '');
      const directCount = downlines.level1.length;
      const totalTeam = downlines.totalMembers;
      const turnover = downlines.totalTeamTurnover;
      const commission = (u.affiliateBalance || 0) + Math.floor(turnover * 0.10);
      return {
        id: u.id,
        username: u.username,
        fullName: u.fullName || u.username,
        directCount,
        sponsorCount: directCount,
        totalTeam,
        turnover,
        commission,
        badge: 'VIP Leader'
      };
    });

    // Default simulated top leaders if database has few affiliates
    const fallbackLeaders = [
      { username: 'Hendra_Sultan', fullName: 'Hendra Wijaya', directCount: 48, sponsorCount: 48, totalTeam: 184, turnover: 850000000, commission: 85000000, badge: 'Crown Diamond' },
      { username: 'Master_Cuan88', fullName: 'Budi Santoso', directCount: 39, sponsorCount: 39, totalTeam: 142, turnover: 620000000, commission: 62000000, badge: 'Super Leader' },
      { username: 'Rian_FXTrader', fullName: 'Rian Pratama', directCount: 33, sponsorCount: 33, totalTeam: 118, turnover: 490000000, commission: 49000000, badge: 'Gold Master' },
      { username: 'Dewi_Investor', fullName: 'Dewi Lestari', directCount: 29, sponsorCount: 29, totalTeam: 96, turnover: 380000000, commission: 38000000, badge: 'Gold Master' },
      { username: 'Kevin_Surabaya', fullName: 'Kevin Ardiansyah', directCount: 26, sponsorCount: 26, totalTeam: 84, turnover: 310000000, commission: 31000000, badge: 'Silver Pro' },
      { username: 'Siti_Capital', fullName: 'Siti Nurhaliza', directCount: 22, sponsorCount: 22, totalTeam: 72, turnover: 260000000, commission: 26000000, badge: 'Silver Pro' },
      { username: 'Agus_TraderPro', fullName: 'Agus Gunawan', directCount: 19, sponsorCount: 19, totalTeam: 61, turnover: 215000000, commission: 21500000, badge: 'Silver Pro' },
      { username: 'Bambang_Cuan', fullName: 'Bambang Sudibyo', directCount: 17, sponsorCount: 17, totalTeam: 54, turnover: 180000000, commission: 18000000, badge: 'Bronze Star' },
      { username: 'Maya_Invest88', fullName: 'Maya Kusuma', directCount: 15, sponsorCount: 15, totalTeam: 46, turnover: 145000000, commission: 14500000, badge: 'Bronze Star' },
      { username: 'Fajar_VipTrader', fullName: 'Fajar Nugraha', directCount: 13, sponsorCount: 13, totalTeam: 39, turnover: 120000000, commission: 12000000, badge: 'Bronze Star' },
      { username: 'Denny_Crypto', fullName: 'Denny Setiawan', directCount: 11, sponsorCount: 11, totalTeam: 32, turnover: 98000000, commission: 9800000, badge: 'Rising Star' },
      { username: 'Reza_Bandung', fullName: 'Reza Fauzi', directCount: 9, sponsorCount: 9, totalTeam: 27, turnover: 75000000, commission: 7500000, badge: 'Rising Star' }
    ];

    // Merge and sort descending
    const combined = [...sponsorStats, ...fallbackLeaders];
    combined.sort((a, b) => (b.turnover || b.commission) - (a.turnover || a.commission));

    // Ensure unique by username and slice limit
    const unique = [];
    const seen = new Set();
    for (const item of combined) {
      if (!seen.has(item.username)) {
        seen.add(item.username);
        unique.push(item);
      }
      if (unique.length >= limit) break;
    }

    return unique;
  },

  // Leaderboard: Top Profit (Min 10 Members)
  getTopProfits(limit = 10) {
    const db = DB.get();
    const users = db.users || [];
    const investments = db.investments || [];

    const userProfits = users.map(u => {
      const userInvs = investments.filter(i => i.userId === u.id);
      const totalProfit = userInvs.reduce((sum, i) => sum + (i.totalProfitEarned || 0), 0);
      const totalCap = userInvs.reduce((sum, i) => sum + (i.capital || 0), 0);
      return {
        id: u.id,
        username: u.username,
        fullName: u.fullName || u.username,
        totalProfit,
        totalCapital: totalCap,
        activePlansCount: userInvs.filter(i => i.status === 'active').length,
        winRate: 98.4
      };
    });

    const fallbackProfits = [
      { username: 'Sultan_Crypto', fullName: 'Alexander Pratama', totalProfit: 142850000, totalCapital: 250000000, winRate: 99.2, activePlan: 'VIP Master Pro' },
      { username: 'Alex_Investor', fullName: 'Alex Sutanto', totalProfit: 98400000, totalCapital: 150000000, winRate: 98.8, activePlan: 'Elite Capital' },
      { username: 'Wahyu_CuanMax', fullName: 'Wahyu Hidayat', totalProfit: 76500000, totalCapital: 100000000, winRate: 97.9, activePlan: 'Elite Capital' },
      { username: 'Citra_Trading', fullName: 'Citra Kirana', totalProfit: 63200000, totalCapital: 80000000, winRate: 98.1, activePlan: 'Pro Trader' },
      { username: 'Doni_Capital', fullName: 'Doni Firmansyah', totalProfit: 54100000, totalCapital: 60000000, winRate: 97.5, activePlan: 'Pro Trader' },
      { username: 'Indra_Forex', fullName: 'Indra Gunawan', totalProfit: 46800000, totalCapital: 50000000, winRate: 96.9, activePlan: 'Rookie Star' },
      { username: 'Lestari_AI', fullName: 'Lestari Utami', totalProfit: 39500000, totalCapital: 40000000, winRate: 98.0, activePlan: 'Rookie Star' },
      { username: 'Taufik_Surabaya', fullName: 'Taufik Rahman', totalProfit: 32400000, totalCapital: 35000000, winRate: 97.2, activePlan: 'Rookie Star' },
      { username: 'Nadia_Invest', fullName: 'Nadia Saphira', totalProfit: 27900000, totalCapital: 25000000, winRate: 96.5, activePlan: 'Invest Learn' },
      { username: 'Eko_Jakarta', fullName: 'Eko Prasetyo', totalProfit: 22100000, totalCapital: 20000000, winRate: 97.4, activePlan: 'Invest Learn' },
      { username: 'Rizki_Medan', fullName: 'Rizki Ananda', totalProfit: 18600000, totalCapital: 15000000, winRate: 96.8, activePlan: 'Invest Learn' },
      { username: 'Anisa_Trader', fullName: 'Anisa Rahma', totalProfit: 15400000, totalCapital: 10000000, winRate: 97.0, activePlan: 'Invest Learn' }
    ];

    const combined = [...userProfits, ...fallbackProfits];
    combined.sort((a, b) => (b.totalProfit || 0) - (a.totalProfit || 0));

    const unique = [];
    const seen = new Set();
    for (const item of combined) {
      if (!seen.has(item.username)) {
        seen.add(item.username);
        unique.push(item);
      }
      if (unique.length >= limit) break;
    }

    return unique;
  }
};
