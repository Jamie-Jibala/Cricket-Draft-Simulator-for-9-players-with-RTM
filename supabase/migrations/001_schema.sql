-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Draft Rooms
CREATE TABLE draft_rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  draft_code TEXT UNIQUE NOT NULL,
  host_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting', -- waiting | drafting | paused | completed
  current_pick INTEGER NOT NULL DEFAULT 1,
  total_picks INTEGER NOT NULL DEFAULT 144,
  timer_remaining INTEGER NOT NULL DEFAULT 60,
  timer_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Teams (9 per room)
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID REFERENCES draft_rooms(id) ON DELETE CASCADE,
  team_name TEXT NOT NULL,
  draft_position INTEGER NOT NULL, -- 1-9
  rtm_remaining INTEGER NOT NULL DEFAULT 2,
  skip_next_pick BOOLEAN NOT NULL DEFAULT false,
  is_host BOOLEAN NOT NULL DEFAULT false,
  joined_at TIMESTAMPTZ DEFAULT NOW()
);

-- Players (uploaded via CSV per room)
CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID REFERENCES draft_rooms(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  role TEXT NOT NULL,
  ipl_team TEXT NOT NULL,
  available BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Previous season ownership (for RTM)
CREATE TABLE previous_season (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID REFERENCES draft_rooms(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  team_name TEXT NOT NULL
);

-- Picks
CREATE TABLE picks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID REFERENCES draft_rooms(id) ON DELETE CASCADE,
  pick_number INTEGER NOT NULL,
  round INTEGER NOT NULL,
  team_id UUID REFERENCES teams(id),
  player_id UUID REFERENCES players(id),
  rtm_used BOOLEAN NOT NULL DEFAULT false,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Draft order (stores the 9-team order set by host)
CREATE TABLE draft_order (
  room_id UUID REFERENCES draft_rooms(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  team_id UUID REFERENCES teams(id),
  PRIMARY KEY (room_id, position)
);

-- Indexes
CREATE INDEX idx_players_room_available ON players(room_id, available);
CREATE INDEX idx_picks_room ON picks(room_id, pick_number);
CREATE INDEX idx_teams_room ON teams(room_id);
CREATE INDEX idx_prev_season_room ON previous_season(room_id, player_name);

-- Trigger: update draft_rooms.updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER draft_rooms_updated_at
  BEFORE UPDATE ON draft_rooms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Enable Row Level Security
ALTER TABLE draft_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE previous_season ENABLE ROW LEVEL SECURITY;
ALTER TABLE draft_order ENABLE ROW LEVEL SECURITY;

-- Open policies (auth is handled at app layer via draft_code + team identity)
CREATE POLICY "public_read_rooms" ON draft_rooms FOR SELECT USING (true);
CREATE POLICY "public_read_teams" ON teams FOR SELECT USING (true);
CREATE POLICY "public_read_players" ON players FOR SELECT USING (true);
CREATE POLICY "public_read_picks" ON picks FOR SELECT USING (true);
CREATE POLICY "public_read_prev" ON previous_season FOR SELECT USING (true);
CREATE POLICY "public_read_order" ON draft_order FOR SELECT USING (true);
CREATE POLICY "service_write_rooms" ON draft_rooms FOR ALL USING (true);
CREATE POLICY "service_write_teams" ON teams FOR ALL USING (true);
CREATE POLICY "service_write_players" ON players FOR ALL USING (true);
CREATE POLICY "service_write_picks" ON picks FOR ALL USING (true);
CREATE POLICY "service_write_prev" ON previous_season FOR ALL USING (true);
CREATE POLICY "service_write_order" ON draft_order FOR ALL USING (true);

-- Realtime: enable for all tables
ALTER PUBLICATION supabase_realtime ADD TABLE draft_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE picks;
ALTER PUBLICATION supabase_realtime ADD TABLE players;
ALTER PUBLICATION supabase_realtime ADD TABLE teams;
