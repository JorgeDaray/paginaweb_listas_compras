function mostrarSeccion(id) {
    document.querySelectorAll('.seccion').forEach(sec => {
      sec.classList.add('oculto');  // oculta todas
    });
    document.getElementById(id).classList.remove('oculto');  // muestra solo la seleccionada
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
  
  document.getElementById("formLista").addEventListener("submit", e => {
    e.preventDefault();
    const lugar = document.getElementById("lugar").value;
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
  
    if (hayError || productos.length === 0) {
      return; // Cancela el guardado si hay errores
    }
  
    const nuevaLista = { lugar, fecha, productos };
  
    let listas = JSON.parse(localStorage.getItem("listas")) || [];
    listas.push(nuevaLista);
    localStorage.setItem("listas", JSON.stringify(listas));
  
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
    mostrarListas();
  });
  
  function mostrarResultadosConsulta() {
    const filtroTienda = normalizarTexto(document.getElementById("filtroTienda").value);
    const filtroProducto = normalizarTexto(document.getElementById("filtroProducto").value);
    const criterioOrden = document.getElementById("ordenarPor") ? document.getElementById("ordenarPor").value : null;
    const resultados = document.getElementById("listaResultados");
    const contador = document.getElementById("contadorResultados");
  
    resultados.innerHTML = "";
  
    const listas = JSON.parse(localStorage.getItem("listas")) || [];
    let totalResultados = 0;
  
    listas.forEach(lista => {
      const lugarNormalizado = normalizarTexto(lista.lugar);
  
      const coincideTienda = !filtroTienda || lugarNormalizado.includes(filtroTienda);
      if (!coincideTienda) return;
  
      let productosFiltrados = lista.productos.filter(p => {
        const nombreNormalizado = normalizarTexto(p.nombre);
        return !filtroProducto || nombreNormalizado.includes(filtroProducto);
      });
  
      // Ordenar productos si hay criterio
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
  }  
  
  let listasMostradasCount = 10;  // Cuántas listas mostrar inicialmente o después de cargar más

  function mostrarListas(resetCount = false) {
    if (resetCount) listasMostradasCount = 10;  // Resetear conteo si se está filtrando o recargando
  
    const filtroLugar = normalizarTexto(document.getElementById("filtroLugarListas").value);
    const listas = JSON.parse(localStorage.getItem("listas")) || [];
  
    // Filtrar por lugar con normalización para ignorar mayúsculas y acentos
    const listasFiltradas = listas.filter(lista => 
      normalizarTexto(lista.lugar).includes(filtroLugar)
    );
  
    // Ordenar por fecha descendente (más recientes primero)
    listasFiltradas.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  
    const ul = document.getElementById("todasLasListas");
    ul.innerHTML = "";
  
    // Obtener solo las listas que se deben mostrar según el conteo
    const listasParaMostrar = listasFiltradas.slice(0, listasMostradasCount);
  
    if (listasParaMostrar.length === 0) {
      ul.innerHTML = "<li>No hay listas guardadas que coincidan con el filtro.</li>";
      document.getElementById("btnCargarMas").style.display = "none";
      return;
    }
  
    listasParaMostrar.forEach((lista, index) => {
      const total = lista.productos.reduce((sum, p) => sum + p.precio, 0).toFixed(2);
  
      const productosHTML = lista.productos.map(p => `
        <li>- ${p.nombre} ($${p.precio.toFixed(2)}) ${p.descripcion ? `- ${p.descripcion}` : ""}</li>
      `).join("");
  
      // Usa índice global para el id de detalle, porque mostramos un subconjunto
      ul.innerHTML += `
        <li>
          <div onclick="alternarDetalle(${index})" style="cursor: pointer;">
            📅 <strong>${formatearFecha(lista.fecha)}</strong><br>
            🏪 <em>${lista.lugar}</em><br>
            💰 Total: $${total}
            <div id="detalle-${index}" class="detalle-lista oculto">
                <ul>${productosHTML}</ul>
                <button onclick="eliminarListaPorFiltro(${index})">🗑️ Eliminar esta lista</button>
            </div>
          </div>
        </li>
      `;
    });
  
    // Mostrar u ocultar botón "Mostrar otros 10"
    if (listasMostradasCount < listasFiltradas.length) {
      document.getElementById("btnCargarMas").style.display = "block";
    } else {
      document.getElementById("btnCargarMas").style.display = "none";
    }
  }
  
  // Función para cargar otros 10 listas más
  function cargarMasListas() {
    listasMostradasCount += 10;
    mostrarListas();
  }
  
  // Función para eliminar lista teniendo en cuenta que mostramos solo un subconjunto filtrado
  function eliminarListaPorFiltro(indexEnMostrados) {
    const filtroLugar = normalizarTexto(document.getElementById("filtroLugarListas").value);
    let listas = JSON.parse(localStorage.getItem("listas")) || [];
  
    // Filtrar listas igual que en mostrarListas
    const listasFiltradas = listas.filter(lista =>
      normalizarTexto(lista.lugar).includes(filtroLugar)
    );
  
    // Ordenar igual que en mostrarListas
    listasFiltradas.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  
    // Obtener la lista específica a eliminar (considerando el filtro y orden)
    const listaAEliminar = listasFiltradas[indexEnMostrados];
  
    if (!listaAEliminar) return;
  
    // Buscar índice original en la lista completa para eliminarla
    const indiceOriginal = listas.findIndex(l => 
      l.lugar === listaAEliminar.lugar && l.fecha === listaAEliminar.fecha
    );
  
    if (indiceOriginal !== -1) {
      listas.splice(indiceOriginal, 1);
      localStorage.setItem("listas", JSON.stringify(listas));
      mostrarMensaje("✅ Lista eliminada con éxito");
      mostrarListas(true);  // Recargar con reset de conteo y filtro
    }
  }
  
  // Llama a mostrarListas al cargar la página y cuando cambie el filtro
  document.getElementById("filtroLugarListas").addEventListener("input", () => mostrarListas(true));
  document.addEventListener("DOMContentLoaded", () => mostrarListas(true));  
  
  function alternarDetalle(index) {
    const detalle = document.getElementById(`detalle-${index}`);
    detalle.classList.toggle("oculto");
  }
  
  function eliminarLista(index) {
    const confirmar = confirm("¿Estás seguro de que deseas eliminar esta lista? Esta acción no se puede deshacer.");
    if (!confirmar) return;
  
    let listas = JSON.parse(localStorage.getItem("listas")) || [];
    listas.splice(index, 1);
    localStorage.setItem("listas", JSON.stringify(listas));
  
    mostrarMensaje("✅ Lista eliminada con éxito");
    mostrarListas();
    consultarPorTienda();
  }
  
  function mostrarMensaje(texto) {
    const mensajeDiv = document.getElementById("mensaje");
    mensajeDiv.textContent = texto;
    mensajeDiv.classList.remove("oculto");
  
    setTimeout(() => {
      mensajeDiv.classList.add("oculto");
    }, 3000);
  }
  
  document.addEventListener("DOMContentLoaded", () => {
    mostrarSeccion('agregar');
    mostrarListas();
  });
  
  function formatearFecha(fechaStr) {
    const fecha = new Date(fechaStr);
    return fecha.toLocaleDateString("es-MX", {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  }
  
  function mostrarSugerencias(input) {
    const valor = normalizarTexto(input.value);
    const contenedorSugerencias = input.nextElementSibling; // div.sugerencias
  
    if (valor.length < 2) {
      contenedorSugerencias.style.display = "none";
      contenedorSugerencias.innerHTML = "";
      return;
    }
  
    const listas = JSON.parse(localStorage.getItem("listas")) || [];
    const productosEncontrados = [];
  
    listas.forEach(lista => {
      lista.productos.forEach(p => {
        const nombreNormalizado = normalizarTexto(p.nombre);
        if (nombreNormalizado.includes(valor)) {
          productosEncontrados.push({
            nombre: p.nombre,
            precio: p.precio,
            descripcion: p.descripcion || "",
            lugar: lista.lugar, // Cambié lista.nombre a lista.lugar para coherencia
            fecha: lista.fecha || lista.creacion || new Date()
          });
        }
      });
    });
  
    if (productosEncontrados.length === 0) {
      contenedorSugerencias.style.display = "none";
      contenedorSugerencias.innerHTML = "";
      return;
    }
  
    contenedorSugerencias.style.display = "block";
  
    // Opcional: ordenar por fecha descendente para mostrar los más recientes primero
    productosEncontrados.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  
    contenedorSugerencias.innerHTML = productosEncontrados
      .slice(0, 5)
      .map(p => `
        <div class="sugerencia-item animate" onclick='seleccionarSugerencia(this, ${JSON.stringify(p)})'>
          <div><strong>🛒 ${p.nombre}</strong></div>
          <div>💲<strong>${p.precio.toFixed(2)}</strong></div>
          <div>📍${p.lugar} — 🗓️ ${formatearFecha(p.fecha)}</div>
          <div class="descripcion-sugerida">📝 ${p.descripcion}</div>
        </div>
      `).join("") + `<div style="height: 20px;"></div>`;
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

  function normalizarTexto(texto) {
    return texto
      .toLowerCase()
      .normalize("NFD")  // Descompone caracteres con acento en base + acento
      .replace(/[\u0300-\u036f]/g, ""); // Elimina los caracteres de acento
  }  
  
    document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("filtroTienda").addEventListener("input", mostrarResultadosConsulta);
    document.getElementById("filtroProducto").addEventListener("input", mostrarResultadosConsulta);
    document.getElementById("ordenarPor").addEventListener("change", mostrarResultadosConsulta);
});
