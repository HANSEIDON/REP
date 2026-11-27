import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { format, remaining, status } from '../timer/timer'
import { useTimerInfo } from '../timer/bus'
import './RestBar.css'

/**
 * 전역 휴식 타이머 바 — 타이머가 running/paused/done이면
 * 어떤 탭에 있어도 TabBar 바로 위 슬림한 바로 남은 시간을 보여준다.
 * 탭을 누르면 운동 기록 화면(/log)으로 이동한다.
 *
 * - /log 화면에서는 화면 내 RestTimer가 담당하므로 숨김(중복 표시 제거)
 * - 250ms 틱은 running일 때만 동작, 진행라인은 transform(scaleX)만 사용
 */
export default function RestBar() {
  const info = useTimerInfo()
  const location = useLocation()
  const navigate = useNavigate()
  const [now, setNow] = useState(() => Date.now())

  const st = status(info.state, now)

  useEffect(() => {
    if (st !== 'running') return
    const t = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(t)
  }, [st])

  if (st === 'idle') return null
  if (location.pathname === '/log') return null

  const name = info.exerciseName ?? '운동'
  const rest = st === 'paused' ? (info.state.pausedRemaining ?? 0) : remaining(info.state, now)
  const total = info.restTotalMs
  const pct = total != null && total > 0 ? Math.max(0, Math.min(1, rest / total)) : null

  return (
    <div className="restbar" role="status" aria-live="polite">
      <button type="button" className="restbar__btn" onClick={() => navigate('/log', { replace: true })}>
        <span className="restbar__name">{name}</span>
        <span className="restbar__time">{st === 'done' ? '0:00' : format(rest)}</span>
        {st === 'done' && <span className="restbar__cta">휴식 끝 · 계속하기</span>}
      </button>
      {pct != null && st !== 'done' && (
        <span className="restbar__track" aria-hidden="true">
          <span className="restbar__fill" style={{ transform: `scaleX(${pct})` }} />
        </span>
      )}
    </div>
  )
}
