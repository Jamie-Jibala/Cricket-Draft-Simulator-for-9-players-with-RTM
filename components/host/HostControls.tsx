'use client'
import { useState } from 'react'
import { Pause, Play, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import type { DraftRoom } from '@/lib/supabase'

interface Props {
  room: DraftRoom
  hostId: string
  onAction: () => void
}

export default function HostControls({ room, hostId, onAction }: Props) {
  const [loading, setLoading] = useState<string | null>(null)

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
    <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border)] bg-[rgba(0,212,255,0.03)]">
      <span className="font-mono text-xs text-[var(--accent)] uppercase tracking-widest mr-2">Host</span>

      {isDrafting && (
        <button className="btn-ghost flex items-center gap-1.5 text-xs py-1" onClick={() => call('pause')} disabled={!!loading}>
          <Pause size={12} />
          {loading === 'pause' ? '...' : 'Pause'}
        </button>
      )}

      {isPaused && (
        <button className="btn-accent flex items-center gap-1.5 text-xs py-1 px-3" onClick={() => call('resume')} disabled={!!loading}>
          <Play size={12} />
          {loading === 'resume' ? '...' : 'Resume'}
        </button>
      )}

      {(isDrafting || isPaused) && room.current_pick > 1 && (
        <button
          className="btn-ghost flex items-center gap-1.5 text-xs py-1"
          onClick={() => {
            if (confirm('Undo last pick? This cannot be undone automatically.')) call('undo')
          }}
          disabled={!!loading}
        >
          <RotateCcw size={12} />
          {loading === 'undo' ? '...' : 'Undo Pick'}
        </button>
      )}

      {isCompleted && (
        <span className="font-mono text-xs text-[var(--success)]">✓ Draft complete</span>
      )}
    </div>
  )
}
