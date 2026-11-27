import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useExercises } from '../data/useExercises'
import { getExercise, exerciseThumb, substitutesFor, type Exercise } from '../data/exerciseRepo'
import {
  MUSCLE_KO,
  EQUIPMENT_KO,
  LEVEL_KO,
  PATTERN_KO,
  CATEGORY_KO,
} from '../data/labels'
import { tipsForPattern } from '../data/howto'
import { MuscleMap } from '../components/MuscleMap'
import { isFavorite, toggleFavorite } from '../data/db'
import './exercise-detail.css'

export default function ExerciseDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const state = useExercises()
  const ex =
    state.status === 'ready' && id ? getExercise(state.list, id) : undefined
  const list = state.status === 'ready' ? state.list : []

  return (
    <div className="screen page">
      <button
        type="button"
        className="back"
        aria-label="뒤로"
        onClick={() => {
          // 직전 화면으로; 심링크/새로고침처럼 이전 항목 없으면 홈으로
          const noPrior =
            window.history.state?.idx === 0 || window.history.length <= 1
          if (noPrior) navigate('/', { replace: true })
          else navigate(-1)
        }}
      >
        ← 뒤로
      </button>

      {state.status === 'loading' && <p className="state-msg">로딩 중…</p>}
      {state.status === 'error' && (
        <p className="state-msg state-msg--err">
          운동 데이터를 불러올 수 없습니다. ({state.message})
        </p>
      )}
      {state.status === 'ready' && !ex && (
        <p className="state-msg">운동을 찾을 수 없습니다.</p>
      )}
      {ex && (
        <DetailBody
          key={ex.id}
          ex={ex}
          list={list}
          onLog={() => navigate(`/log?ex=${ex.id}`)}
        />
      )}
    </div>
  )
}

function DetailBody({ ex, list, onLog }: { ex: Exercise; list: Exercise[]; onLog: () => void }) {
  const [fav, setFav] = useState(false)
  const [showEnd, setShowEnd] = useState(false)

  useEffect(() => {
    isFavorite(ex.id).then(setFav)
  }, [ex.id])

  // start/end 프레임 교차 (reduced-motion이면 첫 프레임 고정)
  useEffect(() => {
    if (!ex.images.end) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = window.setInterval(() => setShowEnd((v) => !v), 1250)
    return () => window.clearInterval(t)
  }, [ex.images.end, ex.id])

  const primary = ex.muscles.primary.map((m) => MUSCLE_KO[m] ?? m)
  const secondary = ex.muscles.secondary.map((m) => MUSCLE_KO[m] ?? m)
  const tips = tipsForPattern(ex.movementPattern)
  const alts = substitutesFor(list, ex, 6)

  return (
    <>
      <div className="ed-media">
        <img
          className="ed-media__img"
          src={exerciseThumb(ex)}
          alt={ex.nameKo}
          width={320}
          height={240}
        />
        {ex.images.end && (
          <img
            className={`ed-media__img ed-media__img--end ${showEnd ? 'is-on' : ''}`}
            src={ex.images.end}
            alt=""
            width={320}
            height={240}
          />
        )}
        <button
          type="button"
          className={`ed-fav ${fav ? 'is-on' : ''}`}
          aria-pressed={fav}
          aria-label={fav ? '즐겨찾기 해제' : '즐겨찾기 추가'}
          onClick={() => toggleFavorite(ex.id).then(setFav)}
        >
          {fav ? '★' : '☆'}
        </button>
      </div>

      <header>
        <h1 className="ed-name">{ex.nameKo}</h1>
        <p className="ed-name-en">{ex.name}</p>
      </header>

      <button type="button" className="cta ed-cta" onClick={onLog}>
        운동 시작
      </button>

      <div className="ed-body">
        <section className="ed-sec" aria-label="정보">
            <h2 className="ed-sec__title">정보</h2>
            <ul className="ed-specs">
              <li>
                <span className="ed-specs__k">장비</span>
                <span className="ed-specs__v">{EQUIPMENT_KO[ex.equipment[0]] ?? ex.equipmentLabel}</span>
              </li>
              <li>
                <span className="ed-specs__k">패턴</span>
                <span className="ed-specs__v">{PATTERN_KO[ex.movementPattern] ?? ex.movementPattern}</span>
              </li>
              <li>
                <span className="ed-specs__k">난이도</span>
                <span className="ed-specs__v">{LEVEL_KO[ex.level] ?? ex.level}</span>
              </li>
              <li>
                <span className="ed-specs__k">분류</span>
                <span className="ed-specs__v">{CATEGORY_KO[ex.category] ?? ex.category}</span>
              </li>
              <li>
                <span className="ed-specs__k">근육</span>
                <span className="ed-specs__v">
                  {primary.length > 0 && <>주요 {primary.join(', ')}</>}
                  {primary.length > 0 && secondary.length > 0 && ' · '}
                  {secondary.length > 0 && <>보조 {secondary.join(', ')}</>}
                  {primary.length === 0 && secondary.length === 0 && '—'}
                </span>
              </li>
            </ul>
          </section>

        <section className="ed-sec" aria-label="근육">
            <h2 className="ed-sec__title">근육</h2>
            <MuscleMap
              primary={ex.muscles.primary}
              secondary={ex.muscles.secondary}
              alsoTargets={ex.muscles.alsoTargets}
            />
          </section>

        <section className="ed-sec" aria-label="수행 팁">
            <h2 className="ed-sec__title">수행 팁 · {PATTERN_KO[ex.movementPattern] ?? ex.movementPattern}</h2>
            <ol className="ed-tips">
              {tips.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ol>
            <p className="ed-tips__note">이동 패턴 기준 일반적인 팁입니다. 통증이 있으면 멈추세요.</p>
          </section>

          {alts.length > 0 && (
            <section className="ed-sec ed-alt" aria-label="대체 운동">
              <h2 className="ed-sec__title">대체 운동 · 같은 부위</h2>
              <ul className="ed-alt__list">
                {alts.map((s) => (
                  <li key={s.id}>
                    <Link to={`/exercise/${s.id}`} className="ed-alt__item">
                      <img
                        className="ed-alt__img"
                        src={exerciseThumb(s)}
                        alt=""
                        width={56}
                        height={42}
                        loading="lazy"
                      />
                      <span className="ed-alt__ko">{s.nameKo}</span>
                      <span className="ed-alt__en">{s.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
      </div>
    </>
  )
}
