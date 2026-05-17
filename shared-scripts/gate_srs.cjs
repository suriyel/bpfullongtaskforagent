#!/usr/bin/env node
// gate_srs.cjs —— SRS 硬门
// 检查 .harness/memory/plans/srs.md 存在且含必填段落。
//
// stdin: {schemaVersion:2, cwd, ...}
// stdout: 最后一行 JSON {pass: bool, message: string}
// exit: 0 normal / 2 schema error

const fs = require('fs');
const path = require('path');

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

  const srsPath = path.join(input.cwd, '.harness', 'memory', 'plans', 'srs.md');
  if (!fs.existsSync(srsPath)) {
    emit(false, 'SRS 未生成: ' + path.relative(input.cwd, srsPath));
  }

  const content = fs.readFileSync(srsPath, 'utf8');
  // 宽松匹配：允许编号前缀 (## 4. 功能需求 / ## 4 功能需求 / ### FR-001 等)
  const required = [
    { re: /(^|\n)##+\s+[\d\.\s]*\s*(Functional Requirements|功能需求|功能性需求|Functional Reqs)|(^|\n)###?\s*FR[-_]?\d+/i, name: 'FR 段（含 Functional Requirements / 功能需求 / FR-N）' },
    { re: /(^|\n)##+\s+[\d\.\s]*\s*(Acceptance Criteria|验收标准|验收准则|接受准则|AC)|(^|\n)###?\s*AC[-_]?\d+/i, name: '验收准则段（含 Acceptance Criteria / 验收 / AC-N）' }
  ];
  const missing = [];
  for (const r of required) if (!r.re.test(content)) missing.push(r.name);

  if (missing.length) {
    emit(false, 'SRS 缺必填段落: ' + missing.join('；') + '\n（路径：' + path.relative(input.cwd, srsPath) + '，长度 ' + content.length + ' chars）');
  }
  if (content.length < 500) {
    emit(false, 'SRS 内容过短 (' + content.length + ' < 500 chars)，疑似桩文件');
  }
  emit(true, 'SRS 校验通过 (' + content.length + ' chars)');
})();
