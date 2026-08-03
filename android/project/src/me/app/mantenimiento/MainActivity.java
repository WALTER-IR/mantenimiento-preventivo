package me.app.mantenimiento;

import android.app.Activity;
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
import java.util.HashMap;

public class MainActivity extends Activity implements View.OnClickListener {

    private TextView statResp, statEquipos, statVencidos, statProximos, lblEmpresa;
    private int loadSeq = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Db.init(this);
        setContentView(R.layout.activity_main);

        lblEmpresa = (TextView) findViewById(R.id.lblEmpresa);
        statResp = (TextView) findViewById(R.id.statResp);
        statEquipos = (TextView) findViewById(R.id.statEquipos);
        statVencidos = (TextView) findViewById(R.id.statVencidos);
        statProximos = (TextView) findViewById(R.id.statProximos);

        findViewById(R.id.navEquipos).setOnClickListener(this);
        findViewById(R.id.navAlertas).setOnClickListener(this);
        findViewById(R.id.navConfig).setOnClickListener(this);
        Ui.ajustarNav(this);
        findViewById(R.id.navPanel).setOnClickListener(this);
        findViewById(R.id.btnVerAlertas).setOnClickListener(this);

        ((ListView) findViewById(R.id.listaAlertas)).setOnItemClickListener(new AdapterView.OnItemClickListener() {
            @Override
            public void onItemClick(AdapterView<?> p, View v, int i, long id) {
                Object o = p.getAdapter().getItem(i);
                if (o instanceof Mantenimiento) {
                    Mantenimiento m = (Mantenimiento) o;
                    startActivity(new Intent(MainActivity.this, EquipoDetailActivity.class)
                            .putExtra("equipoId", m.equipoId));
                }
            }
        });

        ((ListView) findViewById(R.id.listaRecientes)).setOnItemClickListener(new AdapterView.OnItemClickListener() {
            @Override
            public void onItemClick(AdapterView<?> p, View v, int i, long id) {
                Object o = p.getAdapter().getItem(i);
                if (o instanceof Mantenimiento) {
                    Mantenimiento m = (Mantenimiento) o;
                    startActivity(new Intent(MainActivity.this, EquipoDetailActivity.class)
                            .putExtra("equipoId", m.equipoId));
                }
            }
        });
    }

    @Override
    protected void onResume() {
        super.onResume();
        String emp = Db.getEmpresa(this);
        lblEmpresa.setText(emp == null || emp.length() == 0 ? "Inventario por responsable" : emp);
        final int seq = ++loadSeq;
        new Thread(new Runnable() {
            @Override
            public void run() {
                final int r1, r2, r3, r4;
                final ArrayList<Mantenimiento> alertas, recientes;
                final HashMap<Long, String> labels = new HashMap<>();
                try {
                    r1 = Db.countUsuarios();
                    r2 = Db.countEquipos();
                    r3 = Db.countVencidos();
                    r4 = Db.countProximos();
                    for (Equipo e : Db.allEquipos()) labels.put(e.id, Db.equipoLabel(e));
                    alertas = new ArrayList<>();
                    alertas.addAll(Db.alertas(0));
                    alertas.addAll(Db.alertas(1));
                    if (alertas.size() > 30) alertas.subList(30, alertas.size()).clear();
                    recientes = Db.recent(5);
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
                        statResp.setText(String.valueOf(r1));
                        statEquipos.setText(String.valueOf(r2));
                        statVencidos.setText(String.valueOf(r3));
                        statProximos.setText(String.valueOf(r4));
                        ((ListView) findViewById(R.id.listaAlertas)).setAdapter(new MantAlertAdapter(alertas, labels));
                        ((ListView) findViewById(R.id.listaRecientes)).setAdapter(new MantItemAdapter(recientes, labels));
                    }
                });
            }
        }).start();
    }

    @Override
    public void onClick(View v) {
        int id = v.getId();
        Class<?> target = null;
        if (id == R.id.navEquipos) target = EquiposActivity.class;
        else if (id == R.id.navAlertas) target = AlertasActivity.class;
        else if (id == R.id.navConfig) target = ConfigActivity.class;
        else if (id == R.id.btnVerAlertas) target = AlertasActivity.class;
        if (target != null) startActivity(new Intent(this, target));
    }

    private void setBadge(TextView t, String text, int color) {
        t.setText(text);
        GradientDrawable g = new GradientDrawable();
        g.setColor(color);
        g.setCornerRadius(Ui.dp(this, 10));
        t.setBackgroundDrawable(g);
        t.setTextColor(0xFFFFFFFF);
    }

    class MantAlertAdapter extends BaseAdapter {
        private final ArrayList<Mantenimiento> items;
        private final HashMap<Long, String> labels;

        MantAlertAdapter(ArrayList<Mantenimiento> items, HashMap<Long, String> labels) {
            this.items = items;
            this.labels = labels;
        }

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
                info.setText("Programado: " + Fmt.disp(eff) + (m.prioridad.length() > 0 ? " · " + m.prioridad : ""));
                if (d < 0) {
                    setBadge(dias, (-d) + " días atrasado", Ui.BAD);
                } else {
                    setBadge(dias, "en " + d + " días", Ui.WARN);
                }
            } catch (Exception ignored) {
            }
            return v;
        }
    }

    class MantItemAdapter extends BaseAdapter {
        private final ArrayList<Mantenimiento> items;
        private final HashMap<Long, String> labels;

        MantItemAdapter(ArrayList<Mantenimiento> items, HashMap<Long, String> labels) {
            this.items = items;
            this.labels = labels;
        }

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
                if (m.serie.length() > 0) {
                    eq.setText(m.serie);
                } else {
                    String lbl = labels.get(m.equipoId);
                    eq.setText(lbl != null ? lbl : "Equipo #" + m.equipoId);
                }
                usuario.setText(m.usuario.length() > 0 ? "👤 " + m.usuario : "");
                String estado = m.estado.length() > 0 ? m.estado : "Pendiente";
                int color = Db.estadoFinal(m.estado) ? Ui.OK : Ui.WARN;
                setBadge(badge, estado.toUpperCase(), color);
                StringBuilder sb = new StringBuilder("Programado: ").append(Fmt.disp(m.fechaProgramada));
                if (m.fechaReprogramada.length() > 0) sb.append("  ·  Reprogramado: ").append(Fmt.disp(m.fechaReprogramada));
                if (m.fechaReal.length() > 0) sb.append("  ·  Real: ").append(Fmt.disp(m.fechaReal));
                info.setText(sb.toString());
            } catch (Exception ignored) {
            }
            return v;
        }
    }
}
