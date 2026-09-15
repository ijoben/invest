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

    const transactionId = 'TRX-DEP-' + Math.floor(100000 + Math.random() * 900000);
    const newTrx = {
      id: transactionId,
      userId: user.id,
      username: user.username,
      type: 'deposit',
      paymentMethod: method.toUpperCase() + (bankId ? ` (${bankId.toUpperCase()})` : ''),
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

  // Submit Withdrawal Request
  createWithdrawRequest({ userId, walletType, method, bankName, accountNumber, accountHolder, amount }) {
    const db = DB.get();
    const user = DB.getUserById(userId);
    if (!user) return { success: false, message: 'User tidak ditemukan' };

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
