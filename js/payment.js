/**
 * AUTOTRADING - PAYMENT GATEWAY (LOCAL BANK, QRIS, & USDT)
 * Handles deposit transactions, withdrawal requests, unique nominal codes,
 * exchange rate conversions, and transaction processing.
 */

import { DB } from './db.js';

export const Payment = {
  // Submit Deposit Request (Bank, QRIS, USDT)
  async createDepositRequest({ userId, method, bankId, amount, amountUsdt, txid, proofImage }) {
    const db = DB.get();
    const user = DB.getUserById(userId);
    if (!user) return { success: false, message: 'User tidak ditemukan' };
    if (user.isBlocked) return { success: false, message: 'Akun Anda sedang diblokir oleh Administrator. Transaksi deposit ditolak.' };

    let finalAmount = Number(amount);
    let uniqueCode = 0;

    if (method === 'qris' || method === 'bank') {
      if (isNaN(finalAmount) || finalAmount < db.settings.minDeposit) {
        return { success: false, message: `Minimal deposit adalah ${DB.formatIDR(db.settings.minDeposit)}` };
      }
      // Generate 3-digit unique code for fast matching
      uniqueCode = Math.floor(100 + Math.random() * 899);
      finalAmount += uniqueCode;
    } else if (method === 'usdt') {
      const usdtAmt = Number(amountUsdt);
      if (isNaN(usdtAmt) || usdtAmt <= 0) {
        return { success: false, message: 'Jumlah USDT tidak valid!' };
      }
      finalAmount = Math.floor(usdtAmt * db.settings.usdIdrRate);
      if (!txid) {
        return { success: false, message: 'Harap masukkan Transaction Hash / TXID bukti transfer USDT!' };
      }
    }

    let methodDisplay = 'Transfer Bank';
    if (method === 'bank' && bankId) {
      const bankObj = db.settings.paymentGateways && db.settings.paymentGateways.banks ? db.settings.paymentGateways.banks.find(b => b.id === bankId) : null;
      let bCode = (bankId || 'BCA').toUpperCase();
      if (bankObj && bankObj.name) {
        const m = bankObj.name.match(/\(([^)]+)\)/);
        if (m) {
          bCode = m[1];
        } else {
          bCode = bankObj.name.replace(/Bank /i, '').trim();
        }
      }
      methodDisplay = `Transfer Bank ${bCode}`;
    } else if (method === 'qris') {
      methodDisplay = 'QRIS Instant';
    } else if (method === 'usdt') {
      methodDisplay = 'USDT TRC20';
    }

    const transactionId = 'TRX-DEP-' + Math.floor(100000 + Math.random() * 900000);
    const newTrx = {
      id: transactionId,
      userId: user.id,
      username: user.username,
      type: 'deposit',
      paymentMethod: methodDisplay,
      amount: finalAmount,
      amountUsdt: amountUsdt ? Number(amountUsdt) : null,
      uniqueCode: uniqueCode,
      txid: txid || null,
      proofImage: proofImage || null,
      status: 'pending', // Pending Admin approval
      createdAt: new Date().toISOString()
    };

    // Server-side validation & persistence (min amount, sane limits, pending status).
    // Falls back to the local flow when the server is unreachable.
    const serverRes = await DB.createTransactionServer({
      id: transactionId,
      type: 'deposit',
      amount: finalAmount,
      paymentMethod: methodDisplay,
      uniqueCode,
      txid: txid || null,
      proofImage: proofImage || null,
      amountUsdt: amountUsdt ? Number(amountUsdt) : null
    });
    if (serverRes && serverRes.success === false) {
      return { success: false, message: serverRes.message };
    }
    if (serverRes && serverRes.success && serverRes.transaction) {
      Object.assign(newTrx, serverRes.transaction);
    }

    db.transactions.unshift(newTrx);
    await DB.save(db);

    return {
      success: true,
      transaction: newTrx,
      message: `Permintaan deposit ${DB.formatIDR(finalAmount)} berhasil dibuat! Menunggu konfirmasi.`
    };
  },

  // Check if Withdrawal system is currently open according to schedule and master toggle
  isWithdrawOpen() {
    const db = DB.get();
    const sched = db.settings.withdrawSchedule || { enabled: true, startHour: 9, endHour: 21 };
    
    // Master switch OFF
    if (sched.enabled === false) {
      return {
        isOpen: false,
        schedule: sched,
        message: sched.offMessage || 'Layanan penarikan saldo (WD) saat ini sedang dinonaktifkan sementara (OFF) oleh Administrator.'
      };
    }

    // Check WIB hour (Asia/Jakarta)
    const now = new Date();
    let wibHours = (now.getUTCHours() + 7) % 24;
    try {
      const wibHourStr = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', hour: 'numeric', hour12: false }).format(now);
      wibHours = parseInt(wibHourStr, 10);
    } catch(e) {}
    const startHour = Number(sched.startHour !== undefined ? sched.startHour : 9);
    const endHour = Number(sched.endHour !== undefined ? sched.endHour : 21);

    if (wibHours < startHour || wibHours >= endHour) {
      const formatH = (h) => String(h).padStart(2, '0') + ':00';
      return {
        isOpen: false,
        schedule: sched,
        message: `Layanan penarikan dana (WD) buka setiap hari pukul ${formatH(startHour)} - ${formatH(endHour)} WIB. Saat ini jam operasional sedang tutup.`
      };
    }

    return { isOpen: true, schedule: sched, message: 'Layanan penarikan dana (WD) sedang buka.' };
  },

  // Get breakdown of locked invested capital vs free withdrawable balance
  getWithdrawableBalance(userId) {
    const user = DB.getUserById(userId);
    if (!user) return { freeBalance: 0, lockedCapital: 0, affiliateBalance: 0 };
    const db = DB.get();
    
    // Active investments + completed investments awaiting manual refund
    const lockedInvestments = (db.investments || []).filter(i => {
      return i.userId === userId && (i.status === 'active' || (i.status === 'completed' && i.capitalReturned !== true));
    });
    const lockedCapital = lockedInvestments.reduce((sum, i) => sum + (Number(i.capital || i.amount) || 0), 0);
    return {
      freeBalance: user.walletBalance || 0,
      lockedCapital: lockedCapital,
      affiliateBalance: user.affiliateBalance || 0
    };
  },

  // Submit Withdrawal Request
  async createWithdrawRequest({ userId, walletType, method, bankName, accountNumber, accountHolder, amount }) {
    const db = DB.get();
    const user = DB.getUserById(userId);
    if (!user) return { success: false, message: 'User tidak ditemukan' };
    if (user.isBlocked) return { success: false, message: 'Akun Anda sedang diblokir oleh Administrator. Permintaan penarikan ditolak.' };

    // Check withdrawal schedule / status
    const wdStatus = this.isWithdrawOpen();
    if (!wdStatus.isOpen) {
      return { success: false, message: wdStatus.message };
    }

    const parsedAmount = Number(amount);
    if (isNaN(parsedAmount) || parsedAmount < db.settings.minWithdraw) {
      return { success: false, message: `Minimal penarikan adalah ${DB.formatIDR(db.settings.minWithdraw)}` };
    }

    // Determine balance source
    const isAffiliate = walletType === 'affiliate';
    const sourceBalance = isAffiliate ? user.affiliateBalance : user.walletBalance;

    if (sourceBalance < parsedAmount) {
      return {
        success: false,
        message: `Saldo tidak mencukupi! Anda memiliki ${DB.formatIDR(sourceBalance)}`
      };
    }

    if (!accountNumber || !accountHolder) {
      return { success: false, message: 'Harap lengkapi nomor rekening/wallet dan nama pemilik!' };
    }

    // Anti-Multi-Account Guard: Rekening Bank Ganda
    const cleanDstAcc = String(accountNumber || '').trim().replace(/[^0-9a-zA-Z]/g, '');
    const dupBankUser = (db.users || []).find(u =>
      u.id !== userId &&
      u.bankAccount &&
      String(u.bankAccount.accountNumber || '').trim().replace(/[^0-9a-zA-Z]/g, '') === cleanDstAcc
    );
    if (dupBankUser) {
      return {
        success: false,
        isDuplicateBank: true,
        message: `⚠️ PENARIKAN DITOLAK (REKENING GANDA): Nomor rekening tujuan (${accountNumber}) sudah terdaftar pada akun lain (${dupBankUser.username}). Demi kepatuhan anti-fraud, 1 nomor rekening bank hanya berlaku untuk 1 akun!`
      };
    }

    // Calculate admin fee (10% standard admin fee)
    const feePercent = db.settings.withdrawFeePercent !== undefined ? Number(db.settings.withdrawFeePercent) : 10.0;
    const feeAmount = Math.floor((parsedAmount * feePercent) / 100);
    const netAmount = parsedAmount - feeAmount;

    // Deduct user balance immediately
    if (isAffiliate) {
      user.affiliateBalance -= parsedAmount;
    } else {
      user.walletBalance -= parsedAmount;
    }

    let cleanBank = (bankName || 'Bank').replace(/\s*\([^)]*\)/g, '').trim();
    const transactionId = 'TRX-WDR-' + Math.floor(100000 + Math.random() * 900000);
    const newTrx = {
      id: transactionId,
      userId: user.id,
      username: user.username,
      type: 'withdraw',
      walletSource: isAffiliate ? 'Wallet Tambah Teman' : 'Wallet Balance',
      paymentMethod: method === 'usdt' ? 'USDT Withdrawal' : `${cleanBank} (${accountNumber})`,
      destinationAccount: `${accountHolder} - ${accountNumber}`,
      amount: parsedAmount,
      fee: feeAmount,
      netAmount: netAmount,
      status: 'pending', // Pending Admin approval
      createdAt: new Date().toISOString()
    };

    // Server-side validation (min WD, schedule, fee, balance, duplicate bank) and
    // authoritative balance deduction. Falls back to local flow when offline.
    const serverRes = await DB.createTransactionServer({
      id: transactionId,
      type: 'withdraw',
      walletType: isAffiliate ? 'affiliate' : 'main',
      method: method || 'bank',
      bankName: bankName || '',
      accountNumber: accountNumber || '',
      accountHolder: accountHolder || '',
      amount: parsedAmount
    });
    if (serverRes && serverRes.success === false) {
      // Roll back the optimistic local deduction
      if (isAffiliate) {
        user.affiliateBalance += parsedAmount;
      } else {
        user.walletBalance += parsedAmount;
      }
      return { success: false, message: serverRes.message };
    }
    if (serverRes && serverRes.success && serverRes.transaction) {
      Object.assign(newTrx, serverRes.transaction);
      if (typeof serverRes.walletBalance === 'number') user.walletBalance = serverRes.walletBalance;
      if (typeof serverRes.affiliateBalance === 'number') user.affiliateBalance = serverRes.affiliateBalance;
    }

    db.transactions.unshift(newTrx);
    await DB.save(db);

    return {
      success: true,
      transaction: newTrx,
      message: `Permintaan penarikan ${DB.formatIDR(parsedAmount)} (Diterima: ${DB.formatIDR(netAmount)}) berhasil dikirim!`
    };
  },

  // Get user transaction history
  getUserTransactions(userId, filterType = 'all') {
    const db = DB.get();
    let list = db.transactions.filter(t => t.userId === userId);
    if (filterType !== 'all') {
      list = list.filter(t => t.type === filterType);
    }
    return list;
  },

  // Get live member deposits for running text ticker
  getLiveMemberDeposits() {
    const db = DB.get();
    return (db.transactions || [])
      .filter(t => t.type === 'deposit')
      .map(t => {
        let status = 'Diproses';
        if (t.status === 'approved') status = 'Sukses';
        else if (t.status === 'rejected') status = 'Ditolak';
        let cleanMethod = (t.paymentMethod || 'Bank Transfer').trim();
        cleanMethod = cleanMethod.replace(/\)+/g, ')').replace(/\(+/g, '(');
        if (/BCA/i.test(cleanMethod)) cleanMethod = 'Transfer BCA';
        else if (/BRI/i.test(cleanMethod)) cleanMethod = 'Transfer BRI';
        else if (/BNI/i.test(cleanMethod)) cleanMethod = 'Transfer BNI';
        else if (/Mandiri/i.test(cleanMethod)) cleanMethod = 'Transfer Mandiri';
        else if (/QRIS/i.test(cleanMethod)) cleanMethod = 'QRIS Instant';
        else if (/USDT/i.test(cleanMethod)) cleanMethod = 'USDT TRC20';
        return {
          username: t.username ? (t.username.substring(0, 3) + '***') : 'Member***',
          amount: t.amount,
          method: cleanMethod,
          status,
          timeAgo: 'Baru saja'
        };
      });
  },

  // Get live member withdrawals for running text ticker
  getLiveMemberWithdrawals() {
    const db = DB.get();
    return (db.transactions || [])
      .filter(t => t.type === 'withdraw')
      .map(t => {
        let status = 'Diproses';
        if (t.status === 'approved') status = 'Sukses Masuk';
        else if (t.status === 'rejected') status = 'Ditolak';
        let cleanMethod = (t.paymentMethod || 'Bank Transfer').trim();
        cleanMethod = cleanMethod.replace(/\)+/g, ')').replace(/\(+/g, '(');
        if (/BCA/i.test(cleanMethod)) cleanMethod = 'Bank BCA';
        else if (/BRI/i.test(cleanMethod)) cleanMethod = 'Bank BRI';
        else if (/BNI/i.test(cleanMethod)) cleanMethod = 'Bank BNI';
        else if (/Mandiri/i.test(cleanMethod)) cleanMethod = 'Bank Mandiri';
        else if (/USDT/i.test(cleanMethod)) cleanMethod = 'USDT TRC20';
        return {
          username: t.username ? (t.username.substring(0, 3) + '***') : 'Member***',
          amount: t.amount,
          method: cleanMethod,
          status,
          timeAgo: 'Baru saja'
        };
      });
  }
};
