// ─────────────────────────────────────────────────────────────
//  VPN Pro+  —  Electron Main Process
// ─────────────────────────────────────────────────────────────
const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell } = require('electron');
const path   = require('path');
const fs     = require('fs');
const https  = require('https');
const http   = require('http');
const { spawn, execSync } = require('child_process');
const os     = require('os');

// ── Globals ──────────────────────────────────────────────────
let mainWindow       = null;
let tray             = null;
let ovpnProcess      = null;
let sessionStart     = null;
let bytesIn          = 0;
let bytesOut         = 0;
let isQuitting       = false;

const SESSION_DIR = path.join(app.getPath('userData'), 'session');
const API_URL     = 'https://www.vpngate.net/api/iphone/';
const API_URL_FALLBACK = 'http://www.vpngate.net/api/iphone/';

// ── Check Administrator Privileges ───────────────────────────
function isElevated() {
  try {
    execSync('net session', { stdio: 'ignore' });
    return true;
  } catch (_) {
    return false;
  }
}

// ── Single Instance Lock ─────────────────────────────────────
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showWindow();
  });
}

// ── Helpers ──────────────────────────────────────────────────
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** Safely send IPC to the renderer — guards against destroyed window */
function sendToRenderer(channel, data) {
  try {
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
      mainWindow.webContents.send(channel, data);
    }
  } catch (_) { /* window gone */ }
}

// ── Auto-launch on login (current user) ──────────────────────
function setAutoLaunch(enable) {
  if (!app.isPackaged) return; // Never set auto-launch in development mode
  try {
    app.setLoginItemSettings({
      openAtLogin: enable,
      path: process.execPath
    });
  } catch (_) { /* ignore on dev / first run */ }
}

// ── Create window ────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 720,
    minWidth: 380,
    minHeight: 640,
    frame: false,
    transparent: false,
    resizable: true,
    backgroundColor: '#0a0e1a',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

function showWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

// ── Tray icon ────────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'icon.ico');
  if (!fs.existsSync(iconPath)) return;
  tray = new Tray(nativeImage.createFromPath(iconPath));
  tray.setToolTip('VPN Pro+');
  tray.on('click', showWindow);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show', click: showWindow },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        disconnectVPN();
        app.quit();
      }
    }
  ]));
}

// ── Fetch server list from upstream provider ─────────────────
function fetchServerList() {
  return new Promise((resolve, reject) => {
    const tryFetch = (url, redirects, isFallback = false) => {
      if (redirects > 5) return reject(new Error('Too many redirects'));
      const mod = url.startsWith('https') ? https : http;
      const req = mod.get(url, { timeout: 35000 }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return tryFetch(res.headers.location, redirects + 1, isFallback);
        }
        if (res.statusCode !== 200) {
          if (!isFallback) return tryFetch(API_URL_FALLBACK, 0, true);
          return reject(new Error(`Server returned status ${res.statusCode}`));
        }
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => resolve(data));
        res.on('error', (err) => {
          if (!isFallback) return tryFetch(API_URL_FALLBACK, 0, true);
          reject(err);
        });
      });
      req.on('error', (err) => {
        if (!isFallback) return tryFetch(API_URL_FALLBACK, 0, true);
        reject(err);
      });
      req.on('timeout', () => {
        req.destroy();
        if (!isFallback) return tryFetch(API_URL_FALLBACK, 0, true);
        reject(new Error('Request timed out'));
      });
    };
    tryFetch(API_URL, 0, false);
  });
}

/**
 * Parse server CSV and mask raw backend origins into clean enterprise gateways
 */
function parseServerCSV(raw) {
  const lines = raw.split(/\r?\n/).filter(l => l && !l.startsWith('*'));
  if (lines.length < 2) return [];

  const headers = lines[0].replace(/^#/, '').split(',').map(h => h.trim());
  const ovpnIdx = headers.indexOf('OpenVPN_ConfigData_Base64');
  if (ovpnIdx === -1) return [];

  const servers = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = [];
    let idx = 0;
    for (let col = 0; col < headers.length - 1; col++) {
      const next = line.indexOf(',', idx);
      if (next === -1) break;
      parts.push(line.substring(idx, next));
      idx = next + 1;
    }
    parts.push(line.substring(idx));

    if (parts.length < headers.length) continue;

    const obj = {};
    headers.forEach((h, colIdx) => { obj[h] = parts[colIdx]; });

    const b64 = (obj['OpenVPN_ConfigData_Base64'] || '').trim();
    if (!b64 || b64.length < 10) continue;

    const country = obj['CountryLong'] || 'Unknown';
    const countryCode = (obj['CountryShort'] || 'UN').toUpperCase();

    servers.push({
      hostName:    obj['HostName']     || '',
      ip:          obj['IP']           || '',
      score:       parseInt(obj['Score'])           || 0,
      ping:        parseInt(obj['Ping'])            || 999,
      speed:       parseInt(obj['Speed'])           || 0,
      country,
      countryCode,
      sessions:    parseInt(obj['NumVpnSessions'])  || 0,
      uptime:      parseInt(obj['Uptime'])          || 0,
      ovpnBase64:  b64
    });
  }
  return servers;
}

// ── Group by country & assign professional gateway branding ──
function groupByCountry(servers) {
  const map = {};
  for (const s of servers) {
    if (!map[s.countryCode]) {
      map[s.countryCode] = {
        country: s.country,
        countryCode: s.countryCode,
        servers: []
      };
    }
    map[s.countryCode].servers.push(s);
  }

  for (const cc in map) {
    map[cc].servers.sort((a, b) => b.score - a.score || a.ping - b.ping);
    map[cc].servers.forEach((s, idx) => {
      s.nodeNumber = idx + 1;
      s.displayName = `${s.country} — Gateway #${String(idx + 1).padStart(2, '0')}`;
      s.serverCode = `${s.countryCode}-${String(idx + 1).padStart(2, '0')}`;
    });
    const best = map[cc].servers[0];
    map[cc].bestPing  = best.ping;
    map[cc].bestSpeed = best.speed;
    map[cc].bestScore = best.score;
    map[cc].serverCount = map[cc].servers.length;
  }
  return Object.values(map).sort((a, b) => b.bestScore - a.bestScore);
}

// ── Find Core Tunnel Engine ──────────────────────────────────
function findEngine() {
  const candidates = [
    // 1. Packaged extraResources
    path.join(process.resourcesPath, 'bin', 'engine', 'vpnengine.exe'),
    // 2. Development directory
    path.join(__dirname, 'bin', 'engine', 'vpnengine.exe'),
    path.join(process.cwd(), 'bin', 'engine', 'vpnengine.exe'),
    // 3. Fallback to system engine if present
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'OpenVPN', 'bin', 'openvpn.exe'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'OpenVPN', 'bin', 'openvpn.exe'),
    'C:\\Program Files\\OpenVPN\\bin\\openvpn.exe',
    'C:\\Program Files (x86)\\OpenVPN\\bin\\openvpn.exe'
  ];
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  // Try PATH
  try {
    const result = execSync('where openvpn.exe',
      { windowsHide: true, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    const found = result.trim().split(/\r?\n/)[0].trim();
    if (found && fs.existsSync(found)) return found;
  } catch (_) {}
  return null;
}

// ── Find Virtual Network Adapter (WAN preferred) ──────────────
function getVirtualAdapterName(engineExe) {
  if (engineExe && fs.existsSync(engineExe)) {
    try {
      const stdout = execSync(`"${engineExe}" --show-adapters`, {
        windowsHide: true,
        encoding: 'utf8',
        timeout: 3000,
        stdio: ['pipe', 'pipe', 'ignore']
      });
      const matches = [...stdout.matchAll(/'([^']+)'\s+\{[^}]+\}\s+tap-windows6/gi)];
      const names = matches.map(m => m[1]);
      if (names.includes('WAN')) return 'WAN';
      if (names.length > 0) return names[0];
    } catch (_) {}
  }

  // Fallback to netsh query
  try {
    const netshOut = execSync('netsh interface show interface', {
      windowsHide: true,
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'ignore']
    });
    if (/[\s\t]WAN[\r\n]/i.test(netshOut)) return 'WAN';
    if (/OpenVPN TAP-Windows6/i.test(netshOut)) return 'OpenVPN TAP-Windows6';
  } catch (_) {}

  return 'WAN';
}

// ── Connect Secure Tunnel ────────────────────────────────────
function connectVPN(server) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let connTimeout = null;
    const settle = (fn, val) => {
      if (!settled) {
        settled = true;
        if (connTimeout) { clearTimeout(connTimeout); connTimeout = null; }
        fn(val);
      }
    };

    const engineExe = findEngine();
    if (!engineExe) {
      return settle(reject, new Error('Secure tunnel engine not found.'));
    }

    ensureDir(SESSION_DIR);
    const configPath = path.join(SESSION_DIR, 'session.ovpn');
    const authPath   = path.join(SESSION_DIR, 'credentials.dat');
    const statusPath = path.join(SESSION_DIR, 'session_status.log');

    // Default credentials
    try {
      fs.writeFileSync(authPath, 'vpn\nvpn\n', 'utf8');
    } catch (_) {}

    // Clean previous status file
    try {
      if (fs.existsSync(statusPath)) fs.unlinkSync(statusPath);
    } catch (_) {}

    // Sanitize config and strip all third-party branding/comments
    let useAuthUserPass = false;
    try {
      const rawConfig = Buffer.from(server.ovpnBase64, 'base64').toString('utf8');
      const hasCert = rawConfig.includes('<cert>') && rawConfig.includes('<key>');
      const hasAuthDirective = /^\s*auth-user-pass/m.test(rawConfig);
      useAuthUserPass = hasAuthDirective || !hasCert;

      const sanitizedLines = rawConfig
        .split(/\r?\n/)
        .filter(l => {
          const t = l.trim();
          return t && !t.startsWith('#') && !t.startsWith(';') && !t.startsWith('*') && !t.startsWith('windows-driver');
        });

      sanitizedLines.push(
        'nobind',
        'persist-key',
        'persist-tun'
      );

      fs.writeFileSync(configPath, sanitizedLines.join('\n') + '\n', 'utf8');
    } catch (e) {
      return settle(reject, new Error('Failed to prepare secure tunnel config: ' + e.message));
    }

    const adapterName = getVirtualAdapterName(engineExe);

    const engineArgs = [
      '--config', configPath,
      '--connect-retry-max', '2',
      '--verb', '3',
      '--suppress-timestamps',
      '--status', statusPath, '1',
      '--dev-node', adapterName,
      '--windows-driver', 'tap-windows6',
      '--providers', 'legacy', 'default',
      '--data-ciphers', 'AES-256-GCM:AES-128-GCM:CHACHA20-POLY1305:AES-128-CBC:AES-256-CBC',
      '--data-ciphers-fallback', 'AES-128-CBC'
    ];

    if (useAuthUserPass) {
      engineArgs.push('--auth-user-pass', authPath, '--auth-retry', 'nointeract');
    }

    let lastErrorDetected = null;
    let routeErrorOccurred = false;

    const proc = spawn(engineExe, engineArgs, {
      cwd: path.dirname(engineExe),
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    proc.__manualKill = false;
    ovpnProcess = proc;

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      sendToRenderer('vpn:log', text);

      if (text.includes('AUTH_FAILED')) {
        lastErrorDetected = 'Authentication rejected by remote node';
      } else if (text.includes('There are no TAP-Windows adapters') || text.includes('Cannot allocate TUN/TAP')) {
        lastErrorDetected = 'Virtual network adapter (WAN) not ready. Please run driver setup.';
      } else if (text.includes('Access is denied') || text.includes('route addition failed') || text.includes('Windows route add command failed')) {
        lastErrorDetected = 'Administrator privileges required for network routing';
        routeErrorOccurred = true;
      } else if (text.includes('TLS Error: TLS handshake failed') || text.includes('TLS key negotiation failed')) {
        lastErrorDetected = 'Gateway unreachable. Connecting to alternate node...';
      }

      // Successful connection sequence ONLY IF routes were added without permission errors
      if (!settled && text.includes('Initialization Sequence Completed')) {
        if (routeErrorOccurred) {
          settle(reject, new Error(lastErrorDetected || 'Administrator privileges required for network routing'));
          disconnectVPN();
          return;
        }
        sessionStart = Date.now();
        bytesIn = 0;
        bytesOut = 0;
        lastErrorDetected = null;
        settle(resolve, { success: true });
      }

      const inMatch  = text.match(/(?:TUN\/TAP|Wintun).*read bytes\s*=\s*(\d+)/i) || text.match(/read bytes\s*=\s*(\d+)/i);
      const outMatch = text.match(/(?:TUN\/TAP|Wintun).*write bytes\s*=\s*(\d+)/i) || text.match(/write bytes\s*=\s*(\d+)/i);
      if (inMatch)  bytesIn  = parseInt(inMatch[1], 10);
      if (outMatch) bytesOut = parseInt(outMatch[1], 10);
    });

    proc.stderr.on('data', (data) => {
      const errStr = data.toString();
      sendToRenderer('vpn:log', errStr);
      if (errStr.includes('Access is denied') || errStr.includes('route addition failed')) {
        lastErrorDetected = 'Administrator privileges required for network routing';
        routeErrorOccurred = true;
      } else if (errStr.includes('Options error') || errStr.includes('Unsupported cipher')) {
        lastErrorDetected = 'Tunnel engine configuration error';
      }
    });

    proc.on('error', (err) => {
      settle(reject, err);
    });

    proc.on('close', (code) => {
      const wasManual = !!proc.__manualKill;
      if (ovpnProcess === proc) {
        ovpnProcess = null;
        sessionStart = null;
        sendToRenderer('vpn:disconnected', { code, intentional: wasManual });
      }

      let errMsg = wasManual ? 'Connection cancelled' : (lastErrorDetected || 'Gateway closed connection');
      if (!wasManual && code !== 0 && !lastErrorDetected) {
        if (!isElevated()) {
          errMsg = 'Administrator privileges required. Please run app as Administrator.';
        } else {
          errMsg = 'Node unreachable. Selecting alternate node...';
        }
      }
      settle(reject, new Error(errMsg));
    });

    // Timeout after 25 seconds
    connTimeout = setTimeout(() => {
      if (!settled) {
        disconnectVPN();
        settle(reject, new Error('Connection negotiation timed out'));
      }
    }, 25000);
  });
}

/**
 * Disconnect — on Windows, SIGTERM is not reliable for child processes.
 * Use taskkill /PID /F as the primary method.
 */
function disconnectVPN() {
  if (ovpnProcess) {
    const proc = ovpnProcess;
    ovpnProcess = null;
    sessionStart = null;
    proc.__manualKill = true;
    try {
      execSync(`taskkill /PID ${proc.pid} /T /F`,
        { windowsHide: true, stdio: 'ignore' });
    } catch (_) {
      try { proc.kill(); } catch (__) {}
    }
  }
  sessionStart = null;
}

// ── Get public IP ────────────────────────────────────────────
function getPublicIP() {
  return new Promise((resolve) => {
    const req = https.get('https://api.ipify.org?format=json', { timeout: 8000 }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(data).ip); } catch (_) { resolve('Unknown'); }
      });
      res.on('error', () => resolve('Unknown'));
    });
    req.on('error', () => resolve('Unknown'));
    req.on('timeout', () => { req.destroy(); resolve('Unknown'); });
  });
}

// ── IPC Handlers ─────────────────────────────────────────────
ipcMain.handle('servers:fetch', async () => {
  try {
    const raw = await fetchServerList();
    const servers = parseServerCSV(raw);
    const countries = groupByCountry(servers);
    return { success: true, countries, totalServers: servers.length };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('vpn:connect', async (_event, server, fallbacks = []) => {
  disconnectVPN();
  try {
    await connectVPN(server);
    return { success: true, connectedServer: server };
  } catch (primaryErr) {
    if (primaryErr.message.includes('cancelled') || primaryErr.message.includes('Administrator')) {
      return { success: false, error: primaryErr.message };
    }

    // Auto-fallback to next best node if available
    if (Array.isArray(fallbacks) && fallbacks.length > 0) {
      for (const nextServer of fallbacks.slice(0, 5)) {
        try {
          disconnectVPN();
          sendToRenderer('vpn:status-update', `Connecting to alternate node (${nextServer.displayName || nextServer.country})…`);
          await connectVPN(nextServer);
          return { success: true, connectedServer: nextServer };
        } catch (_) {}
      }
    }

    return { success: false, error: primaryErr.message };
  }
});

ipcMain.handle('vpn:disconnect', async () => {
  disconnectVPN();
  return { success: true };
});

ipcMain.handle('vpn:status', async () => {
  const statusPath = path.join(SESSION_DIR, 'session_status.log');
  try {
    if (fs.existsSync(statusPath)) {
      const content = fs.readFileSync(statusPath, 'utf8');
      const inMatch  = content.match(/(?:TUN\/TAP|TCP\/UDP|Wintun)\s+read bytes,(\d+)/i);
      const outMatch = content.match(/(?:TUN\/TAP|TCP\/UDP|Wintun)\s+write bytes,(\d+)/i);
      if (inMatch)  bytesIn  = parseInt(inMatch[1], 10);
      if (outMatch) bytesOut = parseInt(outMatch[1], 10);
    }
  } catch (_) {}

  return {
    connected: ovpnProcess !== null && sessionStart !== null,
    sessionStart,
    bytesIn,
    bytesOut
  };
});

ipcMain.handle('vpn:publicip', async () => {
  return await getPublicIP();
});

ipcMain.handle('app:get-openvpn-path', () => {
  return findEngine();
});

ipcMain.handle('app:check-environment', () => {
  const elevated = isElevated();
  const engineExe = findEngine();
  const adapterName = engineExe ? getVirtualAdapterName(engineExe) : 'WAN';
  return {
    isElevated: elevated,
    adapterName,
    hasWan: adapterName === 'WAN',
    engineFound: !!engineExe
  };
});

ipcMain.handle('app:open-external', (_event, url) => {
  if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
    shell.openExternal(url);
  }
});

// Window controls
ipcMain.on('win:minimize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize();
});
ipcMain.on('win:maximize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  }
});
ipcMain.on('win:close', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.hide();
  }
});

// ── App lifecycle ────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();
  createTray();
  setAutoLaunch(true);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'win32') {
    disconnectVPN();
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  disconnectVPN();
});
