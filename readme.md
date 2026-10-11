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
| **Week 2** | **Proximity Calculations:** Implement MongoDB `$near` queries to group users. Logic to only send WebRTC offer/answers to users within a 100-pixel radius. | **WebRTC Integration:** Implement standard WebRTC peer-to-peer audio connections using browser `getUserMedia`. | ⏳ Next |
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
   - Full Name, Work Email (`@infotact.in`), Username, Role, and 7-palette avatar color customizer.
   - Password encryption using `bcryptjs` with salt rounds.
   - Session authentication via `jsonwebtoken` (JWT).
   - Pre-seeded 1-click demo accounts (*Dr. Aris Thorne*, *Priya Sharma*, *Rohan Mehta*).

---

## 🗄️ 4. MongoDB Database & Compass Integration (`proxify`)

The application connects to your local MongoDB server on port `27017` using the **`proxify`** database:
- **Connection URI:** `mongodb://localhost:27017/proxify`
- **MongoDB Compass Favorite:** Configured under Saved Connections / Favorites as **`proxify`**.
- **Collections in `proxify`:**
  - `users`: User profiles with 2D planar geospatial indexes.
  - `clusters`: Spatial cluster metadata (`name: "proxify"`).
  - `officespaces`: Office zones, furniture coordinates, and spawn points.

---

## 📁 5. Clean Project Structure

```
project_2/
├── package.json              # Workspace root scripts
├── README.md                 # Complete project documentation
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
│       └── components/
│           ├── VirtualOfficeWorld.jsx   # 2D Canvas Layer, smooth movement & socket sync
│           ├── Navbar.jsx               # Infotact branding & world switcher
│           ├── LoginPage.jsx            # Sign-in form with 1-click demo logins
│           ├── SignUpPage.jsx           # Avatar registration with live color picker
│           ├── ProximityRadarPreview.jsx# 2D Canvas spatial audio proximity engine
│           ├── SessionDashboard.jsx     # Post-login authenticated status card
│           └── ForgotPasswordModal.jsx  # Password recovery dialog
│
└── backend/                  # ⚙️ Node.js, Express, Socket.io, MongoDB
    ├── server.js             # HTTP & Socket.io server entry point (port 5000)
    ├── package.json          # Express, Socket.io, Mongoose, JWT, bcryptjs, cors
    ├── .env                  # PORT=5000 & MONGODB_URI=mongodb://localhost:27017/proxify
    ├── node_modules/         # Backend dependencies
    ├── sockets/
    │   └── signaling.js      # WebSocket signaling server & coordinate broadcasting
    ├── models/
    │   ├── User.js           # Mongoose model with 2D planar geospatial index & $near helpers
    │   └── OfficeSpace.js    # 2D office layout zones and obstacles schema
    ├── middleware/
    │   └── auth.js           # JWT authentication middleware
    └── routes/
        ├── auth.js           # Register, Login, Me, Demo accounts endpoints
        └── spatial.js        # Geospatial $near queries and office world API
```

---

## 🔌 6. Socket.io & API Specifications

### Socket.io Events Reference
| Event Name | Direction | Payload | Description |
|---|:---:|---|---|
| `join-space` | Client ➔ Server | `{ id, name, role, avatarColor, location: [x,y] }` | Avatar enters the 2D office space |
| `space-state` | Server ➔ Client | `{ self, peers: [...], totalOnline }` | Initial synchronization of active peers |
| `user-joined` | Server ➔ Peers | `{ socketId, userId, name, role, avatarColor, location }` | Broadcasts when a new peer arrives |
| `avatar-move` | Client ➔ Server | `{ x, y, isMoving }` | Broadcasts avatar coordinate changes |
| `user-moved` | Server ➔ Peers | `{ socketId, userId, location: [x, y], isMoving }` | Relays peer position with smooth lerp |
| `audio-state-change` | Client ➔ Server | `{ micMuted, deafened }` | Broadcasts microphone status |
| `webrtc-offer` | Bidirectional | `{ targetSocketId, callerSocketId, offer }` | Relays WebRTC SDP offer |
| `webrtc-answer` | Bidirectional | `{ targetSocketId, calleeSocketId, answer }` | Relays WebRTC SDP answer |
| `webrtc-ice-candidate` | Bidirectional | `{ targetSocketId, candidate }` | Relays WebRTC ICE candidate |
| `user-left` | Server ➔ Peers | `{ socketId, userId, name }` | Cleans up avatar when disconnected |

### REST Endpoints
- `GET /api/health` — Probes backend status, MongoDB connection, and active modules.
- `GET /api/spatial/room` — Returns office dimensions, zones, and obstacles.
- `GET /api/spatial/nearby?x=...&y=...&radius=...` — Executes native MongoDB `$near` query.
- `POST /api/auth/register` — Registers a new user with spatial avatar preferences.
- `POST /api/auth/login` — Authenticates credentials and issues a JWT token.
- `GET /api/auth/me` — Protected endpoint returning current authenticated profile.

---

## 🏃 7. Running the Application

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

## 🧪 8. How to Test Week 1 Deliverables

1. Open **[http://localhost:3000](http://localhost:3000)** in your browser.
2. Click **"Guest World"** in the top navigation, or sign in using any 1-click demo account (*Dr. Aris Thorne*, *Priya Sharma*, or *Rohan Mehta*) and click **"Launch Virtual Office"**.
3. **Smooth Keyboard Movement:**
   - Press **W, A, S, D** or **Arrow Keys** to glide your avatar across the office floor.
   - Note the smooth acceleration and friction physics!
4. **Mouse Click Navigation:**
   - Click anywhere on the office floor; a targeting reticle appears and your avatar smoothly walks to that coordinate.
5. **Multi-Client Real-Time Synchronization:**
   - Open a **second browser tab** at [http://localhost:3000](http://localhost:3000).
   - Move your avatar in one tab and watch it move smoothly in real time in the other tab!
6. **Acoustic Earshot Proximity Testing:**
   - Walk within 130px of another avatar:
     - Notice the green acoustic connection beam and sound wave ripples linking both avatars.
     - Look at the live status card showing pixel distance and dynamic Web Audio gain percentage!
   - Or click **"Spawn Peer Bot"** inside the canvas to spawn simulated colleagues near you.
7. **MongoDB Geospatial Query Test:**
   ```bash
   curl "http://localhost:5000/api/spatial/nearby?x=200&y=200&radius=300"
   ```

---

### 🏢 Organization & Support
- **Company:** Infotact Solutions
- **Location:** Electronic City Bengaluru, Karnataka, PIN 560100
- **Email:** support@infotact.in
- **Phone:** +91 9124936538
- **Quality Standard:** ISO 9001:2015 Certified
