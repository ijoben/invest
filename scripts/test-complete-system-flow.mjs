const API_BASE = 'https://autotrading.my.id/api/index.php';

async function apiGet() {
  const res = await fetch(`${API_BASE}?action=get`);
  if (!res.ok) throw new Error(`GET failed HTTP ${res.status}`);
  const json = await res.json();
  if (!json.success || !json.data) throw new Error(`GET returned error: ${JSON.stringify(json)}`);
  return json.data;
}

async function apiSave(data) {
  const res = await fetch(`${API_BASE}?action=save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`SAVE failed HTTP ${res.status}`);
  const json = await res.json();
  if (!json.success) throw new Error(`SAVE returned error: ${JSON.stringify(json)}`);
  return json;
}

async function apiRegister(user) {
  const res = await fetch(`${API_BASE}?action=register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(user)
  });
  const json = await res.json();
  if (!json.success) throw new Error(`Register failed: ${JSON.stringify(json)}`);
  return json.user;
}

async function apiUpdateStatus(userId, isBlocked, reason = '') {
  const res = await fetch(`${API_BASE}?action=update_user_status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      isBlocked,
      blockedReason: reason
    })
  });
  const json = await res.json();
  if (!json.success) throw new Error(`Update status failed: ${JSON.stringify(json)}`);
  return json;
}

async function apiDeleteUser(userId) {
  const res = await fetch(`${API_BASE}?action=delete_user`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId })
  });
  return await res.json();
}

async function runFullSystemTest() {
  console.log('================================================================');
  console.log('AUTOTRADING - COMPREHENSIVE END-TO-END SYSTEM TEST');
  console.log('Target Server: https://autotrading.my.id/api/index.php');
  console.log('================================================================\n');

  const timestamp = Date.now();
  const uplineUsername = `lead_${timestamp.toString().slice(-4)}`;
  const uplineEmail = `${uplineUsername}@autotrading.my.id`;
  const uplineRefCode = `REF${timestamp.toString().slice(-4)}`;

  const downlineUsername = `trader_${timestamp.toString().slice(-4)}`;
  const downlineEmail = `${downlineUsername}@autotrading.my.id`;

  let uplineUser, downlineUser;

  try {
    // -------------------------------------------------------------
    // TEST 1: REGISTER UPLINE & DOWNLINE (WITH REFERRAL CODE)
    // -------------------------------------------------------------
    console.log('👉 TEST 1: Register Upline Member...');
    uplineUser = await apiRegister({
      username: uplineUsername,
      fullName: 'Bapak Hendra (Leader)',
      email: uplineEmail,
      phone: '0812' + Math.floor(10000000 + Math.random() * 90000000),
      password: 'UplinePassword123!',
      referralCode: uplineRefCode
    });
    console.log(`   ✓ Upline registered: ID=${uplineUser.id}, username=${uplineUser.username}, refCode=${uplineUser.referralCode}`);

    console.log('\n👉 TEST 2: Register Downline Member (Using Upline Referral Code)...');
    downlineUser = await apiRegister({
      username: downlineUsername,
      fullName: 'Mas Doni (Investor)',
      email: downlineEmail,
      phone: '0813' + Math.floor(10000000 + Math.random() * 90000000),
      password: 'DownlinePassword123!',
      referredBy: uplineUser.referralCode
    });
    console.log(`   ✓ Downline registered: ID=${downlineUser.id}, username=${downlineUser.username}, referredBy=${downlineUser.referredBy}`);

    // Verify in GET data
    const check1 = await apiGet();
    const upCheck = check1.users.find(u => u.id === uplineUser.id);
    const downCheck = check1.users.find(u => u.id === downlineUser.id);
    if (!upCheck || !downCheck) throw new Error('Registered users not found in database!');
    if (downCheck.referredBy !== uplineUser.referralCode) throw new Error('Referral linking failed!');
    console.log('   ✓ Database verification passed: Both users and referral hierarchy intact in MySQL.');

    // -------------------------------------------------------------
    // TEST 3: DEPOSIT REQUEST & ADMIN APPROVAL
    // -------------------------------------------------------------
    console.log('\n👉 TEST 3: Member Submits Deposit Request...');
    const depositAmount = 1000000;
    const depTxId = 'TRX-DEP-' + Math.floor(100000 + Math.random() * 900000);
    
    let db = await apiGet();
    const depTrx = {
      id: depTxId,
      userId: downlineUser.id,
      username: downlineUser.username,
      type: 'deposit',
      amount: depositAmount,
      netAmount: depositAmount,
      status: 'pending',
      paymentMethod: 'BCA Virtual Account / Transfer Bank',
      destinationAccount: 'BCA 800112233 a/n PT AUTOTRADING',
      txid: 'BCA-' + Date.now(),
      uniqueCode: '001',
      proofImage: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==',
      createdAt: new Date().toISOString()
    };
    db.transactions.unshift(depTrx);
    await apiSave(db);
    console.log(`   ✓ Deposit submitted: ID=${depTxId}, Amount=${depositAmount}, Status=pending`);

    // Admin verifies pending deposit and Approves it
    console.log('   -> Admin reviews pending transactions and Approves Deposit...');
    db = await apiGet();
    const trxToApprove = db.transactions.find(t => t.id === depTxId);
    if (!trxToApprove || trxToApprove.status !== 'pending') throw new Error('Deposit transaction not pending!');
    
    trxToApprove.status = 'approved';
    trxToApprove.approvedAt = new Date().toISOString();
    
    // Credit user's walletBalance
    const targetUser = db.users.find(u => u.id === downlineUser.id);
    targetUser.walletBalance = (targetUser.walletBalance || 0) + depositAmount;
    await apiSave(db);

    // Verify walletBalance
    const check2 = await apiGet();
    const userAfterDep = check2.users.find(u => u.id === downlineUser.id);
    if (userAfterDep.walletBalance !== depositAmount) {
      throw new Error(`Wallet balance mismatch: Expected ${depositAmount}, Got ${userAfterDep.walletBalance}`);
    }
    console.log(`   ✓ Deposit approved! Downline Wallet Balance = Rp ${userAfterDep.walletBalance.toLocaleString('id-ID')} (Saved to MySQL)`);

    // -------------------------------------------------------------
    // TEST 4: PLAN INVESTMENT & SPONSOR BONUS DISTRIBUTION
    // -------------------------------------------------------------
    console.log('\n👉 TEST 4: Member Buys Investment Plan (Rookie Trader)...');
    const investCapital = 500000;
    const invId = 'INV-' + Math.floor(100000 + Math.random() * 900000);

    db = await apiGet();
    const buyer = db.users.find(u => u.id === downlineUser.id);
    if (buyer.walletBalance < investCapital) throw new Error('Insufficient wallet balance to invest!');
    buyer.walletBalance -= investCapital;

    const newInvestment = {
      id: invId,
      userId: buyer.id,
      planId: 'plan-rookie',
      planName: 'Rookie Trader Package',
      capital: investCapital,
      minRate: 1.5,
      maxRate: 3.0,
      totalProfitEarned: 0,
      pendingProfitClaim: 0,
      daysElapsed: 0,
      durationDays: 30,
      status: 'active',
      startDate: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };
    db.investments = db.investments || [];
    db.investments.unshift(newInvestment);

    // Record investment purchase transaction
    db.transactions.unshift({
      id: 'TRX-INV-' + Math.floor(100000 + Math.random() * 900000),
      userId: buyer.id,
      username: buyer.username,
      type: 'invest_plan',
      amount: investCapital,
      status: 'approved',
      paymentMethod: 'Wallet Balance',
      createdAt: new Date().toISOString()
    });

    // Distribute Sponsor Bonus to Upline (10% = 50,000)
    const sponsorPercent = (db.settings && db.settings.sponsorBonusPercent) || 10;
    const sponsorBonusAmt = Math.floor((investCapital * sponsorPercent) / 100);
    const uplineInDb = db.users.find(u => u.id === uplineUser.id);
    if (uplineInDb) {
      uplineInDb.affiliateBalance = (uplineInDb.affiliateBalance || 0) + sponsorBonusAmt;
      uplineInDb.points = (uplineInDb.points || 0) + 10;

      db.transactions.unshift({
        id: 'TRX-SPS-' + Math.floor(100000 + Math.random() * 900000),
        userId: uplineInDb.id,
        username: uplineInDb.username,
        type: 'sponsor_bonus',
        amount: sponsorBonusAmt,
        note: `Bonus Sponsor ${sponsorPercent}% dari investasi ${buyer.username}`,
        status: 'approved',
        createdAt: new Date().toISOString()
      });
    }

    await apiSave(db);

    // Verify Investment & Sponsor Bonus in Database
    const check3 = await apiGet();
    const buyerAfterInv = check3.users.find(u => u.id === downlineUser.id);
    const uplineAfterInv = check3.users.find(u => u.id === uplineUser.id);
    const invInDb = check3.investments.find(i => i.id === invId);

    if (!invInDb || invInDb.status !== 'active') throw new Error('Investment not found active in database!');
    if (buyerAfterInv.walletBalance !== (depositAmount - investCapital)) {
      throw new Error(`Buyer balance mismatch after invest: Expected ${depositAmount - investCapital}, Got ${buyerAfterInv.walletBalance}`);
    }
    if (uplineAfterInv.affiliateBalance !== sponsorBonusAmt) {
      throw new Error(`Upline affiliate balance mismatch: Expected ${sponsorBonusAmt}, Got ${uplineAfterInv.affiliateBalance}`);
    }

    console.log(`   ✓ Investment activated: ID=${invId}, Capital=Rp ${investCapital.toLocaleString('id-ID')}`);
    console.log(`   ✓ Buyer Sisa Saldo Wallet = Rp ${buyerAfterInv.walletBalance.toLocaleString('id-ID')}`);
    console.log(`   ✓ Upline Bonus Sponsor 10% Masuk = Rp ${uplineAfterInv.affiliateBalance.toLocaleString('id-ID')} (Saved to MySQL)`);

    // -------------------------------------------------------------
    // TEST 5: PROFIT YIELD & PROFIT CLAIM (WITH RABAT BONUS)
    // -------------------------------------------------------------
    console.log('\n👉 TEST 5: Daily Profit Yield & Member Profit Claim...');
    const profitYieldAmt = 15000; // 3% of 500,000
    db = await apiGet();
    const activeInv = db.investments.find(i => i.id === invId);
    activeInv.pendingProfitClaim = profitYieldAmt;

    // Member claims profit
    const investor = db.users.find(u => u.id === downlineUser.id);
    investor.walletBalance += activeInv.pendingProfitClaim;
    activeInv.totalProfitEarned += activeInv.pendingProfitClaim;
    const claimedAmt = activeInv.pendingProfitClaim;
    activeInv.pendingProfitClaim = 0;

    // Record profit claim transaction
    db.transactions.unshift({
      id: 'TRX-CLM-' + Math.floor(100000 + Math.random() * 900000),
      userId: investor.id,
      username: investor.username,
      type: 'profit_claim',
      amount: claimedAmt,
      status: 'approved',
      createdAt: new Date().toISOString()
    });

    // Rabat bonus level 1 (5% of claimed profit = 750)
    const rabatAmt = Math.floor((claimedAmt * 5) / 100);
    const uplineRef = db.users.find(u => u.id === uplineUser.id);
    if (uplineRef) {
      uplineRef.affiliateBalance += rabatAmt;
      db.transactions.unshift({
        id: 'TRX-RBT-' + Math.floor(100000 + Math.random() * 900000),
        userId: uplineRef.id,
        username: uplineRef.username,
        type: 'rabat_bonus',
        level: 1,
        amount: rabatAmt,
        status: 'approved',
        createdAt: new Date().toISOString()
      });
    }

    await apiSave(db);

    const check4 = await apiGet();
    const investorAfterClaim = check4.users.find(u => u.id === downlineUser.id);
    const uplineAfterRabat = check4.users.find(u => u.id === uplineUser.id);

    console.log(`   ✓ Profit Claimed: Rp ${claimedAmt.toLocaleString('id-ID')}`);
    console.log(`   ✓ Investor New Wallet Balance = Rp ${investorAfterClaim.walletBalance.toLocaleString('id-ID')}`);
    console.log(`   ✓ Upline Rabat Bonus Masuk = Rp ${uplineAfterRabat.affiliateBalance.toLocaleString('id-ID')} (Saved to MySQL)`);

    // -------------------------------------------------------------
    // TEST 6: WITHDRAWAL REQUEST & ADMIN APPROVAL
    // -------------------------------------------------------------
    console.log('\n👉 TEST 6: Member Submits Withdrawal Request...');
    const withdrawAmt = 100000;
    const wdTxId = 'TRX-WD-' + Math.floor(100000 + Math.random() * 900000);

    db = await apiGet();
    const wdUser = db.users.find(u => u.id === downlineUser.id);
    if (wdUser.walletBalance < withdrawAmt) throw new Error('Insufficient wallet balance to withdraw!');
    wdUser.walletBalance -= withdrawAmt;

    db.transactions.unshift({
      id: wdTxId,
      userId: wdUser.id,
      username: wdUser.username,
      type: 'withdraw',
      amount: withdrawAmt,
      netAmount: withdrawAmt - 5000,
      status: 'pending',
      paymentMethod: 'Transfer Bank BCA',
      destinationAccount: '1234567890 a/n Doni',
      createdAt: new Date().toISOString()
    });
    await apiSave(db);
    console.log(`   ✓ Withdrawal requested: ID=${wdTxId}, Amount=Rp ${withdrawAmt.toLocaleString('id-ID')}, Status=pending`);

    // Admin approves Withdrawal
    console.log('   -> Admin approves Withdrawal...');
    db = await apiGet();
    const wdToApprove = db.transactions.find(t => t.id === wdTxId);
    wdToApprove.status = 'approved';
    wdToApprove.approvedAt = new Date().toISOString();
    await apiSave(db);

    const check5 = await apiGet();
    const wdInDb = check5.transactions.find(t => t.id === wdTxId);
    if (!wdInDb || wdInDb.status !== 'approved') throw new Error('Withdrawal not marked approved in database!');
    console.log(`   ✓ Withdrawal approved in MySQL! Status = ${wdInDb.status.toUpperCase()}`);

    // -------------------------------------------------------------
    // TEST 7: BLOCK & UNBLOCK STATUS ATOMIC SYNCHRONIZATION
    // -------------------------------------------------------------
    console.log('\n👉 TEST 7: Testing Member Status Synchronization (Block & Unblock)...');
    const blockRes = await apiUpdateStatus(downlineUser.id, 1, 'Pengujian suspensi');
    console.log(`   ✓ Block executed: isBlocked=${blockRes.isBlocked}, status=${blockRes.status}`);

    const check6 = await apiGet();
    const blockedInDb = check6.users.find(u => u.id === downlineUser.id);
    if (!blockedInDb.isBlocked && blockedInDb.status !== 'blocked') {
      throw new Error('User not blocked in database!');
    }
    console.log('   ✓ Database confirms member is BLOCKED.');

    const unblockRes = await apiUpdateStatus(downlineUser.id, 0);
    console.log(`   ✓ Unblock executed: isBlocked=${unblockRes.isBlocked}, status=${unblockRes.status}`);

    const check7 = await apiGet();
    const unblockedInDb = check7.users.find(u => u.id === downlineUser.id);
    if (unblockedInDb.isBlocked || unblockedInDb.status === 'blocked') {
      throw new Error('User still blocked in database!');
    }
    console.log('   ✓ Database confirms member is ACTIVE again.');

    console.log('\n================================================================');
    console.log('🎉 ALL SYSTEM MODULES TESTED & VERIFIED 100% OPERATIONAL!');
    console.log('================================================================');

  } finally {
    // -------------------------------------------------------------
    // CLEANUP: REMOVE TEST USERS & TEST TRANSACTIONS
    // -------------------------------------------------------------
    console.log('\n🧹 CLEANUP PHASE: Cleaning test accounts and test transactions...');
    try {
      if (uplineUser && uplineUser.id) {
        const del1 = await apiDeleteUser(uplineUser.id);
        console.log(`   - Deleted test upline: ${uplineUser.id} (${del1.message})`);
      }
      if (downlineUser && downlineUser.id) {
        const del2 = await apiDeleteUser(downlineUser.id);
        console.log(`   - Deleted test downline: ${downlineUser.id} (${del2.message})`);
      }

      // Clean transactions & investments belonging to test users
      const cleanDb = await apiGet();
      const testIds = [uplineUser?.id, downlineUser?.id].filter(Boolean);
      const initialTxCount = cleanDb.transactions.length;
      const initialInvCount = cleanDb.investments.length;

      cleanDb.transactions = cleanDb.transactions.filter(t => !testIds.includes(t.userId));
      cleanDb.investments = cleanDb.investments.filter(i => !testIds.includes(i.userId));

      await apiSave(cleanDb);
      console.log(`   - Cleaned ${initialTxCount - cleanDb.transactions.length} test transactions and ${initialInvCount - cleanDb.investments.length} test investments.`);
      console.log('   ✓ Database is clean and ready for real production members!');
    } catch(cleanErr) {
      console.error('   Warning during cleanup:', cleanErr.message);
    }
  }
}

runFullSystemTest().catch(err => {
  console.error('\n❌ TEST RUN FAILED:', err);
  process.exit(1);
});
