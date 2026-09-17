import { marked } from 'marked'
import hljs from 'highlight.js'
import DOMPurify from 'dompurify'

marked.setOptions({
  gfm: true,
  breaks: false,
})

marked.use({
  renderer: {
    code({ text, lang }: { text: string; lang?: string }) {
      const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext'
      const highlighted = hljs.highlight(text, { language }).value
      return `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`
    },
    link({ href, title, text }: { href: string; title?: string | null; text: string }) {
      const t = title ? ` title="${title}"` : ''
      return `<a href="${href}"${t} rel="noopener noreferrer" target="_blank">${text}</a>`
    },
  },
})

export function renderMarkdown(src: string): string {
  const raw = marked.parse(src ?? '', { async: false }) as string
  return DOMPurify.sanitize(raw, {
    ADD_ATTR: ['target', 'rel'],
  })
}
