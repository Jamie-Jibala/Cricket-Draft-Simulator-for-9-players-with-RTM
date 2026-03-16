'use client'
import { useEffect, useState, useRef } from 'react'
import { toast } from 'sonner'

interface Props {
  roomId: string
  timerRemaining: number
  timerActive: boolean
  isMyTurn: boolean
  isHost: boolean
  hostId: string
}

export default function TimerBar({ roomId, timerRemaining, timerActive, isMyTurn, isHost, hostId }: Props) {
  const [display, setDisplay] = useState(timerRemaining)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const hasWarnedRef = useRef(false)

  useEffect(() => {
    setDisplay(timerRemaining)
    hasWarnedRef.current = false
  }, [timerRemaining])

  useEffect(() => {
    if (!timerActive) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }
    intervalRef.current = setInterval(() => {
      setDisplay(prev => {
        const next = prev - 1
        if (next === 10 && !hasWarnedRef.current) {
          hasWarnedRef.current = true
          if (isMyTurn) toast.warning('⚡ 10 seconds left — pick now!')
        }
        if (next <= 0) {
          clearInterval(intervalRef.current!)
          return 0
        }
        return next
      })
    }, 1000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [timerActive, isMyTurn])

  const pct = Math.max(0, (display / 60) * 100)
  const isUrgent = display <= 10
  const isWarning = display <= 20

  const barColor = isUrgent
    ? 'var(--danger)'
    : isWarning
    ? 'var(--gold)'
    : 'var(--accent)'

  return (
    <div className="relative border-b border-[var(--border)] bg-[var(--bg-surface)]">
      {/* Progress bar */}
      <div
        className="absolute bottom-0 left-0 h-0.5 transition-all duration-1000"
        style={{ width: `${pct}%`, background: barColor, boxShadow: `0 0 8px ${barColor}` }}
      />

      <div className="flex items-center justify-between px-6 py-2">
        {isMyTurn ? (
          <span className="font-display text-sm font-700 tracking-widest uppercase animate-pulse"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--accent)' }}>
            ⚡ YOUR PICK
          </span>
        ) : (
          <span className="font-mono text-xs text-[var(--text-muted)] uppercase tracking-wider">
            Waiting for pick...
          </span>
        )}

        <div className={`font-mono text-2xl font-500 tabular-nums ${isUrgent ? 'timer-urgent' : ''}`}
          style={{ color: barColor, minWidth: '3ch', textAlign: 'right' }}>
          {display}
        </div>
      </div>
    </div>
  )
}
