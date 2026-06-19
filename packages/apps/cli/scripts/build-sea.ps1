# PowerShell script for building SEA binary on Windows
$ErrorActionPreference = "Stop"

# Get script directory and project directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $ScriptDir

Set-Location $ProjectDir

$Platform = "windows"
$Arch = if ([System.Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }
$OutputName = "lumpcode-$Platform-$Arch"
$BinDir = "bin"

Write-Host "🔨 Building SEA binary for $Platform-$Arch..." -ForegroundColor Cyan

# Generate SEA blob
Write-Host "📦 Generating SEA blob..." -ForegroundColor Yellow
node --experimental-sea-config sea-config.json

# Create bin directory
Write-Host "📋 Creating bin directory..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path $BinDir | Out-Null

# Copy node binary
Write-Host "📋 Copying Node.js binary..." -ForegroundColor Yellow
$NodePath = (Get-Command node).Source
Copy-Item $NodePath -Destination "$BinDir/$OutputName.exe"

# Inject SEA blob
Write-Host "💉 Injecting SEA blob..." -ForegroundColor Yellow
npx postject "$BinDir/$OutputName.exe" NODE_SEA_BLOB dist/sea-prep.blob `
    --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2

Write-Host "📋 Copying JSON schemas..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path "$BinDir/schemas" | Out-Null
Copy-Item -Force src/schemas/*.json "$BinDir/schemas/"

Write-Host "📋 Copying preset command modules..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path "$BinDir/presets/commands/utils" | Out-Null
Copy-Item -Force src/presets/commands/*.js "$BinDir/presets/commands/"
Copy-Item -Force src/presets/commands/utils/*.js "$BinDir/presets/commands/utils/"

Write-Host ""
Write-Host "✅ Binary created: $BinDir/$OutputName.exe" -ForegroundColor Green
Write-Host "   Run it with: .\$BinDir\$OutputName.exe" -ForegroundColor Gray

