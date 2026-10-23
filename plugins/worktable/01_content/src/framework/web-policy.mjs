/** Ordinary web entries receive no native bridge, even when their URL looks local. */
export function websiteEntry(value, hostOrigin) {
  let url
  try {url=new URL(value)} catch { throw new Error('网页入口必须是完整的 http/https 地址。') }
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.searchParams.has('token')) throw new Error('网页入口不能包含凭据、DSH令牌或活动内容协议。')
  if(hostOrigin&&url.hostname===new URL(hostOrigin).hostname)throw new Error('网页不能使用DSH同主机名的不同端口，Cookie不按端口隔离。请使用不同主机名，例如DSH为127.0.0.1时网站用localhost；原URL配置保留。')
  return url.href
}
export const WEBSITE_SANDBOX='allow-scripts allow-forms allow-popups'
/** Opt-in bridge sites must not receive the DSH host-only cookie (cookies are not port-scoped). */
export function controlledWebsiteEntry(value,hostOrigin){
 const href=websiteEntry(value,hostOrigin)
 if(new URL(href).hostname===new URL(hostOrigin).hostname)throw new Error('受控网站必须使用不同的主机名；同主机的不同端口仍会共享Cookie。')
 return href
}
