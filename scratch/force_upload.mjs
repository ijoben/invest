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
  const list = await client.list('/');
  const idx = list.find(f => f.name === 'index.html');
  console.log('Remote index.html size:', idx ? idx.size + ' bytes' : 'NOT FOUND');
  
  const { createReadStream } = await import('fs');
  const { statSync } = await import('fs');
  const local = statSync('index.html');
  console.log('Local  index.html size:', local.size + ' bytes');
  
  if (idx && idx.size !== local.size) {
    console.log('>> MISMATCH! Re-uploading index.html...');
    await client.uploadFrom('index.html', 'index.html');
    console.log('>> Re-upload done!');
  } else {
    console.log('>> Files match - might be server cache issue');
  }
} catch(e) {
  console.error(e);
} finally {
  client.close();
}
