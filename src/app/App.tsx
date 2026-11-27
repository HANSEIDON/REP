import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import './App.css'
import { TabBar } from '../components/TabBar'
import Home from '../pages/Home'
import Exercises from '../pages/Exercises'
import History from '../pages/History'
import Settings from '../pages/Settings'
import ExerciseDetail from '../pages/ExerciseDetail'
import WorkoutLog from '../pages/WorkoutLog'
import RestBar from './RestBar'
import { ErrorBoundary } from './ErrorBoundary'

/** 4-tab shell: content scrolls, tab bar fixed to bottom safe area.
 * Keep-alive: 4개 탭 페이지를 모두 마운트해 두고 active 라우트만 hidden으로
 * 전환 — 탭 이동 시 리마운트 없이 스크롤·입력·타이머 상태가 유지된다. */
const TABS = [
  { path: '/', page: Home },
  { path: '/exercises', page: Exercises },
  { path: '/history', page: History },
  { path: '/settings', page: Settings },
] as const

function TabFrame() {
  const location = useLocation()
  return (
    <div className="shell">
      <main className="shell__main">
        {TABS.map(({ path, page: Page }) => (
          <div key={path} className="tab-keep" hidden={location.pathname !== path}>
            <Page />
          </div>
        ))}
        {/* 운동 기록 화면 — 4개 탭처럼 keep-alive.
            다른 탭으로 이동해도 세트 기록·휴식 타이머·스크롤 상태가 유지된다. */}
        <div className="tab-keep" hidden={location.pathname !== '/log'}>
          <WorkoutLog />
        </div>
      </main>
      <RestBar />
      <TabBar />
    </div>
  )
}

export default function App() {
  return (
    <HashRouter>
      <ErrorBoundary>
      <Routes>
        <Route element={<TabFrame />}>
          {/* TabFrame이 직접 4페이지 렌더(keep-alive) — URL 네비게이션 시맨틱만 유지 */}
          <Route index element={null} />
          <Route path="exercises" element={null} />
          <Route path="history" element={null} />
          <Route path="settings" element={null} />
          {/* log은 TabFrame의 자식 — URL이 /log가 되도 keep-alive 탭들이 유지된다 */}
          <Route path="log" element={null} />
        </Route>
        {/* full-screen modes (outside tab bar) */}
        <Route path="exercise/:id" element={<ExerciseDetail />} />
        {/* 알 수 없는 URL은 홈으로 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </ErrorBoundary>
    </HashRouter>
  )
}
