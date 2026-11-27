// @vitest-environment node
import 'fake-indexeddb/auto'
import { describe, expect, it, beforeEach } from 'vitest'
import {
  getDB,
  addWorkout,
  addSet,
  getWorkoutWithSets,
  listWorkouts,
  toggleFavorite,
  isFavorite,
  setRecent,
  getRecentOrder,
  getRestSeconds,
  setRestSeconds,
  getSettings,
  updateSettings,
  getTimerState,
  saveTimerState,
  exportAll,
  importAll,
  addRoutine,
  getRoutine,
  listRoutines,
  updateRoutine,
  deleteRoutine,
  nextRoutineName,
  type Routine,
  type Workout,
} from '../src/data/db'

const STORES = [
  'workouts',
  'sets',
  'favorites',
  'recentEx',
  'restSettings',
  'settings',
  'routines',
] as const

beforeEach(async () => {
  // 연결 재사용 — 스토어만 비우기 (deleteDatabase는 열린 연결에서 지연됨)
  const db = await getDB()
  const tx = db.transaction(STORES, 'readwrite')
  await Promise.all(STORES.map((s) => tx.objectStore(s).clear()))
  await tx.done
})

describe('workouts + sets', () => {
  it('adds a workout and its sets, retrieves in order', async () => {
    const w = await addWorkout({
      startedAt: 1_000_000,
      endedAt: 1_000_600,
      notes: '좋았다',
      exerciseIds: ['bench-press', 'squat'],
      exNotes: { 'bench-press': '그립 넓게' },
    })
    await addSet(w.id, 'bench-press', 1, 60, 8, true, 1_000_100)
    await addSet(w.id, 'bench-press', 2, 62.5, 6, true, 1_000_200)
    await addSet(w.id, 'squat', 1, 100, 5, false, null)

    const got = await getWorkoutWithSets(w.id)
    expect(got).toBeDefined()
    expect(got!.workout.exNotes?.['bench-press']).toBe('그립 넓게')
    expect(got!.sets.map((s) => s.order)).toEqual([1, 2, 1])
    expect(got!.sets[1].weightKg).toBe(62.5)
    expect(got!.sets[2].done).toBe(false)
  })

  it('lists workouts newest first', async () => {
    const a = await addWorkout({ startedAt: 100, endedAt: 200, notes: '', exerciseIds: [] })
    const b = await addWorkout({ startedAt: 500, endedAt: 600, notes: '', exerciseIds: [] })
    const list = await listWorkouts()
    expect(list.map((w: Workout) => w.id)).toEqual([b.id, a.id])
  })

  it('returns undefined for missing workout', async () => {
    expect(await getWorkoutWithSets(9999)).toBeUndefined()
  })
})

describe('favorites', () => {
  it('toggles on then off', async () => {
    expect(await isFavorite('bench-press')).toBe(false)
    await toggleFavorite('bench-press')
    expect(await isFavorite('bench-press')).toBe(true)
    await toggleFavorite('bench-press')
    expect(await isFavorite('bench-press')).toBe(false)
  })
})

describe('recentEx', () => {
  it('keeps most-recent-first order, dedupes', async () => {
    const now = Date.now()
    await setRecent('a', now)
    await setRecent('b', now + 1000)
    await setRecent('a', now + 2000) // a가 다시 최근
    expect(await getRecentOrder()).toEqual(['a', 'b'])
  })
})

describe('restSettings — 글로벌 기본 + 운동별 오버라이드', () => {
  it('falls back to global default', async () => {
    expect(await getRestSeconds(undefined)).toBe(60) // 미설정 기본 60초
    await setRestSeconds(undefined, 90)
    expect(await getRestSeconds(undefined)).toBe(90)
    expect(await getRestSeconds('bench-press')).toBe(90) // 오버라이드 없으면 기본
  })

  it('per-exercise override wins', async () => {
    await setRestSeconds(undefined, 90)
    await setRestSeconds('bench-press', 30)
    expect(await getRestSeconds('bench-press')).toBe(30)
    expect(await getRestSeconds('squat')).toBe(90)
  })
})

describe('settings', () => {
  it('returns defaults before first write', async () => {
    const s = await getSettings()
    expect(s.theme).toBe('dark')
    expect(s.accent).toBe('orange')
    expect(s.unit).toBe('kg')
  })

  it('partial update merges with existing', async () => {
    await updateSettings({ unit: 'lb' })
    const s = await getSettings()
    expect(s.unit).toBe('lb')
    expect(s.theme).toBe('dark') // 유지
    await updateSettings({ theme: 'light' })
    expect((await getSettings()).unit).toBe('lb') // 유지
  })
})

describe('export / import', () => {
  it('round-trips data', async () => {
    const w = await addWorkout({ startedAt: 1, endedAt: 2, notes: 'n', exerciseIds: ['x'] })
    await addSet(w.id, 'x', 1, 50, 10, true, null)
    await toggleFavorite('x')
    await setRestSeconds(undefined, 75)
    await updateSettings({ unit: 'lb' })

    const json = JSON.parse(await exportAll())
    expect(json.workouts).toHaveLength(1)
    expect(json.sets).toHaveLength(1)
    expect(json.favorites).toHaveLength(1)

    // 지우고 복원
    await importAll('{}')
    expect((await listWorkouts()).length).toBe(0)

    await importAll(json as unknown as string)
    expect((await listWorkouts()).length).toBe(1)
    expect(await isFavorite('x')).toBe(true)
    expect(await getRestSeconds(undefined)).toBe(75)
    expect((await getSettings()).unit).toBe('lb')
  })

  it('timer state survives force-kill (IDB round-trip)', async () => {
    await saveTimerState(7, { endTime: 1_700_000_090_000, pausedRemaining: null })
    expect(await getTimerState(7)).toEqual({ endTime: 1_700_000_090_000, pausedRemaining: null })
    await saveTimerState(7, { endTime: null, pausedRemaining: 30_000 })
    expect(await getTimerState(7)).toEqual({ endTime: null, pausedRemaining: 30_000 })
    await saveTimerState(7, { endTime: null, pausedRemaining: null })
  })

  it('timer state is scoped per workout', async () => {
    await saveTimerState(7, { endTime: null, pausedRemaining: 45_000 })
    expect(await getTimerState(8)).toEqual({ endTime: null, pausedRemaining: null })
    await saveTimerState(8, { endTime: null, pausedRemaining: null })
  })

  it('rejects malformed JSON and leaves existing data intact', async () => {
    const w = await addWorkout({ startedAt: 1, endedAt: null, notes: '', exerciseIds: ['x'] })
    await addSet(w.id, 'x', 1, 20, 8, true, null)

    await expect(importAll('{bad json')).rejects.toThrow(SyntaxError)

    // 기존 데이터는 그대로 유지되어야 함
    expect((await listWorkouts()).length).toBe(1)
    const { sets } = await getWorkoutWithSets(w.id)
    expect(sets).toHaveLength(1)
  })

  it('round-trips routines', async () => {
    const r = await addRoutine('Day 1', ['squat'])
    const json = JSON.parse(await exportAll())
    expect(json.routines).toHaveLength(1)
    await importAll('{}')
    expect(await listRoutines()).toEqual([])
    await importAll(json as unknown as string)
    expect((await listRoutines()).map((x: Routine) => x.id)).toEqual([r.id])
  })
})

describe('routines', () => {
  it('adds routines in creation order', async () => {
    const a = await addRoutine('Day 1', ['bench-press', 'squat'])
    const b = await addRoutine('Day 2', ['deadlift'])
    expect(a.id).not.toBe(b.id)
    expect(a.name).toBe('Day 1')
    expect(a.exerciseIds).toEqual(['bench-press', 'squat'])
    const list = await listRoutines()
    expect(list.map((r) => r.name)).toEqual(['Day 1', 'Day 2'])
  })

  it('trims name and copies exerciseIds', async () => {
    const ids = ['squat']
    const r = await addRoutine('  Day 1  ', ids)
    expect(r.name).toBe('Day 1')
    ids.push('lunge')
    expect(r.exerciseIds).toEqual(['squat']) // 원 배열 참조 오염 금지
  })

  it('gets, updates, deletes a routine', async () => {
    const a = await addRoutine('Day 1', ['squat'])
    expect((await getRoutine(a.id))?.name).toBe('Day 1')
    await updateRoutine({ ...a, name: 'Leg Day', exerciseIds: ['squat', 'lunge'] })
    const got = await getRoutine(a.id)
    expect(got?.name).toBe('Leg Day')
    expect(got?.exerciseIds).toEqual(['squat', 'lunge'])
    await deleteRoutine(a.id)
    expect(await getRoutine(a.id)).toBeUndefined()
    expect(await listRoutines()).toEqual([])
  })

  it('returns undefined for missing routine', async () => {
    expect(await getRoutine(9999)).toBeUndefined()
  })
})

describe('nextRoutineName', () => {
  it('starts at Day 1 when empty', () => {
    expect(nextRoutineName([])).toBe('Day 1')
  })

  it('uses max Day number + 1', () => {
    const rs = [
      { id: 1, name: 'Day 1', order: 1, exerciseIds: [] },
      { id: 2, name: 'Day 3', order: 2, exerciseIds: [] },
    ]
    expect(nextRoutineName(rs)).toBe('Day 4')
  })

  it('ignores custom names and matches loosely', () => {
    const rs = [
      { id: 1, name: 'Leg Day', order: 1, exerciseIds: [] },
      { id: 2, name: 'day  2', order: 2, exerciseIds: [] },
      { id: 3, name: 'DAY1', order: 3, exerciseIds: [] },
    ]
    expect(nextRoutineName(rs)).toBe('Day 3')
  })

  it('handles huge day numbers without overflow', () => {
    const rs = [{ id: 1, name: 'Day 999999999999', order: 1, exerciseIds: [] }]
    expect(nextRoutineName(rs)).toBe('Day 1000000000000')
  })

  it('ignores emoji / non-numeric names', () => {
    const rs = [
      { id: 1, name: '💪 상체', order: 1, exerciseIds: [] },
      { id: 2, name: 'Day 2', order: 2, exerciseIds: [] },
    ]
    expect(nextRoutineName(rs)).toBe('Day 3')
  })
})
