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

  // Read identity from localStorage
  useEffect(() => {
    setMyTeamId(localStorage.getItem('teamId') ?? '')
    setIsHost(localStorage.getItem('isHost') === 'true')
    setHostId(localStorage.getItem('hostId') ?? '')
  }, [])

  // Initial data load
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

  // Realtime subscriptions
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

  // Compute current turn
  const orderedTeamIds = draftOrder.map(o => o.team_id)
  const currentTeamIndex = room.status === 'drafting'
    ? getTeamIndexForPick(room.current_pick)
    : -1
  const currentTeamId = orderedTeamIds[currentTeamIndex] ?? ''
  const isMyTurn = currentTeamId === myTeamId && room.status === 'drafting'

  const myTeam = teams.find(t => t.id === myTeamId)
  const currentTeam = teams.find(t => t.id === currentTeamId)

  // Picks per team for roster view
  const myPicks = picks.filter(p => p.team_id === myTeamId)

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
              <div className="font-display text-lg font-700" style={{ fontFamily: 'var(--font-display)', color: isMyTurn ? 'var(--accent)' : 'white' }}>
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
            <div className="text-sm font-display font-600" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent)' }}>
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

      {room.status === 'paused' && (
        <div className="bg-[var(--gold-dim)] border-b border-[var(--gold)] px-6 py-2 text-sm font-mono text-[var(--gold)] text-center tracking-wider">
          ⏸ DRAFT PAUSED {isHost ? '— use controls below to resume' : '— waiting for host'}
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
        />
      )}

      {/* Main layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Player search */}
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

        {/* Center: Draft board */}
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

        {/* Right: My roster */}
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
