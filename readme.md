# Project 2 — "ProxiSpeak": Geospatial Proximity Audio Ecosystem
### Infotact Solutions | Electronic City Bengaluru, Karnataka | ISO 9001:2015

[![License](https://img.shields.io/badge/License-ISC-blue.svg)](#)
[![Stack](https://img.shields.io/badge/Stack-Node.js_|_Express_|_Socket.io_|_MongoDB_|_React_|_Canvas_API-indigo.svg)](#)
[![Certification](https://img.shields.io/badge/ISO-9001%3A2015_Certified-emerald.svg)](#)
[![Status](https://img.shields.io/badge/Week_1-Completed_&_Online-success.svg)](#)

---

## 📌 1. Overview & Problem Statement

Traditional remote collaboration tools (such as Zoom, Microsoft Teams, and Google Meet) force participants into rigid, artificial "breakout rooms" where only one individual can speak at a time. They lack the spontaneous, organic spatial dynamics of a physical office—where you can overhear colleagues chatting nearby, naturally walk over, and spontaneously join or leave discussions.

**ProxiSpeak** solves this by establishing a **2D overhead virtual office** rendered via the **HTML5 Canvas API** in **React**. As users move their avatars closer to colleagues:
- Audio dynamically crossfades and amplifies using the **Web Audio API** (3D stereo panning & volume attenuation).
- A **Node.js, Express & MongoDB Geospatial Engine** continuously tracks real-time $X/Y$ coordinates using native `$near` & `$geoWithin` queries.
- A **Socket.io WebSocket Signaling Server** coordinates avatar movements and WebRTC peer-to-peer handshakes based on who is within "earshot" (100–150px proximity threshold).

---

## 🗺️ 2. Week-Wise Development Plan

| Week | Backend (Node.js, Express, Socket.io, MongoDB) | Frontend (React, WebRTC, Canvas API) | Status |
|:---:|---|---|:---:|
| **Week 1** | **Signaling & Movement:** Build WebSocket server to broadcast avatar $X/Y$ coordinates. Setup basic MongoDB geospatial schemas. | **World Rendering:** Build the React Canvas layer. Implement smooth keyboard/mouse avatar movement and coordinate broadcasting. | **✅ COMPLETED** |
| **Week 2** | **Proximity Calculations:** Implement MongoDB `$near` queries to group users. Logic to only send WebRTC offer/answers to users within a 100-pixel radius. | **WebRTC Integration:** Implement standard WebRTC peer-to-peer audio connections using browser `getUserMedia`. | **✅ COMPLETED** |
| **Mid-Project Review** | **Spatial Audit:** Prove backend accurately filters and clusters users based on geospatial coordinates under 20ms. | **Audio Check:** Demonstrate two browsers successfully establishing a WebRTC audio connection via the signaling server. | ⏳ Planned |
| **Week 3** | **Mesh Scaling:** Optimize WebRTC mesh network. Implement Redis Pub/Sub to allow scaling Socket.io across multiple Node instances. | **Dynamic Attenuation:** Hook WebRTC audio tracks into Web Audio API. Write algorithms to calculate volume drop-off based on pixel distance. | ⏳ Planned |
| **Week 4** | **Room Persistence:** Save office layouts and furniture obstacles (which block sound) into MongoDB. | **Refine & Polish:** Add 3D audio panning (stereo separation). Ensure Canvas animations render at a steady 60 FPS. | ⏳ Planned |
| **Final Review** | Highly scalable, stateful geospatial server managing complex P2P routing logic. | Immersive, physics-aware communication platform demonstrating advanced browser audio manipulation. | 🎯 Target |

---

## 🚀 3. Week 1 Deliverables Implemented

### 🌐 Frontend (React, Canvas API, WebSockets)
1. **HTML5 Canvas World Layer (`VirtualOfficeWorld.jsx`):**
   - High-performance animation loop maintaining a steady **60 FPS** via `requestAnimationFrame`.
   - 4 themed collaborative office zones:
     - 🎧 **Spatial Audio Lab** (top-left) — 3D stereo panning and acoustic isolation chamber
     - 💻 **Core WebRTC Bay** (top-right) — developer desk pods
     - 💡 **Product & Design Hub** (bottom-left) — interactive whiteboard and roadmap island
     - ☕ **Breakout Lounge & Pantry** (bottom-right) — water cooler and coffee bar
   - Central Round Conference Table with meeting circle.
   - Desks and furniture obstacles with drop-shadows and collision boundaries.
2. **Smooth Physics-Based Keyboard Walking:**
   - Responsive controls via **W, A, S, D** or **Arrow Keys**.
   - Built with physics velocity (`vx`, `vy`), acceleration (`0.85`), friction/damping (`0.82`), and diagonal velocity normalization.
3. **Mouse Click-to-Move Waypoint Navigation:**
   - Click anywhere on the office floor to set a waypoint target with animated ripple reticles; avatar smoothly walks to the destination coordinates.
4. **Perimeter & Obstacle Collision Detection:**
   - Prevents avatars from clipping outside the room walls or walking through desks.
5. **Real-Time Coordinate Broadcasting:**
   - Emits position updates over `socket.io-client`.
   - Uses linear interpolation (**lerp**) to smoothly glide remote peer avatars across screens without stuttering.
6. **Acoustic Earshot Proximity Circle (100–150px):**
   - Renders a dotted acoustic hearing circle around the avatar.
   - Automatically detects peers entering earshot, drawing dynamic green acoustic connection beams with animated sound wave ripples.
   - Calculates real-time distance in pixels and **Web Audio API gain percentage** ($100\%$ at close range, smoothly attenuating to $0\%$ outside earshot).
7. **Interactive HUD & Controls:**
   - Live coordinates display (`[X, Y]`), current office zone indicator, and online avatars counter.
   - Microphone Mute/Unmute toggle.
   - Earshot Radius slider ($80\text{px} - 200\text{px}$).
   - "Spawn Peer Bot" button to test multi-avatar proximity immediately in a single window.

### ⚙️ Backend (Node.js, Express, Socket.io, MongoDB)
1. **WebSocket Signaling & Movement Server (`backend/sockets/signaling.js`):**
   - Built with `socket.io` attached to the HTTP server on port `5000`.
   - `join-space`: Synchronizes all active avatars upon entering the room.
   - `avatar-move`: Broadcasts avatar $X/Y$ coordinates to all peers in the space in real-time.
   - `user-joined` & `user-left`: Manages arrivals and departures cleanly.
   - Periodic database update queue updates MongoDB without choking frame rates.
   - WebRTC signaling relays (`webrtc-offer`, `webrtc-answer`, `webrtc-ice-candidate`) prepared for Week 2 audio peer handshakes.
2. **MongoDB Geospatial Schemas (`backend/models/`):**
   - **`User.js`:**
     - Flat 2D Cartesian plane indexing (`location: [X, Y]`, `min: -1000, max: 10000`).
     - Static helper `User.findNearby(x, y, maxDistance)` executing native MongoDB **`$near`** proximity queries.
     - Static helper `User.findWithinBox(bottomLeft, topRight)` executing native MongoDB **`$geoWithin`** boundary cluster queries.
   - **`OfficeSpace.js`:**
     - Stores office boundaries ($900 \times 660$), zone geometries, furniture obstacles, and spawn coordinates.
3. **Spatial REST API Endpoints (`backend/routes/spatial.js`):**
   - `GET /api/spatial/room` — Returns office zones, obstacles, and spawn coordinates.
   - `GET /api/spatial/nearby?x=...&y=...&radius=...` — Executes native MongoDB `$near` query and returns closest avatars ranked by proximity distance.
4. **Authentication & Identity System (`backend/routes/auth.js`):**
   - **Gmail-Only Policy:** Registration, login, and password reset strictly require verified Gmail addresses (`@gmail.com`).
   - **Social Sign-In / Sign-Up:** 1-click **Continue with Google** and **Continue with Facebook** authentication via `POST /api/auth/social-login`.
   - **Interactive Social OAuth Dialog (`SocialAuthModal.jsx`):** High-fidelity Google and Facebook account picker modals with Gmail validation.
   - **Password Security & JWT:** `bcryptjs` password hashing with salt rounds and 7-day signed JWT tokens.
   - **Pre-seeded Demo Accounts:** 1-click demo logins (*Dr. Aris Thorne*, *Priya Sharma*, *Rohan Mehta*) updated with `@gmail.com` addresses.

---

## 🔊 4. Week 2 Deliverables: Proximity Calculations & WebRTC 100-Pixel Gatekeeper

### 🧭 1. Native MongoDB `$near` Geospatial Grouping (`backend/models/User.js`)
- **2D Planar Cartesian Indexing:** Avatars are mapped on a canvas pixel grid `[X, Y]` indexed via `userSchema.index({ location: '2d' })`.
- **`User.findNearby(x, y, maxDistance = 100)`:** Uses native MongoDB `$near` to retrieve ranked nearby peers within the 100-pixel earshot limit, computing exact Euclidean distance $d = \sqrt{\Delta x^2 + \Delta y^2}$, acoustic attenuation gain ($10\% - 100\%$), and WebRTC eligibility.
- **Iterative Audio Pod Clustering (`User.groupUsersByProximity(radius = 100)`):**
  - Clusters unvisited users within a 100px radius into discrete audio groups (`pod-1`, `pod-2`, ...).
  - Calculates dynamic geometric centroids $\bar{C} = \left(\frac{\sum x}{n}, \frac{\sum y}{n}\right)$.
  - Designates pod leaders and isolates avatars $> 100\text{px}$ away into a `soloUsers` list with WebRTC restrictions.

### 🛡️ 2. Strict WebRTC 100-Pixel Radius Gatekeeper (`backend/sockets/signaling.js`)
- **Backend Distance Verification:** Server computes real-time Euclidean distance between sender and recipient coordinates before forwarding any WebRTC packet.
- **Offer/Answer Relay Gatekeeper:**
  - $\mathbf{d \le 100\text{px}}$: **ACCEPTED.** Server forwards `webrtc-offer` / `webrtc-answer` to the target peer with enriched proximity metadata (`distance`, `maxRadius: 100`, `gain`, `inRange: true`).
  - $\mathbf{d > 100\text{px}}$: **BLOCKED.** Server immediately drops the signaling packet and emits `webrtc-signal-rejected` to the caller with `reason: 'OUT_OF_PROXIMITY_RANGE'`, distance, and descriptive message.
- **ICE Candidate Gatekeeper:** Drops `webrtc-ice-candidate` packets if distance between peers exceeds 100px.
- **Dynamic Proximity Boundary Transitions (`avatar-move`):**
  - `proximity-peer-entered`: Emitted when two avatars cross inside $\le 100\text{px}$. Includes glare prevention logic (`socket.id < peerSocketId` initiates offer).
  - `proximity-peer-left`: Emitted when avatars drift beyond $> 100\text{px}$, prompting the client to close the WebRTC peer connection.

### 🎛️ 3. Frontend Interactive Proximity Testing (`VirtualOfficeWorld.jsx`)
- **`$near Groups` Modal:** Live inspection modal fetching and rendering MongoDB `$near` audio pods, member lists, centroids, and solitary avatars.
- **Dual Test Spawners:**
  - `Spawn Near (~70px)`: Places a peer within the 100px earshot zone (WebRTC signaling allowed).
  - `Spawn Far (>100px)`: Places a peer at 160px (WebRTC signaling blocked by server gatekeeper).
- **Manual Signal Button:** Dispatches test WebRTC offers with visual toast alerts showing server approval or rejection.

### 🎙️ 4. Standard WebRTC P2P Audio Integration via `getUserMedia` (`webrtcManager.js`)
- **Browser Audio Capture:** Requests microphone stream via `navigator.mediaDevices.getUserMedia` with high-fidelity acoustic constraints (`echoCancellation: true`, `noiseSuppression: true`, `autoGainControl: true`, `channelCount: 1`).
- **WebRTC PeerConnection Lifecycle:**
  - Standard Google STUN servers (`stun.l.google.com:19302`).
  - Attaches local audio tracks to `RTCPeerConnection`.
  - Full handshake flow: `createOffer()`, `setLocalDescription()`, `setRemoteDescription()`, `createAnswer()`, and ICE candidate trickling.
  - Queues early ICE candidates and flushes them automatically once remote descriptions are set.
- **Dynamic Distance-Based Audio Attenuation:**
  - Distance $\le 100\text{px}$: Gain smoothly scales from $100\%$ at close proximity down to $10\%$ at the 100px boundary.
  - Distance $> 100\text{px}$: Audio channel closes and resets volume to $0\%$.
- **HTML5 Canvas Real-Time Audio Visualizer (`AudioWaveformVisualizer.jsx`):**
  - **Oscilloscope Waveform:** 60 FPS time-domain wave render with neon gradient (`#38bdf8` -> `#818cf8` -> `#f472b6`).
  - **FFT Spectrum Analyzer:** 32-band frequency equalizer bars bouncing in sync with human voice fundamentals.
  - **VU Decibel Meter:** Real-time volume level display in decibels (-60 dB to 0 dB) with speech detection flags.
  - **Interactive Loopback Self-Test:** In-browser WebRTC loopback test (`pc1 <-> pc2`) allowing developers to test microphone input, playback, and visualizer without needing a second participant.
- **Canvas World Acoustic Features:**
  - **Voice Acoustic Emission Rings:** Avatars emit pulsating shockwaves on the canvas when speaking.
  - **Acoustic Sine Wave Beam:** Fluid undulating sound wave connecting avatars within 100px earshot.
  - **Speech Equalizers:** Animated 3-bar speech equalizer above avatars actively speaking.

---

## 🗄️ 5. MongoDB Database & Compass Integration (`proxify`)

The application connects to your local MongoDB server on port `27017` using the **`proxify`** database:
- **Connection URI:** `mongodb://localhost:27017/proxify`
- **MongoDB Compass Favorite:** Configured under Saved Connections / Favorites as **`proxify`**.
- **Collections in `proxify`:**
  - `users`: User profiles with 2D planar geospatial indexes.
  - `clusters`: Spatial cluster metadata (`name: "proxify"`).
  - `officespaces`: Office zones, furniture coordinates, and spawn points.

---

## 📁 6. Clean Project Structure

```
project_2/
├── package.json              # Workspace root scripts
├── readme.md                 # Complete project documentation
│
├── frontend/                 # 🌐 React, WebRTC, Canvas API
│   ├── index.html            # Entry HTML & Plus Jakarta Sans typography
│   ├── package.json          # React, Vite, Socket.io-client, Lucide-react, Tailwind v4
│   ├── vite.config.js        # Vite config with /api and WebSocket proxying
│   ├── public/               # Static assets & favicons
│   ├── node_modules/         # Frontend dependencies
│   └── src/
│       ├── App.jsx           # Main controller & view transition manager
│       ├── main.jsx          # React DOM root entry
│       ├── index.css         # Tailwind styles & radar pulse keyframes
│       ├── utils/
│       │   └── webrtcManager.js         # WebRTC P2P manager, getUserMedia, Web Audio API & loopback
│       └── components/
│           ├── VirtualOfficeWorld.jsx   # 2D Canvas Layer, 100px proximity gatekeeper & pods
│           ├── AudioWaveformVisualizer.jsx # HTML5 Canvas audio oscilloscope & FFT spectrum visualizer
│           ├── Navbar.jsx               # Infotact branding & world switcher
│           ├── LoginPage.jsx            # Sign-in form with Gmail & Social OAuth
│           ├── SignUpPage.jsx           # Avatar registration with live color picker
│           ├── ProximityRadarPreview.jsx# 2D Canvas spatial audio proximity engine
│           ├── SessionDashboard.jsx     # Post-login authenticated status card
│           ├── SocialAuthModal.jsx      # Google & Facebook authentication dialogs
│           └── ForgotPasswordModal.jsx  # Password recovery dialog
│
└── backend/                  # ⚙️ Node.js, Express, Socket.io, MongoDB
    ├── server.js             # HTTP & Socket.io server entry point (port 5000)
    ├── package.json          # Express, Socket.io, Mongoose, JWT, bcryptjs, cors
    ├── .env                  # PORT=5000 & MONGODB_URI=mongodb://localhost:27017/proxify
    ├── node_modules/         # Backend dependencies
    ├── sockets/
    │   └── signaling.js      # Strict 100px WebRTC gatekeeper & real-time movement
    ├── models/
    │   ├── User.js           # 2D Cartesian index, $near helpers & audio pod clustering
    │   └── OfficeSpace.js    # 2D office layout zones and obstacles schema
    ├── middleware/
    │   └── auth.js           # JWT authentication middleware
    └── routes/
        ├── auth.js           # Gmail-only auth, Google/Facebook OAuth endpoints
        └── spatial.js        # Proximity pods, $near queries & 100px verification
```

---

## 🔌 7. Socket.io & API Specifications

### Socket.io Events Reference
| Event Name | Direction | Payload | Description |
|---|:---:|---|---|
| `join-space` | Client ➔ Server | `{ id, name, role, avatarColor, location: [x,y] }` | Avatar enters the 2D office space |
| `space-state` | Server ➔ Client | `{ self, peers: [...], totalOnline }` | Initial synchronization of active peers |
| `user-joined` | Server ➔ Peers | `{ socketId, userId, name, role, avatarColor, location }` | Broadcasts when a new peer arrives |
| `avatar-move` | Client ➔ Server | `{ x, y, isMoving }` | Broadcasts avatar coordinate changes |
| `user-moved` | Server ➔ Peers | `{ socketId, userId, location: [x, y], isMoving }` | Relays peer position with smooth lerp |
| `audio-state-change` | Client ➔ Server | `{ micMuted, deafened }` | Broadcasts microphone status |
| `proximity-peer-entered` | Server ➔ Peer | `{ peerSocketId, peerUser, distance, shouldInitiateOffer }` | Fired when distance $\le 100\text{px}$; triggers WebRTC handshake |
| `proximity-peer-left` | Server ➔ Peer | `{ peerSocketId, distance, reason }` | Fired when distance $> 100\text{px}$; triggers WebRTC audio teardown |
| `webrtc-offer` | Bidirectional | `{ targetSocketId, offer }` | **Gatekeeper:** Routed only if $d \le 100\text{px}$; otherwise rejected |
| `webrtc-answer` | Bidirectional | `{ targetSocketId, answer }` | **Gatekeeper:** Routed only if $d \le 100\text{px}$; otherwise rejected |
| `webrtc-ice-candidate`| Bidirectional | `{ targetSocketId, candidate }` | **Gatekeeper:** Relayed only if $d \le 100\text{px}$ |
| `webrtc-signal-rejected`| Server ➔ Caller| `{ type, targetSocketId, distance, maxRadius, reason, message }` | Emitted when signaling blocked due to distance $> 100\text{px}$ |
| `get-proximity-groups`| Client ➔ Server| `{ radius }` | Requests live MongoDB `$near` clustering computation |
| `proximity-groups-updated`| Server ➔ Client| `{ clusters, soloUsers, totalClusters, totalUsers }` | Broadcasts updated proximity audio pods |
| `user-left` | Server ➔ Peers | `{ socketId, userId, name }` | Cleans up avatar when disconnected |

### REST Endpoints
- `GET /api/health` — Probes backend status, MongoDB connection, and active modules.
- `GET /api/spatial/groups?radius=100` — Computes and returns MongoDB `$near` audio pods and centroids.
- `POST /api/spatial/verify-proximity` — Verifies two sets of coordinates against the 100-pixel WebRTC gatekeeper limit (`fromCoords`, `toCoords`).
- `GET /api/spatial/nearby?x=...&y=...&radius=100` — Executes native MongoDB `$near` query returning avatars within radius with WebRTC range status.
- `GET /api/spatial/room` — Returns office dimensions, zones, and obstacles.
- `POST /api/auth/register` — Registers a new user with spatial avatar preferences (Gmail required).
- `POST /api/auth/login` — Authenticates credentials and issues a JWT token.
- `POST /api/auth/social-login` — Authenticates via Google or Facebook OAuth credentials.
- `GET /api/auth/me` — Protected endpoint returning current authenticated profile.

---

## 🏃 8. Running the Application

### 1. Start Frontend (React + Vite)
```bash
cd frontend
npm run dev
```
Accessible at: **[http://localhost:3000](http://localhost:3000)**

### 2. Start Backend (Express + Socket.io + MongoDB)
```bash
cd backend
npm start
```
Accessible at: **[http://localhost:5000](http://localhost:5000)**

### 3. Run Both from Workspace Root
```bash
npm run frontend
npm run backend
```

---

## 🧪 9. How to Test Proximity Calculations & WebRTC Gatekeeper

### A. Testing the Strict 100-Pixel Radius WebRTC Gatekeeper
1. Open **[http://localhost:3000](http://localhost:3000)** and launch the Virtual Office.
2. In the top-right toolbar:
   - Click **`Spawn Near (~70px)`**: Spawns a bot ~70 pixels away within the 100px proximity boundary.
     - Note the green acoustic ring and connection beam connecting you and the bot.
     - Click **`Signal`** on the peer in the Earshot list: the offer is successfully routed and approved by the backend server!
   - Click **`Spawn Far (>100px)`**: Spawns a bot ~160 pixels away outside the 100px boundary.
     - Click **`Signal`** on the far peer: The backend Socket.io gatekeeper instantly intercepts and **blocks** the offer, emitting `webrtc-signal-rejected`!
     - A warning alert appears indicating: *"WebRTC Offer Blocked: Peer is 160px away, exceeding the 100-pixel earshot limit."*
3. **Boundary Transitions:**
   - Walk your avatar closer to the distant bot using **W, A, S, D**.
   - As soon as the distance drops to $\le 100\text{px}$, the server emits `proximity-peer-entered`.
   - Walk away until distance $> 100\text{px}$; the server emits `proximity-peer-left` and terminates the audio peer connection.

### B. Testing MongoDB `$near` Audio Pod Groupings
1. In the Virtual Office HUD, click the **`$near Groups`** button.
2. A modal dialog opens showing real-time clustering computed by MongoDB `$near` queries on the 2D Cartesian index:
   - **Audio Pods:** Groups of users clustered within a 100px radius, displaying calculated centroid coordinates $\bar{C} = [X, Y]$, pod leader, and members with Euclidean distances.
   - **Solo Users:** Out-of-range avatars located $> 100\text{px}$ from any colleague, marked with *"No peers within 100-pixel radius (WebRTC offers restricted)"*.
3. Test via REST API directly:
   ```bash
   # Inspect MongoDB $near proximity pods
   curl "http://localhost:5000/api/spatial/groups?radius=100"

   # Verify coordinate pair proximity against 100px gatekeeper
   curl -X POST "http://localhost:5000/api/spatial/verify-proximity" \
     -H "Content-Type: application/json" \
     -d "{\"fromCoords\": [200, 200], \"toCoords\": [260, 240]}"
   ```

---

### 🏢 Organization & Support
- **Company:** Infotact Solutions
- **Location:** Electronic City Bengaluru, Karnataka, PIN 560100
- **Email:** support@infotact.in
- **Phone:** +91 9124936538
- **Quality Standard:** ISO 9001:2015 Certified
