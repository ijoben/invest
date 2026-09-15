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

  // Get user active investments
  getUserInvestments(userId) {
    const db = DB.get();
    return db.investments.filter(inv => inv.userId === userId && inv.status === 'active');
  },

  // Buy / Activate Plan
  invest({ userId, planId, amount }) {
    const db = DB.get();
    const user = DB.getUserById(userId);
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

    if (user.walletBalance < parsedAmount) {
      return { success: false, message: `Saldo Wallet Balance tidak mencukupi! Anda memiliki ${DB.formatIDR(user.walletBalance)}` };
    }

    // Deduct user balance
    DB.updateUser(user.id, {
      walletBalance: user.walletBalance - parsedAmount
    });

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
      history: []
    };

    db.investments.push(newInvestment);

    // Record Transaction
    db.transactions.unshift({
      id: 'TRX-' + Math.floor(100000 + Math.random() * 900000),
      userId: user.id,
      username: user.username,
      type: 'invest_plan',
      planName: plan.name,
      amount: parsedAmount,
      status: 'approved',
      createdAt: new Date().toISOString()
    });

    DB.save(db);

    // Distribute Sponsor Bonus if user was referred by someone
    if (user.referredBy) {
      Affiliate.distributeSponsorBonus(user, parsedAmount);
    }

    return { success: true, message: `Sukses mengaktifkan paket ${plan.name} sebesar ${DB.formatIDR(parsedAmount)}!`, investment: newInvestment };
  },

  // Calculate random daily profit % between minRate and maxRate
  generateRandomDailyRate(minRate, maxRate) {
    const min = parseFloat(minRate);
    const max = parseFloat(maxRate);
    const random = Math.random() * (max - min) + min;
    return parseFloat(random.toFixed(2)); // e.g. 2.45%
  },

  // Trigger Daily Profit Yield (Called periodically or manually in admin/test button)
  yieldDailyProfits() {
    const db = DB.get();
    let totalYielded = 0;
    let updatedCount = 0;

    db.investments.forEach(inv => {
      if (inv.status === 'active') {
        // Generate random rate today
        const rate = this.generateRandomDailyRate(inv.minRate, inv.maxRate);
        const profitAmount = Math.floor((inv.capital * rate) / 100);

        inv.pendingProfitClaim = (inv.pendingProfitClaim || 0) + profitAmount;
        inv.daysElapsed = (inv.daysElapsed || 0) + 1;
        inv.lastProfitYieldDate = new Date().toISOString();

        inv.history = inv.history || [];
        inv.history.push({
          date: new Date().toLocaleDateString('id-ID'),
          rate: rate,
          amount: profitAmount,
          status: 'pending_claim'
        });

        // Check if plan duration reached
        if (inv.daysElapsed >= inv.durationDays) {
          inv.status = 'completed';
          // Return principal capital to user wallet
          const user = db.users.find(u => u.id === inv.userId);
          if (user) {
            user.walletBalance += inv.capital;
          }
        }

        totalYielded += profitAmount;
        updatedCount++;
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

    const userInvs = db.investments.filter(inv => inv.userId === userId && inv.status === 'active');
    let totalClaimable = 0;

    userInvs.forEach(inv => {
      if (inv.pendingProfitClaim > 0) {
        totalClaimable += inv.pendingProfitClaim;
        inv.totalProfitEarned += inv.pendingProfitClaim;
        inv.pendingProfitClaim = 0;

        // Mark history records as claimed
        if (inv.history) {
          inv.history.forEach(h => {
            if (h.status === 'pending_claim') h.status = 'claimed';
          });
        }
      }
    });

    if (totalClaimable <= 0) {
      return { success: false, message: 'Belum ada profit yang siap diklaim saat ini. Profit bertambah setiap 24 jam.' };
    }

    // Add to user wallet balance
    user.walletBalance += totalClaimable;

    // Record Transaction
    db.transactions.unshift({
      id: 'TRX-PRF-' + Math.floor(100000 + Math.random() * 900000),
      userId: user.id,
      username: user.username,
      type: 'profit_claim',
      amount: totalClaimable,
      status: 'approved',
      createdAt: new Date().toISOString()
    });

    DB.save(db);

    // Distribute Rabat (ROI match) to uplines based on claimed profit
    if (user.referredBy) {
      Affiliate.distributeRabatBonus(user, totalClaimable);
    }

    return {
      success: true,
      amount: totalClaimable,
      message: `Berhasil klaim profit harian sebesar ${DB.formatIDR(totalClaimable)} ke Wallet Balance!`
    };
  }
};
