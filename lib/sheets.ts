import { google } from 'googleapis'

function getAuth() {
  return new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

/**
 * Write a draft pick to Google Sheets.
 * Each team is a column; picks fill rows top-to-bottom.
 * Row 1 = header (team names), picks start at row 2.
 */
export async function writePick(params: {
  teamName: string
  playerName: string
  pickInTeam: number // 1-based pick index within the team (= row offset)
  rtmUsed: boolean
  teamColumnIndex: number // 0-based column index for the team
  allTeamNames: string[]
}) {
  if (!process.env.GOOGLE_SHEET_ID) return // Skip if not configured

  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  const sheetId = process.env.GOOGLE_SHEET_ID

  const col = columnLetter(params.teamColumnIndex)
  const row = params.pickInTeam + 1 // +1 for header row
  const range = `Sheet1!${col}${row}`

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range,
    valueInputOption: 'RAW',
    requestBody: { values: [[params.playerName]] },
  })

  // Highlight RTM picks in yellow
  if (params.rtmUsed) {
    const gridRange = {
      sheetId: 0,
      startRowIndex: row - 1,
      endRowIndex: row,
      startColumnIndex: params.teamColumnIndex,
      endColumnIndex: params.teamColumnIndex + 1,
    }
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: {
        requests: [{
          repeatCell: {
            range: gridRange,
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 1, green: 0.9, blue: 0 }
              }
            },
            fields: 'userEnteredFormat.backgroundColor'
          }
        }]
      }
    })
  }
}

/** Initialize sheet headers with team names */
export async function initSheetHeaders(teamNames: string[]) {
  if (!process.env.GOOGLE_SHEET_ID) return

  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })

  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: 'Sheet1!A1',
    valueInputOption: 'RAW',
    requestBody: { values: [teamNames] },
  })
}

function columnLetter(index: number): string {
  let col = ''
  let n = index
  while (n >= 0) {
    col = String.fromCharCode(65 + (n % 26)) + col
    n = Math.floor(n / 26) - 1
  }
  return col
}
