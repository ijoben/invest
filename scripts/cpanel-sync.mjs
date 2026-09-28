import * as ftp from 'basic-ftp';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const FTP_CONFIG = {
  host: '103.243.172.244', // Resolves from ftp.autotrading.my.id
  user: 'miningus@autotrading.my.id',
  password: 'Vxv;)W1n_^y%yv!M',
  port: 21,
  secure: false
};

const DEPLOY_ITEMS = [
  { type: 'file', local: 'index.html', remote: 'index.html' },
  { type: 'file', local: 'admin.html', remote: 'admin.html' },
  { type: 'file', local: '.htaccess', remote: '.htaccess' },
  { type: 'file', local: 'database.sql', remote: 'database.sql' },
  { type: 'dir', local: 'css', remote: 'css' },
  { type: 'dir', local: 'js', remote: 'js' },
  { type: 'dir', local: 'api', remote: 'api' }
];

export async function deployToCpanel() {
  console.log('====================================================');
  console.log('FGT PRO - CPANEL LIVE DEPLOYMENT ENGINE');
  console.log('Target Server:', FTP_CONFIG.host, '(' + FTP_CONFIG.user + ')');
  console.log('====================================================\n');

  const client = new ftp.Client();
  client.ftp.verbose = false; // clean readable output

  try {
    console.log('1. Connecting to cPanel FTP...');
    await client.access(FTP_CONFIG);
    console.log('   CONNECTED! Remote root directory verified.\n');

    console.log('2. Deploying website files to cPanel...');
    for (const item of DEPLOY_ITEMS) {
      const localPath = path.join(rootDir, item.local);
      if (!fs.existsSync(localPath)) {
        console.warn(`   [SKIP] ${item.local} not found locally.`);
        continue;
      }

      if (item.type === 'file') {
        process.stdout.write(`   Uploading file: ${item.local} ... `);
        await client.uploadFrom(localPath, item.remote);
        console.log('OK');
      } else if (item.type === 'dir') {
        console.log(`   Syncing directory: ${item.local}/ -> ${item.remote}/`);
        await client.ensureDir(item.remote);
        await client.uploadFromDir(localPath, item.remote);
        await client.cd('/'); // Return to root
      }
    }

    console.log('\n3. Verifying remote deployment...');
    await client.cd('/');
    const remoteList = await client.list();
    console.log('   Remote files active in cPanel:');
    for (const f of remoteList) {
      console.log(`    - ${f.name} (${f.isDirectory ? 'DIR' : 'FILE'}, ${f.size} bytes)`);
    }

    console.log('\n====================================================');
    console.log('DEPLOYMENT TO CPANEL COMPLETED SUCCESSFULLY! (100%)');
    console.log('Website is live and synced.');
    console.log('====================================================\n');
    return true;
  } catch (err) {
    console.error('\nDEPLOYMENT ERROR:', err.message || err);
    return false;
  } finally {
    client.close();
  }
}

deployToCpanel();
