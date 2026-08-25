package me.app.mantenimiento;

import android.app.Activity;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.widget.BaseAdapter;
import android.widget.ListView;
import android.widget.TextView;

import java.util.ArrayList;

public class AuditoriaActivity extends Activity {

    private ArrayList<String[]> items = new ArrayList<>();
    private ListView lv;
    private TextView empty;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Db.init(this);
        if (!Db.esAdmin()) {
            Fmt.toast(this, "Solo el administrador puede ver la auditoría");
            finish();
            return;
        }
        setContentView(R.layout.activity_auditoria);

        lv = (ListView) findViewById(R.id.listaAuditoria);
        empty = (TextView) findViewById(R.id.emptyAuditoria);
        findViewById(R.id.btnVolverAuditoria).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                finish();
            }
        });

        cargar();
    }

    private void cargar() {
        items = Db.allAuditoria(300);
        lv.setAdapter(new Adapter());
        empty.setVisibility(items.isEmpty() ? View.VISIBLE : View.GONE);
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
            return i;
        }

        @Override
        public View getView(int i, View convertView, ViewGroup parent) {
            View v = convertView != null ? convertView
                    : getLayoutInflater().inflate(R.layout.item_auditoria, parent, false);
            String[] r = items.get(i);
            ((TextView) v.findViewById(R.id.auCabecera)).setText(
                    (r[0].length() > 0 ? r[0] : "?") + (r[1].length() > 0 ? "  " + r[1] : ""));
            TextView accion = (TextView) v.findViewById(R.id.auAccion);
            accion.setText(r[4]);
            StringBuilder det = new StringBuilder();
            if (r[2].length() > 0) det.append("👤 ").append(r[2]);
            if (r[3].length() > 0) det.append("  ·  ").append(r[3]);
            if (r[5].length() > 0) det.append("  ·  ").append(r[5]);
            ((TextView) v.findViewById(R.id.auDetalle)).setText(det.toString());
            return v;
        }
    }
}
