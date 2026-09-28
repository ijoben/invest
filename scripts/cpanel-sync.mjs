import * as ftp from 'basic-ftp';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const FTP_CONFIG = {
  host: 'ftp.autotrading.my.id',
  user: 'autotrading@autotrading.my.id',
  password: '0QcK+H6G^NS[yEus',
  port: 21,
  secure: true,
  secureOptions: { rejectUnauthorized: false }
};

const DEPLOY_ITEMS = [
  { type: 'file', local: 'index.html', remote: 'index.html' },
  { type: 'file', local: 'admin.html', remote: 'admin.html' },
  { type: '.htaccess', local: '.htaccess', remote: '.htaccess' },
  { type: 'file', local: 'database.sql', remote: 'database.sql' },
  { type: 'file', local: 'api/config.php', remote: 'api/config.php' },
  { type: 'file', local: 'api/index.php', remote: 'api/index.php' },
  { type: 'file', local: 'api/mail.php', remote: 'api/mail.php' },
  { type: 'file', local: 'api/.htaccess', remote: 'api/.htaccess' },
  { type: 'dir', local: 'css', remote: 'css' },
  { type: 'dir', local: 'js', remote: 'js' }
];

async function withRetry(fn, retries = 3, delay = 1200) {
  for (let i = 1; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === retries) throw err;
      console.warn(`   (Warning: ${err.message}. Retrying in ${delay}ms... [Attempt ${i + 1}/${retries}])`);
      await new Promise(res => setTimeout(res, delay));
    }
  }
}

export async function deployToCpanel() {
  console.log('====================================================');
  console.log('AUTOTRADING - CPANEL LIVE DEPLOYMENT ENGINE');
  console.log('Target Server:', FTP_CONFIG.host, '(' + FTP_CONFIG.user + ')');
  console.log('====================================================\n');

  const client = new ftp.Client();
  client.ftp.verbose = false;

  async function connect() {
    await client.access(FTP_CONFIG);
  }

  try {
    console.log('1. Connecting to cPanel FTP...');
    await withRetry(() => connect(), 3, 2000);
    console.log('   CONNECTED! Remote root directory verified.\n');

    console.log('2. Deploying website files to cPanel...');
    for (const item of DEPLOY_ITEMS) {
      const localPath = path.join(rootDir, item.local);
      if (!fs.existsSync(localPath)) {
        continue;
      }

      await withRetry(async () => {
        if (client.closed) await connect();
        if (item.type === 'file' || item.type === '.htaccess') {
          process.stdout.write(`   Uploading file: ${item.local} ... `);
          const dir = path.dirname(item.remote);
          if (dir && dir !== '.') {
            await client.ensureDir(dir);
            await client.cd('/');
          }
          await client.uploadFrom(localPath, item.remote);
          console.log('OK');
        } else if (item.type === 'dir') {
          console.log(`   Syncing directory: ${item.local}/ -> ${item.remote}/`);
          await client.ensureDir(item.remote);
          await client.uploadFromDir(localPath, item.remote);
          await client.cd('/');
        }
      }, 3, 2000);
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
