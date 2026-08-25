// ============================================================
//  Capa de datos: IndexedDB (funciona sin conexión)
// ============================================================
(function () {
  "use strict";

  const DB_NAME = "mantenimiento-pwa";
  const DB_VERSION = 3;

  let _db = null;

  function openDB() {
    return new Promise((resolve, reject) => {
      if (_db) return resolve(_db);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("equipos")) {
          const s = db.createObjectStore("equipos", { keyPath: "id" });
          s.createIndex("nombre", "nombre");
        }
        if (!db.objectStoreNames.contains("mantenimientos")) {
          const s = db.createObjectStore("mantenimientos", { keyPath: "id" });
          s.createIndex("equipoId", "equipoId");
          s.createIndex("fecha", "fecha");
        }
        if (!db.objectStoreNames.contains("config")) {
          db.createObjectStore("config", { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("usuarios")) {
          db.createObjectStore("usuarios", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("auditoria")) {
          const s = db.createObjectStore("auditoria", { keyPath: "id" });
          s.createIndex("fecha", "fecha");
        }
        if (!db.objectStoreNames.contains("sesion")) {
          db.createObjectStore("sesion", { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("feriados")) {
          const s = db.createObjectStore("feriados", { keyPath: "id" });
          s.createIndex("fecha", "fecha");
        }
      };
      req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
      req.onerror = () => reject(req.error);
    });
  }

  function tx(store, mode) {
    return openDB().then((db) => {
      const t = db.transaction(store, mode);
      return { t, s: t.objectStore(store) };
    });
  }

  function requestToPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  const DB = {
    async getAll(store) {
      const { s } = await tx(store, "readonly");
      return requestToPromise(s.getAll());
    },
    async get(store, key) {
      const { s } = await tx(store, "readonly");
      return requestToPromise(s.get(key));
    },
    async put(store, value) {
      const { t, s } = await tx(store, "readwrite");
      const p = requestToPromise(s.put(value));
      return p.then(() => new Promise((res) => { t.oncomplete = res; }));
    },
    async bulkPut(store, values) {
      const { t, s } = await tx(store, "readwrite");
      values.forEach((v) => s.put(v));
      return new Promise((res) => { t.oncomplete = res; });
    },
    async delete(store, key) {
      const { t, s } = await tx(store, "readwrite");
      const p = requestToPromise(s.delete(key));
      return p.then(() => new Promise((res) => { t.oncomplete = res; }));
    },
    async clear(store) {
      const { t, s } = await tx(store, "readwrite");
      const p = requestToPromise(s.clear());
      return p.then(() => new Promise((res) => { t.oncomplete = res; }));
    },
    async getConfig() {
      const rows = await DB.getAll("config");
      const cfg = {};
      rows.forEach((r) => { cfg[r.key] = r.value; });
      return Object.assign({
        empresa: "Empresa",
        intervalo: 90
      }, cfg);
    },
    async setConfig(key, value) {
      return DB.put("config", { key, value });
    },
    async getSesion() {
      const row = await DB.get("sesion", "actual");
      return row ? row.value : null;
    },
    async setSesion(value) {
      return DB.put("sesion", { key: "actual", value });
    },
    async clearSesion() {
      const { t, s } = await tx("sesion", "readwrite");
      const p = requestToPromise(s.delete("actual"));
      return p.then(() => new Promise((res) => { t.oncomplete = res; }));
    },
    async getUsuarios() {
      return DB.getAll("usuarios");
    },
    async putUsuario(u) {
      return DB.put("usuarios", u);
    },
    async deleteUsuario(id) {
      return DB.delete("usuarios", id);
    },
    async getAuditoria(max) {
      const all = await DB.getAll("auditoria");
      all.sort((a, b) => (a.id < b.id ? 1 : -1));
      return all.slice(0, max || 300);
    },
    async putAuditoria(e) {
      return DB.put("auditoria", e);
    },
    async wipe() {
      await DB.clear("equipos");
      await DB.clear("mantenimientos");
    }
  };

  window.DB = DB;
})();
