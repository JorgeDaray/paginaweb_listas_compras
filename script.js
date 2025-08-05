// script.js
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

// Inicializar Firebase y Firestore
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);

import { enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

enableIndexedDbPersistence(db).catch((err) => {
  if (err.code == 'failed-precondition') {
    // Esto pasa si tienes múltiples pestañas abiertas con Firestore en el mismo dominio
    console.warn("No se puede habilitar persistencia porque hay múltiples pestañas abiertas.");
  } else if (err.code == 'unimplemented') {
    // El navegador no soporta persistencia offline
    console.warn("El navegador no soporta persistencia offline.");
  }
});

// Mostrar/ocultar secciones
export function mostrarSeccion(id) {
  document.querySelectorAll(".seccion").forEach((sec) => {
    sec.classList.add("oculto");
  });
  document.getElementById(id).classList.remove("oculto");
}

// Agregar producto dinámicamente
export function agregarProducto() {
  const contenedor = document.getElementById("productos");
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

// Eliminar producto
export function eliminarProducto(boton) {
  const divProducto = boton.parentElement;
  divProducto.remove();
}

// Guardar lista en Firestore
async function guardarLista(nuevaLista) {
  try {
    nuevaLista.createdAt = serverTimestamp();
    await addDoc(collection(db, "listas"), nuevaLista);
    mostrarMensaje("✅ Lista guardada correctamente");
  } catch (error) {
    mostrarMensaje("❌ Error guardando la lista: " + error.message);
  }
}

// Evento submit del formulario
document.getElementById("formLista").addEventListener("submit", async (e) => {
  e.preventDefault();

  const lugar = document.getElementById("lugar").value.trim();
  const fecha = document.getElementById("fecha").value;        // e.g. "2025-08-10"
  const fechaObj = new Date(fecha);
  const hoy = new Date();
  // Si la fecha es estrictamente posterior a hoy, marcado como pendiente
  const estado = fechaObj > hoy ? "pendiente" : "normal";

  const productos = [];
  let hayError = false;

  document.querySelectorAll(".producto").forEach((p, i) => {
    const nombre = p.querySelector(".producto-nombre").value.trim();
    const precio = parseFloat(p.querySelector(".producto-precio").value);
    const descripcion = p.querySelector(".producto-desc").value.trim();

    if (!nombre) {
      mostrarMensaje(`❌ El producto #${i + 1} no tiene nombre.`);
      hayError = true;
      return;
    }
    if (isNaN(precio) || precio < 0) {
      mostrarMensaje(`❌ El producto "${nombre || "sin nombre"}" tiene un precio inválido.`);
      hayError = true;
      return;
    }
    productos.push({ nombre, precio, descripcion });
  });

  if (hayError || productos.length === 0) return;

  const idLista = document.getElementById("idListaEditando").value;
  const datos = { lugar, fecha, productos, estado };

  if (idLista) {
    // Actualizar
    try {
      await updateDoc(doc(db, "listas", idLista), datos);
      mostrarMensaje("✅ Lista actualizada correctamente");
    } catch (error) {
      mostrarMensaje("❌ Error actualizando la lista: " + error.message);
    }
  } else {
    // Crear nueva
    await guardarLista({ ...datos, createdAt: serverTimestamp() });
  }

  // Reset del formulario
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

// Mostrar resultados en la sección "Consultar por Tienda"
async function mostrarResultadosConsulta() {
  const filtroTienda = normalizarTexto(document.getElementById("filtroTienda").value);
  const filtroProducto = normalizarTexto(document.getElementById("filtroProducto").value);
  const criterioOrden = document.getElementById("ordenarPor") ? document.getElementById("ordenarPor").value : null;
  const resultados = document.getElementById("listaResultados");
  const contador = document.getElementById("contadorResultados");

  resultados.innerHTML = "";

  try {
    const snapshot = await getDocs(collection(db, "listas"));
    let totalResultados = 0;

    const listas = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    listas.forEach((lista) => {
      const lugarNormalizado = normalizarTexto(lista.lugar);
      const coincideTienda = !filtroTienda || lugarNormalizado.includes(filtroTienda);
      if (!coincideTienda) return;

      let productosFiltrados = lista.productos.filter((p) => {
        const nombreNormalizado = normalizarTexto(p.nombre);
        return !filtroProducto || nombreNormalizado.includes(filtroProducto);
      });

      if (criterioOrden === "precio") {
        productosFiltrados.sort((a, b) => a.precio - b.precio);
      } else if (criterioOrden === "nombre") {
        productosFiltrados.sort((a, b) => a.nombre.localeCompare(b.nombre));
      }

      if (productosFiltrados.length > 0) {
        totalResultados += productosFiltrados.length;

        const item = document.createElement("li");
        item.innerHTML = `
          <h3>🛍️ ${lista.lugar} — 📅 ${formatearFecha(lista.fecha)}</h3>
          <ul>
            ${productosFiltrados
              .map(
                (p) => `
              <li>
                <strong>${p.nombre}</strong> - 💲${p.precio.toFixed(2)}
                ${p.descripcion ? `<div>📝 ${p.descripcion}</div>` : ""}
              </li>
            `
              )
              .join("")}
          </ul>
        `;
        resultados.appendChild(item);
      }
    });

    if (totalResultados === 0) {
      resultados.innerHTML = "<li>No se encontraron resultados.</li>";
    }

    if (contador) {
      contador.textContent = `${totalResultados} producto${totalResultados === 1 ? "" : "s"} encontrado${
        totalResultados === 1 ? "" : "s"
      }`;
      contador.classList.remove("cero", "pocos", "muchos");
      if (totalResultados === 0) {
        contador.classList.add("cero");
      } else if (totalResultados <= 5) {
        contador.classList.add("pocos");
      } else {
        contador.classList.add("muchos");
      }
    }
  } catch (error) {
    mostrarMensaje("❌ Error al consultar: " + error.message);
  }
}

let listasMostradasCount = 5;
// Mostrar listas en "Ver Listas"
// Mostrar listas en "Ver Listas"
async function mostrarListasFirebase(resetCount = false, soloPendientes = false) {
  if (resetCount) listasMostradasCount = 5;

  const filtroLugar = normalizarTexto(document.getElementById("filtroLugarListas").value);

  try {
    const q = query(
      collection(db, "listas"),
      orderBy("fecha", "desc"),
      limit(listasMostradasCount)
    );
    const snapshot = await getDocs(q);

    let listas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Filtrar por lugar
    listas = listas.filter(l => normalizarTexto(l.lugar).includes(filtroLugar));

    // Filtrar por pendientes si aplica
    if (soloPendientes) {
      listas = listas.filter(l =>
        l.estado === "pendiente" || l.productos.some(p => p.precio === 0)
      );
    }

    const ul = document.getElementById("todasLasListas");
    ul.innerHTML = "";

    if (listas.length === 0) {
      ul.innerHTML = "<li>No hay listas guardadas que coincidan con el filtro.</li>";
      document.getElementById("btnCargarMas").style.display = "none";
      return;
    }

    listas.forEach(lista => {
      const total = lista.productos.reduce((sum, p) => sum + p.precio, 0).toFixed(2);

      const pendienteFecha = lista.estado === "pendiente";
      const pendienteProducto = lista.productos.some(p => p.precio === 0);

      let badge = "";
      if (pendienteFecha) {
        badge += '🕒 <strong style="color:#fbc02d">PENDIENTE (Fecha)</strong><br>';
      }
      if (pendienteProducto) {
        badge += '⌛ <strong style="color:#fbc02d">Productos pendientes</strong><br>';
      }

      const productosHTML = lista.productos
        .map(p => {
          const iconoP = p.precio === 0
            ? `<i class="fa-solid fa-hourglass-half" title="Precio 0" style="color: #fbc02d;"></i>`
            : "";
          return `<li>${p.nombre} ${iconoP} — $${p.precio.toFixed(2)}${p.descripcion ? ` — ${p.descripcion}` : ""}</li>`;
        })
        .join("");

      ul.innerHTML += `
        <li>
          <div class="lista-item resumen" onclick="alternarDetalle('${lista.id}')">
            📅 <strong>${formatearFecha(lista.fecha)}</strong> — 🏪 <em>${lista.lugar}</em> — 💰 $${total}
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

    document.getElementById("btnCargarMas").style.display =
      snapshot.size === listasMostradasCount ? "block" : "none";

  } catch (error) {
    mostrarMensaje("❌ Error cargando listas: " + error.message);
  }
}

function cargarMasListas() {
  listasMostradasCount += 5;  // cambiar 10 por 5
  mostrarListasFirebase();
}

function alternarDetalle(id) {
  const detalle = document.getElementById(`detalle-${id}`);
  detalle.classList.toggle("oculto");
}

async function eliminarLista(id) {
  const confirmar = confirm("¿Estás seguro de que deseas eliminar esta lista? Esta acción no se puede deshacer.");
  if (!confirmar) return;

  try {
    await deleteDoc(doc(db, "listas", id));
    mostrarMensaje("✅ Lista eliminada con éxito");
    mostrarListasFirebase(true);
    mostrarResultadosConsulta();
  } catch (error) {
    mostrarMensaje("❌ Error eliminando lista: " + error.message);
  }
}

// Funciones auxiliares
function mostrarMensaje(texto) {
  const mensajeDiv = document.getElementById("mensaje");
  mensajeDiv.textContent = texto;
  mensajeDiv.classList.remove("oculto");

  setTimeout(() => {
    mensajeDiv.classList.add("oculto");
  }, 3000);
}

function formatearFecha(fechaStr) {
  if (!fechaStr) return "";
  let fecha = fechaStr;
  if (fechaStr.toDate) {
    fecha = fechaStr.toDate();
  } else if (typeof fechaStr === "string") {
    fecha = new Date(fechaStr);
  }
  return fecha.toLocaleDateString("es-MX", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function normalizarTexto(texto) {
  return texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Sugerencias ()
async function mostrarSugerencias(input) {
  const valor = normalizarTexto(input.value);
  const contenedorSugerencias = input.nextElementSibling;

  if (valor.length < 2) {
    contenedorSugerencias.style.display = "none";
    contenedorSugerencias.innerHTML = "";
    return;
  }

  try {
    const snapshot = await getDocs(collection(db, "listas"));
    const productosEncontrados = [];

    snapshot.forEach((doc) => {
      const lista = doc.data();
      const productos = lista.productos || [];

      productos.forEach((p) => {
        const nombreNormalizado = normalizarTexto(p.nombre);
        if (nombreNormalizado.includes(valor)) {
          productosEncontrados.push({
            nombre: p.nombre,
            precio: p.precio,
            descripcion: p.descripcion || "",
            lugar: lista.lugar,
            fecha: lista.fecha || lista.createdAt || new Date(),
          });
        }
      });
    });

    if (productosEncontrados.length === 0) {
      contenedorSugerencias.style.display = "none";
      contenedorSugerencias.innerHTML = "";
      return;
    }

    productosEncontrados.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    contenedorSugerencias.style.display = "block";
    contenedorSugerencias.innerHTML =
      productosEncontrados
        .slice(0, 5)
        .map((p) => `
          <div class="sugerencia-item animate" onclick='seleccionarSugerencia(this, ${JSON.stringify(p)})'>
            <div><strong>🛒 ${p.nombre}</strong></div>
            <div>💲<strong>${p.precio.toFixed(2)}</strong></div>
            <div>📍${p.lugar} — 🗓️ ${formatearFecha(p.fecha)}</div>
            <div class="descripcion-sugerida">📝 ${p.descripcion}</div>
          </div>
        `)
        .join("") + `<div style="height: 20px;"></div>`;
  } catch (error) {
    console.error("Error al obtener sugerencias:", error);
    contenedorSugerencias.style.display = "none";
    contenedorSugerencias.innerHTML = "";
  }
}

function seleccionarSugerencia(div, producto) {
  const contenedorProducto = div.closest('.sugerencias').previousElementSibling.closest('.producto');
  if (!contenedorProducto) return;

  contenedorProducto.querySelector('.producto-nombre').value = producto.nombre;
  contenedorProducto.querySelector('.producto-precio').value = producto.precio;
  contenedorProducto.querySelector('.producto-desc').value = producto.descripcion;

  const contenedorSugerencias = div.closest('.sugerencias');
  contenedorSugerencias.innerHTML = "";
  contenedorSugerencias.style.display = "none";

  contenedorProducto.querySelector('.producto-precio').focus();
}

async function editarLista(id) {
  try {
    const ref = doc(db, "listas", id);
    const snap = await getDocs(collection(db, "listas"));
    const listaDoc = snap.docs.find((d) => d.id === id);
    if (!listaDoc) return mostrarMensaje("❌ Lista no encontrada");

    const lista = listaDoc.data();

    document.getElementById("lugar").value = lista.lugar;
    document.getElementById("fecha").value = lista.fecha;
    document.getElementById("idListaEditando").value = id;
    document.getElementById("tituloFormulario").textContent = "Editar Lista de Compras";

    const contenedor = document.getElementById("productos");
    contenedor.innerHTML = "";

    lista.productos.forEach((p) => {
      const div = document.createElement("div");
      div.className = "producto";
      div.innerHTML = `
        <div class="inputs-container">
          <input type="text" placeholder="Producto" class="producto-nombre" value="${p.nombre}" required oninput="mostrarSugerencias(this)" />
          <div class="sugerencias"></div>
          <input type="number" placeholder="Precio" class="producto-precio" value="${p.precio}" required />
          <input type="text" placeholder="Descripción (opcional)" class="producto-desc" value="${p.descripcion || ""}" />
        </div>
        <button type="button" class="eliminar-producto" onclick="eliminarProducto(this)">❌</button>
      `;
      contenedor.appendChild(div);
    });

    mostrarSeccion("agregar");
    window.scrollTo(0, 0);
  } catch (error) {
    mostrarMensaje("❌ Error al cargar la lista: " + error.message);
  }
}

// Para que los eventos globales funcionen con funciones exportadas:
window.mostrarSeccion = mostrarSeccion;
window.agregarProducto = agregarProducto;
window.eliminarProducto = eliminarProducto;
window.alternarDetalle = alternarDetalle;
window.eliminarLista = eliminarLista;
window.mostrarSugerencias = mostrarSugerencias;
window.seleccionarSugerencia = seleccionarSugerencia;
window.editarLista = editarLista;
window.cargarMasListas = cargarMasListas;

// Inicialización al cargar página
document.addEventListener("DOMContentLoaded", () => {
  mostrarSeccion("agregar");
  mostrarListasFirebase(true);

  document.getElementById("filtroTienda").addEventListener("input", mostrarResultadosConsulta);
  document.getElementById("filtroProducto").addEventListener("input", mostrarResultadosConsulta);
  document.getElementById("ordenarPor").addEventListener("change", mostrarResultadosConsulta);
  document.getElementById("btnPendientes").addEventListener("click", () => {
    mostrarListasFirebase(true, true); // resetCount=true, soloPendientes=true
  });
  document.getElementById("btnTodas").addEventListener("click", () => {
    mostrarListasFirebase(true, false); // resetCount=true, soloPendientes=false
  });
    
});
