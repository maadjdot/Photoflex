const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("photoFlexHost", Object.freeze({
  diagnostics: () => ipcRenderer.invoke("photoflex:diagnostics"),
  workspace: Object.freeze({
    open: (projectId) => ipcRenderer.invoke("workspace:open", { projectId }),
    migrate: (projectId) => ipcRenderer.invoke("workspace:migrate", { projectId }),
    autosave: (projectId, expectedRevision, bytes) => ipcRenderer.invoke("workspace:autosave", { projectId, expectedRevision, bytes }),
    createSnapshot: (projectId) => ipcRenderer.invoke("workspace:create-snapshot", { projectId }),
    restoreSnapshot: (projectId, snapshotId) => ipcRenderer.invoke("workspace:restore-snapshot", { projectId, snapshotId }),
    verifyRecovery: (projectId) => ipcRenderer.invoke("workspace:verify-recovery", { projectId })
  }),
  sources: Object.freeze({
    requestFolderGrant: () => ipcRenderer.invoke("sources:request-folder-grant"),
    bootstrapGrant: () => ipcRenderer.invoke("sources:bootstrap-grant"),
    restoreGrant: (sourceId) => ipcRenderer.invoke("sources:restore-grant", { sourceId }),
    query: (sourceId, offset, limit) => ipcRenderer.invoke("sources:query", { sourceId, offset, limit }),
    proxyUrl: (sourceId, photoId) => ipcRenderer.invoke("sources:proxy-url", { sourceId, photoId })
  }),
  exports: Object.freeze({
    startPdf: (request) => ipcRenderer.invoke("exports:start-pdf", request),
    status: (jobId) => ipcRenderer.invoke("exports:status", { jobId }),
    cancel: (jobId) => ipcRenderer.invoke("exports:cancel", { jobId }),
    retry: (jobId) => ipcRenderer.invoke("exports:retry", { jobId })
  })
}));
