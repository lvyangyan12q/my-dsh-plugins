/**
 * A tiny, total expression language for declarative experiments. The Host
 * parses model-authored expression strings into this AST once; the browser
 * runtime only evaluates the stored tree. There is no eval/Function, no
 * property access, no strings, no assignment and no user-defined call.
 */
export type ExperimentAst =
  | { kind: 'number'; value: number }
  | { kind: 'param'; name: string }
  | { kind: 'unary'; op: '+' | '-'; arg: ExperimentAst }
  | { kind: 'binary'; op: '+' | '-' | '*' | '/' | '^'; left: ExperimentAst; right: ExperimentAst }
  | { kind: 'call'; name: ExperimentFunctionName; args: ExperimentAst[] }

export type ExperimentFunctionName =
  | 'min' | 'max' | 'abs' | 'sqrt' | 'exp' | 'log' | 'sin' | 'cos' | 'pow' | 'clamp'

export const experimentExpressionLimits = {
  sourceLength: 400,
  nodes: 96,
  depth: 12,
  functionArguments: 4,
} as const

const functions: Record<ExperimentFunctionName, { min: number; max: number }> = {
  min: { min: 2, max: 2 },
  max: { min: 2, max: 2 },
  abs: { min: 1, max: 1 },
  sqrt: { min: 1, max: 1 },
  exp: { min: 1, max: 1 },
  log: { min: 1, max: 1 },
  sin: { min: 1, max: 1 },
  cos: { min: 1, max: 1 },
  pow: { min: 2, max: 2 },
  clamp: { min: 3, max: 3 },
}

const constants: Record<string, number> = { pi: Math.PI, e: Math.E }

export class ExperimentExpressionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExperimentExpressionError'
  }
}

interface Token {
  kind: 'number' | 'identifier' | 'operator' | 'eof'
  text: string
  value?: number
  position: number
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let index = 0
  while (index < source.length) {
    const char = source[index]
    if (/\s/.test(char)) {
      index += 1
      continue
    }
    if (/[0-9.]/.test(char)) {
      const start = index
      while (index < source.length && /[0-9]/.test(source[index])) index += 1
      if (source[index] === '.') {
        index += 1
        while (index < source.length && /[0-9]/.test(source[index])) index += 1
      }
      if (source[index] === 'e' || source[index] === 'E') {
        index += 1
        if (source[index] === '+' || source[index] === '-') index += 1
        let exponentDigits = 0
        while (index < source.length && /[0-9]/.test(source[index])) {
          index += 1
          exponentDigits += 1
        }
        if (exponentDigits === 0) throw new ExperimentExpressionError(`表达式第 ${start + 1} 个字符的指数不完整。`)
      }
      const text = source.slice(start, index)
      const value = Number(text)
      if (!Number.isFinite(value)) throw new ExperimentExpressionError(`表达式里的数字不是有限值：${text}`)
      tokens.push({ kind: 'number', text, value, position: start })
      continue
    }
    if (/[A-Za-z_]/.test(char)) {
      const start = index
      index += 1
      while (index < source.length && /[A-Za-z0-9_]/.test(source[index])) index += 1
      tokens.push({ kind: 'identifier', text: source.slice(start, index), position: start })
      continue
    }
    if ('+-*/^(),'.includes(char)) {
      tokens.push({ kind: 'operator', text: char, position: index })
      index += 1
      continue
    }
    throw new ExperimentExpressionError(`表达式第 ${index + 1} 个字符不支持：${char}`)
  }
  tokens.push({ kind: 'eof', text: '', position: source.length })
  return tokens
}

class Parser {
  private index = 0
  private nodes = 0

  constructor(
    private readonly tokens: Token[],
    private readonly parameterNames: ReadonlySet<string>,
  ) {}

  parse(): ExperimentAst {
    const node = this.parseAdditive()
    if (this.peek().kind !== 'eof') {
      throw this.syntax(`多余的内容 ${this.peek().text || '结尾'}`)
    }
    const depth = this.depthOf(node)
    if (depth > experimentExpressionLimits.depth) {
      throw new ExperimentExpressionError(`表达式嵌套过深（${depth} 层，上限 ${experimentExpressionLimits.depth}）。`)
    }
    return node
  }

  private node(node: ExperimentAst): ExperimentAst {
    this.nodes += 1
    if (this.nodes > experimentExpressionLimits.nodes) {
      throw new ExperimentExpressionError(`表达式节点过多（上限 ${experimentExpressionLimits.nodes}）。`)
    }
    return node
  }

  private depthOf(node: ExperimentAst): number {
    switch (node.kind) {
      case 'number':
      case 'param': return 1
      case 'unary': return 1 + this.depthOf(node.arg)
      case 'binary': return 1 + Math.max(this.depthOf(node.left), this.depthOf(node.right))
      case 'call': return 1 + Math.max(0, ...node.args.map(arg => this.depthOf(arg)))
    }
  }

  private peek(): Token {
    return this.tokens[this.index]
  }

  private take(): Token {
    const token = this.tokens[this.index]
    this.index += 1
    return token
  }

  private syntax(message: string): ExperimentExpressionError {
    return new ExperimentExpressionError(`表达式语法错误：${message}（第 ${this.peek().position + 1} 个字符附近）。`)
  }

  private expectOperator(text: string): void {
    const token = this.take()
    if (token.kind !== 'operator' || token.text !== text) throw this.syntax(`需要「${text}」`)
  }

  private parseAdditive(): ExperimentAst {
    let left = this.parseMultiplicative()
    while (this.peek().kind === 'operator' && (this.peek().text === '+' || this.peek().text === '-')) {
      const op = this.take().text as '+' | '-'
      left = this.node({ kind: 'binary', op, left, right: this.parseMultiplicative() })
    }
    return left
  }

  private parseMultiplicative(): ExperimentAst {
    let left = this.parseUnary()
    while (this.peek().kind === 'operator' && (this.peek().text === '*' || this.peek().text === '/')) {
      const op = this.take().text as '*' | '/'
      left = this.node({ kind: 'binary', op, left, right: this.parseUnary() })
    }
    return left
  }

  private parseUnary(): ExperimentAst {
    if (this.peek().kind === 'operator' && (this.peek().text === '+' || this.peek().text === '-')) {
      const op = this.take().text as '+' | '-'
      return this.node({ kind: 'unary', op, arg: this.parseUnary() })
    }
    return this.parsePower()
  }

  private parsePower(): ExperimentAst {
    const left = this.parsePrimary()
    if (this.peek().kind === 'operator' && this.peek().text === '^') {
      this.take()
      // Power binds tighter than unary minus and is right-associative:
      // -x^2 = -(x^2), 2^3^2 = 2^(3^2), 2^-2 = 2^(-2).
      return this.node({ kind: 'binary', op: '^', left, right: this.parseUnary() })
    }
    return left
  }

  private parsePrimary(): ExperimentAst {
    const token = this.take()
    if (token.kind === 'number') return this.node({ kind: 'number', value: token.value ?? 0 })
    if (token.kind === 'operator' && token.text === '(') {
      const node = this.parseAdditive()
      this.expectOperator(')')
      return node
    }
    if (token.kind === 'identifier') {
      if (this.peek().kind === 'operator' && this.peek().text === '(') {
        this.take()
        return this.parseCall(token)
      }
      if (Object.hasOwn(constants, token.text)) return this.node({ kind: 'number', value: constants[token.text] })
      if (!this.parameterNames.has(token.text)) {
        throw new ExperimentExpressionError(`表达式使用了未知参数：${token.text}`)
      }
      return this.node({ kind: 'param', name: token.text })
    }
    throw this.syntax('需要数字、参数、函数或括号')
  }

  private parseCall(token: Token): ExperimentAst {
    if (!Object.hasOwn(functions, token.text)) {
      throw new ExperimentExpressionError(`表达式使用了不允许的函数：${token.text}`)
    }
    const name = token.text as ExperimentFunctionName
    const args: ExperimentAst[] = []
    if (this.peek().kind === 'operator' && this.peek().text === ')') {
      this.take()
    } else {
      for (;;) {
        args.push(this.parseAdditive())
        if (args.length > experimentExpressionLimits.functionArguments) {
          throw new ExperimentExpressionError(`函数 ${name} 的参数过多。`)
        }
        if (this.peek().kind === 'operator' && this.peek().text === ',') {
          this.take()
          continue
        }
        this.expectOperator(')')
        break
      }
    }
    const arity = functions[name]
    if (args.length < arity.min || args.length > arity.max) {
      throw new ExperimentExpressionError(`函数 ${name} 需要 ${arity.min === arity.max ? arity.min : `${arity.min}–${arity.max}`} 个参数。`)
    }
    return this.node({ kind: 'call', name, args })
  }
}

/** Parse and validate one model-authored expression against declared parameters. */
export function parseExperimentExpression(source: string, parameterNames: readonly string[]): ExperimentAst {
  if (typeof source !== 'string') throw new ExperimentExpressionError('表达式必须是字符串。')
  const trimmed = source.trim()
  if (trimmed === '') throw new ExperimentExpressionError('表达式不能为空。')
  if (trimmed.length > experimentExpressionLimits.sourceLength) {
    throw new ExperimentExpressionError(`表达式过长（上限 ${experimentExpressionLimits.sourceLength} 个字符）。`)
  }
  return new Parser(tokenize(trimmed), new Set(parameterNames)).parse()
}

function finite(value: number, detail: string): number {
  if (!Number.isFinite(value)) throw new ExperimentExpressionError(`${detail}不是有限数值（NaN/Infinity）。`)
  return value
}

/** Evaluate a validated AST at the current parameter values. */
export function evaluateExperimentAst(ast: ExperimentAst, parameters: Readonly<Record<string, number>>): number {
  const value = evaluate(ast, parameters)
  return finite(value, '计算结果')
}

function evaluate(ast: ExperimentAst, parameters: Readonly<Record<string, number>>): number {
  switch (ast.kind) {
    case 'number': return finite(ast.value, '表达式数字')
    case 'param': {
      const value = parameters[ast.name]
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new ExperimentExpressionError(`参数 ${ast.name} 没有有限数值。`)
      }
      return value
    }
    case 'unary': {
      const value = evaluate(ast.arg, parameters)
      return finite(ast.op === '-' ? -value : value, '一元运算结果')
    }
    case 'binary': {
      const left = evaluate(ast.left, parameters)
      const right = evaluate(ast.right, parameters)
      switch (ast.op) {
        case '+': return finite(left + right, '加法结果')
        case '-': return finite(left - right, '减法结果')
        case '*': return finite(left * right, '乘法结果')
        case '/':
          if (right === 0) throw new ExperimentExpressionError('表达式出现除零。')
          return finite(left / right, '除法结果')
        case '^': return finite(Math.pow(left, right), '幂结果')
      }
      return 0
    }
    case 'call': {
      const args = ast.args.map(arg => evaluate(arg, parameters))
      switch (ast.name) {
        case 'min': return finite(Math.min(args[0], args[1]), 'min 结果')
        case 'max': return finite(Math.max(args[0], args[1]), 'max 结果')
        case 'abs': return finite(Math.abs(args[0]), 'abs 结果')
        case 'sqrt': return finite(Math.sqrt(args[0]), 'sqrt 结果')
        case 'exp': return finite(Math.exp(args[0]), 'exp 结果')
        case 'log': return finite(Math.log(args[0]), 'log 结果')
        case 'sin': return finite(Math.sin(args[0]), 'sin 结果')
        case 'cos': return finite(Math.cos(args[0]), 'cos 结果')
        case 'pow': return finite(Math.pow(args[0], args[1]), 'pow 结果')
        case 'clamp': return finite(Math.min(Math.max(args[0], args[1]), args[2]), 'clamp 结果')
      }
      return 0
    }
  }
}
