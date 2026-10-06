#!/usr/bin/env node
// pack.mjs — walk a directory, apply .aiignore, emit a packed document to stdout.
import { readdir, readFile, open } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import * as P from '../../packer.mjs';

const ROOT = resolve(process.argv[2] || '.');
const OUTPUT_FILE = process.env.PACK_OUTPUT || 'ai_workspace.md';
const FORMAT = process.env.PACK_FORMAT || 'markdown';

const DEFAULT_IGNORE = `.git
node_modules
.env
.env.*
dist
build
out
.next
.nuxt
coverage
.cache
__pycache__
.venv
venv
target
vendor
*.jpg
*.jpeg
*.png
*.gif
*.webp
*.ico
*.pdf
*.zip
*.tar
*.gz
*.exe
*.dll
*.so
*.dylib
*.woff
*.woff2
*.ttf
*.eot
package-lock.json
yarn.lock
pnpm-lock.yaml
bun.lockb
Cargo.lock
poetry.lock
Gemfile.lock
composer.lock`;

async function readIgnoreRules() {
  if (process.env.PACK_IGNORE) return process.env.PACK_IGNORE;
  try { return await readFile(join(ROOT, '.aiignore'), 'utf8'); }
  catch { return DEFAULT_IGNORE; }
}

async function looksBinary(fullPath) {
  try {
    const fh = await open(fullPath, 'r');
    const buf = Buffer.alloc(8192);
    const { bytesRead } = await fh.read(buf, 0, 8192, 0);
    await fh.close();
    for (let i = 0; i < bytesRead; i++) if (buf[i] === 0) return true;
    return false;
  } catch { return true; }
}

async function walk(dir, rules, out) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    const rel = relative(ROOT, full).split(sep).join('/');
    if (P.isIgnored(rel, rules, OUTPUT_FILE)) continue;
    if (entry.isDirectory()) await walk(full, rules, out);
    else if (entry.isFile()) out.push({ path: rel, fullPath: full });
  }
  return out;
}

const rules = P.parseIgnoreRules(await readIgnoreRules());
const allFiles = await walk(ROOT, rules, []);

const virtual = [];
let skippedBinary = 0;
for (const f of allFiles) {
  if (await looksBinary(f.fullPath)) { skippedBinary++; continue; }
  try { virtual.push({ path: f.path, content: await readFile(f.fullPath, 'utf8') }); }
  catch (e) { process.stderr.write(`skip ${f.path}: ${e.message}\n`); }
}

virtual.sort((a, b) => a.path.localeCompare(b.path));

process.stderr.write(`packed ${virtual.length} files (${skippedBinary} binary skipped)\n`);
process.stdout.write(P.generatePackedOutput(virtual, FORMAT));
