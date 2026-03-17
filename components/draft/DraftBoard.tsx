'use client'
import { useMemo } from 'react'
import { getTeamIndexForPick, getRoundForPick } from '@/lib/supabase'
import type { Pick, Team, DraftStatus } from '@/lib/supabase'

interface Props {
  picks: Pick[]
  teams: Team[]
  draftOrder: { position: number; team_id: string }[]
  currentPick: number
  totalPicks: number
  myTeamId: string
  status: DraftStatus
}

function roleBadgeClass(role?: string) {
  if (!role) return ''
  const r = role.toLowerCase()
  if (r.includes('batter') || r.includes('batsman')) return 'text-[#00e676]'
  if (r.includes('bowler')) return 'text-[#ff6b6b]'
  if (r.includes('all')) return 'text-[#00d4ff]'
  if (r.includes('keeper') || r.includes('wk') || r.includes('wicket')) return 'text-[#f5c842]'
  return 'text-[var(--text-dim)]'
}

export default function DraftBoard({ picks, teams, draftOrder, currentPick, totalPicks, myTeamId, status }: Props) {
  const NUM_TEAMS = 9
  const NUM_ROUNDS = 16

  const orderedTeams = useMemo(() => {
    return draftOrder
      .slice()
      .sort((a, b) => a.position - b.position)
      .map(o => teams.find(t => t.id === o.team_id))
      .filter(Boolean) as Team[]
  }, [draftOrder, teams])

  // Build team pick lists: team_id → picks sorted by pick_number
  // This is the key fix — board shows picks per TEAM, not per snake slot
  const teamPickMap = useMemo(() => {
    const m: Record<string, Pick[]> = {}
    orderedTeams.forEach(t => { m[t.id] = [] })
    picks
      .slice()
      .sort((a, b) => a.pick_number - b.pick_number)
      .forEach(p => {
        if (m[p.team_id]) m[p.team_id].push(p)
        else m[p.team_id] = [p]
      })
    return m
  }, [picks, orderedTeams])

  // For current pick indicator — which column is on the clock
  const currentTeamColIdx = status === 'drafting'
    ? getTeamIndexForPick(currentPick, NUM_TEAMS)
    : -1

  if (orderedTeams.length === 0) {
    return (
      <div className="p-8 text-center font-mono text-sm" style={{ color: 'var(--text-muted)' }}>
        Draft order not set yet
      </div>
    )
  }

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center gap-3">
        <span className="font-display text-sm tracking-widest uppercase"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--text-dim)' }}>
          Draft Board
        </span>
        {status === 'drafting' && (
          <span className="font-mono text-xs" style={{ color: 'var(--accent)' }}>
            Round {getRoundForPick(currentPick)} · Pick {currentPick}
          </span>
        )}
        <div className="ml-auto flex items-center gap-4 text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm inline-block border"
              style={{ background: 'rgba(245,200,66,0.25)', borderColor: 'var(--gold)' }} />
            RTM
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm inline-block border"
              style={{ background: 'rgba(0,212,255,0.15)', borderColor: 'var(--accent)' }} />
            Your team
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs" style={{ minWidth: `${NUM_TEAMS * 110}px` }}>
          <thead>
            <tr>
              <th className="w-8 font-mono text-right pr-2 pb-2 sticky left-0 z-10"
                style={{ color: 'var(--text-muted)', background: 'var(--bg-deep)' }}>#</th>
              {orderedTeams.map((team, colIdx) => {
                const isCurrentCol = colIdx === currentTeamColIdx
                const isMyCol = team.id === myTeamId
                return (
                  <th key={team.id}
                    className="pb-2 px-2 font-display font-600 tracking-wide text-center transition-colors"
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '0.8rem',
                      color: isCurrentCol ? 'var(--accent)' : isMyCol ? 'rgba(0,212,255,0.7)' : 'var(--text-dim)',
                      borderBottom: isCurrentCol
                        ? '2px solid var(--accent)'
                        : isMyCol
                        ? '1px solid rgba(0,212,255,0.3)'
                        : '1px solid var(--border)',
                    }}>
                    {team.team_name}
                    {isCurrentCol && <span className="ml-1" style={{ color: 'var(--accent)' }}>▾</span>}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: NUM_ROUNDS }, (_, rowIdx) => (
              <tr key={rowIdx} className="group">
                <td className="text-right pr-2 py-0.5 font-mono sticky left-0 z-10"
                  style={{ color: 'var(--text-muted)', background: 'var(--bg-deep)', fontSize: '0.7rem' }}>
                  {rowIdx + 1}
                </td>
                {orderedTeams.map((team, colIdx) => {
                  const teamPicks = teamPickMap[team.id] ?? []
                  const pick = teamPicks[rowIdx] ?? null
                  const isMyTeamCol = team.id === myTeamId
                  const isCurrentCol = colIdx === currentTeamColIdx
                  const isCurrentSlot = isCurrentCol && rowIdx === teamPicks.length && status === 'drafting'

                  return (
                    <td key={team.id} className="px-1.5 py-0.5 transition-all"
                      style={{
                        background: pick?.rtm_used
                          ? 'rgba(245,200,66,0.08)'
                          : isMyTeamCol
                          ? 'rgba(0,212,255,0.04)'
                          : isCurrentCol
                          ? 'rgba(0,212,255,0.03)'
                          : 'transparent',
                        borderLeft: pick?.rtm_used
                          ? '2px solid rgba(245,200,66,0.5)'
                          : isCurrentCol
                          ? '1px solid rgba(0,212,255,0.15)'
                          : '1px solid transparent',
                      }}>
                      {pick ? (
                        <div className="py-1 pick-reveal">
                          <div className="font-medium leading-tight text-white" style={{ fontSize: '0.72rem' }}>
                            {(pick as any).players?.player_name ?? '—'}
                          </div>
                          <div className={`leading-tight ${roleBadgeClass((pick as any).players?.role)}`}
                            style={{ fontSize: '0.65rem' }}>
                            {(pick as any).players?.role}
                            {pick.rtm_used && <span className="ml-1" style={{ color: 'var(--gold)' }}>RTM</span>}
                          </div>
                        </div>
                      ) : isCurrentSlot ? (
                        <div className="py-1 text-center">
                          <div className="inline-block w-1.5 h-1.5 rounded-full animate-pulse"
                            style={{ background: 'var(--accent)' }} />
                        </div>
                      ) : (
                        <div className="py-2 text-center text-xs" style={{ color: 'rgba(255,255,255,0.05)' }}>·</div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
