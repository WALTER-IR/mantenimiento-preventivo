package me.app.mantenimiento;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.EditText;
import android.widget.TextView;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

public class ConfigActivity extends Activity implements View.OnClickListener {

    private static final int REQ_EXPORT = 1;
    private static final int REQ_IMPORT = 2;

    private EditText cfgEmpresa;
    private TextView txtSesion;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Db.init(this);
        if (!Db.sesionActiva()) {
            irALogin();
            return;
        }
        if (!Db.esAdmin()) {
            Fmt.toast(this, "La configuración es solo del administrador");
            startActivity(new Intent(this, MainActivity.class));
            finish();
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
        if (!Db.esAdmin()) {
            Fmt.toast(this, "La configuración es solo del administrador");
            startActivity(new Intent(this, MainActivity.class));
            finish();
            return;
        }
        cfgEmpresa.setText(Db.getEmpresa(this));
        txtSesion.setText("Sesión: " + Db.getSesionNombre() + "  ·  " + Db.rolNombre(Db.getSesionRol()));
        aplicarPermisos();
    }

    private void aplicarPermisos() {
        boolean edicion = Db.puedeEditar();
        boolean admin = Db.esAdmin();
        set(R.id.btnCargarResponsables, edicion);
        set(R.id.btnCargarEquipos, edicion);
        set(R.id.btnCargarMantenimientos, edicion);
        set(R.id.btnExportar, edicion);
        set(R.id.btnImportar, edicion);
        set(R.id.btnActivar2026, edicion);
        set(R.id.btnGuardarConfig, edicion);
        findViewById(R.id.cfgEmpresa).setEnabled(edicion);
        set(R.id.btnVerResponsables, admin);
        set(R.id.btnAuditoria, admin);
        set(R.id.btnVaciarBd, admin);
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
