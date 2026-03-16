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
  if (r.includes('keeper') || r.includes('wk')) return 'text-[#f5c842]'
  return 'text-[var(--text-dim)]'
}

export default function DraftBoard({ picks, teams, draftOrder, currentPick, totalPicks, myTeamId, status }: Props) {
  const NUM_TEAMS = 9
  const NUM_ROUNDS = 16

  // Build ordered teams list
  const orderedTeams = useMemo(() => {
    return draftOrder
      .slice()
      .sort((a, b) => a.position - b.position)
      .map(o => teams.find(t => t.id === o.team_id))
      .filter(Boolean) as Team[]
  }, [draftOrder, teams])

  // Build pick map: pickNumber → pick
  const pickMap = useMemo(() => {
    const m: Record<number, Pick> = {}
    picks.forEach(p => { m[p.pick_number] = p })
    return m
  }, [picks])

  // Current turn team index (0-based column)
  const currentTeamColIdx = status === 'drafting'
    ? getTeamIndexForPick(currentPick, NUM_TEAMS)
    : -1

  if (orderedTeams.length === 0) {
    return (
      <div className="p-8 text-center text-[var(--text-muted)] font-mono text-sm">
        Draft order not set yet
      </div>
    )
  }

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center gap-3">
        <span className="font-display text-sm tracking-widest uppercase text-[var(--text-dim)]"
          style={{ fontFamily: 'var(--font-display)' }}>
          Draft Board
        </span>
        {status === 'drafting' && (
          <span className="font-mono text-xs text-[var(--accent)]">
            Round {getRoundForPick(currentPick)} · Pick {currentPick}
          </span>
        )}
        <div className="ml-auto flex items-center gap-4 text-xs font-mono text-[var(--text-muted)]">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-[rgba(245,200,66,0.25)] inline-block border border-[var(--gold)]" />
            RTM
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-[rgba(0,212,255,0.15)] inline-block border border-[var(--accent)]" />
            Your team
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs" style={{ minWidth: `${NUM_TEAMS * 110}px` }}>
          <thead>
            <tr>
              <th className="w-8 text-[var(--text-muted)] font-mono text-right pr-2 pb-2 sticky left-0 bg-[var(--bg-deep)] z-10">#</th>
              {orderedTeams.map((team, colIdx) => {
                const isCurrentCol = colIdx === currentTeamColIdx
                const isMyCol = team.id === myTeamId
                return (
                  <th
                    key={team.id}
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
                    }}
                  >
                    {team.team_name}
                    {isCurrentCol && <span className="ml-1 text-[var(--accent)]">▾</span>}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: NUM_ROUNDS }, (_, roundIdx) => {
              const round = roundIdx + 1
              const isEvenRound = round % 2 === 0

              return (
                <tr key={round} className="group">
                  <td className="text-right pr-2 py-0.5 text-[var(--text-muted)] font-mono sticky left-0 bg-[var(--bg-deep)] z-10">
                    {round}
                  </td>
                  {Array.from({ length: NUM_TEAMS }, (_, colIdx) => {
                    // Snake: even rounds go right→left
                    const teamColIdx = isEvenRound ? NUM_TEAMS - 1 - colIdx : colIdx
                    const pickNumber = (round - 1) * NUM_TEAMS + teamColIdx + 1
                    const pick = pickMap[pickNumber]
                    const isCurrentPick = pickNumber === currentPick && status === 'drafting'
                    const isFuturePick = pickNumber >= currentPick && !pick
                    const isMyTeamCol = orderedTeams[teamColIdx]?.id === myTeamId
                    const isCurrentCol = teamColIdx === currentTeamColIdx

                    return (
                      <td
                        key={colIdx}
                        className="px-1.5 py-0.5 transition-all"
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
                        }}
                      >
                        {pick ? (
                          <div className="py-1 pick-reveal">
                            <div className="text-white font-medium leading-tight" style={{ fontSize: '0.72rem' }}>
                              {(pick as any).players?.player_name ?? '—'}
                            </div>
                            <div className={`leading-tight ${roleBadgeClass((pick as any).players?.role)}`}
                              style={{ fontSize: '0.65rem' }}>
                              {(pick as any).players?.role}
                              {pick.rtm_used && <span className="ml-1 text-[var(--gold)]">RTM</span>}
                            </div>
                          </div>
                        ) : isCurrentPick ? (
                          <div className="py-1 text-center">
                            <div className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
                          </div>
                        ) : (
                          <div className="py-2 text-center text-[rgba(255,255,255,0.05)] text-xs">·</div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
