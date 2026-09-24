// ─────────────────────────────────────────────────────────────
//  VPN Pro+  —  Preload Script (Context Bridge)
// ─────────────────────────────────────────────────────────────
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vpnAPI', {
  // Server list
  fetchServers: ()            => ipcRenderer.invoke('servers:fetch'),

  // VPN control
  connect:      (server)      => ipcRenderer.invoke('vpn:connect', server),
  disconnect:   ()            => ipcRenderer.invoke('vpn:disconnect'),
  getStatus:    ()            => ipcRenderer.invoke('vpn:status'),
  getPublicIP:  ()            => ipcRenderer.invoke('vpn:publicip'),
  getOpenVPNPath: ()          => ipcRenderer.invoke('app:get-openvpn-path'),
  checkEnvironment: ()        => ipcRenderer.invoke('app:check-environment'),

  // VPN log and status stream
  onLog:          (cb) => ipcRenderer.on('vpn:log', (_e, msg) => cb(msg)),
  onStatusUpdate: (cb) => ipcRenderer.on('vpn:status-update', (_e, msg) => cb(msg)),
  onDisconnected: (cb) => ipcRenderer.on('vpn:disconnected', (_e, info) => cb(info)),

  // Window controls
  minimize: () => ipcRenderer.send('win:minimize'),
  maximize: () => ipcRenderer.send('win:maximize'),
  close:    () => ipcRenderer.send('win:close'),

  // Utilities
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
});
