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
import android.widget.Button;
import android.widget.EditText;
import android.widget.ListView;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.Locale;

public class AlertasActivity extends Activity implements View.OnClickListener {

    private int modo = 0; // 0 vencidos, 1 proximos
    private ListView lv;
    private TextView empty;
    private Button chipVencidos, chipProximos;
    private EditText search;
    private ArrayList<Mantenimiento> items = new ArrayList<>();
    private HashMap<Long, String> labels = new HashMap<>();
    private int loadSeq = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Db.init(this);
        setContentView(R.layout.activity_alertas);

        findViewById(R.id.navPanel).setOnClickListener(this);
        findViewById(R.id.navEquipos).setOnClickListener(this);
        findViewById(R.id.navAlertas).setOnClickListener(this);
        findViewById(R.id.navConfig).setOnClickListener(this);
        Ui.ajustarNav(this);

        chipVencidos = (Button) findViewById(R.id.btnVencidos);
        chipProximos = (Button) findViewById(R.id.btnProximos);
        chipVencidos.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                setModo(0);
            }
        });
        chipProximos.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                setModo(1);
            }
        });

        lv = (ListView) findViewById(R.id.listaAlertas);
        empty = (TextView) findViewById(R.id.emptyAlertas);
        search = (EditText) findViewById(R.id.searchAlerta);
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
                Object o = items.get(i);
                if (o instanceof Mantenimiento) {
                    Mantenimiento m = (Mantenimiento) o;
                    startActivity(new Intent(AlertasActivity.this, EquipoDetailActivity.class)
                            .putExtra("equipoId", m.equipoId));
                }
            }
        });
    }

    private void setModo(int m) {
        modo = m;
        chipVencidos.setBackgroundResource(m == 0 ? R.drawable.bg_chip_active : R.drawable.bg_chip_inactive);
        chipProximos.setBackgroundResource(m == 1 ? R.drawable.bg_chip_active : R.drawable.bg_chip_inactive);
        chipVencidos.setTextColor(m == 0 ? 0xFFFFFFFF : Ui.TEXT);
        chipProximos.setTextColor(m == 1 ? 0xFFFFFFFF : Ui.TEXT);
        load();
    }

    @Override
    protected void onResume() {
        super.onResume();
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
                    result = Db.alertas(modo);
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
                    : getLayoutInflater().inflate(R.layout.item_alert, parent, false);
            try {
                Mantenimiento m = items.get(i);
                TextView nom = (TextView) v.findViewById(R.id.alNombre);
                TextView usuario = (TextView) v.findViewById(R.id.alUsuario);
                TextView info = (TextView) v.findViewById(R.id.alInfo);
                TextView dias = (TextView) v.findViewById(R.id.alDias);
                String lbl = labels.get(m.equipoId);
                nom.setText(lbl != null ? lbl : "Equipo eliminado");
                usuario.setText(m.usuario.length() > 0 ? "👤 " + m.usuario : "");
                String eff = m.fechaReprogramada.length() > 0 ? m.fechaReprogramada : m.fechaProgramada;
                long d = Fmt.daysUntil(Fmt.today(), eff);
                info.setText("Programado: " + Fmt.disp(eff) +
                        (m.prioridad.length() > 0 ? " · " + m.prioridad : "") +
                        (m.estado.length() > 0 ? " · " + m.estado : ""));
                int color;
                String txt;
                if (d < 0) {
                    color = Ui.BAD;
                    txt = (-d) + " días atrasado";
                } else {
                    color = Ui.WARN;
                    txt = d == 0 ? "hoy" : "en " + d + " días";
                }
                dias.setText(txt);
                GradientDrawable g = new GradientDrawable();
                g.setColor(color);
                g.setCornerRadius(Ui.dp(AlertasActivity.this, 10));
                dias.setBackgroundDrawable(g);
                dias.setTextColor(0xFFFFFFFF);
            } catch (Exception ignored) {
            }
            return v;
        }
    }
}
