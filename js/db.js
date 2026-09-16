/**
 * FGT PRO - LOCAL STORAGE DATABASE & STATE MANAGEMENT ENGINE
 * Handles persistent data storage, mock database seeding, and reactive states.
 */

const DB_KEY = 'FGT_PRO_DATABASE_V1';

// Default initial state
const defaultDB = {
  // Application Settings
  settings: {
    appName: 'FGT Pro',
    currency: 'IDR',
    usdIdrRate: 16250,
    minDeposit: 50000,
    minWithdraw: 50000,
    withdrawFeePercent: 1.0, // 1% admin fee
    autoProfitIntervalSeconds: 3600, // interval in seconds for simulated daily tick
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
        { id: 'bca', name: 'Bank Central Asia (BCA)', accountNo: '8271928374', accountName: 'PT FGT PRO INVESTASI' },
        { id: 'mandiri', name: 'Bank Mandiri', accountNo: '1370029384721', accountName: 'PT FGT PRO INVESTASI' },
        { id: 'bri', name: 'Bank BRI', accountNo: '034101002938531', accountName: 'PT FGT PRO INVESTASI' }
      ],
      qris: {
        merchantName: 'FGT PRO OFFICIAL QRIS',
        nmid: 'ID1029384756201',
        imageUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=00020101021226580016ID.CO.QRIS.WWW01189360001400001029385204581253033605802ID5916FGT_PRO_OFFICIAL6007JAKARTA61051234062070703A016304E8A2'
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
      priceDisplay: 'US$0.00',
      minDeposit: 100000, // Rp 100,000
      maxDeposit: 1000000, // Rp 1,000,000
      minDailyProfit: 1.2, // 1.2%
      maxDailyProfit: 2.2, // 2.2%
      durationDays: 15,
      description: 'Paket Pemula & Edukasi Trading Algoritma FGT Pro',
      activeCount: 1420
    },
    {
      id: 'plan-rookie',
      name: 'Rookie',
      theme: 'theme-rookie',
      priceDisplay: 'US$0.00',
      minDeposit: 1000000, // Rp 1,000,000
      maxDeposit: 10000000, // Rp 10,000,000
      minDailyProfit: 2.0, // 2.0%
      maxDailyProfit: 3.5, // 3.5%
      durationDays: 30,
      description: 'Paket Standard Otomasi Profit dengan Proteksi Modal',
      activeCount: 890
    },
    {
      id: 'plan-sophomore',
      name: 'Sophomore',
      theme: 'theme-sophomore',
      priceDisplay: 'US$0.00',
      minDeposit: 10000000, // Rp 10,000,000
      maxDeposit: 50000000, // Rp 50,000,000
      minDailyProfit: 3.5, // 3.5%
      maxDailyProfit: 5.0, // 5.0%
      durationDays: 45,
      description: 'Paket Menengah High Frequency AI Trading Signal',
      activeCount: 420
    },
    {
      id: 'plan-vip',
      name: 'VIP Master',
      theme: 'theme-vip',
      priceDisplay: 'US$0.00',
      minDeposit: 50000000, // Rp 50,000,000
      maxDeposit: 500000000, // Rp 500,000,000
      minDailyProfit: 5.0, // 5.0%
      maxDailyProfit: 7.5, // 7.5%
      durationDays: 60,
      description: 'Paket Eksklusif Prof GPT Institutional Hedge Fund',
      activeCount: 180
    }
  ],

  // Users Database
  users: [
    {
      id: 'usr-admin',
      username: 'admin',
      fullName: 'System Administrator',
      email: 'admin@fgtpro.io',
      phone: '081299990000',
      password: 'admin',
      role: 'admin',
      walletBalance: 150000000,
      affiliateBalance: 25000000,
      points: 1500,
      referralCode: 'ADMINVIP',
      referredBy: null,
      kycStatus: 'verified',
      registeredAt: '2026-01-01T00:00:00.000Z'
    },
    {
      id: 'usr-demo',
      username: 'alex_investor',
      fullName: 'Alex Sutanto',
      email: 'alex@gmail.com',
      phone: '081234567890',
      password: 'user123',
      role: 'user',
      walletBalance: 2500000,
      affiliateBalance: 450000,
      points: 120,
      referralCode: 'ALEX88',
      referredBy: 'ADMINVIP',
      kycStatus: 'verified',
      registeredAt: '2026-02-15T08:30:00.000Z'
    },
    {
      id: 'usr-downline-1',
      username: 'sarah_trader',
      fullName: 'Sarah Olivia',
      email: 'sarah@gmail.com',
      phone: '081233344455',
      password: 'user123',
      role: 'user',
      walletBalance: 1200000,
      affiliateBalance: 150000,
      points: 50,
      referralCode: 'SARAH77',
      referredBy: 'ALEX88',
      kycStatus: 'verified',
      registeredAt: '2026-02-20T10:00:00.000Z'
    },
    {
      id: 'usr-downline-2',
      username: 'budi_crypto',
      fullName: 'Budi Hartono',
      email: 'budi@gmail.com',
      phone: '081277788899',
      password: 'user123',
      role: 'user',
      walletBalance: 5000000,
      affiliateBalance: 320000,
      points: 80,
      referralCode: 'BUDI99',
      referredBy: 'ALEX88',
      kycStatus: 'verified',
      registeredAt: '2026-03-01T12:00:00.000Z'
    },
    {
      id: 'usr-downline-3',
      username: 'rendy_fx',
      fullName: 'Rendy Pratama',
      email: 'rendy@gmail.com',
      phone: '081399887766',
      password: 'user123',
      role: 'user',
      walletBalance: 800000,
      affiliateBalance: 40000,
      points: 20,
      referralCode: 'RENDY01',
      referredBy: 'SARAH77', // Level 2 for Alex
      kycStatus: 'verified',
      registeredAt: '2026-03-05T14:30:00.000Z'
    }
  ],

  // Active User Investments
  investments: [
    {
      id: 'inv-001',
      userId: 'usr-demo',
      planId: 'plan-rookie',
      planName: 'Rookie',
      capital: 2000000,
      minRate: 2.0,
      maxRate: 3.5,
      totalProfitEarned: 184000,
      daysElapsed: 3,
      durationDays: 30,
      status: 'active',
      startDate: new Date(Date.now() - 3 * 86400000).toISOString(),
      lastProfitYieldDate: new Date(Date.now() - 3600000).toISOString(),
      pendingProfitClaim: 52000, // Today's pending claimable profit
      history: [
        { date: '2026-09-13', rate: 2.8, amount: 56000, status: 'claimed' },
        { date: '2026-09-14', rate: 3.2, amount: 64000, status: 'claimed' },
        { date: '2026-09-15', rate: 3.2, amount: 64000, status: 'claimed' }
      ]
    },
    {
      id: 'inv-002',
      userId: 'usr-downline-1',
      planId: 'plan-learn',
      planName: 'Learn',
      capital: 1000000,
      minRate: 1.2,
      maxRate: 2.2,
      totalProfitEarned: 52000,
      daysElapsed: 3,
      durationDays: 15,
      status: 'active',
      startDate: new Date(Date.now() - 3 * 86400000).toISOString(),
      lastProfitYieldDate: new Date(Date.now() - 3600000).toISOString(),
      pendingProfitClaim: 18000,
      history: []
    }
  ],

  // Transactions (Deposit, Withdraw, Profit, Sponsor, Rabat)
  transactions: [
    {
      id: 'TRX-1001',
      userId: 'usr-demo',
      username: 'alex_investor',
      type: 'deposit',
      paymentMethod: 'BCA Transfer',
      amount: 2500000,
      uniqueCode: 124,
      proofImage: '',
      status: 'approved',
      createdAt: '2026-09-10T14:20:00.000Z',
      updatedAt: '2026-09-10T14:35:00.000Z'
    },
    {
      id: 'TRX-1002',
      userId: 'usr-downline-1',
      username: 'sarah_trader',
      type: 'deposit',
      paymentMethod: 'QRIS Instant',
      amount: 1000000,
      uniqueCode: 382,
      proofImage: '',
      status: 'approved',
      createdAt: '2026-09-12T09:15:00.000Z',
      updatedAt: '2026-09-12T09:20:00.000Z'
    },
    {
      id: 'TRX-1003',
      userId: 'usr-demo',
      username: 'alex_investor',
      type: 'sponsor_bonus',
      amount: 100000, // 10% from Sarah's 1,000,000
      note: 'Bonus Sponsor dari deposit sarah_trader (Rp 1.000.000)',
      status: 'approved',
      createdAt: '2026-09-12T09:20:00.000Z'
    },
    {
      id: 'TRX-1004',
      userId: 'usr-downline-2',
      username: 'budi_crypto',
      type: 'deposit',
      paymentMethod: 'USDT TRC20',
      amountUsdt: 300,
      amount: 4875000, // 300 * 16250
      txid: '9f8e7d6c5b4a3210fedcba9876543210abcdef1234567890',
      status: 'pending',
      createdAt: new Date().toISOString()
    }
  ],

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
    { id: 'XAUUSD', name: 'XAUUSD', price: 4343.65, change: 1.18, isUp: true, time: '19:13 WIB', code1: 'AU', code2: 'US' },
    { id: 'EURUSD', name: 'EURUSD', price: 1.15352, change: -0.01, isUp: false, time: '19:13 WIB', code1: 'EU', code2: 'US' },
    { id: 'GBPUSD', name: 'GBPUSD', price: 1.34531, change: -0.09, isUp: false, time: '19:13 WIB', code1: 'GB', code2: 'US' },
    { id: 'APPLE.US', name: 'APPLE.US', price: 331.52, change: -0.44, isUp: false, time: '02:54 WIB', code1: 'AP', code2: 'US' },
    { id: 'BTCUSDT', name: 'BTCUSDT', price: 68420.00, change: 3.42, isUp: true, time: '19:15 WIB', code1: 'BTC', code2: 'USD' },
    { id: 'NVDA.US', name: 'NVDA.US', price: 128.90, change: 2.15, isUp: true, time: '02:54 WIB', code1: 'NV', code2: 'US' }
  ],

  // Running Text / Announcements Ticker
  announcements: [
    {
      id: 'ann-1',
      text: 'Selamat datang di FGT Pro Platform Investasi AI Trading Resmi 2026. Dapatkan bonus sponsor 10% dan profit harian otomatis 24/7!',
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
      title: 'AI Trading Algoritma FGT Pro v4.2',
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
      title: 'Kaos Eksklusif FGT Pro Trader 2026 Edition',
      category: 'Merchandise',
      badge: 'OFFICIAL',
      pointsCost: 150,
      stock: 35,
      description: 'T-Shirt Cotton Combed 24s premium dengan bordir emas logo FGT Pro Trading AI.',
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
  redemptions: [
    {
      id: 'RDM-8001',
      userId: 'usr-demo',
      username: 'alex_investor',
      rewardId: 'rew-1',
      rewardTitle: 'Saldo E-Wallet Rp 50.000 (DANA / OVO / GoPay)',
      pointsSpent: 50,
      targetContact: 'DANA / 081298765432 / Alex',
      deliveryAddress: 'Jl. Sudirman Kav 25, Jakarta Selatan',
      status: 'completed',
      adminNote: 'Saldo telah ditransfer via DANA',
      createdAt: '2026-09-14T10:00:00.000Z',
      updatedAt: '2026-09-14T10:30:00.000Z'
    }
  ],

  // Active Session
  currentSession: null // null indicates Guest mode
};

// Helper to generate crisp, standard Base64 SVG Mobile Banking Receipts
export function createReceiptBase64({ bank = 'BCA Mobile', name = 'Member FGT Pro', amount = 10000000, timeAgo = 'Baru saja', refNo = '' }) {
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
    <text x="550" y="275" fill="#0F172A" font-family="Arial, sans-serif" font-size="13" font-weight="bold" text-anchor="end">PT FGT PRO INVESTASI</text>
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
const defaultTestimonials = [
  {
    id: 'testi-1',
    name: 'Budi Santoso',
    city: 'Surabaya, Jawa Timur',
    avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
    bank: 'BCA Mobile',
    amount: 15750000,
    rating: 5,
    comment: 'Awalnya ragu coba deposit 2jt, sekarang udah wd 15.750.000 dalam 2 minggu! Masuk rekening BCA cuma 3 menit tanpa potongan aneh-aneh. Mantap banget min, auto langganan!',
    receiptImage: createReceiptBase64({
      bank: 'BCA Mobile',
      name: 'BUDI SANTOSO (8291****02)',
      amount: 15750000,
      timeAgo: '16 Sep 2026, 08:12:45 WIB',
      refNo: 'BCA20260916-88291039'
    }),
    timeAgo: '12 menit yang lalu',
    active: true,
    createdAt: '2026-09-16T08:12:45.000Z'
  },
  {
    id: 'testi-2',
    name: 'Siti Rahmawati',
    city: 'Jakarta Selatan, DKI',
    avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80',
    bank: 'Livin Mandiri',
    amount: 28500000,
    rating: 5,
    comment: 'Sinyal VIP Prof GPT gila sih akurasinya! WD 28.5jt langsung landing ke Livin Mandiri hitungan menit tanpa drama. Platform AI trading paling jos tahun 2026!',
    receiptImage: createReceiptBase64({
      bank: 'Livin by Mandiri',
      name: 'SITI RAHMAWATI (13700****9281)',
      amount: 28500000,
      timeAgo: '16 Sep 2026, 07:45:10 WIB',
      refNo: 'MDR-20260916-99218274'
    }),
    timeAgo: '35 menit yang lalu',
    active: true,
    createdAt: '2026-09-16T07:45:10.000Z'
  },
  {
    id: 'testi-3',
    name: 'Rian Hidayat',
    city: 'Medan, Sumatera Utara',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    bank: 'BRImo',
    amount: 7300000,
    rating: 5,
    comment: 'Profit harian konsisten tiap hari tinggal klik klaim profit. WD 7.3jt ke rekening BRI masuk cepet banget. Bukti m-banking nyata no rekayasa! Sukses selalu FGT Pro.',
    receiptImage: createReceiptBase64({
      bank: 'BRImo (Bank BRI)',
      name: 'RIAN HIDAYAT (03410****8531)',
      amount: 7300000,
      timeAgo: '16 Sep 2026, 06:30:22 WIB',
      refNo: 'BRI-20260916-00492817'
    }),
    timeAgo: '1 jam yang lalu',
    active: true,
    createdAt: '2026-09-16T06:30:22.000Z'
  },
  {
    id: 'testi-4',
    name: 'Agus Setiawan',
    city: 'Bandung, Jawa Barat',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
    bank: 'DANA',
    amount: 5200000,
    rating: 5,
    comment: 'Modal 1jt udah balik modal plus profit 5.2jt dalam seminggu. Penarikan via DANA cepet banget hitungan detik langsung notif saldo masuk. Recomended pol!',
    receiptImage: createReceiptBase64({
      bank: 'DANA Indonesia',
      name: 'AGUS SETIAWAN (0812****8901)',
      amount: 5200000,
      timeAgo: '16 Sep 2026, 05:15:40 WIB',
      refNo: 'DANA-20260916-77391024'
    }),
    timeAgo: '3 jam yang lalu',
    active: true,
    createdAt: '2026-09-16T05:15:40.000Z'
  },
  {
    id: 'testi-5',
    name: 'Dewi Lestari',
    city: 'Denpasar, Bali',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80',
    bank: 'BNI Mobile',
    amount: 12000000,
    rating: 5,
    comment: 'Bonus rabat referral tim cair terus tiap hari. Sekarang WD 12jt ke BNI langsung masuk. Temen-temen yang saya ajak juga udah pada cuan semua. Terimakasih FGT Pro!',
    receiptImage: createReceiptBase64({
      bank: 'BNI Mobile Banking',
      name: 'DEWI LESTARI (09827****102)',
      amount: 12000000,
      timeAgo: '15 Sep 2026, 21:10:05 WIB',
      refNo: 'BNI-20260915-44918230'
    }),
    timeAgo: 'Kemarin, 21:10 WIB',
    active: true,
    createdAt: '2026-09-15T21:10:05.000Z'
  },
  {
    id: 'testi-6',
    name: 'Hendra Wijaya',
    city: 'Surabaya, Jawa Timur',
    avatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150&auto=format&fit=crop&q=80',
    bank: 'QRIS & Multi-Bank',
    amount: 50000000,
    rating: 5,
    comment: 'Paket VIP Master beneran sultan hasilnya. Sekali tarik 50jt langsung di-approve admin dalam hitungan menit. CS ramah dan fast respons 24 jam!',
    receiptImage: createReceiptBase64({
      bank: 'VIP INSTANT CLEARING',
      name: 'HENDRA WIJAYA (VIP-MEMBER)',
      amount: 50000000,
      timeAgo: '15 Sep 2026, 17:00:00 WIB',
      refNo: 'VIP-20260915-00928192'
    }),
    timeAgo: 'Kemarin, 17:00 WIB',
    active: true,
    createdAt: '2026-09-15T17:00:00.000Z'
  }
];

defaultDB.testimonials = defaultTestimonials;

// Database Service Helper Object
export const DB = {
  get() {
    try {
      const data = localStorage.getItem(DB_KEY);
      if (!data) {
        this.save(defaultDB);
        return defaultDB;
      }
      const parsed = JSON.parse(data);
      if (!parsed.announcements) {
        parsed.announcements = defaultDB.announcements;
      }
      if (!parsed.banners) {
        parsed.banners = defaultDB.banners;
      }
      if (!parsed.rewards) {
        parsed.rewards = defaultDB.rewards;
      }
      if (!parsed.redemptions) {
        parsed.redemptions = defaultDB.redemptions;
      }
      if (!parsed.testimonials || !Array.isArray(parsed.testimonials) || parsed.testimonials.length === 0) {
        parsed.testimonials = defaultDB.testimonials;
      } else {
        // Auto-heal any unencoded SVGs or broken format from previous sessions
        parsed.testimonials = parsed.testimonials.map(t => {
          if (!t.receiptImage || t.receiptImage.startsWith('data:image/svg+xml;utf8,<') || t.receiptImage.includes('<svg') || !t.receiptImage.startsWith('data:') && !t.receiptImage.startsWith('http')) {
            const defMatch = defaultDB.testimonials.find(d => d.id === t.id);
            if (defMatch) {
              t.receiptImage = defMatch.receiptImage;
            } else {
              t.receiptImage = createReceiptBase64({
                bank: t.bank,
                name: t.name,
                amount: t.amount,
                timeAgo: t.timeAgo,
                refNo: t.id
              });
            }
          }
          return t;
        });
      }
      this.save(parsed);
      return parsed;
    } catch (e) {
      console.error('Error loading DB from localStorage:', e);
      return defaultDB;
    }
  },

  save(data) {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('Error saving DB to localStorage:', e);
    }
  },

  resetToDefault() {
    this.save(defaultDB);
    return defaultDB;
  },

  // Auth & Session
  getCurrentUser() {
    const db = this.get();
    if (!db.currentSession) return null;
    return db.users.find(u => u.id === db.currentSession.userId) || null;
  },

  setSession(user) {
    const db = this.get();
    db.currentSession = user ? {
      userId: user.id,
      username: user.username,
      role: user.role,
      loginAt: new Date().toISOString()
    } : null;
    this.save(db);
  },

  clearSession() {
    const db = this.get();
    db.currentSession = null;
    this.save(db);
  },

  // Users
  getUserByUsername(username) {
    const db = this.get();
    return db.users.find(u => u.username.toLowerCase() === username.toLowerCase() || u.email.toLowerCase() === username.toLowerCase() || u.phone === username);
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

  addUser(userData) {
    const db = this.get();
    const newUser = {
      id: 'usr-' + Date.now(),
      walletBalance: 0,
      affiliateBalance: 0,
      points: 10, // welcome bonus points
      kycStatus: 'unverified',
      registeredAt: new Date().toISOString(),
      role: 'user',
      ...userData
    };
    db.users.push(newUser);
    this.save(db);
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

  // Banner Slides Carousel CRUD
  getBanners() {
    const db = this.get();
    return db.banners || [];
  },

  getActiveBanners() {
    const db = this.get();
    return (db.banners || []).filter(b => b.active);
  },

  addBanner({ title, subtitle, badge, imageUrl, actionUrl, active = true }) {
    const db = this.get();
    db.banners = db.banners || [];
    const newBanner = {
      id: 'ban-' + Date.now(),
      title: (title || '').trim(),
      subtitle: (subtitle || '').trim(),
      badge: (badge || 'PROMO').trim(),
      imageUrl: (imageUrl || '').trim(),
      actionUrl: actionUrl || 'plans',
      active: Boolean(active),
      createdAt: new Date().toISOString()
    };
    db.banners.unshift(newBanner);
    this.save(db);
    return newBanner;
  },

  updateBanner(id, updates) {
    const db = this.get();
    db.banners = db.banners || [];
    const idx = db.banners.findIndex(b => b.id === id);
    if (idx !== -1) {
      db.banners[idx] = { ...db.banners[idx], ...updates };
      this.save(db);
      return db.banners[idx];
    }
    return null;
  },

  deleteBanner(id) {
    const db = this.get();
    db.banners = (db.banners || []).filter(b => b.id !== id);
    this.save(db);
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
    return (db.testimonials || []).filter(t => t.active);
  },

  addTestimonial({ name, city, avatar, bank, amount, rating, comment, receiptImage, timeAgo, active = true }) {
    const db = this.get();
    db.testimonials = db.testimonials || [];
    const newTestimonial = {
      id: 'testi-' + Date.now(),
      name: (name || 'Member FGT Pro').trim(),
      city: (city || 'Indonesia').trim(),
      avatar: (avatar || '').trim() || `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'Member')}&background=C89338&color=fff`,
      bank: (bank || 'BCA Mobile').trim(),
      amount: Number(amount) || 0,
      rating: Math.max(1, Math.min(5, Number(rating) || 5)),
      comment: (comment || '').trim(),
      receiptImage: (receiptImage || '').trim(),
      timeAgo: (timeAgo || 'Baru saja').trim(),
      active: Boolean(active),
      createdAt: new Date().toISOString()
    };
    db.testimonials.unshift(newTestimonial);
    this.save(db);
    return newTestimonial;
  },

  updateTestimonial(id, updates) {
    const db = this.get();
    db.testimonials = db.testimonials || [];
    const idx = db.testimonials.findIndex(t => t.id === id);
    if (idx !== -1) {
      if (updates.amount !== undefined) updates.amount = Number(updates.amount);
      if (updates.rating !== undefined) updates.rating = Number(updates.rating);
      db.testimonials[idx] = { ...db.testimonials[idx], ...updates };
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

  // Reset database to default seed state
  reset() {
    localStorage.removeItem(DB_KEY);
    return this.get();
  }
};

