/** Ordinary web entries receive no native bridge, even when their URL looks local. */
export function websiteEntry(value, hostOrigin) {
  let url
  try {url=new URL(value)} catch { throw new Error('网页入口必须是完整的 http/https 地址。') }
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.searchParams.has('token')) throw new Error('网页入口不能包含凭据、DSH令牌或活动内容协议。')
  if(hostOrigin && url.origin===hostOrigin) throw new Error('普通网页不能使用DSH自身地址；请使用应用独立站点。')
  return url.href
}
export const WEBSITE_SANDBOX='allow-scripts allow-forms allow-popups'
