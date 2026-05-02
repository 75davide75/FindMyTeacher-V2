import cors from 'cors'
import express from 'express'
import multer from 'multer'
import { parseSchedulePdf } from './pdfScheduleParser.js'
import { getSchedulePath, loadSchedule, saveSchedule } from './scheduleStore.js'

const port = Number(process.env.PORT ?? 8787)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
  },
})

const app = express()

app.use(cors())
app.use(express.json())

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, storage: getSchedulePath() })
})

app.get('/api/schedule', async (_request, response, next) => {
  try {
    response.json({ schedule: await loadSchedule() })
  } catch (error) {
    next(error)
  }
})

app.post('/api/import/pdf', upload.single('file'), async (request, response, next) => {
  try {
    if (!request.file) {
      response.status(400).json({ error: 'PDF mancante.' })
      return
    }

    const schedule = await parseSchedulePdf(request.file.buffer, request.file.originalname)
    await saveSchedule(schedule)
    response.json({ schedule })
  } catch (error) {
    next(error)
  }
})

app.use((error: unknown, _request: express.Request, response: express.Response, next: express.NextFunction) => {
  void next
  console.error(error)
  response.status(500).json({
    error: error instanceof Error ? error.message : 'Errore durante la richiesta.',
  })
})

app.listen(port, () => {
  console.log(`API orario pronta su http://localhost:${port}`)
})
