package me.app.mantenimiento;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.text.InputType;
import android.view.KeyEvent;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;

public class LoginActivity extends Activity {

    private EditText logUsuario, logClave;
    private TextView logError;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Db.init(this);
        if (Db.sesionActiva()) {
            irAlPanel();
            return;
        }
        setContentView(R.layout.activity_login);

        logUsuario = (EditText) findViewById(R.id.logUsuario);
        logClave = (EditText) findViewById(R.id.logClave);
        logError = (TextView) findViewById(R.id.logError);
        Button btn = (Button) findViewById(R.id.btnIngresar);

        btn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                ingresar();
            }
        });
        logClave.setOnEditorActionListener(new TextView.OnEditorActionListener() {
            @Override
            public boolean onEditorAction(TextView v, int actionId, KeyEvent event) {
                ingresar();
                return true;
            }
        });
    }

    private void ingresar() {
        logError.setVisibility(View.GONE);
        String u = logUsuario.getText().toString();
        String c = logClave.getText().toString();
        if (u.trim().length() == 0 || c.length() == 0) {
            logError.setText("Ingresa usuario y contraseña.");
            logError.setVisibility(View.VISIBLE);
            return;
        }
        if (Db.login(u, c) != null) {
            irAlPanel();
        } else {
            Db.logAuditoria(u, "", "INTENTO DE ACCESO FALLIDO", "Usuario: " + u);
            logError.setText("Usuario o contraseña incorrectos.");
            logError.setVisibility(View.VISIBLE);
        }
    }

    private void irAlPanel() {
        Intent i = new Intent(this, MainActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        startActivity(i);
        finish();
    }
}
