const net = require('node:net')
const connect = net.Socket.prototype.connect
net.Socket.prototype.connect = function (...args) {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0]
  const host = first && typeof first === 'object' ? first.host : typeof args[1] === 'string' ? args[1] : undefined
  if (host !== undefined && !['127.0.0.1', '::1', 'localhost'].includes(host)) throw new Error('Offline check denied outbound socket')
  return connect.apply(this, args)
}
const denied = () => { throw new Error('Offline check denied HTTP client') }
for (const name of ['node:http', 'node:https']) { require(name).request = denied; require(name).get = denied }
globalThis.fetch = denied
