import * as FileSystem from 'expo-file-system';

const OFFLINE_TILES_DIR = `${FileSystem.documentDirectory}offline-tiles`;

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

const ensureDirAsync = async (dirUri) => {
  try {
    await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true });
  } catch (e) {
    // ignore EEXIST / already created
  }
};

export const getOfflineTileTemplateUri = () => `${OFFLINE_TILES_DIR}/{z}/{x}/{y}.png`;

export const clearOfflineTilesAsync = async () => {
  try {
    const info = await FileSystem.getInfoAsync(OFFLINE_TILES_DIR);
    if (info.exists) {
      await FileSystem.deleteAsync(OFFLINE_TILES_DIR, { idempotent: true });
    }
    return true;
  } catch {
    return false;
  }
};

const tileUri = (z, x, y) => `${OFFLINE_TILES_DIR}/${z}/${x}/${y}.png`;

const buildUrlFromTemplate = (template, z, x, y) =>
  template
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y));

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

  const dirPromises = new Map();
  const ensureDirCachedAsync = async (dirUri) => {
    if (!dirUri) return;
    const existing = dirPromises.get(dirUri);
    if (existing) return existing;
    const promise = ensureDirAsync(dirUri);
    dirPromises.set(dirUri, promise);
    return promise;
  };

  const bbox = computeBBoxAround(centerLat, centerLng, radiusKm);

  const total = estimateTileCountForRegion({ centerLat, centerLng, radiusKm, zoomMin, zoomMax });
  const totalCapped = Math.min(total, maxTiles);

  let completed = 0;
  let attempted = 0;
  let failed = 0;
  let firstErrorMessage = null;

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

        const outUri = tileUri(z, x, y);
        const outDir = outUri.substring(0, outUri.lastIndexOf('/'));
        await ensureDirCachedAsync(outDir);

        try {
          const existing = await FileSystem.getInfoAsync(outUri);
          if (existing.exists && existing.size > 0) {
            completed += 1;
          } else {
            const url = buildUrlFromTemplate(template, z, x, y);
            await FileSystem.downloadAsync(url, outUri);
            completed += 1;
          }
        } catch (e) {
          // ignore per-tile failures; continue
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
