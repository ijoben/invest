/**
 * FGT PRO - AUTHENTICATION & SESSION MANAGER
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
    if (!identifier || !password) {
      return { success: false, message: 'Harap isi username/email/no.hp dan password!' };
    }

    const user = DB.getUserByUsername(identifier);
    if (!user) {
      return { success: false, message: 'Akun tidak ditemukan. Silakan periksa kembali atau daftar!' };
    }

    if (user.password !== password) {
      return { success: false, message: 'Password salah. Silakan coba lagi!' };
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
      DB.setSession(user);
      return { success: true, user, message: `Login sebagai ${user.fullName} (${user.role.toUpperCase()}) berhasil!` };
    }
    return { success: false, message: 'Akun demo tidak ditemukan.' };
  },

  // Register handler
  register({ username, fullName, email, phone, password, referralCode }) {
    if (!username || !email || !password) {
      return { success: false, message: 'Semua kolom wajib diisi!' };
    }

    const existingUser = DB.getUserByUsername(username) || DB.getUserByUsername(email);
    if (existingUser) {
      return { success: false, message: 'Username atau Email sudah terdaftar!' };
    }

    let uplineCode = null;
    if (referralCode) {
      const upline = DB.getUserByReferralCode(referralCode);
      if (upline) {
        uplineCode = upline.referralCode;
      }
    }

    // Generate random referral code for new user
    const generatedRef = username.substring(0, 4).toUpperCase() + Math.floor(100 + Math.random() * 900);

    const newUser = DB.addUser({
      username: username.toLowerCase().trim(),
      fullName: fullName || username,
      email: email.toLowerCase().trim(),
      phone: phone || '',
      password,
      referralCode: generatedRef,
      referredBy: uplineCode
    });

    DB.setSession(newUser);
    return { success: true, user: newUser, message: 'Registrasi berhasil! Selamat bergabung di FGT Pro.' };
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

  // Logout handler
  logout() {
    DB.clearSession();
    return { success: true, message: 'Anda telah berhasil logout.' };
  }
};
