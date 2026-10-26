// Offline verification for logo upload branding.
//
// Loads the real admin.html DOM, drives AdminPage.applyBrandLogo exactly like
// renderAll()/upload does, and asserts the logo replaces the icon + text in the
// sidebar and topbar. No network, no database writes.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const check = (label, ok, extra = '') => {
  if (ok) { pass++; console.log('  OK   ' + label); }
  else { fail++; console.log('  FAIL ' + label + (extra ? '  <' + extra + '>' : '')); }
};

const html = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const dom = new JSDOM(html, { url: 'https://autotrading.my.id/admin', runScripts: 'outside-only' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.sessionStorage = dom.window.sessionStorage;
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.navigator = dom.window.navigator;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Event = dom.window.Event;

const { AdminPage } = await import('../js/admin-page.js');
const { DB } = await import('../js/db.js');

const fakeDb = { settings: { appName: 'AUTOTRADING', webSettings: { logoUrl: '' } }, users: [], investments: [], transactions: [] };
DB.get = () => fakeDb;

const el = (id) => document.getElementById(id);
const visible = (node) => !!node && node.style.display !== 'none';
const logo = 'https://autotrading.my.id/uploads/test-logo.png';

AdminPage.applyBrandLogo({ logoUrl: logo });

check('Sidebar: gambar logo tampil', visible(el('adminSidebarLogoImg')));
check('Sidebar: gambar memakai URL logo', el('adminSidebarLogoImg')?.getAttribute('src') === logo);
check('Sidebar: badge ikon disembunyikan', !visible(el('adminSidebarLogoBadge')));
check('Sidebar: teks AUTOTRADING disembunyikan', !visible(el('adminSidebarBrandName')));
check('Sidebar: subtitle disembunyikan agar logo tidak terhimpit', !visible(el('adminSidebarBrandRole')));

check('Topbar: gambar logo tampil', visible(el('adminTopbarLogoImg')));
check('Topbar: gambar memakai URL logo', el('adminTopbarLogoImg')?.getAttribute('src') === logo);
check('Topbar: ikon SVG disembunyikan', !visible(el('adminTopbarLogoIcon')));
check('Topbar: teks judul disembunyikan', !visible(el('adminTopbarTitle')));
check('Topbar: badge ADMIN tetap tampil', !!document.querySelector('.admin-title-badge'));

AdminPage.applyBrandLogo({ logoUrl: '' });

check('Reset: gambar sidebar disembunyikan', !visible(el('adminSidebarLogoImg')));
check('Reset: badge ikon kembali tampil', visible(el('adminSidebarLogoBadge')));
check('Reset: teks AUTOTRADING kembali tampil', visible(el('adminSidebarBrandName')) && el('adminSidebarBrandName').textContent === 'AUTOTRADING');
check('Reset: subtitle kembali tampil', visible(el('adminSidebarBrandRole')));
check('Reset: gambar topbar disembunyikan', !visible(el('adminTopbarLogoImg')));
check('Reset: ikon topbar kembali tampil', visible(el('adminTopbarLogoIcon')));
check('Reset: judul topbar kembali tampil', visible(el('adminTopbarTitle')) && el('adminTopbarTitle').textContent === 'AUTOTRADING');

// Broken image must fall back to text, not leave an empty header
AdminPage.applyBrandLogo({ logoUrl: 'https://autotrading.my.id/uploads/tidak-ada.png' });
el('adminSidebarLogoImg').dispatchEvent(new dom.window.Event('error'));
el('adminTopbarLogoImg').dispatchEvent(new dom.window.Event('error'));
check('Fallback saat logo gagal dimuat: teks sidebar tampil', visible(el('adminSidebarBrandName')));
check('Fallback saat logo gagal dimuat: teks topbar tampil', visible(el('adminTopbarTitle')));

// Frontend markup/logic: logo stands alone (text removed when logo exists)
const appJs = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
check('Frontend memakai class header-brand-logo', appJs.includes('header-brand-logo'));
const logoBranch = appJs.slice(appJs.indexOf('if (ws.logoUrl) {'), appJs.indexOf('renderBrandFallback();\n      }'));
check('Frontend tidak menambahkan teks saat logo ada', !logoBranch.includes('header-brand-text'));
check('Frontend punya fallback teks saat logo kosong', appJs.includes('renderBrandFallback'));

// Auto-save wiring + changelog note
const adminPageJs = fs.readFileSync(path.join(root, 'js/admin-page.js'), 'utf8');
check('Upload logo otomatis menyimpan pengaturan', adminPageJs.includes("settingKey = isFavicon ? 'faviconUrl' : 'logoUrl'"));
check('Changelog admin mencatat perbaikan logo', html.includes('Upload logo langsung aktif'));
check('Route upload_image tersedia di backend', fs.readFileSync(path.join(root, 'api/index.php'), 'utf8').includes("$action === 'upload_image'"));

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
