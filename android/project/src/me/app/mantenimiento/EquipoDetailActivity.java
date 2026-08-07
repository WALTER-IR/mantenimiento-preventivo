package me.app.mantenimiento;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.widget.AdapterView;
import android.widget.BaseAdapter;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.TextView;

import java.util.ArrayList;

public class EquipoDetailActivity extends Activity implements View.OnClickListener {

    private long equipoId = 0;
    private Equipo equipo;
    private LinearLayout equipoCard, respCard;
    private ListView lv;
    private int loadSeq = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Db.init(this);
        setContentView(R.layout.activity_equipo_detail);

        Bundle b = getIntent().getExtras();
        if (b != null) equipoId = b.getLong("equipoId", 0);
        App.logMessage("Detalle equipo id=" + equipoId + " onCreate");
        equipoCard = (LinearLayout) findViewById(R.id.detEquipoCard);
        respCard = (LinearLayout) findViewById(R.id.detResponsableCard);
        lv = (ListView) findViewById(R.id.listaMants);

        findViewById(R.id.btnEditarEquipo).setOnClickListener(this);
        findViewById(R.id.btnNuevoMant).setOnClickListener(this);
        findViewById(R.id.btnFormato).setOnClickListener(this);

        lv.setOnItemClickListener(new AdapterView.OnItemClickListener() {
            @Override
            public void onItemClick(AdapterView<?> p, View v, int i, long id) {
                Mantenimiento m = (Mantenimiento) p.getAdapter().getItem(i);
                startActivity(new Intent(EquipoDetailActivity.this, MantenimientoFormActivity.class)
                        .putExtra("mantId", m.id)
                        .putExtra("equipoId", equipoId));
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
        int vis = Db.puedeEditar() ? View.VISIBLE : View.GONE;
        findViewById(R.id.btnEditarEquipo).setVisibility(vis);
        findViewById(R.id.btnNuevoMant).setVisibility(vis);
        App.logMessage("Detalle equipo id=" + equipoId + " onResume");
        final int seq = ++loadSeq;
        new Thread(new Runnable() {
            @Override
            public void run() {
                final Equipo e;
                final ArrayList<Mantenimiento> mants;
                try {
                    e = Db.getEquipo(equipoId);
                    mants = Db.allMants(equipoId);
                    App.logMessage("Detalle equipo id=" + equipoId + " datos ok mants=" + mants.size());
                } catch (final Exception ex) {
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            if (seq != loadSeq) return;
                            App.logError(ex);
                            Fmt.toast(EquipoDetailActivity.this, "No se pudo abrir el detalle: " + App.crashMsg(ex));
                            finish();
                        }
                    });
                    return;
                }
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        if (seq != loadSeq) return;
                        if (e == null) {
                            Fmt.toast(EquipoDetailActivity.this, "El equipo ya no existe");
                            finish();
                            return;
                        }
                        if (!Db.puedeVerEquipo(e)) {
                            Fmt.toast(EquipoDetailActivity.this, "Este equipo no está asignado a tu usuario");
                            finish();
                            return;
                        }
                        equipo = e;
                        try {
                            render();
                        } catch (Exception ex) {
                            App.logError(ex);
                            Fmt.toast(EquipoDetailActivity.this, "No se pudo abrir el detalle: " + App.crashMsg(ex));
                            finish();
                            return;
                        }
                        lv.setAdapter(new MantAdapter(mants));
                        App.logMessage("Detalle equipo id=" + equipoId + " render ok");
                    }
                });
            }
        }).start();
    }

    private void render() {
        ((TextView) findViewById(R.id.detTitle)).setText(Db.equipoLabel(equipo));

        equipoCard.removeViews(1, equipoCard.getChildCount() - 1);
        addRow(equipoCard, "USUARIO ASIGNADO", equipo.responsable.length() > 0 ? equipo.responsable : "—");
        addRow(equipoCard, "HOSTNAME", equipo.hostname);
        addRow(equipoCard, "DIR. IP", equipo.ip);
        addRow(equipoCard, "UBICACIÓN FISICA", equipo.ubicacion);
        addRow(equipoCard, "EQUIPO", equipo.equipo);
        addRow(equipoCard, "COD. INVENTARIO", equipo.codInventario);
        addRow(equipoCard, "SERIE DE EQUIPO", equipo.serie);
        addRow(equipoCard, "MARCA", equipo.marca);
        addRow(equipoCard, "MODELO", equipo.modelo);
        addRow(equipoCard, "CONTRATO DE ARRENDAMIENTO", equipo.contrato);
        addRow(equipoCard, "STATUS", equipo.status);

        respCard.removeViews(1, respCard.getChildCount() - 1);
        addRow(respCard, "RESPONSABLE", equipo.responsable.length() > 0 ? equipo.responsable : "—");
        addRow(respCard, "ZONA", equipo.zona);
        addRow(respCard, "SUBDIVISION", equipo.subdivision);
        addRow(respCard, "DNI", equipo.dni);
        addRow(respCard, "CeCo SAP", equipo.ceco);
        addRow(respCard, "AREA", equipo.area);
        addRow(respCard, "CARGO", equipo.cargo);
        addRow(respCard, "EMAIL", equipo.email);
    }

    private void addRow(LinearLayout parent, String label, String value) {
        if (value == null || value.length() == 0) value = "—";
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setPadding(0, Ui.dp(this, 4), 0, Ui.dp(this, 4));

        TextView l = new TextView(this);
        l.setText(label);
        l.setTextSize(12);
        l.setTextColor(Ui.MUT);
        l.setTypeface(null, Typeface.BOLD);
        l.setPadding(0, 0, Ui.dp(this, 10), 0);
        row.addView(l, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 0.42f));

        TextView v = new TextView(this);
        v.setText(value);
        v.setTextSize(14);
        v.setTextColor(Ui.TEXT);
        row.addView(v, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 0.58f));

        parent.addView(row);
    }

    @Override
    public void onClick(View v) {
        int id = v.getId();
        if (id == R.id.btnEditarEquipo) {
            startActivity(new Intent(this, EquipoFormActivity.class).putExtra("equipoId", equipoId));
        } else if (id == R.id.btnNuevoMant) {
            startActivity(new Intent(this, MantenimientoFormActivity.class).putExtra("equipoId", equipoId));
        } else if (id == R.id.btnFormato) {
            startActivity(new Intent(this, FormatoActivity.class).putExtra("equipoId", equipoId));
        }
    }

    class MantAdapter extends BaseAdapter {
        private final ArrayList<Mantenimiento> items;

        MantAdapter(ArrayList<Mantenimiento> items) {
            this.items = items;
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
                eq.setText((m.prioridad.length() > 0 ? m.prioridad + " · " : "") +
                        (m.fechaProgramada.length() > 0 ? "Programado: " + Fmt.disp(m.fechaProgramada) : ""));
                usuario.setText(m.usuario.length() > 0 ? "👤 " + m.usuario : "");
                String estado = m.estado.length() > 0 ? m.estado : "Programado";
                int color = Db.estadoFinal(m.estado) ? Ui.OK : Ui.WARN;
                badge.setText(estado.toUpperCase());
                GradientDrawable g = new GradientDrawable();
                g.setColor(color);
                g.setCornerRadius(Ui.dp(EquipoDetailActivity.this, 10));
                badge.setBackgroundDrawable(g);
                badge.setTextColor(0xFFFFFFFF);
                StringBuilder sb = new StringBuilder();
                if (m.fechaReprogramada.length() > 0) sb.append("Reprogramado: ").append(Fmt.disp(m.fechaReprogramada));
                if (m.fechaReal.length() > 0) {
                    if (sb.length() > 0) sb.append("\n");
                    sb.append("Real: ").append(Fmt.disp(m.fechaReal));
                }
                if (m.observaciones.length() > 0) {
                    if (sb.length() > 0) sb.append("\n");
                    sb.append(m.observaciones);
                }
                info.setText(sb.toString());
            } catch (Exception ignored) {
            }
            return v;
        }
    }
}
