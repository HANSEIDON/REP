import { useEffect, useState } from 'react'
import { getExercisesSync, loadExercises, type Exercise } from './exerciseRepo'

export type ExercisesState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; list: Exercise[] }

/** 운동 마스터 데이터를 한 번 로드하고 상태를 노출 */
export function useExercises(): ExercisesState {
  // 모듈 cache가 이미 있으면 '로딩 중…' 플래시 없이 즉시 ready (탭 keep-alive 리마운트 방지)
  const [state, setState] = useState<ExercisesState>(() => {
    const cached = getExercisesSync()
    return cached ? { status: 'ready', list: cached } : { status: 'loading' }
  })

  useEffect(() => {
    let alive = true
    loadExercises()
      .then((list) => {
        if (alive) setState({ status: 'ready', list })
      })
      .catch((e: unknown) => {
        if (alive)
          setState({
            status: 'error',
            message: e instanceof Error ? e.message : String(e),
          })
      })
    return () => {
      alive = false
    }
  }, [])

  return state
}
