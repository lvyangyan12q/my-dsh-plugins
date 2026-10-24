import { useMemo } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import {useLearningHttp} from './view-context.tsx'

export type ImageRecordContext={entryId:string;questionId?:never}|{questionId:string;entryId?:never}
/** Only local selectors reach the owner-checked Host; no path resolution occurs in the browser. */
function localReference(src:string){
  return !src.startsWith('//')&&!src.startsWith('\\\\')&&(
    src.startsWith('/api/kaogong/document-image?')||src.startsWith('images/')||src.startsWith('题目_images/')||src.startsWith('题目_images\\')||
    /^[A-Za-z]:[\\/]/.test(src)||src.startsWith('/')&&!src.startsWith('/api/'))
}
function imageUrl(src:string,context?:ImageRecordContext){
  const bundled=['资料600-2023-hebei-retail-growth.png','资料600-2024-jiangsu-17.png'].find(name=>src==='题目_images/verified/'+name)
  if(bundled)return '/api/kaogong/material-image?asset='+encodeURIComponent('verified/'+bundled)
  if(src.startsWith('/api/kaogong/material-image?'))return src
  if(context&&localReference(src)){
    const query=new URLSearchParams('entryId' in context?{entryId:context.entryId!,reference:src}:{questionId:context.questionId,reference:src})
    return '/api/kaogong/'+('entryId' in context?'legacy-image':'legacy-question-image')+'?'+query
  }
  return src.startsWith('/api/kaogong/document-image?')?src:undefined
}
export function DocumentMarkdown({ content,imageContext }: { content: string;imageContext?:ImageRecordContext }) {
  const http=useLearningHttp()
  const html = useMemo(() => {
    // Markdown parsers escape/normalize URL targets. Preserve the exact literal for Host evidence matching.
    const originals=new Map<string,string>()
    const parsed = new DOMParser().parseFromString(DOMPurify.sanitize(marked.parse(content, { async: false,walkTokens(token){
      if(token.type!=='image')return
      const match=/^!\[[^\]]*\]\(([^)]+)\)/.exec(token.raw)
      if(!match)return
      const selector='/kaogong-image-selector/'+originals.size
      originals.set(selector,match[1]);token.href=selector
    } }), {
      ALLOWED_TAGS: ['p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'b', 'i', 'del', 'sub', 'sup', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'div', 'span', 'img', 'a', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup', 'col'],
      ALLOWED_ATTR: ['src', 'alt', 'title', 'href', 'colspan', 'rowspan', 'start', 'width', 'height'],
    }), 'text/html')
    for (const img of parsed.querySelectorAll('img')) {
      const raw = img.getAttribute('src') || ''
      const src=imageUrl(originals.get(raw)??raw,imageContext)
      if (!src) {
        img.replaceWith(parsed.createTextNode('[图片引用不可用]'))
        continue
      }
      img.setAttribute('loading', 'lazy')
      try{img.setAttribute('src',http.url(src))}catch{img.replaceWith(parsed.createTextNode('[图片引用不可用]'));continue}
      img.removeAttribute('srcset')
    }
    return parsed.body.innerHTML
  }, [content,http,imageContext?.entryId,imageContext?.questionId])
  return <>
    <style>{`.kg-document{font-size:15px;line-height:1.8;overflow-wrap:anywhere;min-width:0}.kg-document img{max-width:100%;height:auto;object-fit:contain;vertical-align:middle;margin:6px 8px 6px 0}.kg-document table{display:block;max-width:100%;overflow:auto;border-collapse:collapse;margin:16px 0}.kg-document th,.kg-document td{border:1px solid #d1d5db;padding:6px 10px;min-width:55px}.kg-document th{background:#f3f4f6}.kg-document pre{overflow:auto}.kg-document h1{font-size:22px}.kg-document h2{font-size:19px}.kg-document h3{font-size:17px}`}</style>
    <div className="kg-document" dangerouslySetInnerHTML={{ __html: html }} onError={event => {
      if (event.target instanceof HTMLImageElement) event.target.replaceWith(document.createTextNode('[图片加载失败，请刷新重试]'))
    }} />
  </>
}
