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

  // Active Session
  currentSession: null // null indicates Guest mode
};

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

  // Reset database to default seed state
  reset() {
    localStorage.removeItem(DB_KEY);
    return this.get();
  }
};
