// script.js (versión actualizada: muestra descripción en notificaciones + coloreado por días)
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-analytics.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  limit,
  deleteDoc,
  doc,
  updateDoc,
  serverTimestamp,
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

import { enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code == "failed-precondition") {
    console.warn("No se puede habilitar persistencia porque hay múltiples pestañas abiertas.");
  } else if (err.code == "unimplemented") {
    console.warn("El navegador no soporta persistencia offline.");
  }
});

/* ================= CONFIG ================= */
const NOTIFY_OFFSETS_DAYS = [30, 15, 10, 5, 4, 3, 2, 1];
const MAX_NOTIFY_WINDOW_DAYS = 30;
const NOTIFY_HOUR = 9;
const STORAGE_KEY_SCHEDULE = "scheduledNotifications_v1";

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

/* ======= STORAGE SCHEDULE ======= */
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

/* ======= PENDIENTE POR FECHA ======= */
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

/* ======= SCHEDULER: programar notificaciones ======= */
async function scheduleNotificationsForList(lista) {
  if (!lista || !lista.id || !lista.fecha) return;
  if (lista.completada) { cancelScheduledNotificationsForList(lista.id); return; }
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
        let listaActual = lista;
        if (navigator.onLine) {
          const snap = await getDocs(collection(db, "listas"));
          const docu = snap.docs.find(d => d.id === lista.id);
          if (docu) listaActual = { id: docu.id, ...docu.data() };
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
          let listaActual = null;
          if (navigator.onLine) {
            const snap = await getDocs(collection(db, "listas"));
            const docu = snap.docs.find(d => d.id === listaId);
            if (docu) listaActual = { id: docu.id, ...docu.data() };
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

/* ======= RENDER: Panel Notificaciones (ahora con descripción y coloreado) ======= */
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

function escapeHtml(str) {
  if (!str) return "";
  return String(str).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}

async function actualizarNotificaciones(listasExternas = null) {
  try {
    let listas = [];
    if (Array.isArray(listasExternas)) listas = listasExternas;
    else {
      if (navigator.onLine) {
        const snap = await getDocs(collection(db, "listas"));
        listas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        try { localStorage.setItem("listasCache", JSON.stringify(listas)); } catch(e){}
      } else {
        const cache = localStorage.getItem("listasCache");
        listas = cache ? JSON.parse(cache) : [];
      }
    }
    const pendientesPorFecha = listas.filter(l => esPendientePorFechaOnly(l));
    renderListaNotificaciones(pendientesPorFecha);
    pendientesPorFecha.forEach(lista => scheduleNotificationsForList(lista));
  } catch(e) { console.error("Error actualizarNotificaciones:", e); }
}

function colorForDias(dias) {
  // dias puede ser negativo -> vencida -> rojo
  if (dias <= 3) return { border: "#e53e3e", bg: "#fff5f5" }; // rojo
  if (dias <= 10) return { border: "#f59e0b", bg: "#fff7ed" }; // naranja/ámbar
  return { border: "#10b981", bg: "#f0fdf4" }; // verde
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

    // productos + descripción (igual que verListas)
    const productosHTML = (Array.isArray(lista.productos) ? lista.productos : []).map(p => {
      const iconoP = p.precio === 0 ? `<i class="fa-solid fa-hourglass-half" title="Precio 0" style="color: #f59e0b;"></i>` : "";
      return `<li>${escapeHtml(p.nombre)} ${iconoP} — $${(p.precio||0).toFixed(2)}${p.descripcion ? ` — ${escapeHtml(p.descripcion)}` : ""}</li>`;
    }).join("");

    // color según días
    const colors = colorForDias(dias);
    const resumenHTML = `
      <div class="lista-resumen" style="border-left:6px solid ${colors.border}; padding-left:8px; background:${colors.bg}; border-radius:4px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            📅 <strong>${formatearFecha(lista.fecha)}</strong> — 🏪 <em>${escapeHtml(lista.lugar)}</em> — 💰 $${total}
            <div class="texto-estado" style="font-size:0.9em; color:#333; margin-top:4px;">${estadoTexto}</div>
          </div>
          <div style="font-size:0.9em; color:#555;">ID: ${escapeHtml(lista.id)}</div>
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

    // click en li (excepto botones) alterna detalle productos y acciones
    li.addEventListener("click", (e) => {
      if (e.target && (e.target.matches("button") || e.target.closest("button"))) return;
      const panelAcc = li.querySelector(`#acciones-${lista.id}`);
      const panelProd = li.querySelector(`#detalle-productos-${lista.id}`);
      if (panelProd) panelProd.classList.toggle("oculto");
      if (panelAcc) panelAcc.classList.toggle("oculto");
    });

    // botones con confirmaciones
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

/* ======= ACCIONES: marcar hecha / descartar ======= */
async function marcarListaComoHecha(id) {
  try {
    if (navigator.onLine) await updateDoc(doc(db, "listas", id), { estado: "normal", completada: true });
    else guardarCambiosOffline(id, { estado: "normal", completada: true });
    cancelScheduledNotificationsForList(id);
    mostrarMensaje("✅ Lista marcada como hecha");
    await actualizarNotificaciones();
    mostrarListasFirebase(true);
  } catch(e){ mostrarMensaje("❌ Error marcando la lista como hecha"); console.error(e); }
}
async function descartarNotificacion(id) {
  try {
    if (navigator.onLine) await updateDoc(doc(db, "listas", id), { _notificacionDescartada: true });
    else {
      let cache = JSON.parse(localStorage.getItem("listasCache") || "[]");
      cache = cache.map(l => l.id === id ? ({ ...l, _notificacionDescartada: true }) : l);
      localStorage.setItem("listasCache", JSON.stringify(cache));
    }
    cancelScheduledNotificationsForList(id);
    mostrarMensaje("✅ Notificación descartada");
    actualizarNotificaciones();
  } catch(e){ console.error("Error descartar:", e); mostrarMensaje("❌ Error descartando notificación"); }
}

/* ======= CRUD: guardar, editar, eliminar listas ======= */
async function guardarLista(nuevaLista) {
  try {
    nuevaLista.createdAt = serverTimestamp();
    await addDoc(collection(db, "listas"), nuevaLista);
    mostrarMensaje("✅ Lista guardada correctamente");
    actualizarNotificaciones();
  } catch(e){ mostrarMensaje("❌ Error guardando la lista: " + e.message); }
}

async function eliminarLista(id) {
  const confirmar = confirm("¿Estás seguro de que deseas eliminar esta lista? Esta acción no se puede deshacer.");
  if (!confirmar) return;
  try {
    await deleteDoc(doc(db, "listas", id));
    mostrarMensaje("✅ Lista eliminada con éxito");
    cancelScheduledNotificationsForList(id);
    mostrarListasFirebase(true);
    mostrarResultadosConsulta();
    actualizarNotificaciones();
  } catch(e){ mostrarMensaje("❌ Error eliminando lista: " + e.message); }
}

async function guardarCambiosLista(idLista, datosLista) {
  if (navigator.onLine) {
    try {
      const docRef = doc(db, "listas", idLista);
      await updateDoc(docRef, datosLista);
      mostrarMensaje("✅ Cambios guardados en la nube.");
      actualizarNotificaciones();
    } catch(e){ mostrarMensaje("❌ Error al guardar en Firestore."); guardarCambiosOffline(idLista, datosLista); }
  } else { mostrarMensaje("⚠️ Sin conexión. Guardando cambios localmente."); guardarCambiosOffline(idLista, datosLista); }
}
function guardarCambiosOffline(idLista, datosLista) {
  let listasPendientes = JSON.parse(localStorage.getItem("listasPendientes") || "{}");
  listasPendientes[idLista] = datosLista;
  localStorage.setItem("listasPendientes", JSON.stringify(listasPendientes));
}

/* ======= INTERFAZ: mostrarListas, consultas, sugerencias, editar ======= */
let listasMostradasCount = 5;
async function mostrarListasFirebase(resetCount=false, soloPendientes=false) {
  if (resetCount) listasMostradasCount = 5;
  const filtroLugar = normalizarTexto(document.getElementById("filtroLugarListas")?.value || "");
  try {
    const q = query(collection(db, "listas"), orderBy("fecha", "desc"), limit(listasMostradasCount));
    const snapshot = await getDocs(q);
    let listas = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    listas = listas.filter(l => normalizarTexto(l.lugar).includes(filtroLugar));
    if (soloPendientes) {
      listas = listas.filter(l => l.estado === "pendiente" || (Array.isArray(l.productos) && l.productos.some(p => p.precio === 0)));
    }
    const ul = document.getElementById("todasLasListas");
    if (!ul) return;
    ul.innerHTML = "";
    if (listas.length === 0) { ul.innerHTML = "<li>No hay listas guardadas que coincidan con el filtro.</li>"; document.getElementById("btnCargarMas") && (document.getElementById("btnCargarMas").style.display = "none"); actualizarNotificaciones(); return; }
    listas.forEach(lista => {
      const total = lista.productos.reduce((sum,p)=>sum+(p.precio||0),0).toFixed(2);
      const pendienteFecha = lista.estado === "pendiente";
      const pendienteProducto = lista.productos.some(p => p.precio === 0);
      let badge = "";
      if (pendienteFecha) badge += '🕒 <strong style="color:#fbc02d">PENDIENTE (Fecha)</strong><br>';
      if (pendienteProducto) badge += '⌛ <strong style="color:#fbc02d">Productos pendientes</strong><br>';
      const productosHTML = lista.productos.map(p => {
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
    document.getElementById("btnCargarMas") && (document.getElementById("btnCargarMas").style.display = snapshot.size === listasMostradasCount ? "block" : "none");
    actualizarNotificaciones();
  } catch(e){ mostrarMensaje("❌ Error cargando listas: " + e.message); }
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
    const snapshot = await getDocs(collection(db, "listas"));
    let totalResultados = 0;
    const listas = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    listas.forEach(lista => {
      const lugarNormalizado = normalizarTexto(lista.lugar);
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
  } catch(e){ mostrarMensaje("❌ Error al consultar: " + e.message); }
}

/* ======= SUGERENCIAS ======= */
async function mostrarSugerencias(input) {
  const valor = normalizarTexto(input.value || "");
  const contenedorSugerencias = input.nextElementSibling;
  if (!contenedorSugerencias) return;
  if (valor.length < 2) { contenedorSugerencias.style.display = "none"; contenedorSugerencias.innerHTML = ""; return; }
  try {
    const snapshot = await getDocs(collection(db, "listas"));
    const productosEncontrados = [];
    snapshot.forEach(docu => {
      const lista = docu.data();
      const productos = lista.productos || [];
      productos.forEach(p => {
        const nombreNormalizado = normalizarTexto(p.nombre);
        if (nombreNormalizado.includes(valor)) {
          productosEncontrados.push({ nombre: p.nombre, precio: p.precio, descripcion: p.descripcion || "", lugar: lista.lugar, fecha: lista.fecha || lista.createdAt || new Date() });
        }
      });
    });
    if (productosEncontrados.length === 0) { contenedorSugerencias.style.display = "none"; contenedorSugerencias.innerHTML = ""; return; }
    productosEncontrados.sort((a,b)=> new Date(b.fecha) - new Date(a.fecha));
    contenedorSugerencias.style.display = "block";
    contenedorSugerencias.innerHTML =
      productosEncontrados.slice(0,5).map(p => `
        <div class="sugerencia-item animate" onclick='seleccionarSugerencia(this, ${JSON.stringify(p)})'>
          <div><strong>🛒 ${escapeHtml(p.nombre)}</strong></div>
          <div>💲<strong>${(p.precio||0).toFixed(2)}</strong></div>
          <div>📍${escapeHtml(p.lugar)} — 🗓️ ${formatearFecha(p.fecha)}</div>
          <div class="descripcion-sugerida">📝 ${escapeHtml(p.descripcion)}</div>
        </div>
      `).join("") + `<div style="height:20px;"></div>`;
  } catch(e){ console.error("Error sugerencias:", e); contenedorSugerencias.style.display = "none"; contenedorSugerencias.innerHTML = ""; }
}
function seleccionarSugerencia(div, producto) {
  try {
    const contenedorProducto = div.closest('.sugerencias').previousElementSibling.closest('.producto');
    if (!contenedorProducto) return;
    contenedorProducto.querySelector('.producto-nombre').value = producto.nombre;
    contenedorProducto.querySelector('.producto-precio').value = producto.precio;
    contenedorProducto.querySelector('.producto-desc').value = producto.descripcion;
    const contenedorSugerencias = div.closest('.sugerencias');
    contenedorSugerencias.innerHTML = ""; contenedorSugerencias.style.display = "none";
    contenedorProducto.querySelector('.producto-precio').focus();
  } catch(e){ console.error("seleccionarSugerencia error:", e); }
}

/* ======= EDITAR ======= */
async function editarLista(id) {
  try {
    const snap = await getDocs(collection(db, "listas"));
    const listaDoc = snap.docs.find(d => d.id === id);
    if (!listaDoc) return mostrarMensaje("❌ Lista no encontrada");
    const lista = listaDoc.data();
    document.getElementById("lugar").value = lista.lugar;
    document.getElementById("fecha").value = lista.fecha;
    document.getElementById("idListaEditando").value = id;
    document.getElementById("tituloFormulario").textContent = "Editar Lista de Compras";
    const contenedor = document.getElementById("productos");
    contenedor.innerHTML = "";
    lista.productos.forEach(p => {
      const div = document.createElement("div");
      div.className = "producto";
      div.innerHTML = `
        <div class="inputs-container">
          <input type="text" placeholder="Producto" class="producto-nombre" value="${escapeHtml(p.nombre)}" required oninput="mostrarSugerencias(this)" />
          <div class="sugerencias"></div>
          <input type="number" placeholder="Precio" class="producto-precio" value="${p.precio}" required />
          <input type="text" placeholder="Descripción (opcional)" class="producto-desc" value="${escapeHtml(p.descripcion || "")}" />
        </div>
        <button type="button" class="eliminar-producto" onclick="eliminarProducto(this)">❌</button>
      `;
      contenedor.appendChild(div);
    });
    mostrarSeccion("agregar");
    window.scrollTo(0,0);
  } catch(e){ mostrarMensaje("❌ Error al cargar la lista: " + e.message); }
}

/* ======= FORM SUBMIT ======= */
document.getElementById("formLista")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const lugar = document.getElementById("lugar").value.trim();
  const fechaInput = document.getElementById("fecha").value;
  if (!fechaInput) { mostrarMensaje("❌ Ingresa una fecha"); return; }
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
    if (!nombre) { mostrarMensaje(`❌ El producto #${i+1} no tiene nombre.`); hayError = true; return; }
    if (isNaN(precio) || precio < 0) { mostrarMensaje(`❌ El producto "${nombre || "sin nombre"}" tiene un precio inválido.`); hayError = true; return; }
    productos.push({ nombre, precio, descripcion });
  });
  if (hayError || productos.length === 0) return;
  const idLista = document.getElementById("idListaEditando").value;
  const datos = { lugar, fecha: fechaInput, productos, estado };
  if (idLista) {
    try {
      await updateDoc(doc(db, "listas", idLista), datos);
      mostrarMensaje("✅ Lista actualizada correctamente");
      const snap = await getDocs(collection(db, "listas"));
      const listaDoc = snap.docs.find(d => d.id === idLista);
      if (listaDoc) {
        const listaObj = { id: listaDoc.id, ...listaDoc.data() };
        cancelScheduledNotificationsForList(idLista);
        await scheduleNotificationsForList(listaObj);
      }
      actualizarNotificaciones();
    } catch(e){ mostrarMensaje("❌ Error actualizando la lista: " + e.message); }
  } else {
    await guardarLista({ ...datos, createdAt: serverTimestamp() });
  }
  e.target.reset();
  document.getElementById("idListaEditando").value = "";
  document.getElementById("tituloFormulario").textContent = "Agregar Lista de Compras";
  document.getElementById("productos").innerHTML = `
    <div class="producto">
      <div class="inputs-container">
        <input type="text" placeholder="Producto" class="producto-nombre" required oninput="mostrarSugerencias(this)" />
        <div class="sugerencias"></div>
        <input type="number" placeholder="Precio" class="producto-precio" required />
        <input type="text" placeholder="Descripción (opcional)" class="producto-desc" />
      </div>
      <button type="button" class="eliminar-producto" onclick="eliminarProducto(this)">❌</button>
    </div>`;
  mostrarListasFirebase(true);
});

/* ======= OTROS ======= */
function mostrarMensaje(texto) {
  const mensajeDiv = document.getElementById("mensaje");
  if (!mensajeDiv) { console.log("MSG:", texto); return; }
  mensajeDiv.textContent = texto;
  mensajeDiv.classList.remove("oculto");
  setTimeout(()=> mensajeDiv.classList.add("oculto"), 3000);
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

/* ======= SENCILLOS: agregar/eliminar producto y exposicion global ======= */
function agregarProducto() {
  const contenedor = document.getElementById("productos");
  if (!contenedor) return;
  const div = document.createElement("div");
  div.className = "producto";
  div.innerHTML = `
    <div class="inputs-container">
      <input type="text" placeholder="Producto" class="producto-nombre" required oninput="mostrarSugerencias(this)" />
      <div class="sugerencias"></div>
      <input type="number" placeholder="Precio" class="producto-precio" required />
      <input type="text" placeholder="Descripción (opcional)" class="producto-desc" />
    </div>
    <button type="button" class="eliminar-producto" onclick="eliminarProducto(this)">❌</button>
  `;
  contenedor.appendChild(div);
}
function eliminarProducto(boton) { const divProducto = boton.parentElement; if (divProducto) divProducto.remove(); }

/* ======= SYNC ONLINE/OFFLINE ======= */
window.addEventListener("online", async () => {
  mostrarMensaje("🔗 Conexión restablecida");
  let listasPendientes = JSON.parse(localStorage.getItem("listasPendientes") || "{}");
  for (const id in listasPendientes) {
    try { await updateDoc(doc(db,"listas",id), listasPendientes[id]); mostrarMensaje(`✅ Lista '${id}' sincronizada.`); delete listasPendientes[id]; }
    catch(e){ mostrarMensaje(`❌ Error al sincronizar lista '${id}'.`); }
  }
  localStorage.setItem("listasPendientes", JSON.stringify(listasPendientes));
  actualizarNotificaciones();
});
window.addEventListener("offline", () => mostrarMensaje("⚠️ Sin conexión. Los datos se guardarán localmente y se sincronizarán al reconectarse."));

/* ======= INICIALIZACIÓN ======= */
document.addEventListener("DOMContentLoaded", () => {
  mostrarSeccion("agregar");
  mostrarListasFirebase(true);
  document.getElementById("filtroTienda")?.addEventListener("input", mostrarResultadosConsulta);
  document.getElementById("filtroProducto")?.addEventListener("input", mostrarResultadosConsulta);
  document.getElementById("ordenarPor")?.addEventListener("change", mostrarResultadosConsulta);
  document.getElementById("btnPendientes")?.addEventListener("click", () => mostrarListasFirebase(true, true));
  document.getElementById("btnTodas")?.addEventListener("click", () => mostrarListasFirebase(true, false));
  rebuildScheduledTimeoutsFromStorage();
  actualizarNotificaciones();
});

/* ======= EXPONER FUNCIONES PARA HTML (onclick inline) ======= */
window.mostrarSeccion = function(id){ document.querySelectorAll(".seccion").forEach(s=>s.classList.add("oculto")); const el = document.getElementById(id); if (el) el.classList.remove("oculto"); };
window.agregarProducto = agregarProducto;
window.eliminarProducto = eliminarProducto;
window.alternarDetalle = alternarDetalle;
window.eliminarLista = eliminarLista;
window.mostrarSugerencias = mostrarSugerencias;
window.seleccionarSugerencia = seleccionarSugerencia;
window.editarLista = editarLista;
window.cargarMasListas = cargarMasListas;
window.actualizarNotificaciones = actualizarNotificaciones;
window.irAListaPorId = function(id){ mostrarSeccion("verListas"); setTimeout(()=>{ const elemento = document.querySelector(`#todasLasListas li[data-id="${id}"]`); if (elemento) elemento.scrollIntoView({behavior:"smooth", block:"center"}); },200); };
