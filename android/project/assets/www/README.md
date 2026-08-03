# Mantenimiento Preventivo

Aplicación web (PWA) para el control de mantenimientos preventivos de laptops y computadoras.

- Funciona sin conexión (offline)
- Se actualiza automáticamente por internet
- Tema visual lila
- Datos guardados en el dispositivo (IndexedDB)

## Versión actual: 1.2.0

- **Login obligatorio** con permisos: Lectura / Edición / Administrador.
- Usuario administrador inicial: `admin` / `admin`.
- **Configuración solo administrador** (empresa, respaldo, actualizaciones).
- **Usuarios y permisos**: agregar/editar responsables y cambiar permisos.
- **Auditoría** de las últimas acciones (inicios de sesión, altas, bajas, cambios de permiso).
- **Sincronización con el APK**: URL y clave configurables desde Ajustes (solo administrador), sincronización automática cada 10 minutos y botón manual. El servidor se despliega en Render (ver `servidor/README.md`).

## Publicación

Este repositorio se publica con GitHub Pages desde la rama `main`.

URL de la aplicación: https://WALTER-IR.github.io/mantenimiento-preventivo/

## Uso

1. Abre la URL desde cualquier navegador (recomendado: Chrome o Samsung Internet en el celular).
2. En el celular, usa "Añadir a pantalla de inicio" para que se vea como una app.
3. Registra equipos, programa mantenimientos y revisa las alertas.

## Actualizaciones

Para publicar una nueva versión:

1. Edita `js/config.js` y cambia `APP_VERSION` (ej. 1.0.1).
2. Actualiza `app-version.json` con la nueva versión y el registro de cambios.
3. Sube los cambios a la rama `main` de este repositorio.
4. La app detectará la nueva versión automáticamente al abrirse.
