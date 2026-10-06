/* =====================================================================
   BOOT
   ===================================================================== */
window.addEventListener('DOMContentLoaded', () => {
  resetDefaultIgnore();
  setFormat('markdown');
  if (!FSP_SUPPORTED) {
    document.getElementById('folderPickerHint').textContent = 'File System Access API unavailable — falling back to read-only file input';
    document.getElementById('applyFolderBtn').disabled = true;
    document.getElementById('applyFolderBtn').title = 'File System Access API not available — use the ZIP button';
  }
  runAllPropertyTests();
});
