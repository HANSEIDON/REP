// 전역 휴식 타이머 버스 (pub-sub) — RestBar/WorkoutLog 간 상태 전파
import { describe, expect, it, vi } from 'vitest'
import { IDLE_STATE } from '../src/timer/timer'
import type { TimerState } from '../src/timer/timer'
import {
  EMPTY_TIMER_INFO,
  getTimerInfo,
  pushTimerInfo,
  subscribeTimerInfo,
} from '../src/timer/bus'

function idle(): void {
  pushTimerInfo({ workoutId: null, exerciseName: null, state: IDLE_STATE })
}

describe('getTimerInfo', () => {
  it('초기값은 EMPTY_TIMER_INFO', () => {
    idle()
    const info = getTimerInfo()
    expect(info.workoutId).toBeNull()
    expect(info.exerciseName).toBeNull()
    expect(info.restTotalMs).toBeNull()
    expect(info.state).toEqual(IDLE_STATE)
  })
})

describe('pushTimerInfo — restTotalMs 명시', () => {
  it('explicit 값 그대로 저장', () => {
    const now = Date.now()
    pushTimerInfo({
      workoutId: 1,
      exerciseName: '벤치프레스',
      restTotalMs: 75_000,
      state: { endTime: now + 75_000, pausedRemaining: null },
    })
    const info = getTimerInfo()
    expect(info.restTotalMs).toBe(75_000)
    expect(info.exerciseName).toBe('벤치프레스')
  })
})

describe('pushTimerInfo — restTotalMs 자동 추정', () => {
  it('새 사이클 시작 시 endTime 기준으로 계산', () => {
    idle()
    const now = Date.now()
    const state: TimerState = { endTime: now + 60_000, pausedRemaining: null }
    pushTimerInfo({ workoutId: 2, exerciseName: '스쿼트', state })
    // endTime - now (테스트 실행 오차 내)
    const est = getTimerInfo().restTotalMs
    expect(est).not.toBeNull()
    expect(est!).toBeGreaterThanOrEqual(58_000)
    expect(est!).toBeLessThanOrEqual(60_000)
  })

  it('만료된 endTime이면 0', () => {
    idle()
    const past = Date.now() - 1_000
    pushTimerInfo({
      workoutId: 3,
      exerciseName: '풀업',
      state: { endTime: past, pausedRemaining: null },
    })
    expect(getTimerInfo().restTotalMs).toBe(0)
  })

  it('같은 워크아웃 상태 전이(endTime 동일) 시 이전 total 유지', () => {
    idle()
    const now = Date.now()
    const state: TimerState = { endTime: now + 90_000, pausedRemaining: null }
    pushTimerInfo({ workoutId: 4, exerciseName: '데드리프트', restTotalMs: 90_000, state })
    // pause: 같은 endTime, pausedRemaining만 바뀜
    const paused: TimerState = { endTime: now + 90_000, pausedRemaining: 45_000 }
    pushTimerInfo({ workoutId: 4, exerciseName: '데드리프트', state: paused })
    expect(getTimerInfo().restTotalMs).toBe(90_000)
  })

  it('다른 워크아웃으로 넘어가면 명시적 값 없이 추정값만 사용', () => {
    idle()
    const now = Date.now()
    pushTimerInfo({
      workoutId: 5,
      exerciseName: 'A',
      restTotalMs: 90_000,
      state: { endTime: now + 90_000, pausedRemaining: null },
    })
    // 같은 endTime, 다른 워크아웃 → 추정 분기에도 못 들어감 (endTime 동일) → null
    pushTimerInfo({
      workoutId: 6,
      exerciseName: 'B',
      state: { endTime: now + 90_000, pausedRemaining: null },
    })
    expect(getTimerInfo().restTotalMs).toBeNull()
  })
})

describe('subscribeTimerInfo', () => {
  it('push 시 listener 호출, unsubscribe 후 호출 안 됨', () => {
    idle()
    const fn = vi.fn()
    const unsub = subscribeTimerInfo(fn)
    pushTimerInfo({ workoutId: 7, exerciseName: 'X', state: IDLE_STATE })
    expect(fn).toHaveBeenCalledTimes(1)
    unsub()
    pushTimerInfo({ workoutId: 8, exerciseName: 'Y', state: IDLE_STATE })
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
