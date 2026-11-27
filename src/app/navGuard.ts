/**
 * 뒤로가기 가드 — 심링크/새로고침처럼 앱 이전 항목이 없는 경우
 * 뒤로가기가 브라우저 밖(빈 URL)으로 나가지 않게 막는다.
 *
 * "진입 지점(entry point)" = 이 브라우저 탭이 앱을 열 때 처음으로 본 URL.
 * 그 지점에서는 뒤로가기를 홈으로 대체한다. 그 이후(실제 이전 항목이
 * 있을 때)는 history.back()으로 직전 화면으로 돌아간다.
 *
 * - sessionStorage는 탭 단위로 유지 → 탭 전환·새로고침·직접 URL 접근에 안전
 * - jsdom(테스트)에서도 동일하게 동작 (history.length가 항상 1인 문제를 우회)
 */
const ENTRY_KEY = 'rep.entry.hash'

/** 앱 첫 렌더 시 호출 — 이 탭의 진입 URL을 기억한다 (기존 값 유지). */
export function markEntryPoint(): void {
  try {
    const cur = window.location.hash
    const prev = window.sessionStorage.getItem(ENTRY_KEY)
    if (!prev && cur) window.sessionStorage.setItem(ENTRY_KEY, cur)
  } catch {
    /* private mode 등 저장 불가 — 가드는 state 검사만으로 동작 */
  }
}

/** 현재가 진입 지점(이전 항목 없음)인지 판별한다. */
export function atEntryPoint(): boolean {
  try {
    // react-router가 history.state.idx 를 유지하면 가장 신뢰할 수 있다
    const idx = (window.history.state as { idx?: number } | null)?.idx
    if (typeof idx === 'number') return idx === 0
  } catch {
    /* ignore */
  }
  try {
    const entry = window.sessionStorage.getItem(ENTRY_KEY)
    return !!entry && window.location.hash === entry
  } catch {
    return false
  }
}

/** 뒤로가기를 실행: 직전 화면 → 없으면 홈(replace). */
export function goBack(navigate: (to: number | string, opts?: { replace?: boolean }) => void): void {
  if (atEntryPoint()) navigate('/', { replace: true })
  else navigate(-1)
}
