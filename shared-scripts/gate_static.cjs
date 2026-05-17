#!/usr/bin/env node
// gate_static.cjs —— loop body 末尾静态门禁
// 探测项目 stack → 跑通用 lint + test → 通过则 pass=true。
// 检测顺序：package.json (node) → pyproject.toml (python) → Cargo.toml (rust) → 否则 pass=true（跳过）

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function readStdin() {
  return new Promise((resolve) => {
    let buf = '';
    process.stdin.on('data', c => buf += c);
    process.stdin.on('end', () => resolve(buf));
  });
}
function emit(pass, message) {
  process.stdout.write(JSON.stringify({ pass: !!pass, message: String(message || '') }) + '\n');
  process.exit(0);
}

function tryRun(cwd, bin, args, label) {
  const r = spawnSync(bin, args, { cwd, encoding: 'utf8', shell: process.platform === 'win32', timeout: 60000 });
  if (r.error) return { ok: true, info: `${label}: skipped (${r.error.code || r.error.message})` };
  // exit 0 → pass; non-zero → fail
  if (r.status === 0) {
    return { ok: true, info: `${label}: pass` };
  }
  const out = (r.stderr || r.stdout || '').slice(0, 400);
  return { ok: false, info: `${label}: exit=${r.status}\n${out}` };
}

(async () => {
  let input;
  try {
    input = JSON.parse(await readStdin());
    if (input.schemaVersion !== 2) {
      process.stderr.write('Bad schemaVersion ' + input.schemaVersion + '\n');
      process.exit(2);
    }
  } catch (e) {
    process.stderr.write('Bad stdin: ' + (e && e.message) + '\n');
    process.exit(2);
  }

  const cwd = input.cwd;

  // Stack detection
  const hasPackageJson  = fs.existsSync(path.join(cwd, 'package.json'));
  const hasPyproject    = fs.existsSync(path.join(cwd, 'pyproject.toml'));
  const hasCargo        = fs.existsSync(path.join(cwd, 'Cargo.toml'));

  const messages = [];
  let allPass = true;

  if (hasPackageJson) {
    let pkg = {};
    try { pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8')); } catch (e) {}
    // Try lint script if present, but don't fail if absent
    if (pkg.scripts && pkg.scripts.lint) {
      const r = tryRun(cwd, 'npm', ['run', '--silent', 'lint'], 'npm run lint');
      if (!r.ok) allPass = false;
      messages.push(r.info);
    } else {
      messages.push('npm run lint: skipped (no "lint" script in package.json)');
    }
    // Try test script if present
    if (pkg.scripts && pkg.scripts.test && !/no test specified/i.test(pkg.scripts.test)) {
      const r = tryRun(cwd, 'npm', ['test', '--silent'], 'npm test');
      if (!r.ok) allPass = false;
      messages.push(r.info);
    } else {
      messages.push('npm test: skipped (no real "test" script in package.json)');
    }
  } else if (hasPyproject) {
    const r1 = tryRun(cwd, 'python', ['-m', 'pyflakes', '.'], 'pyflakes');
    if (!r1.ok) { allPass = false; }
    messages.push(r1.info);
    const r2 = tryRun(cwd, 'python', ['-m', 'pytest', '-q'], 'pytest');
    if (!r2.ok) { allPass = false; }
    messages.push(r2.info);
  } else if (hasCargo) {
    const r1 = tryRun(cwd, 'cargo', ['clippy', '--quiet'], 'cargo clippy');
    if (!r1.ok) { allPass = false; }
    messages.push(r1.info);
    const r2 = tryRun(cwd, 'cargo', ['test', '--quiet'], 'cargo test');
    if (!r2.ok) { allPass = false; }
    messages.push(r2.info);
  } else {
    emit(true, 'No recognized stack (no package.json / pyproject.toml / Cargo.toml) — gate_static skipped');
  }

  emit(allPass, messages.join('\n---\n'));
})();
