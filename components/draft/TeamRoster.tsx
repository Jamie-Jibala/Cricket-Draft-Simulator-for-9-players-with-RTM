'use client'
import type { Pick } from '@/lib/supabase'

function roleBadgeClass(role?: string) {
  if (!role) return 'role-badge role-allrounder'
  const r = role.toLowerCase()
  if (r.includes('batter') || r.includes('batsman')) return 'role-badge role-batter'
  if (r.includes('bowler')) return 'role-badge role-bowler'
  if (r.includes('all')) return 'role-badge role-allrounder'
  if (r.includes('keeper') || r.includes('wk')) return 'role-badge role-keeper'
  return 'role-badge role-allrounder'
}

interface Props {
  picks: Pick[]
  teamName: string
  rtmRemaining: number
}

// Group by role for display
const ROLE_ORDER = ['Batter', 'All-Rounder', 'Bowler', 'Keeper']

export default function TeamRoster({ picks, teamName, rtmRemaining }: Props) {
  const grouped: Record<string, Pick[]> = {}
  picks.forEach(p => {
    const role = (p as any).players?.role ?? 'Unknown'
    const key = ROLE_ORDER.find(r => role.toLowerCase().includes(r.toLowerCase())) ?? 'Other'
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(p)
  })

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-[var(--border)]">
        <div className="font-display text-sm font-700 tracking-widest uppercase text-[var(--text-dim)] mb-1"
          style={{ fontFamily: 'var(--font-display)' }}>
          My Roster
        </div>
        <div className="font-display text-lg font-700 text-white truncate"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--accent)' }}>
          {teamName || '—'}
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="font-mono text-xs text-[var(--text-muted)]">{picks.length} / 16 picks</span>
          <span
            className="font-mono text-xs px-2 py-0.5 rounded border"
            style={{
              color: rtmRemaining > 0 ? 'var(--gold)' : 'var(--text-muted)',
              borderColor: rtmRemaining > 0 ? 'var(--gold-dim)' : 'var(--border)',
              background: rtmRemaining > 0 ? 'rgba(245,200,66,0.08)' : 'transparent',
            }}
          >
            RTM ×{rtmRemaining}
          </span>
        </div>
        {/* Progress bar */}
        <div className="mt-2 h-1 rounded-full bg-[var(--bg-raised)] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${(picks.length / 16) * 100}%`, background: 'var(--accent)' }}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {picks.length === 0 ? (
          <div className="text-center text-[var(--text-muted)] font-mono text-xs p-6">
            No picks yet
          </div>
        ) : (
          ROLE_ORDER.map(role => {
            const group = grouped[role]
            if (!group?.length) return null
            return (
              <div key={role} className="mb-3">
                <div className="text-xs font-mono text-[var(--text-muted)] uppercase tracking-wider px-2 mb-1">
                  {role}s ({group.length})
                </div>
                {group.map((pick, i) => (
                  <div
                    key={pick.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded mb-0.5 pick-reveal"
                    style={{
                      background: pick.rtm_used ? 'rgba(245,200,66,0.08)' : 'var(--bg-raised)',
                      borderLeft: pick.rtm_used ? '2px solid var(--gold)' : '2px solid transparent',
                    }}
                  >
                    <span className="font-mono text-xs text-[var(--text-muted)] w-4 flex-shrink-0">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-white font-medium truncate">
                        {(pick as any).players?.player_name ?? '—'}
                      </div>
                      <div className="text-xs text-[var(--text-muted)] truncate">
                        {(pick as any).players?.ipl_team}
                        {pick.rtm_used && (
                          <span className="ml-1 text-[var(--gold)] text-xs">RTM</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
