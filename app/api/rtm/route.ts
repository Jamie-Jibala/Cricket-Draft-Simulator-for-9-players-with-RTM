import { NextResponse } from 'next/server'
import { processRTM } from '@/lib/draftEngine'

export async function POST(req: Request) {
  try {
    const { roomId, claimingTeamId, pickNumber, action, isHostOverride } = await req.json()

    if (!roomId || !claimingTeamId || !pickNumber || !action) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const result = await processRTM({ roomId, claimingTeamId, pickNumber, action, isHostOverride })

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 409 })
    }

    return NextResponse.json(result)
  } catch (err: any) {
    console.error(err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
