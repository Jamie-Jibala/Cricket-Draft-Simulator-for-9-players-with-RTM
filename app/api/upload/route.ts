import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { initSheetHeaders } from '@/lib/sheets'
import Papa from 'papaparse'

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const roomId = formData.get('roomId') as string
    const type = formData.get('type') as 'players' | 'previous_season'
    const file = formData.get('file') as File

    if (!roomId || !type || !file) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const text = await file.text()
    const db = createServiceClient()

    if (type === 'players') {
      // CSV format: player_id, player_name, role, team_name
      const { data: rows, errors } = Papa.parse<string[]>(text, { skipEmptyLines: true })
      if (errors.length) throw new Error('CSV parse error: ' + errors[0].message)

      const players = rows
        .filter((r) => r[0] !== 'player_id') // skip header if present
        .map((r) => ({
          room_id: roomId,
          player_id: r[0]?.trim(),
          player_name: r[1]?.trim(),
          role: r[2]?.trim(),
          ipl_team: r[3]?.trim(),
          available: true,
        }))
        .filter((p) => p.player_id && p.player_name)

      // Clear existing, then insert
      await db.from('players').delete().eq('room_id', roomId)
      const { error } = await db.from('players').insert(players)
      if (error) throw error

      return NextResponse.json({ count: players.length })
    }

    if (type === 'previous_season') {
      // CSV is COLUMN-WISE: first row = team names, subsequent rows = player names
      const { data: rows } = Papa.parse<string[]>(text, { skipEmptyLines: false })
      if (!rows.length) return NextResponse.json({ count: 0 })

      const headers = rows[0] // team names
      const records: { room_id: string; player_name: string; team_name: string }[] = []

      for (let col = 0; col < headers.length; col++) {
        const teamName = headers[col]?.trim()
        if (!teamName) continue
        for (let row = 1; row < rows.length; row++) {
          const playerName = rows[row][col]?.trim()
          if (playerName) {
            records.push({ room_id: roomId, player_name: playerName, team_name: teamName })
          }
        }
      }

      await db.from('previous_season').delete().eq('room_id', roomId)
      const { error } = await db.from('previous_season').insert(records)
      if (error) throw error

      // Init Google Sheet headers with team names from previous season CSV
      const teamNames = headers.filter(Boolean).map((h) => h.trim())
      initSheetHeaders(teamNames).catch(console.error)

      return NextResponse.json({ count: records.length })
    }

    return NextResponse.json({ error: 'Unknown type' }, { status: 400 })
  } catch (err: any) {
    console.error(err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
