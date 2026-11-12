import { experimentCsp } from './experiment.ts'
import { jsonForScript } from './experiment-json.ts'
import type { ExperimentSpec } from './experiment-spec.ts'

/**
 * Fixed, trusted experiment runtime. The model never supplies HTML, CSS or JS:
 * only the schema-constrained spec is injected as a JSON literal into `SPEC`.
 * There is intentionally no postMessage, fetch, location, innerHTML or dynamic
 * code path in this source; the iframe renders controls, one canvas and numeric
 * readouts from the same AST evaluator.
 */
export const experimentRuntimeSource = String.raw`
(function () {
  'use strict'
  var root = document.getElementById('experiment-root')
  var errorLine = document.getElementById('experiment-error')
  var values = Object.create(null)
  var outputs = []

  function element(tag, className, text) {
    var node = document.createElement(tag)
    if (className) node.className = className
    if (text !== undefined) node.textContent = text
    return node
  }

  function finite(value, what) {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(what + '不是有限数值（NaN/Infinity）。')
    return value
  }

  function evaluate(ast, scope, depth) {
    if (!ast || typeof ast !== 'object' || (depth || 0) > 20) throw new Error('表达式结构不安全或过深')
    switch (ast.kind) {
      case 'number': return finite(ast.value, '表达式数字')
      case 'param':
        if (!Object.prototype.hasOwnProperty.call(scope, ast.name)) throw new Error('缺少参数：' + ast.name)
        return finite(scope[ast.name], '参数 ' + ast.name)
      case 'unary': {
        var inner = evaluate(ast.arg, scope, (depth || 0) + 1)
        return ast.op === '-' ? -inner : inner
      }
      case 'binary': {
        var left = evaluate(ast.left, scope, (depth || 0) + 1)
        var right = evaluate(ast.right, scope, (depth || 0) + 1)
        if (ast.op === '+') return finite(left + right, '加法结果')
        if (ast.op === '-') return finite(left - right, '减法结果')
        if (ast.op === '*') return finite(left * right, '乘法结果')
        if (ast.op === '/') {
          if (right === 0) throw new Error('表达式出现除零。')
          return finite(left / right, '除法结果')
        }
        if (ast.op === '^') return finite(Math.pow(left, right), '幂结果')
        throw new Error('未知表达式运算符')
      }
      case 'call': {
        var args = ast.args.map(function (arg) { return evaluate(arg, scope, (depth || 0) + 1) })
        if (ast.name === 'min') return finite(Math.min(args[0], args[1]), 'min 结果')
        if (ast.name === 'max') return finite(Math.max(args[0], args[1]), 'max 结果')
        if (ast.name === 'abs') return finite(Math.abs(args[0]), 'abs 结果')
        if (ast.name === 'sqrt') return finite(Math.sqrt(args[0]), 'sqrt 结果')
        if (ast.name === 'exp') return finite(Math.exp(args[0]), 'exp 结果')
        if (ast.name === 'log') return finite(Math.log(args[0]), 'log 结果')
        if (ast.name === 'sin') return finite(Math.sin(args[0]), 'sin 结果')
        if (ast.name === 'cos') return finite(Math.cos(args[0]), 'cos 结果')
        if (ast.name === 'pow') return finite(Math.pow(args[0], args[1]), 'pow 结果')
        if (ast.name === 'clamp') return finite(Math.min(Math.max(args[0], args[1]), args[2]), 'clamp 结果')
        throw new Error('不允许的函数')
      }
      default:
        throw new Error('未知表达式节点')
    }
  }

  function fail(error) {
    errorLine.textContent = error instanceof Error ? error.message : '实验无法计算'
    errorLine.hidden = false
  }

  function clearError() {
    errorLine.textContent = ''
    errorLine.hidden = true
  }

  function readouts() {
    for (var i = 0; i < SPEC.readouts.length; i += 1) {
      var readout = SPEC.readouts[i]
      try {
        var value = evaluate(readout.ast, values, 0)
        outputs[i].textContent = value.toFixed(readout.decimals) + (readout.unit ? ' ' + readout.unit : '')
      } catch (error) {
        outputs[i].textContent = '无法计算'
      }
    }
  }

  var canvas = element('canvas', 'experiment-chart')
  canvas.width = 760
  canvas.height = 340
  canvas.setAttribute('role', 'img')
  canvas.setAttribute('aria-label', SPEC.render.yLabel || '实验图形')

  function drawChart() {
    var ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('画布不可用')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    var xParameter = null
    for (var p = 0; p < SPEC.parameters.length; p += 1) {
      if (SPEC.parameters[p].name === SPEC.render.xParameter) xParameter = SPEC.parameters[p]
    }
    if (!xParameter) throw new Error('横轴参数不存在')
    var samples = Math.max(24, Math.min(256, Math.floor(SPEC.render.samples)))
    var all = []
    var seriesValues = []
    for (var s = 0; s < SPEC.render.series.length; s += 1) {
      var points = []
      for (var i = 0; i <= samples; i += 1) {
        var x = xParameter.min + (xParameter.max - xParameter.min) * (i / samples)
        var scope = Object.create(null)
        for (var key in values) scope[key] = values[key]
        scope[xParameter.name] = x
        var y = evaluate(SPEC.render.series[s].ast, scope, 0)
        points.push({ x: x, y: y })
        all.push(y)
      }
      seriesValues.push(points)
    }
    var minY = Math.min.apply(null, all)
    var maxY = Math.max.apply(null, all)
    if (!Number.isFinite(minY) || !Number.isFinite(maxY)) throw new Error('图形数据不是有限数值')
    if (minY === maxY) {
      minY = minY - 1
      maxY = maxY + 1
    }
    if (SPEC.render.kind === 'line' || SPEC.render.kind === 'bars') {
      var left = 58
      var right = 18
      var top = 18
      var bottom = 42
      var width = canvas.width - left - right
      var height = canvas.height - top - bottom
      ctx.strokeStyle = '#8c959f'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(left, top)
      ctx.lineTo(left, top + height)
      ctx.lineTo(left + width, top + height)
      ctx.stroke()
      ctx.fillStyle = '#57606a'
      ctx.font = '12px sans-serif'
      ctx.fillText((SPEC.render.xLabel || xParameter.label) + ' →', left, canvas.height - 10)
      ctx.save()
      ctx.translate(14, top + height / 2)
      ctx.rotate(-Math.PI / 2)
      ctx.fillText(SPEC.render.yLabel || '值', 0, 0)
      ctx.restore()
      ctx.fillText(String(Number(minY.toFixed(2))), 6, top + height)
      ctx.fillText(String(Number(maxY.toFixed(2))), 6, top)
      ctx.fillText(String(Number(xParameter.min.toFixed(2))), left, canvas.height - 24)
      ctx.fillText(String(Number(xParameter.max.toFixed(2))), left + width - 24, canvas.height - 24)
      for (var si = 0; si < seriesValues.length; si += 1) {
        var series = seriesValues[si]
        ctx.strokeStyle = SPEC.render.series[si].color || '#0969da'
        ctx.fillStyle = ctx.strokeStyle
        if (SPEC.render.kind === 'bars') {
          var barWidth = Math.max(1, width / samples - 1)
          for (var bi = 0; bi < series.length; bi += 1) {
            var bp = series[bi]
            var bx = left + (bp.x - xParameter.min) / (xParameter.max - xParameter.min) * width
            var by = top + (maxY - bp.y) / (maxY - minY) * height
            ctx.fillRect(bx, by, barWidth, top + height - by)
          }
        } else {
          ctx.beginPath()
          for (var li = 0; li < series.length; li += 1) {
            var point = series[li]
            var px = left + (point.x - xParameter.min) / (xParameter.max - xParameter.min) * width
            var py = top + (maxY - point.y) / (maxY - minY) * height
            if (li === 0) ctx.moveTo(px, py)
            else ctx.lineTo(px, py)
          }
          ctx.stroke()
        }
      }
    } else {
      throw new Error('未知图形类型')
    }
  }

  function render() {
    clearError()
    try {
      readouts()
      drawChart()
    } catch (error) {
      fail(error)
    }
  }

  var title = element('h2', 'experiment-title', SPEC.title)
  root.appendChild(title)

  var controls = element('div', 'experiment-controls')
  for (var pi = 0; pi < SPEC.parameters.length; pi += 1) {
    var parameter = SPEC.parameters[pi]
    var label = element('label', 'experiment-control')
    var caption = element('span', 'experiment-control-label', parameter.label)
    var input = document.createElement('input')
    input.type = 'range'
    input.min = String(parameter.min)
    input.max = String(parameter.max)
    input.step = String(parameter.step)
    input.value = String(parameter.default)
    input.setAttribute('aria-label', parameter.label)
    // Read back the browser's actual value: a range may snap to the nearest
    // allowed step. The displayed/output value must be what is evaluated, not
    // the un-snapped spec default.
    var initial = Number(input.value)
    if (!Number.isFinite(initial)) initial = parameter.default
    values[parameter.name] = initial
    var current = element('output', 'experiment-control-value', String(initial) + (parameter.unit ? ' ' + parameter.unit : ''))
    input.addEventListener('input', function (name, unit, output) {
      return function (event) {
        values[name] = Number(event.target.value)
        output.textContent = String(values[name]) + (unit ? ' ' + unit : '')
        render()
      }
    }(parameter.name, parameter.unit, current))
    label.appendChild(caption)
    label.appendChild(input)
    label.appendChild(current)
    controls.appendChild(label)
  }
  root.appendChild(controls)

  var readoutBox = element('div', 'experiment-readouts')
  for (var ri = 0; ri < SPEC.readouts.length; ri += 1) {
    var row = element('div', 'experiment-readout')
    row.appendChild(element('span', '', SPEC.readouts[ri].label))
    var output = element('output', 'experiment-readout-value', '…')
    row.appendChild(output)
    outputs.push(output)
    readoutBox.appendChild(row)
  }
  root.appendChild(readoutBox)
  root.appendChild(canvas)

  var legend = element('div', 'experiment-legend')
  for (var gi = 0; gi < SPEC.render.series.length; gi += 1) {
    var item = element('span', 'experiment-legend-item')
    var swatch = element('span', 'experiment-legend-swatch')
    swatch.style.background = SPEC.render.series[gi].color || '#0969da'
    item.appendChild(swatch)
    item.appendChild(element('span', '', SPEC.render.series[gi].label))
    legend.appendChild(item)
  }
  root.appendChild(legend)

  errorLine = element('p', 'experiment-error')
  errorLine.id = 'experiment-error'
  errorLine.hidden = true
  root.appendChild(errorLine)

  render()
}())
`

const runtimeHead = `<meta http-equiv="Content-Security-Policy" content="${experimentCsp}"><meta name="viewport" content="width=device-width, initial-scale=1">`

const runtimeDocument = (specLiteral: string): string => `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
${runtimeHead}
<title>学习课堂实验</title>
<style>
:root{color-scheme:light}
*{box-sizing:border-box}
body{margin:0;padding:16px;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#1f2328;background:#fff;line-height:1.5}
.experiment-title{margin:0 0 12px;font-size:18px}
.experiment-controls{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-bottom:12px}
.experiment-control{display:flex;flex-direction:column;gap:4px;font-size:13px}
.experiment-control input{width:100%}
.experiment-control-value{font-variant-numeric:tabular-nums;color:#0969da}
.experiment-readouts{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:12px}
.experiment-readout{display:flex;flex-direction:column;gap:2px;padding:8px 12px;border:1px solid #d8dee4;border-radius:8px;background:#f6f8fa;font-size:13px}
.experiment-readout-value{font-size:18px;font-variant-numeric:tabular-nums;color:#0969da}
.experiment-chart{width:100%;max-width:760px;height:auto;border:1px solid #d8dee4;border-radius:8px;background:#fff}
.experiment-legend{display:flex;flex-wrap:wrap;gap:10px;margin-top:8px;font-size:12px;color:#57606a}
.experiment-legend-item{display:inline-flex;align-items:center;gap:4px}
.experiment-legend-swatch{width:10px;height:10px;border-radius:2px;display:inline-block}
.experiment-error{color:#cf222e;font-size:13px;white-space:pre-wrap}
</style>
</head>
<body>
<div id="experiment-root"></div>
<script>const SPEC = ${specLiteral};${experimentRuntimeSource}</script>
</body>
</html>`

/**
 * Build the iframe document. The runtime is a fixed source constant; only the
 * escaped JSON literal is inserted. There is no model HTML tag insertion point.
 */
export function buildExperimentSrcdoc(spec: ExperimentSpec): string {
  const literal = jsonForScript(spec)
  return runtimeDocument(literal)
}
