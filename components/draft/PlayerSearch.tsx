'use client'
import { useState, useMemo } from 'react'
import { Search } from 'lucide-react'
import { toast } from 'sonner'
import type { Player, Pick, Team, DraftRoom } from '@/lib/supabase'

function roleBadgeClass(role: string) {
  const r = role.toLowerCase()
  if (r.includes('batter') || r.includes('batsman')) return 'role-badge role-batter'
  if (r.includes('bowler')) return 'role-badge role-bowler'
  if (r.includes('all')) return 'role-badge role-allrounder'
  if (r.includes('keeper') || r.includes('wk') || r.includes('wicket')) return 'role-badge role-keeper'
  return 'role-badge role-allrounder'
}

interface Props {
  players: Player[]
  isMyTurn: boolean
  myTeamId: string
  roomId: string
  room: DraftRoom
  picks: Pick[]
  teams: Team[]
  myTeam?: Team
  isHost: boolean
  hostId: string
  onPickMade: () => void
}

export default function PlayerSearch({
  players, isMyTurn, myTeamId, roomId, room,
  picks, teams, myTeam, isHost, hostId, onPickMade
}: Props) {
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('All')
  const [loading, setLoading] = useState<string | null>(null)

  // Parse rtm_pending from live room state
  const rtmPending = useMemo(() => {
    if (!room.rtm_pending) return null
    try {
      return typeof room.rtm_pending === 'string'
        ? JSON.parse(room.rtm_pending)
        : room.rtm_pending
    } catch { return null }
  }, [room.rtm_pending])

  const isMyRTM = rtmPending?.eligible_team_id === myTeamId
  const canHostOverride = isHost && !!rtmPending
  const eligibleTeam = rtmPending ? teams.find(t => t.id === rtmPending.eligible_team_id) : null

  const availablePlayers = useMemo(() => players.filter(p => p.available), [players])

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    return availablePlayers.filter(p => {
      const matchesQuery = !q ||
        p.player_name.toLowerCase().includes(q) ||
        p.role.toLowerCase().includes(q) ||
        p.ipl_team.toLowerCase().includes(q)
      const matchesRole =
        roleFilter === 'All' ||
        p.role.toLowerCase().includes(roleFilter.toLowerCase())
      return matchesQuery && matchesRole
    })
  }, [availablePlayers, query, roleFilter])

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

  async function handleRTMDecision(action: 'claim' | 'decline', overrideTeamId?: string) {
    if (!rtmPending) return
    setLoading(`rtm-${action}`)
    try {
      const res = await fetch('/api/rtm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId,
          claimingTeamId: overrideTeamId ?? myTeamId,
          pickNumber: rtmPending.pick_number,
          action,
          isHostOverride: !!overrideTeamId,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(action === 'claim' ? '✅ RTM claimed! You skip your next pick.' : 'RTM declined.')
      onPickMade()
    } catch (e: any) {
      toast.error(e.message ?? 'RTM action failed')
    } finally {
      setLoading(null)
    }
  }

  const roles = ['All', 'Batter', 'Bowler', 'All-Rounder', 'Keeper']

  return (
    <div className="flex flex-col h-full relative">

      {/* ── RTM MODAL — shown to the eligible team ── */}
      {rtmPending && isMyRTM && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center p-4"
          style={{ background: 'rgba(8,12,16,0.93)', backdropFilter: 'blur(4px)' }}
        >
          <div
            className="w-full max-w-xs rounded-lg p-6 text-center"
            style={{ background: 'var(--bg-surface)', border: '2px solid var(--gold)' }}
          >
            <div className="text-3xl mb-2">⚡</div>
            <div
              className="font-display text-xl font-700 mb-1"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--gold)' }}
            >
              RTM OPPORTUNITY
            </div>
            <div
              className="font-display text-2xl font-700 my-3"
              style={{ fontFamily: 'var(--font-display)', color: 'white' }}
            >
              {rtmPending.player_name}
            </div>
            <p className="text-sm mb-1" style={{ color: 'var(--text-dim)' }}>
              You owned this player last season.
              <br />Do you want to reclaim them?
            </p>
            <div
              className="text-xs font-mono my-4 px-3 py-2 rounded"
              style={{ background: 'rgba(245,200,66,0.08)', color: 'var(--gold)' }}
            >
              RTM uses: {myTeam?.rtm_remaining} → {(myTeam?.rtm_remaining ?? 1) - 1} after claim
              <br />
              <span style={{ color: 'var(--text-muted)' }}>You will skip your next pick</span>
            </div>
            <div className="flex gap-2">
              <button
                className="flex-1 py-2.5 rounded font-display font-700 text-sm tracking-wide"
                style={{ fontFamily: 'var(--font-display)', background: 'var(--gold)', color: '#000' }}
                onClick={() => handleRTMDecision('claim')}
                disabled={!!loading}
              >
                {loading === 'rtm-claim' ? '...' : '✅ Use RTM'}
              </button>
              <button
                className="flex-1 py-2.5 rounded btn-ghost text-sm"
                onClick={() => handleRTMDecision('decline')}
                disabled={!!loading}
              >
                {loading === 'rtm-decline' ? '...' : '✗ Decline'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── HOST OVERRIDE — shown to host when RTM is pending ── */}
      {rtmPending && canHostOverride && !isMyRTM && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center p-4"
          style={{ background: 'rgba(8,12,16,0.93)', backdropFilter: 'blur(4px)' }}
        >
          <div
            className="w-full max-w-xs rounded-lg p-6 text-center"
            style={{ background: 'var(--bg-surface)', border: '2px solid var(--gold)' }}
          >
            <div className="text-3xl mb-2">⚡</div>
            <div
              className="font-display text-xl font-700 mb-1"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--gold)' }}
            >
              RTM PENDING
            </div>
            <div
              className="font-display text-2xl font-700 my-3"
              style={{ fontFamily: 'var(--font-display)', color: 'white' }}
            >
              {rtmPending.player_name}
            </div>
            <p className="text-sm mb-4" style={{ color: 'var(--text-dim)' }}>
              Waiting for{' '}
              <span style={{ color: 'var(--accent)' }}>{eligibleTeam?.team_name}</span>
              {' '}to decide...
            </p>
            <div
              className="text-xs font-mono mb-4 px-3 py-2 rounded"
              style={{ background: 'rgba(245,200,66,0.06)', color: 'var(--text-muted)' }}
            >
              Host override — force a decision if participant is unresponsive
            </div>
            <div className="flex gap-2">
              <button
                className="flex-1 py-2 rounded text-xs font-mono"
                style={{ background: 'rgba(245,200,66,0.1)', color: 'var(--gold)', border: '1px solid rgba(245,200,66,0.3)' }}
                onClick={() => handleRTMDecision('claim', rtmPending.eligible_team_id)}
                disabled={!!loading}
              >
                {loading === 'rtm-claim' ? '...' : 'Force Claim'}
              </button>
              <button
                className="flex-1 py-2 rounded text-xs font-mono btn-ghost"
                onClick={() => handleRTMDecision('decline', rtmPending.eligible_team_id)}
                disabled={!!loading}
              >
                {loading === 'rtm-decline' ? '...' : 'Force Decline'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── WAITING NOTICE — shown to everyone else ── */}
      {rtmPending && !isMyRTM && !canHostOverride && (
        <div
          className="px-4 py-2.5 text-center"
          style={{ background: 'rgba(245,200,66,0.05)', borderBottom: '1px solid rgba(245,200,66,0.2)' }}
        >
          <span className="font-mono text-xs uppercase tracking-wider" style={{ color: 'var(--gold)' }}>
            ⏳ {eligibleTeam?.team_name ?? 'A team'} is deciding RTM for {rtmPending.player_name}...
          </span>
        </div>
      )}

      {/* ── SEARCH + FILTERS ── */}
      <div className="p-4 border-b border-[var(--border)]">
        <div className="flex items-center gap-2 mb-3">
          <span
            className="font-display text-sm font-700 tracking-widest uppercase"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--text-dim)' }}
          >
            Player Pool
          </span>
          <span className="ml-auto font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
            {availablePlayers.length} available
          </span>
        </div>
        <div className="relative mb-3">
          <Search
            className="absolute left-2.5 top-1/2 -translate-y-1/2"
            size={14}
            style={{ color: 'var(--text-muted)' }}
          />
          <input
            className="search-input"
            placeholder="Search name, role, IPL team..."
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
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

      {/* ── PLAYER LIST ── */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-6 text-center font-mono text-sm" style={{ color: 'var(--text-muted)' }}>
            No players found
          </div>
        ) : (
          filtered.map(player => (
            <div
              key={player.id}
              className="flex items-center gap-3 px-4 py-3 border-b border-[rgba(255,255,255,0.04)] hover:bg-[var(--bg-raised)] transition-colors group pick-reveal"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white truncate">
                  {player.player_name}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={roleBadgeClass(player.role)}>{player.role}</span>
                  <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                    {player.ipl_team}
                  </span>
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
