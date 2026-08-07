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
import java.util.HashMap;
import java.util.Locale;

public class MantenimientosActivity extends Activity implements View.OnClickListener {

    private ListView lv;
    private EditText search;
    private TextView empty;
    private ArrayList<Mantenimiento> items = new ArrayList<>();
    private HashMap<Long, String> labels = new HashMap<>();
    private int loadSeq = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Db.init(this);
        if (!Db.sesionActiva()) {
            finish();
            return;
        }
        setContentView(R.layout.activity_mantenimientos);

        findViewById(R.id.navPanel).setOnClickListener(this);
        findViewById(R.id.navEquipos).setOnClickListener(this);
        findViewById(R.id.navMantenimientos).setOnClickListener(this);
        findViewById(R.id.navAlertas).setOnClickListener(this);
        findViewById(R.id.navConfig).setOnClickListener(this);
        Ui.ajustarNav(this);
        findViewById(R.id.btnNuevoMantenimiento).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                startActivity(new Intent(MantenimientosActivity.this, MantenimientoFormActivity.class));
            }
        });

        lv = (ListView) findViewById(R.id.listaMantenimientos);
        search = (EditText) findViewById(R.id.searchMant);
        empty = (TextView) findViewById(R.id.emptyMantenimientos);

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
                Mantenimiento m = items.get(i);
                startActivity(new Intent(MantenimientosActivity.this, EquipoDetailActivity.class)
                        .putExtra("equipoId", m.equipoId));
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
        findViewById(R.id.btnNuevoMantenimiento).setVisibility(Db.puedeEditar() ? View.VISIBLE : View.GONE);
        load();
    }

    private void load() {
        final int seq = ++loadSeq;
        final String q = search == null ? "" : search.getText().toString().trim().toLowerCase(Locale.ROOT);
        new Thread(new Runnable() {
            @Override
            public void run() {
                final ArrayList<Mantenimiento> result;
                final HashMap<Long, String> map = new HashMap<>();
                try {
                    result = Db.allMants();
                    if (q.length() > 0) {
                        ArrayList<Mantenimiento> filt = new ArrayList<>();
                        for (Mantenimiento m : result) {
                            if (m.usuario.toLowerCase(Locale.ROOT).contains(q)
                                    || m.serie.toLowerCase(Locale.ROOT).contains(q)
                                    || m.hostname.toLowerCase(Locale.ROOT).contains(q)) {
                                filt.add(m);
                            }
                        }
                        result.clear();
                        result.addAll(filt);
                    }
                    for (Equipo e : Db.allEquipos()) map.put(e.id, Db.equipoLabel(e));
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
                        labels = map;
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
        else if (id == R.id.navEquipos) target = EquiposActivity.class;
        else if (id == R.id.navMantenimientos) return;
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
                    : getLayoutInflater().inflate(R.layout.item_mantenimiento, parent, false);
            try {
                Mantenimiento m = items.get(i);
                TextView eq = (TextView) v.findViewById(R.id.mtEquipo);
                TextView usuario = (TextView) v.findViewById(R.id.mtUsuario);
                TextView badge = (TextView) v.findViewById(R.id.mtBadge);
                TextView info = (TextView) v.findViewById(R.id.mtInfo);
                String lbl = labels.get(m.equipoId);
                eq.setText(lbl != null ? lbl : "Equipo eliminado");
                usuario.setText(m.usuario.length() > 0 ? "👤 " + m.usuario : "");
                String estado = m.estado.length() > 0 ? m.estado : "Pendiente";
                int color = Db.estadoFinal(m.estado) ? Ui.OK : Ui.WARN;
                setBadge(badge, estado.toUpperCase(), color);
                StringBuilder sb = new StringBuilder("Programado: ").append(Fmt.disp(m.fechaProgramada));
                if (m.fechaReprogramada.length() > 0) sb.append("  ·  Reprogramado: ").append(Fmt.disp(m.fechaReprogramada));
                if (m.fechaReal.length() > 0) sb.append("  ·  Real: ").append(Fmt.disp(m.fechaReal));
                if (m.prioridad.length() > 0) sb.append("  ·  ").append(m.prioridad);
                info.setText(sb.toString());
            } catch (Exception ignored) {
            }
            return v;
        }
    }

    private void setBadge(TextView t, String text, int color) {
        t.setText(text);
        GradientDrawable g = new GradientDrawable();
        g.setColor(color);
        g.setCornerRadius(Ui.dp(this, 10));
        t.setBackgroundDrawable(g);
        t.setTextColor(0xFFFFFFFF);
    }
}
