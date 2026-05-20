#!/usr/bin/env node
// gate_ats.cjs —— ATS（验收测试策略）硬门
// 检查 .harness/memory/plans/ats.md 存在、含必填章节、映射表至少 1 行、类别合法。

const fs = require('fs');
const path = require('path');

const VALID_CATEGORIES = new Set(['FUNC', 'BNDRY', 'UI', 'SEC', 'PERF']);
const TABLE_ROW_RE = /^\|\s*((?:FR|NFR|IFR)-\d{3})\s*\|/;

function emit(pass, message) {
  process.stdout.write(JSON.stringify({ pass: !!pass, message: String(message || '') }) + '\n');
  process.exit(0);
}

(async () => {
  // v10: 脚本由 review skill 的 LLM 直接 `node` 运行（无框架 stdin）。
  // cwd 即 LLM 运行目录（= 蓝图工作区）；不再读 schemaVersion stdin。

  const atsPath = path.join(process.cwd(), '.harness', 'memory', 'plans', 'ats.md');
  if (!fs.existsSync(atsPath)) {
    emit(false, 'ATS 未生成: ' + path.relative(process.cwd(), atsPath));
  }

  const content = fs.readFileSync(atsPath, 'utf8');
  if (!content.trim()) emit(false, 'ATS 文件为空');

  const headingsLower = content.split('\n')
    .filter(l => l.trim().startsWith('#'))
    .map(l => l.replace(/^#+\s*/, '').toLowerCase())
    .join(' ');

  const required = [
    { keys: ['测试范围', 'test scope', 'scope & strategy', 'strategy overview'], name: '测试范围与策略概览' },
    { keys: ['需求', 'requirement', 'mapping', '映射'], name: '需求→验收场景映射' },
    { keys: ['类别', 'category strateg', '测试类别'], name: '测试类别策略' }
  ];
  const missing = [];
  for (const r of required) {
    if (!r.keys.some(k => headingsLower.includes(k))) missing.push(r.name);
  }
  if (missing.length) emit(false, 'ATS 缺必填章节: ' + missing.join('；'));

  const rows = [];
  for (const line of content.split('\n')) {
    const m = TABLE_ROW_RE.exec(line.trim());
    if (m) {
      const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
      rows.push({ reqId: m[1], categoriesRaw: cells[3] || '' });
    }
  }
  if (rows.length === 0) {
    emit(false, 'ATS 映射表无有效行（期望 "| FR-001 | ... | FUNC,BNDRY | ..."）');
  }

  const invalidCats = [];
  for (const r of rows) {
    if (!r.categoriesRaw) continue;
    for (const c of r.categoriesRaw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)) {
      if (!VALID_CATEGORIES.has(c)) invalidCats.push(`${r.reqId}:${c}`);
    }
  }
  if (invalidCats.length) {
    emit(false, '非法类别 (合法集 FUNC/BNDRY/UI/SEC/PERF): ' + invalidCats.slice(0, 5).join(', '));
  }

  if (content.length < 400) {
    emit(false, 'ATS 内容过短 (' + content.length + ' < 400 chars)，疑似桩文件');
  }
  emit(true, `ATS 校验通过 (${rows.length} 条需求映射, ${content.length} chars)`);
})();
