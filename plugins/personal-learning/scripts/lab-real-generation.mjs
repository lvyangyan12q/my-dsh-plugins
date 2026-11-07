#!/usr/bin/env node
// One-command real-model acceptance for the lab protocol.
// Requires an isolated DSH host that already has model credentials and the plugin enabled.
//
//   node scripts/lab-real-generation.mjs --base http://127.0.0.1:4405 --token <bootstrap-token> --out receipt.json
//
// It creates (or reuses) a learning instance, opens the native teaching session, sends one explicit
// request and waits for a course whose `lab` protocol the host accepted. It never prints credentials.

import {writeFile} from 'node:fs/promises'
import {argv, exit} from 'node:process'

const args = Object.fromEntries(argv.slice(2).reduce((pairs, value, index, all) => {
  if (value.startsWith('--')) pairs.push([value.slice(2), all[index + 1]])
  return pairs
}, []))
const base = args.base ?? 'http://127.0.0.1:4399'
const timeout = Number(args.timeout ?? 300000)
const out = args.out ?? 'lab-generation-receipt.json'

const prompt = [
  '为这个学习空间生成一节短小的交互课程，主题是条件概率。必须调用 personal_learning_submit_course 提交产物。',
  'title 用「条件概率：把范围缩小到 B」，concepts 填 ["条件概率"]。',
  'html 自包含、内联脚本样式；从 window.personalLearning.parameters 读取参数，控件变化时调用 window.personalLearning.save；',
  '并监听 personal-learning:parameters 与 personal-learning:lock：锁定时隐藏数值、禁用播放/单步。',
  'lab 必须符合协议 v1：version 1；parameters 为 N、B、AB 三个滑块（initial 100/40/30）；',
  'readouts 用 AB/N 与 AB/B；prediction 问「把范围缩到 B 之后，A 占的比例会——」，选项变大/不变，correct 指对；',
  'restate 要求复述为什么分母变成 40，包含分母、缩小、40 三个检查关键词。',
  '提交成功后只简短说明课程已保存。',
].join('\n')

let cookie = ''
async function call (body) {
  const response = await fetch(base + '/api/personal-learning', {
    method: body ? 'POST' : 'GET',
    headers: { cookie, origin: base, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const value = await response.json()
  if (!response.ok) throw Error(value.error ?? `HTTP ${response.status}`)
  return value
}

async function login () {
  const response = await fetch(base + '/' + (args.token ? '?token=' + args.token : ''), { redirect: 'manual' })
  cookie = response.headers.get('set-cookie')?.split(';')[0] ?? ''
  if (!cookie) throw Error('没有拿到 bootstrap cookie')
}

function sleep (ms) { return new Promise(resolve => setTimeout(resolve, ms)) }

try {
  await login()
  let state = await call()
  let instance = state.instances[0]
  if (!instance) instance = await call({ action: 'create', title: '生成验收', goal: '理解条件概率', priorKnowledge: '会古典概型' })
  const workspaces = await call({ action: 'teaching-workspaces' })
  if (!workspaces.length) throw Error('没有登记的工作目录，先在 DSH 里选择一个工作区')
  await call({ action: 'teaching-open', instanceId: instance.id, workspaceId: workspaces[0].id })
  const prepared = await call({ action: 'request-prepare', instanceId: instance.id, text: prompt, sources: [] })
  const sent = await call({ action: 'request-send', instanceId: instance.id, id: prepared.id, revision: prepared.revision })

  const deadline = Date.now() + timeout
  let course = null
  while (Date.now() < deadline) {
    await sleep(5000)
    const courses = await call({ action: 'course-list', instanceId: instance.id })
    course = courses.find(row => row.lab && row.lab.version === 1 && row.title.includes('条件概率'))
    if (course) break
    const requests = await call({ action: 'request-list', instanceId: instance.id })
    const latest = requests[0]
    console.error(`waiting: request=${latest?.status} native=${latest?.nativeStatus} artifact=${latest?.artifactStatus}`)
    if (latest?.nativeStatus === 'failed') throw Error('老师生成失败：' + (latest.notice ?? '没有可用课程'))
  }
  if (!course) throw Error('等待超时，没有收到带协议的课程')

  const receipt = {
    ok: true,
    instanceId: instance.id,
    courseId: course.id,
    title: course.title,
    version: course.version,
    labVersion: course.lab.version,
    parameters: course.lab.parameters.map(parameter => parameter.id),
    hasPrediction: Boolean(course.lab.prediction),
    hasRestate: Boolean(course.lab.restate),
    listensForParameters: course.html.includes('personal-learning:parameters'),
    listensForLock: course.html.includes('personal-learning:lock'),
    requestId: sent.id,
    base,
  }
  await writeFile(out, JSON.stringify(receipt, null, 2))
  console.log(JSON.stringify(receipt))
} catch (error) {
  console.error('FAILED:', error.message)
  exit(1)
}
