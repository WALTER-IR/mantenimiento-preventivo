// ============================================================
//  Mantenimiento Preventivo - servidor de sincronización
//  Comparte los datos entre el APK (Android) y la PWA (web).
//
//  El formato guardado es el del APK (canónico):
//  { usuarios[], equipos[], mantenimientos[] }.
//  La web traduce de/a su propio formato al sincronizar.
//
//  Despliegue en Render: crea el servicio desde este repo con
//  build "npm install" y start "node index.js".
//  Variables de entorno:
//    SYNC_TOKEN   -> clave compartida con las apps (Bearer token)
//    DATABASE_URL -> opcional, Postgres. Si no se define, guarda
//                    en un archivo local data/snapshot.json
// ============================================================
const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 8080;
const TOKEN = process.env.SYNC_TOKEN || "mantenimiento2026";
const DATA_FILE = path.join(__dirname, "data", "snapshot.json");

app.use(express.json({ limit: "25mb" }));

// CORS abierto: el APK y la web llaman desde cualquier origen
app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

function autorizado(req, res) {
  const h = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const token = h || req.query.token || "";
  if (token !== TOKEN) {
    res.status(401).json({ ok: false, error: "No autorizado" });
    return false;
  }
  return true;
}

// ---------- almacenamiento: Postgres (si hay DATABASE_URL) o archivo ----------
let pool = null;
if (process.env.DATABASE_URL) {
  try {
    const { Pool } = require("pg");
    pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  } catch (e) {
    console.error("Aviso: no se pudo cargar 'pg':", e.message);
  }
}

async function asegurarTabla() {
  if (!pool) return;
  await pool.query(
    "CREATE TABLE IF NOT EXISTS sync_snapshot (" +
      "id INTEGER PRIMARY KEY, data JSONB, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())"
  );
}

async function cargar() {
  if (pool) {
    const r = await pool.query("SELECT data, updated_at FROM sync_snapshot WHERE id = 1");
    if (r.rows.length === 0) return null;
    return { data: r.rows[0].data, updatedAt: r.rows[0].updated_at };
  }
  try {
    const obj = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return { data: obj.data, updatedAt: obj.updatedAt };
  } catch (e) {
    return null;
  }
}

async function guardar(data) {
  const updatedAt = new Date().toISOString();
  if (pool) {
    await pool.query(
      "INSERT INTO sync_snapshot (id, data, updated_at) VALUES (1, $1, $2) " +
        "ON CONFLICT (id) DO UPDATE SET data = $1, updated_at = $2",
      [JSON.stringify(data), updatedAt]
    );
    return updatedAt;
  }
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify({ data, updatedAt }, null, 2));
  return updatedAt;
}

// ---------- rutas ----------
app.get("/health", (req, res) => res.json({ ok: true }));

// GET /api/sync -> devuelve el snapshot guardado (o null si aún no hay)
app.get("/api/sync", async (req, res) => {
  if (!autorizado(req, res)) return;
  try {
    const snap = await cargar();
    if (!snap) return res.json({ ok: true, data: null, lastModified: null });
    res.json({ ok: true, data: snap.data, lastModified: snap.updatedAt });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/sync -> guarda el snapshot enviado y lo devuelve
app.post("/api/sync", async (req, res) => {
  if (!autorizado(req, res)) return;
  const data = req.body && req.body.data;
  if (!data) return res.status(400).json({ ok: false, error: "Falta el campo data" });
  if (!Array.isArray(data.usuarios) || !Array.isArray(data.equipos) || !Array.isArray(data.mantenimientos)) {
    return res.status(400).json({ ok: false, error: "El snapshot debe tener usuarios, equipos y mantenimientos" });
  }
  try {
    const updatedAt = await guardar(data);
    res.json({ ok: true, data, lastModified: updatedAt });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

asegurarTabla().catch((e) => console.error("Error al crear la tabla:", e.message));

app.listen(PORT, () => console.log("Servidor de sync en el puerto " + PORT));
