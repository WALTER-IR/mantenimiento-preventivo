# Mantenimiento Preventivo

Aplicación web (PWA) para el control de mantenimientos preventivos de laptops y computadoras.

- Funciona sin conexión (offline)
- Se actualiza automáticamente por internet
- Tema visual rojo
- Datos guardados en el dispositivo (IndexedDB)

## Versión actual: 1.14.1

- **Filtro de mantenimientos con fecha de hoy y estado Programado (APK 3.23.0 / PWA 1.14.1)**: el filtro de búsqueda de mantenimientos carga por defecto la fecha del día en curso en "desde" y "hasta", y el estado **Programado**. El botón "Limpiar" restaura esos valores predeterminados.
- **Configuración para todos los usuarios (APK 3.22.0 / PWA 1.14.0)**: el menú "Ajustes" ahora está disponible para todos los usuarios con las opciones Cargas masivas, Responsables, Copia de seguridad y Acerca de. Las opciones de administrador (auditoría, vaciar base de datos, empresa, permisos) solo las ve el administrador.
- **Equipos atrasados en el panel (APK 3.22.0 / PWA 1.14.0)**: el panel de control muestra la lista de equipos con mantenimiento vencido (serie, usuario asignado y días de atraso).
- **Detalle de equipo con usuario asignado (APK 3.22.0 / PWA 1.14.0)**: el detalle del equipo muestra el nombre del usuario asignado (propietario físico) de forma destacada.
- **Carga masiva de equipos corregida (APK 3.21.0)**: al importar equipos ya no se crea un usuario por cada "USUARIO ASIGNADO" distinto (eso mezclaba los datos del responsable con la serie de otro equipo). Ahora cada equipo se asigna a su **RESPONSABLE** (los 4 usuarios registrados), resuelto por la columna RESPONSABLE o DNI (que trae el nombre del responsable). El "USUARIO ASIGNADO" (propietario físico) se guarda como dato propio del equipo y se muestra en su detalle.
- **Carga masiva más robusta (APK 3.20.0)**: el lector de Excel del APK ahora tolera archivos cuyas celdas no traen la referencia de columna (A/B/C) —común en exportaciones de ERP/SAP convertidas a XLSX— y descarta filas totalmente vacías, evitando que la importación de responsables, equipos y mantenimientos registre datos desordenados o de más.
- **Nombres en el detalle de equipo (APK 3.19.0)**: en el "DETALLE DE EQUIPO" se muestra el nombre del **USUARIO ASIGNADO**, y en el "DETALLE DE RESPONSABLE" el nombre del **RESPONSABLE**.
- **Detalle de equipo (APK 3.18.0)**: la vista del equipo ahora tiene dos secciones con cabeceras "DETALLE DE EQUIPO" (datos del equipo) y "DETALLE DE RESPONSABLE" (datos del responsable). El formulario de nuevo/editar responsable muestra la sección "EQUIPOS DEL RESPONSABLE" con los equipos asignados.
- **Estados de mantenimiento unificados (APK 3.17.0)**: los estados del mantenimiento y su filtro ahora son **Programado / Reprogramado / Finalizado** (antes Pendiente / En proceso / Realizado), igual que en la PWA. Los registros antiguos se convierten automáticamente al abrir.
- **Listado de responsables al registrar un equipo**: el campo "Usuario asignado" del formulario de equipos ahora carga la lista de responsables registrados (en la PWA). El APK ya lo hacía con un selector.
- **Plantilla de carga masiva actualizada**: el formato de los equipos usa las columnas "USUARIO ASIGNADO" y "RESPONSABLE" (con DNI). Plantillas de ejemplo en la carpeta `excel_ejemplo/` del repositorio (responsables.xlsx, equipos.xlsx, mantenimientos.xlsx). En el APK, la Carga Masiva muestra las columnas esperadas de cada formato.
- **Campo "Usuario asignado" (APK 3.15.0)**: el registro de equipos y la carga masiva del APK ahora usan el término "USUARIO ASIGNADO" (antes "USUARIO/RESPONSABLE"). La importación acepta columnas "USUARIO ASIGNADO", "USUARIO" o "RESPONSABLE".
- **Lista de equipos con usuario, equipo y serie**: cada tarjeta muestra primero el usuario asignado (ej. "👤 Juan Osorio"), luego el nombre del equipo (ej. "PC") y la serie (ej. "123456").
- **Usuario asignado en la lista de equipos**: la vista de equipos muestra el nombre del usuario al que se asignó el equipo (antes solo aparecía el departamento). El campo del formulario y del detalle ahora se llama "Usuario asignado".
- **Buscar y Limpiar en el filtro de fechas**: el historial de mantenimientos (PWA y APK 3.14.0) ahora tiene botones "Buscar" y "Limpiar" para el rango de fechas.
- **Formato de mantenimiento (TI-F016)**: nuevo botón "Formato" en el detalle del equipo que genera el formato oficial de mantenimiento con los datos del equipo, responsable, tareas de software y hardware. Incluye opciones de Enviar (compartir) e Imprimir.
- **Formato en el APK (3.13.0)**: la app Android también genera el formato TI-F016 desde el detalle del equipo, con botones Enviar e Imprimir.
- **Responsables solo para administrador**: la tarjeta de Responsables del panel de control ahora solo la ve el administrador.
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

## Carga masiva (Excel)

En el APK, desde "Cargar responsables", "Cargar equipos" o "Cargar mantenimientos" se importa un archivo `.xlsx`. La primera fila debe ser la cabecera con las columnas esperadas (los nombres pueden variar ligeramente, se reconocen por coincidencia):

**Responsables:** `DNI; ZONA; RESPONSABLE; SUBDIVISION; CeCo SAP; AREA; CARGO; EMAIL`

**Equipos:** `USUARIO ASIGNADO; RESPONSABLE; DNI; HOSTNAME; DIR. IP; UBICACIÓN FISICA; EQUIPO; COD. INVENTARIO; SERIE DE EQUIPO; MARCA; MODELO; CONTRATO DE ARRENDAMIENTO; STATUS`
- El `USUARIO ASIGNADO` (o `RESPONSABLE`) indica a qué usuario se asigna el equipo. Si el usuario no existe, se crea automáticamente. Se acepta cualquiera de las dos columnas.

**Mantenimientos:** `SERIE DE EQUIPO; Prioridad; FECHA PROGRAMADA; FECHA REPROGRAMADA; FECHA REAL; ESTADO; OBSERVACIONES`

Plantillas de ejemplo con datos de prueba: carpeta `excel_ejemplo/` de este repositorio.

## Actualizaciones

Para publicar una nueva versión:

1. Edita `js/config.js` y cambia `APP_VERSION` (ej. 1.0.1).
2. Actualiza `app-version.json` con la nueva versión y el registro de cambios.
3. Sube los cambios a la rama `main` de este repositorio.
4. La app detectará la nueva versión automáticamente al abrirse.
