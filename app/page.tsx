'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

export default function Home() {
  const router = useRouter()
  const [mode, setMode] = useState<'create' | 'join' | null>(null)
  const [hostName, setHostName] = useState('')
  const [teamName, setTeamName] = useState('')
  const [draftCode, setDraftCode] = useState('')
  const [loading, setLoading] = useState(false)

  async function createDraft() {
    if (!hostName.trim()) return toast.error('Enter your team name')
    setLoading(true)
    try {
      const res = await fetch('/api/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostName: hostName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      // Store identity
      localStorage.setItem('teamId', data.team.id)
      localStorage.setItem('teamName', data.team.team_name)
      localStorage.setItem('isHost', 'true')
      localStorage.setItem('hostId', data.room.host_id)
      router.push(`/room/${data.room.draft_code}`)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function joinDraft() {
    if (!teamName.trim()) return toast.error('Enter your team name')
    if (!draftCode.trim()) return toast.error('Enter draft code')
    setLoading(true)
    try {
      const res = await fetch(`/api/draft/${draftCode.trim().toUpperCase()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamName: teamName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      localStorage.setItem('teamId', data.team.id)
      localStorage.setItem('teamName', data.team.team_name)
      localStorage.setItem('isHost', 'false')
      localStorage.removeItem('hostId')
      router.push(`/room/${data.room.draft_code}`)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background grid */}
      <div className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: `linear-gradient(var(--border) 1px, transparent 1px),
            linear-gradient(90deg, var(--border) 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }}
      />
      {/* Radial glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full"
        style={{ background: 'radial-gradient(ellipse, rgba(0,212,255,0.06) 0%, transparent 70%)' }}
      />

      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-2 h-8 bg-[var(--accent)] rounded-sm" />
            <span className="font-display text-5xl font-700 tracking-tight text-white"
              style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>
              CRICKET<span style={{ color: 'var(--accent)' }}>DRAFT</span>
            </span>
          </div>
          <p className="text-[var(--text-muted)] text-sm tracking-widest uppercase font-mono">
            Real-time Snake Draft Platform
          </p>
        </div>

        {!mode ? (
          <div className="flex flex-col gap-4">
            <button className="btn-accent py-4 text-lg" onClick={() => setMode('create')}>
              ⚡ Create Draft Room
            </button>
            <button className="btn-ghost py-4 text-lg" onClick={() => setMode('join')}>
              → Join with Code
            </button>
          </div>
        ) : mode === 'create' ? (
          <div className="glow-card p-6 flex flex-col gap-4">
            <h2 className="font-display text-xl font-600 tracking-wide" style={{ fontFamily: 'var(--font-display)' }}>
              HOST A DRAFT
            </h2>
            <div>
              <label className="text-xs text-[var(--text-muted)] uppercase tracking-widest font-mono block mb-1">Your Team Name</label>
              <input
                className="search-input pl-3"
                placeholder="e.g. Mumbai Mashers"
                value={hostName}
                onChange={e => setHostName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createDraft()}
              />
            </div>
            <button className="btn-accent mt-2" onClick={createDraft} disabled={loading}>
              {loading ? 'Creating...' : 'Create Room'}
            </button>
            <button className="btn-ghost" onClick={() => setMode(null)}>← Back</button>
          </div>
        ) : (
          <div className="glow-card p-6 flex flex-col gap-4">
            <h2 className="font-display text-xl font-600 tracking-wide" style={{ fontFamily: 'var(--font-display)' }}>
              JOIN DRAFT
            </h2>
            <div>
              <label className="text-xs text-[var(--text-muted)] uppercase tracking-widest font-mono block mb-1">Draft Code</label>
              <input
                className="search-input pl-3 uppercase tracking-widest"
                placeholder="ABC123"
                value={draftCode}
                onChange={e => setDraftCode(e.target.value.toUpperCase())}
                maxLength={6}
              />
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)] uppercase tracking-widest font-mono block mb-1">Your Team Name</label>
              <input
                className="search-input pl-3"
                placeholder="e.g. Jay"
                value={teamName}
                onChange={e => setTeamName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && joinDraft()}
              />
            </div>
            <button className="btn-accent mt-2" onClick={joinDraft} disabled={loading}>
              {loading ? 'Joining...' : 'Join Draft'}
            </button>
            <button className="btn-ghost" onClick={() => setMode(null)}>← Back</button>
          </div>
        )}
      </div>
    </main>
  )
}
