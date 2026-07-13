param(
  [string]$Folder
)

$ErrorActionPreference = "Stop"

function Select-TargetFolder {
  Add-Type -AssemblyName System.Windows.Forms
  $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
  $dialog.Description = "Choose the folder containing Chinese txt files"
  $dialog.SelectedPath = (Get-Location).Path
  $dialog.ShowNewFolderButton = $false

  if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
    Write-Host "No folder selected."
    exit 0
  }

  return $dialog.SelectedPath
}

if ([string]::IsNullOrWhiteSpace($Folder)) {
  $Folder = Select-TargetFolder
}

$Folder = [System.IO.Path]::GetFullPath($Folder)
if (-not (Test-Path -LiteralPath $Folder -PathType Container)) {
  throw "Folder does not exist: $Folder"
}

$ffmpeg = Get-Command ffmpeg -ErrorAction SilentlyContinue
if (-not $ffmpeg) {
  throw "ffmpeg was not found. Please install ffmpeg or add it to PATH."
}

Add-Type -AssemblyName System.Speech
$probe = [System.Speech.Synthesis.SpeechSynthesizer]::new()
try {
  $voice = $probe.GetInstalledVoices() |
    Where-Object { $_.VoiceInfo.Culture.Name -eq "zh-CN" -or $_.VoiceInfo.Name -like "*Huihui*" } |
    Select-Object -First 1
} finally {
  $probe.Dispose()
}

if (-not $voice) {
  throw "No Chinese zh-CN speech voice was found."
}

$voiceName = $voice.VoiceInfo.Name
$txtFiles = Get-ChildItem -LiteralPath $Folder -File -Filter "*.txt" | Sort-Object Name

if (-not $txtFiles) {
  Write-Host "No txt files found in $Folder"
  exit 0
}

$created = 0
$skipped = 0

foreach ($file in $txtFiles) {
  $mp3Path = [System.IO.Path]::ChangeExtension($file.FullName, ".mp3")

  if (Test-Path -LiteralPath $mp3Path) {
    Write-Host "Skip existing: $([System.IO.Path]::GetFileName($mp3Path))"
    $skipped++
    continue
  }

  $text = (Get-Content -Raw -Encoding UTF8 -LiteralPath $file.FullName).Trim()
  if ([string]::IsNullOrWhiteSpace($text)) {
    Write-Host "Skip empty: $($file.Name)"
    $skipped++
    continue
  }

  $wavPath = Join-Path $env:TEMP "$($file.BaseName).chinese-tts.wav"
  $synth = [System.Speech.Synthesis.SpeechSynthesizer]::new()
  try {
    $synth.SelectVoice($voiceName)
    $synth.SetOutputToWaveFile($wavPath)
    $synth.Speak($text)
  } finally {
    $synth.Dispose()
  }

  & $ffmpeg.Source -hide_banner -loglevel error -y -i $wavPath -codec:a libmp3lame -q:a 3 $mp3Path
  Remove-Item -LiteralPath $wavPath -Force -ErrorAction SilentlyContinue

  Write-Host "Created: $([System.IO.Path]::GetFileName($mp3Path))"
  $created++
}

Write-Host ""
Write-Host "Done. Created $created file(s), skipped $skipped file(s)."
