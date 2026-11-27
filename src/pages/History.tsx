import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  deleteWorkout,
  getSettings,
  getWorkoutWithSets,
  listWorkouts,
  type Workout,
  type WorkoutSet,
} from '../data/db'
import { loadExercises, getExercise } from '../data/exerciseRepo'
import type { Exercise } from '../data/exerciseRepo'
import './pages.css'
import './history.css'

const dateFmt = new Intl.DateTimeFormat('ko-KR', {
  month: 'short',
  day: 'numeric',
  weekday: 'short',
})
const timeFmt = new Intl.DateTimeFormat('ko-KR', {
  hour: 'numeric',
  minute: '2-digit',
})

function fmtKg(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

interface Detail {
  workout: Workout
  sets: WorkoutSet[]
  exs: Exercise[]
  prs: Set<string>
}

export default function History() {
  const { pathname } = useLocation()
  const [workouts, setWorkouts] = useState<Workout[] | null>(null)
  const [exList, setExList] = useState<Exercise[] | null>(null)
  const [unit, setUnit] = useState<'kg' | 'lb'>('kg')
  const [err, setErr] = useState('')
  const [detail, setDetail] = useState<Detail | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (pathname !== '/history') return
    let live = true
    void Promise.all([listWorkouts(), loadExercises(), getSettings()])
      .then(([w, e, s]) => {
        if (!live) return
        setWorkouts(w)
        setExList(e)
        setUnit(s.unit)
      })
      .catch((e) => {
        if (live) setErr(String(e))
      })
    return () => {
      live = false
    }
  }, [pathname])

  // 주간 요약 (이번 주 일요일 기준 — Home과 동일)
  const week = useMemo(() => {
    if (!workouts) return null
    const now = Date.now()
    const d = new Date(now)
    const day = d.getDay() // 일=0
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day)
    const inWeek = workouts.filter((w) => w.startedAt >= start.getTime())
    return {
      count: inWeek.length,
      sets: inWeek.reduce((acc, w) => acc + w.exerciseIds.length, 0),
    }
  }, [workouts])

  const nameOf = useCallback(
    (id: string) => {
      if (!exList) return id
      const e = getExercise(exList, id)
      return e?.nameKo ?? e?.name ?? id
    },
    [exList],
  )

  const openDetail = useCallback(
    async (id: number) => {
      const w = await getWorkoutWithSets(id)
      if (!w) return
      const list = await loadExercises()
      const exs = w.workout.exerciseIds
        .map((e) => getExercise(list, e))
        .filter((e): e is Exercise => Boolean(e))
      // PR: 다른 기록의 같은 운동 최대 중량과 비교
      const prs = new Set<string>()
      const others = (await listWorkouts()).filter((o) => o.id !== id)
      for (const ex of exs) {
        const exId = ex.id
        const here = w.sets
          .filter((s) => s.exerciseId === exId && s.weightKg > 0)
          .reduce((m, s) => Math.max(m, s.weightKg), 0)
        if (!here) continue
        let best = 0
        for (const o of others) {
          if (!o.exerciseIds.includes(exId)) continue
          const ow = await getWorkoutWithSets(o.id)
          if (!ow) continue
          for (const s of ow.sets) {
            if (s.exerciseId === exId && s.weightKg > best) best = s.weightKg
          }
        }
        if (here > best) prs.add(exId)
      }
      setDetail({ workout: w.workout, sets: w.sets, exs, prs })
    },
    [],
  )

  const remove = useCallback(
    async (id: number) => {
      if (busy) return
      setBusy(true)
      try {
        await deleteWorkout(id)
        setDetail(null)
        setWorkouts(await listWorkouts())
      } finally {
        setBusy(false)
      }
    },
    [busy],
  )

  if (err) return <div className="page state-msg state-msg--err">{err}</div>

  if (detail) {
    const { workout, sets, exs, prs } = detail
    const factor = unit === 'lb' ? 2.20462 : 1
    const disp = (kg: number) => (unit === 'lb' ? Math.round(kg * factor * 2) / 2 : kg)
    const volume = sets.reduce((a, s) => a + disp(s.weightKg) * s.reps, 0)
    const done = sets.filter((s) => s.done).length
    const dur = workout.endedAt
      ? Math.max(1, Math.round((workout.endedAt - workout.startedAt) / 60000))
      : null
    return (
      <div className="page h">
        <div className="h__head">
          <button type="button" className="h__back" onClick={() => setDetail(null)}>
            ← 기록
          </button>
          <span className="h__date">
            {dateFmt.format(workout.startedAt)} {timeFmt.format(workout.startedAt)}
          </span>
        </div>

        <div className="h__stats">
          <div className="h__stat">
            <span className="h__stat-n num">{exs.length}</span>
            <span className="h__stat-l">운동</span>
          </div>
          <div className="h__stat">
            <span className="h__stat-n num">{sets.length}</span>
            <span className="h__stat-l">세트</span>
          </div>
          <div className="h__stat">
            <span className="h__stat-n num">{fmtKg(volume)}</span>
            <span className="h__stat-l">{unit} 볼륨</span>
          </div>
          <div className="h__stat">
            <span className="h__stat-n num">{dur == null ? '—' : dur}</span>
            <span className="h__stat-l">분</span>
          </div>
        </div>

        <p className="h__meta">
          완료 {done}/{sets.length} 세트
        </p>

        <div className="h__exs">
          {exs.map((ex, i) => {
            const rows = sets.filter((s) => s.exerciseId === ex.id)
            return (
              <section key={ex.id} className="h__ex" aria-label={ex.nameKo}>
                <header className="h__ex-head">
                  <h2 className="h__ex-name">
                    {i + 1}. {ex.nameKo}
                    {prs.has(ex.id) && <span className="h__pr">PR</span>}
                  </h2>
                  <span className="h__ex-sub num">{fmtKg(disp(rows.reduce((a, s) => Math.max(a, s.weightKg), 0)))}{unit}</span>
                </header>
                <ul className="h__sets">
                  {rows.map((s) => (
                    <li key={s.id} className={`h__set${s.done ? ' h__set--done' : ''}`}>
                      <span className="h__set-no num">{s.order}</span>
                      <span className="h__set-v num">
                        {fmtKg(disp(s.weightKg))}{unit} × {s.reps}
                      </span>
                      <span className="h__set-mark">{s.done ? '✓' : ''}</span>
                    </li>
                  ))}
                </ul>
                {workout.exNotes?.[ex.id] ? (
                  <p className="h__note">{workout.exNotes[ex.id]}</p>
                ) : null}
              </section>
            )
          })}
        </div>

        {workout.notes ? <p className="h__note h__note--all">메모: {workout.notes}</p> : null}

        <button
          type="button"
          className="h__del"
          disabled={busy}
          onClick={() => {
            if (window.confirm('이 기록을 삭제할까요? 되돌릴 수 없습니다.')) void remove(workout.id)
          }}
        >
          삭제
        </button>
      </div>
    )
  }

  if (!workouts || !exList) return <div className="page state-msg">불러오는 중…</div>

  return (
    <div className="page">
      <div>
        <h1 className="page__title">기록</h1>
        <p className="page__sub">
          {week && week.count > 0 ? `이번 주 ${week.count}회 운동` : '이전 운동 세션'}
        </p>
      </div>

      {workouts.length === 0 ? (
        <div className="section">
          <p className="empty" style={{ padding: 'var(--sp-6)' }}>
            아직 기록이 없습니다. 첫 세트를 시작해 보세요.
          </p>
        </div>
      ) : (
        <ol className="h-list">
          {workouts.map((w) => (
            <li key={w.id}>
              <button
                type="button"
                className="h-item"
                onClick={() => void openDetail(w.id)}
              >
                <span className="h-item__date">
                  {dateFmt.format(w.startedAt)} {timeFmt.format(w.startedAt)}
                </span>
                <span className="h-item__names">
                  {w.exerciseIds.slice(0, 3).map((id) => nameOf(id)).join(' · ')}
                  {w.exerciseIds.length > 3 ? ` 외 ${w.exerciseIds.length - 3}개` : ''}
                </span>
                <span className="h-item__n">
                  {w.routineName ?? <span className="num">{w.exerciseIds.length}운동</span>}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
