import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
}

/**
 * 렌더 오류를 "검은 화면"이 아닌 가독성 있는 메시지로 변환.
 * 크래시의 정확한 위치를 console + 화면에서 진단할 수 있게 해준다.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[REP] 렌더 오류:', error, '\n', info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="page" style={{ padding: 24 }}>
          <h1 className="page__title">오류가 발생했습니다</h1>
          <p className="state-msg">{String(this.state.error?.message ?? this.state.error)}</p>
          <button type="button" className="btn" onClick={() => window.location.reload()}>
            새로고침
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
