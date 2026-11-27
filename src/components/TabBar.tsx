import { Link, useLocation, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import './TabBar.css'

const icons = {
  home: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M10 21v-6h4v6" />
    </svg>
  ),
  exercises: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 8v8M17 8v8M4 10v4M20 10v4M7 12h10" />
    </svg>
  ),
  history: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16M4 12h16M4 17h16" />
      <circle cx="9" cy="7" r="1.8" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="1.8" fill="currentColor" stroke="none" />
      <circle cx="8" cy="17" r="1.8" fill="currentColor" stroke="none" />
    </svg>
  ),
} as const

const tabs = [
  { to: '/', label: '홈', icon: icons.home, end: true },
  { to: '/exercises', label: '운동', icon: icons.exercises, end: false },
  { to: '/history', label: '기록', icon: icons.history, end: false },
  { to: '/settings', label: '설정', icon: icons.settings, end: false },
] as const

/**
 * Tab switch = replace history (no back-stack pile-up).
 * `end` only affects active matching, same as NavLink.
 */
function TabLink({
  to,
  end,
  className,
  children,
}: {
  to: string
  end?: boolean
  className: string
  children: ReactNode
}) {
  const nav = useNavigate()
  const loc = useLocation()
  const active = end ? loc.pathname === to : loc.pathname.startsWith(to)
  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      className={className + (active ? ' tabbar__item--active' : '')}
      onClick={(e) => {
        // let modifier clicks / right-click fall through to default
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        e.preventDefault()
        if (active) {
          window.scrollTo({ top: 0 })
        } else {
          nav(to, { replace: true })
        }
      }}
    >
      {children}
    </Link>
  )
}

export function TabBar() {
  return (
    <nav className="tabbar" aria-label="주요 메뉴">
      {tabs.map((t) => (
        <TabLink key={t.to} to={t.to} end={t.end} className="tabbar__item">
          {t.icon}
          <span className="tabbar__label">{t.label}</span>
        </TabLink>
      ))}
    </nav>
  )
}
