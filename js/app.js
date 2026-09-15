/**
 * FGT PRO - MAIN APPLICATION CONTROLLER & UI RENDERER
 * Connects DOM events, handles SPA routing, renders views, and synchronizes real-time state.
 */

import { DB } from './db.js';
import { Auth } from './auth.js';
import { Plans } from './plans.js';
import { Affiliate } from './affiliate.js';
import { Payment } from './payment.js';
import { Signals } from './signals.js';
import { Admin } from './admin.js';

// Application State
const App = {
  currentTab: 'home',
  adminTab: 'dashboard',
  marketInterval: null,

  init() {
    // Check URL parameters (e.g. ?ref=KODE & ?view=admin)
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

    // Show quick welcome toast
    setTimeout(() => {
      if (!Auth.isLoggedIn()) {
        this.showToast('Selamat datang di FGT Pro! Silakan login untuk fitur lengkap.', 'info');
      }
    }, 800);
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

    // 2. Render 3-Column Wallet Balance Card
    this.renderWalletSummary(user);

    // 3. Render Plan / VIP Tier Carousel
    this.renderTierCarousel(user, db);

    // 4. Render Live Market Tickers
    this.renderMarketTickers();

    // 5. Render Trading / CTA Banner
    this.renderTradingBanner(user);

    // 6. Render Prof GPT Signals
    this.renderSignals();

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
      greetingEl.innerHTML = `Hi <span class="user-name">${user.fullName || user.username}</span>,`;
      avatarEl.classList.add('logged-in');
      avatarEl.innerHTML = `<span>${(user.username || 'U')[0].toUpperCase()}</span><span class="online-dot"></span>`;
    } else {
      greetingEl.innerHTML = `Hi guest,`;
      avatarEl.classList.remove('logged-in');
      avatarEl.innerHTML = `<span>👤</span>`;
    }
  },

  // 2. 3-Column Wallet Balance Card
  renderWalletSummary(user) {
    const mainBalEl = document.getElementById('valMainBalance');
    const affBalEl = document.getElementById('valAffiliateBalance');
    const pointEl = document.getElementById('valPoint');

    if (user) {
      mainBalEl.textContent = DB.formatIDR(user.walletBalance);
      affBalEl.textContent = DB.formatIDR(user.affiliateBalance);
      pointEl.textContent = user.points || 0;
    } else {
      mainBalEl.textContent = 'IDR 0';
      affBalEl.textContent = 'IDR 0';
      pointEl.textContent = '0';
    }
  },

  // 3. Tier Carousel (Learn, Rookie, Sophomore, VIP)
  renderTierCarousel(user, db) {
    const container = document.getElementById('tierCarouselContainer');
    if (!container) return;

    const userInvestments = user ? Plans.getUserInvestments(user.id) : [];

    container.innerHTML = db.plans.map(plan => {
      const isUserActiveInPlan = userInvestments.some(inv => inv.planId === plan.id);
      
      return `
        <div class="tier-card ${plan.theme || 'theme-learn'}">
          <div class="tier-header">
            <div class="tier-title-wrap">
              <span class="tier-title">${plan.name}</span>
              <span class="tier-info-icon" onclick="App.openPlanModal('${plan.id}')" title="Detail Paket">ⓘ</span>
            </div>
            <span class="tier-amount">${plan.priceDisplay || 'US$0.00'}</span>
          </div>
          <div class="tier-badge-profit">
            <span>📈 Profit Harian: ${plan.minDailyProfit}% - ${plan.maxDailyProfit}%</span>
          </div>
          <div class="tier-actions">
            <button class="tier-btn btn-topup" onclick="App.handlePlanTopUp('${plan.id}')">
              <span>+ Top Up</span>
            </button>
            <button class="tier-btn btn-refund" onclick="App.handlePlanRefund('${plan.id}')">
              <span>Refund</span>
            </button>
            ${isUserActiveInPlan ? `
              <button class="tier-btn btn-active">
                <span>✓ Active</span>
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

    const tickers = Signals.getMarketTickers();
    container.innerHTML = tickers.map(t => {
      const changeClass = t.change >= 0 ? 'up' : 'down';
      const changeSign = t.change >= 0 ? '+' : '';
      return `
        <div class="ticker-card" onclick="App.switchTab('markets')">
          <div class="ticker-top">
            <div class="ticker-flag-pair">
              <span class="flag-icon first">${t.icon1 || '🌐'}</span>
              <span class="flag-icon second">${t.icon2 || '🇺🇸'}</span>
            </div>
            <span class="ticker-symbol">${t.name}</span>
          </div>
          <div class="ticker-price">${t.price.toLocaleString('en-US', { minimumFractionDigits: t.price < 10 ? 4 : 2 })}</div>
          <div class="ticker-footer">
            <span class="ticker-change ${changeClass}">${changeSign}${t.change}%</span>
            <span class="ticker-time">${t.time}</span>
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

      const claimBtn = document.getElementById('btnClaimProfit');
      if (totalPendingProfit > 0) {
        claimBtn.innerHTML = `<span>💰 Klaim Profit Harian (${DB.formatIDR(totalPendingProfit)})</span>`;
        claimBtn.style.opacity = '1';
        claimBtn.removeAttribute('disabled');
      } else {
        claimBtn.innerHTML = `<span>⏳ Menunggu Siklus Profit Berikutnya</span>`;
        claimBtn.style.opacity = '0.75';
      }
    } else {
      guestBox.style.display = 'block';
      authBox.style.display = 'none';
    }
  },

  // 6. Prof GPT Signals Feed
  renderSignals() {
    const feed = document.getElementById('signalFeedContainer');
    if (!feed) return;

    const signals = Signals.getSignals();
    feed.innerHTML = signals.map(sig => `
      <div class="signal-card" onclick="App.openSignalDetail('${sig.id}')">
        <div class="signal-card-header">
          <div class="signal-pair-wrap">
            <div class="ticker-flag-pair">
              <span class="flag-icon first">${sig.flags[0] || '🇬🇧'}</span>
              <span class="flag-icon second">${sig.flags[1] || '🇳🇿'}</span>
            </div>
            <div>
              <span class="signal-pair-name">${sig.pair}</span>
              <span class="signal-time-ago"> · ${sig.timeAgo}</span>
            </div>
          </div>
          <span class="badge-signal-action ${sig.action.toLowerCase()}">${sig.action}</span>
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
      let icon = '💵';
      let title = t.paymentMethod || t.type;
      let isPlus = t.type === 'deposit' || t.type === 'profit_claim' || t.type === 'sponsor_bonus' || t.type === 'rabat_bonus';
      let amountColor = isPlus ? '#22C55E' : '#EF4444';
      let sign = isPlus ? '+' : '-';

      return `
        <div style="background:#FFFFFF; border-radius:14px; padding:12px 14px; box-shadow:var(--card-shadow); border:1px solid #F1F5F9; display:flex; align-items:center; justify-content:space-between;">
          <div style="display:flex; align-items:center; gap:10px;">
            <div style="width:36px; height:36px; border-radius:10px; background:#F8FAFC; display:flex; align-items:center; justify-content:center; font-size:18px;">
              ${icon}
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

  // Render Trade View Page
  renderTradeView(user) {
    const listEl = document.getElementById('tradeActivePlansList');
    if (!user) {
      listEl.innerHTML = `
        <div style="text-align:center; padding:30px 20px; background:#FFFFFF; border-radius:18px; box-shadow:var(--card-shadow);">
          <div style="font-size:36px; margin-bottom:10px;">📊</div>
          <h3 style="font-size:16px; font-weight:800; margin-bottom:6px;">Trading & Investasi AI</h3>
          <p style="font-size:12px; color:#64748B; margin-bottom:16px;">Login sekarang untuk melihat portofolio investasi dan klaim profit harian.</p>
          <button class="btn-cta-gold" onclick="App.openModal('authModal')">Login Sekarang</button>
        </div>
      `;
      return;
    }

    const investments = Plans.getUserInvestments(user.id);
    if (investments.length === 0) {
      listEl.innerHTML = `
        <div style="text-align:center; padding:30px 20px; background:#FFFFFF; border-radius:18px; box-shadow:var(--card-shadow);">
          <div style="font-size:36px; margin-bottom:10px;">🚀</div>
          <h3 style="font-size:16px; font-weight:800; margin-bottom:6px;">Belum Ada Paket Aktif</h3>
          <p style="font-size:12px; color:#64748B; margin-bottom:16px;">Pilih salah satu paket trading AI di bawah untuk mulai mendapatkan profit harian acak!</p>
          <button class="btn-cta-gold" onclick="App.openPlanModal('plan-learn')">Pilih Paket Sekarang</button>
        </div>
      `;
      return;
    }

    listEl.innerHTML = investments.map(inv => `
      <div style="background:#FFFFFF; border-radius:18px; padding:16px; box-shadow:var(--card-shadow); border:1px solid #E2E8F0; display:flex; flex-direction:column; gap:10px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-weight:800; font-size:15px; color:#0F172A;">Paket ${inv.planName}</span>
          <span class="badge-status active">AKTIF (${inv.daysElapsed}/${inv.durationDays} Hari)</span>
        </div>
        <div style="display:grid; grid-template-columns:repeat(3, 1fr); background:#F8FAFC; border-radius:12px; padding:10px; text-align:center; gap:6px;">
          <div>
            <div style="font-size:10px; color:#64748B;">Modal</div>
            <div style="font-weight:800; font-size:12px;">${DB.formatIDR(inv.capital)}</div>
          </div>
          <div>
            <div style="font-size:10px; color:#64748B;">Rentang Profit</div>
            <div style="font-weight:800; font-size:12px; color:#22C55E;">${inv.minRate}% - ${inv.maxRate}%</div>
          </div>
          <div>
            <div style="font-size:10px; color:#64748B;">Profit Terkumpul</div>
            <div style="font-weight:800; font-size:12px; color:#C89338;">${DB.formatIDR(inv.totalProfitEarned)}</div>
          </div>
        </div>
        ${inv.pendingProfitClaim > 0 ? `
          <div style="display:flex; justify-content:space-between; align-items:center; background:#DCFCE7; border:1px solid #86EFAC; padding:10px 14px; border-radius:12px;">
            <div>
              <div style="font-size:10px; font-weight:700; color:#15803D;">Profit Siap Diklaim Hari Ini:</div>
              <div style="font-size:14px; font-weight:800; color:#166534;">${DB.formatIDR(inv.pendingProfitClaim)}</div>
            </div>
            <button class="tier-btn btn-topup" onclick="App.claimProfit()">Klaim Sekarang</button>
          </div>
        ` : ''}
      </div>
    `).join('');
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
      listEl.innerHTML = '<div style="text-align:center; padding:15px; color:#94A3B8; font-size:12px;">Belum ada anggota di tim Anda. Bagikan kode referral Anda untuk mendapatkan bonus sponsor & rabat!</div>';
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

  // Render Markets View Page with Interactive Chart
  renderMarketsView() {
    const chartCanvas = document.getElementById('marketChartCanvas');
    if (chartCanvas && chartCanvas.getContext) {
      const ctx = chartCanvas.getContext('2d');
      const w = chartCanvas.width = chartCanvas.parentElement.clientWidth || 360;
      const h = chartCanvas.height = 180;

      ctx.clearRect(0, 0, w, h);
      
      // Draw smooth candlestick / area line
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

  // Render Full Admin Control Panel
  renderAdminView() {
    const stats = Admin.getStats();
    const db = DB.get();

    // Stats Counters
    document.getElementById('adminStatUsers').textContent = stats.totalUsers;
    document.getElementById('adminStatDeposits').textContent = DB.formatIDR(stats.totalDeposits);
    document.getElementById('adminStatWithdrawals').textContent = DB.formatIDR(stats.totalWithdrawals);
    document.getElementById('adminStatActiveCapital').textContent = DB.formatIDR(stats.activeCapital);

    // Badges on Tab
    document.getElementById('badgePendingDep').textContent = stats.pendingDepositsCount;
    document.getElementById('badgePendingWd').textContent = stats.pendingWithdrawalsCount;

    // Render Deposit Requests Table
    const depTable = document.getElementById('adminDepositTable');
    const depList = db.transactions.filter(t => t.type === 'deposit');
    depTable.innerHTML = depList.length === 0 ? '<tr><td colspan="6" style="text-align:center;">Tidak ada data deposit</td></tr>' : depList.map(t => `
      <tr>
        <td><strong>${t.id}</strong></td>
        <td>${t.username}</td>
        <td>${t.paymentMethod}</td>
        <td><strong>${DB.formatIDR(t.amount)}</strong></td>
        <td><span class="badge-status ${t.status}">${t.status.toUpperCase()}</span></td>
        <td>
          ${t.status === 'pending' ? `
            <div class="btn-action-group">
              <button class="btn-admin-action approve" onclick="App.approveDeposit('${t.id}')">✓ Approve</button>
              <button class="btn-admin-action reject" onclick="App.rejectDeposit('${t.id}')">✕ Reject</button>
            </div>
          ` : '<span style="color:#64748B;">Selesai</span>'}
        </td>
      </tr>
    `).join('');

    // Render Withdrawal Requests Table
    const wdTable = document.getElementById('adminWithdrawTable');
    const wdList = db.transactions.filter(t => t.type === 'withdraw');
    wdTable.innerHTML = wdList.length === 0 ? '<tr><td colspan="6" style="text-align:center;">Tidak ada data penarikan</td></tr>' : wdList.map(t => `
      <tr>
        <td><strong>${t.id}</strong></td>
        <td>${t.username}</td>
        <td>${t.destinationAccount || t.paymentMethod}</td>
        <td><strong>${DB.formatIDR(t.amount)}</strong> (Net: ${DB.formatIDR(t.netAmount || t.amount)})</td>
        <td><span class="badge-status ${t.status}">${t.status.toUpperCase()}</span></td>
        <td>
          ${t.status === 'pending' ? `
            <div class="btn-action-group">
              <button class="btn-admin-action approve" onclick="App.approveWithdraw('${t.id}')">✓ Approve</button>
              <button class="btn-admin-action reject" onclick="App.rejectWithdraw('${t.id}')">✕ Reject</button>
            </div>
          ` : '<span style="color:#64748B;">Selesai</span>'}
        </td>
      </tr>
    `).join('');

    // Render Plan Settings Table
    const planTable = document.getElementById('adminPlansTable');
    planTable.innerHTML = db.plans.map(p => `
      <tr>
        <td><strong>${p.name}</strong></td>
        <td>${DB.formatIDR(p.minDeposit)} - ${DB.formatIDR(p.maxDeposit)}</td>
        <td><span style="color:#22C55E; font-weight:700;">${p.minDailyProfit}% - ${p.maxDailyProfit}%</span></td>
        <td>${p.durationDays} Hari</td>
        <td>
          <button class="btn-admin-action edit" onclick="App.editPlan('${p.id}')">Edit</button>
        </td>
      </tr>
    `).join('');

    // Render Users Table
    const userTable = document.getElementById('adminUsersTable');
    userTable.innerHTML = db.users.map(u => `
      <tr>
        <td><strong>${u.username}</strong></td>
        <td>${u.fullName || '-'}</td>
        <td>${DB.formatIDR(u.walletBalance)}</td>
        <td>${DB.formatIDR(u.affiliateBalance)}</td>
        <td><span class="badge-status ${u.role === 'admin' ? 'active' : 'pending'}">${u.role.toUpperCase()}</span></td>
        <td>
          <button class="btn-admin-action edit" onclick="App.openEditUserModal('${u.id}')">Kelola</button>
        </td>
      </tr>
    `).join('');
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

  // Switch Admin Sub-tab
  switchAdminTab(tabName) {
    this.adminTab = tabName;
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-admin-tab') === tabName);
    });
    document.querySelectorAll('.admin-tab-pane').forEach(pane => {
      pane.classList.toggle('active', pane.id === `admin-pane-${tabName}`);
    });
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

  // Toast Notification System
  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    let icon = '🔔';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';

    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      toast.style.transition = 'all 0.3s ease';
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
    this.showToast('Fitur refund proteksi modal berlaku setelah periode paket berakhir atau melalui permohonan CS.', 'info');
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

  // Payment Handlers
  openDepositModal() {
    if (!Auth.isLoggedIn()) {
      this.openModal('authModal');
      this.showToast('Silakan login untuk melakukan deposit.', 'info');
      return;
    }
    this.openModal('depositModal');
  },

  openWithdrawModal() {
    if (!Auth.isLoggedIn()) {
      this.openModal('authModal');
      this.showToast('Silakan login untuk melakukan penarikan.', 'info');
      return;
    }
    this.openModal('withdrawModal');
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

    const amount = prompt(`Masukkan jumlah yang ingin ditransfer ke Wallet Balance (Maksimal: ${DB.formatIDR(user.affiliateBalance)}):`, user.affiliateBalance);
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

  // Auth helper
  isLoggedIn() {
    return Auth.isLoggedIn();
  },

  // Edit Plan (Admin)
  editPlan(planId) {
    const plan = Plans.getPlanById(planId);
    if (!plan) return;

    const newMinRate = prompt(`Ubah Min Profit Harian (%) untuk ${plan.name}:`, plan.minDailyProfit);
    if (newMinRate === null) return;

    const newMaxRate = prompt(`Ubah Max Profit Harian (%) untuk ${plan.name}:`, plan.maxDailyProfit);
    if (newMaxRate === null) return;

    const newDuration = prompt(`Ubah Durasi Kontrak (Hari) untuk ${plan.name}:`, plan.durationDays);
    if (newDuration === null) return;

    const res = Admin.savePlan({
      id: plan.id,
      name: plan.name,
      minDailyProfit: parseFloat(newMinRate) || plan.minDailyProfit,
      maxDailyProfit: parseFloat(newMaxRate) || plan.maxDailyProfit,
      durationDays: parseInt(newDuration) || plan.durationDays
    });

    if (res.success) {
      this.showToast(`Paket ${plan.name} berhasil diperbarui!`, 'success');
      this.renderAll();
    }
  },

  // Admin Actions
  approveDeposit(id) {
    const res = Admin.approveDeposit(id);
    if (res.success) {
      this.showToast(res.message, 'success');
      this.renderAll();
    } else {
      this.showToast(res.message, 'error');
    }
  },

  rejectDeposit(id) {
    const reason = prompt('Masukkan alasan penolakan:', 'Bukti transfer tidak sesuai');
    if (reason === null) return;

    const res = Admin.rejectDeposit(id, reason);
    if (res.success) {
      this.showToast(res.message, 'info');
      this.renderAll();
    }
  },

  approveWithdraw(id) {
    const res = Admin.approveWithdrawal(id);
    if (res.success) {
      this.showToast(res.message, 'success');
      this.renderAll();
    }
  },

  rejectWithdraw(id) {
    const reason = prompt('Masukkan alasan penolakan:', 'Data rekening tidak valid');
    if (reason === null) return;

    const res = Admin.rejectWithdrawal(id, reason);
    if (res.success) {
      this.showToast(res.message, 'info');
      this.renderAll();
    }
  },

  triggerDailyProfitAdmin() {
    const res = Admin.triggerProfitYield();
    this.showToast(`Sukses mendistribusikan profit harian acak ke ${res.updatedCount} investasi aktif!`, 'success');
    this.renderAll();
  },

  openEditUserModal(userId) {
    const user = DB.getUserById(userId);
    if (!user) return;

    document.getElementById('adminEditUserId').value = user.id;
    document.getElementById('adminEditUsername').textContent = user.username;
    document.getElementById('adminEditWalletBal').value = user.walletBalance;
    document.getElementById('adminEditAffBal').value = user.affiliateBalance;
    document.getElementById('adminEditPoints').value = user.points || 0;

    this.openModal('adminUserModal');
  },

  saveUserBalanceAdmin() {
    const userId = document.getElementById('adminEditUserId').value;
    const walletBalance = document.getElementById('adminEditWalletBal').value;
    const affiliateBalance = document.getElementById('adminEditAffBal').value;
    const points = document.getElementById('adminEditPoints').value;

    const res = Admin.adjustUserBalance(userId, { walletBalance, affiliateBalance, points });
    if (res.success) {
      this.closeModal('adminUserModal');
      this.showToast(res.message, 'success');
      this.renderAll();
    }
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

    // Admin Sub Tabs
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabName = btn.getAttribute('data-admin-tab');
        this.switchAdminTab(tabName);
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
        const val = depMethodSelect.value;
        document.getElementById('depBankFields').style.display = val === 'bank' ? 'block' : 'none';
        document.getElementById('depQrisFields').style.display = val === 'qris' ? 'block' : 'none';
        document.getElementById('depUsdtFields').style.display = val === 'usdt' ? 'block' : 'none';
      });
    }

    // USDT conversion calculator
    const depUsdtAmountInput = document.getElementById('depUsdtAmountInput');
    if (depUsdtAmountInput) {
      depUsdtAmountInput.addEventListener('input', () => {
        const val = Number(depUsdtAmountInput.value) || 0;
        const rate = DB.get().settings.usdIdrRate || 16250;
        document.getElementById('depUsdtCalculatedIdr').textContent = DB.formatIDR(val * rate);
      });
    }
  },

  // Clipboard copy helper
  copyText(text, label = 'Teks') {
    navigator.clipboard.writeText(text).then(() => {
      this.showToast(`${label} berhasil disalin ke clipboard!`, 'success');
    }).catch(() => {
      // Fallback
      const temp = document.createElement('input');
      temp.value = text;
      document.body.appendChild(temp);
      temp.select();
      document.execCommand('copy');
      temp.remove();
      this.showToast(`${label} berhasil disalin!`, 'success');
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
window.Admin = Admin;

// Launch App on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
