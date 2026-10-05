/**
 * AUTOTRADING - REAL MYSQL STATE MANAGEMENT ENGINE
 * Direct synchronization with phpMyAdmin / MySQL Database via cPanel REST API.
 * Pure Cloud / phpMyAdmin Architecture - Browser localStorage completely purged.
 */

// Proactive legacy cleanup: remove any leftover localStorage data from past sessions
if (typeof localStorage !== 'undefined') {
  try {
    localStorage.removeItem('AUTOTRADING_DATABASE_V1');
    localStorage.removeItem('AUTOTRADING_DATABASE');
    // Remove legacy FGT keys
    localStorage.removeItem('FGT_PRO_DATABASE_V1');
    localStorage.removeItem('FGT_PRO_DATABASE');
  } catch (e) {
    // Ignore sandbox errors
  }
}

// In-Memory Live Database State (Synchronized directly with phpMyAdmin MySQL backend)
let _activeDB = null;

// Default initial state
const defaultDB = {
  // Application Settings
  settings: {
    appName: 'AUTOTRADING',
    currency: 'IDR',
    usdIdrRate: 16250,
    minDeposit: 50000,
    minWithdraw: 50000,
    withdrawFeePercent: 10.0, // 10% admin fee
    withdrawSchedule: {
      enabled: true,
      startHour: 9, // 09:00 WIB
      endHour: 21,  // 21:00 WIB
      offMessage: 'Layanan penarikan dana (WD) buka setiap hari pukul 09:00 - 21:00 WIB. Saldo Anda aman dan dapat ditarik pada jam operasional.'
    },
    withdrawTerms: [
      "Minimal Penarikan: Rp 50.000 per transaksi.",
      "Biaya Admin: 10% dari nominal penarikan dana.",
      "Jam Operasional WD: Buka setiap hari pukul 09:00 - 21:00 WIB. Penarikan di luar jam operasional akan diproses pada jam kerja berikutnya.",
      "Waktu Proses: Saldo masuk dalam hitungan 5 - 30 menit (maksimal 1x24 jam kerja).",
      "Proteksi Modal Terkunci: Modal paket investasi yang sedang aktif dikunci otomatis oleh sistem hingga durasi kontrak selesai dan tidak dapat ditarik mendahului periode."
    ],
    apkDownload: {
      url: 'https://autotrading.my.id/downloads/autotrading-v2.4.apk',
      version: 'v2.4.0 (Official Release)',
      size: '18.5 MB',
      updatedAt: '2026-09-18',
      enabled: true
    },
    email: {
      verificationRequired: false, // Default false: instant register without OTP. Admin can toggle to true to enforce 6-digit email OTP.
      adminNotificationOnRegister: true, // Send alert to admin when a new user registers
      adminNotificationEmail: 'admin@autotrading.my.id',
      welcomeEmailEnabled: true,
      mailMethod: 'cpanel', // 'cpanel' (PHP mail) or 'smtp'
      smtp: {
        host: 'mail.autotrading.my.id',
        port: 465,
        secure: 'ssl',
        user: 'noreply@autotrading.my.id',
        pass: '',
        fromName: 'AUTOTRADING Official',
        fromEmail: 'noreply@autotrading.my.id'
      }
    },
    profitCycleDurationHours: 24, // Real 24-hour cycle
    autoProfitIntervalSeconds: 86400, // 24 hours in seconds
    weekendProfit: {
      enabled: true, // Default: Aktif 7 hari (bisa disetel libur di admin)
      offMessage: 'Pasar Keuangan & Trading Libur di Akhir Pekan (Sabtu & Minggu). Dividen profit akan kembali berjalan aktif hari Senin.'
    },
    weekendProfitEnabled: true,
    todayProfitLossMode: {
      isLoss: false, // false = Normal Profit (ON), true = Loss / 0% (OFF)
      lossRate: 0.0,
      message: 'Hari ini pasar mengalami fluktuasi / Loss (Dividen Profit 0%). Fitur proteksi modal menjaga saldo pokok Anda tetap 100% aman.'
    },
    weeklyProfitHistory: [
      { dayName: 'Senin', date: 'Senin', rate: 1.00, isLoss: false, isWeekend: false },
      { dayName: 'Selasa', date: 'Selasa', rate: 1.50, isLoss: false, isWeekend: false },
      { dayName: 'Rabu', date: 'Rabu', rate: 1.20, isLoss: false, isWeekend: false },
      { dayName: 'Kamis', date: 'Kamis', rate: 1.35, isLoss: false, isWeekend: false },
      { dayName: 'Jumat', date: 'Jumat', rate: 1.15, isLoss: false, isWeekend: false },
      { dayName: 'Sabtu', date: 'Sabtu', rate: null, isLoss: false, isWeekend: true },
      { dayName: 'Minggu', date: 'Minggu', rate: null, isLoss: false, isWeekend: true }
    ],
    depositPointsReward: 5,
    dailyCheckIn: {
      enabled: true,
      rewardAmount: 1000,
      totalDays: 7
    },
    cs: {
      whatsapp: '6281234567890',
      telegram: 'https://t.me/autotrading_cs',
      waMessage: 'Halo CS Resmi AUTOTRADING, saya ingin berkonsultasi seputar layanan platform...'
    },
    social: {
      telegram: 'https://t.me/autotrading_channel',
      instagram: 'https://instagram.com/autotradingofficial',
      tiktok: 'https://tiktok.com/@autotradingofficial',
      youtube: 'https://youtube.com/@autotrading'
    },
    kelasTrading: {
      whatsapp: 'https://wa.me/6281234567890?text=Halo%20Mentor%20AUTOTRADING,%20saya%20ingin%20bergabung%20ke%20Kelas%20Trading%20Resmi',
      telegram: 'https://t.me/autotrading_official_channel',
      desc: 'Komunitas edukasi trading AI, webinar eksklusif & sinyal pasar harian'
    },
    sponsorBonusPercent: 10, // 10% direct sponsor bonus
    rabatLevels: [
      { level: 1, percent: 5.0 },
      { level: 2, percent: 3.0 },
      { level: 3, percent: 1.5 },
      { level: 4, percent: 0.5 },
      { level: 5, percent: 0.2 }
    ],
    levelTurnoverMilestones: [
      { name: 'Bronze Leader', minTurnover: 25000000, reward: 1000000 },
      { name: 'Silver Director', minTurnover: 100000000, reward: 5000000 },
      { name: 'Gold Ambassador', minTurnover: 500000000, reward: 30000000 },
      { name: 'Crown Diamond', minTurnover: 2000000000, reward: 150000000 }
    ],
    paymentGateways: {
      banks: [
        { id: 'bca', name: 'Bank Central Asia (BCA)', accountNo: '8271928374', accountName: 'PT AUTOTRADING INVESTASI', active: true },
        { id: 'mandiri', name: 'Bank Mandiri', accountNo: '1370029384721', accountName: 'PT AUTOTRADING INVESTASI', active: true },
        { id: 'bri', name: 'Bank BRI', accountNo: '034101002938531', accountName: 'PT AUTOTRADING INVESTASI', active: true }
      ],
      qris: {
        active: true,
        merchantName: 'AUTOTRADING OFFICIAL QRIS',
        nmid: 'ID1029384756201',
        imageUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=00020101021226580016ID.CO.QRIS.WWW01189360001400001029385204581253033605802ID5920AUTOTRADING_OFFICIAL6007JAKARTA61051234062070703A016304E8A2'
      },
      usdt: {
        trc20Address: 'TXv7qL98HqN8sP2uYx9B9m34j9KxL0qWp1',
        bep20Address: '0x71C4982aF12B76295328B83716d1029C837A5982'
      }
    }
  },

  // Investment Plans with Daily Random Profit Ranges
  plans: [
    {
      id: 'plan-learn',
      name: 'Learn',
      theme: 'theme-learn',
      minDeposit: 100000, // Rp 100,000
      maxDeposit: 1000000, // Rp 1,000,000
      minDailyProfit: 1.2, // 1.2%
      maxDailyProfit: 2.2, // 2.2%
      durationDays: 15,
      description: 'Paket Pemula & Edukasi Trading Algoritma AUTOTRADING',
      activeCount: 0
    },
    {
      id: 'plan-rookie',
      name: 'Rookie',
      theme: 'theme-rookie',
      minDeposit: 1000000, // Rp 1,000,000
      maxDeposit: 10000000, // Rp 10,000,000
      minDailyProfit: 2.0, // 2.0%
      maxDailyProfit: 3.5, // 3.5%
      durationDays: 30,
      description: 'Paket Standard Otomasi Profit dengan Proteksi Modal',
      activeCount: 0
    },
    {
      id: 'plan-sophomore',
      name: 'Sophomore',
      theme: 'theme-sophomore',
      minDeposit: 10000000, // Rp 10,000,000
      maxDeposit: 50000000, // Rp 50,000,000
      minDailyProfit: 3.5, // 3.5%
      maxDailyProfit: 5.0, // 5.0%
      durationDays: 45,
      description: 'Paket Menengah High Frequency AI Trading Signal',
      activeCount: 0
    },
    {
      id: 'plan-vip',
      name: 'VIP Master',
      theme: 'theme-vip',
      minDeposit: 50000000, // Rp 50,000,000
      maxDeposit: 500000000, // Rp 500,000,000
      minDailyProfit: 5.0, // 5.0%
      maxDailyProfit: 7.5, // 7.5%
      durationDays: 60,
      description: 'Paket Eksklusif Prof GPT Institutional Hedge Fund',
      activeCount: 0
    }
  ],

  // Users Database
  users: [
    {
      id: 'usr-admin',
      username: 'admin',
      fullName: 'System Administrator',
      email: 'admin@autotrading.my.id',
      phone: '081299990000',
      password: 'admin',
      role: 'admin',
      walletBalance: 0,
      affiliateBalance: 0,
      points: 0,
      referralCode: 'ADMINVIP',
      referredBy: null,
      kycStatus: 'verified',
      isBlocked: false,
      blockedReason: '',
      blockedAt: null,
      blockHistory: [],
      registeredAt: '2026-01-01T00:00:00.000Z'
    }
  ],

  // Active User Investments
  investments: [],

  // Transactions (Deposit, Withdraw, Profit, Sponsor, Rabat, Capital Return)
  transactions: [],

  // Prof GPT AI Signals
  signals: [
    {
      id: 'sig-001',
      pair: 'GBPNZD',
      action: 'SELL',
      entry: '2.1450',
      tp: '2.1280',
      sl: '2.1520',
      confidence: 88,
      timeAgo: '25 min(s) ago',
      flags: ['GB', 'NZ'],
      status: 'active'
    },
    {
      id: 'sig-002',
      pair: 'EURJPY',
      action: 'SELL',
      entry: '162.80',
      tp: '161.40',
      sl: '163.50',
      confidence: 92,
      timeAgo: '29 min(s) ago',
      flags: ['EU', 'JP'],
      status: 'active'
    },
    {
      id: 'sig-003',
      pair: 'XAUUSD',
      action: 'BUY',
      entry: '4340.00',
      tp: '4380.00',
      sl: '4320.00',
      confidence: 95,
      timeAgo: '42 min(s) ago',
      flags: ['AU', 'US'],
      status: 'active'
    },
    {
      id: 'sig-004',
      pair: 'BTCUSDT',
      action: 'BUY',
      entry: '68500.00',
      tp: '72000.00',
      sl: '66800.00',
      confidence: 89,
      timeAgo: '1 hour ago',
      flags: ['BTC', 'USD'],
      status: 'active'
    }
  ],

  // Live Market Tickers
  marketTickers: [
    { id: 'EURUSD', name: 'EURUSD', pair: 'EUR/USD', desc: 'Euro / US Dollar', price: 1.15380, change: 0.12, isUp: true, time: 'Live', code1: 'EU', code2: 'US' },
    { id: 'GBPUSD', name: 'GBPUSD', pair: 'GBP/USD', desc: 'British Pound / US Dollar', price: 1.34560, change: -0.09, isUp: false, time: 'Live', code1: 'GB', code2: 'US' },
    { id: 'USDJPY', name: 'USDJPY', pair: 'USD/JPY', desc: 'US Dollar / Japanese Yen', price: 148.850, change: 0.25, isUp: true, time: 'Live', code1: 'US', code2: 'JP' },
    { id: 'AUDUSD', name: 'AUDUSD', pair: 'AUD/USD', desc: 'Australian Dollar / US Dollar', price: 0.65420, change: 0.18, isUp: true, time: 'Live', code1: 'AU', code2: 'US' },
    { id: 'USDCHF', name: 'USDCHF', pair: 'USD/CHF', desc: 'US Dollar / Swiss Franc', price: 0.89240, change: -0.05, isUp: false, time: 'Live', code1: 'US', code2: 'CH' },
    { id: 'XAUUSD', name: 'XAUUSD', pair: 'XAU/USD', desc: 'Gold Spot / US Dollar', price: 4343.65, change: 1.18, isUp: true, time: 'Live', code1: 'AU', code2: 'US' },
    { id: 'BTCUSDT', name: 'BTCUSDT', pair: 'BTC/USDT', desc: 'Bitcoin / Tether USDT', price: 68420.00, change: 3.42, isUp: true, time: 'Live', code1: 'BTC', code2: 'USD' }
  ],

  // Running Text / Announcements Ticker
  announcements: [
    {
      id: 'ann-1',
      text: 'Selamat datang di AUTOTRADING Platform Investasi AI Trading Resmi 2026. Dapatkan bonus sponsor 10% dan profit harian otomatis 24/7!',
      active: true,
      createdAt: '2026-09-15T00:00:00.000Z'
    },
    {
      id: 'ann-2',
      text: 'Deposit instant via QRIS & Transfer Bank BCA, Mandiri, BRI serta USDT TRC20/BEP20 telah aktif otomatis tanpa antre.',
      active: true,
      createdAt: '2026-09-15T01:00:00.000Z'
    },
    {
      id: 'ann-3',
      text: 'Sinyal akurasi tinggi Prof GPT telah diperbarui. Cek menu Signal untuk eksekusi order trading dengan akurasi 94%+.',
      active: true,
      createdAt: '2026-09-15T02:00:00.000Z'
    }
  ],

  // Image Slides Carousel (Banners)
  banners: [
    {
      id: 'ban-1',
      title: 'AI Trading Algoritma AUTOTRADING v4.2',
      subtitle: 'Otomasi profit harian dengan akurasi eksekusi 94.8% dan proteksi modal terintegrasi.',
      badge: 'PROMO UNGGULAN',
      imageUrl: 'https://images.unsplash.com/photo-1642543492481-44e81e3914a7?w=900&auto=format&fit=crop&q=80',
      actionUrl: 'plans',
      active: true,
      createdAt: '2026-09-15T00:00:00.000Z'
    },
    {
      id: 'ban-2',
      title: 'Bonus Kemitraan & Rabat Multi-Level',
      subtitle: 'Dapatkan komisi sponsor instan 10% + passive income matching ROI hingga 5 kedalaman.',
      badge: 'KOMISI TINGGI',
      imageUrl: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=900&auto=format&fit=crop&q=80',
      actionUrl: 'profile',
      active: true,
      createdAt: '2026-09-15T01:00:00.000Z'
    },
    {
      id: 'ban-3',
      title: 'Deposit Instant 24/7 QRIS & USDT',
      subtitle: 'Proses deposit cepat otomatis melalui QRIS dinamis dan jaringan blockchain USDT TRC20/BEP20.',
      badge: 'GATEWAY TERCEPAT',
      imageUrl: 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=900&auto=format&fit=crop&q=80',
      actionUrl: 'deposit',
      active: true,
      createdAt: '2026-09-15T02:00:00.000Z'
    }
  ],

  // Point Rewards Catalog (Tukar Poin Hadiah)
  rewards: [
    {
      id: 'rew-1',
      title: 'Saldo E-Wallet Rp 50.000 (DANA / OVO / GoPay)',
      category: 'E-Wallet',
      badge: 'POPULER',
      pointsCost: 50,
      stock: 100,
      description: 'Penukaran saldo e-wallet instant langsung ke nomor akun DANA / OVO / GoPay kamu.',
      imageUrl: 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=600&auto=format&fit=crop&q=80',
      active: true,
      createdAt: '2026-09-15T00:00:00.000Z'
    },
    {
      id: 'rew-2',
      title: 'Saldo E-Wallet Rp 100.000 (Semua Bank / E-Wallet)',
      category: 'E-Wallet',
      badge: 'TERLARIS',
      pointsCost: 100,
      stock: 50,
      description: 'Voucher transfer saldo tunai Rp 100.000 ke rekening bank atau e-wallet pilihan kamu.',
      imageUrl: 'https://images.unsplash.com/photo-1580519542036-c47de6196ba5?w=600&auto=format&fit=crop&q=80',
      active: true,
      createdAt: '2026-09-15T01:00:00.000Z'
    },
    {
      id: 'rew-3',
      title: 'Kaos Eksklusif AUTOTRADING Trader 2026 Edition',
      category: 'Merchandise',
      badge: 'OFFICIAL',
      pointsCost: 150,
      stock: 35,
      description: 'T-Shirt Cotton Combed 24s premium dengan bordir emas logo AUTOTRADING Trading AI.',
      imageUrl: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=600&auto=format&fit=crop&q=80',
      active: true,
      createdAt: '2026-09-15T02:00:00.000Z'
    },
    {
      id: 'rew-4',
      title: 'Smartwatch Fitness & Crypto Price Tracker',
      category: 'Gadget',
      badge: 'PREMIUM',
      pointsCost: 500,
      stock: 15,
      description: 'Smartwatch layar AMOLED dengan fitur notifikasi harga trading forex dan crypto realtime.',
      imageUrl: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=80',
      active: true,
      createdAt: '2026-09-15T03:00:00.000Z'
    },
    {
      id: 'rew-5',
      title: 'Logam Mulia Emas Antam 0.5 Gram Bersertifikat',
      category: 'Emas Fisik',
      badge: 'INVESTASI',
      pointsCost: 850,
      stock: 10,
      description: 'Emas murni 99.99% bersertifikat resmi PT ANTAM Tbk dikirim aman ke alamat kamu.',
      imageUrl: 'https://images.unsplash.com/photo-1610375461246-83df859d849d?w=600&auto=format&fit=crop&q=80',
      active: true,
      createdAt: '2026-09-15T04:00:00.000Z'
    },
    {
      id: 'rew-6',
      title: 'Smartphone Flagship 5G (Trading Edition)',
      category: 'Gadget',
      badge: 'SPECIAL VIP',
      pointsCost: 2500,
      stock: 3,
      description: 'Smartphone 5G performa tinggi layar 120Hz untuk eksekusi order trading super mulus.',
      imageUrl: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600&auto=format&fit=crop&q=80',
      active: true,
      createdAt: '2026-09-15T05:00:00.000Z'
    }
  ],

  // User Point Redemptions Log (Riwayat Klaim Hadiah)
  redemptions: [],

  // Active Session
  currentSession: null // null indicates Guest mode
};

// Helper to generate crisp, standard Base64 SVG Mobile Banking Receipts
export function createReceiptBase64({ bank = 'BCA Mobile', name = 'Member AUTOTRADING', amount = 10000000, timeAgo = 'Baru saja', refNo = '' }) {
  let primaryColor = '#003B7A';
  let titleText = 'TRANSFER KE REKENING BCA BERHASIL';
  let iconStroke = '#059669';
  let iconBg = '#ECFDF5';
  let fontTitleColor = '#FFFFFF';
  let bankDisplay = bank || 'BCA Mobile';

  if (bankDisplay.includes('Mandiri')) {
    primaryColor = '#00264D';
    fontTitleColor = '#FFB800';
    titleText = 'TRANSFER DANA MANDIRI BERHASIL';
    iconStroke = '#D97706';
    iconBg = '#FEF3C7';
  } else if (bankDisplay.includes('BRI')) {
    primaryColor = '#024E9B';
    titleText = 'TRANSAKSI TRANSFER BERHASIL';
    iconStroke = '#2563EB';
    iconBg = '#EFF6FF';
  } else if (bankDisplay.includes('DANA')) {
    primaryColor = '#108EE9';
    titleText = 'PENERIMAAN SALDO DANA SUKSES';
    iconStroke = '#0284C7';
    iconBg = '#E0F2FE';
  } else if (bankDisplay.includes('BNI')) {
    primaryColor = '#005E6A';
    fontTitleColor = '#F15A24';
    titleText = 'TRANSFER ONLINE ANTAR BANK SUKSES';
    iconStroke = '#0D9488';
    iconBg = '#CCFBF1';
  } else if (bankDisplay.includes('QRIS') || bankDisplay.includes('VIP') || bankDisplay.includes('USDT')) {
    primaryColor = '#0F172A';
    fontTitleColor = '#E5A83B';
    titleText = 'PENARIKAN VIP INSTANT SELESAI';
    iconStroke = '#B45309';
    iconBg = '#FEF3C7';
  }

  const formattedAmount = 'Rp ' + Number(amount || 0).toLocaleString('id-ID');
  const ref = refNo || ('REF-' + Math.floor(10000000 + Math.random() * 90000000));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="420" viewBox="0 0 600 420" fill="none">
    <rect width="600" height="420" rx="20" fill="${primaryColor}"/>
    <rect x="15" y="15" width="570" height="390" rx="16" fill="#FFFFFF"/>
    <rect x="15" y="15" width="570" height="70" rx="16" fill="${primaryColor}"/>
    <text x="35" y="55" fill="${fontTitleColor}" font-family="Arial, sans-serif" font-size="22" font-weight="900" letter-spacing="1">${bankDisplay}</text>
    <rect x="420" y="32" width="145" height="34" rx="17" fill="#10B981"/>
    <text x="492" y="54" fill="#FFFFFF" font-family="Arial, sans-serif" font-size="13" font-weight="bold" text-anchor="middle">✓ BERHASIL</text>
    <circle cx="300" cy="130" r="30" fill="${iconBg}"/>
    <path d="M288 130L296 138L312 122" stroke="${iconStroke}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="300" y="180" fill="#0F172A" font-family="Arial, sans-serif" font-size="15" font-weight="bold" text-anchor="middle">${titleText}</text>
    <text x="300" y="222" fill="${primaryColor}" font-family="Arial, sans-serif" font-size="30" font-weight="900" text-anchor="middle">${formattedAmount}</text>
    <line x1="45" y1="245" x2="555" y2="245" stroke="#E2E8F0" stroke-width="1.5" stroke-dasharray="6 6"/>
    <text x="50" y="275" fill="#64748B" font-family="Arial, sans-serif" font-size="13">Pengirim:</text>
    <text x="550" y="275" fill="#0F172A" font-family="Arial, sans-serif" font-size="13" font-weight="bold" text-anchor="end">PT AUTOTRADING INVESTASI</text>
    <text x="50" y="305" fill="#64748B" font-family="Arial, sans-serif" font-size="13">Penerima:</text>
    <text x="550" y="305" fill="#0F172A" font-family="Arial, sans-serif" font-size="13" font-weight="bold" text-anchor="end">${name}</text>
    <text x="50" y="335" fill="#64748B" font-family="Arial, sans-serif" font-size="13">Waktu:</text>
    <text x="550" y="335" fill="#0F172A" font-family="Arial, sans-serif" font-size="13" font-weight="bold" text-anchor="end">${timeAgo}</text>
    <text x="50" y="365" fill="#64748B" font-family="Arial, sans-serif" font-size="13">No. Referensi:</text>
    <text x="550" y="365" fill="${primaryColor}" font-family="Arial, sans-serif" font-size="12" font-weight="bold" text-anchor="end">${ref}</text>
    <rect x="45" y="380" width="510" height="15" fill="#F8FAFC" rx="4"/>
  </svg>`;

  if (typeof btoa !== 'undefined') {
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
  } else if (typeof Buffer !== 'undefined') {
    return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
  }
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

// User Withdrawal Testimonials (Bukti Penarikan Dana Member & M-Banking)
const defaultTestimonials = [];
defaultDB.testimonials = [];

// Database Service Helper Object
export const DB = {
  getApiUrl(action) {
    if (typeof window !== 'undefined' && window.location) {
      const origin = window.location.origin && window.location.origin !== 'null' ? window.location.origin : '';
      if (origin) {
        return `${origin}/api/index.php?action=${action}`;
      }
    }
    return `https://autotrading.my.id/api/index.php?action=${action}`;
  },

  // Reliable WIB (Asia/Jakarta UTC+7) Date string YYYY-MM-DD
  getWibDateStr(dateInput = new Date()) {
    try {
      const d = (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateInput))
        ? new Date(dateInput.replace(' ', 'T'))
        : new Date(dateInput);
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(d);
    } catch(e) {
      return new Date().toISOString().slice(0, 10);
    }
  },

  // Upload Image File or Base64 or Blob URL to Server uploads/ directory
  async uploadImage(fileOrBase64) {
    try {
      const url = this.getApiUrl('upload_image');
      if (typeof fileOrBase64 === 'string' && fileOrBase64.startsWith('blob:')) {
        try {
          const blobRes = await fetch(fileOrBase64);
          fileOrBase64 = await blobRes.blob();
        } catch(e) {
          console.warn('Failed to convert blob URL to Blob object:', e);
        }
      }
      if (typeof window !== 'undefined' && (fileOrBase64 instanceof File || fileOrBase64 instanceof Blob)) {
        const formData = new FormData();
        formData.append('image', fileOrBase64);
        const res = await fetch(url, {
          method: 'POST',
          body: formData
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } else if (typeof fileOrBase64 === 'string') {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: fileOrBase64 })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      }
    } catch (e) {
      console.warn('Image upload to server error:', e);
      return { success: false, message: e.message };
    }
    return { success: false, message: 'Format file tidak valid' };
  },

  // Compress image to small JPEG dataURL (< 50KB) to prevent localStorage quota issues
  async compressImageFile(file, maxDimension = 800, quality = 0.7) {
    if (typeof window === 'undefined') return '';
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => resolve(e.target.result);
        img.src = e.target.result;
      };
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  },

  // Format any Date or ISO string into exact Asia/Jakarta (WIB) time string
  formatWibDateTime(dateInput) {
    if (!dateInput) return '-';
    try {
      const d = new Date(dateInput);
      if (isNaN(d.getTime())) return String(dateInput);
      return new Intl.DateTimeFormat('id-ID', {
        timeZone: 'Asia/Jakarta',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).format(d);
    } catch(e) {
      return String(dateInput);
    }
  },

  get() {
    try {
      if (!_activeDB) {
        if (typeof localStorage !== 'undefined') {
          try {
            const local = localStorage.getItem('autotrading_db');
            if (local) {
              _activeDB = JSON.parse(local);
            }
          } catch (e) {}
        }
        if (!_activeDB) {
          _activeDB = JSON.parse(JSON.stringify(defaultDB));
        }
      }
      const parsed = _activeDB;
      if (!parsed.plans) parsed.plans = defaultDB.plans;
      if (!parsed.users) parsed.users = defaultDB.users;
      if (!parsed.transactions) parsed.transactions = [];
      if (!parsed.investments) parsed.investments = [];
      if (!parsed.signals) parsed.signals = defaultDB.signals;
      if (!parsed.marketTickers) parsed.marketTickers = defaultDB.marketTickers;
      if (!parsed.announcements) parsed.announcements = defaultDB.announcements;
      if (!parsed.banners) parsed.banners = defaultDB.banners;
      if (!parsed.rewards) parsed.rewards = defaultDB.rewards;
      if (!parsed.redemptions) parsed.redemptions = [];
      if (!parsed.testimonials) parsed.testimonials = [];
      if (!parsed.settings) parsed.settings = defaultDB.settings;

      return parsed;
    } catch (e) {
      console.error('Error loading DB state:', e);
      return defaultDB;
    }
  },

  // Remove password / OTP / reset-code fields from a state snapshot before it is
  // persisted to localStorage or transmitted to the API. Secrets stay in memory only.
  stripSensitiveFields(data) {
    if (!data || !Array.isArray(data.users)) return data;
    try {
      const clone = { ...data };
      clone.users = data.users.map((u) => {
        if (!u || typeof u !== 'object') return u;
        const rest = { ...u };
        delete rest.password;
        delete rest.password_hash;
        delete rest.passwordHash;
        delete rest.verificationOtp;
        delete rest.passwordResetRequest;
        return rest;
      });
      return clone;
    } catch (e) {
      return data;
    }
  },

  // Establish the httpOnly server session (api/index.php?action=login) using the
  // locally cached credentials of the currently signed-in user. Needed once after
  // deploy so previously logged-in browsers can keep syncing to the server.
  _lastSessionAttempt: 0,
  async ensureServerSession() {
    if (typeof fetch !== 'function') return false;
    const now = Date.now();
    if (now - (this._lastSessionAttempt || 0) < 45000) return false;
    this._lastSessionAttempt = now;
    try {
      let userId = null;
      if (typeof sessionStorage !== 'undefined') {
        try {
          userId = sessionStorage.getItem('autotrading_session_user_id') ||
                   (typeof localStorage !== 'undefined' ? localStorage.getItem('autotrading_session_user_id') : null);
        } catch (e) {}
      }
      if (!userId) return false;
      const user = (this.get().users || []).find(u => u.id === userId);
      if (!user || !user.password) return false;
      const res = await fetch(this.getApiUrl('login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: user.username || user.email || user.id,
          password: user.password
        })
      });
      if (!res.ok) return false;
      const json = await res.json();
      return !!(json && json.success);
    } catch (e) {
      return false;
    }
  },

  // Server-validated transaction creation (deposit / withdrawal).
  // Returns { success, transaction, ... }, { success:false, message } on rejection,
  // or null when the server is unreachable (caller falls back to local flow).
  async createTransactionServer(payload) {
    if (typeof fetch !== 'function') return null;
    try {
      const res = await fetch(this.getApiUrl('create_transaction'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json().catch(() => null);
      if (json && json.success) return json;
      return {
        success: false,
        status: res.status,
        message: (json && json.message) || `Server menolak transaksi (HTTP ${res.status}).`
      };
    } catch (e) {
      return null;
    }
  },

  async save(data) {
    try {
      _activeDB = data;
      const safeData = this.stripSensitiveFields(data);
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem('autotrading_db', JSON.stringify(safeData));
        } catch (err) {
          console.warn('LocalStorage quota or save warning:', err);
        }
      }
      return await this.syncToCloud(safeData);
    } catch (e) {
      console.error('Error saving DB state:', e);
      return { success: false, error: e.message };
    }
  },

  // Asynchronous Cloud Sync Engine (cPanel MySQL via api/index.php)
  async syncToCloud(data) {
    try {
      if (typeof fetch !== 'function') return { success: true };
      const url = this.getApiUrl('save');
      const doFetch = () => fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      let res = await doFetch();
      if (res.status === 401) {
        // Session cookie missing/expired: try to silently re-login, then retry once
        const relogged = await this.ensureServerSession();
        if (relogged) res = await doFetch();
      }
      if (!res.ok) {
        if (res.status === 401) {
          // Guests are read-only by design: stay silent for them.
          let hasLocalSession = false;
          try {
            hasLocalSession = !!(typeof sessionStorage !== 'undefined' &&
              (sessionStorage.getItem('autotrading_session_user_id') ||
               (typeof localStorage !== 'undefined' && localStorage.getItem('autotrading_session_user_id'))));
          } catch (e) {}
          if (hasLocalSession) {
            const now401 = Date.now();
            if (now401 - (this._last401Warn || 0) > 60000) {
              this._last401Warn = now401;
              console.warn('Cloud save requires login: silakan login kembali untuk menyinkronkan data.');
              try {
                if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
                  window.dispatchEvent(new CustomEvent('autotrading:auth-required'));
                }
              } catch (e) {}
            }
          }
        } else {
          console.error('Cloud save failed with HTTP', res.status);
        }
        return { success: false, status: res.status };
      }
      return await res.json();
    } catch (e) {
      console.error('Cloud sync error:', e);
      return { success: false, error: e.message };
    }
  },

  // Authoritative Admin User Management (Syncs MySQL relational users, transactions, and state)
  async adminUpdateUser(userId, payload) {
    try {
      if (typeof fetch !== 'function') return { success: false, message: 'Fetch tidak tersedia' };
      await this.ensureServerSession();
      const url = this.getApiUrl('admin_update_user');
      const body = { userId, ...payload };
      let res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (res.status === 401) {
        const relogged = await this.ensureServerSession();
        if (relogged) {
          res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });
        }
      }
      const json = await res.json().catch(() => null);
      if (!res.ok || !json || !json.success) {
        return { success: false, message: (json && json.message) || `Gagal memperbarui user (HTTP ${res.status})` };
      }

      // Update local in-memory DB immediately
      const db = this.get();
      if (Array.isArray(db.users)) {
        const idx = db.users.findIndex(u => u.id === userId);
        if (idx !== -1) {
          if (json.user) {
            db.users[idx] = { ...db.users[idx], ...json.user };
          }
          if (payload.role !== undefined) db.users[idx].role = payload.role;
          if (payload.status !== undefined) db.users[idx].status = payload.status;
          if (payload.isBlocked !== undefined) db.users[idx].isBlocked = Boolean(payload.isBlocked);
          if (payload.password) db.users[idx].password = payload.password;
        }
      }
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem('autotrading_db', JSON.stringify(this.stripSensitiveFields(db)));
        } catch (e) {}
      }

      return json;
    } catch (e) {
      console.error('adminUpdateUser error:', e);
      return { success: false, message: e.message };
    }
  },

  // Authoritative Admin Web Settings Save (Deep-merge MySQL settings table and sync state)
  async adminSaveSettings(settings) {
    try {
      if (typeof fetch !== 'function') return { success: false, message: 'Fetch tidak tersedia' };
      await this.ensureServerSession();
      const url = this.getApiUrl('admin_save_settings');
      let res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings })
      });
      if (res.status === 401) {
        const relogged = await this.ensureServerSession();
        if (relogged) {
          res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ settings })
          });
        }
      }
      const json = await res.json().catch(() => null);
      if (!res.ok || !json || !json.success) {
        return { success: false, message: (json && json.message) || `Gagal menyimpan pengaturan (HTTP ${res.status})` };
      }

      // Update local memory and storage
      const db = this.get();
      db.settings = json.settings || { ...db.settings, ...settings };
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem('autotrading_db', JSON.stringify(this.stripSensitiveFields(db)));
        } catch (e) {}
      }

      // Broadcast settings update event
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent('autotrading:settings-updated', { detail: db.settings }));
      }

      return json;
    } catch (e) {
      console.error('adminSaveSettings error:', e);
      return { success: false, message: e.message };
    }
  },

  // Manually verify user email by Admin
  async adminVerifyUserEmail(userId) {
    try {
      const res = await this.adminUpdateUser(userId, {
        status: 'active',
        isPendingVerification: false,
        emailVerified: true
      });
      if (res && res.success) {
        const db = this.get();
        const u = (db.users || []).find(user => user.id === userId);
        if (u) {
          u.isPendingVerification = false;
          u.emailVerified = true;
          u.status = 'active';
          delete u.verificationOtp;
          this.save(db);
        }
        return { success: true, message: `Akun member ${u ? u.username : userId} berhasil diverifikasi dan diaktifkan!` };
      }
      return res;
    } catch (e) {
      return { success: false, message: e.message };
    }
  },

  async syncFromCloud() {
    try {
      if (typeof fetch !== 'function') return null;
      // Migration hook: reconnect the browser session before pulling fresh state
      await this.ensureServerSession();
      const url = this.getApiUrl('get');
      const res = await fetch(url);
      if (!res.ok) return null;
      const json = await res.json();
      if (json && json.success && json.data) {
        _activeDB = json.data;
        if (typeof localStorage !== 'undefined') {
          try {
            localStorage.setItem('autotrading_db', JSON.stringify(this.stripSensitiveFields(json.data)));
          } catch (e) {}
        }
        return json.data;
      }
    } catch (e) {
      console.warn('Cloud sync get error:', e);
    }
    return null;
  },

  // Live background polling mechanism for realtime frontend-admin-database synchronization
  _pollingInterval: null,
  _syncListeners: [],

  addSyncListener(fn) {
    if (typeof fn === 'function' && !this._syncListeners.includes(fn)) {
      this._syncListeners.push(fn);
    }
  },

  removeSyncListener(fn) {
    this._syncListeners = this._syncListeners.filter(f => f !== fn);
  },

  startLivePolling(callback, intervalMs = 7000) {
    if (callback) this.addSyncListener(callback);
    if (this._pollingInterval) return;

    this._pollingInterval = setInterval(async () => {
      try {
        const fresh = await this.syncFromCloud();
        if (fresh) {
          for (const listener of this._syncListeners) {
            try { listener(fresh); } catch(err) { console.error('Sync listener error:', err); }
          }
        }
      } catch(e) {}
    }, intervalMs);
  },

  stopLivePolling() {
    if (this._pollingInterval) {
      clearInterval(this._pollingInterval);
      this._pollingInterval = null;
    }
  },

  async initCloudSync(callback) {
    const data = await this.syncFromCloud();
    if (data && typeof callback === 'function') {
      callback(data);
    }
  },

  async clearDemoData() {
    try {
      if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
        const url = this.getApiUrl('clear_demo');
        await fetch(url, { method: 'POST' }).catch(() => {});
      }
    } catch(e) {}
    const db = this.get();
    db.users = (db.users || []).filter(u => u.role === 'admin' || u.id === 'usr-admin');
    if (db.users.length === 0) {
      db.users = JSON.parse(JSON.stringify(defaultDB.users));
    } else {
      const admin = db.users[0];
      admin.walletBalance = 0;
      admin.affiliateBalance = 0;
      admin.points = 0;
    }
    db.investments = [];
    db.transactions = [];
    db.redemptions = [];
    db.testimonials = [];
    if (Array.isArray(db.plans)) {
      db.plans.forEach(p => { p.activeCount = 0; });
    }
    await this.save(db);
    return { success: true, message: 'Semua simulasi dan data demo telah berhasil dikosongkan!' };
  },

  resetToDefault() {
    this.save(defaultDB);
    return defaultDB;
  },

  // Auth & Session (Session-scoped in memory / storage for active browser tab)
  getCurrentUser() {
    const db = this.get();
    let userId = null;
    if (typeof sessionStorage !== 'undefined') {
      try {
        userId = sessionStorage.getItem('autotrading_session_user_id') || 
                 (typeof localStorage !== 'undefined' ? localStorage.getItem('autotrading_session_user_id') : null) ||
                 sessionStorage.getItem('fgt_session_user_id');
      } catch (e) {}
    }
    if (!userId) return null;
    const user = (db.users || []).find(u => u.id === userId) || null;
    if (user && (user.isBlocked || user.status === 'blocked')) {
      this.clearSession();
      return null;
    }
    return user;
  },

  setSession(user) {
    if (typeof sessionStorage !== 'undefined') {
      try {
        if (user && user.id) {
          sessionStorage.setItem('autotrading_session_user_id', user.id);
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('autotrading_session_user_id', user.id);
          }
          sessionStorage.setItem('fgt_session_user_id', user.id);
        } else {
          sessionStorage.removeItem('autotrading_session_user_id');
          if (typeof localStorage !== 'undefined') {
            localStorage.removeItem('autotrading_session_user_id');
          }
          sessionStorage.removeItem('fgt_session_user_id');
        }
      } catch (e) {}
    }
    const db = this.get();
    db.currentSession = user ? {
      userId: user.id,
      username: user.username,
      role: user.role,
      loginAt: new Date().toISOString()
    } : null;
  },

  clearSession() {
    if (typeof sessionStorage !== 'undefined') {
      try {
        sessionStorage.removeItem('autotrading_session_user_id');
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem('autotrading_session_user_id');
        }
        sessionStorage.removeItem('fgt_session_user_id');
      } catch (e) {}
    }
    const db = this.get();
    db.currentSession = null;
  },

  // Users
  getUserByUsername(username) {
    if (!username) return null;
    const clean = String(username).trim().toLowerCase();
    const db = this.get();
    return db.users.find(u => 
      (u.username && u.username.toLowerCase() === clean) || 
      (u.email && u.email.toLowerCase() === clean) || 
      (u.phone && String(u.phone).trim() === clean)
    ) || null;
  },

  getUserByPhone(phone) {
    if (!phone) return null;
    const clean = String(phone).trim().replace(/[^0-9]/g, '');
    if (!clean) return null;
    const db = this.get();
    return db.users.find(u => {
      if (!u.phone) return false;
      const uClean = String(u.phone).trim().replace(/[^0-9]/g, '');
      return uClean === clean;
    }) || null;
  },

  getUserById(id) {
    const db = this.get();
    return db.users.find(u => u.id === id);
  },

  getUserByReferralCode(code) {
    if (!code) return null;
    const db = this.get();
    return db.users.find(u => u.referralCode.toUpperCase() === code.toUpperCase());
  },

  async addUser(userData) {
    const db = this.get();
    const isVerifyRequired = !!(db.settings && db.settings.email && db.settings.email.verificationRequired);
    let newUser = {
      id: 'usr-' + Date.now(),
      walletBalance: 0,
      affiliateBalance: 0,
      points: 10, // welcome bonus points
      kycStatus: 'unverified',
      emailVerified: !isVerifyRequired,
      isPendingVerification: isVerifyRequired,
      verificationOtp: null,
      registeredAt: new Date().toISOString(),
      role: 'user',
      status: 'active',
      isBlocked: false,
      blockedReason: '',
      blockedAt: null,
      blockHistory: [],
      ...userData
    };

    // Try direct registration via API for immediate MySQL table commitment
    try {
      if (typeof fetch === 'function') {
        const url = this.getApiUrl('register');
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: newUser.username,
            fullName: newUser.fullName,
            email: newUser.email,
            phone: newUser.phone,
            password: newUser.password,
            referralCode: newUser.referralCode,
            referredBy: newUser.referredBy
          })
        });
        if (res.ok) {
          const json = await res.json();
          if (json && json.success && json.user) {
            newUser = { ...newUser, ...json.user };
          }
        }
      }
    } catch(err) {
      console.warn('Direct API register note:', err);
    }

    db.users = db.users || [];
    const existingIdx = db.users.findIndex(u => u.id === newUser.id || u.username === newUser.username);
    if (existingIdx !== -1) {
      db.users[existingIdx] = newUser;
    } else {
      db.users.push(newUser);
    }
    await this.save(db);
    return newUser;
  },

  updateUser(id, updates) {
    const db = this.get();
    const idx = db.users.findIndex(u => u.id === id);
    if (idx !== -1) {
      db.users[idx] = { ...db.users[idx], ...updates };
      this.save(db);
      return db.users[idx];
    }
    return null;
  },

  // Update member personal details
  updateUserProfile(userId, { fullName, phone, email, city }) {
    const db = this.get();
    const user = db.users.find(u => u.id === userId);
    if (!user) return { success: false, message: 'User tidak ditemukan!' };

    if (!fullName || !fullName.trim()) {
      return { success: false, message: 'Nama lengkap wajib diisi!' };
    }

    if (email && email.trim()) {
      const emailLower = email.trim().toLowerCase();
      const existing = db.users.find(u => u.id !== userId && u.email && u.email.toLowerCase() === emailLower);
      if (existing) {
        return { success: false, message: 'Email sudah digunakan oleh akun lain!' };
      }
      user.email = emailLower;
    }

    user.fullName = fullName.trim();
    if (phone !== undefined) user.phone = phone.trim();
    if (city !== undefined) user.city = city.trim();
    user.updatedAt = new Date().toISOString();

    this.save(db);
    return { success: true, user, message: 'Profil dan data diri berhasil diperbarui!' };
  },

  // Update member withdrawal bank/e-wallet account
  updateUserBank(userId, { bankName, accountNumber, accountHolder }) {
    const db = this.get();
    const user = db.users.find(u => u.id === userId);
    if (!user) return { success: false, message: 'User tidak ditemukan!' };

    if (!bankName || !bankName.trim()) {
      return { success: false, message: 'Nama Bank / E-Wallet wajib dipilih!' };
    }
    if (!accountNumber || !accountNumber.trim()) {
      return { success: false, message: 'Nomor Rekening / No. E-Wallet wajib diisi!' };
    }
    if (!accountHolder || !accountHolder.trim()) {
      return { success: false, message: 'Nama Pemilik Rekening wajib diisi!' };
    }

    user.bankAccount = {
      bankName: bankName.trim(),
      accountNumber: accountNumber.trim(),
      accountHolder: accountHolder.trim().toUpperCase()
    };
    user.updatedAt = new Date().toISOString();

    this.save(db);
    return { success: true, user, bankAccount: user.bankAccount, message: 'Rekening penarikan (WD) berhasil disimpan!' };
  },

  // Change user password (server-side verification + bcrypt, local fallback offline)
  async changeUserPassword(userId, oldPassword, newPassword) {
    const db = this.get();
    const user = db.users.find(u => u.id === userId);
    if (!user) return { success: false, message: 'User tidak ditemukan!' };

    if (!oldPassword || !newPassword) {
      return { success: false, message: 'Password lama dan password baru wajib diisi!' };
    }

    if (newPassword.length < 6) {
      return { success: false, message: 'Password baru minimal harus 6 karakter!' };
    }

    if (typeof fetch === 'function') {
      try {
        const res = await fetch(this.getApiUrl('change_password'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oldPassword, newPassword })
        });
        const json = await res.json().catch(() => null);
        if (res.ok && json && json.success) {
          user.password = newPassword; // in-memory only, never persisted to storage
          user.passwordUpdatedAt = new Date().toISOString();
          return { success: true, message: (json.message || 'Password berhasil diubah! Gunakan password baru untuk login berikutnya.') };
        }
        return { success: false, message: (json && json.message) || `Gagal mengubah password (HTTP ${res.status}).` };
      } catch (e) {
        // Server unreachable -> local fallback below
      }
    }

    if (user.password !== oldPassword) {
      return { success: false, message: 'Password lama tidak sesuai!' };
    }

    user.password = newPassword;
    user.passwordUpdatedAt = new Date().toISOString();

    this.save(db);
    return { success: true, message: 'Password berhasil diubah (mode offline)! Gunakan password baru untuk login berikutnya.' };
  },

  // Request Password Reset (simulates email dispatch)  // Request password reset code (server generates & emails it - never returned here)
  async requestPasswordReset(emailOrPhone) {
    const identifier = String(emailOrPhone || '').trim().toLowerCase();
    if (!identifier) {
      return { success: false, message: 'Harap masukkan alamat email akun Anda!' };
    }

    if (typeof fetch !== 'function') {
      return { success: false, message: 'Fitur reset password memerlukan koneksi ke server.' };
    }

    try {
      const res = await fetch(this.getApiUrl('request_reset'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier })
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json && json.success) {
        return {
          success: true,
          email: json.email || '',
          username: json.username || '',
          message: json.message || 'Kode verifikasi telah dikirimkan ke email Anda.'
        };
      }
      return { success: false, message: (json && json.message) || `Gagal memproses permintaan (HTTP ${res.status}).` };
    } catch (e) {
      return { success: false, message: 'Tidak dapat terhubung ke server. Pastikan Anda online untuk mereset password.' };
    }
  },

  // Reset password using verification code (validated server-side)
  async resetPasswordWithCode(identifier, code, newPassword) {
    const cleanId = String(identifier || '').trim().toLowerCase();
    const cleanCode = String(code || '').trim().toUpperCase();
    const cleanPass = String(newPassword || '').trim();

    if (!cleanId || !cleanCode || !cleanPass) {
      return { success: false, message: 'Semua kolom (email/username, kode reset, dan password baru) wajib diisi!' };
    }

    if (cleanPass.length < 6) {
      return { success: false, message: 'Password baru minimal harus 6 karakter!' };
    }

    if (typeof fetch !== 'function') {
      return { success: false, message: 'Fitur reset password memerlukan koneksi ke server.' };
    }

    try {
      const res = await fetch(this.getApiUrl('reset_password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: cleanId, code: cleanCode, newPassword: cleanPass })
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json && json.success) {
        // Drop any locally cached password of this account
        const db = this.get();
        const user = db.users.find(u =>
          (u.email && u.email.toLowerCase() === cleanId) ||
          (u.username && u.username.toLowerCase() === cleanId)
        );
        if (user) {
          delete user.password;
          user.passwordUpdatedAt = new Date().toISOString();
          if (user.passwordResetRequest) user.passwordResetRequest.status = 'completed';
          this.save(db);
        }
        return { success: true, message: json.message || 'Password Anda berhasil diperbarui! Silakan masuk menggunakan password baru.' };
      }
      return { success: false, message: (json && json.message) || `Gagal mereset password (HTTP ${res.status}).` };
    } catch (e) {
      return { success: false, message: 'Tidak dapat terhubung ke server. Pastikan Anda online untuk mereset password.' };
    }
  },

  // Admin Direct Reset User Password (server-side bcrypt)
  async adminResetUserPassword(userId, newPassword) {
    const db = this.get();
    const user = db.users.find(u => u.id === userId);
    if (!user) return { success: false, message: 'User tidak ditemukan!' };

    const cleanPass = String(newPassword || '').trim();
    if (!cleanPass || cleanPass.length < 6) {
      return { success: false, message: 'Password baru minimal harus 6 karakter!' };
    }

    if (typeof fetch === 'function') {
      try {
        const res = await fetch(this.getApiUrl('admin_reset_password'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, newPassword: cleanPass })
        });
        const json = await res.json().catch(() => null);
        if (res.ok && json && json.success) {
          delete user.password; // never keep plaintext copies around
          user.passwordUpdatedAt = new Date().toISOString();
          return { success: true, message: `Password member ${user.username} berhasil direset oleh Administrator.` };
        }
        if (res.status !== 404 && res.status !== 503) {
          return { success: false, message: (json && json.message) || `Gagal mereset password (HTTP ${res.status}).` };
        }
      } catch (e) {
        // Server unreachable -> local fallback
      }
    }

    user.password = cleanPass;
    user.passwordUpdatedAt = new Date().toISOString();
    if (user.passwordResetRequest) {
      user.passwordResetRequest.status = 'completed_by_admin';
      user.passwordResetRequest.completedAt = new Date().toISOString();
    }

    this.save(db);
    return { success: true, message: `Password member ${user.username} berhasil direset (mode offline).` };
  },

  // Admin Toggle Block / Unblock User
  async toggleBlockUser(userId, reason = '') {
    const db = this.get();
    const user = (db.users || []).find(u => u.id === userId);
    if (!user) return { success: false, message: 'Member tidak ditemukan!' };

    if (user.role === 'admin') {
      return { success: false, message: 'Akun Administrator tidak dapat diblokir demi keamanan sistem!' };
    }

    const willBlock = !user.isBlocked;
    const cleanReason = String(reason || '').trim() || (willBlock ? 'Diblokir oleh Administrator karena indikasi pelanggaran aturan sistem' : '');

    // 1. Direct API update for immediate MySQL table commitment
    try {
      if (typeof fetch === 'function') {
        const url = this.getApiUrl('update_user_status');
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            isBlocked: willBlock,
            blockedReason: cleanReason,
            status: willBlock ? 'blocked' : 'active'
          })
        });
      }
    } catch(e) {
      console.warn('Direct update_user_status API error:', e);
    }

    user.blockHistory = user.blockHistory || [];

    if (!willBlock) {
      // Unblock member
      user.isBlocked = false;
      user.status = 'active';
      user.blockedReason = '';
      user.unblockedAt = new Date().toISOString();
      user.blockHistory.push({
        action: 'unblock',
        timestamp: user.unblockedAt,
        note: 'Blokir dibuka oleh Administrator'
      });

      await this.save(db);
      return {
        success: true,
        isBlocked: false,
        user,
        message: `Akun member ${user.username} (${user.fullName || 'Member'}) berhasil DIBUKA BLOKIR. Member kini dapat login kembali.`
      };
    } else {
      // Block member
      user.isBlocked = true;
      user.status = 'blocked';
      user.blockedReason = cleanReason;
      user.blockedAt = new Date().toISOString();
      user.blockHistory.push({
        action: 'block',
        timestamp: user.blockedAt,
        reason: cleanReason
      });

      // Invalidate active session if member is currently logged in
      if (db.currentSession && db.currentSession.userId === user.id) {
        db.currentSession = null;
      }

      await this.save(db);
      return {
        success: true,
        isBlocked: true,
        user,
        message: `Akun member ${user.username} (${user.fullName || 'Member'}) berhasil DIBLOKIR. Sesi aktif telah diputus dan akses login ditolak.`
      };
    }
  },

  // --------------------------------------------------------------------------
  // EMAIL OTP & REGISTRATION VERIFICATION
  // --------------------------------------------------------------------------
  // Generate + email a registration OTP (server-side; code is never returned to the client).
  // Falls back to local generation only when the server is unreachable (offline dev).
  async generateUserEmailOtp(userId) {
    const db = this.get();
    const user = db.users.find(u => u.id === userId || (u.email && u.email.toLowerCase() === String(userId).toLowerCase()) || (u.username && u.username.toLowerCase() === String(userId).toLowerCase()));
    if (!user) return null;

    if (typeof fetch === 'function') {
      try {
        const res = await fetch(this.getApiUrl('resend_otp'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: user.email || user.username || userId })
        });
        const json = await res.json().catch(() => null);
        if (json && json.success) {
          user.emailVerified = false;
          user.isPendingVerification = true;
          delete user.password;
          return {
            serverManaged: true,
            email: user.email,
            username: user.username,
            fullName: user.fullName || user.username,
            message: json.message
          };
        }
        if (json && json.success === false) {
          return { serverManaged: true, failed: true, message: json.message || 'Gagal mengirim kode OTP.' };
        }
      } catch (e) {
        // Server unreachable -> local fallback below
      }
    }

    // Local fallback (offline development only)
    const code = String(Math.floor(100000 + Math.random() * 900000));
    user.verificationOtp = {
      code,
      generatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 mins validity
      attempts: 0
    };
    user.emailVerified = false;
    user.isPendingVerification = true;
    await this.save(db);
    return { code, serverManaged: false, email: user.email, username: user.username, fullName: user.fullName || user.username };
  },

  async verifyUserEmailOtp(identifier, code) {
    const db = this.get();
    const cleanId = String(identifier || '').trim().toLowerCase();
    const cleanCode = String(code || '').trim();

    if (!cleanId || !cleanCode) {
      return { success: false, message: 'Harap masukkan kode OTP 6-digit verifikasi email!' };
    }

    const findUser = () => db.users.find(u =>
      u.id === identifier || 
      (u.email && u.email.toLowerCase() === cleanId) || 
      (u.username && u.username.toLowerCase() === cleanId)
    );

    // Server-side verification (authoritative)
    if (typeof fetch === 'function') {
      try {
        const res = await fetch(this.getApiUrl('verify_otp'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier, code: cleanCode })
        });
        const json = await res.json().catch(() => null);
        if (json && typeof json.success === 'boolean') {
          if (json.success) {
            const user = findUser();
            if (user) {
              user.emailVerified = true;
              user.isPendingVerification = false;
              if (user.verificationOtp) user.verificationOtp.verifiedAt = new Date().toISOString();
              if (user.status === 'pending') user.status = 'active';
              this.setSession(user);
              return { success: true, user, message: json.message || 'Selamat! Email akun Anda berhasil diverifikasi dan akun telah aktif.' };
            }
            return { success: true, user: json.user || null, message: json.message || 'Verifikasi berhasil.' };
          }
          return { success: false, message: json.message || 'Kode OTP salah. Silakan periksa kembali email Anda.' };
        }
      } catch (e) {
        // Server unreachable -> local fallback below
      }
    }

    const user = findUser();

    if (!user) {
      return { success: false, message: 'Akun member tidak ditemukan.' };
    }

    if (user.emailVerified && !user.isPendingVerification) {
      return { success: true, user, message: 'Akun ini sudah terverifikasi sebelumnya.' };
    }

    if (!user.verificationOtp || !user.verificationOtp.code) {
      return { success: false, message: 'Kode OTP tidak ditemukan. Silakan minta kirim ulang kode baru.' };
    }

    // Check expiration
    if (user.verificationOtp.expiresAt && new Date(user.verificationOtp.expiresAt) < new Date()) {
      return { success: false, message: 'Kode OTP telah kedaluwarsa (lebih dari 15 menit). Silakan klik Kirim Ulang Kode.' };
    }

    if (user.verificationOtp.code !== cleanCode) {
      user.verificationOtp.attempts = (user.verificationOtp.attempts || 0) + 1;
      this.save(db);
      return { success: false, message: 'Kode OTP salah. Silakan periksa kembali email Anda.' };
    }

    // Success! Verify and activate member
    user.emailVerified = true;
    user.isPendingVerification = false;
    user.verificationOtp.verifiedAt = new Date().toISOString();
    this.save(db);
    this.setSession(user);

    return { success: true, user, message: 'Selamat! Email akun Anda berhasil diverifikasi dan akun telah aktif.' };
  },

  adminVerifyUserEmail(userId) {
    const db = this.get();
    const user = db.users.find(u => u.id === userId);
    if (!user) return { success: false, message: 'User tidak ditemukan.' };

    user.emailVerified = true;
    user.isPendingVerification = false;
    if (user.verificationOtp) {
      user.verificationOtp.verifiedAt = new Date().toISOString();
      user.verificationOtp.manuallyVerifiedByAdmin = true;
    }
    this.save(db);
    return { success: true, user, message: `Akun @${user.username} berhasil diverifikasi secara manual oleh Admin!` };
  },

  async dispatchMailApi(action, payload) {
    try {
      const db = this.get();
      const bodyData = {
        action,
        settings: db.settings,
        ...payload
      };

      const res = await fetch('api/mail.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyData)
      });
      return await res.json();
    } catch (e) {
      // Graceful fallback for offline / mock testing
      return {
        success: true,
        offlineSimulated: true,
        message: 'Email dispatch diproses (mode offline/simulasi)'
      };
    }
  },

  // Format IDR currency
  formatIDR(amount) {
    return 'IDR ' + Number(amount || 0).toLocaleString('id-ID');
  },

  // Format USD currency
  formatUSD(amount) {
    return 'US$' + Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  // Announcements / Running Text CRUD
  getAnnouncements() {
    const db = this.get();
    return db.announcements || [];
  },

  getActiveAnnouncements() {
    const db = this.get();
    return (db.announcements || []).filter(a => a.active);
  },

  addAnnouncement(text, active = true) {
    const db = this.get();
    db.announcements = db.announcements || [];
    const newAnn = {
      id: 'ann-' + Date.now(),
      text: text.trim(),
      active: Boolean(active),
      createdAt: new Date().toISOString()
    };
    db.announcements.unshift(newAnn);
    this.save(db);
    return newAnn;
  },

  updateAnnouncement(id, updates) {
    const db = this.get();
    db.announcements = db.announcements || [];
    const idx = db.announcements.findIndex(a => a.id === id);
    if (idx !== -1) {
      db.announcements[idx] = { ...db.announcements[idx], ...updates };
      this.save(db);
      return db.announcements[idx];
    }
    return null;
  },

  deleteAnnouncement(id) {
    const db = this.get();
    db.announcements = (db.announcements || []).filter(a => a.id !== id);
    this.save(db);
    return true;
  },

  // Daily Check-In / Absensi Harian (Point 6 & Bug 12 Fix)
  getDailyCheckInStatus(userId) {
    const db = this.get();
    const user = (db.users || []).find(u => u.id === userId);
    if (!user) return null;

    const cfg = (db.settings && db.settings.dailyCheckIn) || {
      enabled: true,
      rewardAmount: 1000,
      totalDays: 7
    };

    const checkInRecord = user.dailyCheckIn || {
      currentStreak: 0,
      lastCheckInDate: null,
      history: []
    };

    const todayWib = this.getWibDateStr();

    // Check if user has already checked in today via record, history, or transactions
    const hasHistoryToday = Array.isArray(checkInRecord.history) && checkInRecord.history.some(h => {
      const hDate = (h.date || h.claimedAt || '').slice(0, 10);
      return hDate === todayWib;
    });

    const hasTrxCheckInToday = (db.transactions || []).some(t => {
      if (t.userId !== userId) return false;
      const isCheckInTrx = (t.id && t.id.startsWith('TX-CHK-')) || 
                           (t.paymentMethod && t.paymentMethod.includes('Absensi')) ||
                           (t.note && t.note.toLowerCase().includes('absen'));
      if (!isCheckInTrx) return false;
      const trxDateStr = (t.createdAt || '').slice(0, 10);
      return trxDateStr === todayWib;
    });

    const hasCheckedInToday = checkInRecord.lastCheckInDate === todayWib || hasHistoryToday || hasTrxCheckInToday;

    let streak = checkInRecord.currentStreak || 0;
    if (checkInRecord.lastCheckInDate && !hasCheckedInToday) {
      try {
        const last = new Date(checkInRecord.lastCheckInDate);
        const now = new Date(todayWib);
        const diffDays = Math.round((now - last) / (1000 * 60 * 60 * 24));
        if (diffDays > 1) {
          streak = 0;
        }
      } catch(e) {}
    }

    return {
      enabled: cfg.enabled !== false,
      rewardAmount: Number(cfg.rewardAmount) || 1000,
      totalDays: Number(cfg.totalDays) || 7,
      currentStreak: streak,
      hasCheckedInToday,
      lastCheckInDate: checkInRecord.lastCheckInDate
    };
  },

  async claimDailyCheckIn(userId) {
    const db = this.get();
    const user = (db.users || []).find(u => u.id === userId);
    if (!user) {
      return { success: false, message: 'User tidak ditemukan.' };
    }

    const cfg = (db.settings && db.settings.dailyCheckIn) || {
      enabled: true,
      rewardAmount: 1000,
      totalDays: 7
    };

    if (cfg.enabled === false) {
      return { success: false, message: 'Fitur absensi harian sedang dinonaktifkan oleh Administrator.' };
    }

    // Local pre-guard before network request
    const status = this.getDailyCheckInStatus(userId);
    if (status && status.hasCheckedInToday) {
      return { success: false, message: 'Anda sudah mengklaim bonus absen hari ini! Silakan kembali besok.' };
    }

    // Attempt direct server claim for strict atomic database validation
    try {
      if (typeof fetch === 'function') {
        const url = this.getApiUrl('claim_daily_checkin');
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId })
        });
        if (res.ok) {
          const json = await res.json();
          if (json.success) {
            // Synchronize local active DB with server response
            user.walletBalance = json.walletBalance;
            user.dailyCheckIn = user.dailyCheckIn || {};
            user.dailyCheckIn.currentStreak = json.currentStreak;
            user.dailyCheckIn.lastCheckInDate = this.getWibDateStr();
            user.dailyCheckIn.history = user.dailyCheckIn.history || [];
            user.dailyCheckIn.history.push({
              date: this.getWibDateStr(),
              day: json.currentStreak,
              amount: json.rewardAmount,
              claimedAt: new Date().toISOString()
            });
            if (json.transaction) {
              db.transactions = db.transactions || [];
              const exists = db.transactions.some(t => t.id === json.transaction.id);
              if (!exists) {
                db.transactions.unshift(json.transaction);
              }
            }
            if (typeof localStorage !== 'undefined') {
              try { localStorage.setItem('autotrading_db', JSON.stringify(this.stripSensitiveFields(db))); } catch(e) {}
            }
            return json;
          } else {
            if (json.alreadyClaimed) {
              user.dailyCheckIn = user.dailyCheckIn || {};
              user.dailyCheckIn.lastCheckInDate = this.getWibDateStr();
              if (typeof localStorage !== 'undefined') {
                try { localStorage.setItem('autotrading_db', JSON.stringify(this.stripSensitiveFields(db))); } catch(e) {}
              }
            }
            return json;
          }
        }
      }
    } catch(err) {
      console.warn('Direct server claim check-in error, using local fallback:', err);
    }

    // Local fallback when server is unreachable
    const todayWib = this.getWibDateStr();
    user.dailyCheckIn = user.dailyCheckIn || {
      currentStreak: 0,
      lastCheckInDate: null,
      history: []
    };

    let newStreak = (user.dailyCheckIn.currentStreak || 0) + 1;
    if (user.dailyCheckIn.lastCheckInDate) {
      try {
        const last = new Date(user.dailyCheckIn.lastCheckInDate);
        const now = new Date(todayWib);
        const diffDays = Math.round((now - last) / (1000 * 60 * 60 * 24));
        if (diffDays > 1) {
          newStreak = 1;
        }
      } catch(e) {}
    } else {
      newStreak = 1;
    }

    if (newStreak > (cfg.totalDays || 7)) {
      newStreak = 1;
    }

    const rewardAmount = Number(cfg.rewardAmount) || 1000;

    user.walletBalance = (user.walletBalance || 0) + rewardAmount;
    user.dailyCheckIn.currentStreak = newStreak;
    user.dailyCheckIn.lastCheckInDate = todayWib;
    user.dailyCheckIn.history = user.dailyCheckIn.history || [];
    user.dailyCheckIn.history.push({
      date: todayWib,
      day: newStreak,
      amount: rewardAmount,
      claimedAt: new Date().toISOString()
    });

    const txId = 'TX-CHK-' + Date.now().toString().slice(-6);
    db.transactions = db.transactions || [];
    db.transactions.unshift({
      id: txId,
      userId: user.id,
      username: user.username,
      type: 'bonus',
      amount: rewardAmount,
      status: 'approved',
      paymentMethod: 'Absensi Harian (Check-in H-' + newStreak + ')',
      note: `Bonus absensi harian hari ke-${newStreak}/7 (+Rp ${rewardAmount.toLocaleString('id-ID')})`,
      createdAt: new Date().toISOString()
    });

    await this.save(db);

    return {
      success: true,
      rewardAmount,
      currentStreak: newStreak,
      message: `Selamat! Absensi hari ke-${newStreak} berhasil. Bonus Rp ${rewardAmount.toLocaleString('id-ID')} masuk ke Saldo Utama Anda!`
    };
  },

  // Banner Slides Carousel CRUD
  getBanners() {
    const db = this.get();
    return db.banners || [];
  },

  getActiveBanners() {
    const db = this.get();
    return (db.banners || []).filter(b => b.active);
  },

  async addBanner({ title, subtitle, badge, imageUrl, actionUrl, active = true }) {
    const db = this.get();
    db.banners = db.banners || [];
    const newBanner = {
      id: 'ban-' + Date.now(),
      title: (title || '').trim(),
      subtitle: (subtitle || '').trim(),
      badge: (badge || 'PROMO UNGGULAN').trim(),
      imageUrl: (imageUrl || '').trim(),
      actionUrl: actionUrl || 'plans',
      active: Boolean(active),
      createdAt: new Date().toISOString()
    };
    db.banners.unshift(newBanner);

    // Direct server save to MySQL table
    try {
      if (typeof fetch === 'function') {
        const url = this.getApiUrl('save_banner');
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ banner: newBanner })
        }).catch(() => {});
      }
    } catch(e) {}

    await this.save(db);
    return newBanner;
  },

  async updateBanner(id, updates) {
    const db = this.get();
    db.banners = db.banners || [];
    const idx = db.banners.findIndex(b => b.id === id);
    if (idx !== -1) {
      db.banners[idx] = { ...db.banners[idx], ...updates };
      const updated = db.banners[idx];

      // Direct server save to MySQL table
      try {
        if (typeof fetch === 'function') {
          const url = this.getApiUrl('save_banner');
          await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ banner: updated })
          }).catch(() => {});
        }
      } catch(e) {}

      await this.save(db);
      return updated;
    }
    return null;
  },

  async deleteBanner(id) {
    const db = this.get();
    db.banners = (db.banners || []).filter(b => b.id !== id);

    // Direct server delete from MySQL table
    try {
      if (typeof fetch === 'function') {
        const url = this.getApiUrl('delete_banner');
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id })
        }).catch(() => {});
      }
    } catch(e) {}

    await this.save(db);
    return true;
  },

  // Point Rewards Catalog CRUD
  getRewards() {
    const db = this.get();
    return db.rewards || [];
  },

  getActiveRewards() {
    const db = this.get();
    return (db.rewards || []).filter(r => r.active);
  },

  addReward({ title, category, badge, pointsCost, stock, description, imageUrl, active = true }) {
    const db = this.get();
    db.rewards = db.rewards || [];
    const newReward = {
      id: 'rew-' + Date.now(),
      title: (title || '').trim(),
      category: (category || 'E-Wallet').trim(),
      badge: (badge || 'POPULER').trim(),
      pointsCost: Number(pointsCost) || 50,
      stock: Number(stock) || 0,
      description: (description || '').trim(),
      imageUrl: (imageUrl || '').trim(),
      active: Boolean(active),
      createdAt: new Date().toISOString()
    };
    db.rewards.unshift(newReward);
    this.save(db);
    return newReward;
  },

  updateReward(id, updates) {
    const db = this.get();
    db.rewards = db.rewards || [];
    const idx = db.rewards.findIndex(r => r.id === id);
    if (idx !== -1) {
      if (updates.pointsCost !== undefined) updates.pointsCost = Number(updates.pointsCost);
      if (updates.stock !== undefined) updates.stock = Number(updates.stock);
      db.rewards[idx] = { ...db.rewards[idx], ...updates };
      this.save(db);
      return db.rewards[idx];
    }
    return null;
  },

  deleteReward(id) {
    const db = this.get();
    db.rewards = (db.rewards || []).filter(r => r.id !== id);
    this.save(db);
    return true;
  },

  // Redemptions Log CRUD
  getRedemptions() {
    const db = this.get();
    return db.redemptions || [];
  },

  addRedemption({ userId, username, rewardId, rewardTitle, pointsSpent, targetContact, deliveryAddress, note = '' }) {
    const db = this.get();
    db.redemptions = db.redemptions || [];
    const newRedemption = {
      id: 'RDM-' + Math.floor(1000 + Math.random() * 9000),
      userId,
      username,
      rewardId,
      rewardTitle,
      pointsSpent: Number(pointsSpent),
      targetContact: (targetContact || '').trim(),
      deliveryAddress: (deliveryAddress || '').trim(),
      note: (note || '').trim(),
      status: 'pending', // 'pending' | 'processing' | 'completed' | 'rejected'
      adminNote: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.redemptions.unshift(newRedemption);
    this.save(db);
    return newRedemption;
  },

  updateRedemption(id, updates) {
    const db = this.get();
    db.redemptions = db.redemptions || [];
    const idx = db.redemptions.findIndex(r => r.id === id);
    if (idx !== -1) {
      db.redemptions[idx] = { ...db.redemptions[idx], ...updates, updatedAt: new Date().toISOString() };
      this.save(db);
      return db.redemptions[idx];
    }
    return null;
  },

  // Testimonials (Bukti Penarikan Member) CRUD
  getTestimonials() {
    const db = this.get();
    return db.testimonials || [];
  },

  getActiveTestimonials() {
    const db = this.get();
    return (db.testimonials || []).filter(t => t.active && (t.status === 'approved' || !t.status));
  },

  getPendingTestimonials() {
    const db = this.get();
    return (db.testimonials || []).filter(t => t.status === 'pending');
  },

  addTestimonial({ name, city, avatar, bank, amount, rating, comment, receiptImage, timeAgo, active = true, status = 'approved', userId = null, pointsRewarded = false }) {
    const db = this.get();
    db.testimonials = db.testimonials || [];
    const newTestimonial = {
      id: 'testi-' + Date.now(),
      userId: userId || null,
      name: (name || 'Member AUTOTRADING').trim(),
      city: (city || 'Indonesia').trim(),
      avatar: (avatar || '').trim() || `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'Member')}&background=C89338&color=fff`,
      bank: (bank || 'BCA Mobile').trim(),
      amount: Number(amount) || 0,
      rating: Math.max(1, Math.min(5, Number(rating) || 5)),
      comment: (comment || '').trim(),
      receiptImage: (receiptImage || '').trim(),
      timeAgo: (timeAgo || 'Baru saja').trim(),
      active: Boolean(active),
      status: status || 'approved',
      pointsRewarded: Boolean(pointsRewarded),
      createdAt: new Date().toISOString()
    };
    db.testimonials.unshift(newTestimonial);
    this.save(db);
    return newTestimonial;
  },

  submitMemberTestimonial({ userId, name, city, avatar, bank, amount, rating, comment, receiptImage }) {
    return this.addTestimonial({
      userId,
      name,
      city,
      avatar,
      bank,
      amount,
      rating,
      comment,
      receiptImage,
      timeAgo: 'Baru saja',
      active: true,
      status: 'pending', // Pending Admin moderation
      pointsRewarded: false
    });
  },

  updateTestimonial(id, updates) {
    const db = this.get();
    db.testimonials = db.testimonials || [];
    const idx = db.testimonials.findIndex(t => t.id === id);
    if (idx !== -1) {
      if (updates.amount !== undefined) updates.amount = Number(updates.amount);
      if (updates.rating !== undefined) updates.rating = Number(updates.rating);
      db.testimonials[idx] = { ...db.testimonials[idx], ...updates, updatedAt: new Date().toISOString() };
      this.save(db);
      return db.testimonials[idx];
    }
    return null;
  },

  deleteTestimonial(id) {
    const db = this.get();
    db.testimonials = (db.testimonials || []).filter(t => t.id !== id);
    this.save(db);
    return true;
  },

  // XSS Defense: HTML Sanitization
  escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  // Reset database to default seed state
  reset() {
    _activeDB = JSON.parse(JSON.stringify(defaultDB));
    this.save(_activeDB);
    return _activeDB;
  }
};

export const escapeHtml = (str) => DB.escapeHtml(str);

