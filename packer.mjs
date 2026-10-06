// packer.mjs — pure pack/unpack logic shared by Node and the browser.
// No I/O, no DOM except a guarded DOMParser for legacy HTML unpacking.

export function canonicalPath(p) {
  return String(p).replace(/\\/g, '/').replace(/^\.\//, '');
}

export function isSafeRelativePath(p) {
  if (!p || typeof p !== 'string') return false;
  const norm = canonicalPath(p);
  if (!norm || norm.startsWith('/')) return false;
  return !norm.split('/').some(seg => seg === '..');
}

export function escapeHTML(str) {
  if (typeof str !== 'string') return '';
  let res = str
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/\r/g, '&#13;');
  if (res.startsWith('\n')) res = '&#10;' + res.slice(1);
  return res;
}

export function escapeAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escapeInfoValue(s) {
  return String(s)
    .replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    .replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
}

export function unescapeInfoValue(s) {
  return String(s).replace(/\\(.)/g, (_, c) => {
    if (c === 'n') return '\n';
    if (c === 'r') return '\r';
    if (c === 't') return '\t';
    if (c === '"') return '"';
    if (c === '\\') return '\\';
    return c;
  });
}

const LANG_MAP = {
  js:'js', mjs:'js', cjs:'js', jsx:'jsx', ts:'ts', tsx:'tsx',
  py:'python', rb:'ruby', go:'go', rs:'rust', java:'java', kt:'kotlin', swift:'swift',
  c:'c', h:'c', cpp:'cpp', cc:'cpp', cxx:'cpp', hpp:'cpp', cs:'csharp',
  php:'php', pl:'perl', lua:'lua', r:'r', scala:'scala', sh:'bash', bash:'bash', zsh:'bash',
  ps1:'powershell', bat:'batch', cmd:'batch',
  html:'html', htm:'html', css:'css', scss:'scss', sass:'sass', less:'less',
  json:'json', jsonc:'jsonc', yml:'yaml', yaml:'yaml', toml:'toml', ini:'ini', env:'dotenv',
  xml:'xml', svg:'xml', md:'markdown', markdown:'markdown', rst:'rst', tex:'latex',
  sql:'sql', graphql:'graphql', gql:'graphql',
  vue:'vue', svelte:'svelte', astro:'astro',
  txt:'text', log:'text', csv:'csv', tsv:'csv'
};
export function langFor(path) {
  const m = String(path).match(/\.([^./\\]+)$/);
  return m ? (LANG_MAP[m[1].toLowerCase()] || m[1].toLowerCase()) : 'text';
}

export function globToRegex(glob) {
  let g = String(glob).replace(/\\/g, '/').replace(/^\.\//, '');
  let escaped = g.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  escaped = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`(^|/)${escaped}(/|$)`);
}

export function parseIgnoreRules(raw) {
  if (!raw) return [];
  return raw.split('\n').map(r => r.trim())
    .filter(r => r.length > 0 && !r.startsWith('#'))
    .map(r => r.replace(/\/$/, ''));
}

export function isIgnored(filepath, ignoreRulesRaw, outputFilename) {
  if (!filepath) return false;
  const normPath = canonicalPath(filepath);
  if (outputFilename) {
    const normOut = canonicalPath(outputFilename);
    if (normPath === normOut || normPath.endsWith('/' + normOut)) return true;
  }
  const rules = Array.isArray(ignoreRulesRaw) ? ignoreRulesRaw : parseIgnoreRules(ignoreRulesRaw);
  for (const rule of rules) if (globToRegex(rule).test(normPath)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// PACKERS
// ---------------------------------------------------------------------------

function fenceFor(content, infoLine) {
  const scan = content + '\n' + (infoLine || '');
  const longestRun = (ch) => {
    let max = 0, run = 0;
    for (let i = 0; i < scan.length; i++) {
      if (scan[i] === ch) { run++; if (run > max) max = run; } else run = 0;
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

export function packMarkdown(fileList) {
  const header =
`# Codebase

Each file is a fenced code block. The opening fence carries \`path=<relative path>\` in its info string.

If a file does **not** end with a newline, the info string also contains the flag \`noeol\`. Preserve that flag if you re-emit the block, and do not add a trailing newline to the file.

When you propose changes, reply using the same convention: one fenced block per changed file, with \`path=<relative path>\` in the info string. Only include files you are actually changing.

`;
  let out = header;
  for (const f of fileList) {
    const path = canonicalPath(f.path);
    const infoParts = [langFor(path), infoPathToken(path)];
    let body = f.content;
    if (body.length && !body.endsWith('\n')) { infoParts.push('noeol'); body += '\n'; }
    const infoLine = infoParts.filter(Boolean).join(' ');
    const { char, len } = fenceFor(f.content, infoLine);
    const fence = char.repeat(len);
    out += `${fence}${infoLine}\n${body}${fence}\n\n`;
  }
  return out;
}

function encodeDelimPath(path) {
  if (/^[^\s"'`=\\]+$/.test(path)) return path;
  return '"' + escapeInfoValue(path) + '"';
}
function decodeDelimPath(raw) {
  const m = raw.match(/^"((?:[^"\\]|\\.)*)"$/);
  return m ? unescapeInfoValue(m[1]) : raw;
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

export function packDelimited(fileList) {
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

export function packHTML(fileList) {
  let out = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>AI Codebase Workspace</title></head>
<body>
<div id="ai-instructions">
<p>Each file is wrapped in a <code>&lt;div class="file-document" data-path="..."&gt;</code> block. Reply with the same structure.</p>
</div>
<div id="codebase">
`;
  for (const f of fileList) {
    const path = canonicalPath(f.path);
    out += `<div class="file-document" data-path="${escapeAttr(path)}"><pre><code class="language-plaintext">${escapeHTML(f.content)}</code></pre></div>\n`;
  }
  return out + `</div>\n</body>\n</html>`;
}

export function generatePackedOutput(fileList, format) {
  if (format === 'html') return packHTML(fileList);
  if (format === 'delimited') return packDelimited(fileList);
  return packMarkdown(fileList);
}

// ---------------------------------------------------------------------------
// UNPACKERS
// ---------------------------------------------------------------------------

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
  for (let i = tokens.length - 1; i >= 0; i--) if (/\.\w{1,8}$/.test(tokens[i])) return tokens[i];
  return null;
}

function infoHasNoEOL(info) {
  if (!info) return false;
  const stripped = info.replace(
    /(?:^|\s)(?:path|file|filename)=(?:"(?:[^"\\]|\\.)*"|'[^']*'|\S+)/i, ' ');
  return /(?:^|\s)noeol(?:\s|$)/i.test(stripped);
}

export function parseMarkdown(text) {
  const lines = text.split('\n');
  const files = {};
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(/^(`{3,}|~{3,})(.*)$/);
    if (!m) { i++; continue; }
    const fenceChar = m[1][0], fenceLen = m[1].length;
    const info = m[2].trim();
    const path = parsePathFromInfo(info);
    const noeol = infoHasNoEOL(info);
    let j = i + 1;
    const body = [];
    let closed = false;
    while (j < lines.length) {
      const cm = lines[j].match(/^(`{3,}|~{3,})\s*$/);
      if (cm && cm[1][0] === fenceChar && cm[1].length >= fenceLen) { closed = true; break; }
      body.push(lines[j]); j++;
    }
    if (closed && path) {
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

export function parseDelimited(text) {
  const lines = text.split('\n');
  const files = {};
  let i = 0;
  while (i < lines.length) {
    const t = lines[i].trim();
    const m = t.match(/^(=+) (NOEOL\s+)?FILE: (.+?) \1$/);
    if (!m) { i++; continue; }
    const eq = m[1], noeol = !!m[2];
    const path = decodeDelimPath(m[3]);
    const close = eq + ' END FILE ' + eq;
    const body = [];
    let j = i + 1;
    let closed = false;
    while (j < lines.length) {
      if (lines[j].trim() === close) { closed = true; break; }
      body.push(lines[j]); j++;
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

export function parseHTMLFiles(text) {
  if (typeof DOMParser === 'undefined') return {};
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

export function unpackAuto(text) {
  const candidates = [
    { src: 'markdown',  map: parseMarkdown(text) },
    { src: 'html',      map: parseHTMLFiles(text) },
    { src: 'delimited', map: parseDelimited(text) },
  ];
  candidates.sort((a, b) => Object.keys(b.map).length - Object.keys(a.map).length);
  return candidates[0];
}