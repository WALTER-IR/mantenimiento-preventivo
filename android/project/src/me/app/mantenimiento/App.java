package me.app.mantenimiento;

import android.app.Activity;
import android.app.Application;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.Looper;
import android.os.SystemClock;
import android.widget.Toast;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;
import java.io.PrintWriter;
import java.util.Date;

public class App extends Application {

    private static App instance;
    private static final Handler mainHandler = new Handler(Looper.getMainLooper());
    private static volatile long lastBeat = 0L;
    private static volatile Activity current;

    // Sincronización automática cada 10 minutos (si hay sesión y URL configurada)
    private static final long SYNC_INTERVAL_MS = 10 * 60 * 1000L;
    private Handler syncHandler;
    private HandlerThread syncThread;

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        Db.init(this);

        registerActivityLifecycleCallbacks(new ActivityLifecycleCallbacks() {
            @Override
            public void onActivityCreated(Activity a, Bundle s) {
                current = a;
            }

            @Override
            public void onActivityStarted(Activity a) {
                current = a;
            }

            @Override
            public void onActivityResumed(Activity a) {
                current = a;
            }

            @Override
            public void onActivityPaused(Activity a) {
                if (current == a) current = null;
            }

            @Override
            public void onActivityStopped(Activity a) {
                if (current == a) current = null;
            }

            @Override
            public void onActivitySaveInstanceState(Activity a, Bundle s) {
            }

            @Override
            public void onActivityDestroyed(Activity a) {
                if (current == a) current = null;
            }
        });

        mainHandler.post(beatRunnable);
        new Thread(watchdogRunnable, "watchdog").start();

        syncThread = new HandlerThread("sync");
        syncThread.start();
        syncHandler = new Handler(syncThread.getLooper());
        programarSync(30000); // primera pasada a los 30 s, luego cada 10 min

        Thread.setDefaultUncaughtExceptionHandler(new Thread.UncaughtExceptionHandler() {
            @Override
            public void uncaughtException(final Thread thread, final Throwable throwable) {
                logMessage("EXCEPCION: " + crashMsg(throwable));
                logError(throwable);
                try {
                    mainHandler.post(new Runnable() {
                        @Override
                        public void run() {
                            try {
                                Toast.makeText(App.this, "Error: " + crashMsg(throwable), Toast.LENGTH_LONG).show();
                            } catch (Throwable ignored) {
                            }
                        }
                    });
                } catch (Throwable ignored) {
                }
                if (thread == Looper.getMainLooper().getThread()) {
                    try {
                        mainHandler.post(new Runnable() {
                            @Override
                            public void run() {
                                restartApp();
                            }
                        });
                    } catch (Throwable ignored) {
                    }
                }
            }
        });
    }

    // Latido del hilo principal: si deja de actualizarse, el hilo UI está bloqueado.
    private static final Runnable beatRunnable = new Runnable() {
        @Override
        public void run() {
            lastBeat = SystemClock.uptimeMillis();
            mainHandler.postDelayed(this, 100);
        }
    };

    private static final Runnable watchdogRunnable = new Runnable() {
        @Override
        public void run() {
            boolean blocked = false;
            while (true) {
                try {
                    Thread.sleep(1000);
                } catch (InterruptedException ignored) {
                }
                if (lastBeat == 0) continue;
                long gap = SystemClock.uptimeMillis() - lastBeat;
                if (gap > 5000) {
                    if (!blocked) {
                        blocked = true;
                        logMessage("HILO PRINCIPAL BLOQUEADO ~" + (gap / 1000) + "s");
                    }
                } else if (blocked) {
                    blocked = false;
                    logMessage("HILO PRINCIPAL LIBERADO");
                }
            }
        }
    };

    // Programa la sincronización periódica en su propio hilo.
    private void programarSync(long delay) {
        syncHandler.postDelayed(new Runnable() {
            @Override
            public void run() {
                try {
                    if (Db.getSesionRol() >= 0 && Sync.enabled(instance)) {
                        Sync.sincronizar(instance);
                    }
                } catch (Throwable t) {
                    logMessage("SYNC AUTO: " + crashMsg(t));
                }
                programarSync(SYNC_INTERVAL_MS);
            }
        }, delay);
    }

    private static void restartApp() {
        try {
            Activity a = current;
            if (a != null) {
                a.finish();
                current = null;
            }
            Intent i = new Intent(instance, MainActivity.class);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            instance.startActivity(i);
        } catch (Throwable ignored) {
        }
    }

    public static String crashMsg(Throwable t) {
        if (t == null) return "desconocido";
        String m = t.getMessage();
        String cls = t.getClass().getSimpleName();
        if (m == null || m.length() == 0) return cls;
        return cls + ": " + m;
    }

    public static void logMessage(String msg) {
        try {
            if (instance == null) return;
            File dir = instance.getExternalFilesDir(null);
            if (dir == null) return;
            if (!dir.exists()) dir.mkdirs();
            File f = new File(dir, "errores.txt");
            PrintWriter pw = new PrintWriter(new FileWriter(f, true));
            pw.println("[ " + new Date() + " ] " + msg);
            pw.close();
        } catch (Throwable ignored) {
        }
    }

    public static void logError(Throwable t) {
        try {
            if (instance == null) return;
            File dir = instance.getExternalFilesDir(null);
            if (dir == null) return;
            if (!dir.exists()) dir.mkdirs();
            File f = new File(dir, "errores.txt");
            PrintWriter pw = new PrintWriter(new FileWriter(f, true));
            pw.println("=== " + new Date() + " ===");
            t.printStackTrace(pw);
            pw.println();
            pw.close();
        } catch (Throwable ignored) {
        }
    }

    public static String readLog() {
        StringBuilder sb = new StringBuilder();
        try {
            if (instance == null) return "";
            File f = new File(instance.getExternalFilesDir(null), "errores.txt");
            if (!f.exists()) return "";
            BufferedReader br = new BufferedReader(new FileReader(f));
            String line;
            while ((line = br.readLine()) != null) {
                sb.append(line).append("\n");
                if (sb.length() > 40000) break;
            }
            br.close();
        } catch (Throwable ignored) {
        }
        return sb.toString();
    }
}
