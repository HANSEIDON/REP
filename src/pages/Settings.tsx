import { useCallback, useEffect, useRef, useState } from 'react'
import {
  exportAll,
  getSettings,
  importAll,
  updateSettings,
  type AppSettings,
} from '../data/db'
import { setAccent, setTheme } from '../data/theme'
import './settings.css'

type Msg = { kind: 'ok' | 'err'; text: string } | null

const ACCENTS: { id: AppSettings['accent']; label: string }[] = [
  { id: 'orange', label: '주황' },
  { id: 'blue', label: '파랑' },
  { id: 'lime', label: '라임' },
]

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export default function Settings() {
  const [s, setS] = useState<AppSettings | null>(null)
  const [msg, setMsg] = useState<Msg>(null)
  const [est, setEst] = useState<{ usage: number; quota: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void (async () => {
      const settings = await getSettings()
      setS(settings)
      try {
        if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
          const e = await navigator.storage.estimate()
          setEst({ usage: e.usage ?? 0, quota: e.quota ?? 0 })
        }
      } catch {
        /* estimate 미지원 */
      }
    })()
  }, [])

  const changeTheme = useCallback(
    async (theme: 'dark' | 'light') => {
      await setTheme(theme)
      setS((p) => (p ? { ...p, theme } : p))
      setMsg(null)
    },
    [],
  )

  const changeAccent = useCallback(
    async (accent: AppSettings['accent']) => {
      await setAccent(accent)
      setS((p) => (p ? { ...p, accent } : p))
      setMsg(null)
    },
    [],
  )

  const changeUnit = useCallback(async (unit: 'kg' | 'lb') => {
    const next = await updateSettings({ unit })
    setS(next)
    setMsg(null)
  }, [])

  const changeSound = useCallback(async (timerSound: boolean) => {
    const next = await updateSettings({ timerSound })
    setS(next)
    setMsg(null)
  }, [])

  const doExport = useCallback(async () => {
    setBusy(true)
    setMsg(null)
    try {
      const json = await exportAll()
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const d = new Date()
      a.href = url
      a.download = `rep-backup-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 4000)
      setMsg({ kind: 'ok', text: '백업 파일을 내려받기 시작했습니다.' })
    } catch (e) {
      setMsg({ kind: 'err', text: `내보내기에 실패했습니다: ${e instanceof Error ? e.message : String(e)}` })
    } finally {
      setBusy(false)
    }
  }, [])

  const doImport = useCallback(async (file: File) => {
    setBusy(true)
    setMsg(null)
    try {
      const text = await file.text()
      await importAll(text)
      const next = await getSettings()
      setS(next)
      await setTheme(next.theme)
      await setAccent(next.accent)
      setMsg({ kind: 'ok', text: '데이터를 복원했습니다. 기존 기록은 덮어써집니다.' })
    } catch (e) {
      setMsg({
        kind: 'err',
        text: `복원에 실패했습니다: ${e instanceof Error ? e.message : '파형이 올바르지 않은 JSON입니다.'}`,
      })
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }, [])

  if (!s) {
    return (
      <div className="page">
        <h1 className="page__title">설정</h1>
        <p className="state-msg">설정 불러오는 중…</p>
      </div>
    )
  }

  return (
    <div className="page">
      <div>
        <h1 className="page__title">설정</h1>
      </div>

      {/* 외관 */}
      <section className="section">
        <h2 className="section__title">외관</h2>

        <div className="row">
          <span className="row__label">테마</span>
          <div className="seg" role="radiogroup" aria-label="테마">
            <button
              type="button"
              role="radio"
              aria-checked={s.theme === 'dark'}
              className={`seg__btn${s.theme === 'dark' ? ' is-on' : ''}`}
              onClick={() => void changeTheme('dark')}
            >
              다크
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={s.theme === 'light'}
              className={`seg__btn${s.theme === 'light' ? ' is-on' : ''}`}
              onClick={() => void changeTheme('light')}
            >
              라이트
            </button>
          </div>
        </div>

        <div className="row">
          <span className="row__label">색상</span>
          <div className="swatches" role="radiogroup" aria-label="accent color">
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                type="button"
                role="radio"
                aria-checked={s.accent === a.id}
                title={a.label}
                className={`swatch swatch--${a.id}${s.accent === a.id ? ' is-on' : ''}`}
                onClick={() => void changeAccent(a.id)}
              />
            ))}
          </div>
        </div>

        <div className="row">
          <span className="row__label">단위</span>
          <div className="seg" role="radiogroup" aria-label="무게 단위">
            <button
              type="button"
              role="radio"
              aria-checked={s.unit === 'kg'}
              className={`seg__btn${s.unit === 'kg' ? ' is-on' : ''}`}
              onClick={() => void changeUnit('kg')}
            >
              kg
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={s.unit === 'lb'}
              className={`seg__btn${s.unit === 'lb' ? ' is-on' : ''}`}
              onClick={() => void changeUnit('lb')}
            >
              lb
            </button>
          </div>
        </div>
      </section>

      {/* 휴식 타이머 */}
      <section className="section">
        <h2 className="section__title">휴식 타이머</h2>

        <div className="row">
          <span className="row__label">타이머 알림음</span>
          <button
            type="button"
            role="switch"
            aria-checked={s.timerSound}
            className={`switch${s.timerSound ? ' is-on' : ''}`}
            onClick={() => void changeSound(!s.timerSound)}
          >
            <span className="switch__knob" />
            <span className="switch__label">{s.timerSound ? '켜짐' : '꺼짐'}</span>
          </button>
        </div>
        <p className="hint">알림음은 화면이 켜져 있을 때만 울립니다. 잠금·백그라운드에서는 iOS가 제한할 수 있습니다.</p>
      </section>

      {/* 데이터 */}
      <section className="section">
        <h2 className="section__title">데이터</h2>

        <div className="data-btns">
          <button type="button" className="btn--sm" disabled={busy} onClick={() => void doExport()}>
            JSON 내보내기
          </button>
          <button type="button" className="btn--sm" disabled={busy} onClick={() => fileRef.current?.click()}>
            JSON 복원
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void doImport(f)
            }}
          />
        </div>

        {est && (
          <p className="hint">
            저장공간: {fmtBytes(est.usage)} / {fmtBytes(est.quota)} 사용
          </p>
        )}
      </section>

      {msg && <p className={`state-msg${msg.kind === 'err' ? ' state-msg--err' : ''}`}>{msg.text}</p>}
    </div>
  )
}
