// @vitest-environment jsdom
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
  toggleFavorite,
} from '../src/data/db'
import { installHistoryShim, resetHistoryShim, restoreHistoryShim } from './historyShim'

async function clearDb() {
  for (const r of await listRoutines()) await deleteRoutine(r.id)
  for (const w of await listWorkouts()) await deleteWorkout(w.id)
}

// jsdom polyfills (app-smoke.test.tsx 패턴 재사용)
globalThis.IS_REACT_ACT_ENVIRONMENT = true
if (!window.matchMedia) {
  window.matchMedia = (q: string) =>
    ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false }) as MediaQueryList
}
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {})

const EXERCISES_JSON = readFileSync('public/exercises/exercises.json', 'utf8')
const EXERCISES = (JSON.parse(EXERCISES_JSON) as { exercises: Array<{ id: string; nameKo?: string; name: string }> }).exercises
const FIRST_EXERCISE_ID = EXERCISES[0].id

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

async function seedRoutine() {
  const r = await addRoutine('테스트 루틴', [FIRST_EXERCISE_ID])
  return r
}

async function seedFavorite() {
  await toggleFavorite(FIRST_EXERCISE_ID)
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

describe('navigation (jsdom) — 뒤로가기 & 화면 이동', () => {
  beforeEach(async () => {
    // 테스트마다 히스토리 스택을 새로 시작: 첫 엔트리가 '#/' (idx 0)
    installHistoryShim()
    window.location.hash = '#/'
    resetHistoryShim()
    // history.state 정규화 — 새로 마운트되는 Router 인스턴스가 초기 idx로 읽음
    window.history.replaceState({ usr: null, key: 'default', idx: 0 }, '')
    await clearDb()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('exercises.json')) {
          return new Response(EXERCISES_JSON, { status: 200, headers: { 'content-type': 'application/json' } })
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

  it('홈 → 루틴 → 뒤로가기: 홈으로 정확히 돌아간다', async () => {
    const r = await seedRoutine()
    render(<App />)
    await flush()
    // Home tab active
    expect(visibleTabs().length).toBe(1)

    // Home에서 루틴 카드 클릭 (push) — 데이터 로딩 완료 대기
    const sel = `a[href="#/log?routine=${r.id}"]`
    await waitFor(() => visibleEl(sel) !== null, '루틴 카드 렌더')
    const routineLink = visibleEl(sel) as HTMLAnchorElement
    click(routineLink)
    expect(window.location.hash).toBe('#/log?routine=' + r.id)

    // WorkoutLog의 뒤로가기 버튼
    const back = container.querySelector('button.back[aria-label="뒤로"]') as HTMLButtonElement | null
    expect(back).toBeTruthy()
    click(back as HTMLButtonElement)

    // 직전 화면 = 홈 (TabBar 링크가 아니라 홈 탭 자체의 콘텐츠로 판정)
    expect(window.location.hash).toBe('#/')
    expect(visibleTabs().length).toBe(1)
    expect(visibleTabs()[0].querySelector('.home__cta')).toBeTruthy()
    unmount()
  })

  it('홈(즐겨찾기) → 운동 상세 → 뒤로가기: 홈으로 돌아간다 (운동 탭이 아님)', async () => {
    await seedFavorite()
    render(<App />)
    await flush()
    await waitFor(() => visibleEl(`a.home__item[href="#/exercise/${FIRST_EXERCISE_ID}"]`) !== null, '즐겨찾기 렌더')
    const favLink = visibleEl(`a.home__item[href="#/exercise/${FIRST_EXERCISE_ID}"]`) as HTMLAnchorElement
    click(favLink)
    expect(window.location.hash).toBe('#/exercise/' + FIRST_EXERCISE_ID)

    const back = container.querySelector('button.back, a.back') as HTMLElement | null
    expect(back).toBeTruthy()
    click(back as HTMLElement)

    // 진입 화면은 홈 → 뒤로가기도 홈이어야 한다 (홈 탭 콘텐츠로 판정)
    expect(window.location.hash).toBe('#/')
    expect(visibleTabs().length).toBe(1)
    expect(visibleTabs()[0].querySelector('.home__cta')).toBeTruthy()
    unmount()
  })

  it('운동 탭 → 운동 상세 → 뒤로가기: 운동 탭으로 돌아간다', async () => {
    render(<App />)
    await flush()
    // 운동 탭으로 전환 (replace)
    click(container.querySelector('a[href="#/exercises"]') as HTMLAnchorElement)
    expect(window.location.hash).toBe('#/exercises')

    await waitFor(() => visibleEl(`a[href="#/exercise/${FIRST_EXERCISE_ID}"]`) !== null, '운동 목록 렌더')
    const row = visibleEl(`a[href="#/exercise/${FIRST_EXERCISE_ID}"]`) as HTMLAnchorElement
    click(row)
    expect(window.location.hash).toBe('#/exercise/' + FIRST_EXERCISE_ID)

    const back = container.querySelector('button.back, a.back') as HTMLElement | null
    expect(back).toBeTruthy()
    click(back as HTMLElement)

    // 진입 화면은 운동 탭 → 뒤로가기도 운동 탭
    // 진입 화면은 운동 탭 → 운동 탭 콘텐츠(운동 목록 링크)가 보일 것
    expect(window.location.hash).toBe('#/exercises')
    expect(visibleTabs().length).toBe(1)
    expect(visibleTabs()[0].querySelector(`a[href="#/exercise/${FIRST_EXERCISE_ID}"]`)).toBeTruthy()
    unmount()
  })

  it('탭 전환은 히스토리를 쌓지 않는다 (replace)', async () => {
    render(<App />)
    await flush()
    const baseline = window.history.length
    click(container.querySelector('a[href="#/exercises"]') as HTMLAnchorElement)
    click(container.querySelector('a[href="#/history"]') as HTMLAnchorElement)
    click(container.querySelector('a[href="#/settings"]') as HTMLAnchorElement)
    click(container.querySelector('a[href="#/"]') as HTMLAnchorElement)
    expect(window.history.length).toBe(baseline)
    unmount()
  })

  it('운동 완료(finish)는 히스토리에 /log 유령 항목을 남기지 않는다 (replace)', async () => {
    await seedRoutine()
    render(<App />)
    await flush()
    await waitFor(() => visibleEl('a[href*="#/log?routine="]') !== null, '루틴 카드 렌더')
    const routineLink = visibleEl('a[href*="#/log?routine="]') as HTMLAnchorElement
    click(routineLink)

    const baseline = window.history.length
    const finish = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === '운동 완료'
    ) as HTMLButtonElement | undefined
    expect(finish).toBeTruthy()
    click(finish as HTMLButtonElement)
    await act(async () => {})

    // /history로 이동하되 /log 항목이 쌓이면 안 된다
    expect(window.location.hash).toBe('#/history')
    expect(window.history.length).toBe(baseline)
    unmount()
  })

  it('직접 URL 진입(이전 항목 없음)에서 뒤로가기: 앱 밖으로 나가지 않고 홈으로', async () => {
    await seedRoutine()
    // 앱의 첫 진입이 /log (심링크/PWA/새로고침 시나리오)
    window.location.hash = '#/log'
    render(<App />)
    await flush()

    const back = container.querySelector('button.back[aria-label="뒤로"]') as HTMLButtonElement | null
    expect(back).toBeTruthy()
    click(back)
    await act(async () => {})

    // 앱 밖(빈 히스토리/외부 URL)이 아니라 홈 탭이어야 한다
    expect(window.location.hash).toBe('#/')
    expect(visibleTabs().length).toBe(1)
    unmount()
  })

  it('알 수 없는 URL은 홈으로 리다이렉트된다 (catch-all)', async () => {
    window.location.hash = '#/nonexistent-page'
    render(<App />)
    await flush()
    expect(window.location.hash).toBe('#/')
    expect(visibleTabs().length).toBe(1)
    unmount()
  })
})
