import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'bun:test'

const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'UserTextPart.tsx'), 'utf8')

describe('UserTextPart whitespace rendering', () => {
  test('passes whitespace-pre-wrap to markdown rendering mode', () => {
    expect(source).toContain('className="whitespace-pre-wrap"')
    expect(source).toContain('<SimpleMarkdownRenderer')
  })

  test('keeps whitespace-pre-wrap for plain rendering mode', () => {
    expect(source).toContain("normalizedRenderingMode === 'plain' && 'whitespace-pre-wrap'")
  })
})
