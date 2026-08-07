# Aplicación Android (APK)

APK nativo "Mantenimiento Preventivo" (sin Gradle), que usa SQLite local.

- Código fuente: `project/` (Java + recursos Android)
- Compilación: `scripts/build-apk.ps1`
- APK final firmado: se publica en los **Releases** de este repositorio
  (ej. `MantenimientoPreventivo.apk`, versión 3.3.0).

## Compilar

Requisitos: build-tools 35, platform android-35 y JDK 17/8 en `android\sdk\`
(no se suben al repositorio por su tamaño). Con ellos disponibles en una
máquina Windows:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-apk.ps1
```

## Versiones

- 3.3.0 (vc18): login obligatorio con roles (Lectura / Edición / Administrador),
  configuración solo administrador, cambio de permisos (pulsación larga en la lista)
  y módulo de auditoría.
- 3.18.0 (vc33): la vista de un equipo separa en dos secciones el "DETALLE DE EQUIPO"
  y el "DETALLE DE RESPONSABLE". El formulario de nuevo/editar responsable muestra la
  sección "EQUIPOS DEL RESPONSABLE" con los equipos asignados.
- 3.17.0 (vc32): estados de mantenimiento y filtro unificados a Programado /
  Reprogramado / Finalizado (antes Pendiente / En proceso / Realizado). Los
  registros antiguos se convierten automáticamente.
- 3.16.0 (vc31): el formato de carga masiva de equipos incluye las columnas
  "USUARIO ASIGNADO" y "RESPONSABLE" (con DNI). La importación acepta cualquiera
  de las dos.
- 3.15.0 (vc30): el registro de equipos y la carga masiva usan el término
  "USUARIO ASIGNADO"; la importación acepta "USUARIO ASIGNADO", "USUARIO" o
  "RESPONSABLE".
- 3.14.0 (vc29): botones "Buscar" / "Limpiar" en el filtro de fechas de
  mantenimientos (el rango ya no se aplica solo).
- 3.13.0 (vc28): formato de mantenimiento TI-F016 desde el detalle de un equipo,
  con envío y PDF (impresión).
