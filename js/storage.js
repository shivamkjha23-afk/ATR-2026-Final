const STORAGE_KEYS = {
  sessionUser: 'atr2026_session_user',
  cloudConfig: 'atr2026_cloud_config',
  syncStatus: 'atr2026_sync_status',
  localCache: 'atr2026_runtime_cache'
};

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDam8Q5xWNT5J7AfagEVWcC7TzT2LN8OHU',
  authDomain: 'atr2026-6541f.firebaseapp.com',
  projectId: 'atr2026-6541f',
  storageBucket: 'atr2026-6541f.firebasestorage.app',
  messagingSenderId: '121442875078',
  appId: '1:121442875078:web:741b5ffc315843352149c7',
  measurementId: 'G-8JY365XQXP'
};

const DB_TEMPLATE = {
  inspections: [],
  observations: [],
  requisitions: [],
  next_day_planning: [],
  permit_applications: [],
  users: [],
  images: {},
  _meta: { last_updated: '' }
};

const PRIMARY_RUNTIME_DOC_PATH = { collection: 'runtime', id: 'runtime' };
const LEGACY_RUNTIME_DOC_PATH = { collection: 'atr2026', id: 'runtime' };
const RUNTIME_CHUNKS_COLLECTION = 'runtime_chunks';
const RUNTIME_COLLECTION_KEYS = ['inspections', 'observations', 'requisitions', 'next_day_planning', 'permit_applications', 'users', 'images'];
const MAX_CHUNK_CHARS = 350000;
const MAX_BATCH_OPS = 450;
const MAX_BATCH_BYTES = 8 * 1024 * 1024;

let firebaseReady = false;
let firebaseApp = null;
let firebaseAuth = null;
let firebaseDb = null;

let runtimeDB = structuredClone(DB_TEMPLATE);
let syncInFlight = false;
let syncPending = false;
let suppressSync = false;
let realtimeStarted = false;
let authReadyPromise = null;
let cloudWriteChain = Promise.resolve();

function nowStamp() {
  return new Date().toISOString();
}

function generateId(prefix = 'REC') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeName(value) {
  return String(value || 'entry').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 140) || 'entry';
}

function normalizeUsername(username) {
  return String(username || '').trim().toLowerCase();
}

function bootFirebase() {
  if (firebaseReady) return;
  if (!window.firebase) throw new Error('Firebase SDK not loaded.');
  firebaseApp = firebase.apps.length ? firebase.app() : firebase.initializeApp(FIREBASE_CONFIG);
  firebaseAuth = firebase.auth();
  firebaseDb = firebase.firestore();
  firebaseReady = true;
}

function runtimeDocRef(path = PRIMARY_RUNTIME_DOC_PATH) {
  bootFirebase();
  return firebaseDb.collection(path.collection).doc(path.id);
}

function runtimeChunksRef(path = PRIMARY_RUNTIME_DOC_PATH) {
  return runtimeDocRef(path).collection(RUNTIME_CHUNKS_COLLECTION);
}

function chunkRowsBySize(rows = []) {
  const chunks = [];
  let current = [];
  let currentSize = 2;

  rows.forEach((row) => {
    const serialized = JSON.stringify(row);
    const rowSize = serialized.length + 1;
    if (current.length && (currentSize + rowSize > MAX_CHUNK_CHARS)) {
      chunks.push(current);
      current = [];
      currentSize = 2;
    }
    current.push(row);
    currentSize += rowSize;
  });

  if (current.length) chunks.push(current);
  return chunks;
}

function createChunkDocsForCollection(key, value) {
  if (Array.isArray(value)) {
    return chunkRowsBySize(value).map((rows, index) => ({
      id: `${key}_${index}`,
      payload: { kind: 'array', key, order: index, rows }
    }));
  }

  const entries = Object.entries(value || {});
  return chunkRowsBySize(entries).map((chunkEntries, index) => ({
    id: `${key}_${index}`,
    payload: { kind: 'object_entries', key, order: index, entries: chunkEntries }
  }));
}

function buildCloudMetaPayload(db) {
  const counts = {
    inspections: (db.inspections || []).length,
    observations: (db.observations || []).length,
    requisitions: (db.requisitions || []).length,
    next_day_planning: (db.next_day_planning || []).length,
    permit_applications: (db.permit_applications || []).length,
    users: (db.users || []).length,
    images: Object.keys(db.images || {}).length
  };

  return {
    _meta: db._meta || { last_updated: nowStamp() },
    storage_format: 'chunked-v2',
    counts,
    updated_at: nowStamp()
  };
}

function estimateWriteBytes(docId, payload) {
  return String(docId || '').length + JSON.stringify(payload || {}).length + 256;
}

async function commitSetDocsInBatches(collectionRef, docs = []) {
  if (!docs.length) return;

  let batch = firebaseDb.batch();
  let ops = 0;
  let bytes = 0;

  for (const doc of docs) {
    const payloadBytes = estimateWriteBytes(doc.id, doc.payload);
    if (ops > 0 && (ops >= MAX_BATCH_OPS || (bytes + payloadBytes) >= MAX_BATCH_BYTES)) {
      await batch.commit();
      batch = firebaseDb.batch();
      ops = 0;
      bytes = 0;
    }

    batch.set(collectionRef.doc(doc.id), doc.payload, { merge: false });
    ops += 1;
    bytes += payloadBytes;
  }

  if (ops) await batch.commit();
}

async function commitDeleteDocsInBatches(docs = []) {
  if (!docs.length) return;

  let batch = firebaseDb.batch();
  let ops = 0;

  for (const docSnap of docs) {
    if (ops >= MAX_BATCH_OPS) {
      await batch.commit();
      batch = firebaseDb.batch();
      ops = 0;
    }

    batch.delete(docSnap.ref);
    ops += 1;
  }

  if (ops) await batch.commit();
}

async function replaceCloudChunks(db) {
  const chunks = runtimeChunksRef();
  const existing = await chunks.get();

  const existingDocs = existing.empty ? [] : existing.docs;

  const nextDocs = [];

  for (const key of RUNTIME_COLLECTION_KEYS) {
    const docs = createChunkDocsForCollection(key, db[key]);
    if (!docs.length) {
      const emptyPayload = key === 'images'
        ? { kind: 'object_entries', key, order: 0, entries: [] }
        : { kind: 'array', key, order: 0, rows: [] };
      docs.push({ id: `${key}_0`, payload: emptyPayload });
    }
    nextDocs.push(...docs);
  }

  await commitSetDocsInBatches(chunks, nextDocs);

  if (existingDocs.length) {
    const nextDocIds = new Set(nextDocs.map((doc) => doc.id));
    const staleDocs = existingDocs.filter((docSnap) => !nextDocIds.has(docSnap.id));
    await commitDeleteDocsInBatches(staleDocs);
  }
}


function restoreRuntimeFromChunkDocs(chunkDocs = []) {
  const next = clone(DB_TEMPLATE);
  const byKey = new Map(RUNTIME_COLLECTION_KEYS.map((key) => [key, []]));

  chunkDocs.forEach((doc) => {
    const data = doc.data();
    if (!data || !byKey.has(data.key)) return;
    byKey.get(data.key).push(data);
  });

  RUNTIME_COLLECTION_KEYS.forEach((key) => {
    const parts = byKey.get(key).sort((a, b) => (a.order || 0) - (b.order || 0));
    if (key === 'images') {
      const entries = parts.flatMap((p) => p.entries || []);
      next.images = Object.fromEntries(entries);
      return;
    }
    next[key] = parts.flatMap((p) => p.rows || []);
  });

  return next;
}

async function readCloudRuntimeDataFromPath(path) {
  const metaSnap = await runtimeDocRef(path).get();
  if (!metaSnap.exists || !metaSnap.data()) return null;

  const meta = metaSnap.data();
  if (meta.storage_format === 'chunked-v2') {
    const chunksSnap = await runtimeChunksRef(path).get();
    if (chunksSnap.empty && Object.values(meta.counts || {}).some((count) => Number(count) > 0)) {
      throw new Error('Cloud runtime chunks are temporarily unavailable. Please retry sync.');
    }
    const restored = restoreRuntimeFromChunkDocs(chunksSnap.docs || []);
    restored._meta = meta._meta || { last_updated: nowStamp() };
    return restored;
  }

  return clone({ ...DB_TEMPLATE, ...meta });
}

async function readCloudRuntimeData() {
  try {
    const primary = await readCloudRuntimeDataFromPath(PRIMARY_RUNTIME_DOC_PATH);
    if (primary) return primary;
  } catch (err) {
    if (err?.code !== 'permission-denied') throw err;
  }

  return readCloudRuntimeDataFromPath(LEGACY_RUNTIME_DOC_PATH);
}

async function writeCloudRuntimeData(db) {
  const normalizedDb = clone({ ...DB_TEMPLATE, ...db });
  await replaceCloudChunks(normalizedDb);
  await runtimeDocRef().set(buildCloudMetaPayload(normalizedDb), { merge: false });
}

async function ensureFirebaseSession() {
  bootFirebase();
  if (firebaseAuth.currentUser) return firebaseAuth.currentUser;
  if (authReadyPromise) return authReadyPromise;

  authReadyPromise = (async () => {
    try {
      const user = await new Promise((resolve, reject) => {
        const unsubscribe = firebaseAuth.onAuthStateChanged((currentUser) => {
          unsubscribe();
          if (currentUser) {
            resolve(currentUser);
            return;
          }
          reject(new Error('Cloud sync requires Google sign-in. Please sign in with Google to use Firebase data.'));
        }, (err) => {
          unsubscribe();
          reject(err);
        });
      });
      setSyncStatus({ ok: true, message: 'Connected to Firebase cloud.' });
      return user;
    } catch (err) {
      setSyncStatus({ ok: false, message: `Firebase auth failed: ${err.message}` });
      throw err;
    } finally {
      authReadyPromise = null;
    }
  })();

  return authReadyPromise;
}

function getSessionUser() {
  return localStorage.getItem(STORAGE_KEYS.sessionUser) || '';
}

function getCloudConfig() {
  const cfg = JSON.parse(localStorage.getItem(STORAGE_KEYS.cloudConfig) || '{}');
  return {
    enabled: cfg.enabled !== false,
    cloudinaryCloudName: (cfg.cloudinaryCloudName || 'dhlmqtton').trim(),
    cloudinaryUploadPreset: (cfg.cloudinaryUploadPreset || 'ATR-2026-I').trim()
  };
}

function setCloudConfig(config) {
  const next = {
    enabled: config.enabled !== false,
    cloudinaryCloudName: (config.cloudinaryCloudName || 'dhlmqtton').trim(),
    cloudinaryUploadPreset: (config.cloudinaryUploadPreset || 'ATR-2026-I').trim()
  };
  localStorage.setItem(STORAGE_KEYS.cloudConfig, JSON.stringify(next));
}

function setSyncStatus(status) {
  localStorage.setItem(STORAGE_KEYS.syncStatus, JSON.stringify({ ...status, timestamp: nowStamp() }));
  window.dispatchEvent(new CustomEvent('atr-sync-status', { detail: status }));
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function readDB() {
  return clone(runtimeDB);
}

function persistLocalCache() {
  try {
    localStorage.setItem(STORAGE_KEYS.localCache, JSON.stringify(runtimeDB));
  } catch (err) {
    const message = err?.message || 'Local cache write failed.';
    console.warn('Local cache persistence failed:', err);
    setSyncStatus({ ok: false, message: `Local cache warning: ${message}` });
  }
}

function saveDB(db) {
  runtimeDB = clone(db);
  runtimeDB._meta = runtimeDB._meta || {};
  runtimeDB._meta.last_updated = nowStamp();
  persistLocalCache();
  if (!suppressSync) scheduleAutoSync();
}

function withAudit(record, isUpdate = false) {
  const user = getSessionUser() || 'system';
  const stamp = nowStamp();
  const next = { ...record, timestamp: stamp };
  if (!isUpdate && !next.entered_by) next.entered_by = user;
  next.updated_by = user;
  return next;
}

function saveCollection(name, rows) {
  const db = readDB();
  db[name] = rows;
  saveDB(db);
}

function getCollection(name) {
  return readDB()[name] || [];
}

function upsertById(name, payload, prefix) {
  const rows = getCollection(name);
  const idx = rows.findIndex((r) => r.id === payload.id && payload.id);
  if (idx >= 0) {
    rows[idx] = withAudit({ ...rows[idx], ...payload, id: rows[idx].id }, true);
  } else {
    rows.push(withAudit({ ...payload, id: payload.id || generateId(prefix) }));
  }
  saveCollection(name, rows);
}

function batchUpsertById(name, payloads = [], prefix) {
  if (!Array.isArray(payloads) || !payloads.length) return 0;
  const rows = getCollection(name);
  const byId = new Map(rows.map((row, index) => [row.id, index]));
  let changed = 0;

  payloads.forEach((payload) => {
    const rowId = payload.id || generateId(prefix);
    if (byId.has(rowId)) {
      const idx = byId.get(rowId);
      rows[idx] = withAudit({ ...rows[idx], ...payload, id: rowId }, true);
    } else {
      rows.push(withAudit({ ...payload, id: rowId }));
      byId.set(rowId, rows.length - 1);
    }
    changed += 1;
  });

  saveCollection(name, rows);
  return changed;
}

function deleteById(name, id) {
  const rows = getCollection(name).filter((r) => r.id !== id);
  saveCollection(name, rows);
}

async function uploadToCloudinary(fileName, fileInput) {
  const cfg = getCloudConfig();
  if (!cfg.cloudinaryCloudName || !cfg.cloudinaryUploadPreset) {
    throw new Error('Cloudinary config missing. Fill Cloud Name and Upload Preset in Login > Cloud Sync Settings.');
  }

  const endpoint = `https://api.cloudinary.com/v1_1/${cfg.cloudinaryCloudName}/image/upload`;
  const form = new FormData();
  if (fileInput instanceof Blob) form.append('file', fileInput);
  else form.append('file', fileInput);
  form.append('upload_preset', cfg.cloudinaryUploadPreset);
  form.append('public_id', sanitizeName(fileName.replace(/\.[^.]+$/, '')));

  const res = await fetch(endpoint, { method: 'POST', body: form });
  const body = await res.json();
  if (!res.ok || !body.secure_url) throw new Error(body.error?.message || 'Cloudinary upload failed.');
  return body.secure_url;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Unable to read image file for local fallback.'));
    reader.readAsDataURL(blob);
  });
}

async function saveImageDataAtPath(path, base64DataOrBlob) {
  let persistedImage = '';
  try {
    persistedImage = await uploadToCloudinary(path, base64DataOrBlob);
  } catch (err) {
    const fallbackMessage = err?.message || 'Cloudinary upload failed.';
    if (base64DataOrBlob instanceof Blob) {
      // Do not persist large base64 blobs for file uploads; this can overflow localStorage
      // and break record save/sync. Keep observation save resilient even if image upload fails.
      setSyncStatus({ ok: false, message: `Cloudinary upload failed for ${path}. Saved observation without this image: ${fallbackMessage}` });
      return '';
    }

    persistedImage = String(base64DataOrBlob || '');
    setSyncStatus({ ok: false, message: `Cloudinary upload failed; used provided local image data: ${fallbackMessage}` });
  }

  runtimeDB.images = runtimeDB.images || {};
  runtimeDB.images[path] = persistedImage;
  runtimeDB._meta = runtimeDB._meta || {};
  runtimeDB._meta.last_updated = nowStamp();
  persistLocalCache();
  return persistedImage;
}

async function saveMultipleImages(files = []) {
  const results = {};

  const uploads = files.map(async ({ fileName, data }) => {
    const path = `data/images/${generateId('IMG')}-${fileName}`;
    const url = await saveImageDataAtPath(path, data);
    results[path] = url;
    return { path, url };
  });

  await Promise.all(uploads);
  if (!suppressSync) scheduleAutoSync();
  return results;
}

async function saveImageData(fileName, base64Data) {
  const path = `data/images/${generateId('IMG')}-${fileName}`;
  const url = await saveImageDataAtPath(path, base64Data);
  if (!suppressSync) scheduleAutoSync();
  return url;
}

function getImageData(path) {
  const found = readDB().images?.[path];
  if (found) return found;
  if (/^https?:\/\//.test(path || '')) return path;
  return '';
}

function getUser(username) {
  const normalized = normalizeUsername(username);
  return getCollection('users').find((u) => normalizeUsername(u.username) === normalized);
}

function requestAccess(user) {
  const users = getCollection('users');
  const normalizedUsername = normalizeUsername(user.username);
  const existingIndex = users.findIndex((u) => normalizeUsername(u.username) === normalizedUsername);
  const payload = withAudit({ ...user, username: normalizedUsername }, existingIndex >= 0);
  if (existingIndex >= 0) users[existingIndex] = payload;
  else users.push(payload);
  saveCollection('users', users);
}

function approveUser(username, approvedBy = 'system') {
  const normalizedUsername = normalizeUsername(username);
  const users = getCollection('users').map((u) => (
    normalizeUsername(u.username) === normalizedUsername ? withAudit({ ...u, approved: true, approved_by: approvedBy }, true) : u
  ));
  saveCollection('users', users);
}

function ensureDefaultAdmin(db) {
  if (!db.users.some((u) => normalizeUsername(u.username) === 'shivam.jha')) {
    db.users.push(withAudit({
      id: generateId('USR'),
      username: 'shivam.jha',
      password: 'admin@123',
      role: 'admin',
      approved: true,
      request_date: nowStamp().slice(0, 10),
      approved_by: 'system'
    }));
  }
}

function ensureRuntimeDefaults() {
  runtimeDB = clone({ ...DB_TEMPLATE, ...runtimeDB });
  ensureDefaultAdmin(runtimeDB);
  runtimeDB._meta = runtimeDB._meta || {};
  runtimeDB._meta.last_updated = runtimeDB._meta.last_updated || nowStamp();
  persistLocalCache();
}

ensureRuntimeDefaults();



function hasMeaningfulRuntimeData(db) {
  const payload = db || {};
  return (
    (payload.inspections || []).length > 0 ||
    (payload.observations || []).length > 0 ||
    (payload.requisitions || []).length > 0 ||
    (payload.next_day_planning || []).length > 0 ||
    (payload.permit_applications || []).length > 0 ||
    Object.keys(payload.images || {}).length > 0
  );
}

async function preventBlankCloudOverwrite(localPayload) {
  if (hasMeaningfulRuntimeData(localPayload)) return localPayload;
  if (syncInFlight) return localPayload;

  const remote = await readCloudRuntimeData();
  if (!remote || !hasMeaningfulRuntimeData(remote)) return localPayload;

  suppressSync = true;
  runtimeDB = clone({ ...DB_TEMPLATE, ...remote });
  suppressSync = false;
  persistLocalCache();
  window.dispatchEvent(new CustomEvent('atr-db-updated'));
  setSyncStatus({ ok: true, message: 'Recovered cloud data and skipped blank overwrite.' });
  return buildDatabaseFilesPayload();
}
function buildDatabaseFilesPayload() {
  const db = readDB();
  return {
    inspections: db.inspections || [],
    observations: db.observations || [],
    requisitions: db.requisitions || [],
    next_day_planning: db.next_day_planning || [],
    permit_applications: db.permit_applications || [],
    users: db.users || [],
    images: db.images || {},
    _meta: db._meta || { last_updated: nowStamp() }
  };
}

function downloadTextFile(fileName, content) {
  const blob = new Blob([content], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function initializeData() {
  const cached = localStorage.getItem(STORAGE_KEYS.localCache);
  let localCacheLoaded = false;
  if (cached) {
    try {
      runtimeDB = clone({ ...DB_TEMPLATE, ...JSON.parse(cached) });
      ensureRuntimeDefaults();
      localCacheLoaded = true;
    } catch (err) {
      console.warn('Local cache parse failed:', err);
    }
  } else {
    ensureRuntimeDefaults();
  }

  try {
    await ensureFirebaseSession();
    const cloudData = await readCloudRuntimeData();

    if (cloudData) {
      const cloudHasData = hasMeaningfulRuntimeData(cloudData);
      const localHasData = hasMeaningfulRuntimeData(runtimeDB);
      const cloudStamp = new Date(cloudData._meta?.last_updated || '').getTime();
      const localStamp = new Date(runtimeDB._meta?.last_updated || '').getTime();
      const cloudStampValid = Number.isFinite(cloudStamp) && cloudStamp > 0;
      const localStampValid = Number.isFinite(localStamp) && localStamp > 0;

      const useCloud = !localCacheLoaded
        || (cloudHasData && !localHasData)
        || (cloudStampValid && (!localStampValid || cloudStamp >= localStamp));

      if (useCloud) {
        runtimeDB = clone({ ...DB_TEMPLATE, ...cloudData });
        ensureRuntimeDefaults();
        setSyncStatus({ ok: true, message: 'Loaded data from Firebase cloud.' });
      } else {
        persistLocalCache();
        if (localHasData) scheduleAutoSync();
        setSyncStatus({ ok: true, message: 'Loaded latest data from local cache and scheduled Firebase sync.' });
      }
      return;
    }

    const localPayload = buildDatabaseFilesPayload();
    if (hasMeaningfulRuntimeData(localPayload)) {
      await writeCloudRuntimeData(localPayload);
      setSyncStatus({ ok: true, message: 'Initialized Firebase cloud document from local cache.' });
    } else {
      setSyncStatus({ ok: true, message: 'Cloud document not found; waiting for first local data save.' });
    }
  } catch (err) {
    setSyncStatus({ ok: false, message: `Firebase init fallback (local cache in use): ${err.message}` });
    ensureRuntimeDefaults();
  }
}

async function syncAllToCloud(config = getCloudConfig()) {
  if (!config.enabled) return;
  await ensureFirebaseSession();

  cloudWriteChain = cloudWriteChain
    .catch(() => {})
    .then(async () => {
      const payload = buildDatabaseFilesPayload();
      const safePayload = await preventBlankCloudOverwrite(payload);
      await writeCloudRuntimeData(safePayload);
    });

  await cloudWriteChain;
  setSyncStatus({ ok: true, message: 'Saved to Firebase cloud successfully.' });
}

async function pullCloudToLocalIfNewer(config = getCloudConfig()) {
  if (!config.enabled) return;
  await ensureFirebaseSession();
  const remote = await readCloudRuntimeData();
  if (!remote) return;
  const local = readDB();
  const remoteTime = new Date(remote._meta?.last_updated || 0).getTime();
  const localTime = new Date(local._meta?.last_updated || 0).getTime();

  if (remoteTime > localTime) {
    suppressSync = true;
    runtimeDB = clone({ ...DB_TEMPLATE, ...remote });
    suppressSync = false;
    persistLocalCache();
    window.dispatchEvent(new CustomEvent('atr-db-updated'));
    setSyncStatus({ ok: true, message: 'Pulled latest data from Firebase.' });
  }
}

function scheduleAutoSync() {
  const config = getCloudConfig();
  if (!config.enabled) return;
  if (syncInFlight) {
    syncPending = true;
    return;
  }

  syncInFlight = true;
  syncAllToCloud(config)
    .catch((err) => setSyncStatus({ ok: false, message: err.message }))
    .finally(() => {
      syncInFlight = false;
      if (syncPending) {
        syncPending = false;
        scheduleAutoSync();
      }
    });
}

function startRealtimeSync() {
  if (realtimeStarted) return;
  realtimeStarted = true;

  const config = getCloudConfig();
  if (!config.enabled) return;

  ensureFirebaseSession()
    .then(() => runtimeDocRef(PRIMARY_RUNTIME_DOC_PATH).onSnapshot(async (snap) => {
    if (!snap.exists || !snap.data()) return;
    const remote = await readCloudRuntimeData();
    if (!remote) return;
    const local = readDB();
    const remoteTime = new Date(remote._meta?.last_updated || 0).getTime();
    const localTime = new Date(local._meta?.last_updated || 0).getTime();

    if (remoteTime > localTime) {
      suppressSync = true;
      runtimeDB = clone({ ...DB_TEMPLATE, ...remote });
      suppressSync = false;
      persistLocalCache();
      window.dispatchEvent(new CustomEvent('atr-db-updated'));
    }
  }, (err) => {
    setSyncStatus({ ok: false, message: err.message || 'Realtime sync failed.' });
  }))
    .catch((err) => setSyncStatus({ ok: false, message: `Realtime setup failed: ${err.message}` }));
}

async function signInWithGoogle() {
  bootFirebase();
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await firebaseAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

  try {
    const result = await firebaseAuth.signInWithPopup(provider);
    return result?.user || null;
  } catch (err) {
    if ([
      'auth/popup-blocked',
      'auth/cancelled-popup-request',
      'auth/operation-not-supported-in-this-environment',
      'auth/web-storage-unsupported'
    ].includes(err?.code)) {
      await firebaseAuth.signInWithRedirect(provider);
      return null;
    }
    throw err;
  }
}

async function consumeGoogleRedirectResult() {
  bootFirebase();
  const result = await firebaseAuth.getRedirectResult();
  return result?.user || null;
}
