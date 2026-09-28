process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const res = await fetch('https://autotrading.my.id/', {
  headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
});
const html = await res.text();

const titleMatch = html.match(/<title>(.*?)<\/title>/i);
console.log('=== Live Server Tab Title ===');
console.log('Title:', titleMatch ? titleMatch[1] : 'NOT FOUND');

// Check if old brand still exists
const hasFgt = /FGT|fgtpro/i.test(html);
console.log('Contains FGT?', hasFgt ? 'YES - still has old brand!' : 'NO - clean');
