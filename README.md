# VPN Pro+

A modern, premium Windows VPN client built with Electron by **ODS Inc.** Automatically connects to a global network of servers across 100+ countries — no manual configuration required.

---

## ✨ Features

| Feature | Description |
|---|---|
| **Auto-connect** | Fetches the live global server list and connects to the best server on launch |
| **100+ Countries** | Browse servers in every available country, with ping & speed stats |
| **3-D Globe** | Animated wireframe globe with flying arcs visualizing your connection |
| **Live Stats** | Real-time IP, ping, session duration, and data transferred |
| **Dark Theme** | Premium dark UI with glassmorphism and micro-animations |
| **Auto-launch** | Starts with Windows (configurable during install) |
| **Embedded Engine** | Fully self-contained high-performance tunnel engine (no third-party app installed) |

---

## 📋 Prerequisites

### For Running (End User)

| Dependency | Notes |
|---|---|
| **Windows 10/11 (x64)** | Required OS |
| **Administrator privileges** | Required to create and manage the secure virtual tunnel |

### For Building (Developer)

| Dependency | Version | Notes |
|---|---|---|
| **Node.js** | 18+ LTS | [Download](https://nodejs.org/) |
| **npm** | 9+ | Bundled with Node.js |
| **Inno Setup** | 6.x | [Download](https://jrsoftware.org/isinfo.php) — required for building the installer |
| **Embedded Engine** | Bundled | Located in `bin/engine/` |

---

## 🚀 Quick Start (Development)

```bash
# 1. Clone the repo
git clone <repo-url> && cd "VPN Pro+"

# 2. Install dependencies
npm install

# 3. Setup WAN Virtual Network Driver (one-time)
# Double-click setup_driver.bat or run:
npm run setup:driver

# 4. Run in development (Administrator mode required for routing)
npm run start:admin
# Or standard run (if your terminal is already elevated):
npm start
```

> **Note:** Connecting to a VPN server requires the **WAN Virtual Network Driver** (TAP-Windows6 adapter named `WAN`) and the app to be run as **Administrator** so the engine has permissions to configure routing tables and network adapters.

---

## 🔨 Build & Package

### Step 1 — Build the Electron app

```bash
# Creates dist/win-unpacked/ with the portable app
npm run dist
```

### Step 2 — Prepare the OpenVPN installer

Download the OpenVPN Community Client MSI from [openvpn.net/community-downloads](https://openvpn.net/community-downloads/) and place it at:

```
installer/deps/openvpn-install.msi
```

### Step 3 — Compile the installer with Inno Setup

1. Open **Inno Setup Compiler** (iscc.exe).
2. Open `installer/vpn_pro_plus.iss`.
3. Click **Build → Compile** (or run from command line):

```bash
"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer\vpn_pro_plus.iss
```

4. The installer executable will be generated at:

```
installer/output/VPNProPlus_Setup_1.0.0.exe
```

---

## 📂 Project Structure

```
VPN Pro+/
├── main.js                  # Electron main process
├── preload.js               # Context bridge (IPC)
├── package.json             # Project manifest
├── LICENSE.txt              # MIT License
├── README.md                # This file
├── assets/
│   └── icon.ico             # App icon
├── renderer/
│   ├── index.html           # UI shell
│   ├── styles.css           # Dark theme & animations
│   ├── app.js               # App logic (servers, connect, stats)
│   └── globe.js             # Three.js 3D globe
├── installer/
│   ├── vpn_pro_plus.iss     # Inno Setup script
│   ├── deps/                # Place openvpn-install.msi here
│   └── output/              # Built installer output
└── dist/                    # electron-builder output
```

---

## 🔧 How It Works

1. **Server List** — On launch, the app fetches a live server directory from a public API, parses it, and groups servers by country. Each country's servers are ranked by quality score (descending) and ping (ascending).

2. **Connection** — When you press Connect, the app:
   - Selects the best available server (or the one you manually chose)
   - Decodes the server's OpenVPN configuration
   - Writes it to a temporary `.ovpn` file
   - Spawns `openvpn.exe --config <file>` as a child process
   - Watches stdout for `Initialization Sequence Completed`

3. **Disconnection** — Terminates the OpenVPN process and cleans up.

4. **Stats** — Polls the OpenVPN process output for TUN/TAP byte counters and uses `api.ipify.org` for the public IP.

---

## ⚠️ Important Notes

- **Admin Rights**: OpenVPN requires administrator privileges to create the virtual network adapter. Run the app as Administrator for full functionality.
- **Firewall**: Windows Firewall may prompt you to allow OpenVPN access. Allow it on private and public networks.
- **Server Availability**: Servers are community-operated. Availability, speed, and reliability may vary. The app auto-selects the best available server, but you can manually choose any country.
- **Privacy**: This app does not log or transmit any user data. All VPN traffic flows directly between your machine and the selected server.

---

## 📜 License

MIT © ODS Inc.
