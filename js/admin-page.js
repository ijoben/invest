/**
 * FGT PRO - STANDALONE ADMIN PAGE CONTROLLER
 * Controls admin.html views, tables, modal actions, and settings.
 */

import { DB } from './db.js';
import { Admin } from './admin.js';
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

  // Actions
  switchTab(tabId) {
    this.currentTab = tabId;
    document.querySelectorAll('.admin-nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });
    document.querySelectorAll('.admin-view-panel').forEach(pane => {
      pane.classList.toggle('active', pane.id === `pane-${tabId}`);
    });
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
    document.querySelectorAll('.admin-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        this.switchTab(tab);
      });
    });

    document.querySelectorAll('.modal-close-btn').forEach(btn => {
      btn.addEventListener('click', () => this.closeAllModals());
    });

    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) this.closeAllModals();
      });
    });
  }
};

window.AdminPage = AdminPage;

document.addEventListener('DOMContentLoaded', () => {
  AdminPage.init();
});
