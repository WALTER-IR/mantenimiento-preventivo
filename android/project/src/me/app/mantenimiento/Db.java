package me.app.mantenimiento;

import android.content.ContentValues;
import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;

public final class Db {

    private static SQLiteOpenHelper helper;
    private static Context app;

    // Suprime el registro por fila durante las cargas masivas (se registra un resumen).
    private static boolean silencioAuditoria = false;

    public static final String CFG_NAME = "cfg";
    public static final String CFG_EMPRESA = "empresa";

    // Roles
    public static final int ROL_LECTURA = 0;
    public static final int ROL_EDICION = 1;
    public static final int ROL_ADMIN = 2;

    // Claves de sesión
    private static final String SES_ID = "sesion_id";
    private static final String SES_NOMBRE = "sesion_nombre";
    private static final String SES_ROL = "sesion_rol";

    private Db() {
    }

    public static void init(Context c) {
        if (app == null) app = c.getApplicationContext();
        if (helper == null) {
            helper = new Helper(c.getApplicationContext());
        }
        ensureAdmin();
    }

    public static SQLiteDatabase w() {
        return helper.getWritableDatabase();
    }

    public static SQLiteDatabase r() {
        return helper.getReadableDatabase();
    }

    private static class Helper extends SQLiteOpenHelper {
        Helper(Context c) {
            super(c, "mantenimiento.db", null, 4);
        }

        @Override
        public void onCreate(SQLiteDatabase db) {
            db.execSQL("CREATE TABLE usuarios (" +
                    "id INTEGER PRIMARY KEY AUTOINCREMENT," +
                    "nombre TEXT NOT NULL," +
                    "subdivision TEXT DEFAULT ''," +
                    "dni TEXT DEFAULT ''," +
                    "ceco TEXT DEFAULT ''," +
                    "area TEXT DEFAULT ''," +
                    "cargo TEXT DEFAULT ''," +
                    "email TEXT DEFAULT ''," +
                    "zona TEXT DEFAULT ''," +
                    "clave TEXT DEFAULT ''," +
                    "rol INTEGER DEFAULT 1)");
            db.execSQL("CREATE TABLE equipos (" +
                    "id INTEGER PRIMARY KEY AUTOINCREMENT," +
                    "usuario_id INTEGER DEFAULT 0," +
                    "hostname TEXT DEFAULT ''," +
                    "ip TEXT DEFAULT ''," +
                    "ubicacion TEXT DEFAULT ''," +
                    "equipo TEXT DEFAULT ''," +
                    "cod_inventario TEXT DEFAULT ''," +
                    "serie TEXT DEFAULT ''," +
                    "marca TEXT DEFAULT ''," +
                    "modelo TEXT DEFAULT ''," +
                    "contrato TEXT DEFAULT ''," +
                    "status TEXT DEFAULT '')");
            db.execSQL("CREATE TABLE mantenimientos (" +
                    "id INTEGER PRIMARY KEY AUTOINCREMENT," +
                    "equipo_id INTEGER NOT NULL," +
                    "prioridad TEXT DEFAULT ''," +
                    "fecha_programada TEXT DEFAULT ''," +
                    "fecha_reprogramada TEXT DEFAULT ''," +
                    "fecha_real TEXT DEFAULT ''," +
                    "estado TEXT DEFAULT ''," +
                    "observaciones TEXT DEFAULT '')");
            db.execSQL("CREATE TABLE auditoria (" +
                    "id INTEGER PRIMARY KEY AUTOINCREMENT," +
                    "fecha TEXT DEFAULT ''," +
                    "hora TEXT DEFAULT ''," +
                    "usuario TEXT DEFAULT ''," +
                    "rol TEXT DEFAULT ''," +
                    "accion TEXT DEFAULT ''," +
                    "detalle TEXT DEFAULT '')");
        }

        @Override
        public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
            // Migraciones que conservan los datos.
            if (oldVersion < 4) {
                try {
                    db.execSQL("ALTER TABLE usuarios ADD COLUMN clave TEXT DEFAULT ''");
                } catch (Exception ignored) {
                }
                try {
                    db.execSQL("ALTER TABLE usuarios ADD COLUMN rol INTEGER DEFAULT 1");
                } catch (Exception ignored) {
                }
                try {
                    db.execSQL("CREATE TABLE IF NOT EXISTS auditoria (" +
                            "id INTEGER PRIMARY KEY AUTOINCREMENT," +
                            "fecha TEXT DEFAULT ''," +
                            "hora TEXT DEFAULT ''," +
                            "usuario TEXT DEFAULT ''," +
                            "rol TEXT DEFAULT ''," +
                            "accion TEXT DEFAULT ''," +
                            "detalle TEXT DEFAULT '')");
                } catch (Exception ignored) {
                }
            }
        }
    }

    // Crea el administrador por defecto si no existe (usuario admin / clave admin).
    public static void ensureAdmin() {
        try {
            boolean existe = false;
            for (Usuario u : allUsuarios()) {
                if (u.rol == ROL_ADMIN) {
                    existe = true;
                    break;
                }
            }
            if (!existe) {
                Usuario a = new Usuario();
                a.nombre = "Administrador";
                a.dni = "";
                a.clave = "admin";
                a.rol = ROL_ADMIN;
                saveUsuario(a);
            }
        } catch (Exception ignored) {
        }
    }

    // ---------- configuracion ----------

    public static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(CFG_NAME, Context.MODE_PRIVATE);
    }

    public static String getEmpresa(Context c) {
        return prefs(c).getString(CFG_EMPRESA, "");
    }

    public static void setEmpresa(Context c, String empresa) {
        prefs(c).edit().putString(CFG_EMPRESA, empresa).apply();
        logAuditoria("CONFIGURACION", "Empresa: " + empresa);
    }

    // ---------- sesion ----------

    public static void setSesion(long id, String nombre, int rol) {
        prefs(app).edit()
                .putLong(SES_ID, id)
                .putString(SES_NOMBRE, nombre == null ? "" : nombre)
                .putInt(SES_ROL, rol)
                .apply();
    }

    public static void cerrarSesion() {
        String n = getSesionNombre();
        logAuditoria(n, rolNombre(getSesionRol()), "CIERRE DE SESION", n);
        prefs(app).edit().remove(SES_ID).remove(SES_NOMBRE).remove(SES_ROL).apply();
    }

    public static long getSesionId() {
        return prefs(app).getLong(SES_ID, -1);
    }

    public static String getSesionNombre() {
        return prefs(app).getString(SES_NOMBRE, "");
    }

    public static int getSesionRol() {
        return prefs(app).getInt(SES_ROL, -1);
    }

    public static boolean sesionActiva() {
        return getSesionRol() >= 0;
    }

    public static boolean puedeEditar() {
        return getSesionRol() >= ROL_EDICION;
    }

    public static boolean esAdmin() {
        return getSesionRol() == ROL_ADMIN;
    }

    public static String rolNombre(int rol) {
        if (rol == ROL_ADMIN) return "Administrador";
        if (rol == ROL_EDICION) return "Edición";
        return "Lectura";
    }

    // Verifica credenciales. Responsables: usuario = DNI o nombre; clave = la asignada
    // (o el DNI si aún no tienen clave). Administrador: usuario "admin"/"administrador", clave asignada.
    public static Usuario login(String usuario, String clave) {
        if (usuario == null || clave == null) return null;
        String u = usuario.trim();
        String c = clave.trim();
        if (u.length() == 0 || c.length() == 0) return null;
        String ku = keyOf(u);
        boolean adminKey = ku.equals("ADMIN") || ku.equals("ADMINISTRADOR");
        for (Usuario x : allUsuarios()) {
            boolean match;
            if (adminKey) {
                match = x.rol == ROL_ADMIN;
            } else {
                match = x.dni != null && x.dni.length() > 0 && x.dni.equalsIgnoreCase(u);
                if (!match && x.nombre != null && x.nombre.length() > 0 && keyOf(x.nombre).equals(ku)) match = true;
            }
            if (!match) continue;
            boolean pwOk;
            if (x.clave != null && x.clave.length() > 0) {
                pwOk = x.clave.equals(c);
            } else {
                pwOk = x.dni != null && x.dni.length() > 0 && x.dni.equalsIgnoreCase(c);
            }
            if (pwOk) {
                setSesion(x.id, x.nombre, x.rol);
                logAuditoria(x.nombre, rolNombre(x.rol), "INICIO DE SESION", "Usuario: " + x.nombre);
                return x;
            }
        }
        return null;
    }

    // ---------- auditoria ----------

    public static void logAuditoria(String accion, String detalle) {
        logAuditoria(getSesionNombre(), rolNombre(getSesionRol()), accion, detalle);
    }

    public static void logAuditoria(String usuario, String rol, String accion, String detalle) {
        if (app == null || silencioAuditoria) return;
        try {
            ContentValues v = new ContentValues();
            v.put("fecha", Fmt.today());
            v.put("hora", new SimpleDateFormat("HH:mm:ss", Locale.US).format(new Date()));
            v.put("usuario", usuario == null ? "" : usuario);
            v.put("rol", rol == null ? "" : rol);
            v.put("accion", accion == null ? "" : accion);
            v.put("detalle", detalle == null ? "" : detalle);
            w().insert("auditoria", null, v);
        } catch (Exception ignored) {
        }
    }

    public static ArrayList<String[]> allAuditoria(int max) {
        ArrayList<String[]> out = new ArrayList<>();
        try {
            Cursor c = r().query("auditoria", null, null, null, null, null, "id DESC", null);
            if (c != null) {
                int n = 0;
                while (c.moveToNext() && n < max) {
                    out.add(new String[]{
                            s(c, "fecha"), s(c, "hora"), s(c, "usuario"), s(c, "rol"),
                            s(c, "accion"), s(c, "detalle")
                    });
                    n++;
                }
                c.close();
            }
        } catch (Exception ignored) {
        }
        return out;
    }

    // ---------- usuarios (responsables) ----------

    public static long saveUsuario(Usuario u) {
        ContentValues v = new ContentValues();
        v.put("nombre", u.nombre);
        v.put("subdivision", u.subdivision);
        v.put("dni", u.dni);
        v.put("ceco", u.ceco);
        v.put("area", u.area);
        v.put("cargo", u.cargo);
        v.put("email", u.email);
        v.put("zona", u.zona);
        v.put("clave", u.clave == null ? "" : u.clave);
        v.put("rol", u.rol);
        long id;
        if (u.id > 0) {
            w().update("usuarios", v, "id=?", new String[]{String.valueOf(u.id)});
            id = u.id;
        } else {
            id = w().insert("usuarios", null, v);
        }
        logAuditoria("ALTA/EDICION USUARIO",
                "Nombre: " + u.nombre + " · DNI: " + u.dni + " · Permiso: " + rolNombre(u.rol));
        return id;
    }

    public static void deleteUsuario(long id) {
        Usuario u = getUsuario(id);
        ArrayList<Equipo> eqs = equiposByUsuario(id);
        for (Equipo e : eqs) deleteEquipo(e.id);
        w().delete("usuarios", "id=?", new String[]{String.valueOf(id)});
        logAuditoria("BAJA USUARIO", u != null ? "Nombre: " + u.nombre : "id=" + id);
    }

    // Cambia el permiso (rol) de un usuario y lo registra en auditoría.
    public static void cambiarRol(long usuarioId, int rol) {
        Usuario u = getUsuario(usuarioId);
        if (u == null) return;
        if (rol < ROL_LECTURA || rol > ROL_ADMIN) return;
        ContentValues v = new ContentValues();
        v.put("rol", rol);
        w().update("usuarios", v, "id=?", new String[]{String.valueOf(usuarioId)});
        logAuditoria("CAMBIO DE PERMISO",
                "Usuario: " + u.nombre + " · DNI: " + u.dni + " · Nuevo permiso: " + rolNombre(rol));
    }

    public static Usuario getUsuario(long id) {
        Cursor c = r().query("usuarios", null, "id=?", new String[]{String.valueOf(id)}, null, null, null);
        Usuario u = null;
        if (c != null) {
            if (c.moveToFirst()) u = usuarioFromCursor(c);
            c.close();
        }
        return u;
    }

    public static ArrayList<Usuario> allUsuarios() {
        ArrayList<Usuario> out = new ArrayList<>();
        Cursor c = r().query("usuarios", null, null, null, null, null, "nombre COLLATE NOCASE ASC");
        if (c != null) {
            while (c.moveToNext()) out.add(usuarioFromCursor(c));
            c.close();
        }
        return out;
    }

    private static Usuario usuarioFromCursor(Cursor c) {
        Usuario u = new Usuario();
        u.id = c.getLong(c.getColumnIndexOrThrow("id"));
        u.nombre = s(c, "nombre");
        u.subdivision = s(c, "subdivision");
        u.dni = s(c, "dni");
        u.ceco = s(c, "ceco");
        u.area = s(c, "area");
        u.cargo = s(c, "cargo");
        u.email = s(c, "email");
        u.zona = s(c, "zona");
        u.clave = s(c, "clave");
        u.rol = c.getInt(c.getColumnIndexOrThrow("rol"));
        return u;
    }

    public static Usuario findUsuarioByNombre(String nombre) {
        if (nombre == null) return null;
        String k = keyOf(nombre);
        if (k.length() == 0) return null;
        for (Usuario u : allUsuarios()) {
            if (u.nombre != null && keyOf(u.nombre).equals(k)) return u;
        }
        return null;
    }

    public static Usuario findUsuarioByDni(String dni) {
        if (dni == null || dni.length() == 0) return null;
        for (Usuario u : allUsuarios()) {
            if (u.dni != null && u.dni.equalsIgnoreCase(dni)) return u;
        }
        return null;
    }

    public static Usuario matchResponsable(String value) {
        if (value == null) return null;
        String v = value.trim();
        if (v.length() == 0) return null;
        Usuario u = findUsuarioByDni(v);
        if (u != null) return u;
        u = findUsuarioByNombre(v);
        if (u != null) return u;
        return fuzzyResponsable(v);
    }

    // Emparejamiento difuso por palabras del nombre: soporta "APELLIDOS NOMBRE" vs "NOMBRE APELLIDOS".
    private static Usuario fuzzyResponsable(String value) {
        ArrayList<String> t = nameTokens(value);
        if (t.isEmpty()) return null;
        Usuario best = null;
        int bestScore = 0;
        int ties = 0;
        for (Usuario x : allUsuarios()) {
            if (x.nombre == null) continue;
            ArrayList<String> tx = nameTokens(x.nombre);
            int sc = 0;
            for (String s : t) if (tx.contains(s)) sc++;
            if (sc > bestScore) {
                bestScore = sc;
                best = x;
                ties = 1;
            } else if (sc == bestScore && sc > 0) {
                ties++;
            }
        }
        if (bestScore >= 2) return best;
        if (bestScore == 1 && ties == 1) return best;
        return null;
    }

    // Palabras significativas del nombre; ignora iniciales y fragmentos cortos.
    private static ArrayList<String> nameTokens(String name) {
        ArrayList<String> out = new ArrayList<>();
        if (name == null) return out;
        String[] parts = name.split("[^\\p{L}\\p{N}]+");
        for (String p : parts) {
            String k = keyOf(p);
            if (k.length() >= 3) out.add(k);
        }
        return out;
    }

    // ---------- equipos ----------

    public static long saveEquipo(Equipo e) {
        ContentValues v = new ContentValues();
        v.put("usuario_id", e.usuarioId);
        v.put("hostname", e.hostname);
        v.put("ip", e.ip);
        v.put("ubicacion", e.ubicacion);
        v.put("equipo", e.equipo);
        v.put("cod_inventario", e.codInventario);
        v.put("serie", e.serie);
        v.put("marca", e.marca);
        v.put("modelo", e.modelo);
        v.put("contrato", e.contrato);
        v.put("status", e.status);
        boolean editando = e.id > 0;
        if (editando) {
            w().update("equipos", v, "id=?", new String[]{String.valueOf(e.id)});
        } else {
            e.id = w().insert("equipos", null, v);
        }
        logAuditoria(editando ? "EDICION EQUIPO" : "ALTA EQUIPO",
                "Serie: " + e.serie + " · Hostname: " + e.hostname);
        return e.id;
    }

    public static void deleteEquipo(long id) {
        Equipo e = getEquipo(id);
        w().delete("mantenimientos", "equipo_id=?", new String[]{String.valueOf(id)});
        w().delete("equipos", "id=?", new String[]{String.valueOf(id)});
        logAuditoria("BAJA EQUIPO", e != null ? "Serie: " + e.serie + " · Hostname: " + e.hostname : "id=" + id);
    }

    public static Equipo getEquipo(long id) {
        Cursor c = r().rawQuery("SELECT e.*, u.nombre AS u_nombre, u.zona AS u_zona, " +
                "u.subdivision AS u_subdivision, u.dni AS u_dni, u.ceco AS u_ceco, " +
                "u.area AS u_area, u.cargo AS u_cargo, u.email AS u_email " +
                "FROM equipos e LEFT JOIN usuarios u ON u.id = e.usuario_id WHERE e.id=?",
                new String[]{String.valueOf(id)});
        Equipo e = null;
        if (c != null) {
            if (c.moveToFirst()) e = equipoFromCursor(c);
            c.close();
        }
        return e;
    }

    public static ArrayList<Equipo> allEquipos() {
        return allEquipos(null);
    }

    public static ArrayList<Equipo> allEquipos(String filter) {
        ArrayList<Equipo> out = new ArrayList<>();
        Cursor c = r().rawQuery("SELECT e.*, u.nombre AS u_nombre, u.zona AS u_zona, " +
                "u.subdivision AS u_subdivision, u.dni AS u_dni, u.ceco AS u_ceco, " +
                "u.area AS u_area, u.cargo AS u_cargo, u.email AS u_email " +
                "FROM equipos e LEFT JOIN usuarios u ON u.id = e.usuario_id " +
                "ORDER BY e.hostname COLLATE NOCASE ASC", null);
        if (c != null) {
            while (c.moveToNext()) out.add(equipoFromCursor(c));
            c.close();
        }
        if (filter != null && filter.trim().length() > 0) {
            String f = filter.trim().toLowerCase(Locale.ROOT);
            ArrayList<Equipo> filtered = new ArrayList<>();
            for (Equipo e : out) {
                if (matchEquipo(e, f)) filtered.add(e);
            }
            out = filtered;
        }
        return out;
    }

    private static boolean matchEquipo(Equipo e, String f) {
        return contains(e.hostname, f) || contains(e.serie, f) || contains(e.marca, f)
                || contains(e.modelo, f) || contains(e.ip, f) || contains(e.responsable, f)
                || contains(e.codInventario, f) || contains(e.equipo, f) || contains(e.ubicacion, f);
    }

    private static boolean contains(String v, String f) {
        return v != null && v.toLowerCase(Locale.ROOT).contains(f);
    }

    public static ArrayList<Equipo> equiposByUsuario(long usuarioId) {
        ArrayList<Equipo> out = new ArrayList<>();
        Cursor c = r().rawQuery("SELECT e.*, u.nombre AS u_nombre, u.zona AS u_zona, " +
                "u.subdivision AS u_subdivision, u.dni AS u_dni, u.ceco AS u_ceco, " +
                "u.area AS u_area, u.cargo AS u_cargo, u.email AS u_email " +
                "FROM equipos e LEFT JOIN usuarios u ON u.id = e.usuario_id WHERE e.usuario_id=? " +
                "ORDER BY e.hostname COLLATE NOCASE ASC", new String[]{String.valueOf(usuarioId)});
        if (c != null) {
            while (c.moveToNext()) out.add(equipoFromCursor(c));
            c.close();
        }
        return out;
    }

    public static Equipo findEquipoBySerie(String serie) {
        if (serie == null || serie.length() == 0) return null;
        Cursor c = r().query("equipos", null, "serie=?",
                new String[]{serie.trim()}, null, null, null);
        Equipo e = null;
        if (c != null) {
            if (c.moveToFirst()) e = getEquipo(c.getLong(c.getColumnIndexOrThrow("id")));
            c.close();
        }
        return e;
    }

    private static Equipo equipoFromCursor(Cursor c) {
        Equipo e = new Equipo();
        e.id = c.getLong(c.getColumnIndexOrThrow("id"));
        e.usuarioId = c.getLong(c.getColumnIndexOrThrow("usuario_id"));
        e.hostname = s(c, "hostname");
        e.ip = s(c, "ip");
        e.ubicacion = s(c, "ubicacion");
        e.equipo = s(c, "equipo");
        e.codInventario = s(c, "cod_inventario");
        e.serie = s(c, "serie");
        e.marca = s(c, "marca");
        e.modelo = s(c, "modelo");
        e.contrato = s(c, "contrato");
        e.status = s(c, "status");
        e.responsable = s(c, "u_nombre");
        e.zona = s(c, "u_zona");
        e.subdivision = s(c, "u_subdivision");
        e.dni = s(c, "u_dni");
        e.ceco = s(c, "u_ceco");
        e.area = s(c, "u_area");
        e.cargo = s(c, "u_cargo");
        e.email = s(c, "u_email");
        return e;
    }

    // ---------- mantenimientos ----------

    public static long saveMant(Mantenimiento m) {
        ContentValues v = new ContentValues();
        v.put("equipo_id", m.equipoId);
        v.put("prioridad", m.prioridad);
        v.put("fecha_programada", m.fechaProgramada);
        v.put("fecha_reprogramada", m.fechaReprogramada);
        v.put("fecha_real", m.fechaReal);
        v.put("estado", m.estado);
        v.put("observaciones", m.observaciones);
        boolean editando = m.id > 0;
        if (editando) {
            w().update("mantenimientos", v, "id=?", new String[]{String.valueOf(m.id)});
        } else {
            m.id = w().insert("mantenimientos", null, v);
        }
        logAuditoria(editando ? "EDICION MANTENIMIENTO" : "ALTA MANTENIMIENTO",
                "Equipo: " + equipoName(m.equipoId) + " · Programado: " + m.fechaProgramada);
        return m.id;
    }

    public static void deleteMant(long id) {
        Mantenimiento m = getMant(id);
        w().delete("mantenimientos", "id=?", new String[]{String.valueOf(id)});
        logAuditoria("BAJA MANTENIMIENTO",
                m != null ? "Equipo: " + equipoName(m.equipoId) + " · Programado: " + m.fechaProgramada : "id=" + id);
    }

    public static Mantenimiento getMant(long id) {
        Cursor c = r().rawQuery("SELECT m.*, e.serie AS m_serie, e.hostname AS m_hostname, " +
                "u.nombre AS m_usuario " +
                "FROM mantenimientos m " +
                "LEFT JOIN equipos e ON e.id = m.equipo_id " +
                "LEFT JOIN usuarios u ON u.id = e.usuario_id WHERE m.id=?",
                new String[]{String.valueOf(id)});
        Mantenimiento m = null;
        if (c != null) {
            if (c.moveToFirst()) m = mantFromCursor(c);
            c.close();
        }
        return m;
    }

    public static ArrayList<Mantenimiento> allMants() {
        return allMants(0L);
    }

    public static ArrayList<Mantenimiento> allMants(long equipoId) {
        ArrayList<Mantenimiento> out = new ArrayList<>();
        String sql = "SELECT m.*, e.serie AS m_serie, e.hostname AS m_hostname, " +
                "u.nombre AS m_usuario " +
                "FROM mantenimientos m " +
                "LEFT JOIN equipos e ON e.id = m.equipo_id " +
                "LEFT JOIN usuarios u ON u.id = e.usuario_id ";
        String[] args = null;
        if (equipoId > 0) {
            sql += "WHERE m.equipo_id=? ";
            args = new String[]{String.valueOf(equipoId)};
        }
        sql += "ORDER BY m.fecha_programada DESC, m.id DESC";
        Cursor c = r().rawQuery(sql, args);
        if (c != null) {
            while (c.moveToNext()) out.add(mantFromCursor(c));
            c.close();
        }
        return out;
    }

    private static Mantenimiento mantFromCursor(Cursor c) {
        Mantenimiento m = new Mantenimiento();
        m.id = c.getLong(c.getColumnIndexOrThrow("id"));
        m.equipoId = c.getLong(c.getColumnIndexOrThrow("equipo_id"));
        m.prioridad = s(c, "prioridad");
        m.fechaProgramada = s(c, "fecha_programada");
        m.fechaReprogramada = s(c, "fecha_reprogramada");
        m.fechaReal = s(c, "fecha_real");
        m.estado = s(c, "estado");
        m.observaciones = s(c, "observaciones");
        m.serie = s(c, "m_serie");
        m.hostname = s(c, "m_hostname");
        m.usuario = s(c, "m_usuario");
        return m;
    }

    public static String equipoName(long id) {
        Equipo e = getEquipo(id);
        if (e == null) return "?";
        return e.hostname.length() > 0 ? e.hostname
                : (e.serie.length() > 0 ? e.serie : e.marca + " " + e.modelo);
    }

    public static String equipoLabel(Equipo e) {
        if (e == null) return "Equipo eliminado";
        StringBuilder sb = new StringBuilder();
        if (e.serie.length() > 0) sb.append(e.serie);
        if (e.hostname.length() > 0) {
            if (sb.length() > 0) sb.append(" · ");
            sb.append(e.hostname);
        }
        if (sb.length() == 0) {
            String mm = (e.marca + " " + e.modelo).trim();
            sb.append(mm);
        }
        return sb.toString();
    }

    // ---------- alertas ----------

    public static boolean estadoFinal(String estado) {
        if (estado == null) return false;
        String e = estado.toLowerCase(Locale.ROOT);
        if (e.contains("no realiz") || e.contains("no complet") || e.contains("no finaliz")) return false;
        return e.contains("realiz") || e.contains("complet") || e.contains("hecho")
                || e.contains("ok") || e.contains("cumplid") || e.contains("concluid")
                || e.contains("finaliz") || e.contains("termin") || e.contains("ejecutad")
                || e.contains("atendid") || e.contains("anulad") || e.contains("cancelad");
    }

    // tipo 0 = vencidos, 1 = proximos 30 dias
    public static ArrayList<Mantenimiento> alertas(int tipo) {
        ArrayList<Mantenimiento> out = new ArrayList<>();
        String today = Fmt.today();
        String lim = Fmt.addDays(today, 30);
        for (Mantenimiento m : allMants()) {
            if (m.fechaReal.length() > 0 || estadoFinal(m.estado)) continue;
            String eff = m.fechaReprogramada.length() > 0 ? m.fechaReprogramada : m.fechaProgramada;
            if (eff.length() == 0) continue;
            if (tipo == 0 && eff.compareTo(today) < 0) out.add(m);
            else if (tipo == 1 && eff.compareTo(today) >= 0 && eff.compareTo(lim) <= 0) out.add(m);
        }
        return out;
    }

    public static int countVencidos() {
        return alertas(0).size();
    }

    public static int countProximos() {
        return alertas(1).size();
    }

    public static ArrayList<Mantenimiento> recent(int n) {
        ArrayList<Mantenimiento> all = allMants();
        ArrayList<Mantenimiento> out = new ArrayList<>();
        for (int i = 0; i < all.size() && i < n; i++) out.add(all.get(i));
        return out;
    }

    // ---------- estadisticas ----------

    public static int countUsuarios() {
        return scalarInt("SELECT COUNT(*) FROM usuarios", null);
    }

    public static int countEquipos() {
        return scalarInt("SELECT COUNT(*) FROM equipos", null);
    }

    private static int scalarInt(String sql, String[] args) {
        Cursor c = r().rawQuery(sql, args);
        int v = 0;
        if (c != null) {
            if (c.moveToFirst()) v = c.getInt(0);
            c.close();
        }
        return v;
    }

    // ---------- carga masiva (Excel) ----------

    // Devuelve {importados, invalidos}; errores recibe los motivos.
    // Responsables: DNI, ZONA, RESPONSABLE (+ SUBDIVISION, CeCo SAP, AREA, CARGO, EMAIL si existen)
    public static int[] loadResponsables(String[] headers, List<String[]> filas, List<String> errores) {
        silencioAuditoria = true;
        try {
            return loadResponsables0(headers, filas, errores);
        } finally {
            silencioAuditoria = false;
        }
    }

    private static int[] loadResponsables0(String[] headers, List<String[]> filas, List<String> errores) {
        int ok = 0, err = 0;
        int colNombre = findCol(headers, "RESPONSABLE", "NOMBRE Y APELLIDOS", "NOMBRE");
        int colDni = findCol(headers, "DNI");
        int colZona = findCol(headers, "ZONA");
        int colSub = findCol(headers, "SUBDIVISION");
        int colCeco = findCol(headers, "CECO SAP", "CECO");
        int colArea = findCol(headers, "AREA");
        int colCargo = findCol(headers, "CARGO");
        int colEmail = findCol(headers, "EMAIL");

        if (colNombre < 0) {
            errores.add("Falta la columna RESPONSABLE (o NOMBRE Y APELLIDOS).");
            return new int[]{0, filas.size()};
        }

        HashMap<String, Boolean> existentes = new HashMap<>();
        for (Usuario u : allUsuarios()) {
            if (u.nombre != null) existentes.put(keyOf(u.nombre), true);
            if (u.dni != null && u.dni.length() > 0) existentes.put(keyOf(u.dni), true);
        }

        for (int i = 0; i < filas.size(); i++) {
            String[] f = filas.get(i);
            if (f.length == 0) continue;
            String nombre = val(f, colNombre);
            if (nombre.length() == 0) {
                err++;
                addError(errores, i, "responsable sin nombre");
                continue;
            }
            String dni = val(f, colDni);
            if (dni.length() == 0) {
                err++;
                addError(errores, i, "falta DNI");
                continue;
            }
            if (existentes.containsKey(keyOf(nombre))) {
                err++;
                addError(errores, i, "responsable duplicado: " + nombre);
                continue;
            }
            if (existentes.containsKey(keyOf(dni))) {
                err++;
                addError(errores, i, "DNI duplicado: " + dni);
                continue;
            }
            Usuario u = new Usuario();
            u.nombre = nombre;
            u.dni = dni;
            u.zona = val(f, colZona);
            u.subdivision = val(f, colSub);
            u.ceco = val(f, colCeco);
            u.area = val(f, colArea);
            u.cargo = val(f, colCargo);
            u.email = val(f, colEmail);
            u.clave = dni;
            u.rol = ROL_EDICION;
            saveUsuario(u);
            existentes.put(keyOf(nombre), true);
            existentes.put(keyOf(dni), true);
            ok++;
        }
        logAuditoria("CARGA MASIVA RESPONSABLES", "Importados: " + ok + " · Inválidos: " + err);
        return new int[]{ok, err};
    }

    // Equipos: USUARIO/RESPONSABLE, DNI, HOSTNAME, DIR. IP, UBICACIÓN FISICA, EQUIPO,
    // COD. INVENTARIO, SERIE DE EQUIPO, MARCA, MODELO, CONTRATO DE ARRENDAMIENTO, STATUS
    public static int[] loadEquipos(String[] headers, List<String[]> filas, List<String> errores) {
        silencioAuditoria = true;
        try {
            return loadEquipos0(headers, filas, errores);
        } finally {
            silencioAuditoria = false;
        }
    }

    private static int[] loadEquipos0(String[] headers, List<String[]> filas, List<String> errores) {
        int ok = 0, err = 0;
        int colResp = findCol(headers, "USUARIO", "RESPONSABLE");
        int colDni = findCol(headers, "DNI");
        int colHost = findCol(headers, "HOSTNAME", "NEW HOSTNAME");
        int colIp = findCol(headers, "DIR. IP", "IP");
        int colUbic = findCol(headers, "UBICACIÓN FISICA", "UBICACION", "UBICACIÓN");
        int colEquipo = findCol(headers, "EQUIPO");
        int colCod = findCol(headers, "COD. INVENTARIO", "COD");
        int colSerie = findCol(headers, "SERIE DE EQUIPO", "SERIE");
        int colMarca = findCol(headers, "MARCA");
        int colModelo = findCol(headers, "MODELO");
        int colContrato = findCol(headers, "CONTRATO DE ARRENDAMIENTO", "CONTRATO");
        int colStatus = findCol(headers, "STATUS");

        if (colSerie < 0 && colHost < 0) {
            errores.add("Faltan las columnas SERIE DE EQUIPO / HOSTNAME.");
            return new int[]{0, filas.size()};
        }

        HashMap<String, Boolean> seriesUsadas = new HashMap<>();
        for (Equipo e : allEquipos()) {
            if (e.serie.length() > 0) seriesUsadas.put(keyOf(e.serie), true);
        }

        for (int i = 0; i < filas.size(); i++) {
            String[] f = filas.get(i);
            if (f.length == 0) continue;
            String serie = val(f, colSerie);
            if (serie.length() == 0) serie = val(f, colHost);
            if (serie.length() == 0) {
                err++;
                addError(errores, i, "equipo sin serie / hostname");
                continue;
            }
            if (seriesUsadas.containsKey(keyOf(serie))) {
                err++;
                addError(errores, i, "serie duplicada: " + serie);
                continue;
            }
            String respText = val(f, colResp);
            String dniText = val(f, colDni);
            Usuario u = null;
            if (dniText.length() > 0) u = findUsuarioByDni(dniText);
            if (u == null && respText.length() > 0) u = matchResponsable(respText);
            if (u == null && respText.length() > 0) {
                u = new Usuario();
                u.nombre = respText;
                u.dni = dniText;
                u.clave = dniText;
                u.rol = ROL_EDICION;
                u.id = saveUsuario(u);
            } else if (u != null && dniText.length() > 0 && !dniText.equalsIgnoreCase(u.dni)) {
                u.dni = dniText;
                saveUsuario(u);
            }
            Equipo e = new Equipo();
            e.usuarioId = u != null ? u.id : 0;
            e.hostname = val(f, colHost);
            e.ip = val(f, colIp);
            e.ubicacion = val(f, colUbic);
            e.equipo = val(f, colEquipo);
            e.codInventario = val(f, colCod);
            e.serie = serie;
            e.marca = val(f, colMarca);
            e.modelo = val(f, colModelo);
            e.contrato = val(f, colContrato);
            e.status = val(f, colStatus);
            saveEquipo(e);
            seriesUsadas.put(keyOf(serie), true);
            ok++;
        }
        logAuditoria("CARGA MASIVA EQUIPOS", "Importados: " + ok + " · Inválidos: " + err);
        return new int[]{ok, err};
    }

    // Mantenimientos: SERIE DE EQUIPO, Prioridad, FECHA PROGRAMADA, FECHA REPROGRAMADA,
    // FECHA REAL, ESTADO, OBSERVACIONES
    public static int[] loadMantenimientos(String[] headers, List<String[]> filas, List<String> errores) {
        silencioAuditoria = true;
        try {
            return loadMantenimientos0(headers, filas, errores);
        } finally {
            silencioAuditoria = false;
        }
    }

    private static int[] loadMantenimientos0(String[] headers, List<String[]> filas, List<String> errores) {
        int ok = 0, err = 0;
        int colSerie = findCol(headers, "SERIE DE EQUIPO", "SERIE");
        int colPrioridad = findCol(headers, "PRIORIDAD");
        int colProg = findCol(headers, "FECHA PROGRAMADA");
        int colRepro = findCol(headers, "FECHA REPROGRAMADA");
        int colReal = findCol(headers, "FECHA REAL");
        int colEstado = findCol(headers, "ESTADO");
        int colObs = findCol(headers, "OBSERVACIONES");

        if (colSerie < 0) {
            errores.add("Falta la columna SERIE DE EQUIPO.");
            return new int[]{0, filas.size()};
        }

        for (int i = 0; i < filas.size(); i++) {
            String[] f = filas.get(i);
            if (f.length == 0) continue;
            String serie = val(f, colSerie);
            if (serie.length() == 0) {
                err++;
                addError(errores, i, "serie vacía");
                continue;
            }
            Equipo e = findEquipoBySerie(serie);
            if (e == null) {
                err++;
                addError(errores, i, "serie no existe: " + serie);
                continue;
            }
            Mantenimiento m = new Mantenimiento();
            m.equipoId = e.id;
            m.prioridad = val(f, colPrioridad);
            m.fechaProgramada = toDate(val(f, colProg));
            m.fechaReprogramada = toDate(val(f, colRepro));
            m.fechaReal = toDate(val(f, colReal));
            m.estado = val(f, colEstado);
            m.observaciones = val(f, colObs);
            saveMant(m);
            ok++;
        }
        logAuditoria("CARGA MASIVA MANTENIMIENTOS", "Importados: " + ok + " · Inválidos: " + err);
        return new int[]{ok, err};
    }

    private static void addError(List<String> errores, int row, String motivo) {
        if (errores.size() < 12) {
            errores.add("Fila " + (row + 2) + ": " + motivo);
        }
    }

    // Coincidencia: primero igualdad exacta (sin acentos ni espacios), luego "contiene".
    private static int findCol(String[] headers, String... names) {
        String[] targets = new String[names.length];
        for (int i = 0; i < names.length; i++) targets[i] = keyOf(names[i]);
        for (int pass = 0; pass < 2; pass++) {
            for (int i = 0; i < headers.length; i++) {
                String h = keyOf(headers[i]);
                if (h.length() == 0) continue;
                for (String t : targets) {
                    if (t.length() == 0) continue;
                    if (pass == 0 ? h.equals(t) : h.contains(t)) return i;
                }
            }
        }
        return -1;
    }

    private static String keyOf(String s) {
        if (s == null) return "";
        return java.text.Normalizer.normalize(s, java.text.Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "").replaceAll("[^A-Za-z0-9]", "").toUpperCase();
    }

    private static String val(String[] f, int col) {
        if (col < 0 || col >= f.length) return "";
        return f[col] == null ? "" : f[col].trim();
    }

    // Convierte una fecha de Excel a yyyy-MM-dd (interno): serial numérico (ej. 45658) o texto DD/MM/YYYY.
    private static String toDate(String v) {
        if (v == null || v.length() == 0) return "";
        try {
            double serial = Double.parseDouble(v.trim());
            long millis = (long) ((serial - 25569) * 86400000L);
            java.util.Calendar cal = java.util.Calendar.getInstance(java.util.TimeZone.getTimeZone("UTC"));
            cal.setTimeInMillis(millis);
            return String.format(java.util.Locale.US, "%04d-%02d-%02d",
                    cal.get(java.util.Calendar.YEAR),
                    cal.get(java.util.Calendar.MONTH) + 1,
                    cal.get(java.util.Calendar.DAY_OF_MONTH));
        } catch (NumberFormatException e) {
            return Fmt.canon(v);
        }
    }

    // ---------- respaldo JSON ----------

    public static String exportJson() throws JSONException {
        JSONObject root = new JSONObject();
        root.put("app", "Inventario de equipos");
        root.put("version", 4);
        root.put("exported", Fmt.today());

        JSONArray uss = new JSONArray();
        for (Usuario u : allUsuarios()) {
            JSONObject o = new JSONObject();
            o.put("id", u.id);
            o.put("nombre", u.nombre);
            o.put("subdivision", u.subdivision);
            o.put("dni", u.dni);
            o.put("ceco", u.ceco);
            o.put("area", u.area);
            o.put("cargo", u.cargo);
            o.put("email", u.email);
            o.put("zona", u.zona);
            o.put("clave", u.clave);
            o.put("rol", u.rol);
            uss.put(o);
        }
        root.put("usuarios", uss);

        JSONArray eqs = new JSONArray();
        for (Equipo e : allEquipos()) {
            JSONObject o = new JSONObject();
            o.put("id", e.id);
            o.put("usuario_id", e.usuarioId);
            o.put("hostname", e.hostname);
            o.put("ip", e.ip);
            o.put("ubicacion", e.ubicacion);
            o.put("equipo", e.equipo);
            o.put("cod_inventario", e.codInventario);
            o.put("serie", e.serie);
            o.put("marca", e.marca);
            o.put("modelo", e.modelo);
            o.put("contrato", e.contrato);
            o.put("status", e.status);
            eqs.put(o);
        }
        root.put("equipos", eqs);

        JSONArray mts = new JSONArray();
        for (Mantenimiento m : allMants()) {
            JSONObject o = new JSONObject();
            o.put("id", m.id);
            o.put("equipo_id", m.equipoId);
            o.put("prioridad", m.prioridad);
            o.put("fecha_programada", m.fechaProgramada);
            o.put("fecha_reprogramada", m.fechaReprogramada);
            o.put("fecha_real", m.fechaReal);
            o.put("estado", m.estado);
            o.put("observaciones", m.observaciones);
            mts.put(o);
        }
        root.put("mantenimientos", mts);
        logAuditoria("EXPORTACION DE DATOS", "Registros: " + uss.length() + " usuarios, "
                + eqs.length() + " equipos, " + mts.length() + " mantenimientos");
        return root.toString(2);
    }

    public static void importJson(String json) throws JSONException {
        JSONObject root = new JSONObject(json);
        SQLiteDatabase db = w();
        db.beginTransaction();
        try {
            db.delete("mantenimientos", null, null);
            db.delete("equipos", null, null);
            db.delete("usuarios", null, null);

            HashMap<Long, Long> mapUsuarios = new HashMap<>();
            JSONArray uss = root.optJSONArray("usuarios");
            if (uss != null) {
                for (int i = 0; i < uss.length(); i++) {
                    JSONObject o = uss.getJSONObject(i);
                    Usuario u = new Usuario();
                    u.nombre = o.optString("nombre");
                    u.subdivision = o.optString("subdivision");
                    u.dni = o.optString("dni");
                    u.ceco = o.optString("ceco");
                    u.area = o.optString("area");
                    u.cargo = o.optString("cargo");
                    u.email = o.optString("email");
                    u.zona = o.optString("zona");
                    u.clave = o.optString("clave");
                    u.rol = o.optInt("rol", ROL_EDICION);
                    ContentValues v = new ContentValues();
                    v.put("nombre", u.nombre);
                    v.put("subdivision", u.subdivision);
                    v.put("dni", u.dni);
                    v.put("ceco", u.ceco);
                    v.put("area", u.area);
                    v.put("cargo", u.cargo);
                    v.put("email", u.email);
                    v.put("zona", u.zona);
                    v.put("clave", u.clave);
                    v.put("rol", u.rol);
                    mapUsuarios.put(o.optLong("id", 0), db.insert("usuarios", null, v));
                }
            }

            HashMap<Long, Long> mapEquipos = new HashMap<>();
            JSONArray eqs = root.optJSONArray("equipos");
            if (eqs != null) {
                for (int i = 0; i < eqs.length(); i++) {
                    JSONObject o = eqs.getJSONObject(i);
                    Equipo e = new Equipo();
                    e.usuarioId = o.optLong("usuario_id", 0);
                    e.hostname = o.optString("hostname");
                    e.ip = o.optString("ip");
                    e.ubicacion = o.optString("ubicacion");
                    e.equipo = o.optString("equipo");
                    e.codInventario = o.optString("cod_inventario");
                    e.serie = o.optString("serie");
                    e.marca = o.optString("marca");
                    e.modelo = o.optString("modelo");
                    e.contrato = o.optString("contrato");
                    e.status = o.optString("status");
                    Long mapped = mapUsuarios.get(e.usuarioId);
                    if (mapped != null) e.usuarioId = mapped;
                    ContentValues v = new ContentValues();
                    v.put("usuario_id", e.usuarioId);
                    v.put("hostname", e.hostname);
                    v.put("ip", e.ip);
                    v.put("ubicacion", e.ubicacion);
                    v.put("equipo", e.equipo);
                    v.put("cod_inventario", e.codInventario);
                    v.put("serie", e.serie);
                    v.put("marca", e.marca);
                    v.put("modelo", e.modelo);
                    v.put("contrato", e.contrato);
                    v.put("status", e.status);
                    mapEquipos.put(o.optLong("id", 0), db.insert("equipos", null, v));
                }
            }

            JSONArray mts = root.optJSONArray("mantenimientos");
            if (mts != null) {
                for (int i = 0; i < mts.length(); i++) {
                    JSONObject o = mts.getJSONObject(i);
                    Long mapped = mapEquipos.get(o.optLong("equipo_id", 0));
                    Mantenimiento m = new Mantenimiento();
                    m.equipoId = mapped != null ? mapped : 0L;
                    m.prioridad = o.optString("prioridad");
                    m.fechaProgramada = o.optString("fecha_programada");
                    m.fechaReprogramada = o.optString("fecha_reprogramada");
                    m.fechaReal = o.optString("fecha_real");
                    m.estado = o.optString("estado");
                    m.observaciones = o.optString("observaciones");
                    ContentValues v = new ContentValues();
                    v.put("equipo_id", m.equipoId);
                    v.put("prioridad", m.prioridad);
                    v.put("fecha_programada", m.fechaProgramada);
                    v.put("fecha_reprogramada", m.fechaReprogramada);
                    v.put("fecha_real", m.fechaReal);
                    v.put("estado", m.estado);
                    v.put("observaciones", m.observaciones);
                    db.insert("mantenimientos", null, v);
                }
            }
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
        logAuditoria("IMPORTACION DE DATOS", "Respaldo restaurado");
    }

    // ---------- vaciar ----------

    public static void vaciar() {
        SQLiteDatabase db = w();
        db.delete("mantenimientos", null, null);
        db.delete("equipos", null, null);
        db.delete("usuarios", null, null);
        logAuditoria("VACIAR BASE DE DATOS", "Se eliminaron todos los registros");
        ensureAdmin();
    }

    // Deja como pendientes (PROGRAMADO) todos los mantenimientos programados para 2026,
    // borrando su fecha real/reprogramada para que aparezcan activos en Alertas.
    public static int activarMantenimientos2026() {
        SQLiteDatabase db = w();
        ContentValues v = new ContentValues();
        v.put("estado", "PROGRAMADO");
        v.put("fecha_real", "");
        v.put("fecha_reprogramada", "");
        int n = db.update("mantenimientos", v,
                "fecha_programada LIKE '2026-%' OR fecha_reprogramada LIKE '2026-%'", null);
        logAuditoria("ACTIVAR MANTENIMIENTOS 2026", n + " mantenimiento(s) activado(s)");
        return n;
    }

    private static String s(Cursor c, String col) {
        int i = c.getColumnIndexOrThrow(col);
        String v = c.getString(i);
        return v == null ? "" : v;
    }
}