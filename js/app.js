/**
 * FGT PRO - MAIN APPLICATION CONTROLLER & UI RENDERER
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
      sessionStorage.setItem('fgt_ref_code', refParam);
      const refInput = document.getElementById('regReferral');
      if (refInput) refInput.value = refParam;
    }

    // Render Initial State
    this.renderAll();
    this.bindEvents();
    this.startMarketTicker();
    this.startProfitCountdownLoop();
    this.initAiTradingChart();

    // Show quick welcome toast
    setTimeout(() => {
      if (!Auth.isLoggedIn()) {
        this.showToast('Selamat datang di FGT Pro. Silakan login untuk mengakses fitur lengkap.', 'info');
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

    // 1. Render Top Header
    this.renderHeader(user);

    // 1.5 Render Running Text / Announcement Ticker
    this.renderRunningText();

    // 2. Render 4-Column Wallet Balance Card
    this.renderWalletSummary(user);

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

  // 1. Header Rendering
  renderHeader(user) {
    const greetingEl = document.getElementById('userGreetingText');
    const avatarEl = document.getElementById('userAvatarBadge');
    
    if (user) {
      const activePlans = Plans.getUserInvestments(user.id);
      const isMemberActive = activePlans.length > 0;
      const sponsorName = user.referredBy ? user.referredBy : 'Optional';
      const statusBadge = isMemberActive
        ? `<span class="badge-member-active" style="padding: 1px 6px; font-size: 9px;">🟢 Member Aktif</span>`
        : `<span class="badge-member-inactive" style="padding: 1px 6px; font-size: 9px;">⚪ Belum Aktif</span>`;

      greetingEl.innerHTML = `
        <div style="font-size: 13.5px; font-weight: 800; line-height: 1.2;">Hi <span class="user-name">${user.fullName || user.username}</span></div>
        <div style="font-size: 9.5px; color: #64748B; margin-top: 2px; display: flex; align-items: center; gap: 4px; flex-wrap: wrap;">
          ${statusBadge}
          <span style="color: #94A3B8;">·</span>
          <span style="color: #475569;">Sponsor: <strong>${sponsorName}</strong></span>
        </div>
      `;
      avatarEl.classList.add('logged-in');
      avatarEl.innerHTML = `<span>${(user.username || 'U')[0].toUpperCase()}</span><span class="online-dot"></span>`;
    } else {
      greetingEl.innerHTML = `Hi guest,`;
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
      el.textContent = 'Selamat datang di FGT Pro Platform Investasi AI Trading Resmi 2026.';
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

    if (user) {
      mainBalEl.textContent = DB.formatIDR(user.walletBalance);
      affBalEl.textContent = DB.formatIDR(user.affiliateBalance);
      pointEl.textContent = user.points || 0;
      
      const rate = Plans.getUserTodayProfitRate(user.id);
      if (profitEl) {
        if (!marketStatus.isOpen) {
          profitEl.textContent = '0.00% (OFF)';
          profitEl.style.color = '#EF4444';
          profitEl.title = 'Pasar sedang libur / OFF. Dividen profit akan berjalan aktif saat pasar ON.';
        } else {
          profitEl.textContent = rate > 0 ? `+${rate.toFixed(2)}%` : '+0.00%';
          profitEl.style.color = '#0F172A';
          profitEl.title = 'Profit dividen harian AI berjalan realtime';
        }
      }
    } else {
      mainBalEl.textContent = 'IDR 0';
      affBalEl.textContent = 'IDR 0';
      pointEl.textContent = '0';
      if (profitEl) {
        profitEl.textContent = !marketStatus.isOpen ? '0.00% (OFF)' : '+0.00%';
        profitEl.style.color = !marketStatus.isOpen ? '#EF4444' : '#0F172A';
      }
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
              <button class="tier-btn ${plan.theme === 'theme-rookie' ? 'btn-change' : 'btn-active'}" onclick="App.handlePlanAction('${plan.id}')">
                <span>${plan.theme === 'theme-rookie' ? 'Change' : 'Active'}</span>
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
          <img class="banner-img" src="${imgSource}" alt="${b.title || 'FGT Pro Banner'}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1642543492481-44e81e3914a7?w=900&auto=format&fit=crop&q=80'">
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
            <p class="reward-desc-snippet">${r.description || 'Tukarkan poin loyalty trading FGT Pro Anda.'}</p>
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
      this.openModal('authModal');
      this.showToast('Silakan login terlebih dahulu untuk menukarkan poin reward Anda.', 'info');
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
          <div style="font-size: 11.5px; margin-top: 4px;">Pilih kategori "Semua Bank" untuk melihat seluruh bukti penarikan member FGT Pro.</div>
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
            "${t.comment || 'Penarikan sukses landing cepat tanpa kendala. Terimakasih FGT Pro!'}"
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

  // Render Wallet View Page
  renderWalletView(user) {
    if (!user) {
      this.openModal('authModal');
      this.showToast('Silakan login terlebih dahulu untuk mengakses menu Wallet.', 'info');
      this.switchTab('home');
      return;
    }

    document.getElementById('walletPageMainBal').textContent = DB.formatIDR(user.walletBalance);
    document.getElementById('walletPageAffBal').textContent = DB.formatIDR(user.affiliateBalance);

    const txListEl = document.getElementById('walletTransactionList');
    const txs = Payment.getUserTransactions(user.id);

    if (txs.length === 0) {
      txListEl.innerHTML = '<div style="text-align:center; padding:20px; color:#94A3B8;">Belum ada riwayat transaksi.</div>';
      return;
    }

    txListEl.innerHTML = txs.map(t => {
      let title = t.paymentMethod || t.type;
      let isPlus = t.type === 'deposit' || t.type === 'profit_claim' || t.type === 'sponsor_bonus' || t.type === 'rabat_bonus';
      let amountColor = isPlus ? '#22C55E' : '#EF4444';
      let sign = isPlus ? '+' : '-';

      return `
        <div style="background:#FFFFFF; border-radius:14px; padding:12px 14px; box-shadow:var(--card-shadow); border:1px solid #F1F5F9; display:flex; align-items:center; justify-content:space-between;">
          <div style="display:flex; align-items:center; gap:10px;">
            <div style="width:36px; height:36px; border-radius:10px; background:#F8FAFC; display:flex; align-items:center; justify-content:center;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748B" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            </div>
            <div>
              <div style="font-weight:700; font-size:13px; color:#1E293B;">${title}</div>
              <div style="font-size:10px; color:#94A3B8;">${new Date(t.createdAt).toLocaleDateString('id-ID')} · <span class="badge-status ${t.status}">${t.status.toUpperCase()}</span></div>
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-weight:800; font-size:13px; color:${amountColor}; font-family:var(--font-mono);">${sign}${DB.formatIDR(t.amount)}</div>
            ${t.uniqueCode ? `<div style="font-size:9px; color:#64748B;">Kode: ${t.uniqueCode}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');
  },

  // Render Trade View Page (with 30-day Duration Progress Bar & AI Chart)
  renderTradeView(user) {
    const listEl = document.getElementById('tradeActivePlansList');
    if (!user) {
      listEl.innerHTML = `
        <div style="text-align:center; padding:30px 20px; background:#FFFFFF; border-radius:18px; box-shadow:var(--card-shadow);">
          <div style="width:48px; height:48px; border-radius:50%; background:#EFF6FF; display:flex; align-items:center; justify-content:center; margin:0 auto 12px auto;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="2"><path d="M3 3v18h18"/><path d="M18 9l-5 5-4-4-3 3"/></svg>
          </div>
          <h3 style="font-size:16px; font-weight:800; margin-bottom:6px;">Trading & Investasi AI</h3>
          <p style="font-size:12px; color:#64748B; margin-bottom:16px;">Login sekarang untuk melihat portofolio investasi dan klaim profit harian.</p>
          <button class="btn-cta-gold" onclick="App.openModal('authModal')">Login Sekarang</button>
        </div>
      `;
      this.renderAiTradingChart();
      return;
    }

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
      this.openModal('authModal');
      this.switchTab('home');
      return;
    }

    document.getElementById('profileUsername').textContent = user.username;
    document.getElementById('profileEmail').textContent = user.email || user.phone || 'Member';
    document.getElementById('profileRefCode').textContent = user.referralCode || '-';
    
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

    // Downline stats
    const downlines = Affiliate.getDownlines(user.referralCode);
    document.getElementById('affL1Count').textContent = downlines.level1.length;
    document.getElementById('affL2Count').textContent = downlines.level2.length;
    document.getElementById('affL3Count').textContent = downlines.level3.length;
    document.getElementById('affTotalTurnover').textContent = DB.formatIDR(downlines.totalTeamTurnover);

    // Render Downline List
    const listEl = document.getElementById('affDownlineList');
    if (downlines.totalMembers === 0) {
      listEl.innerHTML = '<div style="text-align:center; padding:15px; color:#94A3B8; font-size:12px;">Belum ada anggota di tim Anda. Bagikan kode referral Anda untuk mendapatkan bonus sponsor & rabat.</div>';
    } else {
      listEl.innerHTML = [
        ...downlines.level1.map(u => ({ ...u, levelStr: 'Level 1 (Sponsor Langsung 10%)' })),
        ...downlines.level2.map(u => ({ ...u, levelStr: 'Level 2 (Rabat 3%)' })),
        ...downlines.level3.map(u => ({ ...u, levelStr: 'Level 3 (Rabat 1.5%)' }))
      ].map(u => `
        <div style="background:#FFFFFF; border-radius:12px; padding:10px 12px; box-shadow:0 2px 8px rgba(0,0,0,0.04); display:flex; justify-content:space-between; align-items:center; font-size:12px;">
          <div>
            <div style="font-weight:700; color:#0F172A;">${u.username} (${u.fullName})</div>
            <div style="font-size:10px; color:#64748B;">${u.levelStr}</div>
          </div>
          <span class="badge-status active">Aktif</span>
        </div>
      `).join('');
    }
  },

  // Render Markets / Riwayat View Page with Interactive Chart & Live Running Text
  renderMarketsView() {
    this.renderRiwayatTickers();

    const chartCanvas = document.getElementById('marketChartCanvas');
    if (chartCanvas && chartCanvas.getContext) {
      const ctx = chartCanvas.getContext('2d');
      const w = chartCanvas.width = chartCanvas.parentElement.clientWidth || 360;
      const h = chartCanvas.height = 180;

      ctx.clearRect(0, 0, w, h);
      
      // Draw smooth line
      ctx.beginPath();
      ctx.moveTo(0, h * 0.7);
      const points = [0.7, 0.65, 0.68, 0.5, 0.55, 0.42, 0.48, 0.35, 0.38, 0.25, 0.3, 0.2];
      const step = w / (points.length - 1);
      
      points.forEach((p, idx) => {
        ctx.lineTo(idx * step, h * p + Math.sin(idx + Date.now() / 1000) * 4);
      });

      ctx.strokeStyle = '#C89338';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Gradient Fill Under Line
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, 'rgba(200, 147, 56, 0.35)');
      grad.addColorStop(1, 'rgba(200, 147, 56, 0.0)');
      ctx.fillStyle = grad;
      ctx.fill();
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
      this.openModal('authModal');
      this.showToast('Silakan login untuk melakukan top up investasi.', 'info');
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
      this.openModal('authModal');
      this.showToast('Silakan login untuk melihat statistik dan portofolio akun Anda.', 'info');
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
    if (emailEl) emailEl.textContent = user.email || user.phone || 'Member FGT Pro';
    if (badgeEl) {
      badgeEl.className = isMemberActive ? 'badge-member-active' : 'badge-member-inactive';
      badgeEl.textContent = isMemberActive ? '🟢 Member Aktif' : '⚪ Belum Aktif';
    }
    if (sponsorEl) {
      sponsorEl.textContent = user.referredBy ? user.referredBy : 'Tidak ada sponsor (Opsional)';
    }
    if (joinedEl) {
      const joinDate = user.createdAt ? new Date(user.createdAt) : new Date();
      joinedEl.textContent = joinDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    const marketStatus = Plans.isMarketOpen();
    if (todayRateEl) {
      todayRateEl.textContent = !marketStatus.isOpen ? '0.00% (OFF)' : (todayRate > 0 ? `+${todayRate.toFixed(2)}%` : '+0.00%');
      todayRateEl.style.color = !marketStatus.isOpen ? '#EF4444' : '#15803D';
    }
    if (todayNomEl) {
      todayNomEl.textContent = !marketStatus.isOpen ? '+IDR 0 (Pasar Libur)' : `+${DB.formatIDR(todayNominal)}`;
    }
    if (totalEarnedEl) {
      totalEarnedEl.textContent = DB.formatIDR(totalProfitEarned);
    }
    if (countBadgeEl) {
      countBadgeEl.textContent = `${activeInvs.length} Paket Aktif`;
    }

    if (listContainer) {
      if (activeInvs.length === 0) {
        listContainer.innerHTML = `
          <div style="text-align: center; padding: 18px 12px; background: #F8FAFC; border-radius: 12px; border: 1px solid #E2E8F0;">
            <p style="font-size: 11.5px; color: #64748B; margin: 0 0 10px 0;">Belum ada paket investasi aktif saat ini.</p>
            <button class="tier-btn btn-topup" style="display: inline-block; padding: 6px 14px; font-size: 11px;" onclick="App.closeModal('myStatisticModal'); App.switchTab('home');">
              + Pilih & Aktifkan Paket
            </button>
          </div>
        `;
      } else {
        listContainer.innerHTML = activeInvs.map(inv => {
          const progressPct = Math.min(100, Math.round(((inv.daysElapsed || 0) / inv.durationDays) * 100));
          return `
            <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 10px 12px;">
              <div class="flex-between mb-1">
                <span style="font-weight: 800; font-size: 13px; color: #0F172A;">${inv.planName}</span>
                <span style="font-weight: 800; color: #166534; font-family: var(--font-mono); font-size: 12.5px;">${DB.formatIDR(inv.capital)}</span>
              </div>
              <div style="font-size: 10.5px; color: #64748B; margin-bottom: 6px;">
                Durasi: Hari ke-${inv.daysElapsed || 0}/${inv.durationDays} (${progressPct}%) · Profit: +${DB.formatIDR(inv.totalProfitEarned || 0)}
              </div>
              <div style="width: 100%; height: 5px; background: #E2E8F0; border-radius: 3px; overflow: hidden;">
                <div style="width: ${progressPct}%; height: 100%; background: #22C55E; border-radius: 3px;"></div>
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
    this.renderRiwayatTickers();
    this.filterRiwayat('all');
    this.openModal('riwayatModal');
  },

  renderRiwayatTickers() {
    const deposits = Payment.getLiveMemberDeposits();
    const wds = Payment.getLiveMemberWithdrawals();

    const renderDepHtml = deposits.map(d => `
      <span class="fgt-marquee-item">
        <span class="badge-tag badge-dep">DEPOSIT</span>
        <span>${d.username}</span>
        <span class="amount-val">+${DB.formatIDR(d.amount)}</span>
        <span style="color:#94A3B8; font-size:10px;">(${d.method})</span>
        <span style="color:#4ADE80; font-size:10px;">· ${d.timeAgo}</span>
      </span>
    `).join('');

    const renderWdHtml = wds.map(w => `
      <span class="fgt-marquee-item">
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
        <span class="fgt-marquee-item">
          <span class="badge-tag badge-lead">TOP ${idx + 1} SPONSOR</span>
          <span style="font-weight:700;">${s.username}</span>
          <span class="amount-val">${DB.formatIDR(s.commission)} Komisi</span>
          <span style="color:#C084FC;">(${s.directCount} Member)</span>
        </span>
      `).join('');

      const topProfitItems = profits.slice(0, 5).map((p, idx) => `
        <span class="fgt-marquee-item">
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
    this.openModal('kelasTradingModal');
  },

  handlePlanAction(planId) {
    this.openPlanModal(planId);
  },

  openPlanModal(planId) {
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
        setTimeout(() => { window.location.href = 'admin.html'; }, 600);
      } else {
        this.showToast(res.message, 'success');
        this.renderAll();
      }
    } else {
      this.showToast(res.message, 'error');
    }
  },

  submitRegister() {
    const username = document.getElementById('regUsername') ? document.getElementById('regUsername').value.trim() : '';
    const fullName = document.getElementById('regFullName') ? document.getElementById('regFullName').value.trim() : '';
    const email = document.getElementById('regEmail') ? document.getElementById('regEmail').value.trim() : '';
    const phone = document.getElementById('regPhone') ? document.getElementById('regPhone').value.trim() : '';
    const password = document.getElementById('regPassword') ? document.getElementById('regPassword').value : '';
    const referralCode = document.getElementById('regReferral') ? document.getElementById('regReferral').value.trim() : '';

    const res = Auth.register({ username, fullName, email, phone, password, referralCode });
    if (res.success) {
      this.closeAllModals();
      this.showToast(res.message, 'success');
      this.renderAll();
    } else {
      this.showToast(res.message, 'error');
    }
  },

  quickLogin(role = 'user') {
    const res = Auth.quickLogin(role);
    this.closeAllModals();
    if (role === 'admin') {
      this.showToast('Login Admin berhasil! Mengalihkan ke Panel Admin...', 'success');
      setTimeout(() => { window.location.href = 'admin.html'; }, 600);
    } else {
      this.showToast('Login sebagai Investor (Alex) berhasil!', 'success');
      this.renderAll();
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
      this.openModal('authModal');
      this.showToast('Silakan login untuk melakukan deposit.', 'info');
      return;
    }
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
      if (qrisMerchant) qrisMerchant.textContent = qris.merchantName || 'FGT PRO OFFICIAL QRIS';
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
      this.openModal('authModal');
      this.showToast('Silakan login untuk melakukan penarikan.', 'info');
      return;
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

  submitDeposit() {
    const user = Auth.getUser();
    if (!user) return;

    const method = document.getElementById('depMethodSelect').value;
    const amount = document.getElementById('depAmountInput').value;
    const usdtAmt = document.getElementById('depUsdtAmountInput').value;
    const txid = document.getElementById('depTxidInput').value;
    const bankId = document.getElementById('depBankSelect').value;

    const res = Payment.createDepositRequest({
      userId: user.id,
      method,
      bankId,
      amount,
      amountUsdt: usdtAmt,
      txid
    });

    if (res.success) {
      this.closeModal('depositModal');
      this.showToast(res.message, 'success');
      this.renderAll();
    } else {
      this.showToast(res.message, 'error');
    }
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

    document.getElementById('sigModalPair').textContent = sig.pair;
    document.getElementById('sigModalAction').textContent = sig.action;
    document.getElementById('sigModalAction').className = `badge-signal-action ${sig.action.toLowerCase()}`;
    document.getElementById('sigModalEntry').textContent = sig.entry;
    document.getElementById('sigModalTp').textContent = sig.tp;
    document.getElementById('sigModalSl').textContent = sig.sl;
    document.getElementById('sigModalConf').textContent = `${sig.confidence}%`;

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

