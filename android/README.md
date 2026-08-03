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
