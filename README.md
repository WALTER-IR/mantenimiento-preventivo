# Mantenimiento Preventivo

Aplicación web (PWA) para el control de mantenimientos preventivos de laptops y computadoras.

- Funciona sin conexión (offline)
- Se actualiza automáticamente por internet
- Tema visual rojo
- Datos guardados en el dispositivo (IndexedDB)

## Versión actual: 1.8.0

- **Filtros de búsqueda en el APK**: la pestaña Mantenimiento ahora tiene buscador de texto, filtro por estado (Pendiente / En proceso / Realizado) y filtro por rango de fechas (desde/hasta).
- **Pestaña "Mantenimiento" en el APK**: la app Android ahora tiene la opción Mantenimiento en la barra inferior, con la lista de todos los mantenimientos (solo los visibles para tu usuario), búsqueda y botón "+ Nuevo".
- **Salir visible para todos**: el botón "Salir" aparece en la barra superior para cualquier usuario, no solo administrador.
- **Tarjeta de Responsables en el panel**: el panel de control muestra la cantidad de responsables, visible para todos los usuarios.
- **Filtros en el historial de mantenimientos**: rango de fechas (desde/hasta) y filtro por estado (Programado, Reprogramado, Finalizado), combinables con los filtros de equipo y tipo.
- **Panel de avance del mantenimiento**: contadores de mantenimientos Programados, Reprogramados y Finalizados en el inicio.
- **Estado en los mantenimientos**: cada registro indica si quedó Programado, Reprogramado o Finalizado (finalizado por defecto).
- **Visibilidad por usuario**: cada usuario con permiso de Lectura o Edición solo ve los registros asignados a él (equipos, mantenimientos y alertas). El administrador ve todo.
- **Eliminada la sincronización con servidores externos** (APK y web ya no dependen de un servicio de internet).
- **Tema visual rojo** en toda la aplicación.
- **Credenciales de administrador restablecidas**: usuario `admin` / contraseña `admin` (al actualizar a esta versión).
- **Login obligatorio** con permisos: Lectura / Edición / Administrador.
- **Configuración solo administrador** (empresa, respaldo, actualizaciones).
- **Usuarios y permisos**: agregar/editar responsables y cambiar permisos.
- **Auditoría** de las últimas acciones (inicios de sesión, altas, bajas, cambios de permiso).

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
