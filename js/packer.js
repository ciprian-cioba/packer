/* =====================================================================
   PACKER UI
   ===================================================================== */
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
packer.mjs
packer.test.mjs
.github
composer.lock`;

function resetDefaultIgnore() {
  document.getElementById('ignoreRulesText').value = DEFAULT_IGNORE;
  showToast('Reset ignore rules to defaults', 'info');
}

async function pickProjectFolder() {
  if (FSP_SUPPORTED) {
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      AppState.projectDirHandle = handle;
      AppState.projectReadMode = 'fsp';
      await readFromDirectoryHandle(handle);
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      showToast('Folder pick failed: ' + (e && e.message || e), 'error');
      return;
    }
  }
  AppState.projectDirHandle = null;
  AppState.projectReadMode = 'input';
  document.getElementById('folderInput').click();
}

async function readFromDirectoryHandle(dirHandle) {
  const folderName = dirHandle.name;
  const files = [];
  async function recurse(dir, prefix) {
    for await (const entry of dir.values()) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.kind === 'file') {
        try {
          const file = await entry.getFile();
          files.push({ path, file });
        } catch (e) { /* skip unreadable */ }
      } else if (entry.kind === 'directory') {
        await recurse(entry, path);
      }
    }
  }
  await recurse(dirHandle, '');
  AppState.scannedFiles = files;
  renderFolderSummary(folderName, files.length);
  showToast(`Loaded ${files.length} files (read-write)`, 'info');
}

function handleFolderSelect(event) {
  const fileList = Array.from(event.target.files);
  const files = fileList.map(f => ({
    path: canonicalPath(f.webkitRelativePath || f.name),
    file: f
  }));
  AppState.scannedFiles = files;
  AppState.projectDirHandle = null;
  AppState.projectReadMode = 'input';

  let folderName = 'selected folder';
  if (files.length && files[0].path.includes('/')) {
    folderName = files[0].path.split('/')[0];
  }
  renderFolderSummary(folderName, files.length);
  showToast(`Loaded ${files.length} files (read-only)`, 'info');
}

function renderFolderSummary(name, count) {
  const box = document.getElementById('folderSummary');
  const text = document.getElementById('folderSummaryText');
  const badge = document.getElementById('folderCountBadge');
  const modeBadge = document.getElementById('folderModeBadge');

  box.classList.remove('hidden');
  text.innerHTML = `<i class="fa-solid fa-folder text-brand-500 mr-2"></i>${escapeHTML(name)}`;
  badge.textContent = `${count} files`;

  if (AppState.projectReadMode === 'fsp') {
    modeBadge.textContent = 'read-write';
    modeBadge.className = 'text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800';
  } else {
    modeBadge.textContent = 'read-only';
    modeBadge.className = 'text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700';
  }
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

async function executePacker() {
  if (AppState.scannedFiles.length === 0) {
    showToast('Please pick a folder first', 'error');
    return;
  }
  const packBtn = document.getElementById('packBtn');
  const logArea = document.getElementById('packerLogArea');
  const ignoreRules = parseIgnoreRules(document.getElementById('ignoreRulesText').value);
  const outputFilename = document.getElementById('outputFilenameInput').value.trim() || 'ai_workspace.md';
  const format = AppState.packedFormat;

  packBtn.disabled = true;
  packBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Packaging…';
  logArea.innerHTML = '';

  const log = (msg, cls = 'text-slate-400') => {
    const div = document.createElement('div');
    div.className = cls; div.textContent = msg;
    logArea.appendChild(div); logArea.scrollTop = logArea.scrollHeight;
  };

  log(`[1/4] Filtering ${AppState.scannedFiles.length} scanned files…`, 'text-brand-400 font-semibold');

  const valid = [];
  let ignoredCount = 0;
  for (const entry of AppState.scannedFiles) {
    if (isIgnored(entry.path, ignoreRules, outputFilename)) ignoredCount++;
    else valid.push(entry);
  }
  log(`[2/4] Ignored ${ignoredCount} · keeping ${valid.length}`);

  log(`[3/4] Reading ${valid.length} file(s)…`, 'text-brand-400 font-semibold');
  const virtualList = [];
  for (const entry of valid) {
    const rel = canonicalPath(entry.path);
    try {
      const content = await entry.file.text();
      virtualList.push({ path: rel, content });
      log(`  ✓ ${rel} · ${formatBytes(content.length)}`, 'text-slate-300');
    } catch (err) {
      log(`  ⚠ could not read ${rel}: ${err.message}`, 'text-amber-400');
    }
  }

  log(`[4/4] Serializing as ${format}…`, 'text-brand-400 font-semibold');

  if (format !== 'html') {
    const noNL = virtualList.filter(f => f.content.length && !f.content.endsWith('\n'));
    if (noNL.length) {
      log(`  ℹ ${noNL.length} file(s) lack a trailing newline — flagged noeol for exact round-trip`, 'text-slate-500');
    }
  }

  AppState.packedContent = generatePackedOutput(virtualList, format);
  AppState.packedFilename = outputFilename;
  AppState.lastPackedFiles = virtualList;

  document.getElementById('statTotalScanned').textContent = AppState.scannedFiles.length;
  document.getElementById('statPackedCount').textContent = virtualList.length;
  document.getElementById('statIgnoredCount').textContent = ignoredCount;
  document.getElementById('statTokens').textContent =
    '~' + Math.ceil(AppState.packedContent.length / 4).toLocaleString();

  document.getElementById('copyPackBtn').disabled = false;
  document.getElementById('downloadPackBtn').disabled = false;

  // --- Recap: list every packed file sorted by path, with sizes -------------
  log(`— Packed files (${virtualList.length}) —`, 'text-brand-400 font-semibold');
  const sorted = virtualList.slice().sort((a, b) => a.path.localeCompare(b.path));
  let totalBytes = 0;
  for (const f of sorted) {
    totalBytes += f.content.length;
    log(`  • ${f.path} · ${formatBytes(f.content.length)}`, 'text-slate-400');
  }
  log(`  Σ ${formatBytes(totalBytes)} across ${virtualList.length} file(s)`, 'text-slate-500');

  log(`✅ ${outputFilename} — ${virtualList.length} files · ${(AppState.packedContent.length / 1024).toFixed(1)} KB`,
      'text-emerald-400 font-semibold');
  showToast(`Packaged ${virtualList.length} files as ${format}`, 'success');

  packBtn.disabled = false;
  packBtn.innerHTML = '<i class="fa-solid fa-box-open"></i> Package Codebase';
}

function downloadPackedResult() {
  if (!AppState.packedContent) return;
  const mime = AppState.packedFormat === 'html' ? 'text/html' : 'text/plain';
  downloadFile(AppState.packedFilename, AppState.packedContent, mime);
  showToast(`Downloaded ${AppState.packedFilename}`, 'success');
}
function copyPackedResult() {
  if (!AppState.packedContent) return;
  const ta = document.createElement('textarea');
  ta.value = AppState.packedContent;
  ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); showToast('Copied to clipboard', 'success'); }
  catch (err) { showToast('Copy failed: ' + err.message, 'error'); }
  document.body.removeChild(ta);
}