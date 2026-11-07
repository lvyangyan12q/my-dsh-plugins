import React, { useEffect, useMemo, useRef, useState } from 'react'
import { LessonFrame } from './lesson-frame.mjs'
import { RequestPanel } from './request-panel.tsx'
import { RecoveryPanel } from './recovery-panel.tsx'
import { checkRestate, computeReadouts, normalizeParameters } from './lab-protocol.mjs'

const labStyles = `.pl-lab{display:block}.pl-lab-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}.pl-lab-head small{display:block;color:#8a8a84;font-size:11.5px;letter-spacing:.12em}.pl-lab-head b{font-size:22px}.pl-lab .pl-more{background:#fff;color:#444;border:1px solid #e6e6e2;border-radius:8px;padding:6px 12px}.pl-lab-body{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:22px;align-items:start}.pl-lab .pl-canvas iframe{height:460px}.pl-lab .pl-controls{border:1px solid #e6e6e2;border-radius:10px;margin-top:12px;padding:12px 16px}.pl-lab .pl-control{display:grid;grid-template-columns:90px 1fr 52px;align-items:center;gap:12px;margin:8px 0;font-size:13px;color:#666}.pl-lab .pl-control input{width:100%;accent-color:#0f6b3f;margin:0;padding:0;border:0}.pl-lab .pl-control output{text-align:right;color:#1f1f1d;font-variant-numeric:tabular-nums}.pl-lab .pl-bench{border:1px solid #e6e6e2;border-radius:12px;padding:18px 20px;background:#fff}.pl-lab .pl-seg + .pl-seg{border-top:1px solid #eee;margin-top:14px;padding-top:14px}.pl-lab .pl-seg h3{font-size:13px;margin:0 0 8px;display:flex;gap:8px;align-items:baseline}.pl-lab .pl-seg h3 span{color:#9a9a92;font-size:11px;letter-spacing:.08em}.pl-lab .pl-q{font-size:13px;color:#3a3a35;margin:0 0 10px}.pl-lab .pl-opts{display:grid;gap:8px}.pl-lab .pl-opt{background:#fff;color:#1f1f1d;border:1px solid #dbdbdb;border-radius:8px;padding:9px 12px;text-align:left;display:flex;gap:8px;align-items:center}.pl-lab .pl-opt i{font-style:normal;color:#9a9a92;font-size:11px}.pl-lab .pl-opt:disabled{cursor:default;opacity:1;border-color:#e6e6e2;background:#fafaf8}.pl-lab .pl-fb{font-size:12.5px;line-height:1.7;margin:10px 0 0}.pl-lab .pl-fb.ok{color:#0f6b3f}.pl-lab .pl-fb.no{color:#a2462a}.pl-lab .pl-lock{color:#a6a69e;font-size:12.5px;margin:0 0 10px}.pl-lab .pl-explain{font-size:12.5px;line-height:1.85;color:#3b3b36;margin:0 0 10px;border-left:2px solid #0f6b3f;padding-left:10px}.pl-lab .pl-readouts{display:flex;gap:10px;margin:12px 0 0}.pl-lab .pl-readouts div{flex:1;border:1px solid #e6e6e2;border-radius:8px;padding:8px 10px}.pl-lab .pl-readouts dt{font-size:11px;color:#8a8a84}.pl-lab .pl-readouts dd{margin:2px 0 0;font-size:17px;font-variant-numeric:tabular-nums}.pl-lab .pl-ask{display:block;font-size:12.5px;color:#3a3a35;margin:0 0 8px}.pl-lab .pl-restate{display:flex;gap:8px;align-items:flex-end}.pl-lab .pl-restate textarea{flex:1;margin:0;padding:9px 10px;border:1px solid #dbdbdb;border-radius:8px;font:inherit;resize:vertical}.pl-lab .pl-restate button{padding:8px 14px;background:#0f6b3f;color:#fff;border:0;border-radius:8px}.pl-lab .pl-checks{list-style:none;margin:10px 0 0;padding:0;display:flex;gap:12px;flex-wrap:wrap;font-size:12px;color:#9a9a92}.pl-lab .pl-checks li[data-passed=true]{color:#0f6b3f}.pl-lab .pl-primary{margin-top:16px;background:#0f6b3f;color:#fff;border:0;border-radius:8px;padding:10px 16px;font-weight:600}.pl-lab .pl-done{margin-top:14px;color:#0f6b3f;font-size:12.5px}.pl-lab .pl-legacy{color:#8a8a84;font-size:12.5px;margin-top:10px}.pl-lab .pl-empty{color:#8a8a84}.pl-lab .pl-error{color:#a22}.pl-lab .pl-drawer{position:fixed;top:0;right:0;height:100%;width:420px;max-width:94vw;background:#fff;border-left:1px solid #e6e6e2;transform:translateX(102%);transition:transform .2s;z-index:20;display:flex;flex-direction:column}.pl-lab .pl-drawer[data-open=true]{transform:none}.pl-lab .pl-drawer-head{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid #eee}.pl-lab .pl-drawer-body{overflow:auto;padding:8px 18px 30px}.pl-lab .pl-drawer section{border-bottom:1px solid #f1f1ed;padding:14px 0}.pl-lab .pl-drawer h4{margin:0 0 8px;font-size:12px;color:#8a8a84;letter-spacing:.08em}.pl-lab .pl-course-list{list-style:none;margin:0;padding:0;display:grid;gap:4px}.pl-lab .pl-course-list button{background:none;color:#1f1f1d;text-align:left;padding:7px 8px;border-radius:6px}.pl-lab .pl-course-list button[aria-pressed=true]{background:#eaf3ed;color:#0f6b3f}.pl-lab .pl-muted{color:#a6a69e;font-size:12px}@media(max-width:1000px){.pl-lab-body{grid-template-columns:minmax(0,1fr)}}`

function LabFrame ({ course, instanceId, parameters, onSnapshot }) {
  const ref = useRef(null)
  const nonce = useRef(crypto.randomUUID())
  useEffect(() => {
    const listener = event => {
      const data = event.data
      if (event.source !== ref.current?.contentWindow) return
      if (data?.type !== 'personal-learning:snapshot') return
      if (data.nonce !== nonce.current || data.courseId !== course.id || data.instanceId !== instanceId) return
      if (!data.parameters || Array.isArray(data.parameters) || Object.getPrototypeOf(data.parameters) !== Object.prototype) return
      onSnapshot?.(data.parameters)
    }
    window.addEventListener('message', listener)
    return () => window.removeEventListener('message', listener)
  }, [course.id, instanceId, onSnapshot])
  const identity = JSON.stringify({ nonce: nonce.current, courseId: course.id, instanceId }).replaceAll('<', '\\u003c')
  const restore = JSON.stringify(parameters ?? {}).replaceAll('<', '\\u003c')
  const bridge = `<script>window.personalLearning={parameters:${restore},save(parameters){parent.postMessage({...${identity},type:'personal-learning:snapshot',parameters},'*')}};<\/script>`
  return <LessonFrame html={bridge + course.html} title={course.title} frameRef={ref} />
}

function LabBench ({ course, parameters, prediction, restate, onPredict, onRestate, onComplete, done }) {
  const lab = course.lab
  const readouts = useMemo(() => computeReadouts(lab, parameters), [lab, parameters])
  const masked = Boolean(lab.prediction) && !prediction
  const restateState = restate
  return (
    <aside className="pl-bench" aria-label="老师工作台">
      {lab.prediction && (
        <section className="pl-seg">
          <h3><span>01</span>老师让你先猜</h3>
          <p className="pl-q">{lab.prediction.question}</p>
          <div className="pl-opts" role="group" aria-label="预测">
            {lab.prediction.options.map((option, index) => (
              <button key={option.id} type="button" className="pl-opt" disabled={Boolean(prediction)} onClick={() => onPredict(option)}>
                <i>{index + 1}</i>{option.label}
              </button>
            ))}
          </div>
          {prediction && <p className={`pl-fb ${prediction.correct ? 'ok' : 'no'}`}>{prediction.feedback}</p>}
        </section>
      )}

      <section className="pl-seg">
        <h3><span>02</span>{lab.prediction ? '老师解释' : '这一课在看什么'}</h3>
        {masked
          ? <p className="pl-lock">先在上面选一个答案，老师再展开解释。</p>
          : <p className="pl-explain">{lab.prediction
            ? (prediction?.correct ? '你的预测和实验一致。继续拖参数，注意边界。' : '先对照右边的读数，再回头看你的预测差在哪一步。')
            : '拖动左侧参数，观察读数与画面如何一起变化。'}</p>}
        <dl className="pl-readouts">
          {readouts.map(readout => (
            <div key={readout.id}>
              <dt>{readout.label}</dt>
              <dd>{masked ? '?' : readout.text}</dd>
            </div>
          ))}
        </dl>
      </section>

      {lab.restate && (
        <section className="pl-seg">
          <h3><span>03</span>让我复述</h3>
          <label className="pl-ask" htmlFor="pl-restate">{lab.restate.prompt}</label>
          <div className="pl-restate">
            <textarea id="pl-restate" rows="2" value={restateState?.text ?? ''} onInput={event => restateState?.onText(event.target.value)} onChange={event => restateState?.onText(event.target.value)} placeholder="一句话就够，不用写公式" />
            <button type="button" disabled={restateState?.busy || !restateState?.text?.trim()} onClick={restateState?.onCheck}>提交</button>
          </div>
          {restateState?.checks && (
            <ul className="pl-checks">
              {restateState.checks.map(check => (
                <li key={check.id} data-passed={check.passed}>{check.passed ? '✓' : '·'} {check.label}</li>
              ))}
            </ul>
          )}
          {restateState?.message && <p className={`pl-fb ${restateState.passed ? 'ok' : 'no'}`}>{restateState.message}</p>}
        </section>
      )}

      {done
        ? <p className="pl-done">已记入本课证据 · 下次进这一节会先考你这句话。</p>
        : restateState?.passed && (
          <button type="button" className="pl-primary" onClick={onComplete}>把这一节记下来，继续 <span>→</span></button>
        )}
    </aside>
  )
}

function NativeSession ({ instanceId, request, openSession }) {
  const [rows, setRows] = useState([])
  const [error, setError] = useState('')
  useEffect(() => { request({ action: 'teaching-workspaces' }).then(setRows).catch(reason => setError(reason.message)) }, [instanceId])
  async function open (row) {
    try {
      const binding = await request({ action: 'teaching-open', instanceId, workspaceId: row.id })
      openSession(binding.sessionId)
    } catch (reason) { setError(reason.message) }
  }
  return (
    <div>
      <p className="pl-muted">追问会进入同一个原生教学会话，可继续、停止与审批。</p>
      <ul className="pl-course-list">
        {rows.map(row => <li key={row.id}><button type="button" onClick={() => open(row)}>打开或继续教学 · {row.path}</button></li>)}
        {!rows.length && !error && <li className="pl-muted">没有可用工作目录</li>}
        {error && <li className="pl-error">{error}</li>}
      </ul>
    </div>
  )
}

export function LabPanel ({ instanceId, request, openSession }) {
  const [rows, setRows] = useState([])
  const [selected, setSelected] = useState('')
  const [parameters, setParameters] = useState({})
  const [prediction, setPrediction] = useState(null)
  const [restate, setRestate] = useState({ text: '', checks: null, passed: false, message: '', busy: false })
  const [done, setDone] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    Promise.all([request({ action: 'course-list', instanceId }), request({ action: 'continuation-read', instanceId })])
      .then(([courses, continuation]) => {
        if (!alive) return
        setRows(courses)
        const saved = continuation.position?.courseId
        setSelected(courses.some(course => course.id === saved) ? saved : (courses[0]?.id ?? ''))
      })
      .catch(reason => { if (alive) setError(reason.message) })
    return () => { alive = false }
  }, [instanceId])

  const course = rows.find(row => row.id === selected)
  const lab = course?.lab ?? null

  useEffect(() => {
    if (!course) return
    let alive = true
    setPrediction(null)
    setDone(false)
    setRestate({ text: '', checks: null, passed: false, message: '', busy: false })
    request({ action: 'continuation-read', instanceId })
      .then(continuation => {
        if (!alive) return
        const raw = continuation.position?.courseId === course.id ? continuation.position.parameters : null
        setParameters(course.lab ? normalizeParameters(course.lab, raw) : {})
        if (continuation.position?.courseId !== course.id) void request({ action: 'continuation-save', instanceId, courseId: course.id, parameters: {} })
      })
      .catch(reason => { if (alive) setError(reason.message) })
    return () => { alive = false }
  }, [course?.id])

  function updateParameter (parameter, value) {
    const next = { ...parameters, [parameter.id]: value }
    setParameters(next)
    void request({ action: 'continuation-save', instanceId, courseId: course.id, parameters: next }).catch(reason => setError(reason.message))
  }

  async function predict (option) {
    try {
      const row = await request({ action: 'evidence-save', instanceId, courseId: course.id, version: course.version, kind: 'prediction', answer: option.label, optionId: option.id })
      setPrediction({ optionId: option.id, correct: row.correct, feedback: row.feedbackText })
    } catch (reason) { setError(reason.message) }
  }

  async function check () {
    if (!lab?.restate) return
    const local = checkRestate(lab, restate.text)
    setRestate(current => ({ ...current, busy: true, checks: local.checks, passed: local.passed, message: local.passed ? '复述通过：三个要点都覆盖了。' : '还缺上面的要点，补一句再提交。' }))
    try {
      const row = await request({ action: 'evidence-save', instanceId, courseId: course.id, version: course.version, kind: 'explanation', answer: restate.text })
      if (row.checks) setRestate(current => ({ ...current, checks: row.checks, passed: row.passed, message: row.passed ? '复述通过：三个要点都覆盖了。' : '部分要点还没覆盖，看看缺哪一条。' }))
    } catch (reason) { setError(reason.message) } finally { setRestate(current => ({ ...current, busy: false })) }
  }

  async function complete () {
    try {
      await request({ action: 'lab-complete', instanceId, courseId: course.id, version: course.version })
      setDone(true)
    } catch (reason) { setError(reason.message) }
  }

  return (
    <section className="pl-lab" aria-label="学习实验台"><style>{labStyles}</style>
      <header className="pl-lab-head">
        <div>
          <small>学习实验台</small>
          <b>{course?.title ?? '还没有课程'}</b>
        </div>
        <button type="button" className="pl-more" aria-expanded={drawer} onClick={() => setDrawer(value => !value)}>⋯</button>
      </header>

      {error && <p role="alert" className="pl-error">{error}</p>}
      {!course && !error && <p className="pl-empty">还没有已提交的课程。用 /teach 生成一节，或从抽屉里选择其他课程。</p>}

      {course && (
        <div className="pl-lab-body">
          <div className="pl-canvas">
            {lab
              ? <LabFrame course={course} instanceId={instanceId} parameters={parameters} onSnapshot={next => setParameters(next)} />
              : <LessonFrame html={course.html} title={course.title} />}
            {!lab && <p className="pl-legacy">这一课没有交互协议，只能阅读；实验台不会伪装出可调参数。</p>}
            {lab && (
              <div className="pl-controls">
                {lab.parameters.map(parameter => (
                  <label key={parameter.id} className="pl-control">
                    <span>{parameter.label ?? parameter.id}</span>
                    <input type="range" min={parameter.min} max={parameter.max} step={parameter.step} value={parameters[parameter.id] ?? parameter.initial} disabled={Boolean(lab.prediction) && !prediction} onChange={event => updateParameter(parameter, Number(event.target.value))} />
                    <output>{parameters[parameter.id] ?? parameter.initial}</output>
                  </label>
                ))}
              </div>
            )}
          </div>

          {lab
            ? <LabBench course={course} parameters={parameters} prediction={prediction} restate={{ ...restate, onText: text => setRestate(current => ({ ...current, text })), onCheck: check }} onPredict={predict} onComplete={complete} done={done} />
            : <aside className="pl-bench"><section className="pl-seg"><h3><span>!</span>只读课程</h3><p className="pl-explain">这一课是旧版产物，没有声明实验参数、预测或复述。你仍然可以阅读和追问，但它不会出现在实验台里。</p></section></aside>}
        </div>
      )}

      <div className="pl-drawer" data-open={drawer} aria-hidden={!drawer}>
        <div className="pl-drawer-head"><b>更多</b><button type="button" onClick={() => setDrawer(false)}>关闭</button></div>
        <div className="pl-drawer-body">
          <section>
            <h4>课程</h4>
            <ul className="pl-course-list">
              {rows.map(row => (
                <li key={row.id}>
                  <button type="button" aria-pressed={row.id === selected} onClick={() => { setSelected(row.id); setDrawer(false) }}>{row.title} · v{row.version}</button>
                </li>
              ))}
              {!rows.length && <li className="pl-muted">暂无课程</li>}
            </ul>
          </section>
          <section>
            <h4>教学会话</h4>
            <NativeSession instanceId={instanceId} request={request} openSession={openSession} />
          </section>
          <section>
            <h4>教学请求</h4>
            <RequestPanel instanceId={instanceId} request={request} openSession={openSession} />
          </section>
          <section>
            <h4>恢复与历史</h4>
            <RecoveryPanel instanceId={instanceId} request={request} openSession={openSession} />
          </section>
        </div>
      </div>
    </section>
  )
}
