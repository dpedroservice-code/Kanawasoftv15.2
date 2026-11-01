import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { canonicalJson, createSoftwareSignature, verifyJwsPayload } = require('../server/agt/jws.js');

test('AGT JWS uses RS256 and verifies the complete software payload', () => {
  const pair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  const payload = { productId: 'Kanawa Soft', productVersion: '15.2.0', softwareValidationNumber: 'VALIDATION-NUMBER-ONLY-AFTER-AGT-APPROVAL' };
  const signed = createSoftwareSignature(payload, pair.privateKey);
  assert.equal(signed.split('.').length, 3);
  assert.deepEqual(verifyJwsPayload(signed, pair.publicKey), payload);
});

test('AGT software signature refuses a missing validation number', () => {
  const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  assert.throws(
    () => createSoftwareSignature({ productId: 'Kanawa Soft', productVersion: '15.2.0', softwareValidationNumber: '' }, pair.privateKey),
    /softwareValidationNumber/
  );
});

test('canonical JSON sorts object keys recursively', () => {
  assert.equal(canonicalJson({ z: 1, a: { y: 2, b: 3 } }), '{"a":{"b":3,"y":2},"z":1}');
});
