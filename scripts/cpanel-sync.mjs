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
  secure: false
};

const DEPLOY_DIRECTORIES = ['css', 'js', 'api'];
const DEPLOY_ROOT_FILES = ['index.html', 'admin.html', '.htaccess', 'robots.txt', 'database.sql'];

function getFilesRecursively(dir, baseDir = '') {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const relPath = path.posix.join(baseDir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(getFilesRecursively(fullPath, relPath));
    } else {
      results.push({ fullPath, relPath });
    }
  }
  return results;
}

async function withRetry(fn, onRetry = null, retries = 4, delay = 2000) {
  for (let i = 1; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === retries) throw err;
      console.warn(`\n   (Warning: ${err.message}. Retrying in ${delay}ms... [Attempt ${i + 1}/${retries}])`);
      if (onRetry) {
        try {
          await onRetry();
        } catch (eRetry) {}
      }
      await new Promise(res => setTimeout(res, delay));
    }
  }
}

export async function deployToCpanel() {
  console.log('====================================================');
  console.log('AUTOTRADING - CPANEL LIVE DEPLOYMENT ENGINE');
  console.log('Target Server:', FTP_CONFIG.host, '(' + FTP_CONFIG.user + ')');
  console.log('====================================================\n');

  let client = new ftp.Client();
  client.ftp.verbose = false;

  async function connect() {
    try { client.close(); } catch (e) {}
    client = new ftp.Client();
    client.ftp.verbose = false;
    await client.access(FTP_CONFIG);
  }

  try {
    console.log('1. Connecting to cPanel FTP...');
    await withRetry(() => connect(), null, 3, 2000);
    console.log('   CONNECTED! Remote root directory verified.\n');

    // Clean up any stray nested js/js if created previously
    try {
      await client.removeDir('js/js');
      console.log('   Cleaned up stray js/js directory.');
    } catch (e) {}

    // Gather all files to upload
    const filesToUpload = [];
    for (const file of DEPLOY_ROOT_FILES) {
      const fullPath = path.join(rootDir, file);
      if (fs.existsSync(fullPath)) {
        filesToUpload.push({ fullPath, relPath: file });
      }
    }
    for (const dir of DEPLOY_DIRECTORIES) {
      const fullDir = path.join(rootDir, dir);
      if (fs.existsSync(fullDir)) {
        filesToUpload.push(...getFilesRecursively(fullDir, dir));
      }
    }

    console.log(`2. Deploying ${filesToUpload.length} files to cPanel...`);
    for (const item of filesToUpload) {
      await withRetry(
        async () => {
          if (client.closed) await connect();
          process.stdout.write(`   Uploading: ${item.relPath} ... `);
          await client.cd('/');
          const remoteDir = path.posix.dirname(item.relPath);
          if (remoteDir && remoteDir !== '.') {
            await client.ensureDir(remoteDir);
            await client.uploadFrom(item.fullPath, path.posix.basename(item.relPath));
            await client.cd('/');
          } else {
            await client.uploadFrom(item.fullPath, item.relPath);
          }
          console.log('OK');
        },
        async () => {
          await connect();
        },
        4,
        2500
      );
      // Small throttle to avoid server connection drop
      await new Promise(r => setTimeout(r, 200));
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
