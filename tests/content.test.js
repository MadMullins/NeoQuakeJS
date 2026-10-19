import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildManifest, createContentServer } from '../server/content.js';

test('serves QuakeJS manifest entries and checksum-addressed assets', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'neoquakejs-content-'));
  const isoAssetPath = path.join(root, 'QUAKE3', 'BASEQ3', 'PAK0.PK3');
  const assetPath = path.join(root, 'baseq3', 'pak0.pk3');
  const cachePath = path.join(root, 'cache', 'manifest.json');
  const isoBytes = Buffer.from('old-iso-data');
  const assetBytes = Buffer.from('123456789');
  await mkdir(path.dirname(isoAssetPath), { recursive: true });
  await mkdir(path.dirname(assetPath), { recursive: true });
  await writeFile(isoAssetPath, isoBytes);
  await writeFile(assetPath, assetBytes);

  const server = await createContentServer({ root, cachePath });
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const manifestResponse = await fetch(`${baseUrl}/assets/manifest.json`);
    assert.equal(manifestResponse.status, 200);
    assert.equal(manifestResponse.headers.get('access-control-allow-origin'), '*');
    const [entry] = await manifestResponse.json();
    assert.equal(entry.name, 'baseq3/pak0.pk3');
    assert.equal(entry.checksum, 3421780262);
    assert.ok(entry.compressed > 0);

    const assetResponse = await fetch(`${baseUrl}/assets/baseq3/${entry.checksum}-pak0.pk3`);
    assert.equal(assetResponse.status, 200);
    assert.deepEqual(Buffer.from(await assetResponse.arrayBuffer()), assetBytes);

    const invalidResponse = await fetch(`${baseUrl}/assets/baseq3/1-pak0.pk3`);
    assert.equal(invalidResponse.status, 400);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    await rm(root, { recursive: true, force: true });
  }
});

test('reuses cached metadata and refreshes it when an asset changes', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'neoquakejs-cache-'));
  const assetPath = path.join(root, 'baseq3', 'pak0.pk3');
  const cachePath = path.join(root, 'cache', 'manifest.json');
  await mkdir(path.dirname(assetPath), { recursive: true });
  await writeFile(assetPath, 'initial package');

  try {
    const initial = await buildManifest(root, cachePath);
    const cacheBefore = await readFile(cachePath, 'utf8');
    const cached = await buildManifest(root, cachePath);
    const cacheAfter = await readFile(cachePath, 'utf8');

    assert.deepEqual(cached, initial);
    assert.equal(cacheAfter, cacheBefore);

    await writeFile(assetPath, 'updated package bytes');
    const updated = await buildManifest(root, cachePath);
    assert.notEqual(updated[0].checksum, initial[0].checksum);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
