import { PDFParse } from 'pdf-parse'
import { dayLabels, dayOrder, type DayId, type Lesson, type Period, type ScheduleData } from './types.js'

type TextItem = {
  str: string
  x: number
  y: number
  width: number
  height: number
  page: number
}

type TextRow = {
  page: number
  y: number
  items: TextItem[]
}

type PdfDocument = {
  numPages: number
  getPage(pageNumber: number): Promise<PdfPage>
}

type PdfPage = {
  getTextContent(): Promise<{ items: PdfTextContentItem[] }>
  cleanup(): void
}

type PdfTextContentItem = {
  str?: string
  transform: number[]
  width: number
  height: number
}

const timePattern = /^\d{1,2}:\d{2}$/
const fallbackColumnStarts = [127.43, 263.85, 400.5, 536.92, 673.55]

export async function parseSchedulePdf(buffer: Buffer, sourceName: string): Promise<ScheduleData> {
  const parser = new PDFParse({ data: buffer })
  const warnings: string[] = []

  try {
    const doc = await (parser as unknown as { load(): Promise<PdfDocument> }).load()
    const allItems: TextItem[] = []

    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber)
      const textContent = await page.getTextContent()

      for (const item of textContent.items) {
        if (!item.str) continue

        const str = item.str.trim()
        if (!str) continue

        allItems.push({
          str,
          x: item.transform[4],
          y: item.transform[5],
          width: item.width,
          height: item.height,
          page: pageNumber,
        })
      }

      page.cleanup()
    }

    const rows = groupRows(allItems)
    const columnStarts = detectColumnStarts(rows)
    if (columnStarts.length < dayOrder.length) {
      warnings.push('Colonne non riconosciute automaticamente: usato il layout standard del PDF.')
    }

    const startsFrom = detectStartDate(rows)
    const rawLessons = extractLessons(rows, columnStarts.length === dayOrder.length ? columnStarts : fallbackColumnStarts)
    const periods = buildPeriods(rawLessons.map((lesson) => lesson.startTime))
    const lessons = rawLessons.map((lesson) => ({
      ...lesson,
      period: periods.find((period) => period.startTime === lesson.startTime)?.number ?? lesson.period,
      endTime: periods.find((period) => period.startTime === lesson.startTime)?.endTime ?? lesson.endTime,
      id: lessonId(lesson.className, lesson.day, lesson.startTime, lesson.teacher),
    }))

    if (lessons.length === 0) {
      warnings.push('Non sono state trovate lezioni nel PDF. Controlla che il file contenga testo selezionabile.')
    }

    return {
      id: crypto.randomUUID(),
      sourceName,
      importedAt: new Date().toISOString(),
      startsFrom,
      days: dayOrder.map((id) => ({ id, label: dayLabels[id] })),
      periods,
      classes: uniqueSorted(lessons.map((lesson) => lesson.className), compareClassNames),
      teachers: uniqueSorted(lessons.map((lesson) => lesson.teacher), (a, b) => a.localeCompare(b, 'it')),
      lessons,
      warnings,
    }
  } finally {
    await parser.destroy()
  }
}

function groupRows(items: TextItem[]): TextRow[] {
  const rows: TextRow[] = []
  const sortedItems = [...items].sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x)

  for (const item of sortedItems) {
    const row = rows.find((candidate) => candidate.page === item.page && Math.abs(candidate.y - item.y) <= 1.2)
    if (row) {
      row.items.push(item)
      continue
    }

    rows.push({ page: item.page, y: item.y, items: [item] })
  }

  return rows
    .map((row) => ({ ...row, items: row.items.sort((a, b) => a.x - b.x) }))
    .sort((a, b) => a.page - b.page || b.y - a.y)
}

function detectColumnStarts(rows: TextRow[]): number[] {
  const counts = new Map<number, number>()

  for (const row of rows) {
    if (!row.items.some((item) => timePattern.test(item.str) && item.x >= 70 && item.x <= 125)) continue

    for (const item of row.items) {
      if (item.x < 120 || item.str === 'CLASSE' || item.str === 'Ora') continue
      const rounded = Math.round(item.x * 2) / 2
      counts.set(rounded, (counts.get(rounded) ?? 0) + 1)
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, dayOrder.length)
    .map(([x]) => x)
    .sort((a, b) => a - b)
}

function detectStartDate(rows: TextRow[]): string | undefined {
  const text = rows
    .slice(0, 10)
    .flatMap((row) => row.items.map((item) => item.str))
    .join(' ')

  const match = text.match(/\bDAL\s+(\d{2})\/(\d{2})\/(\d{4})\b/i)
  if (!match) return undefined

  const [, day, month, year] = match
  return `${year}-${month}-${day}`
}

function extractLessons(rows: TextRow[], columnStarts: number[]): Lesson[] {
  const lessons: Lesson[] = []
  let currentClass = ''

  for (const row of rows) {
    const classItem = row.items.find((item) => item.x < 70 && isClassName(item.str))
    if (classItem) {
      currentClass = normalizeClassName(classItem.str)
    }

    const timeItem = row.items.find((item) => item.x >= 70 && item.x <= 125 && timePattern.test(item.str))
    if (!timeItem || !currentClass) continue

    const startTime = normalizeTime(timeItem.str)
    const period = Math.max(1, Number.parseInt(startTime.split(':')[0], 10) - 7)

    for (const item of row.items) {
      if (item === timeItem || item === classItem || item.x < 120) continue

      const dayIndex = nearestColumnIndex(item.x, columnStarts)
      if (dayIndex < 0) continue

      const teacher = normalizeTeacherName(item.str)
      if (!teacher) continue

      const day = dayOrder[dayIndex]
      lessons.push({
        id: '',
        className: currentClass,
        teacher,
        day,
        dayLabel: dayLabels[day],
        period,
        startTime,
        endTime: addMinutes(startTime, 60),
        sourcePage: row.page,
      })
    }
  }

  return lessons
}

function nearestColumnIndex(x: number, columnStarts: number[]): number {
  let nearest = -1
  let distance = Number.POSITIVE_INFINITY

  columnStarts.forEach((columnStart, index) => {
    const currentDistance = Math.abs(x - columnStart)
    if (currentDistance < distance) {
      distance = currentDistance
      nearest = index
    }
  })

  return distance <= 18 ? nearest : -1
}

function isClassName(value: string): boolean {
  return /^\d{1,2}\s*[A-Z](?:[\s-]*[A-Z]){0,3}$/i.test(value.trim())
}

function normalizeClassName(value: string): string {
  return value.replace(/[\s-]+/g, '').trim().toUpperCase()
}

function normalizeTeacherName(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toUpperCase()
}

function normalizeTime(value: string): string {
  const [hours, minutes] = value.split(':')
  return `${hours.padStart(2, '0')}:${minutes}`
}

function buildPeriods(times: string[]): Period[] {
  const uniqueTimes = uniqueSorted(times, (a, b) => minutesFromMidnight(a) - minutesFromMidnight(b))

  return uniqueTimes.map((startTime, index) => ({
    number: index + 1,
    startTime,
    endTime: uniqueTimes[index + 1] ?? addMinutes(startTime, 60),
  }))
}

function addMinutes(time: string, amount: number): string {
  const total = minutesFromMidnight(time) + amount
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function minutesFromMidnight(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

function lessonId(className: string, day: DayId, startTime: string, teacher: string): string {
  return [className, day, startTime, teacher]
    .join('-')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
}

function uniqueSorted<T>(values: T[], compare: (a: T, b: T) => number): T[] {
  return [...new Set(values)].sort(compare)
}

function compareClassNames(a: string, b: string): number {
  const aMatch = a.match(/^(\d+)([A-Z]+)$/)
  const bMatch = b.match(/^(\d+)([A-Z]+)$/)

  if (!aMatch || !bMatch) return a.localeCompare(b, 'it', { numeric: true })
  const [, aYear, aSection] = aMatch
  const [, bYear, bSection] = bMatch

  return aSection.localeCompare(bSection, 'it') || Number(aYear) - Number(bYear)
}
