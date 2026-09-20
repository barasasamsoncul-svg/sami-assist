import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

async function source(file) {
  return readFile(path.join(root, file), 'utf8');
}

function compact(value) {
  return value.replace(/\s+/g, ' ');
}

test('Category 14: object storage is private, provider-backed and supports signed direct transfer', async () => {
  const storage = compact(
    await source('lib/storage/object-storage.ts'),
  );

  assert.match(storage, /import 'server-only'/);
  assert.match(storage, /S3Client/);
  assert.match(storage, /SAMI_STORAGE_PROVIDER/);
  assert.match(storage, /SAMI_STORAGE_BUCKET/);
  assert.match(storage, /R2_ENDPOINT/);
  assert.match(storage, /getSignedUrl/);
  assert.match(storage, /PutObjectCommand/);
  assert.match(storage, /GetObjectCommand/);
  assert.match(storage, /HeadObjectCommand/);
  assert.match(storage, /DeleteObjectCommand/);
  assert.match(storage, /private, no-store/);

  assert.doesNotMatch(
    storage,
    /ACL\s*:\s*['"]public-read['"]/i,
    'Core object storage must never make workspace files public.',
  );
});

test('Category 14: workspace files use trusted workspace and current-company context', async () => {
  const service = compact(
    await source('lib/services/workspace-files.ts'),
  );

  assert.match(service, /getPermissionContext/);
  assert.match(service, /getSession/);
  assert.match(service, /session\.currentTenantId !== permissions\.tenantId/);
  assert.match(service, /session\.currentCompanyId/);
  assert.match(service, /requireCompanyAccess/);
  assert.match(service, /SAMI_PERMISSIONS\.FILES_VIEW/);
  assert.match(service, /SAMI_PERMISSIONS\.FILES_MANAGE/);
  assert.match(service, /context\.tenantId/);
  assert.match(service, /context\.companyId/);
});

test('Category 14: browser upload is a metadata intent and file bytes go directly to private object storage', async () => {
  const [route, service] = await Promise.all([
    source('app/api/workspace/files/upload-intent/route.ts'),
    source('lib/services/workspace-files.ts'),
  ]);

  assert.match(route, /application\/json/);
  assert.match(route, /MAX_INTENT_BODY_BYTES/);
  assert.match(route, /request\.text\(\)/);
  assert.match(route, /rejectCrossOriginWorkspaceFileRequest/);

  assert.doesNotMatch(route, /request\.formData\(\)/);
  assert.doesNotMatch(route, /request\.arrayBuffer\(\)/);
  assert.doesNotMatch(route, /tenantId|companyId/);

  const compactService = compact(service);
  assert.match(compactService, /createPrivateUploadUrl/);
  assert.match(compactService, /'pending_upload'/);
  assert.match(compactService, /WORKSPACE_FILE_UPLOAD_TTL_SECONDS/);
  assert.match(compactService, /MAX_WORKSPACE_FILE_BYTES/);
  assert.match(compactService, /BLOCKED_EXTENSIONS/);
});

test('Category 14: upload completion verifies object metadata before activation', async () => {
  const service = compact(
    await source('lib/services/workspace-files.ts'),
  );

  assert.match(service, /headPrivateObject/);
  assert.match(service, /head\.sizeBytes !== expectedSize/);
  assert.match(service, /actualType !== expectedType/);
  assert.match(service, /status = 'active'/);
  assert.match(service, /storage_etag = \$3/);
  assert.match(service, /activated_at = NOW\(\)/);
  assert.match(service, /UPLOAD_VALIDATION_FAILED/);
});

test('Category 14: deletes are soft first and object cleanup is recoverable', async () => {
  const service = compact(
    await source('lib/services/workspace-files.ts'),
  );

  assert.match(service, /status = 'deleted'/);
  assert.match(service, /deleted_at = COALESCE\(deleted_at, NOW\(\)\)/);
  assert.match(service, /cleanup_required = TRUE/);
  assert.match(service, /deletePrivateObject/);
  assert.match(service, /cleanup_required = FALSE/);
  assert.match(service, /UPDATE file_links/);

  assert.doesNotMatch(
    service,
    /DELETE FROM files/i,
    'File deletion must retain lifecycle metadata for audit/recovery.',
  );
});

test('Category 14: core owns files and generic links, not the Documents business app', async () => {
  const [core, documents] = await Promise.all([
    source('lib/schema/tenant-core.sql'),
    source('lib/apps/documents/schema.sql'),
  ]);

  assert.match(core, /CREATE TABLE IF NOT EXISTS \{schema\}\.files/);
  assert.match(core, /CREATE TABLE IF NOT EXISTS \{schema\}\.file_links/);
  assert.match(core, /storage_key TEXT NOT NULL/);
  assert.match(core, /storage_provider VARCHAR\(50\) NOT NULL DEFAULT 'r2'/);
  assert.match(core, /cleanup_required BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(core, /scan_status VARCHAR\(30\) NOT NULL DEFAULT 'not_scanned'/);
  assert.doesNotMatch(core, /\bBYTEA\b/i);
  assert.doesNotMatch(
    core,
    /CREATE TABLE IF NOT EXISTS \{schema\}\.documents/,
    'Documents is an app and must not be installed by tenant core.',
  );

  assert.match(documents, /CREATE TABLE IF NOT EXISTS documents/);
  assert.match(documents, /file_id UUID/);
  assert.match(documents, /REFERENCES files\(id\)/);
  assert.match(documents, /CREATE TABLE IF NOT EXISTS document_folders/);
});

test('Category 14: generic file links are internal trusted-caller infrastructure', async () => {
  const service = compact(
    await source('lib/services/workspace-file-links.ts'),
  );

  assert.match(service, /no browser-facing route/i);
  assert.match(service, /requireCompanyAccess/);
  assert.match(service, /INSERT INTO file_links/);
  assert.match(service, /INNER JOIN files/);
  assert.match(service, /f\.status = 'active'/);
});

test('Category 14: avatars reuse the shared object-storage provider', async () => {
  const avatar = await source('lib/account/avatar.ts');

  assert.match(avatar, /@\/lib\/storage\/object-storage/);
  assert.match(avatar, /putPrivateObject/);
  assert.match(avatar, /getPrivateObjectBytes/);
  assert.match(avatar, /deletePrivateObject/);
  assert.match(avatar, /getObjectStorageProviderKey/);

  assert.doesNotMatch(avatar, /@aws-sdk\/client-s3/);
  assert.doesNotMatch(avatar, /R2_ACCESS_KEY_ID|R2_SECRET_ACCESS_KEY|R2_ENDPOINT/);
});

test('Category 14: tenant-core has a safe 1.1.0 to 1.2.0 storage migration', async () => {
  const [manifest, migration, core] = await Promise.all([
    source('lib/schema/tenant-migrations/manifest.ts'),
    source('lib/schema/tenant-migrations/migrations/002-core-1.1.0-to-1.2.0.sql'),
    source('lib/schema/tenant-core.sql'),
  ]);

  assert.match(manifest, /core-1\.1\.0-to-1\.2\.0/);
  assert.match(manifest, /fromVersion:\s*['"]1\.1\.0['"]/);
  assert.match(manifest, /toVersion:\s*['"]1\.2\.0['"]/);
  assert.match(migration, /ALTER TABLE files/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS purpose/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS file_links/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP DATABASE|TRUNCATE/i);
  assert.match(core, /storage_provider VARCHAR\(50\) NOT NULL DEFAULT 'r2'/);
});

test('Category 14: signed URL dependency and full-suite gate are wired', async () => {
  const pkg = JSON.parse(
    await source('package.json'),
  );

  assert.equal(
    pkg.dependencies['@aws-sdk/s3-request-presigner'],
    '^3.1133.0',
  );

  assert.equal(
    pkg.scripts['test:category14'],
    'node --test tests/category-14-files-storage.test.mjs',
  );

  assert.match(
    pkg.scripts['test:all'],
    /test:category14/,
  );
});
