import { useSyncExternalStore } from 'react'
import { IDLE_STATE, type TimerState } from './timer'

/**
 * 전역 휴식 타이머 상태 버스 (pub-sub).
 *
 * WorkoutLog의 `transition()` choke point에서 `pushTimerInfo()`를 호출하면,
 * App의 전역 RestBar가 어떤 화면에 있어도 갱신된다.
 *
 * 상태는 timestamp 기반(endTime)이라 앱 재시작 후에도 스스로 남은 시간을 계산할 수 있다.
 */
export interface GlobalTimerInfo {
  workoutId: number | null
  exerciseName: string | null
  /** 이 휴식 사이클의 전체 시간(ms). 진행라인용. null이면 표시 안 함 */
  restTotalMs: number | null
  state: TimerState
}

export const EMPTY_TIMER_INFO: GlobalTimerInfo = {
  workoutId: null,
  exerciseName: null,
  restTotalMs: null,
  state: IDLE_STATE,
}

let current: GlobalTimerInfo = EMPTY_TIMER_INFO
const listeners = new Set<() => void>()

function emit(): void {
  for (const l of listeners) l()
}

/**
 * 타이머 정보 갱신. `restTotalMs`를 명시하지 않으면
 * 새 사이클 시작 시점(endTime 기준)에 스스로 계산하거나 이전 값을 유지한다.
 */
export function pushTimerInfo(
  info: Omit<GlobalTimerInfo, 'restTotalMs'> & { restTotalMs?: number | null },
): void {
  let total = info.restTotalMs ?? null
  if (total == null) {
    if (info.state.endTime != null && current.state.endTime != info.state.endTime) {
      // 새로운 사이클 시작 — endTime 기준 남은 시간으로 total 추정
      total = Math.max(0, info.state.endTime - Date.now())
    } else if (current.workoutId === info.workoutId) {
      // 같은 워크아웃의 상태 전이(pause/resume/adjust) — 이전 total 유지
      total = current.restTotalMs
    }
  }
  current = { ...info, restTotalMs: total }
  emit()
}

export function getTimerInfo(): GlobalTimerInfo {
  return current
}

export function subscribeTimerInfo(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** React 훅 — 전역 타이머 정보가 바뀌면 재렌더 */
export function useTimerInfo(): GlobalTimerInfo {
  return useSyncExternalStore(subscribeTimerInfo, getTimerInfo)
}
