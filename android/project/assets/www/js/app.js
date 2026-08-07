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
  let usuarios = [];
  let auditoria = [];
  let sesion = null;
  let appConfig = { empresa: "Empresa", intervalo: 90 };
  let currentView = "dashboard";
  let alertTab = "vencidos";
  let currentDetailId = null;

  // ---------------- Roles y sesión ----------------
  const ROL = { LECTURA: 0, EDICION: 1, ADMIN: 2 };
  const rolNombre = (r) => (r === 2 ? "Administrador" : r === 1 ? "Edición" : "Lectura");
  const puedeEditar = () => !!sesion && sesion.rol >= ROL.EDICION;
  const esAdmin = () => !!sesion && sesion.rol === ROL.ADMIN;

  // Un usuario común solo ve los registros asignados a él (coincide su nombre o DNI con el responsable); el admin ve todo.
  const esVisibleEquipo = (e) => {
    if (!sesion) return false;
    if (esAdmin()) return true;
    const r = (e.responsable || "").trim().toLowerCase();
    if (!r) return false;
    const n = (sesion.nombre || "").trim().toLowerCase();
    const d = (sesion.dni || "").trim().toLowerCase();
    return r === n || (d !== "" && r === d);
  };
  const equiposVisibles = () => equipos.filter(esVisibleEquipo);

  // ---------------- Estado del mantenimiento ----------------
  const estadoMant = (m) => (m.estado === "programado" || m.estado === "reprogramado") ? m.estado : "finalizado";
  const estadoLabel = (e) => (e === "programado" ? "Programado" : e === "reprogramado" ? "Reprogramado" : "Finalizado");
  const estadoBadge = (m) => {
    const e = estadoMant(m);
    const cls = e === "finalizado" ? "ok" : e === "reprogramado" ? "warn" : "info";
    return `<span class="badge ${cls}">${estadoLabel(e)}</span>`;
  };

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

  // ---------------- Auditoría ----------------
  async function auditar(accion, detalle) {
    try {
      const ahora = new Date();
      await DB.putAuditoria({
        id: "au-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
        fecha: todayISO(),
        hora: ("0" + ahora.getHours()).slice(-2) + ":" + ("0" + ahora.getMinutes()).slice(-2) + ":" + ("0" + ahora.getSeconds()).slice(-2),
        usuario: sesion ? sesion.nombre : "—",
        rol: sesion ? rolNombre(sesion.rol) : "—",
        accion: accion,
        detalle: detalle || ""
      });
      auditoria = await DB.getAuditoria(300);
    } catch (e) { /* no bloquea la acción */ }
  }

  // ---------------- Sesión / Login ----------------
  function showLogin() {
    $("#loginScreen").classList.remove("hidden");
    $("#loginClave").value = "";
  }

  function applySessionUI() {
    const chip = $("#sesionChip");
    if (sesion) {
      chip.textContent = "👤 " + sesion.nombre + " · " + rolNombre(sesion.rol);
      chip.classList.remove("hidden");
      $("#btnLogout").classList.remove("hidden");
    } else {
      chip.classList.add("hidden");
      $("#btnLogout").classList.add("hidden");
    }
    const canEdit = puedeEditar();
    $("#btnNuevoEquipo").classList.toggle("hidden", !canEdit);
    $("#btnNuevoMantenimiento").classList.toggle("hidden", !canEdit);
    const navConfig = $$(".nav-item").find((b) => b.dataset.view === "config");
    if (navConfig) navConfig.classList.toggle("hidden", !esAdmin());
  }

  async function ensureAdmin() {
    const flag = "admin_reset_" + CFG.APP_VERSION;
    const cfg = await DB.getConfig();
    if (!usuarios.some((u) => u.rol === ROL.ADMIN)) {
      const a = { id: "us-admin", nombre: "admin", dni: "admin", clave: "admin", rol: ROL.ADMIN };
      usuarios.push(a);
      await DB.putUsuario(a);
      await DB.setConfig(flag, true);
      return;
    }
    if (!cfg[flag]) {
      const admin = usuarios.find((u) => u.id === "us-admin") || usuarios.find((u) => u.rol === ROL.ADMIN);
      admin.nombre = "admin";
      admin.dni = "admin";
      admin.clave = "admin";
      admin.rol = ROL.ADMIN;
      if (admin.id !== "us-admin") admin.id = "us-admin";
      await DB.putUsuario(admin);
      await DB.setConfig(flag, true);
      auditar("RESTABLECER ADMIN", "Credenciales de administrador restablecidas");
    }
  }

  async function doLogin() {
    const usuario = $("#loginUsuario").value.trim().toLowerCase();
    const clave = $("#loginClave").value;
    const err = $("#loginError");
    if (!usuario || !clave) {
      err.textContent = "Ingresa usuario y contraseña";
      err.classList.remove("hidden");
      return;
    }
    const u = usuarios.find((x) =>
      (x.nombre || "").toLowerCase() === usuario || (x.dni || "").toLowerCase() === usuario);
    if (!u) {
      err.textContent = "Usuario o contraseña incorrectos";
      err.classList.remove("hidden");
      return;
    }
    const pwOk = u.clave ? u.clave === clave : u.dni === clave;
    if (!pwOk) {
      err.textContent = "Usuario o contraseña incorrectos";
      err.classList.remove("hidden");
      return;
    }
    sesion = { id: u.id, nombre: u.nombre, dni: u.dni, rol: u.rol };
    await DB.setSesion(sesion);
    await auditar("INICIO DE SESION", "Usuario: " + u.nombre);
    $("#loginScreen").classList.add("hidden");
    err.classList.add("hidden");
    $("#loginUsuario").value = "";
    $("#loginClave").value = "";
    applySessionUI();
    setView("dashboard");
  }

  async function doLogout() {
    await auditar("CIERRE DE SESION", "Usuario: " + (sesion ? sesion.nombre : ""));
    sesion = null;
    await DB.clearSesion();
    applySessionUI();
    showLogin();
  }

  // ---------------- Navegación ----------------
  function setView(view) {
    if (view === "config" && !esAdmin()) {
      toast("La configuración es solo del administrador", "err");
      view = "dashboard";
    }
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
    const vis = equiposVisibles();
    const total = vis.length;
    const stats = { vencidos: 0, proximos: 0, ok: 0 };
    vis.forEach((e) => { stats[statusOf(e).key]++; });
    const firstOfMonth = todayISO().slice(0, 7) + "-01";
    const visIds = new Set(vis.map((e) => e.id));
    const mes = mantenimientos.filter((m) => visIds.has(m.equipoId) && m.fecha >= firstOfMonth).length;

    $("#statTotal").textContent = total;
    $("#statVencidos").textContent = stats.vencidos;
    $("#statProximos").textContent = stats.proximos;
    $("#statMes").textContent = mes;

    const prog = { programado: 0, reprogramado: 0, finalizado: 0 };
    mantenimientos.forEach((m) => {
      if (!visIds.has(m.equipoId)) return;
      prog[estadoMant(m)]++;
    });
    $("#statProg").textContent = prog.programado;
    $("#statReprog").textContent = prog.reprogramado;
    $("#statFin").textContent = prog.finalizado;

    const alerts = vis
      .map((e) => ({ eq: e, st: statusOf(e) }))
      .filter((x) => x.st.key !== "ok")
      .sort((a, b) => (a.st.days > b.st.days ? 1 : -1));

    $("#alertList").innerHTML = alerts.slice(0, 6).map(alertHTML).join("");
    $("#alertEmpty").classList.toggle("hidden", alerts.length > 0);

    const recent = [...mantenimientos]
      .filter((m) => visIds.has(m.equipoId))
      .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
      .slice(0, 5);
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
          <div class="item-sub">${estadoLabel(estadoMant(m))} · ${fmtDate(m.fecha)} · ${m.tipo === "preventivo" ? "Preventivo" : "Correctivo"} · ${esc(m.tecnico || "—")}</div>
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
      if (!esVisibleEquipo(e)) return false;
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
    $("#eqResponsable").value = eq ? (eq.responsable || "") : (esAdmin() ? "" : (sesion ? sesion.nombre : ""));
    $("#eqResponsable").disabled = !esAdmin();
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
    if (!puedeEditar()) return toast("Tu permiso es de solo lectura", "err");
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
    auditar(id ? "EDICION EQUIPO" : "ALTA EQUIPO", "Equipo: " + nombre);
    renderEquipos();
  }

  async function eliminarEquipo(id) {
    if (!puedeEditar()) return toast("Tu permiso es de solo lectura", "err");
    if (!confirm("¿Eliminar este equipo y su historial de mantenimiento?")) return;
    const nombre = (equipos.find((x) => x.id === id) || {}).nombre || id;
    await DB.delete("equipos", id);
    const mants = mantenimientos.filter((m) => m.equipoId === id);
    for (const m of mants) await DB.delete("mantenimientos", m.id);
    equipos = await DB.getAll("equipos");
    mantenimientos = await DB.getAll("mantenimientos");
    closeModal("modalDetalle");
    toast("Equipo eliminado");
    auditar("BAJA EQUIPO", "Equipo: " + nombre);
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
    const vis = equiposVisibles();
    const sel = $("#mtEquipo");
    sel.innerHTML = vis.map((e) => `<option value="${e.id}">${esc(e.nombre)}</option>`).join("");
    if (mant) {
      sel.value = mant.equipoId;
      $("#mtFecha").value = mant.fecha || todayISO();
      $("#mtTipo").value = mant.tipo || "preventivo";
      $("#mtEstado").value = estadoMant(mant);
      $("#mtTecnico").value = mant.tecnico || "";
      $("#mtCosto").value = mant.costo || "";
      $("#mtProxima").value = mant.proxima || "";
      $("#mtObs").value = mant.obs || "";
      const tasks = mant.tareas || [];
      $$("#checklist input").forEach((inp) => { if (tasks.includes(inp.value)) inp.checked = true; });
    } else {
      sel.value = vis[0] ? vis[0].id : "";
      $("#mtFecha").value = todayISO();
      $("#mtTipo").value = "preventivo";
      $("#mtEstado").value = "finalizado";
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
    if (!puedeEditar()) return toast("Tu permiso es de solo lectura", "err");
    const equipoId = $("#mtEquipo").value;
    const fecha = $("#mtFecha").value;
    if (!equipoId || !fecha) return toast("Equipo y fecha son obligatorios", "err");
    const id = $("#mtId").value;
    const tareas = $$("#checklist input:checked").map((i) => i.value);
    const estado = estadoMant({ estado: $("#mtEstado").value });
    const data = {
      id: id || "mt-" + Date.now(),
      equipoId,
      fecha,
      tipo: $("#mtTipo").value,
      estado,
      tecnico: $("#mtTecnico").value.trim(),
      costo: parseFloat($("#mtCosto").value) || 0,
      proxima: $("#mtProxima").value,
      obs: $("#mtObs").value.trim(),
      tareas
    };
    await DB.put("mantenimientos", data);

    // el equipo solo se marca con último mantenimiento cuando se finaliza
    const eq = equipos.find((x) => x.id === equipoId);
    if (eq && estado === "finalizado") {
      eq.fechaUltimoMant = fecha;
      eq.intervalo = eq.intervalo || appConfig.intervalo;
      await DB.put("equipos", eq);
    }

    mantenimientos = await DB.getAll("mantenimientos");
    equipos = await DB.getAll("equipos");
    closeModal("modalMant");
    toast("Mantenimiento guardado", "ok");
    auditar(id ? "EDICION MANTENIMIENTO" : "ALTA MANTENIMIENTO",
      "Equipo: " + eqName(equipoId) + " · Fecha: " + fecha + " · " + (data.tipo === "preventivo" ? "Preventivo" : "Correctivo"));
    renderMantenimientos();
  }

  function renderMantenimientos() {
    const vis = equiposVisibles();
    const visIds = new Set(vis.map((e) => e.id));
    const fSel = $("#filterEquipo");
    const cur = fSel.value;
    fSel.innerHTML = `<option value="">Todos los equipos</option>` +
      vis.map((e) => `<option value="${e.id}">${esc(e.nombre)}</option>`).join("");
    if (vis.some((e) => e.id === cur)) fSel.value = cur;
    const fEq = fSel.value;
    const fTipo = $("#filterTipoMant").value;
    let list = mantenimientos.filter((m) => {
      if (!visIds.has(m.equipoId)) return false;
      if (fEq && m.equipoId !== fEq) return false;
      if (fTipo && m.tipo !== fTipo) return false;
      return true;
    });
    list.sort((a, b) => (a.fecha < b.fecha ? 1 : -1));

    $("#mantList").innerHTML = list.map((m) => `
      <div class="mant-row" data-open-detail="${m.equipoId}">
        <div class="mant-row-head">
          <span class="mant-row-title">${esc(eqName(m.equipoId))}</span>
          ${estadoBadge(m)}
          <span class="badge ${m.tipo === "preventivo" ? "ok" : "warn"}">${m.tipo === "preventivo" ? "Preventivo" : "Correctivo"}</span>
        </div>
        <div class="mant-row-sub">${fmtDate(m.fecha)} · Técnico: ${esc(m.tecnico || "—")}${m.costo ? ` · Costo: $${m.costo}` : ""}</div>
        ${m.obs ? `<div class="mant-row-sub">${esc(m.obs)}</div>` : ""}
        ${m.tareas && m.tareas.length ? `<div class="mant-chips">${m.tareas.map((t) => `<span class="mant-chip">✓ ${esc(t)}</span>`).join("")}</div>` : ""}
      </div>`).join("");
    $("#mantEmpty").classList.toggle("hidden", list.length > 0);
  }

  async function eliminarMant(m) {
    if (!puedeEditar()) return toast("Tu permiso es de solo lectura", "err");
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
    auditar("BAJA MANTENIMIENTO", "Equipo: " + eqName(m.equipoId) + " · Fecha: " + m.fecha);
    renderMantenimientos();
    if (currentDetailId) renderDetalle(currentDetailId);
  }

  // ============================================================
  //  ALERTAS
  // ============================================================
  function renderAlertas() {
    $$(".chip[data-alerttab]").forEach((c) => c.classList.toggle("active", c.dataset.alerttab === alertTab));
    const list = equipos
      .filter(esVisibleEquipo)
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
    if (!eq || !esVisibleEquipo(eq)) { toast("No tienes acceso a este equipo", "err"); return; }
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

    const canEdit = puedeEditar();
    $("#btnEliminarEquipo").classList.toggle("hidden", !canEdit);
    $("#btnEditarEquipo").classList.toggle("hidden", !canEdit);

    const hist = mantenimientos
      .filter((m) => m.equipoId === id)
      .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
    $("#detalleHistorial").innerHTML = hist.map((m) => `
      <div class="mant-row">
        <div class="mant-row-head">
          <span class="mant-row-title">${estadoLabel(estadoMant(m))} · ${fmtDate(m.fecha)} · ${m.tipo === "preventivo" ? "Preventivo" : "Correctivo"}</span>
          ${canEdit ? `<div>
            <button class="btn btn-ghost" data-edit-mant="${m.id}">Editar</button>
            <button class="btn btn-ghost" data-del-mant="${m.id}" style="color:var(--danger)">Eliminar</button>
          </div>` : ""}
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
  //  CONFIGURACIÓN (solo administrador)
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
    if (esAdmin()) {
      renderUsuarios();
      renderAuditoria();
    }
  }

  // ---------------- Usuarios y permisos ----------------
  function renderUsuarios() {
    $("#usuariosList").innerHTML = usuarios.map((u) => `
      <div class="user-row">
        <div class="user-info">
          <div class="user-name">${esc(u.nombre)}</div>
          <div class="user-sub">DNI: ${esc(u.dni)}</div>
        </div>
        <select class="input select user-rol" data-usuario="${esc(u.id)}">
          <option value="0" ${u.rol === 0 ? "selected" : ""}>Lectura</option>
          <option value="1" ${u.rol === 1 ? "selected" : ""}>Edición</option>
          <option value="2" ${u.rol === 2 ? "selected" : ""}>Administrador</option>
        </select>
        <button class="btn btn-ghost" data-edit-usuario="${esc(u.id)}">Editar</button>
      </div>`).join("");
  }

  function openUsuarioModal(u) {
    $("#modalUsuarioTitle").textContent = u ? "Editar usuario" : "Nuevo usuario";
    $("#usId").value = u ? u.id : "";
    $("#usNombre").value = u ? u.nombre : "";
    $("#usDni").value = u ? (u.dni || "") : "";
    $("#usClave").value = u ? (u.clave || "") : "";
    $("#usRol").value = u ? String(u.rol) : "1";
    $("#btnEliminarUsuario").classList.toggle("hidden", !u);
    openModal("modalUsuario");
  }

  async function saveUsuario() {
    if (!esAdmin()) return toast("Solo el administrador", "err");
    const nombre = $("#usNombre").value.trim();
    const dni = $("#usDni").value.trim();
    if (!nombre || !dni) return toast("Nombre y DNI son obligatorios", "err");
    const id = $("#usId").value;
    const clave = $("#usClave").value.trim();
    const rol = parseInt($("#usRol").value, 10);
    if (id === sesion.id && rol !== ROL.ADMIN) {
      return toast("No puedes quitarte el permiso de administrador a ti mismo", "err");
    }
    if (usuarios.some((x) => x.id !== id && x.dni === dni)) {
      return toast("Ya existe un usuario con ese DNI", "err");
    }
    const u = {
      id: id || "us-" + Date.now(),
      nombre,
      dni,
      clave: clave || dni,
      rol,
      fechaAlta: (usuarios.find((x) => x.id === id) || {}).fechaAlta || todayISO()
    };
    await DB.putUsuario(u);
    if (id) {
      const i = usuarios.findIndex((x) => x.id === id);
      if (i >= 0) usuarios[i] = u;
    } else {
      usuarios.push(u);
    }
    closeModal("modalUsuario");
    toast("Usuario guardado", "ok");
    auditar(id ? "EDICION USUARIO" : "ALTA USUARIO", "Nombre: " + nombre + " · Permiso: " + rolNombre(rol));
    renderUsuarios();
  }

  async function eliminarUsuario(id) {
    if (!esAdmin()) return toast("Solo el administrador", "err");
    if (id === sesion.id) return toast("No puedes eliminarte a ti mismo", "err");
    if (!confirm("¿Eliminar este usuario?")) return;
    const u = usuarios.find((x) => x.id === id);
    await DB.deleteUsuario(id);
    usuarios = usuarios.filter((x) => x.id !== id);
    closeModal("modalUsuario");
    toast("Usuario eliminado");
    auditar("BAJA USUARIO", u ? "Nombre: " + u.nombre : id);
    renderUsuarios();
  }

  // ---------------- Auditoría ----------------
  function renderAuditoria() {
    const list = auditoria.slice(0, 100);
    $("#auditoriaList").innerHTML = list.map((a) => `
      <div class="aud-row">
        <div class="aud-head">
          <span class="aud-accion">${esc(a.accion)}</span>
          <span class="aud-fecha">${a.fecha} ${esc(a.hora || "")}</span>
        </div>
        <div class="aud-sub">${esc(a.usuario)} (${esc(a.rol)}) · ${esc(a.detalle || "")}</div>
      </div>`).join("");
    $("#auditoriaEmpty").classList.toggle("hidden", list.length > 0);
  }

  async function saveConfig() {
    if (!esAdmin()) return toast("Solo el administrador", "err");
    appConfig.empresa = $("#cfgEmpresa").value.trim() || "Empresa";
    appConfig.intervalo = parseInt($("#cfgIntervalo").value, 10) || 90;
    await DB.setConfig("empresa", appConfig.empresa);
    await DB.setConfig("intervalo", appConfig.intervalo);
    toast("Configuración guardada", "ok");
    auditar("CONFIGURACION", "Empresa: " + appConfig.empresa + " · Intervalo: " + appConfig.intervalo + " días");
    renderConfig();
  }

  // ---------------- Export / Import ----------------
  function exportData() {
    if (!esAdmin()) return toast("Solo el administrador", "err");
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
    auditar("EXPORTAR DATOS", "Respaldo descargado");
  }

  function importData(file) {
    if (!esAdmin()) return toast("Solo el administrador", "err");
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
        auditar("IMPORTAR DATOS", "Restauración de respaldo");
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
    usuarios = await DB.getUsuarios();
    auditoria = await DB.getAuditoria(300);
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

    // sesión
    $("#btnLogin").addEventListener("click", doLogin);
    $("#btnLogout").addEventListener("click", doLogout);
    $("#loginClave").addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });
    $("#loginUsuario").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#loginClave").focus(); });

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

    // usuarios y permisos
    $("#btnNuevoUsuario").addEventListener("click", () => openUsuarioModal(null));
    $("#btnGuardarUsuario").addEventListener("click", saveUsuario);
    $("#btnEliminarUsuario").addEventListener("click", () => {
      const id = $("#usId").value;
      if (id) eliminarUsuario(id);
    });

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
      const editUsr = e.target.closest("[data-edit-usuario]");
      if (editUsr) {
        const u = usuarios.find((x) => x.id === editUsr.dataset.editUsuario);
        if (u) openUsuarioModal(u);
        return;
      }
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

    // cambio de permiso desde la lista
    document.addEventListener("change", (e) => {
      if (!e.target.classList || !e.target.classList.contains("user-rol")) return;
      const id = e.target.dataset.usuario;
      const nuevo = parseInt(e.target.value, 10);
      const u = usuarios.find((x) => x.id === id);
      if (!u) return;
      if (id === sesion.id && u.rol === ROL.ADMIN && nuevo !== ROL.ADMIN) {
        toast("No puedes quitarte el permiso de administrador a ti mismo", "err");
        e.target.value = String(u.rol);
        return;
      }
      u.rol = nuevo;
      DB.putUsuario(u).then(async () => {
        await auditar("CAMBIO DE PERMISO", "Usuario: " + u.nombre + " · Nuevo permiso: " + rolNombre(nuevo));
        if (id === sesion.id) {
          sesion.rol = nuevo;
          await DB.setSesion(sesion);
          applySessionUI();
        }
        toast("Permiso actualizado: " + rolNombre(nuevo), "ok");
      });
    });

    // estado de conexión
    window.addEventListener("online", () => checkForUpdates(true));
  }

  function init() {
    bindEvents();
    window.__APP_OK__ = true;

    // el splash siempre se oculta, aunque el almacenamiento falle
    setTimeout(() => $("#splash").classList.add("gone"), 350);

    reload()
      .then(async () => {
        await ensureAdmin();
        sesion = await DB.getSesion();
        window.__STORAGE_OK__ = true;
        applySessionUI();
        if (sesion) {
          $("#loginScreen").classList.add("hidden");
          setView("dashboard");
        } else {
          showLogin();
        }
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
        usuarios = [];
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
