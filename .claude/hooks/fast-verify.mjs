#!/usr/bin/env node
// Stop hook: run only the fast static checks for the areas this session touched.
// Exit 0 = nothing to say. Exit 2 = mechanical failures on stderr for the session to fix.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const CODE_EXT = new Set(['.py', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const TIMEOUT_MS = 120_000;
const TAIL_LINES = 40;

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function run(command, cwd) {
  const res = spawnSync(command, { cwd, shell: true, encoding: 'utf8', timeout: TIMEOUT_MS });
  if (res.error && res.error.code === 'ETIMEDOUT') return { skipped: 'timed out' };
  if (res.error) return { skipped: String(res.error.message) };
  if (res.status === 0) return { ok: true };
  const text = `${res.stdout || ''}${res.stderr || ''}`.trim();
  // A missing tool is an environment problem, not a code error: do not block the session on it.
  if (/No module named|is not recognized as|command not found|ENOENT/i.test(text)) return { skipped: 'tool not installed' };
  const out = text.split(/\r?\n/);
  return { ok: false, output: out.slice(-TAIL_LINES).join('\n') };
}

let input = {};
try {
  input = JSON.parse(readStdin() || '{}');
} catch {
  process.exit(0);
}
if (input.stop_hook_active === true) process.exit(0);

const start = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
const top = spawnSync('git rev-parse --show-toplevel', { cwd: start, shell: true, encoding: 'utf8' });
if (top.status !== 0) process.exit(0);
const root = path.normalize(top.stdout.trim());

// Modified, staged and untracked files (NUL-separated so odd file names are safe).
const st = spawnSync('git status --porcelain -z -uall', { cwd: root, shell: true, encoding: 'utf8' });
if (st.status !== 0) process.exit(0);
const parts = st.stdout.split('\0').filter(Boolean);
const files = [];
for (let i = 0; i < parts.length; i++) {
  const entry = parts[i];
  const code = entry.slice(0, 2);
  files.push(entry.slice(3));
  if (code.includes('R') || code.includes('C')) i++; // skip the rename source
}

const touched = { backend: false, frontend: false, mobile: false };
for (const f of files) {
  if (!CODE_EXT.has(path.extname(f).toLowerCase())) continue; // docs, specs, markdown etc.
  const area = f.split('/')[0];
  if (area in touched) touched[area] = true;
}
if (!Object.values(touched).some(Boolean)) process.exit(0);

const checks = [];
if (touched.backend) {
  // Prefer ruff from a project-local venv, then ruff on PATH, then `python -m ruff`.
  const exe = process.platform === 'win32' ? ['Scripts', 'ruff.exe'] : ['bin', 'ruff'];
  const venvs = [path.join(root, 'backend', '.venv'), path.join(root, '.venv'), path.join(root, 'backend', 'venv')];
  const local = venvs.map((v) => path.join(v, ...exe)).find((p) => existsSync(p));
  const args = 'check app/ tests/';
  const cmds = [];
  if (local) cmds.push(`"${local}" ${args}`);
  cmds.push(`ruff ${args}`, `python -m ruff ${args}`);
  checks.push(['backend: ruff', cmds, path.join(root, 'backend'), null]);
}
if (touched.frontend) {
  const dir = path.join(root, 'frontend');
  checks.push(['frontend: tsc', 'npx tsc -b', dir, path.join(dir, 'node_modules')]);
  checks.push(['frontend: lint', 'npm run lint', dir, path.join(dir, 'node_modules')]);
}
if (touched.mobile) {
  const dir = path.join(root, 'mobile');
  checks.push(['mobile: typecheck', 'npm run typecheck', dir, path.join(dir, 'node_modules')]);
}

const failures = [];
for (const [label, cmd, cwd, needs] of checks) {
  if (!existsSync(cwd) || (needs && !existsSync(needs))) continue; // dependencies not installed here
  // `cmd` may be a list of alternatives; use the first one whose tool is installed.
  let r = { skipped: 'no command' };
  let used = '';
  for (const c of Array.isArray(cmd) ? cmd : [cmd]) {
    used = c;
    r = run(c, cwd);
    if (!r.skipped || r.skipped !== 'tool not installed') break;
  }
  if (r.ok === false) failures.push(`## ${label} (${used})\n${r.output}`);
}

if (failures.length) {
  process.stderr.write(`fast-verify: fix these mechanical errors before calling reviewer.\n\n${failures.join('\n\n')}\n`);
  process.exit(2);
}
process.exit(0);
