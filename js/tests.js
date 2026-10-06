/* =====================================================================
   PROPERTY TESTS
   ===================================================================== */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const CHARSET = [
  'a','b','c','x','y','z','0','1','9','_','-',
  ' ','\t','\n','\r\n','\r',
  '<','>','&','"',"'",'/','\\','`','~','=','*','#','$','{','}','(',')','[',']',';',':','.',',',
  '🔥','漢','λ','é','\u00A0'
];
const NASTY_TOKENS = [
  '```', '````', '```js', '~~~', '~~~~',
  '=== END FILE ===', '===== END FILE =====', '=== FILE: x ===', '=== NOEOL FILE: x ===',
  '</code></pre></div>', '<div class="file-document" data-path="x">',
  '&#13;', '&amp;lt;', '&quot;', '<!-- -->',
  '\n\n\n', '   \t  ', 'path=injected.js', 'noeol'
];
function randContent(rng, maxLen) {
  const len = Math.floor(rng() * maxLen);
  let s = '';
  for (let i = 0; i < len; i++) {
    if (rng() < 0.08) s += NASTY_TOKENS[Math.floor(rng() * NASTY_TOKENS.length)];
    else s += CHARSET[Math.floor(rng() * CHARSET.length)];
  }
  return s;
}
function randPath(rng) {
  const segs = [];
  const n = 1 + Math.floor(rng() * 3);
  const pool = ['src', 'lib', 'a', 'b', 'my dir', 'x_y', '.hidden', 'node_modules', 'pkg'];
  for (let i = 0; i < n; i++) segs.push(pool[Math.floor(rng() * pool.length)]);
  const names = ['index', 'main', 'app', 'util', 'test', 'README'];
  const exts = ['js', 'ts', 'py', 'md', 'txt', 'json'];
  segs.push(names[Math.floor(rng() * names.length)] + '.' + exts[Math.floor(rng() * exts.length)]);
  const sep = rng() < 0.5 ? '/' : '\\';
  return segs.join(sep);
}
function dedupeByCanonical(files) {
  const seen = new Set(); const out = [];
  for (const f of files) {
    const p = canonicalPath(f.path);
    if (seen.has(p)) continue;
    seen.add(p); out.push({ path: f.path, content: f.content });
  }
  return out;
}

function testHTMLRoundTrip() {
  const rng = mulberry32(0xC0FFEE);
  for (let iter = 0; iter < 25; iter++) {
    const n = 1 + Math.floor(rng() * 4);
    const files = [];
    for (let i = 0; i < n; i++) files.push({ path: `f${i}_${iter}.txt`, content: randContent(rng, 400) });
    const map = parseHTMLFiles(packHTML(files));
    for (const f of files) {
      if (!(f.path in map)) throw new Error(`missing ${f.path} (iter ${iter})`);
      if (map[f.path] !== f.content) throw new Error(`byte mismatch in ${f.path} (iter ${iter})`);
    }
  }
}
function testMarkdownRoundTrip() {
  const rng = mulberry32(0xBEEF);
  for (let iter = 0; iter < 25; iter++) {
    const n = 1 + Math.floor(rng() * 4);
    const files = [];
    for (let i = 0; i < n; i++) files.push({ path: randPath(rng), content: randContent(rng, 400) });
    const deduped = dedupeByCanonical(files);
    const map = parseMarkdown(packMarkdown(deduped));
    for (const f of deduped) {
      const key = canonicalPath(f.path);
      if (!(key in map)) throw new Error(`markdown lost ${key} (iter ${iter})`);
      if (map[key] !== f.content) {
        throw new Error(`markdown mismatch ${key} (iter ${iter}): expected ${JSON.stringify(f.content.slice(0,80))}, got ${JSON.stringify(map[key].slice(0,80))}`);
      }
    }
  }
}
function testDelimitedRoundTrip() {
  const rng = mulberry32(0xF00D);
  for (let iter = 0; iter < 25; iter++) {
    const n = 1 + Math.floor(rng() * 4);
    const files = [];
    for (let i = 0; i < n; i++) files.push({ path: randPath(rng), content: randContent(rng, 400) });
    const deduped = dedupeByCanonical(files);
    const map = parseDelimited(packDelimited(deduped));
    for (const f of deduped) {
      const key = canonicalPath(f.path);
      if (!(key in map)) throw new Error(`delimited lost ${key} (iter ${iter})`);
      if (map[key] !== f.content) {
        throw new Error(`delimited mismatch ${key} (iter ${iter}): expected ${JSON.stringify(f.content.slice(0,80))}, got ${JSON.stringify(map[key].slice(0,80))}`);
      }
    }
  }
}
function testNoEOLPreservation() {
  const cases = [
    { path: 'a.txt', content: '' },
    { path: 'b.txt', content: 'a' },
    { path: 'c.txt', content: 'a\n' },
    { path: 'd.txt', content: 'a\n\n' },
    { path: 'e.txt', content: '\n' },
    { path: 'f.txt', content: 'a\r' },
    { path: 'g.txt', content: 'a\r\n' },
    { path: 'h.txt', content: 'trailing spaces  ' },
    { path: 'my-noeol-file.js', content: 'x' },
    { path: 'a\nb', content: 'no terminal newline here' }
  ];
  for (const [name, pack, parse] of [
    ['markdown',  packMarkdown,  parseMarkdown],
    ['delimited', packDelimited, parseDelimited],
  ]) {
    const map = parse(pack(cases));
    for (const c of cases) {
      const key = canonicalPath(c.path);
      if (!(key in map)) throw new Error(`${name}: missing ${key}`);
      if (map[key] !== c.content) {
        throw new Error(`${name}: ${key} — expected ${JSON.stringify(c.content)}, got ${JSON.stringify(map[key])}`);
      }
    }
  }
}
function testFenceEscalation() {
  const cases = [
    { path: 'a.js',    content: '```\ninside\n```\n' },
    { path: 'b.js',    content: '````\nfour\n````\n' },
    { path: 'c.txt',   content: '~~~\ntilde\n~~~\n' },
    { path: 'd.md',    content: '```js path=evil.js\nfake block\n```\n' },
    { path: 'e.txt',   content: '=== END FILE ===\n' },
    { path: 'f.txt',   content: '===== END FILE =====\n' },
    { path: 'g.txt',   content: '=== FILE: fake.js ===\nnot a real file\n' },
    { path: 'h.txt',   content: '=== NOEOL FILE: fake.js ===\nnot real\n' },
    { path: 'my dir/i.txt', content: 'space in path\n' }
  ];
  const m1 = parseMarkdown(packMarkdown(cases));
  for (const c of cases) {
    const key = canonicalPath(c.path);
    if (!(key in m1)) throw new Error(`markdown lost ${key}`);
    if (m1[key] !== c.content) throw new Error(`markdown mismatch ${key}: ${JSON.stringify(m1[key])}`);
  }
  const m2 = parseDelimited(packDelimited(cases));
  for (const c of cases) {
    const key = canonicalPath(c.path);
    if (!(key in m2)) throw new Error(`delimited lost ${key}`);
    if (m2[key] !== c.content) throw new Error(`delimited mismatch ${key}: ${JSON.stringify(m2[key])}`);
  }
}
function testIgnoreMonotonicity() {
  const rng = mulberry32(12345);
  const base = ['node_modules', '*.log', 'dist'];
  const extras = ['*.test.js', 'build', '.env', 'coverage', '*.min.js', 'vendor'];
  for (let iter = 0; iter < 25; iter++) {
    const extraCount = 1 + Math.floor(rng() * extras.length);
    const rulesA = base.slice();
    const rulesB = base.concat(extras.slice(0, extraCount));
    const paths = [];
    for (let i = 0; i < 25; i++) paths.push(canonicalPath(randPath(rng)));
    paths.push('src/app.js', 'node_modules/lib/x.js', 'build/out.js', 'a/b/c.log');
    for (const p of paths) {
      const a = isIgnored(p, rulesA, 'out.md');
      const b = isIgnored(p, rulesB, 'out.md');
      if (a && !b) throw new Error(`monotonicity violated: "${p}" ignored by A but not by superset B`);
    }
  }
}
function testPathCanonicalization() {
  const rng = mulberry32(999);
  for (let iter = 0; iter < 20; iter++) {
    const raw = randPath(rng).replace(/\//g, '\\');
    if (!raw.includes('\\')) continue;
    const files = [{ path: raw, content: `iter ${iter}\n` }];
    const expected = canonicalPath(raw);
    for (const [name, pack, parse] of [
      ['markdown',  packMarkdown,  parseMarkdown],
      ['delimited', packDelimited, parseDelimited],
    ]) {
      const map = parse(pack(files));
      if (!(expected in map)) throw new Error(`${name}: expected key "${expected}", got ${JSON.stringify(Object.keys(map))}`);
    }
    const map = parseHTMLFiles(packHTML(files));
    if (!(expected in map)) throw new Error(`html: expected key "${expected}"`);
  }
}
function testSelfExclusion() {
  const files = [
    { path: 'index.js', content: 'console.log(1);\n' },
    { path: 'ai_workspace.md', content: 'old output\n' },
    { path: 'build/ai_workspace.md', content: 'build output\n' },
    { path: 'deep/nested/ai_workspace.md', content: 'nested\n' }
  ];
  const keep = files.filter(f => !isIgnored(f.path, [], 'ai_workspace.md'));
  if (keep.length !== 1 || keep[0].path !== 'index.js') throw new Error(`self-exclusion kept: ${keep.map(f => f.path).join(', ')}`);
  for (const [name, pack, parse] of [
    ['markdown',  packMarkdown,  parseMarkdown],
    ['delimited', packDelimited, parseDelimited],
  ]) {
    const map = parse(pack(keep));
    if ('ai_workspace.md' in map || 'build/ai_workspace.md' in map) {
      throw new Error(`${name}: output file leaked into packed result`);
    }
  }
}
function testDeterminism() {
  const rng = mulberry32(0xDEAD);
  for (let iter = 0; iter < 10; iter++) {
    const n = 1 + Math.floor(rng() * 5);
    const files = [];
    for (let i = 0; i < n; i++) files.push({ path: `p/f${i}.txt`, content: randContent(rng, 300) });
    for (const [name, pack] of [['markdown', packMarkdown], ['html', packHTML], ['delimited', packDelimited]]) {
      if (pack(files) !== pack(files)) throw new Error(`${name} is non-deterministic (iter ${iter})`);
    }
  }
}

/* ---------- Packer console report ---------- */
function testPackerConsoleReport() {
  // formatBytes() is the size formatter used throughout the packing console
  // (per-file recap lines, Σ total, and the final ✅ summary).
  const cases = [
    [0,                    '0 B'],
    [1,                    '1 B'],
    [512,                  '512 B'],
    [1023,                 '1023 B'],
    [1024,                 '1.0 KB'],
    [1536,                 '1.5 KB'],
    [10 * 1024,            '10.0 KB'],
    [1024 * 1024,          '1.00 MB'],
    [1024 * 1024 * 2.5,    '2.50 MB'],
    [1024 * 1024 * 10.25,  '10.25 MB']
  ];
  for (const [n, want] of cases) {
    const got = formatBytes(n);
    if (got !== want) {
      throw new Error(`formatBytes(${n}) = ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);
    }
  }

  // Per-file recap line shape emitted by executePacker:
  //   `  • <path> · <size>`
  const recap = `  • src/app.js · ${formatBytes(1234)}`;
  if (!/^ {2}• \S.* · \d+(?:\.\d+)? (B|KB|MB)$/.test(recap)) {
    throw new Error(`recap line shape mismatch: ${JSON.stringify(recap)}`);
  }

  // Σ total line:
  //   `  Σ <size> across <n> file(s)`
  const sum = `  Σ ${formatBytes(4321)} across 3 file(s)`;
  if (!/^ {2}Σ \d+(?:\.\d+)? (B|KB|MB) across \d+ file\(s\)$/.test(sum)) {
    throw new Error(`summary line shape mismatch: ${JSON.stringify(sum)}`);
  }

  // Final ✅ line shape:
  //   `✅ <filename> — <n> files · <KB> KB`
  const final = `✅ ai_workspace.md — 3 files · ${(4096 / 1024).toFixed(1)} KB`;
  if (!/^✅ \S+ — \d+ files · \d+\.\d KB$/.test(final)) {
    throw new Error(`final summary shape mismatch: ${JSON.stringify(final)}`);
  }
}

/* ---------- Ignore rules ---------- */
function testIgnoreRuleParsing() {
  const raw = [
    '# comment line',
    'node_modules',
    '',
    '   ',
    '  dist  ',
    '*.log',
    'foo/',
    '# trailing comment',
    '   # indented comment'
  ].join('\n');
  const rules = parseIgnoreRules(raw);
  const want = ['node_modules', 'dist', '*.log', 'foo'];
  if (rules.length !== want.length) {
    throw new Error(`expected ${want.length} rules, got ${rules.length}: ${JSON.stringify(rules)}`);
  }
  for (let i = 0; i < want.length; i++) {
    if (rules[i] !== want[i]) {
      throw new Error(`rule ${i}: expected ${JSON.stringify(want[i])}, got ${JSON.stringify(rules[i])}`);
    }
  }
  if (parseIgnoreRules('').length !== 0)            throw new Error('empty string should yield no rules');
  if (parseIgnoreRules(null).length !== 0)          throw new Error('null should yield no rules');
  if (parseIgnoreRules('   \n\n').length !== 0)     throw new Error('whitespace-only should yield no rules');
  if (parseIgnoreRules('# a\n# b').length !== 0)    throw new Error('comment-only should yield no rules');
}

function testIgnoreGlobWildcards() {
  const check = (path, rule, expected) => {
    const got = isIgnored(path, [rule], null);
    if (got !== expected) {
      throw new Error(`isIgnored(${JSON.stringify(path)}, [${JSON.stringify(rule)}]) = ${got}, expected ${expected}`);
    }
  };

  // `*` matches any run (including path separators under this implementation)
  check('a.log',           '*.log', true);
  check('a/b/c.log',       '*.log', true);
  check('a.logo',          '*.log', false);
  check('log',             '*.log', false);
  check('src/lib/file.js', 'src/*', true);
  check('src',             'src/*', false);

  // `?` matches exactly one character
  check('a.txt',  '?.txt', true);
  check('ab.txt', '?.txt', false);
  check('a/b.txt','?.txt', true);
  check('a/bc.txt','?.txt', false);
}

function testIgnoreAnchorBoundaries() {
  const check = (path, rule, expected) => {
    const got = isIgnored(path, [rule], null);
    if (got !== expected) {
      throw new Error(`isIgnored(${JSON.stringify(path)}, [${JSON.stringify(rule)}]) = ${got}, expected ${expected}`);
    }
  };

  // Matches must align with path-segment boundaries
  check('node_modules',            'node_modules', true);
  check('node_modules/x.js',       'node_modules', true);
  check('src/node_modules/x.js',   'node_modules', true);
  check('mynode_modules',          'node_modules', false);
  check('node_modules_backup',     'node_modules', false);
  check('node_modules.bak',        'node_modules', false);
  check('deep/node_modules_old/x', 'node_modules', false);

  // Multi-segment patterns must match whole segments
  check('foo/bar',        'foo/bar', true);
  check('foo/bar/baz.js', 'foo/bar', true);
  check('foo/bar.txt',    'foo/bar', false);
  check('foo/barista',    'foo/bar', false);
  check('x/foo/bar',      'foo/bar', true);
}

function testDefaultIgnoreRules() {
  const rules = parseIgnoreRules(DEFAULT_IGNORE);

  const shouldIgnore = [
    // VCS / dirs
    '.git/HEAD', 'sub/.git/config',
    'node_modules', 'node_modules/react/index.js', 'src/node_modules/x.js',
    // env
    '.env', '.env.local', '.env.production',
    // build outputs
    'dist/bundle.js', 'build/out.js', 'out/app.js',
    '.next/server/page.js', '.nuxt/app.js',
    'coverage/lcov.info', '.cache/foo.json',
    '__pycache__/mod.pyc', '.venv/bin/python', 'venv/bin/activate',
    'target/debug/app', 'vendor/lib.php',
    // images / binaries
    'image.png', 'photo.jpg', 'pic.jpeg', 'anim.gif', 'hero.webp', 'favicon.ico',
    'doc.pdf', 'archive.zip', 'backup.tar', 'data.gz',
    'app.exe', 'lib.dll', 'lib.so', 'lib.dylib',
    'font.woff', 'font.woff2', 'font.ttf', 'font.eot',
    // lockfiles
    'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb',
    'Cargo.lock', 'poetry.lock', 'Gemfile.lock', 'composer.lock',
    // packer self-exclusion + tooling
    'packer.mjs', 'packer.test.mjs',
    '.github/workflows/ci.yml'
  ];
  for (const p of shouldIgnore) {
    if (!isIgnored(p, rules, null)) {
      throw new Error(`DEFAULT_IGNORE did not ignore: ${p}`);
    }
  }

  const shouldKeep = [
    'index.js', 'src/app.js', 'README.md', 'docs/guide.md', 'style.css',
    'package.json', 'Cargo.toml', '.gitignore',
    'src/venv_setup.sh',   // substring `venv` inside a longer segment
    'build.rs',            // matches `build` only if the next char is `/` or end
    'dist-info/entry.txt'  // matches `dist` only as a full segment
  ];
  for (const p of shouldKeep) {
    if (isIgnored(p, rules, null)) {
      throw new Error(`DEFAULT_IGNORE incorrectly ignored: ${p}`);
    }
  }
}

function testIgnoreRuleUnion() {
  // Multiple rules compose as a union: a path is ignored if ANY rule matches.
  const rules = ['node_modules', '*.log', 'dist'];
  const ignored = ['node_modules/x.js', 'a/b/c.log', 'dist/out.js', 'deep/node_modules/y'];
  const kept    = ['src/app.js', 'notes.txt', 'my_module/x.js', 'dist-info/entry.txt'];
  for (const p of ignored) {
    if (!isIgnored(p, rules, null)) throw new Error(`union: expected ignored ${p}`);
  }
  for (const p of kept) {
    if (isIgnored(p, rules, null)) throw new Error(`union: expected kept ${p}`);
  }
}

const TEST_SUITE = [
  { name: 'HTML byte-exact round-trip (25 iterations)',         fn: testHTMLRoundTrip },
  { name: 'Markdown round-trip (25 iterations)',                fn: testMarkdownRoundTrip },
  { name: 'Plain-delimited round-trip (25 iterations)',         fn: testDelimitedRoundTrip },
  { name: 'No-EOL preservation (10 edge cases × 2 formats)',    fn: testNoEOLPreservation },
  { name: 'Fence & delimiter escalation',                       fn: testFenceEscalation },
  { name: 'Ignore-rule monotonicity',                           fn: testIgnoreMonotonicity },
  { name: 'Path canonicalization (Windows backslashes)',        fn: testPathCanonicalization },
  { name: 'Output-file self-exclusion',                         fn: testSelfExclusion },
  { name: 'Serialization determinism',                          fn: testDeterminism },
  { name: 'Packer console report (formatBytes + line shape)',   fn: testPackerConsoleReport },
  { name: 'Ignore-rule parsing (comments, blanks, trailing /)', fn: testIgnoreRuleParsing },
  { name: 'Ignore glob wildcards (* and ?)',                    fn: testIgnoreGlobWildcards },
  { name: 'Ignore anchor boundaries (segment-aligned matching)',fn: testIgnoreAnchorBoundaries },
  { name: 'Default ignore rules (DEFAULT_IGNORE coverage)',     fn: testDefaultIgnoreRules },
  { name: 'Ignore rule union (multiple patterns compose)',      fn: testIgnoreRuleUnion }
];

function runAllPropertyTests() {
  const container = document.getElementById('testResultsList');
  container.innerHTML = '';
  let passed = 0;
  const t0 = performance.now();
  TEST_SUITE.forEach((tc, idx) => {
    let result;
    try { tc.fn(); result = { passed: true, message: 'All invariants held.' }; passed++; }
    catch (err) { result = { passed: false, message: err.message }; }
    renderTestResultCard(idx + 1, tc.name, result);
  });
  const elapsed = (performance.now() - t0).toFixed(0);
  const icon = document.getElementById('testStatusIcon');
  const title = document.getElementById('testStatusTitle');
  const desc = document.getElementById('testStatusDesc');
  const badge = document.getElementById('testScoreBadge');
  const navBadge = document.getElementById('navTestBadge');
  badge.textContent = `${passed} / ${TEST_SUITE.length}`;
  if (passed === TEST_SUITE.length) {
    icon.className = 'w-9 h-9 rounded-full flex items-center justify-center bg-emerald-950 border border-emerald-600 text-emerald-400';
    icon.innerHTML = '<i class="fa-solid fa-check"></i>';
    title.textContent = 'All property tests passed';
    title.className = 'text-sm font-bold text-emerald-400';
    desc.textContent = `Verified in ${elapsed} ms — byte-exact round-trip, monotonicity, and determinism hold.`;
    navBadge.className = 'px-1.5 py-0.5 text-[10px] rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700';
    navBadge.textContent = `${passed}/${TEST_SUITE.length}`;
  } else {
    icon.className = 'w-9 h-9 rounded-full flex items-center justify-center bg-rose-950 border border-rose-600 text-rose-400';
    icon.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    title.textContent = 'Property test failures detected';
    title.className = 'text-sm font-bold text-rose-400';
    desc.textContent = 'Review the diagnostic errors below.';
    navBadge.className = 'px-1.5 py-0.5 text-[10px] rounded-full bg-rose-950 text-rose-300 border border-rose-700';
    navBadge.textContent = `${passed}/${TEST_SUITE.length}`;
  }
}
function renderTestResultCard(num, title, result) {
  const container = document.getElementById('testResultsList');
  const card = document.createElement('div');
  const bg = result.passed ? 'bg-slate-950/80 border-slate-800' : 'bg-rose-950/30 border-rose-800/80';
  const icon = result.passed ? '<i class="fa-solid fa-circle-check text-emerald-400"></i>' : '<i class="fa-solid fa-circle-xmark text-rose-400"></i>';
  card.className = `p-4 rounded-xl border ${bg} transition-all`;
  card.innerHTML = `
    <div class="flex items-start justify-between gap-3">
      <div class="flex items-start gap-3 min-w-0">
        <div class="mt-0.5 text-base">${icon}</div>
        <div class="min-w-0">
          <h4 class="text-xs font-bold text-slate-200">${num}. ${escapeHTML(title)}</h4>
          <p class="text-[11px] text-slate-400 mt-1 font-mono break-words">${escapeHTML(result.message)}</p>
        </div>
      </div>
      <span class="text-[10px] font-bold px-2 py-0.5 rounded shrink-0 ${
        result.passed ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                      : 'bg-rose-950 text-rose-400 border border-rose-800'
      }">${result.passed ? 'PASSED' : 'FAILED'}</span>
    </div>`;
  container.appendChild(card);
}