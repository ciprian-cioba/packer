#!/usr/bin/env node
// apply.mjs — read an AI response from stdin, extract files, write to $REPO_ROOT.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import * as P from '../../packer.mjs';

const ROOT = resolve(process.env.REPO_ROOT || process.cwd());

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

const body = await readStdin();
if (!body.trim()) { process.stderr.write('empty input\n'); process.exit(0); }

const { src, map } = P.unpackAuto(body);
const paths = Object.keys(map);
if (paths.length === 0) { process.stderr.write('no files extracted\n'); process.exit(0); }

let written = 0, skipped = 0;
for (const [path, content] of Object.entries(map)) {
  if (!P.isSafeRelativePath(path)) {
    process.stderr.write(`skip unsafe path: ${path}\n`); skipped++; continue;
  }
  const full = resolve(ROOT, path);
  if (!full.startsWith(ROOT + sep) && full !== ROOT) {
    process.stderr.write(`skip path escape: ${path}\n`); skipped++; continue;
  }
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, content);
  process.stderr.write(`write ${path} (${content.length} bytes)\n`);
  written++;
}
process.stderr.write(`done: ${written} written, ${skipped} skipped, source=${src}\n`);
