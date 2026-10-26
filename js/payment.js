/**
 * AUTOTRADING - PAYMENT GATEWAY (LOCAL BANK, QRIS, & USDT)
 * Handles deposit transactions, withdrawal requests, unique nominal codes,
 * exchange rate conversions, and transaction processing.
 */

import { DB } from './db.js';

export const Payment = {
  // Masa berlaku nomor tiket deposit: 24 jam.
  // Samakan dengan deposit_ticket / ticket expiry di api/index.php (86400 detik).
  DEPOSIT_TICKET_TTL_MS: 24 * 60 * 60 * 1000,

  // ===== NOMOR TIKET DEPOSIT (dibuat SEBELUM member transfer) =====
  // Mengunci nominal transfer PERSIS (basis + kode unik 3 digit) agar nomor
  // tiket muncul di depan: member transfer dulu sesuai nominal, baru upload bukti.
  async createDepositTicket({ userId, amount, method, bankId }) {
    const db = DB.get();
    const user = DB.getUserById(userId);
    if (!user) return { success: false, message: 'User tidak ditemukan' };
    if (user.isBlocked) return { success: false, message: 'Akun Anda sedang diblokir oleh Administrator.' };

    if (method !== 'bank' && method !== 'qris') {
      return { success: false, message: 'Metode deposit ini tidak memerlukan nomor tiket.' };
    }
    const baseAmount = Math.floor(Number(amount));
    if (isNaN(baseAmount) || baseAmount < db.settings.minDeposit) {
      return { success: false, message: `Minimal deposit adalah ${DB.formatIDR(db.settings.minDeposit)}` };
    }

    // Pengaman: satu deposit diproses dalam satu waktu. Bila deposit sebelumnya
    // masih menunggu konfirmasi admin, jangan buat nomor tiket baru.
    const pendingDep = this.getPendingDeposit(user.id);
    if (pendingDep) {
      return {
        success: false,
        code: 'DEPOSIT_PENDING',
        message: `Masih ada deposit ${DB.formatIDR(pendingDep.amount)} (${pendingDep.id}) yang menunggu konfirmasi admin. Tunggu sampai transaksi tersebut SUKSES atau DITOLAK sebelum membuat deposit baru.`
      };
    }

    // Rekening yang dimatikan admin tidak boleh dipakai membuat tiket
    if (method === 'bank') {
      const activeBanks = ((db.settings.paymentGateways || {}).banks || []).filter(b => b.active !== false);
      if (activeBanks.length === 0) {
        return { success: false, message: 'Saluran deposit Transfer Bank sedang dinonaktifkan oleh Administrator.' };
      }
      if (bankId && !activeBanks.some(b => b.id === bankId)) {
        return { success: false, message: 'Rekening bank yang dipilih sedang dinonaktifkan. Silakan pilih rekening lain.' };
      }
    }

    const serverRes = await DB.createDepositTicketServer({ amount: baseAmount, method, bankId: bankId || '' });
    if (serverRes && serverRes.success && serverRes.transaction) {
      return { success: true, transaction: serverRes.transaction, offline: false };
    }
    if (serverRes && serverRes.success === false) {
      return { success: false, message: serverRes.message };
    }

    // Server tidak terjangkau -> tiket lokal (nominal tetap terkunci; diverifikasi
    // ulang oleh server saat member mengirim bukti).
    let methodDisplay = 'Transfer Bank';
    if (method === 'qris') {
      methodDisplay = 'QRIS Instant';
    } else if (bankId) {
      const bankObj = ((db.settings.paymentGateways || {}).banks || []).find(b => b.id === bankId);
      if (bankObj && bankObj.name) {
        const m = bankObj.name.match(/\(([^)]+)\)/);
        methodDisplay = 'Transfer Bank ' + (m ? m[1] : bankObj.name.replace(/Bank /i, '').trim());
      }
    }
    const uniqueCode = Math.floor(100 + Math.random() * 899);
    const localTicket = {
      id: 'TRX-DEP-' + Math.floor(100000 + Math.random() * 900000),
      userId: user.id,
      username: user.username,
      type: 'deposit',
      paymentMethod: methodDisplay,
      destinationAccount: method === 'bank' ? (bankId || '') : '',
      amount: baseAmount + uniqueCode,
      uniqueCode,
      txid: null,
      proofImage: null,
      status: 'awaiting_payment',
      offlineTicket: true,
      createdAt: new Date().toISOString()
    };
    // Satu tiket aktif per akun (samakan dengan perilaku server)
    db.transactions = (db.transactions || []).filter(t =>
      !(t.type === 'deposit' && t.status === 'awaiting_payment' && t.userId === user.id));
    db.transactions.unshift(localTicket);
    await DB.save(db);
    return { success: true, transaction: localTicket, offline: true };
  },

  isDepositTicketExpired(t) {
    if (!t) return true;
    const created = new Date(t.createdAt || t.date || 0).getTime();
    if (!created) return true;
    return (Date.now() - created) > this.DEPOSIT_TICKET_TTL_MS;
  },

  getActiveDepositTicket(userId) {
    const db = DB.get();
    const tickets = (db.transactions || []).filter(t =>
      t.type === 'deposit' && t.status === 'awaiting_payment' && t.userId === userId && !this.isDepositTicketExpired(t));
    if (tickets.length === 0) return null;
    tickets.sort((a, b) => new Date(b.createdAt || b.date || 0) - new Date(a.createdAt || a.date || 0));
    return tickets[0];
  },

  // Deposit yang bukti transfernya sudah dikirim dan masih menunggu keputusan
  // admin. Selama baris ini ada, member tidak boleh membuat deposit baru agar
  // riwayat tidak dipenuhi transaksi ganda.
  getPendingDeposit(userId) {
    const db = DB.get();
    const pending = (db.transactions || []).filter(t =>
      t.type === 'deposit' && t.userId === userId && (t.status === 'pending' || t.status === 'processing'));
    if (pending.length === 0) return null;
    pending.sort((a, b) => new Date(b.createdAt || b.date || 0) - new Date(a.createdAt || a.date || 0));
    return pending[0];
  },

  // Submit Deposit Request (Bank, QRIS, USDT)
  async createDepositRequest({ userId, method, bankId, amount, amountUsdt, txid, proofImage, ticketId, ticket }) {
    const db = DB.get();
    const user = DB.getUserById(userId);
    if (!user) return { success: false, message: 'User tidak ditemukan' };
    if (user.isBlocked) return { success: false, message: 'Akun Anda sedang diblokir oleh Administrator. Transaksi deposit ditolak.' };

    const gateways = db.settings.paymentGateways || {};
    if (method === 'qris' && gateways.qris && gateways.qris.active === false) {
      return { success: false, message: 'Saluran deposit QRIS sedang dinonaktifkan oleh Administrator.' };
    }
    if (method === 'usdt' && gateways.usdt && gateways.usdt.active === false) {
      return { success: false, message: 'Saluran deposit Crypto USDT sedang dinonaktifkan oleh Administrator.' };
    }
    if (method === 'bank') {
      const activeBanks = (gateways.banks || []).filter(b => b.active !== false);
      if (activeBanks.length === 0) {
        return { success: false, message: 'Saluran deposit Transfer Bank sedang dinonaktifkan oleh Administrator.' };
      }
      if (bankId && !activeBanks.some(b => b.id === bankId)) {
        return { success: false, message: 'Rekening bank yang dipilih sedang dinonaktifkan. Silakan pilih rekening lain.' };
      }
    }

    // Pengaman deposit ganda: jangan kirim bukti kedua saat yang lama masih diproses
    const pendingDep = this.getPendingDeposit(user.id);
    if (pendingDep && pendingDep.id !== ticketId) {
      return {
        success: false,
        code: 'DEPOSIT_PENDING',
        message: `Masih ada deposit ${DB.formatIDR(pendingDep.amount)} (${pendingDep.id}) yang menunggu konfirmasi admin. Selesaikan transaksi tersebut terlebih dahulu.`
      };
    }

    let finalAmount = Number(amount);
    let uniqueCode = 0;

    if (method === 'qris' || method === 'bank') {
      if (ticket && Number(ticket.amount) > 0) {
        // Nominal sudah dikunci server saat nomor tiket dibuat -> tidak diacak ulang
        finalAmount = Number(ticket.amount);
        uniqueCode = Number(ticket.uniqueCode || 0);
      } else {
        // Alur lama (tanpa tiket / offline): generate 3-digit unique code
        uniqueCode = Math.floor(100 + Math.random() * 899);
        finalAmount += uniqueCode;
      }
      if (isNaN(finalAmount) || finalAmount < db.settings.minDeposit) {
        return { success: false, message: `Minimal deposit adalah ${DB.formatIDR(db.settings.minDeposit)}` };
      }
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

    // Nomor transaksi = nomor tiket: member sudah melihat nomor ini SEBELUM transfer
    const transactionId = (ticket && ticket.id) ? ticket.id : 'TRX-DEP-' + Math.floor(100000 + Math.random() * 900000);
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
      ticketId: ticketId || null,
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

    // Baris tiket (bila ada) harus diganti, bukan diduplikasi: ID-nya sama
    const dupTrxIdx = db.transactions.findIndex(t => t.id === newTrx.id);
    if (dupTrxIdx > -1) db.transactions.splice(dupTrxIdx, 1);
    db.transactions.unshift(newTrx);
    await DB.save(db);

    // Dispatch email notification to member & admin (Point 8)
    try {
      if (user && user.email) {
        DB.dispatchMailApi('deposit', { user, transaction: newTrx, status: 'pending' });
      }
      DB.dispatchMailApi('admin_notification', {
        type: 'deposit',
        user: { id: user.id, username: user.username, email: user.email },
        transaction: newTrx
      });
    } catch (eMail) {}

    return {
      success: true,
      transaction: newTrx,
      message: ticket
        ? `Bukti transfer untuk nomor tiket ${newTrx.id} (${DB.formatIDR(finalAmount)}) berhasil dikirim! Menunggu konfirmasi admin.`
        : `Permintaan deposit ${DB.formatIDR(finalAmount)} berhasil dibuat! Menunggu konfirmasi.`
    };
  },

  // Check if Withdrawal system is currently open according to schedule and master toggle
  isWithdrawOpen() {
    const db = DB.get();
    const sched = db.settings.withdrawSchedule || { enabled: true, startHour: 9, endHour: 15 };
    
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
    const endHour = Number(sched.endHour !== undefined ? sched.endHour : 15);

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
    if (!bankName || !String(bankName).trim()) {
      return { success: false, message: 'Nama Bank / E-Wallet / Jaringan wajib diisi!' };
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
      method: method || 'bank',
      bankName: cleanBank,
      accountNumber: String(accountNumber || '').trim(),
      accountHolder: String(accountHolder || '').trim(),
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

    // Rekening yang dipakai untuk WD ini ikut disimpan sebagai rekening profil
    // member supaya database, panel admin, dan tampilan member selalu identik.
    user.bankAccount = {
      bankName: newTrx.bankName || cleanBank,
      accountNumber: newTrx.accountNumber || String(accountNumber).trim(),
      accountHolder: newTrx.accountHolder || String(accountHolder).trim()
    };

    await DB.save(db);

    // Send email notification to member
    if (user && user.email) {
      DB.dispatchMailApi('withdraw', {
        status: 'pending',
        user: { email: user.email, username: user.username, fullName: user.fullName },
        transaction: newTrx
      });
    }

    return {
      success: true,
      transaction: newTrx,
      message: `Permintaan penarikan ${DB.formatIDR(parsedAmount)} (Diterima: ${DB.formatIDR(netAmount)}) berhasil dikirim!`
    };
  },

  // Get user transaction history (Terbaru selalu di paling atas, deduplikasi ganda)
  getUserTransactions(userId, filterType = 'all') {
    const db = DB.get();
    let list = (db.transactions || []).filter(t => t.userId === userId);
    if (filterType !== 'all') {
      list = list.filter(t => t.type === filterType);
    }
    // Deduplicate identical IDs and near-identical timestamp duplicates (<60s)
    const seenIds = new Set();
    const seenApprox = new Set();
    const cleanList = [];
    for (const t of list) {
      if (t.id) {
        if (seenIds.has(t.id)) continue;
        seenIds.add(t.id);
      }
      const tTime = new Date(t.createdAt || t.date || 0).getTime();
      const approxKey = `${t.type}_${t.amount}_${Math.floor(tTime / 60000)}`;
      if (tTime > 0 && seenApprox.has(approxKey)) {
        continue;
      }
      seenApprox.add(approxKey);
      cleanList.push(t);
    }

    return cleanList.sort((a, b) => {
      const tA = new Date(a.createdAt || a.date || 0).getTime();
      const tB = new Date(b.createdAt || b.date || 0).getTime();
      return tB - tA;
    });
  },

  // Get live member deposits for running text ticker
  getLiveMemberDeposits() {
    const db = DB.get();
    let deposits = [];
    if (Array.isArray(db.publicRecentDeposits) && db.publicRecentDeposits.length > 0) {
      deposits = db.publicRecentDeposits;
    } else if (Array.isArray(db.publicRecentTransactions) && db.publicRecentTransactions.length > 0) {
      deposits = db.publicRecentTransactions.filter(t => t.type === 'deposit');
    } else if (Array.isArray(db.transactions) && db.transactions.length > 0) {
      // Tiket yang belum dibayar (awaiting_payment) bukan deposit publik -> jangan tampil di running text
      deposits = db.transactions.filter(t => t.type === 'deposit' && t.status !== 'awaiting_payment');
    }

    if (deposits.length === 0 && DB.defaultDB && Array.isArray(DB.defaultDB.publicRecentDeposits)) {
      deposits = DB.defaultDB.publicRecentDeposits;
    }

    return deposits
      .sort((a, b) => {
        const tA = new Date(a.createdAt || a.date || 0).getTime();
        const tB = new Date(b.createdAt || b.date || 0).getTime();
        return tB - tA;
      })
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
        else if (/DANA/i.test(cleanMethod)) cleanMethod = 'E-Wallet DANA';
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
    let withdrawals = [];
    if (Array.isArray(db.publicRecentWithdrawals) && db.publicRecentWithdrawals.length > 0) {
      withdrawals = db.publicRecentWithdrawals;
    } else if (Array.isArray(db.publicRecentTransactions) && db.publicRecentTransactions.length > 0) {
      withdrawals = db.publicRecentTransactions.filter(t => t.type === 'withdraw');
    } else if (Array.isArray(db.transactions) && db.transactions.length > 0) {
      withdrawals = db.transactions.filter(t => t.type === 'withdraw');
    }

    if (withdrawals.length === 0 && DB.defaultDB && Array.isArray(DB.defaultDB.publicRecentWithdrawals)) {
      withdrawals = DB.defaultDB.publicRecentWithdrawals;
    }

    return withdrawals
      .sort((a, b) => {
        const tA = new Date(a.createdAt || a.date || 0).getTime();
        const tB = new Date(b.createdAt || b.date || 0).getTime();
        return tB - tA;
      })
      .map(t => {
        let status = 'Diproses';
        if (t.status === 'approved') status = 'Sukses Masuk';
        else if (t.status === 'rejected') status = 'Ditolak';
        let cleanMethod = (t.paymentMethod || t.destinationAccount || 'Bank Transfer').trim();
        cleanMethod = cleanMethod.replace(/\)+/g, ')').replace(/\(+/g, '(');
        if (/BCA/i.test(cleanMethod) && !/\d{4,}/.test(cleanMethod)) cleanMethod = 'Bank BCA';
        else if (/BRI/i.test(cleanMethod) && !/\d{4,}/.test(cleanMethod)) cleanMethod = 'Bank BRI';
        else if (/BNI/i.test(cleanMethod) && !/\d{4,}/.test(cleanMethod)) cleanMethod = 'Bank BNI';
        else if (/Mandiri/i.test(cleanMethod) && !/\d{4,}/.test(cleanMethod)) cleanMethod = 'Bank Mandiri';
        else if (/USDT/i.test(cleanMethod)) cleanMethod = 'USDT TRC20';

        // Clean up legacy polluted masking artifacts (****XXX, ****XXX****XXX)
        cleanMethod = cleanMethod.replace(/(?:\b|DANA\s*\(?)4619[xX]{3}\)?/gi, 'DANA (081274619XXX)');
        cleanMethod = cleanMethod.replace(/(\b\d{4})5345678[xX]{3}/gi, '$1234XXX');
        cleanMethod = cleanMethod.replace(/(08\d{2})[\*]+[xX]+/gi, (m, g1) => g1 + '74619XXX');
        cleanMethod = cleanMethod.replace(/(\b\d{4})[\*]+[xX]+/gi, (m, g1) => g1 + '234XXX');
        cleanMethod = cleanMethod.replace(/(\*+[xX]+)+/g, '5345678XXX');
        cleanMethod = cleanMethod.replace(/\s*\((?:XXX|xxx)\)/gi, ' (5345678XXX)');

        // Only mask trailing 3 digits of DANA phone numbers and bank account numbers with XXX
        cleanMethod = cleanMethod.replace(/(?:(TRX-[A-Z0-9-]+)|ID:\s*(\d+)|(\b(?:08|\+628|628)\d{7,13}\b)|(\b\d{4,24}\b))/gi, (full, trx, idNum, phoneNum, accNum) => {
          if (trx) return trx;
          if (idNum) return 'ID: ' + idNum;
          if (phoneNum) {
            return phoneNum.slice(0, -3) + 'XXX';
          }
          if (accNum) {
            if (accNum.length <= 3) return 'XXX';
            return accNum.slice(0, -3) + 'XXX';
          }
          return full;
        });
        cleanMethod = cleanMethod.replace(/xxx/i, 'XXX');

        let uName = t.username || 'Member';
        let maskedUsername = (uName.length > 3) ? (uName.substring(0, 3) + '***') : (uName + '***');

        return {
          username: maskedUsername,
          amount: t.amount,
          method: cleanMethod,
          status,
          timeAgo: 'Baru saja'
        };
      });
  }
};
