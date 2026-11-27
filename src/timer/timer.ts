// 휴식 타이머 상태 머신 — 설계 §F4
// 핵심: endTime (Unix ms) 기준 계산만. tick은 화면 갱신용이고 정확성은 항상 timestamp에서 나옴.
export interface TimerState {
  /** running일 때: 종료 시각 (Unix ms) */
  endTime: number | null
  /** paused일 때: 남은 ms */
  pausedRemaining: number | null
}

export type TimerStatus = 'idle' | 'running' | 'paused' | 'done'

export const IDLE_STATE: TimerState = { endTime: null, pausedRemaining: null }

/** start: 초(소수 허용) → endTime 상태 */
export function start(seconds: number, now: number): TimerState {
  return { endTime: Math.round(now + seconds * 1000), pausedRemaining: null }
}

/** 남은 ms — 항상 max(0, endTime - now) */
export function remaining(state: TimerState, now: number): number {
  if (state.endTime == null) return 0
  return Math.max(0, state.endTime - now)
}

/** pause: 남은 ms를 저장하고 endTime 해제 */
export function pause(state: TimerState, now: number): TimerState {
  return { endTime: null, pausedRemaining: remaining(state, now) }
}

/** resume: 남은 ms로 endTime 재계산 */
export function resume(state: TimerState, now: number): TimerState {
  const left = state.pausedRemaining ?? 0
  return { endTime: Math.round(now + left), pausedRemaining: null }
}

/** adjust: 초 단위 ±. running이면 endTime 이동, paused면 남은 시간 이동 (0 미만 차단) */
export function adjust(state: TimerState, deltaSeconds: number): TimerState {
  const delta = Math.round(deltaSeconds * 1000)
  if (state.endTime != null) {
    return { endTime: state.endTime + delta, pausedRemaining: null }
  }
  const left = Math.max(0, (state.pausedRemaining ?? 0) + delta)
  return { endTime: null, pausedRemaining: left }
}

/** 현재 상태 판별 */
export function status(state: TimerState, now: number): TimerStatus {
  if (state.endTime != null) return remaining(state, now) <= 0 ? 'done' : 'running'
  if (state.pausedRemaining != null) return 'paused'
  return 'idle'
}

/** m:ss 포맷 (0:42, 2:05, 60:00). 음수/NaN → 0:00 */
export function format(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0:00'
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
