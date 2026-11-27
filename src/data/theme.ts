import { getSettings, updateSettings } from './db'

/** 화면 + flash 방지 스크립트(localStorage) + theme-color 동기화 */
export function applyTheme(theme: 'dark' | 'light', accent: 'orange' | 'blue' | 'lime') {
  const el = document.documentElement
  el.dataset.theme = theme
  el.dataset.accent = accent
  try {
    localStorage.setItem('rep.theme', theme)
    localStorage.setItem('rep.accent', accent)
  } catch {
    /* storage 불가 시 무시 */
  }
  const m = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (m) m.content = theme === 'light' ? '#FAFAF8' : '#0F0F11'
}

/** 앱 시작 시 IDB 설정을 화면에 적용 (localStorage 동기화 포함) */
export async function applyStoredTheme() {
  const s = await getSettings()
  applyTheme(s.theme, s.accent)
}

export async function setTheme(theme: 'dark' | 'light') {
  const s = await updateSettings({ theme })
  applyTheme(s.theme, s.accent)
}

export async function setAccent(accent: 'orange' | 'blue' | 'lime') {
  const s = await updateSettings({ accent })
  applyTheme(s.theme, s.accent)
}
