/* ═══════════════════════════════════════════════════════════════
   VPN Pro+  —  Renderer App Logic
   Server list, country picker, connect/disconnect, live stats
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────
  let countries      = [];
  let selectedCC     = null;  // null = auto
  let selectedServer = null;
  let vpnState       = 'disconnected'; // disconnected | connecting | connected
  let statsInterval  = null;

  // ── Country code → flag emoji ──────────────────────────────
  function ccToFlag(cc) {
    if (!cc || cc.length !== 2) return '🌍';
    return String.fromCodePoint(
      ...[...cc.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65)
    );
  }

  // ── Format bytes ───────────────────────────────────────────
  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
    return (bytes / 1073741824).toFixed(2) + ' GB';
  }

  // ── Format speed ──────────────────────────────────────────
  function formatSpeed(bps) {
    if (bps < 1000) return bps + ' bps';
    if (bps < 1000000) return (bps / 1000).toFixed(0) + ' Kbps';
    return (bps / 1000000).toFixed(1) + ' Mbps';
  }

  // ── Format duration ───────────────────────────────────────
  function formatDuration(ms) {
    const s = Math.floor(ms / 1000);
    const h = String(Math.floor(s / 3600)).padStart(2, '0');
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const sec = String(s % 60).padStart(2, '0');
    return `${h}:${m}:${sec}`;
  }

  // ── DOM refs ───────────────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);

  const dom = {
    btnConnect:    $('#btn-connect'),
    connectLabel:  $('#connect-label'),
    statusLabel:   $('#status-label'),
    statusIP:      $('#status-ip'),
    countryToggle: $('#country-picker-toggle'),
    dropdown:      $('#country-dropdown'),
    countrySearch: $('#country-search'),
    countryList:   $('#country-list'),
    selectedFlag:  $('#selected-flag'),
    selectedName:  $('#selected-country'),
    selectedMeta:  $('#selected-meta'),
    statsPanel:    $('#stats-panel'),
    statServer:    $('#stat-server'),
    statLocation:  $('#stat-location'),
    statPing:      $('#stat-ping'),
    statDuration:  $('#stat-duration'),
    statDown:      $('#stat-down'),
    statUp:        $('#stat-up'),
    loadingOverlay:$('#loading-overlay'),
    btnMin:        $('#btn-min'),
    btnMax:        $('#btn-max'),
    btnClose:      $('#btn-close'),
  };

  // ── Window controls ────────────────────────────────────────
  dom.btnMin.addEventListener('click', () => window.vpnAPI.minimize());
  dom.btnMax.addEventListener('click', () => window.vpnAPI.maximize());
  dom.btnClose.addEventListener('click', () => window.vpnAPI.close());

  // ── Country Picker ────────────────────────────────────────
  let dropdownOpen = false;

  dom.countryToggle.addEventListener('click', () => {
    dropdownOpen = !dropdownOpen;
    dom.dropdown.classList.toggle('hidden', !dropdownOpen);
    dom.countryToggle.classList.toggle('open', dropdownOpen);
    if (dropdownOpen) {
      dom.countrySearch.value = '';
      renderCountryList('');
      setTimeout(() => dom.countrySearch.focus(), 50);
    }
  });

  dom.countrySearch.addEventListener('input', (e) => {
    renderCountryList(e.target.value);
  });

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    if (dropdownOpen && !e.target.closest('#country-section')) {
      dropdownOpen = false;
      dom.dropdown.classList.add('hidden');
      dom.countryToggle.classList.remove('open');
    }
  });

  function renderCountryList(filter) {
    const filt = filter.toLowerCase();
    let html = '';

    // Auto option
    const autoMatch = !filt || 'auto'.includes(filt) || 'best server'.includes(filt);
    if (autoMatch) {
      html += `<li class="auto-option" data-cc="">
        <span class="li-flag">🌍</span>
        <span class="li-name">Auto – Best Server</span>
        <span class="li-meta"></span>
      </li>`;
    }

    for (const c of countries) {
      if (filt && !c.country.toLowerCase().includes(filt) && !c.countryCode.toLowerCase().includes(filt)) continue;
      const flag = ccToFlag(c.countryCode);
      const pingStr = c.bestPing < 999 ? c.bestPing + ' ms' : '—';
      const speedStr = formatSpeed(c.bestSpeed);
      html += `<li data-cc="${c.countryCode}">
        <span class="li-flag">${flag}</span>
        <span class="li-name">${c.country}</span>
        <span class="li-meta">${pingStr} · ${speedStr}</span>
        <span class="li-servers">${c.serverCount} svr</span>
      </li>`;
    }

    dom.countryList.innerHTML = html;

    // Click handlers
    dom.countryList.querySelectorAll('li').forEach(li => {
      li.addEventListener('click', async () => {
        const cc = li.dataset.cc;
        const prevCC = selectedCC;
        selectCountry(cc || null);
        dropdownOpen = false;
        dom.dropdown.classList.add('hidden');
        dom.countryToggle.classList.remove('open');

        // If currently connected or connecting and user chose a different country, reconnect
        if ((vpnState === 'connected' || vpnState === 'connecting') && cc !== prevCC) {
          await doDisconnect();
          await doConnect();
        }
      });
    });
  }

  function selectCountry(cc) {
    selectedCC = cc;
    if (!cc) {
      dom.selectedFlag.textContent = '🌍';
      dom.selectedName.textContent = 'Auto – Best Server';
      dom.selectedMeta.textContent = '';
      selectedServer = null;
    } else {
      const c = countries.find(x => x.countryCode === cc);
      if (c) {
        dom.selectedFlag.textContent = ccToFlag(cc);
        dom.selectedName.textContent = c.country;
        const pingStr = c.bestPing < 999 ? c.bestPing + ' ms' : '—';
        dom.selectedMeta.textContent = pingStr + ' · ' + c.serverCount + ' servers';
        selectedServer = c.servers[0]; // best server
      }
    }
  }

  function getBestServer() {
    if (selectedCC) {
      const c = countries.find(x => x.countryCode === selectedCC);
      return c ? c.servers[0] : null;
    }
    // Global best
    let best = null;
    for (const c of countries) {
      for (const s of c.servers) {
        if (!best || s.score > best.score || (s.score === best.score && s.ping < best.ping)) {
          best = s;
        }
      }
    }
    return best;
  }

  // ── Connect / Disconnect ──────────────────────────────────
  dom.btnConnect.addEventListener('click', async () => {
    if (vpnState === 'connecting') {
      dom.connectLabel.textContent = 'Cancelling…';
      await doDisconnect();
      return;
    }
    if (vpnState === 'connected') {
      await doDisconnect();
    } else {
      await doConnect();
    }
  });

  async function doConnect() {
    const server = getBestServer();
    if (!server) {
      dom.connectLabel.textContent = 'No gateways available';
      return;
    }

    // Collect fallback candidates in current selection
    let fallbacks = [];
    if (selectedCC) {
      const c = countries.find(x => x.countryCode === selectedCC);
      if (c && c.servers) fallbacks = c.servers.filter(s => s !== server);
    } else {
      fallbacks = countries.map(c => c.servers[0]).filter(s => s && s !== server);
    }

    setVPNState('connecting');
    const gatewayLabel = server.displayName || `${server.country} Gateway`;
    dom.connectLabel.textContent = 'Connecting to ' + server.country + '…';

    const result = await window.vpnAPI.connect(server, fallbacks);
    if (result.success) {
      const active = result.connectedServer || server;
      setVPNState('connected');
      dom.connectLabel.textContent = 'Protected — ' + active.country;
      dom.statServer.textContent = active.displayName || active.serverCode || `${active.country} Node`;
      dom.statLocation.textContent = active.country;
      dom.statPing.textContent = active.ping < 999 ? active.ping + ' ms' : '—';

      // Fetch new public IP
      const ip = await window.vpnAPI.getPublicIP();
      dom.statusIP.textContent = ip;

      startStatsPolling();
    } else {
      setVPNState('disconnected');
      dom.connectLabel.textContent = result.error || 'Connection failed';
      setTimeout(() => {
        if (vpnState === 'disconnected') {
          dom.connectLabel.textContent = 'Tap to connect';
        }
      }, 4000);
    }
  }

  async function doDisconnect() {
    await window.vpnAPI.disconnect();
    setVPNState('disconnected');
    dom.connectLabel.textContent = 'Tap to connect';
    stopStatsPolling();

    // Refresh public IP
    const ip = await window.vpnAPI.getPublicIP();
    dom.statusIP.textContent = ip;
  }

  function setVPNState(state) {
    vpnState = state;
    dom.btnConnect.dataset.state = state;

    dom.statusLabel.className = state;
    dom.statusLabel.textContent = state === 'connected' ? 'PROTECTED' :
                                   state === 'connecting' ? 'CONNECTING' : 'DISCONNECTED';

    dom.statsPanel.classList.toggle('hidden', state !== 'connected');

    // Update globe
    if (window._globe) {
      window._globe.setState(
        state === 'connected' ? 'connected' :
        state === 'connecting' ? 'connecting' : 'idle'
      );
    }
  }

  // ── Stats polling ──────────────────────────────────────────
  function startStatsPolling() {
    stopStatsPolling();
    statsInterval = setInterval(async () => {
      const status = await window.vpnAPI.getStatus();
      if (!status.connected) {
        setVPNState('disconnected');
        dom.connectLabel.textContent = 'Tap to connect';
        stopStatsPolling();
        return;
      }
      if (status.sessionStart) {
        dom.statDuration.textContent = formatDuration(Date.now() - status.sessionStart);
      }
      dom.statDown.textContent = formatBytes(status.bytesIn);
      dom.statUp.textContent   = formatBytes(status.bytesOut);
    }, 1000);
  }

  function stopStatsPolling() {
    if (statsInterval) { clearInterval(statsInterval); statsInterval = null; }
  }

  // ── VPN event listeners ────────────────────────────────────
  window.vpnAPI.onStatusUpdate?.((msg) => {
    if (vpnState === 'connecting') {
      dom.connectLabel.textContent = msg;
    }
  });

  window.vpnAPI.onDisconnected((info) => {
    if (vpnState !== 'disconnected') {
      setVPNState('disconnected');
      if (info && info.intentional) {
        dom.connectLabel.textContent = 'Tap to connect';
      } else {
        dom.connectLabel.textContent = 'Connection lost — tap to reconnect';
      }
      stopStatsPolling();
    }
  });

  // ── Boot ───────────────────────────────────────────────────
  let bootRetries = 0;
  const MAX_RETRIES = 5;

  async function boot() {
    // Fetch public IP
    const ip = await window.vpnAPI.getPublicIP();
    dom.statusIP.textContent = ip;

    // Fetch servers
    const result = await window.vpnAPI.fetchServers();
    if (result.success && result.countries && result.countries.length > 0) {
      countries = result.countries;
      renderCountryList('');
      dom.loadingOverlay.classList.add('hide');
      setTimeout(() => { dom.loadingOverlay.style.display = 'none'; }, 400);

      // Auto-connect to best server
      if (getBestServer()) {
        setTimeout(() => doConnect(), 800);
      }
    } else {
      bootRetries++;
      const errMsg = result.error || 'No gateways available';
      if (bootRetries >= MAX_RETRIES) {
        dom.loadingOverlay.querySelector('p').textContent =
          'Could not reach network gateways. Please verify connection and restart.';
      } else {
        dom.loadingOverlay.querySelector('p').textContent =
          `Locating gateways… (${bootRetries}/${MAX_RETRIES})`;
        setTimeout(boot, 5000);
      }
    }
  }

  boot();
})();
