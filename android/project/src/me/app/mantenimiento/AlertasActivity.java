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
import android.widget.ArrayAdapter;
import android.widget.BaseAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ListView;
import android.widget.Spinner;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.Locale;

public class AlertasActivity extends Activity implements View.OnClickListener {

    private int modo = 0; // 0 vencidos (botón), 1 7dias, 2 15dias, 3 30dias (combobox)
    private ListView lv;
    private TextView empty;
    private Spinner spinnerAlertas;
    private Button btnVencidos;
    private EditText search;
    private ArrayList<Mantenimiento> items = new ArrayList<>();
    private HashMap<Long, String> labels = new HashMap<>();
    private int loadSeq = 0;
    private boolean spinnerReady = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Db.init(this);
        setContentView(R.layout.activity_alertas);

        findViewById(R.id.navPanel).setOnClickListener(this);
        findViewById(R.id.navEquipos).setOnClickListener(this);
        findViewById(R.id.navMantenimientos).setOnClickListener(this);
        findViewById(R.id.navAlertas).setOnClickListener(this);
        findViewById(R.id.navConfig).setOnClickListener(this);
        Ui.ajustarNav(this);

        // Botón "Vencidos" + combobox con los próximos mantenimientos
        btnVencidos = (Button) findViewById(R.id.btnVencidos);
        btnVencidos.setOnClickListener(this);

        spinnerAlertas = (Spinner) findViewById(R.id.spinnerAlertas);
        ArrayAdapter<CharSequence> adapter = ArrayAdapter.createFromResource(this,
                R.array.alertas_proximos, android.R.layout.simple_spinner_dropdown_item);
        spinnerAlertas.setAdapter(adapter);
        spinnerAlertas.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override
            public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
                // El primer disparo se produce al colocar el adaptador; se ignora para
                // que la vista inicial sea "Vencidos".
                if (!spinnerReady) {
                    spinnerReady = true;
                    return;
                }
                modo = position + 1; // 1=7dias, 2=15dias, 3=30dias
                marcarVencidos(false);
                load();
            }
            @Override
            public void onNothingSelected(AdapterView<?> parent) {}
        });

        marcarVencidos(true);
        load();

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

    @Override
    protected void onResume() {
        super.onResume();
        load();
    }

    private void marcarVencidos(boolean activo) {
        if (btnVencidos == null) return;
        btnVencidos.setBackgroundResource(activo ? R.drawable.bg_chip_active : R.drawable.bg_chip_inactive);
        btnVencidos.setTextColor(activo ? 0xFFFFFFFF : 0xFF000000);
    }

    private void load() {
        final int seq = ++loadSeq;
        final String q = search == null ? "" : search.getText().toString().trim().toLowerCase(Locale.ROOT);
        final int m = modo;
        new Thread(new Runnable() {
            @Override
            public void run() {
                final ArrayList<Mantenimiento> result;
                final HashMap<Long, String> map = new HashMap<>();
                try {
                    // m: 0=vencidos, 1=7dias, 2=15dias, 3=30dias
                    result = Db.alertas(m);
                    if (q.length() > 0) {
                        ArrayList<Mantenimiento> filt = new ArrayList<>();
                        for (Mantenimiento m : result) {
                            // Buscar por usuario asignado, serie y hostname
                            Equipo eq = Db.getEquipo(m.equipoId);
                            String usuarioEq = (eq != null && eq.usuarioAsignado != null) ? eq.usuarioAsignado.toLowerCase(Locale.ROOT) : "";
                            if (usuarioEq.contains(q)
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
                        // Contador de alertas
                        TextView counter = findViewById(R.id.alertCounter);
                        if (counter != null) {
                            String[] tipos = {"Vencidos", "Próximos 7 días", "Próximos 15 días", "Próximos 30 días"};
                            String tipo = m >= 0 && m < tipos.length ? tipos[m] : "Alertas";
                            counter.setText(result.size() + " registro" + (result.size() == 1 ? "" : "s") + " " + tipo.toLowerCase());
                        }
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
        else if (id == R.id.navMantenimientos) target = MantenimientosActivity.class;
        else if (id == R.id.navConfig) target = ConfigActivity.class;
        else if (id == R.id.btnVencidos) {
            modo = 0;
            marcarVencidos(true);
            load();
            return;
        }
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
                // Usuario asignado en la primera línea (negrita); responsable en línea independiente en rojo.
                Equipo eq = Db.getEquipo(m.equipoId);
                String asignado = eq != null && eq.usuarioAsignado != null ? eq.usuarioAsignado.trim() : "";
                nom.setText(asignado.length() > 0 ? asignado : "Equipo eliminado");
                String responsable = eq != null && eq.responsable != null ? eq.responsable.trim() : "";
                if (responsable.length() > 0 && !responsable.equalsIgnoreCase(asignado)) {
                    usuario.setText("Responsable: " + responsable);
                    usuario.setVisibility(View.VISIBLE);
                } else {
                    usuario.setVisibility(View.GONE);
                }
                info.setText(lbl != null ? lbl : "");
                TextView mant = (TextView) v.findViewById(R.id.alMant);
                String eff = m.fechaReprogramada.length() > 0 ? m.fechaReprogramada : m.fechaProgramada;
                long d = Fmt.daysUntil(Fmt.today(), eff);
                String infoText = "Programado: " + Fmt.disp(eff);
                if (m.prioridad.length() > 0) infoText += " | " + m.prioridad;
                if (m.estado.length() > 0) infoText += " | " + m.estado;
                mant.setText(infoText);
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
