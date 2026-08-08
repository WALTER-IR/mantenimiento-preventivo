package me.app.mantenimiento;

import android.app.Activity;
import android.app.DatePickerDialog;
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
import android.widget.DatePicker;
import android.widget.EditText;
import android.widget.ListView;
import android.widget.Spinner;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.HashMap;
import java.util.Locale;

public class MantenimientosActivity extends Activity implements View.OnClickListener {

    private ListView lv;
    private EditText search;
    private Spinner filterUbicacion;
    private TextView empty;
    private Spinner filterEstado;
    private EditText filterDesde, filterHasta;
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

        lv = (ListView) findViewById(R.id.listaMantenimientos);
        search = (EditText) findViewById(R.id.searchMant);
        filterUbicacion = (Spinner) findViewById(R.id.filterUbicacion);
        empty = (TextView) findViewById(R.id.emptyMantenimientos);
        filterEstado = (Spinner) findViewById(R.id.filterEstado);
        filterDesde = (EditText) findViewById(R.id.filterDesde);
        filterHasta = (EditText) findViewById(R.id.filterHasta);

        filterEstado.setAdapter(new ArrayAdapter<>(this,
                android.R.layout.simple_spinner_dropdown_item,
                getResources().getStringArray(R.array.filtros_estado_mant)));
        filterEstado.setSelection(1);
        filterEstado.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override
            public void onItemSelected(AdapterView<?> p, View v, int i, long id) {
                load();
            }

            @Override
            public void onNothingSelected(AdapterView<?> p) {
            }
        });

        String hoy = Fmt.disp(Fmt.today());
        filterDesde.setText(hoy);
        filterHasta.setText(hoy);
        setFilterDatePicker(filterDesde);
        setFilterDatePicker(filterHasta);

        findViewById(R.id.btnBuscarMant).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                load();
            }
        });
        findViewById(R.id.btnLimpiarMant).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                filterUbicacion.setSelection(0);
                filterEstado.setSelection(1);
                filterDesde.setText(Fmt.disp(Fmt.today()));
                filterHasta.setText(Fmt.disp(Fmt.today()));
                load();
            }
        });

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

        cargarUbicaciones();
        filterUbicacion.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override
            public void onItemSelected(AdapterView<?> p, View v, int i, long id) {
                load();
            }

            @Override
            public void onNothingSelected(AdapterView<?> p) {
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

    private void setFilterDatePicker(final EditText field) {
        field.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                pickFilterDate(field);
            }
        });
        field.setOnLongClickListener(new View.OnLongClickListener() {
            @Override
            public boolean onLongClick(View v) {
                field.setText("");
                return true;
            }
        });
    }

    private void pickFilterDate(final EditText field) {
        Calendar c = Calendar.getInstance();
        String canon = Fmt.canon(field.getText().toString());
        if (canon.length() > 0) {
            try {
                c.setTime(Fmt.FMT.parse(canon));
            } catch (Exception ignored) {
            }
        }
        DatePickerDialog dlg = new DatePickerDialog(this,
                new DatePickerDialog.OnDateSetListener() {
                    @Override
                    public void onDateSet(DatePicker view, int year, int month, int day) {
                        Calendar sel = Calendar.getInstance();
                        sel.set(year, month, day);
                        field.setText(Fmt.disp(Fmt.FMT.format(sel.getTime())));
                    }
                },
                c.get(Calendar.YEAR), c.get(Calendar.MONTH), c.get(Calendar.DAY_OF_MONTH));
        dlg.show();
    }

    private void cargarUbicaciones() {
        ArrayList<String> ubics = new ArrayList<>();
        ubics.add("Todas las ubicaciones");
        java.util.TreeSet<String> set = new java.util.TreeSet<>(String.CASE_INSENSITIVE_ORDER);
        for (Equipo e : Db.allEquipos()) {
            String u = e.ubicacion == null ? "" : e.ubicacion.trim();
            if (u.length() > 0) set.add(u);
        }
        ubics.addAll(set);
        int sel = filterUbicacion.getSelectedItemPosition();
        ArrayAdapter<String> ad = new ArrayAdapter<>(this,
                android.R.layout.simple_spinner_dropdown_item, ubics);
        filterUbicacion.setAdapter(ad);
        if (sel > 0 && sel < ubics.size()) filterUbicacion.setSelection(sel);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (!Db.sesionActiva()) {
            finish();
            return;
        }
        cargarUbicaciones();
        load();
    }

    private void load() {
        final int seq = ++loadSeq;
        final String q = search == null ? "" : search.getText().toString().trim().toLowerCase(Locale.ROOT);
        final String uq = filterUbicacion == null ? "" : String.valueOf(filterUbicacion.getSelectedItem());
        final int estadoPos = filterEstado == null ? 0 : filterEstado.getSelectedItemPosition();
        final String desde = Fmt.canon(filterDesde == null ? "" : filterDesde.getText().toString());
        final String hasta = Fmt.canon(filterHasta == null ? "" : filterHasta.getText().toString());
        final String estadoSel = estadoPos <= 0 ? ""
                : getResources().getStringArray(R.array.estados_mantenimiento)[estadoPos - 1];
        new Thread(new Runnable() {
            @Override
            public void run() {
                final ArrayList<Mantenimiento> result;
                final HashMap<Long, String> map = new HashMap<>();
                try {
                    result = new ArrayList<>();
                    for (Mantenimiento m : Db.allMants()) {
                        if (q.length() > 0 && !m.usuario.toLowerCase(Locale.ROOT).contains(q)
                                && !m.serie.toLowerCase(Locale.ROOT).contains(q)
                                && !m.hostname.toLowerCase(Locale.ROOT).contains(q)) {
                            continue;
                        }
                        if (uq.length() > 0 && !uq.equals("Todas las ubicaciones")
                                && !m.ubicacion.trim().equalsIgnoreCase(uq)) continue;
                        if (estadoSel.length() > 0 && !m.estado.equalsIgnoreCase(estadoSel)) continue;
                        String eff = m.fechaReprogramada.length() > 0 ? m.fechaReprogramada : m.fechaProgramada;
                        if (desde.length() > 0 && eff.compareTo(desde) < 0) continue;
                        if (hasta.length() > 0 && eff.compareTo(hasta) > 0) continue;
                        result.add(m);
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
                TextView usr = (TextView) v.findViewById(R.id.mtUsuario);
                TextView nom = (TextView) v.findViewById(R.id.mtNombre);
                TextView badge = (TextView) v.findViewById(R.id.mtBadge);
                TextView info = (TextView) v.findViewById(R.id.mtInfo);
                TextView reprog = (TextView) v.findViewById(R.id.mtReprog);
                String asignado = m.usuarioAsignado.length() > 0 ? m.usuarioAsignado : m.usuario;
                usr.setText(asignado.length() > 0 ? "👤 " + asignado : "👤 Sin usuario asignado");
                nom.setText(linea(m.serie, m.hostname));
                String estado = m.estado.length() > 0 ? m.estado : "Programado";
                int color = Db.estadoFinal(m.estado) ? Ui.OK : Ui.WARN;
                setBadge(badge, estado.toUpperCase(), color);
                info.setText(linea(Fmt.disp(m.fechaProgramada), m.prioridad));
                reprog.setText(m.fechaReprogramada.length() > 0
                        ? Fmt.disp(m.fechaReprogramada) : "—");
            } catch (Exception ignored) {
            }
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

    private void setBadge(TextView t, String text, int color) {
        t.setText(text);
        GradientDrawable g = new GradientDrawable();
        g.setColor(color);
        g.setCornerRadius(Ui.dp(this, 10));
        t.setBackgroundDrawable(g);
        t.setTextColor(0xFFFFFFFF);
    }
}
