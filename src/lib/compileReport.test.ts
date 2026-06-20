import { describe, it, expect } from 'vitest'
import { structuralReport } from './compileReport'
import type { ScadParameter } from '../types'

const noParams: ScadParameter[] = []

describe('structuralReport — global $fn guard', () => {
  it('flags a top-level positive global $fn (defeats the quality presets)', () => {
    const { issues } = structuralReport('$fn = 24;\ncube(10);\n', noParams)
    expect(issues.some((i) => /global `\$fn = 24`/.test(i))).toBe(true)
  })

  it('does not flag $fn = 0 (the preset auto value, harmless)', () => {
    const { issues } = structuralReport('$fn = 0;\ncube(10);\n', noParams)
    expect(issues.some((i) => /\$fn/.test(i))).toBe(false)
  })

  it('does not flag a per-call $fn inside a module call (hex socket)', () => {
    const { issues } = structuralReport('cylinder(d = 6, h = 4, $fn = 6);\n', noParams)
    expect(issues.some((i) => /\$fn/.test(i))).toBe(false)
  })

  it('does not flag a module-scoped $fn (inside braces)', () => {
    const code = 'module hex() {\n  $fn = 6;\n  cylinder(d = 6, h = 4);\n}\nhex();\n'
    const { issues } = structuralReport(code, noParams)
    expect(issues.some((i) => /\$fn/.test(i))).toBe(false)
  })

  it('ignores a $fn that only appears in a comment', () => {
    const { issues } = structuralReport('// never set $fn = 24; globally\ncube(10);\n', noParams)
    expect(issues.some((i) => /\$fn/.test(i))).toBe(false)
  })
})

describe('structuralReport — existing checks still pass (regression)', () => {
  it('flags zero-clearance mating parts', () => {
    const { issues } = structuralReport('peg_d = 6;\nbore_d = 6;\ncube(10);\n', noParams)
    expect(issues.some((i) => /zero clearance|fuse/i.test(i))).toBe(true)
  })

  it('a clean program with a real fit clearance yields no issues', () => {
    const { issues } = structuralReport('wall = 2;\npeg_d = 6;\nbore_d = 6.3;\ncube(10);\n', noParams)
    expect(issues).toEqual([])
  })
})
