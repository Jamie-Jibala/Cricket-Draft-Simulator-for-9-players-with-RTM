'use client'
import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { supabase, getTeamIndexForPick, type DraftRoom, type Team, type Player, type Pick } from '@/lib/supabase'
import { toast } from 'sonner'
import PlayerSearch from '@/components/draft/PlayerSearch'
import DraftBoard from '@/components/draft/DraftBoard'
import TimerBar from '@/components/draft/TimerBar'
import HostControls from '@/components/host/HostControls'
import TeamRoster from '@/components/draft/TeamRoster'
import LobbySetup from '@/components/host/LobbySetup'

export default function RoomPage() {
  const { code } = useParams() as { code: string }

  const [room, setRoom] = useState<DraftRoom | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [picks, setPicks] = useState<Pick[]>([])
  const [draftOrder, setDraftOrder] = useState<{ position: number; team_id: string }[]>([])
  const [myTeamId, setMyTeamId] = useState<string>('')
  const [isHost, setIsHost] = useState(false)
  const [hostId, setHostId] = useState('')
  const [loading, setLoading] = useState(true)
  const [rtmLoading, setRtmLoading] = useState(false)

  useEffect(() => {
    setMyTeamId(localStorage.getItem('teamId') ?? '')
    setIsHost(localStorage.getItem('isHost') === 'true')
    setHostId(localStorage.getItem('hostId') ?? '')
  }, [])

  const loadAll = useCallback(async () => {
    const { data: roomData } = await supabase
      .from('draft_rooms')
      .select('*')
      .eq('draft_code', code)
      .single()
    if (!roomData) { toast.error('Room not found'); return }
    setRoom(roomData)

    const [teamsRes, playersRes, picksRes, orderRes] = await Promise.all([
      supabase.from('teams').select('*').eq('room_id', roomData.id),
      supabase.from('players').select('*').eq('room_id', roomData.id),
      supabase.from('picks').select('*, teams(*), players(*)').eq('room_id', roomData.id).order('pick_number'),
      supabase.from('draft_order').select('position, team_id').eq('room_id', roomData.id).order('position'),
    ])
    setTeams(teamsRes.data ?? [])
    setPlayers(playersRes.data ?? [])
    setPicks(picksRes.data ?? [])
    setDraftOrder(orderRes.data ?? [])
    setLoading(false)
  }, [code])

  useEffect(() => { loadAll() }, [loadAll])

  useEffect(() => {
    if (!room?.id) return
    const channel = supabase.channel(`room:${room.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'draft_rooms', filter: `id=eq.${room.id}` },
        () => loadAll())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'picks', filter: `room_id=eq.${room.id}` },
        () => loadAll())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'picks', filter: `room_id=eq.${room.id}` },
        () => loadAll())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'players', filter: `room_id=eq.${room.id}` },
        (payload) => setPlayers(prev => prev.map(p => p.id === payload.new.id ? payload.new as Player : p)))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams', filter: `room_id=eq.${room.id}` },
        () => supabase.from('teams').select('*').eq('room_id', room.id).then(r => setTeams(r.data ?? [])))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [room?.id, loadAll])

  async function handleRTM(action: 'claim' | 'decline', teamId: string, pickNumber: number) {
    setRtmLoading(true)
    try {
      const res = await fetch('/api/rtm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: room!.id,
          claimingTeamId: teamId,
          pickNumber,
          action,
          isHostOverride: teamId !== myTeamId,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(action === 'claim' ? '✅ RTM claimed!' : 'RTM declined')
      loadAll()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setRtmLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="font-mono text-sm text-[var(--text-muted)]">Loading draft room...</p>
        </div>
      </div>
    )
  }

  if (!room) return <div className="min-h-screen flex items-center justify-center text-red-400">Room not found</div>

  const orderedTeamIds = draftOrder.map(o => o.team_id)
  const currentTeamIndex = room.status === 'drafting' ? getTeamIndexForPick(room.current_pick) : -1
  const currentTeamId = orderedTeamIds[currentTeamIndex] ?? ''
  const isMyTurn = (currentTeamId === myTeamId || myTeam?.extra_pick === true) && room.status === 'drafting'
  const myTeam = teams.find(t => t.id === myTeamId)
  const currentTeam = teams.find(t => t.id === currentTeamId)
  const myPicks = picks.filter(p => p.team_id === myTeamId)

  // Parse RTM pending
  const rtmPending = room.rtm_pending
    ? (typeof room.rtm_pending === 'string' ? JSON.parse(room.rtm_pending) : room.rtm_pending)
    : null
  const isMyRTM = rtmPending && rtmPending.eligible_team_id === myTeamId
  const eligibleTeam = rtmPending ? teams.find(t => t.id === rtmPending.eligible_team_id) : null

  if (room.status === 'waiting') {
    return (
      <LobbySetup
        room={room}
        teams={teams}
        isHost={isHost}
        hostId={hostId}
        myTeamId={myTeamId}
        draftOrder={draftOrder}
        onRefresh={loadAll}
      />
    )
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-deep)' }}>

      {/* ── RTM FULL SCREEN OVERLAY ── */}
      {rtmPending && isMyRTM && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(5,10,18,0.93)' }}>
          <div className="rounded-xl p-8 text-center mx-4"
            style={{ background: '#0d1b2e', border: '2px solid var(--gold)', maxWidth: 380, width: '100%' }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>⚡</div>
            <div className="font-display text-2xl font-700 mb-1"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--gold)' }}>
              RTM OPPORTUNITY
            </div>
            <div className="font-display text-3xl font-700 my-4 text-white"
              style={{ fontFamily: 'var(--font-display)' }}>
              {rtmPending.player_name}
            </div>
            <p className="text-sm mb-1" style={{ color: 'var(--text-dim)' }}>
              You owned this player last season.
            </p>
            <p className="text-sm mb-4" style={{ color: 'var(--text-dim)' }}>
              Do you want to reclaim them?
            </p>
            <div className="text-xs font-mono mb-6 px-4 py-3 rounded"
              style={{ background: 'rgba(245,200,66,0.08)', color: 'var(--gold)', lineHeight: 1.8 }}>
              RTM uses remaining: {myTeam?.rtm_remaining ?? 0}<br />
              <span style={{ color: 'var(--text-muted)' }}>
                If you claim — you skip your next pick
              </span>
            </div>
            <div className="flex gap-3 justify-center">
              <button
                disabled={rtmLoading}
                style={{ background: 'var(--gold)', color: '#000', border: 'none', cursor: 'pointer', padding: '12px 28px', borderRadius: 6, fontWeight: 700, fontSize: 15 }}
                onClick={() => handleRTM('claim', myTeamId, rtmPending.pick_number)}
              >
                {rtmLoading ? '...' : '✅ Use RTM'}
              </button>
              <button
                disabled={rtmLoading}
                className="btn-ghost"
                style={{ padding: '12px 24px', fontSize: 15 }}
                onClick={() => handleRTM('decline', myTeamId, rtmPending.pick_number)}
              >
                {rtmLoading ? '...' : '✗ Decline'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-[var(--border)] bg-[var(--bg-surface)]">
        <div className="flex items-center gap-4">
          <span className="font-display text-2xl font-700" style={{ fontFamily: 'var(--font-display)' }}>
            CRICKET<span style={{ color: 'var(--accent)' }}>DRAFT</span>
          </span>
          <span className="font-mono text-xs px-2 py-1 rounded border border-[var(--border)] text-[var(--text-muted)]">
            {code}
          </span>
        </div>
        <div className="flex items-center gap-6">
          {room.status === 'drafting' && currentTeam && (
            <div className="text-center">
              <div className="text-xs text-[var(--text-muted)] font-mono uppercase tracking-wider">On the clock</div>
              <div className="font-display text-lg font-700"
                style={{ fontFamily: 'var(--font-display)', color: isMyTurn ? 'var(--accent)' : 'white' }}>
                {currentTeam.team_name}
              </div>
            </div>
          )}
          <div className="text-center">
            <div className="text-xs text-[var(--text-muted)] font-mono">PICK</div>
            <div className="font-mono text-lg text-white">{room.current_pick} / {room.total_picks}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-[var(--text-muted)] font-mono uppercase">You</div>
            <div className="text-sm font-display font-600"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--accent)' }}>
              {myTeam?.team_name ?? '—'}
            </div>
          </div>
        </div>
      </header>

      {/* Timer */}
      {room.status === 'drafting' && (
        <TimerBar
          roomId={room.id}
          timerRemaining={room.timer_remaining}
          timerActive={room.timer_active}
          isMyTurn={isMyTurn}
          isHost={isHost}
          hostId={hostId}
        />
      )}

      {/* RTM waiting banner for everyone else */}
      {rtmPending && !isMyRTM && (
        <div className="px-6 py-2 text-center font-mono text-sm"
          style={{ background: 'rgba(245,200,66,0.08)', borderBottom: '1px solid rgba(245,200,66,0.3)', color: 'var(--gold)' }}>
          ⏳ {eligibleTeam?.team_name ?? 'A team'} is deciding RTM for {rtmPending.player_name}...
        </div>
      )}

      {room.status === 'completed' && (
        <div className="bg-[rgba(0,230,118,0.1)] border-b border-[var(--success)] px-6 py-2 text-sm font-mono text-[var(--success)] text-center tracking-wider">
          ✓ DRAFT COMPLETE — All 144 picks made
        </div>
      )}

      {/* Host controls */}
      {isHost && (
        <HostControls
          room={room}
          hostId={hostId}
          onAction={loadAll}
          onForceRTM={handleRTM}
        />
      )}

      {/* Main layout */}
      <div className="flex-1 flex overflow-hidden">
        <div className="w-80 flex-shrink-0 border-r border-[var(--border)] flex flex-col overflow-hidden">
          <PlayerSearch
            players={players}
            isMyTurn={isMyTurn}
            myTeamId={myTeamId}
            roomId={room.id}
            room={room}
            picks={picks}
            teams={teams}
            myTeam={myTeam}
            isHost={isHost}
            hostId={hostId}
            onPickMade={loadAll}
          />
        </div>
        <div className="flex-1 overflow-auto">
          <DraftBoard
            picks={picks}
            teams={teams}
            draftOrder={draftOrder}
            currentPick={room.current_pick}
            totalPicks={room.total_picks}
            myTeamId={myTeamId}
            status={room.status}
          />
        </div>
        <div className="w-64 flex-shrink-0 border-l border-[var(--border)] flex flex-col overflow-hidden">
          <TeamRoster
            picks={myPicks}
            teamName={myTeam?.team_name ?? ''}
            rtmRemaining={myTeam?.rtm_remaining ?? 2}
          />
        </div>
      </div>
    </div>
  )
}
