// 把 IPC 與資料模型的純函式暴露給畫面
const { contextBridge, ipcRenderer } = require('electron');
const { marked } = require('marked');
const model = require('./model');

contextBridge.exposeInMainWorld('cue', {
  init: () => ipcRenderer.invoke('init'),
  run: (payload) => ipcRenderer.invoke('run', payload),
  pick: (payload) => ipcRenderer.invoke('pick', payload),
  pickCancel: () => ipcRenderer.invoke('pick-cancel'),
  launchChrome: (url) => ipcRenderer.invoke('launch-chrome', url),
  displays: () => ipcRenderer.invoke('displays'),
  cuedeckToLaptop: () => ipcRenderer.invoke('cuedeck-to-laptop'),
  chromeToProjector: (target) => ipcRenderer.invoke('chrome-to-projector', target),
  openDeck: () => ipcRenderer.invoke('open-deck'),
  newDeck: () => ipcRenderer.invoke('new-deck'),
  saveDeck: (payload) => ipcRenderer.invoke('save-deck', payload),
  revealDeck: () => ipcRenderer.invoke('reveal-deck'),
  set: (key, value) => ipcRenderer.invoke('set', key, value),
  window: (cmd) => ipcRenderer.invoke('window', cmd),
  on: (channel, fn) => ipcRenderer.on(channel, (_, payload) => fn(payload)),
});

contextBridge.exposeInMainWorld('model', {
  ACTIONS: model.ACTIONS,
  parseDsl: (src) => model.parseDsl(src),
  toDsl: (actions) => model.toDsl(actions),
  describe: (a) => model.describe(a),
  validateAction: (a, flows) => model.validateAction(a, flows),
  normalizeDeck: (raw) => model.normalizeDeck(raw),
  orderedCues: (deck) => model.orderedCues(deck).map(({ si, ci, inline }) => ({ si, ci, inline })),
  cueMarkers: (notes) => model.cueMarkers(notes),
  renameMarker: (notes, from, to) => model.renameMarker(notes, from, to),
  markdown: (src) => marked.parse(src || '', { gfm: true, breaks: true }),
});
