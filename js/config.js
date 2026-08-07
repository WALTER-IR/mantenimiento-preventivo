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
  APP_VERSION: "1.12.0",
  APP_NAME: "Mantenimiento Preventivo",
  UPDATE_URL: "https://WALTER-IR.github.io/mantenimiento-preventivo/", // ej. "https://midominio.com/mantenimiento/"
  CHECKLIST_DEFAULT: [
    "Desfragmentación de disco duro",
    "Limpieza de temporales",
    "Liberación de espacio en el disco duro",
    "Limpieza de papelera de reciclaje",
    "Limpieza de RAM",
    "Limpieza de Disco Duro",
    "Limpieza de Placa y disipador",
    "Se añadió pasta térmica al procesador",
    "Limpieza de Fuente de poder"
  ]
};
