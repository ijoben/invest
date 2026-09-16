/**
 * FGT PRO - STANDALONE ADMIN PAGE CONTROLLER
 * Controls admin.html views, tables, modal actions, and settings.
 */

import { DB } from './db.js';
import { Admin } from './admin.js';
import { Auth } from './auth.js';
import { Plans } from './plans.js';
import { Affiliate } from './affiliate.js';
import { Signals } from './signals.js';

export const AdminPage = {
  currentTab: 'dashboard',

  init() {
    this.bindEvents();
    this.renderAll();
  },

  renderAll() {
    const db = DB.get();
    const stats = Admin.getStats();

    // 1. Dashboard Stats
    document.getElementById('statTotalUsers').textContent = stats.totalUsers;
    document.getElementById('statTotalDeposits').textContent = DB.formatIDR(stats.totalDeposits);
    document.getElementById('statTotalWithdrawals').textContent = DB.formatIDR(stats.totalWithdrawals);
    document.getElementById('statActiveCapital').textContent = DB.formatIDR(stats.activeCapital);

    // Badges
    document.getElementById('badgePendingDep').textContent = stats.pendingDepositsCount;
    document.getElementById('badgePendingWd').textContent = stats.pendingWithdrawalsCount;
    const annBadge = document.getElementById('badgeAnnouncementsCount');
    if (annBadge) annBadge.textContent = (db.announcements || []).length;
    const banBadge = document.getElementById('badgeBannersCount');
    if (banBadge) banBadge.textContent = (db.banners || []).length;

    // 2. Deposit Table
    this.renderDeposits(db);

    // 3. Withdraw Table
    this.renderWithdrawals(db);

    // 4. Plans Table
    this.renderPlans(db);

    // 5. Affiliate Config Values
    this.renderAffiliateSettings(db);

    // 6. Gateway Config Values
    this.renderGatewaySettings(db);

    // 7. Users Table
    this.renderUsers(db);

    // 8. Signals Table
    this.renderSignals(db);

    // 9. Announcements Running Text Table
    this.renderAnnouncements(db);

    // 10. Banner Slider Carousel Table
    this.renderBanners(db);
  },

  // 2. Deposit Table
  renderDeposits(db) {
    const tbody = document.getElementById('depositTableBody');
    const deposits = db.transactions.filter(t => t.type === 'deposit');

    if (deposits.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px; color:#94A3B8;">Tidak ada data deposit.</td></tr>';
      return;
    }

    tbody.innerHTML = deposits.map(t => `
      <tr>
        <td><strong>${t.id}</strong></td>
        <td>${new Date(t.createdAt).toLocaleString('id-ID')}</td>
        <td><strong>${t.username}</strong></td>
        <td>${t.paymentMethod}</td>
        <td><strong style="color:#22C55E;">${DB.formatIDR(t.amount)}</strong></td>
        <td>${t.txid ? `<span style="font-family:var(--font-mono); font-size:10px;">${t.txid.substring(0, 16)}...</span>` : (t.uniqueCode || '-')}</td>
        <td><span class="badge-status ${t.status}">${t.status.toUpperCase()}</span></td>
        <td>
          ${t.status === 'pending' ? `
            <div class="btn-action-group">
              <button class="btn-admin-action approve" onclick="AdminPage.approveDeposit('${t.id}')">✓ Setujui</button>
              <button class="btn-admin-action reject" onclick="AdminPage.rejectDeposit('${t.id}')">✕ Tolak</button>
            </div>
          ` : '<span style="color:#64748B;">Selesai</span>'}
        </td>
      </tr>
    `).join('');
  },

  // 3. Withdraw Table
  renderWithdrawals(db) {
    const tbody = document.getElementById('withdrawTableBody');
    const withdrawals = db.transactions.filter(t => t.type === 'withdraw');

    if (withdrawals.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px; color:#94A3B8;">Tidak ada data penarikan dana.</td></tr>';
      return;
    }

    tbody.innerHTML = withdrawals.map(t => `
      <tr>
        <td><strong>${t.id}</strong></td>
        <td>${new Date(t.createdAt).toLocaleString('id-ID')}</td>
        <td><strong>${t.username}</strong></td>
        <td>${t.walletSource || 'Wallet Balance'}</td>
        <td>${t.destinationAccount || t.paymentMethod}</td>
        <td><strong style="color:#EF4444;">${DB.formatIDR(t.netAmount || t.amount)}</strong> (Total: ${DB.formatIDR(t.amount)})</td>
        <td><span class="badge-status ${t.status}">${t.status.toUpperCase()}</span></td>
        <td>
          ${t.status === 'pending' ? `
            <div class="btn-action-group">
              <button class="btn-admin-action approve" onclick="AdminPage.approveWithdraw('${t.id}')">✓ Setujui</button>
              <button class="btn-admin-action reject" onclick="AdminPage.rejectWithdraw('${t.id}')">✕ Tolak</button>
            </div>
          ` : '<span style="color:#64748B;">Selesai</span>'}
        </td>
      </tr>
    `).join('');
  },

  // 4. Plans Table
  renderPlans(db) {
    const tbody = document.getElementById('plansTableBody');
    tbody.innerHTML = db.plans.map(p => `
      <tr>
        <td><strong>${p.name}</strong></td>
        <td>${DB.formatIDR(p.minDeposit)}</td>
        <td>${DB.formatIDR(p.maxDeposit)}</td>
        <td><span style="color:#22C55E; font-weight:700;">${p.minDailyProfit}% - ${p.maxDailyProfit}% / hari</span></td>
        <td>${p.durationDays} Hari</td>
        <td>${p.activeCount || 0} Member</td>
        <td>
          <button class="btn-admin-action edit" onclick="AdminPage.openEditPlanModal('${p.id}')">Edit Paket</button>
        </td>
      </tr>
    `).join('');
  },

  // 5. Affiliate Config
  renderAffiliateSettings(db) {
    const cfg = db.settings;
    document.getElementById('affCfgSponsor').value = cfg.sponsorBonusPercent || 10;
    
    const r1 = cfg.rabatLevels.find(l => l.level === 1);
    const r2 = cfg.rabatLevels.find(l => l.level === 2);
    const r3 = cfg.rabatLevels.find(l => l.level === 3);

    if (r1) document.getElementById('affCfgL1').value = r1.percent;
    if (r2) document.getElementById('affCfgL2').value = r2.percent;
    if (r3) document.getElementById('affCfgL3').value = r3.percent;
  },

  // 6. Gateway Config
  renderGatewaySettings(db) {
    const cfg = db.settings;
    document.getElementById('gwCfgUsdRate').value = cfg.usdIdrRate || 16250;
    document.getElementById('gwCfgWdFee').value = cfg.withdrawFeePercent || 1.0;
    if (cfg.paymentGateways && cfg.paymentGateways.usdt) {
      document.getElementById('gwCfgTrc20').value = cfg.paymentGateways.usdt.trc20Address || '';
    }
  },

  // 7. Users Table
  renderUsers(db) {
    const tbody = document.getElementById('usersTableBody');
    tbody.innerHTML = db.users.map(u => `
      <tr>
        <td><strong>${u.username}</strong></td>
        <td>${u.fullName || '-'}</td>
        <td>${u.email || u.phone || '-'}</td>
        <td><strong style="color:#22C55E;">${DB.formatIDR(u.walletBalance)}</strong></td>
        <td><strong style="color:#C89338;">${DB.formatIDR(u.affiliateBalance)}</strong></td>
        <td>${u.points || 0}</td>
        <td>${u.referredBy || '<span style="color:#64748B;">-</span>'}</td>
        <td>
          <button class="btn-admin-action edit" onclick="AdminPage.openEditUserModal('${u.id}')">Kelola Saldo</button>
        </td>
      </tr>
    `).join('');
  },

  // 8. Signals Table
  renderSignals(db) {
    const tbody = document.getElementById('signalsTableBody');
    const signals = db.signals || [];
    tbody.innerHTML = signals.map(s => `
      <tr>
        <td><strong>${s.pair}</strong></td>
        <td><span class="badge-signal-action ${s.action.toLowerCase()}">${s.action}</span></td>
        <td>${s.entry}</td>
        <td><span style="color:#22C55E;">${s.tp}</span></td>
        <td><span style="color:#EF4444;">${s.sl}</span></td>
        <td><strong>${s.confidence}%</strong></td>
        <td>${s.timeAgo}</td>
      </tr>
    `).join('');
  },

  // 9. Announcements / Running Text Table
  renderAnnouncements(db) {
    const tbody = document.getElementById('announcementsTableBody');
    if (!tbody) return;
    const list = db.announcements || [];

    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#94A3B8;">Belum ada teks berjalan pengumuman. Klik "+ Tambah Teks Berjalan Baru" di atas.</td></tr>';
      return;
    }

    tbody.innerHTML = list.map(a => `
      <tr>
        <td><strong style="font-family:var(--font-mono); font-size:11px;">${a.id}</strong></td>
        <td style="white-space:normal; max-width:400px; line-height:1.4;">
          <div style="font-weight:600; color:#F8FAFC;">${a.text}</div>
        </td>
        <td><span style="font-size:11px; color:#94A3B8;">${new Date(a.createdAt).toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}</span></td>
        <td>
          <span class="badge-status ${a.active ? 'approved' : 'rejected'}">
            ${a.active ? '● AKTIF' : '○ NONAKTIF'}
          </span>
        </td>
        <td style="text-align:right;">
          <div class="btn-action-group" style="justify-content: flex-end;">
            <button class="btn-admin-action ${a.active ? 'reject' : 'approve'}" onclick="AdminPage.toggleAnnouncementStatus('${a.id}')" title="${a.active ? 'Nonaktifkan' : 'Aktifkan'}">
              ${a.active ? 'Nonaktifkan' : 'Aktifkan'}
            </button>
            <button class="btn-admin-action edit" onclick="AdminPage.openEditAnnouncementModal('${a.id}')" title="Edit Teks">
              Edit
            </button>
            <button class="btn-admin-action delete" onclick="AdminPage.deleteAnnouncement('${a.id}')" title="Hapus">
              Hapus
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  },

  // 10. Banner Slider Carousel Table
  renderBanners(db) {
    const tbody = document.getElementById('bannersTableBody');
    if (!tbody) return;
    const banners = db.banners || [];

    if (banners.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:24px; color:#94A3B8;">Belum ada banner slide. Silakan klik tombol "Upload / Tambah Banner Baru" di atas.</td></tr>';
      return;
    }

    tbody.innerHTML = banners.map(b => {
      const imgUrl = b.imageUrl || 'https://images.unsplash.com/photo-1642543492481-44e81e3914a7?w=900&auto=format&fit=crop&q=80';
      const statusBadge = b.active
        ? '<span class="badge-status approved">AKTIF</span>'
        : '<span class="badge-status rejected">NONAKTIF</span>';

      return `
        <tr>
          <td>
            <img src="${imgUrl}" alt="${b.title || 'Banner'}" class="banner-table-thumb" onerror="this.src='https://images.unsplash.com/photo-1642543492481-44e81e3914a7?w=900&auto=format&fit=crop&q=80'">
          </td>
          <td>
            <div style="font-weight: 700; color: #FFFFFF; font-size: 13px; margin-bottom: 3px;">${b.title || '-'}</div>
            <div style="font-size: 11px; color: #94A3B8; line-height: 1.35; max-width: 320px;">${b.subtitle || '-'}</div>
          </td>
          <td>
            ${b.badge ? `<span class="banner-badge-preview">${b.badge}</span>` : '<span style="color:#64748B;">-</span>'}
          </td>
          <td>
            <span style="font-family: var(--font-mono); font-size: 11px; color: #38BDF8;">${b.actionUrl || 'plans'}</span>
          </td>
          <td>${statusBadge}</td>
          <td>
            <div class="btn-action-group" style="justify-content: flex-end;">
              <button class="btn-admin-action ${b.active ? 'reject' : 'approve'}" onclick="AdminPage.toggleBannerStatus('${b.id}')" title="Ubah status tampil">
                ${b.active ? 'Sembunyikan' : 'Aktifkan'}
              </button>
              <button class="btn-admin-action edit" onclick="AdminPage.openEditBannerModal('${b.id}')" title="Edit banner">
                ✏ Edit
              </button>
              <button class="btn-admin-action delete" onclick="AdminPage.deleteBanner('${b.id}')" title="Hapus banner">
                🗑 Hapus
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  tabTitles: {
    dashboard: 'Dashboard Overview',
    deposits: 'Konfirmasi Deposit',
    withdrawals: 'Konfirmasi Penarikan',
    gateways: 'Gateway & Rekening',
    plans: 'Plan Investasi & Profit',
    affiliate: 'Sponsor & Rabat ROI',
    signals: 'Sinyal Prof GPT',
    announcements: 'Teks Berjalan & Notif',
    banners: 'Banner Slider Carousel',
    users: 'Kelola Pengguna'
  },

  // Sidebar Drawer Controls
  openSidebar() {
    const sidebar = document.getElementById('adminSidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    if (sidebar) sidebar.classList.add('open');
    if (backdrop) backdrop.classList.add('active');
    document.body.classList.add('sidebar-open');
  },

  closeSidebar() {
    const sidebar = document.getElementById('adminSidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    if (sidebar) sidebar.classList.remove('open');
    if (backdrop) backdrop.classList.remove('active');
    document.body.classList.remove('sidebar-open');
  },

  toggleSidebar() {
    const sidebar = document.getElementById('adminSidebar');
    if (sidebar && sidebar.classList.contains('open')) {
      this.closeSidebar();
    } else {
      this.openSidebar();
    }
  },

  // Actions
  switchTab(tabId) {
    this.currentTab = tabId;
    document.querySelectorAll('.admin-nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });
    document.querySelectorAll('.admin-view-panel').forEach(pane => {
      pane.classList.toggle('active', pane.id === `pane-${tabId}`);
    });

    const titleEl = document.getElementById('currentSectionTitle');
    if (titleEl && this.tabTitles[tabId]) {
      titleEl.textContent = this.tabTitles[tabId];
    }

    // Auto close sliding sidebar drawer on item select
    this.closeSidebar();
  },

  resetDemoDatabase() {
    if (!confirm('Apakah Anda yakin ingin mereset seluruh database demo ke kondisi awal?')) {
      return;
    }
    DB.reset();
    this.showToast('Database demo berhasil di-reset ke kondisi awal!', 'success');
    this.renderAll();
    this.closeSidebar();
  },

  logout() {
    if (!confirm('Apakah Anda yakin ingin keluar (logout) dari panel Admin FGT Pro?')) return;
    Auth.logout();
    this.showToast('Logout admin berhasil. Mengalihkan ke halaman utama...', 'success');
    setTimeout(() => {
      window.location.href = './';
    }, 600);
  },

  triggerDailyProfit() {
    const res = Admin.triggerProfitYield();
    this.showToast(`Distribusi profit harian acak berhasil dijalankan ke ${res.updatedCount} investasi aktif!`, 'success');
    this.renderAll();
  },

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
    const reason = prompt('Masukkan alasan penolakan deposit:', 'Bukti transfer tidak valid');
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
    const reason = prompt('Masukkan alasan penolakan penarikan (saldo akan di-refund):', 'Data rekening tujuan tidak sesuai');
    if (reason === null) return;
    const res = Admin.rejectWithdrawal(id, reason);
    if (res.success) {
      this.showToast(res.message, 'info');
      this.renderAll();
    }
  },

  saveAffiliateSettings() {
    const sponsor = Number(document.getElementById('affCfgSponsor').value);
    const l1 = Number(document.getElementById('affCfgL1').value);
    const l2 = Number(document.getElementById('affCfgL2').value);
    const l3 = Number(document.getElementById('affCfgL3').value);

    Admin.updateSettings({
      sponsorBonusPercent: sponsor,
      rabatLevels: [
        { level: 1, percent: l1 },
        { level: 2, percent: l2 },
        { level: 3, percent: l3 }
      ]
    });

    this.showToast('Pengaturan komisi sponsor & rabat level berhasil disimpan!', 'success');
    this.renderAll();
  },

  saveGatewaySettings() {
    const rate = Number(document.getElementById('gwCfgUsdRate').value);
    const fee = Number(document.getElementById('gwCfgWdFee').value);
    const trc20 = document.getElementById('gwCfgTrc20').value;

    const db = DB.get();
    db.settings.usdIdrRate = rate;
    db.settings.withdrawFeePercent = fee;
    if (db.settings.paymentGateways && db.settings.paymentGateways.usdt) {
      db.settings.paymentGateways.usdt.trc20Address = trc20;
    }

    DB.save(db);
    this.showToast('Pengaturan gateway pembayaran & kurs berhasil disimpan!', 'success');
    this.renderAll();
  },

  // Modal Plans
  openEditPlanModal(planId) {
    const plan = Plans.getPlanById(planId);
    if (!plan) return;

    document.getElementById('adminPlanModalTitle').textContent = `Edit Paket ${plan.name}`;
    document.getElementById('planModalId').value = plan.id;
    document.getElementById('planModalName').value = plan.name;
    document.getElementById('planModalMin').value = plan.minDeposit;
    document.getElementById('planModalMax').value = plan.maxDeposit;
    document.getElementById('planModalMinRate').value = plan.minDailyProfit;
    document.getElementById('planModalMaxRate').value = plan.maxDailyProfit;
    document.getElementById('planModalDuration').value = plan.durationDays;

    this.openModal('adminPlanModal');
  },

  openAddPlanModal() {
    document.getElementById('adminPlanModalTitle').textContent = 'Tambah Paket Investasi Baru';
    document.getElementById('planModalId').value = '';
    document.getElementById('planModalName').value = '';
    document.getElementById('planModalMin').value = 500000;
    document.getElementById('planModalMax').value = 5000000;
    document.getElementById('planModalMinRate').value = 2.0;
    document.getElementById('planModalMaxRate').value = 3.5;
    document.getElementById('planModalDuration').value = 30;

    this.openModal('adminPlanModal');
  },

  savePlanModal() {
    const id = document.getElementById('planModalId').value;
    const name = document.getElementById('planModalName').value;
    const minDeposit = Number(document.getElementById('planModalMin').value);
    const maxDeposit = Number(document.getElementById('planModalMax').value);
    const minDailyProfit = parseFloat(document.getElementById('planModalMinRate').value);
    const maxDailyProfit = parseFloat(document.getElementById('planModalMaxRate').value);
    const durationDays = parseInt(document.getElementById('planModalDuration').value);

    if (!name) {
      this.showToast('Nama paket wajib diisi!', 'error');
      return;
    }

    Admin.savePlan({
      id: id || undefined,
      name,
      minDeposit,
      maxDeposit,
      minDailyProfit,
      maxDailyProfit,
      durationDays
    });

    this.closeModal('adminPlanModal');
    this.showToast('Paket investasi berhasil disimpan!', 'success');
    this.renderAll();
  },

  // Modal Users
  openEditUserModal(userId) {
    const user = DB.getUserById(userId);
    if (!user) return;

    document.getElementById('adminUserId').value = user.id;
    document.getElementById('adminUserLabel').textContent = `User: ${user.username} (${user.fullName || '-'})`;
    document.getElementById('adminUserWalletBal').value = user.walletBalance;
    document.getElementById('adminUserAffBal').value = user.affiliateBalance;
    document.getElementById('adminUserPoints').value = user.points || 0;

    this.openModal('adminUserModal');
  },

  saveUserModal() {
    const userId = document.getElementById('adminUserId').value;
    const walletBalance = document.getElementById('adminUserWalletBal').value;
    const affiliateBalance = document.getElementById('adminUserAffBal').value;
    const points = document.getElementById('adminUserPoints').value;

    Admin.adjustUserBalance(userId, { walletBalance, affiliateBalance, points });
    this.closeModal('adminUserModal');
    this.showToast('Saldo user berhasil diperbarui!', 'success');
    this.renderAll();
  },

  // Modal Signals
  openAddSignalModal() {
    document.getElementById('sigNewPair').value = '';
    document.getElementById('sigNewAction').value = 'SELL';
    document.getElementById('sigNewEntry').value = '';
    document.getElementById('sigNewTp').value = '';
    document.getElementById('sigNewSl').value = '';
    document.getElementById('sigNewConf').value = 92;

    this.openModal('adminSignalModal');
  },

  publishSignal() {
    const pair = document.getElementById('sigNewPair').value.trim();
    const action = document.getElementById('sigNewAction').value;
    const entry = document.getElementById('sigNewEntry').value.trim();
    const tp = document.getElementById('sigNewTp').value.trim();
    const sl = document.getElementById('sigNewSl').value.trim();
    const confidence = Number(document.getElementById('sigNewConf').value);

    if (!pair || !entry || !tp || !sl) {
      this.showToast('Harap lengkapi semua data sinyal!', 'error');
      return;
    }

    Signals.addSignal({ pair, action, entry, tp, sl, confidence });
    this.closeModal('adminSignalModal');
    this.showToast(`Sinyal ${pair} (${action}) berhasil diterbitkan!`, 'success');
    this.renderAll();
  },

  // Modal Announcements (Running Text CRUD)
  openAddAnnouncementModal() {
    document.getElementById('announcementModalId').value = '';
    document.getElementById('announcementModalTitle').textContent = 'Tambah Teks Berjalan Baru';
    document.getElementById('announcementModalText').value = '';
    document.getElementById('announcementModalActive').value = 'true';
    this.openModal('adminAnnouncementModal');
  },

  openEditAnnouncementModal(id) {
    const db = DB.get();
    const ann = (db.announcements || []).find(a => a.id === id);
    if (!ann) return;

    document.getElementById('announcementModalId').value = ann.id;
    document.getElementById('announcementModalTitle').textContent = 'Edit Teks Berjalan';
    document.getElementById('announcementModalText').value = ann.text;
    document.getElementById('announcementModalActive').value = ann.active ? 'true' : 'false';
    this.openModal('adminAnnouncementModal');
  },

  saveAnnouncementModal() {
    const id = document.getElementById('announcementModalId').value;
    const text = document.getElementById('announcementModalText').value.trim();
    const active = document.getElementById('announcementModalActive').value === 'true';

    if (!text) {
      this.showToast('Harap masukkan isi teks pengumuman!', 'error');
      return;
    }

    if (id) {
      DB.updateAnnouncement(id, { text, active });
      this.showToast('Teks berjalan berhasil diperbarui!', 'success');
    } else {
      DB.addAnnouncement(text, active);
      this.showToast('Teks berjalan baru berhasil ditambahkan!', 'success');
    }

    this.closeModal('adminAnnouncementModal');
    this.renderAll();
  },

  toggleAnnouncementStatus(id) {
    const db = DB.get();
    const ann = (db.announcements || []).find(a => a.id === id);
    if (!ann) return;

    DB.updateAnnouncement(id, { active: !ann.active });
    this.showToast(`Status teks berjalan berhasil diubah menjadi ${!ann.active ? 'Aktif' : 'Nonaktif'}!`, 'info');
    this.renderAll();
  },

  deleteAnnouncement(id) {
    if (!confirm('Apakah Anda yakin ingin menghapus teks berjalan pengumuman ini?')) return;
    DB.deleteAnnouncement(id);
    this.showToast('Teks berjalan berhasil dihapus.', 'success');
    this.renderAll();
  },

  // Modal Banners (Slider Carousel CRUD with Upload & Preview)
  openAddBannerModal() {
    document.getElementById('bannerModalId').value = '';
    document.getElementById('bannerModalHeaderTitle').textContent = 'Upload / Tambah Banner Baru';
    document.getElementById('bannerModalFileInput').value = '';
    document.getElementById('bannerModalUrlInput').value = '';
    document.getElementById('bannerModalTitle').value = '';
    document.getElementById('bannerModalSubtitle').value = '';
    document.getElementById('bannerModalBadge').value = 'PROMO UNGGULAN';
    document.getElementById('bannerModalActionUrl').value = 'plans';
    document.getElementById('bannerModalActive').value = 'true';

    // Clear preview
    const previewImg = document.getElementById('bannerPreviewImg');
    const placeholder = document.getElementById('bannerPreviewPlaceholder');
    if (previewImg && placeholder) {
      previewImg.src = '';
      previewImg.style.display = 'none';
      placeholder.style.display = 'flex';
    }

    this.openModal('adminBannerModal');
  },

  openEditBannerModal(id) {
    const db = DB.get();
    const banner = (db.banners || []).find(b => b.id === id);
    if (!banner) return;

    document.getElementById('bannerModalId').value = banner.id;
    document.getElementById('bannerModalHeaderTitle').textContent = 'Edit Banner Slide';
    document.getElementById('bannerModalFileInput').value = '';
    document.getElementById('bannerModalUrlInput').value = banner.imageUrl || '';
    document.getElementById('bannerModalTitle').value = banner.title || '';
    document.getElementById('bannerModalSubtitle').value = banner.subtitle || '';
    document.getElementById('bannerModalBadge').value = banner.badge || '';
    document.getElementById('bannerModalActionUrl').value = banner.actionUrl || 'plans';
    document.getElementById('bannerModalActive').value = banner.active ? 'true' : 'false';

    // Set preview
    const previewImg = document.getElementById('bannerPreviewImg');
    const placeholder = document.getElementById('bannerPreviewPlaceholder');
    if (previewImg && placeholder && banner.imageUrl) {
      previewImg.src = banner.imageUrl;
      previewImg.style.display = 'block';
      placeholder.style.display = 'none';
    }

    this.openModal('adminBannerModal');
  },

  saveBannerModal() {
    const id = document.getElementById('bannerModalId').value;
    const title = document.getElementById('bannerModalTitle').value.trim();
    const subtitle = document.getElementById('bannerModalSubtitle').value.trim();
    const badge = document.getElementById('bannerModalBadge').value.trim();
    const actionUrl = document.getElementById('bannerModalActionUrl').value;
    const active = document.getElementById('bannerModalActive').value === 'true';
    
    // Get image source (preview image src or typed url input)
    const previewImg = document.getElementById('bannerPreviewImg');
    const typedUrl = document.getElementById('bannerModalUrlInput').value.trim();
    let imageUrl = '';
    
    if (previewImg && previewImg.src && previewImg.style.display !== 'none' && !previewImg.src.endsWith('/admin.html') && !previewImg.src.endsWith('/admin')) {
      imageUrl = previewImg.src;
    } else if (typedUrl) {
      imageUrl = typedUrl;
    }

    if (!imageUrl) {
      this.showToast('Harap upload file gambar atau masukkan URL gambar banner!', 'error');
      return;
    }

    if (!title) {
      this.showToast('Harap masukkan judul banner!', 'error');
      return;
    }

    if (id) {
      DB.updateBanner(id, { title, subtitle, badge, imageUrl, actionUrl, active });
      this.showToast('Banner slide carousel berhasil diperbarui!', 'success');
    } else {
      DB.addBanner({ title, subtitle, badge, imageUrl, actionUrl, active });
      this.showToast('Banner slide baru berhasil ditambahkan!', 'success');
    }

    this.closeModal('adminBannerModal');
    this.renderAll();
  },

  toggleBannerStatus(id) {
    const db = DB.get();
    const banner = (db.banners || []).find(b => b.id === id);
    if (!banner) return;

    DB.updateBanner(id, { active: !banner.active });
    this.showToast(`Status banner berhasil diubah menjadi ${!banner.active ? 'Aktif' : 'Nonaktif'}!`, 'info');
    this.renderAll();
  },

  deleteBanner(id) {
    if (!confirm('Apakah Anda yakin ingin menghapus banner slide ini?')) return;
    DB.deleteBanner(id);
    this.showToast('Banner berhasil dihapus.', 'success');
    this.renderAll();
  },

  // Modals & Toast
  openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('show');
  },

  closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('show');
  },

  closeAllModals() {
    document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('show'));
  },

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

  bindEvents() {
    // Sidebar toggle buttons
    const toggleBtn = document.getElementById('sidebarToggleBtn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => this.toggleSidebar());
    }

    const closeBtn = document.getElementById('sidebarCloseBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeSidebar());
    }

    const backdrop = document.getElementById('sidebarBackdrop');
    if (backdrop) {
      backdrop.addEventListener('click', () => this.closeSidebar());
    }

    // Keyboard ESC to close sidebar or modals
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeSidebar();
        this.closeAllModals();
      }
    });

    // Navigation Buttons
    document.querySelectorAll('.admin-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        this.switchTab(tab);
      });
    });

    // Modal Close Buttons
    document.querySelectorAll('.modal-close-btn').forEach(btn => {
      btn.addEventListener('click', () => this.closeAllModals());
    });

    // Modal Backdrop Clicks
    document.querySelectorAll('.modal-backdrop').forEach(modalBackdrop => {
      modalBackdrop.addEventListener('click', (e) => {
        if (e.target === modalBackdrop) this.closeAllModals();
      });
    });

    // Banner File Input Upload Listener (FileReader base64 converter)
    const bannerFileInput = document.getElementById('bannerModalFileInput');
    if (bannerFileInput) {
      bannerFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
          this.showToast('Harap pilih file gambar (JPG, PNG, WEBP, dll)!', 'error');
          return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
          const previewImg = document.getElementById('bannerPreviewImg');
          const placeholder = document.getElementById('bannerPreviewPlaceholder');
          if (previewImg && placeholder) {
            previewImg.src = event.target.result;
            previewImg.style.display = 'block';
            placeholder.style.display = 'none';
          }
        };
        reader.readAsDataURL(file);
      });
    }

    // Banner URL input listener for live preview
    const bannerUrlInput = document.getElementById('bannerModalUrlInput');
    if (bannerUrlInput) {
      bannerUrlInput.addEventListener('input', (e) => {
        const url = e.target.value.trim();
        const previewImg = document.getElementById('bannerPreviewImg');
        const placeholder = document.getElementById('bannerPreviewPlaceholder');
        if (previewImg && placeholder) {
          if (url) {
            previewImg.src = url;
            previewImg.style.display = 'block';
            placeholder.style.display = 'none';
          } else {
            const fileInput = document.getElementById('bannerModalFileInput');
            if (!fileInput || !fileInput.files.length) {
              previewImg.src = '';
              previewImg.style.display = 'none';
              placeholder.style.display = 'flex';
            }
          }
        }
      });
    }
  }
};

window.AdminPage = AdminPage;

document.addEventListener('DOMContentLoaded', () => {
  AdminPage.init();
});
