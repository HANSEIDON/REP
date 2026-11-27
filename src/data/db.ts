// 사용자 기록 — IndexedDB (idb)
// 마스터 운동 데이터는 번들 JSON — 여기에는 "내 기록"만 저장
// 스키마: REP-phase1-design.md §2.3 (exNotes는 승인된 workouts 스키마의 확장)

import { openDB, type IDBPDatabase } from 'idb'

export interface Workout {
  id: number
  startedAt: number
  endedAt: number | null
  notes: string
  exerciseIds: string[]
  /** 루틴 이름 (루틴에서 시작할 때 저장. 기존 기록은 없음) */
  routineName?: string
  /** 운동별 메모 (exerciseId → text) */
  exNotes?: Record<string, string>
}

export interface WorkoutSet {
  id: number
  workoutId: number
  exerciseId: string
  /** 해당 운동의 1-based 세트 순서 */
  order: number
  weightKg: number
  reps: number
  done: boolean
  doneAt: number | null
}

export interface Favorite {
  exerciseId: string
  addedAt: number
}

export interface RecentEx {
  exerciseId: string
  usedAt: number
}

export interface RestSetting {
  /** 'global' = 기본, 아니면 exerciseId */
  key: string
  seconds: number
}

export interface AppSettings {
  theme: 'dark' | 'light'
  accent: 'orange' | 'blue' | 'lime'
  unit: 'kg' | 'lb'
  timerSound: boolean
}

export interface TimerState {
  /** 진행 중: Unix ms. null이면 미시작 */
  endTime: number | null
  /** 일시정지 시 남은 ms */
  pausedRemaining: number | null
}

export interface Routine {
  id: number
  name: string
  order: number
  exerciseIds: string[]
}

const DB_NAME = 'rep'
const DB_VERSION = 1
const GLOBAL_KEY = 'global'
const APP_KEY = 'app'

export const DEFAULT_REST_SECONDS = 60
export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  accent: 'orange',
  unit: 'kg',
  timerSound: true,
}

export const STORE_NAMES = [
  'workouts',
  'sets',
  'favorites',
  'recentEx',
  'restSettings',
  'settings',
  'timerState',
  'routines',
] as const

type RepDB = IDBPDatabase

let dbPromise: Promise<RepDB> | null = null

/** DB 연결 (모듈 레벨 캐시) */
export function getDB(): Promise<RepDB> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore('workouts', { keyPath: 'id', autoIncrement: true })

        const sets = db.createObjectStore('sets', { keyPath: 'id', autoIncrement: true })
        sets.createIndex('by-workout', 'workoutId')

        db.createObjectStore('favorites', { keyPath: 'exerciseId' })
        db.createObjectStore('recentEx', { keyPath: 'exerciseId' })
        db.createObjectStore('restSettings', { keyPath: 'key' })
        db.createObjectStore('settings', { keyPath: 'key' })

        // timerState: 단일 행 (key: 'now') — endTime 기반, §6
        db.createObjectStore('timerState', { keyPath: 'key' })

        // routines: v1.1 예약 (현재 미사용)
        db.createObjectStore('routines', { keyPath: 'id', autoIncrement: true })
      },
    })
  }
  return dbPromise
}

/* ---------------- workouts ---------------- */

export async function addWorkout(
  data: Omit<Workout, 'id'>,
): Promise<Workout> {
  const db = await getDB()
  const id = (await db.add('workouts', data as Omit<Workout, 'id'>)) as number
  return { ...data, id }
}

export async function updateWorkout(w: Workout): Promise<void> {
  const db = await getDB()
  await db.put('workouts', w)
}

export async function deleteWorkout(id: number): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(['workouts', 'sets'], 'readwrite')
  const setsStore = tx.objectStore('sets')
  const toDel = (await setsStore.index('by-workout').getAll(id)) as WorkoutSet[]
  await tx.objectStore('workouts').delete(id)
  for (const s of toDel) await setsStore.delete(s.id)
  await tx.done
}

export async function getWorkout(id: number): Promise<Workout | undefined> {
  const db = await getDB()
  return db.get('workouts', id)
}

/** workout + 세트 (workout.exerciseIds 순서, 세트 순서 정렬) */
export async function getWorkoutWithSets(
  id: number,
): Promise<{ workout: Workout; sets: WorkoutSet[] } | undefined> {
  const workout = await getWorkout(id)
  if (!workout) return undefined
  const db = await getDB()
  const sets = (await db.getAllFromIndex('sets', 'by-workout', id)) as WorkoutSet[]
  const pos = (ex: string) => {
    const i = workout.exerciseIds.indexOf(ex)
    return i === -1 ? workout.exerciseIds.length : i
  }
  sets.sort((a, b) => pos(a.exerciseId) - pos(b.exerciseId) || a.order - b.order)
  return { workout, sets }
}

/** 여러 워크아웃의 세트를 단일 트랜잭션으로 일괄 조회 (N+1 방지) */
export async function listSetsByWorkouts(
  ids: number[],
): Promise<Map<number, WorkoutSet[]>> {
  if (ids.length === 0) return new Map()
  const db = await getDB()
  const tx = db.transaction('sets', 'readonly')
  const entries = await Promise.all(
    ids.map(async (id) => [
      id,
      (await tx.objectStore('sets').index('by-workout').getAll(id)) as WorkoutSet[],
    ] as const),
  )
  await tx.done
  return new Map(entries)
}

export async function listWorkouts(): Promise<Workout[]> {
  const db = await getDB()
  const all = (await db.getAll('workouts')) as Workout[]
  return all.sort((a, b) => b.startedAt - a.startedAt)
}

/** 종료(endedAt)되지 않은 가장 최근 워크아웃 — 앱 재시작 시 자동 복원용 */
export async function getInProgressWorkout(): Promise<Workout | undefined> {
  const all = await listWorkouts()
  return all.find((w) => w.endedAt == null)
}

/* ---------------- sets ---------------- */

export async function addSet(
  workoutId: number,
  exerciseId: string,
  order: number,
  weightKg: number,
  reps: number,
  done: boolean,
  doneAt: number | null,
): Promise<WorkoutSet> {
  const db = await getDB()
  const data = {
    workoutId,
    exerciseId,
    order,
    weightKg,
    reps,
    done,
    doneAt,
  }
  const id = (await db.add('sets', data)) as number
  return { ...data, id }
}

export async function updateSet(s: WorkoutSet): Promise<void> {
  const db = await getDB()
  await db.put('sets', s)
}

/* ---------------- favorites ---------------- */

export async function toggleFavorite(exerciseId: string): Promise<boolean> {
  const db = await getDB()
  const existing = await db.get('favorites', exerciseId)
  if (existing) {
    await db.delete('favorites', exerciseId)
    return false
  }
  await db.put('favorites', { exerciseId, addedAt: Date.now() })
  return true
}

export async function isFavorite(exerciseId: string): Promise<boolean> {
  const db = await getDB()
  return (await db.get('favorites', exerciseId)) != null
}

export async function listFavorites(): Promise<Favorite[]> {
  const db = await getDB()
  const all = (await db.getAll('favorites')) as Favorite[]
  return all.sort((a, b) => a.addedAt - b.addedAt)
}

/* ---------------- recentEx ---------------- */

export async function setRecent(exerciseId: string, usedAt: number): Promise<void> {
  const db = await getDB()
  await db.put('recentEx', { exerciseId, usedAt })
}

export async function getRecentOrder(): Promise<string[]> {
  const db = await getDB()
  const all = (await db.getAll('recentEx')) as RecentEx[]
  return all.sort((a, b) => b.usedAt - a.usedAt).map((r) => r.exerciseId)
}

/* ---------------- restSettings ---------------- */

export async function getRestSeconds(exerciseId?: string): Promise<number> {
  const db = await getDB()
  if (exerciseId) {
    const o = (await db.get('restSettings', exerciseId)) as RestSetting | undefined
    if (o) return o.seconds
  }
  const g = (await db.get('restSettings', GLOBAL_KEY)) as RestSetting | undefined
  return g ? g.seconds : DEFAULT_REST_SECONDS
}

export async function setRestSeconds(
  exerciseId: string | undefined,
  seconds: number,
): Promise<void> {
  const db = await getDB()
  await db.put('restSettings', { key: exerciseId ?? GLOBAL_KEY, seconds })
}

/* ---------------- settings ---------------- */

export async function getSettings(): Promise<AppSettings> {
  const db = await getDB()
  const row = (await db.get('settings', APP_KEY)) as
    | (AppSettings & { key: string })
    | undefined
  return row ? { ...row } : { ...DEFAULT_SETTINGS }
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings()
  const next: AppSettings = { ...current, ...patch }
  const db = await getDB()
  await db.put('settings', { key: APP_KEY, ...next })
  return next
}

/* ---------------- timerState ---------------- */

/* 워크아웃별 타이머 상태 — 세션마다 독립적으로 복구됨 */

export async function getTimerState(workoutId: number): Promise<TimerState> {
  const db = await getDB()
  const row = (await db.get('timerState', `w:${workoutId}`)) as
    | (TimerState & { key?: string })
    | undefined
  if (!row) return { endTime: null, pausedRemaining: null }
  return { endTime: row.endTime, pausedRemaining: row.pausedRemaining }
}

export async function saveTimerState(workoutId: number, state: TimerState): Promise<void> {
  const db = await getDB()
  await db.put('timerState', { key: `w:${workoutId}`, endTime: state.endTime, pausedRemaining: state.pausedRemaining })
}

/* ---------------- routines ---------------- */

export async function addRoutine(name: string, exerciseIds: string[]): Promise<Routine> {
  const db = await getDB()
  const base = { name: name.trim(), exerciseIds: [...exerciseIds] }
  const id = (await db.add('routines', base)) as number
  const full: Routine = { id, ...base, order: id }
  await db.put('routines', full)
  return full
}

export async function getRoutine(id: number): Promise<Routine | undefined> {
  const db = await getDB()
  return db.get('routines', id)
}

export async function listRoutines(): Promise<Routine[]> {
  const db = await getDB()
  const all = (await db.getAll('routines')) as Routine[]
  return all.sort((a, b) => a.order - b.order || a.id - b.id)
}

export async function updateRoutine(r: Routine): Promise<void> {
  const db = await getDB()
  await db.put('routines', r)
}

export async function deleteRoutine(id: number): Promise<void> {
  const db = await getDB()
  await db.delete('routines', id)
}

/** "Day N" — 기존 Day 번호 중 최대 + 1 ("Day 1: ..." 같은 접두사 이름도 인식) */
export function nextRoutineName(routines: Routine[]): string {
  let max = 0
  for (const r of routines) {
    const m = /^day\s*(\d+)/i.exec(r.name.trim())
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return `Day ${max + 1}`
}

/* ---------------- export / import ---------------- */

const EXPORT_STORES = [
  'workouts',
  'sets',
  'favorites',
  'recentEx',
  'restSettings',
  'settings',
  'routines',
] as const

/** 전체 스토어 JSON 직렬화 (timerState는 런타임 상태라 제외) */
export async function exportAll(): Promise<string> {
  const db = await getDB()
  const out: Record<string, unknown[]> = {}
  for (const s of EXPORT_STORES) out[s] = await db.getAll(s)
  return JSON.stringify(out)
}

/** 트랜잭션 내 교체 — 문자열 또는 객체 둘 다 허용 */
export async function importAll(payload: string | Record<string, unknown>): Promise<void> {
  const data: Record<string, unknown> =
    typeof payload === 'string' ? (JSON.parse(payload) as Record<string, unknown>) : payload
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('올바른 백업 JSON 형식이 아닙니다.')
  }
  const db = await getDB()
  const tx = db.transaction(EXPORT_STORES, 'readwrite')
  await Promise.all(
    EXPORT_STORES.map(async (s) => {
      const store = tx.objectStore(s)
      await store.clear()
      const rows = (data[s] ?? []) as unknown[]
      for (const row of rows) await store.put(row as never)
    }),
  )
  await tx.done
}
