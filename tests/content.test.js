import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createContentServer } from '../server/content.js';

test('serves QuakeJS manifest entries and checksum-addressed assets', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'neoquakejs-content-'));
  const isoAssetPath = path.join(root, 'QUAKE3', 'BASEQ3', 'PAK0.PK3');
  const assetPath = path.join(root, 'baseq3', 'pak0.pk3');
  const isoBytes = Buffer.from('old-iso-data');
  const assetBytes = Buffer.from('123456789');
  await mkdir(path.dirname(isoAssetPath), { recursive: true });
  await mkdir(path.dirname(assetPath), { recursive: true });
  await writeFile(isoAssetPath, isoBytes);
  await writeFile(assetPath, assetBytes);

  const server = await createContentServer({ root });
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
