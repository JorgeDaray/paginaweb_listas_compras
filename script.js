// ---------- Inicio modificado de script.js (dynamic firebase loader) ----------
/*
  Antes tenías imports estáticos. Los convertimos a dinámica para:
   - permitir que la app cargue aunque no se puedan descargar los módulos (modo offline)
   - seguir funcionando cuando el SW entregue los módulos cacheados
*/

let firebaseLoaded = false;
let initializeApp, getAnalytics, getFirestore, collection, addDoc, query, orderBy, limit, deleteDoc,
    doc, updateDoc, serverTimestamp, getDoc, onSnapshot, enableIndexedDbPersistence;

let db = null;
let analytics = null;

async function initFirebase() {
  // evita reintentar si ya cargó
  if (firebaseLoaded) return true;
  try {
    // Cargar módulos dinámicamente (se servirán desde caché si el SW los guardó)
    const modApp = await import("https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js");
    const modAnalytics = await import("https://www.gstatic.com/firebasejs/12.0.0/firebase-analytics.js");
    const modFirestore = await import("https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js");

    // asignar referencias
    initializeApp = modApp.initializeApp;
    getAnalytics = modAnalytics.getAnalytics;
    getFirestore = modFirestore.getFirestore;
    collection = modFirestore.collection;
    addDoc = modFirestore.addDoc;
    query = modFirestore.query;
    orderBy = modFirestore.orderBy;
    limit = modFirestore.limit;
    deleteDoc = modFirestore.deleteDoc;
    doc = modFirestore.doc;
    updateDoc = modFirestore.updateDoc;
    serverTimestamp = modFirestore.serverTimestamp;
    getDoc = modFirestore.getDoc;
    onSnapshot = modFirestore.onSnapshot;
    enableIndexedDbPersistence = modFirestore.enableIndexedDbPersistence;

    // inicializar app/analytics/db
    const app = initializeApp(firebaseConfig);
    try { analytics = getAnalytics(app); } catch (e) { /* analytics puede fallar en algunos entornos */ }
    db = getFirestore(app);

    firebaseLoaded = true;
    console.log("Firebase cargado dinámicamente.");
    return true;
  } catch (err) {
    console.warn("No se pudo cargar Firebase dinámicamente. Modo offline parcial activado.", err && err.message ? err.message : err);
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

/* ======= CONFIG Y CONSTANTES (asegúrate de tener definidas estas variables en tu entorno) ======= */
const IDB_DB_NAME = 'listas_db_v1';
const IDB_VERSION = 1;
const IDB_STORE = 'listas_store_v1';
const LISTAS_CACHE_KEY_LEGACY = 'listas_cache_legacy_v1';
const STORAGE_KEY_SCHEDULE = 'listas_schedule_map_v1';
const NOTIFY_OFFSETS_DAYS = [0,1,3]; // offsets que ya tenías (ejemplo)
const NOTIFY_HOUR = 9; // hora por defecto para la notificación (si lo usas)
const MAX_NOTIFY_WINDOW_DAYS = 365; // ejemplo máximo

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
  // Si ya hay programado, limpia todos sus timeout ids
  if (_persistScheduled && Array.isArray(_persistScheduled.timeoutIds)) {
    _persistScheduled.timeoutIds.forEach(id => clearTimeout(id));
    _persistScheduled = null;
  }

  return new Promise((resolve) => {
    const timeoutIds = scheduleTimeout(delay, async () => {
      try {
        await persistCacheToIndexedDB();
      } catch (e) {
        console.warn("persistCache error:", e);
      } finally {
        _persistScheduled = null;
        resolve();
      }
    });

    // guarda todos los ids para poder cancelarlos si se vuelve a programar
    _persistScheduled = { timeoutIds };
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

// Máximo que acepta setTimeout en ms (2^31-1)
const MAX_TIMEOUT_MS = 2147483647;

/**
 * scheduleTimeout(delayMs, cb)
 * - Permite programar delays mayores al límite de setTimeout encadenando timeouts.
 * - Devuelve un array con todos los timeoutIds creados (puede ser 1 o varios).
 */
function scheduleTimeout(delayMs, cb) {
  const ids = [];
  // step procesa "remaining" de forma recursiva si es necesario
  function step(remaining) {
    if (remaining <= 0) {
      try { cb(); } catch (e) { console.error("scheduleTimeout cb error:", e); }
      return;
    }
    if (remaining <= MAX_TIMEOUT_MS) {
      ids.push(setTimeout(() => {
        try { cb(); } catch (e) { console.error("scheduleTimeout cb error:", e); }
      }, remaining));
    } else {
      // programar un chunk máximo y volver a llamar
      ids.push(setTimeout(() => step(remaining - MAX_TIMEOUT_MS), MAX_TIMEOUT_MS));
    }
  }
  step(delayMs);
  return ids;
}

/**
 * scheduleAt(timestampMs, cb)
 * - Wrapper que acepta timestamp absoluto (Date.getTime()).
 * - Devuelve array de timeoutIds (posiblemente vacío si el cb se ejecuta inmediatamente).
 */
function scheduleAt(timestampMs, cb) {
  const delay = timestampMs - Date.now();
  if (delay <= 0) {
    // ejecutar en siguiente tick y devolver el id para poder clearTimeout si se quiere
    const id = setTimeout(() => { try { cb(); } catch (e) { console.error("scheduleAt cb error:", e); } }, 0);
    return [id];
  }
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

/* ======= SCHEDULED TIMEOUTS (persistencia simple) ======= */
const scheduledTimeouts = new Map();
function loadScheduledMap() { try { const raw = localStorage.getItem(STORAGE_KEY_SCHEDULE); return raw ? JSON.parse(raw) : {}; } catch(e){ return {}; } }
function saveScheduledMap(map) { try { localStorage.setItem(STORAGE_KEY_SCHEDULE, JSON.stringify(map)); } catch(e){} }
function cancelScheduledNotificationsForList(listId) {
  const arr = scheduledTimeouts.get(listId) || [];
  arr.forEach(id => clearTimeout(id));
  scheduledTimeouts.delete(listId);
  const map = loadScheduledMap();
  if (map[listId]) { delete map[listId]; saveScheduledMap(map); }
}
function cancelAllScheduledNotifications() {
  scheduledTimeouts.forEach((arr, id) => arr.forEach(tid => clearTimeout(tid)));
  scheduledTimeouts.clear();
  saveScheduledMap({});
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
 */
function crearGoogleCalendarLink(lista, opts = { allDay: true, hour: NOTIFY_HOUR || 9, durationMinutes: 60 }) {
  if (!lista || !lista.fecha) return "#";
  const fecha = parseFechaFromString(lista.fecha);
  if (!fecha || isNaN(fecha)) return "#";

  const pad = (n) => String(n).padStart(2, "0");

  // fechas para params (all-day usa YYYYMMDD/YYYYMMDD; con hora usa timestamps ISO sin separadores + Z)
  let startParam, endParam;

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

    // Google acepta formato YYYYMMDDTHHMMSSZ (UTC). Convertimos a UTC ISO con Z.
    const toGCalTs = (dt) => dt.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    startParam = toGCalTs(startDateLocal);
    endParam = toGCalTs(endDateLocal);
  }

  const title = encodeURIComponent(`Lista: ${lista.lugar || "Compras"}`);
  const details = encodeURIComponent(
    (Array.isArray(lista.productos) && lista.productos.length)
      ? lista.productos.map(p => `${p.nombre} — $${(p.precio||0).toFixed(2)}${p.descripcion ? ` (${p.descripcion})` : ""}`).join("\n")
      : "Sin productos detallados."
  );
  const location = encodeURIComponent(lista.lugar || "");

  // Detectar móvil (simpley razonable)
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || "");

  if (isMobile) {
    // Mejor compatibilidad en móvil: usar "render?action=TEMPLATE"
    // params: action=TEMPLATE&text=...&dates=start/end&details=...&location=...
    return `https://www.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startParam}/${endParam}&details=${details}&location=${location}`;
  } else {
    // Escritorio: usar la URL que ya tenías (abre UI web editable)
    return `https://calendar.google.com/calendar/r/eventedit?text=${title}&dates=${startParam}/${endParam}&details=${details}&location=${location}`;
  }

  // Opcional: Android intent fallback (no se usa por defecto, usar sólo si quieres forzar abrir la app)
  // const intentUrl = `intent://calendar.google.com/calendar/r/eventedit?text=${title}&dates=${startParam}/${endParam}&details=${details}&location=${location}#Intent;package=com.google.android.calendar;scheme=https;end`;
  // return intentUrl;
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
  // limpia timers previos
  // limpia timers previos (defensiva: si hay arrays de ids, limpiarlos todos)
  const prevTimers = scheduledTimeouts.get(lista.id) || [];
  prevTimers.forEach(id => {
    try { clearTimeout(id); } catch(e){ /* ignore */ }
  });
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

  // No pedimos permiso al navegador (notificaciones desactivadas). Seguimos guardando timestamps
  const map = loadScheduledMap();
  map[lista.id] = Array.isArray(map[lista.id]) ? map[lista.id] : [];
  const now = Date.now();
  map[lista.id] = map[lista.id].filter(ts => ts > now);
  const existingTimestamps = new Set(map[lista.id]);

  const f = parseFechaFromString(lista.fecha);
  if (!f || isNaN(f)) return;

  const timersForList = [];

  for (const offset of NOTIFY_OFFSETS_DAYS) {
    const notifyDay = addDays(f, -offset);
    const notifyAt = dateAtHour(notifyDay).getTime();
    if (notifyAt <= now) continue;
    if (existingTimestamps.has(notifyAt)) continue;

    // Usamos scheduleAt en vez de setTimeout directo
    const timeoutIds = scheduleAt(notifyAt, async () => {
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
        const dias = offset;
        const title = `Lista: ${listaActual.lugar || "Sin lugar"} vence en ${dias} día(s)`;
        const body = `Fecha: ${formatearFecha(listaActual.fecha)} — Abre la app para ver o marcar como hecha.`;

        // En vez de crear Notification en el navegador, usamos la función in-app
        sendBrowserNotification(title, body, { listaId: listaActual.id });

        // Actualiza UI (badge / lista)
        actualizarNotificaciones();
      } catch(e){ console.error("Error timeout notificación (in-app):", e); }
    });

    // timeoutIds es un array (puede tener varios ids si el delay era muy largo)
    timersForList.push(...timeoutIds);
    map[lista.id].push(notifyAt);
    existingTimestamps.add(notifyAt);
  }

  map[lista.id] = Array.from(new Set(map[lista.id])).filter(ts => ts > Date.now()).sort((a,b)=>a-b);
  scheduledTimeouts.set(lista.id, timersForList);
  saveScheduledMap(map);
}

function rebuildScheduledTimeoutsFromStorage() {
  const map = loadScheduledMap();
  const now = Date.now();
  Object.entries(map).forEach(([listaId, timestamps]) => {
    timestamps = Array.isArray(timestamps) ? timestamps : [];
    const futureTs = timestamps.filter(ts => ts > now);
    if (futureTs.length === 0) { 
      delete map[listaId]; 
      saveScheduledMap(map); 
      return; 
    }

    // Si ya existían timers para esta lista, límpialos (defensivo)
    const prev = scheduledTimeouts.get(listaId) || [];
    prev.forEach(id => { try { clearTimeout(id); } catch(e){} });
    const timersForList = [];

    futureTs.forEach(ts => {
      const timeoutIds = scheduleAt(ts, async () => {
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
        } catch(e){ console.error("Error rebuild scheduled (in-app):", e); } finally { actualizarNotificaciones(); }
      });

      timersForList.push(...timeoutIds);
    });

    scheduledTimeouts.set(listaId, timersForList);
    // guardamos el mapa actualizado (por si eliminamos entradas)
    saveScheduledMap(map);
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

/* ======= MONTHLY HELPERS (usar cache) ======= */
async function advanceMonthlyIfPastForAll() {
  if (!navigator.onLine) return;
  try {
    for (const lista of Array.from(listasCache.values())) {
      if (lista.pagoMensual) {
        let f = parseFechaFromString(lista.fecha);
        const hoy = startOfDay(new Date());
        if (!f) continue;
        let advanced = false;
        while (startOfDay(f).getTime() < hoy.getTime()) {
          f = addMonthsKeepDay(f, 1);
          advanced = true;
        }
        if (advanced) {
          try {
            await updateDoc(doc(db, 'listas', lista.id), { fecha: formatDateToInput(f), _notificacionDescartada: false, estado: 'pendiente', completada: false });
            cancelScheduledNotificationsForList(lista.id);
          } catch(e){ console.error('Error advancing mensual:', e); }
        }
      }
    }
  } catch(e){ console.error('advanceMonthlyIfPastForAll error:', e); }
}

async function advanceMonthlyList(lista) {
  try {
    const f = parseFechaFromString(lista.fecha);
    if (!f) return;
    const nueva = addMonthsKeepDay(f, 1);
    const nuevaStr = formatDateToInput(nueva);
    await updateDoc(doc(db, 'listas', lista.id), { fecha: nuevaStr, _notificacionDescartada: false, estado: 'pendiente', completada: false });
    cancelScheduledNotificationsForList(lista.id);
    if (navigator.onLine && canUseFirestore()) {
      const d = await getDoc(doc(db, "listas", lista.id));
      if (d.exists()) {
        const listaObj = { id: d.id, ...d.data() };
        listasCache.set(listaObj.id, listaObj);
        await schedulePersistCacheToIndexedDB();
        await scheduleNotificationsForList(listaObj);
      }
    }
    mostrarMensaje(`🔁 Pago mensual actualizado a ${formatearFecha(nuevaStr)}`, "success");
  } catch(e){ console.error('advanceMonthlyList error:', e); }
}

/* ======= RENDER: Notificaciones y lista (usando cache) ======= */
function renderBadge(count) {
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
  if (dias <= 3) return { border: "#e53e3e", bg: "#fff5f5" };
  if (dias <= 10) return { border: "#f59e0b", bg: "#fff7ed" };
  return { border: "#10b981", bg: "#f0fdf4" };
}

// --------- Paginación para la lista de notificaciones (mostrar 5 en vez de todas) ----------
let notificacionesMostradasCount = 5; // cuántas notificaciones mostrar inicialmente
const NOTIFICATIONS_PAGE_INCREMENT = 5;

function cargarMasNotificaciones() {
  notificacionesMostradasCount += NOTIFICATIONS_PAGE_INCREMENT;
  // volver a renderizar usando los datos actuales en cache
  const pendientes = Array.from(listasCache.values()).filter(l => esPendientePorFechaOnly(l));
  renderListaNotificaciones(pendientes);
}
function mostrarMenosNotificaciones() {
  notificacionesMostradasCount = NOTIFICATIONS_PAGE_INCREMENT;
  const pendientes = Array.from(listasCache.values()).filter(l => esPendientePorFechaOnly(l));
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
    renderBadge(0);
    return;
  }

  // orden y conteo total
  pendientes.sort((a,b)=> new Date(a.fecha) - new Date(b.fecha));
  const totalCount = pendientes.length;

  // slice para paginación
  const mostradas = pendientes.slice(0, notificacionesMostradasCount);

  // Badge debe reflejar el total pendiente (no la cantidad mostrada)
  renderBadge(totalCount);

  // Renderizar solo las que toca mostrar
  mostradas.forEach(lista => {
    const li = document.createElement("li");
    li.className = "notificacion-item";
    li.dataset.id = lista.id;

    const fecha = parseFechaFromString(lista.fecha);
    const dias = calcularDiasRestantes(fecha);
    const estadoTexto = dias < 0 ? `Vencida hace ${Math.abs(dias)} día(s)` :
                       dias === 0 ? "Vence hoy" :
                       `Vence en ${dias} día(s)`;
    const total = Array.isArray(lista.productos) ? lista.productos.reduce((s,p)=>s+(p.precio||0),0).toFixed(2) : "0.00";

    const productosHTML = (Array.isArray(lista.productos) ? lista.productos : []).map(p => {
      const iconoP = p.precio === 0 ? `<i class="fa-solid fa-hourglass-half" title="Precio 0" style="color: #f59e0b;"></i>` : "";
      return `<li>${escapeHtml(p.nombre)} ${iconoP} — $${(p.precio||0).toFixed(2)}${p.descripcion ? ` — ${escapeHtml(p.descripcion)}` : ""}</li>`;
    }).join("");

    const colors = colorForDias(dias);
    const pagoMensualBadge = lista.pagoMensual ? ' <span style="background:#3b82f6;color:#fff;padding:2px 6px;border-radius:6px;margin-left:8px;font-size:0.8em;">📆 PAGO MENSUAL</span>' : '';

    // Reusar tu helper crearGoogleCalendarLink y descargarICS (siempre abrirá con info)
    // Enlaza directamente a Google Calendar usando la versión "por hora" (opción preferente)
    const calendarBtnHTML = `<a class="btn-google-calendar" href="${crearGoogleCalendarLink(lista, { allDay: false, hour: NOTIFY_HOUR || 9, durationMinutes: 60 })}" target="_blank" rel="noopener noreferrer" style="margin-right:8px;">➕ Añadir a Google Calendar</a>`;
    const icsBtnHTML = `<button type="button" class="btn-download-ics" data-lista-id="${escapeHtml(lista.id)}" style="margin-right:8px;">⬇️ Descargar .ics</button>`;

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
        <ul style="margin-top:6px;">${productosHTML || "<li>(sin productos)</li>"}</ul>
      </div>
    `;

    const accionesHTML = `
      <div class="acciones-panel oculto" id="acciones-${lista.id}" style="margin-top:8px;">
        ${calendarBtnHTML}
        ${icsBtnHTML}
        <button class="accion-marcar" data-id="${lista.id}">Marcar como hecha</button>
        <button class="accion-descartar" data-id="${lista.id}">Descartar</button>
      </div>
    `;

    li.innerHTML = resumenHTML + detalleProductosHTML + accionesHTML;

    li.addEventListener("click", (e) => {
      if (e.target && (e.target.matches("button") || e.target.closest("button") || e.target.closest("a.btn-google-calendar"))) return;
      const panelAcc = li.querySelector(`#acciones-${lista.id}`);
      const panelProd = li.querySelector(`#detalle-productos-${lista.id}`);
      if (panelProd) panelProd.classList.toggle("oculto");
      if (panelAcc) panelAcc.classList.toggle("oculto");
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
    if (navigator.onLine && canUseFirestore()) await advanceMonthlyIfPastForAll();

    let listas = [];
    if (Array.isArray(listasExternas)) listas = listasExternas;
    else {
      listas = Array.from(listasCache.values());
      if (!listas || listas.length === 0) listas = [];
    }

    // marcar expiradas si aplica
    const hoy = startOfDay(new Date());
    for (const l of listas) {
      try {
        const f = parseFechaFromString(l.fecha);
        if (!l.pagoMensual && l.estado === 'pendiente' && f && startOfDay(f).getTime() < hoy.getTime()) {
          l.estado = 'expirada';
          if (navigator.onLine && canUseFirestore()) {
            try { await updateDoc(doc(db, 'listas', l.id), { estado: 'expirada' }); }
            catch(err){ console.error("No se pudo marcar expirada en servidor:", err); }
          } else {
            try {
              listasCache.set(l.id, { ...l, estado: 'expirada' });
              await schedulePersistCacheToIndexedDB();
            } catch(e){ /* ignore */ }
          }
        }
      } catch(e){ console.error("Error procesando expiradas:", e); }
    }

    const pendientesPorFecha = listas.filter(l => esPendientePorFechaOnly(l));
    renderListaNotificaciones(pendientesPorFecha);
    // no pedimos permiso al navegador (notificaciones desactivadas)
    pendientesPorFecha.forEach(lista => scheduleNotificationsForList(lista));
  } catch(e) { console.error("Error actualizarNotificaciones:", e); }
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
      await actualizarNotificaciones();
      mostrarListasFirebase(true);
      return;
    }

    if (navigator.onLine && canUseFirestore()) {
      await updateDoc(doc(db, "listas", id), { estado: "normal", completada: true });
      mostrarMensaje("Lista marcada como hecha (en la nube).", "success");
    } else {
      const updates = loadPendingUpdates();
      updates[id] = { ...(updates[id]||{}), estado: "normal", completada: true };
      savePendingUpdates(updates);
      listasCache.set(id, { ...lista, estado: "normal", completada: true });
      await schedulePersistCacheToIndexedDB();
      mostrarMensaje("Guardado fuera de línea: lista marcada como hecha. Se sincronizará al reconectar.", "offline");
    }
    cancelScheduledNotificationsForList(id);
    await actualizarNotificaciones();
    mostrarListasFirebase(true);
  } catch(e){ mostrarMensaje("Error marcando la lista como hecha", "error"); console.error(e); }
}
async function descartarNotificacion(id) {
  try {
    if (navigator.onLine && canUseFirestore()) {
      await updateDoc(doc(db, "listas", id), { _notificacionDescartada: true });
      mostrarMensaje("Notificación descartada (en la nube).", "success");
    } else {
      const updates = loadPendingUpdates();
      updates[id] = { ...(updates[id]||{}), _notificacionDescartada: true };
      savePendingUpdates(updates);
      const cached = listasCache.get(id);
      if (cached) { cached._notificacionDescartada = true; listasCache.set(id, cached); await schedulePersistCacheToIndexedDB(); }
      mostrarMensaje("Guardado fuera de línea: notificación descartada. Se sincronizará al reconectar.", "offline");
    }
    cancelScheduledNotificationsForList(id);
    actualizarNotificaciones();
  } catch(e){ console.error("Error descartar:", e); mostrarMensaje("Error descartando notificación", "error"); }
}

/* ======= CRUD: guardar, editar, eliminar listas (usando cache donde tiene sentido) ======= */
async function guardarLista(nuevaLista) {
  try {
    nuevaLista.createdAt = safeServerTimestamp();
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

function mostrarListasDesdeCache(resetCount=false, soloPendientes=false) {
  if (resetCount) listasMostradasCount = 5;
  const filtroLugar = normalizarTexto(document.getElementById("filtroLugarListas")?.value || "");
  try {
    let listas = Array.from(listasCache.values()).sort((a,b) => parseFechaFromString(b.fecha) - parseFechaFromString(a.fecha));
    listas = listas.filter(l => normalizarTexto(l.lugar || "").includes(filtroLugar));
    if (soloPendientes) {
      listas = listas.filter(l => l.estado === "pendiente" || (Array.isArray(l.productos) && l.productos.some(p => p.precio === 0)));
    }
    listas = listas.slice(0, listasMostradasCount);
    const ul = document.getElementById("todasLasListas");
    if (!ul) return;
    ul.innerHTML = "";
    if (listas.length === 0) {
      ul.innerHTML = "<li>No hay listas guardadas que coincidan con el filtro.</li>";
      const btn = document.getElementById("btnCargarMas"); if (btn) btn.style.display = "none";
      actualizarNotificaciones();
      return;
    }
    listas.forEach(lista => {
      const total = (lista.productos || []).reduce((sum,p)=>sum+(p.precio||0),0).toFixed(2);
      const pendienteFecha = lista.estado === "pendiente";
      const pendienteProducto = Array.isArray(lista.productos) && lista.productos.some(p => p.precio === 0);
      let badge = "";
      if (pendienteFecha) badge += '🕒 <strong style="color:#fbc02d">PENDIENTE (Fecha)</strong><br>';
      if (pendienteProducto) badge += '⌛ <strong style="color:#fbc02d">Productos pendientes</strong><br>';
      if (lista.pagoMensual) badge += '📆 <strong style="color:#3b82f6">PAGO MENSUAL</strong><br>';
      const productosHTML = (lista.productos || []).map(p => {
        const iconoP = p.precio === 0 ? `<i class="fa-solid fa-hourglass-half" title="Precio 0" style="color: #f59e0b;"></i>` : "";
        return `<li>${escapeHtml(p.nombre)} ${iconoP} — $${(p.precio||0).toFixed(2)}${p.descripcion ? ` — ${escapeHtml(p.descripcion)}` : ""}</li>`;
      }).join("");
      // Enlaza directamente a Google Calendar usando la versión "por hora" (opción preferente)
      const calendarBtnHTML = `<a class="btn-google-calendar" href="${crearGoogleCalendarLink(lista, { allDay: false, hour: NOTIFY_HOUR || 9, durationMinutes: 60 })}" target="_blank" rel="noopener noreferrer" style="margin-right:8px;">➕ Añadir a Google Calendar</a>`;
      const icsBtnHTML = `<button type="button" class="btn-download-ics" data-lista-id="${escapeHtml(lista.id)}" style="margin-left:8px;">⬇️ Descargar .ics</button>`;
      ul.innerHTML += `
        <li data-id="${lista.id}">
          <div class="lista-item resumen" onclick="alternarDetalle('${lista.id}')">
            📅 <strong>${formatearFecha(lista.fecha)}</strong> — 🏪 <em>${escapeHtml(lista.lugar)}</em> — 💰 $${total}
            <div class="badge-pendiente">${badge}</div>
          </div>
          <div id="detalle-${lista.id}" class="detalle-lista oculto">
            ${calendarBtnHTML}
            <ul>${productosHTML}</ul>
            <button onclick="editarLista('${lista.id}')">✏️ Editar esta lista</button>
            <button onclick="eliminarLista('${lista.id}')">🗑️ Eliminar esta lista</button>
          </div>
        </li>
      `;
    });
    const btnCargar = document.getElementById("btnCargarMas");
    if (btnCargar) btnCargar.style.display = (listas.length === listasMostradasCount) ? "block" : "none";
    actualizarNotificaciones();
  } catch(e){ mostrarMensaje("Error cargando listas: " + e.message, "error"); console.error(e); }
}
function mostrarListasFirebase(resetCount=false, soloPendientes=false) {
  mostrarListasDesdeCache(resetCount, soloPendientes);
}
function cargarMasListas(){ listasMostradasCount += 5; mostrarListasFirebase(); }
function alternarDetalle(id){ const detalle = document.getElementById(`detalle-${id}`); if (detalle) detalle.classList.toggle("oculto"); }

async function mostrarResultadosConsulta() {
  const filtroTienda = normalizarTexto(document.getElementById("filtroTienda")?.value || "");
  const filtroProducto = normalizarTexto(document.getElementById("filtroProducto")?.value || "");
  const criterioOrden = document.getElementById("ordenarPor") ? document.getElementById("ordenarPor").value : null;
  const resultados = document.getElementById("listaResultados");
  const contador = document.getElementById("contadorResultados");
  if (!resultados) return;
  resultados.innerHTML = "";
  try {
    const listas = Array.from(listasCache.values());
    let totalResultados = 0;
    listas.forEach(lista => {
      const lugarNormalizado = normalizarTexto(lista.lugar || "");
      const coincideTienda = !filtroTienda || lugarNormalizado.includes(filtroTienda);
      if (!coincideTienda) return;
      let productosFiltrados = (lista.productos || []).filter(p => {
        const nombreNormalizado = normalizarTexto(p.nombre);
        return !filtroProducto || nombreNormalizado.includes(filtroProducto);
      });
      if (criterioOrden === "precio") productosFiltrados.sort((a,b)=>a.precio-b.precio);
      else if (criterioOrden === "nombre") productosFiltrados.sort((a,b)=>a.nombre.localeCompare(b.nombre));
      if (productosFiltrados.length > 0) {
        totalResultados += productosFiltrados.length;
        const item = document.createElement("li");
        item.innerHTML = `
          <h3>🛍️ ${escapeHtml(lista.lugar)} — 📅 ${formatearFecha(lista.fecha)}</h3>
          <ul>
            ${productosFiltrados.map(p => `<li><strong>${escapeHtml(p.nombre)}</strong> - 💲${(p.precio||0).toFixed(2)} ${p.descripcion ? `<div>📝 ${escapeHtml(p.descripcion)}</div>` : ""}</li>`).join("")}
          </ul>
        `;
        resultados.appendChild(item);
      }
    });
    if (totalResultados === 0) resultados.innerHTML = "<li>No se encontraron resultados.</li>";
    if (contador) {
      contador.textContent = `${totalResultados} producto${totalResultados === 1 ? "" : "s"} encontrado${totalResultados === 1 ? "" : "s"}`;
      contador.classList.remove("cero","pocos","muchos");
      if (totalResultados === 0) contador.classList.add("cero");
      else if (totalResultados <= 5) contador.classList.add("pocos");
      else contador.classList.add("muchos");
    }
  } catch(e){ mostrarMensaje("Error al consultar: " + e.message, "error"); }
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
    (lista.productos || []).forEach(p => {
      const div = document.createElement("div");
      div.className = "producto";
      div.innerHTML = `
        <div class="inputs-container">
          <input type="text" placeholder="Producto" class="producto-nombre" value="${escapeHtml(p.nombre)}" required oninput="mostrarSugerencias(this)" />
          <div class="sugerencias" aria-hidden="true"></div>
          <input type="number" placeholder="Precio" class="producto-precio" value="${p.precio}" required />
          <input type="text" placeholder="Descripción (opcional)" class="producto-desc" value="${escapeHtml(p.descripcion || "")}" />
        </div>
        <button type="button" class="eliminar-producto" onclick="eliminarProducto(this)">❌</button>
      `;
      contenedor.appendChild(div);
    });
    mostrarSeccion("agregar");
    window.scrollTo(0,0);
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
    const precio = parseFloat(p.querySelector(".producto-precio").value);
    const descripcion = p.querySelector(".producto-desc").value.trim();
    if (!nombre) { mostrarMensaje(`El producto #${i+1} no tiene nombre.`, "error"); hayError = true; return; }
    if (isNaN(precio) || precio < 0) { mostrarMensaje(`El producto "${nombre || "sin nombre"}" tiene un precio inválido.`, "error"); hayError = true; return; }
    productos.push({ nombre, precio, descripcion });
  });
  if (hayError || productos.length === 0) return;
  const idLista = document.getElementById("idListaEditando").value;
  const esPagoMensual = !!document.getElementById("esPagoMensual") && document.getElementById("esPagoMensual").checked;
  const datos = { lugar, fecha: fechaInput, productos, estado, pagoMensual: esPagoMensual };

  const reactivarCheckbox = document.getElementById('reactivarNotifs');

  if (idLista) {
    try {
      let prev = listasCache.get(idLista);
      if (!prev && navigator.onLine && canUseFirestore()) {
        const d = await getDoc(doc(db, "listas", idLista));
        if (d.exists()) prev = { id: d.id, ...d.data() };
      }

      if (reactivarCheckbox && reactivarCheckbox.checked) {
        const confirmar = confirm("¿Confirmas que deseas reactivar las notificaciones para esta lista? Si confirmas, la lista volverá a aparecer en notificaciones si aplica.");
        if (confirmar) {
          datos._notificacionDescartada = false;
        } else {
          datos._notificacionDescartada = true;
        }
      } else {
        datos._notificacionDescartada = true;
      }

      if (navigator.onLine && canUseFirestore()) {
        await updateDoc(doc(db, "listas", idLista), datos);
        mostrarMensaje("Lista actualizada correctamente (en la nube).", "success");
        listasCache.set(idLista, { id: idLista, ...datos });
        await schedulePersistCacheToIndexedDB();
        cancelScheduledNotificationsForList(idLista);
        if (!datos._notificacionDescartada && esPendientePorFechaOnly(datos)) await scheduleNotificationsForList({ id: idLista, ...datos });
        actualizarNotificaciones();
      } else {
        const updates = loadPendingUpdates();
        updates[idLista] = { ...(updates[idLista]||{}), ...datos };
        savePendingUpdates(updates);
        listasCache.set(idLista, { id: idLista, ...datos });
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
    await guardarLista({ ...datos, createdAt: safeServerTimestamp(), _notificacionDescartada: false });
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
        <input type="number" placeholder="Precio" class="producto-precio" required />
        <input type="text" placeholder="Descripción (opcional)" class="producto-desc" />
      </div>
      <button type="button" class="eliminar-producto" onclick="eliminarProducto(this)">❌</button>
    </div>`;
  mostrarListasFirebase(true);
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
      <input type="number" placeholder="Precio" class="producto-precio" required />
      <input type="text" placeholder="Descripción (opcional)" class="producto-desc" />
    </div>
    <button type="button" class="eliminar-producto" onclick="eliminarProducto(this)">❌</button>
  `;
  contenedor.appendChild(div);
}
function eliminarProducto(boton) { const divProducto = boton.parentElement; if (divProducto) divProducto.remove(); }

/* ======= SYNC ONLINE/OFFLINE: procesar colas pendientes al reconectar (mejor mapeo tmp_ => real id) ======= */
window.addEventListener("online", async () => {
  mostrarMensaje("Conexión restablecida. Sincronizando cambios pendientes...", "info");

  await initFirebase();
  if (!canUseFirestore()) {
    mostrarMensaje("Conexión OK, pero Firebase no disponible. Reintentaré sincronizar más tarde.", "error");
    return;
  }

  const pendingCreates = loadPendingCreates();
  const remainingCreates = [];

  for (const c of pendingCreates) {
    try {
      if (!c.clientId) c.clientId = generateClientId();
      const ref = await addDoc(collection(db, "listas"), c);
      const tmpKey = `tmp_${c.clientId}`;
      const cacheEntry = listasCache.get(tmpKey);
      if (cacheEntry) {
        listasCache.delete(tmpKey);
        await deleteOneFromIndexedDB(tmpKey).catch(()=>{});
      }
      const newDoc = { id: ref.id, ...c };
      listasCache.set(ref.id, newDoc);
      await saveOneToIndexedDB(newDoc).catch(()=>{});
      const upd = loadPendingUpdates();
      if (upd[tmpKey]) {
        upd[ref.id] = { ...(upd[ref.id]||{}), ...upd[tmpKey] };
        delete upd[tmpKey];
        savePendingUpdates(upd);
      }
      const dels = loadPendingDeletes();
      const idxTmp = dels.indexOf(tmpKey);
      if (idxTmp !== -1) {
        dels[idxTmp] = ref.id;
        savePendingDeletes(dels);
      }
      mostrarMensaje(`Lista creada en la nube: ${c.lugar || ""}`, "success");
    } catch(e){
      console.error("Error sincronizar create:", e);
      remainingCreates.push(c);
      mostrarMensaje("Error sincronizando una creación pendiente", "error");
    }
  }
  savePendingCreates(remainingCreates);

  const pendingUpdatesNow = loadPendingUpdates();
  for (const id in pendingUpdatesNow) {
    try {
      if (id.startsWith("tmp_")) {
        const tmp = listasCache.get(id);
        if (tmp && tmp.clientId) {
          mostrarMensaje(`Sincronización: pendiente update para entrada temporal ${id}`, "info");
          continue;
        }
        continue;
      }
      const payload = { ...pendingUpdatesNow[id] };
      if (payload.ultimoPagoGuardadoAt && canUseFirestore()) {
        payload.ultimoPagoGuardadoAt = safeServerTimestamp();
      }
      await updateDoc(doc(db, "listas", id), payload);
      mostrarMensaje(`Cambios sincronizados para lista ${id}`, "success");
    } catch(e){
      console.error("Error sync update:", e);
      mostrarMensaje(`Error sincronizando cambios para ${id}`, "error");
    }
  }
  savePendingUpdates({});

  const pendingDeletesNow = loadPendingDeletes();
  for (const d of pendingDeletesNow) {
    try {
      if (d.startsWith("tmp_")) {
        listasCache.delete(d);
        await deleteOneFromIndexedDB(d).catch(()=>{});
        mostrarMensaje(`Eliminada local (temporal): ${d}`, "success");
        continue;
      }
      await deleteDoc(doc(db, "listas", d));
      mostrarMensaje(`Eliminada en la nube: ${d}`, "success");
    } catch(e){ console.error("Error sync delete:", e); mostrarMensaje(`Error sincronizando eliminación ${d}`, "error"); }
  }
  savePendingDeletes([]);

  rebuildScheduledTimeoutsFromStorage();
  actualizarNotificaciones();
  mostrarMensaje("Sincronización completada.", "success");
});

window.addEventListener("offline", () => mostrarMensaje("Sin conexión. Las acciones quedarán guardadas localmente y se sincronizarán al reconectar.", "offline"));

/* ======= INICIALIZAR: onSnapshot listener para mantener cache en tiempo real (y carga inicial desde IndexedDB) ======= */
let listasListenerUnsubscribe = null;

async function startListasListener() {

  if (!canUseFirestore() || typeof collection !== 'function' || typeof onSnapshot !== 'function') {
    console.warn("startListasListener: Firestore o funciones no disponibles, listener no inicializado.");
    return;
  }  
  
  if (typeof listasListenerUnsubscribe === 'function') {
    try { listasListenerUnsubscribe(); } catch(e){}
    listasListenerUnsubscribe = null;
  }

  try {
    const colRef = collection(db, "listas");
    listasListenerUnsubscribe = onSnapshot(colRef, async (snapshot) => {
      snapshot.docChanges().forEach(change => {
        const id = change.doc.id;
        const data = { id, ...change.doc.data() };
        if (change.type === "removed") {
          listasCache.delete(id);
          cancelScheduledNotificationsForList(id);
          deleteOneFromIndexedDB(id).catch(()=>{});
        } else {
          listasCache.set(id, data);
          saveOneToIndexedDB(data).catch(()=>{});
        }
      });
      await schedulePersistCacheToIndexedDB().catch(()=>{});
      actualizarNotificaciones(Array.from(listasCache.values()));
      mostrarListasFirebase(true);
    }, async (err) => {
      console.error("onSnapshot listas error:", err);
      mostrarMensaje("Error al conectar con Firestore; usando datos en caché.", "offline");
      try {
        await loadCacheFromIndexedDB();
        actualizarNotificaciones(Array.from(listasCache.values()));
        mostrarListasFirebase(true);
      } catch(e) {
        console.error("Carga cache tras onSnapshot error fallida:", e);
      }
      try { if (typeof listasListenerUnsubscribe === 'function') listasListenerUnsubscribe(); } catch(e){}
      listasListenerUnsubscribe = null;
    });
  } catch(e) {
    console.error("startListasListener fallo:", e);
    mostrarMensaje("No se pudo iniciar la sincronización en tiempo real. Se usarán datos locales.", "offline");
    try { await loadCacheFromIndexedDB(); } catch(err){ console.error(err); }
    actualizarNotificaciones(Array.from(listasCache.values()));
    mostrarListasFirebase(true);
  }
}

/* ======= INICIALIZAR ONLOAD (modificado para initFirebase + modo offline parcial) ======= */
document.addEventListener("DOMContentLoaded", async () => {
  try {
    const firebaseOk = await initFirebase();

    if (firebaseOk && typeof enableIndexedDbPersistence === "function") {
      try {
        await enableIndexedDbPersistence(db);
        console.log("Persistencia IndexedDB habilitada.");
      } catch (err) {
        if (err && err.code === "failed-precondition") {
          console.warn("No se puede habilitar persistencia (multiple tabs?).", err);
          mostrarMensaje("Persistencia offline no disponible (varias pestañas). Se usará almacenamiento local.", "offline");
        } else if (err && err.code === "unimplemented") {
          console.warn("IndexedDB persistence no implementada en este navegador.", err);
          mostrarMensaje("Tu navegador no soporta persistencia offline completa.", "offline");
        } else {
          console.warn("enableIndexedDbPersistence error:", err);
          mostrarMensaje("No se pudo habilitar persistencia. Se usará almacenamiento local.", "offline");
        }
      }
    } else if (!firebaseOk) {
      mostrarMensaje("Modo offline: Firebase no disponible. Usando datos locales.", "offline");
    }

    await loadCacheFromIndexedDB().catch((e) => { console.warn("loadCacheFromIndexedDB falló:", e); });

    mostrarSeccion("agregar");
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
    document.getElementById("btnPendientes")?.addEventListener("click", () => mostrarListasFirebase(true, true));
    document.getElementById("btnTodas")?.addEventListener("click", () => mostrarListasFirebase(true, false));

    rebuildScheduledTimeoutsFromStorage();
    actualizarNotificaciones();

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

    // Delegación para botones .ics — pegar dentro de DOMContentLoaded o al final del archivo
    document.addEventListener('click', (e) => {
      const btn = e.target.closest && e.target.closest('.btn-download-ics');
      if (!btn) return;
      const listaId = btn.getAttribute('data-lista-id');
      if (!listaId) return;

      // Intentar obtener la lista desde cache
      const lista = listasCache.get(listaId);
      if (lista) {
        descargarICS(lista);
        return;
      }

      // Si no está en cache, intentar desde Firestore si está disponible
      if (navigator.onLine && canUseFirestore()) {
        (async () => {
          try {
            const d = await getDoc(doc(db, "listas", listaId));
            if (d.exists()) {
              descargarICS({ id: d.id, ...d.data() });
            } else {
              mostrarMensaje("Lista no encontrada para generar .ics", "error");
            }
          } catch (err) {
            console.error("Error obteniendo lista para .ics:", err);
            mostrarMensaje("No se pudo generar el .ics (error servidor).", "error");
          }
        })();
        return;
      }

      mostrarMensaje("Lista no disponible localmente para generar .ics", "error");
    });

  } catch (e) {
    console.error("Error inicializando la app:", e);
    mostrarMensaje("Error inicializando la aplicación. Revisa la consola para más detalles.", "error");
  }
});

async function reactivateNotifications(id) {
  try {
    if (!id) return;
    if (navigator.onLine && canUseFirestore()) {
      await updateDoc(doc(db, "listas", id), { _notificacionDescartada: false });
      mostrarMensaje("Notificaciones reactivadas (en la nube).", "success");
    } else {
      const updates = loadPendingUpdates();
      updates[id] = { ...(updates[id]||{}), _notificacionDescartada: false };
      savePendingUpdates(updates);
      const cached = listasCache.get(id);
      if (cached) { cached._notificacionDescartada = false; listasCache.set(id, cached); await schedulePersistCacheToIndexedDB(); }
      mostrarMensaje("Guardado fuera de línea: se reactivarán notificaciones al sincronizar.", "offline");
    }
    const lista = listasCache.get(id);
    if (lista && esPendientePorFechaOnly(lista)) await scheduleNotificationsForList(lista);
    actualizarNotificaciones();
  } catch(e){ console.error("reactivateNotifications error:", e); mostrarMensaje("Error reactivando notificaciones", "error"); }
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

// Generar contenido .ics con hora (usa NOTIFY_HOUR por defecto, duración 1h)
function generarContenidoICS(lista, opts = {}) {
  if (!lista || !lista.fecha) return null;
  const dtStartDate = parseFechaFromString(lista.fecha);
  if (!dtStartDate || isNaN(dtStartDate)) return null;

  const hour = (typeof opts.hour === 'number') ? opts.hour : (typeof NOTIFY_HOUR === 'number' ? NOTIFY_HOUR : 9);
  const durationMinutes = Number(opts.durationMinutes || 120); // duración por defecto 2 horas

  // inicio en la hora local indicada
  const startLocal = dateAtHour(dtStartDate, hour);
  const endLocal = new Date(startLocal.getTime() + durationMinutes * 120000); // duración en milisegundos

  function pad(n){ return String(n).padStart(2,'0'); }
  function toICSDatetimeUTC(d){
    // 20250815T090000Z
    return d.toISOString().replace(/[-:]/g,'').split('.')[0] + 'Z';
  }

  const start = toICSDatetimeUTC(startLocal);
  const end = toICSDatetimeUTC(endLocal);

  const title = (lista.lugar && lista.lugar.trim()) ? `Lista: ${lista.lugar.trim()}` : 'Lista de Compras';
  const description = (Array.isArray(lista.productos) && lista.productos.length)
    ? lista.productos.map(p => `${p.nombre} — $${(p.precio||0).toFixed(2)}${p.descripcion ? ` (${p.descripcion})` : ''}`).join('\n')
    : 'Sin productos detallados';
  const location = lista.lugar ? lista.lugar.replace(/\r?\n/g, ' ') : '';
  const uid = `lista-${lista.id || generateClientId()}@miapp`;

  const icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MiApp//Listas//ES',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${toICSDatetimeUTC(new Date())}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${escapeICSText(title)}`,
    `DESCRIPTION:${escapeICSText(description)}`,
    `LOCATION:${escapeICSText(location)}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ];
  return icsLines.join('\r\n');
}

function escapeICSText(s) {
  if (!s) return '';
  return String(s).replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\r?\n/g,'\\n');
}

// Crea y descarga el .ics en el navegador
function descargarICS(lista) {
  const contenido = generarContenidoICS(lista);
  if (!contenido) { mostrarMensaje("No se pudo generar el archivo .ics para esta lista.", "error"); return; }
  const blob = new Blob([contenido], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const nombre = (lista.lugar ? lista.lugar.replace(/\s+/g,'_').slice(0,40) : 'lista') + `_${lista.fecha || ''}.ics`;
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ======= UTILIDADES UI y exportar funciones globales ======= */
window.mostrarSeccion = function(id){ document.querySelectorAll(".seccion").forEach(s=>s.classList.add("oculto")); const el = document.getElementById(id); if (el) el.classList.remove("oculto"); };
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

/* FIN del archivo */
