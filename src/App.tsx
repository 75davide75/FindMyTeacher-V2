import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Database,
  FileText,
  GraduationCap,
  Search,
  Upload,
  UserRound,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { dayOrder, type DayId, type Lesson, type ScheduleData } from './types'

const scheduleStorageKey = 'findmyteacher.schedule'

function App() {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [schedule, setSchedule] = useState<ScheduleData | null>(null)
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [apiAvailable, setApiAvailable] = useState(true)
  const [error, setError] = useState('')
  const [targetMode, setTargetMode] = useState<'class' | 'teacher'>('class')
  const [viewMode, setViewMode] = useState<'now' | 'day'>('now')
  const [selectedClass, setSelectedClass] = useState('')
  const [teacherQuery, setTeacherQuery] = useState('')
  const [teacherMenuOpen, setTeacherMenuOpen] = useState(false)
  const [useLiveTime, setUseLiveTime] = useState(true)
  const [clock, setClock] = useState(() => new Date())
  const [manualDay, setManualDay] = useState<DayId>('monday')
  const [manualTime, setManualTime] = useState('08:10')

  function applySchedule(nextSchedule: ScheduleData | null) {
    if (!nextSchedule) {
      setSchedule(null)
      return
    }

    const normalizedSchedule = normalizeScheduleTimes(nextSchedule)
    setSchedule(normalizedSchedule)
    setSelectedClass((current) => (normalizedSchedule.classes.includes(current) ? current : (normalizedSchedule.classes[0] ?? '')))
    setTeacherQuery((current) => resolveTeacher(normalizedSchedule.teachers, current) ?? normalizedSchedule.teachers[0] ?? '')
  }

  async function loadSchedule(): Promise<{ schedule: ScheduleData | null; apiAvailable: boolean }> {
    const storedSchedule = readStoredSchedule()
    if (storedSchedule) return { schedule: storedSchedule, apiAvailable: false }

    try {
      const response = await fetch('/api/schedule')
      if (!response.ok) throw new Error('API locale non disponibile.')
      const payload = (await response.json()) as { schedule: ScheduleData | null }
      return { schedule: payload.schedule, apiAvailable: true }
    } catch {
      const response = await fetch(`${import.meta.env.BASE_URL}schedule.json`)
      if (!response.ok) throw new Error('Nessun orario pubblicato trovato.')
      return { schedule: (await response.json()) as ScheduleData, apiAvailable: false }
    }
  }

  useEffect(() => {
    let ignore = false

    loadSchedule()
      .then((payload) => {
        if (!ignore) {
          setApiAvailable(payload.apiAvailable)
          applySchedule(payload.schedule)
        }
      })
      .catch((loadError) => {
        if (!ignore) setError(loadError instanceof Error ? loadError.message : 'Orario non disponibile.')
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })

    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const activeDay = useLiveTime ? dayFromDate(clock) : manualDay
  const activeTime = useLiveTime ? timeFromDate(clock) : manualTime
  const selectedTeacher = useMemo(
    () => (schedule ? resolveTeacher(schedule.teachers, teacherQuery) : undefined),
    [schedule, teacherQuery],
  )
  const filteredTeachers = useMemo(() => {
    if (!schedule) return []

    const normalizedQuery = teacherQuery.trim().toLowerCase()
    if (!normalizedQuery) return schedule.teachers

    return schedule.teachers.filter((teacher) => teacher.toLowerCase().includes(normalizedQuery))
  }, [schedule, teacherQuery])

  const targetLessons = useMemo(() => {
    if (!schedule) return []
    return schedule.lessons.filter((lesson) => {
      if (targetMode === 'class') return lesson.className === selectedClass
      return selectedTeacher ? lesson.teacher === selectedTeacher : false
    })
  }, [schedule, selectedClass, selectedTeacher, targetMode])

  const currentLesson = useMemo(
    () => findCurrentLesson(targetLessons, activeDay, activeTime),
    [activeDay, activeTime, targetLessons],
  )

  const nextLesson = useMemo(
    () => findNextLesson(targetLessons, activeDay, activeTime, currentLesson),
    [activeDay, activeTime, currentLesson, targetLessons],
  )

  const dayPlan = useMemo(() => {
    if (!schedule) return []
    const day = viewMode === 'day' ? manualDay : activeDay
    if (!day) return []

    return schedule.periods.map((period) => ({
      period,
      lessons: targetLessons
        .filter((lesson) => lesson.day === day && lesson.startTime === period.startTime)
        .sort((a, b) => a.className.localeCompare(b.className, 'it')),
    }))
  }, [activeDay, manualDay, schedule, targetLessons, viewMode])

  async function handleFile(file: File | undefined) {
    if (!file) return

    setImporting(true)
    setError('')

    try {
      if (apiAvailable) {
        try {
          const body = new FormData()
          body.append('file', file)

          const response = await fetch('/api/import/pdf', {
            method: 'POST',
            body,
          })
          const payload = (await response.json()) as { schedule?: ScheduleData; error?: string }

          if (!response.ok || !payload.schedule) {
            throw new Error(payload.error ?? 'Import non riuscito.')
          }

          clearStoredSchedule()
          applySchedule(payload.schedule)
          return
        } catch {
          setApiAvailable(false)
        }
      }

      const { parseSchedulePdfInBrowser } = await import('./browserPdfImport')
      const browserSchedule = await parseSchedulePdfInBrowser(file)
      storeSchedule(browserSchedule)
      applySchedule(browserSchedule)
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Import non riuscito.')
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  if (loading) {
    return (
      <main className="app-shell center-shell">
        <div className="loader" />
      </main>
    )
  }

  return (
    <main className="app-shell">
      <input
        ref={fileInputRef}
        className="sr-only"
        type="file"
        accept="application/pdf"
        onChange={(event) => void handleFile(event.target.files?.[0])}
      />

      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark">
            <CalendarDays size={24} />
          </div>
          <div>
            <p>Orario classi</p>
            <h1>Consultazione rapida</h1>
          </div>
        </div>

        <button className="icon-button primary-action" type="button" onClick={() => fileInputRef.current?.click()}>
          <Upload size={18} />
          {importing ? 'Import...' : 'Importa PDF'}
        </button>
      </header>

      {error ? <p className="alert">{error}</p> : null}

      {!schedule ? (
        <section className="empty-state">
          <div className="empty-icon">
            <FileText size={30} />
          </div>
          <h2>Nessun orario caricato</h2>
          <button className="icon-button primary-action" type="button" onClick={() => fileInputRef.current?.click()}>
            <Upload size={18} />
            Scegli PDF
          </button>
        </section>
      ) : (
        <>
          <section className="status-strip">
            <div>
              <Database size={18} />
              <span>{schedule.lessons.length} lezioni</span>
            </div>
            <div>
              <GraduationCap size={18} />
              <span>{schedule.classes.length} classi</span>
            </div>
            <div>
              <UserRound size={18} />
              <span>{schedule.teachers.length} docenti</span>
            </div>
            <div>
              <CheckCircle2 size={18} />
              <span>{schedule.sourceName}</span>
            </div>
          </section>

          <section className="control-panel">
            <div className="segmented" aria-label="Tipo ricerca">
              <button className={targetMode === 'class' ? 'active' : ''} type="button" onClick={() => setTargetMode('class')}>
                <GraduationCap size={17} />
                Classe
              </button>
              <button
                className={targetMode === 'teacher' ? 'active' : ''}
                type="button"
                onClick={() => setTargetMode('teacher')}
              >
                <UserRound size={17} />
                Docente
              </button>
            </div>

            <div className="field">
              <label htmlFor="target">{targetMode === 'class' ? 'Classe' : 'Cognome docente'}</label>
              {targetMode === 'class' ? (
                <select id="target" value={selectedClass} onChange={(event) => setSelectedClass(event.target.value)}>
                  {schedule.classes.map((className) => (
                    <option key={className} value={className}>
                      {className}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="teacher-picker">
                  <div className="search-field">
                    <Search size={17} />
                    <input
                      id="target"
                      value={teacherQuery}
                      onBlur={() => window.setTimeout(() => setTeacherMenuOpen(false), 120)}
                      onChange={(event) => {
                        setTeacherQuery(event.target.value)
                        setTeacherMenuOpen(true)
                      }}
                      onFocus={() => setTeacherMenuOpen(true)}
                      placeholder="Es. CIPRIANI"
                    />
                  </div>
                  {teacherMenuOpen ? (
                    <div className="teacher-menu" role="listbox">
                      {filteredTeachers.length > 0 ? (
                        filteredTeachers.map((teacher) => (
                          <button
                            key={teacher}
                            type="button"
                            role="option"
                            aria-selected={teacher === selectedTeacher}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              setTeacherQuery(teacher)
                              setTeacherMenuOpen(false)
                            }}
                          >
                            {teacher}
                          </button>
                        ))
                      ) : (
                        <span>Nessun docente trovato</span>
                      )}
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            <div className="segmented" aria-label="Vista">
              <button className={viewMode === 'now' ? 'active' : ''} type="button" onClick={() => setViewMode('now')}>
                <Clock3 size={17} />
                Adesso
              </button>
              <button className={viewMode === 'day' ? 'active' : ''} type="button" onClick={() => setViewMode('day')}>
                <CalendarDays size={17} />
                Giorno
              </button>
            </div>
          </section>

          <section className="time-panel">
            <label className="toggle-row">
              <input type="checkbox" checked={useLiveTime} onChange={(event) => setUseLiveTime(event.target.checked)} />
              Ora corrente
            </label>

            <div className="field compact">
              <label htmlFor="day">Giorno</label>
              <select
                id="day"
                value={viewMode === 'day' || !activeDay ? manualDay : activeDay}
                disabled={viewMode === 'now' && useLiveTime}
                onChange={(event) => setManualDay(event.target.value as DayId)}
              >
                {schedule.days.map((day) => (
                  <option key={day.id} value={day.id}>
                    {day.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field compact">
              <label htmlFor="time">Ora</label>
              <input
                id="time"
                type="time"
                value={activeTime}
                disabled={viewMode === 'day' || useLiveTime}
                onChange={(event) => setManualTime(event.target.value)}
              />
            </div>
          </section>

          {viewMode === 'now' ? (
            <section className="now-grid">
              <LessonCard title="Ora corrente" lesson={currentLesson} targetMode={targetMode} fallback={weekendText(activeDay, activeTime)} />
              <NextCard lesson={nextLesson} targetMode={targetMode} />
            </section>
          ) : (
            <section className="day-card">
              <div className="section-heading">
                <h2>{schedule.days.find((day) => day.id === manualDay)?.label}</h2>
                <span>{targetMode === 'class' ? selectedClass : selectedTeacher}</span>
              </div>

              <div className="timeline">
                {dayPlan.map(({ period, lessons }) => (
                  <div className="timeline-row" key={period.number}>
                    <div className="time-chip">
                      <span>{period.startTime}</span>
                      <small>{period.endTime}</small>
                    </div>
                    <div className="lesson-stack">
                      {lessons.length > 0 ? (
                        lessons.map((lesson) => <LessonLine key={lesson.id} lesson={lesson} targetMode={targetMode} />)
                      ) : (
                        <span className="muted-line">Nessuna lezione</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  )
}

function LessonCard({
  title,
  lesson,
  targetMode,
  fallback,
}: {
  title: string
  lesson: Lesson | null
  targetMode: 'class' | 'teacher'
  fallback: string
}) {
  return (
    <article className="lesson-card current">
      <p>{title}</p>
      {lesson ? (
        <>
          <h2>{targetMode === 'class' ? lesson.teacher : lesson.className}</h2>
          <LessonMeta lesson={lesson} targetMode={targetMode} />
        </>
      ) : (
        <>
          <h2>Nessuna lezione</h2>
          <span className="muted-line">{fallback}</span>
        </>
      )}
    </article>
  )
}

function NextCard({ lesson, targetMode }: { lesson: Lesson | null; targetMode: 'class' | 'teacher' }) {
  return (
    <article className="lesson-card next">
      <p>Prossima ora</p>
      {lesson ? (
        <>
          <div className="next-title">
            <h2>{targetMode === 'class' ? lesson.teacher : lesson.className}</h2>
            <ArrowRight size={22} />
          </div>
          <LessonMeta lesson={lesson} targetMode={targetMode} />
        </>
      ) : (
        <>
          <h2>Fine giornata</h2>
          <span className="muted-line">Nessuna lezione successiva</span>
        </>
      )}
    </article>
  )
}

function LessonLine({ lesson, targetMode }: { lesson: Lesson; targetMode: 'class' | 'teacher' }) {
  return (
    <div className="lesson-line">
      <strong>{targetMode === 'class' ? lesson.teacher : lesson.className}</strong>
      <LessonMeta lesson={lesson} targetMode={targetMode} />
    </div>
  )
}

function LessonMeta({ lesson, targetMode }: { lesson: Lesson; targetMode: 'class' | 'teacher' }) {
  return (
    <div className="lesson-meta">
      <span>{lesson.startTime}</span>
      <span>{lesson.endTime}</span>
      <span>{targetMode === 'class' ? lesson.dayLabel : lesson.teacher}</span>
    </div>
  )
}

function findCurrentLesson(lessons: Lesson[], day: DayId | null, time: string): Lesson | null {
  if (!day) return null
  const minutes = minutesFromMidnight(time)

  return (
    lessons
      .filter((lesson) => lesson.day === day)
      .find((lesson) => minutes >= minutesFromMidnight(lesson.startTime) && minutes < minutesFromMidnight(lesson.endTime)) ?? null
  )
}

function findNextLesson(lessons: Lesson[], day: DayId | null, time: string, currentLesson: Lesson | null): Lesson | null {
  if (!day) return null
  const threshold = currentLesson ? minutesFromMidnight(currentLesson.startTime) : minutesFromMidnight(time)

  return (
    lessons
      .filter((lesson) => lesson.day === day && minutesFromMidnight(lesson.startTime) > threshold)
      .sort((a, b) => minutesFromMidnight(a.startTime) - minutesFromMidnight(b.startTime))[0] ?? null
  )
}

function resolveTeacher(teachers: string[], query: string): string | undefined {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return undefined

  return (
    teachers.find((teacher) => teacher.toLowerCase() === normalizedQuery) ??
    teachers.find((teacher) => teacher.toLowerCase().startsWith(normalizedQuery)) ??
    teachers.find((teacher) => teacher.toLowerCase().includes(normalizedQuery))
  )
}

function dayFromDate(date: Date): DayId | null {
  const dayIndex = date.getDay()
  if (dayIndex < 1 || dayIndex > 5) return null
  return dayOrder[dayIndex - 1]
}

function timeFromDate(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function minutesFromMidnight(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

function addMinutes(time: string, amount: number): string {
  const total = minutesFromMidnight(time) + amount
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function periodToSchoolStartTime(period: number): string {
  return `${String(period + 7).padStart(2, '0')}:10`
}

function lessonId(className: string, day: DayId, startTime: string, teacher: string): string {
  return [className, day, startTime, teacher]
    .join('-')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
}

function normalizeScheduleTimes(schedule: ScheduleData): ScheduleData {
  const periods = schedule.periods.map((period, index, allPeriods) => {
    const startTime = periodToSchoolStartTime(period.number)
    const nextPeriod = allPeriods[index + 1]

    return {
      ...period,
      startTime,
      endTime: nextPeriod ? periodToSchoolStartTime(nextPeriod.number) : addMinutes(startTime, 60),
    }
  })
  const periodByNumber = new Map(periods.map((period) => [period.number, period]))

  return {
    ...schedule,
    periods,
    lessons: schedule.lessons.map((lesson) => {
      const period = periodByNumber.get(lesson.period)
      const startTime = period?.startTime ?? periodToSchoolStartTime(lesson.period)
      const endTime = period?.endTime ?? addMinutes(startTime, 60)

      return {
        ...lesson,
        startTime,
        endTime,
        id: lessonId(lesson.className, lesson.day, startTime, lesson.teacher),
      }
    }),
  }
}

function weekendText(day: DayId | null, time: string): string {
  if (!day) return 'Oggi non e nel calendario scolastico.'
  const minutes = minutesFromMidnight(time)
  if (minutes < minutesFromMidnight('08:10')) return 'Le lezioni non sono ancora iniziate.'
  if (minutes >= minutesFromMidnight('14:10')) return 'Le lezioni sono terminate.'
  return 'Nessun docente in questa fascia.'
}

function readStoredSchedule(): ScheduleData | null {
  try {
    const value = localStorage.getItem(scheduleStorageKey)
    return value ? normalizeScheduleTimes(JSON.parse(value) as ScheduleData) : null
  } catch {
    return null
  }
}

function storeSchedule(schedule: ScheduleData) {
  try {
    localStorage.setItem(scheduleStorageKey, JSON.stringify(normalizeScheduleTimes(schedule)))
  } catch {
    // L'orario resta caricato anche se il browser blocca il salvataggio locale.
  }
}

function clearStoredSchedule() {
  try {
    localStorage.removeItem(scheduleStorageKey)
  } catch {
    // Nessun intervento necessario: il salvataggio e' solo una comodita.
  }
}

export default App
