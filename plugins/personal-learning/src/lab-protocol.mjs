// Course lab protocol v1: declared by a course artifact, validated by the host.
// Kept pure so protocol rules are testable without a DOM or storage.

export const LAB_VERSION = 1

function isObject (value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function requireString (value, message) {
  if (typeof value !== 'string' || !value.trim()) throw Error(message)
  return value.trim()
}

export function validateLab (lab) {
  if (!isObject(lab)) throw Error('课程协议无效')
  if (lab.version !== LAB_VERSION) throw Error('课程协议版本不支持')

  const parameters = lab.parameters
  if (!Array.isArray(parameters) || parameters.length === 0 || parameters.length > 8) {
    throw Error('课程协议参数无效')
  }
  const parameterIds = new Set()
  for (const parameter of parameters) {
    const id = requireString(parameter.id, '课程协议参数 id 缺失')
    if (parameterIds.has(id)) throw Error(`课程协议参数 ${id} 重复`)
    parameterIds.add(id)
    if (!Number.isFinite(parameter.min) || !Number.isFinite(parameter.max) || parameter.min > parameter.max) {
      throw Error(`参数 ${id} 范围无效`)
    }
    if (!Number.isFinite(parameter.step) || parameter.step <= 0) throw Error(`参数 ${id} 步长无效`)
    if (!Number.isFinite(parameter.initial) || parameter.initial < parameter.min || parameter.initial > parameter.max) {
      throw Error(`参数 ${id} 初值越界`)
    }
  }

  const readouts = lab.readouts ?? []
  if (!Array.isArray(readouts) || readouts.length > 6) throw Error('课程协议读数无效')
  for (const readout of readouts) {
    const id = requireString(readout.id, '读数 id 缺失')
    for (const key of ['numerator', 'denominator']) {
      if (!parameterIds.has(readout[key])) throw Error(`读数 ${id} 引用了不存在的参数`)
    }
    if (readout.format != null && !['percent', 'ratio'].includes(readout.format)) {
      throw Error(`读数 ${id} 格式无效`)
    }
  }

  const prediction = lab.prediction
  if (prediction != null) {
    requireString(prediction.question, '预测问题缺失')
    if (!Array.isArray(prediction.options) || prediction.options.length < 2 || prediction.options.length > 4) {
      throw Error('预测选项无效')
    }
    const optionIds = new Set()
    for (const option of prediction.options) {
      const id = requireString(option.id, '预测选项 id 缺失')
      if (optionIds.has(id)) throw Error(`预测选项 ${id} 重复`)
      optionIds.add(id)
      requireString(option.label, '预测选项标签缺失')
      if (option.feedback != null) requireString(option.feedback, '预测反馈无效')
    }
    if (!optionIds.has(prediction.correct)) throw Error('预测正确项不在选项内')
  }

  const restate = lab.restate
  if (restate != null) {
    requireString(restate.prompt, '复述提示缺失')
    if (!Array.isArray(restate.checks) || restate.checks.length === 0 || restate.checks.length > 5) {
      throw Error('复述检查无效')
    }
    for (const check of restate.checks) {
      requireString(check.id, '复述检查 id 缺失')
      requireString(check.label, '复述检查标签缺失')
      if (!Array.isArray(check.keywords) || check.keywords.length === 0) throw Error(`复述检查 ${check.id} 关键词无效`)
      for (const keyword of check.keywords) requireString(keyword, `复述检查 ${check.id} 关键词无效`)
    }
  }

  return true
}

export function normalizeParameters (lab, input) {
  const source = isObject(input) ? input : {}
  const result = {}
  for (const parameter of lab.parameters) {
    const raw = source[parameter.id]
    const value = Number.isFinite(raw) ? raw : parameter.initial
    if (value < parameter.min || value > parameter.max) throw Error(`参数 ${parameter.id} 越界`)
    result[parameter.id] = value
  }
  return result
}

export function computeReadouts (lab, parameters) {
  return (lab.readouts ?? []).map(readout => {
    const numerator = parameters[readout.numerator]
    const denominator = parameters[readout.denominator]
    const label = readout.label ?? readout.id
    if (denominator === 0) return { id: readout.id, label, value: null, text: '未定义' }
    const value = numerator / denominator
    const text = readout.format === 'ratio'
      ? `${numerator} / ${denominator}`
      : `${Math.round(value * 1000) / 10}%`
    return { id: readout.id, label, value, text }
  })
}

export function judgePrediction (lab, optionId) {
  const prediction = lab?.prediction
  if (!prediction) throw Error('该课没有预测题')
  const chosen = prediction.options.find(option => option.id === optionId)
  if (!chosen) throw Error('预测选项不存在')
  const correct = optionId === prediction.correct
  const answer = prediction.options.find(option => option.id === prediction.correct)
  return {
    correct,
    feedback: chosen.feedback ?? (correct ? '答对了。' : `再想想：正确答案是「${answer?.label ?? ''}」。`),
  }
}

export function checkRestate (lab, text) {
  const restate = lab?.restate
  if (!restate) throw Error('该课没有复述检查')
  const value = String(text ?? '').toLowerCase()
  const checks = restate.checks.map(check => ({
    id: check.id,
    label: check.label,
    passed: check.keywords.some(keyword => value.includes(keyword.toLowerCase())),
  }))
  return { checks, passed: checks.every(check => check.passed) }
}
