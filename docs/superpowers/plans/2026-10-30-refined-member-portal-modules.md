# Refined Member Portal Modules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement comprehensive refinements across Aset Logam Mulia (dual Emas & Perak cards, bullion illustrations, separate liquid vs savings balances, price charts, deposit flow), Toko Online (admin product CRUD with photos & stock, +10 points reward, rebranding from Toko Offline), and member-only gate protection across all 3 pages, integrated with MySQL and admin controls, followed by full testing and cPanel server deployment.

**Architecture:**
- **Frontend Member**: Responsive mobile-first UI with tab switcher for Gold & Silver assets, custom SVG bullion graphics, segregated liquid vs locked asset displays, dynamic SVG price trend charts, and member-only authentication gates.
- **Backend API (`api/index.php`)**: REST API endpoints for Dual Asset prices & transactions, Toko Online product CRUD & orders with automatic +10 point rewards, minting fee calculation, and leader loans.
- **Admin Portal (`admin.html` & `js/admin-page.js`)**: Realtime management of Gold & Silver prices, minting fees, price history chart trends, and full Toko Online product catalog CRUD (photo upload, description, stock).
- **Database (`database.sql` & MySQL)**: Relational schema supporting `gold_balance`, `gold_savings_balance`, `silver_savings_balance`, `shop_products`, `minting_fee` settings, and points ledger.

**Tech Stack:** PHP 8.x PDO, MySQL / phpMyAdmin, Vanilla JavaScript (ES6+), HTML5 Canvas/SVG, CSS3 Glassmorphism, basic-ftp (cPanel sync).

**Spec:** `docs/superpowers/specs/2026-10-30-member-portal-modules-design.md`

## Global Constraints
- Clean URLs without `.html` extension must be preserved via `.htaccess`.
- No native ugly popup alerts (`alert()`, `confirm()`); all dialogs must use `#appCustomPopupOverlay`.
- Pure member area access: Guests attempting to access `/aset`, `/toko`, or `/pinjaman` must be intercepted and directed to the member login.
- Liquid asset balance (siap jual) must never be mixed with locked savings, contracts, or installments.
- Live deployment to `ftp.autotrading.my.id` must only occur after 100% pass across all verification test suites.

## Review Focus
1. Selling limit: Attempting to sell more grams than the liquid balance (`silver_balance` or `gold_balance`) must be rejected, even if total asset including savings is higher.
2. Insufficient wallet balance on buy: Buying gold or silver with insufficient wallet balance must display the exact deficit and provide a one-click redirect to deposit.
3. Toko product stock depletion: Ordering a product with 0 stock must be prevented with a clear "Stok Habis" notification.
4. Product purchase reward: Successfully purchasing a shop product must grant exactly +10 points to the user's points balance and record a ledger entry.
5. Guest protection: Unauthenticated visitors opening `/aset`, `/toko`, or `/pinjaman` directly must see a member access gate and be prompted to log in.

---

### Task 1: Database Schema & Migration Expansion
**Files:**
- Modify: `database.sql:35-175`
- Modify: `api/index.php:350-420` (ensureTablesExist)
- Test: `scratch/test_schema_expansion.cjs`

**Interfaces:**
- Produces: `gold_balance`, `gold_savings_balance`, `silver_savings_balance`, `silver_contract_balance`, `gold_contract_balance` on `users` table; `asset_type` enum on `asset_transactions`; `stock`, `image_url` on `shop_products`; `minting_fee_silver`, `minting_fee_gold`, `gold_buy_price`, `gold_sell_price` in `settings`.

- [ ] **Step 1: Write test verifying schema columns and settings**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Update `database.sql` and `ensureTablesExist` in `api/index.php`**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit changes**

---

### Task 2: Backend API Endpoints & Toko CRUD Handlers
**Files:**
- Modify: `api/index.php:10490-11600`
- Test: `scratch/test_backend_modules.cjs`

**Interfaces:**
- Produces:
  - `get_asset_data`: Returns dual asset details (Perak & Emas: buy/sell prices, liquid balance, savings balance, cashback, estimated rupiah, chart price history).
  - `buy_silver_asset` & `buy_gold_asset`: Purchases liquid bullion with wallet balance check.
  - `sell_silver_asset` & `sell_gold_asset`: Sells liquid bullion strictly from liquid balance.
  - `admin_save_asset_prices`: Saves buy/sell prices, cashbacks, and chart data for Perak and Emas.
  - `admin_save_minting_fee`: Saves physical minting fees.
  - `admin_save_shop_product`: Handles product create/update with photo, description, price, and stock.
  - `admin_delete_shop_product`: Deletes a shop product.
  - `order_shop_product`: Decrements stock by 1, deducts balance, and awards +10 points to `users.points`.

- [ ] **Step 1: Write test for dual asset and toko product CRUD API responses**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement API action handlers in `api/index.php`**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit changes**

---

### Task 3: Dual Asset Interface with Bullion Art, Split Balances & Price Charts (`aset.html`)
**Files:**
- Modify: `aset.html`
- Test: `scratch/test_aset_page.cjs`

**Interfaces:**
- Produces:
  - Mobile Tab Switcher: Tab Perak vs Tab Emas.
  - Perak Card (Slate/Silver metallic styling with realistic SVG Silver Bar).
  - Emas Card (Luxury Gold metallic styling with realistic SVG Gold Bar).
  - Separated Balances Card: Saldo Siap Jual (Likuid), Saldo Tabungan, Saldo Kontrak Aktif.
  - Interactive SVG Price Trend Chart (7d / 14d / 30d).
  - Buy Modal with Wallet Balance Check: Potong Saldo jika cukup, atau tombol "Deposit Sekarang (Kurang Rp X)" jika kurang.
  - Sell Modal strictly bounded by Saldo Siap Jual.
  - Modal Cetak Fisik with dynamic minting fee from admin.
  - Transaction History with filter tabs (Semua, Jual/Beli Likuid, Tabungan, Kontrak).
  - Member-only access gate for unauthenticated visitors.

- [ ] **Step 1: Write test verifying all UI elements, SVGs, tabs, and modals in `aset.html`**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement UI and client logic in `aset.html`**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit changes**

---

### Task 4: Toko Online Catalog, Realtime Stock & Member Access (`toko.html`)
**Files:**
- Modify: `toko.html`
- Test: `scratch/test_toko_page.cjs`

**Interfaces:**
- Produces:
  - Rebranding to "Toko Online".
  - Realtime product listing with photo, description, price, stock badge, and "+10 Poin Reward" label.
  - Order checkout modal with stock validation.
  - Member-only access gate on page boot.

- [ ] **Step 1: Write test verifying Toko Online labels, product card structure, and member-only gate**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement updates in `toko.html`**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit changes**

---

### Task 5: Member Gate & Policy in `pinjaman.html`
**Files:**
- Modify: `pinjaman.html`
- Test: `scratch/test_pinjaman_page.cjs`

**Interfaces:**
- Produces:
  - Strict member-only access gate on page boot.
  - Verified leader loan form and repayment modal.

- [ ] **Step 1: Write test verifying member-only gate in `pinjaman.html`**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement member gate in `pinjaman.html`**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit changes**

---

### Task 6: Admin Panel Product CRUD, Dual Asset & Minting Controls (`admin.html` & `js/admin-page.js`)
**Files:**
- Modify: `admin.html`
- Modify: `js/admin-page.js`
- Test: `scratch/test_admin_portal.cjs`

**Interfaces:**
- Produces:
  - Cleaned duplicate HTML sections in `admin.html`.
  - Tab Aset: Form Harga Beli & Jual Perak, Harga Beli & Jual Emas, Saldo Cashback, Biaya Cetak Fisik per gram, and 7-day price history points editor.
  - Tab Toko Online: Product CRUD management table with Modal Tambah/Edit Produk (Foto, Nama, Harga, Stok, Deskripsi) and Delete confirmation.
  - Integration with `AdminPage.saveAssetPrices()`, `AdminPage.saveShopProduct()`, `AdminPage.deleteShopProduct()`, etc.

- [ ] **Step 1: Write test verifying admin UI controls and methods**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement admin controls in `admin.html` and `js/admin-page.js`**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit changes**

---

### Task 7: Home Quick Menu Rebranding & Protection (`index.html`)
**Files:**
- Modify: `index.html`
- Test: `scratch/test_index_nav.cjs`

**Interfaces:**
- Produces:
  - "Toko Offline" label updated to "Toko Online".
  - Quick menu click handler checks member authentication: if guest, opens login modal; if logged in, navigates to clean module route.

- [ ] **Step 1: Write test verifying quick menu label and guest check**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement updates in `index.html`**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit changes**

---

### Task 8: Master E2E Verification Across All 13 User Requirements
**Files:**
- Create: `scratch/test_all_13_requirements_master.cjs`
- Run: All test suites

- [ ] **Step 1: Write comprehensive 13-point verification test script**
- [ ] **Step 2: Execute test suite and verify 100% PASS**
- [ ] **Step 3: Validate HTML and JavaScript syntax across all files**

---

### Task 9: cPanel Live Deployment & Production URL Testing
**Files:**
- Execute: `scripts/cpanel-sync.mjs`
- Execute: `scratch/test_live_production_suite.cjs`

- [ ] **Step 1: Deploy all updated files to live cPanel server**
- [ ] **Step 2: Run live production endpoint tests against `https://autotrading.my.id`**
- [ ] **Step 3: Verify HTTP 200, clean URLs, member actions, and admin endpoints**
- [ ] **Step 4: Present final completion report with verified evidence**

