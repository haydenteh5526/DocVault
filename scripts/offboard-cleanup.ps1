<#
.SYNOPSIS
    Offboarding cleanup for a work laptop: removes personal repos and credentials
    only after proving nothing would be lost.

.DESCRIPTION
    DRY RUN BY DEFAULT. Nothing is deleted unless you pass -Execute.

    For each personal repo it verifies, immediately before deleting:
      * every local branch commit exists on the remote
      * every local tag exists on the remote
      * no uncommitted changes
      * no stashes
      * the remote really is your personal GitHub account

    Any repo failing a check is SKIPPED, not deleted.

    Work repositories are never touched. The script refuses to delete any repo
    whose remote is not the expected personal GitHub owner, so an Ericsson
    gitlab/gerrit remote can't be removed even if listed by mistake.

.PARAMETER Execute
    Actually delete. Without this, the script only reports.

.PARAMETER RevokeCredentials
    Also log out of gh, remove cached git credentials, and delete SSH/GPG keys.

.PARAMETER IncludeDocker
    Also tear down Docker volumes for personal projects.

.EXAMPLE
    # 1. Review what would happen (safe, changes nothing)
    powershell -ExecutionPolicy Bypass -File C:\offboard-cleanup.ps1

.EXAMPLE
    # 2. Do it, once the dry run looks right
    powershell -ExecutionPolicy Bypass -File C:\offboard-cleanup.ps1 -Execute -RevokeCredentials -IncludeDocker

.NOTES
    Copy this file OUT of C:\FYP before running (e.g. to C:\), because FYP is one
    of the folders it deletes.
#>

[CmdletBinding()]
param(
    [switch]$Execute,
    [switch]$RevokeCredentials,
    [switch]$IncludeDocker
)

# 'Continue', not 'Stop', on purpose. Under Windows PowerShell 5.1 a native
# command writing to stderr (docker when the daemon is down, git when a repo has
# no remote) raises an error record; with 'Stop' that aborts the whole run, which
# previously skipped the credential phase entirely. Every step below checks its
# own exit code instead.
$ErrorActionPreference = 'Continue'

# Only these are considered personal. Anything not listed here is left alone.
$PersonalRepos = @(
    'C:\FYP',
    'C:\vibe-cam',
    'C:\PantryAI',
    'C:\Rechess',
    'C:\Xiangqi',
    'C:\CourseXcel',
    'C:\Exoplanet-AI-Hunter'
)

# A repo is only deletable if its origin belongs to this GitHub owner.
$ExpectedOwner = 'haydenteh5526'

# Never delete a repo whose remote looks like work infrastructure.
$WorkRemotePatterns = @('ericsson', 'gerrit', 'gitlab.internal')

function Write-Head($text) {
    Write-Host ''
    Write-Host ('=' * 74) -ForegroundColor Cyan
    Write-Host $text -ForegroundColor Cyan
    Write-Host ('=' * 74) -ForegroundColor Cyan
}

# Release any lock on a folder we're about to remove.
Set-Location 'C:\'

if (-not $Execute) {
    Write-Host ''
    Write-Host '*** DRY RUN - nothing will be deleted. Re-run with -Execute to apply. ***' -ForegroundColor Yellow
}

# ---------------------------------------------------------------------------
# Phase 1 - verify each repo is fully backed up
# ---------------------------------------------------------------------------
Write-Head 'PHASE 1: safety checks'

$results = @()

foreach ($path in $PersonalRepos) {
    $name = Split-Path $path -Leaf

    if (-not (Test-Path $path)) {
        $results += [pscustomobject]@{ Repo = $name; Path = $path; Safe = $false; Reason = 'not present (already removed)'; Skip = $true }
        continue
    }

    if (-not (Test-Path (Join-Path $path '.git'))) {
        $results += [pscustomobject]@{ Repo = $name; Path = $path; Safe = $false; Reason = 'not a git repo - inspect by hand'; Skip = $true }
        continue
    }

    $problems = @()

    $remote = (git -C $path remote get-url origin 2>&1)
    if ($LASTEXITCODE -ne 0) { $remote = '' }

    # Refuse anything that looks like work infrastructure.
    foreach ($pattern in $WorkRemotePatterns) {
        if ($remote -match $pattern) {
            $results += [pscustomobject]@{ Repo = $name; Path = $path; Safe = $false; Reason = "WORK REMOTE ($pattern) - refusing"; Skip = $true }
            $problems += 'work'
            break
        }
    }
    if ($problems -contains 'work') { continue }

    if ($remote -notmatch [regex]::Escape($ExpectedOwner)) {
        $problems += "remote is not $ExpectedOwner ($remote)"
    }

    # Refresh remote state so the comparison is current, not cached.
    git -C $path fetch --all --tags --quiet 2>&1 | Out-Null

    # Commits on local branches that no remote branch contains.
    # NOTE: deliberately --branches, not --all. Using --all counts commits that
    # are only reachable from tags as "missing", which false-positives on tags
    # that *are* pushed (remote-tracking refs don't cover remote tags).
    $unpushed = @(git -C $path log --branches --not --remotes --oneline 2>&1 | Where-Object { $_ })
    if ($unpushed.Count -gt 0) { $problems += "$($unpushed.Count) unpushed commit(s)" }

    # Local tags absent from the remote.
    $localTags = @(git -C $path tag 2>&1 | Where-Object { $_ })
    if ($localTags.Count -gt 0) {
        $remoteTagsRaw = (git -C $path ls-remote --tags origin 2>&1) -join "`n"
        $missingTags = @($localTags | Where-Object { $remoteTagsRaw -notmatch ("refs/tags/" + [regex]::Escape($_) + '(\^\{\})?(\s|$)') })
        if ($missingTags.Count -gt 0) { $problems += "unpushed tag(s): $($missingTags -join ', ')" }
    }

    $dirty = @(git -C $path status --porcelain 2>&1 | Where-Object { $_ })
    if ($dirty.Count -gt 0) { $problems += "$($dirty.Count) uncommitted change(s)" }

    $stashes = @(git -C $path stash list 2>&1 | Where-Object { $_ })
    if ($stashes.Count -gt 0) { $problems += "$($stashes.Count) stash(es)" }

    if ($problems.Count -eq 0) {
        $results += [pscustomobject]@{ Repo = $name; Path = $path; Safe = $true; Reason = 'fully pushed'; Skip = $false }
    } else {
        $results += [pscustomobject]@{ Repo = $name; Path = $path; Safe = $false; Reason = ($problems -join '; '); Skip = $false }
    }
}

foreach ($r in $results) {
    $label = if ($r.Safe) { '  SAFE   ' } elseif ($r.Skip) { '  SKIP   ' } else { '  BLOCKED' }
    $colour = if ($r.Safe) { 'Green' } elseif ($r.Skip) { 'DarkGray' } else { 'Red' }
    Write-Host ('{0} {1,-22} {2}' -f $label, $r.Repo, $r.Reason) -ForegroundColor $colour
}

$safe    = @($results | Where-Object { $_.Safe })
$blocked = @($results | Where-Object { -not $_.Safe -and -not $_.Skip })

if ($blocked.Count -gt 0) {
    Write-Host ''
    Write-Host "$($blocked.Count) repo(s) BLOCKED - push or commit that work first. They will not be deleted." -ForegroundColor Red
}

# ---------------------------------------------------------------------------
# Phase 2 - Docker teardown (before folders disappear; compose files live in them)
# ---------------------------------------------------------------------------
if ($IncludeDocker) {
    Write-Head 'PHASE 2: Docker volumes for personal projects'

    $dockerUp = $false
    try {
        cmd /c "docker info >nul 2>&1"
        $dockerUp = ($LASTEXITCODE -eq 0)
    } catch { $dockerUp = $false }

    if (-not $dockerUp) {
        Write-Host '  Docker not running - skipping (volumes die with the machine anyway)' -ForegroundColor Yellow
    }

    if ($dockerUp) {
        foreach ($r in $safe) {
            $compose = Get-ChildItem $r.Path -File -Filter 'docker-compose*.y*ml' -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($compose) {
                if ($Execute) {
                    Write-Host "  docker compose down -v  ($($r.Repo))"
                    docker compose -f $compose.FullName down -v 2>&1 | Out-Null
                } else {
                    Write-Host "  would run: docker compose down -v  ($($r.Repo))"
                }
            }
        }
    }
}

# ---------------------------------------------------------------------------
# Phase 3 - delete folders (FYP last: this script may live inside it)
# ---------------------------------------------------------------------------
Write-Head 'PHASE 3: delete personal repo folders'

if ($safe.Count -eq 0) {
    Write-Host '  nothing eligible'
} else {
    $ordered = @($safe | Where-Object { $_.Repo -ne 'FYP' }) + @($safe | Where-Object { $_.Repo -eq 'FYP' })
    foreach ($r in $ordered) {
        $size = 0
        try {
            $size = [math]::Round((Get-ChildItem $r.Path -Recurse -File -Force -ErrorAction SilentlyContinue |
                     Measure-Object -Property Length -Sum).Sum / 1MB, 1)
        } catch { }

        if ($Execute) {
            Write-Host ("  deleting {0,-22} ({1} MB)" -f $r.Repo, $size) -ForegroundColor Yellow
            Remove-Item -LiteralPath $r.Path -Recurse -Force -ErrorAction Continue
            if (Test-Path $r.Path) {
                Write-Host "    WARNING: $($r.Path) still exists - a file may be locked. Close editors/terminals and retry." -ForegroundColor Red
            }
        } else {
            Write-Host ("  would delete {0,-22} ({1} MB)" -f $r.Repo, $size)
        }
    }
}

# ---------------------------------------------------------------------------
# Phase 4 - credentials. The part that actually matters.
# ---------------------------------------------------------------------------
Write-Head 'PHASE 4: credentials'

if ($RevokeCredentials) {
    if ($Execute) {
        Write-Host '  gh auth logout'
        gh auth logout --hostname github.com 2>&1 | Out-Null

        Write-Host '  removing cached git credentials from Windows Credential Manager'
        $entries = @(cmdkey /list 2>&1 | Select-String -Pattern 'git:https?://' | ForEach-Object { ($_ -split '=')[-1].Trim() })
        foreach ($e in $entries) {
            Write-Host "    cmdkey /delete:$e"
            cmdkey /delete:$e 2>&1 | Out-Null
        }

        foreach ($p in @("$HOME\.ssh", "$env:APPDATA\gnupg")) {
            if (Test-Path $p) {
                Write-Host "  deleting $p"
                Remove-Item -LiteralPath $p -Recurse -Force -ErrorAction Continue
            }
        }
    } else {
        Write-Host '  would run: gh auth logout'
        Write-Host '  would clear git:https://* entries from Windows Credential Manager'
        Write-Host "  would delete $HOME\.ssh and $env:APPDATA\gnupg"
    }
} else {
    Write-Host '  skipped (pass -RevokeCredentials to include)'
}

# ---------------------------------------------------------------------------
# Manual steps - cannot be scripted
# ---------------------------------------------------------------------------
Write-Head 'STILL TO DO BY HAND'

@(
    'Revoke server-side at github.com/settings/applications - the only step that',
    '  still works after the laptop is gone.',
    'Review github.com/settings/security-log for anything unexpected.',
    'Sign out of browsers and delete the browser profile (saved passwords,',
    '  GitHub/Google sessions, password-manager extension).',
    'Check "OneDrive - Ericsson" for personal files - that folder syncs to the',
    '  company tenant.',
    'Empty Downloads and the Recycle Bin.',
    'Work repos: leave them alone, but make sure colleagues know about any',
    '  unpushed branches/stashes before the machine goes.'
) | ForEach-Object { Write-Host "  - $_" }

Write-Host ''
if (-not $Execute) {
    Write-Host 'Dry run finished. Nothing was changed.' -ForegroundColor Yellow
    Write-Host 'When the report above looks right:' -ForegroundColor Yellow
    Write-Host '  powershell -ExecutionPolicy Bypass -File C:\offboard-cleanup.ps1 -Execute -RevokeCredentials -IncludeDocker' -ForegroundColor Yellow
} else {
    Write-Host 'Cleanup finished.' -ForegroundColor Green
    $selfDir = Split-Path $PSCommandPath -Parent
    if ($selfDir -like 'C:\FYP*') {
        Write-Host "This script lived in a deleted folder; remove $selfDir by hand if anything remains." -ForegroundColor Yellow
    }
}
Write-Host ''
