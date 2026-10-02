import type { Context } from '@deepseek-ai/cordis'
import {
  CallId,
  LlmAdapter,
  ReasoningEffortId,
  type GenerateOptions,
  type LlmResolvedModelInfo,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm'

const HIGH = ReasoningEffortId('high')
const OFF = ReasoningEffortId('off')

/** Keyless kaogong adapter: one kaogong_record_question call, then a final answer. */
class KaogongMockAdapter extends LlmAdapter {
  override async resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return {
      provider,
      id: model,
      name: model,
      reasoning: { efforts: [{ id: OFF, name: 'Off' }, { id: HIGH, name: 'High' }], defaultEffort: HIGH },
    }
  }

  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const toolResult = options.messages.at(-1)?.content.find(block => block.type === 'tool-result')
    if (toolResult === undefined) {
      const args = JSON.stringify({
        subject: '行测-判断推理',
        knowledgePoint: '图形推理-数量规律',
        stem: 'keyless 冒烟测试题',
        correctAnswer: 'B',
        userAnswer: 'A',
        result: 'wrong',
      })
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'tool-call-delta', index: 0, id: CallId('kaogong-smoke-call'), name: 'kaogong_record_question', argumentsDelta: args }
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: CallId('kaogong-smoke-call'), name: 'kaogong_record_question', arguments: args } }
      yield { type: 'usage', usage: { inputTokens: 11, outputTokens: 3, cacheReadTokens: 2 } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }
    const toolText = toolResult.content.filter(block => block.type === 'text').map(block => block.text).join('')
    const reply = 'KAOGONG_ROUND_TRIP ' + toolText.trim()
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: reply }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: reply } }
    yield { type: 'usage', usage: { inputTokens: 7, outputTokens: 5, reasoningTokens: 1 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

export const name = 'kaogong-mock-llm'
export const inject = ['llm']

/** Register the keyless `kaogong-mock` adapter. */
export function apply(ctx: Context): void {
  ctx.llm.registerAdapter(['kaogong-mock'], new KaogongMockAdapter())
}
