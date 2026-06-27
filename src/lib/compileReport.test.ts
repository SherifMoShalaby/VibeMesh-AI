import { describe, it, expect } from 'vitest'
import { structuralReport, buildAutoFixPrompt } from './compileReport'
import type { ScadParameter } from '../types'

const noParams: ScadParameter[] = []

const num = (name: string): ScadParameter => ({ name, kind: 'number', group: 'Dimensions', defaultValue: 1 })
const bool = (name: string): ScadParameter => ({ name, kind: 'bool', group: 'Options', defaultValue: true })

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

describe('structuralReport — OC-5 dead-module check', () => {
  it('flags an unused module head() (declared, never called)', () => {
    const code = [
      'module head() { cube(5); }', // declared
      'module body() { cylinder(d=10, h=20); }',
      'body();', // only body is called
    ].join('\n')
    const { issues } = structuralReport(code, noParams)
    expect(issues.some((i) => /Module `head\(\)` is declared but never called/.test(i))).toBe(true)
    expect(issues.some((i) => /`body\(\)`/.test(i))).toBe(false)
  })

  it('does NOT flag a module-scoped helper genuinely called from inside another module', () => {
    const code = [
      'module tooth() { cube([2, 2, 5]); }', // only called from inside gear()
      'module gear() { for (a = [0:30:359]) rotate([0, 0, a]) tooth(); }',
      'gear();',
    ].join('\n')
    const { issues } = structuralReport(code, noParams)
    expect(issues.some((i) => /never called/.test(i))).toBe(false)
  })

  it('does NOT flag pieces behind the part enum (each dispatched in the all-view)', () => {
    const code = [
      'part = "all"; // [all, base, lid]',
      'module base() { cube(20); }',
      'module lid() { cube([20, 20, 2]); }',
      'if (part == "all") { base(); translate([0, 0, 20]) lid(); }',
      'else if (part == "base") base();',
      'else if (part == "lid") lid();',
    ].join('\n')
    const partParam: ScadParameter = { name: 'part', kind: 'enum', group: 'Build plate', defaultValue: 'all', options: ['all', 'base', 'lid'] }
    const { issues } = structuralReport(code, [partParam])
    expect(issues.some((i) => /never called/.test(i))).toBe(false)
  })

  it('ignores a module name that only appears inside a comment', () => {
    const code = ['// module ghost() is gone', 'module box() { cube(5); }', 'box();'].join('\n')
    const { issues } = structuralReport(code, noParams)
    expect(issues.some((i) => /ghost/.test(i))).toBe(false)
  })
})

describe('structuralReport — OC-5 phantom-param check', () => {
  it('flags a declared param never referenced below the block', () => {
    const code = ['width = 60;', 'divider = true;', 'module box() { cube([width, width, 10]); }', 'box();'].join('\n')
    const { issues } = structuralReport(code, [num('width'), bool('divider')])
    expect(issues.some((i) => /Parameter `divider` is declared but never used/.test(i))).toBe(true)
    expect(issues.some((i) => /`width`/.test(i))).toBe(false)
  })

  it('does NOT flag a param consumed only by a derived value', () => {
    const code = ['width = 60;', 'wall = 2;', 'inner = width - 2 * wall;', 'module box() { cube([inner, inner, 10]); }', 'box();'].join('\n')
    const { issues } = structuralReport(code, [num('width'), num('wall')])
    expect(issues.some((i) => /never used/.test(i))).toBe(false)
  })

  it('does NOT flag a _-prefixed hidden probe knob', () => {
    const code = ['_debug = "off"; // [off, positives, negatives]', 'module box() { cube(5); }', 'box();'].join('\n')
    const probe: ScadParameter = { name: '_debug', kind: 'enum', group: 'Hidden', defaultValue: 'off', options: ['off', 'positives', 'negatives'] }
    const { issues } = structuralReport(code, [probe])
    expect(issues.some((i) => /never used/.test(i))).toBe(false)
  })

  it('does NOT flag the part enum itself as a phantom param', () => {
    const code = ['part = "all"; // [all, a]', 'module a() { cube(5); }', 'if (part == "all") a(); else if (part == "a") a();'].join('\n')
    const partParam: ScadParameter = { name: 'part', kind: 'enum', group: 'Build plate', defaultValue: 'all', options: ['all', 'a'] }
    const { issues } = structuralReport(code, [partParam])
    expect(issues.some((i) => /never used/.test(i))).toBe(false)
  })
})

describe('buildAutoFixPrompt — OC-8 figurative relief nudge', () => {
  it('nudges toward the relief floor on a figurative parse/trace failure', () => {
    const prompt = buildAutoFixPrompt("Parser error in line 22: syntax error")
    expect(/stylized-relief floor/.test(prompt)).toBe(true)
  })

  it('does not add the figurative nudge for a plain timeout', () => {
    const prompt = buildAutoFixPrompt('Render timed out')
    expect(/stylized-relief floor/.test(prompt)).toBe(false)
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
