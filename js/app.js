/**
 * AUTOTRADING - MAIN APPLICATION CONTROLLER & UI RENDERER
 * Connects DOM events, handles SPA routing, renders views, and synchronizes real-time state.
 * Premium Fintech Edition: Vector SVG Icons & Polished UI.
 */

import { DB, createReceiptBase64, escapeHtml } from './db.js';
import { Auth } from './auth.js';
import { Plans } from './plans.js';
import { Affiliate } from './affiliate.js';
import { Payment } from './payment.js';
import { Signals } from './signals.js';
import { Rewards } from './rewards.js';

// Helper: Clean up nested or duplicate parentheses from bank/method descriptions
export function cleanParentheses(str) {
  if (!str) return '';
  let s = String(str).trim();
  s = s.replace(/Bank Transfer\s*\(\s*Bank Central Asia\s*\(\s*BCA\s*\)\s*\)/gi, 'Transfer Bank BCA');
  s = s.replace(/Bank Transfer\s*\(\s*BCA\s*\)/gi, 'Transfer Bank BCA');
  s = s.replace(/Bank Central Asia\s*\(\s*BCA\s*\)/gi, 'Bank BCA');
  s = s.replace(/Bank Rakyat Indonesia\s*\(\s*BRI\s*\)/gi, 'Bank BRI');
  s = s.replace(/Bank Negara Indonesia\s*\(\s*BNI\s*\)/gi, 'Bank BNI');
  s = s.replace(/Bank Syariah Indonesia\s*\(\s*BSI\s*\)/gi, 'Bank BSI');
  s = s.replace(/\s*\)\s*\)+/g, ')');
  s = s.replace(/\s*\(\s*\(+/g, ' (');
  // If string has unmatched trailing parenthesis, remove excess
  const openCount = (s.match(/\(/g) || []).length;
  const closeCount = (s.match(/\)/g) || []).length;
  if (closeCount > openCount) {
    s = s.replace(/\)+$/, '');
  }
  return s.trim();
}

// Helper: Mask 3 trailing digits of bank/ewallet destination with xxx for privacy & security
export function maskAccountTrailing(acc) {
  if (!acc) return '';
  let str = String(acc).trim();
  str = str.replace(/\s*\((?:XXX|xxx)\)/gi, 'xxx');
  return str.replace(/(?:(TRX-[A-Z0-9-]+)|ID:\s*(\d+)|(\b\d{4,24}\b))/gi, (full, trx, idNum, accNum) => {
    if (trx) return trx;
    if (idNum) return 'ID: ' + idNum;
    if (accNum) {
      if (accNum.length <= 3) return 'xxx';
      return accNum.slice(0, -3) + 'xxx';
    }
    return full;
  });
}

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

  // Best-effort server session verification on boot: silently re-login with cached
  // Best-effort server session verification on boot
  async verifyServerSession() {
    if (typeof fetch !== 'function') return;
    if (!this.isLoggedIn()) return;
    try {
      await DB.ensureServerSession();
    } catch (e) {
      // Offline mode: keep using the local session
    }
  },

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

    // Restore active tab from hash or storage if logged in
    let initialTab = 'home';
    if (this.isLoggedIn()) {
      const hashTab = (window.location.hash || '').replace('#', '').trim();
      const validTabs = ['home', 'markets', 'trade', 'wallet', 'profile'];
      if (hashTab && validTabs.includes(hashTab)) {
        initialTab = hashTab;
      } else {
        const storedTab = (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('autotrading_member_tab')) ||
                          (typeof localStorage !== 'undefined' && localStorage.getItem('autotrading_member_tab'));
        if (storedTab && validTabs.includes(storedTab)) {
          initialTab = storedTab;
        }
      }
    }
    this.currentTab = initialTab;

    // Bind events FIRST so user clicks and navigation are never blocked
    this.bindEvents();

    // Render Initial State safely
    try {
      this.renderAll();
    } catch (err) {
      console.error('Error in App.renderAll():', err);
    }

    if (initialTab !== 'home') {
      this.switchTab(initialTab);
    }
    this.startMarketTicker();
    this.startProfitCountdownLoop();
    this.initAiTradingChart();
    this.verifyServerSession();

    // Auth check listener
    try {
      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function' && !this._authRequiredBound) {
        this._authRequiredBound = true;
        window.addEventListener('autotrading:auth-required', () => {
          // Silent: do not disrupt regular member browsing
        });
      }
    } catch (e) {}

    // Realtime synchronization listener when Admin saves Web Settings
    try {
      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function' && !this._settingsSyncBound) {
        this._settingsSyncBound = true;
        window.addEventListener('autotrading:settings-updated', () => {
          this.renderAll();
        });
      }
    } catch (e) {}

    // Initialize Theme (Dark / Light Mode)
    this.initTheme();

    // Background sync with MySQL (if cPanel API is active)
    DB.initCloudSync(() => this.renderAll());

    // Live background polling (every 7 seconds) for immediate synchronization with Database & Admin actions
    DB.startLivePolling((freshDb) => this.onLiveDbSync(freshDb), 7000);

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


  // Live Background Synchronization Listener (Sync from Admin & MySQL Database)
  onLiveDbSync(freshDb) {
    const dbData = freshDb || DB.get();
    // Realtime update public member & active statistics on every sync cycle
    this.renderPublicWebStats(dbData);

    if (!Auth.isLoggedIn()) {
      const activeEl = document.activeElement;
      const isTyping = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);
      const activeModal = document.querySelector('.modal.active, .modal[style*="display: flex"], .modal[style*="display: block"]');
      if (!isTyping && !activeModal && this.currentTab === 'home') {
        this.renderBannerCarousel();
        this.renderTierCarousel(null, dbData);
        this.renderRunningText();
      }
      return;
    }
    const current = Auth.getUser();
    if (!current) return;

    // Strict status & existence check against fresh database
    if (Array.isArray(freshDb.users) && freshDb.users.length > 0) {
      const freshUser = freshDb.users.find(u => u.id === current.id || (u.username && u.username.toLowerCase() === current.username.toLowerCase()));
      if (!freshUser) {
        Auth.logout();
        this.renderAll();
        return;
      }

      // Check if account status has been blocked / suspended in database
      const isBlocked = freshUser.isBlocked || freshUser.is_blocked || freshUser.status === 'blocked';
      if (isBlocked) {
        alert('PERINGATAN SISTEM: Akun Anda telah dinonaktifkan / dibekukan oleh Administrator.\nAlasan: ' + (freshUser.blockedReason || 'Suspensi administratif') + '\nSilakan hubungi Customer Service untuk informasi lebih lanjut.');
        Auth.logout();
        this.renderAll();
        return;
      }
    }

    // Balance update notification
    const oldBal = Number(current.walletBalance || 0);
    const newBal = Number(freshUser.walletBalance || 0);
    const oldAff = Number(current.affiliateBalance || 0);
    const newAff = Number(freshUser.affiliateBalance || 0);

    if (newBal > oldBal) {
      this.showToast(`Saldo akun bertambah: +${DB.formatIDR(newBal - oldBal)} (Tersinkron dari database)`, 'success');
    }
    if (newAff > oldAff) {
      this.showToast(`Komisi afiliasi bertambah: +${DB.formatIDR(newAff - oldAff)}`, 'info');
    }

    // Render updates if user is not actively typing in an input field
    const activeEl = document.activeElement;
    const isTyping = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);
    const activeModal = document.querySelector('.modal.active, .modal[style*="display: flex"], .modal[style*="display: block"]');

    if (!isTyping && !activeModal) {
      this.renderAll();
    } else {
      this.renderHeader(freshUser);
    }
    this.updateHeaderNotifBadge(freshUser);
    const notifModalEl = document.getElementById('notifModal');
    if (notifModalEl && notifModalEl.classList.contains('show')) {
      this.renderNotificationsUI();
    }
  },

  // Dark / Light Theme Management
  initTheme() {
    let savedTheme = 'dark';
    try {
      savedTheme = localStorage.getItem('autotrading_theme') || 'dark';
    } catch (e) {
      savedTheme = 'dark';
    }
    this.applyTheme(savedTheme, false);
  },

  applyTheme(theme, showNotification = true) {
    const isDark = theme === 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.classList.toggle('theme-dark', isDark);
    if (document.body) {
      document.body.classList.toggle('theme-dark', isDark);
    }

    try {
      localStorage.setItem('autotrading_theme', theme);
    } catch (e) {}

    // Update Header Theme Toggle Button
    const headerBtn = document.getElementById('headerThemeToggleBtn');
    if (headerBtn) {
      const darkIcon = headerBtn.querySelector('.theme-icon-dark');
      const lightIcon = headerBtn.querySelector('.theme-icon-light');
      if (darkIcon && lightIcon) {
        darkIcon.style.display = isDark ? 'none' : 'inline-flex';
        lightIcon.style.display = isDark ? 'inline-flex' : 'none';
      }
      headerBtn.setAttribute('title', isDark ? 'Beralih ke Mode Terang' : 'Beralih ke Mode Gelap');
    }

    // Update Profile Action Theme Button
    const profileLabel = document.getElementById('profileThemeLabel');
    const profileStatus = document.getElementById('profileThemeStatus');
    const profileIcon = document.getElementById('profileThemeIconWrap');
    if (profileLabel) {
      profileLabel.textContent = isDark ? 'Mode Terang' : 'Mode Gelap';
    }
    if (profileStatus) {
      profileStatus.textContent = isDark ? 'Tema gelap aktif' : 'Tema terang aktif';
    }
    if (profileIcon) {
      profileIcon.innerHTML = isDark
        ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`
        : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
    }

    if (showNotification) {
      this.showToast(isDark ? '🌙 Mode Gelap (Dark Mode) aktif' : '☀️ Mode Terang (Light Mode) aktif', 'info');
    }
  },

  toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    this.applyTheme(newTheme, true);
  },

  // Main UI Synchronizer
  renderAll() {
    const user = Auth.getUser();
    const db = DB.get();

    // 0. Synchronize Web Settings, Branding, Logo, & Favicon
    const cfg = db.settings || {};
    const ws = cfg.webSettings || {};
    const seo = cfg.seo || {};
    const social = cfg.social || {};
    const maint = cfg.maintenance || {};
    const appName = cfg.appName || 'AUTOTRADING';
    const tagline = ws.tagline || 'Platform Investasi & AI Trading Mobile Terpercaya';

    // Title & Favicon
    document.title = seo.title || `${appName} - ${tagline}`;
    if (ws.faviconUrl) {
      let link = document.querySelector("link[rel*='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'shortcut icon';
        document.head.appendChild(link);
      }
      link.href = ws.faviconUrl;
    }

    // Dynamic Header Brand Badge & Logo
    const brandBadge = document.querySelector('.header-brand-badge');
    if (brandBadge) {
      if (ws.logoUrl) {
        brandBadge.innerHTML = `
          <img src="${escapeHtml(ws.logoUrl)}" alt="${escapeHtml(appName)}" style="height: 22px; max-width: 100px; object-fit: contain; border-radius: 4px; vertical-align: middle;">
          <span class="header-brand-text" style="margin-left: 6px;">${escapeHtml(appName)}</span>
        `;
      } else {
        brandBadge.innerHTML = `
          <span class="header-brand-icon">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#C89338" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </span>
          <span class="header-brand-text">${escapeHtml(appName)}</span>
        `;
      }
    }

    // Dynamic Theme Primary Color & Typography
    if (ws.colorPrimary) {
      document.documentElement.style.setProperty('--color-primary', ws.colorPrimary);
      document.documentElement.style.setProperty('--gold-primary', ws.colorPrimary);
    }
    if (ws.fontFamily && ws.fontFamily !== 'Inter') {
      document.body.style.fontFamily = `"${ws.fontFamily}", var(--font-main, sans-serif)`;
    }

    // Dynamic Social Links
    if (social.telegram) {
      const el = document.getElementById('socLinkTelegram');
      if (el) el.href = social.telegram;
    }
    if (social.youtube) {
      const el = document.getElementById('socLinkYoutube');
      if (el) el.href = social.youtube;
    }
    if (social.instagram) {
      const el = document.getElementById('socLinkInstagram');
      if (el) el.href = social.instagram;
    }
    if (social.tiktok) {
      const el = document.getElementById('socLinkTiktok');
      if (el) el.href = social.tiktok;
    }

    // Maintenance Mode Check
    this.applyMaintenanceMode(maint, user);

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

    // 1.2 Render Public Web Stats & Device IP Detection (Requirements 6 & 7)
    this.renderPublicWebStats(db);

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

    // 6. Render Autotrading Signal Status
    this.renderSignals();

    // 6.5 Render Rewards Points Carousel (Under Signals Section)
    this.renderRewardsCarousel(user);

    // 6.6 Render Daily Check-in Streak Strip
    this.renderDailyCheckInUI();

    // 6.7 Update Realtime Header Notifications Badge
    this.updateHeaderNotifBadge(user);

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

      // Requirement 8: Qualified Leader badge (e.g. Bronze Leader) on active member status
      const downlines = Affiliate.getDownlines(user.referralCode);
      const leaderRank = downlines ? downlines.leaderRank : null;
      const isLeaderQualified = leaderRank && leaderRank.currentRank && leaderRank.currentRank !== 'Member Reguler';

      let statusBadge = '';
      if (isLeaderQualified) {
        statusBadge = `<span class="badge-member-active-mini badge-leader-qualified" style="background: linear-gradient(135deg, #FEF3C7, #FDE68A); color: #B45309; border: 1px solid #F59E0B; font-weight: 800;">${leaderRank.badge} ${escapeHtml(leaderRank.currentRank)} · 🟢 Aktif</span>`;
      } else if (isMemberActive) {
        statusBadge = `<span class="badge-member-active-mini">🟢 Member Aktif</span>`;
      } else {
        statusBadge = `<span class="badge-member-inactive-mini">⚪ Belum Aktif</span>`;
      }

      greetingEl.innerHTML = `
        <div class="greeting-user-name">Hi, <span class="user-name">${escapeHtml(user.fullName || user.username)}</span></div>
        <div class="greeting-meta-row">
          ${statusBadge}
          <span class="greeting-sponsor-wrap" style="display: inline-flex; align-items: center; gap: 4px;">
            <span style="color: #94A3B8; font-size: 8px;">•</span>
            <span class="greeting-sponsor-text">Sponsor: <strong>${escapeHtml(sponsorName)}</strong></span>
          </span>
        </div>
      `;
      avatarEl.classList.add('logged-in');
      avatarEl.innerHTML = `<span>${escapeHtml((user.username || 'U')[0].toUpperCase())}</span><span class="online-dot"></span>`;
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

    // Always update notification badge in header
    this.updateHeaderNotifBadge(user);
  },

  // 1.2 Public Web Statistics & Device IP Detection (Requirements 6 & 7)
  async renderPublicWebStats(db) {
    const totalEl = document.getElementById('publicTotalMembersCount');
    const activeEl = document.getElementById('publicActiveMembersCount');
    const ipEl = document.getElementById('publicDetectedIpText');
    if (!totalEl && !activeEl && !ipEl) return;

    if (db) {
      const allUsers = (db.users || []).filter(u => u.role !== 'admin');
      const totalCount = allUsers.length;
      if (totalEl) totalEl.textContent = `${totalCount} Member`;

      const activeUserIds = new Set((db.investments || []).filter(inv => inv.status === 'active').map(inv => inv.userId));
      const activeCount = activeUserIds.size > 0 ? activeUserIds.size : allUsers.filter(u => !u.isBlocked && u.status !== 'blocked').length;
      if (activeEl) activeEl.textContent = `${activeCount} Aktif`;
    }

    // Direct Realtime Synchronizer with MySQL Database
    try {
      const res = await fetch('api/?action=public_stats');
      if (res.ok) {
        const sData = await res.json();
        if (sData && sData.success) {
          if (totalEl && typeof sData.totalMembers === 'number') {
            totalEl.textContent = `${sData.totalMembers} Member`;
          }
          if (activeEl && typeof sData.activeMembers === 'number') {
            activeEl.textContent = `${sData.activeMembers} Aktif`;
          }
        }
      }
    } catch (e) {}

    if (ipEl && (!this.detectedClientIp || this.detectedClientIp === 'Mendeteksi IP...')) {
      this.detectClientIp();
    }
  },

  async detectClientIp() {
    const ipEl = document.getElementById('publicDetectedIpText');
    if (!ipEl) return;

    if (this.detectedClientIp && this.detectedClientIp !== 'Mendeteksi IP...') {
      ipEl.textContent = this.detectedClientIp;
      return;
    }

    try {
      const res = await fetch('api/?action=get_ip');
      if (res.ok) {
        const data = await res.json();
        if (data && data.ip && data.ip !== 'UNKNOWN') {
          this.detectedClientIp = data.ip;
          ipEl.textContent = data.ip;
          return;
        }
      }
    } catch (e) {
      // Fallback
    }

    try {
      const res2 = await fetch('https://api.ipify.org?format=json');
      if (res2.ok) {
        const data2 = await res2.json();
        if (data2 && data2.ip) {
          this.detectedClientIp = data2.ip;
          ipEl.textContent = data2.ip;
          return;
        }
      }
    } catch (e) {
      // Fallback
    }

    ipEl.textContent = '180.252.164.72';
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

  // Fullscreen Maintenance Mode Overlay (Allows admin to bypass)
  applyMaintenanceMode(maint, user) {
    let overlay = document.getElementById('frontendMaintenanceOverlay');
    const isMaintenance = maint && maint.enabled === true;
    const isAdmin = user && user.role === 'admin';

    if (isMaintenance && !isAdmin) {
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'frontendMaintenanceOverlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:#0B0F19;z-index:999999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center;color:#fff;font-family:sans-serif;';
        document.body.appendChild(overlay);
      }
      overlay.innerHTML = `
        <div style="max-width:440px;background:#131B2E;border:1px solid #334155;border-radius:20px;padding:32px 24px;box-shadow:0 20px 40px rgba(0,0,0,0.5);">
          <div style="font-size:48px;margin-bottom:12px;">🔧</div>
          <h2 style="font-size:20px;font-weight:800;color:#F59E0B;margin-bottom:10px;">Mode Pemeliharaan Sistem</h2>
          <p style="font-size:13.5px;color:#94A3B8;line-height:1.6;margin-bottom:24px;">${escapeHtml(maint.message || 'Sistem sedang dalam pemeliharaan terjadwal. Kami akan kembali online dalam beberapa saat.')}</p>
          <div style="font-size:11.5px;color:#64748B;border-top:1px solid #1E293B;padding-top:16px;">
            Administrator? <a href="admin.html" style="color:#C89338;text-decoration:none;font-weight:700;">Masuk ke Admin Panel &rarr;</a>
          </div>
        </div>
      `;
      overlay.style.display = 'flex';
    } else if (overlay) {
      overlay.style.display = 'none';
    }
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
      const rate = hasActivePlan ? Plans.getUserTodayProfitRate(user.id) : null;
      if (profitEl) {
        if (!hasActivePlan) {
          // Requirement 1: yang gak aktif tampilan profit berjalan kosong
          profitEl.innerHTML = '<span style="color: #94A3B8; font-weight: 700; font-size: 16px;">-</span>';
          profitEl.title = 'Belum ada paket investasi aktif (Kosong). Aktifkan paket untuk mulai menerima profit harian.';
        } else if (isLossMode) {
          profitEl.innerHTML = '<span style="color: #EF4444; font-weight: 800; font-size: 13px;">0.00%</span><span style="font-size: 9px; color: #EF4444; display: block; font-weight: 700;">(Loss)</span>';
          profitEl.title = 'Mode Loss aktif hari ini (Dividen 0.00%, modal pokok 100% aman)';
        } else if (!marketStatus.isOpen) {
          profitEl.innerHTML = '<span style="color: #EF4444; font-weight: 800; font-size: 13px;">0.00%</span><span style="font-size: 9px; color: #EF4444; display: block; font-weight: 700;">(OFF)</span>';
          profitEl.title = 'Pasar sedang libur / OFF. Dividen profit akan berjalan aktif saat pasar ON.';
        } else {
          // Requirement 1 & 5: Tampilan profit berjalan sesuai paket aktif dan nilai unik member
          const formatted = (rate !== null && rate > 0) ? `+${rate.toFixed(2)}%` : '+0.00%';
          profitEl.innerHTML = `<span style="color: #16A34A; font-weight: 800; font-size: 14px;">${formatted}</span>`;
          profitEl.title = 'Profit dividen harian AI berjalan realtime sesuai paket aktif Anda';
        }
      }
    } else {
      mainBalEl.textContent = 'IDR 0';
      affBalEl.textContent = 'IDR 0';
      pointEl.textContent = '0';
      if (profitEl) {
        // Requirement 1: Bagian luar tulisan kata khusus member ( member )
        profitEl.innerHTML = '<span style="color: #64748B; font-weight: 800; font-size: 11px; line-height: 1.2; display: block;">Khusus Member</span><span style="font-size: 9.5px; font-weight: 700; color: #94A3B8; display: block;">(Member)</span>';
        profitEl.title = 'Fitur profit berjalan khusus member. Silakan login atau daftar akun.';
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

    // Requirement 1: Tampilan profit berjalan hanya di member area, bagian luar "Khusus Member", tidak aktif kosong (-)
    if (weekly.isGuest) {
      if (totalRateEl) totalRateEl.innerHTML = '<span style="font-size: 12px; font-weight: 800; color: #64748B;">Khusus Member</span>';
      if (avgRateEl) avgRateEl.innerHTML = '<span style="font-size: 11px; font-weight: 700; color: #94A3B8;">(Member)</span>';
      if (statusPillEl) {
        statusPillEl.textContent = '🔒 Khusus Member (Member)';
        statusPillEl.className = 'badge-status-pill neutral';
      }
    } else if (!weekly.hasActivePackage) {
      if (totalRateEl) totalRateEl.textContent = '-';
      if (avgRateEl) avgRateEl.textContent = '-';
      if (statusPillEl) {
        statusPillEl.textContent = '○ Belum Ada Paket Aktif';
        statusPillEl.className = 'badge-status-pill neutral';
      }
    } else {
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
          statusPillEl.textContent = `🟡 Hari Ini: +${todayRate.toFixed(2)}% (Progress)`;
          statusPillEl.className = 'badge-status-pill in-progress';
        }
      }
    }

    // Requirements 10 & 11: Active Member Notice & Today's Profit Nominal
    const activeNoticeEl = document.getElementById('weeklyActiveMemberNotice');
    const todayNominalEl = document.getElementById('weeklyTodayProfitNominal');
    if (activeNoticeEl) {
      if (!weekly.isGuest && weekly.hasActivePackage) {
        activeNoticeEl.style.display = 'block';
        if (todayNominalEl) {
          const activeInvs = Plans.getUserInvestments(user.id);
          const pending = activeInvs.reduce((sum, inv) => sum + (inv.pendingProfitClaim || 0), 0);
          let todayNominal = pending;
          if (todayNominal <= 0) {
            const todayRate = Plans.getUserTodayProfitRate(user.id);
            const totalCap = activeInvs.reduce((sum, inv) => sum + (inv.capital || 0), 0);
            todayNominal = Math.floor((totalCap * (todayRate || 0)) / 100);
          }
          todayNominalEl.textContent = DB.formatIDR(todayNominal);
        }
      } else {
        activeNoticeEl.style.display = 'none';
      }
    }

    if (container && Array.isArray(weekly.records)) {
      const cardsHtml = weekly.records.map((rec) => {
        let cardClass = 'weekly-day-card';
        if (rec.isToday) cardClass += ' today';
        if (rec.isLoss) cardClass += ' loss';
        if (rec.isWeekend) cardClass += ' weekend-off';
        if (rec.isPast) cardClass += ' past-done';
        if (rec.isFuture) cardClass += ' future-day';
        if (rec.isGuest) cardClass += ' guest-day';
        if (!rec.isGuest && !rec.hasActivePackage) cardClass += ' empty-day';

        const dayLabel = rec.isToday ? 'Hari Ini' : rec.dayName.substring(0, 3);
        const displayRate = rec.displayRate;
        const pillText = rec.pillText;

        return `
          <div class="${cardClass}" title="${rec.dayName} (${rec.date}): ${rec.statusLabel}">
            <span class="weekly-day-name">${dayLabel}</span>
            <span class="weekly-day-date">${rec.date}</span>
            <div class="weekly-day-rate">${displayRate}</div>
            <span class="weekly-day-pill ${rec.pillClass || ''}">${pillText}</span>
          </div>
        `;
      }).join('');

      let bannerNoticeHtml = '';
      if (weekly.isGuest) {
        bannerNoticeHtml = `
          <div class="weekly-guest-lock-banner" onclick="App.openAuthModalWithTab('login')">
            <span style="font-size: 16px;">⚡</span>
            <div style="flex: 1;">
              <strong style="color: #92400E; font-size: 11.5px; display: block;">Algoritma Auto Trading Aktif</strong>
              <p style="color: #B45309; font-size: 10px; margin: 2px 0 0 0; line-height: 1.3;">Bergabung & aktifkan paket investasi untuk mulai menikmati profit otomatis harian. Klik untuk <strong>Login / Daftar</strong>.</p>
            </div>
            <span style="font-size: 11px; font-weight: 800; color: #C89338;">Mulai Sekarang ›</span>
          </div>
        `;
      } else if (!weekly.hasActivePackage) {
        bannerNoticeHtml = `
          <div class="weekly-no-plan-banner" onclick="document.getElementById('tierCarouselContainer').scrollIntoView({ behavior: 'smooth' })">
            <span style="font-size: 16px;">📦</span>
            <div style="flex: 1;">
              <strong style="color: #0F172A; font-size: 11.5px; display: block;">Paket Investasi Belum Aktif</strong>
              <p style="color: #64748B; font-size: 10px; margin: 2px 0 0 0; line-height: 1.3;">
                Aktifkan salah satu paket investasi di bawah untuk mulai menerima bagi hasil harian otomatis setiap hari bursa.
              </p>
            </div>
            <span style="font-size: 11px; font-weight: 800; color: #C89338;">Pilih Paket ›</span>
          </div>
        `;
      }

      container.innerHTML = cardsHtml + bannerNoticeHtml;
    }

    // Requirements 3 & 5: Weekly AI Algorithm calculation banner update
    const aiBannerTextEl = document.getElementById('weeklyAiBannerText');
    if (aiBannerTextEl) {
      let rateBadgeHtml = '';
      if (weekly.isGuest) {
        rateBadgeHtml = '<strong class="weekly-ai-rate-highlight" style="color:#C89338;">( khusus member )</strong>';
      } else if (!weekly.hasActivePackage) {
        rateBadgeHtml = '<strong class="weekly-ai-rate-highlight" style="color:#94A3B8;">-</strong>';
      } else {
        let pctStr = '8,8%';
        if (typeof weekly.totalRate === 'number' && weekly.totalRate > 0) {
          pctStr = `${weekly.totalRate.toFixed(1).replace('.', ',')}%`;
        }
        rateBadgeHtml = `<strong class="weekly-ai-rate-highlight">${pctStr}</strong>`;
      }
      aiBannerTextEl.innerHTML = `Algoritma Ai aktif menghitung 1 minggu bagi hasil adalah sebesar : ${rateBadgeHtml} ( by sistem sama angka 7 hari ) untuk Anda. masing2 berbeda hasil permingu perakunnya sesuai sistem laporan harian`;
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
    if (this._isClaimingProfit) return;
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
        claimBtn.classList.remove('claimed-today', 'live-active');
        claimBtn.removeAttribute('disabled');
        claimBtn.disabled = false;
        claimBtn.style.opacity = '1';
        claimBtn.innerHTML = `<span>Mulai Investasi Paket AI</span>`;
        claimBtn.onclick = () => {
          const planSection = document.querySelector('.tier-carousel-container');
          if (planSection) planSection.scrollIntoView({ behavior: 'smooth' });
        };
      }
      return;
    }

    // Helper to safely parse dates across browsers/platforms
    const parseSafeTs = (dStr) => {
      if (!dStr) return 0;
      if (typeof dStr === 'number') return dStr;
      const s = String(dStr).trim().replace(' ', 'T');
      const d = new Date(s);
      const ts = d.getTime();
      return isNaN(ts) ? 0 : ts;
    };

    const db = DB.get();
    const todayWib = DB.getWibDateStr();
    const now = Date.now();

    // Check if user has already claimed profit today
    const todayClaimTx = (db.transactions || []).find(t => {
      if (t.userId !== user.id) return false;
      const isPrf = t.type === 'profit_claim' || (t.id && String(t.id).startsWith('TRX-PRF-'));
      if (!isPrf) return false;
      return DB.getWibDateStr(t.createdAt) === todayWib;
    });

    const todayClaimInv = userInvs.find(inv => {
      return inv.lastProfitYieldDate && DB.getWibDateStr(inv.lastProfitYieldDate) === todayWib;
    });

    const hasClaimedToday = Boolean(todayClaimTx || (todayClaimInv && totalPendingProfit <= 0));

    // Check weekend market status
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
        claimBtn.classList.remove('live-active');
        claimBtn.classList.add('claimed-today');
        claimBtn.setAttribute('disabled', 'true');
        claimBtn.disabled = true;
        claimBtn.innerHTML = `<span>Pasar Libur Akhir Pekan (Sabtu & Minggu)</span>`;
      }
      return;
    }

    const cycleDurationMs = 24 * 3600 * 1000;

    // SCENARIO 1: User has already claimed profit today -> Count down until the next 24-hour cycle
    if (hasClaimedToday) {
      let claimTs = 0;
      if (todayClaimTx && todayClaimTx.createdAt) {
        claimTs = parseSafeTs(todayClaimTx.createdAt);
      }
      if (!claimTs && todayClaimInv && todayClaimInv.lastProfitYieldDate) {
        claimTs = parseSafeTs(todayClaimInv.lastProfitYieldDate);
      }
      if (!claimTs) {
        // Fallback: cycle anchor
        const midToday = new Date();
        midToday.setHours(0, 0, 0, 0);
        claimTs = midToday.getTime();
      }

      const elapsed = Math.max(0, now - claimTs);
      const remainingMs = Math.max(0, cycleDurationMs - elapsed);
      const percent = Math.min(100, Math.max(0, (elapsed / cycleDurationMs) * 100));

      const hours = Math.floor(remainingMs / 3600000);
      const minutes = Math.floor((remainingMs % 3600000) / 60000);
      const seconds = Math.floor((remainingMs % 60000) / 1000);
      const timeFormatted = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

      const nextDate = new Date(claimTs + cycleDurationMs);
      const hourStr = String(nextDate.getHours()).padStart(2, '0');
      const minStr = String(nextDate.getMinutes()).padStart(2, '0');

      if (remainingMs > 0) {
        // Within active 24h wait period
        if (statusTitleEl) statusTitleEl.textContent = 'Sudah Diklaim (Waktu Tunggu 24 Jam):';
        if (timerValEl) {
          timerValEl.textContent = timeFormatted;
          timerValEl.style.color = '#38BDF8';
        }
        if (percentBadgeEl) {
          percentBadgeEl.textContent = `${Math.round(percent)}%`;
          percentBadgeEl.style.background = 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)';
          percentBadgeEl.style.boxShadow = '0 0 10px rgba(56, 189, 248, 0.4)';
        }
        if (progressBarEl) {
          progressBarEl.style.width = `${Math.max(6, Math.round(percent))}%`;
          progressBarEl.style.background = 'linear-gradient(90deg, #0284C7 0%, #38BDF8 60%, #22C55E 100%)';
          progressBarEl.style.boxShadow = '0 0 10px rgba(56, 189, 248, 0.5)';
        }
        if (footerHintEl) footerHintEl.textContent = 'Klaim profit harian Anda telah berhasil. Waktu tunggu 24 jam sedang berjalan menuju siklus klaim berikutnya.';
        if (nextYieldEl) nextYieldEl.textContent = `Siklus: ${hourStr}:${minStr} WIB`;

        if (claimBtn) {
          claimBtn.classList.remove('live-active');
          claimBtn.classList.add('claimed-today');
          claimBtn.setAttribute('disabled', 'true');
          claimBtn.disabled = true;
          claimBtn.onclick = null;
          claimBtn.innerHTML = `<span><i class="fas fa-clock" style="margin-right:6px;"></i> Sudah Diklaim (Tunggu ${timeFormatted})</span>`;
          claimBtn.style.opacity = '0.75';
        }
        return;
      }
      // If remainingMs === 0, 24 hours have elapsed: drops through to ready-to-claim below!
    }

    // SCENARIO 2: Ready to Claim (either totalPendingProfit > 0, or 24-hour cycle completed)
    if (totalPendingProfit > 0) {
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
        claimBtn.classList.remove('claimed-today');
        claimBtn.classList.add('live-active');
        claimBtn.removeAttribute('disabled');
        claimBtn.disabled = false;
        claimBtn.onclick = () => App.claimProfit();
        claimBtn.innerHTML = `<span>⚡ Klaim Profit Harian (${DB.formatIDR(totalPendingProfit)})</span>`;
      }
      return;
    }

    // SCENARIO 3: Active plan running cycle (not claimed today yet)
    let lastYieldTime = 0;
    userInvs.forEach(inv => {
      const time = parseSafeTs(inv.lastProfitYieldDate) || parseSafeTs(inv.startDate);
      if (time > lastYieldTime) lastYieldTime = time;
    });

    if (!lastYieldTime) lastYieldTime = now - 3600000;

    let elapsed = now - lastYieldTime;
    if (elapsed < 0) elapsed = 0;

    if (elapsed >= cycleDurationMs) {
      // 24 Hours cycle finished -> Button becomes alive ("hidup lagi kalau sudah 24jam waktu mau klaim")
      if (statusTitleEl) statusTitleEl.textContent = 'Profit Siap Diklaim:';
      if (timerValEl) {
        timerValEl.textContent = 'SIAP KLAIM';
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
      if (footerHintEl) footerHintEl.textContent = 'Siklus 24 jam selesai. Klik tombol di bawah untuk klaim profit harian.';
      if (nextYieldEl) nextYieldEl.textContent = 'Siap Klaim';

      if (claimBtn) {
        claimBtn.classList.remove('claimed-today');
        claimBtn.classList.add('live-active');
        claimBtn.removeAttribute('disabled');
        claimBtn.disabled = false;
        claimBtn.onclick = () => App.claimProfit();
        claimBtn.innerHTML = `<span>⚡ Klaim Profit Harian</span>`;
      }
    } else {
      // Countdown running
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
        claimBtn.classList.remove('claimed-today', 'live-active');
        claimBtn.disabled = true;
        claimBtn.setAttribute('disabled', 'true');
        claimBtn.innerHTML = `<span>Proses Profit Berjalan (${timeFormatted})</span>`;
        claimBtn.style.opacity = '0.85';
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

  // 6. Autotrading Signal Status Feed (Members Only & Max 4 Signals)
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
          <p class="vip-lock-desc">Sinyal trading akurasi tinggi Autotrading Signal Status hanya dapat diakses oleh member yang sudah login. Masuk atau daftar akun Anda sekarang untuk melihat 4 sinyal aktif.</p>
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
    if (!Auth.isLoggedIn()) {
      this.showToast('Fitur testimoni khusus untuk member terdaftar. Silakan login atau daftar akun terlebih dahulu!', 'info');
      this.openAuthModalWithTab('login');
      return;
    }
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

    const db = DB.get();
    const realApprovedWd = (db.transactions || []).filter(t => t.type === 'withdraw' && t.status === 'approved').length;
    if (totalCountBadge) {
      totalCountBadge.textContent = realApprovedWd > 0 ? `${realApprovedWd}` : '0';
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

    // Update WD Button Status on Wallet Page (Point 7)
    const wdStatus = Payment.isWithdrawOpen();
    const btnWdEl = document.getElementById('walletPageBtnWithdraw');
    if (btnWdEl) {
      if (!wdStatus.isOpen) {
        btnWdEl.innerHTML = '<span>🔒 Tarik Dana (OFF)</span>';
        btnWdEl.style.opacity = '0.75';
      } else {
        btnWdEl.innerHTML = '<span>Tarik Dana</span>';
        btnWdEl.style.opacity = '1';
      }
    }

    const txs = (Payment.getUserTransactions(user.id) || []).slice().sort((a, b) => {
      const tA = new Date(a.createdAt || a.date || 0).getTime();
      const tB = new Date(b.createdAt || b.date || 0).getTime();
      return tB - tA;
    });
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

    let txs = (this.cachedWalletTransactions || []).slice().sort((a, b) => {
      const tA = new Date(a.createdAt || a.date || 0).getTime();
      const tB = new Date(b.createdAt || b.date || 0).getTime();
      return tB - tA;
    });
    if (filterType === 'profit_claim') {
      txs = txs.filter(t => t.type === 'profit_claim' || (t.id && t.id.startsWith('TRX-PRF-')));
    } else if (filterType === 'rabat_bonus') {
      txs = txs.filter(t => t.type === 'rabat_bonus' || (t.id && t.id.startsWith('TRX-RBT-')));
    } else if (filterType === 'sponsor_bonus') {
      txs = txs.filter(t => t.type === 'sponsor_bonus' || (t.id && t.id.startsWith('TRX-SPS-')) || t.type === 'leader_bonus' || (t.id && t.id.startsWith('TRX-LDR-')));
    } else if (filterType === 'dep_wd') {
      txs = txs.filter(t => t.type === 'deposit' || t.type === 'withdraw' || t.type === 'invest_plan' || (t.id && t.id.startsWith('TRX-INV-')) || t.type === 'affiliate_transfer' || t.type === 'ppob_conversion' || (t.id && t.id.startsWith('TRX-POB-')));
    }

    if (txs.length === 0) {
      txListEl.innerHTML = '<div style="text-align:center; padding:20px; color:#94A3B8; font-size:12px;">Tidak ada riwayat transaksi pada kategori ini.</div>';
      return;
    }

    txListEl.innerHTML = txs.map(t => {
      let title = t.paymentMethod || t.type;
      let badgeHtml = '';
      let isInvest = t.type === 'invest_plan' || (t.id && t.id.startsWith('TRX-INV-'));
      let isPlus = !isInvest && (t.type === 'deposit' || t.type === 'bonus' || t.type === 'reward' || t.type === 'profit_claim' || t.type === 'sponsor_bonus' || t.type === 'rabat_bonus' || t.type === 'leader_bonus' || (t.id && t.id.startsWith('TRX-LDR-')) || t.type === 'capital_return');
      let amountColor = isPlus ? '#16A34A' : '#DC2626';
      let sign = isPlus ? '+' : '-';
      let noteText = t.note || '';

      if (isInvest) {
        title = 'Pembelian Paket Investasi';
        badgeHtml = '<span class="tx-detail-badge tx-badge-wd" style="background:#FEE2E2; color:#B91C1C; border-color:#FCA5A5;">INVESTASI</span>';
        if (!noteText) noteText = `Aktivasi paket ${t.planName || ''} · ID: ${t.id}`;
      } else if (t.type === 'profit_claim' || (t.id && t.id.startsWith('TRX-PRF-'))) {
        title = 'Klaim Profit Harian AI';
        badgeHtml = '<span class="tx-detail-badge tx-badge-profit">KLAIM PROFIT</span>';
        if (!noteText) noteText = `Profit harian trading AI`;
      } else if (t.type === 'rabat_bonus' || (t.id && t.id.startsWith('TRX-RBT-'))) {
        const lvl = t.level || 1;
        title = `Bonus Rabat Matching (Level ${lvl})`;
        badgeHtml = `<span class="tx-detail-badge tx-badge-rabat">RABAT L${lvl}</span>`;
      } else if (t.type === 'sponsor_bonus' || (t.id && t.id.startsWith('TRX-SPS-'))) {
        title = 'Bonus Sponsor Langsung (Level 1)';
        badgeHtml = '<span class="tx-detail-badge tx-badge-sponsor">SPONSOR L1</span>';
      } else if (t.type === 'leader_bonus' || (t.id && t.id.startsWith('TRX-LDR-'))) {
        title = 'Bonus Target Kepemimpinan Tim';
        badgeHtml = '<span class="tx-detail-badge tx-badge-sponsor" style="background:linear-gradient(135deg, #FEF3C7, #FDE68A); color:#B45309; border-color:#F59E0B;">🏆 TARGET TIM</span>';
        if (!noteText) noteText = 'Bonus pencapaian target omset tim (Masuk Saldo Utama)';
      } else if (t.type === 'bonus' || t.type === 'reward') {
        const rawBonus = t.paymentMethod || 'Bonus';
        const cleanBonus = cleanParentheses(rawBonus);
        if (cleanBonus.includes('Absensi') || (t.id && t.id.startsWith('TX-CHK'))) {
          title = 'Bonus Absensi Harian';
          badgeHtml = '<span class="tx-detail-badge tx-badge-profit">BONUS ABSEN</span>';
        } else {
          title = 'Bonus Saldo';
          badgeHtml = '<span class="tx-detail-badge tx-badge-profit">BONUS</span>';
        }
        if (!noteText) noteText = `${cleanBonus} · ID: ${t.id}`;
      } else if (t.type === 'deposit') {
        const rawMethod = t.paymentMethod || 'Transfer';
        const cleanMethod = cleanParentheses(rawMethod);
        if (cleanMethod.includes('Absensi') || (t.id && t.id.startsWith('TX-CHK'))) {
          title = 'Bonus Absensi Harian';
          badgeHtml = '<span class="tx-detail-badge tx-badge-profit">BONUS ABSEN</span>';
          if (!noteText) noteText = `${cleanMethod} · ID: ${t.id}`;
        } else if (cleanMethod.includes('Learn') || cleanMethod.includes('Hari')) {
          title = `Investasi ${cleanMethod}`;
          badgeHtml = '<span class="tx-detail-badge tx-badge-dep">INVESTASI</span>';
          if (!noteText) noteText = `Paket: ${cleanMethod} · ID: ${t.id}`;
        } else {
          title = `Deposit Saldo - ${cleanMethod}`;
          badgeHtml = '<span class="tx-detail-badge tx-badge-dep">DEPOSIT</span>';
          if (!noteText) noteText = `Metode: ${cleanMethod} · ID: ${t.id}`;
        }
      } else if (t.type === 'withdraw') {
        title = 'Penarikan Dana (WD)';
        badgeHtml = '<span class="tx-detail-badge tx-badge-wd">WITHDRAW</span>';
        const rawBank = t.destinationAccount || t.bankName || t.paymentMethod || 'Rekening Member';
        const cleanBank = cleanParentheses(rawBank);
        const maskedBank = maskAccountTrailing(cleanBank);
        const maskedAccNo = t.accountNumber ? ` · ${maskAccountTrailing(t.accountNumber)}` : '';
        let wdDest = maskedBank;
        if (maskedAccNo && !maskedBank.includes('xxx') && !/\d{4,}/.test(cleanBank)) {
          wdDest += maskedAccNo;
        }
        if (!noteText) {
          noteText = `Tujuan: ${wdDest} · ID: ${t.id}`;
        } else {
          noteText = maskAccountTrailing(noteText);
        }
      } else if (t.type === 'affiliate_transfer') {
        title = 'Transfer Saldo Komisi';
        badgeHtml = '<span class="tx-detail-badge tx-badge-sponsor">TRANSFER</span>';
      } else if (t.type === 'capital_return') {
        title = 'Pengembalian Modal Kontrak Selesai';
        badgeHtml = '<span class="tx-detail-badge tx-badge-return">MODAL KEMBALI</span>';
      } else if (t.type === 'ppob_conversion' || (t.id && t.id.startsWith('TRX-POB-'))) {
        const isPln = t.category === 'pln' || (t.note && t.note.toLowerCase().includes('listrik'));
        title = isPln ? 'Konversi Token Listrik PLN' : 'Konversi Pulsa Seluler';
        badgeHtml = '<span class="tx-detail-badge tx-badge-wd" style="background:#FEF3C7; color:#B45309; border-color:#F59E0B;">PPOB</span>';
        if (!noteText) {
          noteText = isPln ? `Token Listrik (No. Meter: ${t.targetNumber || '-'})` : `Pulsa (No. HP: ${t.targetNumber || '-'})`;
        }
      }

      const dateStr = DB.formatWibDateTime(t.createdAt);
      let statusClass = t.status === 'approved' ? 'approved' : (t.status === 'rejected' ? 'rejected' : 'pending');
      let statusLabel = t.status === 'approved' ? 'SUKSES' : (t.status === 'rejected' ? 'DITOLAK' : 'DIPROSES');

      const isPpob = t.type === 'ppob_conversion' || (t.id && t.id.startsWith('TRX-POB-'));
      const isPlnItem = isPpob && (t.category === 'pln' || (t.note && t.note.toLowerCase().includes('listrik')));
      const txIcon = isPpob ? (isPlnItem ? '⚡' : '📱') : (t.type === 'profit_claim' ? '📈' : (t.type === 'rabat_bonus' ? '👥' : (t.type === 'sponsor_bonus' ? '🎁' : ((t.type === 'leader_bonus' || (t.id && t.id.startsWith('TRX-LDR-'))) ? '🏆' : (isPlus ? '↓' : '↑')))));

      return `
        <div style="background:#FFFFFF; border-radius:14px; padding:12px 14px; box-shadow:var(--card-shadow); border:1px solid #F1F5F9; display:flex; align-items:center; justify-content:space-between; gap:10px;">
          <div style="display:flex; align-items:center; gap:10px; flex:1; min-width:0;">
            <div style="width:38px; height:38px; border-radius:12px; background:${isPlus ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)'}; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
              <span style="font-size:16px;">${txIcon}</span>
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
                ${dateStr} WIB · <span class="badge-status ${statusClass}" style="font-size:8.5px; padding:1px 6px;">${statusLabel}</span> ${t.rejectReason ? `<span style="color:#EF4444; font-size:9.5px; margin-left:4px;">(${t.rejectReason})</span>` : ''}
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

  // Render Trade View Page (with Enhanced Detail Box Cards & AI Chart)
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
      const daysRemaining = Math.max(0, duration - daysElapsed);
      const progressPercent = Math.min(100, Math.max(0, Math.round((daysElapsed / duration) * 100)));
      const rateRange = Plans.getRateRange(inv);

      return `
        <div class="trade-plan-card ${isActive ? '' : 'completed'}">
          <div class="trade-plan-header">
            <div class="trade-plan-title-group">
              <div class="trade-plan-icon">
                <i class="fas fa-microchip"></i>
              </div>
              <div>
                <div class="trade-plan-name">Paket ${inv.planName}</div>
                <div class="trade-plan-sub-id">ID: #${inv.id || 'INV'} • Durasi Total: ${duration} Hari</div>
              </div>
            </div>
            <span class="badge-status ${isActive ? 'approved' : 'rejected'}">
              ${isActive ? `AKTIF` : `SELESAI`}
            </span>
          </div>

          <div class="trade-plan-grid">
            <!-- Kotak Awal -->
            <div class="trade-plan-box-item box-modal-awal">
              <div class="trade-plan-box-label"><i class="fas fa-wallet" style="color:#1D4ED8;"></i> Awal :</div>
              <div class="trade-plan-box-value">${DB.formatIDR(inv.capital)}</div>
            </div>

            <!-- Kotak Rentang Profit -->
            <div class="trade-plan-box-item box-profit-range">
              <div class="trade-plan-box-label"><i class="fas fa-chart-line" style="color:#047857;"></i> Rentang Profit :</div>
              <div class="trade-plan-box-value highlight-green">${rateRange.min}% - ${rateRange.max}%</div>
            </div>

            <!-- Kotak Profit -->
            <div class="trade-plan-box-item box-total-profit">
              <div class="trade-plan-box-label"><i class="fas fa-coins" style="color:#B45309;"></i> Profit :</div>
              <div class="trade-plan-box-value highlight-gold">${DB.formatIDR(inv.totalProfitEarned || 0)}</div>
            </div>

            <!-- Kotak Tersisa -->
            <div class="trade-plan-box-item box-days-remaining">
              <div class="trade-plan-box-label"><i class="fas fa-hourglass-half" style="color:#0369A1;"></i> Tersisa :</div>
              <div class="trade-plan-box-value highlight-blue">
                <span class="trade-plan-remaining-badge">${daysRemaining} Hari</span>
              </div>
            </div>

            <!-- Kotak Status (Full Width) -->
            <div class="trade-plan-box-item full-width box-contract-status">
              <div class="trade-plan-box-label"><i class="fas fa-shield-alt" style="color:#7E22CE;"></i> Status :</div>
              <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:6px;">
                <span class="trade-plan-status-badge">
                  ${isActive ? '<span class="pulse-dot-green"></span> Progressnya berlangsung sesuai kontrak' : '✓ Selesai sesuai kontrak'}
                </span>
                <span style="font-size:11px; color:#581C87; font-weight:700;">Hari ke-${daysElapsed} dari ${duration} (${progressPercent}%)</span>
              </div>
            </div>
          </div>

          <!-- Progress Bar Micro Line -->
          <div class="active-plan-progress-wrap" style="margin-top:2px;">
            <div class="active-plan-progress-track">
              <div class="active-plan-progress-bar" style="width: ${Math.max(4, progressPercent)}%;"></div>
            </div>
          </div>

          ${isActive && inv.pendingProfitClaim > 0 ? `
            <div style="display:flex; justify-content:space-between; align-items:center; background:#DCFCE7; border:1px solid #86EFAC; padding:10px 14px; border-radius:12px; margin-top:2px;">
              <div>
                <div style="font-size:10.5px; font-weight:700; color:#15803D;">Profit Siap Diklaim:</div>
                <div style="font-size:14px; font-weight:800; color:#166534;">${DB.formatIDR(inv.pendingProfitClaim)}</div>
              </div>
              <button class="tier-btn btn-topup" onclick="App.claimProfit()">Klaim Sekarang</button>
            </div>
          ` : ''}

          ${!isActive ? `
            <div style="font-size:11.5px; color:#059669; font-weight:700; background:#ECFDF5; padding:10px 12px; border-radius:12px; text-align:center; display:flex; justify-content:space-between; align-items:center; margin-top:2px;">
              <span>✓ Durasi ${inv.durationDays} hari selesai.${!inv.capitalReturned ? ` Modal Rp ${DB.formatIDR(inv.capital)} tersimpan di Saldo Terlock.` : ` Modal Rp ${DB.formatIDR(inv.capital)} telah direfund.`}</span>
              ${!inv.capitalReturned ? `<button class="tier-btn btn-topup" style="padding:4px 8px; font-size:10.5px;" onclick="App.openRefundModal()">Klaim Refund</button>` : ''}
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

    // Member Active status badge (Requirement 8: Show qualified rank e.g. Bronze Leader)
    const activePlans = Plans.getUserInvestments(user.id);
    const isMemberActive = activePlans.length > 0;
    const downlines = Affiliate.getDownlines(user.referralCode);
    const leaderRank = downlines ? downlines.leaderRank : null;
    const isLeaderQualified = leaderRank && leaderRank.currentRank && leaderRank.currentRank !== 'Member Reguler';
    const statusBadgeEl = document.getElementById('profileMemberStatusBadge');
    if (statusBadgeEl) {
      if (isLeaderQualified) {
        statusBadgeEl.className = 'badge-member-active badge-leader-qualified';
        statusBadgeEl.innerHTML = `<span style="display:inline-flex; align-items:center; gap:5px;"><span>${leaderRank.badge}</span> <strong>${escapeHtml(leaderRank.currentRank)}</strong> · 🟢 Member Aktif</span>`;
      } else if (isMemberActive) {
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

    // Requirement 2: Bind Social Media links in Profile
    const db = DB.get();
    const soc = (db.settings && db.settings.social) || {};
    const teleEl = document.getElementById('socLinkTelegram');
    if (teleEl && soc.telegram) teleEl.href = soc.telegram;
    const ytEl = document.getElementById('socLinkYoutube');
    if (ytEl && soc.youtube) ytEl.href = soc.youtube;
    const igEl = document.getElementById('socLinkInstagram');
    if (igEl && soc.instagram) igEl.href = soc.instagram;
    const ttEl = document.getElementById('socLinkTiktok');
    if (ttEl && soc.tiktok) ttEl.href = soc.tiktok;

    // Downline stats & Level Bonus Recap (Requirements 2 & 3)
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

    // Leader Milestone / Ranking (Level & Network Progression)
    const lRank = downlines.leaderRank || (typeof Affiliate !== 'undefined' && Affiliate.getLeaderRank ? Affiliate.getLeaderRank(downlines.totalTeamTurnover) : null);
    if (lRank) {
      const lrIcon = document.getElementById('affLeaderRankIcon');
      const lrTitle = document.getElementById('affLeaderRankTitle');
      const lrReward = document.getElementById('affLeaderRewardTag');
      const lrProgCur = document.getElementById('affLeaderProgCur');
      const lrProgTarget = document.getElementById('affLeaderProgTarget');
      const lrProgressBar = document.getElementById('affLeaderProgressBar');
      const lrNextLabel = document.getElementById('affLeaderNextRankLabel');
      const lrPercent = document.getElementById('affLeaderProgPercent');

      if (lrIcon) lrIcon.textContent = lRank.badge;
      if (lrTitle) lrTitle.textContent = lRank.currentRank;
      if (lrReward) lrReward.textContent = lRank.reward > 0 ? `✓ Bonus: ${DB.formatIDR(lRank.reward)} (Masuk Saldo Utama)` : 'Target Terbuka';
      if (lrProgCur) lrProgCur.textContent = `Omset: ${DB.formatIDR(downlines.totalTeamTurnover)}`;
      if (lrProgTarget) lrProgTarget.textContent = `Target: ${DB.formatIDR(lRank.nextTurnoverRequired)}`;
      if (lrProgressBar) lrProgressBar.style.width = `${lRank.progressPct}%`;
      if (lrNextLabel) lrNextLabel.textContent = `Menuju: ${lRank.nextRank}`;
      if (lrPercent) lrPercent.textContent = `${lRank.progressPct}%`;
    }

    // Render tombol klaim target kepemimpinan (Sistem Klaim Manual ke Saldo Utama)
    const claimWrap = document.getElementById('affLeaderClaimActionWrap');
    if (claimWrap) {
      const milestonesStatus = downlines.milestonesStatus || [];
      const claimable = milestonesStatus.filter(m => m.canClaim);
      if (claimable.length > 0) {
        claimWrap.innerHTML = claimable.map(m => `
          <button type="button" class="btn-cta-gold" style="width: 100%; margin: 4px 0; padding: 10px 14px; background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%); animation: pulse 2s infinite; font-size: 11.5px; font-weight: 800; display: flex; align-items: center; justify-content: center; gap: 8px;" onclick="App.claimLeaderBonus('${escapeHtml(m.name)}')">
            <span>${m.badge} Klaim Bonus Target ${escapeHtml(m.name)} (${DB.formatIDR(m.reward)})</span>
          </button>
        `).join('');
      } else {
        const reached = milestonesStatus.filter(m => m.isReached);
        if (reached.length > 0 && reached.every(m => m.isClaimed)) {
          claimWrap.innerHTML = `
            <div style="background: rgba(34, 197, 94, 0.15); border: 1px solid rgba(34, 197, 94, 0.3); border-radius: 10px; padding: 8px 12px; font-size: 11px; color: #86EFAC; text-align: center; font-weight: 700;">
              ✅ Semua target peringkat yang tercapai telah diklaim ke Saldo Utama!
            </div>
          `;
        } else {
          claimWrap.innerHTML = '';
        }
      }
    }

    // Update dynamic affiliate commission & rabat level descriptions (Requirement 1)
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
            <span>${escapeHtml(m.username)}</span>
            <span style="font-size:11px; color:#64748B; font-weight:500;">(${escapeHtml(m.fullName || '-')})</span>
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
      if (res.isDuplicateBank) {
        this.openSecurityWarningModal('Peringatan Rekening Ganda Ditolak', res.message);
      }
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

  async saveChangePassword() {
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

    const res = await Auth.changePassword(user.id, oldPass, newPass);
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
    const validTabs = ['home', 'markets', 'trade', 'wallet', 'profile'];
    if (!validTabs.includes(tabId)) tabId = 'home';

    if (tabId !== 'home' && !this.isLoggedIn()) {
      this.showToast('Fitur ini khusus untuk member terdaftar. Silakan login atau daftar akun terlebih dahulu!', 'info');
      this.openAuthModalWithTab('login');
      return;
    }

    this.currentTab = tabId;

    try {
      if (typeof window !== 'undefined' && window.location) {
        if (window.location.hash !== `#${tabId}`) {
          history.replaceState(null, '', `#${tabId}`);
        }
      }
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('autotrading_member_tab', tabId);
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('autotrading_member_tab', tabId);
      }
    } catch (e) {}

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
    const publicModals = ['authModal', 'forgotPasswordModal', 'emailOtpModal', 'imagePreviewModal', 'announcementModal'];
    if (modalId === 'notifModal' && !this.isLoggedIn()) {
      this.showToast('Fitur notifikasi khusus untuk member terdaftar. Silakan login atau daftar akun terlebih dahulu!', 'info');
      this.openAuthModalWithTab('login');
      return;
    }
    if (!publicModals.includes(modalId) && !this.isLoggedIn()) {
      if (modalId === 'supportModal') {
        this.showToast('Silahkan login untuk hubungi CS', 'warning');
      } else {
        this.showToast('Fitur ini khusus untuk member terdaftar. Silakan login atau daftar akun terlebih dahulu!', 'info');
      }
      this.openAuthModalWithTab('login');
      return;
    }
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('show');
      document.body.style.overflow = 'hidden';
      if (modalId === 'notifModal') {
        const user = Auth.getUser();
        if (user) {
          const notifs = this.getUserNotifications(user);
          const allIds = notifs.map(n => n.id);
          try {
            localStorage.setItem('autotrading_read_notifs_' + user.id, JSON.stringify(allIds));
          } catch(e) {}
          const badgeEl = document.getElementById('headerNotifBadge');
          if (badgeEl) {
            badgeEl.style.display = 'none';
            badgeEl.classList.remove('pulse-anim');
            badgeEl.textContent = '0';
          }
        }
        this.renderNotificationsUI();
      }
    }
  },

  // Open CS modal with guest protection
  openSupport() {
    if (!this.isLoggedIn()) {
      this.showToast('Silahkan login untuk hubungi CS', 'warning');
      this.openAuthModalWithTab('login');
      return;
    }
    this.openModal('supportModal');
  },

  // Open Auth Modal directly to login or register tab (Requirement 2)
  openAuthModalWithTab(tab = 'login') {
    // Open authModal directly without triggering redirection loops
    const modal = document.getElementById('authModal');
    if (modal) {
      modal.classList.add('show');
      document.body.style.overflow = 'hidden';
    }
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
    if (!this.isLoggedIn()) {
      this.showToast('Silahkan login untuk hubungi CS', 'warning');
      this.openAuthModalWithTab('login');
      return;
    }
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
    if (!this.isLoggedIn()) {
      this.showToast('Kelas Trading khusus untuk member terdaftar. Silakan login atau daftar akun terlebih dahulu!', 'info');
      this.openAuthModalWithTab('login');
      return;
    }
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
        <span>${escapeHtml(d.username)}</span>
        <span class="amount-val">+${DB.formatIDR(d.amount)}</span>
        <span style="color:#94A3B8; font-size:10px;">• ${cleanParentheses(d.method)}</span>
        <span style="color:#4ADE80; font-size:10px;">· ${d.timeAgo}</span>
      </span>
    `).join('');

    const renderWdHtml = wds.map(w => `
      <span class="autotrading-marquee-item fgt-marquee-item">
        <span class="badge-tag badge-wd">WITHDRAW</span>
        <span>${escapeHtml(w.username)}</span>
        <span class="amount-val">-${DB.formatIDR(w.amount)}</span>
        <span style="color:#94A3B8; font-size:10px;">• ${maskAccountTrailing(cleanParentheses(w.method))}</span>
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

      let statusColor = '#10B981';
      let statusIcon = '✓';
      if (item.status === 'Ditolak') {
        statusColor = '#EF4444';
        statusIcon = '✗';
      } else if (item.status === 'Diproses') {
        statusColor = '#F59E0B';
        statusIcon = '⏳';
      }

      return `
        <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 10px 12px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 32px; height: 32px; border-radius: 50%; background: ${bg}; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 13px; color: ${color};">
              ${isDep ? '↓' : '↑'}
            </div>
            <div>
              <div style="font-weight: 800; font-size: 13px; color: #0F172A;">
                ${escapeHtml(item.username)} <span class="badge-tag ${tagClass}" style="font-size: 8.5px; margin-left: 4px;">${tagText}</span>
              </div>
              <div style="font-size: 10.5px; color: #64748B;">${maskAccountTrailing(item.method)} · ${item.timeAgo}</div>
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-weight: 800; font-family: var(--font-mono); font-size: 13.5px; color: ${color};">${sign}${DB.formatIDR(item.amount)}</div>
            <div style="font-size: 10px; color: ${statusColor}; font-weight: 700;">${statusIcon} ${item.status}</div>
          </div>
        </div>
      `;
    }).join('');
  },

  // 3. Leaderboard Modal Controller (Requirement 5)
  openLeaderboardModal() {
    if (!Auth.isLoggedIn()) {
      this.showToast('Fitur Leaderboard khusus untuk member terdaftar. Silakan login atau daftar akun terlebih dahulu!', 'info');
      this.openAuthModalWithTab('login');
      return;
    }
    const sponsors = Plans.getTopSponsors(12);
    const profits = Plans.getTopProfits(12);

    // Build Running Text Track
    const trackEl = document.getElementById('leadMarqueeTrack');
    if (trackEl) {
      const topSponsorItems = sponsors.slice(0, 5).map((s, idx) => `
        <span class="autotrading-marquee-item fgt-marquee-item">
          <span class="badge-tag badge-lead">TOP ${idx + 1} SPONSOR</span>
          <span style="font-weight:700;">${escapeHtml(s.maskedUsername || s.username)}</span>
          <span class="amount-val">${DB.formatIDR(s.commission)} Komisi</span>
          <span style="color:#C084FC;">(${s.directCount} Member)</span>
        </span>
      `).join('');

      const profitEarners = profits.filter(p => p.totalProfit > 0);
      const profitMarqueeList = profitEarners.length > 0 ? profitEarners : profits;
      const topProfitItems = profitMarqueeList.slice(0, 5).map((p, idx) => `
        <span class="autotrading-marquee-item fgt-marquee-item">
          <span class="badge-tag badge-dep">TOP ${idx + 1} PROFIT</span>
          <span style="font-weight:700;">${escapeHtml(p.maskedUsername || p.username)}</span>
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
                  ${escapeHtml(s.maskedUsername || s.username)} <span style="font-size: 10px; color: #C89338; font-weight: 700;">[${escapeHtml(s.badge)}]</span>
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
      if (!profits || profits.length === 0) {
        container.innerHTML = `
          <div style="text-align: center; padding: 30px 15px; color: #94A3B8;">
            <div style="font-size: 32px; margin-bottom: 8px;">📊</div>
            <div style="font-size: 13px; font-weight: 600;">Belum ada data profit tercatat.</div>
          </div>
        `;
        return;
      }
      container.innerHTML = profits.map((p, idx) => {
        const rank = idx + 1;
        const rankClass = rank === 1 ? 'lead-rank-1' : (rank === 2 ? 'lead-rank-2' : (rank === 3 ? 'lead-rank-3' : 'lead-rank-other'));
        const medal = rank === 1 ? '🥇' : (rank === 2 ? '🥈' : (rank === 3 ? '🥉' : `#${rank}`));
        const profitColor = p.totalProfit > 0 ? '#15803D' : '#64748B';
        const profitPrefix = p.totalProfit > 0 ? '+' : '';

        return `
          <div class="lead-member-row">
            <div style="display: flex; align-items: center; gap: 10px;">
              <div class="lead-rank-badge ${rankClass}">${medal}</div>
              <div>
                <div style="font-weight: 800; font-size: 13px; color: #0F172A;">
                  ${escapeHtml(p.maskedUsername || p.username)} <span style="font-size: 10px; color: #22C55E; font-weight: 700;">[${escapeHtml(p.activePlan || 'VIP Pro')}]</span>
                </div>
                <div style="font-size: 10.5px; color: #64748B;">
                  Modal: ${DB.formatIDR(p.totalCapital)} · Win Rate: ${p.winRate}%
                </div>
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-weight: 800; font-family: var(--font-mono); font-size: 13.5px; color: ${profitColor};">
                ${profitPrefix}${DB.formatIDR(p.totalProfit)}
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

  async processContractRefund(investmentId) {
    const user = Auth.getUser();
    if (!user) return;

    const res = await Plans.processContractRefund(investmentId, user.id);
    if (res.success) {
      this.showToast(res.message, 'success');
      this.renderAll();
      this.openRefundModal();
    } else {
      this.showToast(res.message, 'error');
    }
  },

  async processContractRefundAll() {
    const user = Auth.getUser();
    if (!user) return;

    const res = await Plans.processAllContractRefunds(user.id);
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

  async submitInvestment() {
    if (this._isSubmittingInvestment) return;
    if (!Auth.isLoggedIn()) {
      this.closeModal('planModal');
      this.openModal('authModal');
      return;
    }

    const input = document.getElementById('investAmountInput');
    const planId = input.getAttribute('data-plan-id');
    const amount = Number(input.value);
    const user = Auth.getUser();

    const submitBtn = document.querySelector('#planModal .btn-cta-gold') || document.getElementById('btnSubmitInvest');
    this._isSubmittingInvestment = true;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span>⏳ Memproses Aktivasi Paket...</span>';
    }

    try {
      const res = await Plans.invest({
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
    } finally {
      this._isSubmittingInvestment = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>🚀 Konfirmasi &amp; Aktifkan Paket</span>';
      }
    }
  },

  async claimProfit() {
    if (this._isClaimingProfit) return;
    const user = Auth.getUser();
    if (!user) return;

    this._isClaimingProfit = true;
    const btnList = document.querySelectorAll('button[onclick*="App.claimProfit"]');
    btnList.forEach(b => {
      b.disabled = true;
      b.setAttribute('disabled', 'true');
      b.dataset.origHtml = b.innerHTML;
      b.innerHTML = '<span>⏳ Memproses klaim...</span>';
      b.style.opacity = '0.6';
    });

    try {
      const res = await Plans.claimProfit(user.id);
      if (res.success) {
        this.triggerClaimCelebration(res.amount, res.message);
        this.renderAll();
      } else {
        this.showToast(res.message, res.alreadyClaimed ? 'info' : 'warning');
        this.renderAll();
      }
    } catch(err) {
      console.warn('claimProfit UI error:', err);
      this.showToast('Terjadi kendala saat memproses klaim profit.', 'warning');
    } finally {
      this._isClaimingProfit = false;
      btnList.forEach(b => {
        if (b.dataset.origHtml) {
          b.innerHTML = b.dataset.origHtml;
          delete b.dataset.origHtml;
        }
        b.disabled = false;
        b.removeAttribute('disabled');
        b.style.opacity = '1';
      });
      this.updateProfitCountdown();
    }
  },

  // Celebration with Animated Trumpets & Confetti (Point 2)
  triggerClaimCelebration(amount, message) {
    const amtEl = document.getElementById('celebrationProfitAmount');
    if (amtEl) amtEl.textContent = DB.formatIDR(amount || 0);

    this.playCelebratoryFanfare();
    this.spawnConfetti();
    this.openModal('claimCelebrationModal');
  },

  closeCelebrationModal() {
    this.closeModal('claimCelebrationModal');
    this.renderAll();
  },

  playCelebratoryFanfare() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const notes = [523.25, 659.25, 783.99, 1046.50];
      const noteDur = 0.13;
      const startTime = ctx.currentTime + 0.04;

      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, startTime + (idx * noteDur));

        gain.gain.setValueAtTime(0.01, startTime + (idx * noteDur));
        gain.gain.exponentialRampToValueAtTime(0.28, startTime + (idx * noteDur) + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + (idx * noteDur) + (idx === 3 ? 0.38 : noteDur));

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startTime + (idx * noteDur));
        osc.stop(startTime + (idx * noteDur) + (idx === 3 ? 0.42 : noteDur));
      });
    } catch (e) {
      // Audio autoplay policy fallback
    }
  },

  spawnConfetti() {
    const container = document.getElementById('celebrationConfettiContainer');
    if (!container) return;
    container.innerHTML = '';
    const colors = ['#F59E0B', '#10B981', '#3B82F6', '#EF4444', '#EC4899', '#8B5CF6', '#FCD34D'];

    for (let i = 0; i < 32; i++) {
      const particle = document.createElement('div');
      particle.className = 'celebration-confetti-particle';
      const left = Math.random() * 100;
      const color = colors[Math.floor(Math.random() * colors.length)];
      const delay = Math.random() * 1.2;
      const duration = 2.2 + Math.random() * 1.5;
      const size = 6 + Math.random() * 6;

      particle.style.left = `${left}%`;
      particle.style.top = '0px';
      particle.style.background = color;
      particle.style.width = `${size}px`;
      particle.style.height = `${size * 1.4}px`;
      particle.style.animationDelay = `${delay}s`;
      particle.style.animationDuration = `${duration}s`;
      particle.style.borderRadius = `${Math.random() > 0.5 ? '50%' : '2px'}`;
      container.appendChild(particle);
    }
  },

  // Multi-Account & Duplicate Bank Warning Modal (Point 4)
  openSecurityWarningModal(title, message) {
    const titleEl = document.getElementById('securityWarningTitle');
    const msgEl = document.getElementById('securityWarningMessage');
    if (titleEl) titleEl.textContent = title || '⚠️ Terdeteksi Akun Ganda';
    if (msgEl) msgEl.textContent = message || 'Sistem melarang kepemilikan akun ganda.';
    this.openModal('securityWarningModal');
  },

  // Daily Check-in / Absensi Harian 7 Hari (Point 6)
  openDailyCheckInModal() {
    const user = Auth.getUser();
    if (!user) {
      this.showToast('Silahkan login atau daftar dulu', 'info');
      this.openModal('authModal');
      return;
    }
    this.renderDailyCheckInUI();
    this.openModal('dailyCheckInModal');
  },

  async claimDailyCheckIn() {
    if (this._isClaimingCheckIn) return;
    const user = Auth.getUser();
    if (!user) return;

    this._isClaimingCheckIn = true;
    const btnEl = document.getElementById('btnClaimDailyCheckIn');
    if (btnEl) {
      btnEl.disabled = true;
      btnEl.setAttribute('disabled', 'true');
      btnEl.innerHTML = '<span>⏳ Memproses absensi...</span>';
      btnEl.style.opacity = '0.6';
    }

    try {
      const res = await DB.claimDailyCheckIn(user.id);
      if (res.success) {
        this.playCelebratoryFanfare();
        this.showToast(res.message, 'success');
      } else {
        this.showToast(res.message, res.alreadyClaimed ? 'info' : 'warning');
      }
    } catch(err) {
      console.warn('claimDailyCheckIn UI error:', err);
      this.showToast('Terjadi kendala saat memproses absensi.', 'warning');
    } finally {
      this._isClaimingCheckIn = false;
      this.renderDailyCheckInUI();
      this.renderAll();
    }
  },

  renderDailyCheckInUI() {
    const user = Auth.getUser();
    if (!user) return;

    const status = DB.getDailyCheckInStatus(user.id);
    if (!status) return;

    const amtEl = document.getElementById('checkInBonusAmountText');
    if (amtEl) amtEl.textContent = `Rp ${status.rewardAmount.toLocaleString('id-ID')}`;

    const gridEl = document.getElementById('checkInStreakGrid');
    if (gridEl) {
      let html = '';
      const currentStreak = status.currentStreak;
      const checkedToday = status.hasCheckedInToday;

      for (let day = 1; day <= 7; day++) {
        let isDone = false;
        let isToday = false;

        if (checkedToday) {
          isDone = day <= currentStreak;
        } else {
          isDone = day < (currentStreak + 1);
          isToday = (day === (currentStreak % 7) + 1);
        }

        let cls = 'checkin-day-pill';
        if (isDone) cls += ' completed';
        if (isToday) cls += ' today-active';

        html += `
          <div class="${cls}">
            <span class="checkin-day-num">H-${day}</span>
            <span class="checkin-day-coin">${isDone ? '✓' : (day === 7 ? '🎁' : '🪙')}</span>
            <span class="checkin-day-val">+1k</span>
          </div>
        `;
      }
      gridEl.innerHTML = html;
    }

    const btnEl = document.getElementById('btnClaimDailyCheckIn');
    const noticeEl = document.getElementById('checkInStatusNotice');
    if (btnEl) {
      if (status.hasCheckedInToday) {
        btnEl.setAttribute('disabled', 'true');
        btnEl.disabled = true;
        btnEl.style.opacity = '0.6';
        btnEl.innerHTML = '<span>✓ Sudah Absen Hari Ini (+Rp ' + status.rewardAmount.toLocaleString('id-ID') + ')</span>';
        if (noticeEl) noticeEl.textContent = `Hebat! Anda sedang di rangkaian hari ke-${status.currentStreak}/7. Silakan kembali besok untuk bonus berikutnya!`;
      } else {
        btnEl.removeAttribute('disabled');
        btnEl.disabled = false;
        btnEl.style.opacity = '1';
        btnEl.innerHTML = '<span>📅 Klaim Absen Hari Ini (+Rp ' + status.rewardAmount.toLocaleString('id-ID') + ')</span>';
        if (noticeEl) noticeEl.textContent = `Klaim bonus absen login harian Anda sekarang (+Rp ${status.rewardAmount.toLocaleString('id-ID')} masuk Saldo Utama).`;
      }
    }

    // Also update Dashboard banner button
    const dashLabel = document.getElementById('dashboardCheckInStreakLabel');
    if (dashLabel) {
      if (status.hasCheckedInToday) {
        dashLabel.textContent = `Sudah Absen (Hari ke-${status.currentStreak}/7) ✓`;
        dashLabel.style.color = '#059669';
      } else {
        dashLabel.textContent = `Klaim Bonus Login (Hari ke-${(status.currentStreak % 7) + 1}) ›`;
        dashLabel.style.color = '#B45309';
      }
    }
  },

  checkAutoOpenDailyCheckIn() {
    const user = Auth.getUser();
    if (!user) return;
    const status = DB.getDailyCheckInStatus(user.id);
    if (status && status.enabled && !status.hasCheckedInToday) {
      setTimeout(() => {
        this.openDailyCheckInModal();
      }, 700);
    }
  },

  // ========================================================================
  // REALTIME USER ACTIVITY NOTIFICATION ENGINE
  // ========================================================================
  notifFilter: 'all',

  getUserNotifications(user) {
    const db = DB.get();
    const notifs = [];

    if (!user) {
      // Notifikasi hanya muncul untuk user yang sudah terdaftar / login
      return [];
    }

    // 1. Transactions of this user (Deposit, WD, Profit, Sponsor, Rabat, Capital Return)
    const userTxs = (db.transactions || [])
      .filter(tx => tx.userId === user.id)
      .sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));

    userTxs.forEach(tx => {
      const time = tx.createdAt || tx.date || new Date().toISOString();
      const amountStr = DB.formatIDR(tx.amount || 0);

      if (tx.type === 'deposit') {
        if (tx.status === 'approved') {
          notifs.push({
            id: 'tx-dep-' + tx.id,
            type: 'finance',
            category: 'Deposit',
            title: `Deposit Berhasil: +${amountStr}`,
            message: `Saldo utama Anda telah aktif bertambah ${amountStr} melalui ${tx.gateway || 'Bank/QRIS'}.`,
            time,
            icon: 'deposit_success',
            action: () => this.openRiwayatModal('deposit')
          });
        } else if (tx.status === 'pending') {
          notifs.push({
            id: 'tx-dep-' + tx.id,
            type: 'finance',
            category: 'Deposit',
            title: `Deposit Menunggu Verifikasi: ${amountStr}`,
            message: `Pengajuan deposit ${amountStr} sedang diproses verifikasi oleh admin/sistem.`,
            time,
            icon: 'deposit_pending',
            action: () => this.openRiwayatModal('deposit')
          });
        } else if (tx.status === 'rejected') {
          notifs.push({
            id: 'tx-dep-' + tx.id,
            type: 'finance',
            category: 'Deposit',
            title: `Deposit Ditolak / Dibatalkan: ${amountStr}`,
            message: `Pengajuan deposit ${amountStr} ditolak: ${tx.rejectReason || 'Bukti transfer tidak sesuai'}.`,
            time,
            icon: 'deposit_rejected',
            action: () => this.openRiwayatModal('deposit')
          });
        }
      } else if (tx.type === 'withdraw') {
        if (tx.status === 'approved') {
          notifs.push({
            id: 'tx-wd-' + tx.id,
            type: 'finance',
            category: 'Penarikan',
            title: `Penarikan Berhasil Ditransfer: ${amountStr}`,
            message: `Dana ${amountStr} telah berhasil ditransfer ke rekening ${tx.bankName ? tx.bankName + ' ' : ''}(${maskAccountTrailing(tx.accountNumber || tx.destinationAccount || '')}).`,
            time,
            icon: 'withdraw_success',
            action: () => this.openRiwayatModal('withdraw')
          });
        } else if (tx.status === 'pending') {
          notifs.push({
            id: 'tx-wd-' + tx.id,
            type: 'finance',
            category: 'Penarikan',
            title: `Pengajuan Penarikan Dana: ${amountStr}`,
            message: `Permintaan penarikan ${amountStr} sedang dalam antrean verifikasi bagian keuangan.`,
            time,
            icon: 'withdraw_pending',
            action: () => this.openRiwayatModal('withdraw')
          });
        } else if (tx.status === 'rejected') {
          notifs.push({
            id: 'tx-wd-' + tx.id,
            type: 'finance',
            category: 'Penarikan',
            title: `Penarikan Ditolak: ${amountStr}`,
            message: `Pengajuan penarikan ${amountStr} ditolak: ${tx.rejectReason || 'Data rekening tidak sesuai'}. Saldo telah dikembalikan.`,
            time,
            icon: 'withdraw_rejected',
            action: () => this.openRiwayatModal('withdraw')
          });
        }
      } else if (tx.type === 'profit') {
        notifs.push({
          id: 'tx-prof-' + tx.id,
          type: 'finance',
          category: 'Profit Harian',
          title: `Dividen Profit Masuk: +${amountStr}`,
          message: `Bagi hasil harian otomatis +${amountStr} dari paket ${tx.planName || 'Investasi'} telah masuk ke saldo akun.`,
          time,
          icon: 'profit',
          action: () => this.switchTab('home')
        });
      } else if (tx.type === 'sponsor' || tx.type === 'affiliate') {
        notifs.push({
          id: 'tx-spons-' + tx.id,
          type: 'finance',
          category: 'Bonus Sponsor',
          title: `Bonus Sponsor Afiliasi: +${amountStr}`,
          message: `Selamat! Anda menerima komisi sponsor 10% sebesar +${amountStr} dari deposit downline.`,
          time,
          icon: 'sponsor',
          action: () => this.switchTab('profile')
        });
      } else if (tx.type === 'rabat') {
        notifs.push({
          id: 'tx-rabat-' + tx.id,
          type: 'finance',
          category: 'Rabat ROI',
          title: `Bonus Rabat ROI Masuk: +${amountStr}`,
          message: `Komisi rabat bagi hasil matching ROI level ${tx.level || 'tim'} sebesar +${amountStr} telah masuk ke wallet.`,
          time,
          icon: 'rabat',
          action: () => this.switchTab('profile')
        });
      } else if (tx.type === 'capital_return') {
        notifs.push({
          id: 'tx-cap-' + tx.id,
          type: 'finance',
          category: 'Modal Pokok',
          title: `Pengembalian Modal Kontrak: +${amountStr}`,
          message: `Masa kontrak investasi selesai. Modal pokok ${amountStr} telah kembali 100% ke saldo utama.`,
          time,
          icon: 'capital_return',
          action: () => this.switchTab('home')
        });
      } else if (tx.type === 'checkin' || (tx.description && tx.description.toLowerCase().includes('check-in'))) {
        notifs.push({
          id: 'tx-chk-' + tx.id,
          type: 'finance',
          category: 'Check-In',
          title: `Hadiah Check-In Harian: +${amountStr}`,
          message: `Reward streak check-in harian sebesar +${amountStr} telah berhasil diklaim ke saldo.`,
          time,
          icon: 'checkin',
          action: () => this.switchTab('home')
        });
      }
    });

    // 2. Active investments
    const activeInvs = Plans.getUserInvestments(user.id);
    activeInvs.forEach(inv => {
      notifs.push({
        id: 'inv-act-' + inv.id,
        type: 'finance',
        category: 'Investasi',
        title: `Paket Investasi Aktif: ${inv.planName}`,
        message: `Paket modal ${DB.formatIDR(inv.amount)} aktif berjalan (${inv.daysPassed || 0}/${inv.durationDays} hari) dengan dividen harian otomatis.`,
        time: inv.startDate || new Date().toISOString(),
        icon: 'investment',
        action: () => this.switchTab('home')
      });
    });

    // 3. User Welcome notification
    notifs.push({
      id: 'usr-wel-' + user.id,
      type: 'system',
      category: 'Akun Member',
      title: `Selamat Datang, ${escapeHtml(user.fullName || user.username)}!`,
      message: `Akun Anda resmi aktif di AUTOTRADING dengan kode referral ${user.referralCode || '-'}. Mulai trading & nikmati bagi hasil harian otomatis.`,
      time: user.registeredAt || '2026-01-01T00:00:00.000Z',
      icon: 'welcome',
      action: () => this.switchTab('profile')
    });

    // 4. Announcements
    (db.announcements || []).filter(a => a.active).forEach(a => {
      notifs.push({
        id: 'ann-' + a.id,
        type: 'system',
        category: 'Pengumuman',
        title: 'Pengumuman Resmi Platform',
        message: a.text,
        time: a.createdAt || '2026-01-01T00:00:00.000Z',
        icon: 'announcement',
        action: () => this.openModal('announcementModal')
      });
    });

    // 5. Signals
    (db.signals || []).filter(s => s.status === 'active').slice(0, 3).forEach(s => {
      notifs.push({
        id: 'sig-' + s.id,
        type: 'system',
        category: 'Sinyal AI',
        title: `Sinyal ${s.action} ${s.pair} (Akurasi ${s.confidence}%)`,
        message: `Entry: ${s.entry} · TP: ${s.tp} · SL: ${s.sl}. Rekomendasi Autotrading Signal Status AI.`,
        time: new Date().toISOString(),
        icon: 'signal',
        action: () => this.switchTab('trade')
      });
    });

    // Sort newest first
    notifs.sort((a, b) => new Date(b.time) - new Date(a.time));
    return notifs;
  },

  getReadNotifIds(userId) {
    try {
      const raw = localStorage.getItem('autotrading_read_notifs_' + (userId || 'guest'));
      return raw ? JSON.parse(raw) : [];
    } catch(e) {
      return [];
    }
  },

  markAllNotificationsRead() {
    const user = Auth.getUser();
    const notifs = this.getUserNotifications(user);
    const allIds = notifs.map(n => n.id);
    try {
      localStorage.setItem('autotrading_read_notifs_' + (user ? user.id : 'guest'), JSON.stringify(allIds));
    } catch(e) {}
    this.updateHeaderNotifBadge(user);
    this.renderNotificationsUI();
    this.showToast('Semua notifikasi telah ditandai sudah dibaca.', 'success');
  },

  markSingleNotificationRead(id) {
    const user = Auth.getUser();
    const readIds = this.getReadNotifIds(user ? user.id : null);
    if (!readIds.includes(id)) {
      readIds.push(id);
      try {
        localStorage.setItem('autotrading_read_notifs_' + (user ? user.id : 'guest'), JSON.stringify(readIds));
      } catch(e) {}
      this.updateHeaderNotifBadge(user);
      this.renderNotificationsUI();
    }
  },

  updateHeaderNotifBadge(user) {
    const badgeEl = document.getElementById('headerNotifBadge');
    if (!badgeEl) return;

    if (!user) {
      badgeEl.style.display = 'none';
      badgeEl.classList.remove('pulse-anim');
      badgeEl.textContent = '0';
      return;
    }

    const notifs = this.getUserNotifications(user);
    const readIds = this.getReadNotifIds(user.id);
    const unreadCount = notifs.filter(n => !readIds.includes(n.id)).length;

    if (unreadCount > 0) {
      badgeEl.style.display = 'flex';
      badgeEl.textContent = unreadCount > 9 ? '9+' : unreadCount;
      badgeEl.classList.add('pulse-anim');
    } else {
      badgeEl.style.display = 'none';
      badgeEl.classList.remove('pulse-anim');
      badgeEl.textContent = '0';
    }
  },

  renderNotificationsUI() {
    const listEl = document.getElementById('notifListContainer');
    if (!listEl) return;

    const user = Auth.getUser();
    const allNotifs = this.getUserNotifications(user);
    const readIds = this.getReadNotifIds(user ? user.id : null);

    // Update filter badge counts
    const badgeAll = document.getElementById('notifBadgeAll');
    const badgeFinance = document.getElementById('notifBadgeFinance');
    const badgeSystem = document.getElementById('notifBadgeSystem');

    const financeCount = allNotifs.filter(n => n.type === 'finance').length;
    const systemCount = allNotifs.filter(n => n.type === 'system').length;

    if (badgeAll) badgeAll.textContent = allNotifs.length;
    if (badgeFinance) badgeFinance.textContent = financeCount;
    if (badgeSystem) badgeSystem.textContent = systemCount;

    // Filter list
    let filtered = allNotifs;
    if (this.notifFilter === 'finance') {
      filtered = allNotifs.filter(n => n.type === 'finance');
    } else if (this.notifFilter === 'system') {
      filtered = allNotifs.filter(n => n.type === 'system');
    }

    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div class="notif-empty-state">
          <div class="notif-empty-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>
          </div>
          <div style="font-weight: 700; font-size: 13.5px; color: inherit; margin-bottom: 4px;">Belum Ada Pemberitahuan</div>
          <div style="font-size: 11.5px; line-height: 1.5; color: #94A3B8; max-width: 260px; margin: 0 auto;">
            ${user ? 'Semua aktivitas transaksi, dividen profit harian, dan bonus afiliasi Anda akan muncul di sini secara realtime.' : 'Silakan masuk atau daftar akun untuk melihat seluruh aktivitas keuangan & riwayat profit Anda.'}
          </div>
          ${!user ? `
            <button class="btn-cta-gold" style="width: auto; padding: 8px 20px; margin: 14px auto 0 auto; font-size: 12px;" onclick="App.closeModal('notifModal'); App.openAuthModalWithTab('login');">
              Masuk ke Akun
            </button>
          ` : ''}
        </div>
      `;
      return;
    }

    listEl.innerHTML = filtered.map(n => {
      const isUnread = !readIds.includes(n.id);
      const relTime = this.formatRelativeTime(n.time);

      let iconColor = 'gold';
      let iconSvg = '';

      if (n.icon === 'deposit_success' || n.icon === 'withdraw_success' || n.icon === 'profit' || n.icon === 'capital_return') {
        iconColor = 'green';
        iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`;
      } else if (n.icon === 'deposit_pending' || n.icon === 'withdraw_pending') {
        iconColor = 'gold';
        iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`;
      } else if (n.icon === 'deposit_rejected' || n.icon === 'withdraw_rejected') {
        iconColor = 'red';
        iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
      } else if (n.icon === 'sponsor' || n.icon === 'rabat') {
        iconColor = 'purple';
        iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`;
      } else if (n.icon === 'signal' || n.icon === 'investment') {
        iconColor = 'blue';
        iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`;
      } else {
        iconColor = 'gold';
        iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>`;
      }

      return `
        <div class="notif-item ${isUnread ? 'unread' : ''}" onclick="App.onNotifItemClick('${n.id}')">
          <div class="notif-icon-box ${iconColor}">
            ${iconSvg}
          </div>
          <div class="notif-content">
            <div class="notif-meta-row">
              <span class="notif-category-tag ${n.type}">${n.category || 'Info'}</span>
              <span class="notif-time-text">${relTime}</span>
            </div>
            <div class="notif-title-text">${n.title}</div>
            <div class="notif-desc-text">${n.message}</div>
          </div>
        </div>
      `;
    }).join('');
  },

  setNotifFilter(filter) {
    this.notifFilter = filter;
    document.querySelectorAll('.notif-tab').forEach(t => {
      t.classList.toggle('active', t.getAttribute('data-filter') === filter);
    });
    this.renderNotificationsUI();
  },

  onNotifItemClick(notifId) {
    const user = Auth.getUser();
    this.markSingleNotificationRead(notifId);
    const notifs = this.getUserNotifications(user);
    const found = notifs.find(n => n.id === notifId);
    if (found && typeof found.action === 'function') {
      this.closeModal('notifModal');
      try {
        found.action();
      } catch(e) {
        console.error('Error executing notif action:', e);
      }
    }
  },

  formatRelativeTime(dateStr) {
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return 'Baru saja';
      const now = new Date();
      const diffSec = Math.floor((now - date) / 1000);
      if (diffSec < 60) return 'Baru saja';
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin} mnt lalu`;
      const diffHour = Math.floor(diffMin / 60);
      if (diffHour < 24) return `${diffHour} jam lalu`;
      const diffDay = Math.floor(diffHour / 24);
      if (diffDay === 1) return 'Kemarin';
      if (diffDay < 7) return `${diffDay} hari lalu`;
      return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
    } catch(e) {
      return 'Baru saja';
    }
  },

  // Auth Submit Handlers
  async submitLogin() {
    const idInput = document.getElementById('loginIdentifier');
    const pwInput = document.getElementById('loginPassword');
    const id = idInput ? idInput.value.trim() : '';
    const pw = pwInput ? pwInput.value.trim() : '';

    const res = await Auth.login(id, pw);
    if (res.success) {
      this.closeAllModals();
      if (res.user && res.user.role === 'admin') {
        this.showToast('Login Admin berhasil! Mengalihkan ke Panel Admin...', 'success');
        setTimeout(() => { window.location.href = 'admin'; }, 600);
      } else {
        this.showToast(res.message, 'success');
        this.renderAll();
        this.checkAutoOpenDailyCheckIn();
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

  async submitRegister() {
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

    const regBtn = document.getElementById('btnSubmitRegister');
    if (regBtn) {
      regBtn.disabled = true;
      regBtn.innerHTML = '<span>⏳ Memproses Pendaftaran ke Database...</span>';
    }
    let res;
    try {
      res = await Auth.register({ username, fullName, email, phone, password, confirmPassword, referralCode });
    } finally {
      if (regBtn) {
        regBtn.disabled = false;
        regBtn.innerHTML = '<span>Daftar Sekarang</span>';
      }
    }
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
        this.checkAutoOpenDailyCheckIn();
      }
    } else {
      if (res.isDuplicateAccount) {
        this.openSecurityWarningModal('Peringatan Akun Ganda Ditolak', res.message);
      }
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

  async submitEmailVerificationOtp() {
    const userId = document.getElementById('emailOtpUserId') ? document.getElementById('emailOtpUserId').value : '';
    const code = document.getElementById('emailOtpInput') ? document.getElementById('emailOtpInput').value.trim() : '';

    if (!code || code.length < 6) {
      this.showToast('Harap masukkan 6 digit kode OTP verifikasi email!', 'error');
      const input = document.getElementById('emailOtpInput');
      if (input) input.focus();
      return;
    }

    const res = await Auth.verifyRegistrationOtp(userId, code);
    if (res.success) {
      if (this._otpTimer) clearInterval(this._otpTimer);
      this.closeModal('emailOtpModal');
      this.showToast(res.message, 'success');
      this.renderAll();
    } else {
      this.showToast(res.message, 'error');
    }
  },

  async resendEmailOtp() {
    const userId = document.getElementById('emailOtpUserId') ? document.getElementById('emailOtpUserId').value : '';
    if (!userId) return;

    const res = await Auth.resendRegistrationOtp(userId);
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

  quickLogin() {
    this.showToast('Fitur login demo telah dinonaktifkan.', 'info');
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

  async submitForgotPassword() {
    const emailInput = document.getElementById('forgotEmail');
    const identifier = emailInput ? emailInput.value.trim() : '';

    if (!identifier) {
      this.showToast('Harap masukkan alamat email akun Anda!', 'error');
      if (emailInput) emailInput.focus();
      return;
    }

    const res = await Auth.requestPasswordReset(identifier);
    if (res.success) {
      this.showToast(res.message, 'success');
      const targetEl = document.getElementById('forgotSentEmailTarget');
      if (targetEl) targetEl.textContent = res.email;

      // The reset code is emailed by the server and deliberately NOT shown here
      const codeInput = document.getElementById('forgotResetCode');
      if (codeInput) codeInput.value = '';

      const step1 = document.getElementById('forgotStepRequest');
      const step2 = document.getElementById('forgotStepVerify');
      if (step1) step1.style.display = 'none';
      if (step2) step2.style.display = 'block';
    } else {
      this.showToast(res.message, 'error');
    }
  },

  async submitResetPasswordWithCode() {
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

    const res = await Auth.resetPasswordWithCode(identifier, code, newPass);
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
        textEl.textContent = `🟢 Jam Operasional WD Buka (${String(sched.schedule ? sched.schedule.startHour : 9).padStart(2, '0')}:00 - ${String(sched.schedule ? sched.schedule.endHour : 21).padStart(2, '0')}:00 WIB)`;
        if (submitBtn) {
          submitBtn.removeAttribute('disabled');
          submitBtn.style.opacity = '1';
          submitBtn.innerHTML = '<span>Tarik Saldo Sekarang</span>';
        }
      } else {
        badgeEl.className = 'wd-status-badge closed';
        textEl.textContent = `🔴 ${sched.message}`;
        if (submitBtn) {
          submitBtn.setAttribute('disabled', 'true');
          submitBtn.style.opacity = '0.55';
          submitBtn.innerHTML = '<span>🔒 Layanan WD Sedang Dikunci (OFF)</span>';
        }
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

    // Update balance preview & breakdown
    this.updateWithdrawBalancePreview();
    this.updateWithdrawBreakdownCalc();

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

  // Calculate realtime net withdrawal breakdown (Gross - 10% Fee = Net)
  updateWithdrawBreakdownCalc() {
    const amountInput = document.getElementById('wdAmountInput');
    const grossEl = document.getElementById('wdCalcGross');
    const feeEl = document.getElementById('wdCalcFee');
    const netEl = document.getElementById('wdCalcNet');
    if (!grossEl || !feeEl || !netEl) return;

    const db = DB.get();
    const feePercent = (db.settings && typeof db.settings.withdrawFeePercent === 'number') 
      ? db.settings.withdrawFeePercent 
      : 10.0;
    
    const gross = amountInput ? (parseFloat(amountInput.value) || 0) : 0;
    const fee = Math.round((gross * feePercent) / 100);
    const net = Math.max(0, gross - fee);

    grossEl.textContent = DB.formatIDR(gross);
    feeEl.textContent = `-${DB.formatIDR(fee)}`;
    netEl.textContent = DB.formatIDR(net);
  },

  // Deposit Proof of Transfer Upload Handlers
  async handleDepositProofSelect(event) {
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

    const previewImg = document.getElementById('depProofPreviewImg');
    const previewWrap = document.getElementById('depProofPreviewWrap');
    const placeholder = document.getElementById('depProofPlaceholder');

    this.showToast('Memproses bukti transfer...', 'info');

    try {
      // 1. First attempt direct upload to server uploads/ directory
      const uploadRes = await DB.uploadImage(file);
      if (uploadRes && uploadRes.success && uploadRes.url) {
        this.uploadedDepositProofBase64 = uploadRes.url;
        if (previewImg) previewImg.src = uploadRes.url;
        if (previewWrap) previewWrap.style.display = 'block';
        if (placeholder) placeholder.style.display = 'none';
        this.showToast('✓ Bukti transfer tersimpan di server!', 'success');
        return;
      }
    } catch (err) {
      console.warn('Direct upload failed, falling back to local compressed image:', err);
    }

    // 2. Safe local compression fallback (max 800px, 0.7 quality) to avoid localStorage quota exhaustion
    try {
      const compressed = await DB.compressImageFile(file, 800, 0.7);
      this.uploadedDepositProofBase64 = compressed;
      if (previewImg) previewImg.src = compressed;
      if (previewWrap) previewWrap.style.display = 'block';
      if (placeholder) placeholder.style.display = 'none';
      this.showToast('Foto bukti transfer dimuat (mode kompresi).', 'success');
    } catch (compErr) {
      const reader = new FileReader();
      reader.onload = (e) => {
        this.uploadedDepositProofBase64 = e.target.result;
        if (previewImg) previewImg.src = e.target.result;
        if (previewWrap) previewWrap.style.display = 'block';
        if (placeholder) placeholder.style.display = 'none';
        this.showToast('Foto bukti transfer berhasil dimuat.', 'success');
      };
      reader.readAsDataURL(file);
    }
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

  async submitDeposit() {
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

    const depSubmitBtn = document.getElementById('btnSubmitDeposit');
    if (depSubmitBtn) {
      depSubmitBtn.disabled = true;
      depSubmitBtn.innerHTML = '<span>⏳ Menyimpan Bukti & Mengirim ke Server...</span>';
    }
    let res;
    try {
      res = await Payment.createDepositRequest({
        userId: user.id,
        method,
        bankId,
        amount,
        amountUsdt: usdtAmt,
        txid,
        proofImage
      });
    } finally {
      if (depSubmitBtn) {
        depSubmitBtn.disabled = false;
        depSubmitBtn.innerHTML = '<span>🚀 Konfirmasi & Kirim Bukti Transfer</span>';
      }
    }

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
    const cleanMethod = cleanParentheses(trx.paymentMethod || 'Deposit');
    if (subtitleEl) subtitleEl.textContent = `${cleanMethod} · ID: ${trx.id}`;
    if (imgEl) imgEl.src = trx.proofImage;

    this.openModal('viewProofModal');
  },

  async submitWithdraw() {
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

    const wdSubmitBtn = document.getElementById('btnSubmitWithdraw');
    if (wdSubmitBtn) {
      wdSubmitBtn.disabled = true;
      wdSubmitBtn.innerHTML = '<span>⏳ Memproses Pengajuan Penarikan...</span>';
    }
    let res;
    try {
      res = await Payment.createWithdrawRequest({
        userId: user.id,
        walletType,
        method,
        bankName,
        accountNumber,
        accountHolder,
        amount
      });
    } finally {
      if (wdSubmitBtn) {
        wdSubmitBtn.disabled = false;
        wdSubmitBtn.innerHTML = '<span>⚡ Ajukan Penarikan Dana</span>';
      }
    }

    if (res.success) {
      this.closeModal('withdrawModal');
      this.showToast(res.message, 'success');
      this.renderAll();
    } else {
      if (res.isDuplicateBank) {
        this.openSecurityWarningModal('Peringatan Rekening Ganda Ditolak', res.message);
      }
      this.showToast(res.message, 'error');
    }
  },

  transferAffiliateBalance() {
    this.openTransferModal('affiliate');
  },

  transferMemberBalance() {
    this.openTransferModal('member');
  },

  openTransferModal(initialType = 'affiliate') {
    const user = Auth.getUser();
    if (!user) {
      this.showToast('Silahkan login terlebih dahulu.', 'info');
      this.openModal('authModal');
      return;
    }

    this.currentTransferType = initialType;
    this.setTransferType(initialType, false);
    this.openModal('transferModal');
  },

  setTransferType(type, triggerPreview = true) {
    this.currentTransferType = type || 'affiliate';
    const user = Auth.getUser();
    if (!user) return;

    if (!this.transferPpobCat) this.transferPpobCat = 'pulsa';
    if (!this.transferPpobDenom) this.transferPpobDenom = 10000;

    const btnAff = document.getElementById('btnTransferTypeAffiliate');
    const btnMem = document.getElementById('btnTransferTypeMember');
    const btnPpob = document.getElementById('btnTransferTypePpob');
    const mainTitle = document.getElementById('transferModalMainTitle');
    const subTitle = document.getElementById('transferModalSubTitle');
    const srcTitle = document.getElementById('transferSourceTitleText');
    const srcBalEl = document.getElementById('transferSourceBalText');
    const srcTag = document.getElementById('transferSourceTagText');
    const destTitle = document.getElementById('transferDestTitleText');
    const destBalEl = document.getElementById('transferDestBalText');
    const destTag = document.getElementById('transferDestTagText');
    const targetGroup = document.getElementById('transferTargetUserGroup');
    const recipientBadge = document.getElementById('transferRecipientBadge');
    const ppobSection = document.getElementById('transferPpobSection');
    const generalAmountSection = document.getElementById('transferGeneralAmountSection');
    const infoBanner = document.getElementById('transferInfoBannerText');
    const lblLeft = document.getElementById('transferPreviewLabelLeft');
    const lblRight = document.getElementById('transferPreviewLabelRight');
    const maxNotice = document.getElementById('transferMaxNotice');
    const inputEl = document.getElementById('transferAmountInput');

    const affBal = user.affiliateBalance || 0;
    const walletBal = user.walletBalance || 0;

    if (btnAff) btnAff.classList.toggle('active', this.currentTransferType === 'affiliate');
    if (btnMem) btnMem.classList.toggle('active', this.currentTransferType === 'member');
    if (btnPpob) btnPpob.classList.toggle('active', this.currentTransferType === 'ppob');

    if (this.currentTransferType === 'member') {
      if (mainTitle) mainTitle.textContent = 'Transfer Antar Member (P2P)';
      if (subTitle) subTitle.textContent = 'Kirim saldo utama langsung ke akun member rekan Anda';
      if (srcTitle) srcTitle.textContent = 'Wallet Utama (Saldo Bebas)';
      if (srcBalEl) srcBalEl.textContent = DB.formatIDR(walletBal);
      if (srcTag) srcTag.textContent = 'Saldo Utama';
      if (destTitle) destTitle.textContent = 'Akun Member Tujuan';
      if (destBalEl) destBalEl.textContent = 'Transfer Instan';
      if (destTag) destTag.textContent = 'Penerima P2P';
      if (targetGroup) targetGroup.style.display = 'block';
      if (recipientBadge) recipientBadge.style.display = 'none';
      if (ppobSection) ppobSection.style.display = 'none';
      if (generalAmountSection) generalAmountSection.style.display = 'block';
      if (infoBanner) infoBanner.textContent = 'Transfer sesama member diproses realtime & bebas potongan biaya admin.';
      if (lblLeft) lblLeft.textContent = 'Sisa Saldo Utama:';
      if (lblRight) lblRight.textContent = 'Estimasi Diterima:';
      if (maxNotice) maxNotice.textContent = `Maksimal: ${DB.formatIDR(walletBal)}`;
      if (inputEl) {
        inputEl.max = walletBal;
        inputEl.value = walletBal > 0 ? (walletBal <= 100000 ? walletBal : 50000) : 0;
      }
      this.onTransferTargetInput();
    } else if (this.currentTransferType === 'ppob') {
      if (mainTitle) mainTitle.textContent = 'Konversi Komisi ke PPOB';
      if (subTitle) subTitle.textContent = 'Tukarkan saldo komisi tim dengan Pulsa atau Token PLN (Proses Manual)';
      if (srcTitle) srcTitle.textContent = 'Wallet Tambah Teman';
      if (srcBalEl) srcBalEl.textContent = DB.formatIDR(affBal);
      if (srcTag) srcTag.textContent = 'Komisi Afiliasi';
      const catLabel = this.transferPpobCat === 'pln' ? 'Token Listrik PLN' : 'Pulsa Seluler';
      if (destTitle) destTitle.textContent = catLabel;
      if (destBalEl) destBalEl.textContent = DB.formatIDR(this.transferPpobDenom || 10000);
      if (destTag) destTag.textContent = 'PPOB Manual Admin';
      if (targetGroup) targetGroup.style.display = 'none';
      if (recipientBadge) recipientBadge.style.display = 'none';
      if (ppobSection) ppobSection.style.display = 'block';
      if (generalAmountSection) generalAmountSection.style.display = 'none';
      if (infoBanner) infoBanner.textContent = 'Konversi saldo komisi ke pulsa/listrik diproses secara manual oleh Admin. Saldo komisi akan langsung dipotong sesuai harga jual.';
      this.setTransferPpobCategory(this.transferPpobCat || 'pulsa');
      this.setTransferPpobDenom(this.transferPpobDenom || 10000);

      // Sinkronkan label harga beli PPOB di tombol denom transfer modal
      const p10 = this.getPpobPrice(10000);
      const p20 = this.getPpobPrice(20000);
      const p50 = this.getPpobPrice(50000);
      const p100 = this.getPpobPrice(100000);
      const l10 = document.getElementById('lblPriceTransferPpob10');
      if (l10) l10.textContent = `Bayar: ${DB.formatIDR(p10)}`;
      const l20 = document.getElementById('lblPriceTransferPpob20');
      if (l20) l20.textContent = `Bayar: ${DB.formatIDR(p20)}`;
      const l50 = document.getElementById('lblPriceTransferPpob50');
      if (l50) l50.textContent = `Bayar: ${DB.formatIDR(p50)}`;
      const l100 = document.getElementById('lblPriceTransferPpob100');
      if (l100) l100.textContent = `Bayar: ${DB.formatIDR(p100)}`;
      this.renderPpobHistory();
    } else {
      if (mainTitle) mainTitle.textContent = 'Transfer Saldo Komisi';
      if (subTitle) subTitle.textContent = 'Pindahkan bonus afiliasi ke saldo utama siap pakai / WD';
      if (srcTitle) srcTitle.textContent = 'Wallet Tambah Teman';
      if (srcBalEl) srcBalEl.textContent = DB.formatIDR(affBal);
      if (srcTag) srcTag.textContent = 'Komisi Afiliasi';
      if (destTitle) destTitle.textContent = 'Wallet Utama (Saldo Bebas)';
      if (destBalEl) destBalEl.textContent = DB.formatIDR(walletBal);
      if (destTag) destTag.textContent = 'Siap Tarik (WD) / Investasi';
      if (targetGroup) targetGroup.style.display = 'none';
      if (recipientBadge) recipientBadge.style.display = 'none';
      if (ppobSection) ppobSection.style.display = 'none';
      if (generalAmountSection) generalAmountSection.style.display = 'block';
      if (infoBanner) infoBanner.textContent = 'Saldo yang dipindahkan ke Wallet Utama akan langsung bertambah secara realtime dan siap ditarik (WD) ke rekening bank atau digunakan untuk membeli paket investasi.';
      if (lblLeft) lblLeft.textContent = 'Sisa Saldo Komisi:';
      if (lblRight) lblRight.textContent = 'Estimasi Saldo Baru:';
      if (maxNotice) maxNotice.textContent = `Maksimal: ${DB.formatIDR(affBal)}`;
      if (inputEl) {
        inputEl.max = affBal;
        inputEl.value = affBal > 0 ? (affBal <= 100000 ? affBal : 50000) : 0;
      }
    }

    if (triggerPreview) {
      this.updateTransferPreview();
    }
  },

  setTransferPpobCategory(cat) {
    this.transferPpobCat = cat === 'pln' ? 'pln' : 'pulsa';
    const btnPulsa = document.getElementById('btnTransferPpobCatPulsa');
    const btnPln = document.getElementById('btnTransferPpobCatPln');
    const lbl = document.getElementById('transferPpobDestLabel');
    const prefix = document.getElementById('transferPpobDestPrefix');
    const input = document.getElementById('transferPpobDestInput');
    const hint = document.getElementById('transferPpobDestHint');

    if (btnPulsa) btnPulsa.classList.toggle('active', this.transferPpobCat === 'pulsa');
    if (btnPln) btnPln.classList.toggle('active', this.transferPpobCat === 'pln');

    if (this.transferPpobCat === 'pln') {
      if (lbl) lbl.textContent = 'Nomor Meter / ID Pelanggan PLN:';
      if (prefix) prefix.textContent = '⚡';
      if (input) input.placeholder = 'Contoh: 14234567890 / 52123456789';
      if (hint) hint.textContent = 'Masukkan ID Pelanggan atau No. Meter Token Listrik PLN.';
    } else {
      if (lbl) lbl.textContent = 'Nomor HP Tujuan:';
      if (prefix) prefix.textContent = '📞';
      if (input) input.placeholder = 'Contoh: 081234567890';
      if (hint) hint.textContent = 'Masukkan nomor HP penerima pulsa (Semua operator).';
    }

    const destTitle = document.getElementById('transferDestTitleText');
    if (destTitle && this.currentTransferType === 'ppob') {
      destTitle.textContent = this.transferPpobCat === 'pln' ? 'Token Listrik PLN' : 'Pulsa Seluler';
    }

    this.updateTransferPreview();
  },

  setTransferPpobDenom(amt) {
    this.transferPpobDenom = Number(amt) || 10000;
    const denoms = [10000, 20000, 50000, 100000];
    const ids = {
      10000: 'btnPpobTransDenom10',
      20000: 'btnPpobTransDenom20',
      50000: 'btnPpobTransDenom50',
      100000: 'btnPpobTransDenom100'
    };
    denoms.forEach(d => {
      const el = document.getElementById(ids[d]);
      if (el) el.classList.toggle('active', d === this.transferPpobDenom);
    });

    const destBalEl = document.getElementById('transferDestBalText');
    if (destBalEl && this.currentTransferType === 'ppob') {
      const price = this.getPpobPrice(this.transferPpobDenom);
      destBalEl.textContent = `${DB.formatIDR(this.transferPpobDenom)} (Bayar: ${DB.formatIDR(price)})`;
    }

    this.updateTransferPreview();
  },

  onTransferTargetInput() {
    if (this.currentTransferType !== 'member') return;
    const user = Auth.getUser();
    const inputEl = document.getElementById('transferTargetUserInput');
    const badgeEl = document.getElementById('transferRecipientBadge');
    const badgeText = document.getElementById('transferRecipientBadgeText');
    if (!badgeEl || !badgeText) return;

    const val = (inputEl ? inputEl.value : '').trim();
    if (!val) {
      badgeEl.style.display = 'none';
      return;
    }

    badgeEl.style.display = 'flex';
    const found = typeof Affiliate !== 'undefined' && Affiliate.lookupMember ? Affiliate.lookupMember(val, user ? user.id : null) : null;
    if (!found) {
      badgeEl.className = 'transfer-recipient-badge error';
      badgeText.textContent = `❌ Member "${val}" tidak ditemukan. Pastikan username/kode sponsor benar.`;
      return;
    }
    if (found.isSelf) {
      badgeEl.className = 'transfer-recipient-badge error';
      badgeText.textContent = '⚠️ Tidak dapat mentransfer ke akun Anda sendiri.';
      return;
    }

    badgeEl.className = 'transfer-recipient-badge success';
    badgeText.textContent = `✅ Member Ditemukan: ${found.fullName} (@${found.username})`;
    const destBalEl = document.getElementById('transferDestBalText');
    if (destBalEl) destBalEl.textContent = `@${found.username}`;
  },

  setTransferPercentage(pct) {
    const user = Auth.getUser();
    if (!user) return;

    const isMember = this.currentTransferType === 'member';
    const baseBal = isMember ? (user.walletBalance || 0) : (user.affiliateBalance || 0);
    const inputEl = document.getElementById('transferAmountInput');
    if (!inputEl) return;

    const calcAmount = Math.floor((baseBal * pct) / 100);
    inputEl.value = calcAmount;

    // Highlight active chip
    document.querySelectorAll('.transfer-chip-btn').forEach(btn => {
      btn.classList.toggle('active', btn.textContent.includes(pct + '%'));
    });

    this.updateTransferPreview();
  },

  updateTransferPreview() {
    const user = Auth.getUser();
    if (!user) return;

    const affBal = user.affiliateBalance || 0;
    const walletBal = user.walletBalance || 0;
    const isMember = this.currentTransferType === 'member';
    const isPpob = this.currentTransferType === 'ppob';

    const remAffEl = document.getElementById('transferRemAffBal');
    const newMainEl = document.getElementById('transferNewMainBal');
    const btnConfirm = document.getElementById('btnConfirmTransfer');

    if (isPpob) {
      const denom = this.transferPpobDenom || 10000;
      const price = this.getPpobPrice(denom);
      const remAffBal = Math.max(0, affBal - price);
      if (remAffEl) remAffEl.textContent = DB.formatIDR(remAffBal);
      if (newMainEl) newMainEl.textContent = `${DB.formatIDR(denom)} (Bayar: ${DB.formatIDR(price)})`;

      const destBalEl = document.getElementById('transferDestBalText');
      if (destBalEl) destBalEl.textContent = `${DB.formatIDR(denom)} (Harga: ${DB.formatIDR(price)})`;
      const destTitle = document.getElementById('transferDestTitleText');
      if (destTitle) destTitle.textContent = this.transferPpobCat === 'pln' ? 'Token Listrik PLN' : 'Pulsa Seluler';

      if (btnConfirm) {
        if (price > affBal) {
          btnConfirm.disabled = true;
          btnConfirm.style.opacity = '0.6';
        } else {
          btnConfirm.disabled = false;
          btnConfirm.style.opacity = '1';
        }
      }
      return;
    }

    const maxBal = isMember ? walletBal : affBal;
    const inputEl = document.getElementById('transferAmountInput');
    const amount = Math.max(0, parseInt(inputEl ? inputEl.value : 0) || 0);

    if (isMember) {
      const remMainBal = Math.max(0, walletBal - amount);
      if (remAffEl) remAffEl.textContent = DB.formatIDR(remMainBal);
      if (newMainEl) newMainEl.textContent = DB.formatIDR(amount);
    } else {
      const remAffBal = Math.max(0, affBal - amount);
      const newMainBal = walletBal + amount;
      if (remAffEl) remAffEl.textContent = DB.formatIDR(remAffBal);
      if (newMainEl) newMainEl.textContent = DB.formatIDR(newMainBal);
    }

    if (btnConfirm) {
      if (amount < 10000 || amount > maxBal) {
        btnConfirm.disabled = true;
        btnConfirm.style.opacity = '0.6';
      } else {
        btnConfirm.disabled = false;
        btnConfirm.style.opacity = '1';
      }
    }
  },

  submitTransferModal() {
    const user = Auth.getUser();
    if (!user) return;

    if (this.currentTransferType === 'ppob') {
      const denom = this.transferPpobDenom || 10000;
      const price = this.getPpobPrice(denom);
      const affBal = user.affiliateBalance || 0;
      if (price > affBal) {
        this.showToast(`Saldo komisi tidak mencukupi untuk harga beli PPOB ${DB.formatIDR(price)}!`, 'error');
        return;
      }
      const destInput = document.getElementById('transferPpobDestInput');
      const targetNumber = (destInput ? destInput.value : '').trim();
      const cat = this.transferPpobCat || 'pulsa';
      const isPln = cat === 'pln';

      if (!targetNumber) {
        this.showToast(isPln ? 'Masukkan No. Meter / ID Pelanggan PLN!' : 'Masukkan Nomor HP tujuan!', 'error');
        if (destInput) destInput.focus();
        return;
      }

      if (isPln && targetNumber.length < 9) {
        this.showToast('Nomor Meter / ID Pelanggan PLN minimal 9-12 digit!', 'error');
        if (destInput) destInput.focus();
        return;
      }

      if (!isPln && targetNumber.length < 10) {
        this.showToast('Nomor HP tujuan minimal 10 digit!', 'error');
        if (destInput) destInput.focus();
        return;
      }

      const btnConfirm = document.getElementById('btnConfirmTransfer');
      if (btnConfirm) {
        btnConfirm.disabled = true;
        btnConfirm.innerHTML = '<span>⏳ Mengajukan Konversi PPOB...</span>';
      }

      setTimeout(async () => {
        try {
          const db = DB.get();
          const u = (db.users || []).find(x => x.id === user.id);
          if (!u) {
            this.showToast('User tidak ditemukan.', 'error');
            return;
          }
          u.affiliateBalance = Math.max(0, (u.affiliateBalance || 0) - price);

          const txId = 'TRX-POB-' + Math.floor(100000 + Math.random() * 900000);
          const note = isPln
            ? `Konversi Komisi Tim ke Token Listrik PLN ${DB.formatIDR(denom)} (Harga: ${DB.formatIDR(price)}, No. Meter: ${targetNumber}) - Dalam proses manual Admin`
            : `Konversi Komisi Tim ke Pulsa ${DB.formatIDR(denom)} (Harga: ${DB.formatIDR(price)}, No. HP: ${targetNumber}) - Dalam proses manual Admin`;

          const tx = {
            id: txId,
            userId: u.id,
            username: u.username,
            type: 'ppob_conversion',
            category: cat,
            nominal: denom,
            amount: price,
            netAmount: price,
            targetNumber: targetNumber,
            destinationAccount: (isPln ? 'PLN: ' : 'HP: ') + targetNumber,
            walletSource: 'Wallet Tambah Teman',
            paymentMethod: isPln ? 'Token Listrik PLN' : 'Pulsa Seluler',
            source: 'affiliate',
            status: 'pending',
            ppobStatus: 'Dalam Proses',
            adminNote: '',
            note: note,
            createdAt: new Date().toISOString()
          };

          db.transactions = db.transactions || [];
          db.transactions.unshift(tx);
          await DB.save(db);

          if (Auth && Auth.setUser) {
            Auth.setUser(u);
          } else if (DB && DB.setSession) {
            DB.setSession(u);
          }
          this.closeModal('transferModal');
          this.showToast('PPOB Anda sedang dalam proses manual Admin.', 'success');
          this.renderAll();
        } catch (err) {
          console.error('Submit PPOB transfer error:', err);
          this.showToast('PPOB Anda sedang dalam proses manual Admin.', 'info');
        } finally {
          if (btnConfirm) {
            btnConfirm.disabled = false;
            btnConfirm.innerHTML = '<span>⚡ Konfirmasi Transfer Sekarang</span>';
          }
        }
      }, 300);
      return;
    }

    const isMember = this.currentTransferType === 'member';
    const maxBal = isMember ? (user.walletBalance || 0) : (user.affiliateBalance || 0);
    const inputEl = document.getElementById('transferAmountInput');
    const amount = parseInt(inputEl ? inputEl.value : 0) || 0;

    if (amount < 10000) {
      this.showToast('Minimal nominal transfer adalah Rp 10.000!', 'error');
      if (inputEl) inputEl.focus();
      return;
    }

    if (amount > maxBal) {
      this.showToast(isMember ? 'Saldo Wallet Utama tidak mencukupi!' : 'Saldo komisi tidak mencukupi!', 'error');
      return;
    }

    let targetUser = '';
    if (isMember) {
      const targetInput = document.getElementById('transferTargetUserInput');
      targetUser = (targetInput ? targetInput.value : '').trim();
      if (!targetUser) {
        this.showToast('Masukkan username atau kode referral member tujuan!', 'error');
        if (targetInput) targetInput.focus();
        return;
      }
      const found = typeof Affiliate !== 'undefined' && Affiliate.lookupMember ? Affiliate.lookupMember(targetUser, user.id) : null;
      if (!found || found.isSelf) {
        this.showToast(found && found.isSelf ? 'Tidak dapat mentransfer ke akun sendiri!' : 'Member tujuan tidak ditemukan!', 'error');
        return;
      }
    }

    const btnConfirm = document.getElementById('btnConfirmTransfer');
    if (btnConfirm) {
      btnConfirm.disabled = true;
      btnConfirm.innerHTML = '<span>⏳ Memproses Transfer...</span>';
    }

    setTimeout(async () => {
      let res;
      if (isMember) {
        res = await Affiliate.transferToMember(user.id, targetUser, amount);
      } else {
        res = await Affiliate.transferToMainBalance(user.id, amount);
      }

      if (btnConfirm) {
        btnConfirm.disabled = false;
        btnConfirm.innerHTML = '<span>⚡ Konfirmasi Transfer Sekarang</span>';
      }

      if (res.success) {
        this.closeModal('transferModal');
        this.showToast(res.message, 'success');
        this.renderAll();
      } else {
        this.showToast(res.message || 'Gagal memproses transfer.', 'error');
      }
    }, 400);
  },

  // =========================================================================
  // REQUIREMENT 4: KONVERSI SALDO UTAMA KE PPOB PULSA (PROSES MANUAL ADMIN)
  // =========================================================================
  // =========================================================================
  // REQUIREMENT 4: KONVERSI SALDO UTAMA KE PPOB (PULSA & TOKEN LISTRIK PLN)
  // =========================================================================
  getPpobPrice(denom) {
    const db = DB.get();
    const custom = db.settings?.ppob?.pricing;
    const num = Number(denom) || 10000;
    if (custom && custom[num] !== undefined) return Number(custom[num]);
    const defaultPricing = {
      10000: 12000,
      20000: 22000,
      50000: 52000,
      100000: 102000
    };
    return defaultPricing[num] || (num + 2000);
  },

  openMainWalletPpobModal(category = 'pulsa') {
    const user = Auth.getUser();
    if (!user) {
      this.showToast('Silakan login terlebih dahulu untuk konversi PPOB!', 'info');
      this.openModal('authModal');
      return;
    }

    const db = DB.get();
    const ppobSettings = (db.settings && db.settings.ppob) || { enabled: true, pulsaEnabled: true, plnEnabled: true };
    if (ppobSettings.enabled === false) {
      this.showToast('Layanan PPOB sedang ditutup sementara oleh Administrator.', 'warning');
      return;
    }

    this.mainWalletPpobCategory = category === 'pln' ? 'pln' : 'pulsa';
    this.mainWalletPpobDenom = 10000;

    const balEl = document.getElementById('mainWalletPpobBalDisplay');
    if (balEl) balEl.textContent = DB.formatIDR(user.walletBalance || 0);

    const phoneInput = document.getElementById('mainWalletPpobPhoneInput');
    if (phoneInput) {
      if (this.mainWalletPpobCategory === 'pulsa' && user.phone) {
        phoneInput.value = user.phone;
      } else {
        phoneInput.value = '';
      }
    }

    // Tampilkan catatan panduan admin jika ada
    const noticeEl = document.getElementById('mainWalletPpobNoticeText');
    if (noticeEl && ppobSettings.notice) {
      noticeEl.innerHTML = escapeHtml(ppobSettings.notice);
    }

    // Sinkronkan label harga jual di tombol
    const p10 = this.getPpobPrice(10000);
    const p20 = this.getPpobPrice(20000);
    const p50 = this.getPpobPrice(50000);
    const p100 = this.getPpobPrice(100000);
    const l10 = document.getElementById('lblPricePpob10');
    if (l10) l10.textContent = `Bayar: ${DB.formatIDR(p10)}`;
    const l20 = document.getElementById('lblPricePpob20');
    if (l20) l20.textContent = `Bayar: ${DB.formatIDR(p20)}`;
    const l50 = document.getElementById('lblPricePpob50');
    if (l50) l50.textContent = `Bayar: ${DB.formatIDR(p50)}`;
    const l100 = document.getElementById('lblPricePpob100');
    if (l100) l100.textContent = `Bayar: ${DB.formatIDR(p100)}`;

    this.setMainWalletPpobCategory(this.mainWalletPpobCategory);
    this.setMainWalletPpobDenom(10000);
    this.renderPpobHistory();
    this.openModal('mainWalletPpobModal');
  },

  setMainWalletPpobCategory(category) {
    this.mainWalletPpobCategory = category === 'pln' ? 'pln' : 'pulsa';
    const isPln = this.mainWalletPpobCategory === 'pln';

    const btnPulsa = document.getElementById('btnMainPpobCatPulsa');
    const btnPln = document.getElementById('btnMainPpobCatPln');
    if (btnPulsa) btnPulsa.classList.toggle('active', !isPln);
    if (btnPln) btnPln.classList.toggle('active', isPln);

    const iconEl = document.getElementById('mainWalletPpobHeaderIcon');
    if (iconEl) iconEl.textContent = isPln ? '⚡' : '📱';

    const titleEl = document.getElementById('mainWalletPpobModalTitle');
    if (titleEl) titleEl.textContent = isPln ? 'Konversi Token Listrik PLN' : 'Konversi Pulsa Seluler';

    const subtitleEl = document.getElementById('mainWalletPpobModalSubtitle');
    if (subtitleEl) subtitleEl.textContent = isPln ? 'Beli Token PLN Prabayar dari Saldo Utama' : 'Beli Pulsa Seluler dari Saldo Utama';

    const labelEl = document.getElementById('mainWalletPpobDestLabel');
    if (labelEl) labelEl.textContent = isPln ? 'Nomor Meter / ID Pelanggan PLN:' : 'Nomor Handphone Tujuan:';

    const prefixEl = document.getElementById('mainWalletPpobDestPrefix');
    if (prefixEl) prefixEl.textContent = isPln ? '⚡' : '📞';

    const hintEl = document.getElementById('mainWalletPpobDestHint');
    if (hintEl) hintEl.textContent = isPln ? 'Masukkan 11-12 digit No. Meter atau ID Pelanggan PLN Prabayar.' : 'Pastikan nomor HP aktif dan benar (Semua operator seluler).';

    const phoneInput = document.getElementById('mainWalletPpobPhoneInput');
    if (phoneInput) {
      phoneInput.placeholder = isPln ? 'Contoh: 14234567890' : 'Contoh: 081234567890';
      if (!isPln) {
        const user = Auth.getUser();
        if (user && user.phone && !phoneInput.value) {
          phoneInput.value = user.phone;
        }
      }
    }

    const btnConfirm = document.getElementById('btnConfirmMainWalletPpob');
    if (btnConfirm) {
      btnConfirm.innerHTML = isPln ? '<span>⚡ Konfirmasi Beli Token PLN</span>' : '<span>📱 Konfirmasi Beli Pulsa</span>';
    }

    this.setMainWalletPpobDenom(this.mainWalletPpobDenom || 10000);
  },

  setMainWalletPpobDenom(denom) {
    this.mainWalletPpobDenom = Number(denom) || 10000;
    const price = this.getPpobPrice(this.mainWalletPpobDenom);
    const user = Auth.getUser();
    const walletBal = (user && user.walletBalance) || 0;

    const map = {
      10000: 'btnMainPpob10',
      20000: 'btnMainPpob20',
      50000: 'btnMainPpob50',
      100000: 'btnMainPpob100'
    };
    Object.keys(map).forEach(key => {
      const el = document.getElementById(map[key]);
      if (el) el.classList.toggle('active', Number(key) === this.mainWalletPpobDenom);
    });

    const nomEl = document.getElementById('mainWalletPpobNominalPreview');
    if (nomEl) nomEl.textContent = DB.formatIDR(this.mainWalletPpobDenom);

    const amtEl = document.getElementById('mainWalletPpobAmountPreview');
    if (amtEl) amtEl.textContent = `-${DB.formatIDR(price)}`;

    const remEl = document.getElementById('mainWalletPpobRemBalPreview');
    if (remEl) remEl.textContent = DB.formatIDR(Math.max(0, walletBal - price));

    const btnConfirm = document.getElementById('btnConfirmMainWalletPpob');
    if (btnConfirm) {
      if (price > walletBal) {
        btnConfirm.disabled = true;
        btnConfirm.style.opacity = '0.6';
      } else {
        btnConfirm.disabled = false;
        btnConfirm.style.opacity = '1';
      }
    }
  },

  async submitMainWalletPpob() {
    const user = Auth.getUser();
    if (!user) return;
    const walletBal = user.walletBalance || 0;
    const denom = this.mainWalletPpobDenom || 10000;
    const price = this.getPpobPrice(denom);
    const isPln = this.mainWalletPpobCategory === 'pln';

    const db = DB.get();
    const ppobSettings = (db.settings && db.settings.ppob) || { enabled: true, pulsaEnabled: true, plnEnabled: true };
    if (ppobSettings.enabled === false) {
      this.showToast('Layanan PPOB sedang dinonaktifkan oleh administrator.', 'warning');
      return;
    }
    if (isPln && ppobSettings.plnEnabled === false) {
      this.showToast('Layanan Token Listrik PLN sedang dinonaktifkan oleh administrator.', 'warning');
      return;
    }
    if (!isPln && ppobSettings.pulsaEnabled === false) {
      this.showToast('Layanan Pulsa Seluler sedang dinonaktifkan oleh administrator.', 'warning');
      return;
    }

    if (price > walletBal) {
      this.showToast(`Saldo Utama tidak mencukupi untuk harga ${DB.formatIDR(price)} (Pulsa/PLN ${DB.formatIDR(denom)})!`, 'error');
      return;
    }

    const phoneInput = document.getElementById('mainWalletPpobPhoneInput');
    const targetVal = (phoneInput ? phoneInput.value : '').trim();
    if (!targetVal) {
      this.showToast(isPln ? 'Masukkan Nomor Meter atau ID Pelanggan PLN!' : 'Masukkan nomor handphone tujuan pulsa!', 'error');
      if (phoneInput) phoneInput.focus();
      return;
    }

    if (isPln && targetVal.length < 9) {
      this.showToast('Nomor Meter / ID Pelanggan PLN minimal 9-12 digit!', 'error');
      if (phoneInput) phoneInput.focus();
      return;
    }

    if (!isPln && targetVal.length < 10) {
      this.showToast('Nomor handphone minimal 10 digit!', 'error');
      if (phoneInput) phoneInput.focus();
      return;
    }

    const btnConfirm = document.getElementById('btnConfirmMainWalletPpob');
    if (btnConfirm) {
      btnConfirm.disabled = true;
      btnConfirm.innerHTML = `<span>⏳ Mengajukan Pembelian ${isPln ? 'Token PLN' : 'Pulsa'}...</span>`;
    }

    setTimeout(async () => {
      try {
        const freshDb = DB.get();
        const u = (freshDb.users || []).find(x => x.id === user.id);
        if (!u) {
          this.showToast('Akun pengguna tidak ditemukan.', 'error');
          return;
        }

        u.walletBalance = Math.max(0, (u.walletBalance || 0) - price);

        const txId = 'TRX-POB-' + Math.floor(100000 + Math.random() * 900000);
        const tx = {
          id: txId,
          userId: u.id,
          username: u.username,
          type: 'ppob_conversion',
          category: isPln ? 'pln' : 'pulsa',
          nominal: denom,
          amount: price,
          netAmount: price,
          targetNumber: targetVal,
          destinationAccount: (isPln ? 'PLN: ' : 'HP: ') + targetVal,
          source: 'main_wallet',
          walletSource: 'Saldo Utama',
          paymentMethod: isPln ? 'Token Listrik PLN' : 'Pulsa Seluler',
          status: 'pending',
          ppobStatus: 'Dalam Proses',
          adminNote: '',
          note: `Beli ${isPln ? 'Token Listrik PLN' : 'Pulsa'} ${DB.formatIDR(denom)} (Harga: ${DB.formatIDR(price)}) dari Saldo Utama (${isPln ? 'No. Meter: ' : 'No. HP: '}${targetVal}) - Dalam proses manual Admin`,
          createdAt: new Date().toISOString()
        };

        freshDb.transactions = freshDb.transactions || [];
        freshDb.transactions.unshift(tx);
        await DB.save(freshDb);

        if (Auth && Auth.setUser) {
          Auth.setUser(u);
        } else if (DB && DB.setSession) {
          DB.setSession(u);
        }

        this.closeModal('mainWalletPpobModal');
        this.showToast('PPOB Anda sedang dalam proses manual Admin.', 'success');
        this.renderAll();
      } catch (err) {
        console.error('[PPOB Submit Error]', err);
        this.showToast('PPOB Anda sedang dalam proses manual Admin.', 'info');
      } finally {
        if (btnConfirm) {
          btnConfirm.disabled = false;
          btnConfirm.innerHTML = isPln ? '<span>⚡ Konfirmasi Beli Token PLN</span>' : '<span>📱 Konfirmasi Beli Pulsa</span>';
        }
      }
    }, 350);
  },

  // Riwayat & Status Pengisian PPOB Member (Req 2)
  renderPpobHistory() {
    const user = Auth.getUser();
    const listEl = document.getElementById('mainWalletPpobHistoryList');
    const wrapEl = document.getElementById('mainWalletPpobHistoryWrap');
    const countEl = document.getElementById('mainWalletPpobHistoryCount');

    const transferListEl = document.getElementById('transferPpobHistoryList');
    const transferWrapEl = document.getElementById('transferPpobHistoryWrap');
    const transferCountEl = document.getElementById('transferPpobHistoryCount');

    const db = DB.get();
    const ppobSettings = (db.settings && db.settings.ppob) || {};
    const showStatus = ppobSettings.showProcessStatus !== false;

    if (wrapEl) wrapEl.style.display = showStatus ? 'block' : 'none';
    if (transferWrapEl) transferWrapEl.style.display = showStatus ? 'block' : 'none';

    if (!showStatus) return;

    if (!user) {
      const emptyUserHtml = '<div style="font-size: 11px; color: #94A3B8; text-align: center; padding: 8px;">Silakan login untuk melihat riwayat pengisian.</div>';
      if (listEl) listEl.innerHTML = emptyUserHtml;
      if (transferListEl) transferListEl.innerHTML = emptyUserHtml;
      return;
    }

    const txs = (db.transactions || [])
      .filter(t => t.type === 'ppob_conversion' && t.userId === user.id)
      .sort((a, b) => {
        const tA = new Date(a.createdAt || a.date || 0).getTime();
        const tB = new Date(b.createdAt || b.date || 0).getTime();
        return tB - tA;
      })
      .slice(0, 5);

    const countText = `${txs.length} Pengajuan Terakhir`;
    if (countEl) countEl.textContent = countText;
    if (transferCountEl) transferCountEl.textContent = countText;

    if (txs.length === 0) {
      const emptyHtml = '<div style="font-size: 11px; color: #94A3B8; text-align: center; padding: 10px; background: #F8FAFC; border-radius: 8px;">Belum ada riwayat pengisian PPOB.</div>';
      if (listEl) listEl.innerHTML = emptyHtml;
      if (transferListEl) transferListEl.innerHTML = emptyHtml;
      return;
    }

    const historyHtml = txs.map(t => {
      const isPln = t.category === 'pln' || (t.note || '').toLowerCase().includes('listrik') || (t.destinationAccount || '').toLowerCase().includes('pln');
      const icon = isPln ? '⚡' : '📱';
      const label = isPln ? 'Token PLN' : 'Pulsa';
      const target = escapeHtml(t.targetNumber || t.destinationAccount || '-');
      const nominal = t.nominal ? DB.formatIDR(t.nominal) : DB.formatIDR(t.amount);
      const price = DB.formatIDR(t.amount);

      // Status: Dalam Proses, Selesai, Gangguan
      let statusBadge = '<span class="badge-status pending" style="font-size: 9.5px; padding: 2px 7px;">⏳ DALAM PROSES</span>';
      if (t.status === 'approved' || t.status === 'completed' || t.ppobStatus === 'Selesai') {
        statusBadge = '<span class="badge-status approved" style="font-size: 9.5px; padding: 2px 7px;">✅ SELESAI</span>';
      } else if (t.status === 'rejected' || t.status === 'troubled' || t.status === 'failed' || t.ppobStatus === 'Gangguan') {
        statusBadge = '<span class="badge-status rejected" style="font-size: 9.5px; padding: 2px 7px;">⚠️ GANGGUAN</span>';
      }

      const noteText = t.adminNote || (t.note && t.note.includes('SN/Ket:') ? t.note.split('SN/Ket:')[1].trim() : '') || t.rejectReason || '';

      return `
        <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 9px 11px; font-size: 11px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <strong style="color: #0F172A; display: flex; align-items: center; gap: 4px;">
              <span>${icon}</span> ${label} ${nominal}
            </strong>
            ${statusBadge}
          </div>
          <div style="display: flex; justify-content: space-between; color: #64748B; font-size: 10.5px;">
            <span>Tujuan: <strong style="color: #334155;">${target}</strong></span>
            <span>Bayar: <strong style="color: #B45309;">${price}</strong></span>
          </div>
          ${noteText ? `
            <div style="margin-top: 5px; padding: 5px 8px; background: rgba(245, 158, 11, 0.1); border-left: 3px solid #F59E0B; border-radius: 4px; font-size: 10px; color: #92400E; word-break: break-all;">
              <strong>Keterangan / SN:</strong> ${escapeHtml(noteText)}
            </div>
          ` : ''}
          <div style="font-size: 9px; color: #94A3B8; margin-top: 4px; text-align: right;">
            ${DB.formatWibDateTime(t.createdAt)} WIB
          </div>
        </div>
      `;
    }).join('');

    if (listEl) listEl.innerHTML = historyHtml;
    if (transferListEl) transferListEl.innerHTML = historyHtml;
  },

  // =========================================================================
  // REQUIREMENT 1: KLAIM BONUS TARGET KEPEMIMPINAN KE SALDO UTAMA
  // =========================================================================
  async claimLeaderBonus(milestoneName) {
    const user = Auth.getUser();
    if (!user) {
      this.showToast('Silakan login terlebih dahulu.', 'info');
      return;
    }
    const res = await Affiliate.claimLeaderMilestone(user.id, milestoneName);
    if (res.success) {
      this.showToast(res.message, 'success');
      if (res.user) {
        Auth.setUser(res.user);
      }
      this.renderAll();
      const modal = document.getElementById('leaderMilestonesModal');
      if (modal && modal.classList.contains('active')) {
        const updatedDownlines = Affiliate.getDownlines(user.referralCode);
        this.renderLeaderMilestonesModalContent(updatedDownlines);
      }
    } else {
      this.showToast(res.message || 'Gagal mengklaim bonus target kepemimpinan.', 'error');
    }
  },

  openLeaderMilestonesModal() {
    const user = Auth.getUser();
    if (!user) {
      this.showToast('Silakan login terlebih dahulu untuk melihat target kepemimpinan!', 'info');
      this.openModal('authModal');
      return;
    }
    const downlines = Affiliate.getDownlines(user.referralCode);
    const curTurnEl = document.getElementById('leaderModalCurTurnover');
    if (curTurnEl) curTurnEl.textContent = DB.formatIDR(downlines.totalTeamTurnover || 0);
    this.renderLeaderMilestonesModalContent(downlines);
    this.openModal('leaderMilestonesModal');
  },

  renderLeaderMilestonesModalContent(downlines) {
    const container = document.getElementById('leaderMilestonesListContainer');
    if (!container) return;
    const statuses = downlines.milestonesStatus || [];
    if (statuses.length === 0) {
      container.innerHTML = '<div style="text-align:center; padding:15px; color:#64748B;">Tidak ada data target kepemimpinan.</div>';
      return;
    }
    container.innerHTML = statuses.map(m => {
      let actionHtml = '';
      if (m.isClaimed) {
        actionHtml = `
          <button type="button" class="btn-cta-gold" disabled style="margin:0; padding:8px 12px; font-size:11px; background:#10B981; opacity:0.9; cursor:default;">
            ✓ Sudah Diklaim (Masuk Saldo Utama)
          </button>
        `;
      } else if (m.canClaim) {
        actionHtml = `
          <button type="button" class="btn-cta-gold" style="margin:0; padding:8px 12px; font-size:11px; background:linear-gradient(135deg, #F59E0B, #D97706); animation:pulse 2s infinite;" onclick="App.claimLeaderBonus('${escapeHtml(m.name)}')">
            🎁 Klaim Bonus Sekarang (+${DB.formatIDR(m.reward)})
          </button>
        `;
      } else {
        actionHtml = `
          <div style="font-size:10px; color:#94A3B8; background:rgba(0,0,0,0.25); padding:6px 10px; border-radius:8px; text-align:center;">
            🔒 Kurang <strong>${DB.formatIDR(m.turnoverNeeded)}</strong> omset lagi
          </div>
        `;
      }

      const cardBg = m.isClaimed 
        ? 'background: linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(5, 150, 105, 0.05) 100%); border: 1px solid rgba(16, 185, 129, 0.3);' 
        : m.canClaim 
        ? 'background: linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(217, 119, 6, 0.08) 100%); border: 1px solid rgba(245, 158, 11, 0.4); box-shadow: 0 4px 12px rgba(245, 158, 11, 0.15);' 
        : 'background: #FFFFFF; border: 1px solid #E2E8F0;';

      return `
        <div style="${cardBg} border-radius:14px; padding:12px; display:flex; flex-direction:column; gap:8px;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:22px;">${m.badge}</span>
              <div>
                <strong style="font-size:13.5px; color:#0F172A; display:block;">${escapeHtml(m.name)}</strong>
                <span style="font-size:10px; color:#64748B;">Target Omset: ${DB.formatIDR(m.minTurnover)}</span>
              </div>
            </div>
            <div style="text-align:right;">
              <span style="font-size:9.5px; color:#64748B; display:block;">Bonus Reward</span>
              <strong style="font-size:12.5px; color:#F59E0B;">+${DB.formatIDR(m.reward)}</strong>
            </div>
          </div>

          <!-- Progress Bar -->
          <div>
            <div style="display:flex; justify-content:space-between; font-size:9.5px; color:#64748B; margin-bottom:3px;">
              <span>Progres: ${m.progressPct}%</span>
              <span>${DB.formatIDR(downlines.totalTeamTurnover)} / ${DB.formatIDR(m.minTurnover)}</span>
            </div>
            <div style="width:100%; height:6px; background:#E2E8F0; border-radius:99px; overflow:hidden;">
              <div style="width:${m.progressPct}%; height:100%; background:${m.isReached ? '#10B981' : '#38BDF8'}; border-radius:99px; transition:width 0.3s ease;"></div>
            </div>
          </div>

          ${actionHtml}
        </div>
      `;
    }).join('');
  },

  openSignalDetail(signalId) {
    if (!Auth.isLoggedIn()) {
      this.showToast('Detail sinyal trading khusus untuk member terdaftar. Silakan login atau daftar akun terlebih dahulu!', 'info');
      this.openAuthModalWithTab('login');
      return;
    }
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

    // Hash change listener (browser back/forward or manual hash change)
    window.addEventListener('hashchange', () => {
      const h = (window.location.hash || '').replace('#', '').trim();
      const validTabs = ['home', 'markets', 'trade', 'wallet', 'profile'];
      if (h && validTabs.includes(h) && h !== this.currentTab) {
        this.switchTab(h);
      }
    });

    // Auth Switcher between Login & Register tabs
    const authTabLogin = document.getElementById('authTabLogin');
    const authTabRegister = document.getElementById('authTabRegister');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');

    if (authTabLogin && authTabRegister) {
      authTabLogin.addEventListener('click', () => {
        authTabLogin.classList.add('active');
        authTabLogin.style.background = '#FFFFFF';
        authTabLogin.style.color = '#0F172A';
        authTabLogin.style.fontWeight = '700';
        authTabLogin.style.boxShadow = '0 2px 6px rgba(0,0,0,0.08)';

        authTabRegister.classList.remove('active');
        authTabRegister.style.background = 'transparent';
        authTabRegister.style.color = '#64748B';
        authTabRegister.style.fontWeight = '600';
        authTabRegister.style.boxShadow = 'none';

        if (loginForm) loginForm.style.display = 'block';
        if (registerForm) registerForm.style.display = 'none';
      });

      authTabRegister.addEventListener('click', () => {
        authTabRegister.classList.add('active');
        authTabRegister.style.background = '#FFFFFF';
        authTabRegister.style.color = '#0F172A';
        authTabRegister.style.fontWeight = '700';
        authTabRegister.style.boxShadow = '0 2px 6px rgba(0,0,0,0.08)';

        authTabLogin.classList.remove('active');
        authTabLogin.style.background = 'transparent';
        authTabLogin.style.color = '#64748B';
        authTabLogin.style.fontWeight = '600';
        authTabLogin.style.boxShadow = 'none';

        if (registerForm) registerForm.style.display = 'block';
        if (loginForm) loginForm.style.display = 'none';
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

    // Withdrawal amount input realtime net breakdown calculator
    const wdAmountInput = document.getElementById('wdAmountInput');
    if (wdAmountInput) {
      wdAmountInput.addEventListener('input', () => {
        this.updateWithdrawBreakdownCalc();
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
      this.showToast('Fitur profit harian berjalan khusus member. Silakan login atau daftar akun!', 'info');
      this.openAuthModalWithTab('login');
      return;
    }
    const userInvs = Plans.getUserInvestments(user.id);
    const activeInvs = (userInvs || []).filter(i => i.status === 'active');
    if (activeInvs.length === 0) {
      this.showToast('Tampilan profit berjalan kosong karena belum ada paket investasi yang aktif. Silakan pilih paket di bawah!', 'info');
      const car = document.getElementById('tierCarouselContainer');
      if (car) car.scrollIntoView({ behavior: 'smooth' });
    } else {
      const rate = Plans.getUserTodayProfitRate(user.id);
      const formattedRate = rate !== null ? `+${rate.toFixed(2)}%` : '+0.00%';
      this.showToast(`Profit harian berjalan Anda: ${formattedRate} (sesuai ${activeInvs.length} paket aktif).`, 'success');
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
  },

  // Alias PPOB Modal
  openPpobModal(category = 'pulsa') {
    return this.openMainWalletPpobModal(category);
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
window.openMainWalletPpobModal = (cat) => App.openMainWalletPpobModal(cat);
window.openPpobModal = (cat) => App.openMainWalletPpobModal(cat);

// Launch App on DOM ready or immediately if already loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    App.init();
  });
} else {
  App.init();
}

