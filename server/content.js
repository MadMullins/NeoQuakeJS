import { createReadStream } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import crc32 from 'buffer-crc32';

const assetRoot = path.resolve(process.env.ASSET_ROOT || 'assets');
const port = Number(process.env.PORT || 9000);
const servedExtensions = new Set(['.pk3', '.run', '.sh']);

async function findAssets(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await findAssets(absolutePath));
    } else if (entry.isFile() && servedExtensions.has(path.extname(entry.name).toLowerCase())) {
      files.push(absolutePath);
    }
  }

  return files;
}

function getManifestName(filePath, root) {
  let parts = path.relative(root, filePath).split(path.sep);
  const baseq3Index = parts.map((part) => part.toLowerCase()).lastIndexOf('baseq3');
  if (baseq3Index !== -1) {
    parts = parts.slice(baseq3Index);
  }
  return parts.join('/').toLowerCase();
}

async function getAssetMetadata(filePath, root) {
  let checksum = crc32.unsigned(Buffer.alloc(0));
  let compressed = 0;
  let size = 0;

  const checksumStream = new Transform({
    transform(chunk, encoding, callback) {
      checksum = crc32.unsigned(chunk, checksum);
      size += chunk.length;
      callback(null, chunk);
    },
  });
  const compressedSizeStream = new Writable({
    write(chunk, encoding, callback) {
      compressed += chunk.length;
      callback();
    },
  });

  await pipeline(createReadStream(filePath), checksumStream, createGzip(), compressedSizeStream);

  return {
    name: getManifestName(filePath, root),
    compressed,
    checksum,
    size,
  };
}

async function getAssetRecords(root) {
  const files = (await findAssets(root)).sort();
  const filesByName = new Map();

  for (const filePath of files) {
    const name = getManifestName(filePath, root);
    const relativePath = path.relative(root, filePath).split(path.sep).join('/').toLowerCase();
    const existing = filesByName.get(name);
    const isCanonicalPath = relativePath === name;

    if (!existing || isCanonicalPath) {
      filesByName.set(name, filePath);
    }
  }

  const records = [];
  for (const filePath of filesByName.values()) {
    records.push({
      ...await getAssetMetadata(filePath, root),
      filePath,
    });
  }

  return records.sort((left, right) => left.name.localeCompare(right.name));
}

export async function buildManifest(root = assetRoot) {
  const records = await getAssetRecords(root);
  return records.map(({ filePath, ...entry }) => entry);
}

function sendText(response, status, message) {
  response.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(message),
  });
  response.end(message);
}

export async function createContentServer({ root = assetRoot } = {}) {
  const resolvedRoot = path.resolve(root);
  const records = await getAssetRecords(resolvedRoot);
  const manifest = records.map(({ filePath, ...entry }) => entry);
  const manifestByAsset = new Map(records.map((record) => [
    `${record.name}:${record.checksum}`,
    record,
  ]));
  const lastModified = new Date().toUTCString();

  return createServer(async (request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');

    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD, OPTIONS');
      sendText(response, 405, 'Method not allowed');
      return;
    }

    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    } catch {
      sendText(response, 400, 'Invalid request path');
      return;
    }

    if (pathname === '/assets/manifest.json') {
      const body = JSON.stringify(manifest);
      response.writeHead(200, {
        'Cache-Control': 'public, max-age=60, must-revalidate',
        'Last-Modified': lastModified,
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
      });
      response.end(request.method === 'HEAD' ? undefined : body);
      return;
    }

    const match = pathname.match(/^\/assets\/(.*?)(?:\/)?(\d+)-([^/]+)$/);
    if (!match) {
      sendText(response, 404, 'Asset not found');
      return;
    }

    const relativePath = path.posix.join(match[1], match[3]).toLowerCase();
    const checksum = Number(match[2]);
    const asset = manifestByAsset.get(`${relativePath}:${checksum}`);
    if (!asset) {
      sendText(response, 400, 'Asset checksum is not present in the manifest');
      return;
    }

    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    response.setHeader('Content-Type', 'application/octet-stream');
    response.setHeader('Vary', 'Accept-Encoding');

    if (request.method === 'HEAD') {
      response.writeHead(200, { 'Content-Length': asset.size });
      response.end();
      return;
    }

    const acceptsGzip = /(?:^|,)\s*gzip(?:\s*;[^,]*)?(?:,|$)/i.test(request.headers['accept-encoding'] || '');
    if (acceptsGzip) {
      response.setHeader('Content-Encoding', 'gzip');
      response.setHeader('Content-Length', asset.compressed);
      response.writeHead(200);
      try {
        await pipeline(createReadStream(asset.filePath), createGzip(), response);
      } catch (error) {
        response.destroy(error);
      }
      return;
    }

    response.setHeader('Content-Length', asset.size);
    response.writeHead(200);
    try {
      await pipeline(createReadStream(asset.filePath), response);
    } catch (error) {
      response.destroy(error);
    }
  });
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  createContentServer()
    .then((server) => {
      server.listen(port, '0.0.0.0', () => {
        console.log(`NeoQuakeJS content server listening on port ${port} (${assetRoot})`);
      });
    })
    .catch((error) => {
      console.error('Failed to initialize the content server:', error);
      process.exitCode = 1;
    });
}
