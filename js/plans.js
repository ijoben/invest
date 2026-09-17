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

  // Synchronize user investments with real timestamps (auto-settles completed cycles)
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
    const marketStatus = this.isWeekendMarketClosed();

    userInvs.forEach(inv => {
      // 1. Check if investment duration has expired
      if (inv.daysElapsed >= inv.durationDays) {
        inv.status = 'completed';
        inv.completedAt = new Date().toISOString();
        if (!inv.capitalReturned) {
          user.walletBalance = (user.walletBalance || 0) + inv.capital;
          inv.capitalReturned = true;
          db.transactions.unshift({
            id: 'TRX-CAP-' + Math.floor(100000 + Math.random() * 900000),
            userId: user.id,
            username: user.username,
            type: 'capital_return',
            planName: inv.planName,
            amount: inv.capital,
            note: `Pengembalian modal investasi paket ${inv.planName} (${inv.durationDays} hari selesai)`,
            status: 'approved',
            createdAt: new Date().toISOString()
          });
        }
        modified = true;
        return;
      }

      // 2. If market is closed on weekend, skip generating new profit claim
      if (marketStatus.closed) {
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
          inv.completedAt = new Date().toISOString();
          if (!inv.capitalReturned) {
            user.walletBalance = (user.walletBalance || 0) + inv.capital;
            inv.capitalReturned = true;
            completedPlans.push(inv);
            db.transactions.unshift({
              id: 'TRX-CAP-' + Math.floor(100000 + Math.random() * 900000),
              userId: user.id,
              username: user.username,
              type: 'capital_return',
              planName: inv.planName,
              amount: inv.capital,
              note: `Pengembalian modal paket ${inv.planName} (${inv.durationDays} hari selesai)`,
              status: 'approved',
              createdAt: new Date().toISOString()
            });
          }
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
      const capReturned = completedPlans.reduce((sum, p) => sum + p.capital, 0);
      msg += ` Paket investasi telah selesai (${completedPlans[0].durationDays}/${completedPlans[0].durationDays} hari) dan modal ${DB.formatIDR(capReturned)} telah dikembalikan ke Saldo Utama.`;
    }

    return {
      success: true,
      amount: totalClaimable,
      message: msg
    };
  }
};
