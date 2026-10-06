# TikTok Live Stream Overlay & Interactive Studio

An interactive, high-performance broadcast overlay and streamer control center for **TikTok Live**, featuring real-time chat bubbles, on-screen viewer "Buddies", physical Pachinko drops, multi-phase Boss Fights, IFTTT automation rules, and live telemetry stats powered by the `llamaXc` analytics engine.

Built for **OBS Studio**, **Streamlabs Desktop**, and **TikTok LIVE Studio**.

---

## 🚀 Features

- **60 FPS Fabric.js Canvas Engine**: Smooth hardware-accelerated animations, particle fountains, confetti bursts, screen shakes, and floating viewer emotes.
- **Direct TikTok Live Connector**: Direct Webcast WebSocket connection to public TikTok live rooms without requiring paid third-party API subscriptions.
- **OBS-Optimized Transparent Overlay**: Native support for **9:16 (Vertical TikTok Mobile - 1080×1920)** and **16:9 (Horizontal Landscape - 1920×1080)** aspect ratios.
- **Interactive Viewer Buddies**: Viewers who join, like, or gift spawn as customizable interactive Buddies on screen that react to stream events.
- **Pachinko Physics Drop Board**: Peg-board physics drop mini-game triggered on viewer joins, hype trains, and gift combos with customizable prize tiers.
- **Multi-Phase Boss Fights**: Automated or manually triggered raid bosses with scalable HP, real-time participant attack damage, combo streaks, and victory banners.
- **IFTTT Visual Rule Engine**: Custom triggers (*"If viewer sends Galaxy gift, then trigger Pachinko drop and show victory banner"*).
- **Streamer Authentication & Cookie Scanner**: Built-in session scanner and DevTools helper for age-restricted or private rooms.
- **Offline Live Simulator**: Built-in event synthesizer to test all overlay animations, gifts, chats, and sounds without having to be live on TikTok.
- **Procedural Web Audio FX**: Built-in sound effects generated via Web Audio API (fanfares, level-ups, hits, drops) with zero external asset dependencies.

---

## 🛠️ Quick Start (Running Locally)

### Prerequisites

- [Node.js](https://nodejs.org/) v18.0.0 or higher
- npm (bundled with Node.js)
- [OBS Studio](https://obsproject.com/) (or Streamlabs / TikTok LIVE Studio)

### 1. Installation

Clone or extract the repository and install dependencies:

```bash
git clone <repository-url>
cd <project-folder>
npm install
```

### 2. Start the Local Server

Run the development server:

```bash
npm run dev
```

The unified backend and frontend will start at **`http://localhost:3000`**.

- **Streamer Control Dashboard**: [`http://localhost:3000/`](http://localhost:3000/)
- **OBS Browser Source Overlay**: [`http://localhost:3000/overlay`](http://localhost:3000/overlay)

### 3. Production vs Development Data Modes

- **Production Mode (Default - Live Data Only)**:
  By default, `ENABLE_DUMMY_DATA` is disabled (`false`). The system boots with 0 sample viewers, 0 mock stats, and only reflects live viewers and events streaming in real-time from your connected TikTok channel.

- **Development / Sandbox Testing Mode**:
  If you want to pre-populate mock demo viewers (`@NeonStreamer`, `@CyberKitten`, `@PixelNinja`) for local offline design testing:
  ```bash
  # In your .env file or terminal:
  ENABLE_DUMMY_DATA=true npm run dev
  ```

---

## 🎥 Setting Up in OBS Studio

### Step 1: Add a Browser Source
1. Open **OBS Studio**.
2. Under the **Sources** panel, click the **`+`** icon and select **Browser**.
3. Name it `TikTok Live Overlay` and click **OK**.

### Step 2: Configure Resolution & URL

#### For Vertical Streaming (TikTok Mobile / 9:16 Portrait):
- **URL**: `http://localhost:3000/overlay` (or `http://localhost:3000/overlay?aspect=9:16`)
- **Width**: `1080`
- **Height**: `1920`
- **FPS**: `60` (recommended)
- Check **"Shutdown source when not visible"** (optional).
- Check **"Refresh browser when scene becomes active"**.

#### For Landscape Streaming (Desktop / 16:9 Widescreen):
- **URL**: `http://localhost:3000/overlay?aspect=16:9`
- **Width**: `1920`
- **Height**: `1080`
- **FPS**: `60`

### Step 3: Audio Settings (Optional)
- If you want overlay sound effects (boss attacks, pachinko dings, gift fanfares) to play through OBS, check **"Control audio via OBS"** in the Browser Source properties.
- Alternatively, you can listen to audio directly through your streamer dashboard in Chrome/Edge.

---

## 🔴 Connecting to Your TikTok Live Stream

1. Open your browser to [`http://localhost:3000`](http://localhost:3000).
2. Go to the **Live Connector & Simulator** tab.
3. In the username box, enter your TikTok handle (e.g., `babyboss.theshadow` or `@babyboss.theshadow`).
4. Click **Connect Live**.
5. Once your stream is live on TikTok, the status indicator will turn **`CONNECTED (GREEN)`** and live viewer counts, chats, likes, and gifts will automatically appear on your OBS overlay.

### Optional: Logging In with Session Cookies (For Private/Restricted Streams)

If your live stream is age-restricted or requires account authentication:
1. Click **Login / Set Session** or **Scan Cookies**.
2. **Method 1 (Instant Snippet)**: Log into [tiktok.com](https://www.tiktok.com) in your browser, press `F12` to open DevTools Console, paste the 1-click snippet from the modal, and hit Enter. Your `sessionid` will be copied to your clipboard.
3. Paste it into the modal and click **Save & Authenticate**.
4. The authenticated session cookie is securely stored locally in `data/db.json` and attached to all TikTok Webcast requests.

---

## 🧪 Testing with the Built-in Live Simulator

You do not need to be actively live on TikTok to test and customize your overlay!

In the **Streamer Dashboard**:
1. Click **Start Auto Simulation** to stream realistic demo viewers, random chat messages, likes bursts, and periodic gifts.
2. Use the manual test buttons:
   - **Like Burst (50 Likes)**: Triggers floating heart fountains and increments stream hype.
   - **Send Test Chat**: Sends a test chat message that pops up on the canvas with viewer badges.
   - **Send Gift**: Choose between Rose, Donut, Cap & Moustache, Galaxy, or Lion to test particle fireworks and alert banners.
   - **Trigger Pachinko Drop**: Drops a viewer avatar through the Pachinko board down into multiplier slots.
   - **Spawn Boss Attack**: Triggers an interactive raid boss fight with live HP bars and attack effects.

---

## ⚙️ Customization & Rule Builder

- **IFTTT Automation Rules**: Create custom events in the **IFTTT Rules** tab. Match specific viewer actions (first-time join, like threshold, specific gift) and trigger visual banners, buddy animations, or Pachinko drops.
- **Boss Fight Configuration**: Adjust boss HP scaling, countdown timers, trigger patterns, and victory fanfare in the **Boss Fight Studio** tab.
- **CRM & Viewer Leaderboards**: Track top gifters, diamond contributors, chat champions, and loyalty tiers in the **Viewers CRM** tab.
- **Wipe Sample Data**: Click **Wipe Demo Data** at the bottom of the dashboard to clear all mock viewers before starting your real live stream broadcast.

---

## 📁 Project Architecture

```
├── backend/
│   ├── db.ts                  # Persistent JSON database (settings, CRM, streams, rules)
│   ├── eventsRouter.ts        # Event routing, IFTTT rule evaluations, and action dispatcher
│   ├── streamStatsEngine.ts   # llamaXc analytics engine (velocities, retention, leaderboard)
│   ├── tiktokClient.ts        # TikTok-Live-Connector client with cookieJar injection
│   └── types.ts               # Shared TypeScript schemas and event definitions
├── src/
│   ├── audio/
│   │   └── soundFX.ts         # Procedural Web Audio API sound generator
│   ├── components/
│   │   ├── StreamerDashboard.tsx   # Control center & streamer dashboard
│   │   └── LiveStreamStatsPanel.tsx# llamaXc analytics visualization panel
│   ├── overlay/
│   │   ├── FabricOverlay.tsx  # Fabric.js 60 FPS canvas renderer
│   │   └── OverlayPage.tsx    # Standalone transparent OBS browser source page
│   ├── App.tsx                # App routing (Dashboard vs. /overlay)
│   └── main.tsx               # Client entry point
├── server.ts                  # Full-stack Express server with Vite middleware integration
└── package.json
```

---

## 🛡️ License

MIT License. Open-source live connector powered by [zerodytrash/TikTok-Live-Connector](https://github.com/zerodytrash/TikTok-Live-Connector).
