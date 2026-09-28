import fs from 'fs';

const file = 'c:\\KLIEN 2026\\AI PROJEK\\Investasi\\admin.html';
let html = fs.readFileSync(file, 'utf8');

// ============================================================
// 1. ADD "Pengaturan Web" button in sidebar (before email_settings)
// ============================================================
const sidebarOld = `        <button class="admin-nav-btn" data-tab="email_settings">`;
const sidebarNew = `        <button class="admin-nav-btn" data-tab="pengaturan">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
          <span>Pengaturan Web</span>
          <span class="admin-nav-badge" style="background: #6366F1;">Baru</span>
        </button>
        <button class="admin-nav-btn" data-tab="email_settings">`;

if (html.includes(sidebarOld)) {
  html = html.replace(sidebarOld, sidebarNew);
  console.log('✅ Sidebar menu added');
} else {
  console.error('❌ Sidebar target not found');
}

// ============================================================
// 2. ADD pane-pengaturan section before </div> at end of main container
//    (insert right before the closing </div> after pane-email_settings closes)
// ============================================================
const panelInsertAfter = `    </section>\n\n  </div>`;
const newPanel = `    </section>

    <!-- ====================================================================
         PANEL PENGATURAN WEB (General Site Settings)
         ==================================================================== -->
    <section id="pane-pengaturan" class="admin-view-panel">

      <!-- Inner Tab Navigation -->
      <div class="admin-settings-tabs-wrap" style="margin-bottom: 20px; border-bottom: 1px solid #1E293B; display: flex; gap: 4px; overflow-x: auto; padding-bottom: 0; scrollbar-width: none;">
        <button class="admin-settings-tab active" data-settings-tab="general" onclick="AdminPage.switchSettingsTab('general')">
          🌐 Identitas Web
        </button>
        <button class="admin-settings-tab" data-settings-tab="appearance" onclick="AdminPage.switchSettingsTab('appearance')">
          🎨 Tampilan
        </button>
        <button class="admin-settings-tab" data-settings-tab="seo" onclick="AdminPage.switchSettingsTab('seo')">
          🔍 SEO &amp; Meta
        </button>
        <button class="admin-settings-tab" data-settings-tab="social" onclick="AdminPage.switchSettingsTab('social')">
          📱 Media Sosial
        </button>
        <button class="admin-settings-tab" data-settings-tab="maintenance" onclick="AdminPage.switchSettingsTab('maintenance')">
          🔧 Pemeliharaan
        </button>
      </div>

      <!-- ===== TAB 1: IDENTITAS WEB ===== -->
      <div id="settings-tab-general" class="admin-settings-tab-pane active">

        <!-- Card: Nama &amp; Branding Utama -->
        <div class="admin-card">
          <div class="admin-card-header">
            <div>
              <h3 class="admin-card-title">🏢 Identitas &amp; Branding Utama</h3>
              <p style="font-size:11.5px;color:#94A3B8;margin-top:4px;">Atur nama platform, tagline, dan domain resmi yang tampil di seluruh halaman website.</p>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-title">Nama Platform / Brand</div>
              <div class="setting-desc">Nama utama yang tampil di header, title tab browser, dan email. (Contoh: AUTOTRADING)</div>
            </div>
            <div class="setting-input-wrap" style="width:280px;">
              <input type="text" class="admin-input" id="cfgSiteAppName" placeholder="AUTOTRADING">
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-title">Tagline / Slogan Singkat</div>
              <div class="setting-desc">Kalimat pendek yang menggambarkan platform di halaman utama dan meta description.</div>
            </div>
            <div class="setting-input-wrap" style="width:320px;">
              <input type="text" class="admin-input" id="cfgSiteTagline" placeholder="Platform Investasi &amp; AI Trading Mobile Terpercaya">
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-title">Domain / URL Resmi</div>
              <div class="setting-desc">Alamat domain utama website (tanpa trailing slash). Digunakan untuk canonical URL dan link share.</div>
            </div>
            <div class="setting-input-wrap" style="width:280px;">
              <input type="url" class="admin-input" id="cfgSiteDomain" placeholder="https://autotrading.my.id">
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-title">Nama Perusahaan Resmi</div>
              <div class="setting-desc">Nama PT/CV resmi yang tertera di dokumen, struk, dan footer halaman.</div>
            </div>
            <div class="setting-input-wrap" style="width:280px;">
              <input type="text" class="admin-input" id="cfgSiteCompanyName" placeholder="PT AUTOTRADING INVESTASI">
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-title">Email Kontak Publik</div>
              <div class="setting-desc">Email yang ditampilkan sebagai kontak layanan kepada pengguna di halaman website.</div>
            </div>
            <div class="setting-input-wrap" style="width:280px;">
              <input type="email" class="admin-input" id="cfgSiteContactEmail" placeholder="cs@autotrading.my.id">
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-title">Nomor WhatsApp CS</div>
              <div class="setting-desc">Nomor WA Customer Service yang bisa dihubungi pengguna (format internasional: 628xxx)</div>
            </div>
            <div class="setting-input-wrap" style="width:220px;">
              <input type="text" class="admin-input" id="cfgSiteWhatsapp" placeholder="6281234567890">
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-title">Teks Copyright / Footer</div>
              <div class="setting-desc">Teks yang tampil di bagian bawah (footer) setiap halaman website.</div>
            </div>
            <div class="setting-input-wrap" style="width:360px;">
              <input type="text" class="admin-input" id="cfgSiteCopyright" placeholder="© 2026 AUTOTRADING. All rights reserved.">
            </div>
          </div>

          <div style="margin-top:16px;">
            <button class="admin-btn-action-primary" onclick="AdminPage.saveWebSettings('general')">
              <span>💾 Simpan Identitas Web</span>
            </button>
          </div>
        </div>

        <!-- Card: Logo & Favicon -->
        <div class="admin-card" style="margin-top:20px;">
          <div class="admin-card-header">
            <div>
              <h3 class="admin-card-title">🖼️ Logo &amp; Favicon</h3>
              <p style="font-size:11.5px;color:#94A3B8;margin-top:4px;">Upload logo utama dan favicon website yang tampil di tab browser. Format: PNG/SVG/ICO. Maksimal 2MB.</p>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
            <!-- Logo -->
            <div>
              <div style="font-size:12px;font-weight:700;color:#E2E8F0;margin-bottom:10px;">Logo Utama (Header)</div>
              <div style="background:#0B0F19;border:2px dashed #334155;border-radius:12px;padding:20px;text-align:center;min-height:100px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;" id="logoUploadArea">
                <img id="cfgLogoPreview" src="" alt="Logo Preview" style="max-height:60px;max-width:200px;display:none;border-radius:6px;">
                <div id="cfgLogoPlaceholder" style="color:#64748B;font-size:12px;">
                  <div style="font-size:28px;margin-bottom:6px;">📁</div>
                  <div>Klik untuk upload logo</div>
                  <div style="font-size:10.5px;margin-top:4px;color:#475569;">PNG, SVG, JPG — Maks 2MB</div>
                </div>
              </div>
              <input type="file" id="cfgLogoFile" accept="image/*" style="display:none;" onchange="AdminPage.previewLogoUpload(this, 'cfgLogoPreview', 'cfgLogoPlaceholder', 'cfgLogoUrl')">
              <input type="url" class="admin-input" id="cfgLogoUrl" placeholder="https://... (atau upload file di atas)" style="margin-top:8px;">
              <button class="admin-btn-action-secondary" style="margin-top:8px;width:100%;justify-content:center;font-size:12px;" onclick="document.getElementById('cfgLogoFile').click()">
                <span>📂 Pilih File Logo</span>
              </button>
            </div>

            <!-- Favicon -->
            <div>
              <div style="font-size:12px;font-weight:700;color:#E2E8F0;margin-bottom:10px;">Favicon (Tab Browser)</div>
              <div style="background:#0B0F19;border:2px dashed #334155;border-radius:12px;padding:20px;text-align:center;min-height:100px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;" id="faviconUploadArea">
                <img id="cfgFaviconPreview" src="" alt="Favicon Preview" style="max-height:48px;max-width:48px;display:none;border-radius:6px;">
                <div id="cfgFaviconPlaceholder" style="color:#64748B;font-size:12px;">
                  <div style="font-size:28px;margin-bottom:6px;">🌐</div>
                  <div>Klik untuk upload favicon</div>
                  <div style="font-size:10.5px;margin-top:4px;color:#475569;">ICO, PNG 32x32 — Maks 512KB</div>
                </div>
              </div>
              <input type="file" id="cfgFaviconFile" accept="image/*,.ico" style="display:none;" onchange="AdminPage.previewLogoUpload(this, 'cfgFaviconPreview', 'cfgFaviconPlaceholder', 'cfgFaviconUrl')">
              <input type="url" class="admin-input" id="cfgFaviconUrl" placeholder="https://... (atau upload file di atas)" style="margin-top:8px;">
              <button class="admin-btn-action-secondary" style="margin-top:8px;width:100%;justify-content:center;font-size:12px;" onclick="document.getElementById('cfgFaviconFile').click()">
                <span>📂 Pilih File Favicon</span>
              </button>
            </div>
          </div>

          <div style="margin-top:16px;">
            <button class="admin-btn-action-primary" onclick="AdminPage.saveWebSettings('logo')">
              <span>💾 Simpan Logo &amp; Favicon</span>
            </button>
          </div>
        </div>
      </div>

      <!-- ===== TAB 2: TAMPILAN ===== -->
      <div id="settings-tab-appearance" class="admin-settings-tab-pane" style="display:none;">
        <div class="admin-card">
          <div class="admin-card-header">
            <div>
              <h3 class="admin-card-title">🎨 Warna &amp; Tema Utama</h3>
              <p style="font-size:11.5px;color:#94A3B8;margin-top:4px;">Sesuaikan warna utama (primary color) dan warna aksen yang tampil di tombol, badge, dan highlight website.</p>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-title">Warna Utama (Primary Color)</div>
              <div class="setting-desc">Warna yang tampil di tombol utama, badge aktif, dan elemen highlight website.</div>
            </div>
            <div class="setting-input-wrap" style="display:flex;align-items:center;gap:10px;">
              <input type="color" id="cfgColorPrimary" value="#C89338" style="width:48px;height:38px;border-radius:8px;border:1px solid #334155;cursor:pointer;background:none;padding:2px;">
              <input type="text" class="admin-input" id="cfgColorPrimaryHex" value="#C89338" placeholder="#C89338" style="width:100px;" oninput="document.getElementById('cfgColorPrimary').value=this.value">
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-title">Warna Latar (Background)</div>
              <div class="setting-desc">Warna latar belakang utama halaman (dark mode). Default: #0B0F19</div>
            </div>
            <div class="setting-input-wrap" style="display:flex;align-items:center;gap:10px;">
              <input type="color" id="cfgColorBg" value="#0B0F19" style="width:48px;height:38px;border-radius:8px;border:1px solid #334155;cursor:pointer;background:none;padding:2px;">
              <input type="text" class="admin-input" id="cfgColorBgHex" value="#0B0F19" placeholder="#0B0F19" style="width:100px;" oninput="document.getElementById('cfgColorBg').value=this.value">
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-title">Font / Tipografi Utama</div>
              <div class="setting-desc">Pilih jenis font utama yang digunakan di seluruh teks website.</div>
            </div>
            <div class="setting-input-wrap" style="width:240px;">
              <select class="admin-input" id="cfgFontFamily">
                <option value="Inter">Inter (Default - Modern)</option>
                <option value="Outfit">Outfit (Bersih &amp; Elegan)</option>
                <option value="Poppins">Poppins (Ramah &amp; Bulat)</option>
                <option value="Roboto">Roboto (Google Standard)</option>
                <option value="Plus Jakarta Sans">Plus Jakarta Sans (Premium)</option>
                <option value="DM Sans">DM Sans (Minimalis)</option>
              </select>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-title">Mode Tampilan Default</div>
              <div class="setting-desc">Pilih tema tampilan utama website saat pertama kali diakses.</div>
            </div>
            <div class="setting-input-wrap" style="width:240px;">
              <select class="admin-input" id="cfgDisplayMode">
                <option value="dark">🌙 Dark Mode (Default)</option>
                <option value="light">☀️ Light Mode</option>
                <option value="auto">🖥️ Auto (Ikuti Sistem)</option>
              </select>
            </div>
          </div>

          <div style="margin-top:16px;">
            <button class="admin-btn-action-primary" onclick="AdminPage.saveWebSettings('appearance')">
              <span>💾 Simpan Pengaturan Tampilan</span>
            </button>
          </div>
        </div>
      </div>

      <!-- ===== TAB 3: SEO & META ===== -->
      <div id="settings-tab-seo" class="admin-settings-tab-pane" style="display:none;">
        <div class="admin-card">
          <div class="admin-card-header">
            <div>
              <h3 class="admin-card-title">🔍 Pengaturan SEO &amp; Meta Tag</h3>
              <p style="font-size:11.5px;color:#94A3B8;margin-top:4px;">Optimalkan website untuk mesin pencari Google. Meta title dan description sangat berpengaruh pada ranking pencarian.</p>
            </div>
          </div>

          <div class="setting-row" style="flex-direction:column;align-items:flex-start;gap:8px;">
            <div class="setting-info">
              <div class="setting-title">Meta Title (Judul Tab Browser)</div>
              <div class="setting-desc">Judul yang tampil di tab browser dan hasil pencarian Google. Idealnya 50-60 karakter.</div>
            </div>
            <div style="width:100%;">
              <input type="text" class="admin-input" id="cfgSeoTitle" placeholder="AUTOTRADING - Platform Investasi &amp; AI Trading Mobile Terpercaya" style="width:100%;box-sizing:border-box;">
              <div id="cfgSeoTitleCount" style="font-size:11px;color:#64748B;margin-top:4px;text-align:right;">0 / 60 karakter</div>
            </div>
          </div>

          <div class="setting-row" style="flex-direction:column;align-items:flex-start;gap:8px;margin-top:14px;">
            <div class="setting-info">
              <div class="setting-title">Meta Description</div>
              <div class="setting-desc">Deskripsi singkat website yang tampil di hasil Google Search. Idealnya 150-160 karakter.</div>
            </div>
            <div style="width:100%;">
              <textarea class="admin-input" id="cfgSeoDescription" rows="3" placeholder="AUTOTRADING adalah platform investasi AI trading terpercaya dengan profit harian otomatis, rabat afiliasi multi-level, dan penarikan instan 24/7." style="width:100%;box-sizing:border-box;resize:vertical;" oninput="AdminPage.countChars('cfgSeoDescription','cfgSeoDescCount',160)"></textarea>
              <div id="cfgSeoDescCount" style="font-size:11px;color:#64748B;margin-top:4px;text-align:right;">0 / 160 karakter</div>
            </div>
          </div>

          <div class="setting-row" style="flex-direction:column;align-items:flex-start;gap:8px;margin-top:14px;">
            <div class="setting-info">
              <div class="setting-title">Keywords (Kata Kunci SEO)</div>
              <div class="setting-desc">Kata kunci yang relevan, pisahkan dengan koma. (Meski Google tidak memprioritaskan, tetap berguna untuk beberapa mesin pencari.)</div>
            </div>
            <div style="width:100%;">
              <textarea class="admin-input" id="cfgSeoKeywords" rows="2" placeholder="investasi online, trading AI, profit harian, autotrading, robot trading" style="width:100%;box-sizing:border-box;resize:vertical;"></textarea>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-title">Indeks Mesin Pencari (Robots)</div>
              <div class="setting-desc">Izinkan atau larang Google dan mesin pencari mengindeks website.</div>
            </div>
            <div class="setting-input-wrap" style="width:280px;">
              <select class="admin-input" id="cfgSeoRobots">
                <option value="index, follow">✅ INDEX, FOLLOW (Direkomendasikan)</option>
                <option value="noindex, nofollow">🚫 NOINDEX, NOFOLLOW (Sembunyikan dari Google)</option>
                <option value="noindex, follow">⚠️ NOINDEX, FOLLOW</option>
              </select>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-title">Google Analytics / Tag Manager ID</div>
              <div class="setting-desc">Masukkan ID Google Analytics 4 (GA4) atau Google Tag Manager (GTM) untuk tracking pengunjung.</div>
            </div>
            <div class="setting-input-wrap" style="width:220px;">
              <input type="text" class="admin-input" id="cfgGoogleAnalyticsId" placeholder="G-XXXXXXXXXX atau GTM-XXXXXXX">
            </div>
          </div>

          <div style="margin-top:16px;">
            <button class="admin-btn-action-primary" onclick="AdminPage.saveWebSettings('seo')">
              <span>💾 Simpan Pengaturan SEO</span>
            </button>
          </div>
        </div>
      </div>

      <!-- ===== TAB 4: MEDIA SOSIAL ===== -->
      <div id="settings-tab-social" class="admin-settings-tab-pane" style="display:none;">
        <div class="admin-card">
          <div class="admin-card-header">
            <div>
              <h3 class="admin-card-title">📱 Link Media Sosial &amp; Komunitas</h3>
              <p style="font-size:11.5px;color:#94A3B8;margin-top:4px;">Atur tautan media sosial resmi yang tampil di halaman website dan footer. Kosongkan jika tidak aktif.</p>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-title">💬 Link Grup Telegram</div>
              <div class="setting-desc">Link undangan grup atau channel Telegram resmi platform.</div>
            </div>
            <div class="setting-input-wrap" style="width:300px;">
              <input type="url" class="admin-input" id="cfgSocialTelegram" placeholder="https://t.me/autotradingofficial">
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-title">📸 Instagram</div>
              <div class="setting-desc">URL profil Instagram resmi (bukan username saja).</div>
            </div>
            <div class="setting-input-wrap" style="width:300px;">
              <input type="url" class="admin-input" id="cfgSocialInstagram" placeholder="https://instagram.com/autotradingofficial">
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-title">🎵 TikTok</div>
              <div class="setting-desc">URL profil TikTok resmi platform untuk konten trading dan promosi.</div>
            </div>
            <div class="setting-input-wrap" style="width:300px;">
              <input type="url" class="admin-input" id="cfgSocialTiktok" placeholder="https://tiktok.com/@autotradingofficial">
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-title">▶️ YouTube</div>
              <div class="setting-desc">URL channel YouTube resmi untuk video tutorial dan proof WD.</div>
            </div>
            <div class="setting-input-wrap" style="width:300px;">
              <input type="url" class="admin-input" id="cfgSocialYoutube" placeholder="https://youtube.com/@autotrading">
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-title">🐦 Twitter / X</div>
              <div class="setting-desc">URL profil Twitter/X resmi platform.</div>
            </div>
            <div class="setting-input-wrap" style="width:300px;">
              <input type="url" class="admin-input" id="cfgSocialTwitter" placeholder="https://x.com/autotradingid">
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-title">📘 Facebook</div>
              <div class="setting-desc">URL halaman Facebook (Page) resmi platform.</div>
            </div>
            <div class="setting-input-wrap" style="width:300px;">
              <input type="url" class="admin-input" id="cfgSocialFacebook" placeholder="https://facebook.com/autotradingofficial">
            </div>
          </div>

          <div style="margin-top:16px;">
            <button class="admin-btn-action-primary" onclick="AdminPage.saveWebSettings('social')">
              <span>💾 Simpan Link Media Sosial</span>
            </button>
          </div>
        </div>
      </div>

      <!-- ===== TAB 5: PEMELIHARAAN ===== -->
      <div id="settings-tab-maintenance" class="admin-settings-tab-pane" style="display:none;">
        <div class="admin-card" style="border-left:4px solid #EF4444;">
          <div class="admin-card-header">
            <div>
              <h3 class="admin-card-title">🔧 Mode Pemeliharaan (Maintenance Mode)</h3>
              <p style="font-size:11.5px;color:#94A3B8;margin-top:4px;">Aktifkan mode pemeliharaan untuk menonaktifkan akses publik sementara. Admin tetap bisa login.</p>
            </div>
            <span id="maintenanceBadge" class="badge-status" style="font-size:12px;padding:4px 10px;">🟢 ONLINE</span>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-title">Status Mode Pemeliharaan</div>
              <div class="setting-desc">Jika AKTIF, tampilkan halaman maintenance ke pengunjung. Admin dengan role "admin" tetap bisa akses normal.</div>
            </div>
            <div class="setting-input-wrap" style="width:280px;">
              <select class="admin-input" id="cfgMaintenanceEnabled" onchange="AdminPage.previewMaintenanceBadge()">
                <option value="false">🟢 NONAKTIF (Website Normal Online)</option>
                <option value="true">🔴 AKTIF (Mode Pemeliharaan ON)</option>
              </select>
            </div>
          </div>

          <div class="setting-row" style="flex-direction:column;align-items:flex-start;gap:8px;">
            <div class="setting-info">
              <div class="setting-title">Pesan Maintenance ke Pengunjung</div>
              <div class="setting-desc">Teks yang ditampilkan kepada pengguna saat website dalam mode pemeliharaan.</div>
            </div>
            <div style="width:100%;">
              <textarea class="admin-input" id="cfgMaintenanceMessage" rows="3" style="width:100%;box-sizing:border-box;resize:vertical;">Sistem sedang dalam pemeliharaan terjadwal. Kami akan kembali online dalam beberapa saat. Terima kasih atas kesabaran Anda.</textarea>
            </div>
          </div>

          <div style="margin-top:16px;">
            <button class="admin-btn-action-primary" onclick="AdminPage.saveWebSettings('maintenance')">
              <span>💾 Simpan Pengaturan Maintenance</span>
            </button>
          </div>
        </div>

        <!-- Card: Reset & Danger Zone -->
        <div class="admin-card" style="margin-top:20px;border-left:4px solid #F97316;">
          <div class="admin-card-header">
            <div>
              <h3 class="admin-card-title" style="color:#F97316;">⚠️ Zona Berbahaya (Danger Zone)</h3>
              <p style="font-size:11.5px;color:#94A3B8;margin-top:4px;">Tindakan di bawah ini bersifat permanen dan tidak dapat dibatalkan. Lakukan dengan hati-hati.</p>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-title" style="color:#F97316;">🗑️ Reset Semua Pengaturan Web</div>
              <div class="setting-desc">Kembalikan semua pengaturan Identitas, SEO, dan Tampilan ke nilai default bawaan sistem.</div>
            </div>
            <div class="setting-input-wrap">
              <button class="admin-btn-action-secondary" style="border-color:#F97316;color:#F97316;" onclick="AdminPage.resetWebSettings()">
                <span>🔄 Reset ke Default</span>
              </button>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-title" style="color:#EF4444;">💣 Reset Database Demo</div>
              <div class="setting-desc">Hapus semua data transaksi, user (kecuali admin), investasi, dan kembalikan ke data demo awal.</div>
            </div>
            <div class="setting-input-wrap">
              <button class="admin-btn-action-secondary" style="border-color:#EF4444;color:#EF4444;" onclick="AdminPage.resetDemoDatabase()">
                <span>⚡ Reset Database Demo</span>
              </button>
            </div>
          </div>
        </div>
      </div>

    </section>

  </div>`;

if (html.includes(panelInsertAfter)) {
  html = html.replace(panelInsertAfter, newPanel);
  console.log('✅ Panel Pengaturan added');
} else {
  console.error('❌ Panel insert anchor not found, trying alternate...');
  // Try another approach
  const alt = `    </section>\r\n\r\n  </div>`;
  if (html.includes(alt)) {
    html = html.replace(alt, newPanel.replace(/\n/g, '\r\n'));
    console.log('✅ Panel Pengaturan added (CRLF)');
  } else {
    console.error('❌ Could not find insertion point');
  }
}

fs.writeFileSync(file, html, 'utf8');
console.log('✅ admin.html saved!');
