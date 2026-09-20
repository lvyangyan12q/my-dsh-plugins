import { useMemo } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

export function DocumentMarkdown({ content }: { content: string }) {
  const html = useMemo(() => {
    const parsed = new DOMParser().parseFromString(DOMPurify.sanitize(marked.parse(content, { async: false }), {
      ALLOWED_TAGS: ['p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'b', 'i', 'del', 'sub', 'sup', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'div', 'span', 'img', 'a', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup', 'col'],
      ALLOWED_ATTR: ['src', 'alt', 'title', 'href', 'colspan', 'rowspan', 'start', 'width', 'height'],
    }), 'text/html')
    for (const img of parsed.querySelectorAll('img')) {
      const src = img.getAttribute('src') || ''
      if (!src.startsWith('/api/kaogong/document-image?') && !src.startsWith('/api/kaogong/material-image?')) {
        img.replaceWith(parsed.createTextNode('[图片引用不可用]'))
        continue
      }
      img.setAttribute('loading', 'lazy')
      img.removeAttribute('srcset')
    }
    return parsed.body.innerHTML
  }, [content])
  return <>
    <style>{`.kg-document{font-size:15px;line-height:1.8;overflow-wrap:anywhere;min-width:0}.kg-document img{max-width:100%;height:auto;object-fit:contain;vertical-align:middle;margin:6px 8px 6px 0}.kg-document table{display:block;max-width:100%;overflow:auto;border-collapse:collapse;margin:16px 0}.kg-document th,.kg-document td{border:1px solid #d1d5db;padding:6px 10px;min-width:55px}.kg-document th{background:#f3f4f6}.kg-document pre{overflow:auto}.kg-document h1{font-size:22px}.kg-document h2{font-size:19px}.kg-document h3{font-size:17px}`}</style>
    <div className="kg-document" dangerouslySetInnerHTML={{ __html: html }} onError={event => {
      if (event.target instanceof HTMLImageElement) event.target.replaceWith(document.createTextNode('[图片加载失败，请刷新重试]'))
    }} />
  </>
}
