// 타이머 상태 머신 — 설계 §F4: endTime 기반, 누적 방식 금지
import { describe, expect, it } from 'vitest'
import {
  adjust,
  format,
  pause,
  remaining,
  resume,
  start,
  status,
  type TimerState,
} from '../src/timer/timer'

const NOW = 1_700_000_000_000
const PAUSED_40 = { endTime: null, pausedRemaining: 40_000 } satisfies TimerState

describe('start', () => {
  it('endTime = now + seconds', () => {
    const s = start(120, NOW)
    expect(s.endTime).toBe(NOW + 120_000)
    expect(s.pausedRemaining).toBeNull()
  })

  it('초 단위 이하도 정확히 (0.5s → 500ms)', () => {
    expect(start(0.5, NOW).endTime).toBe(NOW + 500)
  })
})

describe('remaining — 항상 timestamp 계산', () => {
  it('시간이 흐르면 줄어듦 (누적 없음)', () => {
    const s = start(60, NOW)
    expect(remaining(s, NOW)).toBe(60_000)
    expect(remaining(s, NOW + 17_000)).toBe(43_000)
  })

  it('0 이하로 내려가지 않음', () => {
    const s = start(60, NOW)
    expect(remaining(s, NOW + 61_000)).toBe(0)
  })
})

describe('pause / resume', () => {
  it('pause: 남은 ms 저장, endTime 해제', () => {
    const s = pause(start(60, NOW), NOW + 20_000)
    expect(s.pausedRemaining).toBe(40_000)
    expect(s.endTime).toBeNull()
  })

  it('resume: 남은 ms로 endTime 재계산', () => {
    const s = resume(PAUSED_40, NOW + 5_000)
    expect(s.endTime).toBe(NOW + 5_000 + 40_000)
    expect(s.pausedRemaining).toBeNull()
  })
})

describe('adjust — 초 단위 ±', () => {
  it('running: endTime 이동', () => {
    const s = start(60, NOW)
    expect(adjust(s, +15).endTime).toBe(NOW + 75_000)
    expect(adjust(s, -15).endTime).toBe(NOW + 45_000)
  })

  it('paused: 남은 시간 이동, 0 미만 차단', () => {
    expect(adjust(PAUSED_40, -15).pausedRemaining).toBe(25_000)
    expect(adjust(PAUSED_40, -60).pausedRemaining).toBe(0)
    expect(adjust(PAUSED_40, +15).pausedRemaining).toBe(55_000)
  })
})

describe('status', () => {
  const idle: TimerState = { endTime: null, pausedRemaining: null }

  it('idle / running / paused / done 판별', () => {
    expect(status(idle, NOW)).toBe('idle')

    const run = start(60, NOW)
    expect(status(run, NOW)).toBe('running')
    expect(status(run, NOW + 60_000)).toBe('done')

    const paused = pause(run, NOW + 10_000)
    expect(status(paused, NOW + 11_000)).toBe('paused')

    expect(status(resume(paused, NOW + 12_000), NOW + 13_000)).toBe('running')
  })
})

describe('format — m:ss (대형 숫자 표시용)', () => {
  it('초 단위 포맷', () => {
    expect(format(0)).toBe('0:00')
    expect(format(42_000)).toBe('0:42')
    expect(format(60_000)).toBe('1:00')
    expect(format(125_000)).toBe('2:05')
    expect(format(3_600_000)).toBe('60:00')
    expect(format(999_999)).toBe('16:39')
  })

  it('음수/비수 치 → 0:00', () => {
    expect(format(-5)).toBe('0:00')
    expect(format(NaN)).toBe('0:00')
  })
})
