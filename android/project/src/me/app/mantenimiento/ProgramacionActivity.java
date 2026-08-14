package me.app.mantenimiento;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.util.ArrayList;

public class ProgramacionActivity extends Activity implements View.OnClickListener {

    private EditText fdFecha, fdMotivo, progFechaInicial;
    private LinearLayout fdList;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Db.init(this);
        if (!Db.esAdmin()) {
            Fmt.toast(this, "Solo el administrador puede programar mantenimientos");
            finish();
            return;
        }
        setContentView(R.layout.activity_programacion);

        fdFecha = (EditText) findViewById(R.id.fdFecha);
        fdMotivo = (EditText) findViewById(R.id.fdMotivo);
        progFechaInicial = (EditText) findViewById(R.id.progFechaInicial);
        fdList = (LinearLayout) findViewById(R.id.fdList);

        progFechaInicial.setText(Fmt.disp(Fmt.today()));
        fdFecha.setOnClickListener(this);
        progFechaInicial.setOnClickListener(this);
        findViewById(R.id.btnAgregarFeriado).setOnClickListener(this);
        findViewById(R.id.btnProgramar).setOnClickListener(this);

        cargarFeriados();
    }

    private void cargarFeriados() {
        fdList.removeAllViews();
        ArrayList<String[]> feriados = Db.allFeriados();
        if (feriados.isEmpty()) {
            TextView t = new TextView(this);
            t.setText("Sin feriados registrados.");
            t.setTextSize(14);
            t.setTextColor(Ui.MUT);
            t.setPadding(0, Ui.dp(this, 8), 0, Ui.dp(this, 8));
            fdList.addView(t);
            return;
        }
        for (final String[] f : feriados) {
            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.HORIZONTAL);
            row.setPadding(0, Ui.dp(this, 6), 0, Ui.dp(this, 6));

            TextView t = new TextView(this);
            String txt = "📅 " + Fmt.disp(f[1]);
            if (f[2].length() > 0) txt += "  ·  " + f[2];
            t.setText(txt);
            t.setTextSize(14);
            t.setTextColor(Ui.TEXT);
            t.setLayoutParams(new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

            Button b = new Button(this);
            b.setText("Eliminar");
            b.setTextSize(12);
            b.setTextColor(0xFFFFFFFF);
            b.setBackgroundResource(R.drawable.bg_button_danger);
            b.setPadding(Ui.dp(this, 12), Ui.dp(this, 4), Ui.dp(this, 12), Ui.dp(this, 4));
            b.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    Db.deleteFeriado(Long.parseLong(f[0]));
                    Fmt.toast(ProgramacionActivity.this, "Feriado eliminado");
                    cargarFeriados();
                }
            });

            row.addView(t);
            row.addView(b);
            fdList.addView(row);
        }
    }

    private void agregarFeriado() {
        String fecha = Fmt.canon(fdFecha.getText().toString().trim());
        if (fecha.length() == 0) {
            Fmt.toast(this, "Selecciona la FECHA del feriado");
            return;
        }
        Db.saveFeriado(fecha, fdMotivo.getText().toString().trim());
        Fmt.toast(this, "Feriado registrado");
        fdMotivo.setText("");
        fdFecha.setText("");
        cargarFeriados();
    }

    private void confirmarProgramar() {
        final String fecha = Fmt.canon(progFechaInicial.getText().toString().trim());
        if (fecha.length() == 0) {
            Fmt.toast(this, "Selecciona la FECHA INICIAL");
            return;
        }
        new AlertDialog.Builder(this)
                .setTitle("Programar mantenimientos")
                .setMessage("Se reprogramarán los mantenimientos pendientes de todos los equipos desde "
                        + Fmt.disp(fecha) + ", solo en días laborales (lun-vie, sin feriados), con máximo "
                        + "3 equipos por día y por responsable. ¿Continuar?")
                .setPositiveButton("Programar", new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface d, int w) {
                        int total = Db.programarMantenimientos(fecha);
                        Fmt.toast(ProgramacionActivity.this, total + " mantenimiento(s) programado(s)");
                    }
                })
                .setNegativeButton("Cancelar", null)
                .show();
    }

    @Override
    public void onClick(View v) {
        int id = v.getId();
        if (id == R.id.fdFecha) {
            Fmt.pickDate(this, fdFecha, Fmt.today());
        } else if (id == R.id.progFechaInicial) {
            Fmt.pickDate(this, progFechaInicial, progFechaInicial.getText().toString());
        } else if (id == R.id.btnAgregarFeriado) {
            agregarFeriado();
        } else if (id == R.id.btnProgramar) {
            confirmarProgramar();
        }
    }
}
