/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs'
import { resolve, relative } from 'node:path'
import { expect, it } from 'vitest'

const source = resolve('src')
const retired = /gradient-bg|gradient-text|animated-gradient|icon-gradient-|hover-lift|\bglass\b|from-purple|to-purple|from-violet|to-violet|from-indigo|canvas-confetti|animate-float|animate-slide-up|animate-fade-in|animate-scale-in|blur-2xl|blur-xl|shadow-primary\//g

function findings(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = resolve(directory, entry.name)
    if (entry.isDirectory()) return findings(file)
    if (entry.name.includes('.test.') || !/\.(css|tsx?)$/.test(entry.name)) return []
    return [...new Set(readFileSync(file, 'utf8').match(retired))].map(term => relative(source, file) + ' — ' + term)
  })
}

it('uses the shared visual identity throughout the redesigned routes', () => {
  expect(findings(source)).toEqual([])
})

it('puts no hard-coded white text on the primary colour (dark mode makes it light)', () => {
  for (const file of ['pages/OAuthCallback.tsx', 'pages/Warranties.tsx']) {
    expect(readFileSync(resolve(source, file), 'utf8'), file).not.toContain('text-white')
  }
})
