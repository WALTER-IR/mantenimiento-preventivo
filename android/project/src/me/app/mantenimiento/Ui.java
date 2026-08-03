package me.app.mantenimiento;

import android.app.Activity;
import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.util.TypedValue;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ListView;
import android.widget.SimpleAdapter;
import android.widget.TextView;

import java.util.List;
import java.util.Map;

public final class Ui {

    public static final int PURPLE = 0xFF7C3AED;
    public static final int PURPLE_DARK = 0xFF6D28D9;
    public static final int TEXT = 0xFF1E293B;
    public static final int MUT = 0xFF64748B;
    public static final int BG = 0xFFF8FAFC;
    public static final int CARD = 0xFFFFFFFF;
    public static final int OK = 0xFF16A34A;
    public static final int WARN = 0xFFD97706;
    public static final int BAD = 0xFFDC2626;

    private Ui() {
    }

    public static void ajustarNav(Activity a) {
        View tab = a.findViewById(R.id.navConfig);
        if (tab != null) tab.setVisibility(Db.esAdmin() ? View.VISIBLE : View.GONE);
    }

    public static TextView title(ViewGroup parent) {
        TextView t = new TextView(parent.getContext());
        t.setTextColor(TEXT);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        t.setTypeface(null, Typeface.BOLD);
        t.setPadding(dp(parent.getContext(), 16), dp(parent.getContext(), 18),
                dp(parent.getContext(), 16), dp(parent.getContext(), 6));
        return t;
    }

    public static TextView section(Context ctx, String label) {
        TextView t = new TextView(ctx);
        t.setText(label.toUpperCase());
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        t.setTextColor(Ui.PURPLE);
        t.setTypeface(null, Typeface.BOLD);
        t.setPadding(dp(ctx, 16), dp(ctx, 8), dp(ctx, 16), dp(ctx, 4));
        return t;
    }

    public static View spacer(Context ctx, int px) {
        View v = new View(ctx);
        v.setLayoutParams(new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, px));
        return v;
    }

    public static void setBg(View v, int color, int radiusDp) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(color);
        g.setCornerRadius(dp(v.getContext(), radiusDp));
        v.setBackgroundDrawable(g);
    }

    public static void setTint(View v, int color) {
        v.setBackgroundTintList(ColorStateList.valueOf(color));
    }

    public static int dp(Context c, int v) {
        return (int) (v * c.getResources().getDisplayMetrics().density);
    }

    public static void feed(ListView lv, List<? extends Map<String, ?>> data, String[] from, int[] to) {
        SimpleAdapter a = new SimpleAdapter(lv.getContext(), data, android.R.layout.simple_list_item_2, from, to);
        lv.setAdapter(a);
    }
}
