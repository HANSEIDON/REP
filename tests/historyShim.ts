/* ------------------------------------------------------------------ *
 * jsdom history shim (공유 모듈)
 *
 * jsdom의 history.back()/forward()/go()는 no-op(해시가 안 바뀌고
 * popstate도 안 발생). 반면 React Router v7의 hash history는 popstate만
 * 듣는다(hashchange는 무시). 그래서 여기서는 해시 스택을 유지하고,
 * back/forward 요청 시 대상 엔트리의 해시 + history.state를 복원한 뒤
 * popstate를 수동 발생시켜 실제 브라우저 동작을 재현한다.
 * pushState/replaceState 본체는 그대로 유지(length 의미 동일)하고
 * 엔트리 기록만 추가한다.
 *
 * 사용법:
 *   beforeEach: installHistoryShim() → hash 초기화 → resetHistoryShim()
 *   afterEach : restoreHistoryShim()
 * ------------------------------------------------------------------ */
export type ShimEntry = { hash: string; state: unknown }

let origPush: History['pushState'] | null = null
let origReplace: History['replaceState'] | null = null
let origGo: History['go'] | null = null
let origBack: History['back'] | null = null
let origForward: History['forward'] | null = null
let shimInstalled = false
let shimStack: ShimEntry[] = []
let shimCursor = 0

function shimTargetUrl(hash: string): string {
  const base = window.location.href.split('#')[0]
  const h = hash || '#'
  return base + (h.startsWith('#') ? h : '#' + h)
}

export function installHistoryShim() {
  if (shimInstalled) return
  shimInstalled = true
  origPush = window.history.pushState
  origReplace = window.history.replaceState
  origGo = window.history.go
  origBack = window.history.back
  origForward = window.history.forward

  window.history.pushState = function (
    this: History,
    state: unknown,
    title: string,
    url?: string | URL | null,
  ) {
    origPush!.call(this, state, title, url)
    shimStack = shimStack.slice(0, shimCursor + 1) // 포워드로부터 지우기 (실제 브라우저와 동일)
    shimStack.push({ hash: window.location.hash, state: window.history.state })
    shimCursor = shimStack.length - 1
  }

  window.history.replaceState = function (
    this: History,
    state: unknown,
    title: string,
    url?: string | URL | null,
  ) {
    origReplace!.call(this, state, title, url)
    const entry: ShimEntry = { hash: window.location.hash, state: window.history.state }
    if (shimStack.length === 0) {
      shimStack = [entry]
      shimCursor = 0
    } else {
      shimStack[shimCursor] = entry
    }
  }

  const shimGo = (delta: number) => {
    if (delta === 0 || shimStack.length === 0) return
    const next = Math.min(shimStack.length - 1, Math.max(0, shimCursor + delta))
    if (next === shimCursor) return
    shimCursor = next
    const entry = shimStack[next]
    if (!entry) return
    // 대상 엔트리 복원(state는 먼저 — router의 handlePop은 history.state를 읽음)
    // 그 다음 popstate 발생
    origReplace!.call(window.history, entry.state as object, '', shimTargetUrl(entry.hash))
    window.dispatchEvent(new PopStateEvent('popstate', { state: entry.state as object | null }))
  }

  window.history.go = (delta?: number) => {
    shimGo(delta ?? 0)
  }
  window.history.back = () => {
    shimGo(-1)
  }
  window.history.forward = () => {
    shimGo(1)
  }
}

export function resetHistoryShim() {
  shimStack = [{ hash: window.location.hash, state: window.history.state }]
  shimCursor = 0
}

export function restoreHistoryShim() {
  if (!shimInstalled) return
  if (origPush) window.history.pushState = origPush
  if (origReplace) window.history.replaceState = origReplace
  if (origGo) window.history.go = origGo
  if (origBack) window.history.back = origBack
  if (origForward) window.history.forward = origForward
  shimInstalled = false
  shimStack = []
  shimCursor = 0
}
