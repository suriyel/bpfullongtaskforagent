#!/usr/bin/env node
// gate_init.cjs —— Init 硬门
// 检查 init 节点产出的两份产物：
//   stdin.loops[<loopId>].tasks  （bp-tasks set 灌入的 items[]）
//   .harness/memory/plans/project-context.md （下游 wd 消费的全局上下文）
//
// 校验逻辑照搬 scripts/validate_features.py（REQUIRED_FIELDS / VALID_STATUSES /
// VALID_PRIORITIES / SRS_TRACE_PATTERN / 依赖闭包），按 gate_srs.cjs 的
// stdin/stdout/exit 模式封装。
//
// stdin:  {schemaVersion:2, cwd, loops:{<loopId>:{tasks[],...}}, ...}
// stdout: 最后一行 JSON {pass:bool, message:string}
// exit:   0 normal / 2 schema error

const fs = require('fs');
const path = require('path');

// ---- 常量（照搬 validate_features.py:32-37）---------------------------------
const REQUIRED_FIELDS = ['id', 'category', 'title', 'description', 'priority', 'status'];
const SRS_TRACE_PATTERN = /^(?:FR|IFR)-\d{3}$/;
const VALID_STATUSES = new Set(['failing', 'passing']);
const VALID_PRIORITIES = new Set(['high', 'medium', 'low']);
const VALID_LANGUAGES = new Set(['python', 'java', 'javascript', 'typescript', 'c', 'cpp', 'c++', 'todo']);

// ---- 工具 -------------------------------------------------------------------
function readStdin() {
  return new Promise((resolve) => {
    let buf = '';
    process.stdin.on('data', (c) => (buf += c));
    process.stdin.on('end', () => resolve(buf));
  });
}
function emit(pass, message) {
  process.stdout.write(JSON.stringify({ pass: !!pass, message: String(message || '') }) + '\n');
  process.exit(0);
}

// ---- A. tasks 数组校验（数据来源 = stdin.loops，非磁盘文件）--------------------
function validateTasksArray(tasks, loopId) {
  const errors = [];
  const prefix0 = 'loop[' + loopId + ']';

  if (!Array.isArray(tasks)) return [prefix0 + ': tasks 必须是数组，当前是 ' + (tasks === null ? 'null' : typeof tasks)];
  if (tasks.length === 0) return [prefix0 + ': tasks 数组为空'];

  const idsSeen = new Set();
  for (let i = 0; i < tasks.length; i++) {
    const feat = tasks[i];
    const prefix = prefix0 + '.tasks[' + i + ']';

    if (feat === null || typeof feat !== 'object' || Array.isArray(feat)) {
      errors.push(prefix + ': 必须是对象');
      continue;
    }

    // 必填字段
    for (const fname of REQUIRED_FIELDS) {
      if (!(fname in feat) || feat[fname] === null || feat[fname] === '') {
        errors.push(prefix + ': 缺必填字段 "' + fname + '"');
      }
    }

    // id 唯一（accept int 或 string，仅查重）
    const fid = feat.id;
    if (fid !== undefined && fid !== null) {
      const key = typeof fid + ':' + String(fid);
      if (idsSeen.has(key)) errors.push(prefix + ' (id=' + fid + '): id 重复');
      idsSeen.add(key);
    }

    // status
    if (feat.status && !VALID_STATUSES.has(feat.status)) {
      errors.push(prefix + ' (id=' + fid + '): status "' + feat.status + '" 非法，应 ∈ ' + Array.from(VALID_STATUSES).join('|'));
    }

    // priority
    if (feat.priority && !VALID_PRIORITIES.has(feat.priority)) {
      errors.push(prefix + ' (id=' + fid + '): priority "' + feat.priority + '" 非法，应 ∈ ' + Array.from(VALID_PRIORITIES).join('|'));
    }

    // srs_trace
    if (feat.srs_trace !== undefined && feat.srs_trace !== null) {
      if (!Array.isArray(feat.srs_trace)) {
        errors.push(prefix + ' (id=' + fid + '): srs_trace 必须是数组');
      } else {
        for (let ti = 0; ti < feat.srs_trace.length; ti++) {
          const t = feat.srs_trace[ti];
          if (typeof t !== 'string' || !SRS_TRACE_PATTERN.test(t)) {
            errors.push(prefix + ' (id=' + fid + '): srs_trace[' + ti + '] 应匹配 FR-XXX/IFR-XXX，当前 "' + t + '"');
          }
        }
      }
    }

    // verification_steps
    if (feat.verification_steps !== undefined && feat.verification_steps !== null) {
      if (!Array.isArray(feat.verification_steps) || feat.verification_steps.length === 0) {
        errors.push(prefix + ' (id=' + fid + '): verification_steps 必须是非空数组');
      }
    }

    // constraints / assumptions —— per-task 必填字段（实现/需求一致性关键）
    // SKILL.md 要求每个 task 从 SRS §约束 / §假设与依赖 复制对应 CON/ASM 项。
    for (const k of ['constraints', 'assumptions']) {
      if (!(k in feat)) {
        errors.push(prefix + ' (id=' + fid + '): 缺必填字段 "' + k + '"（应复制 SRS 对应 CON/ASM 项；无则填空数组）');
      } else if (!Array.isArray(feat[k])) {
        errors.push(prefix + ' (id=' + fid + '): "' + k + '" 必须是数组，当前 ' + typeof feat[k]);
      } else {
        for (let i2 = 0; i2 < feat[k].length; i2++) {
          if (typeof feat[k][i2] !== 'string' || feat[k][i2].trim() === '') {
            errors.push(prefix + ' (id=' + fid + '): ' + k + '[' + i2 + '] 必须是非空字符串');
          }
        }
      }
    }
  }

  // 依赖闭包（第二趟）
  const allIds = new Set();
  for (const f of tasks) if (f && typeof f === 'object' && f.id !== undefined) {
    allIds.add(typeof f.id + ':' + String(f.id));
  }
  for (let i = 0; i < tasks.length; i++) {
    const feat = tasks[i];
    if (!feat || typeof feat !== 'object') continue;
    const deps = feat.dependencies;
    if (Array.isArray(deps)) {
      for (const dep of deps) {
        const key = typeof dep + ':' + String(dep);
        if (!allIds.has(key)) {
          errors.push('tasks[' + i + '] (id=' + feat.id + '): 依赖 id=' + dep + ' 不存在');
        }
      }
    }
  }

  return errors;
}

// ---- B. project-context.md 校验 --------------------------------------------
function validateContextMd(filePath) {
  const errors = [];

  if (!fs.existsSync(filePath)) return ['project-context.md 未生成: ' + filePath];

  let content;
  try { content = fs.readFileSync(filePath, 'utf8'); }
  catch (e) { return ['读取失败: ' + e.message]; }

  if (content.length < 50) errors.push('内容过短 (' + content.length + ' < 50 chars)，疑似桩文件');

  // 5 个必填标题
  const sections = [
    { re: /(^|\n)#\s+Project Context\b/, name: '# Project Context' },
    { re: /(^|\n)##\s+Project\b/, name: '## Project' },
    { re: /(^|\n)##\s+Tech Stack\b/, name: '## Tech Stack' },
    { re: /(^|\n)##\s+Constraints\b/, name: '## Constraints' },
    { re: /(^|\n)##\s+Assumptions\b/, name: '## Assumptions' },
  ];
  for (const s of sections) {
    if (!s.re.test(content)) errors.push('缺标题: ' + s.name);
  }

  // Tech Stack 三行
  const techFields = ['language', 'test_framework', 'coverage_tool'];
  for (const f of techFields) {
    const re = new RegExp('(^|\\n)\\s*-\\s*' + f + ':\\s*(\\S+)');
    const m = content.match(re);
    if (!m) {
      errors.push('Tech Stack 缺字段: ' + f);
    } else if (f === 'language') {
      const v = m[2].toLowerCase();
      if (!VALID_LANGUAGES.has(v)) {
        errors.push('language "' + m[2] + '" 不在支持集合 {' + Array.from(VALID_LANGUAGES).join(',') + '}');
      }
    }
  }

  return errors;
}

// ---- 主流程 ----------------------------------------------------------------
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

  // tasks 校验 — 从 stdin.loops 获取（context get），非磁盘文件
  const loops = input.loops || {};
  const loopEntries = Object.entries(loops);
  let tasksErrors = [];
  if (loopEntries.length === 0) {
    tasksErrors = ['未检测到已灌入的 tasks（loops 为空）；请确认 init 节点已调用 bp-tasks set'];
  } else {
    // 取第一个有 tasks 的 loop（正常情况下仅一个）
    const [loopId, loopData] = loopEntries[0];
    tasksErrors = validateTasksArray(loopData.tasks || [], loopId);
  }

  // project-context.md 校验 — 仍为磁盘文件
  const memoryDir = path.join(input.cwd, '.harness', 'memory', 'plans');
  const ctxPath = path.join(memoryDir, 'project-context.md');
  const ctxErrors = validateContextMd(ctxPath);

  if (tasksErrors.length === 0 && ctxErrors.length === 0) {
    emit(true, 'Init 校验通过：tasks（via loops）+ project-context.md 均合格');
  }

  const parts = [];
  if (tasksErrors.length) parts.push('tasks: ' + tasksErrors.join('；'));
  if (ctxErrors.length) parts.push('project-context.md: ' + ctxErrors.join('；'));
  emit(false, parts.join(' | '));
})();
