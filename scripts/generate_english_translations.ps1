param(
  [string]$Folder
)

$ErrorActionPreference = "Stop"

function Select-TargetFolder {
  Add-Type -AssemblyName System.Windows.Forms
  $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
  $dialog.Description = "Choose the folder containing Chinese _cn.txt files"
  $dialog.SelectedPath = (Get-Location).Path
  $dialog.ShowNewFolderButton = $false

  if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
    Write-Host "No folder selected."
    exit 0
  }

  return $dialog.SelectedPath
}

function Get-ManualTranslation {
  param(
    [string]$Text,
    [string]$FileName
  )

  Write-Host ""
  Write-Host "Chinese file: $FileName"
  Write-Host "Chinese text: $Text"
  return Read-Host "Type English translation"
}

function Get-OpenAiTranslation {
  param(
    [string]$Text
  )

  $apiKey = $env:OPENAI_API_KEY
  if ([string]::IsNullOrWhiteSpace($apiKey)) {
    return $null
  }

  $headers = @{
    "Authorization" = "Bearer $apiKey"
    "Content-Type" = "application/json"
  }

  $body = @{
    model = "gpt-4.1-mini"
    input = @(
      @{
        role = "system"
        content = "Translate the Chinese text into natural, concise English for a children's language-learning flashcard. Return only the English translation."
      },
      @{
        role = "user"
        content = $Text
      }
    )
  } | ConvertTo-Json -Depth 6

  try {
    $response = Invoke-RestMethod -Method Post -Uri "https://api.openai.com/v1/responses" -Headers $headers -Body $body
    $translation = $response.output_text
    if (-not [string]::IsNullOrWhiteSpace($translation)) {
      return $translation.Trim()
    }
  } catch {
    Write-Host "OpenAI translation failed: $($_.Exception.Message)"
    Write-Host "Falling back to manual input."
  }

  return $null
}

if ([string]::IsNullOrWhiteSpace($Folder)) {
  $Folder = Select-TargetFolder
}

$Folder = [System.IO.Path]::GetFullPath($Folder)
if (-not (Test-Path -LiteralPath $Folder -PathType Container)) {
  throw "Folder does not exist: $Folder"
}

$cnFiles = Get-ChildItem -LiteralPath $Folder -File -Filter "*_cn.txt" | Sort-Object Name

if (-not $cnFiles) {
  Write-Host "No _cn.txt files found in $Folder"
  exit 0
}

if ([string]::IsNullOrWhiteSpace($env:OPENAI_API_KEY)) {
  Write-Host "OPENAI_API_KEY is not set, so translations will be entered manually."
} else {
  Write-Host "OPENAI_API_KEY found. Translations will be generated automatically."
}

$created = 0
$skipped = 0

foreach ($file in $cnFiles) {
  $targetName = $file.Name -replace "_cn\.txt$", "_en.txt"
  $targetPath = Join-Path $file.DirectoryName $targetName

  if (Test-Path -LiteralPath $targetPath) {
    Write-Host "Skip existing: $targetName"
    $skipped++
    continue
  }

  $sourceText = (Get-Content -Raw -Encoding UTF8 -LiteralPath $file.FullName).Trim()
  if ([string]::IsNullOrWhiteSpace($sourceText)) {
    Write-Host "Skip empty: $($file.Name)"
    $skipped++
    continue
  }

  $translation = Get-OpenAiTranslation -Text $sourceText
  if ([string]::IsNullOrWhiteSpace($translation)) {
    $translation = Get-ManualTranslation -Text $sourceText -FileName $file.Name
  }

  if ([string]::IsNullOrWhiteSpace($translation)) {
    Write-Host "Skip blank translation: $($file.Name)"
    $skipped++
    continue
  }

  Set-Content -LiteralPath $targetPath -Value $translation.Trim() -Encoding UTF8
  Write-Host "Created: $targetName"
  $created++
}

Write-Host ""
Write-Host "Done. Created $created file(s), skipped $skipped file(s)."
