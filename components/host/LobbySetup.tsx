'use client'
import { useState, useRef } from 'react'
import { Upload, GripVertical, Copy, Check } from 'lucide-react'
import { toast } from 'sonner'
import type { DraftRoom, Team } from '@/lib/supabase'

interface Props {
  room: DraftRoom
  teams: Team[]
  isHost: boolean
  hostId: string
  myTeamId: string
  draftOrder: { position: number; team_id: string }[]
  onRefresh: () => void
}

export default function LobbySetup({ room, teams, isHost, hostId, myTeamId, draftOrder, onRefresh }: Props) {
  const [orderedTeamIds, setOrderedTeamIds] = useState<string[]>(
    draftOrder.length
      ? draftOrder.slice().sort((a, b) => a.position - b.position).map(o => o.team_id)
      : teams.map(t => t.id)
  )
  const [dragging, setDragging] = useState<number | null>(null)
  const [uploading, setUploading] = useState<string | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const playersRef = useRef<HTMLInputElement>(null)
  const prevSeasonRef = useRef<HTMLInputElement>(null)

  // Keep ordered list in sync when teams change
  const orderedTeams = orderedTeamIds
    .map(id => teams.find(t => t.id === id))
    .filter(Boolean) as Team[]

  // Add any new teams not yet in order
  teams.forEach(t => {
    if (!orderedTeamIds.includes(t.id)) {
      setOrderedTeamIds(prev => [...prev, t.id])
    }
  })

  function copyCode() {
    navigator.clipboard.writeText(room.draft_code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function uploadCSV(type: 'players' | 'previous_season', file: File) {
    setUploading(type)
    try {
      const fd = new FormData()
      fd.append('roomId', room.id)
      fd.append('type', type)
      fd.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(`Uploaded ${data.count} ${type === 'players' ? 'players' : 'previous season records'}`)
      onRefresh()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setUploading(null)
    }
  }

  async function saveOrder() {
    setLoading('order')
    try {
      const res = await fetch('/api/sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_order', roomId: room.id, hostId, draftOrder: orderedTeamIds }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Draft order saved')
      onRefresh()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(null)
    }
  }

  async function startDraft() {
    setLoading('start')
    try {
      const res = await fetch('/api/sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', roomId: room.id, hostId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onRefresh()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(null)
    }
  }

  // Drag-to-reorder
  function handleDragStart(idx: number) { setDragging(idx) }
  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault()
    if (dragging === null || dragging === idx) return
    const next = [...orderedTeamIds]
    const [item] = next.splice(dragging, 1)
    next.splice(idx, 0, item)
    setOrderedTeamIds(next)
    setDragging(idx)
  }
  function handleDragEnd() { setDragging(null) }

  return (
    <div className="min-h-screen p-6 relative overflow-hidden">
      {/* BG */}
      <div className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: `linear-gradient(var(--border) 1px, transparent 1px),
            linear-gradient(90deg, var(--border) 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }}
      />

      <div className="relative z-10 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display text-4xl font-700" style={{ fontFamily: 'var(--font-display)' }}>
              DRAFT <span style={{ color: 'var(--accent)' }}>LOBBY</span>
            </h1>
            <p className="text-[var(--text-muted)] font-mono text-sm mt-1">
              Waiting for participants to join
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs font-mono text-[var(--text-muted)] uppercase tracking-wider mb-1">Draft Code</div>
            <button
              onClick={copyCode}
              className="flex items-center gap-2 font-display text-4xl font-700 tracking-widest px-4 py-2 rounded border transition-all"
              style={{
                fontFamily: 'var(--font-display)',
                color: 'var(--accent)',
                borderColor: 'var(--accent-dim)',
                background: 'var(--accent-glow)',
              }}
            >
              {room.draft_code}
              {copied ? <Check size={18} /> : <Copy size={16} className="opacity-50" />}
            </button>
            <div className="text-xs font-mono text-[var(--text-muted)] mt-1">Share this with participants</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* Teams in lobby */}
          <div className="glow-card p-4">
            <h2 className="font-display text-sm font-700 tracking-widest uppercase mb-4 text-[var(--text-dim)]"
              style={{ fontFamily: 'var(--font-display)' }}>
              Teams ({teams.length} / 9)
            </h2>
            <div className="space-y-2">
              {teams.map(t => (
                <div
                  key={t.id}
                  className="flex items-center gap-2 px-3 py-2 rounded"
                  style={{
                    background: t.id === myTeamId ? 'rgba(0,212,255,0.08)' : 'var(--bg-raised)',
                    border: t.id === myTeamId ? '1px solid var(--border-bright)' : '1px solid transparent',
                  }}
                >
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ background: 'var(--success)', boxShadow: '0 0 6px var(--success)' }}
                  />
                  <span className="text-sm text-white flex-1">{t.team_name}</span>
                  {t.is_host && (
                    <span className="text-xs font-mono text-[var(--accent)]">HOST</span>
                  )}
                  {t.id === myTeamId && !t.is_host && (
                    <span className="text-xs font-mono text-[var(--accent)]">YOU</span>
                  )}
                </div>
              ))}
              {Array.from({ length: Math.max(0, 9 - teams.length) }, (_, i) => (
                <div key={`empty-${i}`} className="px-3 py-2 rounded border border-dashed"
                  style={{ borderColor: 'var(--border)' }}>
                  <span className="text-xs text-[var(--text-muted)] font-mono">Empty slot</span>
                </div>
              ))}
            </div>
          </div>

          {/* Draft order + host actions */}
          <div className="glow-card p-4">
            <h2 className="font-display text-sm font-700 tracking-widest uppercase mb-4 text-[var(--text-dim)]"
              style={{ fontFamily: 'var(--font-display)' }}>
              Draft Order
            </h2>

            {isHost ? (
              <>
                <p className="text-xs text-[var(--text-muted)] font-mono mb-3">Drag to reorder</p>
                <div className="space-y-1 mb-4">
                  {orderedTeams.map((team, idx) => (
                    <div
                      key={team.id}
                      draggable
                      onDragStart={() => handleDragStart(idx)}
                      onDragOver={e => handleDragOver(e, idx)}
                      onDragEnd={handleDragEnd}
                      className="flex items-center gap-2 px-3 py-2 rounded cursor-grab active:cursor-grabbing transition-all"
                      style={{
                        background: dragging === idx ? 'var(--bg-hover)' : 'var(--bg-raised)',
                        border: '1px solid var(--border)',
                        opacity: dragging === idx ? 0.5 : 1,
                      }}
                    >
                      <GripVertical size={14} className="text-[var(--text-muted)]" />
                      <span className="font-mono text-xs text-[var(--accent)] w-4">{idx + 1}</span>
                      <span className="text-sm text-white flex-1">{team.team_name}</span>
                    </div>
                  ))}
                </div>
                <button className="btn-ghost w-full mb-2 text-xs" onClick={saveOrder} disabled={!!loading}>
                  {loading === 'order' ? 'Saving...' : 'Save Order'}
                </button>
              </>
            ) : (
              <div className="space-y-1">
                {draftOrder.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)] font-mono">Host hasn't set order yet</p>
                ) : (
                  draftOrder
                    .slice()
                    .sort((a, b) => a.position - b.position)
                    .map((o, idx) => {
                      const t = teams.find(t => t.id === o.team_id)
                      return (
                        <div key={o.team_id} className="flex items-center gap-2 px-3 py-2">
                          <span className="font-mono text-xs text-[var(--accent)] w-4">{idx + 1}</span>
                          <span className="text-sm text-white">{t?.team_name ?? '—'}</span>
                        </div>
                      )
                    })
                )}
              </div>
            )}
          </div>

          {/* CSV Upload (host only) */}
          <div className="glow-card p-4">
            <h2 className="font-display text-sm font-700 tracking-widest uppercase mb-4 text-[var(--text-dim)]"
              style={{ fontFamily: 'var(--font-display)' }}>
              Upload CSVs
            </h2>

            {isHost ? (
              <div className="space-y-4">
                {/* Players CSV */}
                <div>
                  <div className="text-xs font-mono text-[var(--text-muted)] mb-2 uppercase tracking-wider">
                    Player Pool CSV
                  </div>
                  <div className="text-xs text-[var(--text-muted)] font-mono mb-2 leading-relaxed">
                    Format: player_id, player_name, role, team_name
                  </div>
                  <input
                    ref={playersRef}
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={e => {
                      const f = e.target.files?.[0]
                      if (f) uploadCSV('players', f)
                    }}
                  />
                  <button
                    className="btn-ghost w-full flex items-center justify-center gap-2 text-xs"
                    onClick={() => playersRef.current?.click()}
                    disabled={uploading === 'players'}
                  >
                    <Upload size={13} />
                    {uploading === 'players' ? 'Uploading...' : 'Upload Players CSV'}
                  </button>
                </div>

                {/* Previous season CSV */}
                <div>
                  <div className="text-xs font-mono text-[var(--text-muted)] mb-2 uppercase tracking-wider">
                    Previous Season CSV (RTM)
                  </div>
                  <div className="text-xs text-[var(--text-muted)] font-mono mb-2 leading-relaxed">
                    Column headers = team names, rows = players owned
                  </div>
                  <input
                    ref={prevSeasonRef}
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={e => {
                      const f = e.target.files?.[0]
                      if (f) uploadCSV('previous_season', f)
                    }}
                  />
                  <button
                    className="btn-ghost w-full flex items-center justify-center gap-2 text-xs"
                    onClick={() => prevSeasonRef.current?.click()}
                    disabled={uploading === 'previous_season'}
                  >
                    <Upload size={13} />
                    {uploading === 'previous_season' ? 'Uploading...' : 'Upload RTM CSV'}
                  </button>
                </div>

                {/* Start draft */}
                <div className="pt-2 border-t border-[var(--border)]">
                  <button
                    className="btn-accent w-full py-3 text-base"
                    onClick={startDraft}
                    disabled={!!loading || teams.length < 2}
                  >
                    {loading === 'start' ? 'Starting...' : '⚡ Start Draft'}
                  </button>
                  {teams.length < 2 && (
                    <p className="text-xs text-[var(--text-muted)] font-mono mt-2 text-center">
                      Need at least 2 teams to start
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm text-[var(--text-muted)] font-mono">
                  Waiting for host to start the draft...
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
