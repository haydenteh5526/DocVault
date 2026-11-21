/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? tsxFiles(path) : path.endsWith('.tsx') ? [path] : []
  })
}

/** Drops comments and import paths, so only code and visible text is left to check. */
function visible(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/(from\s+|import\s+)['"][^'"]*['"]/g, '')
}

describe('the assistant is DocBot, from one constant', () => {
  it('has no visible "Pip" in any component or page', () => {
    const offenders = tsxFiles('src')
      .filter(file => /\bPip\b/.test(visible(readFileSync(file, 'utf8'))))
    expect(offenders).toEqual([])
  })
})
