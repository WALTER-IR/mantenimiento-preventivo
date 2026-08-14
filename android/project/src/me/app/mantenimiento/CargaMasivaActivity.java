package me.app.mantenimiento;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.TextView;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

public class CargaMasivaActivity extends Activity {

    public static final String TIPO_RESPONSABLES = "responsables";
    public static final String TIPO_EQUIPOS = "equipos";
    public static final String TIPO_MANTENIMIENTOS = "mantenimientos";

    private static final int REQ_XLSX = 10;

    private String tipo = TIPO_EQUIPOS;
    private TextView resultado, columnas, desc;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Db.init(this);
        if (!Db.puedeEditar()) {
            Fmt.toast(this, "Tu permiso es de solo lectura");
            finish();
            return;
        }
        setContentView(R.layout.activity_carga_masiva);

        if (getIntent().getExtras() != null) {
            String t = getIntent().getExtras().getString("tipo");
            if (t != null) tipo = t;
        }

        resultado = (TextView) findViewById(R.id.masivaResultado);
        columnas = (TextView) findViewById(R.id.masivaColumnas);
        desc = (TextView) findViewById(R.id.masivaDesc);
        TextView title = (TextView) findViewById(R.id.masivaTitle);

        if (tipo.equals(TIPO_RESPONSABLES)) {
            title.setText("Cargar responsables");
            desc.setText("Cada fila crea un responsable. Columnas OBLIGATORIAS: RESPONSABLE (o NOMBRE) y DNI.");
            columnas.setText("RESPONSABLE; DNI; ZONA; SUBDIVISION; CECO SAP; AREA; CARGO; EMAIL; CLAVE");
        } else if (tipo.equals(TIPO_MANTENIMIENTOS)) {
            title.setText("Cargar mantenimientos");
            desc.setText("Cada fila registra un mantenimiento para la SERIE DE EQUIPO indicada (el equipo debe existir).");
            columnas.setText("SERIE DE EQUIPO; PRIORIDAD; FECHA PROGRAMADA; FECHA REPROGRAMADA; FECHA REAL; ESTADO; OBSERVACIONES; ACTIVIDADES REALIZADAS; PROXIMO MANTENIMIENTO");
        } else {
            title.setText("Cargar equipos");
            desc.setText("Cada fila crea un equipo. Necesita SERIE DE EQUIPO y un responsable (RESPONSABLE, DNI o USUARIO ASIGNADO). No crea usuarios nuevos.");
            columnas.setText("SERIE DE EQUIPO; USUARIO ASIGNADO; RESPONSABLE; DNI; HOSTNAME; DIR. IP; UBICACIÓN FISICA; EQUIPO; COD. INVENTARIO; MARCA; MODELO; CONTRATO DE ARRENDAMIENTO; STATUS; AREA; CARGO");
        }

        Button btn = (Button) findViewById(R.id.btnSeleccionar);
        btn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
                try {
                    startActivityForResult(i, REQ_XLSX);
                } catch (Exception e) {
                    Fmt.toast(CargaMasivaActivity.this, "No hay un selector de archivos compatible");
                }
            }
        });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_XLSX || resultCode != RESULT_OK || data == null) return;
        final Uri uri = data.getData();
        if (uri == null) return;
        new Thread(new Runnable() {
            @Override
            public void run() {
                procesar(uri);
            }
        }).start();
    }

    private void procesar(final Uri uri) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                resultado.setText("Leyendo archivo...");
            }
        });
        try {
            InputStream is = getContentResolver().openInputStream(uri);
            if (is == null) throw new Exception("No se pudo abrir el archivo");
            final ArrayList<String[]> filas = XlsxReader.read(is);
            is.close();
            if (filas.size() < 2) {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        resultado.setText("El archivo no tiene filas con datos.");
                    }
                });
                return;
            }
            String[] headers = filas.get(0);
            List<String[]> datos = new ArrayList<>(filas.subList(1, filas.size()));
            final List<String> errores = new ArrayList<>();
            final int[] r;
            if (tipo.equals(TIPO_RESPONSABLES)) {
                r = Db.loadResponsables(headers, datos, errores);
            } else if (tipo.equals(TIPO_MANTENIMIENTOS)) {
                r = Db.loadMantenimientos(headers, datos, errores);
            } else {
                r = Db.loadEquipos(headers, datos, errores);
            }
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    resultado.setText("Importados: " + r[0] + "   ·   Inválidos: " + r[1]);
                    StringBuilder sb = new StringBuilder();
                    for (String e : errores) {
                        sb.append(e).append("\n");
                    }
                    if (sb.length() > 0) {
                        sb.insert(0, "\nErrores de validación:\n");
                    }
                    resultado.setText(resultado.getText() + sb.toString());
                    if (r[0] > 0) {
                        Fmt.toast(CargaMasivaActivity.this, "Se importaron " + r[0] + " registros");
                    }
                }
            });
        } catch (final Exception e) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    resultado.setText("Error: " + e.getMessage());
                }
            });
        }
    }
}
