// script.js (con mensajes tipo y mapeo robusto de tmp_ usando clientId)
// Reemplaza tu archivo actual por este.

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-analytics.js";
import {
  getFirestore,
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  deleteDoc,
  doc,
  updateDoc,
  serverTimestamp,
  getDoc,
  onSnapshot,
  enableIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCGXnX8UJtLC0Jn1oEo6huZqz_ZkmyGO84",
  authDomain: "listascompras-94a64.firebaseapp.com",
  projectId: "listascompras-94a64",
  storageBucket: "listascompras-94a64.firebasestorage.app",
  messagingSenderId: "792067541567",
  appId: "1:792067541567:web:f73cf92dd79843d962068a",
  measurementId: "G-YZ02H3KCZC",
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);

/* ================= CONFIG ================= */
const NOTIFY_OFFSETS_DAYS = [30, 15, 10, 5, 4, 3, 2, 1];
const MAX_NOTIFY_WINDOW_DAYS = 30;
const NOTIFY_HOUR = 9;
const STORAGE_KEY_SCHEDULE = "scheduledNotifications_v1";

const IDB_DB_NAME = "listas_cache_db";
const IDB_STORE = "listas";
const IDB_VERSION = 1;
const LISTAS_CACHE_KEY_LEGACY = "listasCache_v2"; // fallback localStorage key

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
async function loadCacheFromIndexedDB() {
  const arr = await loadAllFromIndexedDB();
  listasCache.clear();
  (arr || []).forEach(l => { if (l && l.id) listasCache.set(l.id, l); });
}

/* ======= UTIL: generar clientId (uuid) ======= */
function generateClientId() {
  try {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
  } catch(e){}
  // fallback
  return `cid_${Date.now()}_${Math.floor(Math.random()*1e6)}`;
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

/* ======= NOTIFICATIONS API ======= */
async function ensureNotificationPermission() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const p = await Notification.requestPermission();
  return p === "granted";
}
function sendBrowserNotification(title, body, data = {}) {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    const n = new Notification(title, { body, data });
    n.onclick = () => { window.focus(); mostrarSeccion("notificaciones"); };
  } catch(e){ console.error("Error notificación:", e); }
}

/* ======= UTILIDADES UI: mostrarMensaje con tipos ======= */
function mostrarMensaje(texto, tipo = "info") {
  // tipos: success, offline, error, info
  const mensajeDiv = document.getElementById("mensaje");
  const iconos = { success: "✅", offline: "⚠️", error: "❌", info: "ℹ️" };
  const clases = { success: "msg-success", offline: "msg-offline", error: "msg-error", info: "msg-info" };
  if (!mensajeDiv) {
    // si no existe en DOM, console.log con prefijo
    console.log(`${iconos[tipo] || ""} ${texto}`);
    return;
  }
  // Reset clases
  mensajeDiv.classList.remove("msg-success","msg-offline","msg-error","msg-info");
  mensajeDiv.classList.add(clases[tipo] || "msg-info");
  mensajeDiv.textContent = `${iconos[tipo] || ""} ${texto}`;
  mensajeDiv.classList.remove("oculto");
  // tiempo de mostrado según tipo
  const timeout = tipo === "offline" ? 6000 : tipo === "error" ? 5000 : 3500;
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

/* ======= SCHEDULER: programar notificaciones ======= */
// Nota: setTimeout solo funciona mientras la pestaña esté abierta.
async function scheduleNotificationsForList(lista) {
  if (!lista || !lista.id || !lista.fecha) return;
  const fParsed = parseFechaFromString(lista.fecha);
  if (lista.pagoMensual && fParsed && startOfDay(fParsed).getTime() < startOfDay(new Date()).getTime()) {
    if (navigator.onLine) { await advanceMonthlyList(lista); return; }
    else { cancelScheduledNotificationsForList(lista.id); return; }
  }

  if (lista.completada) { cancelScheduledNotificationsForList(lista.id); return; }
  if (lista._notificacionDescartada) { cancelScheduledNotificationsForList(lista.id); return; } // Respeta flag
  if (!esPendientePorFechaOnly(lista)) { cancelScheduledNotificationsForList(lista.id); return; }

  await ensureNotificationPermission();
  const map = loadScheduledMap();
  map[lista.id] = map[lista.id] || [];
  const existingTimestamps = new Set(map[lista.id]);
  const f = parseFechaFromString(lista.fecha);
  if (!f || isNaN(f)) return;
  const now = Date.now();
  const timersForList = scheduledTimeouts.get(lista.id) || [];

  NOTIFY_OFFSETS_DAYS.forEach(offset => {
    const notifyDay = addDays(f, -offset);
    const notifyAt = dateAtHour(notifyDay).getTime();
    if (notifyAt <= now) return;
    if (existingTimestamps.has(notifyAt)) return;
    const delay = notifyAt - now;
    const timeoutId = setTimeout(async () => {
      try {
        let listaActual = listasCache.get(lista.id) || lista;
        if (navigator.onLine) {
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
        if (Notification.permission === "granted") sendBrowserNotification(title, body, { listaId: listaActual.id });
        actualizarNotificaciones();
      } catch(e){ console.error("Error timeout notificación:", e); }
    }, delay);
    timersForList.push(timeoutId);
    map[lista.id].push(notifyAt);
  });

  scheduledTimeouts.set(lista.id, timersForList);
  saveScheduledMap(map);
}

function rebuildScheduledTimeoutsFromStorage() {
  const map = loadScheduledMap();
  const now = Date.now();
  Object.entries(map).forEach(([listaId, timestamps]) => {
    timestamps = Array.isArray(timestamps) ? timestamps : [];
    const futureTs = timestamps.filter(ts => ts > now);
    if (futureTs.length === 0) { delete map[listaId]; saveScheduledMap(map); return; }
    const timersForList = scheduledTimeouts.get(listaId) || [];
    futureTs.forEach(ts => {
      const delay = ts - now;
      const timeoutId = setTimeout(async () => {
        try {
          let listaActual = listasCache.get(listaId) || null;
          if (navigator.onLine) {
            try {
              const d = await getDoc(doc(db, "listas", listaId));
              if (d.exists()) listaActual = { id: d.id, ...d.data() };
            } catch(e){ /* ignore */ }
          }
          if (listaActual && esPendientePorFechaOnly(listaActual) && Notification.permission === "granted") {
            const title = `Lista: ${listaActual.lugar || "Sin lugar"} vence pronto`;
            const body = `Fecha: ${formatearFecha(listaActual.fecha)} — Abre la app para ver o marcar como hecha.`;
            sendBrowserNotification(title, body, { listaId: listaActual.id });
          }
        } catch(e){ console.error("Error rebuild scheduled:", e); } finally { actualizarNotificaciones(); }
      }, delay);
      timersForList.push(timeoutId);
    });
    scheduledTimeouts.set(listaId, timersForList);
    saveScheduledMap(map);
  });
}

/* ======= LÓGICA: Determinar si es pendiente por fecha ======= */
function esPendientePorFechaOnly(lista) {
  if (!lista || !lista.fecha) return false;
  if (lista.completada) return false;
  if (lista._notificacionDescartada) return false;
  if (lista.estado && lista.estado === "pendiente") return true;
  const f = parseFechaFromString(lista.fecha);
  if (!f || isNaN(f)) return false;
  const hoy = startOfDay(new Date());
  const limite = addDays(hoy, MAX_NOTIFY_WINDOW_DAYS);
  const listaDay = startOfDay(f);
  return listaDay.getTime() <= limite.getTime();
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
    if (navigator.onLine) {
      const d = await getDoc(doc(db, "listas", lista.id));
      if (d.exists()) {
        const listaObj = { id: d.id, ...d.data() };
        listasCache.set(listaObj.id, listaObj);
        await persistCacheToIndexedDB();
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

function renderListaNotificaciones(pendientes) {
  const ul = document.getElementById("listaNotificaciones");
  if (!ul) return;
  ul.innerHTML = "";
  if (!pendientes || pendientes.length === 0) {
    const li = document.createElement("li"); li.textContent = "No hay notificaciones por fecha."; ul.appendChild(li); renderBadge(0); return;
  }
  pendientes.sort((a,b)=> new Date(a.fecha) - new Date(b.fecha));
  renderBadge(pendientes.length);
  pendientes.forEach(lista => {
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
        <button class="accion-marcar" data-id="${lista.id}">Marcar como hecha</button>
        <button class="accion-descartar" data-id="${lista.id}">Descartar</button>
      </div>
    `;

    li.innerHTML = resumenHTML + detalleProductosHTML + accionesHTML;

    li.addEventListener("click", (e) => {
      if (e.target && (e.target.matches("button") || e.target.closest("button"))) return;
      const panelAcc = li.querySelector(`#acciones-${lista.id}`);
      const panelProd = li.querySelector(`#detalle-productos-${lista.id}`);
      if (panelProd) panelProd.classList.toggle("oculto");
      if (panelAcc) panelAcc.classList.toggle("oculto");
    });

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
}

/* ======= ACTUALIZAR NOTIFICACIONES (usa cache) ======= */
async function actualizarNotificaciones(listasExternas = null) {
  try {
    if (navigator.onLine) await advanceMonthlyIfPastForAll();

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
          if (navigator.onLine) {
            try { await updateDoc(doc(db, 'listas', l.id), { estado: 'expirada' }); }
            catch(err){ console.error("No se pudo marcar expirada en servidor:", err); }
          } else {
            try {
              listasCache.set(l.id, { ...l, estado: 'expirada' });
              await persistCacheToIndexedDB();
            } catch(e){ /* ignore */ }
          }
        }
      } catch(e){ console.error("Error procesando expiradas:", e); }
    }

    const pendientesPorFecha = listas.filter(l => esPendientePorFechaOnly(l));
    renderListaNotificaciones(pendientesPorFecha);
    pendientesPorFecha.forEach(lista => scheduleNotificationsForList(lista));
  } catch(e) { console.error("Error actualizarNotificaciones:", e); }
}

/* ======= ACCIONES: marcar hecha / descartar (usar cache y getDoc fallback) ======= */
async function marcarListaComoHecha(id) {
  try {
    let lista = listasCache.get(id);
    if (!lista && navigator.onLine) {
      const d = await getDoc(doc(db, "listas", id));
      if (d.exists()) lista = { id: d.id, ...d.data() };
    }
    if (!lista) return mostrarMensaje('Lista no encontrada', "error");

    if (lista.pagoMensual) {
      if (navigator.onLine) {
        await advanceMonthlyList(lista);
        mostrarMensaje("Pago mensual avanzado en la nube.", "success");
      } else {
        const nuevaFecha = formatDateToInput(addMonthsKeepDay(parseFechaFromString(lista.fecha), 1));
        const updates = loadPendingUpdates();
        updates[id] = { fecha: nuevaFecha, _notificacionDescartada: false, estado: 'pendiente', completada: false };
        savePendingUpdates(updates);
        listasCache.set(id, { ...lista, fecha: nuevaFecha, _notificacionDescartada: false, estado: 'pendiente', completada: false });
        await persistCacheToIndexedDB();
        cancelScheduledNotificationsForList(id);
        mostrarMensaje("Guardado fuera de línea: pago mensual marcado. Se sincronizará al reconectar.", "offline");
      }
      await actualizarNotificaciones();
      mostrarListasFirebase(true);
      return;
    }

    if (navigator.onLine) {
      await updateDoc(doc(db, "listas", id), { estado: "normal", completada: true });
      mostrarMensaje("Lista marcada como hecha (en la nube).", "success");
    } else {
      const updates = loadPendingUpdates();
      updates[id] = { ...(updates[id]||{}), estado: "normal", completada: true };
      savePendingUpdates(updates);
      listasCache.set(id, { ...lista, estado: "normal", completada: true });
      await persistCacheToIndexedDB();
      mostrarMensaje("Guardado fuera de línea: lista marcada como hecha. Se sincronizará al reconectar.", "offline");
    }
    cancelScheduledNotificationsForList(id);
    await actualizarNotificaciones();
    mostrarListasFirebase(true);
  } catch(e){ mostrarMensaje("Error marcando la lista como hecha", "error"); console.error(e); }
}
async function descartarNotificacion(id) {
  try {
    if (navigator.onLine) {
      await updateDoc(doc(db, "listas", id), { _notificacionDescartada: true });
      mostrarMensaje("Notificación descartada (en la nube).", "success");
    } else {
      const updates = loadPendingUpdates();
      updates[id] = { ...(updates[id]||{}), _notificacionDescartada: true };
      savePendingUpdates(updates);
      const cached = listasCache.get(id);
      if (cached) { cached._notificacionDescartada = true; listasCache.set(id, cached); await persistCacheToIndexedDB(); }
      mostrarMensaje("Guardado fuera de línea: notificación descartada. Se sincronizará al reconectar.", "offline");
    }
    cancelScheduledNotificationsForList(id);
    actualizarNotificaciones();
  } catch(e){ console.error("Error descartar:", e); mostrarMensaje("Error descartando notificación", "error"); }
}

/* ======= CRUD: guardar, editar, eliminar listas (usando cache donde tiene sentido) ======= */
async function guardarLista(nuevaLista) {
  try {
    nuevaLista.createdAt = serverTimestamp();
    if (!('_notificacionDescartada' in nuevaLista)) nuevaLista._notificacionDescartada = false;

    if (navigator.onLine) {
      const ref = await addDoc(collection(db, "listas"), nuevaLista);
      mostrarMensaje("Lista guardada correctamente (en la nube).", "success");
      listasCache.set(ref.id, { id: ref.id, ...nuevaLista });
      await persistCacheToIndexedDB();
      actualizarNotificaciones();
    } else {
      // cola la creación en pendingCreates (será insertada al reconectar) con clientId
      const clientId = generateClientId();
      const itemWithClient = { ...nuevaLista, clientId };
      const creates = loadPendingCreates();
      creates.push(itemWithClient);
      savePendingCreates(creates);
      // id temporal para cache local (tmp_<clientId>)
      const tempId = `tmp_${clientId}`;
      listasCache.set(tempId, { id: tempId, ...nuevaLista, clientId });
      await persistCacheToIndexedDB();
      mostrarMensaje("Guardado fuera de línea: la lista se creará cuando vuelva la conexión.", "offline");
      actualizarNotificaciones();
    }
  } catch(e){ mostrarMensaje("Error guardando la lista: " + (e.message || e), "error"); console.error(e); }
}

async function eliminarLista(id) {
  const confirmar = confirm("¿Estás seguro de que deseas eliminar esta lista? Esta acción no se puede deshacer.");
  if (!confirmar) return;
  try {
    if (navigator.onLine) {
      await deleteDoc(doc(db, "listas", id));
      mostrarMensaje("Lista eliminada con éxito (en la nube).", "success");
      cancelScheduledNotificationsForList(id);
      listasCache.delete(id);
      await deleteOneFromIndexedDB(id);
      mostrarListasFirebase(true);
      mostrarResultadosConsulta();
      actualizarNotificaciones();
    } else {
      // cola la eliminación
      const dels = loadPendingDeletes();
      dels.push(id);
      savePendingDeletes(dels);
      // quitar de cache local
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
  if (navigator.onLine) {
    try {
      const docRef = doc(db, "listas", idLista);
      await updateDoc(docRef, datosLista);
      mostrarMensaje("Cambios guardados en la nube.", "success");
      listasCache.set(idLista, { id: idLista, ...datosLista });
      await persistCacheToIndexedDB();
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
  persistCacheToIndexedDB().catch(()=>{});
}

/* ======= INTERFAZ: mostrarListas, consultas, sugerencias, editar (usar cache) ======= */
let listasMostradasCount = 5;

function mostrarListasDesdeCache(resetCount=false, soloPendientes=false) {
  if (resetCount) listasMostradasCount = 5;
  const filtroLugar = normalizarTexto(document.getElementById("filtroLugarListas")?.value || "");
  try {
    let listas = Array.from(listasCache.values()).sort((a,b) => new Date(b.fecha) - new Date(a.fecha));
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
      ul.innerHTML += `
        <li data-id="${lista.id}">
          <div class="lista-item resumen" onclick="alternarDetalle('${lista.id}')">
            📅 <strong>${formatearFecha(lista.fecha)}</strong> — 🏪 <em>${escapeHtml(lista.lugar)}</em> — 💰 $${total}
            <div class="badge-pendiente">${badge}</div>
          </div>
          <div id="detalle-${lista.id}" class="detalle-lista oculto">
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
  if (valor.length < 2) { contenedorSugerencias.style.display = "none"; contenedorSugerencias.innerHTML = ""; contenedorSugerencias.setAttribute('aria-hidden','true'); return; }
  try {
    const productosEncontrados = [];
    for (const lista of listasCache.values()) {
      const productos = lista.productos || [];
      productos.forEach(p => {
        const nombreNormalizado = normalizarTexto(p.nombre);
        if (nombreNormalizado.includes(valor)) {
          productosEncontrados.push({ nombre: p.nombre, precio: p.precio, descripcion: p.descripcion || "", lugar: lista.lugar, fecha: lista.fecha || lista.createdAt || new Date() });
        }
      });
    }
    if (productosEncontrados.length === 0) { contenedorSugerencias.style.display = "none"; contenedorSugerencias.innerHTML = ""; contenedorSugerencias.setAttribute('aria-hidden','true'); return; }
    productosEncontrados.sort((a,b)=> new Date(b.fecha) - new Date(a.fecha));
    contenedorSugerencias.style.display = "block";
    contenedorSugerencias.setAttribute('aria-hidden','false');
    contenedorSugerencias.innerHTML =
      productosEncontrados.slice(0,5).map(p => `
        <div class="sugerencia-item" onclick='seleccionarSugerencia(this, ${JSON.stringify(p)})'>
          <div><strong>🛒 ${escapeHtml(p.nombre)}</strong></div>
          <div>💲<strong>${(p.precio||0).toFixed(2)}</strong></div>
          <div>📍${escapeHtml(p.lugar)} — 🗓️ ${formatearFecha(p.fecha)}</div>
          <div class="descripcion-sugerida">📝 ${escapeHtml(p.descripcion)}</div>
        </div>
      `).join("") + `<div style="height:6px;"></div>`;
  } catch(e){ console.error("Error sugerencias:", e); contenedorSugerencias.style.display = "none"; contenedorSugerencias.innerHTML = ""; contenedorSugerencias.setAttribute('aria-hidden','true'); }
}
const mostrarSugerencias = debounce(mostrarSugerenciasInner, 300);
window.mostrarSugerencias = mostrarSugerencias;

function seleccionarSugerencia(div, producto) {
  try {
    const contenedorProducto = div.closest('.sugerencias').previousElementSibling.closest('.producto');
    if (!contenedorProducto) return;
    contenedorProducto.querySelector('.producto-nombre').value = producto.nombre;
    contenedorProducto.querySelector('.producto-precio').value = producto.precio;
    contenedorProducto.querySelector('.producto-desc').value = producto.descripcion;
    const contenedorSugerencias = div.closest('.sugerencias');
    contenedorSugerencias.innerHTML = ""; contenedorSugerencias.style.display = "none"; contenedorSugerencias.setAttribute('aria-hidden','true');
    contenedorProducto.querySelector('.producto-precio').focus();
  } catch(e){ console.error("seleccionarSugerencia error:", e); }
}

/* ======= EDITAR (usa cache + getDoc fallback y respeta reactivar) ======= */
async function editarLista(id) {
  try {
    let lista = listasCache.get(id);
    if (!lista && navigator.onLine) {
      const d = await getDoc(doc(db, "listas", id));
      if (d.exists()) lista = { id: d.id, ...d.data() };
    }
    if (!lista) return mostrarMensaje("Lista no encontrada", "error");
    document.getElementById("lugar").value = lista.lugar || "";
    document.getElementById("fecha").value = lista.fecha || "";
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
      if (fechaEl && fechaEl.parentElement) fechaEl.insertAdjacentHTML('afterend', checkboxHTML);
      else form.insertAdjacentHTML('beforeend', checkboxHTML);
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
  const hoy = new Date();
  const estado = fechaObj > hoy ? "pendiente" : "normal";
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
      if (!prev && navigator.onLine) {
        const d = await getDoc(doc(db, "listas", idLista));
        if (d.exists()) prev = { id: d.id, ...d.data() };
      }
      if (reactivarCheckbox && reactivarCheckbox.checked) {
        const confirmar = confirm("¿Confirmas que deseas reactivar las notificaciones para esta lista? Si confirmas, la lista volverá a aparecer en notificaciones si aplica.");
        if (confirmar) datos._notificacionDescartada = false;
        else if (prev && typeof prev._notificacionDescartada !== "undefined") datos._notificacionDescartada = prev._notificacionDescartada;
      } else {
        if (prev && typeof prev._notificacionDescartada !== "undefined") datos._notificacionDescartada = prev._notificacionDescartada;
        else datos._notificacionDescartada = false;
      }

      if (navigator.onLine) {
        await updateDoc(doc(db, "listas", idLista), datos);
        mostrarMensaje("Lista actualizada correctamente (en la nube).", "success");
        listasCache.set(idLista, { id: idLista, ...datos });
        await persistCacheToIndexedDB();
        cancelScheduledNotificationsForList(idLista);
        if (!datos._notificacionDescartada && esPendientePorFechaOnly(datos)) await scheduleNotificationsForList({ id: idLista, ...datos });
        actualizarNotificaciones();
      } else {
        const updates = loadPendingUpdates();
        updates[idLista] = { ...(updates[idLista]||{}), ...datos };
        savePendingUpdates(updates);
        listasCache.set(idLista, { id: idLista, ...datos });
        await persistCacheToIndexedDB();
        cancelScheduledNotificationsForList(idLista);
        if (!datos._notificacionDescartada && esPendientePorFechaOnly(datos)) {
          await scheduleNotificationsForList({ id: idLista, ...datos });
        }
        mostrarMensaje("Guardado fuera de línea: los cambios se sincronizarán cuando haya conexión.", "offline");
        actualizarNotificaciones();
      }
    } catch(e){ mostrarMensaje("Error actualizando la lista: " + e.message, "error"); console.error(e); }
  } else {
    await guardarLista({ ...datos, createdAt: serverTimestamp(), _notificacionDescartada: false });
  }

  // limpiar formulario
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

  // 1) Creaciones pendientes (con clientId) -> subir y mapear tmp_ -> ref.id
  const pendingCreates = loadPendingCreates();
  const pendingUpdates = loadPendingUpdates();
  const pendingDeletes = loadPendingDeletes();

  for (const c of pendingCreates) {
    try {
      // asegurarnos que c contiene clientId
      if (!c.clientId) c.clientId = generateClientId();
      const ref = await addDoc(collection(db, "listas"), c);
      // busca tmp key en cache
      const tmpKey = `tmp_${c.clientId}`;
      const cacheEntry = listasCache.get(tmpKey);
      // Si hay una entrada tmp, la reemplazamos por la real
      if (cacheEntry) {
        listasCache.delete(tmpKey);
        await deleteOneFromIndexedDB(tmpKey).catch(()=>{});
      }
      // crear la entrada real en cache (incluye clientId por trazabilidad)
      const newDoc = { id: ref.id, ...c };
      listasCache.set(ref.id, newDoc);
      await saveOneToIndexedDB(newDoc).catch(()=>{});
      // actualizar pendingUpdates: mover claves que apunten a tmpKey hacia ref.id
      const upd = loadPendingUpdates();
      if (upd[tmpKey]) {
        upd[ref.id] = { ...(upd[ref.id]||{}), ...upd[tmpKey] };
        delete upd[tmpKey];
        savePendingUpdates(upd);
      }
      // actualizar pendingDeletes: reemplazar tmpKey por ref.id si aparece
      const dels = loadPendingDeletes();
      const idxTmp = dels.indexOf(tmpKey);
      if (idxTmp !== -1) {
        dels[idxTmp] = ref.id;
        savePendingDeletes(dels);
      }
      mostrarMensaje(`Lista creada en la nube: ${c.lugar || ""}`, "success");
    } catch(e){ console.error("Error sincronizar create:", e); mostrarMensaje("Error sincronizando una creación pendiente", "error"); }
  }
  savePendingCreates([]); // limpiar

  // 2) Updates pendientes
  const pendingUpdatesNow = loadPendingUpdates();
  for (const id in pendingUpdatesNow) {
    try {
      // si id es tmp_ no existe en servidor — debería haber sido mapeado antes; si aún es tmp_, saltamos
      if (id.startsWith("tmp_")) {
        // intentar buscar en cache si tiene clientId y mapear (en caso fallido)
        const tmp = listasCache.get(id);
        if (tmp && tmp.clientId) {
          // intentar localizar documento en servidor por clientId (opcional)
          // pero asumimos que en la fase de creates se mapearon; si no, saltamos y dejamos la update para más tarde
          mostrarMensaje(`Sincronización: pendiente update para entrada temporal ${id}`, "info");
          continue;
        }
        continue;
      }
      await updateDoc(doc(db, "listas", id), pendingUpdatesNow[id]);
      mostrarMensaje(`Cambios sincronizados para lista ${id}`, "success");
    } catch(e){ console.error("Error sync update:", e); mostrarMensaje(`Error sincronizando cambios para ${id}`, "error"); }
  }
  savePendingUpdates({}); // limpiar

  // 3) Deletes pendientes
  const pendingDeletesNow = loadPendingDeletes();
  for (const d of pendingDeletesNow) {
    try {
      if (d.startsWith("tmp_")) {
        // era una entrada temporal que nunca llegó al servidor: sólo eliminar de cache
        listasCache.delete(d);
        await deleteOneFromIndexedDB(d).catch(()=>{});
        mostrarMensaje(`Eliminada local (temporal): ${d}`, "success");
        continue;
      }
      await deleteDoc(doc(db, "listas", d));
      mostrarMensaje(`Eliminada en la nube: ${d}`, "success");
    } catch(e){ console.error("Error sync delete:", e); mostrarMensaje(`Error sincronizando eliminación ${d}`, "error"); }
  }
  savePendingDeletes([]); // limpiar

  // Reconstruir timers + refrescar
  rebuildScheduledTimeoutsFromStorage();
  actualizarNotificaciones();
  mostrarMensaje("Sincronización completada.", "success");
});

window.addEventListener("offline", () => mostrarMensaje("Sin conexión. Las acciones quedarán guardadas localmente y se sincronizarán al reconectar.", "offline"));

/* ======= INICIALIZAR: onSnapshot listener para mantener cache en tiempo real (y carga inicial desde IndexedDB) ======= */
let listasListenerUnsubscribe = null;

async function startListasListener() {
  // si ya hay un listener, desenlazarlo (evita duplicados al recargar)
  if (typeof listasListenerUnsubscribe === 'function') {
    try { listasListenerUnsubscribe(); } catch(e){}
    listasListenerUnsubscribe = null;
  }

  try {
    const colRef = collection(db, "listas");
    // onSnapshot devuelve la función de unsubscribe
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
      await persistCacheToIndexedDB().catch(()=>{});
      actualizarNotificaciones(Array.from(listasCache.values()));
      mostrarListasFirebase(true);
    }, async (err) => {
      // Mejor manejo de error: informar, cargar cache y no dejar la app en estado inutilizable
      console.error("onSnapshot listas error:", err);
      mostrarMensaje("Error al conectar con Firestore; usando datos en caché.", "offline");
      try {
        await loadCacheFromIndexedDB();
        actualizarNotificaciones(Array.from(listasCache.values()));
        mostrarListasFirebase(true);
      } catch(e) {
        console.error("Carga cache tras onSnapshot error fallida:", e);
      }
      // Desuscribir listener para evitar loops extra (si existe)
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

/* ======= INICIALIZAR ONLOAD ======= */
document.addEventListener("DOMContentLoaded", async () => {
  try {
    // 1) Intentar habilitar persistencia y avisar si falla (await importante)
    try {
      await enableIndexedDbPersistence(db);
      console.log("Persistencia IndexedDB habilitada.");
    } catch(err) {
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

    // 2) Cargar cache desde IndexedDB (si la hay) *antes* de renderizar
    await loadCacheFromIndexedDB().catch((e)=>{ console.warn("loadCacheFromIndexedDB falló:", e); });

    // 3) Renderizar UI con cache (evita pantalla en blanco / "sin señal")
    mostrarSeccion("agregar");
    mostrarListasFirebase(true);

    // 4) Arrancar el listener onSnapshot (si falla, tenemos ya la cache visible)
    startListasListener();

    // 5) Handlers y reconstrucción de timers
    const mostrarResultadosConsultaDebounced = debounce(mostrarResultadosConsulta, 300);
    document.getElementById("filtroTienda")?.addEventListener("input", mostrarResultadosConsultaDebounced);
    document.getElementById("filtroProducto")?.addEventListener("input", mostrarResultadosConsultaDebounced);
    document.getElementById("ordenarPor")?.addEventListener("change", mostrarResultadosConsultaDebounced);
    document.getElementById("btnPendientes")?.addEventListener("click", () => mostrarListasFirebase(true, true));
    document.getElementById("btnTodas")?.addEventListener("click", () => mostrarListasFirebase(true, false));

    rebuildScheduledTimeoutsFromStorage();
    actualizarNotificaciones();

    // Cerrar sugerencias si se hace click fuera
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
    // Escape para cerrar sugerencias
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.sugerencias').forEach(s => {
          s.style.display = 'none';
          s.innerHTML = '';
          s.setAttribute('aria-hidden','true');
        });
      }
    });

  } catch(e){
    console.error("Error inicializando la app:", e);
    mostrarMensaje("Error inicializando la aplicación. Revisa la consola para más detalles.", "error");
  }
});

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
