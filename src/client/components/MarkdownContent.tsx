import type { ReactNode } from 'react'

function safeHref(value: string) {
  const href = value.trim()
  // Backslashes are treated as forward slashes by browser URL parsers. Without
  // this check, `/\\example.com` could become an unexpected external link.
  if (href.startsWith('/') && !href.startsWith('//') && !href.includes('\\')) return href
  try {
    const url = new URL(href, window.location.origin)
    return ['https:', 'mailto:'].includes(url.protocol) ? url.href : null
  } catch {
    return null
  }
}

function InlineMarkdown({ value }: { value: string }) {
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^\s)]+\)|\*[^*]+\*)/g
  const parts = value.split(pattern)
  const nodes: ReactNode[] = []

  for (const [index, part] of parts.entries()) {
    if (!part) continue
    if (part.startsWith('**') && part.endsWith('**')) {
      nodes.push(<strong key={index}>{part.slice(2, -2)}</strong>)
    } else if (part.startsWith('`') && part.endsWith('`')) {
      nodes.push(<code key={index} className="rounded bg-[#9FD9C2]/35 px-1 py-0.5 text-[.9em] text-[#075f5b]">{part.slice(1, -1)}</code>)
    } else if (part.startsWith('[')) {
      const match = part.match(/^\[([^\]]+)\]\(([^\s)]+)\)$/)
      const href = match ? safeHref(match[2]) : null
      nodes.push(href ? <a key={index} href={href} target={href.startsWith('https:') ? '_blank' : undefined} rel={href.startsWith('https:') ? 'noreferrer' : undefined} className="font-semibold text-[#0D7D78] underline underline-offset-2">{match?.[1]}</a> : <span key={index}>{match?.[1] ?? part}</span>)
    } else if (part.startsWith('*') && part.endsWith('*')) {
      nodes.push(<em key={index}>{part.slice(1, -1)}</em>)
    } else {
      nodes.push(part)
    }
  }
  return <>{nodes}</>
}

function tableCells(line: string) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim())
}

function isTableRule(line: string) {
  const cells = tableCells(line)
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell))
}

/** A deliberately small Markdown renderer. Raw HTML is never interpreted. */
export function MarkdownContent({ content, className = '' }: { content: string; className?: string }) {
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) {
      index += 1
      continue
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/)
    if (heading) {
      const Tag = (`h${heading[1].length}` as 'h1' | 'h2' | 'h3')
      const classes = heading[1].length === 1 ? 'font-serif text-3xl' : heading[1].length === 2 ? 'font-serif text-2xl' : 'font-bold text-lg'
      blocks.push(<Tag key={index} className={classes}><InlineMarkdown value={heading[2]} /></Tag>)
      index += 1
      continue
    }

    if (/^[-*_]{3,}\s*$/.test(line)) {
      blocks.push(<hr key={index} className="border-[#0D7D78]/15" />)
      index += 1
      continue
    }

    if (line.startsWith('> ')) {
      const quote: string[] = []
      while (index < lines.length && lines[index].startsWith('> ')) {
        quote.push(lines[index].slice(2))
        index += 1
      }
      blocks.push(<blockquote key={index} className="border-s-4 border-[#0D7D78] ps-4 italic text-[#47716e]"><InlineMarkdown value={quote.join(' ')} /></blockquote>)
      continue
    }

    if (line.includes('|') && index + 1 < lines.length && isTableRule(lines[index + 1])) {
      const headers = tableCells(line)
      index += 2
      const rows: string[][] = []
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
        rows.push(tableCells(lines[index]))
        index += 1
      }
      blocks.push(<div key={index} className="overflow-x-auto"><table className="w-full border-collapse text-sm"><thead><tr>{headers.map((header, cellIndex) => <th key={cellIndex} className="border border-[#0D7D78]/15 bg-[#9FD9C2]/30 p-2 text-start"><InlineMarkdown value={header} /></th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{headers.map((_, cellIndex) => <td key={cellIndex} className="border border-[#0D7D78]/15 p-2"><InlineMarkdown value={row[cellIndex] ?? ''} /></td>)}</tr>)}</tbody></table></div>)
      continue
    }

    const listMatch = line.match(/^(?:[-*+] |\d+\. )(.+)$/)
    if (listMatch) {
      const ordered = /^\d+\. /.test(line)
      const items: string[] = []
      while (index < lines.length) {
        const item = lines[index].match(ordered ? /^\d+\. (.+)$/ : /^(?:[-*+] )(.+)$/)
        if (!item) break
        items.push(item[1])
        index += 1
      }
      const List = ordered ? 'ol' : 'ul'
      blocks.push(<List key={index} className={`${ordered ? 'list-decimal' : 'list-disc'} space-y-1 ps-5`} >{items.map((item, itemIndex) => <li key={itemIndex}><InlineMarkdown value={item} /></li>)}</List>)
      continue
    }

    const paragraph: string[] = [line]
    index += 1
    while (index < lines.length && lines[index].trim() && !/^(#{1,3}\s+|> |(?:[-*+] |\d+\. ))/.test(lines[index]) && !(lines[index].includes('|') && index + 1 < lines.length && isTableRule(lines[index + 1]))) {
      paragraph.push(lines[index])
      index += 1
    }
    blocks.push(<p key={index} className="leading-7"><InlineMarkdown value={paragraph.join(' ')} /></p>)
  }

  return <div className={`space-y-4 text-[#175451] ${className}`}>{blocks}</div>
}
