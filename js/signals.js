/**
 * FGT PRO - SIGNALS & LIVE MARKET SIMULATOR
 * Simulates real-time price changes on market tickers and manages Prof GPT AI Signals.
 */

import { DB } from './db.js';
import { Plans } from './plans.js';

export const Signals = {
  // Get all active AI Signals
  getSignals() {
    const db = DB.get();
    return db.signals || [];
  },

  // Get Market Tickers
  getMarketTickers() {
    const db = DB.get();
    return db.marketTickers || [];
  },

  // Fluctuate market prices dynamically (only when market is ON)
  tickMarkets() {
    const db = DB.get();
    if (!db.marketTickers) return [];

    const marketStatus = Plans.isMarketOpen();
    if (!marketStatus.isOpen) {
      // Market is OFF: keep prices static
      return db.marketTickers;
    }

    db.marketTickers.forEach(item => {
      // 50% chance to fluctuate each second
      if (Math.random() > 0.4) {
        const deltaPercent = (Math.random() * 0.16 - 0.08); // -0.08% to +0.08%
        const oldPrice = item.price;
        item.price = parseFloat((oldPrice * (1 + deltaPercent / 100)).toFixed(item.id.includes('USD') && !item.id.includes('BTC') && !item.id.includes('XAU') ? 5 : 2));
        
        item.change = parseFloat((item.change + deltaPercent).toFixed(2));
        item.isUp = deltaPercent >= 0;
      }
    });

    DB.save(db);
    return db.marketTickers;
  },

  // Add new signal (Admin feature)
  addSignal({ pair, action, entry, tp, sl, confidence, flags }) {
    const db = DB.get();
    const newSignal = {
      id: 'sig-' + Date.now(),
      pair: pair.toUpperCase(),
      action: action.toUpperCase(),
      entry: String(entry),
      tp: String(tp),
      sl: String(sl),
      confidence: Number(confidence) || 90,
      timeAgo: 'Just now',
      flags: flags || ['🌍', '📊'],
      status: 'active'
    };

    db.signals.unshift(newSignal);
    DB.save(db);
    return newSignal;
  },

  // Delete signal (Admin feature)
  deleteSignal(id) {
    const db = DB.get();
    db.signals = (db.signals || []).filter(s => s.id !== id);
    DB.save(db);
    return true;
  }
};
