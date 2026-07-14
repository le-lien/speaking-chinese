$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$outputPath = Join-Path $root "cards-data.js"
$pattern = "^s(\d+)u(\d+)s(\d+)_(cn|en)\.txt$"
$cards = @{}

Get-ChildItem -LiteralPath $root -File -Filter "*.txt" | ForEach-Object {
  if ($_.Name -notmatch $pattern) {
    return
  }

  $seriesRaw = $Matches[1]
  $unitRaw = $Matches[2]
  $sentenceRaw = $Matches[3]
  $language = $Matches[4].ToLowerInvariant()
  $id = "s$seriesRaw" + "u$unitRaw" + "s$sentenceRaw"

  if (-not $cards.ContainsKey($id)) {
    $cards[$id] = [ordered]@{
      id = $id
      series = [int]$seriesRaw
      unit = [int]$unitRaw
      sentence = [int]$sentenceRaw
      cn = ""
      en = ""
      audio = [ordered]@{
        cn = "$($id)_cn.mp3"
        en = "$($id)_en.mp3"
      }
    }
  }

  $cards[$id][$language] = (Get-Content -Raw -Encoding UTF8 -LiteralPath $_.FullName).Trim()
}

$cardList = $cards.Values |
  Where-Object { -not [string]::IsNullOrWhiteSpace($_.cn) } |
  Sort-Object series, unit, sentence

$json = $cardList | ConvertTo-Json -Depth 8
if ([string]::IsNullOrWhiteSpace($json)) {
  $json = "[]"
}

Set-Content -LiteralPath $outputPath -Value "window.STATIC_CARDS = $json;" -Encoding UTF8

Write-Host "Updated cards-data.js"
Write-Host "Cards: $($cardList.Count)"
Write-Host "Output: $outputPath"
