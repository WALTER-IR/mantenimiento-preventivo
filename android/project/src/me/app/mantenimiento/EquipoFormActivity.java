package me.app.mantenimiento;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.os.Bundle;
import android.view.View;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.Spinner;
import android.widget.TextView;

import java.util.ArrayList;

public class EquipoFormActivity extends Activity implements View.OnClickListener {

    private long equipoId = 0;
    private EditText eqHostname, eqIp, eqUbicacion, eqEquipo, eqCodInv, eqSerie, eqMarca, eqModelo, eqContrato, eqDni;
    private Spinner eqResponsable, eqStatus;
    private Button btnEliminar;
    private ArrayList<Long> usuarioIds = new ArrayList<>();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Db.init(this);
        if (!Db.puedeEditar()) {
            Fmt.toast(this, "Tu permiso es de solo lectura");
            finish();
            return;
        }
        setContentView(R.layout.activity_equipo_form);

        eqResponsable = (Spinner) findViewById(R.id.eqResponsable);
        eqDni = (EditText) findViewById(R.id.eqDni);
        eqHostname = (EditText) findViewById(R.id.eqHostname);
        eqIp = (EditText) findViewById(R.id.eqIp);
        eqSerie = (EditText) findViewById(R.id.eqSerie);
        eqUbicacion = (EditText) findViewById(R.id.eqUbicacion);
        eqEquipo = (EditText) findViewById(R.id.eqEquipo);
        eqCodInv = (EditText) findViewById(R.id.eqCodInv);
        eqMarca = (EditText) findViewById(R.id.eqMarca);
        eqModelo = (EditText) findViewById(R.id.eqModelo);
        eqContrato = (EditText) findViewById(R.id.eqContrato);
        eqStatus = (Spinner) findViewById(R.id.eqStatus);
        btnEliminar = (Button) findViewById(R.id.btnEliminarEquipo);

        ArrayAdapter<String> statusAdapter = new ArrayAdapter<>(this,
                android.R.layout.simple_spinner_dropdown_item,
                getResources().getStringArray(R.array.estados_equipo));
        eqStatus.setAdapter(statusAdapter);

        cargarResponsables();

        findViewById(R.id.btnGuardarEquipo).setOnClickListener(this);
        btnEliminar.setOnClickListener(this);

        Bundle b = getIntent().getExtras();
        if (b != null) equipoId = b.getLong("equipoId", 0);
        if (equipoId > 0) cargar();
    }

    private void cargarResponsables() {
        ArrayList<Usuario> us = Db.allUsuarios();
        ArrayList<String> labels = new ArrayList<>();
        usuarioIds.clear();
        if (us.isEmpty()) {
            labels.add("— Sin responsables —");
            usuarioIds.add(0L);
        } else {
            for (Usuario u : us) {
                usuarioIds.add(u.id);
                String z = u.zona.length() > 0 ? " (" + u.zona + ")" : "";
                labels.add(u.nombre + z);
            }
        }
        ArrayAdapter<String> a = new ArrayAdapter<>(this,
                android.R.layout.simple_spinner_dropdown_item, labels);
        eqResponsable.setAdapter(a);
        eqResponsable.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override
            public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
                long uid = position >= 0 && position < usuarioIds.size() ? usuarioIds.get(position) : 0;
                Usuario u = uid > 0 ? Db.getUsuario(uid) : null;
                eqDni.setText(u != null && u.dni != null ? u.dni : "");
            }

            @Override
            public void onNothingSelected(AdapterView<?> parent) {
            }
        });

        // Un usuario común solo puede registrar equipos para sí mismo.
        if (!Db.esAdmin()) {
            int idx = usuarioIds.indexOf(Db.getSesionId());
            if (idx >= 0) {
                eqResponsable.setSelection(idx);
                eqResponsable.setEnabled(false);
            }
        }
    }

    private void cargar() {
        Equipo e = Db.getEquipo(equipoId);
        if (e == null) {
            finish();
            return;
        }
        if (!Db.puedeVerEquipo(e)) {
            Fmt.toast(this, "Este equipo no está asignado a tu usuario");
            finish();
            return;
        }
        ((TextView) findViewById(R.id.formEquipoTitle)).setText("Editar equipo");
        int idx = usuarioIds.indexOf(e.usuarioId);
        if (idx >= 0) eqResponsable.setSelection(idx);
        eqHostname.setText(e.hostname);
        eqIp.setText(e.ip);
        eqSerie.setText(e.serie);
        eqUbicacion.setText(e.ubicacion);
        eqEquipo.setText(e.equipo);
        eqCodInv.setText(e.codInventario);
        eqMarca.setText(e.marca);
        eqModelo.setText(e.modelo);
        eqContrato.setText(e.contrato);
        int si = indexOf(getResources().getStringArray(R.array.estados_equipo), e.status);
        if (si >= 0) eqStatus.setSelection(si);
    }

    private int indexOf(String[] arr, String v) {
        for (int i = 0; i < arr.length; i++) {
            if (arr[i].equals(v)) return i;
        }
        return 0;
    }

    @Override
    public void onClick(View v) {
        int id = v.getId();
        if (id == R.id.btnGuardarEquipo) {
            guardar();
        } else if (id == R.id.btnEliminarEquipo) {
            confirmarEliminar();
        }
    }

    private void guardar() {
        if (usuarioIds.isEmpty() || usuarioIds.get(0) == 0) {
            Fmt.toast(this, "Primero registra al menos un responsable");
            return;
        }
        String serie = eqSerie.getText().toString().trim();
        if (serie.length() == 0) {
            Fmt.toast(this, "La SERIE DE EQUIPO es obligatoria");
            return;
        }
        int pos = eqResponsable.getSelectedItemPosition();
        long usuarioId = pos >= 0 && pos < usuarioIds.size() ? usuarioIds.get(pos) : 0;
        if (usuarioId == 0) {
            Fmt.toast(this, "Selecciona un usuario");
            return;
        }
        String dni = eqDni.getText().toString().trim();
        Usuario u = Db.getUsuario(usuarioId);
        if (u != null && dni.length() > 0 && !dni.equals(u.dni)) {
            u.dni = dni;
            Db.saveUsuario(u);
        }

        Equipo e = new Equipo();
        e.id = equipoId;
        e.usuarioId = usuarioId;
        e.hostname = eqHostname.getText().toString().trim();
        e.ip = eqIp.getText().toString().trim();
        e.serie = serie;
        e.ubicacion = eqUbicacion.getText().toString().trim();
        e.equipo = eqEquipo.getText().toString().trim();
        e.codInventario = eqCodInv.getText().toString().trim();
        e.marca = eqMarca.getText().toString().trim();
        e.modelo = eqModelo.getText().toString().trim();
        e.contrato = eqContrato.getText().toString().trim();
        e.status = eqStatus.getSelectedItem() == null ? "Activo" : eqStatus.getSelectedItem().toString();

        Db.saveEquipo(e);
        Fmt.toast(this, "Equipo guardado");
        finish();
    }

    private void confirmarEliminar() {
        if (equipoId <= 0) return;
        new AlertDialog.Builder(this)
                .setTitle("Eliminar equipo")
                .setMessage("¿Seguro que deseas eliminar este equipo y su historial?")
                .setPositiveButton("Eliminar", new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface d, int w) {
                        Db.deleteEquipo(equipoId);
                        Fmt.toast(EquipoFormActivity.this, "Equipo eliminado");
                        finish();
                    }
                })
                .setNegativeButton("Cancelar", null)
                .show();
    }
}
