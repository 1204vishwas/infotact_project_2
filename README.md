# Project 2 — "ProxiSpeak": Geospatial Proximity Audio Ecosystem
### Infotact Solutions | Electronic City Bengaluru, Karnataka | ISO 9001:2015

---

## 📌 Overview & Problem Statement
Traditional remote collaboration platforms (like Zoom and Microsoft Teams) isolate users into rigid, static "breakout rooms" where only one participant can speak at a time. They lack the spontaneous, organic spatial dynamics of an in-person office where individuals can overhear nearby conversations and naturally walk over to collaborate.

**ProxiSpeak** solves this by introducing a **2D overhead virtual office** rendered via HTML5 Canvas and React. As users move their avatars closer to colleagues:
- Peer audio **attenuates with distance** — a colleague's playback volume scales down as they walk away from you.
- A **Node.js & MongoDB Geospatial Engine** tracks real-time $X/Y$ coordinates using native `$near` & `$geoWithin` queries.
- **WebRTC peer-to-peer audio connections** are established dynamically within a 100px "earshot" proximity radius.

---

## 🚀 Implemented Modules (Sign Up & Login System)

This repository implements the **Authentication & Spatial Identity Onboarding Module** for ProxiSpeak:

### 1. **Sign Up Page (`SignUpPage.jsx`)**
- **Spatial Identity Setup:** Full Name, Infotact Work Email, Unique Avatar Tag (`@username`).
- **Virtual Office Role Selection:** Developer (WebRTC & Canvas), Audio Engineer (Spatial 3D Pan), Product Manager, Designer, DevOps.
- **2D Avatar Appearance Customizer:** Real-time color swatches (Indigo Pulse, Emerald Wave, Amber Tone, Cyan Echo, Rose Acoustic, Purple Synth, Electric Sky).
- **Live Canvas Reflection:** Changing your avatar color and name instantly updates the live 2D Proximity Radar visualizer on the screen.
- **Password Security Meter:** Real-time feedback bar measuring length, case sensitivity, numbers, and symbols.
- **Matching Validator & Policies:** Password confirmation check and Infotact workspace compliance agreement.

### 2. **Login Page (`LoginPage.jsx`)**
- **Flexible Credential Auth:** Supports either Work Email or Username identifier.
- **1-Click Quick Demo Accounts:**
  - 🎧 **Dr. Aris Thorne** (`aris@infotact.in` / `password123`) — Audio Engineer Lead
  - 💻 **Priya Sharma** (`priya@infotact.in` / `password123`) — Core WebRTC Specialist
  - 📊 **Rohan Mehta** (`rohan@infotact.in` / `password123`) — Product Manager
- **Show / Hide Password Toggle** & "Remember spatial station" preference persistence.
- **Enterprise Infotact SSO Shortcut:** Quick login for corporate users.
- **Password Recovery Dialog (`ForgotPasswordModal.jsx`):** Modal with simulated security link dispatch.

### 3. **Interactive 2D Proximity Radar (`ProximityRadarPreview.jsx`)**
- Built with HTML5 Canvas.
- Displays an overhead virtual floor with grid lines.
- Illustrates peer avatar distance calculations and the 110px earshot boundary.
- Simulated gain feedback (e.g. 78% gain at 85px; 0% outside earshot) against a scripted peer — this preview is an illustration for the auth screens, not the live 100px radius used in the office canvas.
- Real-time animated audio equalizer waves and dynamic coordinates display.

### 4. **Session Dashboard (`SessionDashboard.jsx`)**
- Displays user's assigned 2D canvas coordinates `[X, Y]` ready for MongoDB `$near` queries.
- Visual badge with role, avatar color, and WebRTC audio stream status.
- One-click "Sign Out" to return to the login interface.

### 5. **Backend Auth Server (`backend/`)**
- **Node.js & Express:** REST API on `http://localhost:5000`.
- **MongoDB Geospatial Index:** User coordinates indexed with `2d` planar index (`min: -1000, max: 10000`).
- **Security:** `bcryptjs` password hashing with salt rounds + `jsonwebtoken` (JWT) token issuance.
- **Auto-Seeding:** Pre-populates default demo team members on launch.
- **Endpoints:**
  - `POST /api/auth/register` — Validates and creates geospatial user profile
  - `POST /api/auth/login` — Authenticates credentials and returns JWT session
  - `GET /api/auth/me` — Protected token verification
  - `GET /api/health` — Backend and MongoDB status probe

---

## 🌍 World Rendering & Coordinate Broadcasting (Canvas Layer)

This module turns the authenticated profile into a living 2D virtual office:

### 6. **React Canvas World (`WorldCanvas.jsx`)**
- **Full 2D overhead office** rendered imperatively on an HTML5 `<canvas>` at 60fps — dark navy floor grid and the four original zones: Spatial Audio Lab, Core WebRTC Bay, Product & Design Hub, and Breakout Lounge & Water Cooler — each with a dashed accent border, icon heading, and furniture (desks, server rack, whiteboard, lounge seating), plus perimeter walls.
- **Smooth keyboard movement:** `WASD` / arrow keys with frame-rate-independent acceleration, clamped max velocity, and friction — diagonal movement is normalized so it never feels faster.
- **Mouse / pointer click-to-walk:** clicking anywhere on the floor steers the avatar with velocity easing toward the target; drag also re-targets.
- **Earshot proximity system:** a pulsing `100px` earshot ring with live Web Audio-style gain attenuation, connection lines and radiating sound waves to peers inside earshot.

### 7. **Real-Time Coordinate Broadcasting (`useWorldSocket.js` + Socket.io)**
- **Socket.io world layer** (`server/realtime/worldSocket.js`) authenticates sockets with the login JWT and maintains a live in-memory roster of avatars.
- **`world:join` / `world:state`** — newcomers receive the office bounds and the full avatar snapshot; others are notified via `world:player-joined`.
- **`world:move`** — high-frequency (<100ms throttled) coordinate broadcasting; every move is relayed to all peers in the world.
- **Geospatial persistence** — coordinates are throttled-upserted back into the MongoDB `2d` index, keeping the `$near` / `$geoWithin` engine live.
- **Graceful degradation** — if the backend is offline, the canvas switches to a local simulation (demo colleagues wander the office) so movement and proximity behaviour remain fully testable.

### 8. **Week 2 — Proximity Audio & WebRTC Peer-to-Peer Audio (`useWebRTC.js`)**
- **100px hearing radius:** `EARSHOT = 100` (`client/src/hooks/useWebRTC.js`) is the single source of truth for the radius. `WorldCanvas.jsx` imports it as `EARSHOT_RADIUS`, so the drawn ring, the "in earshot" HUD and the real connection threshold can never disagree. Distance is Euclidean (`Math.hypot`) in canvas world units (1200×720). A peer connection is only opened for colleagues inside the radius, and the offline demo bots are explicitly excluded from negotiation.
- **Proximity-based voice communication:** users within the 100-pixel hearing radius can establish WebRTC peer-to-peer audio connections, so it is proximity — not a manual breakout room — that decides who can talk to whom. Once the audio connection is successfully established, nearby colleagues can hear each other in real time, and their voices fade as they move apart.
- **Real peer-to-peer audio:** a genuine `RTCPeerConnection` per nearby colleague, fed by `getUserMedia` microphone audio. The audio transceiver is created up front with direction `sendrecv`, so the local mic is attached later via `replaceTrack()` and no renegotiation is ever required. ICE is STUN-only (no TURN relay), so peers behind symmetric NAT may fail to connect.
- **Deterministic initiator:** only the lexicographically smaller user id creates the SDP offer; the other side only answers. This removes offer glare, which previously left the polite peer with zero ICE candidates and a link that never connected.
- **Signaling over Socket.io:** `world:offer`, `world:answer` and `world:ice-candidate` are relayed 1:1 by `server/realtime/worldSocket.js`. The server brokers the handshake only — it never touches the media.
- **Distance-based attenuation:** each peer's remote stream plays through a hidden `<audio autoplay>` element whose `volume` is `0.4 + 0.6 × (1 − distance / 100)` — 100% at zero distance, 40% at the 100px edge. An existing link is kept for a 2.5s grace period, so a peer drifting just past the boundary does not churn the connection.
- **Not implemented:** there is no spatial panning — no `StereoPannerNode` or `PannerNode` is used, so remote voices are centred. Web Audio is used only to analyse RMS level (driving the "speaking" ring and the mic meter) and to generate the 440 Hz test tone; it is not in the remote playback path.
- **Honest diagnostics:** the canvas shows a live `RTC pcs=… tx(…) rx(…)` handshake readout, plus per-peer connection/ICE/signaling state, remote-track and playback flags, and real `bytesReceived` counters from `getStats()`. `window.__proxispeakRtc.snapshot()` exposes the same state to the browser console. There is no automated test suite yet — this behaviour is verified through these runtime diagnostics.

---

### 🛠️ Project Structure

```
project_2/
├── package.json              # Workspace root scripts
├── readme.md                 # Project documentation
├── server/                   # Backend Express & MongoDB Auth API
│   ├── .env                  # Port (5000) & MongoDB URI
│   ├── package.json          # Backend dependencies
│   ├── server.js             # Express entry point + Socket.io world layer
│   ├── middleware/
│   │   └── auth.js           # JWT authentication middleware
│   ├── models/
│   │   └── User.js           # Mongoose model with 2D planar geospatial index
│   ├── realtime/
│   │   ├── worldState.js     # Shared in-memory avatar roster & office bounds
│   │   └── worldSocket.js    # Socket.io coordinate broadcasting handlers
│   └── routes/
│       ├── auth.js           # Register, Login, Me, Demo accounts
│       └── world.js          # GET /api/world/bounds · GET /api/world/online
└── client/                   # Frontend Vite + React + Tailwind CSS
    ├── index.html            # App HTML & typography
    ├── package.json          # React, Vite, Lucide-react, Tailwind v4, socket.io-client
    ├── vite.config.js        # Vite config with backend & socket.io proxy
    └── src/
        ├── App.jsx           # Master application container & view manager
        ├── index.css         # Tailwind styles & radar pulse keyframes
        ├── main.jsx          # React DOM root entry
        ├── hooks/
        │   ├── useWorldSocket.js   # Realtime coordinate-broadcasting hook
        │   └── useWebRTC.js        # 100px earshot gate + WebRTC P2P audio engine
        └── components/
            ├── Navbar.jsx               # Infotact branding & ISO 9001 badges
            ├── LoginPage.jsx            # Sign-in form with 1-click demo logins
            ├── SignUpPage.jsx           # Avatar registration with live color picker
            ├── ProximityRadarPreview.jsx# 2D Canvas spatial audio proximity engine
            ├── SessionDashboard.jsx     # Post-login office dashboard hosting the world
            ├── WorldCanvas.jsx          # React Canvas office + keyboard/mouse movement
            ├── ProfilePanel.jsx         # Identity, role & earshot status readout
            └── ForgotPasswordModal.jsx  # Password recovery dialog
```

---

### 🏃 Running the Application

Both servers are currently configured and running:

1. **Frontend Application:**
   ```bash
   cd frontend
   npm run dev
   ```
   *Accessible at: [http://localhost:3000](http://localhost:3000)*

2. **Backend Authentication Server:**
   ```bash
   cd backend
   npm start
   ```
   *Accessible at: [http://localhost:5000](http://localhost:5000)*

3. **Or run concurrently from root:**
   ```bash
   npm run frontend
   npm run backend
   ```
