'use client'
import { useState, useMemo } from 'react'
import { Search } from 'lucide-react'
import { toast } from 'sonner'
import type { Player, Pick, Team } from '@/lib/supabase'

function roleBadgeClass(role: string) {
  const r = role.toLowerCase()
  if (r.includes('batter') || r.includes('batsman')) return 'role-badge role-batter'
  if (r.includes('bowler')) return 'role-badge role-bowler'
  if (r.includes('all')) return 'role-badge role-allrounder'
  if (r.includes('keeper') || r.includes('wk')) return 'role-badge role-keeper'
  return 'role-badge role-allrounder'
}

interface Props {
  players: Player[]
  isMyTurn: boolean
  myTeamId: string
  roomId: string
  picks: Pick[]
  teams: Team[]
  myTeam?: Team
  onPickMade: () => void
}

export default function PlayerSearch({ players, isMyTurn, myTeamId, roomId, picks, teams, myTeam, onPickMade }: Props) {
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('All')
  const [loading, setLoading] = useState<string | null>(null) // playerId being processed

  const availablePlayers = useMemo(() => {
    return players.filter(p => p.available)
  }, [players])

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    return availablePlayers.filter(p => {
      const matchesQuery = !q ||
        p.player_name.toLowerCase().includes(q) ||
        p.role.toLowerCase().includes(q) ||
        p.ipl_team.toLowerCase().includes(q)
      const matchesRole = roleFilter === 'All' || p.role.toLowerCase().includes(roleFilter.toLowerCase())
      return matchesQuery && matchesRole
    })
  }, [availablePlayers, query, roleFilter])

  // Build previous season map from picks data (for RTM visual hint)
  // RTM eligibility is validated server-side; here we just show the button if myTeam has RTM left
  const canRTM = (myTeam?.rtm_remaining ?? 0) > 0

  async function handlePick(playerId: string) {
    setLoading(playerId)
    try {
      const res = await fetch('/api/picks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, teamId: myTeamId, playerId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Pick confirmed!')
      onPickMade()
    } catch (e: any) {
      toast.error(e.message ?? 'Pick failed')
    } finally {
      setLoading(null)
    }
  }

  async function handleRTM(pickNumber: number) {
    setLoading(`rtm-${pickNumber}`)
    try {
      const res = await fetch('/api/rtm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, claimingTeamId: myTeamId, pickNumber }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('RTM claimed! You skip your next pick.')
      onPickMade()
    } catch (e: any) {
      toast.error(e.message ?? 'RTM failed')
    } finally {
      setLoading(null)
    }
  }

  // Recent picks that could be RTM'd (last 3 picks, not by my team)
  const recentPicksForRTM = picks
    .filter(p => p.team_id !== myTeamId && !p.rtm_used)
    .slice(-3)
    .reverse()

  const roles = ['All', 'Batter', 'Bowler', 'All-Rounder', 'Keeper']

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-[var(--border)]">
        <div className="flex items-center gap-2 mb-3">
          <span className="font-display text-sm font-700 tracking-widest uppercase text-[var(--text-dim)]"
            style={{ fontFamily: 'var(--font-display)' }}>
            Player Pool
          </span>
          <span className="ml-auto font-mono text-xs text-[var(--text-muted)]">
            {availablePlayers.length} available
          </span>
        </div>
        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={14} />
          <input
            className="search-input"
            placeholder="Search name, role, team..."
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
        {/* Role filter */}
        <div className="flex gap-1 flex-wrap">
          {roles.map(r => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className="text-xs px-2 py-1 rounded border transition-all font-mono"
              style={{
                background: roleFilter === r ? 'var(--accent)' : 'transparent',
                color: roleFilter === r ? '#000' : 'var(--text-muted)',
                borderColor: roleFilter === r ? 'var(--accent)' : 'var(--border)',
              }}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* RTM panel (if applicable) */}
      {canRTM && recentPicksForRTM.length > 0 && (
        <div className="px-3 py-2 border-b border-[var(--border)] bg-[rgba(245,200,66,0.04)]">
          <div className="text-xs font-mono text-[var(--gold)] uppercase tracking-wider mb-2">
            RTM Available ({myTeam?.rtm_remaining} left)
          </div>
          {recentPicksForRTM.map(p => (
            <div key={p.id} className="flex items-center justify-between py-1">
              <span className="text-xs text-white">{(p as any).players?.player_name}</span>
              <button
                className="text-xs px-2 py-0.5 rounded border border-[var(--gold)] text-[var(--gold)] hover:bg-[var(--gold)] hover:text-black transition-all font-mono"
                onClick={() => handleRTM(p.pick_number)}
                disabled={loading === `rtm-${p.pick_number}`}
              >
                RTM
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Player list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-6 text-center text-[var(--text-muted)] font-mono text-sm">
            No players found
          </div>
        ) : (
          filtered.map(player => (
            <div
              key={player.id}
              className="flex items-center gap-3 px-4 py-3 border-b border-[rgba(255,255,255,0.04)] hover:bg-[var(--bg-raised)] transition-colors group pick-reveal"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white truncate">{player.player_name}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={roleBadgeClass(player.role)}>{player.role}</span>
                  <span className="text-xs text-[var(--text-muted)] font-mono">{player.ipl_team}</span>
                </div>
              </div>
              {isMyTurn && (
                <button
                  onClick={() => handlePick(player.id)}
                  disabled={!!loading}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-xs px-3 py-1.5 rounded font-display font-700 tracking-wide"
                  style={{
                    fontFamily: 'var(--font-display)',
                    background: 'var(--accent)',
                    color: '#000',
                    minWidth: '2.5rem',
                  }}
                >
                  {loading === player.id ? '...' : '+'}
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
