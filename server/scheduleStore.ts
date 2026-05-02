import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { ScheduleData } from './types.js'

const dataDir = path.join(process.cwd(), 'data')
const schedulePath = path.join(dataDir, 'schedule.json')

export async function loadSchedule(): Promise<ScheduleData | null> {
  try {
    return JSON.parse(await readFile(schedulePath, 'utf8')) as ScheduleData
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

export async function saveSchedule(schedule: ScheduleData): Promise<void> {
  await mkdir(dataDir, { recursive: true })
  await writeFile(schedulePath, `${JSON.stringify(schedule, null, 2)}\n`)
}

export function getSchedulePath(): string {
  return schedulePath
}
