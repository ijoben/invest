const fs = require('fs');

let content = fs.readFileSync('database.sql', 'utf8');

// 1. Direct string replacements
content = content.replace(/fgtpro-investasi\.com/g, 'autotrading.my.id');
content = content.replace(/admin@fgtpro\.io/g, 'admin@autotrading.my.id');
content = content.replace(/fgt-pro-v2\.4\.apk/g, 'autotrading-v2.4.apk');
content = content.replace(/FGT_PRO_OFFICIAL_QRIS_DEPOSIT/g, 'AUTOTRADING_OFFICIAL_QRIS_DEPOSIT');
content = content.replace(/FGT_PRO_OFFICIAL/g, 'AUTOTRADING_OFFICIAL');

// 2. Base64 SVG replacements for 'PT FGT PRO INVESTASI'
// In base64, 'PT FGT PRO INVESTASI' is 'UFQgRkdUIFBSTyBJTlZFU1RBU0k='
// 'PT AUTOTRADING INVESTASI' is 'UFQgQVVUT1RSQURJTkcgSU5WRVNUQVNJ'
content = content.replace(/UFQgRkdUIFBSTyBJTlZFU1RBU0k=/g, 'UFQgQVVUT1RSQURJTkcgSU5WRVNUQVNJ');

// Also check for raw 'PT FGT PRO INVESTASI'
content = content.replace(/PT FGT PRO INVESTASI/g, 'PT AUTOTRADING INVESTASI');

// Also check any other base64 data:image/svg+xml;base64, strings
content = content.replace(/data:image\/svg\+xml;base64,([A-Za-z0-9+/=]+)/g, (match, b64) => {
  try {
    let decoded = Buffer.from(b64, 'base64').toString('utf8');
    if (/fgt/i.test(decoded)) {
      decoded = decoded.replace(/fgtpro-investasi\.com/gi, 'autotrading.my.id');
      decoded = decoded.replace(/FGT PRO/gi, 'AUTOTRADING');
      decoded = decoded.replace(/FGT/gi, 'AUTOTRADING');
      return 'data:image/svg+xml;base64,' + Buffer.from(decoded).toString('base64');
    }
  } catch(e) {}
  return match;
});

fs.writeFileSync('database.sql', content, 'utf8');
console.log('database.sql thoroughly cleaned and updated!');
