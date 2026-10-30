# C4: [template PE][UTF-8 HTML bytes][Int64 LE byte count][ASCII RVHTML01]
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Template,
    [Parameter(Mandatory)][string]$Html,
    [Parameter(Mandatory)][string]$Out
)
$ErrorActionPreference = 'Stop'
$templatePath = (Resolve-Path -LiteralPath $Template).Path
$htmlPath = (Resolve-Path -LiteralPath $Html).Path
$outPath = [IO.Path]::GetFullPath($Out)
if ($outPath -eq $templatePath -or $outPath -eq $htmlPath) {
    throw 'Out must not overwrite Template or Html.'
}
$parent = [IO.Path]::GetDirectoryName($outPath)
[IO.Directory]::CreateDirectory($parent) | Out-Null
$temp = Join-Path $parent ([Guid]::NewGuid().ToString('N') + '.tmp')
try {
    $destination = [IO.File]::Open($temp, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try {
        $source = [IO.File]::OpenRead($templatePath)
        try {
            # Refuse an already-packed executable; this tool takes a pristine build template.
            if ($source.Length -ge 16) {
                $source.Position = $source.Length - 8
                $magic = [byte[]]::new(8)
                if ($source.Read($magic, 0, 8) -eq 8 -and [Text.Encoding]::ASCII.GetString($magic) -eq 'RVHTML01') {
                    throw 'Template already has an RVHTML01 payload.'
                }
            }
            $source.Position = 0
            $source.CopyTo($destination, 131072)
        } finally { $source.Dispose() }
        $htmlStream = [IO.File]::OpenRead($htmlPath)
        try {
            $length = $htmlStream.Length
            if ($length -le 0) { throw 'Html is empty.' }
            # Validate UTF-8 incrementally without retaining a potentially huge HTML in memory.
            $reader = [IO.StreamReader]::new($htmlStream, [Text.UTF8Encoding]::new($false, $true), $false, 65536, $true)
            try {
                $characters = [char[]]::new(65536)
                while ($reader.Read($characters, 0, $characters.Length) -gt 0) {}
            } finally { $reader.Dispose() }
            $htmlStream.Position = 0
            $htmlStream.CopyTo($destination, 131072)
            $lengthBytes = [BitConverter]::GetBytes([long]$length)
            if (-not [BitConverter]::IsLittleEndian) { [Array]::Reverse($lengthBytes) }
            $destination.Write($lengthBytes, 0, 8)
            $magicBytes = [Text.Encoding]::ASCII.GetBytes('RVHTML01')
            $destination.Write($magicBytes, 0, 8)
            $destination.Flush($true)
        } finally { $htmlStream.Dispose() }
    } finally { $destination.Dispose() }
    # Same-folder temporary output prevents publishing a partial executable.
    Move-Item -LiteralPath $temp -Destination $outPath -Force
    Write-Output "exe=$outPath htmlBytes=$length exeBytes=$((Get-Item -LiteralPath $outPath).Length)"
} finally {
    if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Force }
}
