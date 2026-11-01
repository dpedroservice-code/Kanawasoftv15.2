'use strict';

// Generates the producer's local AGT software-signing key pair.
// The private key is created outside the repository and is never printed.
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const keyDir = process.env.KANAWA_AGT_KEY_DIR || path.join(os.homedir(), '.kanawa', 'secure', 'agt');
const privatePath = path.join(keyDir, 'software-signing-private.pem');
const publicPath = path.join(keyDir, 'software-signing-public.pem');

fs.mkdirSync(keyDir, { recursive: true, mode: 0o700 });
if (fs.existsSync(privatePath) || fs.existsSync(publicPath)) {
  console.error('Key files already exist. Refusing to overwrite them. Back up or rotate keys through a controlled procedure.');
  process.exit(1);
}

const pair = crypto.generateKeyPairSync('rsa', {
  modulusLength: 4096,
  publicExponent: 0x10001,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' }
});

try {
  fs.writeFileSync(privatePath, pair.privateKey, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  fs.writeFileSync(publicPath, pair.publicKey, { encoding: 'utf8', mode: 0o644, flag: 'wx' });
  if (process.platform !== 'win32') fs.chmodSync(privatePath, 0o600);
} catch (error) {
  try { if (fs.existsSync(privatePath)) fs.unlinkSync(privatePath); } catch (_) {}
  try { if (fs.existsSync(publicPath)) fs.unlinkSync(publicPath); } catch (_) {}
  throw error;
}

console.log('AGT software-signing key pair generated.');
console.log('Private key (keep secret): ' + privatePath);
console.log('Public key (submit to AGT when registering the producer software): ' + publicPath);
console.log('The private key was not printed and must never be committed to Git.');
