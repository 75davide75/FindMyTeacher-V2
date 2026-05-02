export const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as const

export type DayId = (typeof dayOrder)[number]

export type Lesson = {
  id: string
  className: string
  teacher: string
  day: DayId
  dayLabel: string
  period: number
  startTime: string
  endTime: string
  sourcePage?: number
}

export type Period = {
  number: number
  startTime: string
  endTime: string
}

export type ScheduleData = {
  id: string
  sourceName: string
  importedAt: string
  startsFrom?: string
  days: Array<{ id: DayId; label: string }>
  periods: Period[]
  classes: string[]
  teachers: string[]
  lessons: Lesson[]
  warnings: string[]
}

export const dayLabels: Record<DayId, string> = {
  monday: 'Lunedi',
  tuesday: 'Martedi',
  wednesday: 'Mercoledi',
  thursday: 'Giovedi',
  friday: 'Venerdi',
}
