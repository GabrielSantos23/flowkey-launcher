# Copies a directory tree, recreating pnpm's junctions/symlinks as junctions
# whose targets are remapped into the destination tree. Bun on Windows resolves
# junctions transparently but fails to resolve through directory symbolic links,
# so release bundles must ship junctions — this also preserves the "single copy
# of React" invariant that pnpm's link layout gives us in a repo checkout
# (tar/Copy-Item either break links or duplicate React).
#
# Runs in two passes because the workspace link graph is cyclic (extensions
# reference sdk; the pnpm store references extensions): pass 1 copies real
# files and directories, pass 2 creates every junction once all targets exist.
param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Destination
)

$ErrorActionPreference = "Stop"
$srcRoot = (Resolve-Path $Source).Path
$dstRoot = [IO.Path]::GetFullPath($Destination)

function Get-RelPath([string]$basePath, [string]$targetPath) {
    # [IO.Path]::GetRelativePath needs .NET Core; Uri works on 5.1 and 7+.
    $baseUri = New-Object System.Uri(($basePath.TrimEnd('\', '/') + '\'))
    $targetUri = New-Object System.Uri($targetPath)
    [Uri]::UnescapeDataString($baseUri.MakeRelativeUri($targetUri).ToString()).Replace('/', '\')
}

function Get-LinkTarget([IO.FileSystemInfo]$item) {
    # PS 5.1 populates .Target for junctions but often returns $null for
    # symbolic links; fall back to parsing `dir /AL` output for those.
    $direct = @($item.Target)[0]
    if ($direct) {
        return $direct
    }
    $parentDir = [IO.Path]::GetDirectoryName($item.FullName)
    $listing = cmd /c "dir /AL `"$parentDir`"" 2>$null | Out-String
    $escaped = [Regex]::Escape($item.Name)
    if ($listing -match "<(SYMLINKD|SYMLINK|JUNCTION)>\s+$escaped \[(.+)\]") {
        return $Matches[2]
    }
    return $null
}

function Copy-Tree([string]$src, [string]$dst, [bool]$linksOnly) {
    New-Item -ItemType Directory -Force -Path $dst | Out-Null
    foreach ($item in Get-ChildItem -LiteralPath $src -Force) {
        try {
            $target = Join-Path $dst $item.Name
            $isLink = ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0
            if ($isLink -ne $linksOnly) {
                continue
            }
            if ($isLink) {
                $rawTarget = Get-LinkTarget $item
                if ($null -eq $rawTarget) {
                    # Unresolvable link — copy whatever it points at as plain content.
                    Copy-Item -LiteralPath $item.FullName -Destination $target -Recurse -Force
                } else {
                    # Relative targets are relative to the link's directory.
                    $sourceTarget = if ([IO.Path]::IsPathRooted($rawTarget)) {
                        $rawTarget
                    } else {
                        [IO.Path]::GetFullPath((Join-Path ([IO.Path]::GetDirectoryName($item.FullName)) $rawTarget))
                    }
                    if (Test-Path -LiteralPath $sourceTarget -PathType Container) {
                        # Remap into the destination tree so the bundle is self-contained.
                        $rel = Get-RelPath $srcRoot $sourceTarget
                        $destTarget = Join-Path $dstRoot $rel
                        New-Item -ItemType Junction -Path $target -Target $destTarget | Out-Null
                    } else {
                        # File symlink (e.g. .bin shims) — ship the file content.
                        Copy-Item -LiteralPath $sourceTarget -Destination $target -Force
                    }
                }
            } elseif ($item.PSIsContainer) {
                Copy-Tree $item.FullName $target $linksOnly
            } else {
                Copy-Item -LiteralPath $item.FullName -Destination $target
            }
        } catch {
            throw "failed copying $($item.FullName): $_"
        }
    }
}

Copy-Tree $srcRoot $dstRoot $false
Copy-Tree $srcRoot $dstRoot $true
