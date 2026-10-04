import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// Contraste WCAG a partir dos tokens reais do style.css: texto 4,5:1 e foco/controles 3:1.
const css = readFileSync(path.resolve(import.meta.dirname, '..', '..', 'src', 'renderer', 'src', 'style.css'), 'utf8')

function token(name: string, seen = new Set<string>()): string {
  const match = new RegExp(`--${name}:\\s*([^;]+);`).exec(css)
  const value = match?.[1]?.trim()
  if (value === undefined) throw new Error(`token ausente: ${name}`)
  const alias = /^var\(--([\w-]+)\)$/.exec(value)
  if (alias?.[1] !== undefined) {
    if (seen.has(name)) throw new Error(`alias circular: ${name}`)
    seen.add(name)
    return token(alias[1], seen)
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) throw new Error(`token não literal: ${name}`)
  return value.toLowerCase()
}

function luminance(hex: string): number {
  const value = hex.replace('#', '')
  const channels = [0, 2, 4]
    .map((index) => parseInt(value.slice(index, index + 2), 16) / 255)
    .map((channel) => (channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4)))
  return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0)
}

function ratio(foreground: string, background: string): number {
  const first = luminance(foreground)
  const second = luminance(background)
  const lighter = Math.max(first, second)
  const darker = Math.min(first, second)
  return (lighter + 0.05) / (darker + 0.05)
}

describe('contraste dos tokens da interface', () => {
  it('texto principal e secundário mantêm 4,5:1 sobre superfícies', () => {
    const ink = token('color-ink')
    const muted = token('color-muted')
    const surface = token('color-surface')
    const page = token('color-page')
    expect(ratio(ink, surface)).toBeGreaterThanOrEqual(4.5)
    expect(ratio(ink, page)).toBeGreaterThanOrEqual(4.5)
    expect(ratio(muted, surface)).toBeGreaterThanOrEqual(4.5)
    expect(ratio(muted, page)).toBeGreaterThanOrEqual(4.5)
  })

  it('botões, badges e feedbacks mantêm 4,5:1', () => {
    expect(ratio('#ffffff', token('color-primary'))).toBeGreaterThanOrEqual(4.5)
    expect(ratio(token('color-primary-strong'), token('color-primary-soft'))).toBeGreaterThanOrEqual(4.5)
    expect(ratio('#ffffff', token('color-danger'))).toBeGreaterThanOrEqual(4.5)
    expect(ratio(token('color-danger'), '#fef3f2')).toBeGreaterThanOrEqual(4.5)
    expect(ratio('#7a2e0e', '#fef0c7')).toBeGreaterThanOrEqual(4.5)
    expect(ratio('#05603a', '#ecfdf3')).toBeGreaterThanOrEqual(4.5)
    expect(ratio('#93370d', '#fffaeb')).toBeGreaterThanOrEqual(4.5)
  })

  it('anéis de foco e bordas de controle mantêm 3:1', () => {
    expect(ratio(token('color-focus-ring'), token('color-surface'))).toBeGreaterThanOrEqual(3)
    expect(ratio(token('color-focus-ring'), token('color-page'))).toBeGreaterThanOrEqual(3)
    expect(ratio(token('color-control-border'), token('color-surface'))).toBeGreaterThanOrEqual(3)
  })
})
