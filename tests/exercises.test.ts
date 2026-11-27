import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  parseExercises,
  searchExercises,
  filterByMuscle,
  filterByEquipment,
  filterByType,
  getExercise,
  substitutesFor,
  type Exercise,
  type ExerciseType,
} from '../src/data/exerciseRepo'

const raw = readFileSync('public/exercises/exercises.json', 'utf8')

describe('parseExercises', () => {
  it('parses 415 exercises with required fields', () => {
    const list = parseExercises(JSON.parse(raw))
    expect(list).toHaveLength(415)
    for (const ex of list) {
      expect(ex.id).toBeTruthy()
      expect(ex.name).toBeTruthy()
      expect(ex.nameKo).toBeTruthy()
      expect(Array.isArray(ex.muscles.primary)).toBe(true)
      // start/end (359), mid (11), hold (45) 중 최소 1개
      expect(ex.images.start ?? ex.images.hold ?? ex.images.mid).toMatch(/\.webp$/)
    }
  })
})

describe('searchExercises (KO + EN + alias, case/space-insensitive)', () => {
  const list = parseExercises(JSON.parse(raw))

  it('finds squats by Korean name', () => {
    const ids = searchExercises(list, '스쿼트').map((e) => e.id)
    expect(ids).toContain('bodyweight-squat')
    expect(ids).toContain('barbell-split-squat')
  })

  it('finds bench press by English name, case-insensitive', () => {
    const r = searchExercises(list, 'BENCH press')
    expect(r.map((e) => e.id)).toContain('bench-press')
  })

  it('ignores spaces in Korean queries', () => {
    const a = searchExercises(list, '벤치프레스').map((e) => e.id)
    const b = searchExercises(list, '벤치 프레스').map((e) => e.id)
    expect(a).toEqual(b)
    expect(a.length).toBeGreaterThan(0)
  })

  it('matches alias text', () => {
    const r = searchExercises(list, 'curl')
    expect(r.some((e) => e.id === 'barbell-curl')).toBe(true)
  })

  it('empty query returns everything', () => {
    expect(searchExercises(list, '')).toHaveLength(415)
    expect(searchExercises(list, '   ')).toHaveLength(415)
  })

  it('unknown query returns empty', () => {
    expect(searchExercises(list, 'zzz-no-such')).toHaveLength(0)
  })
})

describe('filterByMuscle / filterByEquipment', () => {
  const list = parseExercises(JSON.parse(raw))

  it('filters quads to include squats', () => {
    const ids = filterByMuscle(list, 'quads').map((e) => e.id)
    expect(ids).toContain('bodyweight-squat')
    for (const id of ids) {
      const ex = list.find((e) => e.id === id)!
      expect(ex.muscles.primary).toContain('quads')
    }
  })

  it('barbell equipment filter includes bench press', () => {
    const ids = filterByEquipment(list, 'barbell').map((e) => e.id)
    expect(ids).toContain('bench-press')
  })
})

describe('filterByType (전체/기구/맨몸)', () => {
  const list = parseExercises(JSON.parse(raw))

  it("'all' returns the entire list untouched", () => {
    expect(filterByType(list, 'all')).toHaveLength(415)
  })

  it("'equipment' keeps only exercises with non-empty equipment", () => {
    const r = filterByType(list, 'equipment')
    expect(r.length).toBeGreaterThan(0)
    for (const ex of r) {
      expect(ex.equipment.length).toBeGreaterThan(0)
    }
  })

  it("'bodyweight' keeps only exercises with empty equipment", () => {
    const r = filterByType(list, 'bodyweight')
    expect(r.length).toBeGreaterThan(0)
    for (const ex of r) {
      expect(ex.equipment).toEqual([])
    }
  })

  it('partitions the dataset exactly (disjoint, union = all)', () => {
    const eq = new Set(filterByType(list, 'equipment').map((e) => e.id))
    const bw = filterByType(list, 'bodyweight').map((e) => e.id)
    for (const id of bw) {
      expect(eq.has(id)).toBe(false)
    }
    expect(eq.size + bw.length).toBe(415)
  })

  it('matches the real data split: 293 equipment / 122 bodyweight', () => {
    expect(filterByType(list, 'equipment')).toHaveLength(293)
    expect(filterByType(list, 'bodyweight')).toHaveLength(122)
  })

  it('classifies known exercises correctly', () => {
    const eqIds = new Set(filterByType(list, 'equipment').map((e) => e.id))
    expect(eqIds.has('bench-press')).toBe(true) // 바벨
    expect(eqIds.has('bodyweight-squat')).toBe(false) // 맨몸
  })

  it('handles empty list for every type', () => {
    expect(filterByType([], 'all')).toEqual([])
    expect(filterByType([], 'equipment')).toEqual([])
    expect(filterByType([], 'bodyweight')).toEqual([])
  })

  it('composes with search + muscle filters (AND, order-independent)', () => {
    const combo1 = filterByMuscle(searchExercises(filterByType(list, 'bodyweight'), '스쿼트'), 'quads')
    const combo2 = filterByType(filterByMuscle(searchExercises(list, '스쿼트'), 'quads'), 'bodyweight')
    expect(combo1.map((e) => e.id)).toEqual(combo2.map((e) => e.id))
    expect(combo1.map((e) => e.id)).toContain('bodyweight-squat')
    for (const ex of combo1) {
      expect(ex.equipment).toEqual([])
      expect(ex.muscles.primary).toContain('quads')
    }
  })

  it('returns empty when the combination has no matches', () => {
    // 데이터셋에서 모든 근육 부위는 기구/맨몸 양쪽이 존재 →
    // 빈 결과는 존재하지 않는 검색어 조합으로 검증
    const r = filterByType(searchExercises(list, '존재하지않는운동zzz'), 'bodyweight')
    expect(r).toHaveLength(0)
  })

  it('exported ExerciseType covers the 3 filter values', () => {
    const types: ExerciseType[] = ['all', 'equipment', 'bodyweight']
    expect(types).toHaveLength(3)
  })
})

describe('getExercise', () => {
  const list = parseExercises(JSON.parse(raw))
  it('returns exact id', () => {
    expect(getExercise(list, 'bench-press')?.name).toBe('Barbell Bench Press')
  })
  it('returns undefined for unknown id', () => {
    expect(getExercise(list, 'nope')).toBeUndefined()
  })
})

// ---- substitutesFor (대체 운동) ----

function mkEx(id: string, primary: string[], nameKo = `운동 ${id}`): Exercise {
  return {
    id,
    name: `Exercise ${id}`,
    nameKo,
    aliases: [],
    equipment: [],
    equipmentLabel: 'Bodyweight',
    muscles: { primary, secondary: [] },
    movementPattern: 'squat',
    category: 'compound',
    unilateral: false,
    level: 'beginner',
    view: 'front',
    frames: [],
    images: { start: '/exercises/images/x/webp' },
  }
}

describe('substitutesFor (대체 운동)', () => {
  const list = parseExercises(JSON.parse(raw))

  it('real data: 벤치프레스의 대체 운동은 primary 근육을 공유하고 자기 자신을 제외', () => {
    const ex = list.find((e) => e.id === 'bench-press')!
    const subs = substitutesFor(list, ex)
    expect(subs.length).toBeGreaterThan(0)
    expect(subs.map((s) => s.id)).not.toContain('bench-press')
    for (const s of subs) {
      expect(ex.muscles.primary.some((m) => s.muscles.primary.includes(m))).toBe(true)
    }
  })

  it('real data: limit을 정확히 준수', () => {
    const ex = list.find((e) => e.id === 'bench-press')!
    expect(substitutesFor(list, ex, 2)).toHaveLength(2)
    expect(substitutesFor(list, ex, 6)).toHaveLength(6)
  })

  it('real data: 대부분의 운동(>=400/415)은 대체 운동이 최소 1개 이상', () => {
    let n = 0
    for (const ex of list) {
      if (substitutesFor(list, ex).length > 0) n++
    }
    expect(n).toBeGreaterThanOrEqual(400)
  })

  it('synthetic: 공유 primary 근육 개수 내림차순 정렬', () => {
    const a = mkEx('a', ['chest', 'back'])
    const b = mkEx('b', ['chest'])
    const c = mkEx('c', ['chest', 'back', 'core'])
    const d = mkEx('d', ['calves']) // 공유 없음
    const fake = [a, b, c, d]
    expect(substitutesFor(fake, a, 10).map((e) => e.id)).toEqual(['c', 'b'])
  })

  it('synthetic: 공유 개수가 같으면 nameKo 정렬 (결정적)', () => {
    const a = mkEx('a', ['chest'])
    const b = mkEx('b', ['chest'], '가슴 운동')
    const c = mkEx('c', ['chest'], '나 운동')
    expect(substitutesFor([a, b, c], a, 10).map((e) => e.id)).toEqual(['b', 'c'])
  })

  it('synthetic: 공유 primary 근육이 없으면 빈 배열', () => {
    const a = mkEx('a', ['chest'])
    const b = mkEx('b', ['calves'])
    expect(substitutesFor([a, b], a)).toHaveLength(0)
  })

  it('synthetic: primary 근육이 비어 있으면 빈 배열', () => {
    const a = mkEx('a', [])
    const b = mkEx('b', ['chest'])
    expect(substitutesFor([a, b], a)).toHaveLength(0)
  })

  it('empty list → 빈 배열 (자기 자신도 제외되는 경계)', () => {
    const a = mkEx('a', ['chest'])
    expect(substitutesFor([a], a)).toHaveLength(0)
    expect(substitutesFor([], a)).toHaveLength(0)
  })
})
