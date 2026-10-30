import type { KaogongViewProps } from '@deepseek-ai/dsh-tool-kaogong/client'
type LearningPageOwner={active:boolean;pageId?:string;selectPage(page:string):void;close():void}
import { KaogongViewState } from '../src/view-state.tsx'

const state = new KaogongViewState()
state.cell('reader.query', '').set('growth')
// @ts-expect-error Reader query cannot share a boolean cell.
state.cell('reader.query', false)
// @ts-expect-error Only registered keys are allowed.
state.cell('query', '')
// @ts-expect-error Answers cannot change value type.
state.cell('answers', {}).set('A')

/** A consumer controls the published learning view without a platform runtime. */
export function viewProps(owner: LearningPageOwner): KaogongViewProps {
  return { active: owner.active, pageId: owner.pageId, onSelectPage: owner.selectPage, onClose: owner.close, onOpenTeacher() {} }
}
