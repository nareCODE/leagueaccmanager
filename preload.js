const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('accountsApi', {
  loadAccounts: () => ipcRenderer.invoke('accounts:load'),
  saveAccounts: (accounts) => ipcRenderer.invoke('accounts:save', accounts),
  pickPdf: () => ipcRenderer.invoke('accounts:pick-pdf'),
  importFromPdf: (pdfPath) => ipcRenderer.invoke('accounts:import-pdf', pdfPath),
  openExternal: (url) => ipcRenderer.invoke('accounts:open-external', url),
  syncRiotRanks: (accounts, apiKey) => ipcRenderer.invoke('accounts:sync-riot-ranks', accounts, apiKey),
  fetchHistory: (account) => ipcRenderer.invoke('accounts:fetch-history', account),
  exportCardPng: (pngDataUrl, suggestedName) => ipcRenderer.invoke('accounts:export-card-png', pngDataUrl, suggestedName),
  exportCardsPngBulk: (items) => ipcRenderer.invoke('accounts:export-cards-png-bulk', items)
});