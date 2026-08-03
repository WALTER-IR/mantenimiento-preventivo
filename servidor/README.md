# Servidor de sincronización (Mantenimiento Preventivo)

API REST que comparte los datos entre el **APK de Android** y la **PWA web**.
Guardan el formato del APK (canónico: `usuarios`, `equipos`, `mantenimientos`);
la web traduce de/a su propio formato al sincronizar.

## Despliegue en Render

1. Entra en https://render.com y crea una cuenta (gratis) si no la tienes.
2. Conecta tu cuenta de GitHub.
3. **New → Web Service** y elige el repositorio `WALTER-IR/mantenimiento-preventivo`.
4. En *Root Directory* pon `servidor` (esta carpeta).
5. *Runtime*: **Node**.
6. *Build Command*: `npm install`
7. *Start Command*: `node index.js`
8. **Advanced** → *Environment Variables*:
   - `SYNC_TOKEN` = `mantenimiento2026` (la misma clave que usan las apps).
   - `DATABASE_URL` = opcional. Si tienes una base PostgreSQL (ej. gratis en
     Neon.tech o Supabase), pégala aquí para que los datos sean persistentes.
     Sin esta variable, el servicio guarda un archivo local que **se pierde al
     reiniciar** en el plan gratis (solo sirve para probar).
9. **Create Web Service**. Al terminar te dará una URL como
   `https://mantenimiento-sync.onrender.com`.

## Configurar las apps

- En el **APK**: Ajustes → *Sincronización* → escribe la URL del servidor
  (ej. `https://mantenimiento-sync.onrender.com`) y la clave (`mantenimiento2026`),
  pulsa *Guardar* y luego *Sincronizar ahora*.
- En la **web (PWA)**: Ajustes → *Sincronización* → misma URL y clave →
  *Guardar* → *Sincronizar ahora*.

La sincronización automática ocurre cada **10 minutos** en ambas apps; el botón
manual es solo para administradores.

## Probar en local (sin Render)

```bash
cd servidor
npm install
node index.js
```

La API quedará en `http://localhost:8080`:

- `GET /api/sync` → devuelve el snapshot guardado (header `Authorization: Bearer <clave>`).
- `POST /api/sync` con cuerpo `{ "data": { "usuarios": [], "equipos": [], "mantenimientos": [] } }` → guarda y devuelve.

## Notas

- Los datos se guardan completos y reemplazan a los locales al sincronizar
  (último que escribe, gana). El servidor solo almacena el último snapshot.
- `POST` también escribe; así, la app que tiene permiso de edición publica su
  copia y luego todas (incluida esa) descargan la versión guardada.
