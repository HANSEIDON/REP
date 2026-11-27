// @vitest-environment jsdom
/**
 * break-ui — 최악의 경우 데이터로 UI를 깨뜨리기 시도
 *
 * 원칙 (break-ui skill): 마크업은 바꾸지 않고 데이터만 극한 값으로 교체.
 * - 긴 루틴 이름 / 1글자 이름 / 운동 0개 루틴 / 루틴 0개 / 루틴 30개
 * - 긴 운동 이름 (fixture의 첫 운동 nameKo 교체)
 *
 * 제약: exerciseRepo 모듈 캐시가 리셋 없으므로 이 파일은 처음부터
 *       "긴 이름 포함" JSON을 fetch stub으로 사용(파일 내 모든 테스트가 공유).
 */
import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import type { ReactNode } from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/app/App'
import {
  addRoutine,
  deleteRoutine,
  listRoutines,
  listWorkouts,
  deleteWorkout,
} from '../src/data/db'
import { installHistoryShim, resetHistoryShim, restoreHistoryShim } from './historyShim'

async function clearDb() {
  for (const r of await listRoutines()) await deleteRoutine(r.id)
  for (const w of await listWorkouts()) await deleteWorkout(w.id)
}

// jsdom polyfills (navigation.test.tsx 패턴 재사용)
globalThis.IS_REACT_ACT_ENVIRONMENT = true
if (!window.matchMedia) {
  window.matchMedia = (q: string) =>
    ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false }) as MediaQueryList
}
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {})

// --- worst-case fixture: 첫 운동의 nameKo만 60자+ 긴 이름으로 교체 ---
const EXERCISES_RAW = readFileSync('public/exercises/exercises.json', 'utf8')
const EXERCISES = JSON.parse(EXERCISES_RAW) as {
  exercises: Array<{ id: string; nameKo?: string; name: string }>
}
const FIRST_EXERCISE_ID = EXERCISES.exercises[0].id
const LONG_EXERCISE_NAME =
  '아바 휠 롤아웃 — 손목 보호대 착용 필수, 천천히 내리기 3초 정지 후 복부 긴장 유지하며 되돌리기 (초급자 주의) 🏋️'
const LONG_ROUTINE_NAME =
  '아침 루틴 — 푸시업 5세트 · 팔굽혀펴기 · 스쿼트 · 플랑크 (집+짐) 🔥'
const MODIFIED_EXERCISES_JSON = JSON.stringify({
  ...EXERCISES,
  exercises: EXERCISES.exercises.map((ex, i) =>
    i === 0 ? { ...ex, nameKo: LONG_EXERCISE_NAME } : ex
  ),
})

let container: HTMLDivElement
let root: Root

function render(ui: ReactNode) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root.render(ui)
  })
}

/** mount 직후 비동기 setState(설정 로딩 등)를 act로 흡수해 act 경고를 방지 */
async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })
}

function unmount() {
  act(() => root.unmount())
  container.remove()
}

function click(el: HTMLElement) {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
  })
}

function visibleTabs(): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('.tab-keep')).filter((el) => !el.hasAttribute('hidden'))
}

function visibleEl(selector: string): HTMLElement | null {
  const el = visibleTabs().map((t) => t.querySelector<HTMLElement>(selector)).find((x) => x ?? false)
  return el ?? null
}

async function waitFor(cond: () => boolean, label: string) {
  const deadline = Date.now() + 3000
  for (;;) {
    if (cond()) return
    if (Date.now() > deadline) throw new Error(`waitFor timeout: ${label}`)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })
  }
}

/** keep-alive 불변: 탭 라우트에선 5개 .tab-keep 중 정확히 1개만 보이게 */
function assertKeepAlive() {
  const tabs = Array.from(container.querySelectorAll<HTMLElement>('.tab-keep'))
  expect(tabs.length).toBe(5)
  expect(tabs.filter((t) => !t.hasAttribute('hidden')).length).toBe(1)
}

describe('break-ui (jsdom) — 최악의 경우 데이터', () => {
  beforeEach(async () => {
    installHistoryShim()
    window.location.hash = '#/'
    resetHistoryShim()
    window.history.replaceState({ usr: null, key: 'default', idx: 0 }, '')
    await clearDb()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('exercises.json')) {
          return new Response(MODIFIED_EXERCISES_JSON, { status: 200, headers: { 'content-type': 'application/json' } })
        }
        throw new Error('unexpected fetch: ' + url)
      })
    )
  })

  afterEach(() => {
    restoreHistoryShim()
    vi.unstubAllGlobals()
    vi.useRealTimers()
    document.body.innerHTML = ''
    window.location.hash = ''
  })

  it('fixture sanity — 교체한 이름들이 정말 최악의 경우(긴 이름)인지', () => {
    expect(LONG_EXERCISE_NAME.length).toBeGreaterThanOrEqual(60)
    expect(LONG_ROUTINE_NAME.length).toBeGreaterThanOrEqual(40)
  })

  it('루틴 0개 — 홈이 깨지지 않고 CTA만 보인다', async () => {
    render(<App />)
    await flush()

    // 루틴 섹션 없음, CTA는 정상 렌더
    expect(container.querySelector('.home__routine')).toBeNull()
    const cta = visibleEl('a.cta.home__cta')
    expect(cta).toBeTruthy()
    expect(cta?.textContent?.trim()).toBe('루틴 만들기')
    assertKeepAlive()
    unmount()
  })

  it('긴 루틴 이름 — 홈 카드·상세 타이틀에 전체 이름이 보이고 뒤로가기도 정상', async () => {
    const r = await addRoutine(LONG_ROUTINE_NAME, [FIRST_EXERCISE_ID])
    render(<App />)
    await flush()

    // 홈: DOM에서 이름이 잘리지 않고 전체 노출 (CSS 절단과 무관)
    const nameEl = visibleEl('.home__routine__name')
    expect(nameEl?.textContent).toBe(LONG_ROUTINE_NAME)

    // 상세로 이동
    const link = visibleEl(`a[href="#/log?routine=${r.id}"]`) as HTMLAnchorElement
    click(link)
    // loadRoutine은 비동기(idb 다중 await) — 제목이 실제 루틴 이름이 될 때까지 대기
    await waitFor(() => visibleEl('.wl__title')?.textContent === LONG_ROUTINE_NAME, '루틴 로드')
    expect(visibleEl('.wl__title')?.textContent).toBe(LONG_ROUTINE_NAME)
    assertKeepAlive()

    // 뒤로가기 → 홈, 홈에도 여전히 전체 이름
    const back = container.querySelector('button.back[aria-label="뒤로"]') as HTMLButtonElement | null
    expect(back).toBeTruthy()
    click(back as HTMLButtonElement)
    expect(window.location.hash).toBe('#/')
    expect(visibleEl('.home__routine__name')?.textContent).toBe(LONG_ROUTINE_NAME)
    assertKeepAlive()
    unmount()
  })

  it('1글자 루틴 이름 — 렌더·이동·뒤로가기가 정상', async () => {
    const r = await addRoutine('A', [FIRST_EXERCISE_ID])
    render(<App />)
    await flush()

    expect(visibleEl('.home__routine__name')?.textContent).toBe('A')

    const link = visibleEl(`a[href="#/log?routine=${r.id}"]`) as HTMLAnchorElement
    click(link)
    await waitFor(() => visibleEl('.wl__title')?.textContent === 'A', '루틴 로드')
    expect(visibleEl('.wl__title')?.textContent).toBe('A')

    const back = container.querySelector('button.back[aria-label="뒤로"]') as HTMLButtonElement | null
    expect(back).toBeTruthy()
    click(back as HTMLButtonElement)
    expect(window.location.hash).toBe('#/')
    assertKeepAlive()
    unmount()
  })

  it('운동 0개 루틴 — 홈에 "운동 없음", 상세는 빈 상태 메시지만 보여도 크래시 없음', async () => {
    const r = await addRoutine('빈 루틴', [])
    render(<App />)
    await flush()

    expect(visibleEl('.home__routine__name')?.textContent).toBe('빈 루틴')
    expect(visibleEl('.home__routine__meta')?.textContent).toBe('운동 없음')

    const link = visibleEl(`a[href="#/log?routine=${r.id}"]`) as HTMLAnchorElement
    click(link)
    await waitFor(() => visibleEl('.wl__title')?.textContent === '빈 루틴', '루틴 로드')
    expect(visibleEl('.wl__title')?.textContent).toBe('빈 루틴')
    expect(visibleEl('.wl-cards .state-msg')?.textContent).toContain('운동 추가를 시작하세요.')
    assertKeepAlive()

    const back = container.querySelector('button.back[aria-label="뒤로"]') as HTMLButtonElement | null
    expect(back).toBeTruthy()
    click(back as HTMLButtonElement)
    expect(window.location.hash).toBe('#/')
    assertKeepAlive()
    unmount()
  })

  it('루틴 30개 — 모두 렌더되고 마지막 루틴도 이동·뒤로가기가 정상', async () => {
    let last: { id: string } | null = null
    for (let i = 1; i <= 30; i++) {
      last = await addRoutine(`루틴 ${String(i).padStart(2, '0')}`, [FIRST_EXERCISE_ID])
    }
    const lastId = (last as { id: string }).id
    render(<App />)
    await flush()

    // 30개 전부 렌더 (누락 없이)
    const cards = container.querySelectorAll('.home__routine')
    expect(cards.length).toBe(30)
    expect(container.querySelector('.home__routine__name')?.textContent).toBe('루틴 01')

    // 마지막(30번째) 루틴으로 이동
    const link = visibleEl(`a[href="#/log?routine=${lastId}"]`) as HTMLAnchorElement
    expect(link).toBeTruthy()
    click(link)
    await waitFor(() => visibleEl('.wl__title')?.textContent === '루틴 30', '루틴 로드')
    expect(visibleEl('.wl__title')?.textContent).toBe('루틴 30')
    assertKeepAlive()

    // 뒤로가기 → 홈, 30개 카드 그대로 유지 (keep-alive 상태 손상 없음)
    const back = container.querySelector('button.back[aria-label="뒤로"]') as HTMLButtonElement | null
    expect(back).toBeTruthy()
    click(back as HTMLButtonElement)
    expect(window.location.hash).toBe('#/')
    expect(container.querySelectorAll('.home__routine').length).toBe(30)
    assertKeepAlive()
    unmount()
  })

  it('긴 운동 이름 — 운동 탭·상세에서 전체 이름이 보이고 뒤로가기는 운동 탭으로', async () => {
    render(<App />)
    await flush()

    // 운동 탭으로 전환 (replace)
    click(container.querySelector('a[href="#/exercises"]') as HTMLAnchorElement)
    expect(window.location.hash).toBe('#/exercises')

    await waitFor(
      () => visibleEl(`a[href="#/exercise/${FIRST_EXERCISE_ID}"]`) !== null,
      '운동 목록 렌더'
    )
    // 첫 운동이 60자+ 긴 이름으로 DOM 전체에 노출 (잘림 없음)
    const nameEl = visibleEl('.ex-row__name')
    expect(nameEl?.textContent).toBe(LONG_EXERCISE_NAME)

    // 운동 상세로 이동
    click(container.querySelector(`a[href="#/exercise/${FIRST_EXERCISE_ID}"]`) as HTMLAnchorElement)
    expect(window.location.hash).toBe('#/exercise/' + FIRST_EXERCISE_ID)
    await waitFor(() => container.querySelector('h1.ed-name') !== null, '운동 상세 렌더')
    expect(container.querySelector('h1.ed-name')?.textContent).toBe(LONG_EXERCISE_NAME)

    // 뒤로가기 → 진입 화면인 운동 탭으로
    const back = container.querySelector('button.back[aria-label="뒤로"]') as HTMLElement | null
    expect(back).toBeTruthy()
    click(back as HTMLElement)
    expect(window.location.hash).toBe('#/exercises')
    expect(visibleEl(`a[href="#/exercise/${FIRST_EXERCISE_ID}"]`)).toBeTruthy()
    expect(visibleEl('.ex-row__name')?.textContent).toBe(LONG_EXERCISE_NAME)
    assertKeepAlive()
    unmount()
  })
})
