/**
 * AUTOTRADING - INVESTMENT PLANS & RANDOM DAILY PROFIT ENGINE
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

  // Rate range of an investment.
  // Legacy state stores minRate/maxRate, while rows rebuilt from the MySQL table
  // only carry minDailyProfit/maxDailyProfit. Without this fallback the contract
  // screen printed "undefined% - undefined%" and profit yields produced
  // rate=null history rows (which then duplicated endlessly).
  getRateRange(inv) {
    let min = parseFloat(inv.minRate ?? inv.minDailyProfit ?? inv.dailyPercentage ?? inv.dailyProfit);
    let max = parseFloat(inv.maxRate ?? inv.maxDailyProfit ?? inv.dailyPercentage ?? inv.dailyProfit);
    if (!isFinite(min) || !isFinite(max)) {
      const db = DB.get();
      const plan = (db.plans || []).find(p => p.id === inv.planId || p.name === inv.planName);
      if (plan) {
        if (!isFinite(min)) min = parseFloat(plan.minDailyProfit ?? plan.dailyPercentage ?? plan.dailyProfit);
        if (!isFinite(max)) max = parseFloat(plan.maxDailyProfit ?? plan.dailyPercentage ?? plan.dailyProfit);
      }
    }
    if (!isFinite(min)) min = 0;
    if (!isFinite(max)) max = min;
    if (max < min) max = min;
    return { min, max };
  },

  // True when this day already has a pending yield, so we never append a second
  // identical history row for the same contract day.
  _hasPendingHistoryForDay(inv, dayNo) {
    if (!Array.isArray(inv.history) || inv.history.length === 0) return false;
    const last = inv.history[inv.history.length - 1];
    return !!(last && last.day === dayNo && last.status === 'pending_claim');
  },

  // Synchronize user investments with real timestamps (handles completed cycles)
  syncUserInvestments(userId) {
    if (!userId) return [];
    const db = DB.get();
    let modified = false;
    const now = Date.now();
    const cycleDurationMs = (db.settings.profitCycleDurationHours || 24) * 3600 * 1000;
    const todayWib = DB.getWibDateStr();

    const user = db.users.find(u => u.id === userId);
    if (!user) return [];

    // Check if user has already claimed profit today
    const hasClaimedToday = (db.transactions || []).some(t => {
      if (t.userId !== userId) return false;
      if (t.type !== 'profit_claim') return false;
      return DB.getWibDateStr(t.createdAt) === todayWib;
    });

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
        inv.pendingProfitClaim = 0;
        if (inv.capitalReturned === undefined) {
          inv.capitalReturned = false;
        }
        modified = true;
        return;
      }

      // If user has already claimed profit today, ensure pending claim is cleared
      if (hasClaimedToday && inv.pendingProfitClaim > 0) {
        inv.pendingProfitClaim = 0;
        modified = true;
      }

      // 2. If market is closed or user already claimed profit today, skip generating new profit claim
      if (!marketStatus.isOpen || hasClaimedToday) {
        return;
      }

      // 3. Check if a real 24-hour cycle has passed and no profit is pending claim
      let lastYieldStr = inv.lastProfitYieldDate || inv.startDate;
      if (typeof lastYieldStr === 'string' && lastYieldStr.includes(' ')) {
        lastYieldStr = lastYieldStr.replace(' ', 'T');
      }
      const lastYieldDateWib = lastYieldStr ? DB.getWibDateStr(lastYieldStr) : null;
      if (lastYieldDateWib === todayWib) {
        // Already yielded/claimed for today
        return;
      }

      const lastYieldTime = lastYieldStr ? new Date(lastYieldStr).getTime() : now;
      const elapsedMs = now - lastYieldTime;

      if (elapsedMs >= cycleDurationMs && (!inv.pendingProfitClaim || inv.pendingProfitClaim <= 0)) {
        // Yield exactly 1 day profit for this completed cycle
        const range = this.getRateRange(inv);
        const rate = this.generateRandomDailyRate(range.min, range.max);
        const profitAmount = Math.floor((inv.capital * rate) / 100);

        inv.pendingProfitClaim = profitAmount;
        // Advance the yield clock
        inv.lastProfitYieldDate = new Date().toISOString();
        const dayNo = (inv.daysElapsed || 0) + 1;
        if (!this._hasPendingHistoryForDay(inv, dayNo)) {
          inv.history = inv.history || [];
          inv.history.push({
            day: dayNo,
            date: new Date().toLocaleDateString('id-ID'),
            rate: rate,
            amount: profitAmount,
            status: 'pending_claim'
          });
        }
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
    const db = DB.get();

    // Check if weekend (market OFF on Saturday & Sunday)
    const now = new Date();
    const dayOfWeek = now.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return 0.0;
    }

    // Requirement 4: Check if Today Profit Loss Mode (0%) is active
    if (db.settings.todayProfitLossMode && db.settings.todayProfitLossMode.isLoss) {
      return 0.0;
    }

    const userInvs = this.getUserInvestments(userId);
    if (!userInvs || userInvs.length === 0) return 0;

    let totalCapital = 0;
    let totalWeightedRate = 0;
    const todayStr = now.toLocaleDateString('id-ID');

    userInvs.forEach(inv => {
      totalCapital += inv.capital;
      // Check if profit yielded today in history
      const todayHistory = inv.history && inv.history.find(h => h.date === todayStr);
      let rate = 0;
      if (todayHistory) {
        rate = todayHistory.rate;
      } else {
        // Average active range or base daily rate for this plan
        const range = this.getRateRange(inv);
        rate = (range.min + range.max) / 2;
      }
      totalWeightedRate += (rate * inv.capital);
    });

    if (totalCapital === 0) return 0;
    return parseFloat((totalWeightedRate / totalCapital).toFixed(2));
  },

  // Requirement 1, 3, 5: Get 7-Day (Senin-Minggu) Daily Profit Breakdown & History
  getWeeklyProfitHistory(userId = null) {
    const db = DB.get();
    const todayLossMode = db.settings.todayProfitLossMode && db.settings.todayProfitLossMode.isLoss;
    const now = new Date();
    const currentDay = now.getDay(); // 0: Minggu, 1: Senin, ..., 6: Sabtu
    const isWeekendToday = (currentDay === 0 || currentDay === 6);

    // Monday-based offset (Senin = 0, Selasa = 1, ..., Sabtu = 5, Minggu = 6)
    const currentMondayIdx = currentDay === 0 ? 6 : currentDay - 1;

    // Base Monday of current week
    const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay;
    const mondayDate = new Date(now);
    mondayDate.setDate(now.getDate() + mondayOffset);

    const dayNames = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

    // Base fallback rates from settings for Monday-Friday
    const defaultRates = [1.00, 1.50, 1.20, 1.35, 1.15];
    const settingsHistory = Array.isArray(db.settings.weeklyProfitHistory) ? db.settings.weeklyProfitHistory : [];

    const isGuest = !userId;
    let todayRateForUser = 0;
    let userInvs = [];
    if (!isGuest) {
      todayRateForUser = this.getUserTodayProfitRate(userId);
      userInvs = this.getUserInvestments(userId);
    }

    const activeInvs = !isGuest && Array.isArray(userInvs) ? userInvs.filter(inv => inv.status === 'active') : [];
    const hasActivePackage = activeInvs.length > 0;

    // Requirement Revision: Jika user belum mengaktifkan paket, rincian profit seminggu KOSONG
    if (!isGuest && !hasActivePackage) {
      const emptyRecords = dayNames.map((dName, idx) => {
        const dayDate = new Date(mondayDate);
        dayDate.setDate(mondayDate.getDate() + idx);
        const dateStr = `${dayDate.getDate()} ${monthNames[dayDate.getMonth()]}`;
        const fullDateStr = dayDate.toLocaleDateString('id-ID');
        const isToday = idx === currentMondayIdx;
        const isWeekend = (idx === 5 || idx === 6);

        return {
          dayName: dName,
          date: dateStr,
          fullDate: fullDateStr,
          rate: null,
          isWeekend,
          isOff: isWeekend,
          isLoss: false,
          isToday,
          isGuest: false,
          hasActivePackage: false,
          displayRate: '-',
          statusLabel: isWeekend ? 'Pasar OFF' : 'Belum Ada Paket',
          pillText: isWeekend ? 'Pasar OFF' : 'Kosong'
        };
      });

      return {
        records: emptyRecords,
        totalRate: 0,
        avgRate: 0,
        countActiveDays: 0,
        todayRate: 0,
        todayIsLoss: false,
        isWeekendToday,
        isGuest: false,
        hasActivePackage: false
      };
    const earliestStartDateStr = activeInvs.reduce((min, inv) => {
      const s = DB.getWibDateStr(inv.startDate || inv.createdAt);
      return !min || s < min ? s : min;
    }, null);

    const records = dayNames.map((dName, idx) => {
      const dayDate = new Date(mondayDate);
      dayDate.setDate(mondayDate.getDate() + idx);
      const dateStr = `${dayDate.getDate()} ${monthNames[dayDate.getMonth()]}`;
      const fullDateStr = dayDate.toLocaleDateString('id-ID');
      const targetDateStr = DB.getWibDateStr(dayDate);
      const isToday = idx === currentMondayIdx;
      const isPast = idx < currentMondayIdx;
      const isWeekend = (idx === 5 || idx === 6); // Sabtu or Minggu

      // Sabtu and Minggu: Always OFF / empty (Requirement 5)
      if (isWeekend) {
        return {
          dayName: dName,
          date: dateStr,
          fullDate: fullDateStr,
          rate: null,
          isWeekend: true,
          isOff: true,
          isToday,
          isGuest,
          hasActivePackage,
          displayRate: '-',
          statusLabel: 'Pasar OFF',
          pillText: 'Pasar OFF'
        };
      }

      // Guest View: Empty (Requirement 3)
      if (isGuest) {
        return {
          dayName: dName,
          date: dateStr,
          fullDate: fullDateStr,
          rate: null,
          isWeekend: false,
          isOff: false,
          isToday,
          isGuest: true,
          hasActivePackage: false,
          displayRate: '-',
          statusLabel: 'Khusus Member',
          pillText: 'Member'
        };
      }

      // Member Logged In with Active Package:
      // If target date is before package activation date -> Belum Aktif
      if (earliestStartDateStr && targetDateStr < earliestStartDateStr) {
        return {
          dayName: dName,
          date: dateStr,
          fullDate: fullDateStr,
          rate: null,
          isWeekend: false,
          isOff: false,
          isLoss: false,
          isToday,
          isPast,
          isGuest: false,
          hasActivePackage: true,
          displayRate: '-',
          statusLabel: 'Belum Aktif',
          pillText: 'Kosong'
        };
      }

      // If target date is the day the package was newly activated -> Baru Aktif (no yield on activation day)
      if (earliestStartDateStr && targetDateStr === earliestStartDateStr) {
        return {
          dayName: dName,
          date: dateStr,
          fullDate: fullDateStr,
          rate: null,
          isWeekend: false,
          isOff: false,
          isLoss: false,
          isToday,
          isPast,
          isGuest: false,
          hasActivePackage: true,
          displayRate: '-',
          statusLabel: 'Baru Aktif',
          pillText: 'Aktivasi'
        };
      }

      let rate = 0;
      let isLoss = false;

      if (isToday) {
        // Requirement 1: EXACT MATCH with valTodayProfit!
        if (todayLossMode) {
          rate = 0.0;
          isLoss = true;
        } else if (isWeekendToday) {
          rate = 0.0;
        } else {
          rate = todayRateForUser;
        }
      } else if (isPast) {
        // Look up member's yield history for this date if available
        let foundHistoryRate = null;
        activeInvs.forEach(inv => {
          const h = inv.history && inv.history.find(item => item.date === fullDateStr);
          if (h && typeof h.rate === 'number') foundHistoryRate = h.rate;
        });

        if (foundHistoryRate === null) {
          const claimTx = (db.transactions || []).find(t => {
            if (t.userId !== userId) return false;
            const isPrf = t.type === 'profit_claim' || (t.id && String(t.id).startsWith('TRX-PRF-'));
            return isPrf && DB.getWibDateStr(t.createdAt) === targetDateStr;
          });
          if (claimTx) {
            const totalCap = activeInvs.reduce((s, i) => s + (i.capital || 0), 0);
            if (totalCap > 0) {
              foundHistoryRate = parseFloat(((claimTx.amount / totalCap) * 100).toFixed(2));
            }
          }
        }

        if (foundHistoryRate !== null) {
          rate = foundHistoryRate;
        } else {
          rate = (settingsHistory[idx] && typeof settingsHistory[idx].rate === 'number')
            ? settingsHistory[idx].rate
            : defaultRates[idx];
        }
      } else {
        // Future weekdays: Plan expected rate
        const avgUserRate = activeInvs.reduce((acc, inv) => {
          const range = this.getRateRange(inv);
          return acc + (range.min + range.max) / 2;
        }, 0) / activeInvs.length;
        rate = parseFloat(avgUserRate.toFixed(2));
      }

      rate = parseFloat(Number(rate || 0).toFixed(2));
      isLoss = rate === 0 && (todayLossMode || (isToday && todayLossMode));

      let pillText = 'Progress';
      let pillClass = 'pill-progress';
      let statusLabel = `🟢 +${rate.toFixed(2)}%`;

      if (isLoss) {
        statusLabel = '🔴 Loss 0%';
        pillText = 'Loss 0%';
        pillClass = 'pill-loss';
      } else if (isPast) {
        statusLabel = `✓ +${rate.toFixed(2)}% (Selesai)`;
        pillText = 'Selesai';
        pillClass = 'pill-selesai';
      } else if (isToday) {
        statusLabel = `🟡 +${rate.toFixed(2)}% (Progress)`;
        pillText = 'Progress';
        pillClass = 'pill-progress';
      } else {
        // Future weekdays
        statusLabel = `⏳ +${rate.toFixed(2)}% (Next)`;
        pillText = 'Next';
        pillClass = 'pill-next';
      }

      return {
        dayName: dName,
        date: dateStr,
        fullDate: fullDateStr,
        rate,
        isWeekend: false,
        isOff: false,
        isLoss,
        isToday,
        isPast,
        isFuture: !isPast && !isToday && !isWeekend,
        isGuest: false,
        hasActivePackage: true,
        displayRate: isLoss ? '0.00%' : `+${rate.toFixed(2)}%`,
        statusLabel,
        pillText,
        pillClass
      };
    });

    // Sum and average only over the 5 trading days (Senin - Jumat)
    let totalRate = 0;
    let countActiveDays = 0;

    if (!isGuest && hasActivePackage) {
      records.forEach(r => {
        if (!r.isWeekend && typeof r.rate === 'number') {
          totalRate += r.rate;
          countActiveDays++;
        }
      });
    }

    const avgRate = countActiveDays > 0 ? totalRate / countActiveDays : 0;

    return {
      records,
      totalRate: isGuest ? null : parseFloat(totalRate.toFixed(2)),
      avgRate: isGuest ? null : parseFloat(avgRate.toFixed(2)),
      countActiveDays,
      todayRate: todayRateForUser,
      todayIsLoss: !!todayLossMode,
      isWeekendToday,
      isGuest,
      hasActivePackage,
      lossMessage: todayLossMode ? (db.settings.todayProfitLossMode?.message || 'Hari ini dividen profit 0%') : ''
    };
  },

  // Buy / Activate Plan
  async invest({ userId, planId, amount }) {
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

    // Anti-duplicate protection: prevent double activation within 5 seconds
    this._recentInvestments = this._recentInvestments || {};
    const investKey = `${userId}_${planId}`;
    const lastInvestTime = this._recentInvestments[investKey] || 0;
    if (Date.now() - lastInvestTime < 5000) {
      return { success: false, message: 'Permintaan aktivasi paket sedang diproses, harap tunggu beberapa detik...' };
    }
    this._recentInvestments[investKey] = Date.now();

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

    // Distribute Sponsor Bonus if user was referred by someone (Atomic in same DB instance)
    if (user.referredBy) {
      Affiliate.applySponsorBonus(db, user, parsedAmount);
    }

    await DB.save(db);

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
  async yieldDailyProfits(force = false) {
    const db = DB.get();
    const marketStatus = this.isWeekendMarketClosed();
    const isTodayLossMode = db.settings.todayProfitLossMode && db.settings.todayProfitLossMode.isLoss;

    if (!force && isTodayLossMode) {
      return {
        success: false,
        isLossMode: true,
        updatedCount: 0,
        totalYielded: 0,
        message: 'Distribusi dividen profit 0%: Mode Loss / Flat 0% sedang AKTIF hari ini oleh Administrator. Modal member 100% terjaga aman.'
      };
    }

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
        const invStartWib = DB.getWibDateStr(inv.startDate || inv.createdAt);
        const todayWib = DB.getWibDateStr();
        // Prevent Day 0 yield (package activated today)
        if (!force && invStartWib === todayWib) {
          return;
        }
        // Prevent duplicate yield on same day
        const lastYieldWib = inv.lastProfitYieldDate ? DB.getWibDateStr(inv.lastProfitYieldDate) : null;
        if (!force && lastYieldWib === todayWib) {
          return;
        }

        if (inv.daysElapsed < inv.durationDays && (!inv.pendingProfitClaim || inv.pendingProfitClaim <= 0)) {
          const range = this.getRateRange(inv);
          const rate = isTodayLossMode ? 0.0 : this.generateRandomDailyRate(range.min, range.max);
          const profitAmount = Math.floor((inv.capital * rate) / 100);

          inv.pendingProfitClaim = profitAmount;
          inv.lastProfitYieldDate = new Date().toISOString();

          const dayNo = (inv.daysElapsed || 0) + 1;
          if (!this._hasPendingHistoryForDay(inv, dayNo)) {
            inv.history = inv.history || [];
            inv.history.push({
              day: dayNo,
              date: new Date().toLocaleDateString('id-ID'),
              rate: rate,
              amount: profitAmount,
              status: 'pending_claim'
            });
          }

          totalYielded += profitAmount;
          updatedCount++;
        }
      }
    });

    await DB.save(db);
    return { success: true, updatedCount, totalYielded };
  },

  // Claim pending daily profit for a specific user (Strictly Once Per Day)
  _claimLocks: {},
  async claimProfit(userId) {
    if (this._claimLocks[userId]) {
      return { success: false, message: 'Proses klaim sedang berlangsung, mohon tunggu sebentar...' };
    }
    this._claimLocks[userId] = true;

    try {
      const db = DB.get();
      const user = (db.users || []).find(u => u.id === userId);
      if (!user) return { success: false, message: 'User tidak ditemukan' };

      const todayWib = DB.getWibDateStr();

      // Check active investments & pending profit
      const userInvs = (db.investments || []).filter(i => i.userId === userId && i.status === 'active');

      // Guard: If all active investments were activated today, no profit on Day 0
      const isAllActivatedToday = userInvs.length > 0 && userInvs.every(inv => {
        const invStartWib = DB.getWibDateStr(inv.startDate || inv.createdAt);
        return invStartWib === todayWib;
      });
      if (isAllActivatedToday) {
        return {
          success: false,
          message: 'Paket investasi Anda baru diaktifkan hari ini. Perhitungan dividen profit dimulai pada siklus hari berikutnya.'
        };
      }
      const totalPending = userInvs.reduce((sum, inv) => sum + (Number(inv.pendingProfitClaim) || 0), 0);

      // 1. Strict local pre-guard: Check if already claimed profit today in transactions OR investments
      const todayClaimTx = (db.transactions || []).some(t => {
        if (t.userId !== userId) return false;
        const isPrf = t.type === 'profit_claim' || (t.id && String(t.id).startsWith('TRX-PRF-'));
        if (!isPrf) return false;
        return DB.getWibDateStr(t.createdAt) === todayWib;
      });

      const todayClaimInv = totalPending <= 0 && userInvs.some(inv => {
        return inv.lastProfitYieldDate && DB.getWibDateStr(inv.lastProfitYieldDate) === todayWib;
      });

      const hasClaimedToday = todayClaimTx || todayClaimInv;

      if (hasClaimedToday) {
        return {
          success: false,
          alreadyClaimed: true,
          message: 'Anda sudah mengklaim profit untuk hari ini. Profit berikutnya akan dihitung dalam siklus 24 jam berikutnya.'
        };
      }

      // Check weekend market status
      const marketStatus = this.isWeekendMarketClosed();
      if (marketStatus.closed) {
        return {
          success: false,
          message: marketStatus.message || 'Pasar libur akhir pekan (Sabtu & Minggu). Dividen profit aktif kembali hari Senin.'
        };
      }

      // 2. Direct server claim for atomic single-claim database validation
      let serverClaimSucceeded = false;

      try {
        if (typeof fetch === 'function') {
          const token = (typeof localStorage !== 'undefined' ? localStorage.getItem('autotrading_session_token') : '') ||
                        (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('autotrading_session_token') : '') || '';
          const url = DB.getApiUrl('claim_profit');

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 4500);

          const res = await fetch(url, {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { 'Authorization': 'Bearer ' + token, 'X-Session-Token': token } : {})
            },
            body: JSON.stringify({ userId, token }),
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          const json = await res.json().catch(() => null);
          if (json) {
            if (json.sessionToken) {
              try {
                if (typeof localStorage !== 'undefined') localStorage.setItem('autotrading_session_token', json.sessionToken);
                if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('autotrading_session_token', json.sessionToken);
              } catch(e) {}
            }
            if (json.success) {
              serverClaimSucceeded = true;
              // Authoritative synchronization with MySQL database response
              user.walletBalance = json.walletBalance;
              (db.investments || []).forEach(inv => {
                if (inv.userId === userId && inv.status === 'active') {
                  inv.pendingProfitClaim = 0;
                  inv.lastProfitYieldDate = new Date().toISOString();
                  inv.daysElapsed = (inv.daysElapsed || 0) + 1;
                  if (inv.daysElapsed >= inv.durationDays) {
                    inv.status = 'completed';
                    inv.completedAt = inv.completedAt || new Date().toISOString();
                    inv.refundReady = true;
                    if (inv.capitalReturned === undefined) inv.capitalReturned = false;
                  }
                }
              });
              if (json.transaction) {
                db.transactions = db.transactions || [];
                if (!db.transactions.some(t => t.id === json.transaction.id)) {
                  db.transactions.unshift(json.transaction);
                }
              }
              await DB.save(db);
              return json;
            } else if (json.alreadyClaimed) {
              (db.investments || []).forEach(inv => {
                if (inv.userId === userId && inv.status === 'active') {
                  inv.pendingProfitClaim = 0;
                }
              });
              if (typeof json.walletBalance === 'number') {
                user.walletBalance = json.walletBalance;
              }
              await DB.save(db);
              return json;
            } else {
              return json;
            }
          }
        }
      } catch(err) {
        console.warn('Direct server claim profit error or timeout:', err);
      }

      // 3. Resilient Local Claim Fallback (if server timed out or unreachable)
      if (!serverClaimSucceeded) {
        if (userInvs.length === 0) {
          return { success: false, message: 'Anda belum memiliki paket investasi aktif.' };
        }

        const nowIso = new Date().toISOString();
        let totalClaimed = 0;

        userInvs.forEach(inv => {
          let profit = Number(inv.pendingProfitClaim) || 0;
          if (profit <= 0) {
            const minR = Number(inv.minRate) || 1.0;
            const maxR = Number(inv.maxRate) || 2.0;
            const rate = minR + Math.random() * (maxR - minR);
            profit = Math.floor((Number(inv.capital) * rate) / 100);
          }
          totalClaimed += profit;
          inv.totalProfitEarned = (inv.totalProfitEarned || 0) + profit;
          inv.pendingProfitClaim = 0;
          inv.lastProfitYieldDate = nowIso;
          inv.daysElapsed = (inv.daysElapsed || 0) + 1;
          if (inv.daysElapsed >= inv.durationDays) {
            inv.status = 'completed';
            inv.completedAt = nowIso;
            inv.refundReady = true;
            if (inv.capitalReturned === undefined) inv.capitalReturned = false;
          }
        });

        if (totalClaimed <= 0) {
          return { success: false, message: 'Belum ada dividen profit yang siap diklaim.' };
        }

        user.walletBalance = (Number(user.walletBalance) || 0) + totalClaimed;
        user.points = (Number(user.points) || 0) + 2;

        const trxId = 'TRX-PRF-' + Math.floor(100000 + Math.random() * 900000);
        const profitTrx = {
          id: trxId,
          userId: user.id,
          username: user.username,
          type: 'profit_claim',
          amount: totalClaimed,
          netAmount: totalClaimed,
          walletSource: 'Wallet Balance',
          note: `Klaim profit harian paket investasi aktif (${DB.formatIDR(totalClaimed)})`,
          status: 'approved',
          createdAt: nowIso
        };

        db.transactions = db.transactions || [];
        db.transactions.unshift(profitTrx);
        await DB.save(db);

        if (typeof DB.syncToCloud === 'function') {
          setTimeout(() => DB.syncToCloud(), 100);
        }

        return {
          success: true,
          amount: totalClaimed,
          walletBalance: user.walletBalance,
          transaction: profitTrx,
          message: `Klaim profit harian sebesar ${DB.formatIDR(totalClaimed)} berhasil masuk ke Saldo Utama!`
        };
      }
    } finally {
      this._claimLocks[userId] = false;
    }
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
  async processContractRefund(investmentId, userId) {
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

    await DB.save(db);

    return {
      success: true,
      amount: refundAmount,
      amountRefunded: refundAmount,
      message: `Proses refund berhasil! Modal sebesar ${DB.formatIDR(refundAmount)} telah dikembalikan ke Saldo Utama Anda. Saldo sekarang dapat ditarik (WD) atau digunakan untuk mengaktifkan paket kembali.`
    };
  },

  // Process all pending refundable contracts for user
  async processAllContractRefunds(userId) {
    const refundables = this.getRefundableInvestments(userId);
    if (refundables.length === 0) {
      return { success: false, message: 'Tidak ada saldo modal kontrak selesai yang perlu direfund saat ini.' };
    }

    let totalRefunded = 0;
    for (const inv of refundables) {
      const res = await this.processContractRefund(inv.id, userId);
      if (res.success) {
        totalRefunded += res.amount;
      }
    }

    return {
      success: true,
      amount: totalRefunded,
      message: `Total modal sebesar ${DB.formatIDR(totalRefunded)} berhasil diproses dan masuk ke Saldo Utama Anda! Saldo sekarang dapat di-WD atau diaktifkan kembali.`
    };
  },

  // Leaderboard: Top Sponsors (Realtime Database Members Only)
  // Actual sponsor bonus paid to a member (leaderboard source of truth).
  // Sum of approved sponsor_bonus transactions; affiliateBalance is only a
  // fallback for accounts whose balance was later transferred out.
  // The old formula (balance + 10% team turnover) double-counted bonus that
  // was never paid and inflated the leaderboard values.
  getSponsorBonusTotal(user) {
    if (!user) return 0;
    const db = DB.get();
    const fromTx = (db.transactions || [])
      .filter(t => t.userId === user.id && t.type === 'sponsor_bonus' && (t.status || 'approved') === 'approved')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    if (fromTx > 0) return fromTx;
    return Number(user.affiliateBalance) || 0;
  },

  maskUsername(username) {
    if (!username || typeof username !== 'string') return 'memxxx';
    const clean = username.trim();
    if (clean.length <= 3) return clean.slice(0, 1) + 'xxx';
    return clean.slice(0, 3) + 'xxx';
  },

  getTopSponsors(limit = 10) {
    const db = DB.get();
    // Every account with sponsor activity takes part (including Admin VIP) -
    // filtering out role=admin hid the top sponsor from the leaderboard.
    const realUsers = (db.users || []).filter(u => u.username);
    
    const sponsorStats = realUsers.map(u => {
      const downlines = Affiliate.getDownlines(u.referralCode || '');
      const directCount = downlines.level1 ? downlines.level1.length : 0;
      const totalTeam = downlines.totalMembers || 0;
      const turnover = downlines.totalTeamTurnover || 0;
      const commission = this.getSponsorBonusTotal(u);
      let badge = 'Member Aktif';
      if (turnover >= 500000000) badge = 'Crown Diamond';
      else if (turnover >= 100000000) badge = 'Gold Master';
      else if (turnover >= 25000000) badge = 'Silver Pro';
      else if (directCount >= 5) badge = 'Super Sponsor';
      else if (directCount >= 1) badge = 'Rising Star';

      return {
        id: u.id,
        username: u.username,
        maskedUsername: this.maskUsername(u.username),
        fullName: u.fullName || u.username,
        directCount,
        sponsorCount: directCount,
        totalTeam,
        turnover,
        commission,
        badge
      };
    });

    // Rank by bonus sponsor actually paid, then by team size
    sponsorStats.sort((a, b) =>
      (b.commission - a.commission) ||
      (b.turnover - a.turnover) ||
      (b.directCount - a.directCount)
    );
    return sponsorStats.slice(0, limit);
  },

  // Leaderboard: Top Profit (Realtime Database Members Only)
  getTopProfits(limit = 10) {
    const db = DB.get();
    const realUsers = (db.users || []).filter(u => u && u.username && u.role !== 'admin' && u.status !== 'blocked');
    const investments = db.investments || [];
    const transactions = db.transactions || [];

    const userProfits = realUsers.map(u => {
      const userInvs = investments.filter(i => i.userId === u.id);
      const userPrfTxs = transactions.filter(t => 
        t.userId === u.id && 
        (t.type === 'profit_claim' || (t.id && String(t.id).startsWith('TRX-PRF-'))) &&
        (t.status === 'approved' || !t.status)
      );
      const txProfit = userPrfTxs.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
      const invProfit = userInvs.reduce((sum, i) => sum + (Number(i.totalProfitEarned) || 0), 0);
      const totalProfit = Math.max(txProfit, invProfit);
      const totalCap = userInvs.reduce((sum, i) => sum + (Number(i.capital) || 0), 0);
      const activePlans = userInvs.filter(i => i.status === 'active');
      const activePlan = activePlans.length > 0 
        ? String(activePlans[0].planName || 'VIP Pro').trim() 
        : (userInvs.length > 0 ? 'Kontrak Selesai' : 'Belum Ada Paket');

      return {
        id: u.id,
        username: u.username,
        maskedUsername: this.maskUsername(u.username),
        fullName: u.fullName || u.username,
        totalProfit,
        totalCapital: totalCap,
        activePlansCount: activePlans.length,
        activePlan,
        winRate: totalProfit > 0 ? 98.8 : 98.4
      };
    });

    // Sort strictly: 1. Highest Total Profit, 2. Highest Capital, 3. Active Plans Count
    userProfits.sort((a, b) => 
      (b.totalProfit - a.totalProfit) || 
      (b.totalCapital - a.totalCapital) || 
      (b.activePlansCount - a.activePlansCount)
    );

    return userProfits.slice(0, limit);
  }
};
