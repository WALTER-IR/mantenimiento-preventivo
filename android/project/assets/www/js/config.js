// ============================================================
//  Configuración de la aplicación
// ============================================================
//  APP_VERSION: cámbialo cuando publiques una nueva versión para
//  que la app detecte y aplique la actualización por internet.
//  UPDATE_URL: URL base (HTTPS) donde está publicada esta app.
//  Déjala vacía "" si todavía no la publicas; la app funcionará
//  con los archivos locales y se actualizará cuando la publiques.
// ============================================================
window.APP_CONFIG = {
  APP_VERSION: "1.3.0",
  APP_NAME: "Mantenimiento Preventivo",
  UPDATE_URL: "https://WALTER-IR.github.io/mantenimiento-preventivo/", // ej. "https://midominio.com/mantenimiento/"
  // Sincronización: URL de la API compartida con el APK (vacía = deshabilitada).
  // La URL y la clave se pueden configurar desde Ajustes > Sincronización (solo admin).
  SYNC_URL: "",
  SYNC_TOKEN: "mantenimiento2026",
  SYNC_INTERVAL_MIN: 10,
  CHECKLIST_DEFAULT: [
    "Limpieza interna / externa",
    "Pasta térmica y ventilador",
    "Comprobación de disco (SMART)",
    "Eliminación de archivos temporales",
    "Actualización del sistema operativo",
    "Antivirus / malware",
    "Respaldo de datos",
    "Estado de batería",
    "Memoria RAM y almacenamiento",
    "Diagnóstico de hardware",
    "Revisión de cableado y puertos",
    "Configuración de energía"
  ]
};
