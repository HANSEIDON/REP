import { useCallback, useEffect, memo, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useExercises } from '../data/useExercises'
import {
  addSet,
  addWorkout,
  getInProgressWorkout,
  DEFAULT_REST_SECONDS,
  getRestSeconds,
  setRestSeconds,
  getSettings,
  getTimerState,
  getWorkoutWithSets,
  listWorkouts,
  saveTimerState,
  setRecent,
  updateSet,
  updateWorkout,
  getDB,
  addRoutine,
  getRoutine,
  listRoutines,
  updateRoutine,
  deleteRoutine,
  nextRoutineName,
} from '../data/db'
import { exerciseThumb, filterByMuscle, getExercise, searchExercises, substitutesFor } from '../data/exerciseRepo'
import { MUSCLE_KO, MUSCLE_ORDER } from '../data/labels'
import { IDLE_STATE, adjust, format, pause, remaining, resume, start, status } from '../timer/timer'
import type { Routine, TimerState, Workout } from '../data/db'
import { pushTimerInfo } from '../timer/bus'
import ExerciseSheet from './ExerciseSheet'
import './workout-log.css'

const KG_TO_LB = 2.20462

interface SetRow {
  id: number
  workoutId: number
  exerciseId: string
  order: number
  weightKg: number
  reps: number
  done: boolean
  doneAt: number | null
}

function beep(times: number) {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const t0 = ctx.currentTime
    for (let i = 0; i < times; i++) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'square'
      osc.frequency.value = 880
      const t = t0 + i * 0.35
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.3)
    }
    window.setTimeout(() => void ctx.close(), 1500)
  } catch {
    /* no audio available */
  }
}

/**
 * 휴식 타이머 표시 블록 — 250ms 틱을 이 컴포넌트 내부에서만 갱신해
 * 1100줄짜리 부모(운동 카드 25개 훅 포함)가 매 틱마다 재렌더되는 것을 제거.
 * 액션은 전부 부모의 transition 경로를 그대로 재사용.
 */
export const RestTimer = memo(function RestTimer({
  timer,
  onAction,
}: {
  timer: TimerState
  onAction: (action: 'restart' | 'close' | 'minus15' | 'pauseResume' | 'plus15' | 'stop') => void
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (timer.endTime == null) return
    setNow(Date.now())
    const t = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(t)
  }, [timer])
  const st = status(timer, now)
  return (
    <div className="wl-timer" role="timer" aria-live="polite">
      <div className="wl-timer__time num">
        {st === 'done' ? '0:00' : format(remaining(timer, now))}
      </div>
      <div className="wl-timer__label">{st === 'done' ? '휴식 종료' : st === 'paused' ? '일시정지' : '휴식 중'}</div>
      <div className="wl-timer__btns">
        {st === 'done' ? (
          <>
            <button type="button" className="wl-timer__btn" onClick={() => onAction('restart')}>
              다시
            </button>
            <button type="button" className="wl-timer__btn" onClick={() => onAction('close')}>
              닫기
            </button>
          </>
        ) : (
          <>
            <button type="button" className="wl-timer__btn" onClick={() => onAction('minus15')} aria-label="15초 감소">
              −15s
            </button>
            <button
              type="button"
              className="wl-timer__btn wl-timer__btn--main"
              onClick={() => onAction('pauseResume')}
            >
              {st === 'paused' ? '계속' : '일시정지'}
            </button>
            <button type="button" className="wl-timer__btn" onClick={() => onAction('plus15')} aria-label="15초 증가">
              +15s
            </button>
            <button type="button" className="wl-timer__btn wl-timer__btn--stop" onClick={() => onAction('stop')}>
              정지
            </button>
          </>
        )}
      </div>
    </div>
  )
})

export default function WorkoutLog() {
  const { pathname } = useLocation()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const exState = useExercises()
  const list = exState.status === 'ready' ? exState.list : []

  const [workout, setWorkout] = useState<Workout | null>(null)
  const [exIds, setExIds] = useState<string[]>([])
  const [activeEx, setActiveEx] = useState<string | null>(null)
  const [infoEx, setInfoEx] = useState<string | null>(null)
  const [setsByEx, setSetsByEx] = useState<Record<string, SetRow[]>>({})
  const [notesByEx, setNotesByEx] = useState<Record<string, string>>({})
  const [query, setQuery] = useState('')
  const [muscle, setMuscle] = useState<string | null>(null)
  const [addExpanded, setAddExpanded] = useState(false)
  const [unit, setUnit] = useState<'kg' | 'lb'>('kg')
  const [soundOn, setSoundOn] = useState(true)
  const [timer, setTimer] = useState<TimerState>(IDLE_STATE)
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)
  const [routine, setRoutine] = useState<Routine | null>(null)
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [savedFlash, setSavedFlash] = useState(false)
  const [restByEx, setRestByEx] = useState<Record<string, number>>({})
  const [restDraft, setRestDraft] = useState<Record<string, string>>({})
  const [delOpen, setDelOpen] = useState(false)
  const cardRefs = useRef<Record<string, HTMLElement | null>>({})
  const beepedRef = useRef<number | null>(null)
  const flashTimerRef = useRef<number | null>(null)
  const [drag, setDrag] = useState<{ id: string; dy: number } | null>(null)
  const [dragShifts, setDragShifts] = useState<Record<string, number>>({})
  const [committing, setCommitting] = useState(false)
  const dragBaseline = useRef<{
    ids: string[]
    top: number
    h: number
    gap: number
    startY: number
    slots: { id: string; top: number; h: number }[]
  } | null>(null)
  const dragTarget = useRef(0)
  const [swipe, setSwipe] = useState<{ id: string; dx: number; live: boolean } | null>(null)
  const swipeGesture = useRef<{ id: string; startX: number; startY: number; dx: number; locked: 'h' | 'v' | null } | null>(null)

  const factor = unit === 'lb' ? KG_TO_LB : 1

  /* ---------- per-exercise rest control ---------- */
  const restOf = (exId: string) => restByEx[exId] ?? DEFAULT_REST_SECONDS

  function setRestTo(exId: string, value: number) {
    const next = Math.min(600, Math.max(5, Math.round(value)))
    setRestByEx((m) => ({ ...m, [exId]: next }))
    void setRestSeconds(exId, next)
  }

  function ensureRest(id: string) {
    if (restByEx[id] != null) return
    void getRestSeconds(id).then((n) =>
      setRestByEx((m) => (m[id] != null ? m : { ...m, [id]: n }))
    )
  }

  function openCard(id: string) {
    const opening = activeEx !== id
    setActiveEx(opening ? id : null)
    if (opening) {
      ensureRest(id)
      // switching to a different exercise clears the previous rest timer
      if (activeEx != null) transition(IDLE_STATE)
    }
  }

  /* ---------- timer helpers (endTime-based, never accumulated) ---------- */
  const transition = (next: TimerState) => {
    setTimer(next)
    setNow(Date.now())
    if (workout) void saveTimerState(workout.id, next)
    // 전역 타이머 바(RestBar) 갱신
    pushTimerInfo({
      workoutId: workout?.id ?? null,
      exerciseName: activeEx ? (getExercise(list, activeEx)?.nameKo ?? getExercise(list, activeEx)?.name) ?? null : null,
      state: next,
    })
  }

  useEffect(() => {
    if (pathname !== '/log') return
    getSettings().then((s) => {
      setUnit(s.unit)
      setSoundOn(s.timerSound)
    })
  }, [pathname])

  // force-kill recovery: restore only the timer state saved for THIS workout
  const restoredRef = useRef(false)
  useEffect(() => {
    if (!workout || restoredRef.current) return
    restoredRef.current = true
    void getTimerState(workout.id).then((ts) => {
      if (ts.endTime != null || ts.pausedRemaining != null) {
        setTimer(ts)
        setNow(Date.now())
        // 이미 끝난 타이머는 재시작 시 비프하지 않도록 사전 표기
        if (ts.endTime != null && ts.endTime <= Date.now()) beepedRef.current = ts.endTime
      }
    })
  }, [workout])

  // 부모는 종료 시점에 1회만 갱신(비프·st 전환용). 250ms 표시 틱은 RestTimer가 자체 처리.
  useEffect(() => {
    if (timer.endTime == null) return
    setNow(Date.now())
    const t = window.setTimeout(() => setNow(Date.now()), Math.max(0, timer.endTime - Date.now()))
    return () => window.clearTimeout(t)
  }, [timer])

  const st = status(timer, now)

  // RestTimer 액션 → 기존 transition 경로 그대로 사용
  const handleTimerAction = useCallback(
    (action: 'restart' | 'close' | 'minus15' | 'pauseResume' | 'plus15' | 'stop') => {
      if (action === 'restart') {
        void getRestSeconds(activeEx ?? undefined).then((rest) => transition(start(rest, Date.now())))
      } else if (action === 'close' || action === 'stop') {
        transition(IDLE_STATE)
      } else if (action === 'minus15') {
        transition(adjust(timer, -15))
      } else if (action === 'plus15') {
        transition(adjust(timer, 15))
      } else {
        transition(status(timer, Date.now()) === 'paused' ? resume(timer, Date.now()) : pause(timer, Date.now()))
      }
    },
    // transition은 매 렌더 생성되지만 deps에 넣어 의존성 경고를 피함
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeEx, timer],
  )

  // single beep guard on 'done' transition
  useEffect(() => {
    if (st === 'done' && timer.endTime != null && beepedRef.current !== timer.endTime) {
      beepedRef.current = timer.endTime
      if (soundOn && document.visibilityState === 'visible') beep(3)
    }
    if (st !== 'done') beepedRef.current = null
  }, [st, timer.endTime, soundOn])

  /* ---------- persistence helpers ---------- */
  async function ensureWorkout(ids: string[], routineOverride?: Routine | null): Promise<Workout> {
    if (workout && workout.endedAt == null) {
      if (JSON.stringify(workout.exerciseIds) !== JSON.stringify(ids)) {
        const w = { ...workout, exerciseIds: ids }
        await updateWorkout(w)
        setWorkout(w)
        return w
      }
      return workout
    }
    const r = routineOverride !== undefined ? routineOverride : routine
    const w = await addWorkout({
      startedAt: Date.now(),
      endedAt: null,
      notes: '',
      exerciseIds: ids,
      routineName: r?.name,
      exNotes: notesByEx,
    })
    setWorkout(w)
    return w
  }

  async function prefillRows(exId: string, skipId?: number): Promise<SetRow[]> {
    const all = await listWorkouts()
    // 현재 진행 중 워크아웃(방금 생성된 빈 워크아웃)은 스킵하고,
    // 실제 중량/회수가 기록된 가장 최근 워크아웃에서 값을 가져온다.
    for (const w of all) {
      if (skipId != null && w.id === skipId) continue
      if (!w.exerciseIds.includes(exId)) continue
      const data = await getWorkoutWithSets(w.id)
      if (!data) continue
      const mine = data.sets
        .filter((s) => s.exerciseId === exId && (s.weightKg > 0 || s.reps > 0))
        .sort((a, b) => a.order - b.order)
      if (mine.length === 0) continue
      return mine.map((s, i) => ({
        id: 0,
        workoutId: w.id,
        exerciseId: exId,
        order: i + 1,
        weightKg: s.weightKg,
        reps: s.reps,
        done: false,
        doneAt: null,
      }))
    }
    return []
  }

  // ?routine=ID 로 들어온 루틴 로드 — 기존 세션에 없는 운동만 추가하고 첫 운동 세트만 prefill (selectExercise 재사용 안 함)
  // StrictMode 이중 effect 호출로 인한 중복 시드/세트 생성 방지 인플라이트 가드
  const loadingRef = useRef<Set<string>>(new Set())
  function loadRoutine(rid: number) {
    const key = `routine:${rid}`
    if (loadingRef.current.has(key)) return
    loadingRef.current.add(key)
    loadRoutineInner(rid)
      .catch(() => undefined)
      .finally(() => loadingRef.current.delete(key))
  }
  async function loadRoutineInner(rid: number) {
    const r = await getRoutine(rid)
    if (!r) return
    setRoutine(r)
    setSaveOpen(false)
    setSaveName(r.name)

    // 이미 이 루틴의 진행 중 워크아웃이 열려 있으면 그대로 유지
    if (workout && workout.endedAt == null && routine?.id === r.id) {
      return
    }

    // 앱 재시작 직후 등 메모리에 워크아웃이 없을 때만 DB의 동일 루틴 진행 중 세션을 복원
    if (!workout) {
      const inProg = await getInProgressWorkout()
      if (inProg && inProg.endedAt == null && inProg.routineName === r.name) {
        const data = await getWorkoutWithSets(inProg.id)
        if (data) {
          setWorkout(inProg)
          setExIds(inProg.exerciseIds)
          const byEx: Record<string, SetRow[]> = {}
          for (const exId of inProg.exerciseIds) {
            byEx[exId] = data.sets.filter((s) => s.exerciseId === exId)
          }
          setSetsByEx(byEx)
          setNotesByEx(inProg.exNotes ?? {})
          const active =
            inProg.exerciseIds.find((id) => (byEx[id] ?? []).some((s) => !s.done)) ?? inProg.exerciseIds[0] ?? null
          if (active) {
            setActiveEx(active)
            ensureRest(active)
          }
          return
        }
      }
    }

    // 다른 루틴/이전 운동 기록이 섞이지 않도록 새 세션으로 초기화
    transition(IDLE_STATE)
    setWorkout(null)
    setSetsByEx({})
    setNotesByEx({})
    setRestDraft({})
    const ids = [...r.exerciseIds]
    setExIds(ids)
    if (ids.length === 0) {
      setActiveEx(null)
      return
    }
    if (ids[0] && getExercise(list, ids[0])) {
      setActiveEx(ids[0])
      ensureRest(ids[0])
    } else {
      setActiveEx(null)
    }
    const w = await addWorkout({
      startedAt: Date.now(),
      endedAt: null,
      notes: '',
      exerciseIds: ids,
      routineName: r.name,
      exNotes: {},
    })
    setWorkout(w)
    for (const exId of ids) {
      const pref = await prefillRows(exId, w.id)
      if (pref.length === 0) continue
      const rows: SetRow[] = []
      for (const p of pref) {
        const s = await addSet(w.id, exId, p.order, p.weightKg, p.reps, false, null)
        rows.push({ ...s })
      }
      setSetsByEx((m) => ({ ...m, [exId]: rows }))
    }
  }

  function openSave() {
    if (routine) {
      setSaveName(routine.name)
    } else {
      listRoutines().then((rs) => setSaveName(nextRoutineName(rs))).catch(() => setSaveName('Day 1'))
    }
    setSaveOpen(true)
  }

  function closeEdit() {
    setSaveOpen(false)
    setActiveEx(null)
    setInfoEx(null)
  }

  function flashSaved() {
    setSavedFlash(true)
    if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current)
    flashTimerRef.current = window.setTimeout(() => setSavedFlash(false), 1500)
  }

  async function saveRoutine() {
    const name = saveName.trim()
    if (!name) return
    if (routine) {
      const r = { ...routine, name, exerciseIds: [...exIds] }
      await updateRoutine(r)
      setRoutine(r)
    } else {
      const rs = await listRoutines()
      const dup = rs.find((x) => x.name.trim() === name.trim())
      if (dup) {
        // 같은 이름의 기존 루틴이 있으면 새로 만들지 않고 해당 루틴을 갱신한다 (제목 수정 버그 방지)
        const r = { ...dup, name, exerciseIds: exIds.length > 0 ? [...exIds] : dup.exerciseIds }
        await updateRoutine(r)
        setRoutine(r)
      } else {
        const r = await addRoutine(name, [...exIds])
        setRoutine(r)
      }
    }
    setSaveOpen(false)
    flashSaved()
  }

  function openDeleteConfirm() {
    if (!routine) return
    setDelOpen(true)
  }

  async function confirmDeleteRoutine() {
    if (!routine) return
    setDelOpen(false)
    await deleteRoutine(routine.id)
    setRoutine(null)
    setSaveOpen(false)
    setSaveName('')
  }

  function selectExercise(exId: string) {
    const key = `ex:${exId}`
    if (loadingRef.current.has(key)) return
    loadingRef.current.add(key)
    void selectExerciseInner(exId).finally(() => loadingRef.current.delete(key))
  }
  async function selectExerciseInner(exId: string) {
    setBusy(true)
    try {
      const ids = exIds.includes(exId) ? exIds : [...exIds, exId]
      const w = await ensureWorkout(ids)
      setExIds(ids)
      setActiveEx(exId)
      // adding a new exercise opens its card — clear any running rest timer
      transition(IDLE_STATE)
      ensureRest(exId)
      if (!setsByEx[exId] || setsByEx[exId].length === 0) {
        const pref = await prefillRows(exId, w.id)
        if (pref.length > 0) {
          const rows: SetRow[] = []
          for (const p of pref) {
            const s = await addSet(w.id, exId, p.order, p.weightKg, p.reps, false, null)
            rows.push({ ...s })
          }
          setSetsByEx((m) => ({ ...m, [exId]: rows }))
        }
      }
    } finally {
      setBusy(false)
    }
  }

  // preselect from ?ex= (ExerciseDetail CTA)
  useEffect(() => {
    if (exState.status !== 'ready') return
    const q = params.get('ex')
    if (q && getExercise(list, q)) {
      void selectExercise(q)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exState.status, params.get('ex')])

  // ?routine=ID (Home 루틴 카드) — ?ex=와 동시 존재 시 루틴 우선
  useEffect(() => {
    if (exState.status !== 'ready') return
    const q = params.get('routine')
    if (q && Number.isInteger(Number(q))) {
      void loadRoutine(Number(q))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exState.status, params.get('routine')])

  // 앱 재시작 후 마운트 시 진행 중이던 운동 자동 복원 (자동 네비게이션 없음 — keep-alive) StrictMode 이중 마운트 대비 ref 가드
  const sessionRestoreRef = useRef(false)
  useEffect(() => {
    if (sessionRestoreRef.current) return
    sessionRestoreRef.current = true
    if (params.get('routine') || params.get('ex')) return
    void getInProgressWorkout().then((w) => {
      if (!w || w.endedAt != null) return
      void getWorkoutWithSets(w.id).then((data) => {
        if (!data) return
        const d = data
        setWorkout(w)
        setExIds(w.exerciseIds)
        const byEx: Record<string, SetRow[]> = {}
        for (const exId of w.exerciseIds) {
          byEx[exId] = d.sets.filter((s) => s.exerciseId === exId)
        }
        setSetsByEx((m) => ({ ...m, ...byEx }))
        if (w.routineName) {
          void listRoutines().then((rs) => {
            const r = rs.find((x) => x.name === w.routineName)
            if (r) setRoutine(r)
          }).catch(() => undefined)
        }
        const active =
          w.exerciseIds.find((id) => (byEx[id] ?? []).some((s) => !s.done)) ?? w.exerciseIds[0] ?? null
        if (active) {
          setActiveEx(active)
          ensureRest(active)
        }
        void getTimerState(w.id).then((ts) => {
          if (ts.endTime != null || ts.pausedRemaining != null) {
            setTimer(ts)
            setNow(Date.now())
            if (ts.endTime != null && ts.endTime <= Date.now()) beepedRef.current = ts.endTime
          }
        })
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---------- set operations ---------- */
  const rowsOf = (exId: string) => setsByEx[exId] ?? []

  async function addSetRow(exId: string) {
    const rows = rowsOf(exId)
    const last = rows[rows.length - 1]
    const w = await ensureWorkout(exIds)
    const s = await addSet(w.id, exId, rows.length + 1, last ? last.weightKg : 0, last ? last.reps : 8, false, null)
    setSetsByEx((m) => ({ ...m, [exId]: [...rows, { ...s }] }))
  }

  async function patchRow(exId: string, row: SetRow, patch: Partial<SetRow>) {
    const next = { ...row, ...patch }
    setSetsByEx((m) => ({ ...m, [exId]: rowsOf(exId).map((r) => (r.id === row.id ? next : r)) }))
    void updateSet(next)
  }

  async function removeRow(exId: string, row: SetRow) {
    try {
      const db = await getDB()
      await db.delete('sets', row.id)
    } catch {
      /* already gone */
    }
    const rest = rowsOf(exId).filter((r) => r.id !== row.id)
    setSetsByEx((m) => ({ ...m, [exId]: rest }))
  }

  async function toggleDone(exId: string, row: SetRow) {
    const t = Date.now()
    const next = { ...row, done: !row.done, doneAt: row.done ? null : t }
    await updateSet(next)
    setSetsByEx((m) => ({ ...m, [exId]: rowsOf(exId).map((r) => (r.id === row.id ? next : r)) }))
    if (next.done) {
      void setRecent(exId, t)
      const rows = rowsOf(exId)
      const isLast = row.order === rows.length
      if (!isLast) {
        const rest = await getRestSeconds(exId)
        transition(start(rest, t))
      }
    } else {
      transition(IDLE_STATE)
    }
  }

  /* ---------- exercise card ops (add/remove/reorder) ---------- */
  async function reorderTo(id: string, target: number) {
    const cur = exIds.indexOf(id)
    if (cur < 0 || target < 0 || target >= exIds.length || cur === target) return
    const ids = [...exIds]
    ids.splice(cur, 1)
    ids.splice(target, 0, id)
    setExIds(ids)
    await ensureWorkout(ids)
    if (routine) {
      const r = { ...routine, exerciseIds: ids }
      await updateRoutine(r)
      setRoutine(r)
    }
  }

  /* ---------- drag reorder (handle-only, immediate, clamped to list) ---------- */
  function onHandlePointerDown(e: RPointerEvent<HTMLElement>, id: string) {
    if (drag) return
    if (swipe) setSwipe(null)
    swipeGesture.current = null
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const el = cardRefs.current[id]
    if (!el) return
    const r = el.getBoundingClientRect()
    const slots = exIds.map((sid) => {
      const s = cardRefs.current[sid]
      const sr = s?.getBoundingClientRect()
      return { id: sid, top: sr?.top ?? 0, h: sr?.height ?? 0 }
    })
    const gap = slots.length > 1 ? Math.max(0, slots[1].top - slots[0].top - slots[0].h) : 12
    dragBaseline.current = { ids: [...exIds], top: r.top, h: r.height, gap, startY: e.clientY, slots }
    dragTarget.current = exIds.indexOf(id)
    if (navigator.vibrate) navigator.vibrate(10)
    setDrag({ id, dy: 0 })
  }

  function onHandlePointerMove(e: RPointerEvent<HTMLElement>) {
    if (drag == null) return
    const b = dragBaseline.current
    if (!b) return
    const el = cardRefs.current[drag.id]
    if (!el) return
    /* DOM 순서는 그대로, 드래그 카드만 transform으로 추적 */
    let dy = e.clientY - b.startY
    const listEl = el.closest('.wl-cards')
    if (listEl) {
      const lr = listEl.getBoundingClientRect()
      dy = Math.min(lr.bottom - (b.top + b.h), Math.max(lr.top - b.top, dy))
    }
    /* 타깃 슬롯: 손가락 Y가 아닌 드래그 카드 중앙 기준 */
    const center = b.top + dy + b.h / 2
    let target = 0
    for (const s of b.slots) {
      if (s.id !== drag.id && s.top + s.h / 2 < center) target += 1
    }
    dragTarget.current = target
    /* 인접 카드들은 transform으로 부드럽게 비켜줌 (transition: transform .18s) */
    const from = b.ids.indexOf(drag.id)
    const shift: Record<string, number> = {}
    if (from < target) {
      for (let i = from + 1; i <= target; i++) shift[b.ids[i]] = -(b.h + b.gap)
    } else if (from > target) {
      for (let i = target; i < from; i++) shift[b.ids[i]] = b.h + b.gap
    }
    setDrag({ id: drag.id, dy })
    setDragShifts(shift)
  }

  function onHandlePointerEnd(e: RPointerEvent<HTMLElement>) {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* no capture to release */
    }
    const id = drag?.id
    const b = dragBaseline.current
    const from = b && id ? b.ids.indexOf(id) : -1
    const target = dragTarget.current
    dragBaseline.current = null
    /* 커밋 프레임에는 transition을 껐다가 다음 프레임에 복원 (슬라이드백 방지) */
    setCommitting(true)
    setDrag(null)
    setDragShifts({})
    /* 릴리스 시점에 1회만 커밋 (DOM 재배열 + transform 해제 같은 배치) */
    if (id && b && from >= 0 && target !== from) void reorderTo(id, target)
    requestAnimationFrame(() => setCommitting(false))
  }

  /* ---------- swipe-to-delete (edit mode only, Apple-style) ---------- */
  function onCardSwipeDown(e: RPointerEvent<HTMLElement>, id: string) {
    if (drag) return
    if (swipe) setSwipe(null)
    const t = e.target as HTMLElement
    if (t.closest('button, input, textarea, a')) return
    e.currentTarget.setPointerCapture(e.pointerId)
    swipeGesture.current = { id, startX: e.clientX, startY: e.clientY, dx: 0, locked: null }
  }

  function onCardSwipeMove(e: RPointerEvent<HTMLElement>) {
    const g = swipeGesture.current
    if (!g) return
    const dx = e.clientX - g.startX
    const dy = e.clientY - g.startY
    if (g.locked == null) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        g.locked = 'h'
      } else if (Math.abs(dy) > 10) {
        g.locked = 'v'
        swipeGesture.current = null
        return
      } else {
        return
      }
    }
    if (g.locked !== 'h') return
    g.dx = Math.min(0, dx)
    setSwipe({ id: g.id, dx: g.dx, live: true })
  }

  function onCardSwipeUp(e: RPointerEvent<HTMLElement>) {
    const g = swipeGesture.current
    swipeGesture.current = null
    if (!g) return
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* no capture to release */
    }
    if (g.locked !== 'h') {
      setSwipe(null)
      return
    }
    if (g.dx < -56) {
      if (navigator.vibrate) navigator.vibrate(10)
      setSwipe({ id: g.id, dx: -96, live: false })
    } else {
      setSwipe({ id: g.id, dx: 0, live: false })
    }
  }

  /* Explicit two-step delete: tap the exposed red button to actually remove */
  function onSwipeDeleteTap(id: string) {
    if (drag) return
    if (navigator.vibrate) navigator.vibrate(15)
    const el = cardRefs.current[id]
    const width = el ? el.getBoundingClientRect().width : 300
    setSwipe({ id, dx: -(width + 48), live: false })
    window.setTimeout(() => {
      setSwipe(null)
      void removeExercise(id, { confirm: false })
    }, 200)
  }

  async function removeExercise(id: string, opts?: { confirm?: boolean }) {
    const ex = getExercise(list, id)
    if (!ex) return
    if (opts?.confirm !== false && !window.confirm(`"${ex.nameKo}" 카드를 삭제할까요?`)) return
    const ids = exIds.filter((x) => x !== id)
    setExIds(ids)
    if (activeEx === id) setActiveEx(null)
    if (workout) {
      const rows = rowsOf(id)
      if (rows.length > 0) {
        try {
          const db = await getDB()
          for (const r of rows) await db.delete('sets', r.id)
        } catch {
          /* already gone */
        }
      }
    }
    setSetsByEx((m) => {
      const next = { ...m }
      delete next[id]
      return next
    })
    await ensureWorkout(ids)
    if (routine) {
      const r = { ...routine, exerciseIds: ids }
      await updateRoutine(r)
      setRoutine(r)
    }
  }

  // 활성 카드가 화면에 안 보이면 부드럽게 스크롤
  useEffect(() => {
    if (!activeEx) return
    const el = cardRefs.current[activeEx]
    if (!el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' })
  }, [activeEx])

  async function saveNotes(exId: string, text: string) {
    setNotesByEx((m) => ({ ...m, [exId]: text }))
    if (workout) {
      const w = { ...workout, exNotes: { ...workout.exNotes, [exId]: text } }
      await updateWorkout(w)
      setWorkout(w)
    }
  }

  async function finish() {
    if (workout) {
      const w = { ...workout, endedAt: Date.now() }
      await updateWorkout(w)
    }
    transition(IDLE_STATE)
    // keep-alive 컴포넌트이므로 완료 후 세션 상태를 초기화해 다음 루틴/운동에 이전 운동이 섞이지 않게 한다
    setWorkout(null)
    setExIds([])
    setSetsByEx({})
    setNotesByEx({})
    setRoutine(null)
    setActiveEx(null)
    setInfoEx(null)
    setSaveOpen(false)
    setSaveName('')
    setRestDraft({})
    nav('/history', { replace: true })
  }

  /* ---------- render ---------- */
  if (exState.status !== 'ready') {
    const errMsg = exState.status === 'error' ? (exState as { message?: string }).message : null
    return (
      <div className="screen page wl-state">
        <h1 className="page__title wl-state__title">운동 루틴</h1>
        {errMsg ? (
          <>
            <p className="wl-state__msg wl-state__msg--error">
              운동 데이터를 불러오지 못했습니다.
              <span className="wl-state__detail">{errMsg}</span>
            </p>
            <button
              type="button"
              className="wl-state__retry"
              onClick={() => window.location.reload()}
            >
              다시 시도
            </button>
          </>
        ) : (
          <p className="wl-state__msg">
            <span className="wl-state__spinner" aria-hidden="true" />
            운동 데이터를 불러오는 중…
          </p>
        )}
      </div>
    )
  }

  // 검색 + 타겟 부위 AND 조합. 부위 선택만으로도(검색어 없어도) 목록 표시.
  let base = query.trim() ? searchExercises(list, query) : list
  if (muscle) base = filterByMuscle(base, muscle)
  const idle = !query.trim() && !muscle
  const addLimit = idle ? (addExpanded ? 50 : 8) : 30
  const addItems = base.slice(0, addLimit)
  const addHasMore = idle && base.length > addLimit
  const unitLabel = unit === 'lb' ? 'lb' : 'kg'
  const kg = (v: number) => Math.round((v * factor) * 2) / 2
  const toKg = (v: number) => Math.round((v / factor) * 2) / 2

  const sheetExercise = infoEx ? list.find((x) => x.id === infoEx) ?? null : null

  const addSection = (
    <section className={`wl-add${saveOpen ? ' wl-add--top' : ''}`} aria-label="운동 추가">
      <h2 className="wl-add__title">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M8 2.5v11M2.5 8h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        운동 추가
      </h2>
      <label className="wl-add__search">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.8" />
          <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          className="wl-add__input"
          placeholder="운동 검색 (한글/영문)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="운동 검색"
        />
      </label>
      <div className="wl-add__filters" role="group" aria-label="타겟 부위">
        <button
          type="button"
          className={`wl-add__filter${muscle === null ? ' wl-add__filter--on' : ''}`}
          onClick={() => setMuscle(null)}
        >
          전체
        </button>
        {MUSCLE_ORDER.map((m) => (
          <button
            key={m}
            type="button"
            className={`wl-add__filter${muscle === m ? ' wl-add__filter--on' : ''}`}
            onClick={() => setMuscle(muscle === m ? null : m)}
          >
            {MUSCLE_KO[m] ?? m}
          </button>
        ))}
      </div>
      <ul className="wl-add__results">
        {addItems.length === 0 && <li className="state-msg">해당 부위·조건에 맞는 운동이 없습니다.</li>}
        {addItems.map((ex) => {
          const added = exIds.includes(ex.id)
          return (
            <li key={ex.id} className={added ? 'wl-add__item--added' : undefined}>
              <div className="wl-add__row">
                <button
                  type="button"
                  className="wl-add__thumb-btn"
                  aria-label={`${ex.nameKo} 운동 정보`}
                  aria-haspopup="dialog"
                  onClick={() => setInfoEx(ex.id)}
                >
                  <img className="wl-add__thumb" src={exerciseThumb(ex)} alt="" loading="lazy" />
                </button>
                <button type="button" className="wl-add__name-btn" onClick={() => setInfoEx(ex.id)}>
                  <span className="wl-add__name">
                    {ex.nameKo}
                    <span className="wl-add__en">{ex.name}</span>
                  </span>
                </button>
                <button
                  type="button"
                  className={`wl-add__add${added ? ' wl-add__add--done' : ''}`}
                  disabled={added}
                  aria-label={added ? `${ex.nameKo} 추가됨` : `${ex.nameKo} 추가`}
                  onClick={() => {
                    if (!added) void selectExercise(ex.id)
                  }}
                >
                  {added ? (
                    <span className="wl-add__check">추가됨</span>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                      <path d="M9 3.5v11M3.5 9h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  )}
                </button>
              </div>
            </li>
          )
        })}
      </ul>
      {addHasMore && (
        <button type="button" className="wl-add__more" onClick={() => setAddExpanded(true)}>
          더 보기 ({base.length - addItems.length}개)
        </button>
      )}
    </section>
  )

  return (
    <div className={`screen page wl${saveOpen ? ' wl--edit' : ''}`}>
      <header className="wl__head">
        <button
          type="button"
          className="back"
          aria-label="뒤로"
          onClick={() => {
            if (saveOpen) { closeEdit(); return }
            // 직전 화면으로; 심링크/새로고침처럼 이전 항목 없으면 홈으로
            const noPrior =
              window.history.state?.idx === 0 || window.history.length <= 1
            if (noPrior) nav('/', { replace: true })
            else nav(-1)
          }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M12.5 4.5 7 10l5.5 5.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="wl__title" title={routine ? routine.name : undefined}>{routine ? routine.name : '운동 루틴'}</h1>
        <div className="wl__head-actions">
          {!saveOpen && (
            <>
              <button type="button" className="wl__save" onClick={() => openSave()}>
                {routine ? '루틴 수정' : '루틴 저장'}
              </button>
              <button type="button" className="wl__finish" onClick={() => void finish()}>
                운동 완료
              </button>
            </>
          )}
        </div>
      </header>

      {saveOpen && (
        <div className="wl-routine__edit">
          <input
            className="wl-routine__input"
            type="text"
            inputMode="text"
            maxLength={40}
            placeholder="루틴 이름 (예: Day 1)"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void saveRoutine()
            }}
            aria-label="루틴 이름"
          />
          <button type="button" className="wl-routine__btn wl-routine__btn--main" onClick={() => void saveRoutine()} disabled={!saveName.trim()}>
            저장
          </button>
          <button type="button" className="wl-routine__btn" onClick={() => setSaveOpen(false)}>
            취소
          </button>
        </div>
      )}

      {routine && !saveOpen && (
        <div className={`wl-routine ${savedFlash ? 'wl-routine--flash' : ''}`} role="status">
          <span className="wl-routine__label">
            ✓ {routine.name} · {exIds.length}개 운동
          </span>
        </div>
      )}

      {delOpen && routine && (
        <div className="wl-del-overlay" onClick={() => setDelOpen(false)}>
          <div className="wl-del" role="alertdialog" aria-modal="true" aria-label="루틴 삭제 확인" onClick={(e) => e.stopPropagation()}>
            <p className="wl-del__title">루틴 삭제</p>
            <p className="wl-del__msg">{routine.name} 루틴을 삭제합니다. 운동 기록은 보존됩니다.</p>
            <div className="wl-del__actions">
              <button type="button" className="wl-del__btn" onClick={() => setDelOpen(false)}>
                취소
              </button>
              <button type="button" className="wl-del__btn wl-del__btn--danger" onClick={() => void confirmDeleteRoutine()}>
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {st !== 'idle' && <RestTimer timer={timer} onAction={handleTimerAction} />}

      {saveOpen && addSection}

      <section className="wl-cards" aria-label="운동 목록">
        {exIds.length === 0 && <p className="state-msg">운동 추가를 시작하세요.</p>}
        {exIds.map((id) => {
          const ex = getExercise(list, id)
          if (!ex) return null
          const rows = rowsOf(id)
          const doneN = rows.filter((r) => r.done).length
          const open = activeEx === id
          const alts = open ? substitutesFor(list, ex, 6) : []
          const dragDy = drag?.id === id ? drag.dy : 0
          const shiftY = dragShifts[id] ?? 0
          const swipeDx = swipe?.id === id ? swipe.dx : 0
          const swipeLive = swipe?.id === id && swipe.live
          return (
            <div key={id} className="wl-swipe">
              {saveOpen && drag == null && (
                <button
                  type="button"
                  className="wl-swipe__del"
                  aria-label="운동 카드 삭제"
                  onClick={() => onSwipeDeleteTap(id)}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  삭제
                </button>
              )}
              <article
                data-ex-id={id}
                ref={(el) => { cardRefs.current[id] = el }}
                className={`wl-card ${open ? 'wl-card--open' : ''}${drag?.id === id ? ' wl-card--drag' : ''}${swipeLive ? ' wl-card--swipe' : ''}`}
                style={dragDy !== 0 || swipeDx !== 0 || shiftY !== 0 ? { transform: `translate(${swipeDx}px, ${dragDy + shiftY}px)`, ...(committing ? { transition: 'none' as const } : {}) } : committing ? { transition: 'none' as const } : undefined}
                onPointerDown={saveOpen ? (e) => onCardSwipeDown(e, id) : undefined}
                onPointerMove={saveOpen ? onCardSwipeMove : undefined}
                onPointerUp={saveOpen ? onCardSwipeUp : undefined}
                onPointerCancel={saveOpen ? onCardSwipeUp : undefined}
              >
              <div
                className="wl-card__head"
                role={saveOpen ? undefined : 'button'}
                tabIndex={saveOpen ? undefined : 0}
                aria-expanded={saveOpen ? undefined : open}
                onClick={saveOpen ? undefined : () => openCard(id)}
                onKeyDown={
                  saveOpen
                    ? undefined
                    : (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          openCard(id)
                        }
                      }
                }
              >
                {saveOpen ? (
                  <img className="wl-card__thumb" src={exerciseThumb(ex)} alt="" loading="lazy" />
                ) : (
                  <button
                    type="button"
                    className="wl-card__thumb-btn"
                    aria-label={`${ex.nameKo} 운동 정보`}
                    aria-haspopup="dialog"
                    onClick={(e) => {
                      e.stopPropagation()
                      setInfoEx(id)
                    }}
                  >
                    <img className="wl-card__thumb" src={exerciseThumb(ex)} alt="" loading="lazy" />
                  </button>
                )}
                <div className="wl-card__info">
                  <span className="wl-card__name">{ex.nameKo}</span>
                  <span className="wl-card__meta">
                    {ex.name} · {ex.muscles.primary.map((m) => MUSCLE_KO[m] ?? m).join(' ')}
                  </span>
                </div>
                {saveOpen ? (
                  <button
                    type="button"
                    className={`wl-card__handle${swipeDx < 0 ? ' wl-card__handle--hide' : ''}`}
                    aria-label={`${ex.nameKo} 순서 변경`}
                    title="누른 채로 드래그"
                    onPointerDown={(e) => onHandlePointerDown(e, id)}
                    onPointerMove={onHandlePointerMove}
                    onPointerUp={onHandlePointerEnd}
                    onPointerCancel={onHandlePointerEnd}
                  >
                    <svg width="18" height="14" viewBox="0 0 18 14" fill="none" aria-hidden="true">
                      <path d="M1 1.5h16M1 7h16M1 12.5h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </button>
                ) : (
                  <span className={`wl-card__prog num ${doneN > 0 && doneN === rows.length ? 'wl-card__prog--full' : ''}`}>
                    {doneN}/{rows.length}
                  </span>
                )}
              </div>
              {!saveOpen && (
              <div className={`wl-card__body ${st === 'running' || st === 'paused' ? 'wl-card__body--resting' : ''} ${st === 'done' ? 'wl-card__body--ready' : ''}`}>
                <div className="wl-card__inner">
                  {alts.length > 0 && (
                    <div className="wl-alt" role="list" aria-label={`${ex.nameKo} 대체 운동`}>
                      {alts.map((s) => {
                        const added = exIds.includes(s.id)
                        return (
                          <button
                            key={s.id}
                            type="button"
                            role="listitem"
                            className={`wl-alt__item ${added ? 'wl-alt__item--on' : ''}`}
                            aria-disabled={added}
                            onClick={() => {
                              if (!added) void selectExercise(s.id)
                            }}
                          >
                            <img className="wl-alt__thumb" src={exerciseThumb(s)} alt="" loading="lazy" />
                            <span className="wl-alt__name">{s.nameKo}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                  <div className="wl-rest" role="group" aria-label="운동별 휴식 시간">
                    <label className="wl-rest__label" htmlFor={`rest-${id}`}>휴식</label>
                    <input
                      id={`rest-${id}`}
                      className="wl-rest__input num"
                      type="number"
                      inputMode="numeric"
                      min={5}
                      max={600}
                      step={1}
                      value={restDraft[id] ?? String(restOf(id))}
                      onChange={(e) => setRestDraft((m) => ({ ...m, [id]: e.target.value }))}
                      onBlur={() => {
                        const raw = restDraft[id]
                        if (raw != null && raw.trim() !== '') {
                          const v = Number(raw)
                          if (Number.isFinite(v)) setRestTo(id, v)
                        }
                        setRestDraft((m) => {
                          if (!(id in m)) return m
                          const next = { ...m }
                          delete next[id]
                          return next
                        })
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                      }}
                    />
                    <span className="wl-rest__unit">초</span>
                  </div>
                  <div className="wl-sets">
                    {rows.map((row) => (
                      <div key={row.id} className={`wl-set ${row.done ? 'wl-set--done' : ''}`}>
                        <span className="wl-set__no num">{row.order}</span>
                        <label className="wl-set__cell">
                          <input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step={0.5}
                            value={row.weightKg === 0 ? '' : kg(row.weightKg)}
                            placeholder="0"
                            aria-label="중량"
                            onChange={(e) => {
                              const v = parseFloat(e.target.value)
                              void patchRow(id, row, { weightKg: Number.isFinite(v) && v >= 0 ? toKg(v) : 0 })
                            }}
                          />
                          <span className="wl-set__u">{unitLabel}</span>
                        </label>
                        <label className="wl-set__cell">
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            step={1}
                            value={row.reps === 0 ? '' : row.reps}
                            placeholder="0"
                            aria-label="반복 횟수"
                            onChange={(e) => {
                              const v = parseInt(e.target.value, 10)
                              void patchRow(id, row, { reps: Number.isFinite(v) && v >= 0 ? v : 0 })
                            }}
                          />
                          <span className="wl-set__u">회</span>
                        </label>
                        <button
                          type="button"
                          className={`wl-set__done ${row.done ? 'wl-set__done--on' : ''}`}
                          onClick={() => void toggleDone(id, row)}
                          aria-pressed={row.done}
                        >
                          {row.done ? '완료 ✓' : '완료'}
                        </button>
                        <button type="button" className="wl-set__del" onClick={() => void removeRow(id, row)} aria-label="세트 삭제">
                          ×
                        </button>
                      </div>
                    ))}
                    {rows.length === 0 && <p className="state-msg">첫 세트를 추가하세요.</p>}
                    <button type="button" className="wl-addset" onClick={() => void addSetRow(id)} disabled={busy}>
                      + 세트
                    </button>
                  </div>
                  <textarea
                    className="wl-card__note"
                    placeholder="메모 (이 운동 관련)"
                    value={notesByEx[id] ?? ''}
                    onChange={(e) => void saveNotes(id, e.target.value)}
                    rows={2}
                  />
                  {rows.length > 1 && <p className="wl-card__hint">마지막 세트 완료 시 자동 타이머는 시작되지 않습니다.</p>}
                </div>
              </div>
              )}
            </article>
            </div>
          )
        })}
      </section>

      {saveOpen && routine && (
        <button type="button" className="wl-edit-del" onClick={() => openDeleteConfirm()} aria-label="루틴 삭제">
          루틴 삭제
        </button>
      )}

      {!saveOpen && addSection}
      {sheetExercise && <ExerciseSheet exercise={sheetExercise} onClose={() => setInfoEx(null)} />}
    </div>
  )
}
