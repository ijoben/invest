/**
 * FGT PRO - PAYMENT GATEWAY (LOCAL BANK, QRIS, & USDT)
 * Handles deposit transactions, withdrawal requests, unique nominal codes,
 * exchange rate conversions, and transaction processing.
 */

import { DB } from './db.js';

export const Payment = {
  // Submit Deposit Request (Bank, QRIS, USDT)
  createDepositRequest({ userId, method, bankId, amount, amountUsdt, txid, proofImage }) {
    const db = DB.get();
    const user = DB.getUserById(userId);
    if (!user) return { success: false, message: 'User tidak ditemukan' };

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

    let bankDisplay = '';
    if (method === 'bank' && bankId && db.settings.paymentGateways && db.settings.paymentGateways.banks) {
      const bankObj = db.settings.paymentGateways.banks.find(b => b.id === bankId);
      bankDisplay = bankObj ? ` (${bankObj.name})` : ` (${bankId.toUpperCase()})`;
    } else if (method === 'qris') {
      const qrisObj = db.settings.paymentGateways && db.settings.paymentGateways.qris;
      bankDisplay = qrisObj && qrisObj.merchantName ? ` (${qrisObj.merchantName})` : '';
    }

    const transactionId = 'TRX-DEP-' + Math.floor(100000 + Math.random() * 900000);
    const newTrx = {
      id: transactionId,
      userId: user.id,
      username: user.username,
      type: 'deposit',
      paymentMethod: (method === 'qris' ? 'QRIS Instant' : (method === 'usdt' ? 'USDT TRC20' : 'Bank Transfer')) + bankDisplay,
      amount: finalAmount,
      amountUsdt: amountUsdt ? Number(amountUsdt) : null,
      uniqueCode: uniqueCode,
      txid: txid || null,
      proofImage: proofImage || null,
      status: 'pending', // Pending Admin approval
      createdAt: new Date().toISOString()
    };

    db.transactions.unshift(newTrx);
    DB.save(db);

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
        message: sched.offMessage || 'Layanan penarikan saldo (WD) saat ini sedang dinonaktifkan sementara oleh Admin.'
      };
    }

    // Check WIB hour (UTC+7)
    const now = new Date();
    const wibHours = (now.getUTCHours() + 7) % 24;
    const startHour = Number(sched.startHour !== undefined ? sched.startHour : 9);
    const endHour = Number(sched.endHour !== undefined ? sched.endHour : 21);

    if (wibHours < startHour || wibHours >= endHour) {
      const formatH = (h) => String(h).padStart(2, '0') + ':00';
      return {
        isOpen: false,
        message: `Layanan penarikan dana (WD) buka setiap hari pukul ${formatH(startHour)} - ${formatH(endHour)} WIB. Saat ini jam operasional sedang tutup.`
      };
    }

    return { isOpen: true, message: 'Layanan penarikan dana (WD) sedang buka.' };
  },

  // Get breakdown of locked invested capital vs free withdrawable balance
  getWithdrawableBalance(userId) {
    const user = DB.getUserById(userId);
    if (!user) return { freeBalance: 0, lockedCapital: 0, affiliateBalance: 0 };
    const db = DB.get();
    const activeInvestments = (db.investments || []).filter(i => i.userId === userId && i.status === 'active');
    const lockedCapital = activeInvestments.reduce((sum, i) => sum + (Number(i.capital || i.amount) || 0), 0);
    return {
      freeBalance: user.walletBalance || 0,
      lockedCapital: lockedCapital,
      affiliateBalance: user.affiliateBalance || 0
    };
  },

  // Submit Withdrawal Request
  createWithdrawRequest({ userId, walletType, method, bankName, accountNumber, accountHolder, amount }) {
    const db = DB.get();
    const user = DB.getUserById(userId);
    if (!user) return { success: false, message: 'User tidak ditemukan' };

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

    // Calculate admin fee
    const feePercent = db.settings.withdrawFeePercent || 1.0;
    const feeAmount = Math.floor((parsedAmount * feePercent) / 100);
    const netAmount = parsedAmount - feeAmount;

    // Deduct user balance immediately
    if (isAffiliate) {
      user.affiliateBalance -= parsedAmount;
    } else {
      user.walletBalance -= parsedAmount;
    }

    const transactionId = 'TRX-WD-' + Math.floor(100000 + Math.random() * 900000);
    const newTrx = {
      id: transactionId,
      userId: user.id,
      username: user.username,
      type: 'withdraw',
      walletSource: isAffiliate ? 'Wallet Tambah Teman' : 'Wallet Balance',
      paymentMethod: method === 'usdt' ? 'USDT Withdrawal' : `${bankName} (${accountNumber})`,
      destinationAccount: `${accountHolder} - ${accountNumber}`,
      amount: parsedAmount,
      fee: feeAmount,
      netAmount: netAmount,
      status: 'pending', // Pending Admin approval
      createdAt: new Date().toISOString()
    };

    db.transactions.unshift(newTrx);
    DB.save(db);

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
  }
};
