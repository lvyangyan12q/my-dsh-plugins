/**
 * 桥统一错误类型。错误码是 HTTP/窗口3 的契约，保持稳定：
 * - 400 BadRequest      输入形状不对（bad-json / bad-request / feedback-required）
 * - 404 NotFound        未知 run / 会话尚未创建
 * - 409 Conflict        非法状态迁移 / 仓库被其他 run 占用 / 会话创建失败
 * - 422 ValidationError 草稿或路径校验失败（details 里带字段级错误）
 */

export class BridgeError extends Error {
  constructor(code, message, { status = 500, details } = {}) {
    super(message)
    this.name = 'BridgeError'
    this.code = code
    this.status = status
    if (details !== undefined) this.details = details
  }
}

export class BadRequestError extends BridgeError {
  constructor(code, message, options = {}) {
    super(code, message, { ...options, status: 400 })
  }
}

export class NotFoundError extends BridgeError {
  constructor(code, message, options = {}) {
    super(code, message, { ...options, status: 404 })
  }
}

export class ConflictError extends BridgeError {
  constructor(code, message, options = {}) {
    super(code, message, { ...options, status: 409 })
  }
}

/** 单个字段/路径的校验错误，code 直接是字段级错误码（如 local-path-missing）。 */
export class FieldError extends BridgeError {
  constructor(field, code, message) {
    super(code, message, { status: 422, details: [{ field, code, message }] })
  }
}

/** 草稿整体校验失败，details 为字段级错误数组。 */
export class ValidationError extends BridgeError {
  constructor(errors, message = 'draft validation failed') {
    super('invalid-draft', message, { status: 422, details: errors })
  }
}
