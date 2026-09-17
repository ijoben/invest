/**
 * FGT PRO - STANDALONE ADMIN PAGE CONTROLLER
 * Controls admin.html views, tables, modal actions, and settings.
 */

import { DB, createReceiptBase64 } from './db.js';
import { Admin } from './admin.js';
import { Auth } from './auth.js';
import { Plans } from './plans.js';
import { Affiliate } from './affiliate.js';
import { Signals } from './signals.js';
import { Rewards } from './rewards.js';

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
    const rdmBadge = document.getElementById('badgePendingRdm');
    if (rdmBadge) rdmBadge.textContent = stats.pendingRedemptionsCount || 0;
    const rewBadge = document.getElementById('badgeRewardsCount');
    if (rewBadge) rewBadge.textContent = (db.rewards || []).length;
    const annBadge = document.getElementById('badgeAnnouncementsCount');
    if (annBadge) annBadge.textContent = (db.announcements || []).length;
    const banBadge = document.getElementById('badgeBannersCount');
    if (banBadge) banBadge.textContent = (db.banners || []).length;
    const testiBadge = document.getElementById('badgeTestimonialsCount');
    if (testiBadge) testiBadge.textContent = (db.testimonials || []).length;

    // 2. Deposit Table
    this.renderDeposits(db);

    // 3. Withdraw Table
    this.renderWithdrawals(db);

    // 4. Plans Table & Weekend Profit Settings
    this.renderPlans(db);
    this.renderWeekendProfitSettings(db);

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

    // 11. Redemptions Table
    this.renderRedemptions(db);

    // 12. Rewards Catalog Table
    this.renderRewards(db);

    // 13. Testimonials Table
    this.renderTestimonials(db);
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

  // 4.1 Weekend Profit Settings (Sabtu & Minggu)
  renderWeekendProfitSettings(db) {
    const cfg = (db && db.settings && db.settings.weekendProfit) || {
      enabled: (db && db.settings && db.settings.weekendProfitEnabled !== undefined) ? db.settings.weekendProfitEnabled : true,
      offMessage: 'Pasar Keuangan & Trading Libur di Akhir Pekan (Sabtu & Minggu). Dividen profit akan kembali berjalan aktif hari Senin.'
    };

    const isEnabled = cfg.enabled !== false;
    const selectEl = document.getElementById('weekendProfitCfgSelect');
    const msgEl = document.getElementById('weekendProfitOffMessage');
    const badgeEl = document.getElementById('weekendProfitStatusBadge');

    if (selectEl) selectEl.value = String(isEnabled);
    if (msgEl) msgEl.value = cfg.offMessage || 'Pasar Keuangan & Trading Libur di Akhir Pekan (Sabtu & Minggu). Dividen profit akan kembali berjalan aktif hari Senin.';

    if (badgeEl) {
      if (isEnabled) {
        badgeEl.textContent = '🟢 7 Hari Penuh Aktif';
        badgeEl.className = 'badge-status approved';
        badgeEl.style.background = 'rgba(34, 197, 94, 0.15)';
        badgeEl.style.color = '#22C55E';
        badgeEl.style.border = '1px solid rgba(34, 197, 94, 0.3)';
      } else {
        badgeEl.textContent = '🔴 Libur Sabtu & Minggu';
        badgeEl.className = 'badge-status rejected';
        badgeEl.style.background = 'rgba(239, 68, 68, 0.15)';
        badgeEl.style.color = '#EF4444';
        badgeEl.style.border = '1px solid rgba(239, 68, 68, 0.3)';
      }
    }
  },

  previewWeekendProfitSettings() {
    const selectEl = document.getElementById('weekendProfitCfgSelect');
    const badgeEl = document.getElementById('weekendProfitStatusBadge');
    if (!selectEl || !badgeEl) return;

    const isEnabled = selectEl.value === 'true';
    if (isEnabled) {
      badgeEl.textContent = '🟢 7 Hari Penuh Aktif';
      badgeEl.className = 'badge-status approved';
      badgeEl.style.background = 'rgba(34, 197, 94, 0.15)';
      badgeEl.style.color = '#22C55E';
      badgeEl.style.border = '1px solid rgba(34, 197, 94, 0.3)';
    } else {
      badgeEl.textContent = '🔴 Libur Sabtu & Minggu';
      badgeEl.className = 'badge-status rejected';
      badgeEl.style.background = 'rgba(239, 68, 68, 0.15)';
      badgeEl.style.color = '#EF4444';
      badgeEl.style.border = '1px solid rgba(239, 68, 68, 0.3)';
    }
  },

  saveWeekendProfitSettings() {
    const selectEl = document.getElementById('weekendProfitCfgSelect');
    const msgEl = document.getElementById('weekendProfitOffMessage');
    if (!selectEl) return;

    const enabled = selectEl.value === 'true';
    const offMessage = msgEl ? msgEl.value : '';

    const res = Admin.saveWeekendProfitSettings({ enabled, offMessage });
    if (res.success) {
      this.showToast(res.message, 'success');
      this.renderWeekendProfitSettings(DB.get());
    } else {
      this.showToast(res.message || 'Gagal menyimpan pengaturan', 'error');
    }
  },

  testWeekendProfitDistribution() {
    const status = Plans.isWeekendMarketClosed();
    const d = new Date();
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const currentDayName = days[d.getDay()];

    if (status.closed) {
      alert(`ℹ️ Status Hari Ini (${currentDayName}):\nPASAR LIBUR AKHIR PEKAN\nPengaturan Profit Sabtu & Minggu saat ini NONAKTIF (LIBUR).\n\nPesan untuk member:\n"${status.message}"`);
    } else if (status.isWeekend && status.weekendEnabled) {
      alert(`ℹ️ Status Hari Ini (${currentDayName}):\nPROFIT AKHIR PEKAN AKTIF\nHari ini akhir pekan tetapi profit disetel AKTIF (7 Hari Penuh).\nDividen trading tetap dibagikan secara normal.`);
    } else {
      alert(`ℹ️ Status Hari Ini (${currentDayName}):\nHARI KERJA AKTIF\nPasar beroperasi normal. Dividen profit dibagikan seperti biasa.`);
    }
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

  // 6. Gateway, Bank & QRIS Config
  renderBanks(db) {
    const tbody = document.getElementById('adminBanksTableBody');
    if (!tbody) return;

    const banks = (db.settings.paymentGateways && db.settings.paymentGateways.banks) || [];
    if (banks.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#94A3B8;">Belum ada rekening bank yang terdaftar. Klik "+ Tambah Rekening Bank" untuk menambahkan.</td></tr>';
      return;
    }

    tbody.innerHTML = banks.map(b => {
      const isActive = b.active !== false;
      return `
        <tr>
          <td><strong style="color: #F8FAFC;">${b.name}</strong></td>
          <td><span style="font-family: var(--font-mono, monospace); font-weight: 700; color: #38BDF8;">${b.accountNo}</span></td>
          <td>${b.accountName}</td>
          <td>
            <span class="badge-status ${isActive ? 'approved' : 'rejected'}" style="cursor: pointer;" onclick="AdminPage.toggleBankStatus('${b.id}')" title="Klik untuk ubah status">
              ${isActive ? '🟢 Aktif' : '🔴 Nonaktif'}
            </span>
          </td>
          <td>
            <div class="btn-action-group">
              <button class="btn-admin-action edit" onclick="AdminPage.openEditBankModal('${b.id}')" title="Edit Data Bank">Edit</button>
              <button class="btn-admin-action ${isActive ? 'reject' : 'approve'}" onclick="AdminPage.toggleBankStatus('${b.id}')" title="Ubah Status Aktif/Nonaktif">
                ${isActive ? 'Nonaktifkan' : 'Aktifkan'}
              </button>
              <button class="btn-admin-action delete" onclick="AdminPage.deleteBankAccount('${b.id}')" title="Hapus Rekening Bank">Hapus</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  renderQrisSettings(db) {
    const qris = (db.settings.paymentGateways && db.settings.paymentGateways.qris) || {
      active: true,
      merchantName: 'FGT PRO OFFICIAL QRIS',
      nmid: 'ID1029384756201',
      imageUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=FGT_PRO_OFFICIAL_QRIS_DEPOSIT'
    };

    const activeEl = document.getElementById('qrisCfgActive');
    const merchantEl = document.getElementById('qrisCfgMerchant');
    const nmidEl = document.getElementById('qrisCfgNmid');
    const imgUrlEl = document.getElementById('qrisCfgImageUrl');

    if (activeEl) activeEl.value = String(qris.active !== false);
    if (merchantEl) merchantEl.value = qris.merchantName || 'FGT PRO OFFICIAL QRIS';
    if (nmidEl) nmidEl.value = qris.nmid || '';
    if (imgUrlEl) imgUrlEl.value = qris.imageUrl || '';

    this.previewQrisSettings();
  },

  previewQrisSettings() {
    const activeEl = document.getElementById('qrisCfgActive');
    const merchantEl = document.getElementById('qrisCfgMerchant');
    const nmidEl = document.getElementById('qrisCfgNmid');
    const imgUrlEl = document.getElementById('qrisCfgImageUrl');

    const previewImg = document.getElementById('qrisAdminPreviewImg');
    const previewMerchant = document.getElementById('qrisAdminPreviewMerchant');
    const previewNmid = document.getElementById('qrisAdminPreviewNmid');

    const merchantVal = merchantEl ? merchantEl.value.trim() : 'FGT PRO OFFICIAL QRIS';
    const nmidVal = nmidEl ? nmidEl.value.trim() : 'ID1029384756201';
    let imgVal = imgUrlEl ? imgUrlEl.value.trim() : '';

    if (!imgVal) {
      imgVal = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(merchantVal || 'QRIS')}`;
    }

    if (previewImg) previewImg.src = imgVal;
    if (previewMerchant) previewMerchant.textContent = merchantVal || 'FGT PRO OFFICIAL QRIS';
    if (previewNmid) previewNmid.textContent = nmidVal ? `NMID: ${nmidVal}` : 'NMID: -';
  },

  renderGatewaySettings(db) {
    this.renderBanks(db);
    this.renderQrisSettings(db);

    const cfg = db.settings;
    document.getElementById('gwCfgUsdRate').value = cfg.usdIdrRate || 16250;
    document.getElementById('gwCfgWdFee').value = cfg.withdrawFeePercent || 1.0;
    if (cfg.paymentGateways && cfg.paymentGateways.usdt) {
      document.getElementById('gwCfgTrc20').value = cfg.paymentGateways.usdt.trc20Address || '';
    }

    const sched = cfg.withdrawSchedule || { enabled: true, startHour: 9, endHour: 21, offMessage: '' };
    const enabledEl = document.getElementById('wdCfgEnabled');
    if (enabledEl) enabledEl.value = String(sched.enabled !== false);
    const startEl = document.getElementById('wdCfgStartHour');
    if (startEl) startEl.value = sched.startHour !== undefined ? sched.startHour : 9;
    const endEl = document.getElementById('wdCfgEndHour');
    if (endEl) endEl.value = sched.endHour !== undefined ? sched.endHour : 21;
    const msgEl = document.getElementById('wdCfgOffMessage');
    if (msgEl) msgEl.value = sched.offMessage || 'Layanan penarikan dana (WD) buka setiap hari pukul 09:00 - 21:00 WIB. Saldo Anda aman dan dapat ditarik pada jam operasional.';
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
    if (signals.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px; color:#94A3B8;">Tidak ada sinyal aktif.</td></tr>';
      return;
    }
    tbody.innerHTML = signals.map(s => `
      <tr>
        <td><strong>${s.pair}</strong></td>
        <td><span class="badge-signal-action ${s.action.toLowerCase()}">${s.action}</span></td>
        <td>${s.entry}</td>
        <td><span style="color:#22C55E;">${s.tp}</span></td>
        <td><span style="color:#EF4444;">${s.sl}</span></td>
        <td><strong>${s.confidence}%</strong></td>
        <td>${s.timeAgo}</td>
        <td style="text-align: right;">
          <button class="btn-admin-action delete" onclick="AdminPage.deleteSignal('${s.id}')" title="Hapus sinyal">🗑️ Hapus</button>
        </td>
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

  // 11. Redemptions Table
  renderRedemptions(db) {
    const tbody = document.getElementById('redemptionsTableBody');
    if (!tbody) return;
    const redemptions = db.redemptions || [];

    if (redemptions.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:24px; color:#94A3B8;">Belum ada riwayat klaim tukar poin hadiah dari user.</td></tr>';
      return;
    }

    tbody.innerHTML = redemptions.map(r => {
      let statusBadge = `<span class="badge-status ${r.status}">${r.status.toUpperCase()}</span>`;
      if (r.status === 'pending') {
        statusBadge = `<span class="badge-status" style="background:rgba(217, 119, 6, 0.2); color:#F59E0B; border:1px solid rgba(217, 119, 6, 0.4);">MENUNGGU</span>`;
      } else if (r.status === 'processing') {
        statusBadge = `<span class="badge-status" style="background:rgba(37, 99, 235, 0.2); color:#38BDF8; border:1px solid rgba(37, 99, 235, 0.4);">DIPROSES</span>`;
      } else if (r.status === 'completed') {
        statusBadge = `<span class="badge-status approved">SELESAI</span>`;
      } else if (r.status === 'rejected') {
        statusBadge = `<span class="badge-status rejected">DITOLAK</span>`;
      }

      let actionsHtml = '';
      if (r.status === 'pending') {
        actionsHtml = `
          <div class="btn-action-group" style="justify-content: flex-end;">
            <button class="btn-admin-action approve" onclick="AdminPage.approveRedemption('${r.id}')" title="Setujui dan proses pengiriman">
              ✓ Proses
            </button>
            <button class="btn-admin-action" style="background:#22C55E; color:#0F172A; font-weight:800;" onclick="AdminPage.completeRedemption('${r.id}')" title="Tandai langsung selesai">
              ✔ Selesai
            </button>
            <button class="btn-admin-action reject" onclick="AdminPage.rejectRedemption('${r.id}')" title="Tolak klaim dan refund poin ke user">
              ✕ Tolak
            </button>
          </div>
        `;
      } else if (r.status === 'processing') {
        actionsHtml = `
          <div class="btn-action-group" style="justify-content: flex-end;">
            <button class="btn-admin-action" style="background:#22C55E; color:#0F172A; font-weight:800;" onclick="AdminPage.completeRedemption('${r.id}')" title="Tandai hadiah telah terkirim">
              ✔ Selesai
            </button>
            <button class="btn-admin-action reject" onclick="AdminPage.rejectRedemption('${r.id}')" title="Batalkan dan refund poin">
              ✕ Batal
            </button>
          </div>
        `;
      } else {
        actionsHtml = `<span style="color:#64748B; font-size:11px;">${r.adminNote || 'Transaksi Selesai'}</span>`;
      }

      return `
        <tr>
          <td><strong style="font-family: var(--font-mono); color: #38BDF8;">${r.id}</strong></td>
          <td><span style="font-size:11px; color:#94A3B8;">${new Date(r.createdAt).toLocaleString('id-ID')}</span></td>
          <td><strong style="color: #FFFFFF;">${r.username}</strong></td>
          <td>
            <div style="font-weight: 700; color: #FFFFFF; font-size: 13px;">${r.rewardTitle}</div>
            ${r.note ? `<div style="font-size: 10.5px; color: #E5A83B; margin-top: 2px;">Catatan: ${r.note}</div>` : ''}
          </td>
          <td>
            <span style="font-family: var(--font-mono); font-weight: 800; color: #E5A83B;">${r.pointsSpent} Poin</span>
          </td>
          <td>
            <div style="font-size: 12px; color: #FFFFFF; font-weight: 600;">${r.targetContact || '-'}</div>
            ${r.deliveryAddress ? `<div style="font-size: 10.5px; color: #94A3B8; margin-top: 2px; line-height: 1.3;">${r.deliveryAddress}</div>` : ''}
          </td>
          <td>${statusBadge}</td>
          <td>${actionsHtml}</td>
        </tr>
      `;
    }).join('');
  },

  // 12. Rewards Catalog Table
  renderRewards(db) {
    const tbody = document.getElementById('rewardsTableBody');
    if (!tbody) return;
    const rewards = db.rewards || [];

    if (rewards.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:24px; color:#94A3B8;">Belum ada hadiah di katalog. Klik "➕ Tambah Hadiah Baru" untuk membuat hadiah.</td></tr>';
      return;
    }

    tbody.innerHTML = rewards.map(r => {
      const imgUrl = r.imageUrl || 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=600&auto=format&fit=crop&q=80';
      const statusBadge = r.active
        ? '<span class="badge-status approved">AKTIF</span>'
        : '<span class="badge-status rejected">NONAKTIF</span>';

      return `
        <tr>
          <td>
            <img src="${imgUrl}" alt="${r.title}" class="banner-table-thumb" style="width: 54px; height: 54px; border-radius: 8px;" onerror="this.src='https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=600&auto=format&fit=crop&q=80'">
          </td>
          <td>
            <div style="font-weight: 700; color: #FFFFFF; font-size: 13px; margin-bottom: 2px;">${r.title}</div>
            <div style="font-size: 11px; color: #94A3B8; line-height: 1.35; max-width: 320px;">${r.description || '-'}</div>
          </td>
          <td>
            <span style="font-size: 11.5px; font-weight: 700; color: #38BDF8;">${r.category || 'E-Wallet'}</span>
          </td>
          <td>
            ${r.badge ? `<span class="banner-badge-preview" style="background:rgba(200, 147, 56, 0.2); color:#E5A83B; border:1px solid rgba(200, 147, 56, 0.4);">${r.badge}</span>` : '<span style="color:#64748B;">-</span>'}
          </td>
          <td>
            <strong style="font-family: var(--font-mono); font-size: 13px; color: #F59E0B;">${r.pointsCost} Poin</strong>
          </td>
          <td>
            <span style="font-weight: 800; color: ${r.stock > 0 ? '#22C55E' : '#EF4444'}; font-family: var(--font-mono);">${r.stock}</span>
          </td>
          <td>${statusBadge}</td>
          <td>
            <div class="btn-action-group" style="justify-content: flex-end;">
              <button class="btn-admin-action ${r.active ? 'reject' : 'approve'}" onclick="AdminPage.toggleRewardStatus('${r.id}')" title="Ubah status tampil">
                ${r.active ? 'Nonaktif' : 'Aktifkan'}
              </button>
              <button class="btn-admin-action edit" onclick="AdminPage.openEditRewardModal('${r.id}')" title="Edit hadiah">
                ✏ Edit
              </button>
              <button class="btn-admin-action delete" onclick="AdminPage.deleteReward('${r.id}')" title="Hapus hadiah">
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
    redemptions: 'Konfirmasi Penukaran Hadiah',
    gateways: 'Gateway & Rekening',
    plans: 'Plan Investasi & Profit',
    rewards: 'Katalog Hadiah (Reward Point)',
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
    const marketStatus = Plans.isWeekendMarketClosed();
    let force = false;
    if (marketStatus.closed) {
      const confirmForce = confirm(`⚠️ PERINGATAN LIBUR AKHIR PEKAN:\nHari ini adalah akhir pekan (${marketStatus.dayName}) dan Pengaturan Profit Akhir Pekan sedang berstatus LIBUR (Nonaktif).\n\nApakah Anda tetap ingin MEMAKSA (Force Trigger) pembagian dividen profit hari ini?`);
      if (!confirmForce) return;
      force = true;
    }

    const res = Admin.triggerProfitYield(force);
    if (res.updatedCount > 0) {
      this.showToast(`Sukses mendistribusikan dividen profit ke ${res.updatedCount} paket investasi aktif (Total: ${DB.formatIDR(res.totalYielded)})!`, 'success');
    } else if (res.isWeekendClosed) {
      this.showToast(res.message || 'Pasar libur akhir pekan (Sabtu & Minggu).', 'info');
    } else {
      this.showToast('Tidak ada paket aktif yang siap menerima dividen baru saat ini (semua paket sudah menerima dividen hari ini atau telah selesai).', 'info');
    }
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

  // Bank Management Handlers
  openAddBankModal() {
    document.getElementById('adminBankModalTitle').textContent = 'Tambah Rekening Bank Baru';
    document.getElementById('bankModalId').value = '';
    document.getElementById('bankModalName').value = '';
    document.getElementById('bankModalAccountNo').value = '';
    document.getElementById('bankModalAccountName').value = '';
    document.getElementById('bankModalActive').value = 'true';
    this.openModal('adminBankModal');
  },

  openEditBankModal(bankId) {
    const banks = Admin.getBanks();
    const bank = banks.find(b => b.id === bankId);
    if (!bank) return;

    document.getElementById('adminBankModalTitle').textContent = `Edit Rekening ${bank.name}`;
    document.getElementById('bankModalId').value = bank.id;
    document.getElementById('bankModalName').value = bank.name;
    document.getElementById('bankModalAccountNo').value = bank.accountNo;
    document.getElementById('bankModalAccountName').value = bank.accountName;
    document.getElementById('bankModalActive').value = String(bank.active !== false);
    this.openModal('adminBankModal');
  },

  saveBankModal() {
    const id = document.getElementById('bankModalId').value.trim();
    const name = document.getElementById('bankModalName').value.trim();
    const accountNo = document.getElementById('bankModalAccountNo').value.trim();
    const accountName = document.getElementById('bankModalAccountName').value.trim();
    const active = document.getElementById('bankModalActive').value === 'true';

    if (!name) {
      this.showToast('Nama Bank wajib diisi!', 'error');
      return;
    }
    if (!accountNo) {
      this.showToast('Nomor Rekening wajib diisi!', 'error');
      return;
    }
    if (!accountName) {
      this.showToast('Atas Nama (Pemilik Rekening) wajib diisi!', 'error');
      return;
    }

    const res = Admin.saveBank({
      id: id || undefined,
      name,
      accountNo,
      accountName,
      active
    });

    if (res.success) {
      this.closeModal('adminBankModal');
      this.showToast(res.message, 'success');
      this.renderAll();
    } else {
      this.showToast(res.message, 'error');
    }
  },

  deleteBankAccount(bankId) {
    const banks = Admin.getBanks();
    const bank = banks.find(b => b.id === bankId);
    const bankName = bank ? bank.name : 'rekening ini';

    if (!confirm(`Apakah Anda yakin ingin menghapus rekening ${bankName}?`)) return;

    const res = Admin.deleteBank(bankId);
    if (res.success) {
      this.showToast(res.message, 'success');
      this.renderAll();
    } else {
      this.showToast(res.message, 'error');
    }
  },

  toggleBankStatus(bankId) {
    const res = Admin.toggleBankStatus(bankId);
    if (res.success) {
      this.showToast(res.message, 'success');
      this.renderAll();
    } else {
      this.showToast(res.message, 'error');
    }
  },

  saveQrisSettings() {
    const active = document.getElementById('qrisCfgActive').value === 'true';
    const merchantName = document.getElementById('qrisCfgMerchant').value.trim();
    const nmid = document.getElementById('qrisCfgNmid').value.trim();
    const imageUrl = document.getElementById('qrisCfgImageUrl').value.trim();

    const res = Admin.saveQrisSettings({
      active,
      merchantName,
      nmid,
      imageUrl
    });

    if (res.success) {
      this.showToast('Pengaturan QRIS berhasil disimpan!', 'success');
      this.renderAll();
    } else {
      this.showToast(res.message, 'error');
    }
  },

  saveWithdrawScheduleSettings() {
    const enabled = document.getElementById('wdCfgEnabled').value === 'true';
    const startHour = Number(document.getElementById('wdCfgStartHour').value) || 0;
    const endHour = Number(document.getElementById('wdCfgEndHour').value) || 24;
    const offMessage = document.getElementById('wdCfgOffMessage').value.trim();

    Admin.saveWithdrawSchedule({
      enabled,
      startHour,
      endHour,
      offMessage
    });

    this.showToast('Jadwal & jam operasional WD berhasil disimpan!', 'success');
    this.renderAll();
  },

  deleteSignal(id) {
    if (!confirm('Apakah Anda yakin ingin menghapus sinyal trading ini?')) return;
    Admin.deleteSignal(id);
    this.showToast('Sinyal trading berhasil dihapus!', 'success');
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

  // Redemption Approval & Rejection Actions
  approveRedemption(id) {
    const res = Admin.approveRedemption(id);
    if (res.success) {
      this.showToast(res.message, 'success');
      this.renderAll();
    } else {
      this.showToast(res.message, 'error');
    }
  },

  completeRedemption(id) {
    const res = Admin.completeRedemption(id);
    if (res.success) {
      this.showToast(res.message, 'success');
      this.renderAll();
    } else {
      this.showToast(res.message, 'error');
    }
  },

  rejectRedemption(id) {
    const reason = prompt('Masukkan alasan penolakan penukaran hadiah (Poin akan otomatis di-refund ke user):', 'Data kontak / nomor e-wallet tidak valid');
    if (reason === null) return;
    const res = Admin.rejectRedemption(id, reason);
    if (res.success) {
      this.showToast(res.message, 'info');
      this.renderAll();
    } else {
      this.showToast(res.message, 'error');
    }
  },

  // Modal Rewards (Catalog CRUD with Upload & Preview)
  openAddRewardModal() {
    document.getElementById('rewardModalId').value = '';
    document.getElementById('rewardModalHeaderTitle').textContent = 'Tambah Hadiah Baru';
    document.getElementById('rewardModalFileInput').value = '';
    document.getElementById('rewardModalUrlInput').value = '';
    document.getElementById('rewardModalTitle').value = '';
    document.getElementById('rewardModalCategory').value = 'E-Wallet';
    document.getElementById('rewardModalBadge').value = 'POPULER';
    document.getElementById('rewardModalPointsCost').value = 50;
    document.getElementById('rewardModalStock').value = 50;
    document.getElementById('rewardModalDescription').value = '';
    document.getElementById('rewardModalActive').value = 'true';

    // Clear preview
    const previewImg = document.getElementById('rewardPreviewImg');
    const placeholder = document.getElementById('rewardPreviewPlaceholder');
    if (previewImg && placeholder) {
      previewImg.src = '';
      previewImg.style.display = 'none';
      placeholder.style.display = 'flex';
    }

    this.openModal('adminRewardModal');
  },

  openEditRewardModal(id) {
    const db = DB.get();
    const reward = (db.rewards || []).find(r => r.id === id);
    if (!reward) return;

    document.getElementById('rewardModalId').value = reward.id;
    document.getElementById('rewardModalHeaderTitle').textContent = 'Edit Hadiah Reward';
    document.getElementById('rewardModalFileInput').value = '';
    document.getElementById('rewardModalUrlInput').value = reward.imageUrl || '';
    document.getElementById('rewardModalTitle').value = reward.title || '';
    document.getElementById('rewardModalCategory').value = reward.category || 'E-Wallet';
    document.getElementById('rewardModalBadge').value = reward.badge || '';
    document.getElementById('rewardModalPointsCost').value = reward.pointsCost || 50;
    document.getElementById('rewardModalStock').value = reward.stock || 0;
    document.getElementById('rewardModalDescription').value = reward.description || '';
    document.getElementById('rewardModalActive').value = reward.active ? 'true' : 'false';

    // Set preview
    const previewImg = document.getElementById('rewardPreviewImg');
    const placeholder = document.getElementById('rewardPreviewPlaceholder');
    if (previewImg && placeholder && reward.imageUrl) {
      previewImg.src = reward.imageUrl;
      previewImg.style.display = 'block';
      placeholder.style.display = 'none';
    }

    this.openModal('adminRewardModal');
  },

  saveRewardModal() {
    const id = document.getElementById('rewardModalId').value;
    const title = document.getElementById('rewardModalTitle').value.trim();
    const category = document.getElementById('rewardModalCategory').value;
    const badge = document.getElementById('rewardModalBadge').value.trim();
    const pointsCost = Number(document.getElementById('rewardModalPointsCost').value);
    const stock = Number(document.getElementById('rewardModalStock').value);
    const description = document.getElementById('rewardModalDescription').value.trim();
    const active = document.getElementById('rewardModalActive').value === 'true';

    // Get image source
    const previewImg = document.getElementById('rewardPreviewImg');
    const typedUrl = document.getElementById('rewardModalUrlInput').value.trim();
    let imageUrl = '';

    if (previewImg && previewImg.src && previewImg.style.display !== 'none' && !previewImg.src.endsWith('/admin.html') && !previewImg.src.endsWith('/admin')) {
      imageUrl = previewImg.src;
    } else if (typedUrl) {
      imageUrl = typedUrl;
    }

    if (!title) {
      this.showToast('Harap masukkan nama hadiah!', 'error');
      return;
    }

    if (!pointsCost || pointsCost <= 0) {
      this.showToast('Biaya poin harus lebih besar dari 0!', 'error');
      return;
    }

    if (!imageUrl) {
      imageUrl = 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=600&auto=format&fit=crop&q=80';
    }

    if (id) {
      DB.updateReward(id, { title, category, badge, pointsCost, stock, description, imageUrl, active });
      this.showToast('Data hadiah reward berhasil diperbarui!', 'success');
    } else {
      DB.addReward({ title, category, badge, pointsCost, stock, description, imageUrl, active });
      this.showToast('Hadiah baru berhasil ditambahkan ke katalog!', 'success');
    }

    this.closeModal('adminRewardModal');
    this.renderAll();
  },

  toggleRewardStatus(id) {
    const db = DB.get();
    const reward = (db.rewards || []).find(r => r.id === id);
    if (!reward) return;

    DB.updateReward(id, { active: !reward.active });
    this.showToast(`Status hadiah berhasil diubah menjadi ${!reward.active ? 'Aktif' : 'Nonaktif'}!`, 'info');
    this.renderAll();
  },

  deleteReward(id) {
    if (!confirm('Apakah Anda yakin ingin menghapus hadiah ini dari katalog?')) return;
    DB.deleteReward(id);
    this.showToast('Hadiah berhasil dihapus dari katalog.', 'success');
    this.renderAll();
  },

  // ====================================================================
  // 13. PANEL TESTIMONI PENARIKAN MEMBER (CRUD)
  // ====================================================================
  renderTestimonials(db) {
    const tbody = document.getElementById('testimonialsTableBody');
    if (!tbody) return;

    const testimonials = db.testimonials || [];

    if (testimonials.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:24px; color:#94A3B8;">Belum ada testimoni penarikan member. Klik tombol Tambah Testimoni Baru untuk membuat testimoni baru.</td></tr>';
      return;
    }

    tbody.innerHTML = testimonials.map(t => {
      const avatarSrc = t.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(t.name)}&background=C89338&color=fff`;
      const receiptSrc = t.receiptImage || 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=600&auto=format&fit=crop&q=80';
      const isAktif = t.active !== false;
      const status = t.status || 'approved';

      let statusBadge = '';
      if (status === 'pending') {
        statusBadge = `<span class="badge-status" style="background:rgba(217, 119, 6, 0.2); color:#F59E0B; border:1px solid rgba(217, 119, 6, 0.4); font-size:10px;">⏳ MENUNGGU MODERASI</span>`;
      } else if (status === 'approved') {
        statusBadge = `<span class="badge-status approved" style="font-size:10px;">✓ DISETUJUI ${t.pointsRewarded ? '(+50 Poin)' : ''}</span>`;
      } else {
        statusBadge = `<span class="badge-status rejected" style="font-size:10px;">✕ DITOLAK</span>`;
      }

      let actionsHtml = '';
      if (status === 'pending') {
        actionsHtml = `
          <div class="btn-action-group" style="justify-content: flex-end;">
            <button class="btn-admin-action approve" onclick="AdminPage.approveMemberTesti('${t.id}')" title="Setujui testimoni ${Number(t.rating) === 5 ? '(Otomatis beri bonus 50 poin jika bintang 5)' : ''}">
              ✓ Setujui ${Number(t.rating) === 5 ? '★+50' : ''}
            </button>
            <button class="btn-admin-action reject" onclick="AdminPage.rejectMemberTesti('${t.id}')" title="Tolak testimoni">
              ✕ Tolak
            </button>
            <button class="btn-admin-action delete" onclick="AdminPage.deleteTestimonial('${t.id}')">🗑️</button>
          </div>
        `;
      } else {
        actionsHtml = `
          <div class="btn-action-group" style="justify-content: flex-end;">
            <button class="btn-admin-action edit" onclick="AdminPage.openEditTestimonialModal('${t.id}')">✏️ Edit</button>
            <button class="btn-admin-action ${isAktif ? 'reject' : 'approve'}" onclick="AdminPage.toggleTestimonialStatus('${t.id}')">
              ${isAktif ? 'Sembunyikan' : 'Aktifkan'}
            </button>
            <button class="btn-admin-action delete" onclick="AdminPage.deleteTestimonial('${t.id}')">🗑️ Hapus</button>
          </div>
        `;
      }

      return `
        <tr>
          <td>
            <div style="width: 75px; height: 50px; border-radius: 8px; overflow: hidden; border: 1px solid #E2E8F0; background: #0B0F19; display: flex; align-items: center; justify-content: center; cursor: pointer;" onclick="AdminPage.previewImageLightbox('${t.id}')" title="Klik untuk lihat gambar bukti">
              <img src="${receiptSrc}" alt="Receipt" style="width: 100%; height: 100%; object-fit: cover;">
            </div>
          </td>
          <td>
            <div style="display: flex; align-items: center; gap: 8px;">
              <img src="${avatarSrc}" alt="${t.name}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; border: 1.5px solid #E5A83B;" onerror="this.src='https://ui-avatars.com/api/?name=Member&background=C89338&color=fff'">
              <div>
                <strong style="color: #0F172A; font-size: 13px;">${t.name}</strong>
                <div style="font-size: 10.5px; color: #64748B;">📍 ${t.city || 'Indonesia'} ${t.userId ? '<span style="color:#0284C7; font-weight:700;">(Member)</span>' : ''}</div>
              </div>
            </div>
          </td>
          <td>
            <div style="font-weight: 700; font-size: 11.5px; color: #0284C7;">${t.bank}</div>
            <strong style="color: #10B981; font-family: var(--font-mono); font-size: 13px;">${DB.formatIDR(t.amount)}</strong>
          </td>
          <td>
            <div style="color: #E5A83B; font-size: 12px; font-weight: 700;">★ ${t.rating || 5}.0</div>
            <div style="font-size: 10px; color: #94A3B8;">${t.timeAgo || 'Baru saja'}</div>
          </td>
          <td>
            <div style="font-size: 11.5px; color: #334155; line-height: 1.4; max-width: 260px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;" title="${t.comment || ''}">
              "${t.comment || '-'}"
            </div>
          </td>
          <td>
            <div>${statusBadge}</div>
            <div style="font-size: 9.5px; color: ${isAktif ? '#10B981' : '#94A3B8'}; margin-top: 3px; font-weight: 600;">
              ${isAktif ? '● Tayang di Web' : '○ Tersembunyi'}
            </div>
          </td>
          <td>${actionsHtml}</td>
        </tr>
      `;
    }).join('');
  },

  approveMemberTesti(id) {
    const res = Admin.approveTestimonial(id);
    if (res.success) {
      this.showToast(res.message, 'success');
      this.renderAll();
    } else {
      this.showToast(res.message, 'error');
    }
  },

  rejectMemberTesti(id) {
    const reason = prompt('Masukkan alasan penolakan testimoni:', 'Foto bukti tidak valid atau ulasan kurang pantas');
    if (reason === null) return;
    const res = Admin.rejectTestimonial(id, reason);
    if (res.success) {
      this.showToast(res.message, 'info');
      this.renderAll();
    }
  },

  openAddTestimonialModal() {
    document.getElementById('testiModalHeaderTitle').textContent = 'Tambah Testimoni Penarikan Baru';
    document.getElementById('testiModalId').value = '';
    document.getElementById('testiModalName').value = '';
    document.getElementById('testiModalCity').value = '';
    document.getElementById('testiModalBank').value = 'BCA Mobile';
    document.getElementById('testiModalAmount').value = '';
    document.getElementById('testiModalRating').value = '5';
    document.getElementById('testiModalTimeAgo').value = 'Baru saja';
    document.getElementById('testiModalComment').value = '';
    document.getElementById('testiModalActive').value = 'true';
    document.getElementById('testiModalFileInput').value = '';
    document.getElementById('testiModalUrlInput').value = '';

    const previewImg = document.getElementById('testiPreviewImg');
    const placeholder = document.getElementById('testiPreviewPlaceholder');
    if (previewImg && placeholder) {
      previewImg.src = '';
      previewImg.style.display = 'none';
      placeholder.style.display = 'flex';
    }

    this.openModal('adminTestimonialModal');
  },

  openEditTestimonialModal(id) {
    const db = DB.get();
    const testi = (db.testimonials || []).find(t => t.id === id);
    if (!testi) return;

    document.getElementById('testiModalHeaderTitle').textContent = `Edit Testimoni: ${testi.name}`;
    document.getElementById('testiModalId').value = testi.id;
    document.getElementById('testiModalName').value = testi.name || '';
    document.getElementById('testiModalCity').value = testi.city || '';
    document.getElementById('testiModalBank').value = testi.bank || 'BCA Mobile';
    document.getElementById('testiModalAmount').value = testi.amount || '';
    document.getElementById('testiModalRating').value = String(testi.rating || 5);
    document.getElementById('testiModalTimeAgo').value = testi.timeAgo || '';
    document.getElementById('testiModalComment').value = testi.comment || '';
    document.getElementById('testiModalActive').value = testi.active !== false ? 'true' : 'false';
    document.getElementById('testiModalFileInput').value = '';
    document.getElementById('testiModalUrlInput').value = (testi.receiptImage && !testi.receiptImage.startsWith('data:')) ? testi.receiptImage : '';

    const previewImg = document.getElementById('testiPreviewImg');
    const placeholder = document.getElementById('testiPreviewPlaceholder');
    if (previewImg && placeholder) {
      if (testi.receiptImage) {
        previewImg.src = testi.receiptImage;
        previewImg.style.display = 'block';
        placeholder.style.display = 'none';
      } else {
        previewImg.src = '';
        previewImg.style.display = 'none';
        placeholder.style.display = 'flex';
      }
    }

    this.openModal('adminTestimonialModal');
  },

  saveTestimonialModal() {
    const id = document.getElementById('testiModalId').value;
    const name = document.getElementById('testiModalName').value.trim();
    const city = document.getElementById('testiModalCity').value.trim();
    const bank = document.getElementById('testiModalBank').value;
    const amount = Number(document.getElementById('testiModalAmount').value) || 0;
    const rating = Number(document.getElementById('testiModalRating').value) || 5;
    const timeAgo = document.getElementById('testiModalTimeAgo').value.trim() || 'Baru saja';
    const comment = document.getElementById('testiModalComment').value.trim();
    const active = document.getElementById('testiModalActive').value === 'true';

    if (!name) {
      this.showToast('Nama member wajib diisi!', 'error');
      return;
    }
    if (!city) {
      this.showToast('Kota / Lokasi member wajib diisi!', 'error');
      return;
    }
    if (!amount || amount <= 0) {
      this.showToast('Nominal penarikan harus lebih dari 0!', 'error');
      return;
    }
    if (!comment) {
      this.showToast('Ulasan kata-kata testimoni wajib diisi!', 'error');
      return;
    }

    // Determine image source
    let receiptImage = '';
    const previewImg = document.getElementById('testiPreviewImg');
    const urlInput = document.getElementById('testiModalUrlInput');

    if (previewImg && previewImg.src && previewImg.style.display !== 'none' && !previewImg.src.endsWith('admin.html')) {
      receiptImage = previewImg.src;
    } else if (urlInput && urlInput.value.trim()) {
      receiptImage = urlInput.value.trim();
    }

    if (!receiptImage) {
      // Create a crisp Base64 SVG receipt matching the selected bank
      receiptImage = createReceiptBase64({
        bank,
        name: name.toUpperCase(),
        amount,
        timeAgo,
        refNo: 'ADM-' + Math.floor(10000000 + Math.random() * 90000000)
      });
    }

    if (id) {
      DB.updateTestimonial(id, { name, city, bank, amount, rating, timeAgo, comment, receiptImage, active });
      this.showToast('Testimoni penarikan berhasil diperbarui!', 'success');
    } else {
      DB.addTestimonial({ name, city, bank, amount, rating, timeAgo, comment, receiptImage, active });
      this.showToast('Testimoni penarikan baru berhasil dipublikasikan!', 'success');
    }

    this.closeModal('adminTestimonialModal');
    this.renderAll();
  },

  previewImageLightbox(testiId) {
    const db = DB.get();
    const testi = (db.testimonials || []).find(t => t.id === testiId);
    if (!testi) return;
    if (testi.receiptImage) {
      const win = window.open('', '_blank');
      if (win) {
        win.document.write(`<title>Bukti Transfer - ${testi.name}</title><body style="margin:0;background:#0B0F19;display:flex;align-items:center;justify-content:center;min-height:100vh;"><img src="${testi.receiptImage}" style="max-width:90%;max-height:90vh;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,0.5);"></body>`);
      }
    }
  },

  toggleTestimonialStatus(id) {
    const db = DB.get();
    const testi = (db.testimonials || []).find(t => t.id === id);
    if (!testi) return;

    DB.updateTestimonial(id, { active: !testi.active });
    this.showToast(`Status testimoni berhasil diubah menjadi ${!testi.active ? 'Aktif' : 'Nonaktif'}!`, 'info');
    this.renderAll();
  },

  deleteTestimonial(id) {
    if (!confirm('Apakah Anda yakin ingin menghapus testimoni ini?')) return;
    DB.deleteTestimonial(id);
    this.showToast('Testimoni berhasil dihapus.', 'success');
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

    // Reward File Input Upload Listener (FileReader base64 converter)
    const rewardFileInput = document.getElementById('rewardModalFileInput');
    if (rewardFileInput) {
      rewardFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
          this.showToast('Harap pilih file gambar (JPG, PNG, WEBP, dll)!', 'error');
          return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
          const previewImg = document.getElementById('rewardPreviewImg');
          const placeholder = document.getElementById('rewardPreviewPlaceholder');
          if (previewImg && placeholder) {
            previewImg.src = event.target.result;
            previewImg.style.display = 'block';
            placeholder.style.display = 'none';
          }
        };
        reader.readAsDataURL(file);
      });
    }

    // Reward URL input listener for live preview
    const rewardUrlInput = document.getElementById('rewardModalUrlInput');
    if (rewardUrlInput) {
      rewardUrlInput.addEventListener('input', (e) => {
        const url = e.target.value.trim();
        const previewImg = document.getElementById('rewardPreviewImg');
        const placeholder = document.getElementById('rewardPreviewPlaceholder');
        if (previewImg && placeholder) {
          if (url) {
            previewImg.src = url;
            previewImg.style.display = 'block';
            placeholder.style.display = 'none';
          } else {
            const fileInput = document.getElementById('rewardModalFileInput');
            if (!fileInput || !fileInput.files.length) {
              previewImg.src = '';
              previewImg.style.display = 'none';
              placeholder.style.display = 'flex';
            }
          }
        }
      });
    }

    // Testimonial File Input Upload Listener (FileReader base64 converter)
    const testiFileInput = document.getElementById('testiModalFileInput');
    if (testiFileInput) {
      testiFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
          this.showToast('Harap pilih file gambar bukti transfer (JPG, PNG, WEBP, dll)!', 'error');
          return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
          const previewImg = document.getElementById('testiPreviewImg');
          const placeholder = document.getElementById('testiPreviewPlaceholder');
          if (previewImg && placeholder) {
            previewImg.src = event.target.result;
            previewImg.style.display = 'block';
            placeholder.style.display = 'none';
          }
        };
        reader.readAsDataURL(file);
      });
    }

    // Testimonial URL input listener for live preview
    const testiUrlInput = document.getElementById('testiModalUrlInput');
    if (testiUrlInput) {
      testiUrlInput.addEventListener('input', (e) => {
        const url = e.target.value.trim();
        const previewImg = document.getElementById('testiPreviewImg');
        const placeholder = document.getElementById('testiPreviewPlaceholder');
        if (previewImg && placeholder) {
          if (url) {
            previewImg.src = url;
            previewImg.style.display = 'block';
            placeholder.style.display = 'none';
          } else {
            const fileInput = document.getElementById('testiModalFileInput');
            if (!fileInput || !fileInput.files.length) {
              previewImg.src = '';
              previewImg.style.display = 'none';
              placeholder.style.display = 'flex';
            }
          }
        }
      });
    }

    // QRIS File Input Upload Listener (FileReader base64 converter)
    const qrisFileInput = document.getElementById('qrisCfgFileInput');
    if (qrisFileInput) {
      qrisFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
          this.showToast('Harap pilih file gambar barcode QRIS (JPG, PNG, WEBP, dll)!', 'error');
          return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
          const imgUrlEl = document.getElementById('qrisCfgImageUrl');
          if (imgUrlEl) imgUrlEl.value = event.target.result;
          this.previewQrisSettings();
        };
        reader.readAsDataURL(file);
      });
    }
  }
};

window.AdminPage = AdminPage;

document.addEventListener('DOMContentLoaded', () => {
  AdminPage.init();
});
