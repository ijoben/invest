/**
 * AUTOTRADING - MAIN APPLICATION CONTROLLER & UI RENDERER
 * Connects DOM events, handles SPA routing, renders views, and synchronizes real-time state.
 * Premium Fintech Edition: Vector SVG Icons & Polished UI.
 */

import { DB, createReceiptBase64 } from './db.js';
import { Auth } from './auth.js';
import { Plans } from './plans.js';
import { Affiliate } from './affiliate.js';
import { Payment } from './payment.js';
import { Signals } from './signals.js';
import { Rewards } from './rewards.js';

// Application State
const App = {
  currentTab: 'home',
  marketInterval: null,
  bannerInterval: null,
  profitCountdownInterval: null,
  aiChartInterval: null,
  currentBannerSlide: 0,
  bannersData: [],
  currentTestimonialFilter: 'all',
  testimonialsData: [],
  uploadedDepositProofBase64: null,
  aiChartPoints: [
    1.1528, 1.1531, 1.1529, 1.1535, 1.1532, 1.1538, 1.1541, 1.1539,
    1.1544, 1.1542, 1.1546, 1.1543, 1.1549, 1.1547, 1.1552, 1.1550,
    1.1555, 1.1551, 1.1558, 1.1554, 1.1560, 1.1557, 1.1563, 1.1561, 1.1565
  ],

  init() {
    // Check URL parameters (e.g. ?ref=KODE)
    const urlParams = new URLSearchParams(window.location.search);
    const refParam = urlParams.get('ref');
    if (refParam) {
      sessionStorage.setItem('autotrading_ref_code', refParam);
      sessionStorage.setItem('fgt_ref_code', refParam); // legacy compat
      const refInput = document.getElementById('regReferral');
      if (refInput) refInput.value = refParam;
    }

    // Render Initial State
    this.renderAll();
    this.bindEvents();
    this.startMarketTicker();
    this.startProfitCountdownLoop();
    this.initAiTradingChart();

    // Background sync with MySQL (if cPanel API is active)
    DB.initCloudSync(() => this.renderAll());

    // Show quick welcome toast
    setTimeout(() => {
      if (!Auth.isLoggedIn()) {
        this.showToast('Selamat datang di AUTOTRADING. Silakan login untuk mengakses fitur lengkap.', 'info');
      }
    }, 800);
  },

  // Real-time profit countdown loop (every 1 sec)
  startProfitCountdownLoop() {
    if (this.profitCountdownInterval) clearInterval(this.profitCountdownInterval);
    this.profitCountdownInterval = setInterval(() => {
      this.updateProfitCountdown();
    }, 1000);
  },

  // Real-time market ticker loop
  startMarketTicker() {
    if (this.marketInterval) clearInterval(this.marketInterval);
    this.marketInterval = setInterval(() => {
      Signals.tickMarkets();
      this.renderMarketTickers();
    }, 2000);
  },

  // Main UI Synchronizer
  renderAll() {
    const user = Auth.getUser();
    const db = DB.get();

    // 0. Synchronize Browser Tab Title & Favicon from Settings
    const cfg = db.settings || {};
    const ws = cfg.webSettings || {};
    const appName = cfg.appName || 'AUTOTRADING';
    const tagline = ws.tagline || 'Platform Investasi & AI Trading Mobile Terpercaya';
    document.title = `${appName} - ${tagline}`;
    if (ws.faviconUrl) {
      const link = document.querySelector("link[rel*='icon']");
      if (link) link.href = ws.faviconUrl;
    }

    // Guest Protection: Pastikan user belum login tidak berada di tab member
    if (!user && this.currentTab && this.currentTab !== 'home') {
      this.currentTab = 'home';
      document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.getAttribute('data-tab') === 'home');
      });
      document.querySelectorAll('.tab-content').forEach(pane => {
        pane.classList.toggle('active', pane.id === 'tab-home');
      });
    }

    // 1. Render Top Header
    this.renderHeader(user);

    // 1.5 Render Running Text / Announcement Ticker
    this.renderRunningText();

    // 2. Render 4-Column Wallet Balance Card
    this.renderWalletSummary(user);

    // 2.5 Render Portfolio Analytics & Growth Chart (Requirements 2, 3, 4)
    this.renderPortfolioAnalytics(user, db);

    // 3. Render Plan / VIP Tier Carousel
    this.renderTierCarousel(user, db);

    // 4. Render Live Market Tickers
    this.renderMarketTickers();

    // 5. Render Trading / CTA Banner
    this.renderTradingBanner(user);

    // 5.5 Render Banner Slides Carousel (Below Login Button)
    this.renderBannerCarousel();

    // 6. Render Prof GPT Signals
    this.renderSignals();

    // 6.5 Render Rewards Points Carousel (Under Signals Section)
    this.renderRewardsCarousel(user);

    // 7. Render Other Views if active
    if (this.currentTab === 'wallet') this.renderWalletView(user);
    if (this.currentTab === 'trade') this.renderTradeView(user);
    if (this.currentTab === 'profile') this.renderProfileView(user);
    if (this.currentTab === 'markets') this.renderMarketsView();
  },

  // 1. Header Rendering (Optimized for Mobile Screens)
  renderHeader(user) {
    const greetingEl = document.getElementById('userGreetingText');
    const avatarEl = document.getElementById('userAvatarBadge');
    
    if (user) {
      const activePlans = Plans.getUserInvestments(user.id);
      const isMemberActive = activePlans.length > 0;
      const sponsorName = user.referredBy ? user.referredBy : 'Opsional';
      const statusBadge = isMemberActive
        ? `<span class="badge-member-active-mini">🟢 Member Aktif</span>`
        : `<span class="badge-member-inactive-mini">⚪ Belum Aktif</span>`;

      greetingEl.innerHTML = `
        <div class="greeting-user-name">Hi, <span class="user-name">${user.fullName || user.username}</span></div>
        <div class="greeting-meta-row">
          ${statusBadge}
          <span style="color: #94A3B8; font-size: 8px;">•</span>
          <span class="greeting-sponsor-text">Sponsor: <strong>${sponsorName}</strong></span>
        </div>
      `;
      avatarEl.classList.add('logged-in');
      avatarEl.innerHTML = `<span>${(user.username || 'U')[0].toUpperCase()}</span><span class="online-dot"></span>`;
    } else {
      greetingEl.innerHTML = `
        <div class="greeting-guest-name">Hi guest,</div>
        <div class="greeting-guest-sub">Selamat Datang</div>
      `;
      avatarEl.classList.remove('logged-in');
      avatarEl.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
          <circle cx="12" cy="7" r="4"></circle>
        </svg>
      `;
    }
  },

  // 1.5 Announcement Ticker / Running Text
  renderRunningText() {
    const el = document.getElementById('frontendRunningText');
    if (!el) return;

    const announcements = DB.getActiveAnnouncements();
    if (announcements.length === 0) {
      el.textContent = 'Selamat datang di AUTOTRADING Platform Investasi AI Trading Resmi 2026.';
      return;
    }

    const textJoined = announcements.map(a => a.text).join('   ✦✦✦   ');
    el.textContent = textJoined;
  },

  // 2. 4-Column Wallet Balance Card
  renderWalletSummary(user) {
    const mainBalEl = document.getElementById('valMainBalance');
    const affBalEl = document.getElementById('valAffiliateBalance');
    const pointEl = document.getElementById('valPoint');
    const profitEl = document.getElementById('valTodayProfit');
    const marketStatus = Plans.isMarketOpen();
    const db = DB.get();
    const isLossMode = db.settings.todayProfitLossMode && db.settings.todayProfitLossMode.isLoss;
    const lossMessage = (db.settings.todayProfitLossMode && db.settings.todayProfitLossMode.message) || 'Hari ini pasar mengalami fluktuasi / Loss (Dividen Profit 0%). Fitur proteksi modal menjaga saldo pokok Anda tetap 100% aman.';

    // Mode Loss Banner Notice (Requirement 4)
    const lossBanner = document.getElementById('lossModeNoticeBanner');
    const lossText = document.getElementById('lossModeNoticeText');
    if (lossBanner) {
      if (isLossMode) {
        lossBanner.style.display = 'block';
        if (lossText) lossText.textContent = lossMessage;
      } else {
        lossBanner.style.display = 'none';
      }
    }

    if (user) {
      mainBalEl.textContent = DB.formatIDR(user.walletBalance);
      affBalEl.textContent = DB.formatIDR(user.affiliateBalance);
      pointEl.textContent = user.points || 0;
      
      const userInvs = Plans.getUserInvestments(user.id);
      const hasActivePlan = Array.isArray(userInvs) && userInvs.some(i => i.status === 'active');
      const rate = hasActivePlan ? Plans.getUserTodayProfitRate(user.id) : 0;
      if (profitEl) {
        if (isLossMode) {
          profitEl.textContent = '0.00% (Loss)';
          profitEl.style.color = '#EF4444';
          profitEl.title = 'Mode Loss aktif hari ini (Dividen 0.00%, modal pokok 100% aman)';
        } else if (!marketStatus.isOpen) {
          profitEl.textContent = '0.00% (OFF)';
          profitEl.style.color = '#EF4444';
          profitEl.title = 'Pasar sedang libur / OFF. Dividen profit akan berjalan aktif saat pasar ON.';
        } else if (!hasActivePlan) {
          profitEl.textContent = '0.00%';
          profitEl.style.color = '#64748B';
          profitEl.title = 'Belum ada paket investasi aktif. Aktifkan paket untuk mulai mendapatkan profit harian.';
        } else {
          profitEl.textContent = rate > 0 ? `+${rate.toFixed(2)}%` : '+0.00%';
          profitEl.style.color = rate > 0 ? '#16A34A' : '#0F172A';
          profitEl.title = 'Profit dividen harian AI berjalan realtime';
        }
      }
    } else {
      mainBalEl.textContent = 'IDR 0';
      affBalEl.textContent = 'IDR 0';
      pointEl.textContent = '0';
      if (profitEl) {
        if (isLossMode) {
          profitEl.textContent = '0.00% (Loss)';
          profitEl.style.color = '#EF4444';
        } else if (!marketStatus.isOpen) {
          profitEl.textContent = '0.00% (OFF)';
          profitEl.style.color = '#EF4444';
        } else {
          profitEl.textContent = '0.00%';
          profitEl.style.color = '#64748B';
          profitEl.title = 'Silakan login untuk melihat profit berjalan paket Anda.';
        }
      }
    }
  },

  // 2.5 Portfolio Analytics, Growth Curve & 7-Day Profit Breakdown (Requirements 2, 3, 4)
  portfolioTimeframe: 7,

  changePortfolioTimeframe(days) {
    this.portfolioTimeframe = Number(days) || 7;
    ['btnTf7d', 'btnTf14d', 'btnTf30d'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.classList.remove('active');
    });

    const activeBtn = document.getElementById(`btnTf${days}d`);
    if (activeBtn) activeBtn.classList.add('active');

    const user = Auth.getUser();
    const db = DB.get();
    this.renderPortfolioGrowthChart(user, db, this.portfolioTimeframe);
  },

  renderPortfolioAnalytics(user, db) {
    const totalAssetValEl = document.getElementById('portfolioTotalAssetVal');
    const growthBadgeEl = document.getElementById('portfolioGrowthRateBadge');
    const chartActiveCapEl = document.getElementById('chartStatActiveCap');
    const chartTotalProfitEl = document.getElementById('chartStatTotalProfit');

    let totalAsset = 0;
    let activeCapital = 0;
    let totalProfitEarned = 0;

    if (user) {
      const userInvs = (db.investments || []).filter(i => i.userId === user.id);
      const activeInvs = userInvs.filter(i => i.status === 'active');
      activeCapital = activeInvs.reduce((sum, i) => sum + (i.capital || 0), 0);
      totalProfitEarned = userInvs.reduce((sum, i) => sum + (i.totalProfitEarned || 0) + (i.pendingProfitClaim || 0), 0);
      totalAsset = (user.walletBalance || 0) + (user.affiliateBalance || 0) + activeCapital;
    } else {
      totalAsset = 0;
      activeCapital = 0;
      totalProfitEarned = 0;
    }

    if (totalAssetValEl) totalAssetValEl.textContent = DB.formatIDR(totalAsset);
    if (chartActiveCapEl) chartActiveCapEl.textContent = DB.formatIDR(activeCapital);
    if (chartTotalProfitEl) chartTotalProfitEl.textContent = DB.formatIDR(totalProfitEarned);

    // Calculate growth % over time
    const weeklyData = Plans.getWeeklyProfitHistory(user ? user.id : null);
    const totalWeeklyRate = weeklyData.totalRate || 0;
    if (growthBadgeEl) {
      if (weeklyData.isGuest) {
        growthBadgeEl.textContent = '▲ Portofolio AI Aktif';
        growthBadgeEl.className = 'badge-growth-neutral';
      } else if (!weeklyData.hasActivePackage) {
        growthBadgeEl.textContent = '0.00% Return (Paket Belum Aktif)';
        growthBadgeEl.className = 'badge-growth-neutral';
      } else if (weeklyData.todayIsLoss) {
        growthBadgeEl.textContent = `▲ +${totalWeeklyRate.toFixed(2)}% Return (0% Hari Ini)`;
        growthBadgeEl.className = 'badge-growth-neutral';
      } else {
        growthBadgeEl.textContent = `▲ +${totalWeeklyRate.toFixed(2)}% 5-Day Return`;
        growthBadgeEl.className = 'badge-growth-positive';
      }
    }

    // Render Canvas Chart
    this.renderPortfolioGrowthChart(user, db, this.portfolioTimeframe || 7);

    // Render 7-Day Weekly Breakdown
    this.renderWeeklyProfitBreakdown(user, db);
  },

  renderWeeklyProfitBreakdown(user, db) {
    const container = document.getElementById('weeklyProfitGridContainer');
    const totalRateEl = document.getElementById('weeklyTotalReturnRate');
    const avgRateEl = document.getElementById('weeklyAvgDailyRate');
    const statusPillEl = document.getElementById('weeklyTodayStatusPill');

    const weekly = Plans.getWeeklyProfitHistory(user ? user.id : null);

    if (weekly.isGuest) {
      // Requirement 3: Guest view - rincian mingguan kosong (hanya untuk member saat login)
      if (totalRateEl) totalRateEl.textContent = '-';
      if (avgRateEl) avgRateEl.textContent = '-';
      if (statusPillEl) {
        statusPillEl.textContent = '🔒 Khusus Member';
        statusPillEl.className = 'badge-status-pill';
        statusPillEl.style.background = '#F1F5F9';
        statusPillEl.style.color = '#64748B';
      }
    } else if (!weekly.hasActivePackage) {
      // User Revision: User baru/belum aktif paket -> rincian kosong
      if (totalRateEl) totalRateEl.textContent = '0.00%';
      if (avgRateEl) avgRateEl.textContent = '0.00% / hari';
      if (statusPillEl) {
        statusPillEl.textContent = '⚪ Belum Ada Paket Aktif';
        statusPillEl.className = 'badge-status-pill neutral';
        statusPillEl.style.background = '#F1F5F9';
        statusPillEl.style.color = '#64748B';
      }
    } else {
      // Member logged in with active package:
      if (totalRateEl) totalRateEl.textContent = `+${weekly.totalRate.toFixed(2)}%`;
      if (avgRateEl) avgRateEl.textContent = `+${weekly.avgRate.toFixed(2)}% / hari`;

      if (statusPillEl) {
        statusPillEl.style.background = '';
        statusPillEl.style.color = '';
        if (weekly.todayIsLoss) {
          statusPillEl.textContent = '🔴 Mode Loss (0.00%)';
          statusPillEl.className = 'badge-status-pill rejected';
        } else if (weekly.isWeekendToday) {
          statusPillEl.textContent = '⏸️ Pasar OFF (Libur)';
          statusPillEl.className = 'badge-status-pill neutral';
        } else {
          const todayRec = (weekly.records || []).find(r => r.isToday);
          const todayRate = todayRec && typeof todayRec.rate === 'number' ? todayRec.rate : 0;
          statusPillEl.textContent = `🟢 Normal (+${todayRate.toFixed(2)}%)`;
          statusPillEl.className = 'badge-status-pill approved';
        }
      }
    }

    if (container && Array.isArray(weekly.records)) {
      const cardsHtml = weekly.records.map((rec) => {
        let cardClass = 'weekly-day-card';
        if (rec.isToday) cardClass += ' today';
        if (rec.isLoss) cardClass += ' loss';
        if (rec.isWeekend) cardClass += ' weekend-off';
        if (weekly.isGuest) cardClass += ' guest-locked';
        if (!weekly.isGuest && !weekly.hasActivePackage) cardClass += ' no-plan';

        const dayLabel = rec.isToday ? 'Hari Ini' : rec.dayName.substring(0, 3);
        const displayRate = rec.displayRate;
        const pillText = rec.pillText;

        return `
          <div class="${cardClass}" title="${rec.dayName} (${rec.date}): ${rec.statusLabel}">
            <span class="weekly-day-name">${dayLabel}</span>
            <span class="weekly-day-date">${rec.date}</span>
            <div class="weekly-day-rate">${displayRate}</div>
            <span class="weekly-day-pill">${pillText}</span>
          </div>
        `;
      }).join('');

      let bannerNoticeHtml = '';
      if (weekly.isGuest) {
        bannerNoticeHtml = `
          <div class="weekly-guest-lock-banner" onclick="App.openAuthModalWithTab('login')">
            <span style="font-size: 16px;">🔒</span>
            <div style="flex: 1;">
              <strong style="color: #92400E; font-size: 11.5px; display: block;">Rincian Profit Khusus Member</strong>
              <p style="color: #B45309; font-size: 10px; margin: 2px 0 0 0; line-height: 1.3;">Rincian profit harian selama seminggu hanya bisa dicek saat login. Klik untuk <strong>Login atau Daftar</strong>.</p>
            </div>
            <span style="font-size: 11px; font-weight: 800; color: #C89338;">Buka ›</span>
          </div>
        `;
      } else if (!weekly.hasActivePackage) {
        bannerNoticeHtml = `
          <div class="weekly-no-plan-banner" onclick="document.getElementById('tierCarouselContainer').scrollIntoView({ behavior: 'smooth' })">
            <span style="font-size: 16px;">📦</span>
            <div style="flex: 1;">
              <strong style="color: #0F172A; font-size: 11.5px; display: block;">Paket Investasi Belum Aktif</strong>
              <p style="color: #64748B; font-size: 10px; margin: 2px 0 0 0; line-height: 1.3;">
                Rincian profit harian berjalan akan aktif otomatis setelah paket Anda aktif. Klik untuk <strong>Pilih & Aktifkan Paket</strong>.
              </p>
            </div>
            <span style="font-size: 11px; font-weight: 800; color: #C89338;">Pilih Paket ›</span>
          </div>
        `;
      }

      container.innerHTML = cardsHtml + bannerNoticeHtml;
    }
  },

  renderPortfolioGrowthChart(user, db, days = 7) {
    const canvas = document.getElementById('portfolioGrowthCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high DPI retina display
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = rect.width || 340;
    const height = 155;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    // Get weekly profit points
    const weekly = Plans.getWeeklyProfitHistory(user ? user.id : null);
    const records = weekly.records || [];
    const isLossToday = weekly.todayIsLoss;
    const hasActivePackage = weekly.hasActivePackage;

    // Calculate baseline asset and progression points
    let currentTotalAsset = 0;
    let activeCapital = 0;
    if (user) {
      const userInvs = (db.investments || []).filter(i => i.userId === user.id && i.status === 'active');
      activeCapital = userInvs.reduce((sum, i) => sum + (i.capital || 0), 0);
      currentTotalAsset = (user.walletBalance || 0) + (user.affiliateBalance || 0) + activeCapital;
    }

    // Progression curve calculation
    let points = [];
    let dates = [];

    if (!hasActivePackage) {
      const baseline = currentTotalAsset;
      points = records.map(() => baseline);
      dates = records.map(r => r.date);
    } else if (days === 7) {
      const baseAsset = currentTotalAsset > 0 ? currentTotalAsset * 0.93 : 10000000;
      let cumAsset = baseAsset;
      points = records.map((r, i) => {
        const rateFactor = (r.rate || 0) / 100;
        cumAsset = cumAsset * (1 + rateFactor);
        return cumAsset;
      });
      dates = records.map(r => r.date);
    } else if (days === 14) {
      const numPoints = 14;
      const baseAsset = currentTotalAsset > 0 ? currentTotalAsset * 0.88 : 8500000;
      let cumAsset = baseAsset;
      for (let i = 0; i < numPoints; i++) {
        const isLast = i === numPoints - 1;
        const rate = (isLast && isLossToday) ? 0 : (0.7 + (Math.sin(i * 0.9) * 0.4 + 0.3));
        cumAsset = cumAsset * (1 + rate / 100);
        points.push(cumAsset);
        dates.push(`${15 + i} Sep`);
      }
    } else {
      // 30 days
      const numPoints = 15;
      const baseAsset = currentTotalAsset > 0 ? currentTotalAsset * 0.78 : 7000000;
      let cumAsset = baseAsset;
      for (let i = 0; i < numPoints; i++) {
        const isLast = i === numPoints - 1;
        const rate = (isLast && isLossToday) ? 0 : (0.8 + (Math.cos(i * 0.6) * 0.3 + 0.2));
        cumAsset = cumAsset * (1 + rate / 100);
        points.push(cumAsset);
        dates.push(`${i * 2 + 1} Sep`);
      }
    }

    if (points.length === 0) return;

    // Coordinates mapping
    const paddingLeft = 36;
    const paddingRight = 18;
    const paddingTop = 20;
    const paddingBottom = 26;

    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    const minVal = Math.min(...points) * 0.985;
    const maxVal = Math.max(...points) * 1.015;
    const valRange = (maxVal - minVal) || 1;

    const getX = (index) => paddingLeft + (index / (points.length - 1)) * chartWidth;
    const getY = (val) => paddingTop + chartHeight - ((val - minVal) / valRange) * chartHeight;

    // Draw horizontal dashed grid lines
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#E2E8F0';
    ctx.setLineDash([4, 4]);

    for (let i = 0; i <= 3; i++) {
      const y = paddingTop + (chartHeight / 3) * i;
      ctx.beginPath();
      ctx.moveTo(paddingLeft, y);
      ctx.lineTo(width - paddingRight, y);
      ctx.stroke();

      // Axis labels (approximate IDR values)
      const valAtY = maxVal - (valRange / 3) * i;
      ctx.fillStyle = '#94A3B8';
      ctx.font = '8.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const labelText = (valAtY >= 1000000) ? (valAtY / 1000000).toFixed(1) + 'M' : (valAtY / 1000).toFixed(0) + 'K';
      ctx.fillText(labelText, paddingLeft - 4, y);
    }
    ctx.setLineDash([]); // Reset dash

    // Draw Smooth Bezier Curve Path
    ctx.beginPath();
    ctx.moveTo(getX(0), getY(points[0]));

    for (let i = 0; i < points.length - 1; i++) {
      const x0 = getX(i);
      const y0 = getY(points[i]);
      const x1 = getX(i + 1);
      const y1 = getY(points[i + 1]);

      const cx = (x0 + x1) / 2;
      ctx.bezierCurveTo(cx, y0, cx, y1, x1, y1);
    }

    // Fill Gradient under curve
    const gradient = ctx.createLinearGradient(0, paddingTop, 0, paddingTop + chartHeight);
    gradient.addColorStop(0, 'rgba(16, 185, 129, 0.28)');
    gradient.addColorStop(0.7, 'rgba(16, 185, 129, 0.05)');
    gradient.addColorStop(1, 'rgba(16, 185, 129, 0.00)');

    ctx.save();
    ctx.lineTo(getX(points.length - 1), paddingTop + chartHeight);
    ctx.lineTo(getX(0), paddingTop + chartHeight);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.restore();

    // Stroke the curve line
    ctx.beginPath();
    ctx.moveTo(getX(0), getY(points[0]));
    for (let i = 0; i < points.length - 1; i++) {
      const x0 = getX(i);
      const y0 = getY(points[i]);
      const x1 = getX(i + 1);
      const y1 = getY(points[i + 1]);
      const cx = (x0 + x1) / 2;
      ctx.bezierCurveTo(cx, y0, cx, y1, x1, y1);
    }
    ctx.strokeStyle = '#10B981';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Draw Data Point Circles
    points.forEach((val, i) => {
      const x = getX(i);
      const y = getY(val);
      const isLast = i === points.length - 1;

      // Glow circle for last point
      if (isLast) {
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.fillStyle = isLossToday ? 'rgba(239, 68, 68, 0.25)' : 'rgba(16, 185, 129, 0.25)';
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(x, y, isLast ? 4 : 2.5, 0, Math.PI * 2);
      ctx.fillStyle = isLast && isLossToday ? '#EF4444' : (isLast ? '#10B981' : '#FFFFFF');
      ctx.strokeStyle = isLast && isLossToday ? '#B91C1C' : '#10B981';
      ctx.lineWidth = 1.8;
      ctx.fill();
      ctx.stroke();

      // Date labels on X-axis (sample 4 labels)
      if (i === 0 || i === Math.floor(points.length / 2) || isLast) {
        ctx.fillStyle = isLast ? '#0F172A' : '#94A3B8';
        ctx.font = isLast ? 'bold 8.5px "Plus Jakarta Sans", sans-serif' : '8px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(isLast ? 'Hari Ini' : (dates[i] || ''), x, paddingTop + chartHeight + 14);
      }
    });

    if (!hasActivePackage) {
      ctx.fillStyle = '#64748B';
      ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(user ? 'Belum Ada Paket Investasi Aktif' : 'Silakan Login untuk Melihat Portofolio', width / 2, paddingTop + chartHeight / 2);
    }
  },

  // 3. Tier Carousel (Learn, Rookie, Sophomore, VIP)
  renderTierCarousel(user, db) {
    const container = document.getElementById('tierCarouselContainer');
    if (!container) return;

    const userInvestments = user ? Plans.getAllUserInvestments(user.id) : [];

    container.innerHTML = db.plans.map(plan => {
      const planInvs = userInvestments.filter(inv => inv.planId === plan.id);
      const activeInvs = planInvs.filter(inv => inv.status === 'active');
      const activeCount = activeInvs.length;
      const isUserActiveInPlan = activeCount > 0;
      const totalPlanProfit = planInvs.reduce((sum, inv) => sum + (inv.totalProfitEarned || 0) + (inv.pendingProfitClaim || 0), 0);
      const profitDisplay = totalPlanProfit > 0 ? `+${DB.formatIDR(totalPlanProfit)}` : DB.formatIDR(0);
      
      return `
        <div class="tier-card ${plan.theme || 'theme-learn'}">
          <div class="tier-header">
            <div class="tier-title-wrap">
              <span class="tier-title">${plan.name}</span>
              <span class="tier-info-icon" onclick="App.openPlanModal('${plan.id}')" title="Detail Paket">ⓘ</span>
            </div>
            <span class="tier-amount" title="Profit dari paket yang dibeli">${profitDisplay}</span>
          </div>
          <div class="tier-badge-profit">
            <span>Profit Harian: ${plan.minDailyProfit}% - ${plan.maxDailyProfit}%</span>
          </div>
          <div class="tier-actions">
            <button class="tier-btn btn-topup" onclick="App.handlePlanTopUp('${plan.id}')">
              <span>+ Top Up</span>
            </button>
            <button class="tier-btn btn-refund" onclick="App.handlePlanRefund('${plan.id}')">
              <span>Refund</span>
            </button>
            ${isUserActiveInPlan ? `
              <button class="tier-btn btn-active" onclick="App.switchTab('trade')" title="${activeCount} Paket Sedang Aktif">
                <span>${activeCount} Paket Active</span>
              </button>
            ` : `
              <button class="tier-btn btn-active" onclick="App.handlePlanAction('${plan.id}')">
                <span>Active</span>
              </button>
            `}
          </div>
        </div>
      `;
    }).join('');
  },

  // 4. Live Market Tickers
  renderMarketTickers() {
    const container = document.getElementById('marketTickerContainer');
    if (!container) return;

    const marketStatus = Plans.isMarketOpen();
    const tickers = Signals.getMarketTickers();
    
    container.innerHTML = tickers.map(t => {
      const changeClass = t.change >= 0 ? 'up' : 'down';
      const changeSign = t.change >= 0 ? '+' : '';
      return `
        <div class="ticker-card" onclick="App.openRiwayatModal()">
          <div class="ticker-top">
            <div class="ticker-flag-pair">
              <span class="flag-icon first" style="background:#E2E8F0; color:#1E293B;">${t.code1 || t.name.substring(0,2)}</span>
              <span class="flag-icon second" style="background:#3B82F6; color:#FFFFFF;">US</span>
            </div>
            <span class="ticker-symbol">${t.name}</span>
          </div>
          <div class="ticker-price">${t.price.toLocaleString('en-US', { minimumFractionDigits: t.price < 10 ? 4 : 2 })}</div>
          <div class="ticker-footer">
            ${!marketStatus.isOpen ? `
              <span class="market-off-badge">🔴 PASAR OFF</span>
              <span class="ticker-time" style="color: #94A3B8;">Libur</span>
            ` : `
              <span class="ticker-change ${changeClass}">${changeSign}${t.change}%</span>
              <span class="ticker-time">${t.time}</span>
            `}
          </div>
        </div>
      `;
    }).join('');
  },

  // 5. Trading CTA / Daily Profit Claim Banner
  renderTradingBanner(user) {
    const guestBox = document.getElementById('tradingBannerGuest');
    const authBox = document.getElementById('tradingBannerAuth');

    if (user) {
      guestBox.style.display = 'none';
      authBox.style.display = 'flex';

      const userInvestments = Plans.getUserInvestments(user.id);
      const totalCapital = userInvestments.reduce((sum, i) => sum + i.capital, 0);
      const totalPendingProfit = userInvestments.reduce((sum, i) => sum + (i.pendingProfitClaim || 0), 0);
      const totalEarned = userInvestments.reduce((sum, i) => sum + (i.totalProfitEarned || 0), 0);

      document.getElementById('authTotalCapital').textContent = DB.formatIDR(totalCapital);
      document.getElementById('authPendingProfit').textContent = DB.formatIDR(totalPendingProfit);
      document.getElementById('authTotalEarned').textContent = DB.formatIDR(totalEarned);

      this.updateProfitCountdown();
    } else {
      guestBox.style.display = 'block';
      authBox.style.display = 'none';
    }
  },

  // 5.1 Real-time Profit Countdown & 100% Progress Bar Calculation
  updateProfitCountdown() {
    const user = Auth.getUser();
    if (!user) return;

    const userInvs = Plans.getUserInvestments(user.id);
    const totalPendingProfit = userInvs.reduce((sum, i) => sum + (i.pendingProfitClaim || 0), 0);

    const cardEl = document.getElementById('profitCountdownCard');
    const statusTitleEl = document.getElementById('countdownStatusTitle');
    const timerValEl = document.getElementById('countdownTimerValue');
    const percentBadgeEl = document.getElementById('countdownPercentBadge');
    const progressBarEl = document.getElementById('countdownProgressBar');
    const footerHintEl = document.getElementById('countdownFooterHint');
    const nextYieldEl = document.getElementById('countdownNextYieldTime');
    const claimBtn = document.getElementById('btnClaimProfit');

    if (!cardEl) return;

    if (userInvs.length === 0) {
      if (statusTitleEl) statusTitleEl.textContent = 'Proses Profit:';
      if (timerValEl) {
        timerValEl.textContent = 'Belum Ada Paket';
        timerValEl.style.color = '#94A3B8';
      }
      if (percentBadgeEl) {
        percentBadgeEl.textContent = '0%';
        percentBadgeEl.style.background = '#475569';
        percentBadgeEl.style.boxShadow = 'none';
      }
      if (progressBarEl) {
        progressBarEl.style.width = '0%';
      }
      if (footerHintEl) footerHintEl.textContent = 'Aktifkan paket investasi untuk memulai proses profit berjalan';
      if (nextYieldEl) nextYieldEl.textContent = '-';
      if (claimBtn) {
        claimBtn.innerHTML = `<span>Mulai Investasi Paket AI</span>`;
        claimBtn.style.opacity = '1';
        claimBtn.onclick = () => {
          const planSection = document.querySelector('.tier-carousel-container');
          if (planSection) planSection.scrollIntoView({ behavior: 'smooth' });
        };
      }
      return;
    }

    // Set default claim onClick handler
    if (claimBtn) {
      claimBtn.onclick = () => App.claimProfit();
    }

    if (totalPendingProfit > 0) {
      // 100% Ready To Claim State
      if (statusTitleEl) statusTitleEl.textContent = 'Profit Siap Diklaim:';
      if (timerValEl) {
        timerValEl.textContent = '100% SELESAI';
        timerValEl.style.color = '#22C55E';
      }
      if (percentBadgeEl) {
        percentBadgeEl.textContent = '100%';
        percentBadgeEl.style.background = 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)';
        percentBadgeEl.style.boxShadow = '0 0 14px rgba(34, 197, 94, 0.6)';
      }
      if (progressBarEl) {
        progressBarEl.style.width = '100%';
        progressBarEl.style.background = 'linear-gradient(90deg, #E5A83B 0%, #22C55E 100%)';
        progressBarEl.style.boxShadow = '0 0 14px rgba(34, 197, 94, 0.7)';
      }
      if (footerHintEl) footerHintEl.textContent = `Profit harian ${DB.formatIDR(totalPendingProfit)} siap diklaim ke saldo`;
      if (nextYieldEl) nextYieldEl.textContent = 'Siap Klaim';

      if (claimBtn) {
        claimBtn.innerHTML = `<span>Klaim Profit Harian (${DB.formatIDR(totalPendingProfit)})</span>`;
        claimBtn.style.opacity = '1';
        claimBtn.removeAttribute('disabled');
      }
    } else {
      const marketStatus = Plans.isWeekendMarketClosed();
      if (marketStatus.closed) {
        if (statusTitleEl) statusTitleEl.textContent = 'Status Pasar:';
        if (timerValEl) {
          timerValEl.textContent = `PASAR LIBUR (${marketStatus.dayName.toUpperCase()})`;
          timerValEl.style.color = '#EF4444';
        }
        if (percentBadgeEl) {
          percentBadgeEl.textContent = 'LIBUR';
          percentBadgeEl.style.background = '#EF4444';
          percentBadgeEl.style.boxShadow = '0 0 10px rgba(239, 68, 68, 0.4)';
        }
        if (progressBarEl) {
          progressBarEl.style.width = '100%';
          progressBarEl.style.background = '#334155';
          progressBarEl.style.boxShadow = 'none';
        }
        if (footerHintEl) footerHintEl.textContent = marketStatus.message || 'Pasar libur akhir pekan (Sabtu & Minggu). Dividen profit aktif kembali hari Senin.';
        if (nextYieldEl) nextYieldEl.textContent = 'Buka Senin';

        if (claimBtn) {
          claimBtn.innerHTML = `<span>Pasar Libur Akhir Pekan (Sabtu & Minggu)</span>`;
          claimBtn.style.opacity = '0.7';
          claimBtn.setAttribute('disabled', 'true');
        }
        return;
      }

      // Countdown State in 24-Hour Cycle
      const cycleDurationMs = 24 * 3600 * 1000;
      
      let lastYieldTime = 0;
      userInvs.forEach(inv => {
        const time = new Date(inv.lastProfitYieldDate || inv.startDate || Date.now()).getTime();
        if (time > lastYieldTime) lastYieldTime = time;
      });

      const now = Date.now();
      let elapsed = now - lastYieldTime;
      if (elapsed < 0) elapsed = 0;
      if (elapsed >= cycleDurationMs) elapsed = cycleDurationMs;

      const remainingMs = Math.max(0, cycleDurationMs - elapsed);
      const percent = Math.min(100, Math.max(0, (elapsed / cycleDurationMs) * 100));

      const hours = Math.floor(remainingMs / 3600000);
      const minutes = Math.floor((remainingMs % 3600000) / 60000);
      const seconds = Math.floor((remainingMs % 60000) / 1000);

      const timeFormatted = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

      if (statusTitleEl) statusTitleEl.textContent = 'Proses Profit Berjalan:';
      if (timerValEl) {
        timerValEl.textContent = timeFormatted;
        timerValEl.style.color = '#FDE89C';
      }
      if (percentBadgeEl) {
        percentBadgeEl.textContent = `${Math.round(percent)}%`;
        percentBadgeEl.style.background = 'linear-gradient(135deg, #E5A83B 0%, #C89338 100%)';
        percentBadgeEl.style.boxShadow = '0 0 10px rgba(229, 168, 59, 0.4)';
      }
      if (progressBarEl) {
        progressBarEl.style.width = `${Math.max(6, Math.round(percent))}%`;
        progressBarEl.style.background = 'linear-gradient(90deg, #C89338 0%, #E5A83B 60%, #22C55E 100%)';
        progressBarEl.style.boxShadow = '0 0 10px rgba(229, 168, 59, 0.5)';
      }
      if (footerHintEl) footerHintEl.textContent = 'Siklus profit berjalan otomatis 24 jam realtime';
      
      const nextResetDate = new Date(now + remainingMs);
      const hourStr = String(nextResetDate.getHours()).padStart(2, '0');
      const minStr = String(nextResetDate.getMinutes()).padStart(2, '0');
      if (nextYieldEl) nextYieldEl.textContent = `Siklus: ${hourStr}:${minStr} WIB`;

      if (claimBtn) {
        claimBtn.innerHTML = `<span>Proses Profit Berjalan (${timeFormatted})</span>`;
        claimBtn.style.opacity = '0.82';
      }
    }
  },

  // 5.5 Banner Slides Carousel (Below Login Button)
  renderBannerCarousel() {
    const track = document.getElementById('bannerSlidesTrack');
    const dotsWrap = document.getElementById('bannerDotsWrap');
    const container = document.getElementById('bannerCarouselSection');
    const wrapper = document.getElementById('bannerCarouselWrapper');
    if (!track || !container) return;

    this.bannersData = DB.getActiveBanners();

    if (!this.bannersData || this.bannersData.length === 0) {
      container.style.display = 'none';
      if (this.bannerInterval) clearInterval(this.bannerInterval);
      return;
    }

    container.style.display = 'block';

    // Normalize slide index
    if (this.currentBannerSlide >= this.bannersData.length) {
      this.currentBannerSlide = 0;
    }

    // Render slides
    track.innerHTML = this.bannersData.map((b, idx) => {
      const imgSource = b.imageUrl || 'https://images.unsplash.com/photo-1642543492481-44e81e3914a7?w=900&auto=format&fit=crop&q=80';
      return `
        <div class="banner-slide" onclick="App.onBannerClick('${b.actionUrl || ''}')" data-index="${idx}">
          <img class="banner-img" src="${imgSource}" alt="${b.title || 'AUTOTRADING Banner'}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1642543492481-44e81e3914a7?w=900&auto=format&fit=crop&q=80'">
          <div class="banner-overlay">
            ${b.badge ? `<span class="banner-badge">${b.badge}</span>` : ''}
            <h3 class="banner-title">${b.title || ''}</h3>
            ${b.subtitle ? `<p class="banner-subtitle">${b.subtitle}</p>` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Render pagination dots
    if (dotsWrap) {
      dotsWrap.innerHTML = this.bannersData.map((_, idx) => `
        <div class="banner-dot ${idx === this.currentBannerSlide ? 'active' : ''}" onclick="App.goToBannerSlide(${idx})"></div>
      `).join('');
    }

    // Apply track transform
    this.updateBannerTrack();

    // Start auto-slide timer
    this.startBannerAutoSlide();

    // Attach hover pause listeners if not already bound
    if (wrapper && !wrapper.dataset.hoverBound) {
      wrapper.dataset.hoverBound = 'true';
      wrapper.addEventListener('mouseenter', () => {
        if (this.bannerInterval) clearInterval(this.bannerInterval);
      });
      wrapper.addEventListener('mouseleave', () => {
        this.startBannerAutoSlide();
      });
      // Touch swipe support for mobile
      let touchStartX = 0;
      let touchEndX = 0;
      wrapper.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
        if (this.bannerInterval) clearInterval(this.bannerInterval);
      }, { passive: true });
      wrapper.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        if (touchStartX - touchEndX > 45) {
          this.nextBannerSlide();
        } else if (touchEndX - touchStartX > 45) {
          this.prevBannerSlide();
        }
        this.startBannerAutoSlide();
      }, { passive: true });
    }
  },

  startBannerAutoSlide() {
    if (this.bannerInterval) clearInterval(this.bannerInterval);
    if (!this.bannersData || this.bannersData.length <= 1) return;

    this.bannerInterval = setInterval(() => {
      this.nextBannerSlide();
    }, 4500);
  },

  updateBannerTrack() {
    const track = document.getElementById('bannerSlidesTrack');
    const dotsWrap = document.getElementById('bannerDotsWrap');
    if (track) {
      track.style.transform = `translateX(-${this.currentBannerSlide * 100}%)`;
    }
    if (dotsWrap) {
      const dots = dotsWrap.querySelectorAll('.banner-dot');
      dots.forEach((dot, idx) => {
        if (idx === this.currentBannerSlide) {
          dot.classList.add('active');
        } else {
          dot.classList.remove('active');
        }
      });
    }
  },

  nextBannerSlide() {
    if (!this.bannersData || this.bannersData.length === 0) return;
    this.currentBannerSlide = (this.currentBannerSlide + 1) % this.bannersData.length;
    this.updateBannerTrack();
  },

  prevBannerSlide() {
    if (!this.bannersData || this.bannersData.length === 0) return;
    this.currentBannerSlide = (this.currentBannerSlide - 1 + this.bannersData.length) % this.bannersData.length;
    this.updateBannerTrack();
  },

  goToBannerSlide(idx) {
    if (idx >= 0 && idx < this.bannersData.length) {
      this.currentBannerSlide = idx;
      this.updateBannerTrack();
      this.startBannerAutoSlide();
    }
  },

  onBannerClick(actionUrl) {
    if (!actionUrl) return;
    if (actionUrl === 'plans' || actionUrl === 'vip') {
      const planSection = document.querySelector('.tier-carousel-container');
      if (planSection) planSection.scrollIntoView({ behavior: 'smooth' });
    } else if (actionUrl === 'deposit') {
      this.openDepositModal();
    } else if (actionUrl === 'profile') {
      this.switchTab('profile');
    } else if (actionUrl === 'trade') {
      this.switchTab('trade');
    } else if (actionUrl === 'markets') {
      this.switchTab('markets');
    } else if (actionUrl.startsWith('http://') || actionUrl.startsWith('https://')) {
      window.open(actionUrl, '_blank');
    } else {
      this.switchTab(actionUrl);
    }
  },

  // 6. Prof GPT Signals Feed (Members Only & Max 4 Signals)
  renderSignals() {
    const feed = document.getElementById('signalFeedContainer');
    if (!feed) return;

    const user = Auth.getUser();

    // Guest Mode: Show exclusive VIP locked teaser
    if (!user) {
      feed.innerHTML = `
        <div class="vip-signal-locked-card">
          <div class="vip-lock-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#C89338" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </div>
          <h3 class="vip-lock-title">Sinyal VIP AI Eksklusif Member</h3>
          <p class="vip-lock-desc">Sinyal trading akurasi tinggi Prof GPT hanya dapat diakses oleh member yang sudah login. Masuk atau daftar akun Anda sekarang untuk melihat 4 sinyal aktif.</p>
          <button class="btn-cta-gold" style="width: auto; padding: 10px 24px; margin: 0 auto;" onclick="App.openModal('authModal')">
            <span>Masuk / Daftar Akun Member</span>
          </button>
        </div>
      `;
      return;
    }

    // Member Mode: Limit to maximum 4 latest active signals
    const marketStatus = Plans.isMarketOpen();
    const allSignals = Signals.getSignals();
    const signals = allSignals.slice(0, 4);

    const offBanner = !marketStatus.isOpen ? `
      <div class="market-off-overlay" style="margin-bottom: 12px; background: rgba(239, 68, 68, 0.1); border-color: #EF4444; color: #B91C1C;">
        <span class="ai-pulse-dot" style="background:#EF4444; animation:none;"></span>
        <span>Pasar Global Sedang LIBUR (OFF). Sinyal trading ditangguhkan hingga sesi pasar ON.</span>
      </div>
    ` : '';

    if (signals.length === 0) {
      feed.innerHTML = offBanner + `
        <div style="text-align:center; padding:24px 16px; color:#94A3B8; font-size:12px; background:#FFFFFF; border-radius:16px; border:1px solid #E2E8F0;">
          Belum ada sinyal trading aktif baru saat ini. Silakan cek kembali beberapa saat lagi.
        </div>
      `;
      return;
    }

    feed.innerHTML = offBanner + signals.map(sig => `
      <div class="signal-card" onclick="App.openSignalDetail('${sig.id}')">
        <div class="signal-card-header">
          <div class="signal-pair-wrap">
            <div class="ticker-flag-pair">
              <span class="flag-icon first" style="background:#1E293B; color:#FDE89C;">${sig.pair.substring(0,2)}</span>
              <span class="flag-icon second" style="background:#3B82F6; color:#FFFFFF;">${sig.pair.substring(3,5) || 'FX'}</span>
            </div>
            <div>
              <span class="signal-pair-name">${sig.pair}</span>
              <span class="signal-time-ago"> · ${sig.timeAgo}</span>
            </div>
          </div>
          <span class="badge-signal-action ${!marketStatus.isOpen ? 'off' : sig.action.toLowerCase()}" style="${!marketStatus.isOpen ? 'background:#64748B; color:#FFFFFF;' : ''}">${!marketStatus.isOpen ? 'OFF' : sig.action}</span>
        </div>
        <div class="signal-matrix-box">
          <div class="matrix-item">
            <span class="matrix-label">Entry</span>
            <span class="matrix-value">${sig.entry}</span>
          </div>
          <div class="matrix-item">
            <span class="matrix-label">TP</span>
            <span class="matrix-value">${sig.tp}</span>
          </div>
          <div class="matrix-item">
            <span class="matrix-label">SL</span>
            <span class="matrix-value">${sig.sl}</span>
          </div>
          <div class="matrix-item">
            <span class="matrix-label">Confidence</span>
            <span class="matrix-value highlight">${sig.confidence}%</span>
          </div>
        </div>
      </div>
    `).join('');
  },

  // 6.5 Reward Points Redeem Carousel (Under Signals Section)
  renderRewardsCarousel(user) {
    const track = document.getElementById('rewardsCarouselTrack');
    const userPointsBadge = document.getElementById('rewardsUserPointsBadge');
    if (!track) return;

    const currentPoints = user ? Number(user.points || 0) : 0;
    if (userPointsBadge) {
      userPointsBadge.textContent = currentPoints;
    }

    const rewards = Rewards.getActiveRewards();
    if (rewards.length === 0) {
      track.innerHTML = `
        <div style="width: 100%; text-align: center; padding: 24px; color: #94A3B8; font-size: 12px;">
          Katalog hadiah sedang disiapkan oleh Admin. Nantikan update segera!
        </div>
      `;
      return;
    }

    track.innerHTML = rewards.map(r => {
      const pointsCost = Number(r.pointsCost || 0);
      const stock = Number(r.stock || 0);
      const isSufficient = currentPoints >= pointsCost;
      const pointsDiff = pointsCost - currentPoints;
      const isOutOfStock = stock <= 0;
      const imgSource = r.imageUrl || 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=600&auto=format&fit=crop&q=80';

      let buttonHtml = '';
      let statusTextHtml = '';

      if (isOutOfStock) {
        buttonHtml = `<button class="reward-action-btn out-of-stock" disabled>Stok Habis</button>`;
        statusTextHtml = `<span class="reward-user-status-text" style="color: #94A3B8;">Habis</span>`;
      } else if (isSufficient) {
        buttonHtml = `
          <button class="reward-action-btn active" onclick="App.openRedeemModal('${r.id}')">
            <span>✦ Tukar Sekarang</span>
          </button>
        `;
        statusTextHtml = `<span class="reward-user-status-text sufficient">✓ Poin Cukup</span>`;
      } else {
        buttonHtml = `
          <button class="reward-action-btn insufficient" onclick="App.openRedeemModal('${r.id}')">
            <span>Kurang ${pointsDiff} Poin</span>
          </button>
        `;
        statusTextHtml = `<span class="reward-user-status-text insufficient">Kurang ${pointsDiff} Poin</span>`;
      }

      return `
        <div class="reward-card" data-reward-id="${r.id}">
          <div class="reward-card-img-wrap">
            <img class="reward-card-img" src="${imgSource}" alt="${r.title}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=600&auto=format&fit=crop&q=80'">
            ${r.badge ? `<span class="reward-badge-pill">${r.badge}</span>` : ''}
            <span class="reward-stock-pill">Stok: ${stock}</span>
          </div>
          <div class="reward-card-body">
            <span class="reward-category-label">${r.category || 'HADIAH'}</span>
            <h4 class="reward-title" title="${r.title}">${r.title}</h4>
            <p class="reward-desc-snippet">${r.description || 'Tukarkan poin loyalty trading AUTOTRADING Anda.'}</p>
            <div class="reward-points-row">
              <div class="reward-points-tag">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="#C89338"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                <span>${pointsCost} Poin</span>
              </div>
              ${statusTextHtml}
            </div>
            ${buttonHtml}
          </div>
        </div>
      `;
    }).join('');
  },

  // Carousel Arrow Scroll Helper
  scrollRewardsCarousel(direction) {
    const track = document.getElementById('rewardsCarouselTrack');
    if (!track) return;
    const cardWidth = 232; // 220px + 12px gap
    track.scrollBy({ left: direction * cardWidth, behavior: 'smooth' });
  },

  // Open Redeem Confirmation Modal
  openRedeemModal(rewardId) {
    const user = Auth.getUser();
    if (!user) {
      this.showToast('Silahkan login atau daftar dulu', 'info');
      this.openModal('authModal');
      return;
    }

    const reward = Rewards.getRewardById(rewardId);
    if (!reward) {
      this.showToast('Hadiah tidak ditemukan!', 'error');
      return;
    }

    if (reward.stock <= 0) {
      this.showToast('Maaf, persediaan stok hadiah ini sedang habis!', 'error');
      return;
    }

    const currentPoints = Number(user.points || 0);
    const pointsCost = Number(reward.pointsCost || 0);

    if (currentPoints < pointsCost) {
      const diff = pointsCost - currentPoints;
      this.showToast(`Poin Anda belum cukup (${currentPoints} Poin). Anda butuh ${diff} poin lagi untuk menukar hadiah ini!`, 'info');
      return;
    }

    // Populate Modal Info
    document.getElementById('redeemSelectedRewardId').value = reward.id;
    document.getElementById('redeemSummaryImg').src = reward.imageUrl || 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=600&auto=format&fit=crop&q=80';
    document.getElementById('redeemSummaryBadge').textContent = reward.badge || reward.category || 'HADIAH';
    document.getElementById('redeemSummaryTitle').textContent = reward.title;
    document.getElementById('redeemSummaryPoints').textContent = `${pointsCost} Poin`;

    document.getElementById('redeemUserCurrentPoints').textContent = `${currentPoints} Poin`;
    document.getElementById('redeemCostPoints').textContent = `-${pointsCost} Poin`;
    document.getElementById('redeemRemainingPoints').textContent = `${currentPoints - pointsCost} Poin`;

    // Clear and autofill inputs if available
    const contactInput = document.getElementById('redeemTargetContact');
    if (contactInput && !contactInput.value) {
      contactInput.value = user.phone ? `0${user.phone}` : '';
    }

    this.openModal('redeemConfirmModal');
  },

  // Submit Point Redemption
  submitRedeemReward() {
    const user = Auth.getUser();
    if (!user) {
      this.openModal('authModal');
      return;
    }

    const rewardId = document.getElementById('redeemSelectedRewardId').value;
    const targetContact = document.getElementById('redeemTargetContact').value.trim();
    const deliveryAddress = document.getElementById('redeemDeliveryAddress').value.trim();
    const note = document.getElementById('redeemNote').value.trim();

    if (!targetContact) {
      this.showToast('Harap masukkan nomor WhatsApp / Akun E-Wallet / Nomor Rekening tujuan!', 'error');
      return;
    }

    const res = Rewards.redeemReward(user.id, rewardId, {
      targetContact,
      deliveryAddress,
      note
    });

    if (res.success) {
      this.closeModal('redeemConfirmModal');
      this.showToast(res.message, 'success');
      this.renderAll();
    } else {
      this.showToast(res.message, 'error');
    }
  },

  // Open User's Redemption History Modal
  openMyRedemptionsModal() {
    const user = Auth.getUser();
    if (!user) {
      this.openModal('authModal');
      this.showToast('Silakan login untuk melihat riwayat penukaran poin Anda.', 'info');
      return;
    }

    const listContainer = document.getElementById('myRedemptionsList');
    if (!listContainer) return;

    const redemptions = Rewards.getUserRedemptions(user.id);

    if (redemptions.length === 0) {
      listContainer.innerHTML = `
        <div style="text-align: center; padding: 30px 15px; color: #94A3B8;">
          <div style="font-size: 32px; margin-bottom: 8px;">🎁</div>
          <div style="font-weight: 700; color: #475569; font-size: 14px;">Belum Ada Riwayat Penukaran</div>
          <div style="font-size: 11.5px; margin-top: 4px;">Kumpulkan poin dari profit dan ajak teman untuk menukarkan hadiah menarik di atas!</div>
        </div>
      `;
    } else {
      listContainer.innerHTML = redemptions.map(r => {
        let statusLabel = 'MENUNGGU VERIFIKASI';
        if (r.status === 'processing') statusLabel = 'SEDANG DIPROSES';
        if (r.status === 'completed') statusLabel = 'SELESAI / TERKIRIM';
        if (r.status === 'rejected') statusLabel = 'DITOLAK (POIN REFUND)';

        return `
          <div class="redemption-history-item">
            <div class="redemption-history-header">
              <span class="redemption-id">${r.id}</span>
              <span class="redemption-badge-status ${r.status}">${statusLabel}</span>
            </div>
            <div class="redemption-title-bold">${r.rewardTitle}</div>
            <div class="redemption-meta-row">
              <span>Poin Digunakan: <strong style="color: #B8822A;">${r.pointsSpent} Poin</strong></span>
              <span>${new Date(r.createdAt).toLocaleDateString('id-ID')}</span>
            </div>
            <div style="font-size: 11px; color: #64748B; background: #FFFFFF; padding: 6px 8px; border-radius: 8px; border: 1px solid #F1F5F9;">
              <div><strong>Tujuan:</strong> ${r.targetContact}</div>
              ${r.deliveryAddress ? `<div><strong>Alamat:</strong> ${r.deliveryAddress}</div>` : ''}
              ${r.adminNote ? `<div style="color: #2563EB; margin-top: 2px;"><strong>Catatan Admin:</strong> ${r.adminNote}</div>` : ''}
            </div>
          </div>
        `;
      }).join('');
    }

    this.openModal('myRedemptionsModal');
  },

  // ====================================================================
  // TESTIMONI PENARIKAN MEMBER (SOCIAL PROOF & M-BANKING SCREENSHOTS)
  // ====================================================================
  openTestimonialModal() {
    this.renderTestimonials(this.currentTestimonialFilter || 'all');
    this.openModal('testimonialModal');
  },

  filterTestimonials(bankCategory = 'all') {
    this.currentTestimonialFilter = bankCategory;
    
    // Update active filter button
    document.querySelectorAll('.testi-filter-btn').forEach(btn => {
      const b = btn.getAttribute('data-bank');
      if (b === bankCategory) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    this.renderTestimonials(bankCategory);
  },

  renderTestimonials(filter = 'all') {
    const listContainer = document.getElementById('testimonialCardsList');
    const totalCountBadge = document.getElementById('testiTotalWdCount');
    if (!listContainer) return;

    const allTestimonials = DB.getActiveTestimonials();
    this.testimonialsData = allTestimonials;

    if (totalCountBadge) {
      totalCountBadge.textContent = `${allTestimonials.length + 1420}+`;
    }

    let filtered = allTestimonials;
    if (filter && filter !== 'all') {
      const q = filter.toLowerCase();
      filtered = allTestimonials.filter(t => {
        const bankName = (t.bank || '').toLowerCase();
        return bankName.includes(q);
      });
    }

    if (filtered.length === 0) {
      listContainer.innerHTML = `
        <div style="text-align: center; padding: 30px 15px; color: #94A3B8;">
          <div style="font-size: 32px; margin-bottom: 8px;">💳</div>
          <div style="font-weight: 700; color: #475569; font-size: 14px;">Belum Ada Testimoni Kategori Ini</div>
          <div style="font-size: 11.5px; margin-top: 4px;">Pilih kategori "Semua Bank" untuk melihat seluruh bukti penarikan member AUTOTRADING.</div>
        </div>
      `;
      return;
    }

    listContainer.innerHTML = filtered.map(t => {
      const avatarSrc = t.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(t.name)}&background=C89338&color=fff`;
      const receiptImgSrc = t.receiptImage || 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=600&auto=format&fit=crop&q=80';
      const starsHtml = this.renderStarRating(t.rating || 5);

      return `
        <div class="testimonial-card" data-id="${t.id}">
          <!-- Header User Info & Time -->
          <div class="testi-card-header">
            <div class="testi-user-info">
              <img class="testi-avatar" src="${avatarSrc}" alt="${t.name}" onerror="this.src='https://ui-avatars.com/api/?name=Member&background=C89338&color=fff'">
              <div class="testi-name-wrap">
                <div class="testi-name">
                  <span>${t.name}</span>
                  <svg class="testi-verified-icon" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                  </svg>
                </div>
                <div class="testi-city">📍 ${t.city || 'Indonesia'}</div>
              </div>
            </div>
            <div class="testi-time">${t.timeAgo || 'Baru saja'}</div>
          </div>

          <!-- Bank & Amount Pill -->
          <div class="testi-amount-pill">
            <div class="testi-bank-tag">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              <span>Penarikan • ${t.bank || 'Transfer Bank'}</span>
            </div>
            <div class="testi-amount-val">${DB.formatIDR(t.amount)}</div>
          </div>

          <!-- Star Rating & Review Quote -->
          <div class="testi-rating-stars">
            ${starsHtml}
            <span style="font-size: 11px; font-weight: 700; color: #64748B; margin-left: 6px;">(${t.rating || 5}.0)</span>
          </div>

          <div class="testi-comment-box">
            "${t.comment || 'Penarikan sukses landing cepat tanpa kendala. Terimakasih AUTOTRADING!'}"
          </div>

          <!-- M-Banking Screenshot Frame (Clickable for Zoom Preview) -->
          <div class="mbanking-proof-wrap" onclick="App.previewTestimonialReceipt('${t.id}')" title="Klik untuk memperbesar bukti transfer">
            <img class="mbanking-proof-img" src="${receiptImgSrc}" alt="Bukti Transfer ${t.bank}" loading="lazy">
            <div class="mbanking-zoom-hint">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
              <span>Perbesar Bukti M-Banking</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  renderStarRating(rating = 5) {
    let starsHtml = '';
    for (let i = 1; i <= 5; i++) {
      const isFilled = i <= rating;
      starsHtml += `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="${isFilled ? '#E5A83B' : 'none'}" stroke="#E5A83B" stroke-width="1.8">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
      `;
    }
    return starsHtml;
  },

  previewTestimonialReceipt(testiId) {
    const testi = (this.testimonialsData || []).find(t => t.id === testiId) || (DB.getTestimonials() || []).find(t => t.id === testiId);
    if (!testi) return;

    this.openImagePreview(
      testi.receiptImage,
      `Bukti WD ${testi.name} (${testi.bank} - ${DB.formatIDR(testi.amount)})`
    );
  },

  openImagePreview(src, caption = 'Bukti Transfer M-Banking') {
    const modal = document.getElementById('imagePreviewModal');
    const img = document.getElementById('imagePreviewImg');
    const cap = document.getElementById('imagePreviewCaption');

    if (!modal || !img) return;

    img.src = src;
    if (cap) cap.textContent = caption;

    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
  },

  closeImagePreview() {
    const modal = document.getElementById('imagePreviewModal');
    if (!modal) return;

    modal.classList.remove('show');
    document.body.style.overflow = '';
  },

  // Open Member Testimonial Submission Modal
  openSubmitTestimonialModal() {
    const user = Auth.getUser();
    if (!user) {
      this.openModal('authModal');
      this.showToast('Silakan login terlebih dahulu untuk membagikan bukti penarikan Anda.', 'info');
      return;
    }

    // Set default rating to 5 stars
    this.setMemberTestiRating(5);
    const amountInput = document.getElementById('memberTestiAmountInput');
    if (amountInput && !amountInput.value) {
      amountInput.value = '1500000';
    }

    // Clear and reset preview
    const previewWrap = document.getElementById('memberTestiPreviewWrap');
    const previewImg = document.getElementById('memberTestiPreviewImg');
    const fileInput = document.getElementById('memberTestiFileInput');
    if (previewWrap) previewWrap.style.display = 'none';
    if (previewImg) previewImg.src = '';
    if (fileInput) fileInput.value = '';

    this.openModal('memberTestiModal');
  },

  setMemberTestiRating(stars) {
    const valInput = document.getElementById('memberTestiRatingValue');
    const labelEl = document.getElementById('memberTestiRatingLabel');
    if (valInput) valInput.value = stars;

    const labels = {
      1: '1.0 / 5.0 (Kurang)',
      2: '2.0 / 5.0 (Cukup)',
      3: '3.0 / 5.0 (Bagus)',
      4: '4.0 / 5.0 (Puas)',
      5: '5.0 / 5.0 (Sangat Puas - Bonus +50 Poin)'
    };
    if (labelEl) labelEl.textContent = labels[stars] || `${stars}.0 / 5.0`;

    document.querySelectorAll('#memberTestiRatingSelector .star-rating-btn').forEach(btn => {
      const r = Number(btn.getAttribute('data-rating') || 0);
      if (r <= stars) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  },

  submitMemberTestimonial() {
    const user = Auth.getUser();
    if (!user) {
      this.openModal('authModal');
      return;
    }

    const rating = Number(document.getElementById('memberTestiRatingValue')?.value || 5);
    const bank = document.getElementById('memberTestiBankSelect')?.value || 'BCA Mobile';
    const amount = Number(document.getElementById('memberTestiAmountInput')?.value || 0);
    const city = document.getElementById('memberTestiCityInput')?.value.trim() || 'Indonesia';
    const comment = document.getElementById('memberTestiCommentInput')?.value.trim() || '';

    if (amount <= 0) {
      this.showToast('Masukkan nominal penarikan yang valid!', 'error');
      return;
    }

    if (!comment) {
      this.showToast('Harap tulis kata-kata ulasan pengalaman penarikan Anda!', 'error');
      return;
    }

    const previewImg = document.getElementById('memberTestiPreviewImg');
    const uploadedImageBase64 = previewImg && previewImg.src && previewImg.src.startsWith('data:image') ? previewImg.src : null;

    const res = DB.submitMemberTestimonial({
      userId: user.id,
      name: user.fullName || user.username,
      city,
      bank,
      amount,
      rating,
      comment,
      receiptImage: uploadedImageBase64
    });

    if (res && res.id) {
      this.closeModal('memberTestiModal');
      const bonusHint = rating === 5 ? ' Bonus +50 Poin akan otomatis ditambahkan setelah disetujui Admin!' : '';
      this.showToast(`Testimoni Anda berhasil dikirim untuk moderasi Admin.${bonusHint}`, 'success');
      this.renderTestimonials(this.currentTestimonialFilter || 'all');
    } else {
      this.showToast('Gagal mengirimkan testimoni', 'error');
    }
  },

  // Render Wallet View Page (Requirement 4: Detailed Breakdown & Category Filters)
  renderWalletView(user) {
    if (!user) {
      this.showToast('Silahkan login atau daftar dulu', 'info');
      this.openModal('authModal');
      this.switchTab('home');
      return;
    }

    document.getElementById('walletPageMainBal').textContent = DB.formatIDR(user.walletBalance);
    document.getElementById('walletPageAffBal').textContent = DB.formatIDR(user.affiliateBalance);

    const txs = Payment.getUserTransactions(user.id);
    this.cachedWalletTransactions = txs;
    this.renderWalletTransactionList(this.activeTxFilter || 'all');
  },

  // Filter Wallet Transactions (Requirement 4)
  filterWalletTransactions(filterType) {
    this.activeTxFilter = filterType;
    const filterButtons = {
      all: 'txFilterAll',
      profit_claim: 'txFilterProfit',
      rabat_bonus: 'txFilterRabat',
      sponsor_bonus: 'txFilterSponsor',
      dep_wd: 'txFilterTransfer'
    };

    Object.keys(filterButtons).forEach(type => {
      const btn = document.getElementById(filterButtons[type]);
      if (btn) btn.classList.toggle('active', type === filterType);
    });

    this.renderWalletTransactionList(filterType);
  },

  renderWalletTransactionList(filterType = 'all') {
    const txListEl = document.getElementById('walletTransactionList');
    if (!txListEl) return;

    let txs = this.cachedWalletTransactions || [];
    if (filterType === 'profit_claim') {
      txs = txs.filter(t => t.type === 'profit_claim');
    } else if (filterType === 'rabat_bonus') {
      txs = txs.filter(t => t.type === 'rabat_bonus');
    } else if (filterType === 'sponsor_bonus') {
      txs = txs.filter(t => t.type === 'sponsor_bonus');
    } else if (filterType === 'dep_wd') {
      txs = txs.filter(t => t.type === 'deposit' || t.type === 'withdraw' || t.type === 'affiliate_transfer');
    }

    if (txs.length === 0) {
      txListEl.innerHTML = '<div style="text-align:center; padding:20px; color:#94A3B8; font-size:12px;">Tidak ada riwayat transaksi pada kategori ini.</div>';
      return;
    }

    txListEl.innerHTML = txs.map(t => {
      let title = t.paymentMethod || t.type;
      let badgeHtml = '';
      let isPlus = t.type === 'deposit' || t.type === 'profit_claim' || t.type === 'sponsor_bonus' || t.type === 'rabat_bonus' || t.type === 'capital_return';
      let amountColor = isPlus ? '#16A34A' : '#DC2626';
      let sign = isPlus ? '+' : '-';
      let noteText = t.note || '';

      if (t.type === 'profit_claim') {
        title = 'Klaim Profit Harian AI';
        badgeHtml = '<span class="tx-detail-badge tx-badge-profit">KLAIM PROFIT</span>';
        if (!noteText) noteText = `Profit harian trading AI`;
      } else if (t.type === 'rabat_bonus') {
        const lvl = t.level || 1;
        title = `Bonus Rabat Matching (Level ${lvl})`;
        badgeHtml = `<span class="tx-detail-badge tx-badge-rabat">RABAT L${lvl}</span>`;
      } else if (t.type === 'sponsor_bonus') {
        title = 'Bonus Sponsor Langsung (Level 1)';
        badgeHtml = '<span class="tx-detail-badge tx-badge-sponsor">SPONSOR L1</span>';
      } else if (t.type === 'deposit') {
        title = `Deposit Saldo (${t.paymentMethod || 'Manual'})`;
        badgeHtml = '<span class="tx-detail-badge tx-badge-dep">DEPOSIT</span>';
        if (!noteText) noteText = `Metode: ${t.paymentMethod || 'Transfer'} · ID: ${t.id}`;
      } else if (t.type === 'withdraw') {
        title = 'Penarikan Dana (WD)';
        badgeHtml = '<span class="tx-detail-badge tx-badge-wd">WITHDRAW</span>';
        if (!noteText) noteText = `Bank: ${t.bankName || 'Rekening Member'} (${t.accountNumber || ''}) · ID: ${t.id}`;
      } else if (t.type === 'affiliate_transfer') {
        title = 'Transfer Saldo Komisi';
        badgeHtml = '<span class="tx-detail-badge tx-badge-sponsor">TRANSFER</span>';
      } else if (t.type === 'capital_return') {
        title = 'Pengembalian Modal Kontrak Selesai';
        badgeHtml = '<span class="tx-detail-badge tx-badge-return">MODAL KEMBALI</span>';
      }

      const dateStr = new Date(t.createdAt).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      return `
        <div style="background:#FFFFFF; border-radius:14px; padding:12px 14px; box-shadow:var(--card-shadow); border:1px solid #F1F5F9; display:flex; align-items:center; justify-content:space-between; gap:10px;">
          <div style="display:flex; align-items:center; gap:10px; flex:1; min-width:0;">
            <div style="width:38px; height:38px; border-radius:12px; background:${isPlus ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)'}; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
              <span style="font-size:16px;">${t.type === 'profit_claim' ? '📈' : (t.type === 'rabat_bonus' ? '👥' : (t.type === 'sponsor_bonus' ? '🎁' : (isPlus ? '↓' : '↑')))}</span>
            </div>
            <div style="min-width:0; flex:1;">
              <div style="font-weight:700; font-size:12.5px; color:#1E293B; display:flex; align-items:center; flex-wrap:wrap; gap:4px;">
                <span>${title}</span>
                ${badgeHtml}
              </div>
              <div style="font-size:10.5px; color:#64748B; margin-top:2px; word-break:break-word; line-height:1.3;">
                ${noteText}
              </div>
              <div style="font-size:9.5px; color:#94A3B8; margin-top:3px;">
                ${dateStr} WIB · <span class="badge-status ${t.status || 'approved'}" style="font-size:8.5px; padding:1px 6px;">${(t.status || 'approved').toUpperCase()}</span>
              </div>
            </div>
          </div>
          <div style="text-align:right; flex-shrink:0;">
            <div style="font-weight:800; font-size:13.5px; color:${amountColor}; font-family:var(--font-mono);">${sign}${DB.formatIDR(t.amount)}</div>
            ${t.uniqueCode ? `<div style="font-size:9px; color:#64748B;">Kode: ${t.uniqueCode}</div>` : ''}
            ${t.proofImage ? `
              <div style="margin-top: 4px;">
                <button class="deposit-proof-badge has-proof" onclick="App.viewProofImage('${t.id}')">
                  <span>📄 Bukti TF</span>
                </button>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  },

  // Render Trade View Page (with 30-day Duration Progress Bar & AI Chart)
  renderTradeView(user) {
    if (!user) {
      this.showToast('Silahkan login atau daftar dulu', 'info');
      this.openModal('authModal');
      this.switchTab('home');
      return;
    }

    const listEl = document.getElementById('tradeActivePlansList');

    const allInvestments = Plans.getAllUserInvestments(user.id);
    if (allInvestments.length === 0) {
      listEl.innerHTML = `
        <div style="text-align:center; padding:30px 20px; background:#FFFFFF; border-radius:18px; box-shadow:var(--card-shadow);">
          <div style="width:48px; height:48px; border-radius:50%; background:#FEF3C7; display:flex; align-items:center; justify-content:center; margin:0 auto 12px auto;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#D97706" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
          </div>
          <h3 style="font-size:16px; font-weight:800; margin-bottom:6px;">Belum Ada Paket Investasi</h3>
          <p style="font-size:12px; color:#64748B; margin-bottom:16px;">Aktifkan salah satu paket trading AI di bawah menggunakan Saldo Utama untuk mulai mendapatkan profit harian nyata.</p>
          <button class="btn-cta-gold" onclick="App.openPlanModal('plan-learn')">Pilih Paket Sekarang</button>
        </div>
      `;
      this.renderAiTradingChart();
      return;
    }

    listEl.innerHTML = allInvestments.map(inv => {
      const isActive = inv.status === 'active';
      const duration = Number(inv.durationDays || 30);
      const daysElapsed = Number(inv.daysElapsed || 0);
      const progressPercent = Math.min(100, Math.max(0, Math.round((daysElapsed / duration) * 100)));

      return `
        <div style="background:#FFFFFF; border-radius:18px; padding:16px; box-shadow:var(--card-shadow); border:1px solid ${isActive ? '#E2E8F0' : '#E2E8F0'}; display:flex; flex-direction:column; gap:10px; opacity:${isActive ? '1' : '0.85'};">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-weight:800; font-size:15px; color:#0F172A;">Paket ${inv.planName}</span>
            <span class="badge-status ${isActive ? 'approved' : 'rejected'}">${isActive ? `BERJALAN (${daysElapsed}/${duration} Hari)` : `SELESAI (Modal Kembali)`}</span>
          </div>

          ${isActive ? `
            <div class="active-plan-progress-wrap">
              <div class="active-plan-progress-header">
                <span class="active-plan-progress-label">⏱️ Progress Durasi Paket:</span>
                <span class="active-plan-progress-val">${progressPercent}% (Hari ke-${daysElapsed} dari ${duration} Hari)</span>
              </div>
              <div class="active-plan-progress-track">
                <div class="active-plan-progress-bar" style="width: ${Math.max(4, progressPercent)}%;"></div>
              </div>
            </div>
          ` : ''}

          <div style="display:grid; grid-template-columns:repeat(3, 1fr); background:#F8FAFC; border-radius:12px; padding:10px; text-align:center; gap:6px;">
            <div>
              <div style="font-size:10px; color:#64748B;">Modal Awal</div>
              <div style="font-weight:800; font-size:12px;">${DB.formatIDR(inv.capital)}</div>
            </div>
            <div>
              <div style="font-size:10px; color:#64748B;">Rentang Profit</div>
              <div style="font-weight:800; font-size:12px; color:#22C55E;">${inv.minRate}% - ${inv.maxRate}%</div>
            </div>
            <div>
              <div style="font-size:10px; color:#64748B;">Total Profit Didapat</div>
              <div style="font-weight:800; font-size:12px; color:#C89338;">${DB.formatIDR(inv.totalProfitEarned)}</div>
            </div>
          </div>
          ${isActive && inv.pendingProfitClaim > 0 ? `
            <div style="display:flex; justify-content:space-between; align-items:center; background:#DCFCE7; border:1px solid #86EFAC; padding:10px 14px; border-radius:12px;">
              <div>
                <div style="font-size:10px; font-weight:700; color:#15803D;">Profit Siap Diklaim:</div>
                <div style="font-size:14px; font-weight:800; color:#166534;">${DB.formatIDR(inv.pendingProfitClaim)}</div>
              </div>
              <button class="tier-btn btn-topup" onclick="App.claimProfit()">Klaim Sekarang</button>
            </div>
          ` : ''}
          ${!isActive ? `
            <div style="font-size:11px; color:#059669; font-weight:700; background:#ECFDF5; padding:10px 12px; border-radius:10px; text-align:center; display:flex; justify-content:space-between; align-items:center;">
              <span>✓ Durasi ${inv.durationDays} hari selesai.${!inv.capitalReturned ? ` Modal Rp ${DB.formatIDR(inv.capital)} tersimpan di Saldo Terlock.` : ` Modal Rp ${DB.formatIDR(inv.capital)} telah direfund.`}</span>
              ${!inv.capitalReturned ? `<button class="tier-btn btn-topup" style="padding:4px 8px; font-size:10px;" onclick="App.openRefundModal()">Klaim Refund</button>` : ''}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

    this.renderAiTradingChart();
  },

  // Render Profile & Affiliate View Page
  renderProfileView(user) {
    if (!user) {
      this.showToast('Silahkan login atau daftar dulu', 'info');
      this.openModal('authModal');
      this.switchTab('home');
      return;
    }

    document.getElementById('profileUsername').textContent = user.username;
    document.getElementById('profileEmail').textContent = user.email || user.phone || 'Member';
    document.getElementById('profileRefCode').textContent = user.referralCode || '-';
    
    // Personal Info & Saved Bank Preview
    const phoneValEl = document.getElementById('profilePhoneVal');
    if (phoneValEl) phoneValEl.textContent = user.phone || '-';

    const cityValEl = document.getElementById('profileCityVal');
    if (cityValEl) cityValEl.textContent = user.city || '-';

    const bankValEl = document.getElementById('profileBankVal');
    if (bankValEl) {
      if (user.bankAccount && user.bankAccount.accountNumber) {
        bankValEl.textContent = `${user.bankAccount.bankName || 'Bank'} - ${user.bankAccount.accountNumber} (a.n ${user.bankAccount.accountHolder || '-'})`;
      } else {
        bankValEl.textContent = 'Belum diatur (Klik Rekening WD di bawah)';
      }
    }

    // Member Active status badge
    const activePlans = Plans.getUserInvestments(user.id);
    const isMemberActive = activePlans.length > 0;
    const statusBadgeEl = document.getElementById('profileMemberStatusBadge');
    if (statusBadgeEl) {
      if (isMemberActive) {
        statusBadgeEl.className = 'badge-member-active';
        statusBadgeEl.textContent = '🟢 Member Aktif';
      } else {
        statusBadgeEl.className = 'badge-member-inactive';
        statusBadgeEl.textContent = '⚪ Belum Aktif';
      }
    }

    // Sponsor Info
    const sponsorEl = document.getElementById('profileSponsorText');
    if (sponsorEl) {
      const sponsorText = user.referredBy ? `Sponsor: ${user.referredBy}` : 'Sponsor: Tidak ada sponsor (Opsional)';
      sponsorEl.textContent = sponsorText;
    }

    // Joined Date Info
    const joinedEl = document.getElementById('profileJoinedText');
    if (joinedEl) {
      const joinDate = user.createdAt ? new Date(user.createdAt) : new Date();
      const joinFormatted = joinDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
      joinedEl.textContent = `Bergabung sejak: ${joinFormatted}`;
    }

    const refLink = `${window.location.origin}${window.location.pathname}?ref=${user.referralCode}`;
    document.getElementById('profileRefLinkInput').value = refLink;

    // Downline stats & Level Bonus Recap (Requirements 2 & 3)
    const downlines = Affiliate.getDownlines(user.referralCode);
    this.cachedDownlines = downlines;

    // Badges & Total Summary
    const totalBadge = document.getElementById('affTotalMembersBadge');
    if (totalBadge) totalBadge.textContent = `${downlines.totalMembers} Anggota`;

    const totalBonusVal = document.getElementById('affTotalBonusVal');
    if (totalBonusVal) totalBonusVal.textContent = DB.formatIDR(downlines.totalBonusAllLevels);

    // Level 1
    const l1CountEl = document.getElementById('affL1Count');
    if (l1CountEl) l1CountEl.textContent = downlines.level1.length;
    const tabL1El = document.getElementById('affTabL1Count');
    if (tabL1El) tabL1El.textContent = downlines.level1.length;
    const l1BonusEl = document.getElementById('affL1BonusVal');
    if (l1BonusEl) l1BonusEl.textContent = DB.formatIDR(downlines.level1Bonus);
    const l1TurnEl = document.getElementById('affL1Turnover');
    if (l1TurnEl) l1TurnEl.textContent = `Omset: ${DB.formatIDR(downlines.level1Turnover)}`;

    // Level 2
    const l2CountEl = document.getElementById('affL2Count');
    if (l2CountEl) l2CountEl.textContent = downlines.level2.length;
    const tabL2El = document.getElementById('affTabL2Count');
    if (tabL2El) tabL2El.textContent = downlines.level2.length;
    const l2BonusEl = document.getElementById('affL2BonusVal');
    if (l2BonusEl) l2BonusEl.textContent = DB.formatIDR(downlines.level2Bonus);
    const l2TurnEl = document.getElementById('affL2Turnover');
    if (l2TurnEl) l2TurnEl.textContent = `Omset: ${DB.formatIDR(downlines.level2Turnover)}`;

    // Level 3
    const l3CountEl = document.getElementById('affL3Count');
    if (l3CountEl) l3CountEl.textContent = downlines.level3.length;
    const tabL3El = document.getElementById('affTabL3Count');
    if (tabL3El) tabL3El.textContent = downlines.level3.length;
    const l3BonusEl = document.getElementById('affL3BonusVal');
    if (l3BonusEl) l3BonusEl.textContent = DB.formatIDR(downlines.level3Bonus);
    const l3TurnEl = document.getElementById('affL3Turnover');
    if (l3TurnEl) l3TurnEl.textContent = `Omset: ${DB.formatIDR(downlines.level3Turnover)}`;

    const tabAllEl = document.getElementById('affTabAllCount');
    if (tabAllEl) tabAllEl.textContent = downlines.totalMembers;

    const totalTurnEl = document.getElementById('affTotalTurnover');
    if (totalTurnEl) totalTurnEl.textContent = DB.formatIDR(downlines.totalTeamTurnover);

    // Update dynamic affiliate commission & rabat level descriptions (Requirement 1)
    const db = DB.get();
    const cfg = db.settings || {};
    const sponsorPct = cfg.sponsorBonusPercent !== undefined ? cfg.sponsorBonusPercent : 10;
    const rabatLevels = cfg.rabatLevels || [];
    const r1 = rabatLevels.find(l => l.level === 1);
    const r2 = rabatLevels.find(l => l.level === 2);
    const r3 = rabatLevels.find(l => l.level === 3);
    const r1Pct = r1 ? r1.percent : 5;
    const r2Pct = r2 ? r2.percent : 3;
    const r3Pct = r3 ? r3.percent : 1.5;

    const affDescEl = document.getElementById('affiliateMainDesc');
    if (affDescEl) {
      affDescEl.innerHTML = `Dapatkan <strong>Bonus Sponsor Langsung ${sponsorPct}%</strong> dan <strong>Bonus Rabat Matching Profit hingga 3 Level (L1: ${r1Pct}%, L2: ${r2Pct}%, L3: ${r3Pct}%)</strong> dari setiap transaksi tim Anda.`;
    }

    const affL1Sub = document.getElementById('affL1SubTitle');
    if (affL1Sub) {
      affL1Sub.innerHTML = `<span id="affL1Count">${downlines.level1.length}</span> Member (Sponsor ${sponsorPct}% + Rabat ${r1Pct}%)`;
    }

    const affL2Sub = document.getElementById('affL2SubTitle');
    if (affL2Sub) {
      affL2Sub.innerHTML = `<span id="affL2Count">${downlines.level2.length}</span> Member (Rabat ${r2Pct}%)`;
    }

    const affL3Sub = document.getElementById('affL3SubTitle');
    if (affL3Sub) {
      affL3Sub.innerHTML = `<span id="affL3Count">${downlines.level3.length}</span> Member (Rabat ${r3Pct}%)`;
    }

    // Render list by active filter
    this.renderDownlineList(this.activeDownlineFilter || 'all');
  },

  // Filter Downline Network by Level (Requirement 2 & 3)
  filterDownlineLevel(level) {
    this.activeDownlineFilter = level;
    const tabBtns = {
      all: 'btnNetLvlAll',
      1: 'btnNetLvl1',
      2: 'btnNetLvl2',
      3: 'btnNetLvl3'
    };

    Object.keys(tabBtns).forEach(lvl => {
      const btn = document.getElementById(tabBtns[lvl]);
      if (btn) btn.classList.toggle('active', String(lvl) === String(level));
    });

    this.renderDownlineList(level);
  },

  renderDownlineList(level = 'all') {
    const listEl = document.getElementById('affDownlineList');
    if (!listEl) return;

    const downlines = this.cachedDownlines;
    if (!downlines || downlines.totalMembers === 0) {
      listEl.innerHTML = '<div style="text-align:center; padding:18px; color:#94A3B8; font-size:12px; background:#F8FAFC; border-radius:12px;">Belum ada anggota di tim Anda. Bagikan kode referral Anda untuk mendapatkan bonus sponsor & rabat multi-level.</div>';
      return;
    }

    let members = [];
    if (level === 1 || level === '1') members = downlines.level1;
    else if (level === 2 || level === '2') members = downlines.level2;
    else if (level === 3 || level === '3') members = downlines.level3;
    else members = [...downlines.level1, ...downlines.level2, ...downlines.level3];

    if (members.length === 0) {
      listEl.innerHTML = `<div style="text-align:center; padding:16px; color:#94A3B8; font-size:12px; background:#F8FAFC; border-radius:12px;">Belum ada anggota di Level ${level}.</div>`;
      return;
    }

    listEl.innerHTML = members.map(m => `
      <div class="downline-member-card">
        <div class="downline-card-header">
          <div class="downline-card-user">
            <span class="network-level-badge lvl-${m.level}">L${m.level}</span>
            <span>${m.username}</span>
            <span style="font-size:11px; color:#64748B; font-weight:500;">(${m.fullName || '-'})</span>
          </div>
          <span class="badge-status ${m.activeInvsCount > 0 ? 'approved' : 'active'}">
            ${m.activeInvsCount > 0 ? `● ${m.activeInvsCount} Paket Aktif` : 'Terdaftar'}
          </span>
        </div>

        <div class="downline-card-stats">
          <div>
            <div style="color:#64748B;">Omset Pribadi</div>
            <div style="font-weight:800; font-family:var(--font-mono); color:#1E293B;">${DB.formatIDR(m.personalTurnover || 0)}</div>
          </div>
          <div>
            <div style="color:#64748B;">Sponsor Langsung</div>
            <div style="font-weight:700; color:#475569;">${m.uplineUsername || '-'}</div>
          </div>
          <div>
            <div style="color:#64748B;">Bergabung</div>
            <div style="font-weight:600; color:#475569;">${m.joinedDateStr || '-'}</div>
          </div>
        </div>
      </div>
    `).join('');
  },

  // Member Profile & Personal Data Controller
  openEditProfileModal() {
    const user = Auth.getUser();
    if (!user) {
      this.showToast('Silahkan login atau daftar dulu', 'info');
      this.openModal('authModal');
      return;
    }

    const usernameInput = document.getElementById('editProfileUsername');
    const fullNameInput = document.getElementById('editProfileFullName');
    const phoneInput = document.getElementById('editProfilePhone');
    const emailInput = document.getElementById('editProfileEmail');
    const cityInput = document.getElementById('editProfileCity');

    if (usernameInput) usernameInput.value = user.username || '';
    if (fullNameInput) fullNameInput.value = user.fullName || '';
    if (phoneInput) phoneInput.value = user.phone || '';
    if (emailInput) emailInput.value = user.email || '';
    if (cityInput) cityInput.value = user.city || '';

    this.openModal('editProfileModal');
  },

  saveUserProfile() {
    const user = Auth.getUser();
    if (!user) return;

    const fullNameInput = document.getElementById('editProfileFullName');
    const phoneInput = document.getElementById('editProfilePhone');
    const emailInput = document.getElementById('editProfileEmail');
    const cityInput = document.getElementById('editProfileCity');

    const fullName = fullNameInput ? fullNameInput.value.trim() : '';
    const phone = phoneInput ? phoneInput.value.trim() : '';
    const email = emailInput ? emailInput.value.trim() : '';
    const city = cityInput ? cityInput.value.trim() : '';

    if (!fullName) {
      this.showToast('Nama lengkap wajib diisi!', 'error');
      return;
    }

    const res = DB.updateUserProfile(user.id, { fullName, phone, email, city });
    if (res.success) {
      this.closeModal('editProfileModal');
      this.showToast(res.message, 'success');
      this.renderAll();
    } else {
      this.showToast(res.message, 'error');
    }
  },

  // Member Withdrawal Bank & E-Wallet Settings Controller
  openUserBankModal() {
    const user = Auth.getUser();
    if (!user) {
      this.showToast('Silahkan login atau daftar dulu', 'info');
      this.openModal('authModal');
      return;
    }

    const selectEl = document.getElementById('userBankSelect');
    const customWrap = document.getElementById('userBankCustomWrap');
    const customNameInput = document.getElementById('userBankCustomName');
    const accNumInput = document.getElementById('userBankAccountNumber');
    const accHolderInput = document.getElementById('userBankAccountHolder');

    const standardBanks = ['BCA', 'Mandiri', 'BRI', 'BNI', 'BSI', 'CIMB Niaga', 'Permata', 'DANA', 'OVO', 'GoPay', 'ShopeePay', 'USDT TRC20'];

    if (user.bankAccount && user.bankAccount.bankName) {
      const bName = user.bankAccount.bankName;
      if (standardBanks.includes(bName)) {
        if (selectEl) selectEl.value = bName;
        if (customWrap) customWrap.style.display = 'none';
        if (customNameInput) customNameInput.value = '';
      } else {
        if (selectEl) selectEl.value = 'Lainnya';
        if (customWrap) customWrap.style.display = 'block';
        if (customNameInput) customNameInput.value = bName;
      }
      if (accNumInput) accNumInput.value = user.bankAccount.accountNumber || '';
      if (accHolderInput) accHolderInput.value = user.bankAccount.accountHolder || '';
    } else {
      if (selectEl) selectEl.value = 'BCA';
      if (customWrap) customWrap.style.display = 'none';
      if (customNameInput) customNameInput.value = '';
      if (accNumInput) accNumInput.value = '';
      if (accHolderInput) accHolderInput.value = user.fullName || '';
    }

    this.openModal('userBankModal');
  },

  onUserBankSelectChange() {
    const selectEl = document.getElementById('userBankSelect');
    const customWrap = document.getElementById('userBankCustomWrap');
    if (!selectEl || !customWrap) return;
    customWrap.style.display = selectEl.value === 'Lainnya' ? 'block' : 'none';
  },

  saveUserBank() {
    const user = Auth.getUser();
    if (!user) return;

    const selectEl = document.getElementById('userBankSelect');
    const customNameInput = document.getElementById('userBankCustomName');
    const accNumInput = document.getElementById('userBankAccountNumber');
    const accHolderInput = document.getElementById('userBankAccountHolder');

    let bankName = selectEl ? selectEl.value : 'BCA';
    if (bankName === 'Lainnya') {
      bankName = customNameInput ? customNameInput.value.trim() : '';
    }

    const accountNumber = accNumInput ? accNumInput.value.trim() : '';
    const accountHolder = accHolderInput ? accHolderInput.value.trim() : '';

    if (!bankName) {
      this.showToast('Nama bank atau e-wallet wajib diisi!', 'error');
      return;
    }
    if (!accountNumber) {
      this.showToast('Nomor rekening atau nomor e-wallet wajib diisi!', 'error');
      return;
    }
    if (!accountHolder) {
      this.showToast('Nama pemilik rekening (atas nama) wajib diisi!', 'error');
      return;
    }

    const res = DB.updateUserBank(user.id, { bankName, accountNumber, accountHolder });
    if (res.success) {
      this.closeModal('userBankModal');
      this.showToast(res.message, 'success');
      this.renderAll();
    } else {
      this.showToast(res.message, 'error');
    }
  },

  // Change Password Security Controller
  openChangePasswordModal() {
    const user = Auth.getUser();
    if (!user) {
      this.showToast('Silahkan login atau daftar dulu', 'info');
      this.openModal('authModal');
      return;
    }

    const oldPassInput = document.getElementById('changePassOld');
    const newPassInput = document.getElementById('changePassNew');
    const confirmPassInput = document.getElementById('changePassConfirm');

    if (oldPassInput) oldPassInput.value = '';
    if (newPassInput) newPassInput.value = '';
    if (confirmPassInput) confirmPassInput.value = '';

    this.openModal('changePasswordModal');
  },

  saveChangePassword() {
    const user = Auth.getUser();
    if (!user) return;

    const oldPassInput = document.getElementById('changePassOld');
    const newPassInput = document.getElementById('changePassNew');
    const confirmPassInput = document.getElementById('changePassConfirm');

    const oldPass = oldPassInput ? oldPassInput.value : '';
    const newPass = newPassInput ? newPassInput.value : '';
    const confirmPass = confirmPassInput ? confirmPassInput.value : '';

    if (!oldPass) {
      this.showToast('Password lama saat ini wajib diisi!', 'error');
      return;
    }
    if (!newPass) {
      this.showToast('Password baru wajib diisi!', 'error');
      return;
    }
    if (newPass.length < 6) {
      this.showToast('Password baru minimal harus 6 karakter!', 'error');
      return;
    }
    if (newPass !== confirmPass) {
      this.showToast('Konfirmasi password baru tidak cocok!', 'error');
      return;
    }

    const res = Auth.changePassword(user.id, oldPass, newPass);
    if (res.success) {
      this.closeModal('changePasswordModal');
      this.showToast(res.message, 'success');
      if (oldPassInput) oldPassInput.value = '';
      if (newPassInput) newPassInput.value = '';
      if (confirmPassInput) confirmPassInput.value = '';
    } else {
      this.showToast(res.message, 'error');
    }
  },

  // Download APK Controller (Requirement 1)
  openDownloadApkModal() {
    if (!Auth.isLoggedIn()) {
      this.showToast('Silahkan login atau daftar dulu', 'info');
      this.openModal('authModal');
      return;
    }

    const db = DB.get();
    const apk = (db.settings && db.settings.apkDownload) || {};

    const verEl = document.getElementById('apkModalVersion');
    if (verEl) verEl.textContent = apk.version || 'v2.4.0';

    const sizeEl = document.getElementById('apkModalSize');
    if (sizeEl) sizeEl.textContent = apk.size || '18.5 MB';

    const btn = document.getElementById('btnApkDownload');
    if (btn) {
      if (apk.enabled === false) {
        btn.innerHTML = '<span>⚠️ Unduhan APK Sedang Maintenance</span>';
        btn.style.background = '#64748B';
        btn.disabled = true;
      } else {
        btn.innerHTML = '<span>📲 Unduh File APK Langsung</span>';
        btn.style.background = '';
        btn.disabled = false;
      }
    }

    this.openModal('apkDownloadModal');
  },

  downloadApk() {
    const db = DB.get();
    const apk = (db.settings && db.settings.apkDownload) || {};
    if (apk.enabled === false) {
      this.showToast('Layanan unduhan APK sedang dalam pemeliharaan.', 'info');
      return;
    }

    const downloadUrl = apk.url || 'https://autotrading.my.id/downloads/autotrading-v2.4.apk';
    this.showToast(`Memulai pengunduhan APK AUTOTRADING (${apk.version || 'v2.4.0'})...`, 'success');

    try {
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `AUTOTRADING_${(apk.version || 'v2.4.0').replace(/[^a-zA-Z0-9.]/g, '_')}.apk`;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      window.open(downloadUrl, '_blank');
    }
  },

  // Render Markets / Riwayat View Page with TradingView Live Chart & 5-Row Forex Watchlist
  renderMarketsView() {
    this.renderRiwayatTickers();
    this.renderForex5Watchlist();
  },

  // 5 Major Forex Currency Rows (Requirement 4)
  renderForex5Watchlist() {
    const container = document.getElementById('marketForex5List');
    if (!container) return;

    const db = DB.get();
    const pairs = [
      { id: 'EURUSD', name: 'EUR/USD', desc: 'Euro / US Dollar', code: 'EU', defaultPrice: 1.15380, change: 0.12 },
      { id: 'GBPUSD', name: 'GBP/USD', desc: 'British Pound / US Dollar', code: 'GB', defaultPrice: 1.34560, change: -0.09 },
      { id: 'USDJPY', name: 'USD/JPY', desc: 'US Dollar / Japanese Yen', code: 'JP', defaultPrice: 148.850, change: 0.25 },
      { id: 'AUDUSD', name: 'AUD/USD', desc: 'Australian Dollar / US Dollar', code: 'AU', defaultPrice: 0.65420, change: 0.18 },
      { id: 'USDCHF', name: 'USD/CHF', desc: 'US Dollar / Swiss Franc', code: 'CH', defaultPrice: 0.89240, change: -0.05 }
    ];

    const liveTickers = db.marketTickers || [];
    container.innerHTML = pairs.map(p => {
      const match = liveTickers.find(t => t.id === p.id || (t.name && t.name.replace('/', '') === p.id));
      const price = match ? match.price : p.defaultPrice;
      const change = match ? match.change : p.change;
      const isUp = change >= 0;
      const changeColor = isUp ? '#16A34A' : '#DC2626';
      const changeBg = isUp ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)';
      const sign = isUp ? '+' : '';
      const decimals = p.id.includes('JPY') ? 3 : 5;

      return `
        <div class="forex-pair-row" id="forexRow_${p.id}" style="display:flex; justify-content:space-between; align-items:center; padding:10px 12px; background:#FFFFFF; border:1px solid #F1F5F9; border-radius:12px; transition: all 0.2s ease;">
          <div style="display:flex; align-items:center; gap:10px;">
            <div style="width:34px; height:34px; border-radius:50%; background:#EFF6FF; border:1px solid #BFDBFE; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:11px; color:#2563EB;">
              ${p.code}
            </div>
            <div>
              <div style="display:flex; align-items:center; gap:6px;">
                <strong style="font-size:13.5px; color:#0F172A;">${p.name}</strong>
                <span class="pulse-live-dot" style="width:6px; height:6px; border-radius:50%; background:#22C55E; display:inline-block;"></span>
              </div>
              <div style="font-size:10px; color:#94A3B8;">${p.desc}</div>
            </div>
          </div>
          <div style="text-align:right;">
            <div id="forexPrice_${p.id}" style="font-family:var(--font-mono); font-weight:800; font-size:13.5px; color:#0F172A;">
              ${price.toFixed(decimals)}
            </div>
            <span id="forexChange_${p.id}" style="font-size:10px; font-weight:700; color:${changeColor}; background:${changeBg}; padding:2px 6px; border-radius:4px; display:inline-block; margin-top:2px;">
              ${sign}${change.toFixed(2)}%
            </span>
          </div>
        </div>
      `;
    }).join('');

    // Also update EUR/USD header on TradingView card if element exists
    const eurusdMatch = liveTickers.find(t => t.id === 'EURUSD');
    const tvPriceEl = document.getElementById('tvLiveEurUsdPrice');
    const tvChangeEl = document.getElementById('tvLiveEurUsdChange');
    if (eurusdMatch && tvPriceEl) {
      tvPriceEl.textContent = eurusdMatch.price.toFixed(5);
    }
    if (eurusdMatch && tvChangeEl) {
      const isUp = eurusdMatch.change >= 0;
      tvChangeEl.textContent = `${isUp ? '+' : ''}${eurusdMatch.change.toFixed(2)}% ${isUp ? '🟢' : '🔴'}`;
      tvChangeEl.style.color = isUp ? '#16A34A' : '#DC2626';
    }
  },

  // Interactive Live AI Trading Chart (EUR/USD) with Market Status Check
  initAiTradingChart() {
    if (this.aiChartInterval) clearInterval(this.aiChartInterval);

    this.aiChartInterval = setInterval(() => {
      const marketStatus = Plans.isMarketOpen();
      const priceEl = document.getElementById('tradeEurUsdPrice');
      const profitEl = document.getElementById('tradeEurUsdProfitRate');
      const botStatusEl = document.querySelector('.ai-robot-status');

      if (!marketStatus.isOpen) {
        if (priceEl) priceEl.textContent = 'PAUSED (OFF)';
        if (profitEl) {
          profitEl.textContent = '0.00% (OFF)';
          profitEl.style.color = '#EF4444';
        }
        if (botStatusEl) {
          botStatusEl.innerHTML = `<span class="ai-pulse-dot" style="background:#94A3B8; animation:none;"></span><span style="color:#94A3B8;">AI Bot OFF (Pasar Libur)</span>`;
        }
        if (this.currentTab === 'trade') {
          this.renderAiTradingChart();
        }
        return;
      }

      if (botStatusEl) {
        botStatusEl.innerHTML = `<span class="ai-pulse-dot"></span><span>AI Bot Active</span>`;
      }
      if (profitEl) {
        profitEl.style.color = '';
      }

      // Fluctuate price slightly
      const lastPoint = this.aiChartPoints[this.aiChartPoints.length - 1];
      const delta = (Math.random() - 0.48) * 0.0003;
      const nextPoint = Math.max(1.1510, Math.min(1.1590, Number((lastPoint + delta).toFixed(5))));

      this.aiChartPoints.push(nextPoint);
      if (this.aiChartPoints.length > 30) {
        this.aiChartPoints.shift();
      }

      // Update live rate DOM
      if (priceEl) priceEl.textContent = nextPoint.toFixed(5);
      if (profitEl) {
        const winRate = (3.15 + (nextPoint - 1.1500) * 20 + (Math.random() * 0.15)).toFixed(2);
        profitEl.textContent = `+${winRate}%`;
      }

      if (this.currentTab === 'trade') {
        this.renderAiTradingChart();
      }
    }, 2000);
  },

  renderAiTradingChart() {
    const canvas = document.getElementById('aiTradeCanvas');
    if (!canvas || !canvas.getContext) return;

    const parent = canvas.parentElement;
    if (!parent || parent.clientWidth === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const w = parent.clientWidth;
    const h = 160;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const pts = this.aiChartPoints;
    if (pts.length < 2) return;

    const minVal = Math.min(...pts) - 0.0002;
    const maxVal = Math.max(...pts) + 0.0002;
    const range = (maxVal - minVal) || 0.001;

    // Draw horizontal grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    for (let i = 1; i <= 3; i++) {
      const y = (h / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Calculate canvas coordinates
    const stepX = w / (pts.length - 1);
    const coords = pts.map((p, idx) => ({
      x: idx * stepX,
      y: h - ((p - minVal) / range) * (h - 28) - 14
    }));

    // Draw Smooth Spline Path
    ctx.beginPath();
    ctx.moveTo(coords[0].x, coords[0].y);

    for (let i = 0; i < coords.length - 1; i++) {
      const p0 = coords[i === 0 ? 0 : i - 1];
      const p1 = coords[i];
      const p2 = coords[i + 1];
      const p3 = coords[i + 2] || p2;

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
    }

    // Stroke line
    ctx.strokeStyle = '#38BDF8';
    ctx.lineWidth = 2.8;
    ctx.shadowColor = 'rgba(56, 189, 248, 0.8)';
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Area Gradient Fill
    ctx.lineTo(coords[coords.length - 1].x, h);
    ctx.lineTo(0, h);
    ctx.closePath();

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(56, 189, 248, 0.28)');
    grad.addColorStop(0.6, 'rgba(56, 189, 248, 0.08)');
    grad.addColorStop(1, 'rgba(56, 189, 248, 0.0)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Draw Pulsing Head Indicator on Latest Point
    const lastCoord = coords[coords.length - 1];

    ctx.beginPath();
    ctx.arc(lastCoord.x, lastCoord.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.35)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(lastCoord.x, lastCoord.y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.strokeStyle = '#38BDF8';
    ctx.lineWidth = 2;
    ctx.stroke();
  },

  // Tab Navigation Switching
  switchTab(tabId) {
    if (tabId !== 'home' && !this.isLoggedIn()) {
      this.showToast('Silahkan login atau daftar dulu', 'info');
      this.openModal('authModal');
      return;
    }

    this.currentTab = tabId;
    
    // Update bottom navigation bar active class
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.getAttribute('data-tab') === tabId);
    });

    // Update screen visibility
    document.querySelectorAll('.tab-content').forEach(pane => {
      pane.classList.toggle('active', pane.id === `tab-${tabId}`);
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
    this.renderAll();
  },

  // Modals Controller
  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('show');
      document.body.style.overflow = 'hidden';
    }
  },

  // Open Auth Modal directly to login or register tab (Requirement 2)
  openAuthModalWithTab(tab = 'login') {
    this.openModal('authModal');
    if (tab === 'register') {
      const regTab = document.getElementById('authTabRegister');
      if (regTab) regTab.click();
    } else {
      const logTab = document.getElementById('authTabLogin');
      if (logTab) logTab.click();
    }
  },

  // Open CS channel dynamically based on Admin configuration (Requirement 7)
  openCustomerService(channel = 'whatsapp') {
    const db = DB.get();
    const cs = db.settings.cs || {};
    if (channel === 'whatsapp') {
      let wa = cs.whatsapp || '6281234567890';
      if (!wa.startsWith('http')) {
        const cleanWa = wa.replace(/[^0-9]/g, '');
        const msg = encodeURIComponent(cs.waMessage || 'Halo CS Resmi AUTOTRADING, saya ingin bertanya seputar layanan...');
        wa = `https://wa.me/${cleanWa}?text=${msg}`;
      }
      this.showToast('Membuka layanan WhatsApp Customer Service AUTOTRADING...', 'info');
      window.open(wa, '_blank');
    } else if (channel === 'telegram') {
      let tg = cs.telegram || 'https://t.me/autotrading_cs';
      if (!tg.startsWith('http')) {
        tg = 'https://t.me/' + tg.replace('@', '');
      }
      this.showToast('Membuka Telegram Support Center AUTOTRADING...', 'info');
      window.open(tg, '_blank');
    }
  },

  // Open Kelas Trading channel dynamically based on Admin configuration (Requirement 6)
  openKelasTrading(channel = 'whatsapp') {
    const db = DB.get();
    const kt = db.settings.kelasTrading || {};
    if (channel === 'whatsapp') {
      let wa = kt.whatsapp || 'https://wa.me/6281234567890?text=Halo%20Mentor%20AUTOTRADING,%20saya%20ingin%20bergabung%20ke%20Kelas%20Trading%20Resmi';
      if (!wa.startsWith('http')) {
        const cleanWa = wa.replace(/[^0-9]/g, '');
        wa = `https://wa.me/${cleanWa}?text=${encodeURIComponent('Halo Mentor AUTOTRADING, saya ingin bergabung ke Kelas Trading Resmi')}`;
      }
      this.showToast('Membuka saluran WhatsApp Kelas Trading AUTOTRADING...', 'info');
      window.open(wa, '_blank');
    } else if (channel === 'telegram') {
      let tg = kt.telegram || 'https://t.me/autotrading_official_channel';
      if (!tg.startsWith('http')) {
        tg = 'https://t.me/' + tg.replace('@', '');
      }
      this.showToast('Membuka saluran Telegram Kelas Trading AUTOTRADING...', 'info');
      window.open(tg, '_blank');
    }
  },

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('show');
      document.body.style.overflow = '';
    }
  },

  closeAllModals() {
    document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('show'));
    document.body.style.overflow = '';
  },

  // Ultra-Refined Vector SVG Toast Notification System
  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let iconSvg = `
      <div class="toast-icon-badge">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </div>`;

    if (type === 'success') {
      iconSvg = `
        <div class="toast-icon-badge">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>`;
    } else if (type === 'error') {
      iconSvg = `
        <div class="toast-icon-badge">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
        </div>`;
    }

    toast.innerHTML = `${iconSvg} <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-12px)';
      toast.style.transition = 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  },

  // User Actions
  handlePlanTopUp(planId) {
    if (!Auth.isLoggedIn()) {
      this.showToast('Silahkan login atau daftar dulu', 'info');
      this.openModal('authModal');
      return;
    }
    this.openPlanModal(planId);
  },

  handlePlanRefund(planId) {
    this.openRefundModal(planId);
  },

  // 1. My Statistic Modal Controller (Requirement 1)
  openMyStatisticModal() {
    const user = Auth.getUser();
    if (!user) {
      this.showToast('Silahkan login atau daftar dulu', 'info');
      this.openModal('authModal');
      return;
    }

    const allInvs = Plans.getAllUserInvestments(user.id);
    const activeInvs = allInvs.filter(i => i.status === 'active');
    const isMemberActive = activeInvs.length > 0;
    const todayRate = Plans.getUserTodayProfitRate(user.id);
    const totalProfitEarned = allInvs.reduce((sum, i) => sum + (i.totalProfitEarned || 0) + (i.pendingProfitClaim || 0), 0);
    const totalActiveCap = activeInvs.reduce((sum, i) => sum + (i.capital || 0), 0);
    const todayNominal = Math.floor((totalActiveCap * todayRate) / 100);

    const nameEl = document.getElementById('statMemberName');
    const emailEl = document.getElementById('statMemberEmail');
    const badgeEl = document.getElementById('statMemberStatusBadge');
    const sponsorEl = document.getElementById('statMemberSponsor');
    const joinedEl = document.getElementById('statMemberJoined');
    const todayRateEl = document.getElementById('statTodayProfit');
    const todayNomEl = document.getElementById('statTodayProfitNominal');
    const totalEarnedEl = document.getElementById('statTotalProfitEarned');
    const countBadgeEl = document.getElementById('statActivePackagesCountBadge');
    const listContainer = document.getElementById('statActivePlansContainer');

    if (nameEl) nameEl.textContent = user.fullName || user.username;
    if (emailEl) emailEl.textContent = user.email || user.phone || 'Member Terverifikasi';
    if (badgeEl) {
      badgeEl.className = isMemberActive ? 'badge-member-active' : 'badge-member-inactive';
      badgeEl.textContent = isMemberActive ? '🟢 Member Aktif' : '⚪ Belum Aktif';
    }
    if (sponsorEl) sponsorEl.textContent = user.referredBy ? `Sponsor: ${user.referredBy}` : 'Sponsor: Tidak Ada (Opsional)';
    if (joinedEl) {
      const jDate = user.createdAt ? new Date(user.createdAt) : new Date();
      joinedEl.textContent = `Bergabung: ${jDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    }
    if (todayRateEl) todayRateEl.textContent = `+${todayRate.toFixed(2)}%`;
    if (todayNomEl) todayNomEl.textContent = `+${DB.formatIDR(todayNominal)}`;
    if (totalEarnedEl) totalEarnedEl.textContent = DB.formatIDR(totalProfitEarned);
    if (countBadgeEl) countBadgeEl.textContent = `${activeInvs.length} Paket Aktif`;

    if (listContainer) {
      if (activeInvs.length === 0) {
        listContainer.innerHTML = `
          <div style="text-align: center; padding: 20px; color: #94A3B8; font-size: 12px; background: #FFFFFF; border-radius: 12px; border: 1px dashed #CBD5E1;">
            Anda belum memiliki paket investasi yang sedang berjalan.
            <div style="margin-top: 8px;">
              <button class="tier-btn btn-topup" style="display: inline-block; padding: 6px 14px; font-size: 11px;" onclick="App.closeModal('myStatisticModal'); App.switchTab('home');">Pilih Paket Sekarang</button>
            </div>
          </div>
        `;
      } else {
        listContainer.innerHTML = activeInvs.map(inv => {
          const daysLeft = Math.max(0, inv.durationDays - inv.daysElapsed);
          const percent = Math.min(100, Math.round((inv.daysElapsed / inv.durationDays) * 100));
          return `
            <div style="background: #FFFFFF; border-radius: 12px; padding: 12px; border: 1px solid #E2E8F0; box-shadow: 0 2px 6px rgba(0,0,0,0.03);">
              <div class="flex-between mb-1">
                <strong style="font-size: 13px; color: #0F172A;">${inv.planName}</strong>
                <span style="font-size: 12px; font-weight: 800; color: #22C55E;">${DB.formatIDR(inv.capital)}</span>
              </div>
              <div class="flex-between mb-2" style="font-size: 11px; color: #64748B;">
                <span>Total Profit: <strong style="color: #10B981;">+${DB.formatIDR(inv.totalProfitEarned || 0)}</strong></span>
                <span>Sisa Durasi: <strong>${daysLeft} Hari</strong></span>
              </div>
              <div style="height: 6px; background: #F1F5F9; border-radius: 4px; overflow: hidden;">
                <div style="width: ${percent}%; height: 100%; background: var(--primary-gold-gradient);"></div>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    this.openModal('myStatisticModal');
  },

  // 2. Riwayat Modal & Running Text Controller (Requirement 2)
  openRiwayatModal() {
    if (!Auth.isLoggedIn()) {
      this.showToast('Silahkan login atau daftar dulu', 'info');
      this.openModal('authModal');
      return;
    }
    this.renderRiwayatTickers();
    this.filterRiwayat('all');
    this.openModal('riwayatModal');
  },

  renderRiwayatTickers() {
    const deposits = Payment.getLiveMemberDeposits();
    const wds = Payment.getLiveMemberWithdrawals();

    const renderDepHtml = deposits.map(d => `
      <span class="autotrading-marquee-item fgt-marquee-item">
        <span class="badge-tag badge-dep">DEPOSIT</span>
        <span>${d.username}</span>
        <span class="amount-val">+${DB.formatIDR(d.amount)}</span>
        <span style="color:#94A3B8; font-size:10px;">(${d.method})</span>
        <span style="color:#4ADE80; font-size:10px;">· ${d.timeAgo}</span>
      </span>
    `).join('');

    const renderWdHtml = wds.map(w => `
      <span class="autotrading-marquee-item fgt-marquee-item">
        <span class="badge-tag badge-wd">WITHDRAW</span>
        <span>${w.username}</span>
        <span class="amount-val">-${DB.formatIDR(w.amount)}</span>
        <span style="color:#94A3B8; font-size:10px;">(${w.method})</span>
        <span style="color:#FACC15; font-size:10px;">· ${w.status}</span>
      </span>
    `).join('');

    // Update modal tracks
    const modalDepTrack = document.getElementById('modalDepositMarqueeTrack');
    const modalWdTrack = document.getElementById('modalWdMarqueeTrack');
    if (modalDepTrack) modalDepTrack.innerHTML = renderDepHtml + renderDepHtml;
    if (modalWdTrack) modalWdTrack.innerHTML = renderWdHtml + renderWdHtml;

    // Update tab-markets tracks if present
    const tabDepTrack = document.getElementById('tabDepositMarqueeTrack');
    const tabWdTrack = document.getElementById('tabWdMarqueeTrack');
    if (tabDepTrack) tabDepTrack.innerHTML = renderDepHtml + renderDepHtml;
    if (tabWdTrack) tabWdTrack.innerHTML = renderWdHtml + renderWdHtml;
  },

  filterRiwayat(type) {
    const allBtn = document.getElementById('riwayatFilterAll');
    const depBtn = document.getElementById('riwayatFilterDep');
    const wdBtn = document.getElementById('riwayatFilterWd');
    const listEl = document.getElementById('riwayatFullFeedList');
    if (!listEl) return;

    if (allBtn) allBtn.classList.toggle('active', type === 'all');
    if (depBtn) depBtn.classList.toggle('active', type === 'deposit');
    if (wdBtn) wdBtn.classList.toggle('active', type === 'withdraw');

    const deposits = Payment.getLiveMemberDeposits().map(d => ({ ...d, trxType: 'deposit' }));
    const wds = Payment.getLiveMemberWithdrawals().map(w => ({ ...w, trxType: 'withdraw' }));

    let combined = [];
    if (type === 'deposit') combined = deposits;
    else if (type === 'withdraw') combined = wds;
    else {
      // Interleave deposits and withdrawals
      const maxLen = Math.max(deposits.length, wds.length);
      for (let i = 0; i < maxLen; i++) {
        if (deposits[i]) combined.push(deposits[i]);
        if (wds[i]) combined.push(wds[i]);
      }
    }

    listEl.innerHTML = combined.map(item => {
      const isDep = item.trxType === 'deposit';
      const color = isDep ? '#15803D' : '#B45309';
      const bg = isDep ? '#F0FDF4' : '#FFFBEB';
      const sign = isDep ? '+' : '-';
      const tagText = isDep ? 'DEPOSIT' : 'PENARIKAN (WD)';
      const tagClass = isDep ? 'badge-dep' : 'badge-wd';

      return `
        <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 10px 12px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 32px; height: 32px; border-radius: 50%; background: ${bg}; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 13px; color: ${color};">
              ${isDep ? '↓' : '↑'}
            </div>
            <div>
              <div style="font-weight: 800; font-size: 13px; color: #0F172A;">
                ${item.username} <span class="badge-tag ${tagClass}" style="font-size: 8.5px; margin-left: 4px;">${tagText}</span>
              </div>
              <div style="font-size: 10.5px; color: #64748B;">${item.method} · ${item.timeAgo}</div>
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-weight: 800; font-family: var(--font-mono); font-size: 13.5px; color: ${color};">${sign}${DB.formatIDR(item.amount)}</div>
            <div style="font-size: 10px; color: #10B981; font-weight: 700;">✓ ${item.status}</div>
          </div>
        </div>
      `;
    }).join('');
  },

  // 3. Leaderboard Modal Controller (Requirement 5)
  openLeaderboardModal() {
    const sponsors = Plans.getTopSponsors(12);
    const profits = Plans.getTopProfits(12);

    // Build Running Text Track
    const trackEl = document.getElementById('leadMarqueeTrack');
    if (trackEl) {
      const topSponsorItems = sponsors.slice(0, 5).map((s, idx) => `
        <span class="autotrading-marquee-item fgt-marquee-item">
          <span class="badge-tag badge-lead">TOP ${idx + 1} SPONSOR</span>
          <span style="font-weight:700;">${s.username}</span>
          <span class="amount-val">${DB.formatIDR(s.commission)} Komisi</span>
          <span style="color:#C084FC;">(${s.directCount} Member)</span>
        </span>
      `).join('');

      const topProfitItems = profits.slice(0, 5).map((p, idx) => `
        <span class="autotrading-marquee-item fgt-marquee-item">
          <span class="badge-tag badge-dep">TOP ${idx + 1} PROFIT</span>
          <span style="font-weight:700;">${p.username}</span>
          <span class="amount-val">+${DB.formatIDR(p.totalProfit)}</span>
          <span style="color:#4ADE80;">(Win: ${p.winRate}%)</span>
        </span>
      `).join('');

      const combinedText = topSponsorItems + topProfitItems;
      trackEl.innerHTML = combinedText + combinedText;
    }

    this.switchLeaderboardTab('sponsor');
    this.openModal('leaderboardModal');
  },

  switchLeaderboardTab(tab) {
    const sponsorBtn = document.getElementById('leadTabSponsorBtn');
    const profitBtn = document.getElementById('leadTabProfitBtn');
    const container = document.getElementById('leaderboardListContainer');
    if (!container) return;

    if (sponsorBtn) sponsorBtn.classList.toggle('active', tab === 'sponsor');
    if (profitBtn) profitBtn.classList.toggle('active', tab === 'profit');

    if (tab === 'sponsor') {
      const sponsors = Plans.getTopSponsors(12);
      container.innerHTML = sponsors.map((s, idx) => {
        const rank = idx + 1;
        const rankClass = rank === 1 ? 'lead-rank-1' : (rank === 2 ? 'lead-rank-2' : (rank === 3 ? 'lead-rank-3' : 'lead-rank-other'));
        const medal = rank === 1 ? '🥇' : (rank === 2 ? '🥈' : (rank === 3 ? '🥉' : `#${rank}`));

        return `
          <div class="lead-member-row">
            <div style="display: flex; align-items: center; gap: 10px;">
              <div class="lead-rank-badge ${rankClass}">${medal}</div>
              <div>
                <div style="font-weight: 800; font-size: 13px; color: #0F172A;">
                  ${s.username} <span style="font-size: 10px; color: #C89338; font-weight: 700;">[${s.badge}]</span>
                </div>
                <div style="font-size: 10.5px; color: #64748B;">
                  ${s.directCount} Sponsor Langsung · Total Tim: ${s.totalTeam}
                </div>
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-weight: 800; font-family: var(--font-mono); font-size: 13.5px; color: #B45309;">
                ${DB.formatIDR(s.commission)}
              </div>
              <div style="font-size: 9.5px; color: #94A3B8;">Bonus Sponsor</div>
            </div>
          </div>
        `;
      }).join('');
    } else {
      const profits = Plans.getTopProfits(12);
      container.innerHTML = profits.map((p, idx) => {
        const rank = idx + 1;
        const rankClass = rank === 1 ? 'lead-rank-1' : (rank === 2 ? 'lead-rank-2' : (rank === 3 ? 'lead-rank-3' : 'lead-rank-other'));
        const medal = rank === 1 ? '🥇' : (rank === 2 ? '🥈' : (rank === 3 ? '🥉' : `#${rank}`));

        return `
          <div class="lead-member-row">
            <div style="display: flex; align-items: center; gap: 10px;">
              <div class="lead-rank-badge ${rankClass}">${medal}</div>
              <div>
                <div style="font-weight: 800; font-size: 13px; color: #0F172A;">
                  ${p.username} <span style="font-size: 10px; color: #22C55E; font-weight: 700;">[${p.activePlan || 'VIP Pro'}]</span>
                </div>
                <div style="font-size: 10.5px; color: #64748B;">
                  Modal: ${DB.formatIDR(p.totalCapital)} · Win Rate: ${p.winRate}%
                </div>
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-weight: 800; font-family: var(--font-mono); font-size: 13.5px; color: #15803D;">
                +${DB.formatIDR(p.totalProfit)}
              </div>
              <div style="font-size: 9.5px; color: #10B981;">Total Profit</div>
            </div>
          </div>
        `;
      }).join('');
    }
  },

  // 4. Refund Modal & Contract Completion Handler (Requirement 6)
  openRefundModal(planId = null) {
    const user = Auth.getUser();
    if (!user) {
      this.openModal('authModal');
      this.showToast('Silakan login untuk mengakses menu refund modal paket.', 'info');
      return;
    }

    const refundableInvs = Plans.getRefundableInvestments(user.id);
    const lockedRefundCap = Plans.getLockedRefundCapital(user.id);
    const runningInvs = Plans.getUserInvestments(user.id);

    const totalEl = document.getElementById('refundLockedTotalVal');
    const btnAll = document.getElementById('btnProcessRefundAll');
    const compList = document.getElementById('refundCompletedList');
    const runList = document.getElementById('refundRunningList');

    if (totalEl) totalEl.textContent = DB.formatIDR(lockedRefundCap);

    if (btnAll) {
      if (lockedRefundCap > 0) {
        btnAll.removeAttribute('disabled');
        btnAll.style.opacity = '1';
        btnAll.style.pointerEvents = 'auto';
      } else {
        btnAll.setAttribute('disabled', 'true');
        btnAll.style.opacity = '0.5';
        btnAll.style.pointerEvents = 'none';
      }
    }

    if (compList) {
      if (refundableInvs.length === 0) {
        compList.innerHTML = `
          <div style="text-align: center; padding: 14px; background: #F8FAFC; border-radius: 12px; border: 1px solid #E2E8F0; font-size: 11.5px; color: #94A3B8;">
            Tidak ada kontrak paket selesai yang tertahan saat ini. Semua modal pokok yang selesai telah direfund.
          </div>
        `;
      } else {
        compList.innerHTML = refundableInvs.map(inv => `
          <div style="background: #FFFFFF; border: 1px solid #BBF7D0; border-radius: 12px; padding: 12px; box-shadow: 0 2px 6px rgba(0,0,0,0.04);">
            <div class="flex-between mb-1">
              <span style="font-weight: 800; font-size: 13.5px; color: #0F172A;">${inv.planName}</span>
              <span style="font-weight: 800; font-family: var(--font-mono); color: #15803D; font-size: 13.5px;">${DB.formatIDR(inv.capital)}</span>
            </div>
            <div style="font-size: 11px; color: #166534; margin-bottom: 8px;">
              ✓ Kontrak ${inv.durationDays} hari telah tuntas. Modal terlock aman & siap dicairkan.
            </div>
            <button class="btn-process-refund" style="padding: 8px 12px; font-size: 11.5px;" onclick="App.processContractRefund('${inv.id}')">
              <span>proses refundkan ke saldo saya</span>
            </button>
          </div>
        `).join('');
      }
    }

    if (runList) {
      if (runningInvs.length === 0) {
        runList.innerHTML = `
          <div style="text-align: center; padding: 10px; font-size: 11px; color: #94A3B8;">
            Tidak ada paket yang sedang aktif berjalan.
          </div>
        `;
      } else {
        runList.innerHTML = runningInvs.map(inv => {
          const pct = Math.min(100, Math.round(((inv.daysElapsed || 0) / inv.durationDays) * 100));
          return `
            <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 8px 12px; font-size: 11px;">
              <div class="flex-between mb-1">
                <span style="font-weight: 700; color: #334155;">${inv.planName} (${DB.formatIDR(inv.capital)})</span>
                <span style="color: #64748B;">Hari ke-${inv.daysElapsed || 0}/${inv.durationDays}</span>
              </div>
              <div style="width: 100%; height: 4px; background: #E2E8F0; border-radius: 2px; overflow: hidden;">
                <div style="width: ${pct}%; height: 100%; background: #3B82F6;"></div>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    this.openModal('refundModal');
  },

  processContractRefund(investmentId) {
    const user = Auth.getUser();
    if (!user) return;

    const res = Plans.processContractRefund(investmentId, user.id);
    if (res.success) {
      this.showToast(res.message, 'success');
      this.renderAll();
      this.openRefundModal();
    } else {
      this.showToast(res.message, 'error');
    }
  },

  processContractRefundAll() {
    const user = Auth.getUser();
    if (!user) return;

    const res = Plans.processAllContractRefunds(user.id);
    if (res.success) {
      this.showToast(res.message, 'success');
      this.renderAll();
      this.openRefundModal();
    } else {
      this.showToast(res.message, 'info');
    }
  },

  // 5. Kelas Trading Modal Controller (Requirement 8)
  openKelasTradingModal() {
    if (!Auth.isLoggedIn()) {
      this.showToast('Silahkan login atau daftar dulu', 'info');
      this.openModal('authModal');
      return;
    }
    this.openModal('kelasTradingModal');
  },

  handlePlanAction(planId) {
    this.openPlanModal(planId);
  },

  openPlanModal(planId) {
    if (!Auth.isLoggedIn()) {
      this.showToast('Silahkan login atau daftar dulu', 'info');
      this.openModal('authModal');
      return;
    }

    const plan = Plans.getPlanById(planId);
    if (!plan) return;

    document.getElementById('modalPlanTitle').textContent = `Investasi Paket ${plan.name}`;
    document.getElementById('modalPlanMin').textContent = DB.formatIDR(plan.minDeposit);
    document.getElementById('modalPlanMax').textContent = DB.formatIDR(plan.maxDeposit);
    document.getElementById('modalPlanProfit').textContent = `${plan.minDailyProfit}% - ${plan.maxDailyProfit}% / hari`;
    document.getElementById('modalPlanDuration').textContent = `${plan.durationDays} Hari`;
    document.getElementById('modalPlanDesc').textContent = plan.description || '';
    document.getElementById('investAmountInput').value = plan.minDeposit;
    document.getElementById('investAmountInput').setAttribute('data-plan-id', plan.id);

    this.openModal('planModal');
  },

  submitInvestment() {
    if (!Auth.isLoggedIn()) {
      this.closeModal('planModal');
      this.openModal('authModal');
      return;
    }

    const input = document.getElementById('investAmountInput');
    const planId = input.getAttribute('data-plan-id');
    const amount = Number(input.value);
    const user = Auth.getUser();

    const res = Plans.invest({
      userId: user.id,
      planId,
      amount
    });

    if (res.success) {
      this.closeModal('planModal');
      this.showToast(res.message, 'success');
      this.renderAll();
    } else {
      this.showToast(res.message, 'error');
    }
  },

  claimProfit() {
    const user = Auth.getUser();
    if (!user) return;

    const res = Plans.claimProfit(user.id);
    if (res.success) {
      this.showToast(res.message, 'success');
      this.renderAll();
    } else {
      this.showToast(res.message, 'info');
    }
  },

  // Auth Submit Handlers
  submitLogin() {
    const idInput = document.getElementById('loginIdentifier');
    const pwInput = document.getElementById('loginPassword');
    const id = idInput ? idInput.value.trim() : '';
    const pw = pwInput ? pwInput.value.trim() : '';

    const res = Auth.login(id, pw);
    if (res.success) {
      this.closeAllModals();
      if (res.user && res.user.role === 'admin') {
        this.showToast('Login Admin berhasil! Mengalihkan ke Panel Admin...', 'success');
        setTimeout(() => { window.location.href = 'admin'; }, 600);
      } else {
        this.showToast(res.message, 'success');
        this.renderAll();
      }
    } else {
      if (res.requiresVerification && res.user) {
        this.closeModal('authModal');
        this.openEmailVerificationModal(res.user);
        this.showToast(res.message, 'info');
        return;
      }
      if (res.isBlocked) {
        alert(res.message);
      }
      this.showToast(res.message, 'error');
    }
  },

  submitRegister() {
    const riskCheckbox = document.getElementById('regRiskAgreement');
    if (!riskCheckbox || !riskCheckbox.checked) {
      this.showToast('Silakan centang persetujuan resiko investasi sebelum mendaftar!', 'error');
      if (riskCheckbox) riskCheckbox.focus();
      return;
    }

    const username = document.getElementById('regUsername') ? document.getElementById('regUsername').value.trim() : '';
    const fullName = document.getElementById('regFullName') ? document.getElementById('regFullName').value.trim() : '';
    const email = document.getElementById('regEmail') ? document.getElementById('regEmail').value.trim() : '';
    const phone = document.getElementById('regPhone') ? document.getElementById('regPhone').value.trim() : '';
    const password = document.getElementById('regPassword') ? document.getElementById('regPassword').value : '';
    const confirmPassword = document.getElementById('regConfirmPassword') ? document.getElementById('regConfirmPassword').value : '';
    const referralCode = document.getElementById('regReferral') ? document.getElementById('regReferral').value.trim() : '';

    const res = Auth.register({ username, fullName, email, phone, password, confirmPassword, referralCode });
    if (res.success) {
      if (riskCheckbox) riskCheckbox.checked = false;
      // Clear inputs
      ['regUsername', 'regFullName', 'regEmail', 'regPhone', 'regPassword', 'regConfirmPassword', 'regReferral'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });

      if (res.requiresVerification) {
        this.closeModal('authModal');
        this.openEmailVerificationModal(res.user, res.otpCode);
        this.showToast(res.message, 'info');
      } else {
        this.closeAllModals();
        this.showToast(res.message, 'success');
        this.renderAll();
      }
    } else {
      this.showToast(res.message, 'error');
    }
  },

  // Email OTP Registration Verification Handlers
  openEmailVerificationModal(user, hintOtp = null) {
    if (!user) return;
    const idEl = document.getElementById('emailOtpUserId');
    const emailEl = document.getElementById('emailOtpUserEmail');
    const targetBadge = document.getElementById('emailOtpTargetBadge');
    const otpInput = document.getElementById('emailOtpInput');

    if (idEl) idEl.value = user.id;
    if (emailEl) emailEl.value = user.email;
    if (targetBadge) targetBadge.textContent = user.email;
    if (otpInput) {
      otpInput.value = '';
      setTimeout(() => otpInput.focus(), 250);
    }

    this.startOtpResendTimer(60);
    this.openModal('emailOtpModal');
  },

  startOtpResendTimer(seconds = 60) {
    if (this._otpTimer) clearInterval(this._otpTimer);
    let remaining = seconds;
    const btn = document.getElementById('btnResendEmailOtp');
    const cdEl = document.getElementById('resendOtpCountdown');
    if (btn) btn.disabled = true;

    this._otpTimer = setInterval(() => {
      remaining--;
      if (cdEl) cdEl.textContent = remaining;
      if (remaining <= 0) {
        clearInterval(this._otpTimer);
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = 'Kirim Ulang Kode OTP';
        }
      }
    }, 1000);
  },

  submitEmailVerificationOtp() {
    const userId = document.getElementById('emailOtpUserId') ? document.getElementById('emailOtpUserId').value : '';
    const code = document.getElementById('emailOtpInput') ? document.getElementById('emailOtpInput').value.trim() : '';

    if (!code || code.length < 6) {
      this.showToast('Harap masukkan 6 digit kode OTP verifikasi email!', 'error');
      const input = document.getElementById('emailOtpInput');
      if (input) input.focus();
      return;
    }

    const res = Auth.verifyRegistrationOtp(userId, code);
    if (res.success) {
      if (this._otpTimer) clearInterval(this._otpTimer);
      this.closeModal('emailOtpModal');
      this.showToast(res.message, 'success');
      this.renderAll();
    } else {
      this.showToast(res.message, 'error');
    }
  },

  resendEmailOtp() {
    const userId = document.getElementById('emailOtpUserId') ? document.getElementById('emailOtpUserId').value : '';
    if (!userId) return;

    const res = Auth.resendRegistrationOtp(userId);
    if (res.success) {
      this.showToast(res.message, 'success');
      this.startOtpResendTimer(60);
      const input = document.getElementById('emailOtpInput');
      if (input) {
        input.value = '';
        input.focus();
      }
    } else {
      this.showToast(res.message, 'error');
    }
  },

  togglePasswordVisibility(inputId, btnEl) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    if (btnEl) {
      btnEl.innerHTML = isPassword
        ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`
        : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
    }
  },

  quickLogin(role = 'user') {
    const res = Auth.quickLogin(role);
    this.closeAllModals();
    if (role === 'admin') {
      this.showToast('Login Admin berhasil! Mengalihkan ke Panel Admin...', 'success');
      setTimeout(() => { window.location.href = 'admin'; }, 600);
    } else {
      this.showToast('Login sebagai Investor (Alex) berhasil!', 'success');
      this.renderAll();
    }
  },

  // Forgot Password Controller (Requirement 1)
  openForgotPasswordModal() {
    this.closeModal('authModal');
    const emailInput = document.getElementById('forgotEmail');
    if (emailInput) {
      const loginId = document.getElementById('loginIdentifier');
      emailInput.value = loginId ? loginId.value.trim() : '';
    }
    const step1 = document.getElementById('forgotStepRequest');
    const step2 = document.getElementById('forgotStepVerify');
    if (step1) step1.style.display = 'block';
    if (step2) step2.style.display = 'none';

    this.openModal('forgotPasswordModal');
  },

  backToForgotRequest() {
    const step1 = document.getElementById('forgotStepRequest');
    const step2 = document.getElementById('forgotStepVerify');
    if (step1) step1.style.display = 'block';
    if (step2) step2.style.display = 'none';
  },

  submitForgotPassword() {
    const emailInput = document.getElementById('forgotEmail');
    const identifier = emailInput ? emailInput.value.trim() : '';

    if (!identifier) {
      this.showToast('Harap masukkan alamat email akun Anda!', 'error');
      if (emailInput) emailInput.focus();
      return;
    }

    const res = Auth.requestPasswordReset(identifier);
    if (res.success) {
      this.showToast(res.message, 'success');
      const targetEl = document.getElementById('forgotSentEmailTarget');
      if (targetEl) targetEl.textContent = res.email;

      const codeInput = document.getElementById('forgotResetCode');
      if (codeInput) codeInput.value = res.code; // Pre-fill for ease of use

      const step1 = document.getElementById('forgotStepRequest');
      const step2 = document.getElementById('forgotStepVerify');
      if (step1) step1.style.display = 'none';
      if (step2) step2.style.display = 'block';
    } else {
      this.showToast(res.message, 'error');
    }
  },

  submitResetPasswordWithCode() {
    const emailInput = document.getElementById('forgotEmail');
    const codeInput = document.getElementById('forgotResetCode');
    const newPassInput = document.getElementById('forgotNewPass');
    const confirmPassInput = document.getElementById('forgotConfirmPass');

    const identifier = emailInput ? emailInput.value.trim() : '';
    const code = codeInput ? codeInput.value.trim() : '';
    const newPass = newPassInput ? newPassInput.value.trim() : '';
    const confirmPass = confirmPassInput ? confirmPassInput.value.trim() : '';

    if (!identifier || !code || !newPass) {
      this.showToast('Harap lengkapi semua kolom!', 'error');
      return;
    }

    if (newPass.length < 6) {
      this.showToast('Password baru minimal 6 karakter!', 'error');
      if (newPassInput) newPassInput.focus();
      return;
    }

    if (newPass !== confirmPass) {
      this.showToast('Konfirmasi password baru tidak cocok!', 'error');
      if (confirmPassInput) confirmPassInput.focus();
      return;
    }

    const res = Auth.resetPasswordWithCode(identifier, code, newPass);
    if (res.success) {
      this.closeModal('forgotPasswordModal');
      this.showToast(res.message, 'success');

      // Pre-fill login with new credentials
      const loginId = document.getElementById('loginIdentifier');
      const loginPass = document.getElementById('loginPassword');
      if (loginId) loginId.value = identifier;
      if (loginPass) loginPass.value = newPass;

      this.openModal('authModal');
    } else {
      this.showToast(res.message, 'error');
    }
  },

  calculateProfitEstimate(value) {
    const val = Number(value) || 0;
    const minEl = document.getElementById('calcResMin');
    const maxEl = document.getElementById('calcResMax');
    const d30El = document.getElementById('calcRes30d');
    if (minEl) minEl.textContent = DB.formatIDR(val * 0.02);
    if (maxEl) maxEl.textContent = DB.formatIDR(val * 0.035);
    if (d30El) d30El.textContent = DB.formatIDR(val * 0.0275 * 30);
  },

  // Payment Handlers
  openDepositModal() {
    if (!Auth.isLoggedIn()) {
      this.showToast('Silahkan login atau daftar dulu', 'info');
      this.openModal('authModal');
      return;
    }
    this.removeDepositProof();
    this.renderDepositModal();
    this.openModal('depositModal');
  },

  renderDepositModal() {
    const db = DB.get();
    const cfg = db.settings || {};
    const gateways = cfg.paymentGateways || {};
    const banks = (gateways.banks || []).filter(b => b.active !== false);
    const qris = gateways.qris || {};
    const usdt = gateways.usdt || {};

    // 1. Populate Bank Dropdown
    const bankSelect = document.getElementById('depBankSelect');
    const optBank = document.getElementById('depOptBank');

    if (bankSelect) {
      if (banks.length > 0) {
        bankSelect.innerHTML = banks.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
        if (optBank) optBank.style.display = '';
        this.updateDepositBankInfo();
      } else {
        bankSelect.innerHTML = '<option value="">Tidak ada bank aktif</option>';
      }
    }

    // 2. Setup QRIS Info & Visibility
    const optQris = document.getElementById('depOptQris');
    const qrisImg = document.getElementById('depQrisImage');
    const qrisMerchant = document.getElementById('depQrisMerchantTitle');
    const qrisNmid = document.getElementById('depQrisNmidText');

    if (qris.active !== false) {
      if (optQris) {
        optQris.style.display = '';
        optQris.textContent = `QRIS Instant (${qris.merchantName || 'Semua Bank & E-Wallet'})`;
      }
      if (qrisImg) {
        qrisImg.src = qris.imageUrl || `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qris.merchantName || 'QRIS')}`;
      }
      if (qrisMerchant) qrisMerchant.textContent = qris.merchantName || 'AUTOTRADING OFFICIAL QRIS';
      if (qrisNmid) qrisNmid.textContent = qris.nmid ? `NMID: ${qris.nmid}` : '';
    } else {
      if (optQris) optQris.style.display = 'none';
      const methodSelect = document.getElementById('depMethodSelect');
      if (methodSelect && methodSelect.value === 'qris') {
        methodSelect.value = 'bank';
      }
    }

    // 3. Setup USDT Info
    const usdtAddrEl = document.getElementById('depUsdtAddress');
    const rateText = document.getElementById('depUsdtRateText');
    const rate = cfg.usdIdrRate || 16250;
    if (usdtAddrEl) usdtAddrEl.textContent = usdt.trc20Address || 'TXv7qL98HqN8sP2uYx9B9m34j9KxL0qWp1';
    if (rateText) rateText.textContent = Number(rate).toLocaleString('id-ID');

    // Trigger amount calculation
    const depUsdtAmountInput = document.getElementById('depUsdtAmountInput');
    if (depUsdtAmountInput) {
      const val = Number(depUsdtAmountInput.value) || 0;
      const idrEl = document.getElementById('depUsdtCalculatedIdr');
      if (idrEl) idrEl.textContent = DB.formatIDR(val * rate);
    }

    // Update Method Visibility
    this.updateDepositMethodVisibility();
  },

  updateDepositBankInfo() {
    const db = DB.get();
    const banks = (db.settings.paymentGateways && db.settings.paymentGateways.banks) || [];
    const bankSelect = document.getElementById('depBankSelect');
    if (!bankSelect) return;

    const selectedId = bankSelect.value;
    const bank = banks.find(b => b.id === selectedId) || banks.find(b => b.active !== false) || banks[0];

    const nameEl = document.getElementById('depBankSelectedName');
    const accNoEl = document.getElementById('depBankAccountNo');
    const accNameEl = document.getElementById('depBankAccountName');
    const copyBtn = document.getElementById('btnCopyBankAcc');

    if (bank) {
      if (nameEl) nameEl.textContent = bank.name;
      if (accNoEl) accNoEl.textContent = bank.accountNo;
      if (accNameEl) accNameEl.textContent = bank.accountName;
      if (copyBtn) {
        copyBtn.onclick = () => App.copyText(bank.accountNo, `Nomor Rekening ${bank.name}`);
      }
    }
  },

  updateDepositMethodVisibility() {
    const methodSelect = document.getElementById('depMethodSelect');
    if (!methodSelect) return;
    const val = methodSelect.value;
    const bankFields = document.getElementById('depBankFields');
    const qrisFields = document.getElementById('depQrisFields');
    const usdtFields = document.getElementById('depUsdtFields');
    const nominalWrap = document.getElementById('depNominalWrap');

    if (bankFields) bankFields.style.display = val === 'bank' ? 'block' : 'none';
    if (qrisFields) qrisFields.style.display = val === 'qris' ? 'block' : 'none';
    if (usdtFields) usdtFields.style.display = val === 'usdt' ? 'block' : 'none';
    if (nominalWrap) nominalWrap.style.display = val === 'usdt' ? 'none' : 'block';
  },

  openWithdrawModal() {
    const user = Auth.getUser();
    if (!user) {
      this.showToast('Silahkan login atau daftar dulu', 'info');
      this.openModal('authModal');
      return;
    }

    // Auto-populate saved withdrawal bank if configured
    const savedNotice = document.getElementById('wdSavedBankNotice');
    const bankNameInput = document.getElementById('wdBankName');
    const accNumInput = document.getElementById('wdAccountNumber');
    const accHolderInput = document.getElementById('wdAccountHolder');

    if (user.bankAccount && user.bankAccount.accountNumber) {
      if (bankNameInput) bankNameInput.value = user.bankAccount.bankName || '';
      if (accNumInput) accNumInput.value = user.bankAccount.accountNumber || '';
      if (accHolderInput) accHolderInput.value = user.bankAccount.accountHolder || '';
      if (savedNotice) savedNotice.style.display = 'flex';
    } else {
      if (bankNameInput && !bankNameInput.value) bankNameInput.value = 'BCA';
      if (accHolderInput && !accHolderInput.value) accHolderInput.value = user.fullName || '';
      if (savedNotice) savedNotice.style.display = 'none';
    }

    // Check withdrawal operational schedule
    const sched = Payment.isWithdrawOpen();
    const badgeEl = document.getElementById('wdScheduleStatusBadge');
    const textEl = document.getElementById('wdScheduleStatusText');
    const submitBtn = document.getElementById('btnSubmitWithdraw');

    if (badgeEl && textEl) {
      if (sched.isOpen) {
        badgeEl.className = 'wd-status-badge open';
        textEl.textContent = `🟢 Jam Operasional WD Buka (${String(sched.schedule.startHour).padStart(2, '0')}:00 - ${String(sched.schedule.endHour).padStart(2, '0')}:00 WIB)`;
        if (submitBtn) {
          submitBtn.removeAttribute('disabled');
          submitBtn.style.opacity = '1';
        }
      } else {
        badgeEl.className = 'wd-status-badge closed';
        textEl.textContent = `🔴 ${sched.message}`;
      }
    }

    // Render Dynamic Withdrawal Terms (Requirement 3)
    const termsListEl = document.getElementById('withdrawTermsList');
    if (termsListEl) {
      const db = DB.get();
      const terms = (db.settings && db.settings.withdrawTerms) || [
        "Minimal Penarikan: Rp 50.000 per transaksi.",
        "Biaya Admin: 1.0% dari nominal penarikan dana.",
        "Jam Operasional WD: Buka setiap hari pukul 09:00 - 21:00 WIB. Penarikan di luar jam operasional akan diproses pada jam kerja berikutnya.",
        "Waktu Proses: Saldo masuk dalam hitungan 5 - 30 menit (maksimal 1x24 jam kerja).",
        "Proteksi Modal Terkunci: Modal paket investasi yang sedang aktif dikunci otomatis oleh sistem hingga durasi kontrak selesai dan tidak dapat ditarik mendahului periode."
      ];
      termsListEl.innerHTML = terms.map(term => {
        if (term.includes(':')) {
          const parts = term.split(':');
          return `<li><strong>${parts[0].replace(/^[-•*]\s*/, '')}:</strong>${parts.slice(1).join(':')}</li>`;
        }
        return `<li>${term.replace(/^[-•*]\s*/, '')}</li>`;
      }).join('');
    }

    // Update balance preview
    this.updateWithdrawBalancePreview();

    this.openModal('withdrawModal');
  },

  updateWithdrawBalancePreview() {
    const user = Auth.getUser();
    if (!user) return;

    const breakdown = Payment.getWithdrawableBalance(user.id);
    const freeBalEl = document.getElementById('wdFreeBalanceVal');
    const lockedCapEl = document.getElementById('wdLockedCapitalVal');
    const affBalEl = document.getElementById('wdAffiliateBalanceVal');

    if (freeBalEl) freeBalEl.textContent = DB.formatIDR(breakdown.freeBalance);
    if (lockedCapEl) lockedCapEl.textContent = DB.formatIDR(breakdown.lockedCapital);
    if (affBalEl) affBalEl.textContent = DB.formatIDR(breakdown.affiliateBalance);
  },

  // Deposit Proof of Transfer Upload Handlers
  handleDepositProofSelect(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.showToast('Harap pilih file gambar (JPG, PNG, atau WEBP)!', 'error');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      this.showToast('Ukuran gambar maksimal 5MB!', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      this.uploadedDepositProofBase64 = e.target.result;
      const previewImg = document.getElementById('depProofPreviewImg');
      const previewWrap = document.getElementById('depProofPreviewWrap');
      const placeholder = document.getElementById('depProofPlaceholder');

      if (previewImg) previewImg.src = e.target.result;
      if (previewWrap) previewWrap.style.display = 'block';
      if (placeholder) placeholder.style.display = 'none';
      this.showToast('Foto bukti transfer berhasil dimuat.', 'success');
    };
    reader.readAsDataURL(file);
  },

  removeDepositProof() {
    this.uploadedDepositProofBase64 = null;
    const fileInput = document.getElementById('depProofFileInput');
    const previewImg = document.getElementById('depProofPreviewImg');
    const previewWrap = document.getElementById('depProofPreviewWrap');
    const placeholder = document.getElementById('depProofPlaceholder');

    if (fileInput) fileInput.value = '';
    if (previewImg) previewImg.src = '';
    if (previewWrap) previewWrap.style.display = 'none';
    if (placeholder) placeholder.style.display = 'flex';
  },

  submitDeposit() {
    const user = Auth.getUser();
    if (!user) return;

    const method = document.getElementById('depMethodSelect').value;
    const amount = document.getElementById('depAmountInput').value;
    const usdtAmt = document.getElementById('depUsdtAmountInput').value;
    const txid = document.getElementById('depTxidInput').value;
    const bankId = document.getElementById('depBankSelect').value;

    const proofImage = this.uploadedDepositProofBase64;
    if (!proofImage) {
      this.showToast('Harap upload foto bukti transfer / struk pembayaran terlebih dahulu!', 'error');
      return;
    }

    const res = Payment.createDepositRequest({
      userId: user.id,
      method,
      bankId,
      amount,
      amountUsdt: usdtAmt,
      txid,
      proofImage
    });

    if (res.success) {
      this.removeDepositProof();
      this.closeModal('depositModal');
      this.showToast(res.message, 'success');
      this.renderAll();
    } else {
      this.showToast(res.message, 'error');
    }
  },

  viewProofImage(trxId) {
    const db = DB.get();
    const trx = db.transactions.find(t => t.id === trxId);
    if (!trx || !trx.proofImage) {
      this.showToast('Bukti transfer tidak tersedia untuk transaksi ini.', 'info');
      return;
    }

    const titleEl = document.getElementById('viewProofModalTitle');
    const subtitleEl = document.getElementById('viewProofModalSubtitle');
    const imgEl = document.getElementById('viewProofModalImg');

    if (titleEl) titleEl.textContent = `📄 Bukti Transfer (${DB.formatIDR(trx.amount)})`;
    if (subtitleEl) subtitleEl.textContent = `${trx.paymentMethod || 'Deposit'} · ID: ${trx.id}`;
    if (imgEl) imgEl.src = trx.proofImage;

    this.openModal('viewProofModal');
  },

  submitWithdraw() {
    const user = Auth.getUser();
    if (!user) return;

    const sched = Payment.isWithdrawOpen();
    if (!sched.isOpen) {
      this.showToast(sched.message, 'error');
      return;
    }

    const walletType = document.getElementById('wdWalletType').value;
    const method = document.getElementById('wdMethod').value;
    const bankName = document.getElementById('wdBankName').value;
    const accountNumber = document.getElementById('wdAccountNumber').value;
    const accountHolder = document.getElementById('wdAccountHolder').value;
    const amount = document.getElementById('wdAmountInput').value;

    const res = Payment.createWithdrawRequest({
      userId: user.id,
      walletType,
      method,
      bankName,
      accountNumber,
      accountHolder,
      amount
    });

    if (res.success) {
      this.closeModal('withdrawModal');
      this.showToast(res.message, 'success');
      this.renderAll();
    } else {
      this.showToast(res.message, 'error');
    }
  },

  transferAffiliateBalance() {
    const user = Auth.getUser();
    if (!user) return;

    const amount = prompt(`Masukkan nominal yang ingin ditransfer ke Wallet Balance (Maksimal: ${DB.formatIDR(user.affiliateBalance)}):`, user.affiliateBalance);
    if (!amount) return;

    const res = Affiliate.transferToMainBalance(user.id, amount);
    if (res.success) {
      this.showToast(res.message, 'success');
      this.renderAll();
    } else {
      this.showToast(res.message, 'error');
    }
  },

  openSignalDetail(signalId) {
    const signals = Signals.getSignals();
    const sig = signals.find(s => s.id === signalId);
    if (!sig) return;

    const marketStatus = Plans.isMarketOpen();
    const isOff = !marketStatus.isOpen;

    const actionBadge = document.getElementById('sigModalAction');
    const noticeEl = document.getElementById('sigModalNotice');
    const ctaBtn = document.getElementById('sigModalCtaBtn');

    if (isOff) {
      if (actionBadge) {
        actionBadge.textContent = 'PASAR OFF';
        actionBadge.className = 'badge-signal-action off';
      }
      if (noticeEl) {
        noticeEl.innerHTML = `
          <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid #EF4444; border-radius: 10px; padding: 8px 12px; margin-top: 10px; color: #B91C1C; font-size: 11px; font-weight: 600;">
            ⚠️ Sesi pasar finansial global sedang LIBUR (OFF). Sinyal trading dan eksekusi order ditangguhkan sementara hingga pasar buka kembali.
          </div>
        `;
      }
      document.getElementById('sigModalEntry').textContent = 'PASAR LIBUR';
      document.getElementById('sigModalTp').textContent = 'PASAR LIBUR';
      document.getElementById('sigModalSl').textContent = 'PASAR LIBUR';
      document.getElementById('sigModalConf').textContent = 'OFF';

      if (ctaBtn) {
        ctaBtn.innerHTML = '<span>Pasar Sedang Libur (OFF)</span>';
        ctaBtn.style.background = '#64748B';
        ctaBtn.onclick = () => {
          this.showToast('Pasar sedang OFF. Sinyal tidak dapat dieksekusi saat pasar libur!', 'error');
        };
      }
    } else {
      if (actionBadge) {
        actionBadge.textContent = sig.action;
        actionBadge.className = `badge-signal-action ${sig.action.toLowerCase()}`;
      }
      if (noticeEl) {
        noticeEl.innerHTML = '';
      }
      document.getElementById('sigModalEntry').textContent = sig.entry;
      document.getElementById('sigModalTp').textContent = sig.tp;
      document.getElementById('sigModalSl').textContent = sig.sl;
      document.getElementById('sigModalConf').textContent = `${sig.confidence}%`;

      if (ctaBtn) {
        ctaBtn.innerHTML = '<span>Terapkan ke Akun Trading</span>';
        ctaBtn.style.background = '';
        ctaBtn.onclick = () => {
          this.closeModal('signalModal');
          this.showToast('Sinyal telah disalin ke trading desk Anda!', 'success');
        };
      }
    }

    document.getElementById('sigModalPair').textContent = sig.pair;

    this.openModal('signalModal');
  },

  isLoggedIn() {
    return Auth.isLoggedIn();
  },

  // Bind All Event Listeners
  bindEvents() {
    // Navigation Tabs
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const tab = btn.getAttribute('data-tab');
        this.switchTab(tab);
      });
    });

    // Auth Switcher between Login & Register tabs
    const authTabLogin = document.getElementById('authTabLogin');
    const authTabRegister = document.getElementById('authTabRegister');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');

    if (authTabLogin && authTabRegister) {
      authTabLogin.addEventListener('click', () => {
        authTabLogin.classList.add('btn-cta-gold');
        authTabRegister.classList.remove('btn-cta-gold');
        authTabRegister.style.background = '#F1F5F9';
        authTabRegister.style.color = '#475569';
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
      });

      authTabRegister.addEventListener('click', () => {
        authTabRegister.classList.add('btn-cta-gold');
        authTabLogin.classList.remove('btn-cta-gold');
        authTabLogin.style.background = '#F1F5F9';
        authTabLogin.style.color = '#475569';
        registerForm.style.display = 'block';
        loginForm.style.display = 'none';
      });
    }

    // Modal Close buttons
    document.querySelectorAll('.modal-close-btn').forEach(btn => {
      btn.addEventListener('click', () => this.closeAllModals());
    });

    // Close on backdrop click
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) this.closeAllModals();
      });
    });

    // Deposit method changer
    const depMethodSelect = document.getElementById('depMethodSelect');
    if (depMethodSelect) {
      depMethodSelect.addEventListener('change', () => {
        this.updateDepositMethodVisibility();
      });
    }

    // Deposit bank selector changer
    const depBankSelect = document.getElementById('depBankSelect');
    if (depBankSelect) {
      depBankSelect.addEventListener('change', () => {
        this.updateDepositBankInfo();
      });
    }

    // USDT conversion calculator
    const depUsdtAmountInput = document.getElementById('depUsdtAmountInput');
    if (depUsdtAmountInput) {
      depUsdtAmountInput.addEventListener('input', () => {
        const val = Number(depUsdtAmountInput.value) || 0;
        const rate = DB.get().settings.usdIdrRate || 16250;
        const idrEl = document.getElementById('depUsdtCalculatedIdr');
        if (idrEl) idrEl.textContent = DB.formatIDR(val * rate);
      });
    }

    // Member testimonial file upload reader
    const testiFileInput = document.getElementById('memberTestiFileInput');
    if (testiFileInput) {
      testiFileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        if (file.size > 3 * 1024 * 1024) {
          this.showToast('Ukuran gambar maksimal 3 MB!', 'error');
          testiFileInput.value = '';
          return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
          const previewWrap = document.getElementById('memberTestiPreviewWrap');
          const previewImg = document.getElementById('memberTestiPreviewImg');
          if (previewImg && previewWrap) {
            previewImg.src = event.target.result;
            previewWrap.style.display = 'block';
          }
        };
        reader.readAsDataURL(file);
      });
    }
  },

  // Profit percentage info toast/modal helper
  showTodayProfitDetails() {
    const db = DB.get();
    const isLossMode = db.settings.todayProfitLossMode && db.settings.todayProfitLossMode.isLoss;
    const lossMsg = (db.settings.todayProfitLossMode && db.settings.todayProfitLossMode.message) || 'Hari ini dividen profit 0% (Mode Loss). Proteksi modal aktif.';

    if (isLossMode) {
      this.showToast(`🛡️ Mode Loss / 0% Aktif: ${lossMsg}`, 'info');
      return;
    }

    const now = new Date();
    const dayOfWeek = now.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      this.showToast('⏸️ Pasar Finansial Libur Akhir Pekan (Sabtu & Minggu). Dividen profit akan aktif kembali hari Senin.', 'info');
      return;
    }

    const user = Auth.getCurrentUser();
    if (!user) {
      this.showToast('Silakan login untuk melihat persentase profit harian paket investasi Anda.', 'info');
      return;
    }
    const rate = Plans.getUserTodayProfitRate(user.id);
    const userInvs = Plans.getUserInvestments(user.id);
    if (userInvs.length === 0) {
      this.showToast('Anda belum memiliki paket investasi aktif. Aktifkan paket di bawah untuk menghasilkan profit harian!', 'info');
    } else {
      this.showToast(`Persentase profit harian rata-rata berjalan Anda saat ini: +${rate.toFixed(2)}% dari ${userInvs.length} paket aktif.`, 'success');
    }
  },

  // Clipboard copy helper
  copyText(text, label = 'Teks') {
    navigator.clipboard.writeText(text).then(() => {
      this.showToast(`${label} berhasil disalin ke clipboard.`, 'success');
    }).catch(() => {
      const temp = document.createElement('input');
      temp.value = text;
      document.body.appendChild(temp);
      temp.select();
      document.execCommand('copy');
      temp.remove();
      this.showToast(`${label} berhasil disalin.`, 'success');
    });
  }
};

// Global Exposure for HTML inline onclick handlers
window.App = App;
window.Auth = Auth;
window.DB = DB;
window.Plans = Plans;
window.Affiliate = Affiliate;
window.Payment = Payment;
window.Rewards = Rewards;

// Launch App on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});

