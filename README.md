# 🏏 CricketDraft — Real-Time Fantasy Cricket Draft Platform

A production-ready, real-time multiplayer fantasy cricket snake draft platform.
9 teams · 16 rounds · 144 picks · RTM rules · Google Sheets sync · Crash recovery

---

## Stack

| Layer     | Technology                          |
|-----------|-------------------------------------|
| Frontend  | Next.js 14 (App Router) + TypeScript |
| Styling   | Tailwind CSS + custom CSS variables  |
| Realtime  | Supabase Realtime (WebSockets)       |
| Database  | Supabase (PostgreSQL)                |
| Sheets    | Google Sheets API (Service Account)  |
| Hosting   | Vercel                               |

---

## Setup Guide

### 1. Clone & Install

```bash
git clone <your-repo>
cd fantasy-draft
npm install
```

### 2. Supabase Setup

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** → run the full migration:
   ```
   supabase/migrations/001_schema.sql
   ```
3. Copy your project URL and keys from **Settings → API**

### 3. Google Sheets Setup (optional but recommended)

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project → Enable **Google Sheets API**
3. Create a **Service Account** → download JSON key
4. Create a Google Sheet → share it with the service account email (Editor role)
5. Copy the Sheet ID from the URL: `https://docs.google.com/spreadsheets/d/SHEET_ID_HERE/`

### 4. Environment Variables

Copy `.env.local.example` to `.env.local` and fill in:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

GOOGLE_SERVICE_ACCOUNT_EMAIL=draft@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_SHEET_ID=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms
```

### 5. Run Locally

```bash
npm run dev
# Open http://localhost:3000
```

### 6. Deploy to Vercel

```bash
npx vercel --prod
```

Add all environment variables in Vercel dashboard → Settings → Environment Variables.

The `vercel.json` includes a cron job that fires every minute as a timer heartbeat.
For finer-grained timer resolution, the client-side counter handles display.

---

## How to Run a Draft

### Host Flow
1. Open the app → **Create Draft Room**
2. Enter your team name → get a **6-character draft code**
3. Share the code with 8 other participants
4. In the lobby:
   - Upload **Player Pool CSV** (format: `player_id,player_name,role,team_name`)
   - Upload **Previous Season CSV** (column headers = team names, rows = players)
   - Drag teams into desired **draft order**
   - Click **Save Order**, then **⚡ Start Draft**

### Participant Flow
1. Open the app → **Join with Code**
2. Enter the draft code + your team name
3. Wait in the lobby until host starts

### During the Draft
- **Your turn**: the `+` pick button appears on hover in the player list
- **RTM**: if a recently drafted player was owned by you last season, an RTM button appears
- **Search**: filter by name, role (Batter/Bowler/All-Rounder/Keeper), or IPL team
- **Timer**: 60s per pick. Expires → pick auto-skipped

### Host Controls (during draft)
- **Pause** / **Resume**
- **Undo Last Pick** (restores player to pool)

---

## CSV Formats

### Player Pool CSV
```
player_id,player_name,role,team_name
101,Virat Kohli,Batter,RCB
102,Jasprit Bumrah,Bowler,MI
```
See `public/sample_players.csv` for a full example.

### Previous Season CSV (for RTM)
Column-wise: first row = team names, each column = that team's players.
```
Team A,Team B,Team C
Virat Kohli,Bumrah,MS Dhoni
Hardik Pandya,Rohit Sharma,Jadeja
```
See `public/sample_previous_season.csv` for a full example.

---

## RTM Rules

- Each team starts with **2 RTM uses**
- After any pick, a team that owned that player last season can claim RTM
- RTM: transfers the player to the claiming team
- The claiming team **skips their next pick** as penalty
- RTM is validated server-side — no client-side cheating possible

---

## Draft Recovery

All state is persisted in Supabase (PostgreSQL). If the server restarts or a participant disconnects:
- State is reloaded from database on reconnect
- Supabase Realtime re-establishes the WebSocket subscription
- The draft resumes exactly where it left off

---

## Architecture Notes

- **Server-authoritative**: all picks validated server-side (turn order, player availability, RTM eligibility)
- **Optimistic locking**: player `available` flag is checked and set atomically to prevent race conditions
- **Event queue**: pick and RTM requests are processed sequentially via API routes
- **Realtime**: Supabase Realtime pushes changes to all connected clients instantly
