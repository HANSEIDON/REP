// 운동 마스터 데이터 레이어 — 번들 JSON (IndexedDB가 아닌 로컬 에셋)
// 이미지: /exercises/images/... (Workbox 런타임 캐시, 프리캐시 제외)

export interface ExerciseImages {
  start?: string
  mid?: string
  end?: string
  hold?: string
}

/** 대표 썸네일 (start → hold → mid 순) */
export function exerciseThumb(ex: Exercise): string {
  return ex.images.start ?? ex.images.hold ?? ex.images.mid ?? ''
}

export interface Exercise {
  id: string
  name: string
  nameKo: string
  aliases: string[]
  equipment: string[]
  equipmentLabel: string
  muscles: { primary: string[]; secondary: string[]; alsoTargets?: string[] }
  movementPattern: string
  category: string
  unilateral: boolean
  level: string
  view: string
  frames: string[]
  images: ExerciseImages
}

interface RawBundle {
  version?: string
  license?: string
  count?: number
  exercises: Exercise[]
  variants?: unknown[]
  equipment?: unknown[]
}

/**
 * 이미지 경로 정규화.
 * 번들 JSON의 images 경로가 상대경로(`images/xxx/start.webp`)로 저장되어 있어
 * 브라우저가 현재 URL 기준으로 해석하면 404가 발생한다.
 * 실제 파일 위치는 /exercises/images/... 이므로 절대경로로 통일한다.
 */
function fixImage(p?: string): string | undefined {
  if (!p) return p
  if (p.startsWith('http') || p.startsWith('/')) return p
  // 'images/...' -> '/exercises/images/...'
  return '/exercises/' + p
}

function fixImages(img: ExerciseImages): ExerciseImages {
  return {
    start: fixImage(img.start),
    mid: fixImage(img.mid),
    end: fixImage(img.end),
    hold: fixImage(img.hold),
  }
}

/** JSON 문자열을 Exercise 배열로 파싱 (순수 함수 — 테스트용) */
export function parseExercises(raw: string | RawBundle): Exercise[] {
  const data: RawBundle = typeof raw === 'string' ? JSON.parse(raw) : raw
  if (!Array.isArray(data.exercises)) throw new Error('exercises array missing')
  return data.exercises.map((ex) => ({ ...ex, images: fixImages(ex.images) }))
}

let cache: Exercise[] | null = null
let loadPromise: Promise<Exercise[]> | null = null

/** 번들된 exercises.json을 로드 (모듈 레벨 메모이즈) */
export function loadExercises(): Promise<Exercise[]> {
  if (loadPromise) return loadPromise
  loadPromise = fetch('/exercises/exercises.json')
    .then((r) => {
      if (!r.ok) throw new Error(`exercises.json fetch failed: ${r.status}`)
      return r.json() as Promise<RawBundle>
    })
    .then((data) => {
      cache = parseExercises(data)
      return cache
    })
    .catch((err) => {
      // 일시적 네트워크 실패가 이후 방문까지 붙지 않도록 다음 호출에서 재시도 가능하게 reset
      loadPromise = null
      throw err
    })
  return loadPromise
}

/** 로드 완료 시 동기 접근 (UI에서 안전하게) */
export function getExercisesSync(): Exercise[] | null {
  return cache
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[\s\u00a0]+/g, '')
}

function matches(ex: Exercise, q: string): boolean {
  const nq = norm(q)
  if (!nq) return true
  if (norm(ex.name).includes(nq)) return true
  if (norm(ex.nameKo).includes(nq)) return true
  return ex.aliases.some((a) => norm(a).includes(nq))
}

/** KO + EN + alias 검색 (대소문자·공백 무시) */
export function searchExercises(list: Exercise[], query: string): Exercise[] {
  const q = query.trim()
  if (!q) return list
  return list.filter((ex) => matches(ex, q))
}

export function filterByMuscle(list: Exercise[], muscle: string): Exercise[] {
  if (!muscle) return list
  return list.filter((ex) => ex.muscles.primary.includes(muscle))
}

export function filterByEquipment(list: Exercise[], equip: string): Exercise[] {
  if (!equip) return list
  return list.filter((ex) => ex.equipment.includes(equip))
}

/** 운동 유형: 전체 / 기구 운동 / 맨몸 운동 */
export type ExerciseType = 'all' | 'equipment' | 'bodyweight'

/**
 * 유형 필터. 분류 기준: equipment 배열이 비어 있으면 맨몸, 비어 있지 않으면 기구 운동.
 * (데이터셋에서 equipmentLabel "Bodyweight" 122개와 정확히 일치)
 */
export function filterByType(list: Exercise[], type: ExerciseType): Exercise[] {
  if (type === 'all') return list
  return list.filter((ex) => (type === 'equipment' ? ex.equipment.length > 0 : ex.equipment.length === 0))
}

export function getExercise(list: Exercise[], id: string): Exercise | undefined {
  return list.find((ex) => ex.id === id)
}

/**
 * 대체 운동: 같은 부위 타깃 운동을 우선으로 묶는다.
 * 1) 운동의 메인(첫 번째) 주근육을 공유하는 운동을 먼저 배치.
 * 2) 메인 근육 후보가 부족하면, 나머지 주근육을 1개 이상 공유하는 운동으로 채운다.
 * 동일 티어 내 정렬: 공유 근육 수 내림차순 → 이름(한국어) 오름차순 (결정적).
 * 자기 자신은 항상 제외한다.
 */
export function substitutesFor(list: Exercise[], ex: Exercise, limit = 6): Exercise[] {
  const primary = ex.muscles.primary
  const main = primary[0]
  const sharedCount = (s: Exercise) => primary.filter((m) => s.muscles.primary.includes(m)).length
  const tier = (s: Exercise) => (main && s.muscles.primary.includes(main) ? 0 : 1)
  return list
    .filter((s) => s.id !== ex.id && sharedCount(s) > 0)
    .sort(
      (a, b) =>
        tier(a) - tier(b) || sharedCount(b) - sharedCount(a) || a.nameKo.localeCompare(b.nameKo, 'ko'),
    )
    .slice(0, limit)
}
