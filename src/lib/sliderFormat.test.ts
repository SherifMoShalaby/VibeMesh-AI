import { describe, it, expect } from 'vitest'
import { formatDot, parseDot, roundToStep } from './sliderFormat'

describe('formatDot (UIUX-4)', () => {
  it('formats integers without a decimal point', () => {
    expect(formatDot(5)).toBe('5')
    expect(formatDot(0)).toBe('0')
    expect(formatDot(-10)).toBe('-10')
  })

  it('always uses a dot, not a comma, as the decimal separator', () => {
    expect(formatDot(1.5)).toBe('1.5')
    expect(formatDot(0.25)).toBe('0.25')
    expect(formatDot(3.14159)).toBe('3.14159')
  })

  it('does not add thousands separators (useGrouping=false)', () => {
    expect(formatDot(1000)).toBe('1000')
    expect(formatDot(12345.6)).toBe('12345.6')
  })

  it('preserves precision up to 10 fractional digits', () => {
    expect(formatDot(0.1)).toBe('0.1')
    expect(formatDot(1.25)).toBe('1.25')
    expect(formatDot(0.0000000001)).toBe('0.0000000001')
  })
})

describe('parseDot (UIUX-4)', () => {
  it('parses a dot-separated string', () => {
    expect(parseDot('1.5')).toBe(1.5)
    expect(parseDot('3.14')).toBe(3.14)
    expect(parseDot('0')).toBe(0)
  })

  it('parses a comma-separated string (comma-locale keyboard input)', () => {
    expect(parseDot('1,5')).toBe(1.5)
    expect(parseDot('3,14')).toBe(3.14)
  })

  it('parses plain integers', () => {
    expect(parseDot('10')).toBe(10)
    expect(parseDot('-5')).toBe(-5)
  })

  it('returns NaN for non-numeric strings', () => {
    expect(parseDot('abc')).toBeNaN()
    expect(parseDot('')).toBeNaN()
  })
})

describe('roundToStep', () => {
  it('returns the number unchanged when step is falsy', () => {
    expect(roundToStep(1.234, undefined)).toBe(1.234)
    expect(roundToStep(1.234, 0)).toBe(1.234)
  })

  it('rounds to an integer step', () => {
    expect(roundToStep(7.3, 1)).toBe(7)
    expect(roundToStep(7.7, 1)).toBe(8)
  })

  it('rounds to a fractional step and preserves decimal precision', () => {
    expect(roundToStep(1.6, 0.5)).toBe(1.5)
    expect(roundToStep(1.75, 0.5)).toBe(2)
    expect(roundToStep(0.33, 0.1)).toBeCloseTo(0.3)
  })

  it('returns the number unchanged for a non-finite step', () => {
    expect(roundToStep(3.7, NaN)).toBe(3.7)
    expect(roundToStep(3.7, Infinity)).toBe(3.7)
  })
})
