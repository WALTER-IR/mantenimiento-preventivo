package me.app.mantenimiento;

import android.app.Activity;
import android.content.Intent;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.View;
import android.view.ViewGroup;
import android.widget.AdapterView;
import android.widget.BaseAdapter;
import android.widget.EditText;
import android.widget.ListView;
import android.widget.TextView;

import java.util.ArrayList;

public class EquiposActivity extends Activity implements View.OnClickListener {

    private ArrayList<Equipo> items = new ArrayList<>();
    private ListView lv;
    private EditText search;
    private TextView empty;
    private int loadSeq = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Db.init(this);
        if (!Db.sesionActiva()) {
            finish();
            return;
        }
        setContentView(R.layout.activity_equipos);

        findViewById(R.id.navPanel).setOnClickListener(this);
        findViewById(R.id.navEquipos).setOnClickListener(this);
        findViewById(R.id.navMantenimientos).setOnClickListener(this);
        findViewById(R.id.navAlertas).setOnClickListener(this);
        findViewById(R.id.navConfig).setOnClickListener(this);
        Ui.ajustarNav(this);
        findViewById(R.id.btnNuevoEquipo).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                startActivity(new Intent(EquiposActivity.this, EquipoFormActivity.class));
            }
        });

        lv = (ListView) findViewById(R.id.listaEquipos);
        search = (EditText) findViewById(R.id.searchEquipo);
        empty = (TextView) findViewById(R.id.emptyEquipos);

        search.addTextChangedListener(new TextWatcher() {
            @Override
            public void beforeTextChanged(CharSequence s, int a, int b, int c) {
            }

            @Override
            public void onTextChanged(CharSequence s, int a, int b, int c) {
                load();
            }

            @Override
            public void afterTextChanged(Editable s) {
            }
        });

        lv.setOnItemClickListener(new AdapterView.OnItemClickListener() {
            @Override
            public void onItemClick(AdapterView<?> p, View v, int i, long id) {
                startActivity(new Intent(EquiposActivity.this, EquipoDetailActivity.class)
                        .putExtra("equipoId", items.get(i).id));
            }
        });
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (!Db.sesionActiva()) {
            finish();
            return;
        }
        findViewById(R.id.btnNuevoEquipo).setVisibility(Db.puedeEditar() ? View.VISIBLE : View.GONE);
        load();
    }

    private void load() {
        final int seq = ++loadSeq;
        final String f = search.getText().toString();
        new Thread(new Runnable() {
            @Override
            public void run() {
                final ArrayList<Equipo> result;
                try {
                    result = Db.allEquipos(f);
                } catch (final Exception ex) {
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            if (seq == loadSeq) App.logError(ex);
                        }
                    });
                    return;
                }
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        if (seq != loadSeq) return;
                        items = result;
                        lv.setAdapter(new Adapter());
                        empty.setVisibility(items.isEmpty() ? View.VISIBLE : View.GONE);
                    }
                });
            }
        }).start();
    }

    @Override
    public void onClick(View v) {
        int id = v.getId();
        Class<?> target = null;
        if (id == R.id.navPanel) target = MainActivity.class;
        else if (id == R.id.navMantenimientos) target = MantenimientosActivity.class;
        else if (id == R.id.navAlertas) target = AlertasActivity.class;
        else if (id == R.id.navConfig) target = ConfigActivity.class;
        if (target != null) {
            startActivity(new Intent(this, target));
            overridePendingTransition(0, 0);
            finish();
        }
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
                    : getLayoutInflater().inflate(R.layout.item_equipo, parent, false);
            Equipo e = items.get(i);
            TextView usr = (TextView) v.findViewById(R.id.itemUser);
            TextView nom = (TextView) v.findViewById(R.id.itemNombre);
            TextView resp = (TextView) v.findViewById(R.id.itemResp);
            TextView sub = (TextView) v.findViewById(R.id.itemSub);
            TextView badge = (TextView) v.findViewById(R.id.itemBadge);

            String asignado = e.usuarioAsignado != null ? e.usuarioAsignado.trim() : "";
            usr.setText(asignado.length() > 0 ? "👤 " + asignado : "👤 Sin usuario asignado");
            nom.setText(linea(e.serie, e.hostname));
            resp.setText(e.responsable != null ? e.responsable.trim() : "");
            resp.setVisibility(resp.getText().length() > 0 ? View.VISIBLE : View.GONE);
            sub.setText(linea(e.equipo, e.ubicacion, e.ip));

            String st = e.status.length() > 0 ? e.status.toUpperCase() : "ACTIVO";
            badge.setText(st);
            GradientDrawable g = new GradientDrawable();
            g.setColor(Ui.RED);
            g.setCornerRadius(Ui.dp(EquiposActivity.this, 10));
            badge.setBackgroundDrawable(g);
            badge.setTextColor(0xFFFFFFFF);
            return v;
        }
    }

    private String linea(String... partes) {
        StringBuilder sb = new StringBuilder();
        for (String p : partes) {
            if (p == null) p = "";
            if (p.length() == 0) continue;
            if (sb.length() > 0) sb.append(" - ");
            sb.append(p);
        }
        return sb.length() > 0 ? sb.toString() : "—";
    }
}
