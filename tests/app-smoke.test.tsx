// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import type { ReactNode } from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/app/App'
import { RestTimer } from '../src/pages/WorkoutLog'
import { start } from '../src/timer/timer'
import {
  addRoutine,
  addSet,
  addWorkout,
  deleteRoutine,
  deleteWorkout,
  getWorkoutWithSets,
  listRoutines,
  listWorkouts,
} from '../src/data/db'

// jsdom polyfills
globalThis.IS_REACT_ACT_ENVIRONMENT = true
if (!window.matchMedia) {
  window.matchMedia = (q: string) =>
    ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false }) as MediaQueryList
}
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {})

const EXERCISES_JSON = readFileSync('public/exercises/exercises.json', 'utf8')

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

function unmount() {
  act(() => root.unmount())
  container.remove()
}

function click(el: HTMLElement) {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
  })
}

describe('app smoke (jsdom)', () => {
  beforeEach(() => {
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
    vi.unstubAllGlobals()
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('탭 페이지 + 운동 기록을 모두 마운트하고 활성 탭만 표시한다', () => {
    render(<App />)
    const tabs = container.querySelectorAll('.tab-keep')
    // 4개 탭(홈·운동·기록·설정) + 운동 기록(keep-alive) = 5개
    expect(tabs.length).toBe(5)
    const visible = Array.from(tabs).filter((el) => !el.hasAttribute('hidden'))
    expect(visible.length).toBe(1)
    // 홈이 초기 활성 (Home 페이지 콘텐츠 확인)
    expect(visible[0].textContent).toContain('루틴')
    unmount()
  })

  it('탭 클릭 시 이전 페이지는 유지되고(hidden) 새 페이지만 보인다 (keep-alive)', () => {
    render(<App />)
    const tabs = Array.from(container.querySelectorAll('.tab-keep')) as HTMLElement[]
    const before = tabs[0].children.length
    const link = container.querySelector('a[href="#/exercises"]') as HTMLAnchorElement | null
    expect(link).toBeTruthy()
    click(link as HTMLAnchorElement)
    expect(tabs[0].hasAttribute('hidden')).toBe(true)
    expect(tabs[1].hasAttribute('hidden')).toBe(false)
    // Home 페이지 DOM이 제거되지 않고 유지됨 (remount 방지)
    expect(tabs[0].children.length).toBe(before)
    unmount()
  })

  it('RestTimer는 자체 250ms 틱으로 남은 시간을 갱신한다', () => {
    vi.useFakeTimers()
    const base = Date.now()
    const timer = start(60, base)
    const onAction = vi.fn()
    render(<RestTimer timer={timer} onAction={onAction} />)
    const timeEl = container.querySelector('.wl-timer__time')
    expect(timeEl?.textContent).toBe('1:00')
    act(() => {
      vi.advanceTimersByTime(250)
    })
    expect(container.querySelector('.wl-timer__time')?.textContent).toBe('0:59')
    // 일시정지 버튼 → onAction('pauseResume')
    const pauseBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '일시정지')
    expect(pauseBtn).toBeTruthy()
    click(pauseBtn as HTMLButtonElement)
    expect(onAction).toHaveBeenCalledWith('pauseResume')
    unmount()
  })

  it('종료 시 다시/닫기 버튼이 뜨고 액션이 전달된다', () => {
    vi.useFakeTimers()
    const base = Date.now()
    const timer = start(1, base)
    const onAction = vi.fn()
    render(<RestTimer timer={timer} onAction={onAction} />)
    act(() => {
      vi.advanceTimersByTime(1500)
    })
    expect(container.textContent).toContain('휴식 종료')
    const close = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '닫기')
    const again = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '다시')
    expect(close).toBeTruthy()
    expect(again).toBeTruthy()
    click(close as HTMLButtonElement)
    expect(onAction).toHaveBeenCalledWith('close')
    unmount()
  })
})

describe('루틴 관리 (저장/수정/삭제)', () => {
  beforeEach(() => {
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
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  async function flushCycles(n = 10) {
    for (let i = 0; i < n; i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0))
      })
    }
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

  function setNativeInputValue(input: HTMLInputElement, value: string) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
    expect(setter).toBeTruthy()
    act(() => {
      setter!.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }

  async function clearRoutinesAndWorkouts() {
    for (const r of await listRoutines()) await deleteRoutine(r.id)
    for (const w of await listWorkouts()) await deleteWorkout(w.id)
  }

  it('이미 있는 이름으로 저장하면 새 루틴이 생성되지 않고 기존 루틴을 업데이트한다', async () => {
    const ex = JSON.parse(EXERCISES_JSON).exercises
    await clearRoutinesAndWorkouts()
    const r = await addRoutine('Custom', [ex[0].id, ex[1].id])

    render(<App />)
    act(() => {
      window.location.hash = '#/log'
    })
    await flushCycles()
    const saveBtn = container.querySelector('.wl__save') as HTMLButtonElement
    expect(saveBtn).toBeTruthy()
    expect(saveBtn.textContent).toContain('루틴 저장')
    click(saveBtn)
    await flushCycles()
    const input = container.querySelector('input[aria-label="루틴 이름"]') as HTMLInputElement
    expect(input).toBeTruthy()
    setNativeInputValue(input, 'Custom')
    const okBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '저장')
    expect(okBtn).toBeTruthy()
    click(okBtn as HTMLButtonElement)
    await flushCycles()

    const rs = await listRoutines()
    const customs = rs.filter((x) => x.name === 'Custom')
    expect(customs).toHaveLength(1)
    expect(customs[0].id).toBe(r.id)
    expect(customs[0].exerciseIds).toEqual([ex[0].id, ex[1].id])
    unmount()
  })

  it('기존 루틴 제목을 수정하면 새 루틴이 생성되지 않고 이름만 바뀐다', async () => {
    const ex = JSON.parse(EXERCISES_JSON).exercises
    await clearRoutinesAndWorkouts()
    const r = await addRoutine('Before', [ex[0].id])

    render(<App />)
    act(() => {
      window.location.hash = `#/log?routine=${r.id}`
    })
    await waitFor(() => container.querySelector('.wl__title')?.textContent === 'Before', '루틴 로드')
    const saveBtn = container.querySelector('.wl__save') as HTMLButtonElement
    expect(saveBtn?.textContent).toContain('루틴 수정')
    click(saveBtn)
    await flushCycles()
    const input = container.querySelector('input[aria-label="루틴 이름"]') as HTMLInputElement
    expect(input).toBeTruthy()
    setNativeInputValue(input, 'After')
    const okBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '저장')
    click(okBtn as HTMLButtonElement)
    await flushCycles()

    const rs = await listRoutines()
    const mine = rs.filter((x) => x.id === r.id)
    expect(mine).toHaveLength(1)
    expect(mine[0].name).toBe('After')
    expect(mine[0].exerciseIds).toEqual([ex[0].id])
    unmount()
  })

  it('루틴 삭제(단일) 시 루틴은 사라지고 기존 운동 기록은 보존된다', async () => {
    const ex = JSON.parse(EXERCISES_JSON).exercises
    await clearRoutinesAndWorkouts()
    const r = await addRoutine('Day X', [ex[0].id])
    const w = await addWorkout({
      startedAt: Date.now(),
      endedAt: null,
      notes: '',
      exerciseIds: [ex[0].id],
      routineName: 'Day X',
    })
    await addSet(w.id, ex[0].id, 1, 10, 10, true, Date.now())

    render(<App />)
    act(() => {
      window.location.hash = `#/log?routine=${r.id}`
    })
    await waitFor(() => container.querySelector('.wl__title')?.textContent === 'Day X', '루틴 로드')
    const editBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '루틴 수정')
    expect(editBtn).toBeTruthy()
    click(editBtn as HTMLButtonElement)
    await waitFor(() => container.querySelector('.wl-routine__edit'), '편집 모드 진입')
    const delBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '루틴 삭제')
    expect(delBtn).toBeTruthy()
    click(delBtn as HTMLButtonElement)
    await waitFor(() => container.querySelector('.wl-del'), '삭제 확인 다이얼로그')
    const confirmBtn = container.querySelector('.wl-del__btn--danger') as HTMLButtonElement
    click(confirmBtn)
    await flushCycles()

    expect((await listRoutines()).filter((x) => x.name === 'Day X')).toHaveLength(0)
    expect((await listWorkouts()).some((x) => x.id === w.id)).toBe(true)
    const withSets = await getWorkoutWithSets(w.id)
    expect(withSets?.sets).toHaveLength(1)
    unmount()
  })

  it('루틴 완료 후 다른 루틴을 열면 지난번 운동이 추가되지 않는다', async () => {
    const ex = JSON.parse(EXERCISES_JSON).exercises
    await clearRoutinesAndWorkouts()
    const r1 = await addRoutine('Day 1', [ex[0].id])
    const r2 = await addRoutine('Day 2', [ex[1].id])

    render(<App />)
    act(() => {
      window.location.hash = `#/log?routine=${r1.id}`
    })
    await waitFor(() => container.querySelector('.wl__title')?.textContent === 'Day 1', 'Day 1 로드')
    expect(Array.from(container.querySelectorAll('.wl-card')).map((el) => el.getAttribute('data-ex-id'))).toEqual([ex[0].id])

    // 운동 완료 클릭
    const finishBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === '운동 완료') as HTMLButtonElement
    click(finishBtn)
    await flushCycles()

    // 다른 루틴(Day 2) 열기 — Day 1의 운동이 섞이면 안 된다
    act(() => {
      window.location.hash = `#/log?routine=${r2.id}`
    })
    await waitFor(() => container.querySelector('.wl__title')?.textContent === 'Day 2', 'Day 2 로드')
    await flushCycles()
    expect(Array.from(container.querySelectorAll('.wl-card')).map((el) => el.getAttribute('data-ex-id'))).toEqual([ex[1].id])
    unmount()
  })

  it('진행 중이던 루틴에서 다른 루틴으로 전환해도 이전 운동이 섞이지 않는다', async () => {
    const ex = JSON.parse(EXERCISES_JSON).exercises
    await clearRoutinesAndWorkouts()
    const r1 = await addRoutine('Day A', [ex[0].id])
    const r2 = await addRoutine('Day B', [ex[1].id])

    render(<App />)
    act(() => {
      window.location.hash = `#/log?routine=${r1.id}`
    })
    await waitFor(() => container.querySelector('.wl__title')?.textContent === 'Day A', 'Day A 로드')
    expect(Array.from(container.querySelectorAll('.wl-card')).map((el) => el.getAttribute('data-ex-id'))).toEqual([ex[0].id])

    // 완료하지 않고 다른 루틴으로 이동
    act(() => {
      window.location.hash = `#/log?routine=${r2.id}`
    })
    await waitFor(() => container.querySelector('.wl__title')?.textContent === 'Day B', 'Day B 로드')
    await flushCycles()
    expect(Array.from(container.querySelectorAll('.wl-card')).map((el) => el.getAttribute('data-ex-id'))).toEqual([ex[1].id])
    unmount()
  })
})
