/* =====================================================================
   FORMAT SELECTION
   ===================================================================== */
const FORMAT_INFO = {
  markdown: {
    ext: 'md',
    desc: 'Fenced code blocks with <code>path=</code> in the info string. Paths and no-EOL files are encoded so bytes round-trip exactly. Best choice for AI context.'
  },
  html: {
    ext: 'html',
    desc: 'Legacy <code>&lt;div class="file-document"&gt;</code> format. Entity-encoded; byte-exact. ~10–20% larger on code-heavy repos.'
  },
  delimited: {
    ext: 'txt',
    desc: 'Plain <code>=== FILE: path ===</code> markers. Files without a trailing newline use <code>=== NOEOL FILE: path ===</code>. Delimiter length auto-escalates on collision.'
  }
};
function setFormat(fmt) {
  AppState.packedFormat = fmt;
  document.querySelectorAll('.fmt-btn').forEach(btn => {
    const active = btn.dataset.fmt === fmt;
    btn.className = `fmt-btn px-3 py-3 rounded-xl border text-left transition-all ${
      active ? 'border-brand-500 bg-brand-600/20 text-brand-200'
             : 'border-slate-700 hover:border-slate-600 text-slate-300'
    }`;
  });
  document.getElementById('formatDesc').innerHTML = FORMAT_INFO[fmt].desc;
  const nameInput = document.getElementById('outputFilenameInput');
  const base = nameInput.value.replace(/\.[^.]+$/, '') || 'ai_workspace';
  nameInput.value = `${base}.${FORMAT_INFO[fmt].ext}`;
}

/* =====================================================================
   PACKERS
   ===================================================================== */

/* ---------- Markdown ---------- */
function fenceFor(content, infoLine) {
  const scan = content + '\n' + (infoLine || '');
  const longestRun = (ch) => {
    let max = 0, run = 0;
    for (let i = 0; i < scan.length; i++) {
      if (scan[i] === ch) { run++; if (run > max) max = run; }
      else run = 0;
    }
    return max;
  };
  const bt = longestRun('`');
  const infoHasBacktick = (infoLine || '').includes('`');
  if (bt < 10 && !infoHasBacktick) return { char: '`', len: Math.max(3, bt + 1) };
  const td = longestRun('~');
  return { char: '~', len: Math.max(3, td + 1) };
}
function infoPathToken(path) {
  if (/^[^\s"'`=\\]+$/.test(path)) return 'path=' + path;
  return 'path="' + escapeInfoValue(path) + '"';
}

function packMarkdown(fileList) {
  const header =
`# Codebase

Each file is a fenced code block. The opening fence carries \`path=<relative path>\` in its info string.

If a file does **not** end with a newline, the info string also contains the flag \`noeol\`. Preserve that flag if you re-emit the block, and do not add a trailing newline to the file.

When you propose changes, reply using the same convention: one fenced block per changed file, with \`path=<relative path>\` in the info string. Only include files you are actually changing.

`;
  let out = header;
  for (const f of fileList) {
    const path = canonicalPath(f.path);
    const lang = langFor(path);
    const infoParts = [lang, infoPathToken(path)];

    let body = f.content;
    if (body.length && !body.endsWith('\n')) {
      infoParts.push('noeol');
      body += '\n';
    }

    const infoLine = infoParts.filter(Boolean).join(' ');
    const { char, len } = fenceFor(f.content, infoLine);
    const fence = char.repeat(len);
    out += `${fence}${infoLine}\n${body}${fence}\n\n`;
  }
  return out;
}

/* ---------- Delimited ---------- */
function encodeDelimPath(path) {
  if (/^[^\s"'`=\\]+$/.test(path)) return path;
  return '"' + escapeInfoValue(path) + '"';
}
function decodeDelimPath(raw) {
  const m = raw.match(/^"((?:[^"\\]|\\.)*)"$/);
  if (m) return unescapeInfoValue(m[1]);
  return raw;
}

function chooseDelimiter(fileList) {
  const openerRe = /^=+ (?:NOEOL )?FILE: .+ =+$/;
  for (let level = 0; level < 8; level++) {
    const eq = '='.repeat(3 + level);
    const closeExact = eq + ' END FILE ' + eq;
    let ok = true;
    outer:
    for (const f of fileList) {
      const encodedPath = encodeDelimPath(canonicalPath(f.path));
      if (encodedPath.includes(closeExact)) { ok = false; break outer; }
      for (const line of f.content.split('\n')) {
        const t = line.trim();
        if (t === closeExact) { ok = false; break outer; }
        if (openerRe.test(t)) {
          const m = t.match(/^(=+) /);
          if (m && m[1].length <= eq.length) { ok = false; break outer; }
        }
      }
    }
    if (ok) return eq;
  }
  return null;
}

function packDelimited(fileList) {
  const eq = chooseDelimiter(fileList) || '='.repeat(11);
  let out =
`# Codebase
Each file is delimited by "${eq} FILE: <path> ${eq}" and "${eq} END FILE ${eq}".
Files without a trailing newline use "${eq} NOEOL FILE: <path> ${eq}" instead.

`;
  for (const f of fileList) {
    const encodedPath = encodeDelimPath(canonicalPath(f.path));
    let body = f.content;
    let opener;
    if (body.length && !body.endsWith('\n')) {
      body += '\n';
      opener = `${eq} NOEOL FILE: ${encodedPath} ${eq}`;
    } else {
      opener = `${eq} FILE: ${encodedPath} ${eq}`;
    }
    out += `${opener}\n${body}${eq} END FILE ${eq}\n\n`;
  }
  return out;
}

/* ---------- HTML ---------- */
function packHTML(fileList) {
  let out = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>AI Codebase Workspace</title>
</head>
<body>
<div id="ai-instructions">
<h1>Instructions for AI Agent</h1>
<p>This document contains a consolidated codebase. Each file is wrapped in a <code>&lt;div class="file-document" data-path="..."&gt;</code> block.</p>
<p><strong>Your Task:</strong>
1. Read the provided codebase to understand context.
2. When providing code modifications, output your response using the EXACT same HTML structure: <code>&lt;div class="file-document" data-path="relative/path/here"&gt;...&lt;/div&gt;</code>.
3. A local parser will extract these tags based on the <code>data-path</code> attribute and automatically split/overwrite local files.
</p>
</div>
<div id="codebase">
`;
  for (const f of fileList) {
    const path = canonicalPath(f.path);
    out += `<div class="file-document" data-path="${escapeAttr(path)}"><pre><code class="language-plaintext">${escapeHTML(f.content)}</code></pre></div>\n`;
  }
  out += `</div>
</body>
</html>`;
  return out;
}

function generatePackedOutput(fileList, format) {
  if (format === 'html') return packHTML(fileList);
  if (format === 'delimited') return packDelimited(fileList);
  return packMarkdown(fileList);
}

/* =====================================================================
   UNPACKERS
   ===================================================================== */

function parsePathFromInfo(info) {
  if (!info) return null;
  const m = info.match(/(?:^|\s)(?:path|file|filename)=("((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+))/i);
  if (m) {
    if (m[2] !== undefined) return unescapeInfoValue(m[2]);
    if (m[3] !== undefined) return m[3];
    if (m[4] !== undefined) return m[4];
  }
  const tokens = info.split(/\s+/).filter(Boolean);
  for (const t of tokens) if (/[\/\\]/.test(t)) return t;
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (/\.\w{1,8}$/.test(tokens[i])) return tokens[i];
  }
  return null;
}

function infoHasNoEOL(info) {
  if (!info) return false;
  // Remove the path value entirely so a filename that happens to contain the
  // token `noeol` can't be mistaken for the flag.
  const stripped = info.replace(
    /(?:^|\s)(?:path|file|filename)=(?:"(?:[^"\\]|\\.)*"|'[^']*'|\S+)/i, ' ');
  return /(?:^|\s)noeol(?:\s|$)/i.test(stripped);
}

function parseMarkdown(text) {
  const lines = text.split('\n');
  const files = {};
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(/^(`{3,}|~{3,})(.*)$/);
    if (!m) { i++; continue; }

    const fenceChar = m[1][0];
    const fenceLen = m[1].length;
    const info = m[2].trim();
    const path = parsePathFromInfo(info);
    const noeol = infoHasNoEOL(info);

    let j = i + 1;
    const body = [];
    let closed = false;
    while (j < lines.length) {
      const cm = lines[j].match(/^(`{3,}|~{3,})\s*$/);
      if (cm && cm[1][0] === fenceChar && cm[1].length >= fenceLen) { closed = true; break; }
      body.push(lines[j]);
      j++;
    }

    if (closed && path) {
      // Body between the fences always carries the \n that separated it from
      // the closing fence. Add it back explicitly.
      let content = body.length ? body.join('\n') + '\n' : '';
      if (noeol && content.endsWith('\n')) content = content.slice(0, -1);
      files[canonicalPath(path)] = content;
      i = j + 1;
      continue;
    }
    i = closed ? j + 1 : i + 1;
  }
  return files;
}

function parseDelimited(text) {
  const lines = text.split('\n');
  const files = {};
  let i = 0;
  while (i < lines.length) {
    const t = lines[i].trim();
    const m = t.match(/^(=+) (NOEOL\s+)?FILE: (.+?) \1$/);
    if (!m) { i++; continue; }

    const eq = m[1];
    const noeol = !!m[2];
    const encodedPath = m[3];
    const path = decodeDelimPath(encodedPath);
    const close = eq + ' END FILE ' + eq;

    const body = [];
    let j = i + 1;
    let closed = false;
    while (j < lines.length) {
      if (lines[j].trim() === close) { closed = true; break; }
      body.push(lines[j]);
      j++;
    }
    if (closed) {
      let content = body.length ? body.join('\n') + '\n' : '';
      if (noeol && content.endsWith('\n')) content = content.slice(0, -1);
      files[canonicalPath(path)] = content;
      i = j + 1;
      continue;
    }
    i++;
  }
  return files;
}

function parseHTMLFiles(text) {
  const doc = new DOMParser().parseFromString(text, 'text/html');
  const files = {};
  doc.querySelectorAll('.file-document').forEach(node => {
    const path = node.getAttribute('data-path');
    if (!path) return;
    const codeNode = node.querySelector('code');
    files[canonicalPath(path)] = codeNode ? codeNode.textContent : '';
  });
  return files;
}

function unpackAuto(text) {
  const candidates = [
    { src: 'markdown',  map: parseMarkdown(text) },
    { src: 'html',      map: parseHTMLFiles(text) },
    { src: 'delimited', map: parseDelimited(text) }
  ];
  candidates.sort((a, b) => Object.keys(b.map).length - Object.keys(a.map).length);
  return candidates[0];
}

/* =====================================================================
   DIFF
   ===================================================================== */
const DIFF_CELL_LIMIT = 1_500_000;
function computeLineDiff(a, b) {
  const al = a.split('\n'), bl = b.split('\n');
  const n = al.length, m = bl.length;
  if ((n + 1) * (m + 1) > DIFF_CELL_LIMIT) return null;
  const W = m + 1;
  const dp = new Uint32Array((n + 1) * W);
  for (let i = n - 1; i >= 0; i--) {
    const rowBase = i * W, nextBase = (i + 1) * W;
    for (let j = m - 1; j >= 0; j--) {
      dp[rowBase + j] = al[i] === bl[j] ? dp[nextBase + j + 1] + 1
        : Math.max(dp[nextBase + j], dp[rowBase + j + 1]);
    }
  }
  const ops = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (al[i] === bl[j]) { ops.push([' ', al[i]]); i++; j++; }
    else if (dp[(i + 1) * W + j] >= dp[i * W + j + 1]) { ops.push(['-', al[i]]); i++; }
    else { ops.push(['+', bl[j]]); j++; }
  }
  while (i < n) ops.push(['-', al[i++]]);
  while (j < m) ops.push(['+', bl[j++]]);
  return ops;
}
function renderDiff(ops) {
  if (!ops) return '<span class="diff-hunk">[diff too large — file exceeds the LCS budget]</span>';
  const MAX = 4000; const out = []; let shown = 0;
  for (const [op, line] of ops) {
    if (shown++ >= MAX) { out.push('<span class="diff-hunk">… output truncated …</span>'); break; }
    const cls = op === '+' ? 'diff-add' : op === '-' ? 'diff-del' : 'diff-ctx';
    out.push(`<span class="${cls}">${escapeHTML(op + line)}</span>`);
  }
  return out.join('\n');
}
