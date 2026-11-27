// 근육 강조 맵 — @emmorts/body-muscles v2.1.1 (Apache-2.0, NOTICE 참조) 고화질 인체 일러스트 렌더링
// primary = 액센트 필(intensity 10), secondary/alsoTargets = 미디엄 그레이(intensity 5), 나머지는 실루엣
import { useEffect, useRef } from 'react'
import { BodyChart, ViewSide } from '@emmorts/body-muscles'
import type { BodyState, MuscleId } from '@emmorts/body-muscles'
import './muscle-map.css'

/** 앱 근육 슬러그 → body-muscles 리전 ID (front+back 좌우 대칭 포함, 컴파일 타임에 ID 존재 검증) */
const SLUG_TO_REGIONS: Record<string, readonly MuscleId[]> = {
  back: [
    'lats-upper-left', 'lats-upper-right',
    'lats-mid-left', 'lats-mid-right',
    'lats-lower-left', 'lats-lower-right',
    'spine',
  ],
  biceps: ['biceps-left', 'biceps-right'],
  calves: [
    'calves-gastroc-medial-left', 'calves-gastroc-medial-right',
    'calves-gastroc-lateral-left', 'calves-gastroc-lateral-right',
    'calves-soleus-left', 'calves-soleus-right',
  ],
  chest: ['chest-upper-left', 'chest-upper-right', 'chest-lower-left', 'chest-lower-right'],
  core: ['abs-upper-left', 'abs-upper-right', 'abs-lower-left', 'abs-lower-right'],
  forearms: [
    'forearm-left', 'forearm-right',
    'forearm-flexors-left', 'forearm-flexors-right',
    'forearm-extensors-left', 'forearm-extensors-right',
  ],
  glutes: [
    'gluteus-maximus-left', 'gluteus-maximus-right',
    'gluteus-medius-left', 'gluteus-medius-right',
  ],
  hamstrings: [
    'hamstrings-medial-left', 'hamstrings-medial-right',
    'hamstrings-lateral-left', 'hamstrings-lateral-right',
  ],
  lats: [
    'lats-upper-left', 'lats-upper-right',
    'lats-mid-left', 'lats-mid-right',
    'lats-lower-left', 'lats-lower-right',
  ],
  lower_back: [
    'lower-back-erectors-left', 'lower-back-erectors-right',
    'lower-back-ql-left', 'lower-back-ql-right',
  ],
  neck: ['neck-left', 'neck-right', 'nape'],
  obliques: ['obliques-left', 'obliques-right'],
  quads: ['quads-left', 'quads-right'],
  shoulders: [
    'shoulder-front-left', 'shoulder-front-right',
    'shoulder-side-left', 'shoulder-side-right',
    'deltoid-rear-left', 'deltoid-rear-right',
  ],
  tibialis: ['tibialis-anterior-left', 'tibialis-anterior-right'],
  traps: [
    'traps-upper-left', 'traps-upper-right',
    'traps-mid-left', 'traps-mid-right',
    'traps-lower-left', 'traps-lower-right',
  ],
  triceps: ['triceps-long-left', 'triceps-long-right', 'triceps-lateral-left', 'triceps-lateral-right'],
}

/** intensity 계단 — 10 = primary(액센트), 5 = secondary/also(그레이) */
const LEVEL_PRIMARY = 10
const LEVEL_SECONDARY = 5

/** 슬러그 목록을 intensity 테이블로 변환 — primary가 후순위(최종)로 덮어써 우선순위가 된다 */
function buildBodyState(primary: string[], secondary: string[], alsoTargets: string[]): BodyState {
  const state: BodyState = {}
  const assign = (slug: string, level: number) => {
    for (const id of SLUG_TO_REGIONS[slug] ?? []) state[id] = { intensity: level, selected: false }
  }
  for (const s of alsoTargets) assign(s, LEVEL_SECONDARY)
  for (const s of secondary) assign(s, LEVEL_SECONDARY)
  for (const s of primary) assign(s, LEVEL_PRIMARY)
  return state
}

export interface MuscleMapProps {
  primary: string[]
  secondary: string[]
  alsoTargets?: string[]
  className?: string
}

export function MuscleMap({ primary, secondary, alsoTargets = [], className }: MuscleMapProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<BodyChart | null>(null)
  // 최초 마운트 시 빈 실루엣 플래시를 막으려면 첫 상태부터 컨스트럭터에 전달
  const initialRef = useRef<BodyState>(buildBodyState(primary, secondary, alsoTargets))

  // 마운트 1회: 정적(비인터랙티브) 차트 생성 — 언마운트 시 destroy
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const chart = new BodyChart(host, {
      view: ViewSide.BOTH,
      bodyState: initialRef.current,
      interactive: false,
      showTooltip: false,
      enableTransitions: false,
      ariaLabel: '대상 근육도',
      intensityColor: (i) =>
        i >= 8 ? 'var(--primary, #ff6b35)'
          : i >= 4 ? 'var(--map-sec, #7d8593)'
          : 'var(--map-body, #262a31)',
    })
    chartRef.current = chart
    return () => {
      chart.destroy()
      chartRef.current = null
    }
  }, [])

  // primary/secondary/alsoTargets 변경 → intensity 갱신 (update의 bodyState는 전체 교체)
  useEffect(() => {
    chartRef.current?.update({
      bodyState: buildBodyState(primary, secondary, alsoTargets),
    })
  }, [primary, secondary, alsoTargets])

  return (
    <div className={`muscle-map ${className ?? ''}`.trim()}>
      <div ref={hostRef} className="muscle-map__chart" />
      <div className="muscle-map__legend">
        <span className="muscle-map__key muscle-map__key--prim">주 운동</span>
        <span className="muscle-map__key muscle-map__key--sec">보조</span>
      </div>
    </div>
  )
}