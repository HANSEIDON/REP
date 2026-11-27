import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { Exercise } from '../data/exerciseRepo'
import { exerciseThumb } from '../data/exerciseRepo'
import { patternLabel, tipsForPattern } from '../data/howto'
import { LEVEL_KO, MUSCLE_KO } from '../data/labels'

type Props = {
  exercise: Exercise
  onClose: () => void
}

type Snap = 'expanded' | 'collapsed'

type Sample = { t: number; y: number }

export default function ExerciseSheet({ exercise, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  const [height, setHeight] = useState(0)
  const [dragging, setDragging] = useState(false)

  const snapRef = useRef<Snap>('collapsed')
  const closingRef = useRef(false)
  const tyRef = useRef(0)
  const geoRef = useRef({ expandedH: 0, collapsedH: 0 })
  const dragRef = useRef({ startY: 0, startTy: 0, samples: [] as Sample[] })
  const closeTimerRef = useRef(0)
  const maxMoveRef = useRef(0)
  const dragStartT = useRef(0)

  // 손가락 1:1 추적: transform을 ref로 DOM에 직접 쓰기 (재렌더가 위치를 덮어쓰지 못하게 함)
  const setTransform = (px: number) => {
    if (panelRef.current) panelRef.current.style.transform = `translate3d(0, ${px}px, 0)`
  }

  const measure = useCallback(() => {
    const vh = window.innerHeight
    const expandedH = Math.round(vh * 0.92)
    const natural = bodyRef.current?.scrollHeight ?? 0
    const collapsedH = Math.max(240, Math.min(natural, Math.round(vh * 0.6)))
    geoRef.current = { expandedH, collapsedH }
    return { expandedH, collapsedH }
  }, [])

  const applySnap = useCallback((g: { expandedH: number; collapsedH: number }, s: Snap) => {
    snapRef.current = s
    const ty = s === 'expanded' ? 0 : g.expandedH - g.collapsedH
    tyRef.current = ty // ref가 transform의 진실 출처 — 반드시 동기화 (첫 드래그 startTy가 stale해지면 순간이동)
    setHeight(s === 'expanded' ? g.expandedH : g.collapsedH)
    if (panelRef.current) panelRef.current.style.transform = `translate3d(0, ${ty}px, 0)`
  }, [])

  const expandNow = useCallback(() => {
    if (closingRef.current || snapRef.current === 'expanded') return
    applySnap(geoRef.current, 'expanded')
  }, [applySnap])

  const close = useCallback(() => {
    if (closingRef.current) return
    closingRef.current = true
    flushSync(() => setDragging(false))
    tyRef.current = geoRef.current.expandedH + 16
    if (panelRef.current) panelRef.current.style.transform = `translate3d(0, ${geoRef.current.expandedH + 16}px, 0)`
    closeTimerRef.current = window.setTimeout(onClose, 340)
  }, [onClose])

  // enter animation + body scroll lock + resize tracking + focus restore
  useLayoutEffect(() => {
    const g = measure()
    setHeight(g.collapsedH)
    tyRef.current = g.expandedH + 16
    setTransform(g.expandedH + 16)

    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const prevFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panelRef.current?.focus({ preventScroll: true })

    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setReady(true)
        applySnap(g, 'collapsed')
      })
    })

    const ro = new ResizeObserver(() => {
      if (closingRef.current || dragRef.current.samples.length > 0) return
      const ng = measure()
      applySnap(ng, snapRef.current)
    })
    if (bodyRef.current) ro.observe(bodyRef.current)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      document.body.style.overflow = prevOverflow
      window.clearTimeout(closeTimerRef.current)
      prevFocus?.focus({ preventScroll: true })
    }
  }, [measure, applySnap])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (closingRef.current) return
    // iOS: preventDefault는 click을 억제하므로 호출 금지 (touch-action: none이 제스처를 잠근다)
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      startY: e.clientY,
      startTy: tyRef.current,
      samples: [{ t: performance.now(), y: e.clientY }],
    }
    maxMoveRef.current = 0
    dragStartT.current = performance.now()
    setDragging(true)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (d.samples.length === 0) return
    const next = Math.max(0, Math.min(d.startTy + (e.clientY - d.startY), geoRef.current.expandedH))
    const now = performance.now()
    d.samples.push({ t: now, y: e.clientY })
    while (d.samples.length > 2 && d.samples[0].t < now - 100) d.samples.shift()
    tyRef.current = next
    maxMoveRef.current = Math.max(maxMoveRef.current, Math.abs(next - d.startTy))
    if (panelRef.current) panelRef.current.style.transform = `translate3d(0, ${next}px, 0)`
  }

  // 탭(짧게, 거의 이동 없이)이면 즉시 전체 확장 — click 이벤트가 아니라 포인터로 판별
  const maybeTapExpand = () => {
    if (maxMoveRef.current < 10 && performance.now() - dragStartT.current < 500) expandNow()
  }

  const onPointerEnd = () => {
    const d = dragRef.current
    if (d.samples.length === 0) return
    const first = d.samples[0]
    const last = d.samples[d.samples.length - 1]
    const vel = last.t > first.t ? (last.y - first.y) / (last.t - first.t) : 0
    const dy = tyRef.current - d.startTy
    d.samples = []
    maybeTapExpand()
    flushSync(() => setDragging(false))

    const g = geoRef.current
    if (dy > 0) {
      const shouldAdvance = dy > 120 || (dy > 40 && vel > 0.5)
      if (shouldAdvance) {
        if (snapRef.current === 'expanded') applySnap(g, 'collapsed')
        else close()
      } else {
        applySnap(g, snapRef.current)
      }
    } else if (dy < 0) {
      const shouldExpand = snapRef.current === 'collapsed' && (-dy > 120 || (-dy > 40 && vel < -0.5))
      applySnap(g, shouldExpand ? 'expanded' : snapRef.current)
    } else {
      applySnap(g, snapRef.current)
    }
  }

  const dragProps = {
    onPointerDown,
    onPointerMove,
    onPointerUp: onPointerEnd,
    onPointerCancel: onPointerEnd,
  }

  const [showEnd, setShowEnd] = useState(false)
  // 운동 탭(ExerciseDetail)과 동일한 start/end 교차 로직 재사용
  useEffect(() => {
    if (!exercise.images.end) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = window.setInterval(() => setShowEnd((v) => !v), 1250)
    return () => window.clearInterval(t)
  }, [exercise.images.end, exercise.id])

  const thumb = exerciseThumb(exercise)
  const pattern = patternLabel(exercise.movementPattern)
  const tips = tipsForPattern(exercise.movementPattern)
  const primary = exercise.muscles.primary.map((m) => MUSCLE_KO[m] ?? m).join(', ')
  const secondary = exercise.muscles.secondary.map((m) => MUSCLE_KO[m] ?? m).join(', ')

  return (
    <div className="ex-sheet">
      <button type="button" className="ex-sheet__backdrop" aria-label="운동 정보 닫기" onClick={close} />
      <div
        ref={panelRef}
        className={'ex-sheet__panel' + (ready && !dragging ? '' : ' ex-sheet__panel--dragging')}
        style={{ height }}
        role="dialog"
        aria-modal="true"
        aria-label={`${exercise.nameKo} 운동 정보`}
        tabIndex={-1}
      >
        <div className="ex-sheet__drag" {...dragProps}>
          <div className="ex-sheet__handle" />
        </div>
        <div className="ex-sheet__media" role="button" aria-label="운동 정보 전체 보기" {...dragProps}>
          {thumb ? (
            <img className="ex-sheet__media-img" src={thumb} alt={exercise.nameKo} />
          ) : (
            <span className="ex-sheet__media-initial" aria-hidden="true">
              {(exercise.nameKo || exercise.name).trim().charAt(0)}
            </span>
          )}
          {exercise.images.end && (
            <img
              className={`ex-sheet__media-img ex-sheet__media-img--end ${showEnd ? 'is-on' : ''}`}
              src={exercise.images.end}
              alt=""
            />
          )}
        </div>
        <div className="ex-sheet__head" {...dragProps}>
          <div className="ex-sheet__titlewrap">
            <p className="ex-sheet__title">{exercise.nameKo}</p>
            <p className="ex-sheet__alias">
              {exercise.name}
              {(exercise.aliases ?? []).length > 0 ? ` · ${(exercise.aliases ?? []).join(' / ')}` : ''}
            </p>
          </div>
        </div>
        <div className="ex-sheet__body" ref={bodyRef}>
          <dl className="ex-sheet__rows">
            <div className="ex-sheet__row">
              <dt>패턴</dt>
              <dd>{pattern}</dd>
            </div>
            <div className="ex-sheet__row">
              <dt>장비</dt>
              <dd>{exercise.equipmentLabel}</dd>
            </div>
            <div className="ex-sheet__row">
              <dt>난이도</dt>
              <dd>{LEVEL_KO[exercise.level] ?? exercise.level}</dd>
            </div>
            {primary && (
              <div className="ex-sheet__row">
                <dt>주 타깃</dt>
                <dd>{primary}</dd>
              </div>
            )}
            {secondary && (
              <div className="ex-sheet__row">
                <dt>보조 타깃</dt>
                <dd>{secondary}</dd>
              </div>
            )}
          </dl>
          <section className="ex-sheet__tips">
            <h3>{pattern} · 수행 팁</h3>
            <ol>
              {tips.map((tip, i) => (
                <li key={i}>{tip}</li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  )
}
