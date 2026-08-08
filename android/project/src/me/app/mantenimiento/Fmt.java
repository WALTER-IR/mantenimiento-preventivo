package me.app.mantenimiento;

import android.app.DatePickerDialog;
import android.content.Context;
import android.widget.DatePicker;
import android.widget.EditText;
import android.widget.Toast;

import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;

public final class Fmt {

    public static final SimpleDateFormat FMT = new SimpleDateFormat("yyyy-MM-dd", Locale.US);

    private Fmt() {
    }

    // Convierte yyyy-MM-dd a dd/MM/yyyy para mostrar; si no es reconocible, devuelve el texto tal cual.
    public static String disp(String date) {
        if (date == null) return "";
        String t = date.trim();
        if (t.length() == 0) return "";
        if (t.matches("\\d{4}-\\d{1,2}-\\d{1,2}")) {
            String[] p = t.split("-");
            return String.format(Locale.US, "%02d/%02d/%04d",
                    Integer.parseInt(p[2]), Integer.parseInt(p[1]), Integer.parseInt(p[0]));
        }
        if (t.matches("\\d{1,2}/\\d{1,2}/\\d{4}")) return t;
        return t;
    }

    // Convierte a formato interno yyyy-MM-dd aceptando dd/MM/yyyy, d/M/yyyy o yyyy-MM-dd.
    public static String canon(String date) {
        if (date == null) return "";
        String t = date.trim();
        if (t.length() == 0) return "";
        if (t.matches("\\d{4}-\\d{1,2}-\\d{1,2}")) {
            String[] p = t.split("-");
            return String.format(Locale.US, "%04d-%02d-%02d",
                    Integer.parseInt(p[0]), Integer.parseInt(p[1]), Integer.parseInt(p[2]));
        }
        if (t.matches("\\d{1,2}/\\d{1,2}/\\d{4}")) {
            String[] p = t.split("/");
            return String.format(Locale.US, "%04d-%02d-%02d",
                    Integer.parseInt(p[2]), Integer.parseInt(p[1]), Integer.parseInt(p[0]));
        }
        return t;
    }

    public static String today() {
        return FMT.format(new Date());
    }

    public static String addDays(String date, int days) {
        try {
            Date d = FMT.parse(date);
            if (d == null) return date;
            Calendar c = Calendar.getInstance();
            c.setTime(d);
            c.add(Calendar.DAY_OF_YEAR, days);
            return FMT.format(c.getTime());
        } catch (Exception e) {
            return date;
        }
    }

    public static long toMillis(String date) {
        try {
            Date d = FMT.parse(date);
            return d == null ? 0 : d.getTime();
        } catch (ParseException e) {
            return 0;
        }
    }

    public static long daysUntil(String from, String target) {
        return (toMillis(target) - toMillis(from)) / 86400000L;
    }

    public static void toast(Context c, String msg) {
        Toast.makeText(c, msg, Toast.LENGTH_LONG).show();
    }

    public static void pickDate(final Context context, final EditText target, String initial) {
        pickDate(context, target, initial, null);
    }

    public static void pickDate(final Context context, final EditText target, String initial, final Runnable onSet) {
        Calendar c = Calendar.getInstance();
        Date d = null;
        String canon = canon(initial);
        try {
            d = canon != null && canon.length() > 0 ? FMT.parse(canon) : null;
        } catch (ParseException ignored) {
        }
        if (d != null) c.setTime(d);
        DatePickerDialog dlg = new DatePickerDialog(context,
                new DatePickerDialog.OnDateSetListener() {
                    @Override
                    public void onDateSet(DatePicker view, int year, int monthOfYear, int dayOfMonth) {
                        Calendar sel = Calendar.getInstance();
                        sel.set(year, monthOfYear, dayOfMonth);
                        target.setText(disp(FMT.format(sel.getTime())));
                        if (onSet != null) onSet.run();
                    }
                },
                c.get(Calendar.YEAR), c.get(Calendar.MONTH), c.get(Calendar.DAY_OF_MONTH));
        dlg.show();
    }
}
