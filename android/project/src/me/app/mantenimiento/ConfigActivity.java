package me.app.mantenimiento;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.EditText;
import android.widget.Spinner;
import android.widget.TableLayout;
import android.widget.TableRow;
import android.widget.TextView;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

public class ConfigActivity extends Activity implements View.OnClickListener {

    private static final int REQ_EXPORT = 1;
    private static final int REQ_IMPORT = 2;
    private static final int REQ_EXCEL = 3;

    private EditText cfgEmpresa;
    private EditText correoAsunto;
    private EditText correoCuerpo;
    private Spinner correoUbicacion;
    private TableLayout correoTable;
    private TextView txtSesion;
    private byte[] excelPendiente = null;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Db.init(this);
        if (!Db.sesionActiva()) {
            irALogin();
            return;
        }
        setContentView(R.layout.activity_config);

        findViewById(R.id.navPanel).setOnClickListener(this);
        findViewById(R.id.navEquipos).setOnClickListener(this);
        findViewById(R.id.navMantenimientos).setOnClickListener(this);
        findViewById(R.id.navAlertas).setOnClickListener(this);
        findViewById(R.id.navConfig).setOnClickListener(this);
        Ui.ajustarNav(this);

        cfgEmpresa = (EditText) findViewById(R.id.cfgEmpresa);
        txtSesion = (TextView) findViewById(R.id.txtSesion);

        correoAsunto = (EditText) findViewById(R.id.correoAsunto);
        correoCuerpo = (EditText) findViewById(R.id.correoCuerpo);
        correoUbicacion = (Spinner) findViewById(R.id.correoUbicacion);
        correoTable = (TableLayout) findViewById(R.id.correoTable);
        cargarUbicaciones();
        correoUbicacion.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override
            public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
                renderCorreoDetalle();
            }

            @Override
            public void onNothingSelected(AdapterView<?> parent) {
            }
        });
        findViewById(R.id.btnEnviarCorreo).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                enviarCorreo();
            }
        });

        findViewById(R.id.btnMiPerfil).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                startActivity(new Intent(ConfigActivity.this, UsuarioFormActivity.class)
                        .putExtra("perfil", true));
            }
        });
        findViewById(R.id.btnCerrarSesion).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                Db.cerrarSesion();
                Fmt.toast(ConfigActivity.this, "Sesión cerrada");
                irALogin();
            }
        });
        findViewById(R.id.btnAuditoria).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (Db.esAdmin()) {
                    startActivity(new Intent(ConfigActivity.this, AuditoriaActivity.class));
                } else {
                    Fmt.toast(ConfigActivity.this, "Solo el administrador");
                }
            }
        });
        findViewById(R.id.btnCargarResponsables).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                startActivity(new Intent(ConfigActivity.this, CargaMasivaActivity.class)
                        .putExtra("tipo", CargaMasivaActivity.TIPO_RESPONSABLES));
            }
        });
        findViewById(R.id.btnCargarEquipos).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                startActivity(new Intent(ConfigActivity.this, CargaMasivaActivity.class)
                        .putExtra("tipo", CargaMasivaActivity.TIPO_EQUIPOS));
            }
        });
        findViewById(R.id.btnCargarMantenimientos).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                startActivity(new Intent(ConfigActivity.this, CargaMasivaActivity.class)
                        .putExtra("tipo", CargaMasivaActivity.TIPO_MANTENIMIENTOS));
            }
        });
        findViewById(R.id.btnVerResponsables).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (Db.esAdmin()) {
                    startActivity(new Intent(ConfigActivity.this, UsuariosActivity.class));
                } else {
                    Fmt.toast(ConfigActivity.this, "Solo el administrador");
                }
            }
        });
        findViewById(R.id.btnProgramacion).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (Db.esAdmin()) {
                    startActivity(new Intent(ConfigActivity.this, ProgramacionActivity.class));
                } else {
                    Fmt.toast(ConfigActivity.this, "Solo el administrador");
                }
            }
        });
        findViewById(R.id.btnGuardarConfig).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                Db.setEmpresa(ConfigActivity.this, cfgEmpresa.getText().toString().trim());
                Fmt.toast(ConfigActivity.this, "Configuración guardada");
            }
        });
        findViewById(R.id.btnExportar).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                exportar();
            }
        });
        findViewById(R.id.btnExportarExcel).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                exportarExcel();
            }
        });
        findViewById(R.id.btnImportar).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                importar();
            }
        });
        findViewById(R.id.btnVaciarBd).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                confirmarVaciar();
            }
        });
        findViewById(R.id.btnActivar2026).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                confirmarActivar2026();
            }
        });
        findViewById(R.id.btnVerErrores).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                verErrores();
            }
        });

        // Muestra la versión real del APK instalado
        try {
            String v = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            ((TextView) findViewById(R.id.txtVersion)).setText("Versión " + v);
        } catch (Exception ignored) {
        }
    }

    private void verErrores() {
        final String log = App.readLog();
        if (log.length() == 0) {
            Fmt.toast(this, "Sin errores registrados");
            return;
        }
        android.widget.TextView tv = new android.widget.TextView(this);
        tv.setText(log);
        tv.setTextSize(11);
        tv.setTextColor(Ui.TEXT);
        tv.setTypeface(android.graphics.Typeface.MONOSPACE);
        tv.setPadding(Ui.dp(this, 16), Ui.dp(this, 16), Ui.dp(this, 16), Ui.dp(this, 16));
        android.widget.ScrollView sv = new android.widget.ScrollView(this);
        sv.addView(tv);
        new AlertDialog.Builder(this)
                .setTitle("Errores registrados")
                .setView(sv)
                .setPositiveButton("Copiar", new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface d, int which) {
                        android.content.ClipboardManager cm = (android.content.ClipboardManager)
                                getSystemService(CLIPBOARD_SERVICE);
                        cm.setText(log);
                        Fmt.toast(ConfigActivity.this, "Texto copiado. Pégalo y envíalo.");
                    }
                })
                .setNegativeButton("Cerrar", null)
                .show();
    }

    private void confirmarVaciar() {
        new AlertDialog.Builder(this)
                .setTitle("Vaciar base de datos")
                .setMessage("Se borrarán todos los responsables, equipos y mantenimientos. ¿Continuar?")
                .setPositiveButton("Vaciar", new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface d, int which) {
                        Db.vaciar();
                        Fmt.toast(ConfigActivity.this, "Base de datos vaciada");
                    }
                })
                .setNegativeButton("Cancelar", null)
                .show();
    }

    private void confirmarActivar2026() {
        new AlertDialog.Builder(this)
                .setTitle("Activar mantenimientos 2026")
                .setMessage("Se pondrán como PROGRAMADO (pendiente) todos los mantenimientos programados para 2026, borrando su fecha real, para que aparezcan activos en Alertas. ¿Continuar?")
                .setPositiveButton("Activar", new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface d, int which) {
                        try {
                            int n = Db.activarMantenimientos2026();
                            Fmt.toast(ConfigActivity.this, n + " mantenimiento(s) activado(s)");
                        } catch (Exception e) {
                            Fmt.toast(ConfigActivity.this, "Error: " + e.getMessage());
                        }
                    }
                })
                .setNegativeButton("Cancelar", null)
                .show();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (!Db.sesionActiva()) {
            irALogin();
            return;
        }
        cfgEmpresa.setText(Db.getEmpresa(this));
        txtSesion.setText("Sesión: " + Db.getSesionNombre() + "  ·  " + Db.rolNombre(Db.getSesionRol()));
        aplicarPermisos();
        if (Db.puedeEditar()) {
            String cur = correoUbicacion.getSelectedItem() == null ? "" : correoUbicacion.getSelectedItem().toString();
            cargarUbicaciones();
            seleccionarUbicacion(cur);
            renderCorreoDetalle();
        }
    }

    private void seleccionarUbicacion(String cur) {
        if (cur.length() == 0) return;
        android.widget.BaseAdapter ad = (android.widget.BaseAdapter) correoUbicacion.getAdapter();
        if (ad == null) return;
        for (int i = 0; i < ad.getCount(); i++) {
            if (cur.equals(ad.getItem(i).toString())) {
                correoUbicacion.setSelection(i);
                break;
            }
        }
    }

    private void aplicarPermisos() {
        boolean edicion = Db.puedeEditar();
        boolean admin = Db.esAdmin();
        set(R.id.btnCargarResponsables, edicion);
        set(R.id.btnCargarEquipos, edicion);
        set(R.id.btnCargarMantenimientos, edicion);
        set(R.id.btnExportar, true);
        set(R.id.btnExportarExcel, true);
        set(R.id.btnImportar, edicion);
        set(R.id.btnVerResponsables, true);
        set(R.id.cardEmpresa, admin);
        set(R.id.cardProgramacion, admin);
        set(R.id.cardCorreo, edicion);
        set(R.id.btnActivar2026, admin);
        set(R.id.cardMant2026, admin);
        set(R.id.cardDatos, admin);
        set(R.id.btnAuditoria, admin);
    }

    private void set(int id, boolean visible) {
        findViewById(id).setVisibility(visible ? View.VISIBLE : View.GONE);
    }

    private void irALogin() {
        Intent i = new Intent(this, LoginActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        startActivity(i);
        finish();
    }

    private void cargarUbicaciones() {
        Set<String> set = new LinkedHashSet<>();
        for (Equipo e : Db.allEquipos()) {
            String u = e.ubicacion == null ? "" : e.ubicacion.trim();
            if (u.length() > 0) set.add(u);
        }
        ArrayList<String> list = new ArrayList<>();
        list.add("Todas las ubicaciones");
        list.addAll(set);
        Collections.sort(list.subList(1, list.size()));
        ArrayAdapter<String> ad = new ArrayAdapter<>(this,
                android.R.layout.simple_spinner_item, list);
        ad.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        correoUbicacion.setAdapter(ad);
    }

    private ArrayList<Equipo> equiposDeUbicacion(String ubic) {
        ArrayList<Equipo> out = new ArrayList<>();
        for (Equipo e : Db.allEquipos()) {
            String u = e.ubicacion == null ? "" : e.ubicacion.trim();
            if (ubic == null || ubic.length() == 0 || u.equals(ubic)) out.add(e);
        }
        return out;
    }

    private String fechaEfectivaEquipo(Equipo e) {
        String mejor = "";
        for (Mantenimiento m : Db.allMants(e.id)) {
            if (m.fechaReal != null && m.fechaReal.trim().length() > 0) continue;
            String f = (m.fechaReprogramada != null && m.fechaReprogramada.trim().length() > 0)
                    ? m.fechaReprogramada
                    : (m.fechaProgramada == null ? "" : m.fechaProgramada);
            if (f.length() == 0) continue;
            if (mejor.length() == 0 || f.compareTo(mejor) < 0) mejor = f;
        }
        if (mejor.length() > 0) return mejor;
        ArrayList<Mantenimiento> ms = Db.allMants(e.id);
        for (int i = ms.size() - 1; i >= 0; i--) {
            Mantenimiento m = ms.get(i);
            if (m.proxima != null && m.proxima.trim().length() > 0) return m.proxima;
        }
        return "";
    }

    private String nzOrDash(String s) {
        String v = nz(s).trim();
        return v.length() == 0 ? "—" : v;
    }

    // Tabla de texto alineada para el cuerpo del correo: solo usuario asignado,
    // ubicación, responsable y fecha programada.
    private String tablaTextoCorreo(ArrayList<Equipo> eqs) {
        ArrayList<String[]> filas = new ArrayList<>();
        filas.add(new String[]{"USUARIO ASIGNADO", "UBICACIÓN", "RESPONSABLE", "FECHA PROGRAMADA"});
        for (Equipo e : eqs) {
            filas.add(new String[]{
                    nzOrDash(e.usuarioAsignado),
                    nzOrDash(e.ubicacion),
                    nzOrDash(e.responsable),
                    Fmt.disp(fechaEfectivaEquipo(e))
            });
        }
        int[] anchos = new int[4];
        for (String[] f : filas) {
            for (int i = 0; i < 4; i++) {
                if (f[i].length() > anchos[i]) anchos[i] = f[i].length();
            }
        }
        StringBuilder sb = new StringBuilder();
        for (String[] f : filas) {
            for (int i = 0; i < 4; i++) {
                if (i > 0) sb.append(" | ");
                sb.append(f[i]);
                for (int p = f[i].length(); p < anchos[i]; p++) sb.append(' ');
            }
            sb.append("\n");
        }
        return sb.toString();
    }

    private void addFilaTabla(String[] cells, boolean header) {
        TableRow row = new TableRow(this);
        for (String c : cells) {
            TextView tv = new TextView(this);
            tv.setText(c);
            int pad = Ui.dp(this, 6);
            tv.setPadding(pad, pad, pad, pad);
            if (header) {
                tv.setTextSize(11);
                tv.setTextColor(Ui.TEXT);
                tv.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
                tv.setBackgroundColor(0xFFF1F5F9);
            } else {
                tv.setTextSize(12);
                tv.setTextColor(Ui.TEXT);
            }
            row.addView(tv);
        }
        correoTable.addView(row);
    }

    private void renderCorreoDetalle() {
        if (correoTable == null) return;
        correoTable.removeAllViews();
        String ubic = correoUbicacion.getSelectedItem() == null
                ? "" : correoUbicacion.getSelectedItem().toString();
        if (ubic.equals("Todas las ubicaciones")) ubic = "";
        ArrayList<Equipo> eqs = equiposDeUbicacion(ubic);
        addFilaTabla(new String[]{"USUARIO ASIGNADO", "UBICACIÓN", "RESPONSABLE", "FECHA PROGRAMADA"}, true);
        if (eqs.isEmpty()) {
            TextView tv = new TextView(this);
            tv.setText("Sin equipos en esta ubicación.");
            tv.setTextSize(13);
            tv.setTextColor(Ui.MUT);
            tv.setPadding(Ui.dp(this, 4), Ui.dp(this, 10), Ui.dp(this, 4), Ui.dp(this, 4));
            correoTable.addView(tv);
            return;
        }
        // Orden: fecha programada efectiva y luego usuario asignado.
        Collections.sort(eqs, new Comparator<Equipo>() {
            @Override
            public int compare(Equipo a, Equipo b) {
                String fa = fechaEfectivaEquipo(a);
                String fb = fechaEfectivaEquipo(b);
                int c = fa.compareTo(fb);
                if (c != 0) return c;
                c = nz(a.usuarioAsignado).compareTo(nz(b.usuarioAsignado));
                if (c != 0) return c;
                return (nz(a.hostname) + nz(a.serie)).compareTo(nz(b.hostname) + nz(b.serie));
            }
        });
        for (Equipo e : eqs) {
            addFilaTabla(new String[]{
                    nzOrDash(e.usuarioAsignado),
                    nzOrDash(e.ubicacion),
                    nzOrDash(e.responsable),
                    Fmt.disp(fechaEfectivaEquipo(e))
            }, false);
        }
    }

    private void enviarCorreo() {
        String ubic = correoUbicacion.getSelectedItem() == null
                ? "Todas las ubicaciones" : correoUbicacion.getSelectedItem().toString();
        boolean todas = ubic.equals("Todas las ubicaciones");
        ArrayList<Equipo> eqs = equiposDeUbicacion(todas ? "" : ubic);
        Set<String> correos = new LinkedHashSet<>();
        for (Equipo e : eqs) {
            if (e.email != null && e.email.trim().length() > 0) correos.add(e.email.trim());
        }
        if (correos.isEmpty()) {
            Fmt.toast(this, "No hay correos registrados en la ubicación seleccionada");
            return;
        }
        StringBuilder to = new StringBuilder();
        for (String c : correos) {
            if (to.length() > 0) to.append(",");
            to.append(c);
        }
        String asunto = correoAsunto.getText().toString().trim();
        if (asunto.length() == 0) asunto = getString(R.string.correo_asunto);
        String cuerpo = correoCuerpo.getText().toString().trim();
        String marker = "Detalle de equipos programados:";
        String tabla = tablaTextoCorreo(eqs);
        StringBuilder body = new StringBuilder();
        int idx = cuerpo.indexOf(marker);
        if (idx >= 0) {
            body.append(cuerpo.substring(0, idx + marker.length()))
                    .append("\n\n").append(tabla)
                    .append(cuerpo.substring(idx + marker.length()));
        } else {
            if (cuerpo.length() > 0) body.append(cuerpo).append("\n\n");
            body.append(marker).append("\n\n").append(tabla);
        }
        Intent i = new Intent(Intent.ACTION_SENDTO);
        i.setData(Uri.parse("mailto:" + to.toString()));
        i.putExtra(Intent.EXTRA_SUBJECT, asunto);
        i.putExtra(Intent.EXTRA_TEXT, body.toString());
        try {
            startActivity(Intent.createChooser(i, "Enviar correo"));
        } catch (Exception ex) {
            Fmt.toast(this, "No hay aplicación de correo instalada");
            return;
        }
        Db.logAuditoria("ENVIAR CORREO PROGRAMACION",
                "Ubicación: " + (todas ? "Todas" : ubic) + " · Equipos: " + eqs.size());
        Fmt.toast(this, "Abriendo el correo...");
    }

    private void exportar() {
        try {
            String json = Db.exportJson();
            Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType("application/json");
            i.putExtra(Intent.EXTRA_TITLE, "inventario_respaldo.json");
            startActivityForResult(i, REQ_EXPORT);
            pendienteJson = json;
        } catch (Exception e) {
            Fmt.toast(this, "No se pudo exportar: " + e.getMessage());
        }
    }

    private void importar() {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("application/json");
        startActivityForResult(i, REQ_IMPORT);
    }

    private void exportarExcel() {
        try {
            byte[] bytes = crearXlsx(construirFilasExcel());
            if (bytes == null) {
                Fmt.toast(this, "No hay equipos ni mantenimientos para exportar");
                return;
            }
            Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
            i.putExtra(Intent.EXTRA_TITLE, "reporte_mantenimientos.xlsx");
            excelPendiente = bytes;
            startActivityForResult(i, REQ_EXCEL);
        } catch (Exception e) {
            App.logError(e);
            Fmt.toast(this, "No se pudo exportar: " + e.getMessage());
        }
    }

    private static final String[] EXCEL_HEADER = {
            "NOMBRE Y APELLIDOS", "DNI", "ZONA", "SUBDIVISION", "AREA", "CARGO",
            "NEW HOSTNAME", "UBICACIÓN FISICA", "SERIE DE EQUIPO", "EQUIPO", "MARCA", "MODELO",
            "RESPONSABLE", "CORREOS", "CONTRATO", "STATUS", "PRIORIDAD", "OBSERVACIONES",
            "FECHA PROGRAMADO", "FECHA REPROGRAMADA", "FECHA REAL", "ESTADO"
    };

    private String[][] construirFilasExcel() {
        ArrayList<Mantenimiento> mants = Db.allMants();
        ArrayList<Equipo> equipos = Db.allEquipos();
        ArrayList<String[]> rows = new ArrayList<>();
        rows.add(EXCEL_HEADER);
        if (mants.isEmpty()) {
            for (Equipo e : equipos) rows.add(filaEquipo(e, null));
        } else {
            for (Mantenimiento m : mants) rows.add(filaEquipo(Db.getEquipo(m.equipoId), m));
        }
        if (rows.size() == 1) return null;
        return rows.toArray(new String[0][]);
    }

    private String[] filaEquipo(Equipo e, Mantenimiento m) {
        String[] f = new String[22];
        if (e != null) {
            f[0] = nz(e.usuarioAsignado);
            f[1] = nz(e.dni);
            f[2] = nz(e.zona);
            f[3] = nz(e.subdivision);
            f[4] = nz(e.area);
            f[5] = nz(e.cargo);
            f[6] = nz(e.hostname);
            f[7] = nz(e.ubicacion);
            f[8] = nz(e.serie);
            f[9] = nz(e.equipo);
            f[10] = nz(e.marca);
            f[11] = nz(e.modelo);
            f[12] = nz(e.responsable);
            f[13] = nz(e.email);
            f[14] = nz(e.contrato);
            f[15] = nz(e.status);
        }
        if (m != null) {
            f[16] = nz(m.prioridad);
            f[17] = nz(m.observaciones);
            f[18] = Fmt.disp(m.fechaProgramada);
            f[19] = Fmt.disp(m.fechaReprogramada);
            f[20] = Fmt.disp(m.fechaReal);
            f[21] = nz(m.estado);
        }
        return f;
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }

    private static byte[] crearXlsx(String[][] rows) throws Exception {
        StringBuilder sheet = new StringBuilder();
        sheet.append("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n");
        sheet.append("<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><sheetData>");
        for (int r = 0; r < rows.length; r++) {
            String[] row = rows[r];
            sheet.append("<row r=\"").append(r + 1).append("\">");
            for (int c = 0; c < row.length; c++) {
                sheet.append("<c r=\"").append(colName(c)).append(r + 1).append("\" t=\"inlineStr\"><is><t>")
                        .append(x(row[c])).append("</t></is></c>");
            }
            sheet.append("</row>");
        }
        sheet.append("</sheetData></worksheet>");

        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        ZipOutputStream zip = new ZipOutputStream(bos);
        writeEntry(zip, "[Content_Types].xml",
                "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n" +
                        "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">" +
                        "<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>" +
                        "<Default Extension=\"xml\" ContentType=\"application/xml\"/>" +
                        "<Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/>" +
                        "<Override PartName=\"/xl/worksheets/sheet1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/>" +
                        "</Types>");
        writeEntry(zip, "_rels/.rels",
                "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n" +
                        "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">" +
                        "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/>" +
                        "</Relationships>");
        writeEntry(zip, "xl/workbook.xml",
                "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n" +
                        "<workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" " +
                        "xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\">" +
                        "<sheets><sheet name=\"Mantenimientos\" sheetId=\"1\" r:id=\"rId1\"/></sheets></workbook>");
        writeEntry(zip, "xl/_rels/workbook.xml.rels",
                "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n" +
                        "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">" +
                        "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet1.xml\"/>" +
                        "</Relationships>");
        writeEntry(zip, "xl/worksheets/sheet1.xml", sheet.toString());
        zip.close();
        return bos.toByteArray();
    }

    private static void writeEntry(ZipOutputStream zip, String name, String content) throws Exception {
        zip.putNextEntry(new ZipEntry(name));
        zip.write(content.getBytes("UTF-8"));
        zip.closeEntry();
    }

    private static String colName(int idx) {
        StringBuilder sb = new StringBuilder();
        int n = idx + 1;
        while (n > 0) {
            int rem = (n - 1) % 26;
            sb.insert(0, (char) ('A' + rem));
            n = (n - 1) / 26;
        }
        return sb.toString();
    }

    private static String x(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                .replace("\"", "&quot;").replace("'", "&apos;");
    }

    private String pendienteJson = null;

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (resultCode != RESULT_OK || data == null) return;
        Uri uri = data.getData();
        if (uri == null) return;

        if (requestCode == REQ_EXPORT) {
            String json = pendienteJson;
            if (json == null) return;
            try {
                OutputStream os = getContentResolver().openOutputStream(uri);
                if (os != null) {
                    os.write(json.getBytes("UTF-8"));
                    os.close();
                    Fmt.toast(this, "Respaldo exportado");
                }
            } catch (IOException e) {
                Fmt.toast(this, "Error al guardar: " + e.getMessage());
            }
            return;
        }

        if (requestCode == REQ_EXCEL) {
            if (excelPendiente == null) return;
            try {
                OutputStream os = getContentResolver().openOutputStream(uri);
                if (os != null) {
                    os.write(excelPendiente);
                    os.close();
                    Fmt.toast(this, "Excel exportado");
                }
            } catch (IOException e) {
                Fmt.toast(this, "Error al guardar: " + e.getMessage());
            }
            excelPendiente = null;
            return;
        }

        if (requestCode == REQ_IMPORT) {
            try {
                InputStream is = getContentResolver().openInputStream(uri);
                if (is == null) return;
                java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int n;
                while ((n = is.read(buf)) != -1) bos.write(buf, 0, n);
                is.close();
                Db.importJson(bos.toString("UTF-8"));
                Fmt.toast(this, "Datos restaurados");
            } catch (Exception e) {
                Fmt.toast(this, "Error al importar: " + e.getMessage());
            }
        }
    }

    @Override
    public void onClick(View v) {
        int id = v.getId();
        Class<?> target = null;
        if (id == R.id.navPanel) target = MainActivity.class;
        else if (id == R.id.navEquipos) target = EquiposActivity.class;
        else if (id == R.id.navMantenimientos) target = MantenimientosActivity.class;
        else if (id == R.id.navAlertas) target = AlertasActivity.class;
        if (target != null) {
            startActivity(new Intent(this, target));
            overridePendingTransition(0, 0);
            finish();
        }
    }
}
