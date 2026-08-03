# ============================================================
#  Build del APK "Mantenimiento Preventivo" NATIVO (sin Gradle)
#  Compila todo src/, empaqueta clases.dex, firma.
# ============================================================
$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"

$root   = "C:\mantenimiento-pwa"
$proj   = "$root\android\project"
$sdk    = "$root\android\sdk"
$bt     = "$sdk\android-15"          # build-tools 35.0.0
$plat   = "$sdk\android-35\android.jar"
$out    = "$root\android\out"
$build  = "$root\android\build"

# JDK 8 para compilar (javac), JDK 17 para d8 / apksigner (build-tools 35)
$javac8 = "C:\Program Files\Eclipse Foundation\jdk-8.0.302.8-hotspot\bin\javac.exe"
$jdk17  = "$sdk\jdk\jdk-17.0.20+8"
$env:JAVA_HOME = $jdk17
$env:Path = "$jdk17\bin;$env:Path"

New-Item -ItemType Directory -Force -Path $out, $build | Out-Null

Write-Host "== 1/5 Recursos (aapt2 compile + link) =="
& "$bt\aapt2.exe" compile --dir "$proj\res" -o "$build\compiled_res.zip"
if ($LASTEXITCODE -ne 0) { throw "aapt2 compile fallo" }

Remove-Item "$build\gen" -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path "$build\gen" | Out-Null

& "$bt\aapt2.exe" link -o "$build\base.apk" -I $plat --manifest "$proj\AndroidManifest.xml" --java "$build\gen" "$build\compiled_res.zip" --auto-add-overlay
if ($LASTEXITCODE -ne 0) { throw "aapt2 link fallo" }

Write-Host "== 2/5 Java (javac) =="
Remove-Item "$build\classes" -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path "$build\classes" | Out-Null
$srcFiles = Get-ChildItem "$proj\src" -Recurse -Filter *.java | ForEach-Object { $_.FullName }
$genFiles = Get-ChildItem "$build\gen" -Recurse -Filter *.java | ForEach-Object { $_.FullName }
$allFiles = @($srcFiles) + @($genFiles)
if (-not $allFiles) { throw "No hay archivos .java" }
& $javac8 -source 8 -target 8 -encoding UTF-8 -bootclasspath $plat -classpath $plat -d "$build\classes" $allFiles 2>&1 | ForEach-Object { $_.ToString() }
if ($LASTEXITCODE -ne 0) { throw "javac fallo" }

Write-Host "== 3/5 Dex (d8) =="
Remove-Item "$build\dex" -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path "$build\dex" | Out-Null
$jarFile = "$build\classes.jar"
Remove-Item $jarFile -Force -ErrorAction SilentlyContinue
& "$jdk17\bin\jar.exe" cf $jarFile -C "$build\classes" .
if ($LASTEXITCODE -ne 0) { throw "jar fallo" }
& "$bt\d8.bat" --release --lib $plat --min-api 24 --output "$build\dex" $jarFile
if ($LASTEXITCODE -ne 0) { throw "d8 fallo" }

Write-Host "== 4/5 Empaquetar dex en base.apk =="
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open("$build\base.apk", [System.IO.Compression.ZipArchiveMode]::Update)
$entry = $zip.CreateEntry("classes.dex", [System.IO.Compression.CompressionLevel]::Optimal)
$es = $entry.Open()
$fs = [System.IO.File]::OpenRead("$build\dex\classes.dex")
$fs.CopyTo($es)
$es.Dispose(); $fs.Dispose()
$zip.Dispose()

Write-Host "== 5/5 zipalign + firmar =="
& "$bt\zipalign.exe" -f 4 "$build\base.apk" "$out\aligned.apk"
if ($LASTEXITCODE -ne 0) { throw "zipalign fallo" }

$ks = "$root\android\mantenimiento.keystore"
if (-not (Test-Path $ks)) {
  & keytool -genkeypair -v -keystore $ks -alias mantenimiento -keyalg RSA -keysize 2048 -validity 10950 `
    -storepass mantenimiento2026 -keypass mantenimiento2026 `
    -dname "CN=Mantenimiento Preventivo, OU=IT, O=Empresa, L=Ciudad, ST=Estado, C=MX"
  if ($LASTEXITCODE -ne 0) { throw "keytool fallo" }
}
& "$bt\apksigner.bat" sign --ks $ks --ks-key-alias mantenimiento --ks-pass pass:mantenimiento2026 `
  --key-pass pass:mantenimiento2026 --out "$root\android\MantenimientoPreventivo.apk" "$out\aligned.apk"
if ($LASTEXITCODE -ne 0) { throw "apksigner fallo" }

& "$bt\apksigner.bat" verify "$root\android\MantenimientoPreventivo.apk"
if ($LASTEXITCODE -ne 0) { throw "verificacion fallo" }

$f = Get-Item "$root\android\MantenimientoPreventivo.apk"
Write-Host ""
Write-Host "==========================================="
Write-Host " APK LISTO: $($f.FullName)"
Write-Host " Tamaño: $([math]::Round($f.Length/1KB,0)) KB"
Write-Host "==========================================="
