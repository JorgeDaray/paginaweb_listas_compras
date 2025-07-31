// Firebase ya inicializado en el HTML:
// const app = firebase.initializeApp(firebaseConfig);
// const db = firebase.firestore();

function mostrarSeccion(id) {
  document.querySelectorAll('.seccion').forEach(sec => {
    sec.classList.add('oculto');
  });
  document.getElementById(id).classList.remove('oculto');
}

function agregarProducto() {
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

function eliminarProducto(boton) {
  const divProducto = boton.parentElement;
  divProducto.remove();
}

document.getElementById("formLista").addEventListener("submit", async e => {
  e.preventDefault();
  const lugar = document.getElementById("lugar").value.trim();
  const fecha = document.getElementById("fecha").value;
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
    if (isNaN(precio) || precio <= 0) {
      mostrarMensaje(`❌ El producto "${nombre || 'sin nombre'}" tiene un precio inválido.`);
      hayError = true;
      return;
    }
    productos.push({ nombre, precio, descripcion });
  });

  if (hayError || productos.length === 0) return;

  const nuevaLista = { lugar, fecha, productos, createdAt: firebase.firestore.FieldValue.serverTimestamp() };

  try {
    await db.collection("listas").add(nuevaLista);
    mostrarMensaje("✅ Lista guardada correctamente");
    e.target.reset();
    document.getElementById("productos").innerHTML = `
      <div class="producto">
        <div class="inputs-container">
          <input type="text" placeholder="Producto" class="producto-nombre" required oninput="mostrarSugerencias(this)" />
          <div class="sugerencias"></div>
          <input type="number" placeholder="Precio" class="producto-precio" required />
          <input type="text" placeholder="Descripción (opcional)" class="producto-desc" />
        </div>
      </div>`;
    mostrarListasFirebase(true);
  } catch (error) {
    mostrarMensaje("❌ Error guardando la lista: " + error.message);
  }
});

async function mostrarResultadosConsulta() {
  const filtroTienda = normalizarTexto(document.getElementById("filtroTienda").value);
  const filtroProducto = normalizarTexto(document.getElementById("filtroProducto").value);
  const criterioOrden = document.getElementById("ordenarPor") ? document.getElementById("ordenarPor").value : null;
  const resultados = document.getElementById("listaResultados");
  const contador = document.getElementById("contadorResultados");

  resultados.innerHTML = "";

  try {
    // Traemos todas las listas (podrías paginar si quieres)
    const snapshot = await db.collection("listas").get();
    let totalResultados = 0;

    const listas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    listas.forEach(lista => {
      const lugarNormalizado = normalizarTexto(lista.lugar);

      const coincideTienda = !filtroTienda || lugarNormalizado.includes(filtroTienda);
      if (!coincideTienda) return;

      let productosFiltrados = lista.productos.filter(p => {
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
            ${productosFiltrados.map(p => `
              <li>
                <strong>${p.nombre}</strong> - 💲${p.precio.toFixed(2)}
                ${p.descripcion ? `<div>📝 ${p.descripcion}</div>` : ""}
              </li>
            `).join("")}
          </ul>
        `;
        resultados.appendChild(item);
      }
    });

    if (totalResultados === 0) {
      resultados.innerHTML = "<li>No se encontraron resultados.</li>";
    }

    if (contador) {
      contador.textContent = `${totalResultados} producto${totalResultados === 1 ? "" : "s"} encontrado${totalResultados === 1 ? "" : "s"}`;
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

let listasMostradasCount = 10;

async function mostrarListasFirebase(resetCount = false) {
  if (resetCount) listasMostradasCount = 10;

  const filtroLugar = normalizarTexto(document.getElementById("filtroLugarListas").value);

  try {
    // Traemos todas las listas ordenadas por fecha descendente
    const snapshot = await db.collection("listas")
      .orderBy("fecha", "desc")
      .limit(listasMostradasCount)
      .get();

    let listas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Filtramos por lugar (después de obtener las listas)
    listas = listas.filter(lista => normalizarTexto(lista.lugar).includes(filtroLugar));

    const ul = document.getElementById("todasLasListas");
    ul.innerHTML = "";

    if (listas.length === 0) {
      ul.innerHTML = "<li>No hay listas guardadas que coincidan con el filtro.</li>";
      document.getElementById("btnCargarMas").style.display = "none";
      return;
    }

    listas.forEach((lista, index) => {
      const total = lista.productos.reduce((sum, p) => sum + p.precio, 0).toFixed(2);

      const productosHTML = lista.productos.map(p => `
        <li>- ${p.nombre} ($${p.precio.toFixed(2)}) ${p.descripcion ? `- ${p.descripcion}` : ""}</li>
      `).join("");

      ul.innerHTML += `
        <li>
          <div onclick="alternarDetalle('${lista.id}')" style="cursor: pointer;">
            📅 <strong>${formatearFecha(lista.fecha)}</strong><br>
            🏪 <em>${lista.lugar}</em><br>
            💰 Total: $${total}
            <div id="detalle-${lista.id}" class="detalle-lista oculto">
                <ul>${productosHTML}</ul>
                <button onclick="eliminarLista('${lista.id}')">🗑️ Eliminar esta lista</button>
            </div>
          </div>
        </li>
      `;
    });

    // Mostrar u ocultar botón "Mostrar otros 10"
    if (snapshot.size === listasMostradasCount) {
      document.getElementById("btnCargarMas").style.display = "block";
    } else {
      document.getElementById("btnCargarMas").style.display = "none";
    }
  } catch (error) {
    mostrarMensaje("❌ Error cargando listas: " + error.message);
  }
}

function cargarMasListas() {
  listasMostradasCount += 10;
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
    await db.collection("listas").doc(id).delete();
    mostrarMensaje("✅ Lista eliminada con éxito");
    mostrarListasFirebase(true);
    mostrarResultadosConsulta();
  } catch (error) {
    mostrarMensaje("❌ Error eliminando lista: " + error.message);
  }
}

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
  // Si fechaStr es un Timestamp de Firebase, convertir a Date
  if (fechaStr.toDate) {
    fecha = fechaStr.toDate();
  } else if (typeof fechaStr === "string") {
    fecha = new Date(fechaStr);
  }
  return fecha.toLocaleDateString("es-MX", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function normalizarTexto(texto) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// Sugerencias: para simplificar, aquí dejamos como no implementado,
// pero podrías hacer consultas a Firestore si quieres.
// O usar un arreglo local con productos más frecuentes, etc.
function mostrarSugerencias(input) {
  const contenedorSugerencias = input.nextElementSibling;
  contenedorSugerencias.style.display = "none";
  contenedorSugerencias.innerHTML = "";
}

function seleccionarSugerencia(div, producto) {
  // Lo mismo que antes, pero si quieres podrías ajustar.
}

document.addEventListener("DOMContentLoaded", () => {
  mostrarSeccion('agregar');
  mostrarListasFirebase(true);

  // Agregar listeners para filtros en consulta
  document.getElementById("filtroTienda").addEventListener("input", mostrarResultadosConsulta);
  document.getElementById("filtroProducto").addEventListener("input", mostrarResultadosConsulta);
  document.getElementById("ordenarPor").addEventListener("change", mostrarResultadosConsulta);
});
