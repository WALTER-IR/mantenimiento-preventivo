// ============================================================
//  Mantenimiento Preventivo - lógica de la aplicación
// ============================================================
(function () {
  "use strict";

  const CFG = window.APP_CONFIG;
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  let equipos = [];
  let mantenimientos = [];
  let appConfig = { empresa: "Empresa", intervalo: 90 };
  let currentView = "dashboard";
  let alertTab = "vencidos";
  let currentDetailId = null;

  // ---------------- Utilidades de fecha ----------------
  const todayISO = () => toISODate(new Date());
  function toISODate(d) {
    const off = d.getTimezoneOffset();
    return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
  }
  function addDays(iso, days) {
    const d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + days);
    return toISODate(d);
  }
  function parseISO(iso) {
    return new Date(iso + "T00:00:00");
  }
  function diffDays(fromISO, toISO) {
    return Math.round((parseISO(toISO) - parseISO(fromISO)) / 86400000);
  }
  function fmtDate(iso) {
    if (!iso) return "—";
    const d = parseISO(iso);
    return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
  }
  const now = () => new Date().toISOString();

  // ---------------- Fecha de próximo mantenimiento ----------------
  function nextDueDate(eq) {
    const interval = eq.intervalo || appConfig.intervalo;
    const last = eq.fechaUltimoMant || eq.fechaCompra || eq.fechaAlta;
    if (!last) return addDays(todayISO(), interval);
    return addDays(last, interval);
  }
  function statusOf(eq) {
    const due = nextDueDate(eq);
    const days = diffDays(todayISO(), due);
    if (days < 0) return { key: "vencido", days, due };
    if (days <= 30) return { key: "proximo", days, due };
    return { key: "ok", days, due };
  }

  // ---------------- Toast ----------------
  let toastTimer = null;
  function toast(msg, type) {
    const el = $("#toast");
    el.textContent = msg;
    el.className = "toast " + (type || "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add("hidden"), 2600);
  }

  // ---------------- Navegación ----------------
  function setView(view) {
    currentView = view;
    $$(".view").forEach((v) => v.classList.add("hidden"));
    $("#view-" + view).classList.remove("hidden");
    $$(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
    window.scrollTo({ top: 0 });
    if (view === "dashboard") renderDashboard();
    if (view === "equipos") renderEquipos();
    if (view === "mantenimientos") renderMantenimientos();
    if (view === "alertas") renderAlertas();
    if (view === "config") renderConfig();
  }

  // ---------------- Modal helpers ----------------
  function openModal(id) { $("#" + id).classList.remove("hidden"); }
  function closeModal(id) { $("#" + id).classList.add("hidden"); if (id === "modalDetalle") currentDetailId = null; }

  // ============================================================
  //  DASHBOARD
  // ============================================================
  function renderDashboard() {
    const total = equipos.length;
    const stats = { vencidos: 0, proximos: 0, ok: 0 };
    equipos.forEach((e) => { stats[statusOf(e).key]++; });
    const firstOfMonth = todayISO().slice(0, 7) + "-01";
    const mes = mantenimientos.filter((m) => m.fecha >= firstOfMonth).length;

    $("#statTotal").textContent = total;
    $("#statVencidos").textContent = stats.vencidos;
    $("#statProximos").textContent = stats.proximos;
    $("#statMes").textContent = mes;

    const alerts = equipos
      .map((e) => ({ eq: e, st: statusOf(e) }))
      .filter((x) => x.st.key !== "ok")
      .sort((a, b) => (a.st.days > b.st.days ? 1 : -1));

    $("#alertList").innerHTML = alerts.slice(0, 6).map(alertHTML).join("");
    $("#alertEmpty").classList.toggle("hidden", alerts.length > 0);

    const recent = [...mantenimientos].sort((a, b) => (a.fecha < b.fecha ? 1 : -1)).slice(0, 5);
    $("#recentList").innerHTML = recent.map(recentHTML).join("");
    $("#recentEmpty").classList.toggle("hidden", recent.length > 0);
  }

  function eqName(id) {
    const e = equipos.find((x) => x.id === id);
    return e ? e.nombre : "Equipo eliminado";
  }

  function alertHTML({ eq, st }) {
    const cls = st.key === "vencido" ? "danger" : "";
    const label = st.key === "vencido" ? "VENCIDO" : "PRÓXIMO";
    const days = st.key === "vencido" ? Math.abs(st.days) : st.days;
    return `
      <div class="alert-item ${cls}" data-open-detail="${eq.id}">
        <div class="alert-head">
          <span class="alert-title">${esc(eq.nombre)}</span>
          <span class="badge ${st.key === "vencido" ? "danger" : "warn"}">${label}</span>
        </div>
        <div class="alert-sub">${esc(eq.marca || "Sin marca")} · ${esc(eq.tipo === "desktop" ? "Escritorio" : eq.tipo)}</div>
        <div class="alert-sub">Vence: <b>${fmtDate(st.due)}</b> (${days} día${days === 1 ? "" : "s"})</div>
      </div>`;
  }

  function recentHTML(m) {
    return `
      <div class="item-card" data-open-detail="${m.equipoId}">
        <div class="item-avatar">🔧</div>
        <div class="item-body">
          <div class="item-title">${esc(eqName(m.equipoId))}</div>
          <div class="item-sub">${fmtDate(m.fecha)} · ${m.tipo === "preventivo" ? "Preventivo" : "Correctivo"} · ${esc(m.tecnico || "—")}</div>
        </div>
        <div class="item-meta">
          <span class="badge ${m.tipo === "preventivo" ? "ok" : "warn"}">${m.tipo === "preventivo" ? "Preventivo" : "Correctivo"}</span>
        </div>
      </div>`;
  }

  // ============================================================
  //  EQUIPOS
  // ============================================================
  function tipoLabel(t) {
    return { laptop: "Laptop", desktop: "Escritorio", allinone: "Todo en uno", servidor: "Servidor" }[t] || t;
  }

  function renderEquipos() {
    const q = ($("#searchEquipo").value || "").trim().toLowerCase();
    const tipo = $("#filterTipo").value;
    let list = equipos.filter((e) => {
      if (tipo && e.tipo !== tipo) return false;
      if (!q) return true;
      return [e.nombre, e.serie, e.marca, e.departamento, e.responsable, e.modelo]
        .join(" ").toLowerCase().includes(q);
    });
    list.sort((a, b) => (a.nombre < b.nombre ? -1 : 1));

    $("#equipoList").innerHTML = list.map((e) => {
      const st = statusOf(e);
      const badge = st.key === "vencido"
        ? `<span class="badge danger">Vencido</span>`
        : st.key === "proximo"
          ? `<span class="badge warn">Pronto</span>`
          : `<span class="badge ok">Al día</span>`;
      const ico = e.tipo === "laptop" ? "💻" : e.tipo === "servidor" ? "🖥️" : "🖥️";
      return `
        <div class="item-card" data-open-detail="${e.id}">
          <div class="item-avatar">${ico}</div>
          <div class="item-body">
            <div class="item-title">${esc(e.nombre)}</div>
            <div class="item-sub">${esc(e.marca || "—")} ${esc(e.modelo || "")} · ${esc(e.departamento || "Sin departamento")}</div>
            <div class="due-line ${st.key === "vencido" ? "badge danger" : st.key === "proximo" ? "badge warn" : "badge ok"}">Próx. mant.: ${fmtDate(st.due)}</div>
          </div>
          <div class="item-meta">${badge}</div>
        </div>`;
    }).join("");
    $("#equipoEmpty").classList.toggle("hidden", list.length > 0);
  }

  function openEquipoModal(eq) {
    $("#modalEquipoTitle").textContent = eq ? "Editar equipo" : "Nuevo equipo";
    $("#eqId").value = eq ? eq.id : "";
    $("#eqNombre").value = eq ? eq.nombre : "";
    $("#eqTipo").value = eq ? eq.tipo : "laptop";
    $("#eqMarca").value = eq ? (eq.marca || "") : "";
    $("#eqModelo").value = eq ? (eq.modelo || "") : "";
    $("#eqSerie").value = eq ? (eq.serie || "") : "";
    $("#eqDepartamento").value = eq ? (eq.departamento || "") : "";
    $("#eqResponsable").value = eq ? (eq.responsable || "") : "";
    $("#eqUbicacion").value = eq ? (eq.ubicacion || "") : "";
    $("#eqSO").value = eq ? (eq.so || "") : "";
    $("#eqIP").value = eq ? (eq.ip || "") : "";
    $("#eqFechaCompra").value = eq ? (eq.fechaCompra || "") : "";
    $("#eqIntervalo").value = eq ? (eq.intervalo || "") : "";
    $("#eqNotas").value = eq ? (eq.notas || "") : "";

    const info = $("#eqDatosMant");
    if (eq) {
      const st = statusOf(eq);
      info.innerHTML = `Último mantenimiento: <b>${fmtDate(eq.fechaUltimoMant)}</b><br />Próximo mantenimiento: <b>${fmtDate(st.due)}</b>`;
      info.classList.remove("hidden");
    } else {
      info.classList.add("hidden");
    }
    openModal("modalEquipo");
  }

  async function saveEquipo() {
    const nombre = $("#eqNombre").value.trim();
    if (!nombre) return toast("El nombre es obligatorio", "err");
    const id = $("#eqId").value;
    const data = {
      id: id || "eq-" + Date.now(),
      nombre,
      tipo: $("#eqTipo").value,
      marca: $("#eqMarca").value.trim(),
      modelo: $("#eqModelo").value.trim(),
      serie: $("#eqSerie").value.trim(),
      departamento: $("#eqDepartamento").value.trim(),
      responsable: $("#eqResponsable").value.trim(),
      ubicacion: $("#eqUbicacion").value.trim(),
      so: $("#eqSO").value.trim(),
      ip: $("#eqIP").value.trim(),
      fechaCompra: $("#eqFechaCompra").value,
      intervalo: parseInt($("#eqIntervalo").value, 10) || appConfig.intervalo,
      notas: $("#eqNotas").value.trim(),
      fechaUltimoMant: (equipos.find((x) => x.id === id) || {}).fechaUltimoMant || null,
      fechaAlta: (equipos.find((x) => x.id === id) || {}).fechaAlta || todayISO()
    };
    if (data.fechaCompra && !(equipos.find((x) => x.id === id) || {}).fechaAlta) data.fechaAlta = data.fechaCompra;
    await DB.put("equipos", data);
    equipos = await DB.getAll("equipos");
    closeModal("modalEquipo");
    toast("Equipo guardado", "ok");
    renderEquipos();
  }

  async function eliminarEquipo(id) {
    if (!confirm("¿Eliminar este equipo y su historial de mantenimiento?")) return;
    await DB.delete("equipos", id);
    const mants = mantenimientos.filter((m) => m.equipoId === id);
    for (const m of mants) await DB.delete("mantenimientos", m.id);
    equipos = await DB.getAll("equipos");
    mantenimientos = await DB.getAll("mantenimientos");
    closeModal("modalDetalle");
    toast("Equipo eliminado");
    renderEquipos();
  }

  // ============================================================
  //  MANTENIMIENTOS
  // ============================================================
  function buildChecklist() {
    $("#checklist").innerHTML = CFG.CHECKLIST_DEFAULT.map((c, i) => `
      <label class="check-item">
        <input type="checkbox" value="${esc(c)}" data-check="${i}" /> ${esc(c)}
      </label>`).join("");
  }

  function openMantModal(mant) {
    $("#modalMantTitle").textContent = mant ? "Editar mantenimiento" : "Registrar mantenimiento";
    $("#mtId").value = mant ? mant.id : "";
    buildChecklist();
    const sel = $("#mtEquipo");
    sel.innerHTML = equipos.map((e) => `<option value="${e.id}">${esc(e.nombre)}</option>`).join("");
    if (mant) {
      sel.value = mant.equipoId;
      $("#mtFecha").value = mant.fecha || todayISO();
      $("#mtTipo").value = mant.tipo || "preventivo";
      $("#mtTecnico").value = mant.tecnico || "";
      $("#mtCosto").value = mant.costo || "";
      $("#mtProxima").value = mant.proxima || "";
      $("#mtObs").value = mant.obs || "";
      const tasks = mant.tareas || [];
      $$("#checklist input").forEach((inp) => { if (tasks.includes(inp.value)) inp.checked = true; });
    } else {
      sel.value = equipos[0] ? equipos[0].id : "";
      $("#mtFecha").value = todayISO();
      $("#mtTipo").value = "preventivo";
      $("#mtTecnico").value = "";
      $("#mtCosto").value = "";
      $("#mtProxima").value = "";
      $("#mtObs").value = "";
      setNextFromEquipo();
    }
    openModal("modalMant");
  }

  function setNextFromEquipo() {
    const e = equipos.find((x) => x.id === $("#mtEquipo").value);
    if (!e) { $("#mtProxima").value = ""; return; }
    const interval = e.intervalo || appConfig.intervalo;
    const base = e.fechaUltimoMant || $("#mtFecha").value || todayISO();
    $("#mtProxima").value = addDays(base, interval);
  }

  async function saveMant() {
    const equipoId = $("#mtEquipo").value;
    const fecha = $("#mtFecha").value;
    if (!equipoId || !fecha) return toast("Equipo y fecha son obligatorios", "err");
    const id = $("#mtId").value;
    const tareas = $$("#checklist input:checked").map((i) => i.value);
    const data = {
      id: id || "mt-" + Date.now(),
      equipoId,
      fecha,
      tipo: $("#mtTipo").value,
      tecnico: $("#mtTecnico").value.trim(),
      costo: parseFloat($("#mtCosto").value) || 0,
      proxima: $("#mtProxima").value,
      obs: $("#mtObs").value.trim(),
      tareas
    };
    await DB.put("mantenimientos", data);

    // actualizar último mantenimiento del equipo
    const eq = equipos.find((x) => x.id === equipoId);
    if (eq) {
      eq.fechaUltimoMant = fecha;
      eq.intervalo = eq.intervalo || appConfig.intervalo;
      await DB.put("equipos", eq);
    }

    mantenimientos = await DB.getAll("mantenimientos");
    equipos = await DB.getAll("equipos");
    closeModal("modalMant");
    toast("Mantenimiento guardado", "ok");
    renderMantenimientos();
  }

  function renderMantenimientos() {
    const fEq = $("#filterEquipo").value;
    const fTipo = $("#filterTipoMant").value;
    let list = mantenimientos.filter((m) => {
      if (fEq && m.equipoId !== fEq) return false;
      if (fTipo && m.tipo !== fTipo) return false;
      return true;
    });
    list.sort((a, b) => (a.fecha < b.fecha ? 1 : -1));

    $("#mantList").innerHTML = list.map((m) => `
      <div class="mant-row" data-open-detail="${m.equipoId}">
        <div class="mant-row-head">
          <span class="mant-row-title">${esc(eqName(m.equipoId))}</span>
          <span class="badge ${m.tipo === "preventivo" ? "ok" : "warn"}">${m.tipo === "preventivo" ? "Preventivo" : "Correctivo"}</span>
        </div>
        <div class="mant-row-sub">${fmtDate(m.fecha)} · Técnico: ${esc(m.tecnico || "—")}${m.costo ? ` · Costo: $${m.costo}` : ""}</div>
        ${m.obs ? `<div class="mant-row-sub">${esc(m.obs)}</div>` : ""}
        ${m.tareas && m.tareas.length ? `<div class="mant-chips">${m.tareas.map((t) => `<span class="mant-chip">✓ ${esc(t)}</span>`).join("")}</div>` : ""}
      </div>`).join("");
    $("#mantEmpty").classList.toggle("hidden", list.length > 0);
  }

  async function eliminarMant(m) {
    if (!confirm("¿Eliminar este mantenimiento?")) return;
    await DB.delete("mantenimientos", m.id);
    mantenimientos = await DB.getAll("mantenimientos");
    // recalcular último mantenimiento del equipo
    const eq = equipos.find((x) => x.id === m.equipoId);
    if (eq) {
      const last = mantenimientos
        .filter((x) => x.equipoId === eq.id)
        .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))[0];
      eq.fechaUltimoMant = last ? last.fecha : null;
      await DB.put("equipos", eq);
    }
    equipos = await DB.getAll("equipos");
    toast("Mantenimiento eliminado");
    renderMantenimientos();
    if (currentDetailId) renderDetalle(currentDetailId);
  }

  // ============================================================
  //  ALERTAS
  // ============================================================
  function renderAlertas() {
    $$(".chip[data-alerttab]").forEach((c) => c.classList.toggle("active", c.dataset.alerttab === alertTab));
    const list = equipos
      .map((e) => ({ eq: e, st: statusOf(e) }))
      .filter((x) => (alertTab === "vencidos" ? x.st.key === "vencido" : x.st.key === "proximo"))
      .sort((a, b) => (a.st.days > b.st.days ? 1 : -1));
    $("#alertFullList").innerHTML = list.map(alertHTML).join("");
    $("#alertFullEmpty").classList.toggle("hidden", list.length > 0);
  }

  // ============================================================
  //  DETALLE DE EQUIPO
  // ============================================================
  function renderDetalle(id) {
    const eq = equipos.find((x) => x.id === id);
    if (!eq) return;
    currentDetailId = id;
    const st = statusOf(eq);
    const badge = st.key === "vencido"
      ? `<span class="badge danger">Mantenimiento vencido</span>`
      : st.key === "proximo"
        ? `<span class="badge warn">Próximo: ${fmtDate(st.due)}</span>`
        : `<span class="badge ok">Al día · ${fmtDate(st.due)}</span>`;

    $("#detalleTitle").innerHTML = `${esc(eq.nombre)} ${badge}`;
    const cells = [
      ["Tipo", tipoLabel(eq.tipo)],
      ["Marca", eq.marca || "—"],
      ["Modelo", eq.modelo || "—"],
      ["No. serie", eq.serie || "—"],
      ["Departamento", eq.departamento || "—"],
      ["Responsable", eq.responsable || "—"],
      ["Ubicación", eq.ubicacion || "—"],
      ["Sistema operativo", eq.so || "—"],
      ["Dirección IP", eq.ip || "—"],
      ["Fecha compra", fmtDate(eq.fechaCompra)],
      ["Intervalo", (eq.intervalo || appConfig.intervalo) + " días"],
      ["Último mant.", fmtDate(eq.fechaUltimoMant)]
    ];
    $("#detalleInfo").innerHTML = cells.map(([l, v]) => `<div class="detail-cell"><label>${l}</label><div>${esc(v)}</div></div>`).join("");

    const hist = mantenimientos
      .filter((m) => m.equipoId === id)
      .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
    $("#detalleHistorial").innerHTML = hist.map((m) => `
      <div class="mant-row">
        <div class="mant-row-head">
          <span class="mant-row-title">${fmtDate(m.fecha)} · ${m.tipo === "preventivo" ? "Preventivo" : "Correctivo"}</span>
          <div>
            <button class="btn btn-ghost" data-edit-mant="${m.id}">Editar</button>
            <button class="btn btn-ghost" data-del-mant="${m.id}" style="color:var(--danger)">Eliminar</button>
          </div>
        </div>
        ${m.obs ? `<div class="mant-row-sub">${esc(m.obs)}</div>` : ""}
        ${m.tareas && m.tareas.length ? `<div class="mant-chips">${m.tareas.map((t) => `<span class="mant-chip">✓ ${esc(t)}</span>`).join("")}</div>` : ""}
      </div>`).join("");
    $("#detalleHistEmpty").classList.toggle("hidden", hist.length > 0);
    $("#btnEliminarEquipo").onclick = () => eliminarEquipo(id);
    $("#btnEditarEquipo").onclick = () => { closeModal("modalDetalle"); openEquipoModal(eq); };
    openModal("modalDetalle");
  }

  // ============================================================
  //  CONFIGURACIÓN
  // ============================================================
  function renderConfig() {
    $("#cfgEmpresa").value = appConfig.empresa;
    $("#cfgIntervalo").value = appConfig.intervalo;
    $("#appVersion").textContent = CFG.APP_VERSION;
    $("#brandName").textContent = appConfig.empresa === "Empresa" ? CFG.APP_NAME : appConfig.empresa;
    $("#brandSub").textContent = "Laptops y Computadoras";
    const info = $("#acercaInfo");
    if (info) {
      const ua = (navigator.userAgent || "").replace(/Chrom\w*\/(\d+)\.[\d.]+.*/i, "…Chromium/$1");
      info.textContent = "Almacenamiento: " + (window.__STORAGE_OK__ ? "funcionando ✓" : "NO disponible ⚠") + " · " + ua.slice(0, 90);
    }
  }

  async function saveConfig() {
    appConfig.empresa = $("#cfgEmpresa").value.trim() || "Empresa";
    appConfig.intervalo = parseInt($("#cfgIntervalo").value, 10) || 90;
    await DB.setConfig("empresa", appConfig.empresa);
    await DB.setConfig("intervalo", appConfig.intervalo);
    toast("Configuración guardada", "ok");
    renderConfig();
  }

  // ---------------- Export / Import ----------------
  function exportData() {
    const payload = {
      app: CFG.APP_NAME,
      version: CFG.APP_VERSION,
      exportado: now(),
      config: appConfig,
      equipos,
      mantenimientos
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "respaldo-mantenimiento-" + todayISO() + ".json";
    a.click();
    URL.revokeObjectURL(a.href);
    toast("Copia de seguridad descargada", "ok");
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data.equipos || !data.mantenimientos) throw new Error("bad");
        await DB.bulkPut("equipos", data.equipos);
        await DB.bulkPut("mantenimientos", data.mantenimientos);
        if (data.config) {
          await DB.setConfig("empresa", data.config.empresa || "Empresa");
          await DB.setConfig("intervalo", data.config.intervalo || 90);
        }
        await reload();
        toast("Datos importados correctamente", "ok");
      } catch (e) {
        toast("Archivo de respaldo no válido", "err");
      }
    };
    reader.readAsText(file);
  }

  // ============================================================
  //  ACTUALIZACIÓN POR INTERNET
  // ============================================================
  async function checkForUpdates(silent) {
    const statusEl = $("#updateStatus");
    if (navigator.onLine === false) {
      if (!silent) toast("Sin conexión a internet", "err");
      return;
    }
    if (statusEl) statusEl.textContent = "Buscando actualizaciones...";
    try {
      const base = (CFG.UPDATE_URL || "").replace(/\/+$/, "");
      if (!base || !/^https?:\/\//i.test(base)) {
        if (statusEl) statusEl.textContent = `Versión ${CFG.APP_VERSION} · Sin servidor remoto (modo local)`;
        if (!silent) toast("No se configuró un servidor de actualizaciones", "err");
        return;
      }
      const resp = await fetch(base + "/app-version.json", { cache: "no-store" });
      if (!resp.ok) throw new Error("no remote");
      const remote = await resp.json();
      const local = CFG.APP_VERSION;
      if (remote.version !== local) {
        if (statusEl) statusEl.textContent = `Actualización disponible (${local} → ${remote.version}). Recarga la aplicación.`;
        toast("Hay una actualización disponible. Recarga la app.", "ok");
        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({ type: "SKIP_WAITING" });
        }
      } else {
        if (statusEl) statusEl.textContent = `Versión ${local} · Actualizada ✓`;
        if (!silent) toast("La aplicación está actualizada", "ok");
      }
    } catch (e) {
      if (statusEl) statusEl.textContent = `Versión ${CFG.APP_VERSION} · Sin servidor remoto (modo local)`;
      if (!silent) toast("No se encontró un servidor de actualizaciones", "err");
    }
  }

  async function reload() {
    equipos = await DB.getAll("equipos");
    mantenimientos = await DB.getAll("mantenimientos");
    appConfig = await DB.getConfig();
    renderConfig();
    setView(currentView);
  }

  // ============================================================
  //  INICIALIZACIÓN
  // ============================================================
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
  }

  function bindEvents() {
    // navegación inferior
    $$(".nav-item").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));

    // botones
    $("#btnNuevoEquipo").addEventListener("click", () => openEquipoModal(null));
    $("#btnGuardarEquipo").addEventListener("click", saveEquipo);
    $("#btnNuevoMantenimiento").addEventListener("click", () => openMantModal(null));
    $("#btnGuardarMant").addEventListener("click", saveMant);
    $("#btnVerTodasAlertas").addEventListener("click", () => setView("alertas"));
    $("#btnGuardarConfig").addEventListener("click", saveConfig);
    $("#btnExportar").addEventListener("click", exportData);
    $("#btnImportar").addEventListener("click", () => $("#fileImport").click());
    $("#fileImport").addEventListener("change", (e) => {
      if (e.target.files[0]) importData(e.target.files[0]);
      e.target.value = "";
    });
    $("#btnCheckUpdate").addEventListener("click", () => checkForUpdates(false));

    // búsquedas
    $("#searchEquipo").addEventListener("input", renderEquipos);
    $("#filterTipo").addEventListener("change", renderEquipos);
    $("#filterEquipo").addEventListener("change", renderMantenimientos);
    $("#filterTipoMant").addEventListener("change", renderMantenimientos);

    // cierre de modales
    $$("[data-close]").forEach((b) => b.addEventListener("click", () => closeModal(b.dataset.close)));
    $$(".modal-overlay").forEach((o) => o.addEventListener("click", (e) => {
      if (e.target === o) o.classList.add("hidden");
    }));

    // checklist
    $("#checklist").addEventListener("change", (e) => {
      if (e.target.type === "checkbox") {
        e.target.closest(".check-item").classList.toggle("checked", e.target.checked);
      }
    });

    // próximo mantenimiento automático
    $("#mtEquipo").addEventListener("change", setNextFromEquipo);
    $("#mtFecha").addEventListener("change", () => {
      const e = equipos.find((x) => x.id === $("#mtEquipo").value);
      if (e) $("#mtProxima").value = addDays($("#mtFecha").value || todayISO(), e.intervalo || appConfig.intervalo);
    });

    // delegación de clics
    document.addEventListener("click", (e) => {
      const delM = e.target.closest("[data-del-mant]");
      if (delM) {
        const m = mantenimientos.find((x) => x.id === delM.dataset.delMant);
        if (m) eliminarMant(m);
        return;
      }
      const editM = e.target.closest("[data-edit-mant]");
      if (editM) {
        const m = mantenimientos.find((x) => x.id === editM.dataset.editMant);
        if (m) openMantModal(m);
        return;
      }
      const open = e.target.closest("[data-open-detail]");
      if (open) { renderDetalle(open.dataset.openDetail); return; }
      const tab = e.target.closest("[data-alerttab]");
      if (tab) { alertTab = tab.dataset.alerttab; renderAlertas(); }
    });

    // estado de conexión
    const syncBadge = $("#syncBadge");
    function updateSync() {
      syncBadge.textContent = navigator.onLine ? "● En línea" : "○ Sin conexión";
      syncBadge.classList.toggle("offline", !navigator.onLine);
    }
    window.addEventListener("online", () => { updateSync(); checkForUpdates(true); });
    window.addEventListener("offline", updateSync);
    updateSync();
  }

  function init() {
    bindEvents();
    window.__APP_OK__ = true;

    // el splash siempre se oculta, aunque el almacenamiento falle
    setTimeout(() => $("#splash").classList.add("gone"), 350);

    reload()
      .then(() => {
        setView("dashboard");
        window.__STORAGE_OK__ = true;
        if ("serviceWorker" in navigator) {
          try {
            navigator.serviceWorker.register("sw.js").then((reg) => {
              reg.addEventListener("updatefound", () => {
                const nw = reg.installing;
                if (nw) nw.addEventListener("statechange", () => {
                  if (nw.state === "installed" && navigator.serviceWorker.controller) {
                    toast("Nueva versión descargada. Recarga para aplicar.", "ok");
                  }
                });
              });
            }).catch(() => {});
          } catch (e) { /* sin soporte */ }
        }
        setTimeout(() => checkForUpdates(true), 2500);
      })
      .catch((e) => {
        // modo degradado: la app abre con datos en memoria (sin guardar)
        equipos = [];
        mantenimientos = [];
        appConfig = { empresa: "Empresa", intervalo: 90 };
        window.__STORAGE_OK__ = false;
        console.error("Error de almacenamiento:", e);
        setView("dashboard");
        toast("Aviso: no se pudo abrir el almacenamiento local. La app funciona en modo temporal.", "err");
      });
  }

  // si algo inesperado falla, nunca dejar la pantalla congelada
  window.addEventListener("error", () => {
    const s = $("#splash");
    if (s && !s.classList.contains("gone")) s.classList.add("gone");
  });

  document.addEventListener("DOMContentLoaded", init);
})();
