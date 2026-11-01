'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');

function canonicalJson(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('JWS payload cannot contain non-finite numbers.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (typeof value === 'object') {
    const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
    return '{' + keys.map((key) => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}';
  }
  throw new TypeError('Unsupported value in JWS payload: ' + typeof value);
}

function signJwsPayload(payload, privateKeyInput) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TypeError('JWS payload must be a JSON object.');
  }
  if (!privateKeyInput) throw new Error('Software private key is not configured.');
  const privateKey = crypto.createPrivateKey(privateKeyInput);
  if (privateKey.asymmetricKeyType !== 'rsa' || (privateKey.asymmetricKeyDetails?.modulusLength || 0) < 2048) {
    throw new Error('AGT software signing key must be RSA with at least 2048 bits.');
  }
  const header = Buffer.from(canonicalJson({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(canonicalJson(payload)).toString('base64url');
  const signingInput = header + '.' + body;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput), privateKey).toString('base64url');
  return signingInput + '.' + signature;
}

function createSoftwareSignature({ productId, productVersion, softwareValidationNumber }, privateKeyInput) {
  const required = { productId, productVersion, softwareValidationNumber };
  for (const [field, value] of Object.entries(required)) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error('AGT software registration field is required: ' + field);
    }
  }
  return signJwsPayload(required, privateKeyInput);
}

function verifyJwsPayload(compactJws, publicKeyInput) {
  const parts = String(compactJws || '').split('.');
  if (parts.length !== 3) throw new Error('Invalid compact JWS format.');
  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  if (header.alg !== 'RS256' || header.typ !== 'JWT') throw new Error('Unsupported JWS header.');
  const publicKey = crypto.createPublicKey(publicKeyInput);
  if (publicKey.asymmetricKeyType !== 'rsa' || (publicKey.asymmetricKeyDetails?.modulusLength || 0) < 2048) {
    throw new Error('AGT verification key must be RSA with at least 2048 bits.');
  }
  const valid = crypto.verify(
    'RSA-SHA256',
    Buffer.from(parts[0] + '.' + parts[1]),
    publicKey,
    Buffer.from(parts[2], 'base64url')
  );
  if (!valid) throw new Error('JWS signature verification failed.');
  return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
}

function loadSoftwarePrivateKey(env = process.env) {
  const keyPath = env.KANAWA_AGT_SOFTWARE_PRIVATE_KEY_PATH;
  if (!keyPath) throw new Error('Set KANAWA_AGT_SOFTWARE_PRIVATE_KEY_PATH to a protected PEM file outside the repository.');
  return fs.readFileSync(keyPath, 'utf8');
}

module.exports = { canonicalJson, signJwsPayload, createSoftwareSignature, verifyJwsPayload, loadSoftwarePrivateKey };
