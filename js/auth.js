/**
 * AUTOTRADING - AUTHENTICATION & SESSION MANAGER
 * Manages Login, Register, Forgot Password, Referral Link auto-capture, and User State.
 */

import { DB } from './db.js';

export const Auth = {
  // Check if current visitor is logged in
  isLoggedIn() {
    return DB.getCurrentUser() !== null;
  },

  // Get current active user
  getUser() {
    return DB.getCurrentUser();
  },

  getCurrentUser() {
    return DB.getCurrentUser();
  },

  // Login handler
  login(identifier, password) {
    const cleanId = String(identifier || '').trim();
    const cleanPass = String(password || '');

    if (!cleanId || !cleanPass) {
      return { success: false, message: 'Harap isi username/email/no.hp dan password!' };
    }

    const user = DB.getUserByUsername(cleanId);
    if (!user) {
      return { success: false, message: 'Akun tidak ditemukan. Silakan periksa kembali atau daftar!' };
    }

    // Blokir guard
    if (user.isBlocked) {
      return {
        success: false,
        isBlocked: true,
        message: `Akun Anda telah DIBLOKIR oleh Administrator. Alasan: ${user.blockedReason || 'Pelanggaran ketentuan sistem'}. Silakan hubungi Layanan Pelanggan (CS) untuk bantuan.`
      };
    }

    // Brute-force rate limiting check
    const now = Date.now();
    if (user.lockUntil && user.lockUntil > now) {
      const remainingSec = Math.ceil((user.lockUntil - now) / 1000);
      return {
        success: false,
        message: `Akun sementara dikunci demi keamanan karena 5x salah password. Coba lagi dalam ${remainingSec} detik.`
      };
    }

    if (user.password !== cleanPass) {
      const attempts = (user.failedLoginAttempts || 0) + 1;
      let updates = { failedLoginAttempts: attempts };
      if (attempts >= 5) {
        updates.lockUntil = now + (3 * 60 * 1000); // Lock for 3 minutes
        updates.failedLoginAttempts = 0;
        DB.updateUser(user.id, updates);
        return {
          success: false,
          message: 'Terlalu banyak percobaan password salah (5x). Akun dikunci sementara selama 3 menit demi keamanan!'
        };
      } else {
        DB.updateUser(user.id, updates);
        const sisa = 5 - attempts;
        return {
          success: false,
          message: `Password salah. Silakan coba lagi! (Sisa percobaan: ${sisa}x)`
        };
      }
    }

    // Reset failed attempts on successful login
    if (user.failedLoginAttempts || user.lockUntil) {
      DB.updateUser(user.id, { failedLoginAttempts: 0, lockUntil: null });
    }

    // Email verification check
    if (user.isPendingVerification && !user.emailVerified) {
      return {
        success: false,
        requiresVerification: true,
        user,
        message: 'Akun Anda belum aktif karena belum diverifikasi. Silakan masukkan kode OTP yang dikirimkan ke email Anda.'
      };
    }

    DB.setSession(user);
    return { success: true, user, message: `Selamat datang kembali, ${user.fullName || user.username}!` };
  },

  // Quick Demo Login helper
  quickLogin(role = 'user') {
    const db = DB.get();
    let user;
    if (role === 'admin') {
      user = db.users.find(u => u.role === 'admin') || db.users[0];
    } else {
      user = db.users.find(u => u.username === 'alex_investor') || db.users[1];
    }

    if (user) {
      if (user.isBlocked) {
        return {
          success: false,
          isBlocked: true,
          message: `Akun demo ${user.username} saat ini sedang DIBLOKIR oleh Administrator. Silakan buka blokir melalui panel Admin.`
        };
      }
      DB.setSession(user);
      return { success: true, user, message: `Login sebagai ${user.fullName} (${user.role.toUpperCase()}) berhasil!` };
    }
    return { success: false, message: 'Akun demo tidak ditemukan.' };
  },

  // Register handler
  register({ username, fullName, email, phone, password, confirmPassword, referralCode }) {
    const cleanUsername = String(username || '').trim().toLowerCase();
    const cleanFullName = String(fullName || '').trim();
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanPhone = String(phone || '').trim();
    const cleanPassword = String(password || '');
    const cleanConfirm = confirmPassword !== undefined ? String(confirmPassword) : null;

    if (!cleanUsername || !cleanEmail || !cleanPassword) {
      return { success: false, message: 'Username, Email, dan Password wajib diisi!' };
    }

    // Standard Username validation: 3-20 chars alphanumeric + underscore
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(cleanUsername)) {
      return { success: false, message: 'Username harus terdiri dari 3-20 karakter (hanya huruf, angka, dan underscore) tanpa spasi!' };
    }

    // Reserved usernames protection
    const reserved = ['admin', 'administrator', 'system', 'root', 'support', 'autotrading', 'official', 'fgtpro', 'fgt'];
    if (reserved.includes(cleanUsername)) {
      return { success: false, message: 'Username ini sudah dipesan oleh sistem dan tidak dapat digunakan!' };
    }

    // Email format validation (RFC-compliant regex)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return { success: false, message: 'Format alamat email tidak valid! Contoh: investor@gmail.com' };
    }

    // Phone format validation if provided
    if (cleanPhone) {
      const digitsOnly = cleanPhone.replace(/[^0-9]/g, '');
      if (digitsOnly.length < 9 || digitsOnly.length > 15) {
        return { success: false, message: 'Nomor WhatsApp / HP tidak valid (harus 9-15 digit angka)!' };
      }
    }

    // Password length validation (Standard minimum 6 characters)
    if (cleanPassword.length < 6) {
      return { success: false, message: 'Password minimal harus 6 karakter demi keamanan akun Anda!' };
    }

    // Password confirmation validation if provided
    if (cleanConfirm !== null && cleanPassword !== cleanConfirm) {
      return { success: false, message: 'Konfirmasi password tidak cocok dengan password yang dimasukkan!' };
    }

    // Check duplicate username or email
    const existingUser = DB.getUserByUsername(cleanUsername) || DB.getUserByUsername(cleanEmail);
    if (existingUser) {
      if (existingUser.username && existingUser.username.toLowerCase() === cleanUsername) {
        return { success: false, message: 'Username sudah digunakan oleh akun lain! Silakan pilih username lain.' };
      }
      return { success: false, message: 'Alamat email sudah terdaftar di sistem! Silakan gunakan email lain atau login.' };
    }

    // Check duplicate phone if provided
    if (cleanPhone) {
      const existingPhone = DB.getUserByPhone ? DB.getUserByPhone(cleanPhone) : null;
      if (existingPhone) {
        return { success: false, message: 'Nomor WhatsApp / HP sudah terdaftar di sistem AUTOTRADING!' };
      }
    }

    // Referral code verification
    let uplineCode = null;
    if (referralCode && referralCode.trim()) {
      const upline = DB.getUserByReferralCode(referralCode.trim());
      if (!upline) {
        return { success: false, message: `Kode sponsor / referral "${referralCode.trim()}" tidak ditemukan!` };
      }
      uplineCode = upline.referralCode;
    }

    // Generate random referral code for new user
    const generatedRef = cleanUsername.substring(0, 4).toUpperCase() + Math.floor(100 + Math.random() * 900);

    const db = DB.get();
    const isVerifyRequired = !!(db.settings && db.settings.email && db.settings.email.verificationRequired);

    const newUser = DB.addUser({
      username: cleanUsername,
      fullName: cleanFullName || cleanUsername,
      email: cleanEmail,
      phone: cleanPhone || '',
      password: cleanPassword,
      referralCode: generatedRef,
      referredBy: uplineCode,
      emailVerified: !isVerifyRequired,
      isPendingVerification: isVerifyRequired
    });

    // Send admin notification alert if enabled
    if (db.settings && db.settings.email && db.settings.email.adminNotificationOnRegister) {
      DB.dispatchMailApi('admin_notification', {
        user: {
          username: newUser.username,
          fullName: newUser.fullName,
          email: newUser.email,
          phone: newUser.phone,
          referralCode: newUser.referralCode,
          referredBy: newUser.referredBy
        }
      });
    }

    // If verification is required, send OTP to member email
    if (isVerifyRequired) {
      const otpData = DB.generateUserEmailOtp(newUser.id);
      DB.dispatchMailApi('send_otp', {
        email: newUser.email,
        name: newUser.fullName || newUser.username,
        code: otpData.code
      });

      return {
        success: true,
        requiresVerification: true,
        user: newUser,
        otpCode: otpData.code,
        message: `Registrasi berhasil! Kode OTP 6-digit telah dikirimkan ke email ${newUser.email}. Silakan verifikasi untuk mengaktifkan akun.`
      };
    }

    // Direct Login if verification is OFF
    DB.setSession(newUser);
    return { success: true, requiresVerification: false, user: newUser, message: 'Registrasi berhasil! Selamat bergabung di AUTOTRADING.' };
  },

  // Verify Registration OTP
  verifyRegistrationOtp(identifier, code) {
    return DB.verifyUserEmailOtp(identifier, code);
  },

  // Resend Registration OTP
  resendRegistrationOtp(identifier) {
    const res = DB.generateUserEmailOtp(identifier);
    if (!res) return { success: false, message: 'Akun member tidak ditemukan.' };
    DB.dispatchMailApi('send_otp', {
      email: res.email,
      name: res.fullName || res.username,
      code: res.code
    });
    return { success: true, code: res.code, email: res.email, message: `Kode OTP baru telah dikirimkan ke email ${res.email}.` };
  },

  // Forgot Password Simulation
  resetPassword(identifier, newPassword) {
    if (!identifier || !newPassword) {
      return { success: false, message: 'Harap isi kontak dan password baru!' };
    }

    const user = DB.getUserByUsername(identifier);
    if (!user) {
      return { success: false, message: 'Akun dengan kontak tersebut tidak ditemukan!' };
    }

    DB.updateUser(user.id, { password: newPassword });
    return { success: true, message: 'Password berhasil direset! Silakan login kembali.' };
  },

  // Change Password handler for logged-in user
  changePassword(userId, oldPassword, newPassword) {
    return DB.changeUserPassword(userId, oldPassword, newPassword);
  },

  // Request password reset token to email
  requestPasswordReset(email) {
    return DB.requestPasswordReset(email);
  },

  // Reset password using email verification code
  resetPasswordWithCode(identifier, code, newPassword) {
    return DB.resetPasswordWithCode(identifier, code, newPassword);
  },

  // Logout handler
  logout() {
    DB.clearSession();
    return { success: true, message: 'Anda telah berhasil logout.' };
  }
};
