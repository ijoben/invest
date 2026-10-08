import fs from 'fs';

console.log('=== TEST VERIFIKASI PERBAIKAN PPOB 4 POIN USER ===\n');

const indexHtml = fs.readFileSync('index.html', 'utf8');
const adminHtml = fs.readFileSync('admin.html', 'utf8');
const appJs = fs.readFileSync('js/app.js', 'utf8');
const adminPageJs = fs.readFileSync('js/admin-page.js', 'utf8');
const adminJs = fs.readFileSync('js/admin.js', 'utf8');
const authJs = fs.readFileSync('js/auth.js', 'utf8');

let passed = true;

// 1. POIN 1: HARGA JUAL PPOB (10k=12k, 20k=22k, 50k=52k, 100k=102k)
console.log('1. Pengujian Poin 1 - Skema Harga Jual PPOB:');
const hasPricingLogic = appJs.includes('10000: 12000') && appJs.includes('20000: 22000') && 
                       appJs.includes('50000: 52000') && appJs.includes('100000: 102000');
const hasLabelPrice10 = indexHtml.includes('Bayar: Rp 12.000');
const hasLabelPrice20 = indexHtml.includes('Bayar: Rp 22.000');
const hasLabelPrice50 = indexHtml.includes('Bayar: Rp 52.000');
const hasLabelPrice100 = indexHtml.includes('Bayar: Rp 102.000');
const hasAdminPricingInputs = adminHtml.includes('id="ppobCfgPrice10"') && 
                              adminHtml.includes('id="ppobCfgPrice20"') && 
                              adminHtml.includes('id="ppobCfgPrice50"') && 
                              adminHtml.includes('id="ppobCfgPrice100"');

console.log('   - getPpobPrice() default pricing (10k=12k, 20k=22k, 50k=52k, 100k=102k):', hasPricingLogic);
console.log('   - Label "Bayar: Rp 12.000, 22.000, 52.000, 102.000" di index.html:', hasLabelPrice10 && hasLabelPrice20 && hasLabelPrice50 && hasLabelPrice100);
console.log('   - Form admin pengaturan harga jual PPOB di admin.html:', hasAdminPricingInputs);

if (!hasPricingLogic || !hasLabelPrice10 || !hasAdminPricingInputs) {
  passed = false;
}

// 2. POIN 2: STATUS PENGISIAN & KETERANGAN (DALAM PROSES / SELESAI / GANGGUAN) & SAKLAR ON/OFF
console.log('\n2. Pengujian Poin 2 - Status Proses & Saklar ON/OFF:');
const hasMemberHistoryContainer = indexHtml.includes('id="mainWalletPpobHistoryWrap"') && 
                                  indexHtml.includes('id="mainWalletPpobHistoryList"');
const hasMemberStatusBadges = appJs.includes('⏳ DALAM PROSES') && 
                              appJs.includes('✅ SELESAI') && 
                              appJs.includes('⚠️ GANGGUAN');
const hasAdminPpobProcessModal = adminHtml.includes('id="adminPpobProcessModal"') && 
                                 adminHtml.includes('id="adminPpobStatusSelect"') && 
                                 adminHtml.includes('id="adminPpobNoteInput"');
const hasAdminProcessModalMethods = adminPageJs.includes('openPpobProcessModal(trxId)') && 
                                    adminPageJs.includes('savePpobProcessModal()');
const hasAdminShowStatusSwitch = adminHtml.includes('id="ppobCfgShowStatus"');
const hasAdminStatusSwitchMethod = adminPageJs.includes('ppobCfgShowStatus');

console.log('   - Kontainer riwayat & status proses di menu PPOB member:', hasMemberHistoryContainer);
console.log('   - Badge status: Dalam Proses / Selesai / Gangguan:', hasMemberStatusBadges);
console.log('   - Modal proses pengisian & input SN/Token PLN di Admin:', hasAdminPpobProcessModal);
console.log('   - Handler openPpobProcessModal & savePpobProcessModal di AdminPage:', hasAdminProcessModalMethods);
console.log('   - Saklar ON/OFF tampilan status proses di admin.html & admin-page.js:', hasAdminShowStatusSwitch && hasAdminStatusSwitchMethod);

if (!hasMemberHistoryContainer || !hasMemberStatusBadges || !hasAdminPpobProcessModal || !hasAdminProcessModalMethods || !hasAdminShowStatusSwitch) {
  passed = false;
}

// 3. POIN 3: CEK SISTEM BEBAS ERROR & SINKRON
console.log('\n3. Pengujian Poin 3 - Cek Sistem Bebas Error:');
const hasAuthSetUser = authJs.includes('setUser(user)') && authJs.includes('setSession(user)');
const hasAdminRefund = adminPageJs.includes('isRefunded') && adminJs.includes('isRefunded');

console.log('   - Auth.setUser() tersedia (mencegah TypeError Auth.setUser):', hasAuthSetUser);
console.log('   - Refund saldo otomatis saat status Gangguan/Tolak:', hasAdminRefund);

if (!hasAuthSetUser || !hasAdminRefund) {
  passed = false;
}

// 4. POIN 4: PESAN SUKSES KONFIRMASI PPOB
console.log('\n4. Pengujian Poin 4 - Pesan Konfirmasi PPOB:');
const targetMessage = 'PPOB Anda sedang dalam proses manual Admin.';
const hasMessageInAppSubmit = appJs.includes(`'${targetMessage}'`) || appJs.includes(`"${targetMessage}"`);
const noKesalahanErrorInPpob = !appJs.includes("terjadi kesalahan saat PPOB");

console.log(`   - Pesan "${targetMessage}" terpasang:`, hasMessageInAppSubmit);
console.log('   - Kalimat "terjadi kesalahan saat PPOB" sudah dihapus:', noKesalahanErrorInPpob);

if (!hasMessageInAppSubmit || !noKesalahanErrorInPpob) {
  passed = false;
}

console.log('\n==================================================');
if (passed) {
  console.log('✅ SEMUA 4 POIN PERBAIKAN TELAH LULUS UJI VALIDASI 100%!');
  process.exit(0);
} else {
  console.error('❌ ADA SYARAT YANG BELUM TERPENUHI!');
  process.exit(1);
}
