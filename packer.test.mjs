// packer.test.mjs — same property tests as the browser suite, runnable via `node packer.test.mjs`.
import * as P from './packer.mjs';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const CHARSET = ['a','b','c','x','y','z','0','1','9','_','-',' ','\t','\n','\r\n','\r',
  '<','>','&','"',"'",'/','\\','`','~','=','*','#','$','{','}','(',')','[',']',';',':','.',',',
  '🔥','漢','λ','é','\u00A0'];
const NASTY = ['```','````','```js','~~~','~~~~','=== END FILE ===','===== END FILE =====',
  '=== FILE: x ===','=== NOEOL FILE: x ===','</code></pre></div>','&#13;','&quot;','\n\n\n','noeol','path=injected.js'];
function randContent(rng, maxLen) {
  const len = Math.floor(rng() * maxLen);
  let s = '';
  for (let i = 0; i < len; i++) {
    s += rng() < 0.08 ? NASTY[Math.floor(rng() * NASTY.length)] : CHARSET[Math.floor(rng() * CHARSET.length)];
  }
  return s;
}
function randPath(rng) {
  const segs = [];
  const pool = ['src','lib','a','b','my dir','x_y','.hidden','pkg'];
  for (let i = 0, n = 1 + Math.floor(rng() * 3); i < n; i++) segs.push(pool[Math.floor(rng() * pool.length)]);
  const names = ['index','main','app','util','test','README'], exts = ['js','ts','py','md','txt','json'];
  segs.push(names[Math.floor(rng() * names.length)] + '.' + exts[Math.floor(rng() * exts.length)]);
  return segs.join(rng() < 0.5 ? '/' : '\\');
}
function dedupe(files) {
  const seen = new Set(), out = [];
  for (const f of files) { const p = P.canonicalPath(f.path); if (seen.has(p)) continue; seen.add(p); out.push(f); }
  return out;
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('markdown round-trip (25 iterations)', () => {
  const rng = mulberry32(0xBEEF);
  for (let iter = 0; iter < 25; iter++) {
    const files = dedupe(Array.from({ length: 1 + Math.floor(rng() * 4) }, () => ({
      path: randPath(rng), content: randContent(rng, 400),
    })));
    const map = P.parseMarkdown(P.packMarkdown(files));
    for (const f of files) {
      const k = P.canonicalPath(f.path);
      if (!(k in map)) throw new Error(`lost ${k} (iter ${iter})`);
      if (map[k] !== f.content) throw new Error(`mismatch ${k} (iter ${iter})`);
    }
  }
});

test('delimited round-trip (25 iterations)', () => {
  const rng = mulberry32(0xF00D);
  for (let iter = 0; iter < 25; iter++) {
    const files = dedupe(Array.from({ length: 1 + Math.floor(rng() * 4) }, () => ({
      path: randPath(rng), content: randContent(rng, 400),
    })));
    const map = P.parseDelimited(P.packDelimited(files));
    for (const f of files) {
      const k = P.canonicalPath(f.path);
      if (!(k in map)) throw new Error(`lost ${k} (iter ${iter})`);
      if (map[k] !== f.content) throw new Error(`mismatch ${k} (iter ${iter})`);
    }
  }
});

test('no-EOL preservation', () => {
  const cases = [
    { path: 'a.txt', content: '' },
    { path: 'b.txt', content: 'a' },
    { path: 'c.txt', content: 'a\n' },
    { path: 'd.txt', content: 'a\n\n' },
    { path: 'e.txt', content: '\n' },
    { path: 'f.txt', content: 'a\r' },
    { path: 'g.txt', content: 'a\r\n' },
    { path: 'h.txt', content: 'trailing  ' },
    { path: 'a\nb', content: 'no terminal newline' },
  ];
  for (const [name, pack, parse] of [
    ['markdown', P.packMarkdown, P.parseMarkdown],
    ['delimited', P.packDelimited, P.parseDelimited],
  ]) {
    const map = parse(pack(cases));
    for (const c of cases) {
      const k = P.canonicalPath(c.path);
      if (map[k] !== c.content) throw new Error(`${name}: ${k} → ${JSON.stringify(map[k])}`);
    }
  }
});

test('ignore-rule monotonicity', () => {
  const rng = mulberry32(12345);
  const base = ['node_modules', '*.log', 'dist'];
  const extras = ['*.test.js', 'build', '.env', 'coverage'];
  for (let iter = 0; iter < 25; iter++) {
    const rulesA = base.slice();
    const rulesB = base.concat(extras.slice(0, 1 + Math.floor(rng() * extras.length)));
    const paths = Array.from({ length: 20 }, () => P.canonicalPath(randPath(rng)))
      .concat(['src/app.js', 'node_modules/x.js', 'build/y.js']);
    for (const p of paths) {
      if (P.isIgnored(p, rulesA, 'o.md') && !P.isIgnored(p, rulesB, 'o.md')) {
        throw new Error(`monotonicity broken: ${p}`);
      }
    }
  }
});

test('self-exclusion', () => {
  const files = [
    { path: 'index.js', content: 'x\n' },
    { path: 'ai_workspace.md', content: 'old\n' },
    { path: 'build/ai_workspace.md', content: 'b\n' },
  ];
  const keep = files.filter(f => !P.isIgnored(f.path, [], 'ai_workspace.md'));
  if (keep.length !== 1 || keep[0].path !== 'index.js') throw new Error('self-exclusion failed');
});

test('determinism', () => {
  const rng = mulberry32(0xDEAD);
  for (let i = 0; i < 10; i++) {
    const files = Array.from({ length: 1 + Math.floor(rng() * 4) }, (_, k) => ({
      path: `p/f${k}.txt`, content: randContent(rng, 300),
    }));
    for (const [name, pack] of [['md', P.packMarkdown], ['dl', P.packDelimited], ['html', P.packHTML]]) {
      if (pack(files) !== pack(files)) throw new Error(`${name} non-deterministic`);
    }
  }
});

let passed = 0, failed = 0;
for (const { name, fn } of tests) {
  try { fn(); console.log(`PASS  ${name}`); passed++; }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); failed++; }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
