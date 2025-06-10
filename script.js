// const API_BASE = "https://api.rss2json.com/v1/api.json?rss_url="
// const API_BASE = "http://localhost:5000/rss?url=";
const API_BASE = "https://rss-backend-zne9.onrender.com/rss?url=";

// script.js completo con configuración persistente usando IndexedDB (Dexie)

// 1. Inicializar base de datos con Dexie
const db = new Dexie("InicioPersonalizado");
db.version(3).stores({
    enlaces: "++id,title,url",            // Enlaces guardados en Favoritos
    pestañas: "nombre, orden",            // Lista de pestañas con orden de creación
    feeds: "++id,pestaña,url",            // RSS asociados a cada pestaña
    config: "clave"                       // Modo visual ("día" o "noche")
});

// 2. Crear pestaña por defecto si no hay ninguna
async function initTabs() {
    const pestañas = await db.pestañas.orderBy("orden").toArray();

    if (!pestañas.length) {
        await db.pestañas.add({ nombre: "Favoritos", orden: 0 });
        return initTabs(); // vuelve a llamar después de crearla
    }

    for (const { nombre } of pestañas) {
        crearPestaña(nombre);
    }

    // Inicializar el botón de modo día/noche
    await inicializarToggleModo();

    // Activar pestaña por defecto

    openTab("Favoritos");
}

// Guarda el modo visual seleccionado ("día" o "noche")
async function aplicarModoVisual(modo) {
    document.body.classList.toggle("modo-noche", modo === "noche");
    const toggleBtn = document.getElementById("modoToggle");
    if (toggleBtn) toggleBtn.innerText = modo === "noche" ? "☀️" : "🌙";
    await db.config.put({ clave: "modo", valor: modo });
}

// Obtiene el último modo visual usado ("día" o "noche")
async function obtenerModoVisual() {
    const config = await db.config.get("modo");
    return config?.valor || "día";
}

// "Toggle button" para cambiar el modo visual
async function inicializarToggleModo() {
    if (document.getElementById("modoToggle")) return;

    const toggleBtn = document.createElement("button");
    toggleBtn.id = "modoToggle";
    toggleBtn.title = "Cambiar modo visual";

    toggleBtn.onclick = async () => {
        const modoActual = document.body.classList.contains("modo-noche") ? "noche" : "día";
        const nuevoModo = modoActual === "noche" ? "día" : "noche";
        await aplicarModoVisual(nuevoModo);
    };

    const toggleCard = document.createElement("div");
    toggleCard.className = "tab-card";
    toggleCard.appendChild(toggleBtn);
    document.getElementById("tabs").appendChild(toggleCard);

    const modo = await obtenerModoVisual();
    await aplicarModoVisual(modo);
}  

// 3. Crear visualmente una pestaña
function crearPestaña(nombre) {
    const tabs = document.getElementById("tabs");

    const tabWrapper = document.createElement("div");
    tabWrapper.className = "tab-card";

    const tabBtn = document.createElement("button");
    tabBtn.className = "tab-button";
    tabBtn.textContent = nombre;
    tabBtn.setAttribute("data-tab", nombre);
    tabBtn.onclick = () => openTab(nombre);

    tabWrapper.appendChild(tabBtn);

    if (nombre === "Favoritos") {
        const addTabBtn = document.createElement("button");
        addTabBtn.textContent = "📁";
        addTabBtn.title = "Nueva pestaña";
        addTabBtn.onclick = () => addTab();
        tabWrapper.appendChild(addTabBtn);

        const addRSSBtn = document.createElement("button");
        addRSSBtn.textContent = "➕";
        addRSSBtn.title = "Añadir RSS";
        addRSSBtn.onclick = () => addRSS(nombre);
        tabWrapper.appendChild(addRSSBtn);
    } else {
        const addRSSBtn = document.createElement("button");
        addRSSBtn.textContent = "➕";
        addRSSBtn.title = "Añadir RSS";
        addRSSBtn.onclick = () => addRSS(nombre);
        tabWrapper.appendChild(addRSSBtn);

        const delTabBtn = document.createElement("button");
        delTabBtn.textContent = "🗑️";
        delTabBtn.title = "Eliminar pestaña";
        delTabBtn.onclick = () => removeTab(nombre);
        tabWrapper.appendChild(delTabBtn);
    }

    tabs.appendChild(tabWrapper);

    const contents = document.getElementById("tab-contents");
    const tabContent = document.createElement("div");
    tabContent.className = "tab-content";
    tabContent.id = nombre;

    if (nombre === "Favoritos") {
        tabContent.innerHTML += `
            <div class='favorites-layout'>
                <div class='link-section'>
                <h3>Enlaces favoritos</h3>
                <ul id='link-list'></ul>
                <div class='add-link-form'>
                    <input type='text' id='link-title' placeholder='Título' />
                    <input type='url' id='link-url' placeholder='https://...' />
                    <button onclick='addLink()'>Añadir enlace</button>
                    <div class='import-export-buttons'>
                    <button onclick='exportConfig()'>Exportar configuración</button>
                    <input type='file' id='import-config' accept='.json' style='display:none;'>
                    <button onclick="document.getElementById('import-config').click()">Importar configuración</button>
                    </div>
                </div>
                </div>
                <div class='feeds-grid favoritos' id='${nombre}-feeds'></div>
            </div>`;
        // ⚠️ AÑADE ESTE BLOQUE justo después del HTML anterior
        setTimeout(() => {
            const input = document.getElementById("import-config");
            if (input) {
                input.addEventListener("change", async e => {
                    const file = e.target.files[0];
                    if (!file) return;
                    const text = await file.text();
                    const config = JSON.parse(text);
                    await db.enlaces.clear();
                    await db.pestañas.clear();
                    await db.feeds.clear();
                    await db.config.clear();
                    await db.enlaces.bulkAdd(config.enlaces || []);
                    await db.pestañas.bulkAdd(config.pestañas || []);
                    await db.feeds.bulkAdd(config.feeds || []);
                    await db.config.bulkAdd(config.config || []);
                    location.reload();
                });
            }
            // Llamar a renderLinks cuando #link-list ya está en el DOM
            renderLinks();
        }, 0);
    } else {
        tabContent.innerHTML += `<div class='feeds-grid normal' id='${nombre}-feeds'></div>`;
    }

    contents.appendChild(tabContent);
    cargarFeeds(nombre);
}

// 4. Agregar nueva pestaña
async function addTab() {
    const nombre = prompt("Nombre de la nueva pestaña:");
    if (!nombre) return;

    // await db.pestañas.add({ nombre });
    await db.pestañas.add({ nombre, orden: Date.now() });
    crearPestaña(nombre);
    openTab(nombre);
}

// 5. Eliminar pestaña
async function removeTab(nombre) {
    if (nombre === "Favoritos") return alert("No puedes eliminar Favoritos");
    if (!confirm(`¿Eliminar la pestaña ${nombre}?`)) return;
    await db.pestañas.where("nombre").equals(nombre).delete();
    await db.feeds.where("pestaña").equals(nombre).delete();
    document.getElementById(nombre).remove();

    const tabButtons = document.querySelectorAll(".tab-button");
    tabButtons.forEach(btn => {
        if (btn.getAttribute("data-tab") === nombre) {
            btn.remove();
        }
    });

    openTab("Favoritos");
}

// 6. Agregar RSS a pestaña
async function addRSS(pestaña) {
    const url = prompt("Introduce URL RSS:");
    if (!url) return;
    await db.feeds.add({ pestaña, url });
    cargarFeeds(pestaña);
}

// 6.1. Eliminar RSS en pestaña
async function removeRSS(pestaña, url) {
    await db.feeds.where({ pestaña, url }).delete();
    cargarFeeds(pestaña);
}


// 7. Cargar feeds por pestaña
async function cargarFeeds(pestaña) {
    const contenedor = document.getElementById(`${pestaña}-feeds`);
    contenedor.innerHTML = "";
    const urls = await db.feeds.where("pestaña").equals(pestaña).toArray();
    const feedUrls = urls.map(f => f.url);
    loadRSSFeeds(`${pestaña}-feeds`, feedUrls);
}

// 8. Exportar configuración
async function exportConfig() {
    const enlaces = await db.enlaces.toArray();
    const pestañas = await db.pestañas.orderBy("orden").toArray();
    const feeds = await db.feeds.toArray();
    const config = await db.config.toArray();

    const json = JSON.stringify({ enlaces, pestañas, feeds, config }, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "configuracion.json";
    a.click();
    URL.revokeObjectURL(url);
}

// 9. Navegación de pestañas
function openTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    document.getElementById(tabId)?.classList.add('active');
    const tabButton = document.querySelector(`.tab-button[data-tab="${tabId}"]`);
    if (tabButton) tabButton.classList.add("active");
}

// Añade nuevo enlace definido por el usuario
async function addLink() {
    const title = document.getElementById("link-title").value.trim();
    const url = document.getElementById("link-url").value.trim();

    if (!title || !url) return alert("Rellena ambos campos");

    await db.enlaces.add({ title, url });
    document.getElementById("link-title").value = "";
    document.getElementById("link-url").value = "";
    renderLinks();
}

// Muestra los enlaces definidos por el usuario
async function renderLinks() {
    const container = document.getElementById("link-list");
    container.innerHTML = "";

    let links = await db.enlaces.toArray();

    // Ordenar por título alfabéticamente
    links.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));

    for (const { id, title, url } of links) {
        const li = document.createElement("li");

        const favicon = document.createElement("img");
        try {
            const domain = new URL(url).origin;
            favicon.src = `https://www.google.com/s2/favicons?domain=${domain}`;
        } catch {
            favicon.src = "";
        }

        const a = document.createElement("a");
        a.href = url;
        a.textContent = title;
        a.target = "_blank";

        const delBtn = document.createElement("button");
        delBtn.textContent = "🗑️";
        delBtn.title = "Eliminar enlace";
        delBtn.onclick = async () => {
            const confirmar = confirm(`¿Deseas eliminar el enlace "${title}"?`);
            if (!confirmar) return;
            await db.enlaces.delete(id);
            renderLinks();
        };

        li.appendChild(favicon);
        li.appendChild(a);
        li.appendChild(delBtn);
        container.appendChild(li);
    }
}

// Decodifica caracteres especiales como &quot; o &#039;
function decodeHTML(html) {
    const txt = document.createElement("textarea");
    txt.innerHTML = html;
    return txt.value;
}

// Carga los "feeds", convertidos a JSON, y genera el HTML
async function loadRSSFeeds(containerId, feedUrls) {
    const container = document.getElementById(containerId);
    container.innerHTML = ""; // limpiar contenido anterior

    for (const url of feedUrls) {
        try {
            const response = await fetch(`${API_BASE}${encodeURIComponent(url)}`)

            const data = await response.json();

            const feedDiv = document.createElement("div");
            feedDiv.className = "feed";

            const feedTitle = document.createElement("div");
            feedTitle.className = "feed-title";

            const feedLink = document.createElement("a");
            feedLink.href = data.feed.link || "#";
            feedLink.textContent = data.feed.title || "Fuente RSS";
            feedLink.target = "_blank";
            feedLink.rel = "noopener noreferrer";

            // Botón para eliminar este RSS
            const deleteBtn = document.createElement("button");
            deleteBtn.textContent = "🗑️";
            deleteBtn.title = "Eliminar este RSS";
            deleteBtn.onclick = async () => {
                const confirmar = confirm("¿Deseas eliminar este feed RSS?");
                if (!confirmar) return;
                const pestaña = containerId.replace(/-feeds$/, "");
                await removeRSS(pestaña, url);
            };

            feedTitle.appendChild(feedLink);
            feedTitle.appendChild(deleteBtn);
            feedDiv.appendChild(feedTitle);


            // ORDENAR POR FECHA DESCENDENTE
            const sortedItems = data.items.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

            // for (const item of sortedItems.slice(0, 5)) { // Mostrar 5
            for (const item of sortedItems) {

                const entry = document.createElement("div");
                entry.className = "rss-entry";

                const thumbnail = item.thumbnail || item.enclosure?.link || "";
                // Imagen
                const imgContainer = document.createElement("div");
                imgContainer.className = "rss-img";
                if (thumbnail) {
                    const img = document.createElement("img");
                    img.src = thumbnail;
                    img.alt = "thumbnail";
                    // img.className = "rss-thumbnail";
                    imgContainer.appendChild(img);
                } else {
                    imgContainer.style.display = "none"; // Ocultar si no hay imagen
                }

                // Cuerpo del "feed"
                const contentDiv = document.createElement("div");
                contentDiv.className = "rss-content";

                // Título
                const title = document.createElement("a");
                title.className = "rss-title";
                title.href = item.link;
                title.target = "_blank";
                if (item.title.length > 140) {
                    title.innerHTML = decodeHTML(item.title.substring(0, 140) + "...");
                } else {
                    title.innerHTML = decodeHTML(item.title);
                }

                // Descripción
                const desc = document.createElement("p");
                desc.className = "rss-description";
                if (item.description.length > 110) {
                    desc.innerHTML = decodeHTML(item.description.substring(0, 110) + "..." || "");
                } else {
                    desc.innerHTML = decodeHTML(item.description || "");
                }

                contentDiv.appendChild(title);
                contentDiv.appendChild(desc);

                entry.appendChild(imgContainer);
                entry.appendChild(contentDiv);
                feedDiv.appendChild(entry);
            }

            container.appendChild(feedDiv);
        } catch (error) {
            console.error("Error al cargar feed:", url, error);
        }
    }
}

// Inicializar
document.addEventListener("DOMContentLoaded", () => {
    initTabs();
});