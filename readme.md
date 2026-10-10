# Project 2 — "ProxiSpeak": Geospatial Proximity Audio Ecosystem
### Infotact Solutions | Electronic City Bengaluru, Karnataka | ISO 9001:2015

---

## 📌 Overview & Problem Statement
Traditional remote collaboration platforms (like Zoom and Microsoft Teams) isolate users into rigid, static "breakout rooms" where only one participant can speak at a time. They lack the spontaneous, organic spatial dynamics of an in-person office where individuals can overhear nearby conversations and naturally walk over to collaborate.

**ProxiSpeak** solves this by introducing a **2D overhead virtual office** rendered via HTML5 Canvas and React. As users move their avatars closer to colleagues:
- Audio dynamically crossfades and amplifies using the **Web Audio API** (3D stereo panning & volume attenuation).
- A **Node.js & MongoDB Geospatial Engine** tracks real-time $X/Y$ coordinates using native `$near` & `$geoWithin` queries.
- **WebRTC peer-to-peer audio connections** are established dynamically within a 100–150px "earshot" proximity radius.

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
- Live Web Audio API gain attenuation feedback (e.g. 78% gain at 85px; 0% outside earshot).
- Real-time animated audio equalizer waves and dynamic coordinates display.

### 4. **Session Dashboard (`SessionDashboard.jsx`)**
- Displays user's assigned 2D canvas coordinates `[X, Y]` ready for MongoDB `$near` queries.
- Visual badge with role, avatar color, and WebRTC audio stream status.
- One-click "Sign Out" to return to the login interface.

### 5. **Backend Auth Server (`server/`)**
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

## 🛠️ Project Structure

```
project_2/
├── package.json              # Workspace root scripts
├── readme.md                 # Project documentation
├── server/                   # Backend Express & MongoDB Auth API
│   ├── .env                  # Port (5000) & MongoDB URI
│   ├── package.json          # Backend dependencies
│   ├── server.js             # Express server entry point
│   ├── middleware/
│   │   └── auth.js           # JWT authentication middleware
│   ├── models/
│   │   └── User.js           # Mongoose model with 2D planar geospatial index
│   └── routes/
│       └── auth.js           # Register, Login, Me, Demo accounts
└── client/                   # Frontend Vite + React + Tailwind CSS
    ├── index.html            # App HTML & typography
    ├── package.json          # React, Vite, Lucide-react, Tailwind v4
    ├── vite.config.js        # Vite config with backend proxy
    └── src/
        ├── App.jsx           # Master application container & view manager
        ├── index.css         # Tailwind styles & radar pulse keyframes
        ├── main.jsx          # React DOM root entry
        └── components/
            ├── Navbar.jsx               # Infotact branding & ISO 9001 badges
            ├── LoginPage.jsx            # Sign-in form with 1-click demo logins
            ├── SignUpPage.jsx           # Avatar registration with live color picker
            ├── ProximityRadarPreview.jsx# 2D Canvas spatial audio proximity engine
            ├── SessionDashboard.jsx     # Post-login authenticated status card
            └── ForgotPasswordModal.jsx  # Password recovery dialog
```

---

## 🏃 Running the Application

Both servers are currently configured and running:

1. **Frontend Application:**
   ```bash
   cd client
   npm run dev
   ```
   *Accessible at: [http://localhost:3000](http://localhost:3000)*

2. **Backend Authentication Server:**
   ```bash
   cd server
   npm start
   ```
   *Accessible at: [http://localhost:5000](http://localhost:5000)*

3. **Or run concurrently from root:**
   ```bash
   npm run client
   npm run server
   ```
