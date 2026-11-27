import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useExercises } from '../data/useExercises'
import { getExercise, exerciseThumb } from '../data/exerciseRepo'
import type { Exercise } from '../data/exerciseRepo'
import {
  listFavorites,
  listWorkouts,
  listSetsByWorkouts,
  listRoutines,
  getInProgressWorkout,
  getWorkoutWithSets,
} from '../data/db'
import type { Routine } from '../data/db'
import './home.css'

type Item = { id: string; ex?: Exercise }

function startOfWeek(d: Date): Date {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const day = c.getDay() // 0 = Sun
  c.setDate(c.getDate() - day)
  return c
}

export default function Home() {
  const { pathname } = useLocation()
  const exState = useExercises()
  const [favIds, setFavIds] = useState<string[] | null>(null)
  const [routines, setRoutines] = useState<Routine[] | null>(null)
  const [week, setWeek] = useState<{ count: number; sets: number; kg: number } | null>(null)
  const [progress, setProgress] = useState<{ name: string; done: number; total: number } | null>(null)

  const exList = exState.status === 'ready' ? exState.list : []

  useEffect(() => {
    if (pathname !== '/') return
    let alive = true
    listFavorites()
      .then((f) => {
        if (alive) setFavIds(f.map((x) => x.exerciseId))
      })
      .catch(() => {
        if (alive) setFavIds([])
      })
    return () => {
      alive = false
    }
  }, [pathname])

  useEffect(() => {
    if (pathname !== '/') return
    let alive = true
    listRoutines()
      .then((rs) => {
        if (alive) setRoutines(rs)
      })
      .catch(() => {
        if (alive) setRoutines([])
      })
    return () => {
      alive = false
    }
  }, [pathname])

  useEffect(() => {
    if (pathname !== '/') return
    let alive = true
    listWorkouts()
      .then(async (ws) => {
        const start = startOfWeek(new Date()).getTime()
        const thisWeek = ws.filter((w) => w.startedAt >= start)
        // N+1 방지: 이번 주 모든 세트를 단일 트랜잭션으로 일괄 조회
        const setMap = await listSetsByWorkouts(thisWeek.map((w) => w.id))
        if (!alive) return
        setWeek({
          count: thisWeek.length,
          sets: thisWeek.reduce(
            (n, w) => n + (setMap.get(w.id) ?? []).filter((s) => s.done).length,
            0,
          ),
          kg: thisWeek.reduce(
            (n, w) =>
              n +
              (setMap.get(w.id) ?? []).reduce((m, s) => m + (s.done ? s.weightKg * s.reps : 0), 0),
            0,
          ),
        })
      })
      .catch(() => {
        if (alive) setWeek({ count: 0, sets: 0, kg: 0 })
      })
    return () => {
      alive = false
    }
  }, [pathname])

  // 진행 중 운동 세션이 있으면 루틴 카드에 배지 표시
  useEffect(() => {
    if (pathname !== '/') return
    let alive = true
    getInProgressWorkout()
      .then(async (w) => {
        if (!alive) return
        if (!w || w.endedAt != null || !w.routineName) {
          setProgress(null)
          return
        }
        const d = await getWorkoutWithSets(w.id)
        if (!alive) return
        if (!d) {
          setProgress(null)
          return
        }
        setProgress({
          name: w.routineName,
          done: d.sets.filter((s) => s.done).length,
          total: d.sets.length,
        })
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [pathname])

  const toItems = (ids: string[] | null): Item[] | null =>
    ids === null
      ? null
      : ids
          .map((id) => ({ id, ex: exState.status === 'ready' ? getExercise(exList, id) : undefined }))
          .filter((it) => it.ex !== undefined)

  const favs = toItems(favIds)

  const dateStr = new Date().toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })

  const renderRow = (items: Item[]) => (
    <div className="home__row">
      {items.map(({ id, ex }) => (
        <Link key={id} to={`/exercise/${id}`} className="home__item">
          {ex && exerciseThumb(ex) && (
            <img
              className="home__thumb"
              src={exerciseThumb(ex)}
              alt={ex.nameKo ?? ex.name}
              loading="lazy"
            />
          )}
          <span className="home__name">{ex?.nameKo ?? ex?.name ?? id}</span>
        </Link>
      ))}
    </div>
  )

  return (
    <div className="page home">
      <header className="home__head">
        <h1 className="page__title">REP</h1>
        <p className="home__date">{dateStr}</p>
      </header>

      {routines && routines.length > 0 && (
        <section className="home__routines" aria-label="저장된 루틴">
          {routines.map((r) => (
            <Link key={r.id} to={`/log?routine=${r.id}`} className="home__routine">
              <span className="home__routine__name">{r.name}</span>
              <span className="home__routine__meta">
                {r.exerciseIds.length > 0 ? `${r.exerciseIds.length}개 운동` : '운동 없음'}
              </span>
              {progress && progress.name === r.name && (
                <span className="home__routine__badge">
                  {progress.done}/{progress.total} 세트 진행 중
                </span>
              )}
            </Link>
          ))}
        </section>
      )}

      <Link to="/log" className="cta home__cta">
        루틴 만들기
      </Link>

      <section className="section">
        <p className="section__title">이번 주</p>
        {week === null ? (
          <p className="state-msg">불러오는 중…</p>
        ) : (
          <>
            <div className="home__stats">
              <div className="home__stat">
                <span className="num home__stat-n">{week.count}</span>
                <span className="home__stat-l">회</span>
              </div>
              <div className="home__stat">
                <span className="num home__stat-n">{week.sets}</span>
                <span className="home__stat-l">세트</span>
              </div>
              <div className="home__stat">
                <span className="num home__stat-n">{Math.round(week.kg)}</span>
                <span className="home__stat-l">kg</span>
              </div>
            </div>
            {week.count === 0 && <p className="hint">이번 주 아직 기록이 없습니다.</p>}
          </>
        )}
      </section>

      {favs && favs.length > 0 && (
        <section className="section">
          <p className="section__title">즐겨찾기</p>
          {renderRow(favs)}
        </section>
      )}

    </div>
  )
}
