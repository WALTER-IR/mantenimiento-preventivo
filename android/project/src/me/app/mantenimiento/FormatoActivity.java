package me.app.mantenimiento;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.pdf.PdfDocument;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.Environment;
import android.os.ParcelFileDescriptor;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintDocumentInfo;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.view.View;
import android.widget.TextView;

import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.util.ArrayList;
import java.util.Locale;

public class FormatoActivity extends Activity implements View.OnClickListener {

    private long equipoId = 0;
    private String texto = "";
    private int loadSeq = 0;
    private PrintAttributes attrs;
    private String logoBase64 = "";
    private android.widget.ImageView imgLogoPreview;
    private android.widget.Button btnClearLogoAPK;
    private android.widget.Button btnEnviar;
    private android.widget.Button btnPdf;
    private java.io.File pdfFile = null;
    private static final int REQ_LOGO = 99;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Db.init(this);
        setContentView(R.layout.activity_formato);

        Bundle b = getIntent().getExtras();
        if (b != null) equipoId = b.getLong("equipoId", 0);
        App.logMessage("Formato equipo id=" + equipoId + " onCreate");
        btnEnviar = (android.widget.Button) findViewById(R.id.btnEnviarFormato);
        btnEnviar.setOnClickListener(this);
        btnEnviar.setEnabled(false); // Se habilita al generar el PDF.
        btnEnviar.setTextColor(0xFF9CA3AF);
        Ui.setBg(btnEnviar, 0xFFE2E8F0, 10);
        btnPdf = (android.widget.Button) findViewById(R.id.btnPdfFormato);
        btnPdf.setOnClickListener(this);
        findViewById(R.id.btnImprimirFormato).setOnClickListener(this);

        // Logo
        imgLogoPreview = findViewById(R.id.imgLogoPreview);
        btnClearLogoAPK = findViewById(R.id.btnClearLogoAPK);
        findViewById(R.id.btnSelectLogo).setOnClickListener(this);
        btnClearLogoAPK.setOnClickListener(this);
        logoBase64 = loadLogo();
        if (logoBase64.length() > 0) showLogoPreview(logoBase64);
    }

    private String loadLogo() {
        try { return Db.prefs(this).getString("formato_logo", ""); }
        catch (Exception e) { return ""; }
    }
    private void saveLogo(String b64) {
        Db.prefs(this).edit().putString("formato_logo", b64).apply();
    }
    private void showLogoPreview(String b64) {
        try {
            byte[] bytes = android.util.Base64.decode(b64, android.util.Base64.DEFAULT);
            android.graphics.Bitmap bmp = android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
            imgLogoPreview.setImageBitmap(bmp);
            imgLogoPreview.setVisibility(android.view.View.VISIBLE);
            btnClearLogoAPK.setVisibility(android.view.View.VISIBLE);
        } catch (Exception e) { imgLogoPreview.setVisibility(android.view.View.GONE); }
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
        if (ultimo != null && ultimo.actividades.trim().length() > 0) {
            for (String a : ultimo.actividades.split("\\|")) {
                String s = a.trim();
                if (s.length() == 0) continue;
                if (Db.esHardware(s)) hard.add(s);
                else soft.add(s);
            }
        }
        String obsText = (ultimo != null) ? ultimo.observaciones.trim() : "";

        StringBuilder sb = new StringBuilder();
        sb.append("Estimado colaborador, En cumplimiento con el Sistema de Gesti\u00f3n de Calidad (SGC), adjuntamos el Formato de Mantenimiento a equipos de computo para su revisi\u00f3n y conformidad. TI-F016\n\n");
        sb.append("FORMATO DE MANTENIMIENTO\n");
        sb.append("C\u00f3digo: TI-F016 /Versi\u00f3n: 04 /Fecha de Aprobaci\u00f3n: 22/09/2025\n\n");
        linea(sb, "NOMBRES:", e.usuarioAsignado);
        linea(sb, "ÁREA:", e.area);
        linea(sb, "CARGO:", e.cargo);
        linea(sb, "DNI:", e.dni);
        linea(sb, "UNIDAD DE PRODUCCIÓN:", e.ubicacion);
        linea(sb, "SERIE/CI:", e.serie.length() > 0 ? e.serie + (e.codInventario.length() > 0 ? " - " + e.codInventario : "") : "");
        sb.append("\n");
        linea(sb, "RESPONSABLE DE TI:", Db.getSesionNombre());
        linea(sb, "FECHA DE MANTENIMIENTO:", fechaMant);
        sb.append("\nACTIVIDADES REALIZADAS:\n");
        sb.append("A continuaci\u00f3n, se detallan los mantenimientos:\n\n");
        sb.append("Mantenimiento de Software\n");
        if (soft.isEmpty()) sb.append("—\n");
        else for (String s : soft) sb.append("• ").append(s).append("\n");
        sb.append("\nMantenimiento de Hardware\n");
        if (hard.isEmpty()) sb.append("—\n");
        else for (String s : hard) sb.append("• ").append(s).append("\n");
        sb.append("\nObservaciones:\n");
        sb.append(obsText.length() > 0 ? obsText : "");
        sb.append("\n\nMediante el presente correo se deja constancia de su aprobaci\u00f3n del formato.\n");
        sb.append("Agradecemos su colaboraci\u00f3n.\n");
        sb.append("Saludos cordiales.");
        return sb.toString().trim();
    }

    private void linea(StringBuilder sb, String label, String value) {
        sb.append(label).append(" ").append((value == null || value.length() == 0) ? "" : value.trim()).append("\n");
    }

    @Override
    public void onClick(View v) {
        int id = v.getId();
        if (id == R.id.btnEnviarFormato) {
            enviar();
        } else if (id == R.id.btnPdfFormato) {
            generarPDF();
        } else if (id == R.id.btnImprimirFormato) {
            imprimir();
        } else if (id == R.id.btnSelectLogo) {
            Intent pick = new Intent(Intent.ACTION_PICK);
            pick.setType("image/*");
            try { startActivityForResult(pick, REQ_LOGO); }
            catch (Exception e) { Fmt.toast(this, "No hay galería disponible"); }
        } else if (id == R.id.btnClearLogoAPK) {
            logoBase64 = "";
            saveLogo("");
            imgLogoPreview.setVisibility(android.view.View.GONE);
            btnClearLogoAPK.setVisibility(android.view.View.GONE);
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_LOGO && resultCode == RESULT_OK && data != null) {
            try {
                android.net.Uri uri = data.getData();
                java.io.InputStream is = getContentResolver().openInputStream(uri);
                byte[] bytes = new byte[is.available()];
                is.read(bytes);
                is.close();
                // Resize to 200x200
                android.graphics.BitmapFactory.Options opts = new android.graphics.BitmapFactory.Options();
                opts.inSampleSize = Math.max(1, Math.max(bytes.length / 50000, 1));
                android.graphics.Bitmap bmp = android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.length, opts);
                android.graphics.Bitmap scaled = android.graphics.Bitmap.createScaledBitmap(bmp, 200, 200, true);
                java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
                scaled.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, bos);
                logoBase64 = android.util.Base64.encodeToString(bos.toByteArray(), android.util.Base64.DEFAULT);
                saveLogo(logoBase64);
                showLogoPreview(logoBase64);
                Fmt.toast(this, "Logo guardado");
            } catch (Exception e) {
                Fmt.toast(this, "Error al cargar imagen: " + App.crashMsg(e));
            }
        }
    }

    private void enviar() {
        if (pdfFile == null) {
            Fmt.toast(this, "Primero genera el PDF para poder enviar");
            return;
        }
        if (texto.length() == 0) {
            Fmt.toast(this, "Aún no se ha generado el formato");
            return;
        }
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType("application/pdf");
        send.putExtra(Intent.EXTRA_SUBJECT, "Formato de mantenimiento TI-F016");
        send.putExtra(Intent.EXTRA_TEXT, texto);
        send.putExtra(Intent.EXTRA_STREAM, FileProviderCompat.uriFor(pdfFile));
        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            startActivity(Intent.createChooser(send, "Enviar formato"));
        } catch (Exception e) {
            App.logError(e);
            Fmt.toast(this, "No hay aplicaci\u00f3n para enviar: " + App.crashMsg(e));
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

    private void generarPDF() {
        if (texto.length() == 0) {
            Fmt.toast(this, "A\u00fan no se ha generado el formato");
            return;
        }
        try {
            Equipo e = Db.getEquipo(equipoId);
            String nombre = "Formato_TI-F016_" + equipoId + ".pdf";
            java.io.File temp = new java.io.File(getCacheDir(), nombre);

            PdfDocument pdf = new PdfDocument();
            int w = 595, h = 842;
            PdfDocument.PageInfo info = new PdfDocument.PageInfo.Builder(w, h, 1).create();
            PdfDocument.Page page = pdf.startPage(info);
            Canvas canvas = page.getCanvas();

            Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
            paint.setColor(Color.BLACK);
            paint.setTextSize(11f);
            float lineH = paint.getFontSpacing();
            int margin = 30;
            int x0 = margin;
            int contentW = w - margin * 2;
            int y = margin;

            // ======== ENCABEZADO CORPORATIVO ========
            int hdrH = 60;
            Paint fillWhite = new Paint(); fillWhite.setColor(Color.WHITE); fillWhite.setStyle(Paint.Style.FILL);
            canvas.drawRect(x0, y, x0 + contentW, y + hdrH, fillWhite);
            Paint border = new Paint(); border.setColor(Color.DKGRAY); border.setStyle(Paint.Style.STROKE); border.setStrokeWidth(1f);
            canvas.drawRect(x0, y, x0 + contentW, y + hdrH, border);
            // Columnas: 1=logo(18%), 2=titulo(38%), 3=codigo(18%), 4=fecha+CC(26%)
            float c1 = contentW * 0.18f, c2 = contentW * 0.38f, c3 = contentW * 0.18f, c4 = contentW * 0.26f;
            canvas.drawLine(x0 + c1, y, x0 + c1, y + hdrH, border);
            canvas.drawLine(x0 + c1 + c2, y, x0 + c1 + c2, y + hdrH, border);
            canvas.drawLine(x0 + c1 + c2 + c3, y, x0 + c1 + c2 + c3, y + hdrH, border);

            // Col 1: Logo al 90% de la celda (ancho y alto), centrado
            float logoCx = x0 + c1 / 2;
            float logoW = (c1 - 4) * 0.9f; // 90% del ancho de la celda
            float logoH = (hdrH - 4) * 0.9f; // 90% de la altura de la celda
            float logoX = x0 + (c1 - logoW) / 2;
            float logoY = y + (hdrH - logoH) / 2;
            if (logoBase64.length() > 0) {
                try {
                    byte[] bytes = android.util.Base64.decode(logoBase64, android.util.Base64.DEFAULT);
                    android.graphics.Bitmap bmp = android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                    if (bmp != null) {
                        android.graphics.Bitmap scaled = android.graphics.Bitmap.createScaledBitmap(bmp, (int) logoW, (int) logoH, true);
                        canvas.drawBitmap(scaled, logoX, logoY, null);
                    }
                } catch (Exception ex) { /* placeholder */ }
            } else {
                Paint logoPaint = new Paint(Paint.ANTI_ALIAS_FLAG); logoPaint.setStyle(Paint.Style.FILL);
                float logoR = Math.min(logoW, logoH) / 2;
                logoPaint.setColor(Color.rgb(220, 60, 60));
                canvas.drawCircle(logoCx, y + hdrH / 2, logoR, logoPaint);
                logoPaint.setColor(Color.rgb(240, 140, 40));
                canvas.drawCircle(logoCx + logoR * 0.5f, y + hdrH / 2, logoR, logoPaint);
                logoPaint.setColor(Color.rgb(60, 100, 200));
                canvas.drawCircle(logoCx - logoR * 0.5f, y + hdrH / 2, logoR, logoPaint);
            }

            // Col 2: Titulo centrado SOLO en su celda (sin desbordar a col 3)
            paint.setStyle(Paint.Style.FILL); paint.setColor(Color.BLACK);
            paint.setTypeface(android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD));
            String titulo = "FORMATO DE MANTENIMIENTO";
            float cell2W = c2 - 8; // margen interno para no tocar bordes
            float cell2X = x0 + c1; // inicio de columna 2
            // Calcular tamaño de fuente que quepa en la celda
            float fontSize = 12f;
            paint.setTextSize(fontSize);
            float textW = paint.measureText(titulo);
            if (textW > cell2W) {
                fontSize = fontSize * (cell2W / textW);
                paint.setTextSize(fontSize);
                textW = paint.measureText(titulo);
            }
            // Centrar dentro de la columna 2
            float titleX = cell2X + (c2 - textW) / 2;
            canvas.drawText(titulo, titleX, y + hdrH / 2 + 4, paint);

            // Col 3: 2 lineas (Codigo en negrita + TI-F016 en misma linea, interlineado reducido)
            paint.setStyle(Paint.Style.FILL); paint.setColor(Color.BLACK); paint.setTextSize(8.5f);
            float l3 = hdrH / 4f;
            // Solo "Codigo:" en negrita, "TI-F016" en normal - misma linea
            String codigoLabel = "C\u00f3digo:";
            String codigoVal = "TI-F016";
            float labelW = paint.measureText(codigoLabel);
            paint.setTypeface(android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD));
            canvas.drawText(codigoLabel, (float)(x0 + c1 + c2 + 3), y + l3, paint);
            paint.setTypeface(null);
            canvas.drawText(codigoVal, (float)(x0 + c1 + c2 + 3 + labelW + 2), y + l3, paint);
            // Segunda linea
            canvas.drawText("Versi\u00f3n: 02", (float)(x0 + c1 + c2 + 3), y + l3 * 2, paint);

            // Col 4: 4 lineas de texto (solo Fecha, Nº y CC en negrita)
            float c4x = x0 + c1 + c2 + c3;
            paint.setStyle(Paint.Style.FILL); paint.setColor(Color.BLACK); paint.setTextSize(7.5f); paint.setTypeface(null);
            float l4 = hdrH / 5f;
            paint.setTypeface(android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD));
            canvas.drawText("Fecha de Aprobaci\u00f3n:", c4x + 2f, y + l4, paint);
            canvas.drawText("01/03/2023", c4x + 2f, y + l4 * 2, paint);
            canvas.drawText("N\u00ba", c4x + 2f, y + l4 * 3, paint);
            canvas.drawText("CC:", c4x + 2f, y + l4 * 4, paint);
            y += hdrH + 5;

            // 2 saltos de linea despues de la cabecera
            y += lineH * 2;

            // ======== TABLA DE DATOS ========
            ArrayList<Mantenimiento> mants = Db.allMants(equipoId);
            Mantenimiento ult = mants == null || mants.isEmpty() ? null : mants.get(0);
            String fechaMant = Fmt.today();
            if (ult != null) {
                if (ult.fechaReal.length() > 0) fechaMant = ult.fechaReal;
                else if (ult.fechaReprogramada.length() > 0) fechaMant = ult.fechaReprogramada;
                else if (ult.fechaProgramada.length() > 0) fechaMant = ult.fechaProgramada;
            }
            String[][] fields = {
                {"APELLIDOS Y NOMBRES:", e.usuarioAsignado != null && e.usuarioAsignado.length() > 0 ? e.usuarioAsignado : "-"},
                {"DNI:", e.dni != null && e.dni.length() > 0 ? e.dni : "-"},
                {"CARGO:", e.cargo != null && e.cargo.length() > 0 ? e.cargo : "-"},
                {"\u00c1REA:", e.area != null && e.area.length() > 0 ? e.area : "-"},
                {"FECHA DE MANTENIMIENTO:", fechaMant},
                {"SERIE/CI:", (e.serie + (e.codInventario.length() > 0 ? " - " + e.codInventario : "")).trim()},
                {"UNIDAD DE PRODUCCI\u00d3N:", e.ubicacion != null && e.ubicacion.length() > 0 ? e.ubicacion : "-"},
                {"RESPONSABLE DE TI:", Db.getSesionNombre()},
            };
            int rowH = 20;
            int tblH = fields.length * rowH;
            canvas.drawRect(x0, y, x0 + contentW, y + tblH, fillWhite);
            border.setColor(Color.DKGRAY); border.setStrokeWidth(1.5f);
            canvas.drawRect(x0, y, x0 + contentW, y + tblH, border);
            float col1W = contentW * 0.42f;
            canvas.drawLine(x0 + col1W, y, x0 + col1W, y + tblH, border);
            border.setStrokeWidth(0.8f);
            for (int i = 0; i < fields.length; i++) {
                float ry = y + i * rowH;
                if (i > 0) canvas.drawLine(x0, ry, x0 + contentW, ry, border);
                paint.setStyle(Paint.Style.FILL); paint.setColor(Color.BLACK); paint.setTextSize(9f);
                paint.setTypeface(android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD));
                canvas.drawText(fields[i][0], x0 + 5, ry + 14, paint);
                paint.setTypeface(null);
                canvas.drawText(fields[i][1], x0 + col1W + 5, ry + 14, paint);
            }
            y += tblH + 8;

            // 3 saltos de linea despues de la tabla
            y += lineH * 3;

            // ======== ACTIVIDADES REALIZADAS ========
            y += lineH * 2; // 2 saltos de linea antes
            paint.setStyle(Paint.Style.FILL); paint.setColor(Color.BLACK); paint.setTextSize(12f);
            paint.setTypeface(android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD));
            canvas.drawText("Actividades Realizadas:", x0, y, paint); y += lineH + 2;
            paint.setTypeface(null); paint.setTextSize(9f);
            canvas.drawText("A continuaci\u00f3n, se detallan los mantenimientos:", x0, y, paint); y += lineH + 2;

            java.util.ArrayList<String> soft = new java.util.ArrayList<>();
            java.util.ArrayList<String> hardL = new java.util.ArrayList<>();
            if (ult != null && ult.actividades.trim().length() > 0) {
                for (String a : ult.actividades.split("\\|")) {
                    String s = a.trim();
                    if (s.length() == 0) continue;
                    if (Db.esHardware(s)) hardL.add(s); else soft.add(s);
                }
            }
            y = printSectionAPK(canvas, paint, x0, y, contentW, lineH, h, margin, "Mantenimiento de Software", soft, pdf, page, info);
            y = printSectionAPK(canvas, paint, x0, y, contentW, lineH, h, margin, "Mantenimiento de Hardware", hardL, pdf, page, info);

            // Texto aceptacion alineado como formato APA (justificado, sin desbordar)
            paint.setStyle(Paint.Style.FILL); paint.setColor(Color.DKGRAY); paint.setTextSize(10f);
            paint.setTypeface(android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD));
            String textoAceptacion = "La aceptaci\u00f3n de esta acta se formaliza mediante la firma ya sea digital o f\u00edsica., o a trav\u00e9s de la confirmaci\u00f3n del usuario por medio del correo de texto";
            // Dividir texto en lineas que quepan en el ancho de la pagina
            float maxTextW = contentW - 10; // margen APA
            java.util.ArrayList<String> lineasAceptacion = wrapTextAPK(paint, textoAceptacion, maxTextW);
            float yAcept = h - margin - (lineasAceptacion.size() * (paint.getFontSpacing() + 2));
            if (yAcept < y) yAcept = y + lineH; // no sobreponerse al contenido
            for (String linea : lineasAceptacion) {
                canvas.drawText(linea, x0, yAcept, paint);
                yAcept += paint.getFontSpacing() + 2;
            }

            pdf.finishPage(page);
            try (FileOutputStream fos = new FileOutputStream(temp)) {
                pdf.writeTo(fos);
                fos.flush();
            }
            pdf.close();

            // El PDF se genera de forma interna (caché) sin salir de la aplicación.
            pdfFile = temp;
            // Habilitar Enviar (verde) y deshabilitar el botón PDF.
            btnEnviar.setEnabled(true);
            btnEnviar.setTextColor(0xFFFFFFFF);
            Ui.setBg(btnEnviar, Ui.OK, 10);
            btnPdf.setEnabled(false);
            btnPdf.setTextColor(0xFF9CA3AF);
            Ui.setBg(btnPdf, 0xFFE2E8F0, 10);
            Fmt.toast(this, "PDF generado: " + nombre);
        } catch (Exception ex) {
            App.logError(ex);
            Fmt.toast(this, "No se pudo generar el PDF: " + App.crashMsg(ex));
        }
    }

    private int printSectionAPK(Canvas canvas, Paint paint, int x0, int y, int contentW, float lineH, int h, int margin,
                                String title, java.util.List<String> arr, PdfDocument pdf, PdfDocument.Page page,
                                PdfDocument.PageInfo info) {
        y += lineH; // 1 salto de linea antes de cada seccion
        if (y + 15 > h - margin) {
            pdf.finishPage(page);
            PdfDocument.PageInfo ni = new PdfDocument.PageInfo.Builder(595, 842, pdf.getPages().size() + 1).create();
            page = pdf.startPage(ni);
            canvas = page.getCanvas();
            y = margin;
        }
        // Sin fondo - solo texto en negrita
        paint.setStyle(Paint.Style.FILL); paint.setColor(Color.BLACK); paint.setTextSize(9f);
        paint.setTypeface(android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD));
        canvas.drawText(title, x0 + 3, y + 1, paint);
        y += lineH + 2;
        paint.setTypeface(null);
        if (arr == null || arr.isEmpty()) {
            canvas.drawText("-", x0 + 8, y, paint); y += lineH;
        } else {
            for (String t : arr) {
                if (y + lineH > h - margin) {
                    pdf.finishPage(page);
                    PdfDocument.PageInfo ni = new PdfDocument.PageInfo.Builder(595, 842, pdf.getPages().size() + 1).create();
                    page = pdf.startPage(ni);
                    canvas = page.getCanvas();
                    y = margin;
                }
                canvas.drawText("- " + t, x0 + 8, y, paint);
                y += lineH;
            }
        }
        return y + 2;
    }

    private int drawWrappedText(Canvas canvas, Paint paint, String text, int x, int y, int maxW, float lineH, int pageH, int margin) {
        if (y + lineH > pageH - margin) return y;
        String[] words = text.split(" ");
        StringBuilder cur = new StringBuilder();
        for (String word : words) {
            String test = cur.length() == 0 ? word : cur.toString() + " " + word;
            if (paint.measureText(test) > maxW && cur.length() > 0) {
                canvas.drawText(cur.toString(), x, y, paint);
                y += lineH;
                if (y + lineH > pageH - margin) return y;
                cur.setLength(0);
            }
            cur.append(cur.length() == 0 ? word : " " + word);
        }
        if (cur.length() > 0) {
            canvas.drawText(cur.toString(), x, y, paint);
            y += lineH;
        }
        return y;
    }



    // Divide texto en lineas que quepan en el ancho maximo (formato APA)
    private java.util.ArrayList<String> wrapTextAPK(Paint paint, String text, float maxW) {
        java.util.ArrayList<String> lines = new java.util.ArrayList<>();
        String[] words = text.split(" ");
        StringBuilder cur = new StringBuilder();
        for (String word : words) {
            String test = cur.length() == 0 ? word : cur.toString() + " " + word;
            if (paint.measureText(test) > maxW && cur.length() > 0) {
                lines.add(cur.toString());
                cur.setLength(0);
            }
            cur.append(cur.length() == 0 ? word : " " + word);
        }
        if (cur.length() > 0) lines.add(cur.toString());
        return lines;
    }

    // Copia el archivo temporal a la carpeta pública Downloads (compatible API 24-35).
    private java.io.File guardarEnDownloads(String nombre, java.io.File temp) throws Exception {
        java.io.File out;
        if (android.os.Build.VERSION.SDK_INT >= 29) {
            // Android 10+: usar MediaStore para guardar en Downloads
            android.content.ContentValues values = new android.content.ContentValues();
            values.put(android.provider.MediaStore.Downloads.DISPLAY_NAME, nombre);
            values.put(android.provider.MediaStore.Downloads.MIME_TYPE, "application/pdf");
            values.put(android.provider.MediaStore.Downloads.RELATIVE_PATH, "Download");
            android.net.Uri uri = getContentResolver().insert(
                    android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri != null) {
                try (java.io.OutputStream os = getContentResolver().openOutputStream(uri)) {
                    try (java.io.FileInputStream fis = new java.io.FileInputStream(temp)) {
                        byte[] buf = new byte[8192];
                        int n;
                        while ((n = fis.read(buf)) > 0) os.write(buf, 0, n);
                    }
                }
            }
            out = new java.io.File(
                    android.os.Environment.getExternalStoragePublicDirectory(
                            android.os.Environment.DIRECTORY_DOWNLOADS), nombre);
        } else {
            // Android 7-9: guardar directo en Downloads público
            java.io.File downloads = android.os.Environment.getExternalStoragePublicDirectory(
                    android.os.Environment.DIRECTORY_DOWNLOADS);
            if (!downloads.exists()) downloads.mkdirs();
            out = new java.io.File(downloads, nombre);
            try (java.io.FileOutputStream fos = new java.io.FileOutputStream(out)) {
                try (java.io.FileInputStream fis = new java.io.FileInputStream(temp)) {
                    byte[] buf = new byte[8192];
                    int n;
                    while ((n = fis.read(buf)) > 0) fos.write(buf, 0, n);
                }
            }
        }
        return out;
    }
}
