import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { parseSchedulePdf } from './pdfScheduleParser.js'
import { getSchedulePath, saveSchedule } from './scheduleStore.js'

const pdfPath = process.argv[2]

if (!pdfPath) {
  console.error('Uso: npm run import:pdf -- /percorso/orario.pdf')
  process.exit(1)
}

const buffer = await readFile(pdfPath)
const schedule = await parseSchedulePdf(buffer, path.basename(pdfPath))
await saveSchedule(schedule)

console.log(`Importate ${schedule.lessons.length} lezioni da ${schedule.classes.length} classi.`)
console.log(`Database salvato in ${getSchedulePath()}`)
