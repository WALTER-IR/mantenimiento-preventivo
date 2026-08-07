package me.app.mantenimiento;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.pdf.PdfDocument;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintDocumentInfo;
import android.print.PrintManager;
import android.view.View;
import android.widget.TextView;

import java.io.FileOutputStream;
import java.util.ArrayList;
import java.util.Locale;

public class FormatoActivity extends Activity implements View.OnClickListener {

    private long equipoId = 0;
    private String texto = "";
    private int loadSeq = 0;
    private PrintAttributes attrs;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Db.init(this);
        setContentView(R.layout.activity_formato);

        Bundle b = getIntent().getExtras();
        if (b != null) equipoId = b.getLong("equipoId", 0);
        App.logMessage("Formato equipo id=" + equipoId + " onCreate");
        findViewById(R.id.btnEnviarFormato).setOnClickListener(this);
        findViewById(R.id.btnImprimirFormato).setOnClickListener(this);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (!Db.sesionActiva()) {
            finish();
            return;
        }
        final int seq = ++loadSeq;
        new Thread(new Runnable() {
            @Override
            public void run() {
                final String t;
                try {
                    t = buildFormato();
                } catch (final Exception ex) {
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            if (seq != loadSeq) return;
                            App.logError(ex);
                            Fmt.toast(FormatoActivity.this, "No se pudo generar el formato: " + App.crashMsg(ex));
                            finish();
                        }
                    });
                    return;
                }
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        if (seq != loadSeq) return;
                        texto = t;
                        ((TextView) findViewById(R.id.formatoTexto)).setText(t);
                        App.logMessage("Formato equipo id=" + equipoId + " generado");
                    }
                });
            }
        }).start();
    }

    private String buildFormato() {
        Equipo e = Db.getEquipo(equipoId);
        if (e == null) return "Equipo no encontrado.";

        ArrayList<Mantenimiento> mants = Db.allMants(equipoId);
        Mantenimiento ultimo = mants == null || mants.isEmpty() ? null : mants.get(0);
        String fechaMant = Fmt.today();
        if (ultimo != null) {
            if (ultimo.fechaReal.length() > 0) fechaMant = ultimo.fechaReal;
            else if (ultimo.fechaReprogramada.length() > 0) fechaMant = ultimo.fechaReprogramada;
            else if (ultimo.fechaProgramada.length() > 0) fechaMant = ultimo.fechaProgramada;
        }

        ArrayList<String> soft = new ArrayList<>();
        ArrayList<String> hard = new ArrayList<>();
        if (ultimo != null && ultimo.observaciones.trim().length() > 0) {
            for (String a : ultimo.observaciones.split("\n")) {
                String s = a.trim();
                if (s.length() == 0) continue;
                if (esHardware(s)) hard.add(s);
                else soft.add(s);
            }
        }

        StringBuilder sb = new StringBuilder();
        sb.append("FORMATO DE MANTENIMIENTO\n");
        sb.append("Código: TI-F016 | Versión: 02 | Fecha de Aprobación: 01/03/2023\n");
        sb.append("Nº CC:\n\n");
        linea(sb, "Apellidos y nombres:", e.responsable);
        linea(sb, "DNI:", e.dni);
        linea(sb, "Cargo:", e.cargo);
        linea(sb, "Área:", e.area);
        linea(sb, "Fecha Mantenimiento:", Fmt.disp(fechaMant));
        linea(sb, "Serie/CI:", e.serie);
        linea(sb, "Centro de trabajo:", e.ubicacion);
        linea(sb, "Responsable de TI:", Db.getSesionNombre());
        sb.append("\nActividades Realizadas:\n");
        sb.append("A continuación, se detallan los mantenimientos:\n\n");
        sb.append("Mantenimiento de Software\n");
        if (soft.isEmpty()) sb.append("—\n");
        else for (String s : soft) sb.append("• ").append(s).append("\n");
        sb.append("\nMantenimiento de Hardware\n");
        if (hard.isEmpty()) sb.append("—\n");
        else for (String s : hard) sb.append("• ").append(s).append("\n");
        return sb.toString().trim();
    }

    private boolean esHardware(String t) {
        String s = t.toLowerCase(Locale.US);
        return s.contains("limpieza de disco") || s.contains("ram") || s.contains("placa")
                || s.contains("disipador") || s.contains("pasta") || s.contains("fuente")
                || s.contains("ventilador") || s.contains("cpu") || s.contains("gpu")
                || s.contains("bater") || s.contains("tarjeta") || s.contains("hardware")
                || s.contains("cableado") || s.contains("puertos") || s.contains("ssd")
                || s.contains("hdd") || s.contains("teclado") || s.contains("pantalla")
                || s.contains("limpieza interna") || s.contains("disco f");
    }

    private void linea(StringBuilder sb, String label, String value) {
        sb.append(label).append(" ").append((value == null || value.length() == 0) ? "" : value.trim()).append("\n");
    }

    @Override
    public void onClick(View v) {
        int id = v.getId();
        if (id == R.id.btnEnviarFormato) {
            enviar();
        } else if (id == R.id.btnImprimirFormato) {
            imprimir();
        }
    }

    private void enviar() {
        if (texto.length() == 0) {
            Fmt.toast(this, "Aún no se ha generado el formato");
            return;
        }
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType("text/plain");
        send.putExtra(Intent.EXTRA_SUBJECT, "Formato de mantenimiento TI-F016");
        send.putExtra(Intent.EXTRA_TEXT, texto);
        try {
            startActivity(Intent.createChooser(send, "Enviar formato"));
        } catch (Exception e) {
            App.logError(e);
            Fmt.toast(this, "No hay aplicación para enviar: " + App.crashMsg(e));
        }
    }

    private void imprimir() {
        if (texto.length() == 0) {
            Fmt.toast(this, "Aún no se ha generado el formato");
            return;
        }
        try {
            PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
            PrintDocumentAdapter adapter = new PrintDocumentAdapter() {
                @Override
                public void onLayout(PrintAttributes oldAttrs, PrintAttributes newAttrs,
                                     CancellationSignal cancellationSignal, LayoutResultCallback callback, Bundle extras) {
                    attrs = newAttrs;
                    PrintDocumentInfo info = new PrintDocumentInfo.Builder("formato_ti_f016")
                            .setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT)
                            .setPageCount(1)
                            .build();
                    callback.onLayoutFinished(info, true);
                }

                @Override
                public void onWrite(PageRange[] pages, ParcelFileDescriptor destination,
                                    CancellationSignal cancellationSignal, WriteResultCallback callback) {
                    int w = 595, h = 842;
                    if (attrs != null && attrs.getMediaSize() != null) {
                        PrintAttributes.MediaSize ms = attrs.getMediaSize();
                        w = Math.round(ms.getWidthMils() * 72f / 1000f);
                        h = Math.round(ms.getHeightMils() * 72f / 1000f);
                    }
                    PdfDocument pdf = new PdfDocument();
                    PdfDocument.PageInfo info = new PdfDocument.PageInfo.Builder(w, h, 1).create();
                    PdfDocument.Page page = pdf.startPage(info);
                    drawText(page.getCanvas(), w, h);
                    pdf.finishPage(page);
                    try {
                        FileOutputStream fos = new FileOutputStream(destination.getFileDescriptor());
                        pdf.writeTo(fos);
                        fos.flush();
                    } catch (Exception e) {
                        App.logError(e);
                    }
                    pdf.close();
                    callback.onWriteFinished(new PageRange[]{PageRange.ALL_PAGES});
                }
            };
            PrintAttributes a = new PrintAttributes.Builder()
                    .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                    .setResolution(new PrintAttributes.Resolution("print", "print", 300, 300))
                    .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                    .build();
            pm.print("Formato TI-F016", adapter, a);
        } catch (Exception e) {
            App.logError(e);
            Fmt.toast(this, "No se pudo imprimir: " + App.crashMsg(e));
        }
    }

    private void drawText(Canvas canvas, int pageW, int pageH) {
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(Color.BLACK);
        paint.setTextSize(13f);
        int margin = 40;
        int x = margin;
        int y = margin;
        int maxW = pageW - margin * 2;
        float lineH = paint.getFontSpacing();
        for (String line : texto.split("\n")) {
            if (y > pageH - margin) break;
            if (line.trim().length() == 0) {
                y += lineH;
                continue;
            }
            if (paint.measureText(line) <= maxW) {
                canvas.drawText(line, x, y, paint);
                y += lineH;
                continue;
            }
            String[] words = line.split(" ");
            StringBuilder cur = new StringBuilder();
            for (String w : words) {
                String test = cur.length() == 0 ? w : cur.toString() + " " + w;
                if (paint.measureText(test) > maxW && cur.length() > 0) {
                    canvas.drawText(cur.toString(), x, y, paint);
                    y += lineH;
                    cur.setLength(0);
                }
                cur.append(cur.length() == 0 ? w : " " + w);
            }
            if (cur.length() > 0) {
                canvas.drawText(cur.toString(), x, y, paint);
                y += lineH;
            }
        }
    }
}
