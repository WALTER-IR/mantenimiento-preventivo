package me.app.mantenimiento;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.os.Bundle;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.Spinner;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;

public class MantenimientoFormActivity extends Activity implements View.OnClickListener {

    private long mantId = 0;
    private long prefEquipoId = 0;
    private Spinner mtEquipo, mtPrioridad, mtEstado;
    private EditText mtProgramada, mtReprogramada, mtReal, mtProxima, mtObs;
    private Button btnEliminar;
    private LinearLayout mtActividades;
    private ArrayList<CheckBox> actividadChecks = new ArrayList<>();
    private ArrayList<Long> equipoIds = new ArrayList<>();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Db.init(this);
        if (!Db.puedeEditar()) {
            Fmt.toast(this, "Tu permiso es de solo lectura");
            finish();
            return;
        }
        setContentView(R.layout.activity_mantenimiento_form);

        mtEquipo = (Spinner) findViewById(R.id.mtEquipo);
        mtPrioridad = (Spinner) findViewById(R.id.mtPrioridad);
        mtEstado = (Spinner) findViewById(R.id.mtEstado);
        mtProgramada = (EditText) findViewById(R.id.mtProgramada);
        mtReprogramada = (EditText) findViewById(R.id.mtReprogramada);
        mtReal = (EditText) findViewById(R.id.mtReal);
        mtProxima = (EditText) findViewById(R.id.mtProxima);
        mtObs = (EditText) findViewById(R.id.mtObs);
        btnEliminar = (Button) findViewById(R.id.btnEliminarMant);
        mtActividades = (LinearLayout) findViewById(R.id.mtActividades);

        mtPrioridad.setAdapter(new ArrayAdapter<>(this,
                android.R.layout.simple_spinner_dropdown_item,
                getResources().getStringArray(R.array.prioridades)));
        mtEstado.setAdapter(new ArrayAdapter<>(this,
                android.R.layout.simple_spinner_dropdown_item,
                getResources().getStringArray(R.array.estados_mantenimiento)));

        setDatePicker(mtProgramada, -1, null);
        setDatePicker(mtReprogramada, indexOf(getResources().getStringArray(R.array.estados_mantenimiento), "Reprogramado"), null);
        setDatePicker(mtReal, indexOf(getResources().getStringArray(R.array.estados_mantenimiento), "Finalizado"),
                new Runnable() {
                    @Override
                    public void run() {
                        // Al registrar la fecha real se genera automáticamente el próximo mantenimiento (anual).
                        String real = Fmt.canon(mtReal.getText().toString().trim());
                        if (real.length() > 0) {
                            mtProxima.setText(Fmt.disp(Fmt.addDays(real, 365)));
                        }
                    }
                });
        setDatePicker(mtProxima, -1, null);

        findViewById(R.id.btnGuardarMant).setOnClickListener(this);
        btnEliminar.setOnClickListener(this);

        Bundle b = getIntent().getExtras();
        if (b != null) {
            mantId = b.getLong("mantId", 0);
            prefEquipoId = b.getLong("equipoId", 0);
        }
        cargar();
    }

    // Al elegir una fecha, el estado se actualiza automáticamente:
    // fecha reprogramada -> Reprogramado ; fecha real -> Finalizado.
    private void setDatePicker(final EditText target, final int estadoPos, final Runnable onSet) {
        target.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                Fmt.pickDate(MantenimientoFormActivity.this, target,
                        target.getText().toString(), new Runnable() {
                            @Override
                            public void run() {
                                if (estadoPos >= 0) mtEstado.setSelection(estadoPos);
                                if (onSet != null) onSet.run();
                            }
                        });
            }
        });
    }

    private void construirActividades() {
        actividadChecks.clear();
        mtActividades.removeAllViews();
        String[] items = getResources().getStringArray(R.array.actividades_mantenimiento);
        for (String item : items) {
            CheckBox cb = new CheckBox(this);
            cb.setText(item);
            cb.setTextSize(13);
            mtActividades.addView(cb);
            actividadChecks.add(cb);
        }
    }

    private void marcarActividades(String actividades) {
        if (actividades == null || actividades.length() == 0) return;
        HashSet<String> sel = new HashSet<>(Arrays.asList(actividades.split("\\|")));
        for (CheckBox cb : actividadChecks) {
            cb.setChecked(sel.contains(cb.getText().toString()));
        }
    }

    private String actividadesSeleccionadas() {
        StringBuilder sb = new StringBuilder();
        for (CheckBox cb : actividadChecks) {
            if (cb.isChecked()) {
                if (sb.length() > 0) sb.append("|");
                sb.append(cb.getText().toString());
            }
        }
        return sb.toString();
    }

    private void cargarEquipos() {
        ArrayList<Equipo> all = Db.allEquipos();
        ArrayList<String> labels = new ArrayList<>();
        equipoIds.clear();
        int prefPos = -1;
        for (Equipo e : all) {
            equipoIds.add(e.id);
            labels.add(Db.equipoLabel(e));
            if (e.id == prefEquipoId) prefPos = equipoIds.size() - 1;
        }
        ArrayAdapter<String> a = new ArrayAdapter<>(this,
                android.R.layout.simple_spinner_dropdown_item, labels);
        mtEquipo.setAdapter(a);
        if (prefPos >= 0) mtEquipo.setSelection(prefPos);
    }

    private void cargar() {
        cargarEquipos();
        construirActividades();
        if (equipoIds.isEmpty()) {
            Fmt.toast(this, "Primero registra equipos");
            finish();
            return;
        }
        if (mantId > 0) {
            Mantenimiento m = Db.getMant(mantId);
            if (m == null) {
                finish();
                return;
            }
            ((TextView) findViewById(R.id.formMantTitle)).setText("Editar mantenimiento");
            int idx = equipoIds.indexOf(m.equipoId);
            if (idx >= 0) mtEquipo.setSelection(idx);
            int pi = indexOf(getResources().getStringArray(R.array.prioridades), m.prioridad);
            if (pi >= 0) mtPrioridad.setSelection(pi);
            int ei = indexOf(getResources().getStringArray(R.array.estados_mantenimiento), m.estado);
            if (ei >= 0) mtEstado.setSelection(ei);
            mtProgramada.setText(Fmt.disp(m.fechaProgramada));
            mtReprogramada.setText(Fmt.disp(m.fechaReprogramada));
            mtReal.setText(Fmt.disp(m.fechaReal));
            mtProxima.setText(Fmt.disp(m.proxima));
            marcarActividades(m.actividades);
            mtObs.setText(m.observaciones);
            btnEliminar.setVisibility(View.VISIBLE);
        } else {
            mtProgramada.setText(Fmt.disp(Fmt.today()));
            btnEliminar.setVisibility(View.GONE);
        }
    }

    private int indexOf(String[] arr, String v) {
        for (int i = 0; i < arr.length; i++) {
            if (arr[i].equals(v)) return i;
        }
        return -1;
    }

    @Override
    public void onClick(View v) {
        int id = v.getId();
        if (id == R.id.btnGuardarMant) {
            guardar();
        } else if (id == R.id.btnEliminarMant) {
            confirmarEliminar();
        }
    }

    private void guardar() {
        int pos = mtEquipo.getSelectedItemPosition();
        long equipoId = pos >= 0 && pos < equipoIds.size() ? equipoIds.get(pos) : (equipoIds.isEmpty() ? 0 : equipoIds.get(0));
        if (equipoId == 0) {
            Fmt.toast(this, "Primero registra equipos");
            return;
        }
        if (mtProgramada.getText().toString().trim().length() == 0) {
            Fmt.toast(this, "Selecciona la FECHA PROGRAMADA");
            return;
        }

        Mantenimiento m = new Mantenimiento();
        m.id = mantId;
        m.equipoId = equipoId;
        m.prioridad = mtPrioridad.getSelectedItem() == null ? "" : mtPrioridad.getSelectedItem().toString();
        m.estado = mtEstado.getSelectedItem() == null ? "Programado" : mtEstado.getSelectedItem().toString();
        m.fechaProgramada = Fmt.canon(mtProgramada.getText().toString().trim());
        m.fechaReprogramada = Fmt.canon(mtReprogramada.getText().toString().trim());
        m.fechaReal = Fmt.canon(mtReal.getText().toString().trim());
        m.proxima = Fmt.canon(mtProxima.getText().toString().trim());
        m.actividades = actividadesSeleccionadas();
        m.observaciones = mtObs.getText().toString().trim();

        // El estado se actualiza según las fechas registradas:
        // fecha real -> Finalizado ; fecha reprogramada -> Reprogramado.
        if (m.fechaReal.length() > 0) {
            m.estado = "Finalizado";
            // Próximo mantenimiento anual automático si no se especificó.
            if (m.proxima.length() == 0) m.proxima = Fmt.addDays(m.fechaReal, 365);
        } else if (m.fechaReprogramada.length() > 0) {
            m.estado = "Reprogramado";
        }

        Db.saveMant(m);
        Fmt.toast(this, "Mantenimiento guardado");
        finish();
    }

    private void confirmarEliminar() {
        if (mantId <= 0) return;
        new AlertDialog.Builder(this)
                .setTitle("Eliminar mantenimiento")
                .setMessage("¿Seguro que deseas eliminar este registro?")
                .setPositiveButton("Eliminar", new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface d, int w) {
                        Db.deleteMant(mantId);
                        Fmt.toast(MantenimientoFormActivity.this, "Registro eliminado");
                        finish();
                    }
                })
                .setNegativeButton("Cancelar", null)
                .show();
    }
}
