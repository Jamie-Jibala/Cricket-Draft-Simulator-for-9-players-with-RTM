'use client'
import { useState } from 'react'
import { Pause, Play, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import type { DraftRoom } from '@/lib/supabase'

interface Props {
  room: DraftRoom
  hostId: string
  onAction: () => void
  onForceRTM: (action: 'claim' | 'decline', teamId: string, pickNumber: number) => void
}

export default function HostControls({ room, hostId, onAction, onForceRTM }: Props) {
  const [loading, setLoading] = useState<string | null>(null)

  const rtmPending = room.rtm_pending
    ? (typeof room.rtm_pending === 'string' ? JSON.parse(room.rtm_pending) : room.rtm_pending)
    : null

  async function call(action: string) {
    setLoading(action)
    try {
      const res = await fetch('/api/sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, roomId: room.id, hostId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onAction()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(null)
    }
  }

  const isDrafting = room.status === 'drafting'
  const isPaused = room.status === 'paused'
  const isCompleted = room.status === 'completed'

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border)]"
      style={{ background: 'rgba(0,212,255,0.03)' }}>
      <span className="font-mono text-xs text-[var(--accent)] uppercase tracking-widest mr-2">Host</span>

      {/* If RTM is pending — show RTM override controls, hide Resume */}
      {rtmPending ? (
        <>
          <span className="font-mono text-xs mr-2" style={{ color: 'var(--gold)' }}>
            ⚡ RTM pending — {rtmPending.player_name}
          </span>
          <button
            className="text-xs px-3 py-1 rounded font-mono"
            style={{ background: 'var(--gold)', color: '#000', border: 'none', cursor: 'pointer' }}
            onClick={() => onForceRTM('claim', rtmPending.eligible_team_id, rtmPending.pick_number)}
            disabled={!!loading}
          >
            Force Claim
          </button>
          <button
            className="btn-ghost text-xs py-1"
            onClick={() => onForceRTM('decline', rtmPending.eligible_team_id, rtmPending.pick_number)}
            disabled={!!loading}
          >
            Force Decline
          </button>
        </>
      ) : (
        <>
          {isDrafting && (
            <button
              className="btn-ghost flex items-center gap-1.5 text-xs py-1"
              onClick={() => call('pause')}
              disabled={!!loading}
            >
              <Pause size={12} />
              {loading === 'pause' ? '...' : 'Pause'}
            </button>
          )}
          {isPaused && (
            <button
              className="btn-accent flex items-center gap-1.5 text-xs py-1 px-3"
              onClick={() => call('resume')}
              disabled={!!loading}
            >
              <Play size={12} />
              {loading === 'resume' ? '...' : 'Resume'}
            </button>
          )}
          {(isDrafting || isPaused) && room.current_pick > 1 && (
            <button
              className="btn-ghost flex items-center gap-1.5 text-xs py-1"
              onClick={() => { if (confirm('Undo last pick?')) call('undo') }}
              disabled={!!loading}
            >
              <RotateCcw size={12} />
              {loading === 'undo' ? '...' : 'Undo Pick'}
            </button>
          )}
          {isCompleted && (
            <span className="font-mono text-xs" style={{ color: 'var(--success)' }}>✓ Draft complete</span>
          )}
        </>
      )}
    </div>
  )
}
