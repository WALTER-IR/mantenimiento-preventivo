# Mantenimiento Preventivo

Aplicación web (PWA) para el control de mantenimientos preventivos de laptops y computadoras.

- Funciona sin conexión (offline)
- Solo se conecta a internet cuando usted pulsa "Buscar actualizaciones"
- Tema visual rojo
- Datos guardados en el dispositivo (IndexedDB)

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
