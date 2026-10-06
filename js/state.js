/* =====================================================================
   STATE
   ===================================================================== */
const AppState = {
  scannedFiles: [],
  projectDirHandle: null,
  projectReadMode: null,
  lastPackedFiles: [],
  packedContent: '',
  packedFilename: 'ai_workspace.md',
  packedFormat: 'markdown',
  unpackedFilesMap: {},
  unpackedSource: null,
  selectedUnpackedPath: null,
  previewMode: 'content',
  diffs: {}
};

const FSP_SUPPORTED = typeof window.showDirectoryPicker === 'function';
