package me.app.mantenimiento;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.content.Intent;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.widget.AdapterView;
import android.widget.BaseAdapter;
import android.widget.ListView;
import android.widget.TextView;

import java.util.ArrayList;

public class UsuariosActivity extends Activity implements View.OnClickListener {

    private ArrayList<Usuario> items = new ArrayList<>();
    private ListView lv;
    private TextView empty;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Db.init(this);
        if (!Db.esAdmin()) {
            Fmt.toast(this, "Solo el administrador puede gestionar usuarios y permisos");
            finish();
            return;
        }
        setContentView(R.layout.activity_usuarios);

        findViewById(R.id.btnNuevoUsuario).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                startActivity(new Intent(UsuariosActivity.this, UsuarioFormActivity.class));
            }
        });
        findViewById(R.id.btnCargaResponsables).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                startActivity(new Intent(UsuariosActivity.this, CargaMasivaActivity.class)
                        .putExtra("tipo", CargaMasivaActivity.TIPO_RESPONSABLES));
            }
        });

        lv = (ListView) findViewById(R.id.listaUsuarios);
        empty = (TextView) findViewById(R.id.emptyUsuarios);

        lv.setOnItemClickListener(new AdapterView.OnItemClickListener() {
            @Override
            public void onItemClick(AdapterView<?> p, View v, int i, long id) {
                startActivity(new Intent(UsuariosActivity.this, UsuarioFormActivity.class)
                        .putExtra("usuarioId", items.get(i).id));
            }
        });
        lv.setOnItemLongClickListener(new AdapterView.OnItemLongClickListener() {
            @Override
            public boolean onItemLongClick(AdapterView<?> p, View v, int i, long id) {
                cambiarPermiso(items.get(i));
                return true;
            }
        });
    }

    private void cambiarPermiso(final Usuario u) {
        final String[] opciones = {"Lectura", "Edición", "Administrador"};
        int sel = Math.max(0, Math.min(2, u.rol));
        new AlertDialog.Builder(this)
                .setTitle("Permisos de " + u.nombre)
                .setSingleChoiceItems(opciones, sel, null)
                .setPositiveButton("Guardar", new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface d, int w) {
                        int nuevo = ((AlertDialog) d).getListView().getCheckedItemPosition();
                        if (nuevo < 0) return;
                        if (nuevo != Db.ROL_ADMIN && u.id == Db.getSesionId()) {
                            Fmt.toast(UsuariosActivity.this,
                                    "No puedes quitarte el permiso de administrador a ti mismo");
                            return;
                        }
                        Db.cambiarRol(u.id, nuevo);
                        Fmt.toast(UsuariosActivity.this, "Permiso actualizado: " + opciones[nuevo]);
                        onResume();
                    }
                })
                .setNegativeButton("Cancelar", null)
                .show();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (!Db.sesionActiva()) {
            finish();
            return;
        }
        items = Db.allUsuarios();
        lv.setAdapter(new Adapter());
        empty.setVisibility(items.isEmpty() ? View.VISIBLE : View.GONE);
    }

    @Override
    public void onClick(View v) {
    }

    class Adapter extends BaseAdapter {
        @Override
        public int getCount() {
            return items.size();
        }

        @Override
        public Object getItem(int i) {
            return items.get(i);
        }

        @Override
        public long getItemId(int i) {
            return items.get(i).id;
        }

        @Override
        public View getView(int i, View convertView, ViewGroup parent) {
            View v = convertView != null ? convertView
                    : getLayoutInflater().inflate(R.layout.item_usuario, parent, false);
            Usuario u = items.get(i);
            TextView nom = (TextView) v.findViewById(R.id.usNombre);
            TextView zona = (TextView) v.findViewById(R.id.usZona);
            TextView sub = (TextView) v.findViewById(R.id.usSub);
            nom.setText(u.nombre);

            String z = u.zona.length() > 0 ? u.zona.toUpperCase() : "SIN ZONA";
            zona.setText(z);
            GradientDrawable g = new GradientDrawable();
            g.setColor(z.contains("NORTE") ? Ui.PURPLE : Ui.PURPLE_DARK);
            g.setCornerRadius(Ui.dp(UsuariosActivity.this, 10));
            zona.setBackgroundDrawable(g);
            zona.setTextColor(0xFFFFFFFF);

            StringBuilder sb = new StringBuilder();
            if (u.dni.length() > 0) sb.append("DNI ").append(u.dni);
            sb.append(sb.length() > 0 ? "  ·  " : "").append(Db.rolNombre(u.rol));
            if (u.cargo.length() > 0) {
                if (sb.length() > 0) sb.append("  ·  ");
                sb.append(u.cargo);
            }
            if (u.subdivision.length() > 0) {
                if (sb.length() > 0) sb.append("  ·  ");
                sb.append(u.subdivision);
            }
            sub.setText(sb.toString());
            return v;
        }
    }
}
