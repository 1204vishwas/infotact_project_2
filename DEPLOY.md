# Deploying ProxiSpeak

The app is deployed as **one web service**: Express serves the API, the Socket.io
server, and the built React client on the same origin. This keeps every
`fetch('/api/...')` and `io('/')` call working without CORS, proxies, or extra
environment variables on the client.

```
https://<your-service>.onrender.com
├── /                → frontend/dist (React SPA)
├── /api/*           → Express routes (auth, world, spatial)
└── /socket.io/*     → Socket.io (world + WebRTC signaling)
```

## 1. MongoDB Atlas (database)

1. Create a free **M0** cluster at https://cloud.mongodb.com
2. **Database Access** → add a user with read/write permissions
3. **Network Access** → add `0.0.0.0/0` (Render's egress IPs are not static)
4. **Connect → Drivers** → copy the connection string and add the DB name:

```
mongodb+srv://<user>:<password>@<cluster>.mongodb.net/proxify?retryWrites=true&w=majority
```

## 2. Push the code

Render deploys from GitHub, so the changes must be pushed first:

```powershell
git add backend/server.js backend/.env.example package.json render.yaml DEPLOY.md
git commit -m "feat: serve built client from backend, add Render deployment config"
git push origin Raghavendra-Patne
```

## 3. Create the Render service

**Option A – Blueprint (uses `render.yaml`)**

1. https://dashboard.render.com/blueprints → **New Blueprint Instance**
2. Select the repo `1204vishwas/infotact_project_2`, branch `Raghavendra-Patne`
3. When prompted for `MONGODB_URI`, paste the Atlas string from step 1
   (`JWT_SECRET` is generated automatically)

**Option B – Manual web service**

| Setting | Value |
|---|---|
| Runtime | Node |
| Build command | `npm run build` |
| Start command | `npm start` |
| Health check path | `/api/health` |
| Env `MONGODB_URI` | Atlas URI |
| Env `JWT_SECRET` | long random string |
| Env `NODE_VERSION` | `22` |

Generate a secret locally with:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## 4. Verify

```powershell
curl https://<your-service>.onrender.com/api/health
```

Expected: `{"status":"online","project":"ProxiSpeak...","database":"Connected to MongoDB",...}`

Then open the URL in a browser and on a phone:

- The page loads over HTTPS (required for microphone access)
- `Backend: Online` / `Socket: Connected` indicators turn green
- Sign up two accounts in two browsers/devices, move both avatars within
  proximity range, and confirm audio connects

## Known limitations

- **Free plan sleeps** after ~15 minutes idle; the first request takes ~30–60 s
  to wake. Paid plans avoid this.
- **WebRTC uses STUN only** (`stun.l.google.com`). Audio works on the same
  network and most home NATs, but can fail on symmetric NAT / corporate
  networks. For reliable audio across any network you need a TURN server
  (e.g. a free https://metered.ca or Twilio account) and the ICE config wired
  into `frontend/src/hooks/useWebRTC.js` + `frontend/src/utils/webrtcManager.js`.
- **Redis is optional.** Without `REDIS_URL` the roster is process-local, which
  is fine for a single instance. Multiple instances need a Redis add-on.
- Rebuild after client changes — the build output (`frontend/dist`) is produced
  by the build command, not committed (it is gitignored).

## Local production preview

```powershell
npm run build
npm start
# http://localhost:5000 serves the built app + API + sockets
```
