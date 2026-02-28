// ---------- Inicio modificado de script.js (dynamic firebase loader) ----------

// ===== Multi-tab coordinator (elige 1 pestaña líder) =====
export const TAB_ID = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
const bc = ("BroadcastChannel" in window) ? new BroadcastChannel("listasapp:v1") : null;

export let isLeaderTab = true; // se decide tras la elección
let heardExternalLeader = false; // 👈 nuevo: recuerda si ya oímos a otro líder
export const leaderElectionReady = new Promise((resolve) => {
  if (!bc) { isLeaderTab = true; resolve(true); return; }

  const contenders = new Set([TAB_ID]);

  try { bc.postMessage({ type: "candidate", id: TAB_ID }); } catch {}

  // tras crear bc y TAB_ID…
  bc?.addEventListener?.('messageerror', () => {}); // defensivo

  bc && (bc.onmessage = (ev) => {
    const d = ev.data || {};
    if (d.type === "candidate" && d.id) {
      contenders.add(d.id);
      // 👇 si YO soy líder, contesto para que el recién llegado sepa que ya hay líder
      if (isLeaderTab) { try { bc.postMessage({ type: "iamleader", id: TAB_ID }); } catch {} }
    }
    if (d.type === "iamleader" && d.id && d.id !== TAB_ID) {
      isLeaderTab = false;
      heardExternalLeader = true;               // 👈 no me autoproclames después
      contenders.add(d.id);                     // 👈 incluye el líder existente
      // 👇 NUEVO: por si esta pestaña llegó a programar algo (p. ej. al cargar)
      try { cancelAllScheduledNotifications({ preserveStorage: true }); } catch {}
    }
  });

  // pequeña ventana para oír a otras pestañas (evita “nadie es líder”)
  setTimeout(() => {
    if (heardExternalLeader) {
      // Si ya escuchamos un líder externo, respétalo
      console.log("Leader? false (heard external leader)", "tab:", TAB_ID);
      resolve(false);
      return;
    }
    const leaderId = [...contenders].sort()[0];
    isLeaderTab = (leaderId === TAB_ID);
    if (isLeaderTab) { try { bc.postMessage({ type: "iamleader", id: TAB_ID }); } catch {} }
    console.log("Leader?", isLeaderTab, "tab:", TAB_ID);
    resolve(isLeaderTab);
  }, 200);
});

let initializeApp, getAnalytics, initializeFirestore,
    collection, addDoc, query, orderBy, limit, deleteDoc,
    doc, updateDoc, serverTimestamp, getDoc, onSnapshot,
    writeBatch, getDocs, where, arrayUnion;

// 👇 NUEVAS variables para Auth 👇
let getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged;
let auth = null;
export let currentUser = null; // Guardará la info del usuario activo

// refs a helpers de la nueva caché
let persistentLocalCache, persistentMultipleTabManager, memoryLocalCache;

let db = null;
let analytics = null;
// debajo del bloque de imports dinámicos / refs
let firebaseLoaded = false;   // <—  AÑADIR

async function initFirebase() {
  if (firebaseLoaded) return true;

  try {
    const modApp       = await import("https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js");
    const modAnalytics = await import("https://www.gstatic.com/firebasejs/12.0.0/firebase-analytics.js");
    const modFirestore = await import("https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js");
    // 👇 NUEVA IMPORTACIÓN DE AUTH 👇
    const modAuth      = await import("https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js");

    // APIs que usas en el resto del código
    initializeApp     = modApp.initializeApp;
    getAnalytics      = modAnalytics.getAnalytics;

    initializeFirestore = modFirestore.initializeFirestore;
    collection        = modFirestore.collection;
    addDoc            = modFirestore.addDoc;
    query             = modFirestore.query;
    orderBy           = modFirestore.orderBy;
    limit             = modFirestore.limit;
    deleteDoc         = modFirestore.deleteDoc;
    doc               = modFirestore.doc;
    updateDoc         = modFirestore.updateDoc;
    serverTimestamp   = modFirestore.serverTimestamp;
    getDoc            = modFirestore.getDoc;
    onSnapshot        = modFirestore.onSnapshot;

    writeBatch        = modFirestore.writeBatch;
    getDocs           = modFirestore.getDocs;

    // NUEVO: helpers de caché v12
    persistentLocalCache        = modFirestore.persistentLocalCache;
    persistentMultipleTabManager= modFirestore.persistentMultipleTabManager;
    memoryLocalCache            = modFirestore.memoryLocalCache;
    // 👇 ASIGNAR FUNCIONES DE AUTH 👇
    getAuth            = modAuth.getAuth;
    signInWithPopup    = modAuth.signInWithPopup;
    GoogleAuthProvider = modAuth.GoogleAuthProvider;
    signOut            = modAuth.signOut;
    onAuthStateChanged = modAuth.onAuthStateChanged;
    where             = modFirestore.where;       // <--- NUEVO
    arrayUnion        = modFirestore.arrayUnion;  // <--- NUEVO

    // Inicializa app y analytics
    const app = initializeApp(firebaseConfig);
    try { analytics = getAnalytics(app); } catch {}
    // 👇 INICIALIZAR AUTH 👇
    auth = getAuth(app);
    iniciarEscuchaAuth(); // Inicia el observador de sesión

    // ✅ Caché persistente con sincronización multi-tab (sin enableIndexedDbPersistence)
    try {
      db = initializeFirestore(app, {
        ignoreUndefinedProperties: true,
        experimentalAutoDetectLongPolling: true,
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      });
      console.log("Firestore con caché persistente multi-tab.");
    } catch (e) {
      // Fallback seguro (Safari/privado/etc.)
      db = initializeFirestore(app, {
        ignoreUndefinedProperties: true,
        experimentalAutoDetectLongPolling: true,
        localCache: memoryLocalCache(),
      });
      console.warn("IndexedDB no disponible. Usando caché en memoria.", e?.message || e);
    }

    firebaseLoaded = true;
    console.log("Firebase cargado dinámicamente.");
    return true;
  } catch (err) {
    console.warn("No se pudo cargar Firebase dinámicamente. Modo offline parcial.", err?.message || err);
    firebaseLoaded = false;
    db = null;
    return false;
  }
}
// ---------- Fin del bloque modificado ----------

/* ================= FIREBASE CONFIG (mantén tus credenciales) ================= */
const firebaseConfig = {
  apiKey: "AIzaSyCGXnX8UJtLC0Jn1oEo6huZqz_ZkmyGO84",
  authDomain: "listascompras-94a64.firebaseapp.com",
  projectId: "listascompras-94a64",
  storageBucket: "listascompras-94a64.firebasestorage.app",
  messagingSenderId: "792067541567",
  appId: "1:792067541567:web:f73cf92dd79843d962068a",
  measurementId: "G-YZ02H3KCZC",
};
/* ======= UTILIDADES FECHA ======= */
function parseFechaFromString(fechaStr) {
  if (!fechaStr) return null;
  if (typeof fechaStr === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fechaStr)) {
    const [y, m, d] = fechaStr.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  if (fechaStr && fechaStr.toDate) return fechaStr.toDate();
  if (fechaStr instanceof Date) return fechaStr;
  return new Date(fechaStr);
}
function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function addDays(d, days) { const r = new Date(d); r.setDate(r.getDate() + days); return r; }
function dateAtHour(d, hour = NOTIFY_HOUR) { const r = startOfDay(d); r.setHours(hour,0,0,0); return r; }
function pad(n){ return String(n).padStart(2,'0'); }
function formatDateToInput(d){ if(!d) return ''; const y=d.getFullYear(), m=d.getMonth()+1, day=d.getDate(); return `${y}-${pad(m)}-${pad(day)}`; }
function daysInMonth(year, month){ return new Date(year, month+1, 0).getDate(); }
function addMonthsKeepDay(date, months){
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();
  const targetMonth = m + months;
  const targetYear = y + Math.floor(targetMonth/12);
  const monthIndex = ((targetMonth%12)+12)%12;
  const dim = daysInMonth(targetYear, monthIndex);
  const newDay = Math.min(d, dim);
  return new Date(targetYear, monthIndex, newDay);
}

// ---------- Helper: control de ejecución bulk y debounce ----------
let isBulkUpdating = false; // evita cascadas mientras hacemos muchos updates
const debounced = (fn, wait = 500) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
};

function setFiltroListas(scope){ // 'todas' | 'pendientes'
  const btnTodas = document.getElementById('btnTodas');
  const btnPend = document.getElementById('btnPendientes');

  const activar = (btn, on) => {
    if (!btn) return;
    btn.classList.toggle('active', !!on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  };

  if (scope === 'pendientes'){
    activar(btnPend, true);
    activar(btnTodas, false);
    mostrarListasFirebase(true, true);
  } else {
    activar(btnTodas, true);
    activar(btnPend, false);
    mostrarListasFirebase(true, false);
  }
}
window.setFiltroListas = setFiltroListas;

// Reemplaza llamadas a actualizarNotificaciones() por debouncedActualizarNotificaciones()
// si quieres evitar ejecuciones en ráfaga:
const debouncedActualizarNotificaciones = debounced(actualizarNotificaciones, 600);

// ---------- Instrumentación opcional (temporal) ----------
window.__clientWriteCounter = 0;
function incrClientWriteCounter(n = 1) {
  window.__clientWriteCounter = (window.__clientWriteCounter || 0) + n;
  if (window.__clientWriteCounter % 100 === 0) {
    console.warn(`Client write counter: ${window.__clientWriteCounter}`);
  }
}

// ---------- safeUpdateDoc: solo actualiza cuando hay cambios visibles en cache ----------
function shallowChanged(a, b) {
  if (a === b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return true;
    for (let i = 0; i < a.length; i++) {
      if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) return true;
    }
    return false;
  }
  if (typeof a === 'object' && typeof b === 'object') {
    return JSON.stringify(a) !== JSON.stringify(b);
  }
  if (typeof a === 'number' || typeof b === 'number') return Number(a) !== Number(b);
  return String(a) !== String(b);
}

async function safeUpdateDoc(docRefOrPath, updates) {
  if (!updates || Object.keys(updates).length === 0) return false;
  let id;
  if (typeof docRefOrPath === 'string') id = docRefOrPath;
  else if (docRefOrPath && docRefOrPath.id) id = docRefOrPath.id;

  if (id && listasCache.has(id)) {
    const cached = listasCache.get(id);
    let need = false;
    for (const k of Object.keys(updates)) {
      const newV = updates[k];
      const oldV = cached[k];

      // si es función (p. ej. serverTimestamp()), forzamos update
      if (typeof newV === 'function') { need = true; break; }

      // comparación básica: si son objetos, considera que cambian (o implementa deepEqual si quieres)
      if (typeof newV === 'object' && newV !== null) { need = true; break; }

      //if (String(newV) !== String(oldV)) 
      if (shallowChanged(newV, oldV)) { need = true; break; }
    }
    if (!need) return false;
  }

  try {
    let docRefObj = docRefOrPath;
    if (typeof docRefOrPath === 'string') {
      if (!canUseFirestore()) return false;
      docRefObj = doc(db, "listas", docRefOrPath);
    }
    await updateDoc(docRefObj, updates);
    incrClientWriteCounter(1);
    return true;
  } catch (err) {
    console.error("safeUpdateDoc error:", err);
    return false;
  }
}

/* ======= CONFIG Y CONSTANTES (asegúrate de tener definidas estas variables en tu entorno) ======= */
const IDB_DB_NAME = 'listas_db_v1';
const IDB_VERSION = 1;
const IDB_STORE = 'listas_store_v1';
const LISTAS_CACHE_KEY_LEGACY = 'listas_cache_legacy_v1';
const STORAGE_KEY_SCHEDULE = 'listas_schedule_map_v1';
const NOTIFY_OFFSETS_DAYS = [0,1,3]; // offsets que ya tenías (ejemplo)
const NOTIFY_HOUR = 9; // hora por defecto para la notificación (si lo usas)
const MAX_NOTIFY_WINDOW_DAYS = 365; // ejemplo máximo
const MAX_PAST_NOTIFY_DAYS = 10; // mostrar pagos NO mensuales caducados hasta 10 días atrás


/* ======= CACHE EN MEMORIA + PERSISTENCIA EN INDEXEDDB (con fallback a localStorage) ======= */
const listasCache = new Map();

function openIndexedDB() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) return reject(new Error("No IndexedDB"));
    const req = indexedDB.open(IDB_DB_NAME, IDB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB open error"));
  });
}

function saveAllToIndexedDB(arr) {
  return openIndexedDB().then(db => new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    const store = tx.objectStore(IDB_STORE);
    const clearReq = store.clear();
    clearReq.onsuccess = () => {
      try {
        arr.forEach(it => store.put(it));
      } catch(e){}
    };
    tx.oncomplete = () => { db.close(); res(); };
    tx.onerror = (e) => { db.close(); rej(e); };
  })).catch(() => {
    try { localStorage.setItem(LISTAS_CACHE_KEY_LEGACY, JSON.stringify(arr)); } catch(e){}
  });
}

function loadAllFromIndexedDB() {
  return openIndexedDB().then(db => new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const store = tx.objectStore(IDB_STORE);
    const req = store.getAll();
    req.onsuccess = () => { db.close(); res(req.result || []); };
    req.onerror = (e) => { db.close(); rej(e); };
  })).catch(() => {
    try {
      const raw = localStorage.getItem(LISTAS_CACHE_KEY_LEGACY);
      return JSON.parse(raw || "[]");
    } catch(e){ return []; }
  });
}

function saveOneToIndexedDB(item) {
  return openIndexedDB().then(db => new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    const store = tx.objectStore(IDB_STORE);
    const req = store.put(item);
    req.onsuccess = () => { db.close(); res(); };
    req.onerror = (e) => { db.close(); rej(e); };
  })).catch(() => {
    try {
      const raw = localStorage.getItem(LISTAS_CACHE_KEY_LEGACY);
      const arr = raw ? JSON.parse(raw) : [];
      const idx = arr.findIndex(x => x.id === item.id);
      if (idx >= 0) arr[idx] = item; else arr.push(item);
      localStorage.setItem(LISTAS_CACHE_KEY_LEGACY, JSON.stringify(arr));
    } catch(e){}
  });
}

function deleteOneFromIndexedDB(id) {
  return openIndexedDB().then(db => new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    const store = tx.objectStore(IDB_STORE);
    const req = store.delete(id);
    req.onsuccess = () => { db.close(); res(); };
    req.onerror = (e) => { db.close(); rej(e); };
  })).catch(() => {
    try {
      const raw = localStorage.getItem(LISTAS_CACHE_KEY_LEGACY);
      const arr = raw ? JSON.parse(raw) : [];
      const filtered = arr.filter(x => x.id !== id);
      localStorage.setItem(LISTAS_CACHE_KEY_LEGACY, JSON.stringify(filtered));
    } catch(e){}
  });
}

async function persistCacheToIndexedDB() {
  const arr = Array.from(listasCache.values());
  await saveAllToIndexedDB(arr);
}
let _persistScheduled = null;

function schedulePersistCacheToIndexedDB(delay = 1200) {
  if (_persistScheduled && typeof _persistScheduled.cancel === 'function') {
    try { _persistScheduled.cancel(); } catch {}
    _persistScheduled = null;
  }
  return new Promise((resolve) => {
    const run = async () => {
      try { await persistCacheToIndexedDB(); }
      catch (e) { console.warn("persistCache error:", e); }
      finally { _persistScheduled = null; resolve(); }
    };

    if ('requestIdleCallback' in window) {
      const id = requestIdleCallback(run, { timeout: delay });
      _persistScheduled = { cancel: () => { try { cancelIdleCallback(id); } catch {} } };
    } else {
      const cancel = scheduleTimeout(delay, run);
      _persistScheduled = { cancel };
    }
  });
}

async function loadCacheFromIndexedDB() {
  const arr = await loadAllFromIndexedDB();
  listasCache.clear();
  (arr || []).forEach(l => { if (l && l.id) listasCache.set(l.id, l); });
}

/* ======= UTIL: generar clientId (uuid) ======= */
function generateClientId() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch(e){}
  return `cid_${Date.now()}_${Math.floor(Math.random()*1e6)}`;
}

// ---------- Helper seguro para serverTimestamp ----------
function safeServerTimestamp() {
  if (typeof serverTimestamp === "function") {
    try { return serverTimestamp(); } catch(_) {}
  }
  return new Date().toISOString();
}

function canUseFirestore() {
  return !!(firebaseLoaded && db && typeof addDoc === "function" && typeof getDoc === "function" && typeof updateDoc === "function");
}

/* =========================
  toggleProductosExtra helper
  ========================= */
function toggleProductosExtra(listaId, buttonEl) {
  const ul = document.getElementById(`product-list-${listaId}`);
  if (!ul) return;
  const extras = ul.querySelectorAll('.producto-extra');
  if (!extras || extras.length === 0) return;
  const anyHidden = Array.from(extras).some(el => el.classList.contains('oculto'));
  extras.forEach(el => {
    if (anyHidden) el.classList.remove('oculto'); else el.classList.add('oculto');
  });
  if (anyHidden) {
    buttonEl.textContent = 'Mostrar menos';
  } else {
    buttonEl.textContent = `Ver ${extras.length} más`;
  }
} 

// Máximo que acepta setTimeout en ms (2^31-1)
const MAX_TIMEOUT_MS = 2147483647;

/**
 * scheduleTimeout(delayMs, cb)
 * - Permite delays mayores al límite encadenando timeouts.
 * - Devuelve una FUNCIÓN canceladora (cancel()).
 */
function scheduleTimeout(delayMs, cb) {
  let cancelled = false;
  let currentId = null;

  function run(remaining) {
    if (cancelled) return;
    if (remaining <= 0) {
      Promise.resolve().then(() => {
        if (!cancelled) {
          try { cb(); } catch (e) { console.error("scheduleTimeout cb error:", e); }
        }
      });
      return;
    }
    const slice = Math.min(remaining, MAX_TIMEOUT_MS);
    currentId = setTimeout(() => run(remaining - slice), slice);
  }

  run(delayMs);

  return () => {
    cancelled = true;
    if (currentId != null) {
      try { clearTimeout(currentId); } catch {}
    }
  };
}

/**
 * scheduleAt(timestampMs, cb)
 * - Acepta timestamp absoluto (Date.getTime()).
 * - Devuelve una FUNCIÓN canceladora (cancel()).
 */
function scheduleAt(timestampMs, cb) {
  const delay = Math.max(0, timestampMs - Date.now());
  return scheduleTimeout(delay, cb);
}

/* ======= COLAS LOCALES PARA ACCIONES OFFLINE ======= */
const PEND_CREATE_KEY = "listasPendientesCreates_v1";
const PEND_UPD_KEY = "listasPendientesUpdates_v1";
const PEND_DEL_KEY = "listasPendientesDeletes_v1";

function loadPendingCreates(){ try { return JSON.parse(localStorage.getItem(PEND_CREATE_KEY) || "[]"); } catch(e){ return []; } }
function savePendingCreates(arr){ try { localStorage.setItem(PEND_CREATE_KEY, JSON.stringify(arr)); } catch(e){} }

function loadPendingUpdates(){ try { return JSON.parse(localStorage.getItem(PEND_UPD_KEY) || "{}"); } catch(e){ return {}; } }
function savePendingUpdates(obj){ try { localStorage.setItem(PEND_UPD_KEY, JSON.stringify(obj)); } catch(e){} }

function loadPendingDeletes(){ try { return JSON.parse(localStorage.getItem(PEND_DEL_KEY) || "[]"); } catch(e){ return []; } }
function savePendingDeletes(arr){ try { localStorage.setItem(PEND_DEL_KEY, JSON.stringify(arr)); } catch(e){} }

// ===== LOCK cross-tab para sincronización de pendientes =====

// 👇 Nuevo acquire: ejecuta el trabajo DENTRO del lock si existe Locks API; si no, usa fallback con localStorage
async function acquireSyncLockSafely(runFn) {
  if (navigator.locks?.request) {
    try {
      const result = await navigator.locks.request(
        "listas:sync",
        { mode: "exclusive", ifAvailable: true },
        async (lock) => {
          if (!lock) return false;     // no obtuve el lock
          try { await runFn(); return true; }
          catch (e) { console.error("Sync runFn error:", e); return false; }
        }
      );
      return !!result;
    } catch (e) {
      console.warn("Locks API error, fallback a localStorage lock:", e);
    }
  }
  // Fallback: lock por localStorage
  if (!tryAcquireSyncLock(30000)) return false;
  try { await runFn(); return true; }
  finally { releaseSyncLock(); }
}

const SYNC_LOCK_KEY = 'listas_sync_lock_v1';

function tryAcquireSyncLock(ttlMs = 30000) {
  try {
    const now = Date.now();
    const raw = localStorage.getItem(SYNC_LOCK_KEY);
    const prev = raw ? JSON.parse(raw) : null;
    if (prev && (now - prev.ts) < ttlMs) return false;

    const mine = { ts: now, tab: TAB_ID };
    localStorage.setItem(SYNC_LOCK_KEY, JSON.stringify(mine));

    // Verificar que el lock quedó con mi TAB_ID
    const check = JSON.parse(localStorage.getItem(SYNC_LOCK_KEY) || "null");
    return !!check && check.tab === TAB_ID;
  } catch { return true; }
}

function releaseSyncLock() {
  try {
    const raw = localStorage.getItem(SYNC_LOCK_KEY);
    const prev = raw ? JSON.parse(raw) : null;
    if (prev && prev.tab === TAB_ID) localStorage.removeItem(SYNC_LOCK_KEY);
  } catch {}
}

function bumpSyncLock() {
  try {
    const raw = localStorage.getItem(SYNC_LOCK_KEY);
    const prev = raw ? JSON.parse(raw) : null;
    if (prev && prev.tab === TAB_ID) {
      prev.ts = Date.now();
      localStorage.setItem(SYNC_LOCK_KEY, JSON.stringify(prev));
    }
  } catch {}
}

// (Actualizado) suelta el lock y cierra el canal si esta pestaña se cierra
window.addEventListener('unload', () => {
  try { releaseSyncLock(); } catch {}
  try { bc?.close?.(); } catch {}
});

window.addEventListener('pagehide', () => {
  try { releaseSyncLock(); } catch {}
  try { cancelAllScheduledNotifications({ preserveStorage: true }); } catch {}
  try { bc?.close?.(); } catch {}
});

/* ======= SCHEDULED TIMEOUTS (persistencia simple) ======= */
const scheduledTimeouts = new Map();
function loadScheduledMap() { try { const raw = localStorage.getItem(STORAGE_KEY_SCHEDULE); return raw ? JSON.parse(raw) : {}; } catch(e){ return {}; } }
function saveScheduledMap(map) { try { localStorage.setItem(STORAGE_KEY_SCHEDULE, JSON.stringify(map)); } catch(e){} }
function cancelScheduledNotificationsForList(listId) {
  const cancels = scheduledTimeouts.get(listId) || [];
  cancels.forEach(fn => { try { fn(); } catch {} });
  scheduledTimeouts.delete(listId);
  const map = loadScheduledMap();
  if (map[listId]) { delete map[listId]; saveScheduledMap(map); }
}

function cancelAllScheduledNotifications({ preserveStorage = false } = {}) {
  scheduledTimeouts.forEach(arr => arr.forEach(fn => { try { fn(); } catch {} }));
  scheduledTimeouts.clear();
  if (!preserveStorage) saveScheduledMap({});
}

/* ======= NOTIFICATIONS API (DESACTIVADAS: no usamos Notification) ======= */
// Esta app ya no usará notificaciones del navegador. En su lugar mostramos avisos "in-app".
async function ensureNotificationPermission() {
  // No pedimos permisos al navegador; siempre false.
  return false;
}
function sendBrowserNotification(title, body, data = {}) {
  try {
    // Mostrar aviso dentro de la app (mensaje temporal visible en la UI)
    mostrarMensaje(`${title} — ${body}`, "info");

    // Marcar en la cache que hubo una notificación local para esa lista
    if (data && data.listaId) {
      try {
        const lista = listasCache.get(data.listaId);
        if (lista) {
          lista._ultimaNotificacionLocal = new Date().toISOString();
          listasCache.set(lista.id, lista);
          schedulePersistCacheToIndexedDB().catch(()=>{});
        }
      } catch(e){ /* noop */ }
    }
  } catch(e){
    console.log("sendBrowserNotification (in-app) error:", e);
  }
}

// ===== Helper: crea URL para abrir Google Calendar con datos precargados (por hora) =====
/**
 * crearGoogleCalendarLink(lista, opts)
 * - allDay: true|false (default true)
 * - hour: hora local inicio si allDay=false
 * - durationMinutes: duración si allDay=false
 *
 * Devuelve la mejor URL para abrir Google Calendar según plataforma.
 * 🔧 Corregido: usa hora LOCAL sin 'Z' y agrega ctz (zona horaria).
 */
function crearGoogleCalendarLink(lista, opts = { allDay: true, hour: NOTIFY_HOUR || 9, durationMinutes: 60 }) {
  if (!lista || !lista.fecha) return "#";
  const fecha = parseFechaFromString(lista.fecha);
  if (!fecha || isNaN(fecha)) return "#";

  const pad = (n) => String(n).padStart(2, "0");

  // fechas para params (all-day usa YYYYMMDD/YYYYMMDD; con hora usa timestamps locales sin 'Z')
  let startParam, endParam;

  const tz = encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');

  if (opts.allDay) {
    const y = fecha.getFullYear();
    const m = pad(fecha.getMonth() + 1);
    const d = pad(fecha.getDate());
    startParam = `${y}${m}${d}`;
    const fechaFin = addDays(fecha, 1);
    const y2 = fechaFin.getFullYear();
    const m2 = pad(fechaFin.getMonth() + 1);
    const d2 = pad(fechaFin.getDate());
    endParam = `${y2}${m2}${d2}`;
  } else {
    const startDateLocal = new Date(fecha);
    startDateLocal.setHours(opts.hour || NOTIFY_HOUR || 9, 0, 0, 0);
    const endDateLocal = new Date(startDateLocal.getTime() + ((opts.durationMinutes || 60) * 60 * 1000));

    // Google acepta formato local YYYYMMDDTHHMMSS (sin Z) + ctz
    const toGCalLocalTs = (dt) => {
      const y = dt.getFullYear();
      const m = pad(dt.getMonth()+1);
      const d = pad(dt.getDate());
      const h = pad(dt.getHours());
      const mi = pad(dt.getMinutes());
      const s = pad(dt.getSeconds());
      return `${y}${m}${d}T${h}${mi}${s}`;
    };
    startParam = toGCalLocalTs(startDateLocal);
    endParam = toGCalLocalTs(endDateLocal);
  }

  const title = encodeURIComponent(`Lista: ${lista.lugar || "Compras"}`);
  const details = encodeURIComponent(
    (Array.isArray(lista.productos) && lista.productos.length)
    ? lista.productos.map(p => `${p.nombre} — $${Number(p.precio||0).toFixed(2)}${p.descripcion ? ` (${p.descripcion})` : ""}`).join("\n")
      : "Sin productos detallados."
  );
  const location = encodeURIComponent(lista.lugar || "");

  // Detectar móvil (simple y razonable)
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || "");

  if (isMobile) {
    return `https://www.google.com/calendar/render?action=TEMPLATE&ctz=${tz}&text=${title}&dates=${startParam}/${endParam}&details=${details}&location=${location}`;
  } else {
    return `https://calendar.google.com/calendar/r/eventedit?ctz=${tz}&text=${title}&dates=${startParam}/${endParam}&details=${details}&location=${location}`;
  }
}

/* ======= UTILIDADES UI: mostrarMensaje con tipos ======= */
function mostrarMensaje(texto, tipo = "info") {
  const mensajeDiv = document.getElementById("mensaje");
  const iconos = { success: "✅", offline: "⚠️", error: "❌", info: "ℹ️" };
  const clases = { success: "msg-success", offline: "msg-offline", error: "msg-error", info: "msg-info" };
  if (!mensajeDiv) {
    console.log(`${iconos[tipo] || ""} ${texto}`);
    return;
  }
  mensajeDiv.classList.remove("msg-success","msg-offline","msg-error","msg-info");
  mensajeDiv.classList.add(clases[tipo] || "msg-info");
  mensajeDiv.textContent = `${iconos[tipo] || ""} ${texto}`;
  mensajeDiv.classList.remove("oculto");
  const timeout = tipo === "offline" ? 6000 : tipo === "error" ? 5000 : 3000;
  setTimeout(()=> mensajeDiv.classList.add("oculto"), timeout);
}

/* ======= UTILS UI restantes ======= */
function escapeHtml(str) {
  if (!str) return "";
  return String(str).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}
function formatearFecha(fechaStr) {
  if (!fechaStr) return "";
  if (fechaStr.toDate) return fechaStr.toDate().toLocaleDateString("es-MX", {year:"numeric",month:"short",day:"numeric"});
  if (typeof fechaStr === "string") {
    const [y,m,d] = fechaStr.split("-").map(Number); const fecha = new Date(y,m-1,d);
    return fecha.toLocaleDateString("es-MX", {year:"numeric",month:"short",day:"numeric"});
  }
  if (fechaStr instanceof Date) return fechaStr.toLocaleDateString("es-MX", {year:"numeric",month:"short",day:"numeric"});
  return "";
}
function normalizarTexto(texto) { return (texto||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }

/* ======= DEBOUNCE ======= */
function debounce(fn, wait = 300) {
  let t;
  return function(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

/* ======= SCHEDULER: programar notificaciones (AHORA in-app, NO Notification API) ======= */
async function scheduleNotificationsForList(lista) {
  if (!lista || !lista.id || !lista.fecha) return;

  // limpia timers previos (defensiva)
  const prevCancels = scheduledTimeouts.get(lista.id) || [];
  prevCancels.forEach(fn => { try { fn(); } catch {} });
  scheduledTimeouts.delete(lista.id);

  if (lista.pagoMensual) {
    const fParsed = parseFechaFromString(lista.fecha);
    if (fParsed && startOfDay(fParsed).getTime() < startOfDay(new Date()).getTime()) {
      if (navigator.onLine && canUseFirestore()) { await advanceMonthlyList(lista); return; }
      else { cancelScheduledNotificationsForList(lista.id); return; }
    }
  }

  if (lista.completada) { cancelScheduledNotificationsForList(lista.id); return; }
  if (lista._notificacionDescartada) { cancelScheduledNotificationsForList(lista.id); return; }
  if (!esPendientePorFechaOnly(lista)) { cancelScheduledNotificationsForList(lista.id); return; }

  const map = loadScheduledMap();
  map[lista.id] = Array.isArray(map[lista.id]) ? map[lista.id] : [];
  const now = Date.now();
  map[lista.id] = map[lista.id].filter(ts => ts > now);
  const existingTimestamps = new Set(map[lista.id]);

  const f = parseFechaFromString(lista.fecha);
  if (!f || isNaN(f)) return;

  const cancelsForList = [];

  for (const offset of NOTIFY_OFFSETS_DAYS) {
    const notifyDay = addDays(f, -offset);
    const notifyAt = dateAtHour(notifyDay).getTime();
    if (notifyAt <= now) continue;
    if (existingTimestamps.has(notifyAt)) continue;

    const cancelFn = scheduleAt(notifyAt, async () => {
      try {
        let listaActual = listasCache.get(lista.id) || lista;
        if (navigator.onLine && canUseFirestore()) {
          try {
            const d = await getDoc(doc(db, "listas", lista.id));
            if (d.exists()) listaActual = { id: d.id, ...d.data() };
          } catch(e){ /* fallback a cache */ }
        }
        if (!listaActual) return;
        if (!esPendientePorFechaOnly(listaActual)) { cancelScheduledNotificationsForList(lista.id); actualizarNotificaciones(); return; }

        const dias = calcularDiasRestantes(parseFechaFromString(listaActual.fecha));
        const title = `Lista: ${listaActual.lugar || "Sin lugar"} vence en ${dias} día(s)`;
        const body = `Fecha: ${formatearFecha(listaActual.fecha)} — Abre la app para ver o marcar como hecha.`;

        sendBrowserNotification(title, body, { listaId: listaActual.id });
        actualizarNotificaciones();
      } catch(e){ console.error("Error timeout notificación (in-app):", e); }
    });

    cancelsForList.push(cancelFn);
    map[lista.id].push(notifyAt);
    existingTimestamps.add(notifyAt);
  }

  map[lista.id] = Array.from(new Set(map[lista.id])).filter(ts => ts > Date.now()).sort((a,b)=>a-b);
  scheduledTimeouts.set(lista.id, cancelsForList);
  saveScheduledMap(map);
}

function rebuildScheduledTimeoutsFromStorage() {
  const map = loadScheduledMap();
  const now = Date.now();

  Object.entries(map).forEach(([listaId, timestamps]) => {
    timestamps = Array.isArray(timestamps) ? timestamps : [];
    const futureTs = timestamps.filter(ts => ts > now);
    if (futureTs.length === 0) {
      delete map[listaId]; // corrección defensiva: limpiar si no hay futuros
      saveScheduledMap(map);
      return;
    }

    // cancela timers previos si hubiera
    const prevCancels = scheduledTimeouts.get(listaId) || [];
    prevCancels.forEach(fn => { try { fn(); } catch {} });

    const cancelsForList = [];

    futureTs.forEach(ts => {
      const cancelFn = scheduleAt(ts, async () => {
        try {
          let listaActual = listasCache.get(listaId) || null;
          if (navigator.onLine && canUseFirestore()) {
            try {
              const d = await getDoc(doc(db, "listas", listaId));
              if (d.exists()) listaActual = { id: d.id, ...d.data() };
            } catch(e){ /* ignore */ }
          }
          if (listaActual && esPendientePorFechaOnly(listaActual)) {
            const title = `Lista: ${listaActual.lugar || "Sin lugar"} vence pronto`;
            const body = `Fecha: ${formatearFecha(listaActual.fecha)} — Abre la app para ver o marcar como hecha.`;
            sendBrowserNotification(title, body, { listaId: listaActual.id });
          }
        } catch(e){ console.error("Error rebuild scheduled (in-app):", e); }
        finally { actualizarNotificaciones(); }
      });

      cancelsForList.push(cancelFn);
    });

    scheduledTimeouts.set(listaId, cancelsForList);
    saveScheduledMap(map); // guardamos el mapa (ya limpio si aplicó)
  });
}

/* ======= LÓGICA: Determinar si es pendiente por fecha ======= */
function esPendientePorFechaOnly(lista) {
  if (!lista || !lista.fecha) return false;
  if (lista.completada) return false;
  if (lista._notificacionDescartada) return false;
  const f = parseFechaFromString(lista.fecha);
  if (!f || isNaN(f)) return false;
  const hoy = startOfDay(new Date());
  const limite = addDays(hoy, MAX_NOTIFY_WINDOW_DAYS);
  const listaDay = startOfDay(f);
  return listaDay.getTime() >= hoy.getTime() && listaDay.getTime() <= limite.getTime();
}

function esNotificacionRelevante(lista) {
  if (!lista || !lista.fecha) return false;
  if (lista.completada) return false;
  if (lista._notificacionDescartada) return false;

  const f = parseFechaFromString(lista.fecha);
  if (!f || isNaN(f)) return false;

  const hoy = startOfDay(new Date());
  const diaLista = startOfDay(f);
  const limiteFuturo = addDays(hoy, MAX_NOTIFY_WINDOW_DAYS);

  if (lista.pagoMensual) {
    return diaLista.getTime() >= hoy.getTime() && diaLista.getTime() <= limiteFuturo.getTime();
  } else {
    const limitePasado = addDays(hoy, -MAX_PAST_NOTIFY_DAYS);
    const dentroVentana = diaLista.getTime() >= limitePasado.getTime() && diaLista.getTime() <= limiteFuturo.getTime();
    if (!dentroVentana) return false;

    // 🔒 Regla anti-retroactivas:
    if (diaLista.getTime() < hoy.getTime()) {
      const c1 = parseFechaFromString(lista.createdAt);
      const c2 = parseFechaFromString(lista.createdAtClient);
      const created = c1 || c2 || null;

      // Si no tenemos fecha de creación fiable, por defecto NO mostramos atrasadas recién creadas
      if (!created) return false;

      // Si se creó DESPUÉS del vencimiento, no mostrar
      if (startOfDay(created).getTime() > diaLista.getTime()) return false;
    }
    return true;
  }
}

/* ======= MONTHLY HELPERS (usar cache) ======= */
async function advanceMonthlyIfPastForAll() {
  if (!navigator.onLine || !canUseFirestore() || typeof writeBatch !== 'function') return;
  if (isBulkUpdating) return;
  isBulkUpdating = true;
  try {
    const batch = writeBatch(db);
    let pending = 0;
    for (const lista of Array.from(listasCache.values())) {
      if (!lista || !lista.pagoMensual) continue;
      let f = parseFechaFromString(lista.fecha);
      const hoy = startOfDay(new Date());
      if (!f) continue;
      let advanced = false;
      while (startOfDay(f).getTime() < hoy.getTime()) {
        f = addMonthsKeepDay(f, 1);
        advanced = true;
      }
      if (advanced) {
        const nuevaStr = formatDateToInput(f);
        const refDoc = doc(db, 'listas', lista.id);
        batch.update(refDoc, { fecha: nuevaStr, _notificacionDescartada: false, estado: 'pendiente', completada: false });
        // Actualizar cache local para evitar reescrituras innecesarias
        listasCache.set(lista.id, { ...lista, fecha: nuevaStr, _notificacionDescartada: false, estado: 'pendiente', completada: false });
        pending++;
      }
    }
    if (pending > 0) {
      bumpSyncLock();
      await batch.commit();
      incrClientWriteCounter(pending);
    }
  } catch (e) {
    console.error('advanceMonthlyIfPastForAll error (batch):', e);
  } finally {
    isBulkUpdating = false;
  }
}

async function advanceMonthlyList(lista) {
  try {
    const f = parseFechaFromString(lista.fecha);
    if (!f) return;
    const nueva = addMonthsKeepDay(f, 1);
    const nuevaStr = formatDateToInput(nueva);

    // usa safeUpdateDoc para evitar escrituras innecesarias
    const updated = await safeUpdateDoc(lista.id, { fecha: nuevaStr, _notificacionDescartada: false, estado: 'pendiente', completada: false });
    if (!updated) {
      // nada que actualizar
      return;
    }

    cancelScheduledNotificationsForList(lista.id);

    // refrescar cache/agenda localmente
    listasCache.set(lista.id, { ...lista, fecha: nuevaStr, _notificacionDescartada: false, estado: 'pendiente', completada: false });
    await schedulePersistCacheToIndexedDB().catch(()=>{});
    await scheduleNotificationsForList(listasCache.get(lista.id));

    mostrarMensaje(`🔁 Pago mensual actualizado a ${formatearFecha(nuevaStr)}`, "success");
  } catch(e){ console.error('advanceMonthlyList error:', e); }
}

/* ======= RENDER: Notificaciones y lista (usando cache) ======= */
// Wrapper para mantener compatibilidad con llamadas anteriores
function renderBadge(count) {
  // si tienes renderMenuBadge definida, úsala
  if (typeof renderMenuBadge === 'function') {
    renderMenuBadge(count, 'notifs');
    return;
  }

  // fallback: comportamiento antiguo (buscar botón con fa-bell)
  const navButtons = document.querySelectorAll("header nav button");
  let bellBtn = null;
  navButtons.forEach(b => { if (b.innerHTML.includes("fa-bell")) bellBtn = b; });
  if (!bellBtn) return;
  const existing = bellBtn.querySelector(".badge"); if (existing) existing.remove();
  if (count > 0) {
    const span = document.createElement("span");
    span.className = "badge";
    span.textContent = count > 99 ? "99+" : String(count);
    span.style.cssText = "background:#e53e3e;color:#fff;padding:2px 6px;border-radius:999px;margin-left:8px;font-size:0.8em;";
    bellBtn.appendChild(span);
  }
}

function calcularDiasRestantes(fecha) {
  if (!fecha) return Infinity;
  const hoy = startOfDay(new Date());
  const f = startOfDay(fecha);
  const diffMs = f.getTime() - hoy.getTime();
  return Math.round(diffMs / (1000*60*60*24));
}

function colorForDias(dias) {
  if (dias < 0)  return { border: "#9ca3af", bg: "#f3f4f6" }; // gris para caducadas
  if (dias <= 3) return { border: "#e53e3e", bg: "#fff5f5" }; // rojo urgente
  if (dias <= 10) return { border: "#f59e0b", bg: "#fff7ed" }; // ámbar
  return { border: "#10b981", bg: "#f0fdf4" };                 // verde
}

/* ------------------ HELPERS FECHAS ADICIONALES ------------------ */
function startOfMonth(d) {
  const dt = new Date(d.getFullYear(), d.getMonth(), 1);
  return startOfDay(dt);
}
function endOfMonth(d) {
  // último día del mes a las 00:00
  const dt = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return startOfDay(dt);
}

function updateListCountDisplay(filteredTotal, totalStored) {
  const contenedorPadre = document.getElementById("verListas");
  if (!contenedorPadre) return;
  let cont = document.getElementById("contadorListasTotales");
  if (!cont) {
    cont = document.createElement("div");
    cont.id = "contadorListasTotales";
    cont.style.marginBottom = "8px";
    cont.style.fontWeight = "700";
    cont.style.color = "#374151";
    const ul = document.getElementById("todasLasListas");
    if (ul) contenedorPadre.insertBefore(cont, ul);
    else contenedorPadre.prepend(cont);
  }
  cont.innerHTML = `Mostrando <strong>${filteredTotal}</strong> de <strong>${totalStored}</strong> listas guardadas.`;
}

function updateEventsCountDisplay(filteredTotal, totalStored) {
  const contenedor = document.getElementById("eventos");
  if (!contenedor) return;

  let cont = document.getElementById("contadorEventos");
  if (!cont) {
    cont = document.createElement("div");
    cont.id = "contadorEventos";
    cont.style.margin = "6px 0";
    cont.style.fontWeight = "700";
    cont.style.color = "#374151";
    // insertar justo antes de la UL de eventos
    const ul = document.getElementById("listaEventos");
    if (ul) contenedor.insertBefore(cont, ul);
    else contenedor.appendChild(cont);
  }
  cont.innerHTML = `Mostrando <strong>${filteredTotal}</strong> de <strong>${totalStored}</strong> eventos.`;
}

/* ================= FILTRO Y CÁLCULO: Notificaciones hasta una fecha ================= */

// key localStorage para persistir el filtro
const NOTIFS_FILTER_KEY = 'notifsFilterEndDate';

// Obtiene la fecha final del filtro (Date) si está definida, o null
function getNotifsFilterEndDate() {
  const v = localStorage.getItem(NOTIFS_FILTER_KEY);
  if (!v) return null;
  const d = new Date(v + "T00:00:00");
  if (isNaN(d)) return null;
  return startOfDay(d);
}

// Guarda (o limpia) el filtro
function setNotifsFilterEndDate(dateStrOrNull) {
  if (!dateStrOrNull) {
    localStorage.removeItem(NOTIFS_FILTER_KEY);
  } else {
    localStorage.setItem(NOTIFS_FILTER_KEY, dateStrOrNull);
  }
}

/**
 * computeTotalsUntil(endDate):
 *  - suma todas las listas (no completadas, no descartadas) cuya fecha esté entre hoy y endDate inclusive.
 *  - devuelve objeto { totalAll, totalMensual, items }
 */
function computeTotalsUntil(endDate) {
  const hoy = startOfDay(new Date());
  const end = startOfDay(endDate);
  let totalAll = 0;
  let totalMensual = 0;
  const items = [];

  for (const l of Array.from(listasCache.values())) {
    try {
      if (!l || !l.fecha) continue;
      if (l.completada) continue;
      if (l._notificacionDescartada) continue;

      const f = parseFechaFromString(l.fecha);
      if (!f || isNaN(f)) continue;
      const fd = startOfDay(f);
      if (fd.getTime() >= hoy.getTime() && fd.getTime() <= end.getTime()) {
        const listaTotal = Array.isArray(l.productos) ? l.productos.reduce((s,p)=> s + (Number(p.precio)||0), 0) : 0;
        totalAll += listaTotal;
        if (l.pagoMensual) totalMensual += listaTotal;
        items.push({ id: l.id, fecha: fd, lugar: l.lugar || '', total: listaTotal, pagoMensual: !!l.pagoMensual });
      }
    } catch(e){ console.error("computeTotalsUntil item error:", e); }
  }

  totalAll = Math.round(totalAll * 100) / 100;
  totalMensual = Math.round(totalMensual * 100) / 100;
  // ordenar items por fecha asc
  items.sort((a,b)=> a.fecha - b.fecha);
  return { totalAll, totalMensual, items };
}

/**
 * updateNotifsSummaryWithFilter(endDateOrNull)
 *   - si endDateOrNull === null -> oculta o muestra resumen por defecto (puedes mostrar resumen por mes si lo prefieres)
 *   - si date dado: calcula totales desde hoy hasta esa fecha y renderiza resumen + botón detalle
 */
function ensureNotifsSummaryContainer() {
  let container = document.getElementById("notifsSummaryContainer");
  const parent = document.getElementById("notificaciones");
  if (!parent) return null;
  if (!container) {
    container = document.createElement("div");
    container.id = "notifsSummaryContainer";
    container.style.marginBottom = "10px";
    parent.insertBefore(container, document.getElementById("listaNotificaciones"));
  }
  return container;
}

function updateNotifsSummaryWithFilter(endDateOrNull) {
  const container = ensureNotifsSummaryContainer();
  if (!container) return;
  container.innerHTML = "";

  if (!endDateOrNull) {
    // Si no hay filtro, no mostramos resumen (quitar cualquier contenido previo)
    return;
  }

  const { totalAll, totalMensual, items } = computeTotalsUntil(endDateOrNull);
  const startStr = formatearFecha(startOfDay(new Date()));
  const endStr = formatearFecha(endDateOrNull);

  const div = document.createElement("div");
  div.style.padding = "10px";
  div.style.border = "1px solid #e6e9ef";
  div.style.borderRadius = "8px";
  div.style.background = "#fff";
  div.style.display = "flex";
  div.style.justifyContent = "space-between";
  div.style.alignItems = "center";
  div.style.gap = "12px";

  div.innerHTML = `
    <div style="font-weight:700; color:#111;">
      <div>Periodo: <small style="font-weight:600; color:#444;">${startStr} — ${endStr}</small></div>
      <div style="margin-top:6px;">Total estimado a pagar (período): <strong>$${totalAll.toFixed(2)}</strong></div>
      <div style="font-size:0.9em; color:#374151; margin-top:4px;">Pagos mensuales incluidos: <strong>$${totalMensual.toFixed(2)}</strong></div>
    </div>
    <div style="text-align:right;">
      <button id="btnDetallePagosFiltro" style="padding:6px 10px; border-radius:8px; border:1px solid #e6e9ef; background:#f8fafc; cursor:pointer; font-weight:700;">Ver listado (${items.length})</button>
    </div>
  `;
  container.appendChild(div);

  const btnDetalle = document.getElementById("btnDetallePagosFiltro");
  if (btnDetalle) {
    btnDetalle.onclick = () => {
      if (!items || items.length === 0) return mostrarMensaje("No hay pagos en el período seleccionado.", "info");
      const lines = items.map(it => `${formatearFecha(it.fecha)} — ${escapeHtml(it.lugar)} — $${it.total.toFixed(2)}${it.pagoMensual ? ' (mensual)' : ''}`);
      alert(`Pagos entre ${startStr} y ${endStr}:\n\n${lines.join('\n')}`);
    };
  }
}

/* ========== Integración con UI de filtro ========== */
function setupNotifsFilterUI() {
  const input = document.getElementById("notifsFilterDate");
  const btnApply = document.getElementById("btnApplyNotifsFilter");
  const btnClear = document.getElementById("btnClearNotifsFilter");

  if (!input || !btnApply || !btnClear) return;

  // inicializar input con valor guardado o vacío (NO poner heurístico por defecto aquí)
  const saved = getNotifsFilterEndDate();
  if (saved) {
    input.value = formatDateToInput(saved);
  } else {
    input.value = ""; // dejar vacío para que el usuario elija
  }

  btnApply.addEventListener('click', (e) => {
    e.preventDefault();
    const val = input.value;
    if (!val) {
      mostrarMensaje("Selecciona una fecha válida para aplicar el filtro.", "error");
      return;
    }
    const chosen = new Date(val + "T00:00:00");
    if (isNaN(chosen)) {
      mostrarMensaje("Fecha inválida.", "error");
      return;
    }
    const today = startOfDay(new Date());
    if (startOfDay(chosen).getTime() < today.getTime()) {
      mostrarMensaje("La fecha de filtro debe ser hoy o una fecha futura.", "error");
      return;
    }

    setNotifsFilterEndDate(val);
    applyNotifsFilterAndRender();
    mostrarMensaje("Filtro aplicado.", "success");
  });

  btnClear.addEventListener('click', (e) => {
    e.preventDefault();
    setNotifsFilterEndDate(null);
    input.value = "";
    applyNotifsFilterAndRender();
    mostrarMensaje("Filtro limpiado.", "info");
  });
}

// Esta función aplica el filtro en memoria y manda a renderizar lista + summary
function applyNotifsFilterAndRender() {
  const endDate = getNotifsFilterEndDate(); // Date | null
  let pendientes = Array.from(listasCache.values()).filter(l => esNotificacionRelevante(l) && !l.isEvento);

  if (endDate) {
    pendientes = pendientes.filter(l => {
      const f = parseFechaFromString(l.fecha);
      if (!f) return false;
      return startOfDay(f).getTime() <= startOfDay(endDate).getTime();
    });
    renderListaNotificaciones(pendientes);
    updateNotifsSummaryWithFilter(endDate);
  } else {
    const pendientesDefault = Array.from(listasCache.values()).filter(l => esNotificacionRelevante(l) && !l.isEvento);
    notificacionesMostradasCount = NOTIFICATIONS_PAGE_INCREMENT;
    renderListaNotificaciones(pendientesDefault);
    updateNotifsSummaryWithFilter(null);
  }  
}

// Llamar setupNotifsFilterUI() desde DOMContentLoaded (ya tienes la rutina init): 

// --------- Paginación para la lista de notificaciones (mostrar 5 en vez de todas) ----------
let notificacionesMostradasCount = 5; // cuántas notificaciones mostrar inicialmente
const NOTIFICATIONS_PAGE_INCREMENT = 5;

function cargarMasNotificaciones() {
  notificacionesMostradasCount += NOTIFICATIONS_PAGE_INCREMENT;
  const endDate = getNotifsFilterEndDate();
  let pendientes = Array.from(listasCache.values())
    .filter(l => esNotificacionRelevante(l) && !l.isEvento);

  if (endDate) {
    const end = startOfDay(endDate);
    pendientes = pendientes.filter(l => {
      const f = parseFechaFromString(l.fecha);
      return f && startOfDay(f).getTime() <= end.getTime();
    });
  }
  renderListaNotificaciones(pendientes);
}

function mostrarMenosNotificaciones() {
  notificacionesMostradasCount = NOTIFICATIONS_PAGE_INCREMENT;
  const endDate = getNotifsFilterEndDate();
  let pendientes = Array.from(listasCache.values())
    .filter(l => esNotificacionRelevante(l) && !l.isEvento);

  if (endDate) {
    const end = startOfDay(endDate);
    pendientes = pendientes.filter(l => {
      const f = parseFechaFromString(l.fecha);
      return f && startOfDay(f).getTime() <= end.getTime();
    });
  }
  renderListaNotificaciones(pendientes);
}
window.cargarMasNotificaciones = cargarMasNotificaciones;
window.mostrarMenosNotificaciones = mostrarMenosNotificaciones;

// Reemplaza la función renderListaNotificaciones por esta versión paginada
function renderListaNotificaciones(pendientes) {
  const ul = document.getElementById("listaNotificaciones");
  if (!ul) return;
  ul.innerHTML = "";

  if (!pendientes || pendientes.length === 0) {
    const li = document.createElement("li");
    li.textContent = "No hay notificaciones por fecha.";
    ul.appendChild(li);
    renderMenuBadge(0, 'notifs');
    return;
  }

  // orden y conteo total
  pendientes.sort((a,b)=> parseFechaFromString(a.fecha) - parseFechaFromString(b.fecha));
  const totalCount = pendientes.length;

  // slice para paginación
  const mostradas = pendientes.slice(0, notificacionesMostradasCount);

  // Badge debe reflejar el total pendiente (no la cantidad mostrada)
  renderMenuBadge(totalCount, 'notifs');

  // Renderizar solo las que toca mostrar
  mostradas.forEach(lista => {
    const li = document.createElement("li");
    li.className = "notificacion-item";
    li.dataset.id = lista.id;

    const fecha = parseFechaFromString(lista.fecha);
    const dias = calcularDiasRestantes(fecha);
    const estadoTexto = dias < 0 ? `Caducó hace ${Math.abs(dias)} día(s)` :
                      dias === 0 ? "Vence hoy" :
                      `Vence en ${dias} día(s)`;
    const total = Array.isArray(lista.productos) ? lista.productos.reduce((s,p)=>s+(p.precio||0),0).toFixed(2) : "0.00";

    const productosHTML = (Array.isArray(lista.productos) ? lista.productos : []).map(p => {
      const iconoP = p.precio === 0 ? `<i class="fa-solid fa-hourglass-half" title="Precio 0" style="color: #f59e0b;"></i>` : "";
      return `<li>${escapeHtml(p.nombre)} ${iconoP} — $${(p.precio||0).toFixed(2)}${p.descripcion ? ` — ${escapeHtml(p.descripcion)}` : ""}</li>`;
    }).join("");

    const colors = colorForDias(dias);
    const pagoMensualBadge = lista.pagoMensual ? ' <span style="background:#3b82f6;color:#fff;padding:2px 6px;border-radius:6px;margin-left:8px;font-size:0.8em;">📆 PAGO MENSUAL</span>' : '';

     // === Acciones: mismos estilos que en "Ver listas" y "Eventos" (2x2) ===
     const calendarBtnHTML =
     `<a class="btn btn--primary btn-google-calendar"
         href="${crearGoogleCalendarLink(lista, { allDay: false, hour: NOTIFY_HOUR || 9, durationMinutes: 60 })}"
         target="_blank" rel="noopener noreferrer">
         <i class="fa-solid fa-calendar-plus" aria-hidden="true"></i> Añadir a Google Calendar
      </a>`;

// 👇 REEMPLAZAMOS EL .ICS POR EL DE WHATSAPP 👇
   const whatsAppBtnHTML = 
     `<button type="button" class="btn btn--success" onclick="compartirPorWhatsApp('${lista.id}')" style="background:#25D366; color:#fff; border-color:#25D366;">
        <i class="fab fa-whatsapp"></i> Enviar
      </button>`;

   const btnHechoHTML =
     `<button class="btn btn--ghost accion-marcar" data-id="${lista.id}">
        <i class="fa-solid fa-check" aria-hidden="true"></i> Hecho
      </button>`;

   const btnDescartarHTML =
     `<button class="btn btn--danger accion-descartar" data-id="${lista.id}">
        <i class="fa-solid fa-ban" aria-hidden="true"></i> Descartar
      </button>`;

    const resumenHTML = `
      <div class="lista-resumen" style="border-left:6px solid ${colors.border}; padding-left:8px; background:${colors.bg}; border-radius:4px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            📅 <strong>${formatearFecha(lista.fecha)}</strong> — 🏪 <em>${escapeHtml(lista.lugar)}</em> — 💰 $${total}${pagoMensualBadge}
            <div class="texto-estado" style="font-size:0.9em; color:#333; margin-top:4px;">${estadoTexto}</div>
          </div>
        </div>
      </div>
    `;

    const detalleProductosHTML = `
      <div class="detalle-productos oculto" id="detalle-productos-${lista.id}" style="margin-top:8px; padding:8px; border-radius:6px; border:1px solid #eee; background:#fff;">
        <strong>Productos:</strong>
        <ul class="productos-detalle" style="margin-top:6px;">${productosHTML || "<li>(sin productos)</li>"}</ul>
      </div>
    `;

// 👇 Y AQUÍ QUITAMOS EL ICS Y PONEMOS WHATSAPP 👇
    const accionesHTML = `
    <div class="acciones-lista acciones-grid-2x2 oculto" id="acciones-${lista.id}" style="margin-top:8px;">
      ${calendarBtnHTML}
      ${whatsAppBtnHTML}
      <button class="btn btn--success accion-marcar" data-id="${lista.id}">
        <i class="fa-solid fa-check" aria-hidden="true"></i> Marcar como hecha
      </button>
      <button class="btn btn--danger accion-descartar" data-id="${lista.id}">
        <i class="fa-solid fa-ban" aria-hidden="true"></i> Descartar
      </button>
    </div>
  `;
    li.innerHTML = resumenHTML + detalleProductosHTML + accionesHTML;

    li.addEventListener("click", (e) => {
      if (e.target && (e.target.matches("button") || e.target.closest("button") || e.target.closest("a.btn-google-calendar"))) return;
      const panelAcc = li.querySelector(`#acciones-${lista.id}`);
      const panelProd = li.querySelector(`#detalle-productos-${lista.id}`);
      if (panelProd) {
        const abierto = panelProd.classList.toggle("oculto");
        panelProd.setAttribute('aria-hidden', abierto ? 'true' : 'false');
      }
      if (panelAcc) {
        const abierto = panelAcc.classList.toggle("oculto");
        panelAcc.setAttribute('aria-hidden', abierto ? 'true' : 'false');
      }     
    });

    // eventos para marcar/descartar
    li.querySelectorAll(".accion-marcar").forEach(btn => btn.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      const id = btn.dataset.id;
      const ok = confirm("¿Confirmas que deseas marcar esta lista como hecha? Esta acción marcará la lista como completada.");
      if (!ok) return;
      await marcarListaComoHecha(id);
    }));
    li.querySelectorAll(".accion-descartar").forEach(btn => btn.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      const id = btn.dataset.id;
      const ok = confirm("¿Deseas descartar esta notificación? Podrás volver a mostrarla editando la lista.");
      if (!ok) return;
      await descartarNotificacion(id);
    }));

    ul.appendChild(li);
  });

  // Footer con controles de paginación
  const footerLi = document.createElement("li");
  footerLi.className = "notifs-footer";
  footerLi.style.paddingTop = "8px";
  footerLi.style.borderTop = "1px solid #eee";
  footerLi.style.marginTop = "8px";
  footerLi.style.display = "flex";
  footerLi.style.justifyContent = "center";
  footerLi.style.gap = "8px";

  if (totalCount > mostradas.length) {
    const btnMas = document.createElement("button");
    btnMas.textContent = `Cargar ${NOTIFICATIONS_PAGE_INCREMENT} más (${mostradas.length}/${totalCount})`;
    btnMas.onclick = (e) => { e.preventDefault(); cargarMasNotificaciones(); };
    footerLi.appendChild(btnMas);
  }

  if (mostradas.length > NOTIFICATIONS_PAGE_INCREMENT) {
    const btnMenos = document.createElement("button");
    btnMenos.textContent = "Mostrar menos";
    btnMenos.onclick = (e) => { e.preventDefault(); mostrarMenosNotificaciones(); };
    footerLi.appendChild(btnMenos);
  }

  if (footerLi.childElementCount > 0) ul.appendChild(footerLi);
}

/* ======= ACTUALIZAR NOTIFICACIONES (usa cache) ======= */
async function actualizarNotificaciones(listasExternas = null) {
  try {
    if (navigator.onLine && canUseFirestore() && isLeaderTab) await advanceMonthlyIfPastForAll();

    let listas = [];
    if (Array.isArray(listasExternas)) listas = listasExternas;
    else {
      listas = Array.from(listasCache.values());
      if (!listas || listas.length === 0) listas = [];
    }

    // --- marcar expiradas / caducadas (coleccionar cambios primero) ---
    const hoy = startOfDay(new Date());
    const pendingEstadoUpdates = []; // { id, estado }

    for (const l of listas) {
      try {
        const f = parseFechaFromString(l.fecha);
        if (!l.pagoMensual && f && startOfDay(f).getTime() < hoy.getTime()) {
          const nuevoEstado = l.isEvento ? 'caducado' : 'expirada';
          if (String(l.estado || '') !== nuevoEstado) {
            pendingEstadoUpdates.push({ id: l.id, estado: nuevoEstado });
            listasCache.set(l.id, { ...l, estado: nuevoEstado }); // refresco local inmediato
          }
        }
      } catch(e){ console.error("Error procesando expiradas:", e); }
    }

    if (pendingEstadoUpdates.length > 0 && navigator.onLine && canUseFirestore() && typeof writeBatch === 'function') {
      try {
        const BATCH_SIZE = 50;
        for (let i = 0; i < pendingEstadoUpdates.length; i += BATCH_SIZE) {
          const chunk = pendingEstadoUpdates.slice(i, i + BATCH_SIZE);
          const batch = writeBatch(db);
          chunk.forEach(u => batch.update(doc(db, 'listas', u.id), { estado: u.estado }));
          bumpSyncLock();
          await batch.commit();
          incrClientWriteCounter(chunk.length);
        }
        await schedulePersistCacheToIndexedDB().catch(()=>{});
      } catch (e) {
        console.error("Error aplicando estados en batch:", e);
      }
    } else if (pendingEstadoUpdates.length > 0) {
      await schedulePersistCacheToIndexedDB().catch(()=>{});
    }

    const pendientesPorFecha = listas.filter(l => esPendientePorFechaOnly(l) && !l.isEvento);
    const eventosPorFecha   = listas.filter(l => esPendientePorFechaOnly(l) &&  l.isEvento);

    renderEvents(listas.filter(l => l.isEvento));

    // Notifs: se delega a applyNotifsFilterAndRender -> renderListaNotificaciones (ahí se actualiza el badge)
    applyNotifsFilterAndRender();

    if (isLeaderTab) {
      pendientesPorFecha.forEach(lista => scheduleNotificationsForList(lista));
      eventosPorFecha.forEach(lista => scheduleNotificationsForList(lista));
    }    

    // ⛔️ Importante: NO tocar aquí el badge de notifs (evita parpadeo)
    // renderMenuBadge(pendientesPorFecha.length, 'notifs');  // <-- eliminado

    renderInicio();

  } catch(e) { console.error("Error actualizarNotificaciones:", e); }
}

/* -------------------- PAGINACIÓN Y RENDER PARA EVENTOS -------------------- */
let eventosMostradosCount = 5;
const EVENTS_PAGE_INCREMENT = 5;

function cargarMasEventos() {
  eventosMostradosCount += EVENTS_PAGE_INCREMENT;
  const eventos = Array.from(listasCache.values()).filter(l => esPendientePorFechaOnly(l) && l.isEvento);
  renderEvents(eventos);
}
function mostrarMenosEventos() {
  eventosMostradosCount = EVENTS_PAGE_INCREMENT;
  const eventos = Array.from(listasCache.values()).filter(l => esPendientePorFechaOnly(l) && l.isEvento);
  renderEvents(eventos);
}
window.cargarMasEventos = cargarMasEventos;
window.mostrarMenosEventos = mostrarMenosEventos;

/**
 * renderBadge actualizado: ahora soporta 'notifs' y 'events' (usa id de botones si existen)
 */
function renderMenuBadge(count, type = 'notifs') {
  // type 'notifs' => btnNotificaciones, 'events' => btnEventos
  const btnId = type === 'events' ? 'btnEventos' : 'btnNotificaciones';
  const btn = document.getElementById(btnId);
  if (!btn) return;
  const existing = btn.querySelector(".badge");
  if (existing) existing.remove();
  if (count > 0) {
    const span = document.createElement("span");
    span.className = "badge";
    span.textContent = count > 99 ? "99+" : String(count);
    span.style.cssText = "background:#e53e3e;color:#fff;padding:2px 6px;border-radius:999px;margin-left:8px;font-size:0.8em;";
    btn.appendChild(span);
  }
}

// Nueva paleta lila para eventos (devuelve clase CSS)
function classForDiasEventos(dias) {
  // días negativos -> caducado (usar lila oscuro/desaturado)
  if (dias < 0) return 'event-lila-rojo';
  if (dias <= 5) return 'event-lila-rojo';
  if (dias <= 30) return 'event-lila-ambar';
  return 'event-lila-verde';
}

/**
 * renderEvents(eventos)
 * Renderiza eventos en #listaEventos con paginación, colores según fecha y acciones.
 */
// helper: devuelve clase según días (para escala lila)
function renderEvents(eventos) {
  const ul = document.getElementById("listaEventos");
  if (!ul) return;
  ul.innerHTML = "";
  // Ocultar eventos ya hechos o descartados
  eventos = (Array.isArray(eventos) ? eventos : [])
  .filter(l => !l.completada && !l._notificacionDescartada);

  // === Filtros por lugar y rango (si ya los tienes) ===
  const filtroLugar = normalizarTexto(document.getElementById("filtroLugarEventos")?.value || "");
  const desdeStr = document.getElementById("fechaDesdeEventos")?.value || "";
  const hastaStr = document.getElementById("fechaHastaEventos")?.value || "";

  let desde = desdeStr ? parseFechaFromString(desdeStr) : null;
  let hasta = hastaStr ? parseFechaFromString(hastaStr) : null;
  if (desde && hasta && desde > hasta) { const tmp = desde; desde = hasta; hasta = tmp; }

  if (filtroLugar) {
    eventos = eventos.filter(l => normalizarTexto(l.lugar || "").includes(filtroLugar));
  }
  if (desde || hasta) {
    const fromDay = desde ? startOfDay(desde) : null;
    const toDayExclusive = hasta ? addDays(startOfDay(hasta), 1) : null; // inclusivo
    eventos = eventos.filter(l => {
      const f = parseFechaFromString(l.fecha);
      if (!f) return false;
      if (fromDay && f < fromDay) return false;
      if (toDayExclusive && f >= toDayExclusive) return false;
      return true;
    });
  }

  // === NUEVO: calcular totales y mostrar contador ===
  const totalStored = Array.from(listasCache.values())
  .filter(l => l.isEvento && !l.completada && !l._notificacionDescartada).length;
  const filteredTotal = eventos.length;
  updateEventsCountDisplay(filteredTotal, totalStored);

  if (!eventos || eventos.length === 0) {
    const li = document.createElement("li");
    li.textContent = "No hay eventos que coincidan con el filtro.";
    ul.appendChild(li);
    renderMenuBadge(0, 'events');
    return;
  }

  // ordenar, paginar y renderizar como ya lo haces
  eventos.sort((a,b) => parseFechaFromString(a.fecha) - parseFechaFromString(b.fecha));

  const total = eventos.length;
  const mostradas = eventos.slice(0, eventosMostradosCount);

  // badge del menú debe reflejar total
  renderMenuBadge(totalStored, 'events');

  mostradas.forEach(lista => {
    const li = document.createElement("li");
    li.className = "notificacion-item";
    li.dataset.id = lista.id;

    const fecha = parseFechaFromString(lista.fecha);
    const dias = calcularDiasRestantes(fecha);
    const hoy = startOfDay(new Date());
    if (!lista.pagoMensual && fecha && startOfDay(fecha).getTime() < hoy.getTime()) {
      lista.estado = 'caducado';
    }

    const estadoTexto = lista.estado === 'caducado' ? `Evento caducado` :
                        dias === 0 ? "Vence hoy" :
                        dias < 0 ? `Venció hace ${Math.abs(dias)} día(s)` :
                        `Vence en ${dias} día(s)`;

    const totalPrecio = Array.isArray(lista.productos) ? lista.productos.reduce((s,p)=>s+(p.precio||0),0).toFixed(2) : "0.00";
    const colorsClass = lista.estado === 'caducado' ? 'event-caducado' : classForDiasEventos(dias);

    // crear partes de fecha para la caja (día y mes corto)
    let dayStr = '--', monthStr = '---';
    if (fecha && !isNaN(fecha)) {
      dayStr = String(fecha.getDate());
      monthStr = fecha.toLocaleString('es-ES', { month: 'short' }).replace(/\./g,'');
    }

    // === Toolbar (mismos botones que en "Ver listas", adaptados a eventos) ===
    const calendarBtnHTML =
    `<a class="btn btn--primary btn-google-calendar"
        href="${crearGoogleCalendarLink(lista, { allDay: false, hour: NOTIFY_HOUR || 9, durationMinutes: 60 })}"
        target="_blank" rel="noopener noreferrer">
        <i class="fa-solid fa-calendar-plus" aria-hidden="true"></i> Añadir a Google Calendar
     </a>`;
  
// 👇 REEMPLAZAMOS EL .ICS POR WHATSAPP 👇
  const whatsAppBtnHTML = 
     `<button type="button" class="btn btn--success" onclick="compartirPorWhatsApp('${lista.id}')" style="background:#25D366; color:#fff; border-color:#25D366;">
        <i class="fab fa-whatsapp"></i> Enviar
      </button>`;
  
  /* 👇 cambia a botón verde */
  const btnHechoHTML =
    `<button class="btn btn--success accion-marcar" data-id="${lista.id}">
       <i class="fa-solid fa-check" aria-hidden="true"></i> Hecho
     </button>`;
  
  const btnDescartarHTML =
    `<button class="btn btn--danger accion-descartar" data-id="${lista.id}">
       <i class="fa-solid fa-ban" aria-hidden="true"></i> Descartar
     </button>`;
  
  /* 👇 envuelve en dos grupos y deja el spacer al centro */
  li.innerHTML = `
  <div class="lista-resumen event-resumen ${colorsClass}" tabindex="0" role="button"
       aria-expanded="false" aria-controls="detalle-productos-${lista.id}">
    <div class="date-box" aria-hidden="true">
      <div class="day">${escapeHtml(dayStr)}</div>
      <div class="month">${escapeHtml(monthStr)}</div>
    </div>
    <div class="event-content">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
        <div class="event-title">🏪 ${escapeHtml(lista.lugar || '')}</div>
        <div style="font-weight:700; color:#2b2b38;">💰 $${totalPrecio}</div>
      </div>
      <div class="event-meta">${escapeHtml(estadoTexto)}</div>
    </div>
  </div>

  <div class="detalle-productos oculto" id="detalle-productos-${lista.id}"
       style="margin-top:8px; padding:10px; border-radius:6px; border:1px solid #eee; background:#fff;">

    <!-- 👇 nueva cuadrícula 2×2 -->
    <div class="acciones-lista acciones-eventos">
      ${calendarBtnHTML}
      ${whatsAppBtnHTML}
      ${btnHechoHTML}
      ${btnDescartarHTML}
    </div>

    <ul class="productos-detalle" style="margin-top:8px;">
      ${(Array.isArray(lista.productos) && lista.productos.length)
        ? lista.productos.map(p => `<li>${escapeHtml(p.nombre)} — $${(p.precio||0).toFixed(2)}${p.descripcion ? ` — ${escapeHtml(p.descripcion)}` : ''}</li>`).join('')
        : '<li>(sin productos)</li>'}
    </ul>
  </div>
`;

    const resumenEl = li.querySelector('.event-resumen');
    const detalleEl = li.querySelector(`#detalle-productos-${lista.id}`);

    const toggleDetalle = (opts = {}) => {
      if (!detalleEl) return;
      let opened;
      if (typeof opts.force === 'boolean') {
        if (opts.force) detalleEl.classList.remove('oculto');
        else detalleEl.classList.add('oculto');
        opened = !detalleEl.classList.contains('oculto');
      } else {
        const toggledClosed = detalleEl.classList.toggle('oculto');
        opened = !toggledClosed;
      }
      if (resumenEl) resumenEl.setAttribute('aria-expanded', String(opened));
    };

    resumenEl.addEventListener('click', (e) => {
      if (e.target.closest('button') || e.target.closest('a')) return;
      toggleDetalle();
    });
    resumenEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        if (e.target.closest('button') || e.target.closest('a')) return;
        e.preventDefault(); toggleDetalle();
      }
    });

    // Listeners existentes siguen funcionando con estas clases:
    li.querySelectorAll(".accion-marcar").forEach(btn => btn.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      const id = btn.dataset.id;
      const ok = confirm("¿Confirmas que deseas marcar este evento como hecho?");
      if (!ok) return;
      await marcarListaComoHecha(id);
    }));
    li.querySelectorAll(".accion-descartar").forEach(btn => btn.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      const id = btn.dataset.id;
      const ok = confirm("¿Deseas descartar este evento? Podrás reactivarlo editando la lista.");
      if (!ok) return;
      await descartarNotificacion(id);
    }));

    ul.appendChild(li);
  });

  // footer paginación
  const footerLi = document.createElement("li");
  footerLi.className = "notifs-footer";
  footerLi.style.paddingTop = "8px";
  footerLi.style.borderTop = "1px solid #eee";
  footerLi.style.marginTop = "8px";
  footerLi.style.display = "flex";
  footerLi.style.justifyContent = "center";
  footerLi.style.gap = "8px";

  if (total > mostradas.length) {
    const btnMas = document.createElement("button");
    btnMas.textContent = `Cargar ${EVENTS_PAGE_INCREMENT} más (${mostradas.length}/${total})`;
    btnMas.onclick = (e) => { e.preventDefault(); cargarMasEventos(); };
    footerLi.appendChild(btnMas);
  }
  if (mostradas.length > EVENTS_PAGE_INCREMENT) {
    const btnMenos = document.createElement("button");
    btnMenos.textContent = "Mostrar menos";
    btnMenos.onclick = (e) => { e.preventDefault(); mostrarMenosEventos(); };
    footerLi.appendChild(btnMenos);
  }
  if (footerLi.childElementCount > 0) ul.appendChild(footerLi);
}

/* ======= ACCIONES: marcar hecha / descartar (usar cache y getDoc fallback) ======= */
async function marcarListaComoHecha(id) {
  try {
    let lista = listasCache.get(id);
    if (!lista && navigator.onLine && canUseFirestore()) {
      try {
        const d = await getDoc(doc(db, "listas", id));
        if (d.exists()) lista = { id: d.id, ...d.data() };
      } catch(err) {
        console.warn("No se pudo obtener lista del servidor:", err);
      }
    }
    if (!lista) return mostrarMensaje('Lista no encontrada', "error");

    if (lista.pagoMensual) {
      if (navigator.onLine && canUseFirestore()) {
        await advanceMonthlyList(lista);
        mostrarMensaje("Pago mensual avanzado en la nube.", "success");
      } else {
        const nuevaFecha = formatDateToInput(addMonthsKeepDay(parseFechaFromString(lista.fecha), 1));
        const todayStr = formatDateToInput(new Date());
        const updates = loadPendingUpdates();
        updates[id] = { fecha: nuevaFecha, _notificacionDescartada: false, estado: 'pendiente', completada: false, ultimoPagoFecha: todayStr, ultimoPagoGuardadoAt: new Date().toISOString() };
        savePendingUpdates(updates);
        listasCache.set(id, { ...lista, fecha: nuevaFecha, _notificacionDescartada: false, estado: 'pendiente', completada: false, ultimoPagoFecha: todayStr, ultimoPagoGuardadoAt: new Date().toISOString() });
        await schedulePersistCacheToIndexedDB();
        cancelScheduledNotificationsForList(id);
        mostrarMensaje("Guardado fuera de línea: pago mensual marcado. Se sincronizará al reconectar.", "offline");
      }
      debouncedActualizarNotificaciones();
      mostrarListasFirebase(true);
      refrescarEventosFiltrados(true);
      return;    
    }

    if (navigator.onLine && canUseFirestore()) {
      // usa safeUpdateDoc para evitar escritura si no hay cambio
      const updated = await safeUpdateDoc(id, { estado: "normal", completada: true });
      if (updated) mostrarMensaje("Lista marcada como hecha (en la nube).", "success");
      else mostrarMensaje("No hubo cambios que guardar.", "info");
      // 🔧 Reflejar inmediato en UI (sin esperar onSnapshot)
      if (updated) {
        const cachedNow = listasCache.get(id) || {};
        listasCache.set(id, { ...cachedNow, estado: "normal", completada: true });
        await schedulePersistCacheToIndexedDB();
      }
    } else {
      const updates = loadPendingUpdates();
      updates[id] = { ...(updates[id]||{}), estado: "normal", completada: true };
      savePendingUpdates(updates);
      listasCache.set(id, { ...lista, estado: "normal", completada: true });
      await schedulePersistCacheToIndexedDB();
      mostrarMensaje("Guardado fuera de línea: lista marcada como hecha. Se sincronizará al reconectar.", "offline");
    }

    cancelScheduledNotificationsForList(id);
    debouncedActualizarNotificaciones();
    mostrarListasFirebase(true);
    refrescarEventosFiltrados(true);
  } catch(e){ mostrarMensaje("Error marcando la lista como hecha", "error"); console.error(e); }
}

async function descartarNotificacion(id) {
  try {
    if (navigator.onLine && canUseFirestore()) {
      const updated = await safeUpdateDoc(id, { _notificacionDescartada: true });
      if (updated) mostrarMensaje("Notificación descartada (en la nube).", "success");
      else mostrarMensaje("No hubo cambios para descartar.", "info");
      // 🔧 Reflejar inmediato en UI (sin esperar onSnapshot)
      if (updated) {
        const cachedNow = listasCache.get(id);
        if (cachedNow) {
          cachedNow._notificacionDescartada = true;
          listasCache.set(id, cachedNow);
          await schedulePersistCacheToIndexedDB();
        }
      }
    } else {
      const updates = loadPendingUpdates();
      updates[id] = { ...(updates[id]||{}), _notificacionDescartada: true };
      savePendingUpdates(updates);
      const cached = listasCache.get(id);
      if (cached) { cached._notificacionDescartada = true; listasCache.set(id, cached); await schedulePersistCacheToIndexedDB(); }
      mostrarMensaje("Guardado fuera de línea: notificación descartada. Se sincronizará al reconectar.", "offline");
    }
    cancelScheduledNotificationsForList(id);
    debouncedActualizarNotificaciones();
    mostrarListasFirebase(true);
    refrescarEventosFiltrados(true);
  } catch(e){ console.error("Error descartar:", e); mostrarMensaje("Error descartando notificación", "error"); }
}

function migrateScheduledMap(tmpId, newId) {
  const map = loadScheduledMap();
  if (map[tmpId]) {
    map[newId] = Array.from(new Set([...(map[newId] || []), ...map[tmpId]]));
    delete map[tmpId];
    saveScheduledMap(map);
  }
  // cancela timers ligados al tmpId y reprograma con el id real
  cancelScheduledNotificationsForList(tmpId);
  const nuevaLista = listasCache.get(newId);
  if (nuevaLista) scheduleNotificationsForList(nuevaLista);
}

/* ======= CRUD: guardar, editar, eliminar listas (usando cache donde tiene sentido) ======= */
async function guardarLista(nuevaLista) {
  try {
    nuevaLista.createdAt = safeServerTimestamp();
    nuevaLista.createdAtClient = new Date().toISOString(); // 👈 nuevo
    if (!('_notificacionDescartada' in nuevaLista)) nuevaLista._notificacionDescartada = false;

    if (navigator.onLine && canUseFirestore()) {
      const ref = await addDoc(collection(db, "listas"), nuevaLista);
      mostrarMensaje("Lista guardada correctamente (en la nube).", "success");
      listasCache.set(ref.id, { id: ref.id, ...nuevaLista });
      await schedulePersistCacheToIndexedDB();
      actualizarNotificaciones();
    } else {
      const clientId = generateClientId();
      const itemWithClient = { ...nuevaLista, clientId };
      const creates = loadPendingCreates();
      creates.push(itemWithClient);
      savePendingCreates(creates);
      const tempId = `tmp_${clientId}`;
      listasCache.set(tempId, { id: tempId, ...nuevaLista, clientId });
      await schedulePersistCacheToIndexedDB();
      mostrarMensaje("Guardado fuera de línea: la lista se creará cuando vuelva la conexión.", "offline");
      actualizarNotificaciones();
    }
  } catch(e){ mostrarMensaje("Error guardando la lista: " + (e.message || e), "error"); console.error(e); }
}

async function eliminarLista(id) {
  const confirmar = confirm("¿Estás seguro de que deseas eliminar esta lista? Esta acción no se puede deshacer.");
  if (!confirmar) return;
  try {
    if (navigator.onLine && canUseFirestore()) {
      await deleteDoc(doc(db, "listas", id));
      mostrarMensaje("Lista eliminada con éxito (en la nube).", "success");
      cancelScheduledNotificationsForList(id);
      listasCache.delete(id);
      await deleteOneFromIndexedDB(id);
      mostrarListasFirebase(true);
      mostrarResultadosConsulta();
      actualizarNotificaciones();
    } else {
      const dels = loadPendingDeletes();
      dels.push(id);
      savePendingDeletes(dels);
      listasCache.delete(id);
      await deleteOneFromIndexedDB(id);
      cancelScheduledNotificationsForList(id);
      mostrarMensaje("Eliminado fuera de línea: la eliminación se aplicará al reconectar.", "offline");
      mostrarListasFirebase(true);
      actualizarNotificaciones();
    }
  } catch(e){ mostrarMensaje("Error eliminando lista: " + e.message, "error"); }
}

async function guardarCambiosLista(idLista, datosLista) {
  if (navigator.onLine && canUseFirestore()) {
    try {
      const docRef = doc(db, "listas", idLista);
      await updateDoc(docRef, datosLista);
      mostrarMensaje("Cambios guardados en la nube.", "success");
      listasCache.set(idLista, { id: idLista, ...datosLista });
      await schedulePersistCacheToIndexedDB();
      actualizarNotificaciones();
    } catch(e){ mostrarMensaje("Error al guardar en Firestore.", "error"); guardarCambiosOffline(idLista, datosLista); }
  } else {
    mostrarMensaje("Guardado fuera de línea: los cambios se guardarán cuando haya conexión.", "offline");
    guardarCambiosOffline(idLista, datosLista);
  }
}
function guardarCambiosOffline(idLista, datosLista) {
  const updates = loadPendingUpdates();
  updates[idLista] = { ...(updates[idLista] || {}), ...datosLista };
  savePendingUpdates(updates);
  const cached = listasCache.get(idLista) || {};
  listasCache.set(idLista, { ...cached, ...datosLista, id: idLista });
  schedulePersistCacheToIndexedDB().catch(()=>{});
}

/* ======= INTERFAZ: mostrarListas, consultas, sugerencias, editar (usar cache) ======= */
let listasMostradasCount = 5;

// Reemplaza COMPLETA tu función por esta versión:
/* ======= INTERFAZ: mostrarListas con diseño flotante y filtros ======= */
function mostrarListasDesdeCache(resetCount = false, soloPendientes = false) {
  try {
    if (resetCount) listasMostradasCount = 5;

    // 1) Obtener valores de filtros
    const filtroLugar = normalizarTexto(document.getElementById("filtroLugarListas")?.value || "");
    const criterioOrden = document.getElementById("ordenarListasPor")?.value || "fechaDesc";

    // 2) Convertir mapa a Array y ORDENAR LISTAS
    let listas = Array.from(listasCache.values());

    listas.sort((a, b) => {
      if (criterioOrden === "alphaAsc" || criterioOrden === "alphaDesc") {
        const lugarA = (a.lugar || "").toLowerCase();
        const lugarB = (b.lugar || "").toLowerCase();
        const comp = lugarA.localeCompare(lugarB);
        return criterioOrden === "alphaAsc" ? comp : -comp;
      } else {
        const ta = parseFechaFromString(a.fecha);
        const tb = parseFechaFromString(b.fecha);
        // "fechaAsc" = antiguas primero, "fechaDesc" = nuevas primero
        if (criterioOrden === "fechaAsc") return (ta ? +ta : 0) - (tb ? +tb : 0);
        else return (tb ? +tb : 0) - (ta ? +ta : 0);
      }
    });

    // 3) Filtro por texto (Lugar)
    if (filtroLugar) {
      listas = listas.filter(l => normalizarTexto(l.lugar || "").includes(filtroLugar));
    }

    // 4) Filtro "solo pendientes"
    if (soloPendientes) {
      listas = listas.filter(l =>
        l.estado === "pendiente" ||
        (Array.isArray(l.productos) && l.productos.some(p => p.precio === 0))
      );
    }

    // 5) Filtro por rango de fechas (CALENDARIO)
    const desdeStr = document.getElementById("fechaDesdeListas")?.value || "";
    const hastaStr = document.getElementById("fechaHastaListas")?.value || "";
    let desde = desdeStr ? parseFechaFromString(desdeStr) : null;
    let hasta = hastaStr ? parseFechaFromString(hastaStr) : null;

    if (desde && hasta && desde > hasta) { const tmp = desde; desde = hasta; hasta = tmp; }

    if (desde || hasta) {
      const fromDay = desde ? startOfDay(desde) : null;
      const toDayExclusive = hasta ? addDays(startOfDay(hasta), 1) : null;
      listas = listas.filter(l => {
        const f = parseFechaFromString(l.fecha);
        if (!f) return false;
        if (fromDay && f < fromDay) return false;
        if (toDayExclusive && f >= toDayExclusive) return false;
        return true;
      });
    }

    // 6) Conteo y Paginación
    const filteredTotal = listas.length;
    const pageItems = listas.slice(0, listasMostradasCount);

    const ul = document.getElementById("todasLasListas");
    if (!ul) return;
    ul.innerHTML = "";

    if (pageItems.length === 0) {
      ul.innerHTML = "<li>No hay listas guardadas que coincidan con el filtro.</li>";
      const btn = document.getElementById("btnCargarMas");
      if (btn) btn.style.display = "none";
      updateListCountDisplay(0, Array.from(listasCache.values()).length);
      actualizarNotificaciones();
      return;
    }

    updateListCountDisplay(filteredTotal, Array.from(listasCache.values()).length);

    pageItems.forEach(lista => {
      // Ordenar productos internos de A-Z
// 👇 NUEVO: Ordenar los productos alfabéticamente conservando el índice original para tacharlos
      const productosConIndex = (lista.productos || []).map((p, i) => ({ ...p, originalIndex: i }));
      const productosOrdenados = productosConIndex.sort((a, b) => {
        const nombreA = (a.nombre || "").toLowerCase();
        const nombreB = (b.nombre || "").toLowerCase();
        return nombreA.localeCompare(nombreB);
      });

      const total = productosOrdenados.reduce((sum, p) => sum + (p.precio || 0), 0).toFixed(2);
      const pendienteFecha = lista.estado === "pendiente";
      const pendienteProducto = productosOrdenados.some(p => p.precio === 0);
      
      // Etiquetas (Badges)
      let badge = "";
      if (lista.isEvento) {
         badge += '<span style="color:#8b5cf6; font-weight:700;">🎉 EVENTO</span> ';
      } else if (pendienteFecha) {
         badge += '<span style="color:#fbc02d; font-weight:700;">🕒 PENDIENTE</span> ';
      }
      if (pendienteProducto) badge += '<span style="color:#f59e0b; font-weight:600; font-size:0.9em;">(Productos sin precio)</span> ';
      if (lista.pagoMensual) badge += '<br><span style="color:#3b82f6; font-weight:600; font-size:0.9em;">📆 MENSUAL</span>';

      // HTML de botones
      const calendarBtnHTML =
        `<a class="btn btn--primary btn-google-calendar"
            href="${crearGoogleCalendarLink(lista, { allDay: false, hour: NOTIFY_HOUR || 9, durationMinutes: 60 })}"
            target="_blank" rel="noopener noreferrer">
            <i class="fa-solid fa-calendar-plus" aria-hidden="true"></i> Calendar
        </a>`;

        // 👇 BOTÓN WHATSAPP NUEVO
      const whatsAppBtnHTML = 
        `<button class="btn btn--success" onclick="compartirPorWhatsApp('${lista.id}')" style="background:#25D366; color:#fff; border-color:#25D366;">
           <i class="fab fa-whatsapp"></i> Enviar
         </button>`;

      // HTML del Resumen (DISEÑO FLOTANTE RECUPERADO)
      // Usamos flexbox con justify-content: space-between para separar Lugar/Fecha del Precio
      const resumenHTML = `
        <div class="lista-item resumen"
             onclick="alternarDetalle(this)"
             tabindex="0" role="button"
             aria-expanded="false"
             onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();alternarDetalle(this);}">
          
          <div style="display:flex; justify-content:space-between; align-items:flex-start; width:100%;">
            <div style="flex:1; padding-right:10px;">
               <div style="font-size:1.1em; font-weight:bold; color:#111827; line-height:1.2;">
                 ${escapeHtml(lista.lugar)}
               </div>
               <div style="color:#6b7280; font-size:0.85em; margin-top:4px;">
                 📅 ${formatearFecha(lista.fecha)}
               </div>
            </div>

            <div style="text-align:right; white-space:nowrap;">
               <div style="font-size:1.1em; font-weight:bold; color:#059669;">
                 $${total}
               </div>
            </div>
          </div>

          <div style="margin-top:6px; font-size:0.85em; line-height:1.4;">
            ${badge}
          </div>
        </div>`;

      // HTML del Detalle (Productos ordenados)
// 👇 HTML del Detalle (Productos ordenados y clickeables para Modo Supermercado)
      const productosHTML = productosOrdenados.map(p => {
        const iconoP = p.precio === 0 ? `<i class="fa-solid fa-hourglass-half" title="Precio 0" style="color: #f59e0b; margin-left: 4px;"></i>` : "";
        const isComprado = p.comprado ? 'producto-comprado' : '';
        const iconCheck = p.comprado 
          ? '<i class="fa-solid fa-circle-check" style="color:#10b981;"></i>' 
          : '<i class="fa-regular fa-circle" style="color:#9ca3af;"></i>';

        return `
          <li class="li-producto ${isComprado}" onclick="toggleProductoComprado('${lista.id}', ${p.originalIndex}, this)">
            <span class="check-icon" style="margin-right: 10px; font-size: 1.2em; line-height: 1;">${iconCheck}</span>
            <span class="prod-text" style="line-height: 1.2;">
              ${escapeHtml(p.nombre)} ${iconoP} — <strong class="precio-txt">$${(p.precio || 0).toFixed(2)}</strong>
              ${p.descripcion ? ` <span style="color:#6b7280; font-size:0.9em;">(${escapeHtml(p.descripcion)})</span>` : ""}
            </span>
          </li>`;
      }).join("");

// 👇 NUEVO: Extraer los correos compartidos (excluyendo el tuyo para no ser redundante)
      const misCorreos = currentUser ? currentUser.email : "";
      const invitados = (lista.accessList || []).filter(email => email !== misCorreos).join(', ');
      
      const textoCompartido = invitados 
        ? `👥 Compartida con: <strong>${escapeHtml(invitados)}</strong>` 
        : `🔒 Lista privada`;

      const detalleHTML = `
        <div class="detalle-lista oculto">
          <div class="acciones-lista"> 
            ${calendarBtnHTML}
            ${whatsAppBtnHTML}
            <button class="btn btn--primary" onclick="compartirListaConEmail('${lista.id}')" style="background:#4f46e5; border-color:#4f46e5; color:#fff;">
              <i class="fa-solid fa-user-plus" aria-hidden="true"></i> Compartir
            </button>
            <button class="btn btn--ghost" onclick="editarLista('${lista.id}')">
              <i class="fa-solid fa-pen-to-square" aria-hidden="true"></i> Editar
            </button>
            <button class="btn btn--danger" onclick="eliminarLista('${lista.id}')">
              <i class="fa-solid fa-trash" aria-hidden="true"></i> Eliminar
            </button>
          </div>
          <ul class="productos-detalle" style="margin-top:12px; border-top:1px solid #eee; padding-top:8px;">
            ${productosHTML}
          </ul>
          
          <div style="margin-top: 12px; padding-top: 8px; border-top: 1px dashed var(--border); display: flex; justify-content: space-between; font-size: 0.85em; color: var(--muted);">
            <div>${textoCompartido}</div>
            <div style="font-style: italic;">Último cambio por: ${lista.ultimaModificacionPor ? lista.ultimaModificacionPor.split('@')[0] : 'Desconocido'}</div>
          </div>
          
        </div>`;

      ul.innerHTML += `<li data-id="${lista.id}" style="margin-bottom:10px;">${resumenHTML}${detalleHTML}</li>`;
    });

    // Botón Cargar Más
    const btnCargar = document.getElementById("btnCargarMas");
    if (btnCargar) {
      if (filteredTotal <= 5) {
        btnCargar.style.display = "none";
      } else {
        btnCargar.style.display = "block";
        if (listasMostradasCount >= filteredTotal) {
          btnCargar.textContent = "Mostrar menos";
          btnCargar.onclick = () => { mostrarMenosListas(); };
        } else {
          btnCargar.textContent = "Mostrar otros 5";
          btnCargar.onclick = () => { cargarMasListas(); };
        }
      }
    }
    actualizarSugerenciasLugares();
    actualizarNotificaciones();

  } catch (e) {
    mostrarMensaje("Error cargando listas: " + e.message, "error");
    console.error(e);
  }
}

function mostrarListasFirebase(resetCount=false, soloPendientes=false) {
  mostrarListasDesdeCache(resetCount, soloPendientes);
}
function cargarMasListas(){ listasMostradasCount += 5; mostrarListasFirebase(); }
function mostrarMenosListas() {
  listasMostradasCount = 5;
  mostrarListasFirebase();
}
window.mostrarMenosListas = mostrarMenosListas;
function alternarDetalle(resumenEl){
  const detalle = resumenEl.nextElementSibling;
  if (!detalle) return;
  const oculto = detalle.classList.toggle('oculto');
  resumenEl.setAttribute('aria-expanded', oculto ? 'false' : 'true');
}

/* =========================
   mostrarResultadosConsulta
   ========================= */
   async function mostrarResultadosConsulta() {
    const filtroTienda = normalizarTexto(document.getElementById("filtroTienda")?.value || "");
    const filtroProducto = normalizarTexto(document.getElementById("filtroProducto")?.value || "");
    const criterioOrden = document.getElementById("ordenarPor") ? document.getElementById("ordenarPor").value : null;
    const resultados = document.getElementById("listaResultados");
    const contador = document.getElementById("contadorResultados");
    if (!resultados) return;
  
    // Si no hay término de búsqueda en ninguno de los campos, no mostrar nada
    if (!filtroTienda && !filtroProducto) {
      resultados.innerHTML = ""; // no mostrar nada
      if (contador) {
        contador.textContent = ""; // limpiar contador
        contador.classList.remove("cero","pocos","muchos");
      }
      return;
    }
  
    resultados.innerHTML = "";
    try {
      const listas = Array.from(listasCache.values());
      let totalResultados = 0;
      listas.forEach(lista => {
        const lugarNormalizado = normalizarTexto(lista.lugar || "");
        const coincideTienda = !filtroTienda || lugarNormalizado.includes(filtroTienda);
        if (!coincideTienda) return;
  
        let productosFiltrados = (lista.productos || []).filter(p => {
          const nombreNormalizado = normalizarTexto(p.nombre || "");
          return !filtroProducto || nombreNormalizado.includes(filtroProducto);
        });
  
        if (productosFiltrados.length === 0) return;
  
        // ordenar productos si aplica
        if (criterioOrden === "precio") productosFiltrados.sort((a,b)=> (a.precio||0)-(b.precio||0));
        else if (criterioOrden === "nombre") productosFiltrados.sort((a,b)=> (a.nombre||'').localeCompare(b.nombre||''));
  
        totalResultados += productosFiltrados.length;
  
        // limitar a 5 mostrados inicialmente
        const maxShow = 5;
        const productosMostrados = productosFiltrados.slice(0, maxShow);
        const extrasCount = Math.max(0, productosFiltrados.length - maxShow);
  
        const productosHTML = productosMostrados.map((p, idx) => {
          return `<li>${escapeHtml(p.nombre)} — 💲${(p.precio||0).toFixed(2)} ${p.descripcion ? `<div style="font-size:0.9em; color:#6b7280;">📝 ${escapeHtml(p.descripcion)}</div>` : ""}</li>`;
        }).join("");
  
        // render: si hay extras, incluimos esos elementos pero ocultos con clase producto-extra
        const extrasHTML = extrasCount > 0 ? productosFiltrados.slice(maxShow).map(p => {
          return `<li class="producto-extra oculto">${escapeHtml(p.nombre)} — 💲${(p.precio||0).toFixed(2)} ${p.descripcion ? `<div style="font-size:0.9em; color:#6b7280;">📝 ${escapeHtml(p.descripcion)}</div>` : ""}</li>`;
        }).join("") : "";
  
        const moreButtonHTML = extrasCount > 0 ? `<button class="toggle-mas-productos" data-lista-id="${lista.id}" onclick="toggleProductosExtra('${lista.id}', this)">Ver ${extrasCount} más</button>` : "";
  
        const item = document.createElement("li");
        item.innerHTML = `
        <h3 style="display:flex; justify-content:space-between; align-items:center;">
            <span>🛍️ ${escapeHtml(lista.lugar)} — 📅 ${formatearFecha(lista.fecha)}</span>
            <small style="color:#6b7280;">${productosFiltrados.length} producto(s)</small>
          </h3>
          <ul id="product-list-${lista.id}" class="productos-detalle" style="margin-top:6px;">
            ${productosHTML}
            ${extrasHTML}
          </ul>
          <div style="margin-top:6px;">${moreButtonHTML}</div>
        `;
  
        resultados.appendChild(item);
      });
  
      if (totalResultados === 0) resultados.innerHTML = "<li>No se encontraron resultados.</li>";
      if (contador) {
        contador.textContent = `${totalResultados} producto${totalResultados === 1 ? "" : "s"} encontrado${totalResultados === 1 ? "" : "s"}`;
        contador.classList.remove("cero","pocos","muchos");
        if (totalResultados === 0) contador.classList.add("cero");
        else if (totalResultados <= 5) contador.classList.add("pocos");
        else contador.classList.add("muchos");
      }
    } catch(e){ mostrarMensaje("Error al consultar: " + e.message, "error"); console.error(e); }
  }  

/* ======= SUGERENCIAS (debounced + usa cache) ======= */
function mostrarSugerenciasInner(input) {
  const valor = normalizarTexto(input.value || "");
  const contenedorSugerencias = input.nextElementSibling;
  if (!contenedorSugerencias) return;
  if (valor.length < 2) {
    contenedorSugerencias.style.display = "none";
    contenedorSugerencias.innerHTML = "";
    contenedorSugerencias.setAttribute('aria-hidden','true');
    return;
  }
  try {
    const productosEncontrados = [];
    for (const lista of listasCache.values()) {
      const productos = lista.productos || [];
      productos.forEach(p => {
        const nombreNormalizado = normalizarTexto(p.nombre);
        if (nombreNormalizado.includes(valor)) {
          productosEncontrados.push({
            nombre: p.nombre,
            precio: p.precio,
            descripcion: p.descripcion || "",
            lugar: lista.lugar,
            fecha: lista.fecha || lista.createdAt || new Date()
          });
        }
      });
    }

    if (productosEncontrados.length === 0) {
      contenedorSugerencias.style.display = "none";
      contenedorSugerencias.innerHTML = "";
      contenedorSugerencias.setAttribute('aria-hidden','true');
      return;
    }

    productosEncontrados.sort((a,b)=> parseFechaFromString(b.fecha) - parseFechaFromString(a.fecha));
    contenedorSugerencias.style.display = "block";
    contenedorSugerencias.setAttribute('aria-hidden','false');
    contenedorSugerencias.innerHTML = "";

    const items = productosEncontrados.slice(0,5);
    items.forEach(p => {
      const divItem = document.createElement('div');
      divItem.className = 'sugerencia-item';
      divItem.tabIndex = 0;
      divItem.role = 'button';
      divItem.setAttribute('aria-label', `Sugerencia ${p.nombre}`);
      divItem.innerHTML = `
        <div><strong>🛒 ${escapeHtml(p.nombre)}</strong></div>
        <div>💲<strong>${(p.precio||0).toFixed(2)}</strong></div>
        <div>📍${escapeHtml(p.lugar)} — 🗓️ ${formatearFecha(p.fecha)}</div>
        <div class="descripcion-sugerida">📝 ${escapeHtml(p.descripcion)}</div>
      `;
      divItem.addEventListener('click', () => seleccionarSugerencia(divItem, p));
      divItem.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          seleccionarSugerencia(divItem, p);
        }
      });
      contenedorSugerencias.appendChild(divItem);
    });

    const spacer = document.createElement('div');
    spacer.style.height = '6px';
    contenedorSugerencias.appendChild(spacer);

  } catch(e){
    console.error("Error sugerencias:", e);
    contenedorSugerencias.style.display = "none";
    contenedorSugerencias.innerHTML = "";
    contenedorSugerencias.setAttribute('aria-hidden','true');
  }
}
const mostrarSugerencias = debounce(mostrarSugerenciasInner, 300);
window.mostrarSugerencias = mostrarSugerencias;

function seleccionarSugerencia(div, producto) {
  try {
    const sugerenciasCont = div.closest('.sugerencias');
    let contenedorProducto = null;
    if (sugerenciasCont) {
      const prev = sugerenciasCont.previousElementSibling;
      if (prev) contenedorProducto = prev.closest('.producto');
    }
    if (!contenedorProducto) {
      contenedorProducto = div.closest('.producto') || document.querySelector('.producto');
    }
    if (!contenedorProducto) return;
    const inputNombre = contenedorProducto.querySelector('.producto-nombre');
    const inputPrecio = contenedorProducto.querySelector('.producto-precio');
    const inputDesc = contenedorProducto.querySelector('.producto-desc');
    if (inputNombre) inputNombre.value = producto.nombre || "";
    if (inputPrecio) inputPrecio.value = (typeof producto.precio === 'number' && !isNaN(producto.precio)) ? producto.precio : "";
    if (inputDesc) inputDesc.value = producto.descripcion || "";
    if (sugerenciasCont) {
      sugerenciasCont.innerHTML = "";
      sugerenciasCont.style.display = "none";
      sugerenciasCont.setAttribute('aria-hidden','true');
    }
    if (inputPrecio) inputPrecio.focus();
  } catch(e){ console.error("seleccionarSugerencia error:", e); }
}

/* ======= EDITAR (usa cache + getDoc fallback y respeta reactivar) ======= */
/* ======= EDITAR (usa cache + getDoc fallback y respeta reactivar) ======= */
async function editarLista(id) {
  try {
    let lista = listasCache.get(id);
    if (!lista && navigator.onLine && canUseFirestore()) {
      try {
        const d = await getDoc(doc(db, "listas", id));
        if (d.exists()) lista = { id: d.id, ...d.data() };
      } catch(err) {
        console.warn("No se pudo obtener lista del servidor:", err);
      }
    }    
    
    if (!lista) return mostrarMensaje("Lista no encontrada", "error");
    document.getElementById("lugar").value = lista.lugar || "";
    const fechaInputEl = document.getElementById("fecha");
    fechaInputEl.value = lista.fecha ? formatDateToInput(parseFechaFromString(lista.fecha)) : "";
    if (document.getElementById("esPagoMensual")) document.getElementById("esPagoMensual").checked = !!lista.pagoMensual;
    if (document.getElementById("esEvento")) document.getElementById("esEvento").checked = !!lista.isEvento;
    
    // Normaliza estado por si el doc traía ambos en true
    const pagEl = document.getElementById("esPagoMensual");
    const evEl  = document.getElementById("esEvento");
    if (pagEl && evEl && pagEl.checked && evEl.checked) {
      pagEl.checked = false;
    }
    
    document.getElementById("idListaEditando").value = id;
    document.getElementById("tituloFormulario").textContent = "Editar Lista de Compras";
    const form = document.getElementById('formLista');
    if (form) {
      const existing = document.getElementById('reactivar-notif-container');
      if (existing) existing.remove();
      const checkboxHTML = `
        <div id="reactivar-notif-container" style="margin-top:8px;">
          <label style="font-size:0.95em;">
            <input type="checkbox" id="reactivarNotifs" />
            Reactivar notificaciones (si la lista estaba descartada)
          </label>
        </div>
      `;
      const fechaEl = document.getElementById('fecha');
      if (fechaEl && fechaEl.parentElement) {
        fechaEl.insertAdjacentHTML('afterend', checkboxHTML);
      } else {
        form.insertAdjacentHTML('beforeend', checkboxHTML);
      }
    }

    const contenedor = document.getElementById("productos");
    contenedor.innerHTML = "";

    // 👇 NUEVO: Ordenar los productos alfabéticamente antes de mostrarlos en el editor
    const productosOrdenados = [...(lista.productos || [])].sort((a, b) => {
        const nombreA = (a.nombre || "").toLowerCase();
        const nombreB = (b.nombre || "").toLowerCase();
        return nombreA.localeCompare(nombreB);
    });

    productosOrdenados.forEach(p => {
      const div = document.createElement("div");
      div.className = "producto";
      div.innerHTML = `
        <div class="inputs-container">
          <input type="text" placeholder="Producto" class="producto-nombre" value="${escapeHtml(p.nombre)}" required oninput="mostrarSugerencias(this)" />
          <div class="sugerencias" aria-hidden="true"></div>
          <input type="number" placeholder="Precio" class="producto-precio"
            value="${p.precio}" required step="0.01" min="0"
            inputmode="decimal" autocomplete="off" onwheel="this.blur()" />
          <input type="text" placeholder="Descripción (opcional)" class="producto-desc" value="${escapeHtml(p.descripcion || "")}" />
        </div>
        <button type="button" class="eliminar-producto" onclick="eliminarProducto(this)">❌</button>
      `;
      contenedor.appendChild(div);
    });
    mostrarSeccion("agregar");
    window.scrollTo(0,0);
    actualizarTotalLive(); // <--- NUEVO: Calcular total al abrir
  } catch(e){ mostrarMensaje("Error al cargar la lista: " + e.message, "error"); console.error(e); }
}

/* ======= FORM SUBMIT (respeta _notificacionDescartada salvo reactivar) ======= */
document.getElementById("formLista")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const lugar = document.getElementById("lugar").value.trim();
  const fechaInput = document.getElementById("fecha").value;
  if (!fechaInput) { mostrarMensaje("Ingresa una fecha", "error"); return; }
  const [year, month, day] = fechaInput.split("-").map(Number);
  const fechaObj = new Date(year, month-1, day);
  const hoy = startOfDay(new Date());
  const estado = startOfDay(fechaObj).getTime() >= hoy.getTime() ? "pendiente" : "normal";
  const productos = [];
let hayError = false;
document.querySelectorAll(".producto").forEach((p,i) => {
  const nombre = p.querySelector(".producto-nombre").value.trim();
  const precioInput = p.querySelector(".producto-precio");
  const descripcion = p.querySelector(".producto-desc").value.trim();

  if (!nombre) {
    mostrarMensaje(`El producto #${i+1} no tiene nombre.`, "error");
    hayError = true; return;
  }

  // 1) Validación nativa (min/step, etc.)
  if (precioInput && !precioInput.checkValidity()) {
    precioInput.reportValidity();
    hayError = true; return;
  }

  // 2) Normalización coma decimal y redondeo a 2
  const raw = (precioInput?.value ?? "").trim().replace(',', '.');
  const precio = Number(parseFloat(raw).toFixed(2));

  if (Number.isNaN(precio) || precio < 0) {
    mostrarMensaje(`El producto "${nombre || "sin nombre"}" tiene un precio inválido.`, "error");
    hayError = true; return;
  }

  productos.push({ nombre, precio, descripcion });
});

if (hayError || productos.length === 0) return;
  const idLista = document.getElementById("idListaEditando").value;
  const esPagoMensual = !!document.getElementById("esPagoMensual") && document.getElementById("esPagoMensual").checked;
  const esEvento = !!document.getElementById("esEvento") && document.getElementById("esEvento").checked;
  // Exclusión mutua defensiva
  if (esPagoMensual && esEvento) {
    mostrarMensaje('No puedes marcar "Pago mensual" y "Evento" a la vez.', 'error');
    return;
  }
  const miCorreo = currentUser ? currentUser.email : "local";
  // 👇 Solo le agregamos "ultimaModificacionPor" al final de esta línea 👇
  const datos = { lugar, fecha: fechaInput, productos, estado, pagoMensual: esPagoMensual, isEvento: esEvento, ultimaModificacionPor: miCorreo };

  const reactivarCheckbox = document.getElementById('reactivarNotifs');

  if (idLista) {
    try {
      let prev = listasCache.get(idLista);
      if (!prev && navigator.onLine && canUseFirestore()) {
        const d = await getDoc(doc(db, "listas", idLista));
        if (d.exists()) prev = { id: d.id, ...d.data() };
      }
      // ... tras calcular `prev` y antes de guardar en Firestore/local ...
      if (reactivarCheckbox && reactivarCheckbox.checked) {
        const confirmar = confirm("¿Confirmas que deseas reactivar las notificaciones para esta lista? Si confirmas, la lista volverá a aparecer en notificaciones si aplica.");
        if (confirmar) {
          datos._notificacionDescartada = false;
          datos.completada = false;
          datos.estado = estado; // ya calculado arriba
        } else {
          const prevDesc = (prev && typeof prev._notificacionDescartada === 'boolean') ? prev._notificacionDescartada : false;
          datos._notificacionDescartada = prevDesc;
          if (typeof prev?.completada === 'boolean') datos.completada = prev.completada;
          if (typeof prev?.estado === 'string') datos.estado = prev.estado;
        }
      } else {
        const prevDesc = (prev && typeof prev._notificacionDescartada === 'boolean') ? prev._notificacionDescartada : false;
        datos._notificacionDescartada = prevDesc;
        if (typeof prev?.completada === 'boolean') datos.completada = prev.completada;
        if (typeof prev?.estado === 'string') datos.estado = prev.estado;
      }
      if (navigator.onLine && canUseFirestore()) {
        await updateDoc(doc(db, "listas", idLista), datos);
        mostrarMensaje("Lista actualizada correctamente (en la nube).", "success");
        const prevCached = listasCache.get(idLista) || {};
        listasCache.set(idLista, { ...prevCached, ...datos, id: idLista });
        await schedulePersistCacheToIndexedDB();
        cancelScheduledNotificationsForList(idLista);
        if (!datos._notificacionDescartada && esPendientePorFechaOnly(datos)) await scheduleNotificationsForList({ id: idLista, ...datos });
        actualizarNotificaciones();
      } else {
        const updates = loadPendingUpdates();
        updates[idLista] = { ...(updates[idLista]||{}), ...datos };
        savePendingUpdates(updates);
        const prevCached = listasCache.get(idLista) || {};
        listasCache.set(idLista, { ...prevCached, ...datos, id: idLista });        
        await schedulePersistCacheToIndexedDB();
        cancelScheduledNotificationsForList(idLista);
        if (!datos._notificacionDescartada && esPendientePorFechaOnly(datos)) {
          await scheduleNotificationsForList({ id: idLista, ...datos });
        }
        mostrarMensaje("Guardado fuera de línea: los cambios se sincronizarán cuando haya conexión.", "offline");
        actualizarNotificaciones();
      }
    } catch(e){ mostrarMensaje("Error actualizando la lista: " + e.message, "error"); console.error(e); }
  } else {
    // 👇 AÑADE AUTOMÁTICAMENTE AL COMPAÑERO SI ESTÁ VINCULADO 👇
    const correoPareja = localStorage.getItem("correoPareja");
    if (correoPareja) {
      datos.accessList = [miCorreo, correoPareja]; // Los pone a los dos
    } else {
      datos.accessList = [miCorreo]; // Solo a ti
    }
    await guardarLista({ ...datos, _notificacionDescartada: false });
  }

  e.target.reset();
  document.getElementById("idListaEditando").value = "";
  document.getElementById("tituloFormulario").textContent = "Agregar Lista de Compras";
  const contReact = document.getElementById('reactivar-notif-container');
  if (contReact) contReact.remove();

  document.getElementById("productos").innerHTML = `
    <div class="producto">
      <div class="inputs-container">
        <input type="text" placeholder="Producto" class="producto-nombre" required oninput="mostrarSugerencias(this)" />
        <div class="sugerencias" aria-hidden="true"></div>
        <input type="number" placeholder="Precio" class="producto-precio"
          required step="0.01" min="0"
          inputmode="decimal" autocomplete="off" onwheel="this.blur()" />
        <input type="text" placeholder="Descripción (opcional)" class="producto-desc" />
      </div>
      <button type="button" class="eliminar-producto" onclick="eliminarProducto(this)">❌</button>
    </div>`;
  mostrarListasFirebase(true);
  actualizarTotalLive(); // <--- NUEVO: Reiniciar a cero tras guardar
});

/* ======= SENCILLOS: agregar/eliminar producto y exposicion global ======= */
function agregarProducto() {
  const contenedor = document.getElementById("productos");
  if (!contenedor) return;
  const div = document.createElement("div");
  div.className = "producto";
  div.innerHTML = `
    <div class="inputs-container">
      <input type="text" placeholder="Producto" class="producto-nombre" required oninput="mostrarSugerencias(this)" />
      <div class="sugerencias" aria-hidden="true"></div>
      <input type="number" placeholder="Precio" class="producto-precio"
        required step="0.01" min="0"
        inputmode="decimal" autocomplete="off" onwheel="this.blur()" />
      <input type="text" placeholder="Descripción (opcional)" class="producto-desc" />
    </div>
    <button type="button" class="eliminar-producto" onclick="eliminarProducto(this)">❌</button>
  `;
  // 👇 CAMBIAMOS appendChild POR prepend PARA QUE APAREZCA ARRIBA
  contenedor.prepend(div); 
  
  // Opcional UX: Hacer focus automático en el nuevo input para escribir de inmediato
  setTimeout(() => div.querySelector('.producto-nombre').focus(), 50);
  actualizarTotalLive();
}

function eliminarProducto(boton) { 
  const divProducto = boton.parentElement; 
  if (divProducto) {
    divProducto.remove(); 
    actualizarTotalLive(); // Actualizar total al borrar
  }
}

/* ======= SYNC ONLINE/OFFLINE: procesar colas pendientes al reconectar (mejor mapeo tmp_ => real id) ======= */
// bandera para evitar loops en onSnapshot / re-procesos masivos
let isSyncingPending = false;

// Reemplaza COMPLETO tu window.addEventListener("online", ... ) por este:
window.addEventListener("online", async () => {
  if (isSyncingPending) return;
  isSyncingPending = true;

  const ran = await acquireSyncLockSafely(async () => {
    mostrarMensaje("Conexión restablecida. Sincronizando cambios pendientes...", "info");
    try {
      await initFirebase();
      if (!canUseFirestore()) {
        mostrarMensaje("Conexión OK, pero Firebase no disponible. Reintentaré sincronizar más tarde.", "error");
        return;
      }

      // ------------ PENDIENTES: CREATES (tal como ya lo tienes) ------------
      const pendingCreates = loadPendingCreates();
      const remainingCreates = [];
      if (Array.isArray(pendingCreates) && pendingCreates.length > 0) {
        const CHUNK = 200;
        for (let i = 0; i < pendingCreates.length; i += CHUNK) {
          const chunk = pendingCreates.slice(i, i + CHUNK);
          try {
            const batch = writeBatch(db);
            const tmpToNewId = {};
            chunk.forEach(c => {
              const newRef = doc(collection(db, "listas"));
              batch.set(newRef, { ...c, createdAt: safeServerTimestamp() });
              tmpToNewId[`tmp_${c.clientId}`] = newRef.id;
            });
            bumpSyncLock();
            await batch.commit();
            incrClientWriteCounter(chunk.length);
            for (const c of chunk) {
              const tmpKey = `tmp_${c.clientId}`;
              const newId = tmpToNewId[tmpKey];
              migrateScheduledMap(tmpKey, newId);
              const tmpEntry = listasCache.get(tmpKey);
              if (tmpEntry) {
                listasCache.delete(tmpKey);
                await deleteOneFromIndexedDB(tmpKey).catch(()=>{});
              }
              const newDoc = { id: newId, ...c };
              listasCache.set(newId, newDoc);
              await saveOneToIndexedDB(newDoc).catch(()=>{});
              const upd = loadPendingUpdates();
              if (upd[tmpKey]) {
                upd[newId] = { ...(upd[newId]||{}), ...upd[tmpKey] };
                delete upd[tmpKey];
                savePendingUpdates(upd);
              }
              let dels = loadPendingDeletes();
              if (dels && Array.isArray(dels)) {
                const idxTmp = dels.indexOf(tmpKey);
                if (idxTmp !== -1) { dels[idxTmp] = newId; savePendingDeletes(dels); }
              }
            }
          } catch (err) {
            console.error("Error sincronizando chunk de creates:", err);
            remainingCreates.push(...chunk);
          }
        }
        savePendingCreates(remainingCreates);
      }

      // ------------ PENDIENTES: UPDATES (tal como ya lo tienes) ------------
      const pendingUpdatesNow = loadPendingUpdates();
      const updateIds = Object.keys(pendingUpdatesNow || {});
      if (updateIds.length > 0) {
        const CHUNK = 200;
        for (let i = 0; i < updateIds.length; i += CHUNK) {
          const chunkIds = updateIds.slice(i, i + CHUNK);
          try {
            const batch = writeBatch(db);
            chunkIds.forEach(id => {
              if (id.startsWith("tmp_")) return;
              const payload = { ...(pendingUpdatesNow[id]||{}) };
              if (payload.ultimoPagoGuardadoAt) payload.ultimoPagoGuardadoAt = safeServerTimestamp();
              batch.update(doc(db, "listas", id), payload);
            });
            bumpSyncLock();
            await batch.commit();
            incrClientWriteCounter(chunkIds.length);
            chunkIds.forEach(id => { if (!id.startsWith("tmp_")) delete pendingUpdatesNow[id]; });
          } catch (err) {
            console.error("Error sincronizando chunk de updates:", err);
          }
        }
        savePendingUpdates(pendingUpdatesNow);
      }

      // ------------ PENDIENTES: DELETES (tal como ya lo tienes) ------------
      const pendingDeletesNow = loadPendingDeletes() || [];
      if (pendingDeletesNow.length > 0) {
        const remainingDeletes = [];
        const CHUNK = 200;
        for (let i = 0; i < pendingDeletesNow.length; i += CHUNK) {
          const chunk = pendingDeletesNow.slice(i, i + CHUNK);
          try {
            const batch = writeBatch(db);
            chunk.forEach(id => {
              if (id.startsWith("tmp_")) {
                listasCache.delete(id);
                deleteOneFromIndexedDB(id).catch(()=>{});
              } else {
                batch.delete(doc(db, "listas", id));
              }
            });
            bumpSyncLock();
            await batch.commit();
            incrClientWriteCounter(chunk.length);
          } catch (err) {
            console.error("Error synchronizing chunk deletes:", err);
            chunk.forEach(id => { if (!id.startsWith("tmp_")) remainingDeletes.push(id); });
          }
        }
        savePendingDeletes(remainingDeletes);
      }

      if (isLeaderTab) rebuildScheduledTimeoutsFromStorage();
      await schedulePersistCacheToIndexedDB().catch(()=>{});
      debouncedActualizarNotificaciones();
      mostrarListasFirebase(true);
      mostrarMensaje("Sincronización completada.", "success");

      // reintento al arrancar (igual a tu código actual)
      try {
        const hasPending =
          (loadPendingCreates().length > 0) ||
          (Object.keys(loadPendingUpdates() || {}).length > 0) ||
          (loadPendingDeletes().length > 0);
        if (navigator.onLine && hasPending) {
          setTimeout(() => window.dispatchEvent(new Event("online")), 0);
        }
      } catch (e) {
        console.warn("No se pudo disparar sync al arrancar:", e);
      }
    } catch (e) {
      console.error("Error en handler online:", e);
      mostrarMensaje("Error sincronizando cambios pendientes. Reintentaré más tarde.", "error");
    }
  });

  if (!ran) console.log("Otra pestaña hará la sincronización pendiente.");
  isSyncingPending = false;
});

window.addEventListener("offline", () => mostrarMensaje("Sin conexión. Las acciones quedarán guardadas localmente y se sincronizarán al reconectar.", "offline"));

// Debounce también el render de listas (pega esto una sola vez junto a tus otros "debounced")
const debouncedMostrarListas = debounced(() => mostrarListasFirebase(true), 250);

/* ======= INICIALIZAR: onSnapshot listener para mantener cache en tiempo real (y carga inicial desde IndexedDB) ======= */
/* ======= OPTIMIZACIÓN: Listener Inteligente ======= */
let listasListenerUnsubscribe = null;

async function startListasListener() {
  if (!canUseFirestore() || typeof collection !== 'function' || typeof onSnapshot !== 'function') {
    return;
  }

  // Si ya hay uno escuchando, no creamos otro
  if (listasListenerUnsubscribe) return;

  try {
    // Si no hay usuario logueado, no descargamos nada de la nube
    if (!currentUser || !currentUser.email) return;

    // MAGIA DE PRIVACIDAD: Solo trae las listas donde tu correo esté en la lista de acceso
    const q = query(
      collection(db, "listas"), 
      where("accessList", "array-contains", currentUser.email)
    );

    listasListenerUnsubscribe = onSnapshot(
      q,
      (snapshot) => {
        let touched = false;
        
        // Solo procesamos si hay cambios reales desde el servidor o local
        snapshot.docChanges().forEach((change) => {
          const id = change.doc.id;
          const data = { id, ...change.doc.data() };

          if (change.type === "removed") {
            if (listasCache.has(id)) {
              listasCache.delete(id);
              cancelScheduledNotificationsForList(id);
              deleteOneFromIndexedDB(id).catch(()=>{});
              touched = true;
            }
          } else {
            // OPTIMIZACIÓN: Comparación profunda antes de escribir en caché/IDB
            // para evitar ciclos de renderizado innecesarios
            const current = listasCache.get(id);
            if (!current || shallowChanged(current, data)) {
               listasCache.set(id, data);
               saveOneToIndexedDB(data).catch(()=>{});
               touched = true;
            }
          }
        });

        if (!touched && snapshot.size === listasCache.size) return;

        schedulePersistCacheToIndexedDB().catch(()=>{});
        debouncedActualizarNotificaciones();
        debouncedMostrarListas();
      },
      (err) => {
        console.error("onSnapshot error:", err);
        // Si falla (ej. permisos o desconexión), limpiamos la variable
        listasListenerUnsubscribe = null;
      }
    );
    console.log("📡 Conexión a Firebase: ACTIVADA");
  } catch (e) {
    console.error("Error iniciando listener:", e);
  }
}

function stopListasListener() {
  if (typeof listasListenerUnsubscribe === 'function') {
    listasListenerUnsubscribe();
    listasListenerUnsubscribe = null;
    console.log("zzz Conexión a Firebase: PAUSADA (Ahorro de lecturas)");
  }
}

// 🚀 AHORRO MASIVO: Desconectar Firebase cuando la pestaña no se ve
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopListasListener();
  } else {
    // Al volver, reconectamos para traer novedades
    startListasListener();
    // Forzamos un render rápido con lo que haya en caché visualmente
    mostrarListasFirebase(); 
  }
});

/* ======= UX/validación para inputs .producto-precio ======= */
(function wirePrecioInputs() {
  // Reemplaza comas por punto mientras se escribe
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (!el.classList || !el.classList.contains('producto-precio')) return;
    if (el.value.includes(',')) el.value = el.value.replace(/,/g, '.');
    actualizarTotalLive(); // <--- NUEVO
  });

  // Formatea a 2 decimales al salir del campo
  document.addEventListener('blur', (e) => {
    const el = e.target;
    if (!el.classList || !el.classList.contains('producto-precio')) return;
    const v = el.value.trim();
    if (v === '') return;
    const n = Number(v);
    if (!Number.isNaN(n)) el.value = n.toFixed(2);
    actualizarTotalLive(); // <--- NUEVO
  }, true);

  // Evita notación exponencial y signos
  document.addEventListener('keydown', (e) => {
    const el = e.target;
    if (!el.classList || !el.classList.contains('producto-precio')) return;
    if (['e','E','+','-'].includes(e.key)) e.preventDefault();
  });
})();

/* ========= VALIDAR JSON DE IMPORTACIÓN ========= */

/** Reglas de validación:
 * - El archivo debe ser un arreglo de objetos "lista".
 * - Campos por lista:
 *   - id: opcional string
 *   - lugar: string no vacío (requerido)
 *   - fecha: string 'YYYY-MM-DD' válido (requerido)
 *   - productos: array (requerido; puede estar vacío, se marca como advertencia)
 *      - nombre: string no vacío (requerido)
 *      - precio: número >= 0 (se aceptan strings numéricos como advertencia)
 *      - descripcion: string opcional
 *   - _notificacionDescartada, completada, pagoMensual, isEvento: boolean opcional
 *   - estado: opcional string en {'pendiente','normal','expirada','caducado'}
 */

/* ======= INICIALIZAR ONLOAD (modificado para initFirebase + modo offline parcial) ======= */
document.addEventListener("DOMContentLoaded", async () => {
  try {
    await leaderElectionReady;  // <<< NUEVO: espera a saber si esta pestaña es líder
    // NUEVO: solicitar almacenamiento persistente (evita eviction de IndexedDB/Cache)
    if (navigator.storage && (navigator.storage.persist || navigator.storage.persisted)) {
      try {
        const already = typeof navigator.storage.persisted === "function"
          ? await navigator.storage.persisted()
          : false;

        if (!already && typeof navigator.storage.persist === "function") {
          const persisted = await navigator.storage.persist();
          console.log("Persist storage:", persisted ? "garantizado" : "best-effort");
        } else {
          console.log("Persist storage: ya garantizado");
        }

        // (opcional) log de uso de almacenamiento
        if (navigator.storage.estimate) {
          const { quota, usage } = await navigator.storage.estimate();
          if (quota && usage != null) {
            const pct = ((usage / quota) * 100).toFixed(1);
            console.log(`Almacenamiento usado: ${pct}% (${usage} de ${quota} bytes)`);
          }
        }
      } catch (err) {
        console.warn("No se pudo solicitar almacenamiento persistente:", err);
      }
    }
    const firebaseOk = await initFirebase();
    
    await loadCacheFromIndexedDB().catch((e) => { console.warn("loadCacheFromIndexedDB falló:", e); });

    mostrarSeccion("inicio");
    mostrarListasFirebase(true);

    if (firebaseOk && typeof startListasListener === "function") {
      try {
        startListasListener();
      } catch (e) {
        console.error("startListasListener falló:", e);
        mostrarMensaje("No se pudo iniciar la sincronización en tiempo real. Se usarán datos locales.", "offline");
        actualizarNotificaciones();
        mostrarListasFirebase(true);
      }
    } else {
      actualizarNotificaciones();
      mostrarListasFirebase(true);
    }

    const mostrarResultadosConsultaDebounced = debounce(mostrarResultadosConsulta, 300);
    document.getElementById("filtroTienda")?.addEventListener("input", mostrarResultadosConsultaDebounced);
    document.getElementById("filtroProducto")?.addEventListener("input", mostrarResultadosConsultaDebounced);
    document.getElementById("ordenarPor")?.addEventListener("change", mostrarResultadosConsultaDebounced);
    document.getElementById("btnPendientes")?.addEventListener("click", () => setFiltroListas('pendientes'));
    document.getElementById("btnTodas")?.addEventListener("click", () => setFiltroListas('todas'));
    
    // Estado inicial (si quieres que arranque mostrando "Todas"):
    setFiltroListas('todas');

    // === Exclusión mutua: Pago mensual vs Evento ===
    (function setupMonthlyEventMutex(){
      const pag = document.getElementById('esPagoMensual');
      const ev  = document.getElementById('esEvento');
      if (!pag || !ev) return;

      const uncheckOther = (who) => {
        if (who === 'pag' && pag.checked) {
          ev.checked = false;
          // mostrarMensaje('Seleccionaste "Pago mensual"; se desmarca "Evento".', 'info'); // opcional
        }
        if (who === 'ev' && ev.checked) {
          pag.checked = false;
          // mostrarMensaje('Seleccionaste "Evento"; se desmarca "Pago mensual".', 'info'); // opcional
        }
      };

      pag.addEventListener('change', () => uncheckOther('pag'));
      ev.addEventListener('change',  () => uncheckOther('ev'));

      // Coherencia al cargar/editar por si vienen ambos true de datos antiguos
      if (pag.checked && ev.checked) {
        // Regla: prioriza "Evento" (ajústalo si prefieres lo contrario)
        pag.checked = false;
      }
    })();
        
    // ====== Rango de fechas con Flatpickr (un solo calendario) ======
    try {
      if (window.flatpickr) {
        // Si ya había valores (p.ej. por estado previo), los usamos como default
        const dEl = document.getElementById('fechaDesdeListas');
        const hEl = document.getElementById('fechaHastaListas');
        const defaultDate = (dEl?.value && hEl?.value) ? [dEl.value, hEl.value] : [];

        window._fpRangoListas = flatpickr('#rangoFechasListas', {
          mode: 'range',
          dateFormat: 'Y-m-d',
          locale: (window.flatpickr.l10ns && window.flatpickr.l10ns.es) ? window.flatpickr.l10ns.es : 'es',
          allowInput: false,
          defaultDate,
          // cuando el usuario termina la selección (o cierra el calendario)
          onClose(selectedDates) {
            const desdeInput = document.getElementById('fechaDesdeListas');
            const hastaInput = document.getElementById('fechaHastaListas');
            const [start, end] = selectedDates;

            if (desdeInput) desdeInput.value = start ? formatDateToInput(start) : '';
            if (hastaInput) {
              // Si eligió solo un día, tomamos mismo día como fin para que el filtro sea 1 día exacto
              if (end) hastaInput.value = formatDateToInput(end);
              else if (start) hastaInput.value = formatDateToInput(start);
              else hastaInput.value = '';
            }

            mostrarListasFirebase(true);
          },
        });
      } else {
        console.warn('flatpickr no cargó; usarás los 2 inputs nativos.');
        // Si no cargó la librería, ocultamos el rango y mostramos los inputs nativos
        const r = document.getElementById('rangoFechasListas');
        const d = document.getElementById('fechaDesdeListas');
        const h = document.getElementById('fechaHastaListas');
        if (r) r.style.display = 'none';
        if (d) d.style.display = '';
        if (h) h.style.display = '';
      }
    } catch (e) {
      console.error('Error iniciando flatpickr:', e);
    }

    // ====== Rango de fechas para EVENTOS (un solo calendario) ======
    try {
      if (window.flatpickr) {
        const dEv = document.getElementById('fechaDesdeEventos');
        const hEv = document.getElementById('fechaHastaEventos');
        const defaultDateEv = (dEv?.value && hEv?.value) ? [dEv.value, hEv.value] : [];

        window._fpRangoEventos = flatpickr('#rangoFechasEventos', {
          mode: 'range',
          dateFormat: 'Y-m-d',
          locale: (window.flatpickr.l10ns && window.flatpickr.l10ns.es) ? window.flatpickr.l10ns.es : 'es',
          allowInput: false,
          defaultDate: defaultDateEv,
          onClose(selectedDates) {
            const [start, end] = selectedDates;
            if (dEv) dEv.value = start ? formatDateToInput(start) : '';
            if (hEv) hEv.value = end ? formatDateToInput(end) : (start ? formatDateToInput(start) : '');
            refrescarEventosFiltrados(true);
          },
        });
      } else {
        console.warn('flatpickr no cargó; usa los inputs nativos #fechaDesdeEventos/#fechaHastaEventos');
      }
    } catch(e){ console.error('Error iniciando flatpickr (eventos):', e); }

    if (isLeaderTab) rebuildScheduledTimeoutsFromStorage();
    actualizarNotificaciones();
    // inicializar filtro notifs
    setupNotifsFilterUI();
    applyNotifsFilterAndRender();
    // 👇 AGREGA ESTA LÍNEA AQUÍ 👇
    if (typeof actualizarBotonVinculacion === 'function') actualizarBotonVinculacion();

    document.addEventListener('click', (e) => {
      if (e.target.closest('.sugerencias') || e.target.closest('.sugerencia-item') || e.target.closest('.producto-nombre')) {
        return;
      }
      document.querySelectorAll('.sugerencias').forEach(s => {
        s.style.display = 'none';
        s.innerHTML = '';
        s.setAttribute('aria-hidden','true');
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.sugerencias').forEach(s => {
          s.style.display = 'none';
          s.innerHTML = '';
          s.setAttribute('aria-hidden','true');
        });
      }
    });

    // === Toggle menú (móvil off-canvas + backdrop) ===
    const btnMenu = document.getElementById('btnMenuToggle');
    const navMain = document.getElementById('mainNav');
    const backdrop = document.getElementById('navBackdrop');

    if (btnMenu && navMain) {
      const setExpanded = (isOpen) => {
        navMain.classList.toggle('open', isOpen);
        btnMenu.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        if (backdrop) {
          backdrop.classList.toggle('oculto', !isOpen);
          backdrop.classList.toggle('show', isOpen);
        }
      };

      // Estado inicial: cerrado en móvil
      setExpanded(false);

      btnMenu.addEventListener('click', (e) => {
        e.stopPropagation();
        setExpanded(!navMain.classList.contains('open'));
      });

      if (backdrop) {
        backdrop.addEventListener('click', () => setExpanded(false));
      }

      // Cerrar si se hace click fuera (móvil)
      document.addEventListener('click', (ev) => {
        if (window.matchMedia('(min-width: 768px)').matches) return; // desktop no colapsa
        const inside = ev.target.closest('#mainNav') || ev.target.closest('#btnMenuToggle');
        if (!inside) setExpanded(false);
      });

      // Al redimensionar: si pasa a desktop, asegúrate de cerrar el modo móvil
      window.addEventListener('resize', () => {
        if (window.matchMedia('(min-width: 768px)').matches) setExpanded(false);
      });
    }
  } catch (e) {
    console.error("Error inicializando la app:", e);
    mostrarMensaje("Error inicializando la aplicación. Revisa la consola para más detalles.", "error");
  }
});

function limpiarFechasListas() {
  const d = document.getElementById("fechaDesdeListas");
  const h = document.getElementById("fechaHastaListas");
  const r = document.getElementById("rangoFechasListas");

  // NUEVO: limpiar el control de rango si existe
  if (window._fpRangoListas && typeof window._fpRangoListas.clear === 'function') {
    window._fpRangoListas.clear();
  }
  if (r) r.value = "";

  if (d) d.value = "";
  if (h) h.value = "";
  mostrarListasFirebase(true);
}
window.limpiarFechasListas = limpiarFechasListas;

function limpiarFechasEventos() {
  const d = document.getElementById("fechaDesdeEventos");
  const h = document.getElementById("fechaHastaEventos");
  const r = document.getElementById("rangoFechasEventos");
  if (window._fpRangoEventos && typeof window._fpRangoEventos.clear === 'function') {
    window._fpRangoEventos.clear();
  }
  if (r) r.value = "";
  if (d) d.value = "";
  if (h) h.value = "";
  refrescarEventosFiltrados(true);
}
window.limpiarFechasEventos = limpiarFechasEventos;

function refrescarEventosFiltrados(reset=false){
  if (reset) eventosMostradosCount = EVENTS_PAGE_INCREMENT;
  const eventosBase = Array.from(listasCache.values())  // <- sin esPendientePorFechaOnly
    .filter(l => l.isEvento);
  renderEvents(eventosBase);
}
window.refrescarEventosFiltrados = refrescarEventosFiltrados;


async function reactivateNotifications(id) {
  try {
    if (!id) return;

    // Preparar payload que reactive notificaciones y, si aplica, deje la lista como no completada
    const cached = listasCache.get(id) || {};
    const now = startOfDay(new Date());
    let payload = { _notificacionDescartada: false, completada: false };

    // decidir estado según la fecha de la lista (si existe): 
    // si la fecha es hoy o futura => 'pendiente', sino 'normal'
    try {
      const f = parseFechaFromString(cached.fecha);
      if (f && !isNaN(f) && startOfDay(f).getTime() >= now.getTime()) {
        payload.estado = 'pendiente';
      } else {
        payload.estado = cached.estado || 'normal';
      }
    } catch(e) {
      payload.estado = cached.estado || 'normal';
    }

    if (navigator.onLine && canUseFirestore()) {
      await updateDoc(doc(db, "listas", id), payload);
      mostrarMensaje("Notificaciones reactivadas (en la nube).", "success");
    } else {
      const updates = loadPendingUpdates();
      updates[id] = { ...(updates[id]||{}), ...payload };
      savePendingUpdates(updates);
      const cached2 = listasCache.get(id);
      if (cached2) {
        const merged = { ...cached2, ...payload };
        listasCache.set(id, merged);
        await schedulePersistCacheToIndexedDB();
      }
      mostrarMensaje("Guardado fuera de línea: se reactivarán notificaciones al sincronizar.", "offline");
    }

    // Intentar (desde la cache) re-agendar notificaciones si ahora la lista cumple la condición
    const lista = listasCache.get(id);
    if (lista) {
      lista._notificacionDescartada = false;
      lista.completada = false;
      if (lista.estado === undefined) lista.estado = payload.estado;
    }
    if (lista && esPendientePorFechaOnly(lista)) await scheduleNotificationsForList(lista);

    debouncedActualizarNotificaciones();
  } catch(e) {
    console.error("reactivateNotifications error:", e);
    mostrarMensaje("Error reactivando notificaciones", "error");
  }
}
window.reactivateNotifications = reactivateNotifications;

// === Registro de Service Worker (PWA/offline) ===
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js", { scope: "./" })
      .then((reg) => console.log("SW registrado:", reg.scope))
      .catch((err) => console.warn("SW error:", err));
  });
}

/* === 1) mostrarSeccion: cierra el menú móvil y sincroniza ARIA === */
window.mostrarSeccion = function(id){
  document.querySelectorAll(".seccion").forEach(s=>s.classList.add("oculto"));
  const el = document.getElementById(id); 
  if (el) el.classList.remove("oculto");

  // 👇 NUEVO: Subir la vista al inicio al cambiar de pantalla
  window.scrollTo({ top: 0, behavior: 'smooth' });
  
  // cerrar menú si estaba abierto (UX móvil) y sincronizar ARIA
  const nav = document.getElementById("mainNav");
  const btn = document.getElementById("btnMenuToggle");
  const backdrop = document.getElementById("navBackdrop");
  if (nav && nav.classList.contains('open')) {
    nav.classList.remove('open');
    if (btn) btn.setAttribute('aria-expanded','false');
    if (backdrop){ 
      backdrop.classList.add('oculto'); 
      backdrop.classList.remove('show'); 
    }
  }
};

/* ======= Backup: Exportar / Importar JSON ======= */
window.exportarJSON = async function () {
  try {
    // Opcional: excluir temporales "tmp_" (descomenta si quieres)
    // const arr = Array.from(listasCache.values()).filter(it => !String(it.id || '').startsWith('tmp_'));
    const arr = Array.from(listasCache.values());
    const blob = new Blob([JSON.stringify(arr, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), {
      href: url,
      download: `listas_backup_${Date.now()}.json`
    });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    mostrarMensaje("Exportación iniciada.", "success");
  } catch (e) {
    console.error(e);
    mostrarMensaje("No se pudo exportar el respaldo.", "error");
  }
};

function keyLugarFecha(x){
  const lugar = normalizarTexto(x?.lugar || "");
  const fecha = typeof x?.fecha === "string" ? x.fecha : (x?.fecha ? formatDateToInput(parseFechaFromString(x.fecha)) : "");
  return `${lugar}__${fecha}`;
}

// Busca duplicado por id o por (lugar+fecha)
function findDuplicateLocal(it){
  if (!it) return null;
  const id = (typeof it.id === "string") ? it.id : null;
  if (id && listasCache.has(id)) return listasCache.get(id);
  const k = keyLugarFecha(it);
  for (const v of listasCache.values()){
    if (keyLugarFecha(v) === k) return v;
  }
  return null;
}

// Funde dos listas (conserva flags si existen)
function mergeList(existing, incoming){
  const base = { ...existing };
  base.lugar  = incoming.lugar ?? base.lugar;
  base.fecha  = incoming.fecha ? formatDateToInput(parseFechaFromString(incoming.fecha)) : base.fecha;

  // flags
  base._notificacionDescartada = Boolean(existing._notificacionDescartada) && Boolean(incoming._notificacionDescartada);
  if (typeof existing.completada === 'boolean' || typeof incoming.completada === 'boolean') {
    base.completada = Boolean(existing.completada) && Boolean(incoming.completada);
  }
  if ('pagoMensual' in existing || 'pagoMensual' in incoming) {
    base.pagoMensual = Boolean(existing.pagoMensual || incoming.pagoMensual);
  }
  if ('isEvento' in existing || 'isEvento' in incoming) {
    base.isEvento = Boolean(existing.isEvento || incoming.isEvento);
  }
  if ('estado' in incoming) base.estado = incoming.estado;
  else if (!base.estado) base.estado = 'pendiente';

  // fusionar productos por nombre (case-insensitive)
  const map = new Map(); // nombreNormalizado -> producto
  const addAll = (arr=[]) => {
    arr.forEach(p => {
      const nombre = String(p?.nombre || '').trim();
      if (!nombre) return;
      const key = normalizarTexto(nombre);
      const prev = map.get(key);
      const precio = Number(p?.precio || 0);
      const desc   = p?.descripcion ? String(p.descripcion) : '';

      if (!prev) {
        map.set(key, { nombre, precio, descripcion: desc });
      } else {
        // mantener el precio no-cero si alguno lo trae
        const mejorPrecio = (prev.precio && prev.precio > 0) ? prev.precio : precio;
        // concatenar descripciones si son distintas
        const mergedDesc = (prev.descripcion && desc && prev.descripcion !== desc)
          ? `${prev.descripcion} | ${desc}` : (prev.descripcion || desc || '');
        map.set(key, { nombre, precio: Number(mejorPrecio || 0), descripcion: mergedDesc });
      }
    });
  };
  addAll(existing.productos);
  addAll(incoming.productos);
  base.productos = Array.from(map.values());
  return base;
}

window.importarJSON = async function (file, { mode = 'merge', pushToCloud = true } = {}) {
  if (!file) return;
  try {
    const text = await file.text();
    const rawArr = JSON.parse(text);
    if (!Array.isArray(rawArr)) throw new Error("Formato inválido: se esperaba un arreglo.");

    // 👇 NUEVO: Preguntar si desea compartir con la pareja vinculada 👇
    const correoPareja = localStorage.getItem("correoPareja");
    let compartirConPareja = false;
    if (correoPareja) {
      compartirConPareja = confirm(`Tienes una cuenta vinculada (${correoPareja}).\n\n¿Deseas compartir TODAS las listas importadas con esta persona?\n\n(Si das a 'Cancelar', se importarán como Privadas y podrás compartirlas manualmente después).`);
    }

    // 1) REPLACE opcional: limpia todo lo local antes de importar
    if (mode === 'replace') {
      cancelAllScheduledNotifications({ preserveStorage: false });
      listasCache.clear();
      await saveAllToIndexedDB([]).catch(()=>{});
    }

    // 2) Normalizar
    const miCorreo = currentUser ? currentUser.email : 'local';
    const norm = rawArr.map((it) => {
      const x = { ...(it || {}) };
      if (x.fecha && x.fecha.toDate) x.fecha = formatDateToInput(x.fecha.toDate());
      if (x.fecha instanceof Date)   x.fecha = formatDateToInput(x.fecha);
      x.productos = Array.isArray(x.productos) ? x.productos.map(p => ({
        nombre: String(p?.nombre || '').trim(),
        precio: Number(p?.precio || 0),
        descripcion: p?.descripcion ? String(p.descripcion) : ''
      })) : [];
      if (typeof x._notificacionDescartada !== 'boolean') x._notificacionDescartada = false;
      if (typeof x.completada !== 'boolean') x.completada = false;
      
      // 👇 NUEVO: Asignar permisos según lo que respondió el usuario 👇
      if (compartirConPareja && correoPareja) {
        x.accessList = [miCorreo, correoPareja];
      } else {
        x.accessList = [miCorreo];
      }
      
      return x;
    });

    // 3) Mezclar contra lo que ya existe en cache (por id o por lugar+fecha)
    const toPersist = []; // [{ finalId, data }] para cache/IDB
    const toUpload  = []; // [{ localId, data }] para nube/colas

    for (const incoming of norm) {
      const dupe = findDuplicateLocal(incoming);
      if (dupe) {
        const merged = mergeList(dupe, incoming);
        const finalId = dupe.id;               // mantenemos el id del existente
        listasCache.set(finalId, { id: finalId, ...merged });
        toPersist.push({ finalId, data: merged });
        toUpload.push({ localId: finalId, data: merged, hasStableId: true });
      } else {
        // nuevo: si viene id estable, lo respetamos ONLINE; offline lo trataremos como create
        let localId = (incoming.id && typeof incoming.id === 'string') ? incoming.id : `tmp_${generateClientId()}`;
        listasCache.set(localId, { id: localId, ...incoming });
        toPersist.push({ finalId: localId, data: incoming });
        toUpload.push({ localId, data: incoming, hasStableId: !!incoming.id && !String(incoming.id).startsWith('tmp_') });
      }
    }

    // 4) Persistir local y refrescar UI / timers
    await persistCacheToIndexedDB();
    if (isLeaderTab) rebuildScheduledTimeoutsFromStorage();
    debouncedMostrarListas();
    debouncedActualizarNotificaciones();
    mostrarMensaje(`Importación local completa. (${toPersist.length} elemento(s))`, "success");

    if (!pushToCloud) return;

    // 5) Si hay conexión: SUBIR (upsert). Respeta mezcla que ya hicimos.
    if (navigator.onLine && canUseFirestore()) {
      try {
        const batch = writeBatch(db);
        const remap = {};

        for (const { localId, data, hasStableId } of toUpload) {
          if (hasStableId) {
            // upsert por id existente o nuevo con ese id
            batch.set(doc(db, 'listas', localId), data);
            remap[localId] = localId;
          } else {
            const ref = doc(collection(db, 'listas'));
            batch.set(ref, data);
            remap[localId] = ref.id;
          }
        }

        bumpSyncLock();
        await batch.commit();
        incrClientWriteCounter(toUpload.length);

        // remapear ids locales tmp_ -> ids reales
        for (const { localId, data } of toUpload) {
          const newId = remap[localId];
          if (!newId || newId === localId) {
            const merged = { id: localId, ...data };
            listasCache.set(localId, merged);
            await saveOneToIndexedDB(merged).catch(()=>{});
            continue;
          }
          const merged = { id: newId, ...data };
          listasCache.delete(localId);
          await deleteOneFromIndexedDB(localId).catch(()=>{});
          listasCache.set(newId, merged);
          await saveOneToIndexedDB(merged).catch(()=>{});
          try { migrateScheduledMap(localId, newId); } catch {}
        }

        await schedulePersistCacheToIndexedDB().catch(()=>{});
        debouncedMostrarListas();
        debouncedActualizarNotificaciones();
        mostrarMensaje("Importación subida a la nube.", "success");
      } catch (e) {
        console.error(e);
        mostrarMensaje("No se pudo subir a la nube la importación (error).", "error");
      }
      return;
    }

    // 6) OFFLINE: encolar para sincronizar luego
    try {
      const updates = loadPendingUpdates();
      const creates = loadPendingCreates();

      for (const { localId, data, hasStableId } of toUpload) {
        const existsLocal = listasCache.has(localId);

        if (hasStableId && existsLocal) {
          // si existe en cache con ese id, lo tratamos como update diferido
          updates[localId] = { ...(updates[localId] || {}), ...data };
        } else {
          // create diferido SIEMPRE (ignoramos id entrante en offline para evitar update inexistente)
          const clientId = localId.startsWith('tmp_') ? localId.slice(4) : generateClientId();
          const payload = { ...data, clientId };
          delete payload.id; // que la nube genere id real al subir
          if (!creates.some(c => c?.clientId === clientId)) creates.push(payload);
        }
      }

      savePendingUpdates(updates);
      savePendingCreates(creates);
      mostrarMensaje("Sin conexión: importación quedará en cola y se subirá al reconectar.", "offline");
    } catch (e) {
      console.error("Error encolando importación offline:", e);
      mostrarMensaje("Importación local hecha, pero no se pudo encolar para subir.", "error");
    }
  } catch (e) {
    console.error(e);
    mostrarMensaje("Error importando: " + (e.message || e), "error");
  }
};

// === Validador de backups (scope global) ===
(function () {
  function isISODate(str) {
    if (typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
    const [y, m, d] = str.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dt instanceof Date && !isNaN(dt) &&
           dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
  }

  function validarProducto(p, idxLista, idxProd) {
    const errs = [];
    const warns = [];
    if (typeof p !== 'object' || p === null) {
      errs.push(`#${idxLista}: productos[${idxProd}] no es un objeto`);
      return { errs, warns };
    }
    if (!p.nombre || typeof p.nombre !== 'string' || !p.nombre.trim()) {
      errs.push(`#${idxLista}: productos[${idxProd}].nombre debe ser string no vacío`);
    }
    const precioRaw = p.precio;
    const num = (typeof precioRaw === 'number')
      ? precioRaw
      : (typeof precioRaw === 'string' ? Number(precioRaw.replace(',', '.')) : NaN);
    if (!Number.isFinite(num) || num < 0) {
      errs.push(`#${idxLista}: productos[${idxProd}].precio debe ser número >= 0 (recibido: ${JSON.stringify(precioRaw)})`);
    } else if (typeof precioRaw === 'string') {
      warns.push(`#${idxLista}: productos[${idxProd}].precio es string numérico; se convertirá a número`);
    }
    if (p.descripcion != null && typeof p.descripcion !== 'string') {
      errs.push(`#${idxLista}: productos[${idxProd}].descripcion debe ser string si existe`);
    }
    return { errs, warns };
  }

  function validarLista(it, idx) {
    const errors = [];
    const warnings = [];

    if (typeof it !== 'object' || it === null) {
      errors.push(`#${idx}: elemento no es un objeto`);
      return { errors, warnings };
    }
    if (it.id != null && typeof it.id !== 'string') {
      errors.push(`#${idx}: id debe ser string si existe`);
    }
    if (!it.lugar || typeof it.lugar !== 'string' || !it.lugar.trim()) {
      errors.push(`#${idx}: lugar es requerido (string no vacío)`);
    }
    if (!it.fecha || typeof it.fecha !== 'string') {
      errors.push(`#${idx}: fecha es requerida (string 'YYYY-MM-DD')`);
    } else if (!isISODate(it.fecha)) {
      errors.push(`#${idx}: fecha inválida (${JSON.stringify(it.fecha)}), se espera 'YYYY-MM-DD' real`);
    }

    if (!Array.isArray(it.productos)) {
      errors.push(`#${idx}: productos debe ser un arreglo`);
    } else {
      if (it.productos.length === 0) {
        warnings.push(`#${idx}: productos vacío — se permitirá, pero revisa si es intencional`);
      }
      it.productos.forEach((p, j) => {
        const { errs, warns } = validarProducto(p, idx, j);
        errors.push(...errs);
        warnings.push(...warns);
      });
    }

    ['_notificacionDescartada','completada','pagoMensual','isEvento'].forEach(f => {
      if (it[f] != null && typeof it[f] !== 'boolean') {
        errors.push(`#${idx}: ${f} debe ser boolean si existe`);
      }
    });

    if (it.estado != null) {
      const ok = ['pendiente','normal','expirada','caducado'];
      if (!ok.includes(String(it.estado))) {
        errors.push(`#${idx}: estado debe ser uno de ${ok.join(', ')}`);
      }
    }

    if (it.createdAt != null && typeof it.createdAt === 'object') {
      warnings.push(`#${idx}: createdAt parece objeto (posible Timestamp); se ignorará/normalizará al importar`);
    }
    if (it.createdAtClient != null && typeof it.createdAtClient !== 'string') {
      warnings.push(`#${idx}: createdAtClient no es string; se sobrescribirá al importar`);
    }

    return { errors, warnings };
  }

  function validarEstructuraBackup(json) {
    const errors = [];
    const warnings = [];
    const stats = { listas: 0, productos: 0 };

    if (!Array.isArray(json)) {
      errors.push('La raíz debe ser un arreglo de listas.');
      return { errors, warnings, stats };
    }

    json.forEach((it, idx) => {
      const { errors: e2, warnings: w2 } = validarLista(it, idx);
      errors.push(...e2);
      warnings.push(...w2);
      stats.listas += 1;
      if (Array.isArray(it?.productos)) stats.productos += it.productos.length;
    });

    return { errors, warnings, stats };
  }

  // 👇 Exponer globalmente para que el botón lo encuentre
  window.validarEstructuraBackup = validarEstructuraBackup;
})();

/* ==== Validar JSON: SOLO en la sección #verListas ==== */
(function mountValidateJsonOnlyInVerListas(){
  const SECTION_ID = 'verListas';
  const IMPORT_ID = 'btnImportarJSON';
  const EXPORT_ID = 'btnExportarJSON';
  const VALIDATE_ID = 'btnValidarJSON';
  const HIDDEN_INPUT_ID = 'inputValidarJSONHidden';

  // Crea el botón/input si no existen (no lo inserta aún)
  function ensureControls() {
    let btn = document.getElementById(VALIDATE_ID);
    if (!btn) {
      btn = document.createElement('button');
      btn.id = VALIDATE_ID;
      btn.type = 'button';
      btn.className = 'btn btn--secondary';
      btn.textContent = 'Validar JSON';
      // etiqueta para poder identificarlo y moverlo de forma segura
      btn.dataset.scope = 'verListas';
    }

    let fileInput = document.getElementById(HIDDEN_INPUT_ID);
    if (!fileInput) {
      fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = '.json,application/json';
      fileInput.id = HIDDEN_INPUT_ID;
      fileInput.style.display = 'none';
      document.body.appendChild(fileInput);
    }

    // wiring (reutiliza tu validador)
    btn.onclick = () => fileInput.click();
    fileInput.onchange = async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        let json;
        try { json = JSON.parse(text); }
        catch (e) {
          mostrarMensaje('El archivo no es JSON válido.', 'error');
          alert('❌ Error: JSON mal formado.\n\nDetalle: ' + (e.message || e));
          fileInput.value = ''; return;
        }
        if (typeof validarEstructuraBackup !== 'function') {
          mostrarMensaje('No se encontró el validador (validarEstructuraBackup).', 'error');
          fileInput.value = ''; return;
        }
        const result = validarEstructuraBackup(json);
        if (result.errors.length === 0) {
          const msg = `Compatible ✅ | Listas: ${result.stats.listas} · Productos: ${result.stats.productos}` +
                      (result.warnings.length ? ` · Advertencias: ${result.warnings.length}` : '');
          mostrarMensaje(msg, 'success');
          if (result.warnings.length) {
            console.warn('Advertencias:', result.warnings);
            alert('⚠️ Advertencias (no bloquean):\n\n' + result.warnings.slice(0, 40).join('\n'));
          }
        } else {
          mostrarMensaje(`Archivo incompatible ❌ · Errores: ${result.errors.length}`, 'error');
          console.error('Errores de validación:', result.errors);
          alert('❌ Errores (primeras 40):\n\n' + result.errors.slice(0, 40).join('\n'));
        }
      } catch (e) {
        console.error(e);
        mostrarMensaje('No se pudo validar el archivo.', 'error');
        alert('❌ Error al validar: ' + (e.message || e));
      } finally {
        fileInput.value = '';
      }
    };

    return { btn, fileInput };
  }

  // Inserta el botón SOLO dentro de #verListas, al lado de Importar/Exportar
// ⬇️ Reemplaza COMPLETA esta función dentro de mountValidateJsonOnlyInVerListas
function placeInVerListas() {
  const section = document.getElementById('verListas');
  if (!section) return false; // no existe la sección

  // Asegura los controles listos (crea botón e input si no existen y les conecta handlers)
  const { btn } = ensureControls();

  // Si ya está dentro de #verListas, listo
  if (btn.parentElement && section.contains(btn)) return true;

  // Intenta ubicarse junto a Importar/Exportar si existen
  const importBtn = section.querySelector('#btnImportarJSON');
  const exportBtn = section.querySelector('#btnExportarJSON');

  let container = null;
  if (importBtn && exportBtn && importBtn.parentElement === exportBtn.parentElement) {
    container = importBtn.parentElement;
  } else {
    container = exportBtn?.parentElement || importBtn?.parentElement || null;
  }

  if (container) {
    // Inserta después de Exportar si existe, si no, después de Importar
    if (exportBtn) {
      container.insertBefore(btn, exportBtn.nextSibling);
    } else {
      container.insertBefore(btn, importBtn.nextSibling);
    }
  } else {
    // 📌 Fallback robusto: colócalo arriba de la UL de listas, o al inicio de la sección
    const ulListas = section.querySelector('#todasLasListas');
    if (ulListas && ulListas.parentElement === section) {
      section.insertBefore(btn, ulListas);
    } else {
      section.prepend(btn);
    }
  }

  // Asegura layout en línea si el contenedor es un bloque
  const parent = btn.parentElement;
  try {
    const cs = getComputedStyle(parent);
    if (cs.display === 'block') {
      parent.style.display = 'flex';
      parent.style.flexWrap = 'wrap';
      parent.style.gap = parent.style.gap || '8px';
    }
  } catch {}

  return true;
}

  // Quita el botón si quedó montado fuera de #verListas
  function removeIfOutside() {
    const btn = document.getElementById(VALIDATE_ID);
    if (btn && btn.dataset.scope === 'verListas') {
      const section = document.getElementById(SECTION_ID);
      if (!section || !section.contains(btn)) {
        btn.remove();
      }
    }
  }

  // Intenta colocar al cargar
  function init() {
  // 🔧 Limpia cualquier botón/input que hayan creado los IIFEs viejos fuera de #verListas
  try {
    document.querySelectorAll('#btnValidarJSON').forEach(el => {
      if (!document.getElementById('verListas')?.contains(el)) el.remove();
    });
    // si existiera un input oculto suelto, lo dejamos (es único y reutilizable),
    // pero si quieres ser estricto:
    // const inp = document.getElementById('inputValidarJSONHidden');
    // if (inp && !document.body.contains(inp)) inp.remove();
  } catch(_) {}

  if (!placeInVerListas()) {
  const mo = new MutationObserver(() => {
    if (placeInVerListas()) mo.disconnect();
  });
  mo.observe(document.body, { childList: true, subtree: true });
  // auto-desconectar después de 5s si no pudo montarse
    setTimeout(() => mo.disconnect(), 5000);
  }
}

  // Hook: cuando navegas entre secciones, asegura que solo viva en #verListas
  const origMostrarSeccion = window.mostrarSeccion;
  window.mostrarSeccion = function(id){
    try { if (typeof origMostrarSeccion === 'function') origMostrarSeccion(id); }
    finally {
      if (id === SECTION_ID) {
        placeInVerListas();
      } else {
        removeIfOutside();
      }
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

/* ======= RENDER: PANTALLA DE INICIO (DASHBOARD) ======= */
function renderInicio() {
  const containerMensuales = document.getElementById("listaInicioMensuales");
  const containerProximos = document.getElementById("listaInicioProximos");
  const containerTotal = document.getElementById("totalMensualInicio");
  
  if (!containerMensuales || !containerProximos || !containerTotal) return;

  let totalMensual = 0;
  let mensuales = [];
  let proximos = [];
  const hoy = startOfDay(new Date());

  // 1. Clasificar listas
  Array.from(listasCache.values()).forEach(lista => {
    const f = parseFechaFromString(lista.fecha);
    const listTotal = (lista.productos || []).reduce((sum, p) => sum + (p.precio || 0), 0);

    if (lista.pagoMensual) {
      // Todos los pagos mensuales se suman y se muestran
      mensuales.push(lista);
      totalMensual += listTotal;
    } else if (!lista.completada && !lista._notificacionDescartada) {
      // Listas normales o eventos que sean de hoy o a futuro
      if (f && startOfDay(f).getTime() >= hoy.getTime()) {
        proximos.push(lista);
      }
    }
  });

  // 2. Ordenar por fecha (los más urgentes arriba)
  mensuales.sort((a, b) => parseFechaFromString(a.fecha) - parseFechaFromString(b.fecha));
  proximos.sort((a, b) => parseFechaFromString(a.fecha) - parseFechaFromString(b.fecha));

  // 3. Imprimir el total mensual
  containerTotal.textContent = `$${totalMensual.toFixed(2)}`;

  // 4. Helper para dibujar cada elemento
  const generarHTMLItem = (lista) => {
    const dias = calcularDiasRestantes(parseFechaFromString(lista.fecha));
    const colors = colorForDias(dias);
    const listTotal = (lista.productos || []).reduce((sum, p) => sum + (p.precio || 0), 0).toFixed(2);
    
    const estadoTexto = dias === 0 ? "Vence hoy" : dias < 0 ? `Venció hace ${Math.abs(dias)} día(s)` : `Vence en ${dias} día(s)`;
    const badge = lista.isEvento ? '<span style="color:#8b5cf6; font-size:0.85em; font-weight:bold; margin-left:6px;">🎉 EVENTO</span>' : '';

    return `
      <li class="lista-item resumen" style="border-left:6px solid ${colors.border}; margin-bottom:10px; cursor:pointer;" onclick="irAListaPorId('${lista.id}')">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; width:100%;">
          <div style="flex:1; padding-right:10px;">
             <div style="font-size:1.1em; font-weight:bold; color:#111827; line-height:1.2;">
               ${escapeHtml(lista.lugar)} ${badge}
             </div>
             <div style="color:#6b7280; font-size:0.85em; margin-top:4px;">
               📅 ${formatearFecha(lista.fecha)} — <span style="color:${colors.border}; font-weight:600;">${estadoTexto}</span>
             </div>
          </div>
          <div style="text-align:right; white-space:nowrap;">
             <div style="font-size:1.1em; font-weight:bold; color:#059669;">
               $${listTotal}
             </div>
          </div>
        </div>
      </li>
    `;
  };

  // 5. Inyectar al HTML
  containerMensuales.innerHTML = mensuales.length 
    ? mensuales.map(generarHTMLItem).join('') 
    : '<li style="color:#6b7280; font-size:0.9em; padding: 10px;">No hay pagos mensuales registrados.</li>';

  const proximosLimitados = proximos.slice(0, 5); // Mostrar solo las próximas 5
  containerProximos.innerHTML = proximosLimitados.length
    ? proximosLimitados.map(generarHTMLItem).join('')
    : '<li style="color:#6b7280; font-size:0.9em; padding: 10px;">No hay listas o eventos próximos.</li>';
    // 👇 AGREGA ESTO AQUÍ 👇
  if (typeof renderGraficaGastos === 'function') {
    // Le damos un mini respiro de 50ms para que el HTML cargue antes de dibujar el canvas
    setTimeout(renderGraficaGastos, 50); 
  }
}

/* ======= MODO OSCURO (THEME TOGGLE) ACTUALIZADO ======= */
function updateFlatpickrTheme(isDark) {
  const flatpickrCss = document.getElementById('flatpickr-theme-css');
  if (flatpickrCss) {
    if (isDark) {
      flatpickrCss.href = "https://cdn.jsdelivr.net/npm/flatpickr/dist/themes/dark.css";
    } else {
      flatpickrCss.href = "https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css";
    }
  }
}

function initTheme() {
  const savedTheme = localStorage.getItem('listas_theme');
  const btnIcon = document.querySelector('#btnThemeToggle i');
  const isDark = savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches);
  
  if (isDark) {
    document.body.classList.add('dark-mode');
    if(btnIcon) { btnIcon.classList.remove('fa-moon'); btnIcon.classList.add('fa-sun'); }
  }
  updateFlatpickrTheme(isDark); // <--- Actualiza calendario al iniciar
}

function toggleTheme() {
  const isDark = document.body.classList.toggle('dark-mode');
  const btnIcon = document.querySelector('#btnThemeToggle i');
  
  if (isDark) {
    localStorage.setItem('listas_theme', 'dark');
    if(btnIcon) { btnIcon.classList.remove('fa-moon'); btnIcon.classList.add('fa-sun'); }
  } else {
    localStorage.setItem('listas_theme', 'light');
    if(btnIcon) { btnIcon.classList.remove('fa-sun'); btnIcon.classList.add('fa-moon'); }
  }
  updateFlatpickrTheme(isDark); // <--- Cambia calendario al presionar el botón
  // 👇 AGREGA ESTA LÍNEA PARA QUE LA GRÁFICA SE ADAPTE AL MODO OSCURO 👇
  if (typeof renderGraficaGastos === 'function') renderGraficaGastos();
}
// Ejecutar al cargar la página para aplicar el color de inmediato
initTheme();

/* ======= COMPARTIR POR WHATSAPP ======= */
function compartirPorWhatsApp(id) {
  const lista = listasCache.get(id);
  if (!lista) return mostrarMensaje("No se encontró la lista.", "error");

  // 1. Título y fecha
  let mensaje = `🛒 *${lista.lugar || "Lista de Compras"}*\n`;
  mensaje += `📅 ${formatearFecha(lista.fecha)}\n\n`;

  // 2. Productos
  if (Array.isArray(lista.productos) && lista.productos.length > 0) {
    lista.productos.forEach(p => {
      // Formato: "- Producto ($Precio) nota"
      const precioStr = p.precio > 0 ? ` ($${Number(p.precio).toFixed(2)})` : "";
      const descStr = p.descripcion ? ` _${p.descripcion}_` : "";
      // Usamos un check ✅ si está "tachado" (aunque aquí no guardamos estado individual, simulamos viñeta)
      mensaje += `▫️ ${p.nombre}${precioStr}${descStr}\n`;
    });
  } else {
    mensaje += "_Sin productos_\n";
  }

  // 3. Total
  const total = (lista.productos || []).reduce((s, p) => s + (Number(p.precio) || 0), 0);
  mensaje += `\n💰 *Total: $${total.toFixed(2)}*`;

  // 4. Crear Link
  const url = `https://wa.me/?text=${encodeURIComponent(mensaje)}`;
  window.open(url, '_blank');
}

/* ======= TOTAL EN VIVO (Formulario) ======= */
function actualizarTotalLive() {
  const precios = document.querySelectorAll('#productos .producto-precio');
  let total = 0;
  precios.forEach(input => {
    const val = parseFloat(input.value.replace(',', '.'));
    if (!isNaN(val)) total += val;
  });
  const liveTotalEl = document.getElementById('liveTotal');
  if (liveTotalEl) liveTotalEl.textContent = total.toFixed(2);
}

/* ======= AUTENTICACIÓN CON GOOGLE ======= */
function iniciarEscuchaAuth() {
  if (!auth) return;
  
  onAuthStateChanged(auth, async (user) => {
    const prevUser = currentUser;
    currentUser = user;
    const btnLogin = document.getElementById("btnLogin");
    const btnLogout = document.getElementById("btnLogout");
    const userAvatar = document.getElementById("userAvatar");

    if (user) {
      btnLogin.style.display = "none";
      btnLogout.style.display = "inline-flex";
      userAvatar.src = user.photoURL;
      userAvatar.style.display = "block";
      mostrarMensaje(`Hola, ${user.displayName.split(' ')[0]} 👋`, "success");
      
      // Reiniciar conexión para traer solo sus listas
      stopListasListener();
      startListasListener();
    } else {
      btnLogin.style.display = "inline-flex";
      btnLogout.style.display = "none";
      userAvatar.style.display = "none";
      
      // 👇 NUEVO: Siempre borramos y ocultamos las listas si no hay usuario logueado
      stopListasListener();
      listasCache.clear();
      await saveAllToIndexedDB([]); // Borra la memoria offline
      mostrarListasFirebase(true);  // Limpia la sección "Ver Listas"
      renderInicio();               // Limpia el Dashboard de inicio
      actualizarNotificaciones();   // Limpia las notificaciones
    }
  });
}

async function loginConGoogle() {
  if (!auth) return mostrarMensaje("Conectando con el servidor...", "info");
  try {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  } catch (error) {
    console.error("Error login:", error);
    mostrarMensaje("No se pudo iniciar sesión", "error");
  }
}

async function logout() {
  if (!auth) return;
  try {
    await signOut(auth);
    mostrarMensaje("Sesión cerrada", "info");
  } catch (error) {
    console.error("Error logout:", error);
  }
}

/* ======= AUTOCOMPLETADO DE LUGARES ======= */
function actualizarSugerenciasLugares() {
  const dl = document.getElementById("listaLugares");
  if (!dl) return;
  const lugaresGuardados = new Set();
  
  // Extraer nombres únicos de lugares
  listasCache.forEach(lista => {
    if (lista.lugar && lista.lugar.trim() !== "") {
      lugaresGuardados.add(lista.lugar.trim());
    }
  });

  // Llenar el datalist
  dl.innerHTML = "";
  lugaresGuardados.forEach(lugar => {
    const option = document.createElement("option");
    option.value = lugar;
    dl.appendChild(option);
  });
}

/* ======= COMPARTIR LISTA CON OTRO USUARIO ======= */
async function compartirListaConEmail(id) {
  if (!currentUser) return mostrarMensaje("Debes iniciar sesión para compartir", "error");
  if (!navigator.onLine || !canUseFirestore()) return mostrarMensaje("Necesitas internet para compartir", "offline");

  const emailAmigo = prompt("Ingresa el correo de Google de la persona con la que quieres compartir esta lista:");
  if (!emailAmigo || !emailAmigo.includes('@')) return;

  try {
    const docRef = doc(db, "listas", id);
    // arrayUnion añade el correo sin borrar los que ya están
    await updateDoc(docRef, {
      accessList: arrayUnion(emailAmigo.trim().toLowerCase())
    });
    mostrarMensaje(`¡Lista compartida con ${emailAmigo}!`, "success");
  } catch (e) {
    console.error(e);
    mostrarMensaje("Error al compartir la lista", "error");
  }
}

/* ======= VINCULAR CUENTA AUTOMÁTICA ======= */
function vincularCuenta() {
  const actual = localStorage.getItem("correoPareja") || "";
  const email = prompt("Ingresa el correo de tu pareja. Todas tus listas nuevas se compartirán automáticamente con esta persona:\n\n(Para desvincular, deja esto en blanco y dale a Aceptar)", actual);
  
  if (email === null) return; // Si le da a cancelar, no hace nada
  
  if (email.trim() === "") {
    localStorage.removeItem("correoPareja");
    mostrarMensaje("Vinculación automática desactivada", "info");
  } else if (email.includes('@')) {
    localStorage.setItem("correoPareja", email.trim().toLowerCase());
    mostrarMensaje(`¡Cuentas vinculadas! Ahora compartes todo con ${email}`, "success");
  } else {
    mostrarMensaje("Correo no válido", "error");
  }
  actualizarBotonVinculacion(); // Actualiza el texto del menú
}

// NUEVA FUNCIÓN: Cambia el texto del menú según el estado
function actualizarBotonVinculacion() {
  const btn = document.getElementById("btnVincular");
  if (!btn) return;
  const pareja = localStorage.getItem("correoPareja");
  if (pareja) {
    // Si hay pareja, mostramos su nombre (lo que está antes del @)
    const nombre = pareja.split('@')[0];
    btn.innerHTML = `<i class="fas fa-user-check" aria-hidden="true" style="color: var(--accent);"></i> Emparejado: ${nombre}`;
  } else {
    btn.innerHTML = `<i class="fas fa-user-friends" aria-hidden="true"></i> Vincular Pareja`;
  }
}

/* ======= MODO SUPERMERCADO (TACHAR PRODUCTOS) ======= */
window.toggleProductoComprado = async function(listaId, originalIndex, liElement) {
  if (event) event.stopPropagation(); // Evita que se cierre el acordeón de la lista al hacer clic
  
  const lista = listasCache.get(listaId);
  if (!lista || !lista.productos || !lista.productos[originalIndex]) return;

  // Invertir el estado
  const nuevoEstado = !lista.productos[originalIndex].comprado;
  lista.productos[originalIndex].comprado = nuevoEstado;

  // 1. Actualizar la interfaz inmediatamente (Cero lag)
  if (nuevoEstado) {
    liElement.classList.add('producto-comprado');
    liElement.querySelector('.check-icon').innerHTML = '<i class="fa-solid fa-circle-check" style="color:#10b981;"></i>';
  } else {
    liElement.classList.remove('producto-comprado');
    liElement.querySelector('.check-icon').innerHTML = '<i class="fa-regular fa-circle" style="color:#9ca3af;"></i>';
  }

  // 2. Guardar silenciosamente en la caché (Sin mensajes flotantes)
  const payload = { productos: lista.productos };
  listasCache.set(listaId, { ...lista, ...payload });
  schedulePersistCacheToIndexedDB().catch(()=>{});

  // 3. Sincronizar en la nube o local en segundo plano
  if (navigator.onLine && typeof updateDoc === 'function' && db) {
    try {
      const docRef = doc(db, "listas", listaId);
      updateDoc(docRef, payload).catch(()=>{});
    } catch(e) {}
  } else {
    const updates = loadPendingUpdates();
    updates[listaId] = { ...(updates[listaId] || {}), ...payload };
    savePendingUpdates(updates);
  }
};

/* ======= DASHBOARD FINANCIERO (CHART.JS) ======= */
let gastosChartInstance = null;

window.renderGraficaGastos = function() {
  const ctx = document.getElementById('gastosChart');
  if (!ctx || typeof Chart === 'undefined') return;

  // 1. Preparar los últimos 6 meses
  const mesesNombres = [];
  const totales = [0, 0, 0, 0, 0, 0];
  const hoy = new Date();

  for (let i = 5; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    // Ej: "FEB", "MAR"
    mesesNombres.push(d.toLocaleString('es-ES', { month: 'short' }).toUpperCase());
  }

  // 2. Sumar los gastos de la caché
  Array.from(listasCache.values()).forEach(lista => {
    if (!lista.fecha || lista._notificacionDescartada) return; // Ignorar descartadas
    
    const f = parseFechaFromString(lista.fecha);
    if (!f) return;

    const diffMonths = (hoy.getFullYear() - f.getFullYear()) * 12 + (hoy.getMonth() - f.getMonth());

    // Si el gasto ocurrió en los últimos 6 meses (0 = este mes, 5 = hace 5 meses)
    if (diffMonths >= 0 && diffMonths <= 5) {
      const totalLista = (lista.productos || []).reduce((sum, p) => sum + (Number(p.precio) || 0), 0);
      const index = 5 - diffMonths;
      totales[index] += totalLista;
    }
  });

  // 3. Estilos adaptables (Modo Claro / Oscuro)
  const isDark = document.body.classList.contains('dark-mode');
  const textColor = isDark ? '#9ca3af' : '#6b7280';
  const gridColor = isDark ? '#374151' : '#e5e7eb';

  // 4. Destruir gráfica anterior si existe (para evitar superposición al actualizar)
  if (gastosChartInstance) {
    gastosChartInstance.destroy();
  }

  // 5. Dibujar la nueva gráfica
  gastosChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: mesesNombres,
      datasets: [{
        label: 'Gastos del Mes ($)',
        data: totales,
        backgroundColor: '#3b82f6', // Azul bonito
        borderRadius: 4,            // Bordes redondeados
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(context) {
              return ' $' + context.raw.toFixed(2);
            }
          }
        }
      },
      scales: {
        y: { 
          beginAtZero: true,
          ticks: { color: textColor },
          grid: { color: gridColor }
        },
        x: {
          ticks: { color: textColor },
          grid: { display: false }
        }
      }
    }
  });
};

// Exponer globalmente
window.vincularCuenta = vincularCuenta;
window.actualizarBotonVinculacion = actualizarBotonVinculacion;
window.compartirListaConEmail = compartirListaConEmail;
window.actualizarSugerenciasLugares = actualizarSugerenciasLugares;
window.loginConGoogle = loginConGoogle;
window.logout = logout;
window.actualizarTotalLive = actualizarTotalLive;
window.compartirPorWhatsApp = compartirPorWhatsApp;
window.toggleTheme = toggleTheme;
window.renderInicio = renderInicio;
window.agregarProducto = agregarProducto;
window.eliminarProducto = eliminarProducto;
window.alternarDetalle = alternarDetalle;
window.eliminarLista = eliminarLista;
window.seleccionarSugerencia = seleccionarSugerencia;
window.editarLista = editarLista;
window.cargarMasListas = cargarMasListas;
window.actualizarNotificaciones = actualizarNotificaciones;
window.mostrarListasFirebase = mostrarListasFirebase;
window.irAListaPorId = function(id){ mostrarSeccion("verListas"); setTimeout(()=>{ const elemento = document.querySelector(`#todasLasListas li[data-id="${id}"]`); if (elemento) elemento.scrollIntoView({behavior:"smooth", block:"center"}); },200); };
window.toggleProductosExtra = toggleProductosExtra;



/* FIN del archivo */
