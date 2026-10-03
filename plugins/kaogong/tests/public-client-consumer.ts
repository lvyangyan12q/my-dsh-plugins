import type { KaogongViewProps } from '@deepseek-ai/dsh-tool-kaogong/client'
import type { WorkbenchAppProps } from '@deepseek-ai/dsh-personal-workbench/client'
import { KaogongViewState } from '../src/view-state.tsx'

const state = new KaogongViewState()
state.cell('reader.query', '').set('growth')
// @ts-expect-error Reader query cannot share a boolean cell.
state.cell('reader.query', false)
// @ts-expect-error Only registered keys are allowed.
state.cell('query', '')
// @ts-expect-error Answers cannot change value type.
state.cell('answers', {}).set('A')

/** Consumer composes the two published type entries without loading workbench runtime. */
export function viewProps(owner: WorkbenchAppProps): KaogongViewProps {
  return { active: owner.active, pageId: owner.pageId, onSelectPage: owner.selectPage, onClose: owner.close, onOpenTeacher() {} }
}
