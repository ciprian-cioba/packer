/* =====================================================================
   UNPACKER UI
   ===================================================================== */
function handleResponseFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => executeUnpack(e.target.result);
  reader.readAsText(file);
}
function executeUnpackFromText() {
  const text = document.getElementById('rawInputText').value;
  if (!text.trim()) { showToast('Paste or upload some content first', 'error'); return; }
  executeUnpack(text);
}
function executeUnpack(text) {
  const { src, map } = unpackAuto(text);
  const paths = Object.keys(map);
  const detected = document.getElementById('unpackDetected');
  detected.classList.remove('hidden');

  if (paths.length === 0) {
    detected.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-amber-400 mr-1"></i> No file blocks detected.`;
    showToast('No file blocks found in the input', 'error');
    return;
  }

  AppState.unpackedFilesMap = map;
  AppState.unpackedSource = src;
  AppState.selectedUnpackedPath = null;
  AppState.previewMode = 'content';
  AppState.diffs = {};

  const baseline = {};
  for (const f of AppState.lastPackedFiles) baseline[f.path] = f.content;

  let changed = 0, added = 0, same = 0;
  for (const [path, content] of Object.entries(map)) {
    if (!(path in baseline)) { added++; continue; }
    if (baseline[path] === content) { same++; continue; }
    AppState.diffs[path] = computeLineDiff(baseline[path], content);
    changed++;
  }

  const parts = [`Detected: <strong class="text-brand-300">${src}</strong> · ${paths.length} file(s)`];
  if (AppState.lastPackedFiles.length) {
    parts.push(`vs. baseline: <span class="text-amber-300">${changed} changed</span>, <span class="text-emerald-300">${added} new</span>, <span class="text-slate-400">${same} unchanged</span>`);
  }
  detected.innerHTML = parts.join('<br>');

  document.getElementById('unpackedCountBadge').classList.remove('hidden');
  document.getElementById('unpackedCountBadge').textContent = paths.length;
  document.getElementById('downloadZipBtn').disabled = false;
  updateApplyButton();

  renderUnpackedFileList();
  showToast(`Unpacked ${paths.length} files (${src})`, 'success');
}

function updateApplyButton() {
  const btn = document.getElementById('applyFolderBtn');
  const hasFiles = Object.keys(AppState.unpackedFilesMap).length > 0;
  if (!FSP_SUPPORTED) {
    btn.disabled = true;
    btn.title = 'File System Access API not available in this browser — use the ZIP button';
    return;
  }
  btn.disabled = !hasFiles;
  if (AppState.projectDirHandle) {
    btn.title = `Write to "${AppState.projectDirHandle.name}"`;
  } else {
    btn.title = 'Write changes to a folder you pick';
  }
}

function fileStatus(path) {
  if (!AppState.lastPackedFiles.length) return null;
  const baseline = AppState.lastPackedFiles.find(f => f.path === path);
  if (!baseline) return 'new';
  if (baseline.content === AppState.unpackedFilesMap[path]) return 'same';
  return 'mod';
}

function renderUnpackedFileList() {
  const list = document.getElementById('unpackedFileList');
  list.innerHTML = '';
  const paths = Object.keys(AppState.unpackedFilesMap).sort();
  paths.forEach((path, idx) => {
    const status = fileStatus(path);
    const badge =
      status === 'mod' ? '<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">M</span>' :
      status === 'new' ? '<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">A</span>' :
      status === 'same' ? '<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-500 border border-slate-700">=</span>' : '';
    const btn = document.createElement('button');
    const selected = AppState.selectedUnpackedPath === path;
    btn.className = `w-full text-left px-3 py-2 rounded-lg font-mono text-xs flex items-center gap-2 transition-colors ${
      selected ? 'bg-brand-600/30 text-brand-300 border border-brand-500/40'
               : 'hover:bg-slate-900 text-slate-300 border border-transparent'
    }`;
    btn.innerHTML = `
      <span class="truncate flex-1"><i class="fa-regular fa-file text-slate-500 mr-2"></i>${escapeHTML(path)}</span>
      ${badge}
      <span class="text-[10px] text-slate-500 shrink-0">${AppState.unpackedFilesMap[path].length}</span>`;
    btn.onclick = () => selectUnpackedFile(path);
    list.appendChild(btn);
    if (idx === 0 && !AppState.selectedUnpackedPath) selectUnpackedFile(path);
  });
}
function selectUnpackedFile(path) {
  AppState.selectedUnpackedPath = path;
  AppState.previewMode = 'content';
  document.getElementById('previewFilePath').textContent = path;
  document.getElementById('downloadSingleFileBtn').disabled = false;
  const hasDiff = path in AppState.diffs;
  document.getElementById('toggleDiffBtn').disabled = !hasDiff;
  renderPreview();
  renderUnpackedFileList();
}
function togglePreviewMode() {
  AppState.previewMode = AppState.previewMode === 'diff' ? 'content' : 'diff';
  renderPreview();
}
function renderPreview() {
  const path = AppState.selectedUnpackedPath;
  if (!path) return;
  const pre = document.getElementById('previewCodeContent');
  const diffBtn = document.getElementById('toggleDiffBtn');
  if (AppState.previewMode === 'diff' && path in AppState.diffs) {
    pre.innerHTML = renderDiff(AppState.diffs[path]);
    diffBtn.innerHTML = '<i class="fa-solid fa-file-lines"></i> Content';
    diffBtn.classList.add('text-amber-300');
  } else {
    pre.textContent = AppState.unpackedFilesMap[path] || '';
    diffBtn.innerHTML = '<i class="fa-solid fa-code-compare"></i> Diff';
    diffBtn.classList.remove('text-amber-300');
  }
}
function downloadSelectedFile() {
  const path = AppState.selectedUnpackedPath;
  if (!path) return;
  downloadFile(path.split('/').pop() || 'file.txt', AppState.unpackedFilesMap[path], 'text/plain');
}
function downloadAllAsZip() {
  if (!window.JSZip) { showToast('JSZip failed to load', 'error'); return; }
  const zip = new JSZip();
  for (const [path, content] of Object.entries(AppState.unpackedFilesMap)) {
    if (!isSafeRelativePath(path)) continue;
    zip.file(path, content);
  }
  zip.generateAsync({ type: 'blob' }).then(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'unpacked_codebase.zip';
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
    showToast('Downloaded ZIP archive', 'success');
  });
}
function downloadFile(filename, content, contentType) {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

/* =====================================================================
   APPLY TO FOLDER
   ===================================================================== */
async function applyFilesToProject() {
  if (!FSP_SUPPORTED) {
    showToast('File System Access API not supported — use ZIP instead', 'error');
    return;
  }
  const paths = Object.keys(AppState.unpackedFilesMap);
  if (paths.length === 0) { showToast('Nothing to apply', 'error'); return; }

  let dir = AppState.projectDirHandle;
  if (!dir) {
    try {
      dir = await window.showDirectoryPicker({ mode: 'readwrite' });
      AppState.projectDirHandle = dir;
      AppState.projectReadMode = 'fsp';
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      showToast('Folder pick failed: ' + (e && e.message || e), 'error');
      return;
    }
  }

  if (dir.requestPermission) {
    let perm;
    try { perm = await dir.queryPermission({ mode: 'readwrite' }); } catch (_) { perm = 'prompt'; }
    if (perm !== 'granted') {
      try { perm = await dir.requestPermission({ mode: 'readwrite' }); }
      catch (e) { showToast('Permission request failed: ' + e.message, 'error'); return; }
    }
    if (perm !== 'granted') { showToast('Write permission denied', 'error'); return; }
  }

  const n = paths.length;
  if (!confirm(`Write ${n} file${n === 1 ? '' : 's'} to "${dir.name}"?\n\nExisting files with the same paths will be overwritten.`)) return;

  const btn = document.getElementById('applyFolderBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Writing…';

  let written = 0, failed = 0;
  const failures = [];
  for (const rawPath of paths) {
    if (!isSafeRelativePath(rawPath)) {
      failed++; failures.push(`${rawPath}: unsafe path`);
      continue;
    }
    try {
      const parts = canonicalPath(rawPath).split('/').filter(Boolean);
      let d = dir;
      for (const seg of parts.slice(0, -1)) {
        d = await d.getDirectoryHandle(seg, { create: true });
      }
      const fh = await d.getFileHandle(parts[parts.length - 1], { create: true });
      const w = await fh.createWritable();
      await w.write(AppState.unpackedFilesMap[rawPath]);
      await w.close();
      written++;
    } catch (e) {
      failed++;
      failures.push(`${rawPath}: ${e && e.message || e}`);
      console.error('Apply failed:', rawPath, e);
    }
  }

  btn.disabled = false;
  btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Apply to Folder';

  if (failed === 0) {
    showToast(`Wrote ${written} file${written === 1 ? '' : 's'} to "${dir.name}"`, 'success');
    AppState.lastPackedFiles = Object.entries(AppState.unpackedFilesMap)
      .map(([path, content]) => ({ path, content }));
    AppState.diffs = {};
    renderUnpackedFileList();
  } else {
    showToast(`Wrote ${written}, ${failed} failed — see console`, 'error');
    failures.forEach(f => console.warn('apply:', f));
  }
}
