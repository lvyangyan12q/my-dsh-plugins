/**
 * DeepSeek Harness plugin: the kaogong (考公) learning suite for the
 * 武汉市公务员考试. Durable state lives in storage-domain domains
 * (`kaogong_notebook` + `kaogong_progress`) so the wrong-answer notebook
 * and the backward-scheduled study plan are shared across agents.
 *
 * Tools: kaogong_record_question, kaogong_list_questions,
 *   kaogong_analyze_errors, kaogong_summarize_weaknesses, kaogong_taxonomy,
 *   kaogong_delete_question, kaogong_plan_set, kaogong_plan_view,
 *   kaogong_plan_done, kaogong_progress_status.
 *
 * @module kaogong
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { KvTable, DomainGlobal } from '@deepseek-ai/dsh-storage-domain'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { extname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { analyzeQuestions, summarizeQuestions } from './analyze.ts'
import type { AnalysisResult } from './analyze.ts'
import { generatePlan, daysToExam, isValidIsoDate } from './schedule.ts'
import type { DayPlan } from './schedule.ts'
import { TAXONOMY, ERROR_REASONS, renderTaxonomy } from './taxonomy.ts'
import { notebookDomainSpec, progressDomainSpec, bankDomainSpec, knowledgeDomainSpec } from './domain.ts'
import type { QuestionRecord, PlanConfig, DayPlanRecord, BankQuestionRecord, KnowledgeEntryRecord } from './domain.ts'
import { selectPractice } from './practice.ts'
import { searchKnowledge } from './knowledge.ts'
import type { Question, AttemptResult, BankQuestion, KnowledgeEntry, BankReviewStatus } from './types.ts'
import { KNOWLEDGE_KINDS } from './types.ts'

export const name = 'kaogong'
export const inject = ['tools', 'storageDomain', 'webServer']

/** Plugin configuration, validated by the schemastery schema below. */
export interface Config {
  /** Number of weak knowledge points to surface in summaries. */
  topN?: number
}

/** Schemastery schema for {@link Config}. */
export const Config: z<Config> = z.object({
  topN: z.natural().min(1).default(8),
})

const DEFAULT_TOP_N = 8
const LIST_LIMIT_DEFAULT = 50
const QUESTION_IMAGE_ROOT = fileURLToPath(new URL('../题目_images/', import.meta.url))
const IMAGE_CONTENT_TYPES: Record<string, string> = {
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}
const VERIFIED_MATERIAL_IMAGES = [{
  marker: '表 2022~2023年上半年某地区社会经济发展主要指标',
  asset: 'verified/资料600-2024-jiangsu-17.png',
  compact: true,
}, {
  marker: '2023年4月份，我国社会消费品零售总额34910亿元',
  asset: 'verified/资料600-2023-hebei-retail-growth.png',
  compact: false,
}] as const

/** Map an attempt result to its Chinese label. */
function labelResult(result: AttemptResult): string {
  switch (result) {
    case 'correct': return '做对'
    case 'wrong': return '做错'
    default: return '跳过'
  }
}

/** Format a 0..1 rate as a percentage string. */
function pctText(rate: number): string {
  return Math.round(rate * 1000) / 10 + '%'
}

/** Today's date as a local YYYY-MM-DD string. */
function todayStr(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return d.getFullYear() + '-' + m + '-' + day
}

/** Send a small JSON response for the local dashboard. */
function sendJson(res: import('node:http').ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(body)
}

function isWithinQuestionImageRoot(path: string): boolean {
  const pathFromRoot = relative(QUESTION_IMAGE_ROOT, path)
  return pathFromRoot !== '' && !pathFromRoot.startsWith('..') && !isAbsolute(pathFromRoot)
}

/** Resolve an image asset while accepting both historical flat and current folder paths. */
function resolveQuestionImage(asset: string): string | undefined {
  const normalized = asset.replaceAll('\\', '/').replace(/^\/+/, '')
  if (!normalized.startsWith('verified/') || normalized.includes('\0')) return undefined

  const direct = resolve(QUESTION_IMAGE_ROOT, normalized)
  if (isWithinQuestionImageRoot(direct)) return direct
  return undefined
}

async function readQuestionImage(asset: string): Promise<{ body: Buffer; contentType: string } | undefined> {
  const direct = resolveQuestionImage(asset)
  if (direct === undefined) return undefined
  try {
    return { body: await readFile(direct), contentType: IMAGE_CONTENT_TYPES[extname(direct).toLowerCase()] ?? 'application/octet-stream' }
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined
    throw error
  }
}

async function serveQuestionImage(
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
  asset: string,
): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { error: 'method not allowed' })
    return
  }
  try {
    const image = await readQuestionImage(asset)
    if (image === undefined) {
      sendJson(res, 404, { error: 'material image not found' })
      return
    }
    res.writeHead(200, {
      'content-type': image.contentType,
      'cache-control': 'private, max-age=86400',
    })
    res.end(req.method === 'HEAD' ? undefined : image.body)
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
  }
}

/** Replace guessed page references only when a material image has been manually verified. */
async function applyVerifiedMaterialImages(bankQuestions: KvTable<string, BankQuestionRecord>): Promise<number> {
  let updated = 0
  for (const [id, question] of bankQuestions.entries()) {
    if (question.subject !== '行测-资料分析') continue
    const rule = VERIFIED_MATERIAL_IMAGES.find(candidate => question.stem.includes(candidate.marker))
    if (rule === undefined) continue
    const reference = `![材料图表](题目_images/${rule.asset})`
    const imageBlock = /\n!\[材料图表\]\([^)]+\)(?:\n!\[材料图表\]\([^)]+\))*/
    const questionText = question.stem.slice(question.stem.lastIndexOf('\n') + 1).trim()
    const stem = rule.compact && questionText
      ? `【材料】\n${reference}\n${questionText}`
      : imageBlock.test(question.stem)
        ? question.stem.replace(imageBlock, `\n${reference}`)
        : question.stem
    if (stem === question.stem) continue
    await bankQuestions.put(id, { ...question, stem })
    updated++
  }
  return updated
}

/** Read a JSON request body with a conservative size limit. */
async function readJson(req: import('node:http').IncomingMessage): Promise<Record<string, unknown>> {
  let body = ''
  for await (const chunk of req) {
    body += chunk.toString()
    if (body.length > 32_000) throw new Error('request body too large')
  }
  const value: unknown = body === '' ? {} : JSON.parse(body)
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('request body must be an object')
  return value as Record<string, unknown>
}

/**
 * Derive the attempt result when the model omitted it: empty answer means
 * skipped, an equal answer means correct, otherwise wrong.
 */
function deriveResult(result: AttemptResult | undefined, userAnswer: string, correctAnswer: string): AttemptResult {
  if (result) return result
  const ua = userAnswer.trim()
  if (!ua) return 'skipped'
  return ua === correctAnswer ? 'correct' : 'wrong'
}

/** Project a notebook table's entries into id-bearing questions. */
function allQuestions(questions: KvTable<string, QuestionRecord>): Question[] {
  const out: Question[] = []
  for (const [id, record] of questions.entries()) out.push({ id, ...record })
  return out
}

/** Count wrong answers in the notebook table. */
function countWrong(questions: KvTable<string, QuestionRecord>): number {
  let count = 0
  for (const [, record] of questions.entries()) if (record.result === 'wrong') count++
  return count
}

/** Project a bank table's entries into id-bearing bank questions. */
function allBankQuestions(bank: KvTable<string, BankQuestionRecord>): BankQuestion[] {
  const out: BankQuestion[] = []
  for (const [id, record] of bank.entries()) out.push({ id, ...record })
  return out
}

/** Project a knowledge table's entries into id-bearing knowledge entries. */
function allKnowledgeEntries(entries: KvTable<string, KnowledgeEntryRecord>): KnowledgeEntry[] {
  const out: KnowledgeEntry[] = []
  for (const [id, record] of entries.entries()) out.push({ id, ...record })
  return out
}

type PracticeSubmission = { id: string; answer: string }

/** Grade one practice set and persist its results to the wrong-answer notebook. */
async function gradePractice(
  bankQuestions: KvTable<string, BankQuestionRecord>,
  notebookQuestions: KvTable<string, QuestionRecord>,
  answers: readonly PracticeSubmission[],
) {
  const submittedIds = new Set<string>()
  for (const submission of answers) {
    if (!submission.id || submittedIds.has(submission.id)) throw new Error(`invalid or duplicate question id: ${submission.id}`)
    submittedIds.add(submission.id)
    if (bankQuestions.get(submission.id) === undefined) throw new Error(`question not found: ${submission.id}`)
  }

  const results: { id: string; subject: string; knowledgePoint: string; correct: boolean; correctAnswer: string; explanation: string }[] = []
  let correctCount = 0
  const now = new Date().toISOString()
  for (const submission of answers) {
    const bank = bankQuestions.get(submission.id)
    if (bank === undefined) throw new Error(`question not found: ${submission.id}`)
    const answer = submission.answer.trim()
    const correct = answer === bank.correctAnswer.trim()
    if (correct) correctCount++

    const existing = notebookQuestions.get(submission.id)
    await notebookQuestions.put(submission.id, {
      subject: bank.subject,
      knowledgePoint: bank.knowledgePoint,
      questionType: bank.questionType,
      stem: bank.stem,
      options: bank.options,
      correctAnswer: bank.correctAnswer,
      userAnswer: answer,
      result: correct ? 'correct' : 'wrong',
      errorReason: '',
      notes: '',
      source: bank.source,
      tags: bank.tags,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    })
    results.push({
      id: submission.id,
      subject: bank.subject,
      knowledgePoint: bank.knowledgePoint,
      correct,
      correctAnswer: bank.correctAnswer,
      explanation: bank.explanation,
    })
  }
  const totalCount = results.length
  return { totalCount, correctCount, accuracyRate: totalCount === 0 ? 0 : correctCount / totalCount, results }
}

/** Build a module-scoped wrong-answer summary for the dashboard. */
function summarizeModule(notebookQuestions: KvTable<string, QuestionRecord>, subject: string, topN: number) {
  return summarizeQuestions(
    allQuestions(notebookQuestions).filter(question => question.subject === subject),
    { topN },
  )
}

/**
 * Open the notebook + progress domains and register every tool.
 * @param ctx - registrant context carrying the tool registry.
 * @param config - deployment configuration.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const topN = config.topN ?? DEFAULT_TOP_N
  const notebook = await ctx.storageDomain.open(notebookDomainSpec)
  const progress = await ctx.storageDomain.open(progressDomainSpec)
  const bank = await ctx.storageDomain.open(bankDomainSpec)
  const knowledge = await ctx.storageDomain.open(knowledgeDomainSpec)
  ctx.effect(() => () => Promise.all([notebook.close(), progress.close(), bank.close(), knowledge.close()]), 'kaogong.domainClose')

  const questions = notebook.table('questions')
  const planConfig = progress.global
  const days = progress.table('days')
  const bankQuestions = bank.table('questions')
  const knowledgeEntries = knowledge.table('entries')

  await applyVerifiedMaterialImages(bankQuestions)

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/api/kaogong/material-image',
    handler: async (req, res) => {
      const asset = new URL(req.url ?? '', 'http://localhost').searchParams.get('asset') ?? ''
      await serveQuestionImage(req, res, asset)
    },
  }), 'kaogong.materialImageRoute')

  // Older cached clients use the raw relative Markdown image URL instead of the API route.
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/%E9%A2%98%E7%9B%AE_images/verified',
    handler: async (req, res) => {
      const pathname = decodeURIComponent(new URL(req.url ?? '', 'http://localhost').pathname)
      const asset = pathname.slice('/题目_images/'.length)
      await serveQuestionImage(req, res, asset)
    },
  }), 'kaogong.verifiedMaterialCompatibilityRoute')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/api/kaogong/dashboard',
    handler: (_req, res) => {
      const config = planConfig.get()
      const today = todayStr()
      const allDays = Array.from(days.entries())
      let pastDays = 0
      let pastDone = 0
      for (const [date, day] of allDays) {
        if (date <= today) {
          pastDays++
          if (day.items.length > 0 && day.items.every(item => item.done)) pastDone++
        }
      }
      const analysis = analyzeQuestions(allQuestions(questions))
      const weakPoints = analysis.byKnowledgePoint
        .filter(point => point.wrongCount > 0)
        .slice(0, topN)
        .map(point => ({
          subject: point.subject,
          knowledgePoint: point.knowledgePoint,
          wrongCount: point.wrongCount,
          errorRate: point.errorRate,
        }))
      const recentKnowledge = allKnowledgeEntries(knowledgeEntries)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 6)
        .map(entry => ({
          id: entry.id,
          title: entry.title,
          subject: entry.subject,
          knowledgePoint: entry.knowledgePoint,
          kind: entry.kind,
          content: entry.content.slice(0, 180),
          updatedAt: entry.updatedAt,
        }))
      const bySubject = new Map(analysis.bySubject.map(stat => [stat.subject, stat]))
      const modules = TAXONOMY.map(entry => {
        const stat = bySubject.get(entry.subject)
        return {
          subject: entry.subject,
          availableCount: allBankQuestions(bankQuestions).filter(question => question.subject === entry.subject && question.reviewStatus === 'approved').length,
          practicedCount: stat?.totalCount ?? 0,
          wrongCount: stat?.wrongCount ?? 0,
          accuracyRate: stat === undefined || stat.totalCount === 0 ? 0 : 1 - stat.errorRate,
        }
      })
      const todayPlan = days.get(today)
      sendJson(res, 200, {
        today,
        examDate: config.examDate,
        daysToExam: daysToExam(today, config.examDate),
        totalDays: allDays.length,
        pastDays,
        pastDone,
        pastDonePct: pastDays === 0 ? 0 : pastDone / pastDays,
        totalQuestions: analysis.totalQuestions,
        totalCorrect: analysis.totalCorrect,
        totalWrong: analysis.totalWrong,
        accuracyRate: analysis.accuracyRate,
        bankTotal: bankQuestions.size,
        knowledgeTotal: knowledgeEntries.size,
        todayPlan: {
          phase: todayPlan?.phase ?? 'foundation',
          items: todayPlan?.items ?? [],
        },
        weakPoints,
        modules,
        recentKnowledge,
      })
    },
  }), 'kaogong.dashboardRoute')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/api/kaogong/plan/done',
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'method not allowed' })
        return
      }
      try {
        const body = await readJson(req)
        const date = typeof body.date === 'string' ? body.date : todayStr()
        const index = typeof body.index === 'number' ? body.index : -1
        const done = body.done !== false
        if (!isValidIsoDate(date) || !Number.isInteger(index) || index < 0) throw new Error('invalid plan item')
        const day = days.get(date)
        if (day === undefined || index >= day.items.length) throw new Error('plan item not found')
        const items = day.items.map((item, itemIndex) => itemIndex === index ? { ...item, done } : item)
        await days.put(date, { ...day, items })
        sendJson(res, 200, { date, items })
      } catch (error) {
        sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
      }
    },
  }), 'kaogong.planDoneRoute')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/api/kaogong/practice/start',
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'method not allowed' })
        return
      }
      try {
        const body = await readJson(req)
        const subject = typeof body.subject === 'string' ? body.subject.trim() : ''
        const knowledgePoint = typeof body.knowledgePoint === 'string' ? body.knowledgePoint.trim() : ''
        const excludeIds = Array.isArray(body.excludeIds)
          ? body.excludeIds.map(value => {
            if (typeof value !== 'string' || !value.trim()) throw new Error('invalid excludeIds')
            return value
          })
          : []
        if (excludeIds.length > 500) throw new Error('too many excluded questions')
        const requestedLimit = typeof body.limit === 'number' ? body.limit : 10
        const limit = Math.min(20, Math.max(1, Math.floor(requestedLimit)))
        const bank = allBankQuestions(bankQuestions)
        const notebook = allQuestions(questions)
        const optionSets = knowledgePoint
          ? [{ limit, ...(subject ? { subject } : {}), knowledgePoint, excludeIds }, { limit, ...(subject ? { subject } : {}), excludeIds }]
          : [{ limit, ...(subject ? { subject } : {}), excludeIds }]
        const selections = optionSets.map(options => selectPractice(bank, notebook, options))
        let selection = selections.find(candidate => candidate.selected.length > 0) ?? selections[0]!
        let cycled = false
        if (selection.selected.length === 0 && excludeIds.length > 0) {
          const retrySets = knowledgePoint
            ? [{ limit, ...(subject ? { subject } : {}), knowledgePoint }, { limit, ...(subject ? { subject } : {}) }]
            : [{ limit, ...(subject ? { subject } : {}) }]
          const retried = retrySets.map(options => selectPractice(bank, notebook, options))
          selection = retried.find(candidate => candidate.selected.length > 0) ?? retried[0]!
          cycled = selection.selected.length > 0
        }
        sendJson(res, 200, {
          reason: selection.reason,
          totalAvailable: selection.totalAvailable,
          returned: selection.selected.length,
          cycled,
          targets: selection.targets,
          questions: selection.selected.map(question => ({
            id: question.id,
            subject: question.subject,
            knowledgePoint: question.knowledgePoint,
            stem: question.stem,
            options: question.options,
            difficulty: question.difficulty,
          })),
        })
      } catch (error) {
        sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
      }
    },
  }), 'kaogong.practiceStartRoute')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/api/kaogong/practice/submit',
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'method not allowed' })
        return
      }
      try {
        const body = await readJson(req)
        if (!Array.isArray(body.answers)) throw new Error('answers must be an array')
        const answers = body.answers.map((value): PracticeSubmission => {
          if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid answer')
          const item = value as Record<string, unknown>
          if (typeof item.id !== 'string' || typeof item.answer !== 'string') throw new Error('invalid answer')
          return { id: item.id, answer: item.answer }
        })
        sendJson(res, 200, await gradePractice(bankQuestions, questions, answers))
      } catch (error) {
        sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
      }
    },
  }), 'kaogong.practiceSubmitRoute')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/api/kaogong/practice/reflection',
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'method not allowed' })
        return
      }
      try {
        const body = await readJson(req)
        const subject = typeof body.subject === 'string' ? body.subject.trim() : ''
        if (!subject || !Array.isArray(body.entries)) throw new Error('invalid reflection')
        const updatedIds = new Set<string>()
        for (const value of body.entries) {
          if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid reflection entry')
          const entry = value as Record<string, unknown>
          if (typeof entry.id !== 'string' || typeof entry.errorReason !== 'string') throw new Error('invalid reflection entry')
          const errorReason = entry.errorReason.trim()
          if (!ERROR_REASONS.includes(errorReason as typeof ERROR_REASONS[number])) throw new Error('invalid error reason')
          if (updatedIds.has(entry.id)) throw new Error('duplicate reflection question')
          updatedIds.add(entry.id)
          const existing = questions.get(entry.id)
          if (existing === undefined || existing.subject !== subject || existing.result !== 'wrong') throw new Error('wrong question not found')
          await questions.put(entry.id, {
            ...existing,
            errorReason,
            notes: typeof entry.notes === 'string' ? entry.notes.trim() : existing.notes,
            updatedAt: new Date().toISOString(),
          })
        }
        sendJson(res, 200, { subject, summary: summarizeModule(questions, subject, topN) })
      } catch (error) {
        sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
      }
    },
  }), 'kaogong.practiceReflectionRoute')

  registerNotebookTools(ctx, questions, topN)
  registerProgressTools(ctx, planConfig, days, questions, topN)
  registerBankTools(ctx, bankQuestions, questions)
  registerKnowledgeTools(ctx, knowledgeEntries)
}

/** Register the six wrong-answer-notebook tools. */
function registerNotebookTools(ctx: Context, questions: KvTable<string, QuestionRecord>, topN: number): void {
  ctx.tools.register(defineTool({
    name: 'kaogong_record_question',
    description:
      '录入或更新一道武汉公务员考试题目（含对错、考点、错因、笔记），用于错题归集。'
      + ' 提供 id 则更新该题，否则新增。result 缺省时根据 correctAnswer 与 userAnswer 自动判断。',
    parameters: {
      id: { type: 'string', description: '题目ID（稳定标识）。提供则更新该题，缺省则自动生成。' },
      subject: { type: 'string', required: true, description: '科目/模块，如"行测-判断推理"、"申论"。' },
      knowledgePoint: { type: 'string', required: true, description: '考点/知识点，如"图形推理-数量规律"。可用 kaogong_taxonomy 查询标准考点。' },
      questionType: { type: 'string', description: '题型，如"单选"、"多选"、"主观题"。' },
      stem: { type: 'string', required: true, description: '题干。' },
      options: { type: 'array', items: { type: 'string' }, description: '选项列表，如["A. ...","B. ..."]；无选项可省略。' },
      correctAnswer: { type: 'string', required: true, description: '正确答案。' },
      userAnswer: { type: 'string', description: '你的作答；未作答留空。' },
      result: { type: 'string', enum: ['correct', 'wrong', 'skipped'], description: '作答结果：correct=做对，wrong=做错，skipped=跳过/未做。缺省时自动判断。' },
      errorReason: { type: 'string', enum: [...ERROR_REASONS], description: '错因（仅错题需要）。' },
      notes: { type: 'string', description: '笔记/反思。' },
      source: { type: 'string', description: '来源，如"2024湖北省考真题"。' },
      tags: { type: 'array', items: { type: 'string' }, description: '自由标签。' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', required: true },
          subject: { type: 'string', required: true },
          knowledgePoint: { type: 'string', required: true },
          result: { type: 'string', required: true, enum: ['correct', 'wrong', 'skipped'] },
          created: { type: 'boolean', required: true },
          totalQuestions: { type: 'integer', required: true },
          totalWrong: { type: 'integer', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: (value.created ? '已新增' : '已更新') + '题目 ' + value.id
          + '（' + value.subject + ' · ' + value.knowledgePoint + '，' + labelResult(value.result) + '）。'
          + '当前题库共 ' + value.totalQuestions + ' 题，其中错题 ' + value.totalWrong + ' 题。',
      }],
    },
    async execute(args) {
      const subject = args.subject.trim()
      const knowledgePoint = args.knowledgePoint.trim()
      const stem = args.stem.trim()
      const correctAnswer = args.correctAnswer.trim()
      if (!subject) throw new Error('subject 不能为空')
      if (!knowledgePoint) throw new Error('knowledgePoint 不能为空')
      if (!stem) throw new Error('stem 不能为空')
      if (!correctAnswer) throw new Error('correctAnswer 不能为空')

      const now = new Date().toISOString()
      const id = args.id?.trim() || 'q_' + randomUUID()
      const existing = args.id ? questions.get(id) : undefined
      const userAnswer = args.userAnswer === undefined
        ? existing?.userAnswer ?? ''
        : args.userAnswer.trim()
      const result = args.result ?? (args.userAnswer === undefined && existing
        ? existing.result
        : deriveResult(undefined, userAnswer, correctAnswer))
      const record: QuestionRecord = {
        subject,
        knowledgePoint,
        questionType: args.questionType === undefined ? existing?.questionType ?? '' : args.questionType.trim(),
        stem,
        options: args.options === undefined ? existing?.options ?? [] : args.options.map(option => option.trim()),
        correctAnswer,
        userAnswer,
        result,
        tags: args.tags === undefined ? existing?.tags ?? [] : args.tags,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        errorReason: args.errorReason === undefined ? existing?.errorReason ?? '' : args.errorReason.trim(),
        notes: args.notes === undefined ? existing?.notes ?? '' : args.notes.trim(),
        source: args.source === undefined ? existing?.source ?? '' : args.source.trim(),
      }
      await questions.put(id, record)
      return {
        id,
        subject,
        knowledgePoint,
        result,
        created: existing === undefined,
        totalQuestions: questions.size,
        totalWrong: countWrong(questions),
      }
    },
    presentCall: args => ({ card: 'generic', title: '记录题目', kind: 'other', rawInput: { subject: args.subject, knowledgePoint: args.knowledgePoint, result: args.result } }),
  }))

  ctx.tools.register(defineTool({
    name: 'kaogong_list_questions',
    description: '按科目、考点、结果、错因、来源或关键词查询已记录的题目。',
    parameters: {
      subject: { type: 'string', description: '按科目过滤（子串匹配）。' },
      knowledgePoint: { type: 'string', description: '按考点过滤（子串匹配）。' },
      result: { type: 'string', enum: ['correct', 'wrong', 'skipped'], description: '按结果过滤。' },
      errorReason: { type: 'string', description: '按错因过滤。' },
      source: { type: 'string', description: '按来源过滤。' },
      keyword: { type: 'string', description: '题干/笔记关键词（子串匹配）。' },
      limit: { type: 'integer', description: '最多返回条数，默认 ' + LIST_LIMIT_DEFAULT + '。' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          total: { type: 'integer', required: true },
          returned: { type: 'integer', required: true },
          questions: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', required: true },
                subject: { type: 'string', required: true },
                knowledgePoint: { type: 'string', required: true },
                stem: { type: 'string', required: true },
                correctAnswer: { type: 'string', required: true },
                userAnswer: { type: 'string', required: true },
                result: { type: 'string', required: true, enum: ['correct', 'wrong', 'skipped'] },
                errorReason: { type: 'string' },
                source: { type: 'string' },
              },
            },
          },
        },
      },
      render: (_args, value) => {
        const lines = ['共匹配 ' + value.total + ' 题，返回 ' + value.returned + ' 题']
        value.questions.forEach((q, i) => {
          lines.push((i + 1) + '. [' + labelResult(q.result) + '] ' + q.id + ' 【' + q.subject + '】' + q.knowledgePoint)
          lines.push('   题干：' + q.stem)
          lines.push('   正确答案：' + q.correctAnswer + (q.userAnswer ? '；你的作答：' + q.userAnswer : '') + (q.errorReason ? '；错因：' + q.errorReason : ''))
        })
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    async execute(args) {
      const limit = args.limit && args.limit > 0 ? args.limit : LIST_LIMIT_DEFAULT
      const matches = allQuestions(questions).filter(q =>
        (!args.subject || q.subject.includes(args.subject))
        && (!args.knowledgePoint || q.knowledgePoint.includes(args.knowledgePoint))
        && (!args.result || q.result === args.result)
        && (!args.errorReason || (q.errorReason ?? '').includes(args.errorReason))
        && (!args.source || (q.source ?? '').includes(args.source))
        && (!args.keyword || q.stem.includes(args.keyword) || (q.notes ?? '').includes(args.keyword))
      )
      const slice = matches.slice(0, limit)
      return {
        total: matches.length,
        returned: slice.length,
        questions: slice.map(q => ({
          id: q.id,
          subject: q.subject,
          knowledgePoint: q.knowledgePoint,
          stem: q.stem,
          correctAnswer: q.correctAnswer,
          userAnswer: q.userAnswer,
          result: q.result,
          errorReason: q.errorReason ?? '',
          source: q.source ?? '',
        })),
      }
    },
    presentCall: args => ({ card: 'generic', title: '查询题目', kind: 'search', rawInput: args }),
  }))

  ctx.tools.register(defineTool({
    name: 'kaogong_analyze_errors',
    description:
      '归纳问题点：把错题按科目、考点、错因聚合，输出每个考点的错误率与主要错因，'
      + '按错误次数排序，找出薄弱点。',
    parameters: {
      subject: { type: 'string', description: '仅分析该科目（子串匹配）。' },
      knowledgePoint: { type: 'string', description: '仅分析该考点（子串匹配）。' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          totalQuestions: { type: 'integer', required: true },
          totalCorrect: { type: 'integer', required: true },
          totalWrong: { type: 'integer', required: true },
          totalSkipped: { type: 'integer', required: true },
          accuracyRate: { type: 'number', required: true },
          bySubject: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                subject: { type: 'string', required: true },
                wrongCount: { type: 'integer', required: true },
                totalCount: { type: 'integer', required: true },
                errorRate: { type: 'number', required: true },
              },
            },
          },
          byKnowledgePoint: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                knowledgePoint: { type: 'string', required: true },
                subject: { type: 'string', required: true },
                wrongCount: { type: 'integer', required: true },
                totalCount: { type: 'integer', required: true },
                errorRate: { type: 'number', required: true },
                errorReasons: {
                  type: 'array',
                  required: true,
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      reason: { type: 'string', required: true },
                      count: { type: 'integer', required: true },
                    },
                  },
                },
                sampleIds: { type: 'array', required: true, items: { type: 'string' } },
              },
            },
          },
          byErrorReason: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                reason: { type: 'string', required: true },
                count: { type: 'integer', required: true },
                knowledgePoints: { type: 'array', required: true, items: { type: 'string' } },
              },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: renderAnalysisText(value) }],
    },
    async execute(args) {
      const filtered = allQuestions(questions).filter(q =>
        (!args.subject || q.subject.includes(args.subject))
        && (!args.knowledgePoint || q.knowledgePoint.includes(args.knowledgePoint))
      )
      return analyzeQuestions(filtered)
    },
    presentCall: args => ({ card: 'generic', title: '归纳问题点', kind: 'other', rawInput: args }),
  }))

  ctx.tools.register(defineTool({
    name: 'kaogong_summarize_weaknesses',
    description:
      '总结问题：基于全部错题生成薄弱考点排名、错因分布与针对性学习建议，'
      + '并输出一段可直接阅读的总结。',
    parameters: {
      topN: { type: 'integer', description: '薄弱考点数量，默认取配置值（' + topN + '）。' },
      subject: { type: 'string', description: '仅总结该科目（子串匹配）。' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          totalQuestions: { type: 'integer', required: true },
          totalCorrect: { type: 'integer', required: true },
          totalWrong: { type: 'integer', required: true },
          totalSkipped: { type: 'integer', required: true },
          accuracyRate: { type: 'number', required: true },
          weakPoints: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                knowledgePoint: { type: 'string', required: true },
                subject: { type: 'string', required: true },
                wrongCount: { type: 'integer', required: true },
                totalCount: { type: 'integer', required: true },
                errorRate: { type: 'number', required: true },
                topReasons: { type: 'array', required: true, items: { type: 'string' } },
                suggestion: { type: 'string', required: true },
              },
            },
          },
          errorReasonBreakdown: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                reason: { type: 'string', required: true },
                count: { type: 'integer', required: true },
                knowledgePoints: { type: 'array', required: true, items: { type: 'string' } },
              },
            },
          },
          suggestions: { type: 'array', required: true, items: { type: 'string' } },
          narrative: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.narrative }],
    },
    async execute(args) {
      const filtered = allQuestions(questions).filter(q => !args.subject || q.subject.includes(args.subject))
      return summarizeQuestions(filtered, { topN: args.topN && args.topN > 0 ? args.topN : topN })
    },
    presentCall: args => ({ card: 'generic', title: '总结问题', kind: 'other', rawInput: args }),
  }))

  ctx.tools.register(defineTool({
    name: 'kaogong_taxonomy',
    description: '查看武汉公务员考试（行测 + 申论）的考点大纲与错因分类，用于规范录入题目。',
    parameters: {
      subject: { type: 'string', description: '仅返回该科目的大纲（如"行测-判断推理"）。' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          subjects: { type: 'array', required: true, items: { type: 'string' } },
          text: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.text }],
    },
    async execute(args) {
      return { subjects: TAXONOMY.map(s => s.subject), text: renderTaxonomy(args.subject) }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'kaogong_delete_question',
    description: '按 id 删除一道已记录的题目。',
    parameters: {
      id: { type: 'string', required: true, description: '要删除的题目 id。' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          deleted: { type: 'boolean', required: true },
          id: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.deleted ? '已删除题目 ' + value.id : '未找到题目 ' + value.id,
      }],
    },
    async execute(args) {
      const deleted = await questions.delete(args.id)
      return { deleted, id: args.id }
    },
    presentCall: args => ({ card: 'generic', title: '删除题目', kind: 'other', rawInput: args }),
  }))
}

/** Register the four study-plan/progress tools. */
function registerProgressTools(
  ctx: Context,
  planConfig: DomainGlobal<PlanConfig>,
  days: KvTable<string, DayPlanRecord>,
  questions: KvTable<string, QuestionRecord>,
  topN: number,
): void {
  ctx.tools.register(defineTool({
    name: 'kaogong_plan_set',
    description:
      '设置备考计划并生成倒排学习日程：指定考试日期、每天学习模块数与科目权重，'
      + '从今天倒排到考试日，按基础/强化/冲刺三阶段排满每一天。',
    parameters: {
      examDate: { type: 'string', description: '考试日期 YYYY-MM-DD，例如 2027-03-01。省略则沿用当前设置。' },
      dailyModules: { type: 'integer', description: '每天学习模块数（一个模块 ≈ 一个知识点/一次练习），默认沿用当前设置。' },
      subjects: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string', required: true, description: '科目名，如"行测-判断推理"。' },
            weight: { type: 'integer', description: '权重（越大排得越多），默认 1。' },
          },
        },
        description: '备考科目与权重；省略则用全部科目、等权重。',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          examDate: { type: 'string', required: true },
          today: { type: 'string', required: true },
          totalDays: { type: 'integer', required: true },
          daysToExam: { type: 'integer', required: true },
          dailyModules: { type: 'integer', required: true },
          subjects: { type: 'array', required: true, items: { type: 'string' } },
          phases: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                phase: { type: 'string', required: true, enum: ['foundation', 'reinforce', 'sprint'] },
                days: { type: 'integer', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: '已生成倒排计划：考试 ' + value.examDate + '，距今天还有 ' + value.daysToExam + ' 天，共排 ' + value.totalDays + ' 天'
          + '（基础 ' + phaseDays(value, 'foundation') + ' 天 / 强化 ' + phaseDays(value, 'reinforce') + ' 天 / 冲刺 ' + phaseDays(value, 'sprint') + ' 天）。'
          + '每天 ' + value.dailyModules + ' 个模块。',
      }],
    },
    async execute(args) {
      const current = planConfig.get()
      const examDate = args.examDate ?? current.examDate
      if (!isValidIsoDate(examDate)) throw new Error('examDate must be a valid YYYY-MM-DD date')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(examDate)) throw new Error('examDate 必须是 YYYY-MM-DD')
      const dailyModules = args.dailyModules && args.dailyModules > 0 ? args.dailyModules : current.dailyModules
      const subjects = args.subjects && args.subjects.length > 0
        ? args.subjects.map(s => ({ name: s.name.trim(), weight: s.weight && s.weight > 0 ? s.weight : 1 }))
        : current.subjects
      const validSubjects = new Set(TAXONOMY.map(subject => subject.subject))
      for (const subject of subjects) {
        if (!subject.name) throw new Error('subjects 中的 name 不能为空')
        if (!validSubjects.has(subject.name)) throw new Error('不支持的科目：' + subject.name + '，请先调用 kaogong_taxonomy')
      }
      if (subjects.length === 0) throw new Error('subjects 不能为空')

      const config: PlanConfig = { examDate, dailyModules, subjects }
      const today = todayStr()
      const plan = generatePlan(config, today)
      await planConfig.set(config)
      await writeDays(days, plan.days)
      return {
        examDate,
        today,
        totalDays: plan.totalDays,
        daysToExam: daysToExam(today, examDate),
        dailyModules,
        subjects: subjects.map(s => s.name),
        phases: plan.phases.map(p => ({ phase: p.phase, days: p.days })),
      }
    },
    presentCall: args => ({ card: 'generic', title: '设置学习计划', kind: 'other', rawInput: args }),
  }))

  ctx.tools.register(defineTool({
    name: 'kaogong_plan_view',
    description: '查看某天（默认今天）的学习计划，以及整体进度。',
    parameters: {
      date: { type: 'string', description: '日期 YYYY-MM-DD，默认今天。' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          configured: { type: 'boolean', required: true },
          examDate: { type: 'string', required: true },
          today: { type: 'string', required: true },
          daysToExam: { type: 'integer', required: true },
          totalDays: { type: 'integer', required: true },
          pastDays: { type: 'integer', required: true },
          pastDone: { type: 'integer', required: true },
          date: { type: 'string', required: true },
          phase: { type: 'string', required: true, enum: ['foundation', 'reinforce', 'sprint'] },
          items: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                subject: { type: 'string', required: true },
                kind: { type: 'string', required: true, enum: ['learn', 'review', 'practice', 'mock'] },
                title: { type: 'string', required: true },
                done: { type: 'boolean', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => {
        if (!value.configured) return [{ type: 'text', text: '尚未生成学习计划，请先调用 kaogong_plan_set。' }]
        const lines = [
          '考试 ' + value.examDate + '，距今天 ' + value.daysToExam + ' 天。',
          '整体进度：过去 ' + value.pastDays + ' 天中完成 ' + value.pastDone + ' 天。',
          '【' + value.date + '】（' + phaseLabel(value.phase) + '阶段）',
        ]
        if (value.items.length === 0) lines.push('- 当天无安排')
        value.items.forEach((item, i) => {
          lines.push((item.done ? '✅' : '⬜') + ' ' + (i + 1) + '. [' + item.kind + '] ' + item.title)
        })
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    async execute(args) {
      const config = planConfig.get()
      const today = todayStr()
      const target = args.date ?? today
      if (!isValidIsoDate(target)) throw new Error('date must be a valid YYYY-MM-DD date')
      const all = Array.from(days.entries())
      const configured = all.length > 0

      let pastDays = 0
      let pastDone = 0
      for (const [date, plan] of all) {
        if (date <= today) {
          pastDays++
          if (plan.items.length > 0 && plan.items.every(item => item.done)) pastDone++
        }
      }

      const day = days.get(target)
      return {
        configured,
        examDate: config.examDate,
        today,
        daysToExam: daysToExam(today, config.examDate),
        totalDays: all.length,
        pastDays,
        pastDone,
        date: target,
        phase: day?.phase ?? 'foundation',
        items: day?.items ?? [],
      }
    },
    presentCall: args => ({ card: 'generic', title: '查看计划', kind: 'other', rawInput: args }),
  }))

  ctx.tools.register(defineTool({
    name: 'kaogong_plan_done',
    description: '把某天（默认今天）的某个学习项标记为完成/未完成。',
    parameters: {
      date: { type: 'string', description: '日期 YYYY-MM-DD，默认今天。' },
      index: { type: 'integer', description: '第几个学习项（从 0 开始），默认 0。' },
      done: { type: 'boolean', description: '是否完成，默认 true。' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          date: { type: 'string', required: true },
          phase: { type: 'string', required: true, enum: ['foundation', 'reinforce', 'sprint'] },
          items: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                subject: { type: 'string', required: true },
                kind: { type: 'string', required: true, enum: ['learn', 'review', 'practice', 'mock'] },
                title: { type: 'string', required: true },
                done: { type: 'boolean', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => {
        const done = value.items.filter(item => item.done).length
        return [{ type: 'text', text: '【' + value.date + '】已完成 ' + done + '/' + value.items.length + ' 项。' }]
      },
    },
    async execute(args) {
      const date = args.date ?? todayStr()
      if (!isValidIsoDate(date)) throw new Error('date must be a valid YYYY-MM-DD date')
      const day = days.get(date)
      if (day === undefined) throw new Error('该日期没有计划，请先 kaogong_plan_set 或指定正确日期')
      const index = args.index ?? 0
      if (index < 0 || index >= day.items.length) throw new Error('index 超出该日学习项范围（0-' + (day.items.length - 1) + '）')
      const done = args.done ?? true
      const items = day.items.map((item, i) => (i === index ? { ...item, done } : item))
      await days.put(date, { ...day, items })
      return { date, phase: day.phase, items }
    },
    presentCall: args => ({ card: 'generic', title: '标记完成', kind: 'other', rawInput: args }),
  }))

  ctx.tools.register(defineTool({
    name: 'kaogong_progress_status',
    description:
      '学习进度总览：备考剩余天数、计划完成度、当前阶段、正确率与薄弱考点，'
      + '供班主任协调学习路线。',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          examDate: { type: 'string', required: true },
          today: { type: 'string', required: true },
          daysToExam: { type: 'integer', required: true },
          totalDays: { type: 'integer', required: true },
          pastDays: { type: 'integer', required: true },
          pastDone: { type: 'integer', required: true },
          pastDonePct: { type: 'number', required: true },
          accuracyRate: { type: 'number', required: true },
          totalWrong: { type: 'integer', required: true },
          weakPoints: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                subject: { type: 'string', required: true },
                knowledgePoint: { type: 'string', required: true },
                wrongCount: { type: 'integer', required: true },
                errorRate: { type: 'number', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => {
        const lines = [
          '考试 ' + value.examDate + '，距今天 ' + value.daysToExam + ' 天。',
          '计划进度：过去 ' + value.pastDays + ' 天完成 ' + value.pastDone + ' 天（' + pctText(value.pastDonePct) + '）。',
          '做题正确率（不含跳过）：' + pctText(value.accuracyRate) + '，错题 ' + value.totalWrong + ' 题。',
          '薄弱考点：',
        ]
        if (value.weakPoints.length === 0) lines.push('- 暂无错题')
        for (const wp of value.weakPoints) {
          lines.push('- 【' + wp.subject + '】' + wp.knowledgePoint + '：错 ' + wp.wrongCount + '（' + pctText(wp.errorRate) + '）')
        }
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    async execute() {
      const config = planConfig.get()
      const today = todayStr()
      const all = Array.from(days.entries())

      let pastDays = 0
      let pastDone = 0
      for (const [date, plan] of all) {
        if (date <= today) {
          pastDays++
          if (plan.items.length > 0 && plan.items.every(item => item.done)) pastDone++
        }
      }

      const analysis = analyzeQuestions(allQuestions(questions))
      const weakPoints = analysis.byKnowledgePoint
        .filter(kp => kp.wrongCount > 0)
        .slice(0, topN)
        .map(kp => ({ subject: kp.subject, knowledgePoint: kp.knowledgePoint, wrongCount: kp.wrongCount, errorRate: kp.errorRate }))

      return {
        examDate: config.examDate,
        today,
        daysToExam: daysToExam(today, config.examDate),
        totalDays: all.length,
        pastDays,
        pastDone,
        pastDonePct: pastDays === 0 ? 0 : pastDone / pastDays,
        accuracyRate: analysis.accuracyRate,
        totalWrong: analysis.totalWrong,
        weakPoints,
      }
    },
    presentCall: () => ({ card: 'generic', title: '学习进度总览', kind: 'other', rawInput: {} }),
  }))
}

/** Register the question-bank and targeted-practice tools. */
function registerBankTools(
  ctx: Context,
  bankQuestions: KvTable<string, BankQuestionRecord>,
  notebookQuestions: KvTable<string, QuestionRecord>,
): void {
  ctx.tools.register(defineTool({
    name: 'kaogong_bank_add',
    description:
      '往题库添加一道题（含答案解析与难度）。origin=web 的题入库为 pending，须经 kaogong_bank_review '
      + '审查三要素（机构/真题/答案）通过后才能进入专项训练；origin=local 直接录入为 approved。',
    parameters: {
      id: { type: 'string', description: '题目ID，缺省自动生成。' },
      subject: { type: 'string', required: true, description: '科目/模块，如"行测-判断推理"。' },
      knowledgePoint: { type: 'string', required: true, description: '考点（规范名，见 kaogong_taxonomy）。' },
      questionType: { type: 'string', description: '题型，默认"单选"。' },
      stem: { type: 'string', required: true, description: '题干。' },
      options: { type: 'array', items: { type: 'string' }, description: '选项列表。' },
      correctAnswer: { type: 'string', required: true, description: '正确答案。' },
      explanation: { type: 'string', description: '答案解析。' },
      difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'], description: '难度，默认 medium。' },
      source: { type: 'string', description: '来源（机构名/真题出处/URL），审查三要素之一。' },
      origin: { type: 'string', enum: ['web', 'local'], description: '来源渠道：web=网页搜集（pending 待审查），local=本地文件/手动提供（直接 approved）。默认 local。' },
      tags: { type: 'array', items: { type: 'string' }, description: '标签。' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', required: true },
          subject: { type: 'string', required: true },
          knowledgePoint: { type: 'string', required: true },
          created: { type: 'boolean', required: true },
          total: { type: 'integer', required: true },
          origin: { type: 'string', required: true, enum: ['web', 'local'] },
          reviewStatus: { type: 'string', required: true, enum: ['pending', 'approved', 'rejected'] },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: (value.created ? '已新增' : '已更新') + '题库题 ' + value.id
          + '（' + value.subject + ' · ' + value.knowledgePoint + '）。当前题库共 ' + value.total + ' 题。'
          + (value.reviewStatus === 'pending' ? '该题为网页搜集，待审查（kaogong_bank_review）。' : '该题已可直接用于专项训练。'),
      }],
    },
    async execute(args) {
      const subject = args.subject.trim()
      const knowledgePoint = args.knowledgePoint.trim()
      const stem = args.stem.trim()
      const correctAnswer = args.correctAnswer.trim()
      if (!subject) throw new Error('subject 不能为空')
      if (!knowledgePoint) throw new Error('knowledgePoint 不能为空')
      if (!stem) throw new Error('stem 不能为空')
      if (!correctAnswer) throw new Error('correctAnswer 不能为空')

      const id = args.id?.trim() || 'b_' + randomUUID()
      const existing = args.id ? bankQuestions.get(id) : undefined
      const origin = args.origin ?? existing?.origin ?? 'local'
      const now = new Date().toISOString()
      const reviewStatus: BankReviewStatus = existing?.reviewStatus ?? (origin === 'local' ? 'approved' : 'pending')
      const record: BankQuestionRecord = {
        subject,
        knowledgePoint,
        questionType: args.questionType === undefined ? existing?.questionType ?? '单选' : args.questionType.trim() || '单选',
        stem,
        options: args.options === undefined ? existing?.options ?? [] : args.options.map(option => option.trim()),
        correctAnswer,
        explanation: args.explanation === undefined ? existing?.explanation ?? '' : args.explanation.trim(),
        difficulty: args.difficulty ?? existing?.difficulty ?? 'medium',
        source: args.source === undefined ? existing?.source ?? '' : args.source.trim(),
        origin,
        reviewStatus,
        reviewNotes: existing?.reviewNotes ?? '',
        tags: args.tags === undefined ? existing?.tags ?? [] : args.tags,
        createdAt: existing?.createdAt ?? now,
        reviewedAt: existing?.reviewedAt ?? (reviewStatus === 'approved' ? now : ''),
      }
      await bankQuestions.put(id, record)
      return { id, subject, knowledgePoint, created: existing === undefined, total: bankQuestions.size, origin, reviewStatus }
    },
    presentCall: args => ({ card: 'generic', title: '添加题库题', kind: 'other', rawInput: { subject: args.subject, knowledgePoint: args.knowledgePoint } }),
  }))

  ctx.tools.register(defineTool({
    name: 'kaogong_bank_list',
    description: '按科目、考点、难度或关键词查询题库（含答案与解析，用于备课/管理）。',
    parameters: {
      subject: { type: 'string', description: '按科目过滤（子串匹配）。' },
      knowledgePoint: { type: 'string', description: '按考点过滤（子串匹配）。' },
      difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'], description: '按难度过滤。' },
      reviewStatus: { type: 'string', enum: ['pending', 'approved', 'rejected'], description: '按审查状态过滤（审查员用 pending 找待审题）。' },
      keyword: { type: 'string', description: '题干/解析关键词。' },
      limit: { type: 'integer', description: '最多返回条数，默认 50。' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          total: { type: 'integer', required: true },
          returned: { type: 'integer', required: true },
          questions: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', required: true },
                subject: { type: 'string', required: true },
                knowledgePoint: { type: 'string', required: true },
                stem: { type: 'string', required: true },
                options: { type: 'array', required: true, items: { type: 'string' } },
                correctAnswer: { type: 'string', required: true },
                explanation: { type: 'string', required: true },
                difficulty: { type: 'string', required: true, enum: ['easy', 'medium', 'hard'] },
                source: { type: 'string', required: true },
                origin: { type: 'string', required: true, enum: ['web', 'local'] },
                reviewStatus: { type: 'string', required: true, enum: ['pending', 'approved', 'rejected'] },
                reviewNotes: { type: 'string', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => {
        const lines = ['题库共匹配 ' + value.total + ' 题，返回 ' + value.returned + ' 题']
        value.questions.forEach((q, i) => {
          lines.push((i + 1) + '. ' + q.id + ' 【' + q.subject + '】' + q.knowledgePoint + '（' + q.difficulty + '｜' + q.reviewStatus + '）')
          lines.push('   题干：' + q.stem)
          lines.push('   答案：' + q.correctAnswer + (q.explanation ? '；解析：' + q.explanation : ''))
          if (q.source) lines.push('   来源：' + q.source)
        })
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    async execute(args) {
      const limit = args.limit && args.limit > 0 ? args.limit : 50
      const matches = allBankQuestions(bankQuestions).filter(q =>
        (!args.subject || q.subject.includes(args.subject))
        && (!args.knowledgePoint || q.knowledgePoint.includes(args.knowledgePoint))
        && (!args.difficulty || q.difficulty === args.difficulty)
        && (!args.reviewStatus || q.reviewStatus === args.reviewStatus)
        && (!args.keyword || q.stem.includes(args.keyword) || q.explanation.includes(args.keyword))
      )
      const slice = matches.slice(0, limit)
      return {
        total: matches.length,
        returned: slice.length,
        questions: slice.map(q => ({
          id: q.id,
          subject: q.subject,
          knowledgePoint: q.knowledgePoint,
          stem: q.stem,
          options: q.options,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation,
          difficulty: q.difficulty,
          source: q.source,
          origin: q.origin,
          reviewStatus: q.reviewStatus,
          reviewNotes: q.reviewNotes,
        })),
      }
    },
    presentCall: args => ({ card: 'generic', title: '查询题库', kind: 'search', rawInput: args }),
  }))

  ctx.tools.register(defineTool({
    name: 'kaogong_bank_delete',
    description: '按 id 删除一道题库题。',
    parameters: {
      id: { type: 'string', required: true, description: '要删除的题目 id。' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          deleted: { type: 'boolean', required: true },
          id: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.deleted ? '已删除题库题 ' + value.id : '未找到题库题 ' + value.id,
      }],
    },
    async execute(args) {
      const deleted = await bankQuestions.delete(args.id)
      return { deleted, id: args.id }
    },
    presentCall: args => ({ card: 'generic', title: '删除题库题', kind: 'other', rawInput: args }),
  }))

  ctx.tools.register(defineTool({
    name: 'kaogong_bank_review',
    description:
      '审查一道网页搜集（origin=web）的题库题：逐条核对三要素——①是否专业教培机构流出、②是否历年真题、③是否有答案。'
      + '三要素齐备则 decision=approved；缺任一要素则 decision=rejected 并在 notes 说明缺哪项。',
    parameters: {
      id: { type: 'string', required: true, description: '待审题目 id。' },
      decision: { type: 'string', required: true, enum: ['approved', 'rejected'], description: '审查结论。' },
      notes: { type: 'string', description: '审查意见（三要素核对结果）。' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', required: true },
          reviewStatus: { type: 'string', required: true, enum: ['pending', 'approved', 'rejected'] },
          reviewNotes: { type: 'string', required: true },
          reviewedAt: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: '题目 ' + value.id + ' 审查结论：' + (value.reviewStatus === 'approved' ? '通过' : '驳回')
          + (value.reviewNotes ? '（' + value.reviewNotes + '）' : ''),
      }],
    },
    async execute(args) {
      const existing = bankQuestions.get(args.id)
      if (existing === undefined) throw new Error('题目不存在：' + args.id)
      const now = new Date().toISOString()
      const record = await bankQuestions.update(args.id, current => ({
        ...current,
        reviewStatus: args.decision,
        reviewNotes: (args.notes ?? '').trim(),
        reviewedAt: now,
      }))
      return { id: args.id, reviewStatus: record.reviewStatus, reviewNotes: record.reviewNotes, reviewedAt: record.reviewedAt }
    },
    presentCall: args => ({ card: 'generic', title: '审查题库题', kind: 'other', rawInput: args }),
  }))

  ctx.tools.register(defineTool({
    name: 'kaogong_practice',
    description:
      '专项训练/错题巩固：从题库抽一组题（不含答案）给你练习。可指定考点或科目；'
      + '传 weak=true 时按错题本的薄弱考点抽题。',
    parameters: {
      subject: { type: 'string', description: '限定科目。' },
      knowledgePoint: { type: 'string', description: '限定考点（专项训练）。' },
      weak: { type: 'boolean', description: 'true 时按错题本薄弱考点抽题（错题巩固）。' },
      difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'], description: '难度过滤。' },
      limit: { type: 'integer', description: '题目数量，默认 10。' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          reason: { type: 'string', required: true },
          totalAvailable: { type: 'integer', required: true },
          returned: { type: 'integer', required: true },
          targets: { type: 'array', required: true, items: { type: 'string' } },
          questions: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', required: true },
                subject: { type: 'string', required: true },
                knowledgePoint: { type: 'string', required: true },
                stem: { type: 'string', required: true },
                options: { type: 'array', required: true, items: { type: 'string' } },
                difficulty: { type: 'string', required: true, enum: ['easy', 'medium', 'hard'] },
              },
            },
          },
        },
      },
      render: (_args, value) => {
        const lines = [value.reason + '，抽 ' + value.returned + ' 题（题库共 ' + value.totalAvailable + ' 题）']
        if (value.returned === 0) lines.push('题库中暂无匹配题目，可先用 kaogong_bank_add 补题。')
        value.questions.forEach((q, i) => {
          lines.push('')
          lines.push('第 ' + (i + 1) + ' 题 ' + q.id + ' 【' + q.subject + '】' + q.knowledgePoint + '（' + q.difficulty + '）')
          lines.push(q.stem)
          for (const option of q.options) lines.push('  ' + option)
        })
        lines.push('')
        lines.push('作答后调用 kaogong_practice_submit 提交 [{id, answer}]，系统会判分并把结果记入错题本。')
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    async execute(args) {
      const bank = allBankQuestions(bankQuestions)
      const notebook = allQuestions(notebookQuestions)
      const selection = selectPractice(bank, notebook, {
        limit: args.limit && args.limit > 0 ? args.limit : 10,
        ...(args.subject ? { subject: args.subject } : {}),
        ...(args.knowledgePoint ? { knowledgePoint: args.knowledgePoint } : {}),
        ...(args.weak ? { weak: true } : {}),
        ...(args.difficulty ? { difficulty: args.difficulty } : {}),
      })
      return {
        reason: selection.reason,
        totalAvailable: selection.totalAvailable,
        returned: selection.selected.length,
        targets: selection.targets,
        questions: selection.selected.map(q => ({
          id: q.id,
          subject: q.subject,
          knowledgePoint: q.knowledgePoint,
          stem: q.stem,
          options: q.options,
          difficulty: q.difficulty,
        })),
      }
    },
    presentCall: args => ({ card: 'generic', title: '专项训练', kind: 'other', rawInput: args }),
  }))

  ctx.tools.register(defineTool({
    name: 'kaogong_practice_submit',
    description:
      '提交专项训练的作答并判分：逐题对比正确答案、给出解析，并把结果（对/错）记入错题本，'
      + '用于后续归纳问题点。',
    parameters: {
      answers: {
        type: 'array',
        required: true,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string', required: true, description: '题目 id（来自 kaogong_practice）。' },
            answer: { type: 'string', required: true, description: '你的作答。' },
          },
        },
        description: '作答列表 [{id, answer}]。',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          totalCount: { type: 'integer', required: true },
          correctCount: { type: 'integer', required: true },
          accuracyRate: { type: 'number', required: true },
          results: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', required: true },
                subject: { type: 'string', required: true },
                knowledgePoint: { type: 'string', required: true },
                correct: { type: 'boolean', required: true },
                correctAnswer: { type: 'string', required: true },
                explanation: { type: 'string', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => {
        const lines = ['判分完成：' + value.correctCount + '/' + value.totalCount + ' 对（正确率 ' + pctText(value.accuracyRate) + '），已记入错题本。']
        for (const r of value.results) {
          lines.push((r.correct ? '✅' : '❌') + ' ' + r.id + ' 【' + r.subject + '】' + r.knowledgePoint)
          lines.push('   正确答案：' + r.correctAnswer + (r.explanation ? '；解析：' + r.explanation : ''))
        }
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    async execute(args) {
      const submittedIds = new Set<string>()
      for (const submission of args.answers) {
        if (submittedIds.has(submission.id)) throw new Error('answers 不能包含重复题目：' + submission.id)
        submittedIds.add(submission.id)
        if (bankQuestions.get(submission.id) === undefined) throw new Error('题目不存在：' + submission.id)
      }
      const results: { id: string; subject: string; knowledgePoint: string; correct: boolean; correctAnswer: string; explanation: string }[] = []
      let correctCount = 0
      const now = new Date().toISOString()

      for (const submission of args.answers) {
        const bank = bankQuestions.get(submission.id)
        if (bank === undefined) throw new Error('题目不存在：' + submission.id)
        const correct = submission.answer.trim() === bank.correctAnswer.trim()
        if (correct) correctCount++

        const existing = notebookQuestions.get(submission.id)
        await notebookQuestions.put(submission.id, {
          subject: bank.subject,
          knowledgePoint: bank.knowledgePoint,
          questionType: bank.questionType,
          stem: bank.stem,
          options: bank.options,
          correctAnswer: bank.correctAnswer,
          userAnswer: submission.answer.trim(),
          result: correct ? 'correct' : 'wrong',
          errorReason: '',
          notes: '',
          source: bank.source,
          tags: bank.tags,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        })
        results.push({
          id: submission.id,
          subject: bank.subject,
          knowledgePoint: bank.knowledgePoint,
          correct,
          correctAnswer: bank.correctAnswer,
          explanation: bank.explanation,
        })
      }

      const total = results.length
      return { totalCount: total, correctCount, accuracyRate: total === 0 ? 0 : correctCount / total, results }
    },
    presentCall: args => ({ card: 'generic', title: '提交作答', kind: 'other', rawInput: args }),
  }))
}

/** Register the knowledge-base tools (资料收集 → 结构化笔记 → 检索). */
function registerKnowledgeTools(ctx: Context, knowledgeEntries: KvTable<string, KnowledgeEntryRecord>): void {
  ctx.tools.register(defineTool({
    name: 'kaogong_knowledge_add',
    description: '把资料（网上搜集或用户提供）整理成一条结构化笔记存入知识库，按科目/考点归类。',
    parameters: {
      id: { type: 'string', description: '笔记ID，缺省自动生成。' },
      subject: { type: 'string', required: true, description: '科目/模块。' },
      knowledgePoint: { type: 'string', description: '考点；科目级笔记可留空。' },
      title: { type: 'string', required: true, description: '标题。' },
      content: { type: 'string', required: true, description: '正文/笔记内容。' },
      kind: { type: 'string', enum: [...KNOWLEDGE_KINDS], description: '类型，默认"笔记"。' },
      source: { type: 'string', description: '来源，如 URL 或"用户提供"。' },
      tags: { type: 'array', items: { type: 'string' }, description: '标签。' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', required: true },
          title: { type: 'string', required: true },
          subject: { type: 'string', required: true },
          knowledgePoint: { type: 'string', required: true },
          created: { type: 'boolean', required: true },
          total: { type: 'integer', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: (value.created ? '已新增' : '已更新') + '知识笔记 ' + value.id + '《' + value.title
          + '》（' + value.subject + (value.knowledgePoint ? ' · ' + value.knowledgePoint : '') + '）。知识库共 ' + value.total + ' 条。',
      }],
    },
    async execute(args) {
      const subject = args.subject.trim()
      const title = args.title.trim()
      const content = args.content.trim()
      if (!subject) throw new Error('subject 不能为空')
      if (!title) throw new Error('title 不能为空')
      if (!content) throw new Error('content 不能为空')

      const id = args.id?.trim() || 'k_' + randomUUID()
      const existing = args.id ? knowledgeEntries.get(id) : undefined
      const now = new Date().toISOString()
      const record: KnowledgeEntryRecord = {
        subject,
        knowledgePoint: args.knowledgePoint === undefined ? existing?.knowledgePoint ?? '' : args.knowledgePoint.trim(),
        title,
        content,
        kind: args.kind ?? existing?.kind ?? '笔记',
        source: args.source === undefined ? existing?.source ?? '' : args.source.trim(),
        tags: args.tags === undefined ? existing?.tags ?? [] : args.tags,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      }
      await knowledgeEntries.put(id, record)
      return { id, title, subject, knowledgePoint: record.knowledgePoint, created: existing === undefined, total: knowledgeEntries.size }
    },
    presentCall: args => ({ card: 'generic', title: '收录知识', kind: 'other', rawInput: { subject: args.subject, title: args.title } }),
  }))

  ctx.tools.register(defineTool({
    name: 'kaogong_knowledge_search',
    description: '检索知识库：按科目、考点、类型过滤，或用关键词按标题/标签/正文命中加权排序（不依赖向量）。',
    parameters: {
      subject: { type: 'string', description: '按科目过滤（精确）。' },
      knowledgePoint: { type: 'string', description: '按考点过滤（子串匹配）。' },
      kind: { type: 'string', enum: [...KNOWLEDGE_KINDS], description: '按类型过滤。' },
      keyword: { type: 'string', description: '关键词，命中标题/标签/正文并按相关性排序。' },
      limit: { type: 'integer', description: '最多返回条数，默认 20。' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          total: { type: 'integer', required: true },
          returned: { type: 'integer', required: true },
          entries: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', required: true },
                subject: { type: 'string', required: true },
                knowledgePoint: { type: 'string', required: true },
                title: { type: 'string', required: true },
                content: { type: 'string', required: true },
                kind: { type: 'string', required: true, enum: [...KNOWLEDGE_KINDS] },
                source: { type: 'string', required: true },
                tags: { type: 'array', required: true, items: { type: 'string' } },
              },
            },
          },
        },
      },
      render: (_args, value) => {
        const lines = ['知识库命中 ' + value.total + ' 条，返回 ' + value.returned + ' 条']
        value.entries.forEach((entry, i) => {
          lines.push((i + 1) + '. ' + entry.id + '《' + entry.title + '》【' + entry.subject + (entry.knowledgePoint ? ' · ' + entry.knowledgePoint : '') + '｜' + entry.kind + '】')
          lines.push('   ' + entry.content)
          if (entry.source) lines.push('   来源：' + entry.source)
        })
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    async execute(args) {
      const limit = args.limit && args.limit > 0 ? args.limit : 20
      const matched = searchKnowledge(allKnowledgeEntries(knowledgeEntries), {
        ...(args.subject ? { subject: args.subject } : {}),
        ...(args.knowledgePoint ? { knowledgePoint: args.knowledgePoint } : {}),
        ...(args.kind ? { kind: args.kind } : {}),
        ...(args.keyword ? { keyword: args.keyword } : {}),
      })
      const slice = matched.slice(0, limit)
      return {
        total: matched.length,
        returned: slice.length,
        entries: slice.map(entry => ({
          id: entry.id,
          subject: entry.subject,
          knowledgePoint: entry.knowledgePoint,
          title: entry.title,
          content: entry.content,
          kind: entry.kind,
          source: entry.source,
          tags: entry.tags,
        })),
      }
    },
    presentCall: args => ({ card: 'generic', title: '检索知识库', kind: 'search', rawInput: args }),
  }))

  ctx.tools.register(defineTool({
    name: 'kaogong_knowledge_delete',
    description: '按 id 删除一条知识笔记。',
    parameters: {
      id: { type: 'string', required: true, description: '要删除的笔记 id。' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          deleted: { type: 'boolean', required: true },
          id: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.deleted ? '已删除知识笔记 ' + value.id : '未找到知识笔记 ' + value.id,
      }],
    },
    async execute(args) {
      const deleted = await knowledgeEntries.delete(args.id)
      return { deleted, id: args.id }
    },
    presentCall: args => ({ card: 'generic', title: '删除知识笔记', kind: 'other', rawInput: args }),
  }))
}

/** Persist a generated day list, deleting stale days and writing new ones. */
async function writeDays(days: KvTable<string, DayPlanRecord>, planDays: DayPlan[]): Promise<void> {
  const previous = new Map(days.entries())
  const keep = new Set(planDays.map(day => day.date))
  for (const key of days.keys()) {
    if (!keep.has(key)) await days.delete(key)
  }
  for (const day of planDays) {
    const oldDay = previous.get(day.date)
    if (oldDay === undefined) {
      await days.put(day.date, day)
      continue
    }
    const used = new Set<number>()
    const items = day.items.map(item => {
      const oldIndex = oldDay.items.findIndex((oldItem, index) =>
        !used.has(index)
        && oldItem.subject === item.subject
        && oldItem.kind === item.kind
        && oldItem.title === item.title,
      )
      if (oldIndex < 0) return item
      used.add(oldIndex)
      return { ...item, done: oldDay.items[oldIndex]!.done }
    })
    await days.put(day.date, { ...day, items })
  }
}

/** Render a structured analysis into readable text. */
function renderAnalysisText(value: AnalysisResult): string {
  const lines: string[] = []
  lines.push('### 归纳问题点')
  lines.push('共 ' + value.totalQuestions + ' 题：做对 ' + value.totalCorrect + '，做错 ' + value.totalWrong + '，跳过 ' + value.totalSkipped + '；正确率（不含跳过）' + pctText(value.accuracyRate))
  lines.push('')
  lines.push('#### 按科目')
  if (value.bySubject.length === 0) lines.push('- 暂无记录')
  for (const s of value.bySubject) {
    lines.push('- ' + s.subject + '：错 ' + s.wrongCount + '/' + s.totalCount + '（' + pctText(s.errorRate) + '）')
  }
  lines.push('')
  lines.push('#### 按考点（问题点）')
  const kps = value.byKnowledgePoint.filter(kp => kp.wrongCount > 0)
  if (kps.length === 0) lines.push('- 暂无错题')
  for (const kp of kps) {
    lines.push('- 【' + kp.subject + '】' + kp.knowledgePoint + '：错 ' + kp.wrongCount + '/' + kp.totalCount + '（' + pctText(kp.errorRate) + '）')
    const reasons = kp.errorReasons.map(({ reason, count }) => reason + '×' + count)
    lines.push('  错因：' + (reasons.length > 0 ? reasons.join('、') : '未标注'))
  }
  lines.push('')
  lines.push('#### 按错因')
  if (value.byErrorReason.length === 0) lines.push('- 暂无错因')
  for (const r of value.byErrorReason) {
    lines.push('- ' + r.reason + '：' + r.count + ' 次（涉及：' + r.knowledgePoints.slice(0, 3).join('、') + '）')
  }
  return lines.join('\n')
}

/** Phase name in Chinese. */
function phaseLabel(phase: 'foundation' | 'reinforce' | 'sprint' | undefined): string {
  switch (phase) {
    case 'foundation': return '基础'
    case 'reinforce': return '强化'
    case 'sprint': return '冲刺'
    default: return '未知'
  }
}

/** Days allocated to one phase in a plan summary. */
function phaseDays(value: { phases: { phase: string; days: number }[] }, phase: string): number {
  return value.phases.find(p => p.phase === phase)?.days ?? 0
}
