#!/usr/bin/env node
// gate_design.cjs —— Design 硬门
// 检查 .harness/memory/plans/design.md 存在且含必填段落。

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

  const designPath = path.join(input.cwd, '.harness', 'memory', 'plans', 'design.md');
  if (!fs.existsSync(designPath)) {
    emit(false, 'Design 未生成: ' + path.relative(input.cwd, designPath));
  }

  const content = fs.readFileSync(designPath, 'utf8');
  // 宽松匹配（同样允许编号前缀和中英文混写）
  const required = [
    { re: /(技术栈|Tech Stack|Architecture|架构|Components|组件|逻辑视图|组件图|模块拆分|系统架构)/i, name: '架构/技术栈段' },
    { re: /(测试策略|Test Strategy|TDD|测试|verification|验证)/i, name: '测试策略段' }
  ];
  const missing = [];
  for (const r of required) if (!r.re.test(content)) missing.push(r.name);

  if (missing.length) {
    emit(false, 'Design 缺必填段落: ' + missing.join('；'));
  }
  if (content.length < 500) {
    emit(false, 'Design 内容过短 (' + content.length + ' < 500 chars)，疑似桩文件');
  }
  emit(true, 'Design 校验通过 (' + content.length + ' chars)');
})();
