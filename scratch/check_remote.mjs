import * as ftp from 'basic-ftp';

const FTP_CONFIG = {
  host: '103.243.172.244',
  user: 'miningus@autotrading.my.id',
  password: 'Vxv;)W1n_^y%yv!M',
  port: 21,
  secure: false
};

const client = new ftp.Client();
try {
  await client.access(FTP_CONFIG);
  
  // Check root files with full details
  console.log('=== Files in root / ===');
  const list = await client.list('/');
  list.forEach(f => console.log(`  [${f.type === 2 ? 'DIR' : 'FILE'}] ${f.name} - ${f.size || ''}b - modified: ${f.rawModifiedAt || f.date}`));
  
  // Download a chunk of remote index.html to check its title
  console.log('\n=== Reading first 400 bytes of remote index.html ===');
  const { Writable } = await import('stream');
  let buf = '';
  const ws = new Writable({
    write(chunk, enc, cb) { buf += chunk.toString(); cb(); }
  });
  // Download partial to check title
  await client.downloadTo(ws, 'index.html');
  const titleMatch = buf.match(/<title>(.*?)<\/title>/i);
  console.log('Remote title:', titleMatch ? titleMatch[1] : 'NOT FOUND');
  
} catch(e) {
  console.error(e);
} finally {
  client.close();
}
