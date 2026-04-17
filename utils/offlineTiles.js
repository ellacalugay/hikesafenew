import { File, Directory, Paths } from 'expo-file-system';

const OFFLINE_TILES_DIR = new Directory(Paths.document, 'offline-tiles');

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

const degToRad = (d) => (d * Math.PI) / 180;

// Slippy map helpers (Web Mercator)
const lonToTileX = (lon, zoom) => {
  const n = 2 ** zoom;
  return Math.floor(((lon + 180) / 360) * n);
};

const latToTileY = (lat, zoom) => {
  const n = 2 ** zoom;
  const latRad = degToRad(clamp(lat, -85.05112878, 85.05112878));
  const y = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2;
  return Math.floor(y * n);
};

const ensureDirAsync = async (dir) => {
  try {
    dir.create({ intermediates: true, idempotent: true });
  } catch {
    // ignore (already exists / best-effort)
  }
};

// IMPORTANT: MapLibre expects literal "{z}/{x}/{y}" placeholders in the tile template.
// Using `new File(..., '{z}', ...)` can URL-encode braces to %7Bz%7D, which breaks tile loading (black map).
export const getOfflineTileTemplateUri = () => {
  const base = String(OFFLINE_TILES_DIR?.uri || '').replace(/\/+$/, '');
  return `${base}/{z}/{x}/{y}.png`;
};

export const clearOfflineTilesAsync = async () => {
  try {
    if (OFFLINE_TILES_DIR.exists) {
      OFFLINE_TILES_DIR.delete();
    }
    return true;
  } catch {
    return false;
  }
};

const tileFile = (z, x, y) => new File(OFFLINE_TILES_DIR, String(z), String(x), `${y}.png`);
const tileDir = (z, x) => new Directory(OFFLINE_TILES_DIR, String(z), String(x));

const buildUrlFromTemplate = (template, z, x, y) =>
  template
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y));

const looksLikePng = (bytes) => {
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  return (
    bytes &&
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  );
};

const looksLikeJpeg = (bytes) => {
  // JPEG SOI: FF D8 FF
  return bytes && bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
};

const validateRasterTileFileAsync = async (file) => {
  try {
    if (!file || !file.exists) return false;
    if (typeof file.size === 'number' && file.size > 0 && file.size < 64) return false;

    // Read the full file (tiles are small); we only do this for a tiny sample.
    const bytes = await file.bytes();
    if (!bytes || bytes.length < 8) return false;
    if (looksLikePng(bytes) || looksLikeJpeg(bytes)) return true;

    // Common failure mode: HTML error page saved as .png.
    // (e.g. starts with '<' or '{' JSON).
    return false;
  } catch {
    return false;
  }
};

const computeBBoxAround = (centerLat, centerLng, radiusKm) => {
  // Approx; good enough for small-ish radii
  const lat = centerLat;
  const lng = centerLng;
  const dLat = (radiusKm / 110.574); // km per degree lat
  const dLng = radiusKm / (111.320 * Math.cos(degToRad(lat)) || 1);

  return {
    minLat: lat - dLat,
    maxLat: lat + dLat,
    minLng: lng - dLng,
    maxLng: lng + dLng,
  };
};

export const estimateTileCountForRegion = ({ centerLat, centerLng, radiusKm, zoomMin, zoomMax }) => {
  const bbox = computeBBoxAround(centerLat, centerLng, radiusKm);
  let total = 0;

  for (let z = zoomMin; z <= zoomMax; z += 1) {
    const xMin = lonToTileX(bbox.minLng, z);
    const xMax = lonToTileX(bbox.maxLng, z);
    const yMin = latToTileY(bbox.maxLat, z); // north
    const yMax = latToTileY(bbox.minLat, z); // south

    total += (Math.abs(xMax - xMin) + 1) * (Math.abs(yMax - yMin) + 1);
  }

  return total;
};

export const downloadOfflineRegionTilesAsync = async ({
  centerLat,
  centerLng,
  radiusKm,
  zoomMin,
  zoomMax,
  tileUrlTemplate,
  maxTiles = 5000,
  concurrentDownloads = 8,
  onProgress,
  shouldCancel,
}) => {
  if (!tileUrlTemplate) {
    throw new Error('Missing tileUrlTemplate');
  }

  const template = String(tileUrlTemplate);
  if (!template.includes('{z}') || !template.includes('{x}') || !template.includes('{y}')) {
    throw new Error('Tile URL template must include {z}, {x}, and {y}.');
  }

  await ensureDirAsync(OFFLINE_TILES_DIR);

  const createdDirs = new Set();
  const ensureDirCachedAsync = async (dir) => {
    if (!dir) return;
    const key = dir.uri;
    if (createdDirs.has(key)) return;
    createdDirs.add(key);
    await ensureDirAsync(dir);
  };

  const bbox = computeBBoxAround(centerLat, centerLng, radiusKm);

  const total = estimateTileCountForRegion({ centerLat, centerLng, radiusKm, zoomMin, zoomMax });
  const totalCapped = Math.min(total, maxTiles);

  let completed = 0;
  let attempted = 0;
  let failed = 0;
  let firstErrorMessage = null;
  let validatedSamples = 0;
  const MAX_VALIDATED_SAMPLES = 6;

  // Build a capped download queue up-front so we can process in concurrent batches.
  const downloadQueue = [];
  queueBuild: for (let z = zoomMin; z <= zoomMax; z += 1) {
    const xMin = lonToTileX(bbox.minLng, z);
    const xMax = lonToTileX(bbox.maxLng, z);
    const yMin = latToTileY(bbox.maxLat, z);
    const yMax = latToTileY(bbox.minLat, z);

    for (let x = Math.min(xMin, xMax); x <= Math.max(xMin, xMax); x += 1) {
      for (let y = Math.min(yMin, yMax); y <= Math.max(yMin, yMax); y += 1) {
        downloadQueue.push({ z, x, y });
        if (downloadQueue.length >= totalCapped) break queueBuild;
      }
    }
  }

  if (totalCapped > 0 && downloadQueue.length === 0) {
    throw new Error('Could not build tile download queue. Check that your GPS coordinates are valid and try again.');
  }

  const sampleUrl = downloadQueue.length > 0
    ? buildUrlFromTemplate(template, downloadQueue[0].z, downloadQueue[0].x, downloadQueue[0].y)
    : null;

  const CONCURRENT_DOWNLOADS = Math.max(1, Math.min(32, Math.floor(Number(concurrentDownloads) || 8)));

  for (let i = 0; i < downloadQueue.length; i += CONCURRENT_DOWNLOADS) {
    if (typeof shouldCancel === 'function' && shouldCancel()) {
      return { completed, attempted, total: totalCapped, cancelled: true };
    }

    const batch = downloadQueue.slice(i, i + CONCURRENT_DOWNLOADS);

    await Promise.all(
      batch.map(async ({ z, x, y }) => {
        if (typeof shouldCancel === 'function' && shouldCancel()) return;

        attempted += 1;

        const outFile = tileFile(z, x, y);
        await ensureDirCachedAsync(tileDir(z, x));

        try {
          if (outFile.exists && outFile.size > 0) {
            completed += 1;
          } else {
            const url = buildUrlFromTemplate(template, z, x, y);
            await File.downloadFileAsync(url, outFile, { idempotent: true });

            // Validate a small sample of freshly downloaded tiles to catch blocked tile servers.
            if (validatedSamples < MAX_VALIDATED_SAMPLES) {
              const ok = await validateRasterTileFileAsync(outFile);
              validatedSamples += 1;
              if (!ok) {
                try { outFile.delete(); } catch {}
                throw new Error('Invalid tile content (not a PNG/JPEG). Tile server may be blocked or returning HTML.');
              }
            }
            completed += 1;
          }
        } catch (e) {
          failed += 1;
          if (!firstErrorMessage) {
            firstErrorMessage = e?.message ? String(e.message) : String(e);
          }
        }
      })
    );

    if (typeof onProgress === 'function') {
      onProgress({ completed, attempted, failed, total: totalCapped });
    }

    if (typeof shouldCancel === 'function' && shouldCancel()) {
      return { completed, attempted, total: totalCapped, cancelled: true };
    }
  }

  if (totalCapped > 0 && attempted === 0) {
    throw new Error('No tiles were attempted. Restart the app / Expo bundler and try again.');
  }

  if (attempted > 0 && completed === 0) {
    throw new Error(
      `No tiles downloaded. Check EXPO_PUBLIC_TILE_URL_TEMPLATE (reachable, usually https, returns PNG/JPG).${sampleUrl ? ` Sample URL: ${sampleUrl}` : ''}${firstErrorMessage ? ` First error: ${firstErrorMessage}` : ''}`
    );
  }

  return { completed, attempted, failed, total: totalCapped, cancelled: false };
};
