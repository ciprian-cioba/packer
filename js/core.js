/* =====================================================================
   TOASTS + TABS
   ===================================================================== */
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  const bg = {
    success: 'bg-emerald-950 border-emerald-600 text-emerald-200',
    error:   'bg-rose-950 border-rose-600 text-rose-200',
    info:    'bg-slate-900 border-slate-700 text-slate-200'
  };
  const icon = {
    success: '<i class="fa-solid fa-circle-check text-emerald-400"></i>',
    error:   '<i class="fa-solid fa-circle-xmark text-rose-400"></i>',
    info:    '<i class="fa-solid fa-circle-info text-brand-400"></i>'
  };
  toast.className = `pointer-events-auto flex items-start gap-2.5 px-4 py-3 rounded-xl border shadow-2xl text-xs font-medium transition-all transform translate-y-2 opacity-0 ${bg[type] || bg.info}`;
  toast.innerHTML = `${icon[type] || icon.info}<span class="break-words">${escapeHTML(message)}</span>`;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.remove('translate-y-2', 'opacity-0'));
  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function switchTab(tabName) {
  ['packer', 'unpacker', 'tests'].forEach(t => {
    const el = document.getElementById(t + 'Tab');
    const btn = document.getElementById('tabBtn' + t.charAt(0).toUpperCase() + t.slice(1));
    if (t === tabName) {
      el.classList.remove('hidden');
      btn.className = 'px-3 sm:px-4 py-1.5 rounded-lg transition-all flex items-center gap-2 bg-brand-600 text-white shadow-sm';
    } else {
      el.classList.add('hidden');
      btn.className = 'px-3 sm:px-4 py-1.5 rounded-lg transition-all flex items-center gap-2 text-slate-400 hover:text-slate-200';
    }
  });
}

/* =====================================================================
   CORE UTILITIES
   ===================================================================== */
function escapeHTML(str) {
  if (typeof str !== 'string') return '';
  let res = str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\r/g, '&#13;');
  if (res.startsWith('\n')) res = '&#10;' + res.slice(1);
  return res;
}

function escapeAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Escape a value that will be embedded inside an info-string / delimited-line.
 * Backslash MUST be escaped first so we don't double-escape.
 */
function escapeInfoValue(s) {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

/** Inverse of escapeInfoValue. Single pass — each backslash consumes one char. */
function unescapeInfoValue(s) {
  return String(s).replace(/\\(.)/g, (_, c) => {
    if (c === 'n') return '\n';
    if (c === 'r') return '\r';
    if (c === 't') return '\t';
    if (c === '"') return '"';
    if (c === '\\') return '\\';
    return c;
  });
}

function canonicalPath(p) {
  return String(p).replace(/\\/g, '/').replace(/^\.\//, '');
}

function isSafeRelativePath(p) {
  if (!p || typeof p !== 'string') return false;
  const norm = canonicalPath(p);
  if (!norm || norm.startsWith('/')) return false;
  return !norm.split('/').some(seg => seg === '..');
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
function langFor(path) {
  const m = String(path).match(/\.([^./\\]+)$/);
  if (!m) return 'text';
  const ext = m[1].toLowerCase();
  return LANG_MAP[ext] || ext;
}

/* ---------- Ignore rules ---------- */
function globToRegex(glob) {
  let g = String(glob).replace(/\\/g, '/').replace(/^\.\//, '');
  let escaped = g.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  escaped = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`(^|/)${escaped}(/|$)`);
}
function parseIgnoreRules(raw) {
  if (!raw) return [];
  return raw.split('\n').map(r => r.trim())
    .filter(r => r.length > 0 && !r.startsWith('#'))
    .map(r => r.replace(/\/$/, ''));
}
function isIgnored(filepath, ignoreRulesRaw, outputFilename) {
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
