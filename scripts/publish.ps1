<#
.SYNOPSIS
Publishes the packed release tarballs to npm, in dependency order.

.DESCRIPTION
Run this from a real terminal, not from an editor's embedded shell. npm's security-key 2FA
prints a URL and then waits for the browser handshake, and it can only wait when it has a
terminal attached — without one it exits immediately with EOTP.

The tarballs are produced by `pnpm pack`, not by npm, because npm cannot resolve the
`workspace:*` dependency ranges this monorepo uses. pnpm rewrites them to exact versions while
packing; npm then publishes the finished tarball, which it accepts as a package spec.

Order matters: each package's dependencies must already exist on the registry, or the publish
resolves to a version that is not there yet.

.EXAMPLE
pnpm run release:pack
./scripts/publish.ps1
#>
[CmdletBinding()]
param(
  # Defaults to the version in the CLI manifest, so this does not drift on the next release.
  [string]$Version,
  [string]$Directory = (Join-Path $PSScriptRoot '..' '.release')
)

$ErrorActionPreference = 'Stop'

if (-not $Version) {
  $manifest = Get-Content (Join-Path $PSScriptRoot '..' 'packages' 'cli' 'package.json') -Raw |
    ConvertFrom-Json
  $Version = $manifest.version
}

# Dependency order, not alphabetical.
$packages = @(
  'hymarkx-ast'
  'hymarkx-parser'
  'hymarkx-compiler'
  'hymarkx-formatter'
  'hymarkx-language-server'
  'hymarkx-cli'
  'hymarkx'
)

$missing = $packages |
  Where-Object { -not (Test-Path (Join-Path $Directory "$_-$Version.tgz")) }
if ($missing) {
  Write-Host "Missing tarballs for version ${Version}:" -ForegroundColor Red
  $missing | ForEach-Object { Write-Host "  $_-$Version.tgz" }
  Write-Host 'Run `pnpm run release:pack` first.'
  exit 1
}

Write-Host "Publishing $($packages.Count) packages at $Version" -ForegroundColor Cyan
Write-Host 'Each publish opens a URL — click "Use security key" and authenticate.'
Write-Host ''

$published = @()
foreach ($package in $packages) {
  $tarball = Join-Path $Directory "$package-$Version.tgz"
  Write-Host "=== $package" -ForegroundColor Cyan
  npm publish $tarball --access public

  if ($LASTEXITCODE -ne 0) {
    Write-Host ''
    Write-Host "Stopped at $package." -ForegroundColor Red
    if ($published) {
      Write-Host "Already published: $($published -join ', ')"
      Write-Host 'Rerun this script — npm rejects versions that already exist, so it is safe.'
    }
    exit 1
  }

  $published += $package
}

Write-Host ''
Write-Host "Published all $($packages.Count) packages at $Version." -ForegroundColor Green
Write-Host 'Now revoke the publish token if you created one, and verify with:'
Write-Host '  npm view hymarkx version'
