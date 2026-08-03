package me.app.mantenimiento;

import android.content.Context;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

// ============================================================
//  Sincronización con el servidor compartido (APK + PWA).
//  Envía Db.exportJson() (formato canónico del APK) con POST y
//  descarga la versión guardada con GET para importarla.
//  Debe llamarse desde un hilo en segundo plano.
// ============================================================
public final class Sync {

    private static final String SYNC_URL = "sync_url";
    private static final String SYNC_TOKEN = "sync_token";
    private static final String SYNC_LAST = "sync_last";
    private static final String TOKEN_DEFECTO = "mantenimiento2026";

    private Sync() {
    }

    public static String getUrl(Context c) {
        return Db.prefs(c).getString(SYNC_URL, "");
    }

    public static String getToken(Context c) {
        String t = Db.prefs(c).getString(SYNC_TOKEN, "");
        return t.length() == 0 ? TOKEN_DEFECTO : t;
    }

    public static void setUrl(Context c, String url) {
        Db.prefs(c).edit().putString(SYNC_URL, url == null ? "" : url.trim()).apply();
    }

    public static void setToken(Context c, String token) {
        Db.prefs(c).edit().putString(SYNC_TOKEN, token == null ? "" : token.trim()).apply();
    }

    public static String getLast(Context c) {
        return Db.prefs(c).getString(SYNC_LAST, "");
    }

    public static void setLast(Context c, String last) {
        Db.prefs(c).edit().putString(SYNC_LAST, last).apply();
    }

    public static boolean enabled(Context c) {
        return getUrl(c).trim().length() > 0;
    }

    // Devuelve un mensaje para mostrar al usuario. Bloquea (red + BD).
    public static String sincronizar(Context c) {
        if (!enabled(c)) return "Sync no configurada";
        HttpURLConnection conn = null;
        try {
            String base = getUrl(c).trim().replaceAll("/+$", "");
            String token = getToken(c).trim();

            JSONObject body = new JSONObject();
            body.put("data", new JSONObject(Db.exportJson()));

            conn = (HttpURLConnection) new URL(base + "/api/sync").openConnection();
            conn.setRequestMethod("POST");
            conn.setDoOutput(true);
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(30000);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Authorization", "Bearer " + token);
            OutputStream os = conn.getOutputStream();
            os.write(body.toString().getBytes("UTF-8"));
            os.close();
            int code = conn.getResponseCode();
            if (code != 200) {
                return "Error del servidor (" + code + "). Revisa la URL y la clave.";
            }
            String respuesta = leer(conn.getInputStream());
            conn.disconnect();
            conn = null;

            JSONObject remoto = new JSONObject(respuesta).optJSONObject("data");
            if (remoto == null) {
                return "El servidor no devolvió datos";
            }
            Db.importJson(remoto.toString());
            Db.refrescarSesion();
            setLast(c, new SimpleDateFormat("dd/MM/yyyy HH:mm", Locale.getDefault()).format(new Date()));
            return "Sincronizado OK";
        } catch (Exception e) {
            App.logMessage("SYNC ERROR: " + App.crashMsg(e));
            return "Error: " + App.crashMsg(e);
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static String leer(InputStream in) throws Exception {
        BufferedReader br = new BufferedReader(new InputStreamReader(in, "UTF-8"));
        StringBuilder sb = new StringBuilder();
        String l;
        while ((l = br.readLine()) != null) sb.append(l);
        br.close();
        return sb.toString();
    }
}
