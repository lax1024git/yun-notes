import { describe, expect, it } from 'vitest'
import { renderMarkdown } from './markdown'

describe('renderMarkdown', () => {
  it('strips script tags', () => {
    const html = renderMarkdown('<script>alert(1)</script>\n\nHi')
    expect(html).not.toMatch(/<script/i)
    expect(html).toMatch(/Hi/)
  })
})
