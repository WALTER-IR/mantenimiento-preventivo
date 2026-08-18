// ============================================================
//  Configuración de la aplicación
// ============================================================
//  APP_VERSION: cámbialo cuando publiques una nueva versión.
//  UPDATE_URL: URL base (HTTPS) donde está publicada esta app (GitHub Pages).
//  La app NO se actualiza automáticamente: solo contacta este servidor
//  cuando el usuario pulsa explícitamente "Buscar actualizaciones".
//  Déjala vacía "" para desactivar por completo la consulta de versiones.
// ============================================================
window.APP_CONFIG = {
  APP_VERSION: "1.24.7",
  APP_NAME: "Mantenimiento Preventivo",
  UPDATE_URL: "https://WALTER-IR.github.io/mantenimiento-preventivo/", // ej. "https://midominio.com/mantenimiento/"
  // Sincronización en la nube (Firebase Realtime Database, protegida).
  // SYNC_URL: URL de la base de datos (sin barra final). SYNC_TOKEN: ruta privada.
  // SYNC_SECRET: secreto de la base de datos (acceso exclusivo para la app).
  SYNC_URL: "https://mant-preventivo-57098-default-rtdb.europe-west1.firebasedatabase.app",
  SYNC_TOKEN: "mpsync-a7f3k9q2",
  SYNC_SECRET: "ovNrGch6NFMp1oH2rMA43uP6NSKJtDPIhK6oUmKt",
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
