package me.app.mantenimiento;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.os.Bundle;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.Spinner;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.Arrays;

public class UsuarioFormActivity extends Activity implements View.OnClickListener {

    private long usuarioId = 0;
    private EditText usNombre, usDni, usSubdivision, usCeco, usArea, usCargo, usEmail, usClave;
    private Spinner usZona, usRol;
    private Button btnEliminar;
    private LinearLayout usEquiposCard;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Db.init(this);
        if (!Db.esAdmin()) {
            Fmt.toast(this, "Solo el administrador puede gestionar usuarios y permisos");
            finish();
            return;
        }
        setContentView(R.layout.activity_usuario_form);

        usNombre = (EditText) findViewById(R.id.usNombre);
        usDni = (EditText) findViewById(R.id.usDni);
        usZona = (Spinner) findViewById(R.id.usZona);
        usRol = (Spinner) findViewById(R.id.usRol);
        usClave = (EditText) findViewById(R.id.usClave);
        usSubdivision = (EditText) findViewById(R.id.usSubdivision);
        usCeco = (EditText) findViewById(R.id.usCeco);
        usArea = (EditText) findViewById(R.id.usArea);
        usCargo = (EditText) findViewById(R.id.usCargo);
        usEmail = (EditText) findViewById(R.id.usEmail);
        usEquiposCard = (LinearLayout) findViewById(R.id.usEquiposCard);
        btnEliminar = (Button) findViewById(R.id.btnEliminarUsuario);

        ArrayAdapter<String> zonas = new ArrayAdapter<>(this,
                android.R.layout.simple_spinner_dropdown_item,
                getResources().getStringArray(R.array.zonas));
        usZona.setAdapter(zonas);
        usRol.setAdapter(new ArrayAdapter<>(this,
                android.R.layout.simple_spinner_dropdown_item,
                new String[]{"Lectura", "Edición", "Administrador"}));

        findViewById(R.id.btnGuardarUsuario).setOnClickListener(this);
        btnEliminar.setOnClickListener(this);

        Bundle b = getIntent().getExtras();
        if (b != null) usuarioId = b.getLong("usuarioId", 0);
        if (usuarioId > 0) cargar();
        cargarEquipos();
    }

    private void cargarEquipos() {
        usEquiposCard.removeAllViews();
        ArrayList<Equipo> es = usuarioId > 0 ? Db.equiposByUsuario(usuarioId) : new ArrayList<Equipo>();
        if (es.isEmpty()) {
            TextView t = new TextView(this);
            t.setText("Sin equipos asignados");
            t.setTextSize(14);
            t.setTextColor(Ui.MUT);
            t.setPadding(0, Ui.dp(this, 8), 0, Ui.dp(this, 8));
            usEquiposCard.addView(t);
            return;
        }
        for (Equipo e : es) {
            TextView t = new TextView(this);
            t.setText("🔧 " + Db.equipoLabel(e) + (e.status.length() > 0 ? " · " + e.status : ""));
            t.setTextSize(14);
            t.setTextColor(Ui.TEXT);
            t.setPadding(0, Ui.dp(this, 6), 0, Ui.dp(this, 6));
            usEquiposCard.addView(t);
        }
    }

    private void cargar() {
        Usuario u = Db.getUsuario(usuarioId);
        if (u == null) {
            finish();
            return;
        }
        ((TextView) findViewById(R.id.formUsuTitle)).setText("Editar responsable");
        usNombre.setText(u.nombre);
        usDni.setText(u.dni);
        int zi = Arrays.asList(getResources().getStringArray(R.array.zonas)).indexOf(u.zona);
        if (zi >= 0) usZona.setSelection(zi);
        usRol.setSelection(Math.max(0, Math.min(2, u.rol)));
        usClave.setText(u.clave);
        usSubdivision.setText(u.subdivision);
        usCeco.setText(u.ceco);
        usArea.setText(u.area);
        usCargo.setText(u.cargo);
        usEmail.setText(u.email);
    }

    @Override
    public void onClick(View v) {
        int id = v.getId();
        if (id == R.id.btnGuardarUsuario) {
            guardar();
        } else if (id == R.id.btnEliminarUsuario) {
            confirmarEliminar();
        }
    }

    private void guardar() {
        String nombre = usNombre.getText().toString().trim();
        String dni = usDni.getText().toString().trim();
        if (nombre.length() == 0) {
            Fmt.toast(this, "El NOMBRE Y APELLIDOS es obligatorio");
            return;
        }
        if (dni.length() == 0) {
            Fmt.toast(this, "El DNI es obligatorio");
            return;
        }
        if (usRol.getSelectedItemPosition() == Db.ROL_ADMIN && usuarioId == Db.getSesionId()) {
            Fmt.toast(this, "No puedes quitarte el permiso de administrador a ti mismo");
            return;
        }
        Usuario u = new Usuario();
        u.id = usuarioId;
        u.nombre = nombre;
        u.dni = dni;
        u.zona = usZona.getSelectedItem() == null ? "Norte" : usZona.getSelectedItem().toString();
        u.rol = usRol.getSelectedItemPosition();
        String clave = usClave.getText().toString();
        u.clave = clave.length() == 0 ? dni : clave;
        u.subdivision = usSubdivision.getText().toString().trim();
        u.ceco = usCeco.getText().toString().trim();
        u.area = usArea.getText().toString().trim();
        u.cargo = usCargo.getText().toString().trim();
        u.email = usEmail.getText().toString().trim();
        Db.saveUsuario(u);
        Fmt.toast(this, "Responsable guardado");
        finish();
    }

    private void confirmarEliminar() {
        if (usuarioId <= 0) return;
        new AlertDialog.Builder(this)
                .setTitle("Eliminar responsable")
                .setMessage("Se eliminará el responsable y todos sus equipos e historial. ¿Continuar?")
                .setPositiveButton("Eliminar", new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface d, int w) {
                        Db.deleteUsuario(usuarioId);
                        Fmt.toast(UsuarioFormActivity.this, "Responsable eliminado");
                        finish();
                    }
                })
                .setNegativeButton("Cancelar", null)
                .show();
    }
}
