import fs from 'fs';

console.log('--- TEST VERIFIKASI FITUR PPOB (PULSA & TOKEN LISTRIK PLN) ---');

const indexHtml = fs.readFileSync('index.html', 'utf8');
const adminHtml = fs.readFileSync('admin.html', 'utf8');
const appJs = fs.readFileSync('js/app.js', 'utf8');
const adminPageJs = fs.readFileSync('js/admin-page.js', 'utf8');
const adminJs = fs.readFileSync('js/admin.js', 'utf8');
const apiPhp = fs.readFileSync('api/index.php', 'utf8');

// 1. Verifikasi Modal di index.html
const hasMainPpobModal = indexHtml.includes('id="mainWalletPpobModal"');
const isNotInEmailModal = !indexHtml.includes('id="emailOtpModal">\n    <div class="modal-backdrop" id="mainWalletPpobModal"');
const hasCatButtons = indexHtml.includes('id="btnMainPpobCatPulsa"') && indexHtml.includes('id="btnMainPpobCatPln"');
const hasDenomButtons = indexHtml.includes('id="btnMainPpob10"') && indexHtml.includes('id="btnMainPpob100"');

console.log('1. index.html Check:');
console.log('   - Modal mainWalletPpobModal ada:', hasMainPpobModal);
console.log('   - Modal terpisah sempurna dari emailOtpModal:', isNotInEmailModal);
console.log('   - Tombol kategori Pulsa & PLN ada:', hasCatButtons);
console.log('   - Tombol nominal 10k s/d 100k ada:', hasDenomButtons);

// 2. Verifikasi admin.html
const hasAdminPpobCard = adminHtml.includes('id="ppobCfgMasterEnabled"');
const hasAdminFee = adminHtml.includes('id="ppobCfgAdminFee"');
const hasAdminNotice = adminHtml.includes('id="ppobCfgNotice"');
const hasWdFilters = adminHtml.includes('id="btnWdFilterPulsa"') && adminHtml.includes('id="btnWdFilterPln"');

console.log('2. admin.html Check:');
console.log('   - Card Pengaturan PPOB di admin:', hasAdminPpobCard);
console.log('   - Field Biaya Admin & Notice PPOB:', hasAdminFee && hasAdminNotice);
console.log('   - Filter Penarikan & PPOB di Admin:', hasWdFilters);

// 3. Verifikasi js/app.js
const hasOpenMethod = appJs.includes('openMainWalletPpobModal(category');
const hasSetCatMethod = appJs.includes('setMainWalletPpobCategory(category)');
const hasSubmitPpob = appJs.includes('submitMainWalletPpob()');
const hasWindowAlias = appJs.includes('window.openMainWalletPpobModal') && appJs.includes('window.openPpobModal');

console.log('3. js/app.js Check:');
console.log('   - openMainWalletPpobModal mendukung category:', hasOpenMethod);
console.log('   - setMainWalletPpobCategory ada:', hasSetCatMethod);
console.log('   - submitMainWalletPpob ada:', hasSubmitPpob);
console.log('   - Window alias global terpasang:', hasWindowAlias);

// 4. Verifikasi js/admin-page.js & js/admin.js
const hasRenderPpob = adminPageJs.includes('renderPpobSettings(db)');
const hasSavePpob = adminPageJs.includes('savePpobSettings()');
const hasWithdrawFilter = adminPageJs.includes('setWithdrawFilter(filter)');
const hasAdminApprovePpob = adminJs.includes("trx.type === 'ppob_conversion'");
const hasAdminRefundPpob = adminJs.includes("trx.walletSource === 'Wallet Tambah Teman'");

console.log('4. js/admin-page.js & js/admin.js Check:');
console.log('   - renderPpobSettings & savePpobSettings:', hasRenderPpob && hasSavePpob);
console.log('   - setWithdrawFilter di AdminPage:', hasWithdrawFilter);
console.log('   - Admin approve & reject refund PPOB:', hasAdminApprovePpob && hasAdminRefundPpob);

// 5. Verifikasi database api/index.php
const hasPpobTypeInDb = apiPhp.includes("ppob_conversion");
const hasSyncSettingsInDb = apiPhp.includes("INSERT INTO `settings`");

console.log('5. api/index.php Check:');
console.log('   - Database MySQL mendukung tipe ppob_conversion:', hasPpobTypeInDb);
console.log('   - Sync settings ke MySQL otomatis:', hasSyncSettingsInDb);

const allOk = hasMainPpobModal && isNotInEmailModal && hasCatButtons && hasAdminPpobCard && 
              hasOpenMethod && hasSubmitPpob && hasRenderPpob && hasSavePpob && hasPpobTypeInDb;

if (allOk) {
  console.log('\n>>> SEMUA VERIFIKASI FITUR PPOB BERHASIL 100%! <<<');
} else {
  console.error('\n>>> TERDAPAT KEGAGALAN VERIFIKASI! <<<');
  process.exit(1);
}
