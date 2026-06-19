import { describe, it, expect } from 'vitest'
import {
  parseParameters,
  buildDefines,
  applyValuesToCode,
  extractScadBlock,
  extractIntent,
  stripIntentLine,
} from './params'
import type { ScadParameter } from '../types'

const byName = (params: ScadParameter[], name: string) => params.find((p) => p.name === name)

describe('parseParameters', () => {
  it('parses bool / slider / stepped-slider / string-enum / number-enum / bare number', () => {
    const code = [
      'flag = true;',
      'w = 10; // [5:50]',
      'fine = 1.5; // [0:0.5:50]',
      'mode = "a"; // [a, b, c]',
      'n = 2; // [1, 2, 3]',
      'x = 5;',
      'cube([w, w, x]);',
    ].join('\n')
    const p = parseParameters(code)

    expect(byName(p, 'flag')).toMatchObject({ kind: 'bool', defaultValue: true })
    expect(byName(p, 'w')).toMatchObject({ kind: 'slider', min: 5, max: 50, step: 1, defaultValue: 10 })
    expect(byName(p, 'fine')).toMatchObject({ kind: 'slider', min: 0, max: 50, step: 0.5 })
    expect(byName(p, 'mode')).toMatchObject({ kind: 'enum', options: ['a', 'b', 'c'], defaultValue: 'a' })
    expect(byName(p, 'n')).toMatchObject({ kind: 'enum', options: [1, 2, 3], defaultValue: 2 })
    expect(byName(p, 'x')).toMatchObject({ kind: 'number', defaultValue: 5 })
  })

  it('takes the description from a PRECEDING comment line', () => {
    const p = parseParameters('// toggle it\nflag = true;')
    expect(byName(p, 'flag')).toMatchObject({ kind: 'bool', description: 'toggle it' })
  })

  it('stops scanning where geometry begins', () => {
    const p = parseParameters('a = 1;\ncube([10,10,10]);\nb = 2;')
    expect(byName(p, 'a')).toBeTruthy()
    expect(byName(p, 'b')).toBeUndefined()
  })

  it('skips $fn/$fa/$fs and _-prefixed probe knobs', () => {
    const p = parseParameters('$fn = 64;\n_debug = "off"; // [off, on]\nr = 5;')
    expect(byName(p, '$fn')).toBeUndefined()
    expect(byName(p, '_debug')).toBeUndefined()
    expect(byName(p, 'r')).toBeTruthy()
  })

  it('guards against prototype-polluting names', () => {
    const p = parseParameters('__proto__ = 1;\nconstructor = 2;\nok = 3;')
    expect(byName(p, '__proto__')).toBeUndefined()
    expect(byName(p, 'constructor')).toBeUndefined()
    expect(byName(p, 'ok')).toBeTruthy()
  })

  it('assigns group headers and stops at a [Hidden] group', () => {
    const code = '/* [Size] */\nw = 10;\n/* [Hidden] */\nsecret = 5;'
    const p = parseParameters(code)
    expect(byName(p, 'w')).toMatchObject({ group: 'Size' })
    expect(byName(p, 'secret')).toBeUndefined()
  })

  it('sanitizes a malformed (reversed) range so sliders never break', () => {
    const p = parseParameters('w = 10; // [50:5]')
    expect(byName(p, 'w')).toMatchObject({ kind: 'slider', min: 5, max: 50 })
  })
})

describe('buildDefines', () => {
  const params = parseParameters('w = 10; // [5:50]\nmode = "a"; // [a, b, c]\nflag = true;')
  it('emits -D only for values that differ from the default, quoting strings', () => {
    const args = buildDefines(params, { w: 20, mode: 'a', flag: true })
    expect(args).toEqual(['-D', 'w=20']) // mode + flag unchanged → omitted
  })
  it('quotes a changed string and serializes a bool', () => {
    expect(buildDefines(params, { mode: 'b', flag: false })).toEqual(['-D', 'mode="b"', '-D', 'flag=false'])
  })
  it('never emits a non-finite number define', () => {
    expect(buildDefines(params, { w: NaN })).toEqual([])
  })
})

describe('applyValuesToCode', () => {
  it('rewrites only changed assignment lines', () => {
    const code = 'w = 10; // [5:50]\nh = 5;\ncube([w,w,h]);'
    const params = parseParameters(code)
    const out = applyValuesToCode(code, params, { w: 20 })
    expect(out).toMatch(/^w = 20;/m)
    expect(out).toMatch(/^h = 5;/m)
  })
})

describe('extractScadBlock', () => {
  it('extracts one scad block and strips it from the prose', () => {
    const text = 'Here is your model.\n\n```scad\ncube([10,10,10]);\n```\n\nEnjoy.'
    const { code, prose, blockCount } = extractScadBlock(text)
    expect(code).toBe('cube([10,10,10]);')
    expect(blockCount).toBe(1)
    expect(prose).toBe('Here is your model.\n\nEnjoy.')
  })

  it('counts only scad-tagged fences toward the contract (an untagged fence is not a 2nd block)', () => {
    const text = '```scad\ncube([1,1,1]);\n```\n\nPrint settings:\n```\nlayer 0.2mm\n```'
    const { code, blockCount } = extractScadBlock(text)
    expect(blockCount).toBe(1)
    expect(code).toBe('cube([1,1,1]);')
  })

  it('returns the longest block and a >1 count when two scad blocks appear', () => {
    const text = '```scad\nA;\n```\n```scad\nlonger_program_here();\n```'
    const { code, blockCount } = extractScadBlock(text)
    expect(blockCount).toBe(2)
    expect(code).toBe('longer_program_here();')
  })

  it('returns null code and count 0 when there is no block', () => {
    const { code, blockCount, prose } = extractScadBlock('just prose, no code')
    expect(code).toBeNull()
    expect(blockCount).toBe(0)
    expect(prose).toBe('just prose, no code')
  })
})

describe('extractIntent', () => {
  it('parses a valid INTENT line', () => {
    const i = extractIntent('PLAN: a box.\nINTENT: {"form":"single","archetype":"box","domainTags":["Box"]}')
    expect(i?.form).toBe('single')
    expect(i?.archetype).toBe('box')
    expect(i?.domainTags).toEqual(['box']) // lowercased
  })

  it('returns null when absent, malformed, or missing the required form', () => {
    expect(extractIntent('no intent here')).toBeNull()
    expect(extractIntent('INTENT: {not json}')).toBeNull()
    expect(extractIntent('INTENT: {"archetype":"box"}')).toBeNull() // no form
  })

  it('drops unknown enum values but keeps a valid form', () => {
    const i = extractIntent('INTENT: {"form":"kit","facetVerdict":"bogus"}')
    expect(i?.form).toBe('kit')
    expect(i?.facetVerdict).toBeUndefined()
  })

  it('parses statedDimensions and drops non-finite values', () => {
    const i = extractIntent('INTENT: {"form":"single","statedDimensions":[{"value":50,"unit":"mm","feature":"h"},{"value":"x"}]}')
    expect(i?.statedDimensions).toHaveLength(1)
    expect(i?.statedDimensions?.[0]).toMatchObject({ value: 50, unit: 'mm', feature: 'h' })
  })

  it('lets the last INTENT line win', () => {
    const i = extractIntent('INTENT: {"form":"single"}\nINTENT: {"form":"kit"}')
    expect(i?.form).toBe('kit')
  })
})

describe('stripIntentLine', () => {
  it('removes the INTENT line but preserves the rest of the prose', () => {
    const out = stripIntentLine('Here is the plan.\nINTENT: {"form":"single"}\nDone.')
    expect(out).not.toMatch(/INTENT:/)
    expect(out).toMatch(/Here is the plan\./)
    expect(out).toMatch(/Done\./)
  })
})
