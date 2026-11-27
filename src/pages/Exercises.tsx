import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useExercises } from '../data/useExercises'
import {
  searchExercises,
  filterByMuscle,
  filterByType,
  exerciseThumb,
  type Exercise,
  type ExerciseType,
} from '../data/exerciseRepo'
import { MUSCLE_KO, MUSCLE_ORDER, TYPE_FILTERS } from '../data/labels'
import './exercises.css'

export default function Exercises() {
  const state = useExercises()
  const [query, setQuery] = useState('')
  const [muscle, setMuscle] = useState<string | null>(null)
  const [type, setType] = useState<ExerciseType>('all')

  const list = state.status === 'ready' ? state.list : null

  const results = useMemo(() => {
    if (!list) return null
    let r = filterByType(list, type)
    r = searchExercises(r, query)
    if (muscle) r = filterByMuscle(r, muscle)
    return r
  }, [list, type, query, muscle])

  const toggleMuscle = (m: string) => setMuscle((cur) => (cur === m ? null : m))

  return (
    <div className="page">
      <h1 className="page__title">운동</h1>

      {/* 검색 — iOS: 16px 폰트, 44px+ 탭 영역 */}
      <input
        className="ex-search"
        type="search"
        inputMode="search"
        enterKeyHint="search"
        placeholder="운동 이름 검색 (국문/영문)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="운동 검색"
      />

      {/* 유형 필터 — 전체/기구/맨몸 세그먼트 (iOS: 3분할, 동시 탭 1회) */}
      <div className="type-chips" role="radiogroup" aria-label="운동 유형 필터">
        {TYPE_FILTERS.map((t) => (
          <button
            key={t.value}
            type="button"
            role="radio"
            aria-checked={type === t.value}
            className={`chip type-chips__chip ${type === t.value ? 'chip--on' : ''}`}
            onClick={() => setType(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 근육 필터 칩 — 가로 스크롤 */}
      <div className="chips" role="listbox" aria-label="근육 필터">
        {MUSCLE_ORDER.map((m) => (
          <button
            key={m}
            type="button"
            role="option"
            aria-selected={muscle === m}
            className={`chip ${muscle === m ? 'chip--on' : ''}`}
            onClick={() => toggleMuscle(m)}
          >
            {MUSCLE_KO[m] ?? m}
          </button>
        ))}
      </div>

      {state.status === 'loading' && <p className="state-msg">로딩 중…</p>}
      {state.status === 'error' && (
        <p className="state-msg state-msg--err">운동 데이터를 불러올 수 없습니다. ({state.message})</p>
      )}

      {results && (
        <>
          <p className="ex-count">
            {results.length}개 운동
            {type !== 'all' ? ` · ${TYPE_FILTERS.find((t) => t.value === type)!.label}` : ''}
            {muscle ? ` · ${MUSCLE_KO[muscle] ?? muscle}` : ''}
          </p>
          <ol className="ex-list">
            {results.map((ex) => (
              <ExerciseRow key={ex.id} ex={ex} />
            ))}
          </ol>
          {results.length === 0 && (
            <p className="state-msg">
              {query || muscle || type !== 'all'
                ? '해당 조건에 맞는 운동이 없습니다. 필터를 해제해 보세요.'
                : '검색 결과가 없습니다.'}
            </p>
          )}
        </>
      )}
    </div>
  )
}

function ExerciseRow({ ex }: { ex: Exercise }) {
  const primary = ex.muscles.primary[0]
  return (
    <li>
      <Link className="ex-row" to={`/exercise/${ex.id}`}>
        <img
          className="ex-row__img"
          src={exerciseThumb(ex)}
          alt=""
          width={56}
          height={56}
          loading="lazy"
        />
        <span className="ex-row__body">
          <span className="ex-row__name">{ex.nameKo}</span>
          <span className="ex-row__sub">{ex.name}</span>
        </span>
        {primary && <span className="ex-row__tag">{MUSCLE_KO[primary] ?? primary}</span>}
      </Link>
    </li>
  )
}
