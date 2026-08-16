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
  let usuarioPerfilMode = false;
  let feriados = [];

  // ---------------- Roles y sesión ----------------
  const ROL = { LECTURA: 0, EDICION: 1, ADMIN: 2 };
  const rolNombre = (r) => (r === 2 ? "Administrador" : r === 1 ? "Edición" : "Lectura");
  const puedeEditar = () => !!sesion && sesion.rol >= ROL.EDICION;
  const esAdmin = () => !!sesion && sesion.rol === ROL.ADMIN;

  // Un usuario común solo ve los registros asignados a él (coincide su nombre o DNI con el
  // usuario asignado o el responsable del equipo, igual que el APK por usuario_id); el admin ve todo.
  const esVisibleEquipo = (e) => {
    if (!sesion) return false;
    if (esAdmin()) return true;
    const n = (sesion.nombre || "").trim().toLowerCase();
    const d = (sesion.dni || "").trim().toLowerCase();
    const personas = [e.usuarioAsignado || "", e.responsable || ""]
      .map((v) => v.trim().toLowerCase()).filter(Boolean);
    return personas.some((p) => p === n || (d !== "" && p === d));
  };
  const equiposVisibles = () => equipos.filter(esVisibleEquipo);

  // ---------------- Estado del mantenimiento ----------------
  // Lógica idéntica al APK: un estado es final si contiene realiz/complet/hecho/ok/cumplid/
  // concluid/finaliz/termin/ejecutad/atendid/anulad/cancelad, pero NO si dice "no realizado",
  // "no completado" o "no finalizado" (esos quedan pendientes y salen en las alertas).
  const esEstadoFinal = (estado) => {
    if (estado == null) return false;
    const e = String(estado).toLowerCase();
    if (e.indexOf("no realiz") >= 0 || e.indexOf("no complet") >= 0 || e.indexOf("no finaliz") >= 0) return false;
    return ["realiz", "complet", "hecho", "ok", "cumplid", "concluid", "finaliz", "termin",
      "ejecutad", "atendid", "anulad", "cancelad"].some((k) => e.indexOf(k) >= 0);
  };
  const estadoMant = (m) => {
    if (m.fechaReal) return "finalizado";
    const e = String(m.estado || "").toLowerCase();
    if (e.indexOf("reprogram") >= 0) return "reprogramado";
    if (e.indexOf("program") >= 0) return "programado";
    if (esEstadoFinal(m.estado)) return "finalizado";
    return "programado";
  };
  // Un mantenimiento es finalizado si tiene fecha real registrada o su estado es final.
  const esFinalizado = (m) => Boolean(m.fechaReal) || esEstadoFinal(m.estado);
  const estadoLabel = (e) => (e === "programado" ? "Programado" : e === "reprogramado" ? "Reprogramado" : "Finalizado");
  const estadoBadge = (m) => {
    const e = estadoMant(m);
    const cls = e === "finalizado" ? "ok" : e === "reprogramado" ? "warn" : "info";
    return `<span class="badge ${cls}">${estadoLabel(e)}</span>`;
  };

  // Selecciona la opción de un <select> sin importar mayúsculas ni espacios.
  function fijarSelect($el, valor) {
    const v = String(valor == null ? "" : valor).trim();
    if (!v) { $el.value = ""; return; }
    const hit = Array.from($el.options).find((o) => o.value.toLowerCase() === v.toLowerCase());
    $el.value = hit ? hit.value : v;
  }

  // ---------------- Utilidades de fecha ----------------
  const todayISO = () => toISODate(new Date());
  // Marca de tiempo (yyyy-MM-dd HH:mm:ss) del momento en que se finaliza, igual que el APK.
  const nowStamp = () => {
    const d = new Date();
    const p = (n) => ("0" + n).slice(-2);
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate())
      + " " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
  };
  function toISODate(d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return "";
    const off = d.getTimezoneOffset();
    return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
  }
  // Normaliza cualquier formato de fecha (yyyy-MM-dd, dd/MM/yyyy, ISO, Date de
  // JavaScript, texto de Excel) a yyyy-MM-dd. Si no es reconocible, lo devuelve tal cual.
  function normFecha(v) {
    if (v == null) return "";
    if (v instanceof Date) return isNaN(v.getTime()) ? "" : toISODate(v);
    const s = String(v).trim();
    if (!s) return "";
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
      const p = s.split("-");
      return p[0] + "-" + ("0" + p[1]).slice(-2) + "-" + ("0" + p[2]).slice(-2);
    }
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
      const p = s.split("/");
      return p[2] + "-" + ("0" + p[1]).slice(-2) + "-" + ("0" + p[0]).slice(-2);
    }
    const d = new Date(s);
    if (!isNaN(d.getTime())) return toISODate(d);
    return s;
  }
  function addDays(iso, days) {
    const base = normFecha(iso);
    if (!base) return todayISO();
    const d = new Date(base + "T00:00:00");
    d.setDate(d.getDate() + days);
    return toISODate(d);
  }
  function parseISO(iso) {
    return new Date(normFecha(iso) + "T00:00:00");
  }
  function diffDays(fromISO, toISO) {
    const a = parseISO(fromISO), b = parseISO(toISO);
    if (isNaN(a.getTime()) || isNaN(b.getTime())) return NaN;
    return Math.round((b - a) / 86400000);
  }
  function fmtDate(iso) {
    if (iso == null || iso === "") return "—";
    const s = normFecha(iso);
    if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = parseISO(s);
    return d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
  }
  const now = () => new Date().toISOString();

  // ---------------- Fecha de próximo mantenimiento ----------------
  function nextDueDate(eq) {
    const interval = eq.intervalo || appConfig.intervalo;
    // Si hay un mantenimiento pendiente (no finalizado), su fecha efectiva
    // (reprogramada o programada) es la que marca el vencimiento.
    const pend = mantenimientos
      .filter((m) => m.equipoId === eq.id && !esFinalizado(m))
      .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))[0];
    if (pend) return normFecha(pend.fechaReprogramada) || normFecha(pend.fecha) || addDays(todayISO(), interval);
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
    const navConfig = $$(".nav-item").find((b) => b.dataset.view === "config");
    if (navConfig) navConfig.classList.toggle("hidden", !sesion);
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
    // Lógica idéntica al APK: "admin"/"administrador" entra con cualquier usuario administrador;
    // los responsables entran con su DNI o nombre (clave asignada o DNI si no tienen clave).
    const ku = usuario.replace(/[^a-z0-9]/g, "").toLowerCase();
    const adminKey = ku === "admin" || ku === "administrador";
    const u = adminKey
      ? usuarios.find((x) => x.rol === ROL.ADMIN)
      : usuarios.find((x) =>
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
  function openModal(id) {
    // Solo un modal visible a la vez (evita que un modal quede oculto detrás de otro).
    $$(".modal-overlay").forEach((m) => {
      if (m.id !== id) {
        m.classList.add("hidden");
        if (m.id === "modalDetalle") currentDetailId = null;
      }
    });
    $("#" + id).classList.remove("hidden");
  }
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
    const visIds = new Set(vis.map((e) => String(e.id)));
    const mes = mantenimientos.filter((m) => visIds.has(m.equipoId) && m.fecha >= firstOfMonth).length;

    $("#statTotal").textContent = total;
    $("#statResp").textContent = usuarios.length;
    $("#cardResp").classList.toggle("hidden", !esAdmin());
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
      .filter((m) => visIds.has(String(m.equipoId)) && esFinalizado(m))
      .sort((a, b) => (b.finalizadoEn || b.fechaReal || b.fechaReprogramada || b.fecha || "")
        .localeCompare(a.finalizadoEn || a.fechaReal || a.fechaReprogramada || a.fecha || ""))
      .slice(0, 3);
    $("#recentList").innerHTML = recent.map(recentHTML).join("");
    $("#recentEmpty").classList.toggle("hidden", recent.length > 0);
  }

  function eqName(id) {
    const e = equipos.find((x) => String(x.id) === String(id));
    return e ? e.nombre : "Equipo eliminado";
  }

  // Siempre muestra el usuario asignado; si existe un responsable distinto, lo agrega.
  function usuarioLabel(eq) {
    const a = (eq.usuarioAsignado || "").trim();
    const r = (eq.responsable || "").trim();
    if (!a && !r) return "";
    if (!a) return r;
    if (!r || a.toLowerCase() === r.toLowerCase()) return a;
    return a + " (resp: " + r + ")";
  }

  function alertHTML({ eq, st }) {
    const cls = st.key === "vencido" ? "danger" : "";
    const label = st.key === "vencido" ? "VENCIDO" : "PRÓXIMO";
    const days = st.key === "vencido" ? Math.abs(st.days) : st.days;
    const asignado = (eq.usuarioAsignado || "").trim() || "—";
    return `
      <div class="alert-item ${cls}" data-open-detail="${eq.id}">
        <div class="alert-head">
          <span class="alert-title">${esc(asignado)}</span>
          <span class="badge ${st.key === "vencido" ? "danger" : "warn"}">${label}</span>
        </div>
        <div class="alert-sub">${esc(eq.nombre)}</div>
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
          <div class="item-sub">${estadoLabel(esFinalizado(m) ? "finalizado" : estadoMant(m))} · ${fmtDate(m.fechaReal || m.fecha)} · ${m.tipo === "preventivo" ? "Preventivo" : "Correctivo"} · ${esc(m.tecnico || "—")}</div>
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
      return [e.nombre, e.serie, e.hostname, e.marca, e.ubicacion, e.ip, e.departamento, e.cargo, e.responsable, e.modelo]
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
      const asignado = (e.usuarioAsignado || "").trim();
      return `
        <div class="item-card" data-open-detail="${e.id}">
          <div class="item-avatar">${ico}</div>
          <div class="item-body">
            <div class="item-user">👤 ${esc(asignado || "Sin usuario asignado")}</div>
            <div class="item-title">${esc(e.serie || "—")} - ${esc(e.hostname || "—")}</div>
            <div class="item-sub">${esc(e.nombre || "—")} - ${esc(e.ubicacion || "—")} - ${esc(e.ip || "—")}</div>
            <div class="due-line ${st.key === "vencido" ? "badge danger" : st.key === "proximo" ? "badge warn" : "badge ok"}">Próx. mant.: ${fmtDate(st.due)}</div>
          </div>
          <div class="item-meta">${badge}</div>
        </div>`;
    }).join("");
    $("#equipoEmpty").classList.toggle("hidden", list.length > 0);
  }

  function cargarSelectResponsables(eq) {
    const sel = $("#eqResponsable");
    const actual = eq ? (eq.responsable || "").trim() : "";
    const lista = usuarios
      .map((u) => (u.nombre || "").trim())
      .filter((n) => n.length > 0)
      .sort((a, b) => a.localeCompare(b, "es"));
    const actualNorm = actual.toLowerCase();
    let encontrado = false;
    let opts = `<option value="">— Sin asignar —</option>`;
    for (const n of lista) {
      const marca = n.toLowerCase() === actualNorm ? "selected" : "";
      if (marca) encontrado = true;
      opts += `<option value="${esc(n)}" ${marca}>${esc(n)}</option>`;
    }
    if (actual && !encontrado) {
      opts += `<option value="${esc(actual)}" selected>${esc(actual)} (no está en la lista)</option>`;
    }
    sel.innerHTML = opts;
    if (esAdmin()) {
      sel.disabled = false;
      if (!encontrado) sel.selectedIndex = actual ? sel.options.length - 1 : 0;
    } else {
      sel.disabled = true;
      const nom = (sesion ? sesion.nombre : "").trim().toLowerCase();
      const idx = Array.from(sel.options).findIndex((o) => o.value.toLowerCase() === nom);
      if (idx >= 0) sel.selectedIndex = idx;
    }
  }

  function openEquipoModal(eq) {
    $("#modalEquipoTitle").textContent = eq ? "Editar equipo" : "Nuevo equipo";
    $("#eqId").value = eq ? eq.id : "";
    $("#eqNombre").value = eq ? eq.nombre : "";
    $("#eqTipo").value = eq ? eq.tipo : "laptop";
    $("#eqMarca").value = eq ? (eq.marca || "") : "";
    $("#eqModelo").value = eq ? (eq.modelo || "") : "";
    $("#eqSerie").value = eq ? (eq.serie || "") : "";
    $("#eqHostname").value = eq ? (eq.hostname || "") : "";
    $("#eqDepartamento").value = eq ? (eq.departamento || "") : "";
    $("#eqCargo").value = eq ? (eq.cargo || "") : "";
    cargarSelectResponsables(eq);
    $("#eqUbicacion").value = eq ? (eq.ubicacion || "") : "";
    $("#eqSO").value = eq ? (eq.so || "") : "";
    $("#eqIP").value = eq ? (eq.ip || "") : "";
    $("#eqUsuarioAsignado").value = eq ? (eq.usuarioAsignado || "") : "";
    $("#eqArea").value = eq ? (eq.area || "") : "";
    $("#eqCodInventario").value = eq ? (eq.codInventario || "") : "";
    $("#eqDni").value = eq ? (eq.dni || "") : "";
    $("#eqResponsable").onchange = () => {
      const nom = $("#eqResponsable").value;
      const u = usuarios.find((x) => (x.nombre || "").trim() === nom);
      if (u && u.dni) $("#eqDni").value = u.dni;
    };
    $("#eqFechaCompra").value = eq ? (normFecha(eq.fechaCompra) || "") : "";
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
      hostname: $("#eqHostname").value.trim(),
      departamento: $("#eqDepartamento").value.trim(),
      cargo: $("#eqCargo").value.trim(),
      responsable: $("#eqResponsable").value.trim(),
      ubicacion: $("#eqUbicacion").value.trim(),
      so: $("#eqSO").value.trim(),
      ip: $("#eqIP").value.trim(),
      usuarioAsignado: $("#eqUsuarioAsignado").value.trim(),
      area: $("#eqArea").value.trim(),
      codInventario: $("#eqCodInventario").value.trim(),
      dni: $("#eqDni").value.trim(),
      fechaCompra: normFecha($("#eqFechaCompra").value),
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
    syncSubir();
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
    syncSubir();
  }

  // ============================================================
  //  MANTENIMIENTOS
  // ============================================================
  function rellenarChecklist(softSel, hardSel) {
    const soft = [], hard = [];
    CFG.CHECKLIST_DEFAULT.forEach((c) => {
      if (HW_RE.test(c)) hard.push(c); else soft.push(c);
    });
    const render = (arr) => arr.map((c, i) => `
      <label class="check-item">
        <input type="checkbox" value="${esc(c)}" data-check="${i}" /> ${esc(c)}
      </label>`).join("");
    $(softSel).innerHTML = render(soft);
    $(hardSel).innerHTML = render(hard);
  }

  function buildChecklist() { rellenarChecklist("#checklistSoft", "#checklistHard"); }

  function openMantModal(mant) {
    $("#modalMantTitle").textContent = mant ? "Editar mantenimiento" : "Registrar mantenimiento";
    $("#mtId").value = mant ? mant.id : "";
    buildChecklist();
    const vis = equiposVisibles();
    const sel = $("#mtEquipo");
    sel.innerHTML = vis.map((e) => `<option value="${e.id}">${esc(e.nombre)}</option>`).join("");
    if (mant) {
      sel.value = mant.equipoId;
      $("#mtFecha").value = normFecha(mant.fecha) || todayISO();
      $("#mtTipo").value = mant.tipo || "preventivo";
      fijarSelect($("#mtPrioridad"), mant.prioridad);
      $("#mtFechaReprog").value = normFecha(mant.fechaReprogramada) || "";
      $("#mtFechaReal").value = normFecha(mant.fechaReal) || "";
      $("#mtEstado").value = estadoMant(mant);
      $("#mtTecnico").value = mant.tecnico || "";
      $("#mtCosto").value = mant.costo || "";
      $("#mtProxima").value = normFecha(mant.proxima) || "";
      $("#mtObs").value = mant.obs || "";
      const tasks = mant.tareas || [];
      $$("#checklistSoft input, #checklistHard input").forEach((inp) => { if (tasks.includes(inp.value)) inp.checked = true; });
      // En edición se permite modificar todo el historial excepto el equipo y el tipo.
      ["mtEquipo", "mtTipo"]
        .forEach((id) => { $(id).disabled = true; });
    } else {
      sel.value = vis[0] ? vis[0].id : "";
      $("#mtFecha").value = todayISO();
      $("#mtTipo").value = "preventivo";
      $("#mtPrioridad").value = "";
      $("#mtFechaReprog").value = "";
      $("#mtFechaReal").value = "";
      $("#mtEstado").value = "programado";
      $("#mtTecnico").value = "";
      $("#mtCosto").value = "";
      $("#mtProxima").value = "";
      $("#mtObs").value = "";
      // En registro todos los campos quedan habilitados.
      ["mtEquipo", "mtFecha", "mtTipo", "mtPrioridad", "mtEstado", "mtTecnico", "mtCosto", "mtProxima"]
        .forEach((id) => { $(id).disabled = false; });
      // En registro nuevo, reprogramada y real se deshabilitan (se completan al editar).
      $("#mtFechaReprog").disabled = true;
      $("#mtFechaReal").disabled = true;
      setNextFromEquipo();
      autocompletarResponsable();
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

  // Precarga el responsable del equipo en el campo "Responsable de mantenimiento".
  function autocompletarResponsable() {
    const e = equipos.find((x) => x.id === $("#mtEquipo").value);
    if (e) {
      const resp = e.responsable || e.usuarioAsignado || "";
      if (resp && !$("#mtTecnico").value) $("#mtTecnico").value = resp;
    }
  }

  async function saveMant() {
    if (!puedeEditar()) return toast("Tu permiso es de solo lectura", "err");
    const equipoId = $("#mtEquipo").value;
    const fecha = normFecha($("#mtFecha").value);
    if (!equipoId || !fecha) return toast("Equipo y fecha son obligatorios", "err");
    const id = $("#mtId").value;
    const tareas = $$("#checklistSoft input:checked, #checklistHard input:checked").map((i) => i.value);
    const fechaReal = normFecha($("#mtFechaReal").value);
    const fechaReprogramada = normFecha($("#mtFechaReprog").value);
    // El estado se actualiza según las fechas registradas:
    // fecha real -> Finalizado ; fecha reprogramada -> Reprogramado.
    const estado = fechaReal
      ? "finalizado"
      : fechaReprogramada
        ? "reprogramado"
        : estadoMant({ estado: $("#mtEstado").value });
    // Al registrar la fecha real se genera automáticamente el próximo mantenimiento anual.
    let proxima = normFecha($("#mtProxima").value);
    if (fechaReal && !proxima) proxima = addDays(fechaReal, 365);
    // Marca de finalización (yyyy-MM-dd HH:mm:ss): se conserva si ya estaba fijada.
    let finalizadoEn = "";
    if (estado === "finalizado") {
      const prev = id ? mantenimientos.find((x) => x.id === id) : null;
      finalizadoEn = (prev && prev.finalizadoEn) || nowStamp();
    }
    const data = {
      id: id || "mt-" + Date.now(),
      equipoId,
      fecha,
      tipo: $("#mtTipo").value,
      estado,
      prioridad: $("#mtPrioridad").value.trim(),
      fechaReprogramada,
      fechaReal,
      tecnico: $("#mtTecnico").value.trim(),
      costo: parseFloat($("#mtCosto").value) || 0,
      proxima: proxima,
      obs: $("#mtObs").value.trim(),
      tareas,
      finalizadoEn
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
    syncSubir();
  }

  // ============================================================
  //  FORMULARIO DE MANTENIMIENTO EMBEBIDO EN EL DETALLE
  // ============================================================
  function renderMantFormEnDetalle(mant) {
    const m = mant || {};
    const eqId = currentDetailId;
    $("#detalleMantForm").innerHTML = `
      <h4 class="detalle-form-title">${m.id ? "Editar mantenimiento" : "Registrar mantenimiento"}</h4>
      <input type="hidden" id="dtId" value="${esc(m.id || "")}" />
      <input type="hidden" id="dtEquipo" value="${esc(eqId)}" />
      <div class="field-row">
        <div>
          <label class="field-label" for="dtFecha">Fecha *</label>
          <input type="date" id="dtFecha" class="input" />
        </div>
        <div>
          <label class="field-label" for="dtTipo">Tipo</label>
          <select id="dtTipo" class="input select">
            <option value="preventivo">Preventivo</option>
            <option value="correctivo">Correctivo</option>
          </select>
        </div>
      </div>
      <div class="field-row">
        <div>
          <label class="field-label" for="dtPrioridad">Prioridad</label>
          <select id="dtPrioridad" class="input select">
            <option value="">—</option>
            <option value="Alta">Alta</option>
            <option value="Media">Media</option>
            <option value="Baja">Baja</option>
          </select>
        </div>
        <div>
          <label class="field-label" for="dtFechaReprog">Fecha reprogramación</label>
          <input type="date" id="dtFechaReprog" class="input" />
        </div>
      </div>
      <div class="field-row">
        <div>
          <label class="field-label" for="dtFechaReal">Fecha real</label>
          <input type="date" id="dtFechaReal" class="input" />
        </div>
        <div>
          <label class="field-label" for="dtEstado">Estado</label>
          <select id="dtEstado" class="input select">
            <option value="finalizado">Finalizado</option>
            <option value="programado">Programado</option>
            <option value="reprogramado">Reprogramado</option>
          </select>
        </div>
      </div>
      <div class="field-row">
        <div>
          <label class="field-label" for="dtTecnico">Responsable de mantenimiento</label>
          <input type="text" id="dtTecnico" class="input" placeholder="Nombre del responsable" />
        </div>
        <div>
          <label class="field-label" for="dtCosto">Costo (opcional)</label>
          <input type="number" id="dtCosto" class="input" min="0" step="0.01" placeholder="0.00" />
        </div>
      </div>
      <div class="field-row">
        <div>
          <label class="field-label" for="dtProxima">Próximo mantenimiento</label>
          <input type="date" id="dtProxima" class="input" />
        </div>
        <div></div>
      </div>
      <label class="field-label"><strong>Actividades realizadas</strong></label>
      <div class="checklist-section">
        <h5><strong>Mantenimiento de Software</strong></h5>
        <div id="dtChecklistSoft" class="checklist"></div>
      </div>
      <div class="checklist-section">
        <h5><strong>Mantenimiento de Hardware</strong></h5>
        <div id="dtChecklistHard" class="checklist"></div>
      </div>
      <label class="field-label" for="dtObs"><strong>Observaciones</strong></label>
      <textarea id="dtObs" class="input textarea" rows="2" placeholder="Detalles del mantenimiento"></textarea>
      <div class="mant-form-actions">
        <button class="btn btn-outline" id="btnCancelarMantDetalle">Cancelar</button>
        <button class="btn btn-primary" id="btnGuardarMantDetalle">Guardar mantenimiento</button>
      </div>`;
    rellenarChecklist("#dtChecklistSoft", "#dtChecklistHard");
    $("#dtTipo").value = m.tipo || "preventivo";
    if (m.id) $("#dtTipo").disabled = true;
    $("#dtFecha").value = normFecha(m.fecha) || todayISO();
    fijarSelect($("#dtPrioridad"), m.prioridad);
    $("#dtFechaReprog").value = normFecha(m.fechaReprogramada) || "";
    $("#dtFechaReal").value = normFecha(m.fechaReal) || "";
    $("#dtEstado").value = estadoMant(m);
    $("#dtTecnico").value = m.tecnico || "";
    $("#dtCosto").value = m.costo || "";
    $("#dtProxima").value = normFecha(m.proxima) || "";
    $("#dtObs").value = m.obs || "";
    const tareas = m.tareas || [];
    $$("#dtChecklistSoft input, #dtChecklistHard input").forEach((inp) => { if (tareas.includes(inp.value)) inp.checked = true; });
    // auto-estado según fechas: reprogramada -> reprogramado, real -> finalizado
    const syncEstadoDetalle = () => {
      const real = $("#dtFechaReal").value;
      const reprog = $("#dtFechaReprog").value;
      $("#dtEstado").value = real ? "finalizado" : reprog ? "reprogramado" : $("#dtEstado").value;
    };
    $("#dtFechaReprog").addEventListener("change", syncEstadoDetalle);
    $("#dtFechaReal").addEventListener("change", (e) => {
      if (e.target.value) $("#dtProxima").value = addDays(e.target.value, 365);
      syncEstadoDetalle();
    });
    $("#btnGuardarMantDetalle").onclick = saveMantInline;
    $("#btnCancelarMantDetalle").onclick = cerrarFormMantDetalle;
    $("#detalleMantForm").classList.remove("hidden");
    $("#detalleMantForm").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function cerrarFormMantDetalle() {
    $("#detalleMantForm").classList.add("hidden");
    $("#detalleMantForm").innerHTML = "";
  }

  async function saveMantInline() {
    if (!puedeEditar()) return toast("Tu permiso es de solo lectura", "err");
    const equipoId = $("#dtEquipo").value;
    const fecha = normFecha($("#dtFecha").value);
    if (!equipoId || !fecha) return toast("Equipo y fecha son obligatorios", "err");
    const id = $("#dtId").value;
    const tareas = $$("#dtChecklistSoft input:checked, #dtChecklistHard input:checked").map((i) => i.value);
    const fechaReal = normFecha($("#dtFechaReal").value);
    const fechaReprogramada = normFecha($("#dtFechaReprog").value);
    const estado = fechaReal
      ? "finalizado"
      : fechaReprogramada
        ? "reprogramado"
        : estadoMant({ estado: $("#dtEstado").value });
    let proxima = normFecha($("#dtProxima").value);
    if (fechaReal && !proxima) proxima = addDays(fechaReal, 365);
    let finalizadoEn = "";
    if (estado === "finalizado") {
      const prev = id ? mantenimientos.find((x) => x.id === id) : null;
      finalizadoEn = (prev && prev.finalizadoEn) || nowStamp();
    }
    const data = {
      id: id || "mt-" + Date.now(),
      equipoId,
      fecha,
      tipo: $("#dtTipo").value,
      estado,
      prioridad: $("#dtPrioridad").value.trim(),
      fechaReprogramada,
      fechaReal,
      tecnico: $("#dtTecnico").value.trim(),
      costo: parseFloat($("#dtCosto").value) || 0,
      proxima,
      obs: $("#dtObs").value.trim(),
      tareas,
      finalizadoEn
    };
    await DB.put("mantenimientos", data);
    const eq = equipos.find((x) => x.id === equipoId);
    if (eq && estado === "finalizado") {
      eq.fechaUltimoMant = fecha;
      eq.intervalo = eq.intervalo || appConfig.intervalo;
      await DB.put("equipos", eq);
    }
    mantenimientos = await DB.getAll("mantenimientos");
    equipos = await DB.getAll("equipos");
    cerrarFormMantDetalle();
    toast("Mantenimiento guardado", "ok");
    auditar(id ? "EDICION MANTENIMIENTO" : "ALTA MANTENIMIENTO",
      "Equipo: " + eqName(equipoId) + " · Fecha: " + fecha + " · " + (data.tipo === "preventivo" ? "Preventivo" : "Correctivo"));
    renderDetalle(equipoId);
    syncSubir();
  }

  function renderMantenimientos() {
    const vis = equiposVisibles();
    const visIds = new Set(vis.map((e) => e.id));
    const ubicMap = new Map(vis.map((e) => [e.id, (e.ubicacion || "").trim()]));
    const ubicSel = $("#filterUbicacion");
    const curUbic = ubicSel.value;
    const ubics = [...new Set(ubicMap.values())].filter(Boolean).sort();
    ubicSel.innerHTML = `<option value="">Todas las ubicaciones</option>` +
      ubics.map((u) => `<option value="${esc(u)}">${esc(u)}</option>`).join("");
    if (ubics.includes(curUbic)) ubicSel.value = curUbic;
    const fSel = $("#filterEquipo");
    const cur = fSel.value;
    fSel.innerHTML = `<option value="">Todos los equipos</option>` +
      vis.map((e) => `<option value="${e.id}">${esc(e.nombre)}</option>`).join("");
    if (vis.some((e) => e.id === cur)) fSel.value = cur;
    const fEq = fSel.value;
    const fTipo = $("#filterTipoMant").value;
    const fEstado = $("#filterEstadoMant").value;
    const fUbic = ubicSel.value;
    const fDesde = $("#filterFechaDesde").value;
    const fHasta = $("#filterFechaHasta").value;
    const fUsuario = ($("#filterUsuarioMant").value || "").trim().toLowerCase();
    let list = mantenimientos.filter((m) => {
      if (!visIds.has(m.equipoId)) return false;
      if (fUbic && (ubicMap.get(m.equipoId) || "") !== fUbic) return false;
      if (fEq && m.equipoId !== fEq) return false;
      if (fTipo && m.tipo !== fTipo) return false;
      if (fEstado && estadoMant(m) !== fEstado) return false;
      if (fDesde && m.fecha < fDesde) return false;
      if (fHasta && m.fecha > fHasta) return false;
      // Filtrar por usuario asignado
      if (fUsuario) {
        const eq = equipos.find((x) => x.id === m.equipoId) || {};
        const usuarioEq = (eq.usuarioAsignado || eq.responsable || "").toLowerCase();
        if (!usuarioEq.includes(fUsuario)) return false;
      }
      return true;
    });
    list.sort((a, b) => (a.fecha < b.fecha ? 1 : -1));

    // Contador de registros
    const contador = `<div class="mant-counter">${list.length} registro${list.length === 1 ? "" : "s"} encontrado${list.length === 1 ? "" : "s"}</div>`;

    $("#mantList").innerHTML = contador + list.map((m) => {
      const eq = equipos.find((x) => x.id === m.equipoId) || {};
      const subSerie = [eq.serie, eq.hostname].filter(Boolean).join(" - ") || "—";
      const prog = [fmtDate(m.fecha), m.prioridad].filter(Boolean).join(" - ") || "—";
      const reprog = m.fechaReprogramada ? fmtDate(m.fechaReprogramada) : "—";
      const asignado = (eq.usuarioAsignado || "").trim();
      return `
      <div class="mant-row" data-open-detail="${m.equipoId}">
        <div class="mant-row-head">
          <span class="mant-row-title">👤 ${esc(asignado || "Sin usuario asignado")}</span>
          ${estadoBadge(m)}
          <span class="badge ${m.tipo === "preventivo" ? "ok" : "warn"}">${m.tipo === "preventivo" ? "Preventivo" : "Correctivo"}</span>
        </div>
        <div class="mant-row-sub">${esc(subSerie)}</div>
        <div class="mant-row-sub">${esc(prog)}</div>
        <div class="mant-row-sub">${esc(reprog)}</div>
        ${m.fechaReal ? `<div class="mant-row-sub">Real: ${esc(fmtDate(m.fechaReal))}</div>` : ""}
        ${m.obs ? `<div class="mant-row-sub">${esc(m.obs)}</div>` : ""}
        ${m.tareas && m.tareas.length ? `<div class="mant-chips">${m.tareas.map((t) => `<span class="mant-chip">✓ ${esc(t)}</span>`).join("")}</div>` : ""}
        ${puedeEditar() ? `<div class="mant-row-actions">
          <button class="btn btn-ghost" data-edit-mant="${m.id}">Editar</button>
          <button class="btn btn-ghost" data-del-mant="${m.id}" style="color:var(--danger)">Eliminar</button>
        </div>` : ""}
      </div>`;
    }).join("");
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
    syncSubir();
  }

  // ============================================================
  //  ALERTAS
  // ============================================================
  function renderAlertas() {
    const vencidos = alertTab === "vencidos";
    const dias = parseInt($("#filterAlertaTipo").value || "30", 10);
    const busqueda = ($("#searchAlerta").value || "").trim().toLowerCase();
    let list = equipos
      .filter(esVisibleEquipo)
      .map((e) => ({ eq: e, st: statusOf(e) }))
      .filter((x) => {
        if (vencidos) return x.st.key === "vencido";
        // Proximos: filtrar por dias
        if (x.st.key !== "proximo") return false;
        return x.st.days <= dias;
      })
      .filter((x) => {
        // Buscar por usuario asignado, serie y hostname
        if (!busqueda) return true;
        const usuario = (x.eq.usuarioAsignado || x.eq.responsable || "").toLowerCase();
        const serie = (x.eq.serie || "").toLowerCase();
        const hostname = (x.eq.hostname || "").toLowerCase();
        return usuario.includes(busqueda) || serie.includes(busqueda) || hostname.includes(busqueda);
      })
      .sort((a, b) => (a.st.days > b.st.days ? 1 : -1));
    const tipoLabel = vencidos ? "Vencidos" : "Próximos " + dias + " días";
    $("#alertFullList").innerHTML = `
      <div class="alert-counter">${list.length} registro${list.length === 1 ? "" : "s"} ${tipoLabel.toLowerCase()}</div>
      ${list.map(alertHTML).join("")}
    `;
    $("#alertFullEmpty").classList.toggle("hidden", list.length > 0);
    const chip = $("#btnAlertVencidos");
    if (chip) chip.classList.toggle("active", vencidos);
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
      ["Usuario asignado", eq.usuarioAsignado || "—"],
      ["Tipo", tipoLabel(eq.tipo)],
      ["Marca", eq.marca || "—"],
      ["Modelo", eq.modelo || "—"],
      ["No. serie", eq.serie || "—"],
      ["Hostname", eq.hostname || "—"],
      ["Departamento", eq.departamento || "—"],
      ["Área", eq.area || "—"],
      ["Ubicación", eq.ubicacion || "—"],
      ["Intervalo", (eq.intervalo || appConfig.intervalo) + " días"],
      ["Último mant.", fmtDate(eq.fechaUltimoMant)]
    ];
    $("#detalleInfo").innerHTML = cells.map(([l, v]) => `<div class="detail-cell"><label>${l}</label><div>${esc(v)}</div></div>`).join("");

    const canEdit = puedeEditar();
    $("#btnEliminarEquipo").classList.toggle("hidden", !esAdmin());
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
        ${m.tecnico ? `<div class="mant-row-sub item-resp">Responsable de mantenimiento: ${esc(m.tecnico)}</div>` : ""}
        ${m.fechaReal ? `<div class="mant-row-sub">Real: ${esc(fmtDate(m.fechaReal))}</div>` : ""}
        ${m.obs ? `<div class="mant-row-sub">${esc(m.obs)}</div>` : ""}
        ${m.tareas && m.tareas.length ? `<div class="mant-chips">${m.tareas.map((t) => `<span class="mant-chip">✓ ${esc(t)}</span>`).join("")}</div>` : ""}
      </div>`).join("");
    $("#detalleHistEmpty").classList.toggle("hidden", hist.length > 0);
    // El formato solo se habilita si el último mantenimiento está finalizado.
    const formatoOk = hist.length > 0 && esFinalizado(hist[0]);
    $("#btnFormato").disabled = !formatoOk;
    $("#btnEliminarEquipo").onclick = () => eliminarEquipo(id);
    $("#btnEditarEquipo").onclick = () => { closeModal("modalDetalle"); openEquipoModal(eq); };
    $("#btnFormato").onclick = () => { closeModal("modalDetalle"); generarFormato(id); };
    openModal("modalDetalle");
  }

  // ============================================================
  //  FORMATO DE MANTENIMIENTO (TI-F016)
  // ============================================================
  let viewAntesFormato = "dashboard";
  let formatoActual = null;
  const HW_RE = /limpieza de disco|ram|placa|disipador|pasta t|pasta é|fuente|ventilador|cpu|gpu|bater|tarjeta|hardware|cableado|puertos|ssd|hdd|teclado|pantalla|limpieza interna|disco f/i;

  function splitTareas(tareas) {
    const soft = [], hard = [];
    (tareas || []).forEach((t) => {
      if (HW_RE.test(t)) hard.push(t); else soft.push(t);
    });
    return { soft, hard };
  }

  function datosResponsable(nombre) {
    const n = (nombre || "").trim().toLowerCase();
    const u = usuarios.find((x) => (x.nombre || "").toLowerCase() === n)
      || usuarios.find((x) => (x.dni || "") === (nombre || "").trim())
      || usuarios.find((x) => (x.nombre || "").toLowerCase().includes(n) || n.includes((x.nombre || "").toLowerCase()));
    return u ? { nombre: u.nombre, dni: u.dni || "" } : { nombre: nombre || "", dni: "" };
  }

  function generarFormato(id) {
    const eq = equipos.find((x) => x.id === id);
    if (!eq || !esVisibleEquipo(eq)) { toast("Equipo no encontrado", "err"); return; }
    const resp = datosResponsable(eq.usuarioAsignado || eq.responsable);
    const mants = mantenimientos
      .filter((m) => m.equipoId === id)
      .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
    const m = mants[0];
    const { soft, hard } = splitTareas(m ? m.tareas : []);
    const d = {
      eq, resp, m,
      fechaMant: m ? fmtDate(m.fechaReal || m.fecha) : fmtDate(todayISO()),
      centro: eq.ubicacion || eq.departamento || "—",
      area: eq.area || eq.departamento || "—",
      tec: sesion ? sesion.nombre : "—",
      soft, hard
    };
    formatoActual = d;
    renderFormatoHTML();
    viewAntesFormato = currentView;
    $$(".view").forEach((v) => v.classList.add("hidden"));
    $("#view-formato").classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderFormatoHTML() {
    const d = formatoActual;
    if (!d) return;
    const field = (l, v) => `<tr><td class="f-label">${l}</td><td>${esc(v || "")}</td></tr>`;
    const items = (arr) => arr.length
      ? arr.map((t) => `<div class="f-item">• ${esc(t)}</div>`).join("")
      : `<div class="f-item">—</div>`;
    const serieCi = [d.eq.serie, d.eq.codInventario].filter(Boolean).join(" - ");
    const empresa = appConfig.empresa && appConfig.empresa !== "Empresa" ? appConfig.empresa : CFG.APP_NAME;
    $("#formatoContenido").innerHTML = `
      <div class="formato-intro"><b>${esc(empresa)}</b> — Estimado colaborador, En cumplimiento con el Sistema de Gestión de Calidad (SGC), adjuntamos el Formato de Mantenimiento a equipos de computo para su revisión y conformidad. <b>TI-F016</b></div>
      <div class="formato-head">
        <div class="formato-title">FORMATO DE MANTENIMIENTO</div>
        <div class="formato-meta">
          <span>Código: <b>TI-F016</b></span>
          <span>Versión: <b>04</b></span>
          <span>Fecha de Aprobación: <b>22/09/2025</b></span>
        </div>
      </div>
      <table class="formato-fields">
        ${field("NOMBRES", d.eq.usuarioAsignado)}
        ${field("ÁREA", d.area)}
        ${field("CARGO", d.eq.cargo)}
        ${field("DNI", d.eq.dni || d.resp.dni)}
        ${field("UNIDAD DE PRODUCCIÓN", d.eq.ubicacion)}
        ${field("SERIE/CI", serieCi)}
        ${field("RESPONSABLE DE TI", d.tec)}
        ${field("FECHA DE MANTENIMIENTO", d.fechaMant)}
      </table>
      <div class="formato-act">
        <h4>ACTIVIDADES REALIZADAS:</h4>
        <p>A continuación, se detallan los mantenimientos:</p>
        <h5>Mantenimiento de Software</h5>
        ${items(d.soft)}
        <h5>Mantenimiento de Hardware</h5>
        ${items(d.hard)}
      </div>
      <div class="formato-obs">
        <h4>Observaciones:</h4>
        <p>${esc(d.m ? d.m.obs : "")}&nbsp;</p>
      </div>
      <div class="formato-cierre">
        Mediante el presente correo se deja constancia de su aprobación del formato.<br />
        Agradecemos su colaboración.<br />
        Saludos cordiales.
      </div>`;
  }

  function formatoTexto() {
    const d = formatoActual;
    if (!d) return "";
    const empresa = appConfig.empresa && appConfig.empresa !== "Empresa" ? appConfig.empresa : CFG.APP_NAME;
    const items = (arr) => arr.length ? arr.map((t) => "• " + t).join("\n") : "—";
    const serieCi = [d.eq.serie, d.eq.codInventario].filter(Boolean).join(" - ");
    return [
      empresa,
      "",
      "Estimado colaborador, En cumplimiento con el Sistema de Gestión de Calidad (SGC), adjuntamos el Formato de Mantenimiento a equipos de computo para su revisión y conformidad. TI-F016",
      "",
      "FORMATO DE MANTENIMIENTO",
      "Código: TI-F016 /Versión: 04 /Fecha de Aprobación: 22/09/2025",
      "",
      "NOMBRES: " + (d.eq.usuarioAsignado || ""),
      "ÁREA: " + (d.area || ""),
      "CARGO: " + (d.eq.cargo || ""),
      "DNI: " + (d.eq.dni || d.resp.dni || ""),
      "UNIDAD DE PRODUCCIÓN: " + (d.eq.ubicacion || ""),
      "SERIE/CI: " + (serieCi || ""),
      "",
      "RESPONSABLE DE TI: " + (d.tec || ""),
      "FECHA DE MANTENIMIENTO: " + d.fechaMant,
      "",
      "ACTIVIDADES REALIZADAS:",
      "A continuación, se detallan los mantenimientos:",
      "",
      "Mantenimiento de Software",
      items(d.soft),
      "",
      "Mantenimiento de Hardware",
      items(d.hard),
      "",
      "Observaciones:",
      d.m ? d.m.obs : "",
      "",
      "Mediante el presente correo se deja constancia de su aprobación del formato.",
      "Agradecemos su colaboración.",
      "Saludos cordiales."
    ].join("\n");
  }

  async function enviarFormato() {
    const texto = formatoTexto();
    if (!texto) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Formato de mantenimiento", text: texto });
        return;
      }
    } catch (e) { /* el usuario canceló el share */ }
    const wa = "https://wa.me/?text=" + encodeURIComponent(texto);
    window.open(wa, "_blank");
  }

  function imprimirFormato() {
    document.body.classList.add("imprimiendo");
    window.print();
    document.body.classList.remove("imprimiendo");
  }

  // Genera un PDF del formato TI-F016 con diseño corporativo (jsPDF bajo demanda).
  async function generarPDF() {
    const d = formatoActual;
    if (!d) return;
    let jsPDF;
    try {
      if (window.jspdf) {
        jsPDF = window.jspdf.jsPDF;
      } else {
        await new Promise((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
          s.onload = resolve;
          s.onerror = () => reject(new Error("No se pudo cargar jsPDF"));
          document.head.appendChild(s);
        });
        jsPDF = window.jspdf.jsPDF;
      }
    } catch (e) {
      toast("Sin conexión a internet para generar PDF", "err");
      return;
    }
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 10;
    const contentW = pageW - margin * 2;
    let y = margin;
    const lineH = 4.5;
    const ensureSpace = (need) => { if (y + need > pageH - margin) { doc.addPage(); y = margin; } };

    // ======== ENCABEZADO CORPORATIVO ========
    const hdrH = 60;
    ensureSpace(hdrH + 5);
    const x0 = margin;
    // Columnas: 1=logo(18%), 2=titulo(40%), 3=codigo(17%), 4=fecha+CC(25%)
    const c1 = contentW * 0.18, c2 = contentW * 0.40, c3 = contentW * 0.17, c4 = contentW * 0.25;
    doc.setDrawColor(60); doc.setLineWidth(0.3);
    doc.rect(x0, y, contentW, hdrH);
    doc.line(x0 + c1, y, x0 + c1, y + hdrH);
    doc.line(x0 + c1 + c2, y, x0 + c1 + c2, y + hdrH);
    doc.line(x0 + c1 + c2 + c3, y, x0 + c1 + c2 + c3, y + hdrH);

    // Col 1: Logo al 90% de la celda (ancho y alto), centrado
    const logoB64 = getLogoData();
    const logoW = (c1 - 4) * 0.9; // 90% del ancho de la celda
    const logoH = (hdrH - 4) * 0.9; // 90% de la altura de la celda
    const logoX = x0 + (c1 - logoW) / 2;
    const logoY = y + (hdrH - logoH) / 2;
    if (logoB64) {
      try {
        doc.addImage(logoB64, "PNG", logoX, logoY, logoW, logoH);
      } catch (e) {
        drawLogoPlaceholder(doc, x0 + c1 / 2, y + hdrH / 2, Math.min(logoW, logoH) / 2);
      }
    } else {
      drawLogoPlaceholder(doc, x0 + c1 / 2, y + hdrH / 2, Math.min(logoW, logoH) / 2);
    }

    // Col 2: Titulo en 1 linea, centrado vertical y horizontal
    doc.setTextColor(0); doc.setFontSize(13); doc.setFont(undefined, "bold");
    const titleX = x0 + c1 + c2 / 2;
    doc.text("FORMATO DE MANTENIMIENTO", titleX, y + hdrH / 2 + 4, { align: "center" });

    // Col 3: 2 lineas (Codigo en negrita, sin caracteres raros)
    doc.setFontSize(8); doc.setFont(undefined, "bold");
    const l3 = hdrH / 3;
    doc.text("C\u00f3digo: TI-F016", x0 + c1 + c2 + 3, y + l3);
    doc.setFont(undefined, "normal");
    doc.text("Versi\u00f3n: 02", x0 + c1 + c2 + 3, y + l3 * 2);

    // Col 4: Fecha + N°CC (con interlineado)
    const c4x = x0 + c1 + c2 + c3;
    doc.line(c4x, y + hdrH / 2, c4x + c4, y + hdrH / 2);
    // Parte superior - Fecha
    doc.setFontSize(7); doc.setFont(undefined, "bold");
    doc.text("Fecha de Aprobacion:", c4x + 2, y + hdrH / 4 - 2);
    doc.setDrawColor(150); doc.setLineWidth(0.2);
    doc.rect(c4x + 2, y + hdrH / 4 + 1, c4 - 4, 5);
    doc.setFontSize(7.5); doc.setFont(undefined, "normal");
    doc.text("01/03/2023", c4x + c4 / 2, y + hdrH / 4 + 4.5, { align: "center" });
    // Parte inferior - N°CC
    const nccY = y + hdrH / 2 + 3, nccW = c4 - 4, nccH = 8;
    doc.setDrawColor(60); doc.setLineWidth(0.3);
    doc.rect(c4x + 2, nccY, nccW, nccH);
    doc.setFontSize(7); doc.setFont(undefined, "bold");
    doc.text("N\u00b0 CC:", c4x + 3, nccY + 5.5);
    y += hdrH + 5;

    // 2 saltos de linea despues de la cabecera
    y += lineH * 2;

    // ======== TABLA DE DATOS ========
    const fields = [
      ["APELLIDOS Y NOMBRES:", d.eq.usuarioAsignado || "-"],
      ["DNI:", d.eq.dni || d.resp.dni || "-"],
      ["CARGO:", d.eq.cargo || "-"],
      ["ÁREA:", d.area || "-"],
      ["FECHA DE MANTENIMIENTO:", d.fechaMant || "-"],
      ["SERIE/CI:", [d.eq.serie, d.eq.codInventario].filter(Boolean).join(" - ") || "-"],
      ["UNIDAD DE PRODUCCIÓN:", d.eq.ubicacion || "-"],
      ["RESPONSABLE DE TI:", d.tec || "-"],
    ];
    const col1W = contentW * 0.42, rowH = 7.5;
    const tblH = fields.length * rowH;
    ensureSpace(tblH + 5);
    doc.setDrawColor(60); doc.setLineWidth(0.3);
    doc.rect(margin, y, contentW, tblH);
    doc.line(margin + col1W, y, margin + col1W, y + tblH);
    for (let i = 0; i < fields.length; i++) {
      const ry = y + i * rowH;
      if (i > 0) doc.line(margin, ry, margin + contentW, ry);
      doc.setFontSize(8.5); doc.setFont(undefined, "bold");
      doc.text(fields[i][0], margin + 2, ry + 5.5);
      doc.setFont(undefined, "normal");
      doc.text(String(fields[i][1]), margin + col1W + 2, ry + 5.5);
    }
    y += tblH + 5;

    // ======== ACTIVIDADES REALIZADAS ========
    ensureSpace(lineH + 2);
    doc.setFontSize(11); doc.setFont(undefined, "bold");
    doc.text("Actividades Realizadas:", margin, y); y += lineH + 1;
    doc.setFontSize(9); doc.setFont(undefined, "normal");
    doc.text("A continuación, se detallan los mantenimientos:", margin, y); y += lineH + 2;

    const printSection = (title, arr) => {
      y += lineH; // 1 salto de linea antes de cada seccion
      ensureSpace(lineH + 3);
      // Fondo gris claro para el titulo
      doc.setFillColor(235, 235, 235);
      doc.rect(margin, y - 3.5, contentW, lineH + 1, "F");
      doc.setFontSize(9); doc.setFont(undefined, "bold");
      doc.setTextColor(0);
      doc.text(title, margin + 2, y);
      y += lineH + 1;
      // Lista con viñetas
      doc.setFont(undefined, "normal");
      if (!arr || !arr.length) {
        doc.text("-", margin + 4, y); y += lineH;
      } else {
        for (const t of arr) {
          ensureSpace(lineH);
          const l = doc.splitTextToSize("• " + t, contentW - 10);
          doc.text(l, margin + 4, y); y += l.length * lineH;
        }
      }
      y += 2;
    };
    printSection("Mantenimiento de Software", d.soft);
    printSection("Mantenimiento de Hardware", d.hard);

    // ======== FOOTER ========
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      const pageH = doc.internal.pageSize.getHeight();
      const footerY = pageH - 12;
      // Linea separadora
      doc.setDrawColor(150); doc.setLineWidth(0.2);
      doc.line(margin, footerY - 4, margin + contentW, footerY - 4);
      // Texto 1 linea antes del fin del documento
      doc.setFontSize(7); doc.setFont(undefined, "normal"); doc.setTextColor(120);
      const finalY = pageH - margin - 4;
      doc.text("La aceptacion de esta acta se formaliza mediante la firma ya sea digital o fisica., o a traves de la confirmacion del usuario por medio del correo de texto", margin + contentW / 2, finalY, { align: "center" });
    }

    doc.save("Formato_TI-F016_" + (d.eq.serie || d.eq.nombre || "mantenimiento") + ".pdf");
    toast("PDF generado", "ok");
  }

  // Placeholder del logo (circulos de colores)
  function drawLogoPlaceholder(doc, cx, cy, r) {
    doc.setFillColor(220, 60, 60); doc.circle(cx, cy, r, "F");
    doc.setFillColor(240, 140, 40); doc.circle(cx + 3, cy, r, "F");
    doc.setFillColor(60, 100, 200); doc.circle(cx - 3, cy, r, "F");
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
    const cu = $("#miCuentaInfo");
    if (cu) cu.textContent = sesion ? `Sesión: ${sesion.nombre} · ${rolNombre(sesion.rol)}` : "Sin sesión";
    const info = $("#acercaInfo");
    if (info) {
      const ua = (navigator.userAgent || "").replace(/Chrom\w*\/(\d+)\.[\d.]+.*/i, "…Chromium/$1");
      info.textContent = "Almacenamiento: " + (window.__STORAGE_OK__ ? "funcionando ✓" : "NO disponible ⚠") + " · " + ua.slice(0, 90);
    }
    const admin = esAdmin();
    const edicion = puedeEditar();
    $("#cardEmpresa").classList.toggle("hidden", !admin);
    $("#cardAuditoria").classList.toggle("hidden", !admin);
    $("#btnNuevoUsuario").classList.toggle("hidden", !admin);
    $("#cardProgramacion").classList.toggle("hidden", !admin);
    $("#cardCorreo").classList.toggle("hidden", !edicion);
    $("#cardMant2026").classList.toggle("hidden", !admin);
    $("#cardDatos").classList.toggle("hidden", !admin);
    if (admin) {
      renderFeriados();
    }
    if (edicion) {
      renderCorreo();
    }
    renderUsuarios();
    if (admin) renderAuditoria();
  }

  // ---------------- Usuarios y permisos ----------------
  function renderUsuarios() {
    const admin = esAdmin();
    if (!admin) {
      $("#usuariosList").innerHTML = `<p class="card-text">Solo el administrador ve la lista de usuarios.</p>`;
      return;
    }
    $("#usuariosList").innerHTML = usuarios.map((u) => {
      const controls = admin
        ? `<select class="input select user-rol" data-usuario="${esc(u.id)}">
             <option value="0" ${u.rol === 0 ? "selected" : ""}>Lectura</option>
             <option value="1" ${u.rol === 1 ? "selected" : ""}>Edición</option>
             <option value="2" ${u.rol === 2 ? "selected" : ""}>Administrador</option>
           </select>
           <button class="btn btn-ghost" data-edit-usuario="${esc(u.id)}">Editar</button>`
        : `<span class="badge ok">${esc(rolNombre(u.rol))}</span>`;
      return `
      <div class="user-row">
        <div class="user-info">
          <div class="user-name">${esc(u.nombre)}</div>
          <div class="user-sub">DNI: ${esc(u.dni)}</div>
        </div>
        ${controls}
      </div>`;
    }).join("");
  }

  function openUsuarioModal(u) {
    usuarioPerfilMode = false;
    $("#modalUsuarioTitle").textContent = u ? "Editar usuario" : "Nuevo usuario";
    $("#usId").value = u ? u.id : "";
    $("#usNombre").value = u ? u.nombre : "";
    $("#usDni").value = u ? (u.dni || "") : "";
    $("#usClave").value = u ? (u.clave || "") : "";
    $("#usRol").value = u ? String(u.rol) : "1";
    $("#btnEliminarUsuario").classList.toggle("hidden", !u);
    $("#usRolLabel").classList.remove("hidden");
    $("#usRol").classList.remove("hidden");
    openModal("modalUsuario");
  }

  function openMiPerfil() {
    if (!sesion) return;
    usuarioPerfilMode = true;
    const u = usuarios.find((x) => x.id === sesion.id) || sesion;
    $("#modalUsuarioTitle").textContent = "Mi perfil";
    $("#usId").value = u.id;
    $("#usNombre").value = u.nombre || "";
    $("#usDni").value = u.dni || "";
    $("#usClave").value = "";
    $("#usRol").value = String(u.rol != null ? u.rol : sesion.rol);
    $("#btnEliminarUsuario").classList.add("hidden");
    $("#usRolLabel").classList.add("hidden");
    $("#usRol").classList.add("hidden");
    openModal("modalUsuario");
  }

  async function saveUsuario() {
    const perfil = usuarioPerfilMode;
    if (!perfil && !esAdmin()) return toast("Solo el administrador", "err");
    const nombre = $("#usNombre").value.trim();
    const dni = $("#usDni").value.trim();
    if (!nombre || !dni) return toast("Nombre y DNI son obligatorios", "err");
    const id = $("#usId").value;
    const clave = $("#usClave").value.trim();
    const prev = usuarios.find((x) => x.id === id) || {};
    const rol = perfil
      ? (prev.rol != null ? prev.rol : sesion.rol)
      : parseInt($("#usRol").value, 10);
    if (!perfil && id === sesion.id && rol !== ROL.ADMIN) {
      return toast("No puedes quitarte el permiso de administrador a ti mismo", "err");
    }
    if (usuarios.some((x) => x.id !== id && x.dni === dni)) {
      return toast("Ya existe un usuario con ese DNI", "err");
    }
    const u = {
      id: id || "us-" + Date.now(),
      nombre,
      dni,
      clave: clave || prev.clave || (perfil ? sesion.clave : dni) || dni,
      rol,
      fechaAlta: prev.fechaAlta || todayISO()
    };
    await DB.putUsuario(u);
    if (id) {
      const i = usuarios.findIndex((x) => x.id === id);
      if (i >= 0) usuarios[i] = u;
    } else {
      usuarios.push(u);
    }
    if (perfil && id === sesion.id) {
      sesion.nombre = u.nombre;
      sesion.dni = u.dni;
      sesion.clave = u.clave;
      await DB.setSesion(sesion);
    }
    closeModal("modalUsuario");
    usuarioPerfilMode = false;
    toast(perfil ? "Perfil actualizado" : "Usuario guardado", "ok");
    auditar(perfil ? "MI PERFIL" : (id ? "EDICION USUARIO" : "ALTA USUARIO"),
      "Nombre: " + nombre + " · Permiso: " + rolNombre(rol));
    renderUsuarios();
    renderConfig();
    syncSubir();
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
    syncSubir();
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
    syncSubir();
  }

  // ---------------- Feriados y programación ----------------
  function renderFeriados() {
    const list = $("#feriadosList");
    if (!list) return;
    if (!feriados.length) {
      list.innerHTML = `<p class="card-text">Sin feriados registrados.</p>`;
      return;
    }
    list.innerHTML = feriados
      .slice()
      .sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
      .map((f) => `
      <div class="user-row">
        <div class="user-info">
          <div class="user-name">📅 ${esc(fmtDate(f.fecha))}</div>
          <div class="user-sub">${esc(f.motivo || "")}</div>
        </div>
        <button class="btn btn-ghost" data-del-feriado="${esc(f.id)}">Eliminar</button>
      </div>`).join("");
  }

  async function agregarFeriado() {
    if (!esAdmin()) return toast("Solo el administrador", "err");
    const fecha = $("#fdFecha").value;
    if (!fecha) return toast("Selecciona la fecha del feriado", "err");
    const motivo = $("#fdMotivo").value.trim();
    const prev = feriados.find((x) => x.fecha === fecha);
    const f = { id: prev ? prev.id : "fd-" + Date.now(), fecha, motivo };
    if (prev) {
      const i = feriados.findIndex((x) => x.id === prev.id);
      feriados[i] = f;
    } else {
      feriados.push(f);
    }
    await DB.put("feriados", f);
    $("#fdFecha").value = "";
    $("#fdMotivo").value = "";
    toast("Feriado registrado", "ok");
    auditar("ALTA FERIADO", fmtDate(fecha) + (motivo ? " · " + motivo : ""));
    renderFeriados();
    syncSubir();
  }

  async function eliminarFeriado(id) {
    const f = feriados.find((x) => x.id === id);
    await DB.delete("feriados", id);
    feriados = feriados.filter((x) => x.id !== id);
    toast("Feriado eliminado");
    auditar("BAJA FERIADO", f ? fmtDate(f.fecha) : id);
    renderFeriados();
    syncSubir();
  }

  // Día laboral: lunes-viernes y que no esté registrado como feriado.
  function fechaLaboral(iso) {
    let d = iso;
    for (let i = 0; i < 400; i++) {
      const dow = parseISO(d).getDay(); // 0=Domingo ... 6=Sábado
      if (dow >= 1 && dow <= 5 && !feriados.some((f) => f.fecha === d)) return d;
      d = addDays(d, 1);
    }
    return iso;
  }

  // Asigna la fecha programada al mantenimiento pendiente del equipo (o crea uno nuevo).
  async function programarEquipo(equipoId, fecha) {
    const mants = mantenimientos
      .filter((m) => m.equipoId === equipoId)
      .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
    const pend = mants.find((m) => !m.fechaReal && (m.estado === "programado" || m.estado === "reprogramado"));
    if (pend) {
      pend.fecha = fecha;
      pend.fechaReprogramada = "";
      pend.estado = "programado";
      const i = mantenimientos.findIndex((x) => x.id === pend.id);
      if (i >= 0) mantenimientos[i] = pend;
      await DB.put("mantenimientos", pend);
    } else {
      const nm = {
        id: "mt-" + Date.now() + "-" + Math.floor(Math.random() * 1e5),
        equipoId,
        fecha,
        tipo: "preventivo",
        estado: "programado",
        prioridad: "",
        fechaReprogramada: "",
        fechaReal: "",
        tecnico: "",
        costo: 0,
        proxima: "",
        obs: "",
        tareas: []
      };
      mantenimientos.push(nm);
      await DB.put("mantenimientos", nm);
    }
  }

  async function programarMantenimientos() {
    if (!esAdmin()) return toast("Solo el administrador", "err");
    const inicial = $("#progFechaInicial").value;
    if (!inicial) return toast("Selecciona la fecha inicial", "err");
    if (!confirm("Se reprogramarán los mantenimientos pendientes de todos los equipos desde " + fmtDate(inicial) +
      " (solo días laborales lun-vie sin feriados, con 3 equipos por día y por responsable). ¿Continuar?")) return;

    const porUsuario = new Map();
    usuarios.forEach((u) => porUsuario.set(u.id, []));
    equipos.forEach((e) => {
      const usr = (e.usuarioAsignado || e.responsable || "").trim();
      const u = usuarios.find((x) =>
        (x.nombre || "").trim().toLowerCase() === usr.toLowerCase() ||
        (x.dni || "").trim().toLowerCase() === usr.toLowerCase());
      if (u) porUsuario.get(u.id).push(e);
    });

    let total = 0;
    for (const grupo of porUsuario.values()) {
      if (!grupo.length) continue;
      grupo.sort((a, b) => ((a.hostname || "") + " " + (a.serie || ""))
        .localeCompare((b.hostname || "") + " " + (b.serie || "")));
      let dia = fechaLaboral(inicial);
      let count = 0;
      for (const e of grupo) {
        if (count === 3) {
          dia = fechaLaboral(addDays(dia, 1));
          count = 0;
        }
        await programarEquipo(e.id, dia);
        count++;
        total++;
      }
    }

    mantenimientos = await DB.getAll("mantenimientos");
    toast("Mantenimientos programados: " + total, "ok");
    auditar("PROGRAMACION MANTENIMIENTOS", "Desde " + inicial + " · Equipos programados: " + total);
    renderConfig();
    if (currentView === "mantenimientos") renderMantenimientos();
    if (currentView === "alertas") renderAlertas();
    if (currentView === "equipos") renderEquipos();
    syncSubir();
  }

  // ---------------- Correo de programación por ubicación ----------------
  // Ordena los equipos por fecha programada y luego por usuario asignado.
  function correoEquipos(ubic) {
    return equiposVisibles()
      .filter((e) => !ubic || (e.ubicacion || "").trim() === ubic)
      .sort((a, b) => {
        const fa = proximoMantDe(a) || "9999";
        const fb = proximoMantDe(b) || "9999";
        if (fa !== fb) return fa < fb ? -1 : 1;
        const ua = (a.usuarioAsignado || "").trim();
        const ub = (b.usuarioAsignado || "").trim();
        return ua.localeCompare(ub) || ((a.hostname || "") + (a.serie || "")).localeCompare((b.hostname || "") + (b.serie || ""));
      });
  }

  // Fecha efectiva del próximo mantenimiento pendiente del equipo.
  function proximoMantDe(eq) {
    const ms = mantenimientos
      .filter((m) => m.equipoId === eq.id && !esFinalizado(m))
      .map((m) => m.fechaReprogramada || m.fecha)
      .filter(Boolean)
      .sort();
    return ms[0] || nextDueDate(eq);
  }

  function renderCorreo() {
    const sel = $("#correoUbicacion");
    if (!sel) return;
    const cur = sel.value;
    const ubics = [...new Set(equiposVisibles()
      .map((e) => (e.ubicacion || "").trim())
      .filter(Boolean))].sort();
    sel.innerHTML = `<option value="">Todas las ubicaciones</option>` +
      ubics.map((u) => `<option value="${esc(u)}">${esc(u)}</option>`).join("");
    if (ubics.includes(cur)) sel.value = cur;
    const eqs = correoEquipos(sel.value);
    $("#correoTbody").innerHTML = eqs.length
      ? eqs.map((e) => `
        <tr>
          <td>${esc((e.usuarioAsignado || "").trim() || "—")}</td>
          <td>${esc((e.ubicacion || "").trim() || "—")}</td>
          <td>${esc(fmtDate(proximoMantDe(e)))}</td>
        </tr>`).join("")
      : `<tr><td colspan="3" class="empty-cell">Sin equipos en esta ubicación.</td></tr>`;
  }

  function detalleTextoCorreo() {
    const eqs = correoEquipos($("#correoUbicacion").value);
    const filas = [["USUARIO ASIGNADO", "UBICACIÓN", "FECHA PROGRAMADA"]];
    eqs.forEach((e) => filas.push([
      (e.usuarioAsignado || "").trim() || "—",
      (e.ubicacion || "").trim() || "—",
      fmtDate(proximoMantDe(e))
    ]));
    const anchos = [0, 0, 0, 0];
    filas.forEach((f) => f.forEach((c, i) => { if (c.length > anchos[i]) anchos[i] = c.length; }));
    return filas.map((f) => f.map((c, i) => c.padEnd(anchos[i])).join(" | ")).join("\n");
  }

  function enviarCorreo() {
    if (!puedeEditar()) return toast("Tu permiso es de solo lectura", "err");
    const eqs = correoEquipos($("#correoUbicacion").value);
    const emails = [...new Set(eqs.map((e) => (e.email || "").trim()).filter(Boolean))].join(",");
    if (!emails) return toast("No hay correos registrados en la ubicación seleccionada", "err");
    const asunto = $("#correoAsunto").value.trim() || "Programación de Mantenimiento de Equipos de Computo";
    const cuerpo = $("#correoCuerpo").value.trim();
    const detalle = detalleTextoCorreo();
    const marker = "Detalle de equipos programados:";
    let body;
    const idx = cuerpo.indexOf(marker);
    if (idx >= 0) {
      body = cuerpo.slice(0, idx + marker.length) + "\n\n" + detalle + cuerpo.slice(idx + marker.length);
    } else {
      body = (cuerpo ? cuerpo + "\n\n" : "") + marker + "\n\n" + detalle;
    }
    window.location.href = "mailto:" + emails + "?subject=" + encodeURIComponent(asunto) +
      "&body=" + encodeURIComponent(body);
    auditar("ENVIAR CORREO PROGRAMACION", "Ubicación: " + ($("#correoUbicacion").value || "Todas") + " · Equipos: " + eqs.length);
    toast("Abriendo el correo...", "ok");
  }

  // ---------------- Export / Import ----------------
  function buildRespaldo() {
    return {
      app: CFG.APP_NAME,
      version: CFG.APP_VERSION,
      exportado: now(),
      config: appConfig,
      usuarios,
      equipos,
      mantenimientos,
      feriados
    };
  }

  function descargarJSON(obj, nombre) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function exportData() {
    if (!puedeEditar()) return toast("Tu permiso es de solo lectura", "err");
    descargarJSON(buildRespaldo(), "respaldo-mantenimiento-" + todayISO() + ".json");
    toast("Copia de seguridad descargada", "ok");
    auditar("EXPORTAR DATOS", "Respaldo descargado");
  }

  // Exporta con el mismo formato JSON que usa la app móvil (APK), para poder
  // importar dentro del APK los datos registrados en la web.
  function buildApkPayload() {
    const indiceUsuario = (e) => {
      let i = e.dni ? usuarios.findIndex((u) => u.dni && keyOf(u.dni) === keyOf(e.dni)) : -1;
      if (i < 0) i = usuarios.findIndex((u) => u.nombre && e.responsable && keyOf(u.nombre) === keyOf(e.responsable));
      return i + 1;
    };
    const uss = usuarios.map((u, i) => ({
      id: i + 1,
      nombre: u.nombre || "",
      subdivision: u.subdivision || "",
      dni: u.dni || "",
      ceco: u.ceco || "",
      area: u.area || "",
      cargo: u.cargo || "",
      email: u.email || "",
      zona: u.zona || "",
      clave: u.clave || u.dni || "",
      rol: typeof u.rol === "number" ? u.rol : ROL.EDICION
    }));
    const eqs = equipos.map((e, i) => ({
      id: i + 1,
      usuario_id: indiceUsuario(e),
      hostname: e.hostname || "",
      ip: e.ip || "",
      ubicacion: e.ubicacion || "",
      equipo: e.nombre || e.serie || "",
      cod_inventario: e.codInventario || "",
      serie: e.serie || "",
      marca: e.marca || "",
      modelo: e.modelo || "",
      contrato: e.contrato || "",
      status: e.status || "",
      usuario_asignado: e.usuarioAsignado || "",
      area: e.area || "",
      cargo: e.cargo || "",
      dni: e.dni || ""
    }));
    const eqIndex = new Map(equipos.map((e, i) => [String(e.id), i + 1]));
    const mts = mantenimientos.map((m, i) => ({
      id: i + 1,
      equipo_id: eqIndex.get(String(m.equipoId)) || 0,
      prioridad: m.prioridad || "",
      fecha_programada: m.fecha || "",
      fecha_reprogramada: m.fechaReprogramada || "",
      fecha_real: m.fechaReal || "",
      estado: m.estado || "",
      actividades: Array.isArray(m.tareas) ? m.tareas.join("; ") : (m.actividades || ""),
      proxima: m.proxima || "",
      observaciones: m.obs || "",
      finalizado_en: m.finalizadoEn || (m.estado === "finalizado" ? (m.fechaReal || "") : "")
    }));
    const fds = feriados.map((f, i) => ({ id: i + 1, fecha: f.fecha || "", motivo: f.motivo || "" }));
    return {
      app: "Inventario de equipos",
      version: 4,
      exported: todayISO(),
      usuarios: uss,
      equipos: eqs,
      mantenimientos: mts,
      feriados: fds
    };
  }

  function exportApk() {
    if (!puedeEditar()) return toast("Tu permiso es de solo lectura", "err");
    descargarJSON(buildApkPayload(), "respaldo-para-apk-" + todayISO() + ".json");
    toast("Respaldo para APK descargado", "ok");
    auditar("EXPORTAR DATOS PARA APK", "Respaldo compatible con la app móvil");
  }

  // ---------------- Exportar a Excel (XLSX) ----------------
  const EXCEL_HEADER = [
    "NOMBRE Y APELLIDOS", "DNI", "ZONA", "SUBDIVISION", "AREA", "CARGO",
    "NEW HOSTNAME", "UBICACIÓN FISICA", "SERIE DE EQUIPO", "EQUIPO", "MARCA", "MODELO",
    "USUARIO ASIGNADO", "CORREOS", "CONTRATO", "STATUS", "PRIORIDAD", "OBSERVACIONES",
    "FECHA PROGRAMADO", "FECHA REPROGRAMADA", "FECHA REAL", "ESTADO"
  ];

  function fmtFechaLarga(iso) {
    if (!iso) return "";
    try {
      return parseISO(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
    } catch (e) {
      return String(iso);
    }
  }

  function estadoExcel(m) {
    const s = String(m.estado || estadoMant(m) || "").toLowerCase();
    if (s === "programado") return "Programado";
    if (s === "reprogramado") return "Reprogramado";
    if (s === "no realizado" || s === "cancelado") return "No realizado";
    return "Finalizado";
  }

  function filaExcel(e, m) {
    const row = new Array(22).fill("");
    if (e) {
      row[0] = e.usuarioAsignado || "";
      row[1] = e.dni || "";
      row[2] = e.zona || e.departamento || "";
      row[3] = e.subdivision || "";
      row[4] = e.area || "";
      row[5] = e.cargo || "";
      row[6] = e.hostname || "";
      row[7] = e.ubicacion || "";
      row[8] = e.serie || "";
      row[9] = e.nombre || "";
      row[10] = e.marca || "";
      row[11] = e.modelo || "";
      row[12] = e.usuarioAsignado || "";
      row[13] = e.email || "";
      row[14] = e.contrato || "";
      row[15] = e.status || "";
    }
    if (m) {
      row[16] = m.prioridad || "";
      row[17] = m.obs || "";
      row[18] = fmtFechaLarga(m.fecha);
      row[19] = fmtFechaLarga(m.fechaReprogramada);
      row[20] = fmtFechaLarga(m.fechaReal);
      row[21] = estadoExcel(m);
    }
    return row;
  }

  async function exportExcel() {
    if (!puedeEditar()) return toast("Tu permiso es de solo lectura", "err");
    if (typeof XLSX === "undefined") {
      toast("Cargando librería de Excel (requiere internet)…");
      try {
        await new Promise((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
          s.onload = resolve;
          s.onerror = () => reject(new Error("No se pudo cargar la librería de Excel"));
          document.head.appendChild(s);
        });
      } catch (e) {
        toast("Sin conexión a internet para exportar a Excel", "err");
        return;
      }
    }
    const aoa = [EXCEL_HEADER.slice()];
    const mants = mantenimientos.slice();
    if (!mants.length) {
      for (const e of equipos) aoa.push(filaExcel(e, null));
    } else {
      for (const m of mants) aoa.push(filaExcel(equipos.find((x) => x.id === m.equipoId) || null, m));
    }
    if (aoa.length === 1) return toast("No hay datos para exportar", "err");
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = EXCEL_HEADER.map((h, i) => {
      let w = h.length;
      for (let r = 1; r < aoa.length && r < 200; r++) {
        const v = String(aoa[r][i] == null ? "" : aoa[r][i]);
        if (v.length > w) w = v.length;
      }
      return { wch: Math.min(w + 2, 40) };
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Mantenimientos");
    XLSX.writeFile(wb, "reporte_mantenimientos.xlsx");
    toast("Excel descargado", "ok");
    auditar("EXPORTAR EXCEL", "Reporte de mantenimientos generado");
  }

  // Convierte un respaldo de la app móvil (APK) al formato de datos de la web.
  function convertirRespaldoApk(d) {
    const uss = Array.isArray(d.usuarios) ? d.usuarios : [];
    const eqs = Array.isArray(d.equipos) ? d.equipos : [];
    const mts = Array.isArray(d.mantenimientos) ? d.mantenimientos : [];
    const fds = Array.isArray(d.feriados) ? d.feriados : [];

    const usuariosWeb = uss.map((u) => ({
      id: "us-" + Date.now() + "-" + Math.floor(Math.random() * 1e5),
      nombre: String(u.nombre || "").trim(),
      dni: String(u.dni == null ? "" : u.dni).trim(),
      clave: String(u.clave == null ? "" : u.clave).trim() || String(u.dni == null ? "" : u.dni).trim(),
      rol: (typeof u.rol === "number" && u.rol >= 0 && u.rol <= 2) ? u.rol : ROL.EDICION,
      fechaAlta: todayISO(),
      zona: String(u.zona || "").trim(),
      subdivision: String(u.subdivision || "").trim(),
      ceco: String(u.ceco || "").trim(),
      area: String(u.area || "").trim(),
      cargo: String(u.cargo || "").trim(),
      email: String(u.email || "").trim()
    }));

    const porUsuarioApk = new Map();
    uss.forEach((u, i) => porUsuarioApk.set(String(u.id), usuariosWeb[i]));

    const equiposWeb = eqs.map((e) => {
      const u = porUsuarioApk.get(String(e.usuario_id)) || null;
      const serie = String(e.serie == null ? "" : e.serie).trim();
      return {
        id: "eq-" + Date.now() + "-" + Math.floor(Math.random() * 1e5),
        nombre: String(e.equipo || "").trim() || serie,
        tipo: "laptop",
        marca: String(e.marca || "").trim(),
        modelo: String(e.modelo || "").trim(),
        serie,
        hostname: String(e.hostname || "").trim(),
        ip: String(e.ip || "").trim(),
        ubicacion: String(e.ubicacion || "").trim(),
        usuarioAsignado: String(e.usuario_asignado || "").trim(),
        responsable: u ? u.nombre : "",
        dni: String(e.dni == null ? "" : e.dni).trim(),
        area: String(e.area || "").trim(),
        cargo: String(e.cargo || "").trim(),
        codInventario: String(e.cod_inventario || "").trim(),
        contrato: String(e.contrato || "").trim(),
        status: String(e.status || "").trim(),
        intervalo: appConfig.intervalo,
        fechaUltimoMant: null,
        fechaAlta: todayISO()
      };
    });

    const porEquipoApk = new Map();
    eqs.forEach((e, i) => porEquipoApk.set(String(e.id), equiposWeb[i]));

    const mantenimientosWeb = mts.map((m) => {
      const eq = porEquipoApk.get(String(m.equipo_id)) || null;
      const act = String(m.actividades || "");
      const tareas = act ? act.split(/[\r\n,;]+/).map((t) => t.trim()).filter(Boolean) : [];
      return {
        id: "mt-" + Date.now() + "-" + Math.floor(Math.random() * 1e5),
        equipoId: eq ? eq.id : "",
        fecha: xlsxToDate(m.fecha_programada),
        tipo: "preventivo",
        estado: estadoNorm(m.estado),
        prioridad: String(m.prioridad || "").trim(),
        fechaReprogramada: xlsxToDate(m.fecha_reprogramada),
        fechaReal: xlsxToDate(m.fecha_real),
        tecnico: "",
        costo: 0,
        proxima: xlsxToDate(m.proxima),
        obs: String(m.observaciones || "").trim(),
        tareas
      };
    });

    const feriadosWeb = fds.map((f) => ({
      id: "fe-" + Date.now() + "-" + Math.floor(Math.random() * 1e5),
      fecha: xlsxToDate(f.fecha),
      motivo: String(f.motivo || "").trim()
    }));

    return { usuarios: usuariosWeb, equipos: equiposWeb, mantenimientos: mantenimientosWeb, feriados: feriadosWeb };
  }

  // Reemplaza TODOS los datos por los del respaldo (igual que la app móvil).
  async function reemplazarDatos(data, esApk) {
    await DB.clear("equipos");
    await DB.clear("mantenimientos");
    await DB.clear("usuarios");
    await DB.clear("feriados");
    if (Array.isArray(data.usuarios) && data.usuarios.length) await DB.bulkPut("usuarios", data.usuarios);
    if (Array.isArray(data.equipos) && data.equipos.length) await DB.bulkPut("equipos", data.equipos);
    if (Array.isArray(data.mantenimientos) && data.mantenimientos.length) await DB.bulkPut("mantenimientos", data.mantenimientos);
    if (Array.isArray(data.feriados) && data.feriados.length) await DB.bulkPut("feriados", data.feriados);
    if (!esApk && data.config) {
      await DB.setConfig("empresa", data.config.empresa || "Empresa");
      await DB.setConfig("intervalo", data.config.intervalo || 90);
    }
  }

  function importData(file) {
    if (!puedeEditar()) return toast("Tu permiso es de solo lectura", "err");
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result);
        const esApk = data.app === "Inventario de equipos" ||
          (Array.isArray(data.usuarios) && data.usuarios.length > 0 && typeof data.usuarios[0].id === "number");
        const datos = esApk ? convertirRespaldoApk(data) : data;
        if (!Array.isArray(datos.equipos) || !Array.isArray(datos.mantenimientos)) throw new Error("bad");
        if (usuarios.length || equipos.length || mantenimientos.length) {
          descargarJSON(buildRespaldo(), "respaldo-antes-de-importar-" + todayISO() + ".json");
        }
        await reemplazarDatos(datos, esApk);
        await auditar("IMPORTAR DATOS", esApk ? "Integración de respaldo APK (base principal)" : "Restauración de respaldo");
        await reload();
        if (sesion && !usuarios.some((u) => u.id === sesion.id)) {
          sesion = null;
          await DB.clearSesion();
          showLogin();
        }
        syncSubir();
        toast("Datos importados correctamente", "ok");
      } catch (e) {
        toast("Archivo de respaldo no válido", "err");
      }
    };
    reader.readAsText(file);
  }

  // ---------------- Sincronización con la nube (Firebase Realtime Database) ----------------
  // La nube guarda los datos en formato APK (ids numéricos), que es el mismo
  // formato que usa la app móvil. Política: gana la última sincronización.
  const SYNC_ENABLED = () => !!(CFG.SYNC_URL && CFG.SYNC_TOKEN);
  const syncNodeUrl = () => CFG.SYNC_URL.replace(/\/+$/, "") + "/" + CFG.SYNC_TOKEN + "/db.json?auth=" + encodeURIComponent(CFG.SYNC_SECRET || "");

  // Sube la base local a la nube.
  async function syncSubir() {
    if (!SYNC_ENABLED() || !navigator.onLine) return;
    try {
      const res = await fetch(syncNodeUrl(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildApkPayload())
      });
      if (!res.ok) throw new Error("http " + res.status);
    } catch (e) { /* sin conexión: se reintenta en la próxima edición */ }
  }

  // Baja la base de la nube y reemplaza la local. Devuelve true si cambió algo.
  async function syncBajar() {
    if (!SYNC_ENABLED() || !navigator.onLine) return false;
    try {
      const res = await fetch(syncNodeUrl());
      if (!res.ok) throw new Error("http " + res.status);
      const data = await res.json();
      if (!data || typeof data !== "object") return false;
      const conDatos = [data.usuarios, data.equipos, data.mantenimientos, data.feriados]
        .some((a) => Array.isArray(a) && a.length > 0);
      if (!conDatos) return false;
      await reemplazarDatos(convertirRespaldoApk(data), true);
      await auditar("SINCRONIZAR", "Datos recibidos desde la nube");
      await reload();
      await ensureAdmin();
      if (sesion && !usuarios.some((u) => u.id === sesion.id)) {
        sesion = null;
        await DB.clearSesion();
        showLogin();
      }
      return true;
    } catch (e) { return false; }
  }

  // Sube la copia local y luego baja la nube (unifica ambos lados).
  async function sincronizarAhora() {
    if (!SYNC_ENABLED()) return toast("Sincronización no configurada", "err");
    if (!navigator.onLine) return toast("Sin conexión a internet", "err");
    toast("Sincronizando…");
    await syncSubir();
    const ok = await syncBajar();
    await auditar("SINCRONIZAR", ok ? "Datos sincronizados con la nube" : "Copia local subida a la nube");
    toast(ok ? "Sincronización completada" : "Datos subidos a la nube", ok ? "ok" : "warn");
  }

  // ---------------- Cargas masivas (Excel) ----------------
  const LIB_XLSX = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
  const COLUMNAS_MASIVA = {
    responsables: "RESPONSABLE (o NOMBRE); DNI; ZONA; SUBDIVISION; CECO SAP; AREA; CARGO; EMAIL; CLAVE",
    equipos: "SERIE DE EQUIPO; USUARIO ASIGNADO; RESPONSABLE; DNI; HOSTNAME; DIR. IP; UBICACIÓN FISICA; EQUIPO; COD. INVENTARIO; MARCA; MODELO; CONTRATO DE ARRENDAMIENTO; STATUS; AREA; CARGO",
    mantenimientos: "SERIE DE EQUIPO; PRIORIDAD; FECHA PROGRAMADA; FECHA REPROGRAMADA; FECHA REAL; ESTADO; OBSERVACIONES; ACTIVIDADES REALIZADAS; PROXIMO MANTENIMIENTO"
  };

  function cargarLibreriaXlsx() {
    if (typeof XLSX !== "undefined") return Promise.resolve();
    toast("Cargando librería de Excel (requiere internet)…");
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = LIB_XLSX;
      s.onload = resolve;
      s.onerror = () => reject(new Error("No se pudo cargar la librería de Excel"));
      document.head.appendChild(s);
    });
  }

  // Devuelve el rango real de celdas con contenido (no confía en el !ref del archivo,
  // que a veces queda desactualizado y hace que solo se lean unas pocas filas).
  function rangoRealHoja(ws) {
    let maxR = -1, maxC = -1;
    for (const k of Object.keys(ws)) {
      if (k[0] === "!") continue;
      const a = XLSX.utils.decode_cell(k);
      if (a.r > maxR) maxR = a.r;
      if (a.c > maxC) maxC = a.c;
    }
    if (maxR < 0) return null;
    return XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxR, c: maxC } });
  }

  // Lee una hoja como filas (arrays) incluyendo celdas vacías.
  function leerHoja(ws) {
    const rango = rangoRealHoja(ws) || ws["!ref"];
    return XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", range: rango });
  }

  // Elige la hoja con los datos: igual que la app móvil, prefiere la PRIMERA hoja del
  // libro que tenga filas y coincida con las columnas esperadas. Si ninguna coincide,
  // devuelve la primera hoja con datos (para que se vean sus columnas).
  function elegirHoja(wb, tipo) {
    const objetivo = COLUMNAS_MASIVA[tipo].split(";")
      .map((s) => s.split("(")[0].trim()).filter(Boolean);
    let primera = null;
    for (const nombre of wb.SheetNames) {
      const aoa = leerHoja(wb.Sheets[nombre]);
      const filas = aoa.filter((r) => Array.isArray(r) &&
        r.some((c) => String(c == null ? "" : c).trim() !== ""));
      if (filas.length < 2) continue;
      if (!primera) primera = { hoja: nombre, filas, score: 0 };
      const headers = (filas[0] || []).map((h) => String(h == null ? "" : h).trim());
      let score = 0;
      for (const t of objetivo) if (findCol(headers, t) >= 0) score++;
      if (score > 0) return { hoja: nombre, filas, score };
    }
    return primera;
  }

  function abrirMasiva(tipo) {
    if (!puedeEditar()) return toast("Tu permiso es de solo lectura", "err");
    const input = $("#fileMasiva");
    input.dataset.tipo = tipo;
    input.click();
  }

  async function procesarMasiva(file, tipo) {
    if (!puedeEditar()) return toast("Tu permiso es de solo lectura", "err");
    const res = $("#masivaResultado");
    res.classList.remove("hidden");
    res.textContent = "Columnas: " + (COLUMNAS_MASIVA[tipo] || "") + "\n\nLeyendo archivo...";
    try {
      await cargarLibreriaXlsx();
    } catch (e) {
      res.textContent += "\nError: " + e.message;
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const wb = XLSX.read(reader.result, { type: "array", cellDates: true });
        const elegida = elegirHoja(wb, tipo);
        if (!elegida) {
          res.textContent += "\nEl archivo no tiene filas con datos.";
          return;
        }
        const filas = elegida.filas;
        const errores = [];
        let r;
        if (tipo === "responsables") r = await importarResponsables(filas, errores);
        else if (tipo === "equipos") r = await importarEquipos(filas, errores);
        else r = await importarMantenimientos(filas, errores);
        await reload();
        let txt = "Importados: " + r[0] + "   ·   Inválidos: " + r[1];
        if (errores.length) txt += "\n\nErrores de validación:\n" + errores.join("\n");
        if (tipo === "equipos" && r[1] > 0) {
          txt += "\n\nResponsables existentes en la web: " +
            (usuarios.map((x) => x.nombre).filter(Boolean).join(", ") || "(ninguno)") +
            ".\nSi no aparecen tus responsables, importa primero el archivo de responsables.";
        }
        res.textContent = "Columnas: " + (COLUMNAS_MASIVA[tipo] || "") +
          "\nHoja: " + elegida.hoja + " · Filas con datos: " + filas.length + "\n\n" + txt;
        if (filas.length < 10) {
          res.textContent += "\n\n¡Ojo! El archivo seleccionado tiene muy pocas filas con datos (" +
            filas.length + "). ¿Elegiste el archivo correcto? El archivo de equipos tiene 808 filas.";
        }
        if (r[0] > 0) {
          toast("Se importaron " + r[0] + " registros", "ok");
          auditar("CARGA MASIVA " + tipo.toUpperCase(), "Importados: " + r[0] + " · Inválidos: " + r[1]);
          syncSubir();
        }
      } catch (e) {
        res.textContent += "\nError: " + e.message;
        toast("No se pudo leer el archivo Excel", "err");
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // Normaliza "SERIE" -> "SERIE", quita acentos, espacios y símbolos, a mayúsculas.
  function keyOf(s) {
    return String(s == null ? "" : s).normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  }

  // Busca una columna por nombre exacto (pass 0) o por prefijo largo (pass 1).
  function findCol(headers, ...names) {
    const targets = names.map((n) => keyOf(n));
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < headers.length; i++) {
        const h = keyOf(headers[i]);
        if (!h) continue;
        for (const t of targets) {
          if (!t) continue;
          if (pass === 0 && h === t) return i;
          if (pass === 1 && t.length >= 4 && h.startsWith(t)) return i;
        }
      }
    }
    return -1;
  }

  const valCelda = (f, col) => (col < 0 || col >= f.length)
    ? "" : String(f[col] == null ? "" : f[col]).trim();

  const esNumero = (s) => /^\d+$/.test(String(s || "").trim());

  function addError(errores, row, motivo) {
    if (errores.length < 12) errores.push("Fila " + (row + 2) + ": " + motivo);
  }

  // Convierte fechas de Excel (serial, Date o texto DD/MM/YYYY) a yyyy-MM-dd.
  function xlsxToDate(v) {
    if (v == null) return "";
    if (v instanceof Date) {
      if (isNaN(v.getTime())) return "";
      const off = v.getTimezoneOffset();
      return new Date(v.getTime() - off * 60000).toISOString().slice(0, 10);
    }
    if (typeof v === "number") {
      if (!isFinite(v) || v <= 0) return "";
      const d = new Date(Math.round((v - 25569) * 86400000));
      return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
    }
    const s = String(v).trim();
    if (!s) return "";
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
      const p = s.split("-");
      return p[0] + "-" + ("0" + p[1]).slice(-2) + "-" + ("0" + p[2]).slice(-2);
    }
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
      const p = s.split("/");
      return p[2] + "-" + ("0" + p[1]).slice(-2) + "-" + ("0" + p[0]).slice(-2);
    }
    return normFecha(s);
  }

  // Normaliza el estado al formato interno de la app (minúsculas), igual que el APK:
  // reprogramado > programado > final > pendiente/en proceso; si no coincide, lo deja tal cual.
  function estadoNorm(s) {
    if (s == null) return "";
    const e = String(s).trim().toLowerCase();
    if (e.indexOf("reprogram") >= 0) return "reprogramado";
    if (e.indexOf("program") >= 0) return "programado";
    if (esEstadoFinal(s)) return "finalizado";
    if (e.indexOf("pendiente") >= 0 || e.indexOf("en proceso") >= 0) return "programado";
    return e;
  }

  // Crea usuarios (rol edición) desde el Excel. Devuelve [importados, inválidos].
  async function importarResponsables(aoa, errores) {
    const headers = aoa[0].map((h) => String(h == null ? "" : h).trim());
    const filas = aoa.slice(1);
    const colNombre = findCol(headers, "RESPONSABLE", "NOMBRE Y APELLIDOS", "NOMBRE");
    const colDni = findCol(headers, "DNI");
    const colZona = findCol(headers, "ZONA");
    const colSub = findCol(headers, "SUBDIVISION");
    const colCeco = findCol(headers, "CECO SAP", "CECO");
    const colArea = findCol(headers, "AREA");
    const colCargo = findCol(headers, "CARGO");
    const colEmail = findCol(headers, "EMAIL");
    const colClave = findCol(headers, "CLAVE");

    if (colNombre < 0) {
      errores.push("Falta la columna RESPONSABLE (o NOMBRE Y APELLIDOS).");
      return [0, filas.length];
    }
    if (colDni < 0) {
      errores.push("Falta la columna DNI.");
      return [0, filas.length];
    }

    const existentes = new Set();
    usuarios.forEach((u) => {
      if (u.nombre) existentes.add(keyOf(u.nombre));
      if (u.dni) existentes.add(keyOf(u.dni));
    });

    let ok = 0, err = 0;
    for (let i = 0; i < filas.length; i++) {
      const f = filas[i];
      if (!Array.isArray(f)) continue;
      if (!f.some((c) => String(c == null ? "" : c).trim() !== "")) continue;
      const nombre = valCelda(f, colNombre);
      if (!nombre) { err++; addError(errores, i, "responsable sin nombre"); continue; }
      const dni = valCelda(f, colDni);
      if (!dni) { err++; addError(errores, i, "falta DNI"); continue; }
      if (existentes.has(keyOf(nombre))) { err++; addError(errores, i, "responsable duplicado: " + nombre); continue; }
      if (existentes.has(keyOf(dni))) { err++; addError(errores, i, "DNI duplicado: " + dni); continue; }
      const claveExcel = valCelda(f, colClave);
      const u = {
        id: "us-" + Date.now() + "-" + Math.floor(Math.random() * 1e5),
        nombre,
        dni,
        clave: claveExcel || dni,
        rol: ROL.EDICION,
        fechaAlta: todayISO(),
        zona: valCelda(f, colZona),
        subdivision: valCelda(f, colSub),
        ceco: valCelda(f, colCeco),
        area: valCelda(f, colArea),
        cargo: valCelda(f, colCargo),
        email: valCelda(f, colEmail)
      };
      await DB.putUsuario(u);
      usuarios.push(u);
      existentes.add(keyOf(nombre));
      existentes.add(keyOf(dni));
      ok++;
    }
    return [ok, err];
  }

  // Crea equipos vinculados a responsables ya existentes. Devuelve [importados, inválidos].
  async function importarEquipos(aoa, errores) {
    const headers = aoa[0].map((h) => String(h == null ? "" : h).trim());
    const filas = aoa.slice(1);
    const colAsignado = findCol(headers, "USUARIO ASIGNADO", "USUARIO");
    const colResp = findCol(headers, "RESPONSABLE");
    const colDni = findCol(headers, "DNI");
    const colHost = findCol(headers, "HOSTNAME", "NEW HOSTNAME");
    const colIp = findCol(headers, "DIR. IP", "IP");
    const colUbic = findCol(headers, "UBICACIÓN FISICA", "UBICACION", "UBICACIÓN");
    const colEquipo = findCol(headers, "EQUIPO");
    const colCod = findCol(headers, "COD. INVENTARIO", "COD");
    const colSerie = findCol(headers, "SERIE DE EQUIPO", "SERIE");
    const colMarca = findCol(headers, "MARCA");
    const colModelo = findCol(headers, "MODELO");
    const colContrato = findCol(headers, "CONTRATO DE ARRENDAMIENTO", "CONTRATO");
    const colStatus = findCol(headers, "STATUS");
    const colArea = findCol(headers, "AREA");
    const colCargo = findCol(headers, "CARGO");

    if (colSerie < 0 && colHost < 0) {
      errores.push("Faltan las columnas SERIE DE EQUIPO / HOSTNAME.");
      return [0, filas.length];
    }
    if (colResp < 0 && colDni < 0 && colAsignado < 0) {
      errores.push("Falta la columna RESPONSABLE, DNI o USUARIO ASIGNADO para vincular el equipo.");
      return [0, filas.length];
    }

    const seriesUsadas = new Set();
    equipos.forEach((e) => { if (e.serie) seriesUsadas.add(keyOf(e.serie)); });

    let ok = 0, err = 0;
    for (let i = 0; i < filas.length; i++) {
      const f = filas[i];
      if (!Array.isArray(f)) continue;
      if (!f.some((c) => String(c == null ? "" : c).trim() !== "")) continue;
      let serie = valCelda(f, colSerie);
      if (!serie) serie = valCelda(f, colHost);
      if (!serie) { err++; addError(errores, i, "equipo sin serie / hostname"); continue; }
      if (seriesUsadas.has(keyOf(serie))) { err++; addError(errores, i, "serie duplicada: " + serie); continue; }

      const asignado = valCelda(f, colAsignado);
      const dniText = valCelda(f, colDni);
      const nombreResp = valCelda(f, colResp);
      let u = null;
      if (dniText && esNumero(dniText)) {
        u = usuarios.find((x) => (x.dni || "").toLowerCase() === dniText.toLowerCase()) || null;
      }
      if (!u && nombreResp) {
        u = usuarios.find((x) => keyOf(x.nombre || "") === keyOf(nombreResp)) || null;
      }
      if (!u && asignado) {
        u = usuarios.find((x) => keyOf(x.nombre || "") === keyOf(asignado)) || null;
      }
      if (!u) {
        // Igual que la app móvil: NO se crean usuarios nuevos. El responsable debe
        // existir como usuario (importa primero el archivo de responsables).
        err++;
        const criterio = nombreResp
          ? (nombreResp + (dniText ? " · DNI " + dniText : ""))
          : (dniText || asignado);
        addError(errores, i, "no se encontró el responsable: " + (criterio || "—") + " (importa primero el archivo de responsables)");
        continue;
      }

      const e = {
        id: "eq-" + Date.now() + "-" + Math.floor(Math.random() * 1e5),
        nombre: valCelda(f, colEquipo) || serie,
        tipo: "laptop",
        marca: valCelda(f, colMarca),
        modelo: valCelda(f, colModelo),
        serie,
        hostname: valCelda(f, colHost),
        ip: valCelda(f, colIp),
        ubicacion: valCelda(f, colUbic),
        usuarioAsignado: asignado,
        responsable: u.nombre,
        dni: dniText && esNumero(dniText) ? dniText : "",
        area: valCelda(f, colArea),
        cargo: valCelda(f, colCargo),
        codInventario: valCelda(f, colCod),
        contrato: valCelda(f, colContrato),
        status: valCelda(f, colStatus),
        intervalo: appConfig.intervalo,
        fechaUltimoMant: null,
        fechaAlta: todayISO()
      };
      await DB.put("equipos", e);
      equipos.push(e);
      seriesUsadas.add(keyOf(serie));
      ok++;
    }
    return [ok, err];
  }

  // Registra mantenimientos para la serie de equipo indicada. Devuelve [importados, inválidos].
  async function importarMantenimientos(aoa, errores) {
    const headers = aoa[0].map((h) => String(h == null ? "" : h).trim());
    const filas = aoa.slice(1);
    const colSerie = findCol(headers, "SERIE DE EQUIPO", "SERIE");
    const colPrioridad = findCol(headers, "PRIORIDAD");
    const colProg = findCol(headers, "FECHA PROGRAMADA");
    const colRepro = findCol(headers, "FECHA REPROGRAMADA");
    const colReal = findCol(headers, "FECHA REAL");
    const colEstado = findCol(headers, "ESTADO");
    const colObs = findCol(headers, "OBSERVACIONES");
    const colAct = findCol(headers, "ACTIVIDADES REALIZADAS", "ACTIVIDADES");
    const colProx = findCol(headers, "PROXIMO MANTENIMIENTO", "PRÓXIMO MANTENIMIENTO", "PROXIMA");

    if (colSerie < 0) {
      errores.push("Falta la columna SERIE DE EQUIPO.");
      return [0, filas.length];
    }

    let ok = 0, err = 0;
    for (let i = 0; i < filas.length; i++) {
      const f = filas[i];
      if (!Array.isArray(f)) continue;
      if (!f.some((c) => String(c == null ? "" : c).trim() !== "")) continue;
      const serie = valCelda(f, colSerie);
      if (!serie) { err++; addError(errores, i, "serie vacía"); continue; }
      const eq = equipos.find((x) => (x.serie || "").trim() === serie) ||
        equipos.find((x) => keyOf(x.serie || "") === keyOf(serie)) || null;
      if (!eq) { err++; addError(errores, i, "serie no existe: " + serie); continue; }

      const act = valCelda(f, colAct);
      const tareas = act ? act.split(/[\r\n,;]+/).map((t) => t.trim()).filter(Boolean) : [];
      const m = {
        id: "mt-" + Date.now() + "-" + Math.floor(Math.random() * 1e5),
        equipoId: eq.id,
        fecha: xlsxToDate(valCelda(f, colProg)),
        tipo: "preventivo",
        estado: estadoNorm(valCelda(f, colEstado)),
        prioridad: valCelda(f, colPrioridad),
        fechaReprogramada: xlsxToDate(valCelda(f, colRepro)),
        fechaReal: xlsxToDate(valCelda(f, colReal)),
        tecnico: "",
        costo: 0,
        proxima: xlsxToDate(valCelda(f, colProx)),
        obs: valCelda(f, colObs),
        tareas
      };
      await DB.put("mantenimientos", m);
      mantenimientos.push(m);
      ok++;
    }
    return [ok, err];
  }

  // ============================================================
  //  ACTUALIZACIÓN POR INTERNET (solo bajo petición explícita)
  // ============================================================
  //  La app NO se actualiza automáticamente. El botón "Buscar
  //  actualizaciones" consulta GitHub; si hay versión nueva limpia
  //  la caché local y recarga los archivos frescos.
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
        if (statusEl) statusEl.textContent = `Versión ${CFG.APP_VERSION} · Modo local`;
        if (!silent) toast("No se configuró un servidor de actualizaciones", "err");
        return;
      }
      const resp = await fetch(base + "/app-version.json", { cache: "no-store" });
      if (!resp.ok) throw new Error("no remote");
      const remote = await resp.json();
      const local = CFG.APP_VERSION;
      if (remote.version !== local) {
        if (statusEl) statusEl.textContent = `Actualización disponible (${local} → ${remote.version}). Aplicando...`;
        toast("Hay una nueva versión. Aplicando actualización...", "ok");
        // Solo bajo petición explícita: desregistrar SW, limpiar caché
        // y recargar para obtener los archivos frescos desde GitHub.
        if (!silent) {
          try {
            if (navigator.serviceWorker) {
              const regs = await navigator.serviceWorker.getRegistrations();
              await Promise.all(regs.map((r) => r.unregister()));
            }
          } catch (e) { /* sin soporte */ }
          try {
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
          } catch (e) { /* sin soporte */ }
          setTimeout(() => window.location.reload(), 400);
        }
      } else {
        if (statusEl) statusEl.textContent = `Versión ${local} · Actualizada ✓`;
        if (!silent) toast("La aplicación está actualizada", "ok");
      }
    } catch (e) {
      if (statusEl) statusEl.textContent = `Versión ${CFG.APP_VERSION} · Modo local`;
      if (!silent) toast("No se encontró un servidor de actualizaciones", "err");
    }
  }

  async function reload() {
    equipos = await DB.getAll("equipos");
    mantenimientos = await DB.getAll("mantenimientos");
    usuarios = await DB.getUsuarios();
    auditoria = await DB.getAuditoria(300);
    feriados = await DB.getAll("feriados");
    appConfig = await DB.getConfig();
    // Corrige fechas dañadas (formato JavaScript/Excel) guardadas por versiones anteriores.
    let mCamb = false;
    mantenimientos.forEach((m) => {
      ["fecha", "fechaReal", "fechaReprogramada", "proxima"].forEach((k) => {
        if (m[k]) { const n = normFecha(m[k]); if (n !== m[k]) { m[k] = n; mCamb = true; } }
      });
      // Si el mantenimiento no tiene responsable, hereda el del equipo.
      if (!m.tecnico) {
        const eqR = equipos.find((x) => x.id === m.equipoId);
        const resp = (eqR && (eqR.responsable || eqR.usuarioAsignado || "")).trim();
        if (resp) { m.tecnico = resp; mCamb = true; }
      }
      // Marca de finalización para los ya finalizados que no la tienen (igual que el APK).
      if (esFinalizado(m) && !m.finalizadoEn) {
        m.finalizadoEn = m.fechaReal || nowStamp();
        mCamb = true;
      }
    });
    let eCamb = false;
    equipos.forEach((e) => {
      ["fechaCompra", "fechaAlta", "fechaUltimoMant"].forEach((k) => {
        if (e[k]) { const n = normFecha(e[k]); if (n !== e[k]) { e[k] = n; eCamb = true; } }
      });
    });
    if (mCamb) await DB.bulkPut("mantenimientos", mantenimientos);
    if (eCamb) await DB.bulkPut("equipos", equipos);
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
    $("#btnGuardarMant").addEventListener("click", saveMant);
    $("#btnVerTodasAlertas").addEventListener("click", () => setView("alertas"));
    $("#btnGuardarConfig").addEventListener("click", saveConfig);
    $("#btnExportar").addEventListener("click", exportData);
    $("#btnExportarApk").addEventListener("click", exportApk);
    $("#btnSincronizar").addEventListener("click", sincronizarAhora);
    $("#btnImportar").addEventListener("click", () => $("#fileImport").click());
    $("#fileImport").addEventListener("change", (e) => {
      if (e.target.files[0]) importData(e.target.files[0]);
      e.target.value = "";
    });
    $("#btnCheckUpdate").addEventListener("click", () => checkForUpdates(false));
    $("#btnMiPerfil").addEventListener("click", openMiPerfil);
    $("#btnExportarExcel").addEventListener("click", exportExcel);
    $("#btnAgregarFeriado").addEventListener("click", agregarFeriado);
    $("#btnProgramar").addEventListener("click", programarMantenimientos);
    $("#correoUbicacion").addEventListener("change", renderCorreo);
    $("#btnEnviarCorreo").addEventListener("click", enviarCorreo);

    // cargas masivas (Excel)
    $("#btnCargarResponsables").addEventListener("click", () => abrirMasiva("responsables"));
    $("#btnCargarEquipos").addEventListener("click", () => abrirMasiva("equipos"));
    $("#btnCargarMantenimientos").addEventListener("click", () => abrirMasiva("mantenimientos"));
    $("#fileMasiva").addEventListener("change", (e) => {
      const f = e.target.files[0];
      const tipo = e.target.dataset.tipo;
      if (f && tipo) procesarMasiva(f, tipo);
      e.target.value = "";
    });

    // datos y mantenimientos 2026
    $("#btnActivar2026").addEventListener("click", activarMantenimientos2026);
    $("#btnVaciarBd").addEventListener("click", vaciarBaseDatos);
    $("#btnVerErrores").addEventListener("click", verErroresGuardados);
    $("#btnCopiarErrores").addEventListener("click", copiarErrores);

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
    $("#filterEstadoMant").addEventListener("change", renderMantenimientos);
    $("#btnBuscarMant").addEventListener("click", renderMantenimientos);
    $("#btnLimpiarMant").addEventListener("click", () => {
      $("#filterUbicacion").value = "";
      $("#filterEquipo").value = "";
      $("#filterTipoMant").value = "";
      $("#filterEstadoMant").value = "";
      $("#filterFechaDesde").value = "";
      $("#filterFechaHasta").value = "";
      renderMantenimientos();
    });

    // Alertas: combo y buscador
    $("#filterAlertaTipo").addEventListener("change", () => { alertTab = "proximos"; renderAlertas(); });
    $("#btnAlertVencidos").addEventListener("click", () => { alertTab = "vencidos"; renderAlertas(); });
    $("#searchAlerta").addEventListener("input", renderAlertas);

    // cierre de modales
    $$("[data-close]").forEach((b) => b.addEventListener("click", () => closeModal(b.dataset.close)));
    $$(".modal-overlay").forEach((o) => o.addEventListener("click", (e) => {
      if (e.target === o) o.classList.add("hidden");
    }));

    // checklist
    $$("#checklistSoft, #checklistHard").forEach((el) => {
      el.addEventListener("change", (e) => {
        if (e.target.type === "checkbox") {
          e.target.closest(".check-item").classList.toggle("checked", e.target.checked);
        }
      });
    });

    // próximo mantenimiento automático
    $("#mtEquipo").addEventListener("change", () => { setNextFromEquipo(); autocompletarResponsable(); });
    $("#mtFecha").addEventListener("change", () => {
      const e = equipos.find((x) => x.id === $("#mtEquipo").value);
      if (e) $("#mtProxima").value = addDays($("#mtFecha").value || todayISO(), e.intervalo || appConfig.intervalo);
    });

    // auto-estado según fechas: reprogramada -> reprogramado, real -> finalizado
    const syncEstadoMant = () => {
      const real = $("#mtFechaReal").value;
      const reprog = $("#mtFechaReprog").value;
      $("#mtEstado").value = real ? "finalizado" : reprog ? "reprogramado" : $("#mtEstado").value;
    };
    $("#mtFechaReprog").addEventListener("change", syncEstadoMant);
    $("#mtFechaReal").addEventListener("change", (e) => {
      if (e.target.value) {
        // Al registrar la fecha real se genera automáticamente el próximo mantenimiento (anual).
        $("#mtProxima").value = addDays(e.target.value, 365);
      }
      syncEstadoMant();
    });

    // delegación de clics
    document.addEventListener("click", (e) => {
      const editUsr = e.target.closest("[data-edit-usuario]");
      if (editUsr) {
        const u = usuarios.find((x) => x.id === editUsr.dataset.editUsuario);
        if (u) openUsuarioModal(u);
        return;
      }
      const delF = e.target.closest("[data-del-feriado]");
      if (delF) {
        eliminarFeriado(delF.dataset.delFeriado);
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
        if (m) {
          if (currentDetailId) renderMantFormEnDetalle(m); else openMantModal(m);
        }
        return;
      }
      const open = e.target.closest("[data-open-detail]");
      if (open) { renderDetalle(open.dataset.openDetail); return; }
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

    // formato de mantenimiento (TI-F016)
    $("#btnVolverFormato").addEventListener("click", () => setView(viewAntesFormato || "dashboard"));
    $("#btnEnviarFormato").addEventListener("click", enviarFormato);
    $("#btnImprimirFormato").addEventListener("click", imprimirFormato);
    $("#btnPdfFormato").addEventListener("click", generarPDF);
  }

  // ======== LOGO PARA EL PDF ========
  function getLogoData() {
    try { return localStorage.getItem("formato_logo_base64") || ""; }
    catch (e) { return ""; }
  }
  function setLogoData(b64) {
    try {
      if (b64) localStorage.setItem("formato_logo_base64", b64);
      else localStorage.removeItem("formato_logo_base64");
    } catch (e) {}
  }
  function processLogo(file) {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // Resize to 100x100, keep aspect ratio, center in square
        const canvas = document.createElement("canvas");
        const size = 100;
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, size, size);
        const ratio = Math.min(size / img.width, size / img.height);
        const dw = img.width * ratio, dh = img.height * ratio;
        ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh);
        const fullB64 = canvas.toDataURL("image/png");
        const pureB64 = fullB64.replace(/^data:image\/png;base64,/, "");
        setLogoData(pureB64);
        $("#logoPreview").src = fullB64;
        $("#logoPreview").classList.remove("hidden");
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }
  $("#logoInput").addEventListener("change", (e) => {
    if (e.target.files[0]) processLogo(e.target.files[0]);
  });
  $("#btnClearLogo").addEventListener("click", () => {
    setLogoData("");
    $("#logoPreview").classList.add("hidden");
    $("#logoInput").value = "";
  });
  // Restore logo preview on load
  const savedLogo = getLogoData();
  if (savedLogo) { $("#logoPreview").src = savedLogo; $("#logoPreview").classList.remove("hidden"); }

  // ---------------- Errores guardados ----------------
  const ERR_KEY = "errores_guardados";
  function registrarError(texto) {
    try {
      const arr = JSON.parse(localStorage.getItem(ERR_KEY) || "[]");
      arr.push(new Date().toISOString() + " · " + texto);
      if (arr.length > 50) arr.splice(0, arr.length - 50);
      localStorage.setItem(ERR_KEY, JSON.stringify(arr));
    } catch (e) { /* ignora */ }
  }
  window.addEventListener("error", (e) => registrarError(e.message || "error de página"));
  window.addEventListener("unhandledrejection", (e) => registrarError(String((e && e.reason) || "promesa rechazada")));

  function verErroresGuardados() {
    const arr = JSON.parse(localStorage.getItem(ERR_KEY) || "[]");
    $("#erroresTexto").textContent = arr.length ? arr.join("\n") : "Sin errores registrados.";
    openModal("modalErrores");
  }

  function copiarErrores() {
    const txt = $("#erroresTexto").textContent || "";
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(() => toast("Texto copiado", "ok")).catch(() => {});
    } else {
      toast("No se pudo copiar", "err");
    }
  }

  async function vaciarBaseDatos() {
    if (!esAdmin()) return toast("Solo el administrador", "err");
    if (!confirm("Se borrarán todos los responsables, equipos y mantenimientos. ¿Continuar?")) return;
    await DB.clear("mantenimientos");
    await DB.clear("equipos");
    await DB.clear("usuarios");
    await DB.clear("feriados");
    await reload();
    await ensureAdmin();
    await reload();
    toast("Base de datos vaciada", "ok");
    auditar("VACIAR BASE DE DATOS", "Se eliminaron todos los registros");
    syncSubir();
  }

  // Deja como programados todos los mantenimientos de 2026,
  // borrando su fecha real/reprogramada para que aparezcan activos en Alertas.
  async function activarMantenimientos2026() {
    if (!esAdmin()) return toast("Solo el administrador", "err");
    if (!confirm("Se pondrán como PROGRAMADO (pendiente) todos los mantenimientos programados para 2026, borrando su fecha real, para que aparezcan activos en Alertas. ¿Continuar?")) return;
    let n = 0;
    for (const m of mantenimientos) {
      const prog = (m.fecha || "").indexOf("2026-") === 0;
      const reprog = (m.fechaReprogramada || "").indexOf("2026-") === 0;
      if (prog || reprog) {
        m.estado = "programado";
        m.fechaReal = "";
        m.fechaReprogramada = "";
        await DB.put("mantenimientos", m);
        n++;
      }
    }
    mantenimientos = await DB.getAll("mantenimientos");
    toast(n + " mantenimiento(s) activado(s)", "ok");
    auditar("ACTIVAR MANTENIMIENTOS 2026", n + " mantenimiento(s) activado(s)");
    renderConfig();
    syncSubir();
  }

  function init() {
    bindEvents();
    window.__APP_OK__ = true;

    // Filtro de mantenimientos: por defecto hoy (inicio y final) y estado Programado.
    $("#filterFechaDesde").value = todayISO();
    $("#filterFechaHasta").value = todayISO();
    $("#filterEstadoMant").value = "programado";

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
        /* Service Worker en modo SOLO CACHÉ (sin red): mantiene el
           funcionamiento sin conexión pero NO sincroniza nada en
           segundo plano. La actualización automática está deshabilitada;
           solo se contacta GitHub cuando el usuario pulsa "Buscar
           actualizaciones". */
        if ("serviceWorker" in navigator) {
          try {
            const reg = navigator.serviceWorker.register("sw.js");
            reg.then((r) => {
              // Cuando se instala una versión nueva del SW, se recarga la app
              // automáticamente para aplicar la actualización.
              r.addEventListener("updatefound", () => {
                const nw = r.installing;
                if (!nw) return;
                nw.addEventListener("statechange", () => {
                  if (nw.state === "activated" && navigator.serviceWorker.controller) {
                    navigator.serviceWorker.addEventListener("controllerchange", () => {
                      if (sessionStorage.getItem("recargadoPorSw") !== "1") {
                        sessionStorage.setItem("recargadoPorSw", "1");
                        location.reload();
                      }
                    });
                  }
                });
              });
            }).catch(() => {});
          } catch (e) { /* sin soporte */ }
        }
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
