import React, { useEffect, useMemo, useRef, useState } from 'react'
import { LessonFrame } from './lesson-frame.mjs'
import { RequestPanel } from './request-panel.tsx'
import { RecoveryPanel } from './recovery-panel.tsx'
import { FollowupPanel } from './followup-panel.tsx'
import { computeReadouts, normalizeParameters } from './lab-protocol.mjs'
import { describeGeneration } from './generation-status.mjs'

const labStyles = `.pl-lab{display:block}.pl-lab-head{display:flex;justify-content:space-between;align-items:flex-end;margin:0 0 18px}.pl-lab-head small{display:block;color:#a2a29a;font-size:11.5px;letter-spacing:.14em}.pl-lab-head b{font-size:24px;letter-spacing:-.01em;line-height:1.3}.pl-lab .pl-more{background:#fff;color:#6f6f68;border:1px solid #e6e6e2;border-radius:8px;padding:6px 12px;font-size:14px;line-height:1.4;cursor:pointer}.pl-lab-body{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:22px;align-items:start}.pl-lab .pl-canvas{position:relative}.pl-lab .pl-canvas iframe{height:460px}.pl-lab .pl-frame-wrap{transition:filter .25s ease}.pl-lab .pl-frame-wrap[data-locked=true]{filter:blur(3px) saturate(.65);pointer-events:none}.pl-lab .pl-lock-cover{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:24px}.pl-lab .pl-lock-card{background:#fff;border:1px solid #e6e6e2;border-radius:12px;padding:18px 24px;box-shadow:0 12px 34px rgba(0,0,0,.07);max-width:320px;text-align:center;color:#6f6f68;font-size:12.5px;line-height:1.8}.pl-lab .pl-lock-card b{display:block;color:#1f1f1d;font-size:15px;margin-bottom:4px}.pl-lab .pl-controls{border:1px solid #e6e6e2;border-radius:10px;margin-top:12px;padding:12px 16px}.pl-lab .pl-control{display:grid;grid-template-columns:90px 1fr 52px;align-items:center;gap:12px;margin:8px 0;font-size:13px;color:#666}.pl-lab .pl-control input{width:100%;accent-color:#0f6b3f;margin:0;padding:0;border:0}.pl-lab .pl-control output{text-align:right;color:#1f1f1d;font-variant-numeric:tabular-nums}.pl-lab .pl-bench{border:1px solid #e6e6e2;border-radius:12px;padding:18px 20px;background:#fff}.pl-lab .pl-seg + .pl-seg{border-top:1px solid #eee;margin-top:14px;padding-top:14px}.pl-lab .pl-seg h3{font-size:13px;margin:0 0 8px;display:flex;gap:8px;align-items:baseline}.pl-lab .pl-seg h3 span{color:#9a9a92;font-size:11px;letter-spacing:.08em}.pl-lab .pl-q{font-size:13px;color:#3a3a35;margin:0 0 10px}.pl-lab .pl-opts{display:grid;gap:8px}.pl-lab .pl-opt{background:#fff;color:#1f1f1d;border:1px solid #dbdbdb;border-radius:8px;padding:9px 12px;text-align:left;display:flex;gap:8px;align-items:center}.pl-lab .pl-opt i{font-style:normal;color:#9a9a92;font-size:11px}.pl-lab .pl-opt:disabled{cursor:default;opacity:1;border-color:#e6e6e2;background:#fafaf8}.pl-lab .pl-fb{font-size:12.5px;line-height:1.7;margin:10px 0 0}.pl-lab .pl-fb.ok{color:#0f6b3f}.pl-lab .pl-fb.no{color:#a2462a}.pl-lab .pl-lock{color:#a6a69e;font-size:12.5px;margin:0 0 10px}.pl-lab .pl-explain{font-size:12.5px;line-height:1.85;color:#3b3b36;margin:0 0 10px;border-left:2px solid #0f6b3f;padding-left:10px}.pl-lab .pl-readouts{display:flex;gap:10px;margin:12px 0 0}.pl-lab .pl-readouts div{flex:1;border:1px solid #e6e6e2;border-radius:8px;padding:8px 10px}.pl-lab .pl-readouts dt{font-size:11px;color:#8a8a84}.pl-lab .pl-readouts dd{margin:2px 0 0;font-size:17px;font-variant-numeric:tabular-nums}.pl-lab .pl-ask{display:block;font-size:12.5px;color:#3a3a35;margin:0 0 8px}.pl-lab .pl-restate{display:flex;gap:8px;align-items:flex-end}.pl-lab .pl-restate textarea{flex:1;margin:0;padding:9px 10px;border:1px solid #dbdbdb;border-radius:8px;font:inherit;resize:vertical}.pl-lab .pl-restate button{padding:8px 14px;background:#0f6b3f;color:#fff;border:0;border-radius:8px}.pl-lab .pl-checks{list-style:none;margin:10px 0 0;padding:0;display:flex;gap:12px;flex-wrap:wrap;font-size:12px;color:#9a9a92}.pl-lab .pl-checks li[data-passed=true]{color:#0f6b3f}.pl-lab .pl-primary{margin-top:16px;background:#0f6b3f;color:#fff;border:0;border-radius:8px;padding:10px 16px;font-weight:600}.pl-lab .pl-done{margin-top:14px;color:#0f6b3f;font-size:12.5px}.pl-lab .pl-legacy{color:#8a8a84;font-size:12.5px;margin-top:10px}.pl-lab .pl-empty{color:#8a8a84}.pl-lab .pl-error{color:#a22}.pl-lab .pl-gen{margin:0 0 14px;font-size:12.5px;padding:8px 12px;border:1px solid #e6e6e2;border-radius:8px;background:#fafaf8;color:#6f6f68}.pl-lab .pl-gen-active{color:#0f6b3f;border-color:#cfe3d8;background:#f3f8f4}.pl-lab .pl-gen-ok{color:#0f6b3f}.pl-lab .pl-gen-no{color:#a2462a;border-color:#eed3c8;background:#fdf6f3}.pl-lab .pl-loading{color:#8a8a84;font-size:13px;padding:40px 0}.pl-lab .pl-followup{margin-top:14px;border-top:1px solid #eee;padding-top:10px}.pl-lab .pl-followup summary{cursor:pointer;font-size:12.5px;color:#6f6f68}.pl-lab .pl-drawer{position:fixed;top:0;right:0;height:100%;width:420px;max-width:100vw;background:#fff;border-left:1px solid #e6e6e2;box-shadow:-16px 0 40px rgba(0,0,0,.08);z-index:20;display:flex;flex-direction:column}.pl-lab .pl-drawer-head{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid #eee}.pl-lab .pl-drawer-body{overflow:auto;padding:8px 18px 30px}.pl-lab .pl-drawer section{border-bottom:1px solid #f1f1ed;padding:14px 0}.pl-lab .pl-drawer h4{margin:0 0 8px;font-size:12px;color:#8a8a84;letter-spacing:.08em}.pl-lab .pl-course-list{list-style:none;margin:0;padding:0;display:grid;gap:4px}.pl-lab .pl-course-list button{background:none;color:#1f1f1d;text-align:left;padding:7px 8px;border-radius:6px}.pl-lab .pl-course-list button[aria-pressed=true]{background:#eaf3ed;color:#0f6b3f}.pl-lab .pl-muted{color:#a6a69e;font-size:12px}@media(max-width:1000px){.pl-lab-body{grid-template-columns:minmax(0,1fr)}}`

function LabFrame ({ course, instanceId, parameters, locked, onSnapshot }) {
  const ref = useRef(null)
  const nonce = useRef(crypto.randomUUID())
  const initial = useRef(parameters)
  useEffect(() => {
    const listener = event => {
      const data = event.data
      if (event.source !== ref.current?.contentWindow) return
      if (data?.type !== 'personal-learning:snapshot') return
      if (data.nonce !== nonce.current || data.courseId !== course.id || data.instanceId !== instanceId) return
      if (!data.parameters || Array.isArray(data.parameters) || Object.getPrototypeOf(data.parameters) !== Object.prototype) return
      if (JSON.stringify(data.parameters).length > 4000) return
      onSnapshot?.(data.parameters)
    }
    window.addEventListener('message', listener)
    return () => window.removeEventListener('message', listener)
  }, [course.id, instanceId, onSnapshot])
  useEffect(() => {
    ref.current?.contentWindow?.postMessage({ type: 'personal-learning:parameters', parameters }, '*')
  }, [parameters])
  useEffect(() => {
    ref.current?.contentWindow?.postMessage({ type: 'personal-learning:lock', locked }, '*')
  }, [locked])
  const identity = JSON.stringify({ nonce: nonce.current, courseId: course.id, instanceId }).replaceAll('<', '\\u003c')
  const restore = JSON.stringify(initial.current ?? {}).replaceAll('<', '\\u003c')
  const bridge = `<script>window.personalLearning={parameters:${restore},locked:${Boolean(locked)},save(parameters){parent.postMessage({...${identity},type:'personal-learning:snapshot',parameters},'*')}};window.addEventListener('message',function(event){var data=event.data;if(!data)return;if(data.type==='personal-learning:parameters'){window.personalLearning.parameters=data.parameters;window.dispatchEvent(new CustomEvent('personal-learning:parameters',{detail:data.parameters}))}if(data.type==='personal-learning:lock'){window.personalLearning.locked=!!data.locked;window.dispatchEvent(new CustomEvent('personal-learning:lock',{detail:{locked:!!data.locked}}))}});<\/script>`
  return <LessonFrame html={bridge + course.html} title={course.title} frameRef={ref} />
}

function LabBench ({ course, parameters, prediction, locked, restate, onPredict, onRestate, onComplete, done, followup }) {
  const lab = course.lab
  const readouts = useMemo(() => computeReadouts(lab, parameters), [lab, parameters])
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
        {locked
          ? <p className="pl-lock">先在上面选一个答案，老师再展开解释。</p>
          : <p className="pl-explain">{lab.prediction
            ? (prediction?.correct ? '你的预测和实验一致。继续拖参数，注意边界。' : '先对照右边的读数，再回头看你的预测差在哪一步。')
            : '拖动左侧参数，观察读数与画面如何一起变化。'}</p>}
        <dl className="pl-readouts">
          {readouts.map(readout => (
            <div key={readout.id}>
              <dt>{readout.label}</dt>
              <dd>{locked ? '?' : readout.text}</dd>
            </div>
          ))}
        </dl>
      </section>

      {lab.restate && (
        <section className="pl-seg">
          <h3><span>03</span>让我复述</h3>
          {locked
            ? <p className="pl-lock">预测之后才能复述——先把上面的答案定下来。</p>
            : <>
              <label className="pl-ask" htmlFor="pl-restate">{lab.restate.prompt}</label>
              <div className="pl-restate">
                <textarea id="pl-restate" rows="2" value={restateState?.text ?? ''} disabled={restateState?.passed} onInput={event => restateState?.onText(event.target.value)} placeholder="一句话就够，不用写公式" />
                <button type="button" disabled={restateState?.busy || restateState?.passed || !restateState?.text?.trim()} onClick={restateState?.onCheck}>提交</button>
              </div>
              {restateState?.checks && (
                <ul className="pl-checks">
                  {restateState.checks.map(check => (
                    <li key={check.id} data-passed={check.passed}>{check.passed ? '✓' : '·'} {check.label}</li>
                  ))}
                </ul>
              )}
              {restateState?.message && <p className={`pl-fb ${restateState.passed ? 'ok' : 'no'}`}>{restateState.message}</p>}
            </>}
        </section>
      )}

      {!locked && (done
        ? <p className="pl-done">已记入本课证据 · 下次进这一节会先考你这句话。</p>
        : restateState?.passed && (
          <button type="button" className="pl-primary" onClick={onComplete}>把这一节记下来，继续 <span>→</span></button>
        ))}

      <details className="pl-followup">
        <summary>追问这节课</summary>
        {followup}
      </details>
    </aside>
  )
}

export function LabPanel ({ instanceId, request, openSession }) {
  const [rows, setRows] = useState([])
  const [selected, setSelected] = useState('')
  const [parameters, setParameters] = useState({})
  const [loaded, setLoaded] = useState(false)
  const [prediction, setPrediction] = useState(null)
  const [restate, setRestate] = useState({ text: '', checks: null, passed: false, message: '', busy: false })
  const [done, setDone] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const [error, setError] = useState('')
  const [generation, setGeneration] = useState(null)

  useEffect(() => {
    let alive = true
    Promise.all([request({ action: 'course-list', instanceId }), request({ action: 'continuation-read', instanceId }), request({ action: 'request-list', instanceId })])
      .then(([courses, continuation, requests]) => {
        if (!alive) return
        setRows(courses)
        setGeneration(describeGeneration(requests))
        const saved = continuation.position?.courseId
        if (saved && !courses.some(course => course.id === saved)) {
          setSelected('')
          setError('上次的课程已不可用，请从「⋯」里选择另一节，或重新生成。')
          return
        }
        setSelected(saved ?? courses[0]?.id ?? '')
      })
      .catch(reason => { if (alive) setError(reason.message) })
    return () => { alive = false }
  }, [instanceId])

  useEffect(() => {
    if (drawer) return
    let alive = true
    request({ action: 'request-list', instanceId })
      .then(requests => { if (alive) setGeneration(describeGeneration(requests)) })
      .catch(() => {})
    return () => { alive = false }
  }, [drawer, instanceId])

  const course = rows.find(row => row.id === selected)
  const lab = course?.lab ?? null
  const locked = Boolean(lab?.prediction) && !prediction

  useEffect(() => {
    if (!course) return
    let alive = true
    setPrediction(null)
    setDone(false)
    setRestate({ text: '', checks: null, passed: false, message: '', busy: false })
    setLoaded(false)
    const fallback = course.lab ? normalizeParameters(course.lab, null) : {}
    setParameters(fallback)
    request({ action: 'continuation-read', instanceId })
      .then(continuation => {
        if (!alive) return
        const saved = continuation.position?.courseId === course.id ? continuation.position.parameters : null
        if (course.lab && saved) {
          try { setParameters(normalizeParameters(course.lab, saved)) } catch { setError('保存的实验参数超出允许范围，已回到初始值。') }
        }
        setLoaded(true)
        if (continuation.position?.courseId !== course.id) void request({ action: 'continuation-save', instanceId, courseId: course.id, parameters: fallback }).catch(reason => setError(reason.message))
      })
      .catch(reason => { if (alive) { setLoaded(true); setError(reason.message) } })
    return () => { alive = false }
  }, [course?.id])

  useEffect(() => {
    if (!drawer) return
    const listener = event => { if (event.key === 'Escape') setDrawer(false) }
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [drawer])

  function updateParameter (parameter, value) {
    const next = { ...parameters, [parameter.id]: value }
    const previous = parameters
    setParameters(next)
    void request({ action: 'continuation-save', instanceId, courseId: course.id, parameters: next }).catch(reason => {
      setParameters(previous)
      setError(reason.message)
    })
  }

  async function predict (option) {
    try {
      const row = await request({ action: 'evidence-save', instanceId, courseId: course.id, version: course.version, kind: 'prediction', answer: option.label, optionId: option.id, parameters })
      setPrediction({ optionId: option.id, correct: row.correct, feedback: row.feedbackText })
    } catch (reason) { setError(reason.message) }
  }

  async function check () {
    if (!lab?.restate || locked) return
    setRestate(current => ({ ...current, busy: true }))
    try {
      const row = await request({ action: 'evidence-save', instanceId, courseId: course.id, version: course.version, kind: 'explanation', answer: restate.text, parameters })
      setRestate(current => ({ ...current, checks: row.checks ?? null, passed: Boolean(row.passed), message: row.passed ? '复述通过：要点都覆盖了。' : '部分要点还没覆盖，看看缺哪一条。' }))
    } catch (reason) { setError(reason.message) } finally { setRestate(current => ({ ...current, busy: false })) }
  }

  async function complete () {
    try {
      await request({ action: 'lab-complete', instanceId, courseId: course.id, version: course.version, parameters })
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
      {generation && <p className={`pl-gen pl-gen-${generation.tone}`}>{generation.label}</p>}
      {!course && !error && <p className="pl-empty">还没有已提交的课程。用 /teach 生成一节，或从抽屉里选择其他课程。</p>}

      {course && (
        <div className="pl-lab-body">
          <div className="pl-canvas">
            {lab
              ? (loaded
                ? <div className="pl-frame-wrap" data-locked={locked}><LabFrame course={course} instanceId={instanceId} parameters={parameters} locked={locked} onSnapshot={next => {
                  try {
                    const normalized = normalizeParameters(lab, next)
                    setParameters(normalized)
                    void request({ action: 'continuation-save', instanceId, courseId: course.id, parameters: normalized }).catch(reason => setError(reason.message))
                  } catch { /* ignore malformed snapshots from the lesson */ }
                }} /></div>
                : <p className="pl-loading">正在恢复这一节的实验参数…</p>)
              : <LessonFrame html={course.html} title={course.title} />}
            {lab && locked && (
              <div className="pl-lock-cover">
                <div className="pl-lock-card"><b>先猜一下，再动手</b>回答右边的预测，画布和读数才会解锁。</div>
              </div>
            )}
            {!lab && <p className="pl-legacy">这一课没有交互协议，只能阅读；实验台不会伪装出可调参数。</p>}
            {lab && (
              <div className="pl-controls">
                {lab.parameters.map(parameter => (
                  <label key={parameter.id} className="pl-control">
                    <span>{parameter.label ?? parameter.id}</span>
                    <input type="range" min={parameter.min} max={parameter.max} step={parameter.step} value={parameters[parameter.id] ?? parameter.initial} disabled={locked} onChange={event => updateParameter(parameter, Number(event.target.value))} />
                    <output>{parameters[parameter.id] ?? parameter.initial}</output>
                  </label>
                ))}
              </div>
            )}
          </div>

          {lab
            ? <LabBench course={course} parameters={parameters} prediction={prediction} locked={locked} restate={{ ...restate, onText: text => setRestate(current => ({ ...current, text, passed: false, message: '', checks: null })), onCheck: check }} onPredict={predict} onComplete={complete} done={done} followup={<FollowupPanel instanceId={instanceId} course={course} request={request} openSession={openSession} capturedParameters={parameters} />} />
            : <aside className="pl-bench"><section className="pl-seg"><h3><span>!</span>只读课程</h3><p className="pl-explain">这一课是旧版产物，没有声明实验参数、预测或复述。你仍然可以阅读和追问，但它不会出现在实验台里。</p></section></aside>}
        </div>
      )}

      {drawer && (
        <div className="pl-drawer" role="dialog" aria-modal="true" aria-label="更多">
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
      )}
    </section>
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
