// ============================================================
//  Mantenimiento Preventivo - logica de la aplicacion
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
  let currentView = localStorage.getItem("lastView") || "dashboard";
  let alertTab = "vencidos";
  let currentDetailId = null;
  let usuarioPerfilMode = false;
  let feriados = [];
  let eqPage = 1;
  let eqPageSize = 50;
  let mantPage = 1;
  let mantPageSize = 50;
  let alertPage = 1;
  let alertPageSize = 50;

  // ---------------- Roles y sesion ----------------
  const ROL = { LECTURA: 0, EDICION: 1, ADMIN: 2 };
  const rolNombre = (r) => (r === 2 ? "Administrador" : r === 1 ? "Edicion" : "Lectura");
  const puedeEditar = () => !!sesion && sesion.rol >= ROL.EDICION;
  const esAdmin = () => !!sesion && sesion.rol === ROL.ADMIN;

  function esc(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

  // ============================================================
  //  BLOQUEO POR FUERZA BRUTA
  // ============================================================
  const MAX_ATTEMPTS = 5;
  const LOCKOUT_MS = 5 * 60 * 1000; // 5 minutos
  function _lockKey(userId) { return "login_lock_" + userId; }
  function getLoginLock(userId) {
    try {
      const raw = localStorage.getItem(_lockKey(userId));
      if (!raw) return { attempts: 0, lockedUntil: 0 };
      const d = JSON.parse(raw);
      if (d.lockedUntil && Date.now() > d.lockedUntil) { localStorage.removeItem(_lockKey(userId)); return { attempts: 0, lockedUntil: 0 }; }
      return d;
    } catch (e) { return { attempts: 0, lockedUntil: 0 }; }
  }
  function recordFailedLogin(userId) {
    const lock = getLoginLock(userId);
    lock.attempts++;
    if (lock.attempts >= MAX_ATTEMPTS) lock.lockedUntil = Date.now() + LOCKOUT_MS;
    try { localStorage.setItem(_lockKey(userId), JSON.stringify(lock)); } catch (e) {}
    return lock;
  }
  function clearLoginLock(userId) { try { localStorage.removeItem(_lockKey(userId)); } catch (e) {} }
  function isLockedOut(userId) {
    const lock = getLoginLock(userId);
    return lock.lockedUntil > Date.now();
  }
  function lockoutRemaining(userId) {
    const lock = getLoginLock(userId);
    if (lock.lockedUntil <= Date.now()) return 0;
    return Math.ceil((lock.lockedUntil - Date.now()) / 1000);
  }
  function cleanExpiredLockouts() {
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith("login_lock_")) {
          try {
            const d = JSON.parse(localStorage.getItem(k));
            if (d && d.lockedUntil && Date.now() > d.lockedUntil) localStorage.removeItem(k);
          } catch (e) { localStorage.removeItem(k); }
        }
      }
    } catch (e) {}
  }
  function clearAllLockouts() {
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith("login_lock_")) localStorage.removeItem(k);
      }
    } catch (e) {}
  }

  // ============================================================
  //  TOTP (Google Authenticator)
  // ============================================================
  function base32Encode(buf) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    const bytes = new Uint8Array(buf);
    let bits = "";
    for (let i = 0; i < bytes.length; i++) bits += bytes[i].toString(2).padStart(8, "0");
    while (bits.length % 5) bits += "0";
    let out = "";
    for (let i = 0; i < bits.length; i += 5) out += chars[parseInt(bits.slice(i, i + 5), 2)];
    return out;
  }
  function base32Decode(str) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    str = str.replace(/=+$/, "").toUpperCase();
    let bits = "";
    for (let i = 0; i < str.length; i++) {
      const v = chars.indexOf(str[i]);
      if (v < 0) continue;
      bits += v.toString(2).padStart(5, "0");
    }
    const bytes = new Uint8Array(Math.floor(bits.length / 8));
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
    return bytes.buffer;
  }
  async function hmacSha1(key, msg) {
    const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", cryptoKey, msg);
    return new Uint8Array(sig);
  }
  async function generateTOTP(secret32, timeStep) {
    const key = base32Decode(secret32);
    const time = Math.floor(Date.now() / 1000 / 30);
    const t = timeStep || time;
    const buf = new ArrayBuffer(8);
    const view = new DataView(buf);
    view.setUint32(4, t, false);
    const hash = await hmacSha1(key, buf);
    const offset = hash[hash.length - 1] & 0x0f;
    const code = ((hash[offset] & 0x7f) << 24 | (hash[offset + 1] << 16) | (hash[offset + 2] << 8) | hash[offset + 3]) % 1000000;
    return String(code).padStart(6, "0");
  }
  function generateTOTPSecret() {
    const bytes = new Uint8Array(20);
    crypto.getRandomValues(bytes);
    return base32Encode(bytes.buffer);
  }
  function totpQRUrl(secret, user, issuer) {
    const u = encodeURIComponent(user || "user");
    const iss = encodeURIComponent(issuer || "Mantenimiento Preventivo");
    return "otpauth://totp/" + iss + ":" + u + "?secret=" + secret + "&issuer=" + iss + "&algorithm=SHA1&digits=6&period=30";
  }
  function totpQRImage(url) {
    return "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=" + encodeURIComponent(url);
  }

  // ============================================================
  //  Visibilidad de equipos
  // ============================================================
  function esVisibleEquipo(eq) {
    if (esAdmin()) return true;
    if (!sesion) return false;
    if (sesion.rol >= ROL.EDICION) return true;
    return (eq.responsable || "").toLowerCase() === sesion.nombre.toLowerCase() ||
           (eq.dni || "").toLowerCase() === (sesion.dni || "").toLowerCase();
  }
  function equiposVisibles() { return equipos.filter((eq) => esVisibleEquipo(eq)); }

  // ============================================================
  //  Estados de mantenimiento
  // ============================================================
  function esEstadoFinal(estado) { return estado === "finalizado"; }

  function estadoMant(mant) {
    if (mant.estado === "finalizado") return "finalizado";
    if (mant.estado === "reprogramado") {
      const f = normFecha(mant.fechaReprog || mant.fecha);
      if (f && f < todayISO()) return "vencido";
      return "reprogramado";
    }
    const f = normFecha(mant.fecha);
    if (f && f < todayISO()) return "vencido";
    return "programado";
  }

  function esFinalizado(mant) { return estadoMant(mant) === "finalizado"; }

  function estadoLabel(e) {
    const map = { programado: "Programado", reprogramado: "Reprogramado", finalizado: "Finalizado", vencido: "Vencido" };
    return map[e] || e;
  }

  function estadoBadge(e) {
    const cls = { programado: "info", reprogramado: "warn", finalizado: "success", vencido: "danger" };
    return '<span class="badge ' + (cls[e] || "neutral") + '">' + estadoLabel(e) + '</span>';
  }

  function esVencido(mant) { return estadoMant(mant) === "vencido"; }

  function fijarSelect(sel, val) {
    if (!sel) return;
    for (let i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value === String(val)) { sel.selectedIndex = i; return; }
    }
  }

  // ============================================================
  //  Utilidades de fecha
  // ============================================================
  function todayISO() { return toISODate(new Date()); }

  function nowStamp() {
    const d = new Date();
    const p = (n) => ("0" + n).slice(-2);
    return d.getFullYear() + "-" + p(d.getMonth()+1) + "-" + p(d.getDate())
      + " " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
  }

  function toISODate(d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return "";
    const off = d.getTimezoneOffset();
    return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
  }

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
    const d = new Date(normFecha(iso) + "T00:00:00");
    d.setDate(d.getDate() + days);
    return toISODate(d);
  }

  function parseISO(s) { const ns = normFecha(s); if (!ns) return null; return new Date(ns + "T00:00:00"); }

  function diffDays(a, b) {
    const da = new Date(normFecha(a) + "T00:00:00");
    const db = new Date(normFecha(b) + "T00:00:00");
    return Math.round((db - da) / 86400000);
  }

  function fmtDate(iso) {
    if (iso == null || iso === "") return "\u2014";
    const s = normFecha(iso);
    if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = new Date(s + "T00:00:00");
    return d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function now() { return new Date(); }

  function nextDueDate(eq) {
    const eqMant = mantenimientos
      .filter((m) => m.equipoId === eq.id)
      .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
    if (!eqMant.length) return eq.fechaCompra || todayISO();
    const last = eqMant[0];
    const f = normFecha(last.fechaProxima || last.fecha);
    if (f) return f;
    const intervalo = Number(eq.intervalo || appConfig.intervalo || 90);
    return addDays(normFecha(last.fecha), intervalo);
  }

  function statusOf(eq) {
    const due = nextDueDate(eq);
    const diff = diffDays(todayISO(), due);
    if (diff < 0) return "vencido";
    if (diff <= 15) return "proximo";
    return "al-dia";
  }

  function uid() { return "id-" + Date.now() + "-" + Math.floor(Math.random() * 10000); }

  // ============================================================
  //  Toast
  // ============================================================
  let toastTimer = null;
  function toast(msg, type) {
    const el = $("#toast");
    el.textContent = msg;
    el.className = "toast " + (type || "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add("hidden"), 2600);
  }

  // ============================================================
  //  Auditoria
  // ============================================================
  async function auditar(accion, detalle) {
    try {
      await DB.putAuditoria({
        id: uid(), fecha: todayISO(), hora: nowStamp().split(" ")[1],
        usuario: sesion ? sesion.nombre : "\u2014",
        rol: sesion ? rolNombre(sesion.rol) : "\u2014",
        accion: accion, detalle: detalle || ""
      });
      auditoria = await DB.getAuditoria(300);
    } catch (e) { /* */ }
  }

  // ============================================================
  //  Theme
  // ============================================================
  function applyTheme(color) {
    const c = color || "#DC2626";
    const r = parseInt(c.slice(1,3),16), g = parseInt(c.slice(3,5),16), b = parseInt(c.slice(5,7),16);
    const lighten = (v, pct) => Math.min(255, Math.round(v + (255-v)*pct));
    const darken = (v, pct) => Math.max(0, Math.round(v*(1-pct)));
    const l700 = "rgb(" + darken(r,0.2) + "," + darken(g,0.2) + "," + darken(b,0.2) + ")";
    const l600 = c;
    const l500 = "rgb(" + lighten(r,0.1) + "," + lighten(g,0.1) + "," + lighten(b,0.1) + ")";
    const l400 = "rgb(" + lighten(r,0.25) + "," + lighten(g,0.25) + "," + lighten(b,0.25) + ")";
    const l300 = "rgb(" + lighten(r,0.45) + "," + lighten(g,0.45) + "," + lighten(b,0.45) + ")";
    const l100 = "rgb(" + lighten(r,0.85) + "," + lighten(g,0.85) + "," + lighten(b,0.85) + ")";
    const l50 = "rgb(" + lighten(r,0.93) + "," + lighten(g,0.93) + "," + lighten(b,0.93) + ")";
    document.documentElement.style.setProperty("--pri-700", l700);
    document.documentElement.style.setProperty("--pri-600", l600);
    document.documentElement.style.setProperty("--pri-500", l500);
    document.documentElement.style.setProperty("--pri-400", l400);
    document.documentElement.style.setProperty("--pri-300", l300);
    document.documentElement.style.setProperty("--pri-100", l100);
    document.documentElement.style.setProperty("--pri-50", l50);
    document.documentElement.style.setProperty("--pri-grad", "linear-gradient(135deg, " + l600 + " 0%, " + l500 + " 60%, " + l400 + " 100%)");
    document.documentElement.style.setProperty("--bg", l50);
    document.documentElement.style.setProperty("--shadow", "0 8px 24px " + l600 + "20");
    document.documentElement.style.setProperty("--shadow-sm", "0 2px 10px " + l600 + "14");
    document.documentElement.style.setProperty("--border", l100.replace(/rgb\(/, "rgba(").replace(/\)/, ",0.6)"));
    const mc = document.querySelector('meta[name="theme-color"]');
    if (mc) mc.setAttribute("content", c);
  }

  // ============================================================
  //  Logo
  // ============================================================
  function applyLogoToUI(b64) {
    ["topbarLogo","sidebarLogo","loginLogo"].forEach((id) => {
      const img = document.getElementById(id);
      if (!img) return;
      if (b64) { img.src = "data:image/png;base64," + b64; img.classList.remove("hidden"); }
      else { img.classList.add("hidden"); }
    });
    ["topbarIcon","sidebarIcon","loginLogoEmoji"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle("hidden", !!b64);
    });
  }

  // ============================================================
  //  Recargar datos
  // ============================================================
  async function reload() {
    equipos = await DB.getAll("equipos");
    mantenimientos = await DB.getAll("mantenimientos");
    usuarios = await DB.getUsuarios();
    auditoria = await DB.getAuditoria(300);
    feriados = await DB.getAll("feriados");
    appConfig = await DB.getConfig();
    applyTheme(appConfig.colorPrimario || appConfig.temaColor);
    applyLogoToUI(appConfig.logo);
  }

  // ============================================================
  //  Sesion / Login
  // ============================================================
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
      if (admin) {
        admin.nombre = "admin"; admin.dni = "admin"; admin.clave = "admin"; admin.rol = ROL.ADMIN; admin.id = "us-admin";
        await DB.putUsuario(admin);
      }
      await DB.setConfig(flag, true);
    }
  }

  function showLogin() {
    const ls = $("#loginScreen"); if (ls) ls.classList.remove("hidden");
    const lc = $("#loginClave"); if (lc) lc.value = "";
    const sub = $("#loginEmpresaSub");
    const emp = appConfig && appConfig.empresa ? appConfig.empresa : "";
    if (sub) sub.textContent = emp ? emp + " \u00b7 Mantenimiento Preventivo" : "Inicia sesion para continuar";
  }

  function applySessionUI() {
    const chip = $("#sesionChip");
    if (sesion) {
      if (chip) { chip.textContent = sesion.nombre + " \u00b7 " + rolNombre(sesion.rol); chip.classList.remove("hidden"); }
      const lo = $("#btnLogout"); if (lo) lo.classList.remove("hidden");
      const bn = $("#brandName"); if (bn) bn.textContent = appConfig.empresa || "Mantenimiento Preventivo";
    } else {
      if (chip) chip.classList.add("hidden");
      const lo = $("#btnLogout"); if (lo) lo.classList.add("hidden");
    }
  }

  async function doLogin() {
    const usuario = ($("#loginUsuario") || { value: "" }).value.trim();
    const clave = ($("#loginClave") || { value: "" }).value;
    const err = $("#loginError");
    if (!usuario || !clave) { if (err) { err.textContent = "Ingresa usuario y contrasena"; err.classList.remove("hidden"); } return; }
    // Si no hay usuarios locales, sincronizar desde la nube primero
    if (!usuarios.length && navigator.onLine) {
      if (err) { err.textContent = "Conectando con la nube..."; err.classList.remove("hidden"); }
      try { await syncBajar(); await reload(); } catch (e) {}
    }
    const ku = usuario.toLowerCase().replace(/[^a-z0-9]/g, "");
    const adminKey = ku === "admin" || ku === "administrador";
    let u;
    if (adminKey) {
      u = usuarios.find((x) => x.rol === ROL.ADMIN && (x.dni || "").toLowerCase() === usuario.toLowerCase());
      if (!u) u = usuarios.find((x) => x.rol === ROL.ADMIN && (x.nombre || "").toLowerCase().includes(ku));
      if (!u) u = usuarios.find((x) => x.rol === ROL.ADMIN);
    } else {
      u = usuarios.find((x) => (x.dni || "").toLowerCase() === usuario.toLowerCase());
      if (!u) u = usuarios.find((x) => (x.nombre || "").toLowerCase() === usuario.toLowerCase());
    }
    if (!u) { if (err) { err.textContent = "Usuario o contrasena incorrectos"; err.classList.remove("hidden"); } return; }
    // Bloqueo por fuerza bruta (solo este usuario)
    if (isLockedOut(u.id)) {
      const secs = lockoutRemaining(u.id);
      const mins = Math.ceil(secs / 60);
      if (err) { err.textContent = "Cuenta bloqueada (" + u.nombre + "). Intenta en " + mins + " minuto" + (mins === 1 ? "" : "s"); err.classList.remove("hidden"); }
      return;
    }
    const pwOk = u.clave ? u.clave === clave.trim() : u.dni === clave.trim();
    if (!pwOk) {
      const lock = recordFailedLogin(u.id);
      const remaining = lock.attempts >= MAX_ATTEMPTS ? "Cuenta bloqueada 5 minutos" : (MAX_ATTEMPTS - lock.attempts) + " intentos restantes";
      if (err) { err.textContent = "Contrasena incorrecta (" + remaining + ")"; err.classList.remove("hidden"); }
      await auditar("INTENTO FALLIDO", "Usuario: " + u.nombre + " · Intentos: " + lock.attempts);
      return;
    }
    // Contraseña correcta: verificar TOTP si está habilitado
    if (u.totpEnabled && u.totpSecret) {
      window.__pendingLogin = { id: u.id, nombre: u.nombre, dni: u.dni, rol: u.rol };
      const ls = $("#loginScreen"); if (ls) ls.classList.add("hidden");
      if (err) err.classList.add("hidden");
      $("#loginUsuario").value = "";
      $("#loginClave").value = "";
      const totpModal = $("#modalTOTPVerify");
      if (totpModal) { totpModal.classList.remove("hidden"); const inp = $("#totpVerifyCode"); if (inp) { inp.value = ""; inp.focus(); } }
      return;
    }
    clearLoginLock(u.id);
    sesion = { id: u.id, nombre: u.nombre, dni: u.dni, rol: u.rol };
    await DB.setSesion(sesion);
    await auditar("INICIO DE SESION", "Usuario: " + u.nombre);
    const ls = $("#loginScreen"); if (ls) ls.classList.add("hidden");
    if (err) err.classList.add("hidden");
    $("#loginUsuario").value = "";
    $("#loginClave").value = "";
    applyLogoToUI(getLogoData());
    applySessionUI();
    setView("dashboard");
    // Sincronizar desde la nube DESPUES de validar login
    if (navigator.onLine) { try { await syncBajar(); await reload(); applyLogoToUI(getLogoData()); } catch (e) {} }
  }

  async function confirmTOTPVerify() {
    const code = ($("#totpVerifyCode") || { value: "" }).value.trim();
    const err = $("#totpVerifyError");
    const pending = window.__pendingLogin;
    if (!pending || !code) { if (err) { err.textContent = "Ingresa el codigo"; err.classList.remove("hidden"); } return; }
    const u = usuarios.find((x) => x.id === pending.id);
    if (!u || !u.totpSecret) { if (err) { err.textContent = "Error de configuracion"; err.classList.remove("hidden"); } return; }
    const nowCode = await generateTOTP(u.totpSecret);
    const prevCode = await generateTOTP(u.totpSecret, Math.floor(Date.now() / 1000 / 30) - 1);
    if (code !== nowCode && code !== prevCode) {
      if (err) { err.textContent = "Codigo incorrecto. Intenta de nuevo."; err.classList.remove("hidden"); }
      return;
    }
    clearLoginLock(u.id);
    sesion = pending;
    window.__pendingLogin = null;
    await DB.setSesion(sesion);
    await auditar("INICIO DE SESION (2FA)", "Usuario: " + u.nombre);
    const modal = $("#modalTOTPVerify"); if (modal) modal.classList.add("hidden");
    if (err) err.classList.add("hidden");
    applyLogoToUI(getLogoData());
    applySessionUI();
    setView("dashboard");
  }

  // ---- TOTP Setup ----
  let _pendingTOTPSecret = "";
  function openTOTPSetup(userId) {
    const u = usuarios.find((x) => String(x.id) === String(userId));
    if (!u) return;
    const status = $("#mi2FAStatus");
    if (u.totpEnabled && u.totpSecret) {
      if (status) status.innerHTML = '<span style="color:#059669">2FA activo</span> · <button class="btn btn-ghost btn-sm" id="btnDisable2FA" style="color:#DC2626;padding:0;font-size:12px">Desactivar</button>';
      const btnDis = $("#btnDisable2FA");
      if (btnDis) btnDis.addEventListener("click", () => disableTOTP(u.id));
    } else {
      _pendingTOTPSecret = generateTOTPSecret();
      const qrUrl = totpQRUrl(_pendingTOTPSecret, u.nombre, appConfig.empresa || "Mantenimiento Preventivo");
      const img = $("#totpQRImage");
      if (img) img.src = totpQRImage(qrUrl);
      const sec = $("#totpSecretDisplay");
      if (sec) sec.textContent = "Clave manual: " + _pendingTOTPSecret;
      const codeInput = $("#totpSetupCode");
      if (codeInput) codeInput.value = "";
      const errEl = $("#totpSetupError");
      if (errEl) errEl.classList.add("hidden");
      const modal = $("#modalTOTPSetup");
      if (modal) modal.classList.remove("hidden");
      window.__totpSetupUserId = u.id;
      if (codeInput) codeInput.focus();
    }
  }

  async function confirmTOTPSetup() {
    const code = ($("#totpSetupCode") || { value: "" }).value.trim();
    const err = $("#totpSetupError");
    const userId = window.__totpSetupUserId;
    if (!userId || !code) { if (err) { err.textContent = "Ingresa el codigo"; err.classList.remove("hidden"); } return; }
    const nowCode = await generateTOTP(_pendingTOTPSecret);
    const prevCode = await generateTOTP(_pendingTOTPSecret, Math.floor(Date.now() / 1000 / 30) - 1);
    if (code !== nowCode && code !== prevCode) {
      if (err) { err.textContent = "Codigo incorrecto. Verifica tu app de autenticacion."; err.classList.remove("hidden"); }
      return;
    }
    const u = usuarios.find((x) => String(x.id) === String(userId));
    if (!u) return;
    u.totpSecret = _pendingTOTPSecret;
    u.totpEnabled = true;
    await DB.putUsuario(u);
    await auditar("2FA ACTIVADO", "Usuario: " + u.nombre);
    const modal = $("#modalTOTPSetup"); if (modal) modal.classList.add("hidden");
    if (err) err.classList.add("hidden");
    _pendingTOTPSecret = "";
    window.__totpSetupUserId = null;
    toast("Autenticacion en dos pasos activada", "ok");
    renderConfig();
  }

  async function disableTOTP(userId) {
    if (!confirm("Desactivar la autenticacion en dos pasos?")) return;
    const u = usuarios.find((x) => String(x.id) === String(userId));
    if (!u) return;
    u.totpSecret = "";
    u.totpEnabled = false;
    await DB.putUsuario(u);
    await auditar("2FA DESACTIVADO", "Usuario: " + u.nombre);
    toast("2FA desactivado", "ok");
    renderConfig();
  }

  async function doLogout() {
    await auditar("CIERRE DE SESION", "Usuario: " + (sesion ? sesion.nombre : ""));
    sesion = null;
    await DB.clearSesion();
    currentView = "dashboard";
    applySessionUI();
    showLogin();
  }

  // ============================================================
  //  Navegacion
  // ============================================================
  function toggleSidebar(open) {
    const sb = $("#sidebar"), bk = $("#sidebarBackdrop");
    if (sb) sb.classList.toggle("open", open);
    if (bk) bk.classList.toggle("show", open);
  }

  function setView(view) {
    currentView = view;
    localStorage.setItem("lastView", view);
    $$(".view").forEach((v) => v.classList.add("hidden"));
    const el = $("#view-" + view);
    if (el) el.classList.remove("hidden");
    $$(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
    window.scrollTo({ top: 0 });
    toggleSidebar(false);
    if (view === "dashboard") renderDashboard();
    if (view === "rendimiento") renderRendimiento();
    if (view === "equipos") renderEquipos();
    if (view === "mantenimientos") renderMantenimientos();
    if (view === "alertas") renderAlertas();
    if (view === "config") renderConfig();
  }

  function refreshView() { setView(currentView); }

  // ============================================================
  //  Modal helpers
  // ============================================================
  function openModal(id) {
    $$(".modal-overlay").forEach((m) => {
      if (m.id !== id) { m.classList.add("hidden"); if (m.id === "modalDetalle") currentDetailId = null; }
    });
    const el = $("#" + id); if (el) el.classList.remove("hidden");
  }
  function closeModal(id) {
    const el = $("#" + id); if (el) el.classList.add("hidden");
    if (id === "modalDetalle") currentDetailId = null;
    if (id === "modalTOTPVerify") { window.__pendingLogin = null; showLogin(); }
    if (id === "modalTOTPSetup") { _pendingTOTPSecret = ""; window.__totpSetupUserId = null; }
  }

  // ============================================================
  //  Meses
  // ============================================================
  const MESES_CORTOS = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const MESES_LARGOS = ["","Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

  // ============================================================
  //  Funciones de graficos
  // ============================================================
  function shortName(name) {
    if (!name) return "\u2014";
    const parts = name.trim().split(/\s+/);
    if (parts.length <= 2) return name;
    return parts[0] + " " + parts[parts.length - 1].charAt(0) + ".";
  }

  function kpiCardHTML(o) {
    return '<div class="kpi-inner">' +
      '<div class="kpi-top"><span class="kpi-title">' + esc(o.title) + '</span><span class="kpi-date">' + esc(o.updateDate || "") + '</span></div>' +
      '<div class="kpi-middle"><span class="kpi-value" style="color:' + (o.color || "var(--pri-700)") + '">' + esc(String(o.value)) + '</span></div></div>';
  }

  function barChartHTML(data, maxVal) {
    if (!data.length) return '<div class="empty-state"><p>Sin datos.</p></div>';
    const mx = maxVal || Math.max(...data.map((d) => d.value), 1);
    return '<div class="bar-chart">' + data.map((d) => {
      const pct = Math.round((d.value / mx) * 100);
      return '<div class="bar-row"><span class="bar-label" title="' + esc(d.label) + '">' + esc(shortName(d.label)) + '</span>' +
        '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%;background:' + (d.color || "var(--pri-500)") + '"></div></div>' +
        '<span class="bar-val">' + d.value + '</span></div>';
    }).join("") + '</div>';
  }

  function donutChartHTML(slices) {
    const total = slices.reduce((a, s) => a + s.value, 0);
    if (!total) return '<div class="empty-state"><div class="empty-icon">\ud83d\udcca</div><p>Sin datos.</p></div>';
    const R = 42, SW = 22, circ = 2 * Math.PI * R;
    let offset = 0;
    const circles = slices.map((s) => {
      const len = (s.value / total) * circ;
      const gap = circ - len;
      const html = '<circle cx="100" cy="100" r="' + R + '" fill="none" stroke="' + s.color + '" stroke-width="' + SW + '" stroke-dasharray="' + len.toFixed(2) + ' ' + gap.toFixed(2) + '" stroke-dashoffset="' + (-offset).toFixed(2) + '" transform="rotate(-90 100 100)"><title>' + esc(s.label) + ': ' + s.value + '</title></circle>';
      offset += len;
      return html;
    });
    return '<div class="donut-wrap"><svg class="donut-chart" viewBox="0 0 200 200">' +
      circles.join("") +
      '<text x="100" y="94" text-anchor="middle" font-size="22" font-weight="800" fill="var(--pri-700)">' + total + '</text>' +
      '<text x="100" y="112" text-anchor="middle" font-size="10" fill="var(--text-muted)">TOTAL</text></svg>' +
      '<div class="donut-legend">' + slices.map((s) =>
        '<span><span class="ch-legend-dot" style="background:' + s.color + '"></span>' + esc(s.label) + ': ' + s.value + '</span>'
      ).join("") + '</div></div>';
  }

  function pieChartHTML(slices) { return donutChartHTML(slices); }

  function waveChartHTML(series) {
    if (!series.length) return '<div class="empty-state"><div class="empty-icon">\ud83d\udcc8</div><p>Sin datos.</p></div>';
    const W = 600, H = 180, PAD = 10;
    const max = Math.max(...series.map((s) => s.value), 1);
    const n = series.length;
    const step = n > 1 ? (W - PAD * 2) / (n - 1) : 0;
    const pts = series.map((s, i) => ({
      x: n > 1 ? PAD + i * step : W / 2,
      y: H - PAD - (s.value / max) * (H - PAD * 2),
      label: s.label, value: s.value
    }));
    const line = pts.map((p) => p.x.toFixed(1) + "," + p.y.toFixed(1)).join(" ");
    const area = "M " + pts[0].x.toFixed(1) + " " + H +
      " L " + pts.map((p) => p.x.toFixed(1) + " " + p.y.toFixed(1)).join(" L ") +
      " L " + pts[pts.length - 1].x.toFixed(1) + " " + H + " Z";
    return '<div class="wave-wrap"><svg class="wave-chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' +
      '<path class="wave-area" d="' + area + '"/>' +
      '<polyline class="wave-line" points="' + line + '"/>' +
      pts.map((p) => '<circle class="wave-dot" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="4"><title>' + esc(p.label) + ': ' + p.value + '</title></circle>').join("") +
      '</svg><div class="wave-labels">' + pts.map((p) => '<span>' + esc(p.label) + '</span>').join("") + '</div></div>';
  }

  function wave2ChartHTML(series, series2, label1, label2) {
    if (!series.length) return '<div class="empty-state"><p>Sin datos.</p></div>';
    return waveChartHTML(series);
  }

  function channelDistributionChartHTML(data) {
    if (!data.length) return '<div class="empty-state"><p>Sin datos.</p></div>';
    return donutChartHTML(data);
  }

  function mantsPorMes() {
    const porMes = new Map();
    mantenimientos.forEach((m) => {
      const f = normFecha(m.fecha);
      if (/^\d{4}-\d{2}/.test(f)) {
        const ym = f.slice(0, 7);
        porMes.set(ym, (porMes.get(ym) || 0) + 1);
      }
    });
    const months = [...porMes.keys()].sort().slice(-6);
    return months.map((ym) => ({
      label: MESES_CORTOS[parseInt(ym.slice(5, 7), 10) - 1],
      value: porMes.get(ym) || 0,
      ym
    }));
  }

  // ============================================================
  //  Equipos por categoria / marca
  // ============================================================
  const CAT_COLORS = { laptop: "#2563EB", desktop: "#059669", allinone: "#D97706", servidor: "#7C3AED" };
  const CAT_LABELS = { laptop: "Laptop", desktop: "Escritorio", allinone: "Todo en uno", servidor: "Servidor" };

  function equiposPorCategoria() {
    const cats = {};
    const visibles = equiposVisibles();
    visibles.forEach((eq) => { const t = eq.tipo || "otro"; cats[t] = (cats[t] || 0) + 1; });
    return Object.entries(cats).map(([k, v]) => ({ label: CAT_LABELS[k] || k, value: v, color: CAT_COLORS[k] || "#94A3B8" }));
  }

  function equiposCatHTML() {
    const data = equiposPorCategoria();
    if (!data.length) return '<div class="empty-state"><p>Sin datos.</p></div>';
    return barChartHTML(data, Math.max(...data.map((d) => d.value), 1));
  }

  function marcasPorEquipo() {
    const marcas = {};
    equiposVisibles().forEach((eq) => { const m = (eq.marca || "Otra").trim() || "Otra"; marcas[m] = (marcas[m] || 0) + 1; });
    return Object.entries(marcas).map(([k, v]) => ({ label: k, value: v })).sort((a, b) => b.value - a.value).slice(0, 8);
  }

  const MARCA_COLORS = ["#2563EB","#059669","#D97706","#DC2626","#7C3AED","#0891B2","#E11D48","#64748B"];

  function marcasEquipoHTML() {
    const data = marcasPorEquipo().map((d, i) => ({ ...d, color: MARCA_COLORS[i % MARCA_COLORS.length] }));
    if (!data.length) return '<div class="empty-state"><p>Sin datos.</p></div>';
    return barChartHTML(data, Math.max(...data.map((d) => d.value), 1));
  }

  // ============================================================
  //  Paginacion
  // ============================================================
  function paginationHTML(total, page, pageSize, prefix) {
    const totalPages = Math.ceil(total / pageSize) || 1;
    if (totalPages <= 1) return "";
    let html = '<div class="pagination">';
    html += '<button class="btn btn-ghost btn-sm" data-page="' + prefix + ':prev"' + (page <= 1 ? ' disabled' : '') + '>&#8592; Ant</button>';
    html += '<span class="page-info">Pagina ' + page + ' de ' + totalPages + '</span>';
    html += '<button class="btn btn-ghost btn-sm" data-page="' + prefix + ':next"' + (page >= totalPages ? ' disabled' : '') + '>Sig &#8594;</button>';
    html += '</div>';
    return html;
  }

  // ============================================================
  //  Bar HTML (barras de progreso)
  // ============================================================
  function barHTML(data, total) {
    if (!total) total = data.reduce((s, d) => s + d.value, 0) || 1;
    return '<div class="perf-bar">' + data.map((d) => {
      const pct = (d.value / total * 100).toFixed(1);
      return '<div class="perf-seg" style="width:' + pct + '%;background:' + d.color + '" title="' + esc(d.label) + ': ' + d.value + '"></div>';
    }).join("") + '</div>';
  }

  // ============================================================
  //  Avance por usuario
  // ============================================================
  function avancePorUsuario(usuarioFiltro) {
    const visibles = equiposVisibles();
    const eqIds = new Set(visibles.map((eq) => eq.id));
    const mantsFiltrados = mantenimientos.filter((m) => eqIds.has(m.equipoId));
    const usuariosMap = {};
    mantsFiltrados.forEach((m) => {
      const resp = m.tecnico || m.responsable || "Sin asignar";
      if (usuarioFiltro && resp !== usuarioFiltro) return;
      if (!usuariosMap[resp]) usuariosMap[resp] = { programado: 0, reprogramado: 0, finalizado: 0, vencido: 0 };
      const est = estadoMant(m);
      if (est === "finalizado") usuariosMap[resp].finalizado++;
      else if (est === "reprogramado") usuariosMap[resp].reprogramado++;
      else if (est === "vencido") usuariosMap[resp].vencido++;
      else usuariosMap[resp].programado++;
    });
    return Object.entries(usuariosMap).map(([nombre, counts]) => ({
      nombre, ...counts,
      total: counts.programado + counts.reprogramado + counts.finalizado + counts.vencido,
      avance: (counts.programado + counts.reprogramado + counts.finalizado + counts.vencido) > 0
        ? Math.round((counts.finalizado / (counts.programado + counts.reprogramado + counts.finalizado + counts.vencido)) * 100) : 0
    })).sort((a, b) => b.avance - a.avance);
  }

  // ============================================================
  //  DASHBOARD
  // ============================================================
  function renderDashboard() {
    const visibles = equiposVisibles();
    const eqIds = new Set(visibles.map((eq) => eq.id));
    const mantsVisibles = mantenimientos.filter((m) => eqIds.has(m.equipoId));

    const prog = mantsVisibles.filter((m) => estadoMant(m) === "programado").length;
    const reprog = mantsVisibles.filter((m) => estadoMant(m) === "reprogramado").length;
    const fin = mantsVisibles.filter((m) => estadoMant(m) === "finalizado").length;
    const venc = mantsVisibles.filter((m) => estadoMant(m) === "vencido").length;
    const total = prog + reprog + fin + venc;

    const updDate = new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });

    // Barra de avance
    const barData = [
      { value: venc, color: "#DC2626", label: "Atrasados" },
      { value: prog, color: "#0891B2", label: "Programado" },
      { value: reprog, color: "#D97706", label: "Reprogramado" },
      { value: fin, color: "#059669", label: "Finalizado" }
    ];
    const dashBar = $("#dashBar");
    if (dashBar) dashBar.innerHTML = barHTML(barData, total);
    const dashNums = $("#dashNums");
    if (dashNums) {
      dashNums.innerHTML = '<span style="color:#DC2626"><b>' + venc + '</b> Atrasados</span> ' +
        '<span style="color:#0891B2"><b>' + prog + '</b> Programado</span> ' +
        '<span style="color:#D97706"><b>' + reprog + '</b> Reprogramado</span> ' +
        '<span style="color:#059669"><b>' + fin + '</b> Finalizado</span>';
    }

    // Mantenimientos por responsable
    const respMap = {};
    mantsVisibles.forEach((m) => {
      const r = m.tecnico || m.responsable || "Sin asignar";
      respMap[r] = (respMap[r] || 0) + 1;
    });
    const respData = Object.entries(respMap)
      .map(([k, v]) => ({ label: k, value: v, color: "var(--pri-500)" }))
      .sort((a, b) => b.value - a.value).slice(0, 10);
    const dashBarChart = $("#dashBarChart");
    if (dashBarChart) dashBarChart.innerHTML = barChartHTML(respData);

    // Equipos por categoria
    const dashCatBar = $("#dashCatBar");
    if (dashCatBar) dashCatBar.innerHTML = equiposCatHTML();

    // Vencidos pie
    const noVencidos = mantsVisibles.length - venc;
    const pieData = [
      { label: "Vencidos", value: venc, color: "#DC2626" },
      { label: "Al dia", value: noVencidos, color: "#059669" }
    ].filter((s) => s.value > 0);
    const dashVencPie = $("#dashVencPie");
    if (dashVencPie) dashVencPie.innerHTML = donutChartHTML(pieData);

    // Equipos por marca
    const dashMarcaBar = $("#dashMarcaBar");
    if (dashMarcaBar) dashMarcaBar.innerHTML = marcasEquipoHTML();

    // KPIs
    const kpiReprog = $("#kpiReprogramados");
    if (kpiReprog) kpiReprog.innerHTML = kpiCardHTML({ title: "Reprogramados", value: reprog, color: "#D97706", updateDate: updDate });
    const kpiFin = $("#kpiFinalizados");
    if (kpiFin) kpiFin.innerHTML = kpiCardHTML({ title: "Finalizados", value: fin, color: "#059669", updateDate: updDate });
  }

  // ============================================================
  //  RENDIMIENTO
  // ============================================================
  function renderRendimiento() {
    const sel = $("#perfUsuario");
    const prevVal = sel ? sel.value : "";
    const tecnicos = new Set();
    const eqIds = new Set(equiposVisibles().map((eq) => eq.id));
    mantenimientos.filter((m) => eqIds.has(m.equipoId)).forEach((m) => {
      tecnicos.add(m.tecnico || m.responsable || "Sin asignar");
    });
    if (sel) {
      sel.innerHTML = '<option value="">Todos los responsables</option>' +
        [...tecnicos].sort().map((t) => '<option value="' + esc(t) + '">' + esc(t) + '</option>').join("");
      if ([...sel.options].some((o) => o.value === prevVal)) sel.value = prevVal;
    }

    const filtro = sel ? sel.value : "";
    const data = avancePorUsuario(filtro);

    const totalProg = data.reduce((s, d) => s + d.programado, 0);
    const totalReprog = data.reduce((s, d) => s + d.reprogramado, 0);
    const totalFin = data.reduce((s, d) => s + d.finalizado, 0);
    const totalAll = data.reduce((s, d) => s + d.total, 0);
    const pctGlobal = totalAll > 0 ? Math.round((totalFin / totalAll) * 100) : 0;

    const ep = $("#perfProg"); if (ep) ep.textContent = totalProg;
    const er = $("#perfReprog"); if (er) er.textContent = totalReprog;
    const ef = $("#perfFin"); if (ef) ef.textContent = totalFin;
    const et = $("#perfTotal"); if (et) et.textContent = totalAll;
    const epct = $("#perfPct"); if (epct) epct.textContent = pctGlobal + "%";

    const perfList = $("#perfList");
    if (perfList) {
      if (!data.length) {
        perfList.innerHTML = '<div class="empty-state"><p>Sin datos de rendimiento.</p></div>';
      } else {
        perfList.innerHTML = data.map((d) => {
          const bd = [
            { value: d.programado, color: "#0891B2", label: "Programado" },
            { value: d.reprogramado, color: "#D97706", label: "Reprogramado" },
            { value: d.finalizado, color: "#059669", label: "Finalizado" }
          ];
          return '<div class="perf-item"><div class="perf-name">' + esc(d.nombre) + ' <span class="perf-pct">' + d.avance + '%</span></div>' +
            barHTML(bd, d.total) + '</div>';
        }).join("");
      }
    }

    const tbody = $("#perfTbody");
    if (tbody) {
      if (!data.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">Sin datos.</td></tr>';
      } else {
        tbody.innerHTML = data.map((d) =>
          '<tr><td><b>' + esc(d.nombre) + '</b></td><td>' + d.programado + '</td><td>' + d.reprogramado +
          '</td><td>' + d.finalizado + '</td><td style="color:#E11D48">' + d.vencido +
          '</td><td>' + d.total + '</td><td><span class="badge ' + (d.avance >= 80 ? "success" : d.avance >= 50 ? "warn" : "danger") + '">' + d.avance + '%</span></td></tr>'
        ).join("");
      }
    }
  }

  // ============================================================
  //  EQUIPOS - render
  // ============================================================
  function renderEquipos() {
    const search = ($("#searchEquipo") || {}).value || "";
    const filtroTipo = ($("#filterTipo") || {}).value || "";
    const q = search.toLowerCase();
    const visibles = equiposVisibles();

    const filtered = visibles.filter((eq) => {
      if (filtroTipo && eq.tipo !== filtroTipo) return false;
      if (!q) return true;
      return (eq.nombre || "").toLowerCase().includes(q) ||
        (eq.serie || "").toLowerCase().includes(q) ||
        (eq.marca || "").toLowerCase().includes(q) ||
        (eq.hostname || "").toLowerCase().includes(q) ||
        (eq.responsable || "").toLowerCase().includes(q) ||
        (eq.usuarioAsignado || "").toLowerCase().includes(q) ||
        (eq.codInventario || "").toLowerCase().includes(q) ||
        (eq.ubicacion || "").toLowerCase().includes(q);
    }).sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));

    const totalPages = Math.ceil(filtered.length / eqPageSize) || 1;
    if (eqPage > totalPages) eqPage = totalPages;
    const start = (eqPage - 1) * eqPageSize;
    const pageData = filtered.slice(start, start + eqPageSize);

    const list = $("#equipoList");
    const empty = $("#equipoEmpty");
    if (!filtered.length) {
      if (list) list.innerHTML = "";
      if (empty) empty.classList.remove("hidden");
      return;
    }
    if (empty) empty.classList.add("hidden");

    if (list) {
      list.innerHTML = pageData.map((eq) => {
        const est = statusOf(eq);
        const estColor = est === "vencido" ? "linear-gradient(135deg,#DC2626,#EF4444)" :
          est === "proximo" ? "linear-gradient(135deg,#D97706,#F59E0B)" : "var(--pri-grad)";
        const numMants = mantenimientos.filter((m) => m.equipoId === eq.id).length;
        return '<div class="item-card" data-equipo="' + eq.id + '">' +
          '<div class="item-avatar" style="background:' + estColor + '">&#128187;</div>' +
          '<div class="item-body"><div class="item-title">' + esc(eq.nombre || "Sin nombre") + '</div>' +
          '<div class="item-sub">' + esc(eq.marca || "") + ' ' + esc(eq.serie ? '\u00b7 S/N: ' + eq.serie : "") + '</div>' +
          '<div class="item-sub">' + esc(eq.usuarioAsignado || eq.responsable || "\u2014") + (eq.ubicacion ? ' \u00b7 ' + esc(eq.ubicacion) : "") + '</div></div>' +
          '<div class="item-meta">' +
          (est === "vencido" ? '<span class="badge danger">Vencido</span>' :
            est === "proximo" ? '<span class="badge warn">Proximo</span>' :
            '<span class="badge success">Al dia</span>') +
          '<div class="item-sub" style="margin-top:2px">' + numMants + ' mant.</div></div></div>';
      }).join("") + paginationHTML(filtered.length, eqPage, eqPageSize, "eq");
    }
  }

  // ============================================================
  //  EQUIPOS - formulario
  // ============================================================
  function openEquipoForm(id) {
    const eq = id ? equipos.find((x) => x.id === id) : null;
    const title = $("#modalEquipoTitle");
    if (title) title.textContent = eq ? "Editar equipo" : "Nuevo equipo";
    $("#eqId").value = eq ? eq.id : "";
    $("#eqNombre").value = eq ? eq.nombre || "" : "";
    $("#eqTipo").value = eq ? eq.tipo || "laptop" : "laptop";
    $("#eqMarca").value = eq ? eq.marca || "" : "";
    $("#eqCodInventario").value = eq ? eq.codInventario || "" : "";
    $("#eqDni").value = eq ? eq.dni || "" : "";
    $("#eqSerie").value = eq ? eq.serie || "" : "";
    $("#eqHostname").value = eq ? eq.hostname || "" : "";
    $("#eqDepartamento").value = eq ? eq.departamento || "" : "";
    $("#eqCargo").value = eq ? eq.cargo || "" : "";
    $("#eqUsuarioAsignado").value = eq ? eq.usuarioAsignado || "" : "";
    $("#eqArea").value = eq ? eq.area || "" : "";
    $("#eqUbicacion").value = eq ? eq.ubicacion || "" : "";
    $("#eqSO").value = eq ? eq.so || "" : "";
    $("#eqIP").value = eq ? eq.ip || "" : "";
    $("#eqFechaCompra").value = eq ? normFecha(eq.fechaCompra) : "";
    $("#eqIntervalo").value = eq ? eq.intervalo || appConfig.intervalo || 90 : (appConfig.intervalo || 90);
    $("#eqNotas").value = eq ? eq.notas || "" : "";

    // Llenar select de responsables
    const sel = $("#eqResponsable");
    if (sel) {
      sel.innerHTML = '<option value="">\u2014 Sin asignar \u2014</option>' +
        usuarios.sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""))
          .map((u) => '<option value="' + u.id + '" ' + (eq && eq.responsableId === u.id ? "selected" : "") + '>' + esc(u.nombre) + ' (' + esc(u.dni) + ')</option>')
          .join("");
      if (eq && eq.responsableId) sel.value = eq.responsableId;
    }

    // Info de mantenimientos si es edicion
    const infoBox = $("#eqDatosMant");
    if (infoBox) {
      if (eq) {
        const eqMant = mantenimientos.filter((m) => m.equipoId === eq.id);
        const ultMant = eqMant.sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""))[0];
        const proxDue = nextDueDate(eq);
        const diff = diffDays(todayISO(), proxDue);
        infoBox.classList.remove("hidden");
        infoBox.innerHTML = '<strong>Mantenimientos:</strong> ' + eqMant.length + ' registros<br>' +
          '<strong>Ultimo:</strong> ' + (ultMant ? fmtDate(ultMant.fecha) + " (" + (ultMant.tecnico || "\u2014") + ")" : "Ninguno") + '<br>' +
          '<strong>Proximo vencimiento:</strong> ' + fmtDate(proxDue) + ' ' +
          (diff < 0 ? '<span style="color:var(--danger)">(VENCIDO)</span>' : diff <= 15 ? '<span style="color:var(--warn)">(PROXIMO)</span>' : '');
      } else {
        infoBox.classList.add("hidden");
      }
    }

    openModal("modalEquipo");
  }

  async function saveEquipo() {
    const id = $("#eqId").value || uid();
    const nombre = ($("#eqNombre") || {}).value || "";
    if (!nombre.trim()) { toast("El nombre es obligatorio", "danger"); return; }

    const respId = ($("#eqResponsable") || {}).value || "";
    const respUser = respId ? usuarios.find((u) => u.id === respId) : null;

    const data = {
      id,
      nombre: nombre.trim(),
      tipo: ($("#eqTipo") || {}).value || "laptop",
      marca: ($("#eqMarca") || {}).value.trim(),
      codInventario: ($("#eqCodInventario") || {}).value.trim(),
      dni: ($("#eqDni") || {}).value.trim(),
      serie: ($("#eqSerie") || {}).value.trim(),
      hostname: ($("#eqHostname") || {}).value.trim(),
      departamento: ($("#eqDepartamento") || {}).value.trim(),
      responsableId: respId,
      responsable: respUser ? respUser.nombre : "",
      cargo: ($("#eqCargo") || {}).value.trim(),
      usuarioAsignado: ($("#eqUsuarioAsignado") || {}).value.trim(),
      area: ($("#eqArea") || {}).value.trim(),
      ubicacion: ($("#eqUbicacion") || {}).value.trim(),
      so: ($("#eqSO") || {}).value.trim(),
      ip: ($("#eqIP") || {}).value.trim(),
      fechaCompra: normFecha($("#eqFechaCompra").value),
      intervalo: Number($("#eqIntervalo").value) || appConfig.intervalo || 90,
      notas: ($("#eqNotas") || {}).value.trim(),
      fechaCreacion: normFecha($("#eqId").value ? ((equipos.find((e) => e.id === id) || {}).fechaCreacion || "") : "") || todayISO()
    };

    await DB.put("equipos", data);
    const esEdit = !!$("#eqId").value;
    await auditar(esEdit ? "EDITAR EQUIPO" : "NUEVO EQUIPO", data.nombre);
    toast(esEdit ? "Equipo actualizado" : "Equipo registrado");
    closeModal("modalEquipo");
    await reload();
    refreshView();
  }

  // ============================================================
  //  EQUIPOS - detalle
  // ============================================================
  function showEquipoDetalle(id) {
    currentDetailId = id;
    const eq = equipos.find((e) => e.id === id);
    if (!eq) return;

    const title = $("#detalleTitle");
    if (title) title.textContent = "Detalle - " + (eq.nombre || "Equipo");

    const est = statusOf(eq);
    const eqMant = mantenimientos.filter((m) => m.equipoId === eq.id)
      .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
    const proxDue = nextDueDate(eq);

    const info = $("#detalleInfo");
    if (info) {
      info.innerHTML =
        '<span class="dt">Nombre:</span><span class="dd">' + esc(eq.nombre) + '</span>' +
        '<span class="dt">Tipo:</span><span class="dd">' + esc(CAT_LABELS[eq.tipo] || eq.tipo) + '</span>' +
        '<span class="dt">Marca:</span><span class="dd">' + esc(eq.marca || "\u2014") + '</span>' +
        '<span class="dt">Serie:</span><span class="dd">' + esc(eq.serie || "\u2014") + '</span>' +
        '<span class="dt">Hostname:</span><span class="dd">' + esc(eq.hostname || "\u2014") + '</span>' +
        '<span class="dt">Cod. Inventario:</span><span class="dd">' + esc(eq.codInventario || "\u2014") + '</span>' +
        '<span class="dt">DNI:</span><span class="dd">' + esc(eq.dni || "\u2014") + '</span>' +
        '<span class="dt">Responsable:</span><span class="dd">' + esc(eq.responsable || eq.usuarioAsignado || "\u2014") + '</span>' +
        '<span class="dt">Departamento:</span><span class="dd">' + esc(eq.departamento || "\u2014") + '</span>' +
        '<span class="dt">Area:</span><span class="dd">' + esc(eq.area || "\u2014") + '</span>' +
        '<span class="dt">Ubicacion:</span><span class="dd">' + esc(eq.ubicacion || "\u2014") + '</span>' +
        '<span class="dt">Sistema Operativo:</span><span class="dd">' + esc(eq.so || "\u2014") + '</span>' +
        '<span class="dt">IP:</span><span class="dd">' + esc(eq.ip || "\u2014") + '</span>' +
        '<span class="dt">Fecha de compra:</span><span class="dd">' + fmtDate(eq.fechaCompra) + '</span>' +
        '<span class="dt">Intervalo:</span><span class="dd">' + (eq.intervalo || appConfig.intervalo || 90) + ' dias</span>' +
        '<span class="dt">Estado:</span><span class="dd">' +
          (est === "vencido" ? '<span class="badge danger">Vencido</span>' :
            est === "proximo" ? '<span class="badge warn">Proximo</span>' :
            '<span class="badge success">Al dia</span>') + '</span>' +
        '<span class="dt">Proximo vencimiento:</span><span class="dd">' + fmtDate(proxDue) + '</span>' +
        '<span class="dt">Total mantenimientos:</span><span class="dd">' + eqMant.length + '</span>' +
        (eq.notas ? '<span class="dt">Notas:</span><span class="dd">' + esc(eq.notas) + '</span>' : "");
    }

    // Historial
    const hist = $("#detalleHistorial");
    const histEmpty = $("#detalleHistEmpty");
    if (eqMant.length) {
      if (histEmpty) histEmpty.classList.add("hidden");
      if (hist) {
        hist.innerHTML = '<div class="table-wrap"><table class="data-table"><thead><tr>' +
          '<th>Fecha</th><th>Tipo</th><th>Estado</th><th>Responsable</th><th>Obs.</th></tr></thead><tbody>' +
          eqMant.map((m) => '<tr><td>' + fmtDate(m.fecha) + '</td><td>' + esc(m.tipoMant || m.tipo || "\u2014") +
            '</td><td>' + estadoBadge(estadoMant(m)) + '</td><td>' + esc(m.tecnico || m.responsable || "\u2014") +
            '</td><td>' + esc(m.observaciones || m.obs || "\u2014") + '</td></tr>').join("") +
          '</tbody></table></div>';
      }
    } else {
      if (histEmpty) histEmpty.classList.remove("hidden");
      if (hist) hist.innerHTML = "";
    }

    // Formulario rapido
    const mantForm = $("#detalleMantForm");
    if (mantForm) {
      if (puedeEditar()) {
        mantForm.classList.remove("hidden");
        mantForm.innerHTML = '<button class="btn btn-primary btn-block" id="btnNuevoMantDetalle">+ Registrar mantenimiento</button>';
        const btnNew = document.getElementById("btnNuevoMantDetalle");
        if (btnNew) btnNew.addEventListener("click", () => { closeModal("modalDetalle"); openMantForm(null, id); });
      } else {
        mantForm.classList.add("hidden");
      }
    }

    const btnEdit = $("#btnEditarEquipo");
    if (btnEdit) btnEdit.classList.toggle("hidden", !puedeEditar());
    const btnDel = $("#btnEliminarEquipo");
    if (btnDel) btnDel.classList.toggle("hidden", !esAdmin());
    const btnFmt = $("#btnFormato");
    if (btnFmt) btnFmt.classList.remove("hidden");

    openModal("modalDetalle");
  }

  async function deleteEquipo(id) {
    if (!confirm("\u00bfEliminar este equipo y todos sus mantenimientos?")) return;
    await DB.delete("equipos", id);
    const mants = mantenimientos.filter((m) => m.equipoId === id);
    for (const m of mants) await DB.delete("mantenimientos", m.id);
    await auditar("ELIMINAR EQUIPO", "ID: " + id);
    toast("Equipo eliminado");
    closeModal("modalDetalle");
    await reload();
    refreshView();
  }

  // ============================================================
  //  CHECKLIST DEFAULT
  // ============================================================
  const CHECKLIST_SOFT = [
    "Desfragmentacion de disco duro",
    "Limpieza de temporales",
    "Liberacion de espacio en el disco duro",
    "Limpieza de papelera de reciclaje"
  ];
  const CHECKLIST_HARD = [
    "Limpieza de RAM",
    "Limpieza de Disco Duro",
    "Limpieza de Placa y disipador",
    "Se anadio pasta termica al procesador",
    "Limpieza de Fuente de poder"
  ];

  function renderChecklist(containerId, items, checked) {
    const el = $(containerId);
    if (!el) return;
    const checkedArr = Array.isArray(checked) ? checked : [];
    el.innerHTML = items.map((item) => {
      const isChecked = checkedArr.includes(item);
      return '<label class="check-item"><input type="checkbox" value="' + esc(item) + '" ' + (isChecked ? "checked" : "") + ' /><span>' + esc(item) + '</span></label>';
    }).join("");
  }

  function getCheckedChecklist(containerId) {
    const el = $(containerId);
    if (!el) return [];
    return Array.from(el.querySelectorAll('input[type=checkbox]:checked')).map((cb) => cb.value);
  }

  // ============================================================
  //  MANTENIMIENTOS - render
  // ============================================================
  function renderMantenimientos() {
    // Llenar filtros
    const selUsuario = $("#filterUsuarioMant");
    const selUbicacion = $("#filterUbicacion");
    const selEquipo = $("#filterEquipo");

    if (selUsuario) {
      const prev = selUsuario.value;
      const tecnicos = new Set();
      mantenimientos.forEach((m) => tecnicos.add(m.tecnico || m.responsable || "Sin asignar"));
      selUsuario.innerHTML = '<option value="">Todos los usuarios</option>' +
        [...tecnicos].sort().map((t) => '<option value="' + esc(t) + '">' + esc(t) + '</option>').join("");
      if ([...selUsuario.options].some((o) => o.value === prev)) selUsuario.value = prev;
    }

    if (selUbicacion) {
      const prev = selUbicacion.value;
      const ubics = new Set();
      equipos.forEach((eq) => { if (eq.ubicacion) ubics.add(eq.ubicacion); });
      selUbicacion.innerHTML = '<option value="">Todas las ubicaciones</option>' +
        [...ubics].sort().map((u) => '<option value="' + esc(u) + '">' + esc(u) + '</option>').join("");
      if ([...selUbicacion.options].some((o) => o.value === prev)) selUbicacion.value = prev;
    }

    if (selEquipo) {
      const prev = selEquipo.value;
      const tipos = new Set();
      equipos.forEach((eq) => { if (eq.tipo) tipos.add(eq.tipo); });
      selEquipo.innerHTML = '<option value="">Todos los tipos</option>' +
        [...tipos].sort().map((t) => '<option value="' + esc(t) + '">' + esc(CAT_LABELS[t] || t) + '</option>').join("");
      if ([...selEquipo.options].some((o) => o.value === prev)) selEquipo.value = prev;
    }

    const filtroUsuario = selUsuario ? selUsuario.value : "";
    const filtroUbicacion = selUbicacion ? selUbicacion.value : "";
    const filtroTipoEq = selEquipo ? selEquipo.value : "";
    const filtroTipoMant = ($("#filterTipoMant") || {}).value || "";
    const filtroEstado = ($("#filterEstadoMant") || {}).value || "";
    const desde = normFecha($("#filterFechaDesde").value);
    const hasta = normFecha($("#filterFechaHasta").value);

    const eqIdSet = new Set(equiposVisibles().map((eq) => eq.id));

    let filtered = mantenimientos.filter((m) => {
      if (!eqIdSet.has(m.equipoId)) return false;
      const eq = equipos.find((e) => e.id === m.equipoId);
      if (!eq) return false;
      if (filtroUsuario && (m.tecnico || m.responsable || "Sin asignar") !== filtroUsuario) return false;
      if (filtroUbicacion && (eq.ubicacion || "") !== filtroUbicacion) return false;
      if (filtroTipoEq && (eq.tipo || "") !== filtroTipoEq) return false;
      if (filtroTipoMant && (m.tipoMant || m.tipo || "") !== filtroTipoMant) return false;
      if (filtroEstado && estadoMant(m) !== filtroEstado) return false;
      if (desde) { const f = normFecha(m.fecha); if (!f || f < desde) return false; }
      if (hasta) { const f = normFecha(m.fecha); if (!f || f > hasta) return false; }
      return true;
    }).sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));

    const totalPages = Math.ceil(filtered.length / mantPageSize) || 1;
    if (mantPage > totalPages) mantPage = totalPages;
    const start = (mantPage - 1) * mantPageSize;
    const pageData = filtered.slice(start, start + mantPageSize);

    const list = $("#mantList");
    const empty = $("#mantEmpty");
    if (!filtered.length) {
      if (list) list.innerHTML = "";
      if (empty) empty.classList.remove("hidden");
      return;
    }
    if (empty) empty.classList.add("hidden");

    if (list) {
      list.innerHTML = pageData.map((m) => {
        const eq = equipos.find((e) => e.id === m.equipoId);
        const est = estadoMant(m);
        return '<div class="item-card" data-mant="' + m.id + '">' +
          '<div class="item-avatar">&#128295;</div>' +
          '<div class="item-body"><div class="item-title">' + esc(eq ? eq.nombre : "Equipo eliminado") + '</div>' +
          '<div class="item-sub">' + fmtDate(m.fecha) + ' \u00b7 ' + esc(m.tipoMant || m.tipo || "\u2014") + ' \u00b7 ' + esc(m.tecnico || m.responsable || "\u2014") + '</div>' +
          '<div class="item-sub">' + esc(m.observaciones || m.obs || "") + '</div></div>' +
          '<div class="item-meta">' + estadoBadge(est) + '</div></div>';
      }).join("") + paginationHTML(filtered.length, mantPage, mantPageSize, "mant");
    }
  }

  // ============================================================
  //  MANTENIMIENTOS - formulario
  // ============================================================
  function openMantForm(id, equipoId) {
    const mant = id ? mantenimientos.find((x) => x.id === id) : null;
    const title = $("#modalMantTitle");
    if (title) title.textContent = mant ? "Editar mantenimiento" : "Registrar mantenimiento";
    $("#mtId").value = mant ? mant.id : "";

    const sel = $("#mtEquipo");
    if (sel) {
      const visibles = equiposVisibles();
      sel.innerHTML = visibles.map((eq) =>
        '<option value="' + eq.id + '" ' + ((mant && mant.equipoId === eq.id) || (equipoId && equipoId === eq.id) ? "selected" : "") + '>' + esc(eq.nombre) + ' (' + esc(eq.marca || "") + ' ' + esc(eq.serie || "") + ')</option>'
      ).join("");
      if (!visibles.length) sel.innerHTML = '<option value="">Sin equipos</option>';
      if (equipoId) sel.value = equipoId;
    }

    $("#mtFecha").value = mant ? normFecha(mant.fecha) : todayISO();
    $("#mtTipo").value = mant ? (mant.tipoMant || mant.tipo || "preventivo") : "preventivo";
    $("#mtPrioridad").value = mant ? (mant.prioridad || "") : "";
    $("#mtFechaReprog").value = mant ? normFecha(mant.fechaReprog) : "";
    $("#mtFechaReal").value = mant ? normFecha(mant.fechaReal) : "";
    $("#mtEstado").value = mant ? (mant.estado || "finalizado") : "finalizado";
    $("#mtTecnico").value = mant ? (mant.tecnico || mant.responsable || "") : (sesion ? sesion.nombre : "");
    $("#mtCosto").value = mant ? (mant.costo || "") : "";
    $("#mtProxima").value = mant ? normFecha(mant.fechaProxima) : "";
    $("#mtObs").value = mant ? (mant.observaciones || mant.obs || "") : "";

    const softChecked = mant ? (mant.checklistSoft || []) : [];
    const hardChecked = mant ? (mant.checklistHard || []) : [];
    const allChecked = mant ? (mant.checklist || []) : [];
    renderChecklist("#checklistSoft", CHECKLIST_SOFT, allChecked.length ? allChecked : softChecked);
    renderChecklist("#checklistHard", CHECKLIST_HARD, allChecked.length ? [] : hardChecked);

    if (!mant && !equipoId) {
      const selEq = $("#mtEquipo");
      if (selEq && selEq.value) {
        const eq = equipos.find((e) => e.id === selEq.value);
        if (eq) {
          const intervalo = Number(eq.intervalo || appConfig.intervalo || 90);
          $("#mtProxima").value = addDays(todayISO(), intervalo);
        }
      }
    }

    openModal("modalMant");
  }

  async function saveMant() {
    const equipoId = ($("#mtEquipo") || {}).value;
    const fecha = normFecha($("#mtFecha").value);
    if (!equipoId) { toast("Selecciona un equipo", "danger"); return; }
    if (!fecha) { toast("La fecha es obligatoria", "danger"); return; }

    const id = $("#mtId").value || uid();
    const tipoMant = ($("#mtTipo") || {}).value || "preventivo";
    const estado = ($("#mtEstado") || {}).value || "finalizado";
    const intervalo = appConfig.intervalo || 90;

    const checklistSoft = getCheckedChecklist("#checklistSoft");
    const checklistHard = getCheckedChecklist("#checklistHard");

    const data = {
      id,
      equipoId,
      fecha,
      tipoMant,
      tipo: tipoMant,
      prioridad: ($("#mtPrioridad") || {}).value || "",
      fechaReprog: normFecha($("#mtFechaReprog").value),
      fechaReal: normFecha($("#mtFechaReal").value),
      estado,
      checklistSoft,
      checklistHard,
      checklist: checklistSoft.concat(checklistHard),
      tecnico: ($("#mtTecnico") || {}).value.trim(),
      responsable: ($("#mtTecnico") || {}).value.trim(),
      costo: Number($("#mtCosto").value) || 0,
      fechaProxima: normFecha($("#mtProxima").value) || addDays(fecha, intervalo),
      observaciones: ($("#mtObs") || {}).value.trim(),
      obs: ($("#mtObs") || {}).value.trim(),
      fechaCreacion: normFecha($("#mtId").value ? ((mantenimientos.find((m) => m.id === id) || {}).fechaCreacion || "") : "") || todayISO()
    };

    await DB.put("mantenimientos", data);
    const esEdit = !!$("#mtId").value;
    const eq = equipos.find((e) => e.id === equipoId);
    await auditar(esEdit ? "EDITAR MANTENIMIENTO" : "NUEVO MANTENIMIENTO",
      (eq ? eq.nombre : equipoId) + " - " + fecha);
    toast(esEdit ? "Mantenimiento actualizado" : "Mantenimiento registrado");
    closeModal("modalMant");
    await reload();
    refreshView();
  }

  // ============================================================
  //  ALERTAS
  // ============================================================
  function renderAlertas() {
    const filtroTipoDias = ($("#filterAlertaTipo") || {}).value || "7";
    const filtroResp = ($("#filterAlertaResp") || {}).value || "";
    const search = ($("#searchAlerta") || {}).value || "";
    const q = search.toLowerCase();
    const dias = Number(filtroTipoDias);

    const selResp = $("#filterAlertaResp");
    if (selResp) {
      const prev = selResp.value;
      const tecnicos = new Set();
      mantenimientos.forEach((m) => tecnicos.add(m.tecnico || m.responsable || "Sin asignar"));
      selResp.innerHTML = '<option value="">Todos los responsables</option>' +
        [...tecnicos].sort().map((t) => '<option value="' + esc(t) + '">' + esc(t) + '</option>').join("");
      if ([...selResp.options].some((o) => o.value === prev)) selResp.value = prev;
    }

    const visibles = equiposVisibles();
    let alertas = [];

    if (alertTab === "vencidos") {
      visibles.forEach((eq) => {
        const proxDue = nextDueDate(eq);
        const diff = diffDays(todayISO(), proxDue);
        if (diff < 0) {
          if (filtroResp) {
            const eqMant = mantenimientos.filter((m) => m.equipoId === eq.id);
            const lastMant = eqMant.sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""))[0];
            const resp = lastMant ? (lastMant.tecnico || lastMant.responsable || "") : "";
            if (resp !== filtroResp) return;
          }
          if (q && !(eq.nombre || "").toLowerCase().includes(q) && !(eq.serie || "").toLowerCase().includes(q) &&
              !(eq.hostname || "").toLowerCase().includes(q) && !(eq.usuarioAsignado || "").toLowerCase().includes(q) &&
              !(eq.responsable || "").toLowerCase().includes(q)) return;
          alertas.push({ equipo: eq, diasVencidos: Math.abs(diff), proxDue, tipo: "vencido" });
        }
      });
      alertas.sort((a, b) => b.diasVencidos - a.diasVencidos);
    } else {
      visibles.forEach((eq) => {
        const proxDue = nextDueDate(eq);
        const diff = diffDays(todayISO(), proxDue);
        if (diff >= 0 && diff <= dias) {
          if (filtroResp) {
            const eqMant = mantenimientos.filter((m) => m.equipoId === eq.id);
            const lastMant = eqMant.sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""))[0];
            const resp = lastMant ? (lastMant.tecnico || lastMant.responsable || "") : "";
            if (resp !== filtroResp) return;
          }
          if (q && !(eq.nombre || "").toLowerCase().includes(q) && !(eq.serie || "").toLowerCase().includes(q) &&
              !(eq.hostname || "").toLowerCase().includes(q) && !(eq.usuarioAsignado || "").toLowerCase().includes(q) &&
              !(eq.responsable || "").toLowerCase().includes(q)) return;
          alertas.push({ equipo: eq, diasRestantes: diff, proxDue, tipo: "proximo" });
        }
      });
      alertas.sort((a, b) => a.diasRestantes - b.diasRestantes);
    }

    const totalPages = Math.ceil(alertas.length / alertPageSize) || 1;
    if (alertPage > totalPages) alertPage = totalPages;
    const start = (alertPage - 1) * alertPageSize;
    const pageData = alertas.slice(start, start + alertPageSize);

    const list = $("#alertFullList");
    const empty = $("#alertFullEmpty");
    if (!alertas.length) {
      if (list) list.innerHTML = "";
      if (empty) empty.classList.remove("hidden");
      return;
    }
    if (empty) empty.classList.add("hidden");

    if (list) {
      list.innerHTML = pageData.map((a) => {
        const eq = a.equipo;
        const badge = a.tipo === "vencido"
          ? '<span class="badge danger">Vencido ' + a.diasVencidos + ' dia' + (a.diasVencidos !== 1 ? "s" : "") + '</span>'
          : '<span class="badge warn">En ' + a.diasRestantes + ' dia' + (a.diasRestantes !== 1 ? "s" : "") + '</span>';
        return '<div class="item-card" data-equipo="' + eq.id + '">' +
          '<div class="item-avatar" style="background:' + (a.tipo === "vencido" ? "linear-gradient(135deg,#DC2626,#EF4444)" : "linear-gradient(135deg,#D97706,#F59E0B)") + '">&#128276;</div>' +
          '<div class="item-body"><div class="item-title">' + esc(eq.nombre || "Sin nombre") + '</div>' +
          '<div class="item-sub">' + esc(eq.marca || "") + ' \u00b7 ' + esc(eq.serie || "") + ' \u00b7 ' + esc(eq.hostname || "") + '</div>' +
          '<div class="item-sub">Asignado a: ' + esc(eq.usuarioAsignado || eq.responsable || "\u2014") + ' \u00b7 ' + esc(eq.ubicacion || "") + '</div></div>' +
          '<div class="item-meta">' + badge + '<div class="item-sub" style="margin-top:2px">Vence: ' + fmtDate(a.proxDue) + '</div></div></div>';
      }).join("") + paginationHTML(alertas.length, alertPage, alertPageSize, "alert");
    }
  }

  // ============================================================
  //  CONFIGURACION
  // ============================================================
  function renderConfig() {
    if (sesion) {
      const mci = $("#miCuentaInfo");
      if (mci) mci.textContent = sesion.nombre + " \u00b7 DNI: " + sesion.dni + " \u00b7 Rol: " + rolNombre(sesion.rol);
      const u = usuarios.find((x) => String(x.id) === String(sesion.id));
      const status2FA = $("#mi2FAStatus");
      if (status2FA && u) {
        status2FA.innerHTML = u.totpEnabled ? '<span style="color:#059669">2FA activo</span>' : '<span style="color:#94A3B8">2FA desactivado</span>';
      }
    }

    if ($("#cfgEmpresa")) $("#cfgEmpresa").value = appConfig.empresa || "";
    if ($("#cfgIntervalo")) $("#cfgIntervalo").value = appConfig.intervalo || 90;

    renderUsuariosList();

    // Auditoria
    const aList = $("#auditoriaList");
    const aEmpty = $("#auditoriaEmpty");
    if (auditoria.length) {
      if (aEmpty) aEmpty.classList.add("hidden");
      if (aList) {
        aList.innerHTML = auditoria.slice(0, 50).map((a) =>
          '<div class="audit-item"><span class="audit-fecha">' + fmtDate(a.fecha) + ' ' + (a.hora || "") +
          '</span><span class="audit-accion"> \u00b7 ' + esc(a.accion) + '</span>' +
          (a.usuario ? ' <span class="audit-detalle">\u00b7 ' + esc(a.usuario) + '</span>' : "") +
          (a.detalle ? ' <span class="audit-detalle">\u00b7 ' + esc(a.detalle) + '</span>' : "") +
          '</div>'
        ).join("");
      }
    } else {
      if (aEmpty) aEmpty.classList.remove("hidden");
      if (aList) aList.innerHTML = "";
    }

    const v = CFG.APP_VERSION || "1.0.0";
    if ($("#appVersion")) $("#appVersion").textContent = v;
    if ($("#acercaInfo")) $("#acercaInfo").textContent = "\u2764\ufe0f Hecho con \u2764\ufe0f \u00b7 v" + v;

    renderFeriadosList();

    // Correo - ubicaciones
    const correoUbic = $("#correoUbicacion");
    if (correoUbic) {
      const ubics = new Set();
      equipos.forEach((eq) => { if (eq.ubicacion) ubics.add(eq.ubicacion); });
      correoUbic.innerHTML = '<option value="">Todas las ubicaciones</option>' +
        [...ubics].sort().map((u) => '<option value="' + esc(u) + '">' + esc(u) + '</option>').join("");
    }
  }

  // ---- Usuarios ----
  function renderUsuariosList() {
    const list = $("#usuariosList");
    if (!list) return;
    list.innerHTML = usuarios.map((u) =>
      '<div class="usuario-item"><div><b>' + esc(u.nombre) + '</b> \u00b7 DNI: ' + esc(u.dni) +
      ' \u00b7 <span class="badge ' + (u.rol === 2 ? "neutral" : u.rol === 1 ? "info" : "gray") + '">' + rolNombre(u.rol) + '</span></div>' +
      '<div><button class="btn btn-ghost btn-sm" data-edit-user="' + u.id + '">Editar</button></div></div>'
    ).join("");
  }

  function openUsuarioForm(id) {
    const u = id ? usuarios.find((x) => x.id === id) : null;
    const title = $("#modalUsuarioTitle");
    if (title) title.textContent = u ? "Editar usuario" : "Nuevo usuario";
    $("#usId").value = u ? u.id : "";
    $("#usNombre").value = u ? u.nombre : "";
    $("#usDni").value = u ? u.dni : "";
    $("#usClave").value = u ? u.clave : "";
    $("#usRol").value = u ? u.rol : "0";
    const btnDel = $("#btnEliminarUsuario");
    if (btnDel) btnDel.classList.toggle("hidden", !u || u.id === "us-admin");
    openModal("modalUsuario");
  }

  async function saveUsuario() {
    const id = $("#usId").value || uid();
    const nombre = ($("#usNombre") || {}).value.trim();
    const dni = ($("#usDni") || {}).value.trim();
    if (!nombre || !dni) { toast("Nombre y DNI son obligatorios", "danger"); return; }
    const data = {
      id, nombre, dni,
      clave: ($("#usClave") || {}).value.trim() || dni,
      rol: parseInt(($("#usRol") || {}).value)
    };
    await DB.putUsuario(data);
    toast($("#usId").value ? "Usuario actualizado" : "Usuario creado");
    closeModal("modalUsuario");
    await reload();
    renderUsuariosList();
  }

  async function deleteUsuario(id) {
    if (!confirm("\u00bfEliminar este usuario?")) return;
    await DB.deleteUsuario(id);
    toast("Usuario eliminado");
    closeModal("modalUsuario");
    await reload();
    renderUsuariosList();
  }

  // ---- Guardar configuracion ----
  async function saveBusinessConfig() {
    await DB.setConfig("empresa", ($("#cfgEmpresa") || {}).value.trim());
    await DB.setConfig("intervalo", Number(($("#cfgIntervalo") || {}).value) || 90);
    appConfig = await DB.getConfig();
    if (appConfig.empresa) { const bn = $("#brandName"); if (bn) bn.textContent = appConfig.empresa; }
    toast("Configuracion guardada");
    auditar("CONFIGURACION", "Datos de empresa actualizados");
  }

  // ---- Logo ----
  function handleLogoFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      const b64 = e.target.result.replace(/^data:image\/[^;]+;base64,/, "");
      appConfig.logo = b64;
      const prev = $("#logoPreview");
      if (prev) { prev.src = e.target.result; prev.classList.remove("hidden"); }
    };
    reader.readAsDataURL(file);
  }

  async function saveLogo() {
    await DB.setConfig("logo", appConfig.logo || "");
    applyLogoToUI(appConfig.logo);
    toast("Logo guardado");
  }

  async function clearLogo() {
    appConfig.logo = "";
    await DB.setConfig("logo", "");
    applyLogoToUI("");
    const prev = $("#logoPreview");
    if (prev) prev.classList.add("hidden");
    toast("Logo eliminado");
  }

  // ============================================================
  //  FERIADOS
  // ============================================================
  function renderFeriadosList() {
    const list = $("#feriadosList");
    if (!list) return;
    if (!feriados.length) {
      list.innerHTML = '<p class="card-text">Sin feriados registrados.</p>';
      return;
    }
    list.innerHTML = feriados.sort((a, b) => (a.fecha || "").localeCompare(b.fecha || "")).map((f) =>
      '<div class="usuario-item"><div><b>' + fmtDate(f.fecha) + '</b> \u00b7 ' + esc(f.tipo || "\u2014") + ' \u00b7 ' + esc(f.motivo || "\u2014") + '</div>' +
      '<div><button class="btn btn-ghost btn-sm" data-del-feriado="' + f.id + '">&#10005;</button></div></div>'
    ).join("");
  }

  async function agregarFeriado() {
    const fecha = normFecha($("#fdFecha").value);
    if (!fecha) { toast("Ingresa la fecha", "danger"); return; }
    const tipo = ($("#fdTipo") || {}).value.trim();
    const motivo = ($("#fdMotivo") || {}).value.trim();
    const data = { id: uid(), fecha, tipo, motivo };
    await DB.put("feriados", data);
    feriados.push(data);
    await auditar("AGREGAR FERIADO", fecha + " - " + motivo);
    toast("Feriado agregado");
    $("#fdFecha").value = "";
    if ($("#fdTipo")) $("#fdTipo").value = "";
    if ($("#fdMotivo")) $("#fdMotivo").value = "";
    renderFeriadosList();
  }

  async function eliminarFeriado(id) {
    await DB.delete("feriados", id);
    feriados = feriados.filter((f) => f.id !== id);
    toast("Feriado eliminado");
    renderFeriadosList();
  }

  // ============================================================
  //  PROGRAMACION DE MANTENIMIENTOS
  // ============================================================
  function programarMantenimientos() {
    const fechaInicial = normFecha($("#progFechaInicial").value);
    if (!fechaInicial) { toast("Selecciona la fecha inicial", "danger"); return; }
    const visibles = equiposVisibles();
    if (!visibles.length) { toast("No hay equipos para programar", "danger"); return; }

    const respMap = {};
    visibles.forEach((eq) => {
      const resp = eq.responsable || eq.usuarioAsignado || "Sin asignar";
      if (!respMap[resp]) respMap[resp] = [];
      respMap[resp].push(eq);
    });

    const feriadosSet = new Set(feriados.map((f) => normFecha(f.fecha)));
    const intervalo = appConfig.intervalo || 90;
    let programados = 0;

    Object.entries(respMap).forEach(([resp, eqs]) => {
      let fecha = new Date(fechaInicial + "T00:00:00");
      let eqIdx = 0;
      const MAX_PER_DAY = 3;

      while (eqIdx < eqs.length) {
        const dow = fecha.getDay();
        if (dow === 0 || dow === 6) { fecha.setDate(fecha.getDate() + 1); continue; }
        const fechaStr = toISODate(fecha);
        if (feriadosSet.has(fechaStr)) { fecha.setDate(fecha.getDate() + 1); continue; }

        let diaCount = 0;
        while (eqIdx < eqs.length && diaCount < MAX_PER_DAY) {
          const eq = eqs[eqIdx];
          const mant = {
            id: uid(), equipoId: eq.id, fecha: fechaStr,
            tipoMant: "preventivo", tipo: "preventivo", estado: "programado",
            tecnico: resp, responsable: resp,
            fechaProxima: addDays(fechaStr, intervalo),
            observaciones: "Programado automaticamente",
            obs: "Programado automaticamente",
            checklist: [], checklistSoft: [], checklistHard: [],
            costo: 0, fechaCreacion: todayISO()
          };
          DB.put("mantenimientos", mant);
          programados++;
          eqIdx++;
          diaCount++;
        }
        fecha.setDate(fecha.getDate() + 1);
      }
    });

    auditar("PROGRAMAR MANTENIMIENTOS", programados + " mantenimientos programados");
    toast(programados + " mantenimientos programados");
    setTimeout(async () => { await reload(); renderConfig(); }, 500);
  }

  // ============================================================
  //  CORREO DE PROGRAMACION
  // ============================================================
  function actualizarCorreoEquipos() {
    const ubicacion = ($("#correoUbicacion") || {}).value;
    const tbody = $("#correoTbody");
    if (!tbody) return;
    const filtered = equiposVisibles().filter((eq) => !ubicacion || eq.ubicacion === ubicacion)
      .sort((a, b) => (a.ubicacion || "").localeCompare(b.ubicacion || ""));
    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty-cell">Sin equipos para esta ubicacion.</td></tr>';
      return;
    }
    tbody.innerHTML = filtered.map((eq) => {
      const proxDue = nextDueDate(eq);
      return '<tr><td>' + esc(eq.usuarioAsignado || eq.responsable || "\u2014") + '</td>' +
        '<td>' + esc(eq.ubicacion || "\u2014") + '</td>' +
        '<td>' + esc(eq.responsable || "\u2014") + '</td>' +
        '<td>' + fmtDate(proxDue) + '</td></tr>';
    }).join("");
  }

  function enviarCorreo() {
    const asunto = ($("#correoAsunto") || {}).value || "";
    let cuerpo = ($("#correoCuerpo") || {}).value || "";
    const ubicacion = ($("#correoUbicacion") || {}).value;
    const filtered = equiposVisibles().filter((eq) => !ubicacion || eq.ubicacion === ubicacion);
    const tablaEquipos = filtered.map((eq) => {
      const proxDue = nextDueDate(eq);
      return (eq.usuarioAsignado || eq.responsable || "\u2014") + " | " + (eq.ubicacion || "\u2014") + " | " + (eq.responsable || "\u2014") + " | " + fmtDate(proxDue);
    }).join("\n");
    const cuerpoFinal = cuerpo + "\n\nDetalle de equipos:\n" + tablaEquipos;
    const mailto = "mailto:?subject=" + encodeURIComponent(asunto) + "&body=" + encodeURIComponent(cuerpoFinal);
    window.open(mailto);
  }

  // ============================================================
  //  SINCRONIZACION (Firebase)
  // ============================================================
  async function syncSubir() {
    try {
      const url = CFG.SYNC_URL + "/" + CFG.SYNC_TOKEN + ".json?auth=" + CFG.SYNC_SECRET;
      const data = {
        equipos: equipos,
        mantenimientos: mantenimientos,
        usuarios: usuarios,
        feriados: feriados,
        appConfig: appConfig,
        _syncDate: todayISO(),
        _version: CFG.APP_VERSION
      };
      const resp = await fetch(url, { method: "PUT", body: JSON.stringify(data) });
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      await auditar("SINCRONIZAR SUBIR", "Datos subidos a la nube");
      toast("Datos subidos a la nube");
    } catch (e) {
      toast("Error al subir: " + e.message, "danger");
    }
  }

  async function syncBajar() {
    try {
      const url = CFG.SYNC_URL + "/" + CFG.SYNC_TOKEN + ".json?auth=" + CFG.SYNC_SECRET;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      const raw = await resp.json();
      if (!raw) { toast("No hay datos en la nube", "danger"); return; }
      const data = (raw.db && typeof raw.db === "object") ? raw.db : raw;

      if (data.equipos && Array.isArray(data.equipos)) await DB.bulkPut("equipos", data.equipos);
      if (data.mantenimientos && Array.isArray(data.mantenimientos)) await DB.bulkPut("mantenimientos", data.mantenimientos);
      if (data.usuarios && Array.isArray(data.usuarios)) {
        const localUsers = await DB.getAll("usuarios");
        const localMap = {};
        localUsers.forEach((lu) => { localMap[String(lu.id)] = lu; });
        const merged = data.usuarios.map((cu) => {
          const existing = localMap[String(cu.id)];
          if (existing && existing.clave) { cu.clave = existing.clave; }
          return cu;
        });
        await DB.bulkPut("usuarios", merged);
      }
      if (data.feriados && Array.isArray(data.feriados)) await DB.bulkPut("feriados", data.feriados);
      if (data.appConfig) {
        for (const [k, v] of Object.entries(data.appConfig)) {
          await DB.setConfig(k, v);
        }
      }

      await reload();
      await auditar("SINCRONIZAR BAJAR", "Datos descargados de la nube");
      toast("Datos descargados de la nube");
      refreshView();
    } catch (e) {
      toast("Error al bajar: " + e.message, "danger");
    }
  }

  async function sincronizarTodo() {
    toast("Sincronizando...");
    await syncSubir();
    await syncBajar();
    toast("Sincronizacion completada");
  }

  // ============================================================
  //  CARGAS MASIVAS (Excel)
  // ============================================================
  function loadExcelLib() {
    return new Promise((resolve, reject) => {
      if (window.XLSX) return resolve(window.XLSX);
      const s = document.createElement("script");
      s.src = "https://cdn.sheetjs.com/xlsx-0.20.0/package/dist/xlsx.full.min.js";
      s.onload = () => resolve(window.XLSX);
      s.onerror = () => reject(new Error("No se pudo cargar la libreria Excel"));
      document.head.appendChild(s);
    });
  }

  function showMasivaResultado(msg) {
    const el = $("#masivaResultado");
    if (el) { el.textContent = msg; el.classList.remove("hidden"); }
  }

  async function importResponsables() {
    try {
      const XLSX = await loadExcelLib();
      const fileInput = $("#fileMasiva");
      fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const data = await file.arrayBuffer();
          const wb = XLSX.read(data, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(ws);
          let created = 0, updated = 0, errors = [];
          for (const row of rows) {
            const nombre = (row["Nombre"] || row["nombre"] || "").trim();
            const dni = (row["DNI"] || row["dni"] || "").trim();
            if (!nombre || !dni) { errors.push("Fila sin nombre/DNI"); continue; }
            const existente = usuarios.find((u) => u.dni === dni);
            if (existente) {
              existente.nombre = nombre;
              existente.departamento = (row["Departamento"] || row["departamento"] || "").trim();
              existente.cargo = (row["Cargo"] || row["cargo"] || "").trim();
              existente.email = (row["Email"] || row["email"] || "").trim();
              await DB.putUsuario(existente);
              updated++;
            } else {
              const u = {
                id: uid(), nombre, dni, clave: dni,
                rol: ROL.EDICION,
                departamento: (row["Departamento"] || row["departamento"] || "").trim(),
                cargo: (row["Cargo"] || row["cargo"] || "").trim(),
                email: (row["Email"] || row["email"] || "").trim()
              };
              await DB.putUsuario(u);
              created++;
            }
          }
          await auditar("IMPORTAR RESPONSABLES", created + " creados, " + updated + " actualizados");
          showMasivaResultado("Responsables: " + created + " creados, " + updated + " actualizados." + (errors.length ? "\nErrores: " + errors.join("; ") : ""));
          await reload();
          renderConfig();
          toast("Responsables importados");
        } catch (err) {
          showMasivaResultado("Error: " + err.message);
        }
      };
      fileInput.value = "";
      fileInput.click();
    } catch (e) { toast(e.message, "danger"); }
  }

  async function importEquipos() {
    try {
      const XLSX = await loadExcelLib();
      const fileInput = $("#fileMasiva");
      fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const data = await file.arrayBuffer();
          const wb = XLSX.read(data, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(ws);
          let created = 0, updated = 0, errors = [];
          const tipoMap = { laptop: "laptop", desktop: "desktop", escritorio: "desktop", "allinone": "allinone", servidor: "servidor" };
          for (const row of rows) {
            const nombre = (row["Nombre"] || row["nombre"] || row["Equipo"] || row["equipo"] || "").trim();
            if (!nombre) { errors.push("Fila sin nombre"); continue; }
            const tipo = (row["Tipo"] || row["tipo"] || "laptop").trim().toLowerCase();
            const tipoFinal = tipoMap[tipo] || "laptop";
            const serie = (row["Serie"] || row["serie"] || row["No. Serie"] || "").trim();
            const existente = equipos.find((e) => (e.serie && e.serie === serie) || e.nombre === nombre);
            const eqData = {
              id: existente ? existente.id : uid(),
              nombre,
              tipo: tipoFinal,
              marca: (row["Marca"] || row["marca"] || "").trim(),
              serie: serie,
              hostname: (row["Hostname"] || row["hostname"] || "").trim(),
              codInventario: (row["Cod. Inventario"] || row["codInventario"] || "").trim(),
              dni: (row["DNI"] || row["dni"] || "").trim(),
              departamento: (row["Departamento"] || row["departamento"] || "").trim(),
              responsable: (row["Responsable"] || row["responsable"] || row["Usuario"] || "").trim(),
              usuarioAsignado: (row["Usuario Asignado"] || row["usuarioAsignado"] || row["Usuario"] || "").trim(),
              ubicacion: (row["Ubicacion"] || row["ubicacion"] || "").trim(),
              so: (row["SO"] || row["so"] || row["Sistema Operativo"] || "").trim(),
              ip: (row["IP"] || row["ip"] || "").trim(),
              area: (row["Area"] || row["area"] || "").trim(),
              cargo: (row["Cargo"] || row["cargo"] || "").trim(),
              intervalo: Number(row["Intervalo"] || row["intervalo"] || appConfig.intervalo || 90),
              notas: (row["Notas"] || row["notas"] || "").trim(),
              fechaCompra: normFecha(row["Fecha Compra"] || row["fechaCompra"] || ""),
              fechaCreacion: existente ? (existente.fechaCreacion || todayISO()) : todayISO()
            };
            // Resolver responsableId
            const respUser = usuarios.find((u) => (u.nombre || "").toLowerCase() === eqData.responsable.toLowerCase() || (u.dni || "").toLowerCase() === eqData.dni.toLowerCase());
            if (respUser) eqData.responsableId = respUser.id;
            await DB.put("equipos", eqData);
            if (existente) updated++; else created++;
          }
          await auditar("IMPORTAR EQUIPOS", created + " creados, " + updated + " actualizados");
          showMasivaResultado("Equipos: " + created + " creados, " + updated + " actualizados." + (errors.length ? "\nErrores: " + errors.join("; ") : ""));
          await reload();
          renderConfig();
          toast("Equipos importados");
        } catch (err) { showMasivaResultado("Error: " + err.message); }
      };
      fileInput.value = "";
      fileInput.click();
    } catch (e) { toast(e.message, "danger"); }
  }

  async function importMantenimientos() {
    try {
      const XLSX = await loadExcelLib();
      const fileInput = $("#fileMasiva");
      fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const data = await file.arrayBuffer();
          const wb = XLSX.read(data, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(ws);
          let created = 0, errors = [];
          for (const row of rows) {
            const eqNombre = (row["Equipo"] || row["equipo"] || row["Nombre Equipo"] || "").trim();
            const fecha = normFecha(row["Fecha"] || row["fecha"] || "");
            if (!eqNombre || !fecha) { errors.push("Fila sin equipo/fecha"); continue; }
            const eq = equipos.find((e) => (e.nombre || "").toLowerCase() === eqNombre.toLowerCase() || (e.serie || "").toLowerCase() === eqNombre.toLowerCase());
            if (!eq) { errors.push("Equipo no encontrado: " + eqNombre); continue; }
            const mant = {
              id: uid(),
              equipoId: eq.id,
              fecha: fecha,
              tipoMant: (row["Tipo"] || row["tipo"] || "preventivo").trim().toLowerCase(),
              tipo: (row["Tipo"] || row["tipo"] || "preventivo").trim().toLowerCase(),
              estado: (row["Estado"] || row["estado"] || "finalizado").trim().toLowerCase(),
              tecnico: (row["Responsable"] || row["responsable"] || row["Tecnico"] || "").trim(),
              responsable: (row["Responsable"] || row["responsable"] || row["Tecnico"] || "").trim(),
              prioridad: (row["Prioridad"] || row["prioridad"] || "").trim(),
              observaciones: (row["Observaciones"] || row["observaciones"] || row["Obs"] || "").trim(),
              obs: (row["Observaciones"] || row["observaciones"] || row["Obs"] || "").trim(),
              fechaProxima: normFecha(row["Proxima"] || row["proxima"] || "") || addDays(fecha, appConfig.intervalo || 90),
              checklist: [], checklistSoft: [], checklistHard: [],
              costo: Number(row["Costo"] || row["costo"] || 0),
              fechaCreacion: todayISO()
            };
            await DB.put("mantenimientos", mant);
            created++;
          }
          await auditar("IMPORTAR MANTENIMIENTOS", created + " creados");
          showMasivaResultado("Mantenimientos: " + created + " creados." + (errors.length ? "\nErrores: " + errors.join("; ") : ""));
          await reload();
          renderConfig();
          toast("Mantenimientos importados");
        } catch (err) { showMasivaResultado("Error: " + err.message); }
      };
      fileInput.value = "";
      fileInput.click();
    } catch (e) { toast(e.message, "danger"); }
  }

  async function importFeriados() {
    try {
      const XLSX = await loadExcelLib();
      const fileInput = $("#fileMasiva");
      fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const data = await file.arrayBuffer();
          const wb = XLSX.read(data, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(ws);
          let created = 0, errors = [];
          for (const row of rows) {
            const fecha = normFecha(row["Fecha"] || row["fecha"] || "");
            if (!fecha) { errors.push("Fila sin fecha"); continue; }
            if (feriados.some((f) => f.fecha === fecha)) continue;
            const feriado = {
              id: uid(),
              fecha: fecha,
              tipo: (row["Tipo"] || row["tipo"] || "Nacional").trim(),
              motivo: (row["Motivo"] || row["motivo"] || "").trim()
            };
            await DB.put("feriados", feriado);
            feriados.push(feriado);
            created++;
          }
          await auditar("IMPORTAR FERIADOS", created + " creados");
          showMasivaResultado("Feriados: " + created + " creados." + (errors.length ? "\nErrores: " + errors.join("; ") : ""));
          renderFeriadosList();
          toast("Feriados importados");
        } catch (err) { showMasivaResultado("Error: " + err.message); }
      };
      fileInput.value = "";
      fileInput.click();
    } catch (e) { toast(e.message, "danger"); }
  }

  // ============================================================
  //  EXPORTACIONES
  // ============================================================
  async function exportJSON() {
    const data = {
      version: CFG.APP_VERSION,
      fecha: todayISO(),
      empresas: appConfig.empresa,
      equipos: equipos,
      mantenimientos: mantenimientos,
      usuarios: usuarios,
      feriados: feriados,
      auditoria: auditoria
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mantenimiento-backup-" + todayISO() + ".json";
    a.click();
    URL.revokeObjectURL(url);
    await auditar("EXPORTAR JSON", "Backup descargado");
    toast("Datos exportados");
  }

  async function exportExcel() {
    try {
      const XLSX = await loadExcelLib();
      const wb = XLSX.utils.book_new();

      // Hoja Equipos
      const eqData = equipos.map((eq) => ({
        Nombre: eq.nombre, Tipo: eq.tipo, Marca: eq.marca, Serie: eq.serie,
        Hostname: eq.hostname, "Cod. Inventario": eq.codInventario, DNI: eq.dni,
        Departamento: eq.departamento, Responsable: eq.responsable,
        "Usuario Asignado": eq.usuarioAsignado, Ubicacion: eq.ubicacion,
        Area: eq.area, SO: eq.so, IP: eq.ip,
        "Fecha Compra": eq.fechaCompra, Intervalo: eq.intervalo, Notas: eq.notas
      }));
      const wsEq = XLSX.utils.json_to_sheet(eqData);
      XLSX.utils.book_append_sheet(wb, wsEq, "Equipos");

      // Hoja Mantenimientos
      const mantData = mantenimientos.map((m) => {
        const eq = equipos.find((e) => e.id === m.equipoId);
        return {
          Equipo: eq ? eq.nombre : "", Fecha: m.fecha, Tipo: m.tipoMant || m.tipo,
          Estado: m.estado, Responsable: m.tecnico || m.responsable,
          Prioridad: m.prioridad, Observaciones: m.observaciones || m.obs,
          "Proxima": m.fechaProxima, Costo: m.costo
        };
      });
      const wsMant = XLSX.utils.json_to_sheet(mantData);
      XLSX.utils.book_append_sheet(wb, wsMant, "Mantenimientos");

      // Hoja Usuarios
      const usrData = usuarios.map((u) => ({
        Nombre: u.nombre, DNI: u.dni, Rol: rolNombre(u.rol),
        Departamento: u.departamento || "", Cargo: u.cargo || ""
      }));
      const wsUsr = XLSX.utils.json_to_sheet(usrData);
      XLSX.utils.book_append_sheet(wb, wsUsr, "Responsables");

      // Hoja Feriados
      const ferData = feriados.map((f) => ({
        Fecha: f.fecha, Tipo: f.tipo, Motivo: f.motivo
      }));
      const wsFer = XLSX.utils.json_to_sheet(ferData);
      XLSX.utils.book_append_sheet(wb, wsFer, "Feriados");

      XLSX.writeFile(wb, "mantenimiento-export-" + todayISO() + ".xlsx");
      await auditar("EXPORTAR EXCEL", "Archivo Excel descargado");
      toast("Excel exportado");
    } catch (e) {
      toast("Error al exportar Excel: " + e.message, "danger");
    }
  }

  async function exportAPK() {
    const data = {
      version: CFG.APP_VERSION,
      fecha: todayISO(),
      responsables: usuarios.filter((u) => u.rol !== ROL.ADMIN).map((u) => ({
        nombre: u.nombre, dni: u.dni, clave: u.clave,
        departamento: u.departamento || "", cargo: u.cargo || ""
      })),
      equipos: equipos.map((eq) => ({
        nombre: eq.nombre, tipo: eq.tipo, marca: eq.marca, serie: eq.serie,
        hostname: eq.hostname, codInventario: eq.codInventario, dni: eq.dni,
        departamento: eq.departamento, responsable: eq.responsable,
        usuarioAsignado: eq.usuarioAsignado, ubicacion: eq.ubicacion,
        area: eq.area, so: eq.so, ip: eq.ip,
        fechaCompra: eq.fechaCompra, intervalo: eq.intervalo
      })),
      mantenimientos: mantenimientos.map((m) => {
        const eq = equipos.find((e) => e.id === m.equipoId);
        return {
          equipoNombre: eq ? eq.nombre : "", serie: eq ? eq.serie : "",
          fecha: m.fecha, tipoMant: m.tipoMant || m.tipo,
          estado: m.estado, tecnico: m.tecnico || m.responsable,
          observaciones: m.observaciones || m.obs, fechaProxima: m.fechaProxima,
          checklist: m.checklist || [], costo: m.costo
        };
      }),
      feriados: feriados.map((f) => ({ fecha: f.fecha, tipo: f.tipo, motivo: f.motivo }))
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mantenimiento-apk-" + todayISO() + ".json";
    a.click();
    URL.revokeObjectURL(url);
    await auditar("EXPORTAR APK", "Formato movil descargado");
    toast("Exportado para APK");
  }

  async function importData(file) {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data.equipos && !data.mantenimientos && !data.responsables) {
      toast("Archivo no valido", "danger");
      return;
    }
    if (!confirm("\u00bfEsto reemplazara todos los datos actuales. Continuar?")) return;
    await exportJSON();

    // Detectar formato APK (responsables en vez de usuarios)
    if (data.responsables && Array.isArray(data.responsables)) {
      for (const r of data.responsables) {
        await DB.putUsuario({ id: uid(), nombre: r.nombre, dni: r.dni, clave: r.clave || r.dni, rol: ROL.EDICION,
          departamento: r.departamento || "", cargo: r.cargo || "" });
      }
    }
    if (data.usuarios && Array.isArray(data.usuarios)) await DB.bulkPut("usuarios", data.usuarios);
    if (data.equipos && Array.isArray(data.equipos)) await DB.bulkPut("equipos", data.equipos);
    if (data.mantenimientos && Array.isArray(data.mantenimientos)) await DB.bulkPut("mantenimientos", data.mantenimientos);
    if (data.feriados && Array.isArray(data.feriados)) await DB.bulkPut("feriados", data.feriados);
    if (data.appConfig) {
      for (const [k, v] of Object.entries(data.appConfig)) { await DB.setConfig(k, v); }
    }

    await reload();
    refreshView();
    toast("Datos importados correctamente");
  }

  // ============================================================
  //  FORMATO TI-F016
  // ============================================================
  function renderFormato(equipoId) {
    const eq = equipos.find((e) => e.id === equipoId);
    if (!eq) return;
    const eqMant = mantenimientos.filter((m) => m.equipoId === equipoId)
      .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
    const lastMant = eqMant[0];

    const cont = $("#formatoContenido");
    if (!cont) return;

    const logoHtml = appConfig.logo
      ? '<img src="data:image/png;base64,' + appConfig.logo + '" style="max-height:60px;max-width:180px;" />'
      : '<span style="font-size:28px;">&#128295;</span>';

    let checklistHtml = "";
    const allChecked = lastMant ? (lastMant.checklist || lastMant.checklistSoft || []).concat(lastMant.checklistHard || []) : [];
    const allItems = CHECKLIST_SOFT.concat(CHECKLIST_HARD);
    if (allItems.length) {
      checklistHtml = '<table class="data-table formato-table"><thead><tr><th>Actividad</th><th>Estado</th></tr></thead><tbody>' +
        allItems.map((item) => '<tr><td>' + esc(item) + '</td><td>' + (allChecked.includes(item) ? '&#9989; Realizado' : '&#9744; Pendiente') + '</td></tr>').join("") +
        '</tbody></table>';
    }

    cont.innerHTML =
      '<div class="formato-header">' +
        '<div class="formato-logo">' + logoHtml + '</div>' +
        '<div class="formato-title"><h2>FORMATO DE MANTENIMIENTO PREVENTIVO</h2><p>' + esc(appConfig.empresa || "Empresa") + ' \u00b7 TI-F016</p></div>' +
      '</div>' +
      '<div class="formato-section"><h3>Datos del Equipo</h3>' +
        '<table class="data-table formato-props"><tbody>' +
        '<tr><td><strong>Nombre:</strong></td><td>' + esc(eq.nombre) + '</td><td><strong>Tipo:</strong></td><td>' + esc(CAT_LABELS[eq.tipo] || eq.tipo) + '</td></tr>' +
        '<tr><td><strong>Marca:</strong></td><td>' + esc(eq.marca || "\u2014") + '</td><td><strong>Serie:</strong></td><td>' + esc(eq.serie || "\u2014") + '</td></tr>' +
        '<tr><td><strong>Hostname:</strong></td><td>' + esc(eq.hostname || "\u2014") + '</td><td><strong>Cod. Inventario:</strong></td><td>' + esc(eq.codInventario || "\u2014") + '</td></tr>' +
        '<tr><td><strong>Ubicacion:</strong></td><td>' + esc(eq.ubicacion || "\u2014") + '</td><td><strong>Area:</strong></td><td>' + esc(eq.area || "\u2014") + '</td></tr>' +
        '<tr><td><strong>Usuario Asignado:</strong></td><td>' + esc(eq.usuarioAsignado || eq.responsable || "\u2014") + '</td><td><strong>SO:</strong></td><td>' + esc(eq.so || "\u2014") + '</td></tr>' +
        '</tbody></table></div>' +
      '<div class="formato-section"><h3>Datos del Mantenimiento</h3>' +
        '<table class="data-table formato-props"><tbody>' +
        '<tr><td><strong>Fecha:</strong></td><td>' + fmtDate(lastMant ? lastMant.fecha : todayISO()) + '</td><td><strong>Tipo:</strong></td><td>' + esc(lastMant ? (lastMant.tipoMant || lastMant.tipo || "\u2014") : "\u2014") + '</td></tr>' +
        '<tr><td><strong>Responsable:</strong></td><td>' + esc(lastMant ? (lastMant.tecnico || lastMant.responsable || "\u2014") : "\u2014") + '</td><td><strong>Estado:</strong></td><td>' + (lastMant ? estadoBadge(estadoMant(lastMant)) : "\u2014") + '</td></tr>' +
        '<tr><td><strong>Proximo Mantenimiento:</strong></td><td colspan="3">' + fmtDate(lastMant ? lastMant.fechaProxima : "") + '</td></tr>' +
        '</tbody></table></div>' +
      '<div class="formato-section"><h3>Actividades Realizadas</h3>' + checklistHtml + '</div>' +
      '<div class="formato-section"><h3>Observaciones</h3><p>' + esc(lastMant ? (lastMant.observaciones || lastMant.obs || "Sin observaciones") : "Sin observaciones") + '</p></div>' +
      '<div class="formato-section formato-signatures">' +
        '<div class="signature-box"><div class="signature-line"></div><p>Responsable de TI</p></div>' +
        '<div class="signature-box"><div class="signature-line"></div><p>Usuario Asignado</p></div>' +
      '</div>' +
      '<p class="formato-footer">Documento generado el ' + fmtDate(todayISO()) + ' \u00b7 ' + esc(appConfig.empresa || "") + '</p>';

    setView("formato");
  }

  function imprimirFormato() {
    window.print();
  }

  function pdfFormato() {
    try {
      const html2pdf = window.html2pdf;
      if (html2pdf) {
        const el = $("#formatoContenido");
        html2pdf().from(el).set({ margin: 10, filename: "formato-mantenimiento.pdf", html2canvas: { scale: 2 }, jsPDF: { unit: "mm", format: "letter", orientation: "portrait" } }).save();
      } else {
        window.print();
      }
    } catch (e) {
      window.print();
    }
  }

  function enviarFormato() {
    const subject = "Formato de Mantenimiento - " + (appConfig.empresa || "");
    const body = "Se adjunta el formato de mantenimiento preventivo.";
    window.open("mailto:?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body));
  }

  // ============================================================
  //  VACIAR BASE DE DATOS
  // ============================================================
  async function vaciarBD() {
    if (!confirm("\u00bfEsto eliminara TODOS los equipos y mantenimientos. No se puede deshacer. Continuar?")) return;
    if (!confirm("CONFIRMACION FINAL: \u00bfEliminar todo?")) return;
    await DB.wipe();
    await DB.clear("feriados");
    await auditar("VACIAR BD", "Todos los datos eliminados");
    toast("Base de datos vaciada");
    await reload();
    refreshView();
  }

  // ============================================================
  //  VER ERRORES
  // ============================================================
  function verErrores() {
    const texto = localStorage.getItem("app_errors") || "Sin errores guardados.";
    const el = $("#erroresTexto");
    if (el) el.textContent = texto;
    openModal("modalErrores");
  }

  function copiarErrores() {
    const el = $("#erroresTexto");
    if (el) {
      navigator.clipboard.writeText(el.textContent).then(() => toast("Copiado"));
    }
  }

  // ============================================================
  //  MANTENIMIENTOS 2026
  // ============================================================
  function activar2026() {
    let count = 0;
    mantenimientos.forEach((m) => {
      const f = normFecha(m.fecha);
      if (f && f.startsWith("2026") && m.estado !== "finalizado") {
        m.estado = "programado";
        DB.put("mantenimientos", m);
        count++;
      }
    });
    toast(count + " mantenimientos 2026 activados");
    auditar("ACTIVAR 2026", count + " mantenimientos");
    setTimeout(async () => { await reload(); renderConfig(); }, 300);
  }

  // ============================================================
  //  ACORDEONES
  // ============================================================
  function setupAccordions() {
    $$(".accordion .card-title").forEach((title) => {
      title.addEventListener("click", () => {
        title.closest(".accordion").classList.toggle("open");
      });
    });
  }

  // ============================================================
  //  EVENTOS
  // ============================================================
  function setupEvents() {
    // Login
    const btnLogin = $("#btnLogin");
    if (btnLogin) btnLogin.addEventListener("click", doLogin);
    const loginClave = $("#loginClave");
    if (loginClave) loginClave.addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });

    // Logout
    const btnLogout = $("#btnLogout");
    if (btnLogout) btnLogout.addEventListener("click", doLogout);

    // Sidebar
    const btnMenu = $("#btnMenu");
    if (btnMenu) btnMenu.addEventListener("click", () => toggleSidebar(true));
    const bk = $("#sidebarBackdrop");
    if (bk) bk.addEventListener("click", () => toggleSidebar(false));
    $$(".nav-item").forEach((btn) => {
      btn.addEventListener("click", () => setView(btn.dataset.view));
    });

    // Cerrar modales
    $$("[data-close]").forEach((btn) => {
      btn.addEventListener("click", () => closeModal(btn.dataset.close));
    });

    // Equipos
    const btnNuevoEquipo = $("#btnNuevoEquipo");
    if (btnNuevoEquipo) btnNuevoEquipo.addEventListener("click", () => openEquipoForm());
    const btnGuardarEquipo = $("#btnGuardarEquipo");
    if (btnGuardarEquipo) btnGuardarEquipo.addEventListener("click", saveEquipo);
    const searchEquipo = $("#searchEquipo");
    if (searchEquipo) searchEquipo.addEventListener("input", renderEquipos);
    const filterTipo = $("#filterTipo");
    if (filterTipo) filterTipo.addEventListener("change", renderEquipos);
    const equipoList = $("#equipoList");
    if (equipoList) {
      equipoList.addEventListener("click", (e) => {
        const card = e.target.closest("[data-equipo]");
        if (card) showEquipoDetalle(card.dataset.equipo);
      });
    }

    // Detalle
    const btnEditarEquipo = $("#btnEditarEquipo");
    if (btnEditarEquipo) btnEditarEquipo.addEventListener("click", () => {
      if (currentDetailId) { closeModal("modalDetalle"); openEquipoForm(currentDetailId); }
    });
    const btnEliminarEquipo = $("#btnEliminarEquipo");
    if (btnEliminarEquipo) btnEliminarEquipo.addEventListener("click", () => {
      if (currentDetailId) deleteEquipo(currentDetailId);
    });
    const btnFormato = $("#btnFormato");
    if (btnFormato) btnFormato.addEventListener("click", () => {
      if (currentDetailId) { closeModal("modalDetalle"); renderFormato(currentDetailId); }
    });

    // Mantenimientos
    const btnBuscarMant = $("#btnBuscarMant");
    if (btnBuscarMant) btnBuscarMant.addEventListener("click", renderMantenimientos);
    const btnLimpiarMant = $("#btnLimpiarMant");
    if (btnLimpiarMant) btnLimpiarMant.addEventListener("click", () => {
      ["filterUsuarioMant","filterUbicacion","filterEquipo","filterTipoMant","filterEstadoMant","filterFechaDesde","filterFechaHasta"].forEach((id) => {
        const el = $("#" + id); if (el) el.value = "";
      });
      renderMantenimientos();
    });
    const btnGuardarMant = $("#btnGuardarMant");
    if (btnGuardarMant) btnGuardarMant.addEventListener("click", saveMant);
    const mantList = $("#mantList");
    if (mantList) {
      mantList.addEventListener("click", (e) => {
        const card = e.target.closest("[data-mant]");
        if (card) openMantForm(card.dataset.mant);
      });
    }

    // Alertas
    const btnAlertVencidos = $("#btnAlertVencidos");
    if (btnAlertVencidos) {
      btnAlertVencidos.addEventListener("click", () => {
        alertTab = alertTab === "vencidos" ? "proximos" : "vencidos";
        btnAlertVencidos.textContent = alertTab === "vencidos" ? "Vencidos" : "Proximos";
        btnAlertVencidos.classList.toggle("active", alertTab === "vencidos");
        alertPage = 1;
        renderAlertas();
      });
    }
    const filterAlertaTipo = $("#filterAlertaTipo");
    if (filterAlertaTipo) filterAlertaTipo.addEventListener("change", () => { alertPage = 1; renderAlertas(); });
    const filterAlertaResp = $("#filterAlertaResp");
    if (filterAlertaResp) filterAlertaResp.addEventListener("change", () => { alertPage = 1; renderAlertas(); });
    const searchAlerta = $("#searchAlerta");
    if (searchAlerta) searchAlerta.addEventListener("input", () => { alertPage = 1; renderAlertas(); });
    const alertFullList = $("#alertFullList");
    if (alertFullList) {
      alertFullList.addEventListener("click", (e) => {
        const card = e.target.closest("[data-equipo]");
        if (card) showEquipoDetalle(card.dataset.equipo);
      });
    }

    // Rendimiento
    const perfUsuario = $("#perfUsuario");
    if (perfUsuario) perfUsuario.addEventListener("change", renderRendimiento);

    // Config - Empresa
    const btnGuardarConfig = $("#btnGuardarConfig");
    if (btnGuardarConfig) btnGuardarConfig.addEventListener("click", saveBusinessConfig);

    // Config - Mi perfil
    const btnMiPerfil = $("#btnMiPerfil");
    if (btnMiPerfil) btnMiPerfil.addEventListener("click", () => { if (sesion) openUsuarioForm(sesion.id); });

    // Config - 2FA
    const btnMi2FA = $("#btnMi2FA");
    if (btnMi2FA) btnMi2FA.addEventListener("click", () => { if (sesion) openTOTPSetup(sesion.id); });
    const btnTOTPVerifyConfirm = $("#btnTOTPVerifyConfirm");
    if (btnTOTPVerifyConfirm) btnTOTPVerifyConfirm.addEventListener("click", confirmTOTPVerify);
    const btnTOTPSetupConfirm = $("#btnTOTPSetupConfirm");
    if (btnTOTPSetupConfirm) btnTOTPSetupConfirm.addEventListener("click", confirmTOTPSetup);
    const totpVerifyCode = $("#totpVerifyCode");
    if (totpVerifyCode) totpVerifyCode.addEventListener("keydown", (e) => { if (e.key === "Enter") confirmTOTPVerify(); });
    const totpSetupCode = $("#totpSetupCode");
    if (totpSetupCode) totpSetupCode.addEventListener("keydown", (e) => { if (e.key === "Enter") confirmTOTPSetup(); });

    // Config - Usuarios
    const btnNuevoUsuario = $("#btnNuevoUsuario");
    if (btnNuevoUsuario) btnNuevoUsuario.addEventListener("click", () => openUsuarioForm());
    const btnGuardarUsuario = $("#btnGuardarUsuario");
    if (btnGuardarUsuario) btnGuardarUsuario.addEventListener("click", saveUsuario);
    const btnEliminarUsuario = $("#btnEliminarUsuario");
    if (btnEliminarUsuario) btnEliminarUsuario.addEventListener("click", () => { const id = $("#usId").value; if (id) deleteUsuario(id); });
    const usuariosList = $("#usuariosList");
    if (usuariosList) {
      usuariosList.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-edit-user]");
        if (btn) openUsuarioForm(btn.dataset.editUser);
      });
    }

    // Config - Cargas masivas
    const btnCargarResponsables = $("#btnCargarResponsables");
    if (btnCargarResponsables) btnCargarResponsables.addEventListener("click", importResponsables);
    const btnCargarEquipos = $("#btnCargarEquipos");
    if (btnCargarEquipos) btnCargarEquipos.addEventListener("click", importEquipos);
    const btnCargarMantenimientos = $("#btnCargarMantenimientos");
    if (btnCargarMantenimientos) btnCargarMantenimientos.addEventListener("click", importMantenimientos);
    const btnCargarFeriados = $("#btnCargarFeriados");
    if (btnCargarFeriados) btnCargarFeriados.addEventListener("click", importFeriados);

    // Config - Feriados
    const btnAgregarFeriado = $("#btnAgregarFeriado");
    if (btnAgregarFeriado) btnAgregarFeriado.addEventListener("click", agregarFeriado);
    const feriadosList = $("#feriadosList");
    if (feriadosList) {
      feriadosList.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-del-feriado]");
        if (btn) eliminarFeriado(btn.dataset.delFeriado);
      });
    }

    // Config - Programacion
    const btnProgramar = $("#btnProgramar");
    if (btnProgramar) btnProgramar.addEventListener("click", programarMantenimientos);

    // Config - Correo
    const correoUbicacion = $("#correoUbicacion");
    if (correoUbicacion) correoUbicacion.addEventListener("change", actualizarCorreoEquipos);
    const btnEnviarCorreo = $("#btnEnviarCorreo");
    if (btnEnviarCorreo) btnEnviarCorreo.addEventListener("click", enviarCorreo);

    // Config - Backup
    const btnExportar = $("#btnExportar");
    if (btnExportar) btnExportar.addEventListener("click", exportJSON);
    const btnExportarExcel = $("#btnExportarExcel");
    if (btnExportarExcel) btnExportarExcel.addEventListener("click", exportExcel);
    const btnExportarApk = $("#btnExportarApk");
    if (btnExportarApk) btnExportarApk.addEventListener("click", exportAPK);
    const btnImportar = $("#btnImportar");
    if (btnImportar) btnImportar.addEventListener("click", () => { const fi = $("#fileImport"); if (fi) fi.click(); });
    const fileImport = $("#fileImport");
    if (fileImport) fileImport.addEventListener("change", (e) => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ""; });

    // Config - Sincronizacion
    const btnSincronizar = $("#btnSincronizar");
    if (btnSincronizar) btnSincronizar.addEventListener("click", sincronizarTodo);

    // Config - Mantenimientos 2026
    const btnActivar2026 = $("#btnActivar2026");
    if (btnActivar2026) btnActivar2026.addEventListener("click", activar2026);

    // Config - Datos
    const btnVaciarBd = $("#btnVaciarBd");
    if (btnVaciarBd) btnVaciarBd.addEventListener("click", vaciarBD);
    const btnVerErrores = $("#btnVerErrores");
    if (btnVerErrores) btnVerErrores.addEventListener("click", verErrores);
    const btnCopiarErrores = $("#btnCopiarErrores");
    if (btnCopiarErrores) btnCopiarErrores.addEventListener("click", copiarErrores);

    // Config - Actualizaciones
    const btnCheckUpdate = $("#btnCheckUpdate");
    if (btnCheckUpdate) {
      btnCheckUpdate.addEventListener("click", async () => {
        try {
          if (CFG.UPDATE_URL) {
            const resp = await fetch(CFG.UPDATE_URL + "js/config.js?t=" + Date.now());
            const text = await resp.text();
            const match = text.match(/APP_VERSION\s*:\s*["']([^"']+)["']/);
            if (match && match[1] !== CFG.APP_VERSION) {
              toast("Nueva version disponible: " + match[1]);
            } else {
              toast("Version actual: " + CFG.APP_VERSION);
            }
          } else {
            toast("Version actual: " + (CFG.APP_VERSION || "1.0.0"));
          }
        } catch (e) {
          toast("Version actual: " + (CFG.APP_VERSION || "1.0.0"));
        }
      });
    }

    // Config - Logo
    const logoInput = $("#logoInput");
    if (logoInput) logoInput.addEventListener("change", (e) => { if (e.target.files[0]) handleLogoFile(e.target.files[0]); });
    const btnClearLogo = $("#btnClearLogo");
    if (btnClearLogo) btnClearLogo.addEventListener("click", clearLogo);
    const btnSaveLogo = $("#btnSaveLogo");
    if (btnSaveLogo) btnSaveLogo.addEventListener("click", saveLogo);

    // Formato
    const btnVolverFormato = $("#btnVolverFormato");
    if (btnVolverFormato) btnVolverFormato.addEventListener("click", () => setView("equipos"));
    const btnImprimirFormato = $("#btnImprimirFormato");
    if (btnImprimirFormato) btnImprimirFormato.addEventListener("click", imprimirFormato);
    const btnPdfFormato = $("#btnPdfFormato");
    if (btnPdfFormato) btnPdfFormato.addEventListener("click", pdfFormato);
    const btnEnviarFormato = $("#btnEnviarFormato");
    if (btnEnviarFormato) btnEnviarFormato.addEventListener("click", enviarFormato);

    // Paginacion delegada
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-page]");
      if (!btn || btn.disabled) return;
      const [prefix, action] = btn.dataset.page.split(":");
      if (prefix === "eq") {
        if (action === "prev" && eqPage > 1) eqPage--;
        if (action === "next") eqPage++;
        renderEquipos();
      } else if (prefix === "mant") {
        if (action === "prev" && mantPage > 1) mantPage--;
        if (action === "next") mantPage++;
        renderMantenimientos();
      } else if (prefix === "alert") {
        if (action === "prev" && alertPage > 1) alertPage--;
        if (action === "next") alertPage++;
        renderAlertas();
      }
    });

    // Errores globales
    window.addEventListener("error", (e) => {
      try {
        const errs = JSON.parse(localStorage.getItem("app_errors") || "[]");
        errs.push({ message: e.message, source: e.filename, line: e.lineno, time: new Date().toISOString() });
        if (errs.length > 100) errs.splice(0, errs.length - 100);
        localStorage.setItem("app_errors", JSON.stringify(errs));
      } catch (ex) { /* */ }
    });

    // Service worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }

  // ============================================================
  //  INICIALIZACION
  // ============================================================
  async function init() {
    try {
      cleanExpiredLockouts();
      await reload();
      await ensureAdmin();

      const savedSesion = await DB.getSesion();
      if (savedSesion) {
        sesion = savedSesion;
        applySessionUI();
        applyLogoToUI(appConfig.logo);
        setView(currentView);
      } else {
        showLogin();
      }

      setTimeout(() => {
        const splash = $("#splash");
        if (splash) splash.classList.add("gone");
        setTimeout(() => { if (splash) splash.style.display = "none"; }, 500);
      }, 800);

      window.__APP_OK__ = true;
      setupAccordions();
      setupEvents();
    } catch (err) {
      console.error("Error inicializando:", err);
      window.__APP_OK__ = true;
      const splash = $("#splash");
      if (splash) splash.classList.add("gone");
    }
  }

  // ---- START ----
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
