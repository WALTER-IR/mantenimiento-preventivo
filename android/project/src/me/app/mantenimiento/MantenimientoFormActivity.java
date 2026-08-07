package me.app.mantenimiento;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.os.Bundle;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.Spinner;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.Arrays;

public class MantenimientoFormActivity extends Activity implements View.OnClickListener {

    private long mantId = 0;
    private long prefEquipoId = 0;
    private Spinner mtEquipo, mtPrioridad, mtEstado;
    private EditText mtProgramada, mtReprogramada, mtReal, mtObs;
    private Button btnEliminar;
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
        mtObs = (EditText) findViewById(R.id.mtObs);
        btnEliminar = (Button) findViewById(R.id.btnEliminarMant);

        mtPrioridad.setAdapter(new ArrayAdapter<>(this,
                android.R.layout.simple_spinner_dropdown_item,
                getResources().getStringArray(R.array.prioridades)));
        mtEstado.setAdapter(new ArrayAdapter<>(this,
                android.R.layout.simple_spinner_dropdown_item,
                getResources().getStringArray(R.array.estados_mantenimiento)));

        setDatePicker(mtProgramada);
        setDatePicker(mtReprogramada);
        setDatePicker(mtReal);

        findViewById(R.id.btnGuardarMant).setOnClickListener(this);
        btnEliminar.setOnClickListener(this);

        Bundle b = getIntent().getExtras();
        if (b != null) {
            mantId = b.getLong("mantId", 0);
            prefEquipoId = b.getLong("equipoId", 0);
        }
        cargar();
    }

    private void setDatePicker(final EditText target) {
        target.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                Fmt.pickDate(MantenimientoFormActivity.this, target, target.getText().toString());
            }
        });
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
        m.observaciones = mtObs.getText().toString().trim();

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
