import { Code2, Eye } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'

type MarkdownEditorProps = {
  label: string
  value: string
  onChange: (value: string) => void
  direction?: 'ltr' | 'rtl'
  rows?: number
  error?: string
  hint?: string
}

type InlinePart = { type: 'text'; value: string } | { type: 'strong' | 'emphasis'; value: string } | { type: 'link'; label: string; href: string }

function safeHref(value: string) {
  const trimmed = value.trim()
  if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.includes('\\')) return trimmed
  try {
    const url = new URL(trimmed)
    return ['https:', 'http:', 'mailto:'].includes(url.protocol) ? url.toString() : null
  } catch {
    return null
  }
}

function parseInline(value: string): InlinePart[] {
  const matcher = /(\*\*[^*]+\*\*|_[^_]+_|\[[^\]]+\]\([^\s)]+\))/g
  const parts: InlinePart[] = []
  let cursor = 0

  for (const match of value.matchAll(matcher)) {
    const index = match.index ?? 0
    if (index > cursor) parts.push({ type: 'text', value: value.slice(cursor, index) })
    const token = match[0]
    if (token.startsWith('**')) parts.push({ type: 'strong', value: token.slice(2, -2) })
    else if (token.startsWith('_')) parts.push({ type: 'emphasis', value: token.slice(1, -1) })
    else {
      const link = /^\[([^\]]+)\]\(([^\s)]+)\)$/.exec(token)
      const href = link ? safeHref(link[2]) : null
      parts.push(href && link ? { type: 'link', label: link[1], href } : { type: 'text', value: token })
    }
    cursor = index + token.length
  }
  if (cursor < value.length) parts.push({ type: 'text', value: value.slice(cursor) })
  return parts
}

function InlineMarkdown({ value }: { value: string }) {
  return <>{parseInline(value).map((part, index) => {
    if (part.type === 'strong') return <strong key={index}>{part.value}</strong>
    if (part.type === 'emphasis') return <em key={index}>{part.value}</em>
    if (part.type === 'link') return <a key={index} href={part.href} target={part.href.startsWith('http') ? '_blank' : undefined} rel={part.href.startsWith('http') ? 'noreferrer' : undefined} className="font-semibold text-[#a95a39] underline underline-offset-2">{part.label}</a>
    return <span key={index}>{part.value}</span>
  })}</>
}

function splitTableRow(line: string) {
  return line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim())
}

function isTableSeparator(line: string) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line)
}

/**
 * A deliberately small Markdown renderer. It creates React nodes rather than
 * injecting HTML, so raw HTML is always shown as text and cannot run scripts.
 */
export function MarkdownPreview({ value, direction = 'ltr', emptyMessage = 'Nothing to preview yet.' }: { value: string; direction?: 'ltr' | 'rtl'; emptyMessage?: string }) {
  const lines = value.replaceAll('\r\n', '\n').split('\n')
  const blocks: ReactNode[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) {
      index += 1
      continue
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line)
    if (heading) {
      const level = heading[1].length
      const className = level === 1 ? 'font-serif text-2xl' : level === 2 ? 'font-serif text-xl' : 'font-bold text-base'
      const Tag = `h${level}` as 'h1' | 'h2' | 'h3'
      blocks.push(<Tag key={index} className={className}><InlineMarkdown value={heading[2]} /></Tag>)
      index += 1
      continue
    }

    if (line.startsWith('> ')) {
      const quote: string[] = []
      while (index < lines.length && lines[index].startsWith('> ')) {
        quote.push(lines[index].slice(2))
        index += 1
      }
      blocks.push(<blockquote key={index} className="border-s-4 border-[#a95a39]/45 ps-4 italic text-[#624b40]"><InlineMarkdown value={quote.join(' ')} /></blockquote>)
      continue
    }

    const unordered = /^[-*+]\s+(.+)$/.exec(line)
    if (unordered) {
      const items: string[] = []
      while (index < lines.length) {
        const item = /^[-*+]\s+(.+)$/.exec(lines[index])
        if (!item) break
        items.push(item[1])
        index += 1
      }
      blocks.push(<ul key={index} className="list-disc space-y-1 ps-5">{items.map((item, itemIndex) => <li key={itemIndex}><InlineMarkdown value={item} /></li>)}</ul>)
      continue
    }

    const ordered = /^\d+\.\s+(.+)$/.exec(line)
    if (ordered) {
      const items: string[] = []
      while (index < lines.length) {
        const item = /^\d+\.\s+(.+)$/.exec(lines[index])
        if (!item) break
        items.push(item[1])
        index += 1
      }
      blocks.push(<ol key={index} className="list-decimal space-y-1 ps-5">{items.map((item, itemIndex) => <li key={itemIndex}><InlineMarkdown value={item} /></li>)}</ol>)
      continue
    }

    if (index + 1 < lines.length && line.includes('|') && isTableSeparator(lines[index + 1])) {
      const headings = splitTableRow(line)
      index += 2
      const rows: string[][] = []
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
        rows.push(splitTableRow(lines[index]))
        index += 1
      }
      blocks.push(<div key={index} className="overflow-x-auto rounded-xl border border-[#2c1c14]/10"><table className="min-w-full text-sm"><thead className="bg-[#f8ecdf]"><tr>{headings.map((heading, headingIndex) => <th key={headingIndex} className="px-3 py-2 text-start"><InlineMarkdown value={heading} /></th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex} className="border-t border-[#2c1c14]/10">{headings.map((_, cellIndex) => <td key={cellIndex} className="px-3 py-2 align-top"><InlineMarkdown value={row[cellIndex] ?? ''} /></td>)}</tr>)}</tbody></table></div>)
      continue
    }

    const paragraph: string[] = []
    while (index < lines.length && lines[index].trim()) {
      if (paragraph.length > 0 && (/^(#{1,3})\s+/.test(lines[index]) || lines[index].startsWith('> ') || /^[-*+]\s+/.test(lines[index]) || /^\d+\.\s+/.test(lines[index]))) break
      paragraph.push(lines[index])
      index += 1
    }
    blocks.push(<p key={index} className="leading-7"><InlineMarkdown value={paragraph.join(' ')} /></p>)
  }

  return <div dir={direction} className="space-y-3 text-sm text-[#3d2a20]">{blocks.length ? blocks : <p className="text-[#80695c]">{emptyMessage}</p>}</div>
}

export function MarkdownEditor({ label, value, onChange, direction = 'ltr', rows = 8, error, hint }: MarkdownEditorProps) {
  const [mode, setMode] = useState<'write' | 'preview'>('write')
  const id = useId()
  const errorId = `${id}-error`
  return <div dir={direction} className="rounded-2xl border border-[#2c1c14]/10 bg-[#fffdfa] p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <label htmlFor={id} className="text-sm font-bold">{label}</label>
        {hint ? <p className="mt-1 text-xs leading-5 text-[#80695c]">{hint}</p> : null}
      </div>
      <div className="inline-flex rounded-lg bg-[#f8ecdf] p-1 text-xs font-bold">
        <button type="button" onClick={() => setMode('write')} className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 ${mode === 'write' ? 'bg-white text-[#2c1c14] shadow-sm' : 'text-[#624b40]'}`}><Code2 size={13} /> Write</button>
        <button type="button" onClick={() => setMode('preview')} className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 ${mode === 'preview' ? 'bg-white text-[#2c1c14] shadow-sm' : 'text-[#624b40]'}`}><Eye size={13} /> Preview</button>
      </div>
    </div>
    {mode === 'write' ? <textarea id={id} dir={direction} rows={rows} value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} className={`mt-3 w-full resize-y rounded-xl border bg-white px-3 py-2.5 font-mono text-sm outline-none transition focus:border-[#a95a39] ${error ? 'border-red-500' : 'border-[#2c1c14]/15'}`} placeholder="Use Markdown: # Heading, **bold**, _italic_, [link](https://…), lists, quotes, and tables." /> : <div className="mt-3 min-h-40 rounded-xl border border-[#2c1c14]/10 bg-white p-4"><MarkdownPreview value={value} direction={direction} /></div>}
    {error ? <p id={errorId} role="alert" className="mt-2 text-xs font-semibold text-red-700">{error}</p> : null}
    <p className="mt-2 text-xs text-[#80695c]">Markdown is rendered safely. Raw HTML, scripts, and embeds are shown as text.</p>
  </div>
}
