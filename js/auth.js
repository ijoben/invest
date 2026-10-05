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

  // Login handler: verified server-side first (bcrypt + rate limiting),
  // with a local state fallback when the server is unreachable (offline dev).
  async login(identifier, password) {
    const cleanId = String(identifier || '').trim();
    const cleanPass = String(password || '');

    if (!cleanId || !cleanPass) {
      return { success: false, message: 'Harap isi username/email/no.hp dan password!' };
    }

    // ---- 1. Authoritative server-side login ----
    if (typeof fetch === 'function') {
      try {
        const res = await fetch(DB.getApiUrl('login'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: cleanId, password: cleanPass })
        });
        const json = await res.json().catch(() => null);
        if (json && typeof json.success === 'boolean') {
          if (!json.success) {
            const failure = {
              success: false,
              isBlocked: !!json.isBlocked,
              requiresVerification: !!json.requiresVerification,
              message: json.message || 'Login gagal! Periksa kembali username/email dan password Anda.'
            };
            if (failure.requiresVerification) {
              const pendingUser = DB.getUserByUsername(cleanId);
              if (pendingUser) failure.user = pendingUser;
            }
            return failure;
          }

          const db = DB.get();
          db.users = db.users || [];
          let local = db.users.find(u => u.id === json.user.id);
          if (!local) {
            // Server knows this account but our cache does not yet
            local = { ...json.user, walletBalance: 0, affiliateBalance: 0, points: 10, role: json.user.role || 'user', status: 'active', isBlocked: false };
            db.users.push(local);
          } else {
            Object.assign(local, json.user);
            if (local.isBlocked || local.status === 'blocked') {
              return { success: false, isBlocked: true, message: 'Akun Anda telah DIBLOKIR oleh Administrator. Silakan hubungi Layanan Pelanggan (CS) untuk bantuan.' };
            }
          }
          // Keep the password in memory only (never persisted) so the browser
          // session can be silently re-established on the next visit.
          local.password = cleanPass;
          DB.setSession(local);
          return {
            success: true,
            user: local,
            rotatedSeed: !!json.rotatedSeed,
            message: json.message || `Selamat datang kembali, ${local.fullName || local.username}!`
          };
        }
        // Unexpected/non-JSON response -> fall back to local verification
      } catch (e) {
        // Network error -> local fallback below
      }
    }

    // ---- 2. Local fallback (offline development) ----
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

  // Quick Demo Login helper (Disabled in Production)
  quickLogin() {
    return { success: false, message: 'Fitur quick demo login dinonaktifkan. Silakan gunakan form login resmi.' };
  },

  // Register handler
  async register({ username, fullName, email, phone, password, confirmPassword, referralCode }) {
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

    // Anti-XSS: display names must never carry HTML/script markup
    if (/[<>]/.test(cleanFullName)) {
      return { success: false, message: 'Nama lengkap tidak boleh mengandung karakter khusus (< atau >)! Silakan perbaiki nama Anda.' };
    }

    // Anti-Multi-Account Guard: Check duplicate username, email, or phone
    const dbUsers = DB.get().users || [];
    const dupUsername = dbUsers.find(u => u.username && u.username.toLowerCase() === cleanUsername);
    if (dupUsername) {
      return { success: false, isDuplicateAccount: true, message: 'Username sudah digunakan oleh akun lain! Silakan pilih username lain.' };
    }

    const dupEmail = dbUsers.find(u => u.email && u.email.toLowerCase() === cleanEmail);
    if (dupEmail) {
      return {
        success: false,
        isDuplicateAccount: true,
        message: `⚠️ PERINGATAN SISTEM: Terdeteksi Akun Ganda! Alamat email "${cleanEmail}" sudah terdaftar pada sistem (Akun: ${dupEmail.username}). Kebijakan keamanan melarang keras kepemilikan multi-akun (akun ganda) demi perlindungan dana & pencegahan kecurangan!`
      };
    }

    // Check duplicate phone if provided
    if (cleanPhone) {
      const cleanP = cleanPhone.replace(/[^0-9]/g, '');
      const dupPhone = dbUsers.find(u => {
        if (!u.phone) return false;
        return String(u.phone).replace(/[^0-9]/g, '') === cleanP;
      });
      if (dupPhone) {
        return {
          success: false,
          isDuplicateAccount: true,
          message: `⚠️ PERINGATAN SISTEM: Terdeteksi Akun Ganda! Nomor WhatsApp/HP "${cleanPhone}" sudah terdaftar pada akun lain (${dupPhone.username}). Satu nomor kontak hanya dapat digunakan untuk 1 akun member!`
        };
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

    const newUser = await DB.addUser({
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

    // If verification is required, request a server-generated OTP (emailed, never returned)
    if (isVerifyRequired) {
      const otpData = await DB.generateUserEmailOtp(newUser.id);
      if (otpData && otpData.serverManaged && !otpData.failed) {
        return {
          success: true,
          requiresVerification: true,
          user: newUser,
          message: `Registrasi berhasil! Kode OTP 6-digit telah dikirimkan ke email ${newUser.email}. Silakan cek kotak masuk (dan folder Spam) lalu masukkan kode untuk mengaktifkan akun.`
        };
      }
      if (otpData && otpData.failed) {
        return {
          success: true,
          requiresVerification: true,
          user: newUser,
          message: otpData.message || 'Registrasi berhasil, namun pengiriman kode OTP gagal. Silakan klik Kirim Ulang Kode.'
        };
      }
      // Offline fallback: dispatch the locally generated code through the mail API
      if (otpData) {
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
      return {
        success: true,
        requiresVerification: true,
        user: newUser,
        message: 'Registrasi berhasil! Verifikasi email diperlukan, tetapi kode OTP belum dapat dikirimkan. Silakan klik Kirim Ulang Kode.'
      };
    }

    // Direct Login if verification is OFF
    DB.setSession(newUser);
    return { success: true, requiresVerification: false, user: newUser, message: 'Registrasi berhasil! Selamat bergabung di AUTOTRADING.' };
  },

  // Verify Registration OTP (server-side validation)
  verifyRegistrationOtp(identifier, code) {
    return DB.verifyUserEmailOtp(identifier, code);
  },

  // Resend Registration OTP
  resendRegistrationOtp(identifier) {
    return DB.generateUserEmailOtp(identifier).then((res) => {
      if (!res) return { success: false, message: 'Akun member tidak ditemukan.' };
      if (res.serverManaged && !res.failed) {
        return {
          success: true,
          email: res.email,
          message: res.message || `Kode OTP baru telah dikirimkan ke email ${res.email}.`
        };
      }
      if (res.failed) {
        return { success: false, message: res.message || 'Gagal mengirim kode OTP. Coba lagi nanti.' };
      }
      if (res.code) {
        DB.dispatchMailApi('send_otp', {
          email: res.email,
          name: res.fullName || res.username,
          code: res.code
        });
        return { success: true, code: res.code, email: res.email, message: `Kode OTP baru telah dikirimkan ke email ${res.email}.` };
      }
      return { success: false, message: 'Gagal membuat kode OTP. Coba lagi nanti.' };
    });
  },

  // Deprecated: unverified password reset is disabled (it was an account-takeover hole).
  // Passwords can only be reset through the OTP flow:
  // requestPasswordReset() -> server emails a code -> resetPasswordWithCode().
  resetPassword(identifier, newPassword) {
    return {
      success: false,
      message: 'Fitur reset tanpa verifikasi dinonaktifkan demi keamanan. Gunakan alur "Lupa Password" dengan kode OTP yang dikirimkan ke email Anda.'
    };
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

  // Logout handler (clears local session + server session cookie)
  logout() {
    DB.clearSession();
    try {
      if (typeof fetch === 'function') {
        fetch(DB.getApiUrl('logout'), { method: 'POST' }).catch(() => {});
      }
    } catch (e) {}
    return { success: true, message: 'Anda telah berhasil logout.' };
  }
};
