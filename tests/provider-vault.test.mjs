import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../supabase/migrations/20261104130000_kanawa_provider_credential_vault.sql', import.meta.url), 'utf8');
const edge = await readFile(new URL('../supabase/functions/ks-save-provider-credential/index.ts', import.meta.url), 'utf8');
const cloud = await readFile(new URL('../app/cloud.js', import.meta.url), 'utf8');
const ui = await readFile(new URL('../app/integration-center.js', import.meta.url), 'utf8');

test('provider secret table is inaccessible to browser roles', () => {
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.ks_company_provider_credentials FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT ALL ON TABLE public\.ks_company_provider_credentials TO service_role/);
  assert.doesNotMatch(sql, /GRANT .* ON TABLE public\.ks_company_provider_credentials TO authenticated/);
});

test('provider vault returns only safe metadata to authorized company administrators', () => {
  assert.match(sql, /ks_list_company_provider_credentials/);
  assert.match(sql, /ARRAY\['owner','admin'\]/);
  assert.match(sql, /RETURNS TABLE\(provider_code text, metadata jsonb, updated_at timestamptz\)/);
  assert.doesNotMatch(sql, /RETURNS TABLE[\s\S]{0,300}secret_ciphertext/);
});

test('edge function verifies membership and encrypts secrets using AES-GCM', () => {
  assert.match(edge, /auth\.getUser\(token\)/);
  assert.match(edge, /ks_company_memberships/);
  assert.match(edge, /KANAWA_CREDENTIALS_ENCRYPTION_KEY/);
  assert.match(edge, /crypto\.subtle\.importKey/);
  assert.match(edge, /name:"AES-GCM"/);
  assert.match(edge, /secret_ciphertext:encrypted\.ciphertext/);
  assert.doesNotMatch(edge, /console\.(log|error)\(/);
});

test('browser integration UI never persists or reads stored secret values', () => {
  assert.match(cloud, /ks-save-provider-credential/);
  assert.match(cloud, /ks_list_company_provider_credentials/);
  assert.match(ui, /textarea id="ki-secret"/);
  assert.match(ui, /field\.value = ''/);
  assert.doesNotMatch(ui, /localStorage\.setItem|indexedDB\.open/);
  assert.doesNotMatch(ui, /secret_ciphertext|secret_nonce/);
});
