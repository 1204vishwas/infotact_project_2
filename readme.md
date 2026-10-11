# Project 2 — "ProxiSpeak": Geospatial Proximity Audio Ecosystem
### Infotact Solutions | Electronic City Bengaluru, Karnataka | ISO 9001:2015

---

## 📌 Overview & Problem Statement
Traditional remote collaboration platforms (like Zoom and Microsoft Teams) isolate users into rigid, static "breakout rooms" where only one participant can speak at a time. They lack the spontaneous, organic spatial dynamics of an in-person office where individuals can overhear nearby conversations and naturally walk over to collaborate.

**ProxiSpeak** solves this by introducing a **2D overhead virtual office** rendered via HTML5 Canvas and React. As users move their avatars closer to colleagues:
- Audio dynamically crossfades and amplifies using the **Web Audio API** (3D stereo panning & volume attenuation).
- A **Node.js, Express & MongoDB Geospatial Engine** tracks real-time $X/Y$ coordinates using native `$near` & `$geoWithin` queries.
- **Socket.io WebSocket Signaling Server** coordinates avatar movements and WebRTC peer-to-peer handshakes based on who is within "earshot" (100–150px proximity radius).

---

## 🎯 Week 1 Implementation Details

| Component | Architecture & Technologies | Deliverables Completed |
|---|---|---|
| **Backend** | **Node.js, Express, Socket.io, MongoDB** | **Signaling & Movement:** Built Socket.io WebSocket server to broadcast avatar $X/Y$ coordinates in real time. Setup MongoDB geospatial schemas with flat 2D planar index (`location: [X,Y]`, `min: -1000, max: 10000`). Implemented `$near` proximity & `$geoWithin` boundary queries. |
| **Frontend** | **React, WebRTC, Canvas API** | **World Rendering:** Built high-performance React HTML5 Canvas 2D layer (60 FPS). Implemented smooth keyboard (WASD & Arrows physics velocity) and mouse (click-to-walk waypoint navigation) avatar movement, obstacle collision detection, dynamic earshot radius rendering, and real-time Socket.io coordinate broadcasting. |

---

## 🚀 Key Modules

### 1. **2D Virtual World (`frontend/src/components/VirtualOfficeWorld.jsx`)**
- **HTML5 Canvas 2D Layer:** High-performance render loop running at steady 60 FPS.
- **Themed Office Zones:**
  - 🎧 **Spatial Audio Lab** (top-left) — 3D stereo panning testing area
  - 💻 **Core WebRTC Bay** (top-right) — engineering cluster desks
  - 💡 **Product & Design Hub** (bottom-left) — whiteboard and roadmap island
  - ☕ **Breakout Lounge & Pantry** (bottom-right) — water cooler & coffee bar
- **Furniture & Collision Boundaries:** Desks, meeting tables, and perimeter boundaries prevent avatars from clipping out of bounds.
- **Smooth Physics-Based Keyboard Walking:**
  - `W, A, S, D` and Arrow keys.
  - Smooth acceleration, damping/friction, and diagonal velocity normalization.
- **Mouse Click-to-Move:** Click anywhere on the office floor to set a waypoint reticle; avatar smoothly navigates toward the target coordinates.
- **Acoustic Earshot Proximity (100–150px):**
  - Dotted circular radius centered on user avatar.
  - Live peer distance tracking: when remote colleagues come within earshot, green connection beams and acoustic wave ripples connect them.
  - Dynamic Web Audio API gain calculation (100% at close range, smoothly attenuating to 0% outside boundary).

### 2. **WebSocket Signaling & Movement Server (`backend/sockets/signaling.js`)**
- **Socket.io Server:** Attached to Node.js HTTP server.
- **Real-Time Coordinate Broadcasting:**
  - `join-space`: Synchronizes all active avatars upon entering the room.
  - `avatar-move`: Broadcasts new `[X, Y]` coordinates to all peers in the room.
  - `space-state`: Supplies initial state to newly joined clients.
  - Smooth linear interpolation (`lerp`) on the frontend ensures remote avatars glide smoothly across the screen.
- **WebRTC Signaling Handshakes:**
  - `webrtc-offer`, `webrtc-answer`, `webrtc-ice-candidate` relays ready for Week 2 audio mesh.
- **Presence & DB Persistence:** Updates user location and online status periodically in MongoDB `proxify`.

### 3. **MongoDB Geospatial Schemas (`backend/models/`)**
- **User Schema (`User.js`):**
  - Indexed via `location: '2d'` (`min: -1000, max: 10000`).
  - Native helper `User.findNearby(x, y, maxDistance)` executes MongoDB `$near` queries.
  - Native helper `User.findWithinBox(bottomLeft, topRight)` executes MongoDB `$geoWithin` box queries.
- **Office Space Schema (`OfficeSpace.js`):**
  - Room dimensions, zone definitions, and obstacle coordinates stored in MongoDB `proxify`.

### 4. **Authentication & Identity Onboarding**
- **Sign Up Page (`SignUpPage.jsx`):** Identity configuration, 7-palette avatar color customizer, role selection, and live password strength analyzer.
- **Login Page (`LoginPage.jsx`):** Work email or username sign-in with 1-click demo accounts (*Dr. Aris Thorne*, *Priya Sharma*, *Rohan Mehta*).
- **Session Dashboard (`SessionDashboard.jsx`):** Profile overview with direct "Launch Virtual Office" CTA.

---

## 🛠️ Project Structure

```
project_2/
├── package.json              # Workspace root scripts
├── README.md                 # Project documentation
│
├── frontend/                 # 🌐 FRONTEND (React, WebRTC, Canvas API)
│   ├── index.html            # Entry HTML & typography
│   ├── package.json          # React, Vite, Lucide-react, Socket.io-client, Tailwind v4
│   ├── vite.config.js        # Vite config with backend & WebSocket proxying
│   ├── public/               # Static assets
│   └── src/
│       ├── App.jsx           # Master application container & view manager
│       ├── index.css         # Styling, radar pulses & audio wave keyframes
│       ├── main.jsx          # React DOM root entry
│       └── components/
│           ├── VirtualOfficeWorld.jsx   # 2D Canvas rendering, WASD/mouse walking & socket sync
│           ├── Navbar.jsx               # Infotact branding & world switcher
│           ├── LoginPage.jsx            # Sign-in form with 1-click demo logins
│           ├── SignUpPage.jsx           # Avatar registration with live color picker
│           ├── ProximityRadarPreview.jsx# 2D Canvas spatial audio proximity engine
│           ├── SessionDashboard.jsx     # Post-login authenticated status card
│           └── ForgotPasswordModal.jsx  # Password recovery dialog
│
└── backend/                  # ⚙️ BACKEND (Node.js, Express, Socket.io, MongoDB)
    ├── server.js             # Express & Socket.io server entry point (port 5000)
    ├── package.json          # Express, Socket.io, Mongoose, JWT, bcryptjs, cors
    ├── .env                  # PORT=5000 & MONGODB_URI=mongodb://localhost:27017/proxify
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

## 🏃 Running the Application

Both servers are currently configured and running:

1. **Frontend Application:**
   ```bash
   npm run frontend
   ```
   *(or `cd frontend && npm run dev`)* — Accessible at: **[http://localhost:3000](http://localhost:3000)**

2. **Backend Authentication & Signaling Server:**
   ```bash
   npm run backend
   ```
   *(or `cd backend && npm start`)* — Accessible at: **[http://localhost:5000](http://localhost:5000)**

3. **Or run concurrently from root:**
   ```bash
   npm run frontend
   npm run backend
   ```

---

## 🧪 Testing Week 1 Deliverables

1. Open **[http://localhost:3000](http://localhost:3000)** in your browser.
2. Click **"Guest World"** in the top navigation or log in with any 1-click demo user (*Dr. Aris*, *Priya*, or *Rohan*) and click **"Launch Virtual Office"**.
3. **Keyboard Movement:** Press **W, A, S, D** or **Arrow Keys** to glide your avatar across the office floor.
4. **Mouse Movement:** Click anywhere on the office floor; your avatar will smoothly walk to that coordinate!
5. **Multi-User / Multi-Tab Synchronization:** Open a second browser tab or an Incognito window at **[http://localhost:3000](http://localhost:3000)**. Walk your avatar in one tab and watch it move in real-time in the other tab!
6. **Earshot Proximity:** Walk within 130px of another avatar:
   - Green acoustic connection lines appear dynamically.
   - Volume gain percentage is calculated in real time.
7. **Spatial Query Test:**
   ```bash
   curl "http://localhost:5000/api/spatial/nearby?x=200&y=200&radius=300"
   ```
