# Metal Installment Applications & Minting History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide end-to-end management and reporting for physical precious metal installment applications (perak & emas), payment schedule notifications, admin approval with attached applicant/KTP data, and member physical minting order history.

**Architecture:**
- Backend (`api/index.php`): Add `admin_get_metal_installments`, `admin_update_metal_installment`, `pay_metal_installment`, enhance `get_asset_data` to return user installments and minting orders, and enhance `order_physical_minting` for both gold and silver with dynamic fees from settings.
- Admin Frontend (`admin.html` & `js/admin-page.js`): Add table section for metal installment applications in `pane-aset_perak`, render applicant details (Name, NIK, WhatsApp, shipping address, KTP image modal preview), tenor, DP, monthly installment, and action buttons (Approve, Reject, Complete).
- Member Frontend (`aset.html`): Add "Riwayat & Tagihan Cicilan Logam Mulia" card with monthly payment breakdown, due date notification, and "Bayar Angsuran" button; add "Riwayat Pengajuan Cetak Fisik" card.

**Tech Stack:** PHP (PDO MySQL), JavaScript ES Modules, HTML5, CSS3, REST API.

**Spec:** User prompt requirements:
1. Fix installment submission so application and history appear in both admin and member area (DP balance properly accounted for).
2. Display installment transaction history and monthly bill payment notifications up to selected tenor in member area.
3. Display full application form details in admin area including member identity, KTP attachment, metal type, grams, and tenor.
4. Display physical minting transaction history in member area for transparent reporting.

## Global Constraints
- Do not break existing responsive layout or dark/light theme styles.
- Preserve atomic database transactions and strict parameter bindings (no PDO parameter clashes).
- Ensure all endpoints check authorization (`requireLogin` for member, `requireAdmin` for admin).
- Deploy all tested changes to cPanel live server (`https://autotrading.my.id`) and run verification suite before completing.

## Review Focus
1. User submits installment with insufficient DP balance: must reject gracefully with clear shortfall message.
2. User pays monthly installment when wallet balance is insufficient: must fail safely with prompt to deposit.
3. Admin approves installment: updates status to `approved`, sets `next_due_date` 30 days ahead.
4. Member pays last installment (`paid_installments == tenor_months`): marks installment as `completed` and awards 50 points.
5. Member submits physical minting for Gold: checks `gold_balance`, deducts gold grams and minting fee, and displays in history.

---

### Task 1: Backend Database & Endpoints for Metal Installments & Minting History

**Files:**
- Modify: `api/index.php:676-745` (Schema upgrade in `ensureTablesExist`)
- Modify: `api/index.php:10770-10830` (`get_asset_data` to include installments and minting orders)
- Modify: `api/index.php:12620-12685` (`order_physical_minting` enhancement for gold/silver with dynamic fee)
- Modify: `api/index.php:12830-12900` (`submit_metal_installment`, plus new actions `admin_get_metal_installments`, `admin_update_metal_installment`, `pay_metal_installment`)

**Interfaces:**
- Produces:
  - `action=admin_get_metal_installments` -> `{ success: true, data: [...] }`
  - `action=admin_update_metal_installment` -> `{ success: true, message: "..." }`
  - `action=pay_metal_installment` -> `{ success: true, message: "..." }`
  - `action=get_asset_data` -> returns `data.installments` and `data.minting_orders`

- [ ] **Step 1: Write integration test script for backend endpoints**
  Create `scratch/test_installment_endpoints.cjs` testing `get_asset_data`, `submit_metal_installment`, `admin_get_metal_installments`, `admin_update_metal_installment`, and `pay_metal_installment`.

- [ ] **Step 2: Run test to verify initial failure**
  Run: `node scratch/test_installment_endpoints.cjs`
  Expected: FAIL on `admin_get_metal_installments` (endpoint not implemented).

- [ ] **Step 3: Implement database schema upgrade and backend endpoints in `api/index.php`**
  Add columns `paid_installments`, `next_due_date`, `admin_notes` to `metal_installments`.
  Implement `admin_get_metal_installments`, `admin_update_metal_installment`, `pay_metal_installment`.
  Enhance `get_asset_data` and `order_physical_minting`.

- [ ] **Step 4: Run test to verify endpoints pass**
  Run: `node scratch/test_installment_endpoints.cjs`
  Expected: PASS with 200 OK and expected JSON responses.

- [ ] **Step 5: Commit backend changes**
  Run: `git commit -am "feat: implement metal installments & minting backend actions"`

---

### Task 2: Admin Area Interface for Metal Installments & Attachments

**Files:**
- Modify: `admin.html:1870-1910` (Add Installments table in `pane-aset_perak`)
- Modify: `js/admin-page.js:2600-2610` (Hook `loadMetalInstallmentsAdmin` in tab switch)
- Modify: `js/admin-page.js:6100-6180` (Implement `loadMetalInstallmentsAdmin`, `updateMetalInstallmentStatus`, `viewKtpModal`)

**Interfaces:**
- Consumes: `api/index.php?action=admin_get_metal_installments`
- Produces: HTML table `#adminMetalInstallmentsTableBody` and action handlers

- [ ] **Step 1: Write validation test for admin markup and script**
  Create `scratch/test_admin_installments_markup.cjs` checking table `#adminMetalInstallmentsTableBody` and functions exist.

- [ ] **Step 2: Run test to verify it fails**
  Expected: FAIL (elements and functions not yet defined).

- [ ] **Step 3: Implement HTML table in `admin.html` and controller methods in `js/admin-page.js`**
  Add "📋 Pengajuan & Riwayat Cicilan Logam Mulia" card in `admin.html`.
  Implement `loadMetalInstallmentsAdmin()`, `updateMetalInstallmentStatus(id, status)`, and modal KTP preview.

- [ ] **Step 4: Run test and verify script syntax**
  Run: `node --check js/admin-page.js && node scratch/test_syntax_and_integrity.cjs`
  Expected: PASS with 0 errors.

- [ ] **Step 5: Commit admin changes**
  Run: `git commit -am "feat: add metal installments management table and ktp modal in admin area"`

---

### Task 3: Member Area Interface for Installment History, Bill Schedule & Minting History

**Files:**
- Modify: `aset.html:2020-2120` (Add tabs or cards for Installments and Physical Minting History)
- Modify: `aset.html:2450-2550` (Render installments list, monthly payment schedule notification, and `payInstallment(id)`)
- Modify: `aset.html:2630-2670` (Render physical minting history table)

**Interfaces:**
- Consumes: `currentData.installments`, `currentData.minting_orders` from `get_asset_data`
- Produces: Interactive payment buttons and status badges for installments and minting orders

- [ ] **Step 1: Write test for member asset UI components**
  Create `scratch/test_member_asset_ui.cjs` verifying HTML containers and functions in `aset.html`.

- [ ] **Step 2: Run test to verify it fails**
  Expected: FAIL (new sections not present yet).

- [ ] **Step 3: Implement UI sections and payment handler in `aset.html`**
  Add installment card with monthly bill breakdown, status pill, and "Bayar Angsuran" button.
  Add physical minting order history card with tracking number/status.

- [ ] **Step 4: Run test and verify syntax**
  Run: `node scratch/test_syntax_and_integrity.cjs`
  Expected: PASS with 0 syntax errors.

- [ ] **Step 5: Commit member UI changes**
  Run: `git commit -am "feat: add installment schedule and physical minting history in member area"`

---

### Task 4: Live Deployment & Comprehensive End-to-End Verification

**Files:**
- Deploy: `api/index.php`, `admin.html`, `js/admin-page.js`, `aset.html` to cPanel via FTP
- Verify: `https://autotrading.my.id`

- [ ] **Step 1: Deploy modified files to cPanel FTP**
  Run: `node scripts/cpanel-sync.mjs`
  Expected: 100% upload success.

- [ ] **Step 2: Run live end-to-end verification script**
  Test member installment submission, verify it appears in admin area with KTP and full applicant data, verify member sees the installment and monthly bill notification, test monthly installment payment, and test physical minting order.

- [ ] **Step 3: Document evidence and finalize artifact**
  Update `task_tracking.md` with complete evidence before reporting completion.

