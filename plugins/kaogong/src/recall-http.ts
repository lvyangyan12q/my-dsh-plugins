import { recallReferenceEvidence } from './recalls.ts';
import { learningOutline } from './learning-outline.ts';
import { canonicalKnowledgePoint } from './knowledge-point-identity.ts';
import type { BusinessRegistry } from './business.ts';
import type { KaogongInstanceState } from './instance-state.ts';
import { PracticeError } from './practice-rounds.ts';
import { z } from 'zod';
export function registerRecalls(registry: BusinessRegistry, state: KaogongInstanceState) {
    return registry.webServer.register({ kind: 'exact', path: '/api/kaogong/recall', handler: async (req, res) => {
            const send = (status: number, value: unknown) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(value)); };
            const references = (pointId: string) => { const point = learningOutline.find(p => p.id === pointId); return point ? [...state.knowledgeEntries.entries()].filter(([, row]) => row.kind !== '笔记' && row.content.trim().length > 0 && row.subject === point.subject && canonicalKnowledgePoint(row.subject, row.knowledgePoint) === point.knowledgePoint).map(([id, row]) => ({ id, title: row.title, source: row.source, content: row.content.slice(0, 12000) })) : []; };
            const associated=(pointId:string,cycleId:string)=>{const tasks=state.plan.read().tasks.filter(t=>t.recallReference?.pointId===pointId);return tasks.find(t=>t.status==='in-progress')??tasks.find(t=>t.recallReference?.cycleId===cycleId)??null};
            const present = (record: ReturnType<typeof state.recalls.list>[number]) => { const planTask=associated(record.pointId,record.cycleId);const row={...record,planTask,planPending:!!planTask&&planTask.status==='in-progress'&&record.history.some(h=>h.cycleId===planTask.recallReference?.cycleId)};if (!row.revealedAt)
                return row; const current = references(row.pointId), changed = JSON.stringify(row.referenceEvidence) !== JSON.stringify(recallReferenceEvidence(current)); return { ...row, references: changed ? [] : current, referenceChanged: changed }; };
            try {
                if (req.method === 'GET') {
                    send(200, { items: state.recalls.list().map(present) });
                    return;
                }
                if (req.method !== 'POST' || !req.headers['content-type']?.startsWith('application/json')) {
                    send(405, { error: 'POST JSON required' });
                    return;
                }
                let text = '';
                for await (const part of req) {
                    text += part;
                    if (text.length > 20000)
                        throw new PracticeError('请求过大');
                }
                const raw = JSON.parse(text);
                if (raw.action === 'enroll') {
                    const body = z.object({ action: z.literal('enroll'), pointId: z.string().max(200), confirmed: z.boolean() }).strict().parse(raw);
                    send(200, present(await state.recalls.enroll(body.pointId, body.confirmed)));
                    return;
                }
                const body = z.object({ action: z.enum(['answer', 'reveal', 'confirm']), pointId: z.string().max(200), cycleId: z.string().uuid(), recall: z.string().max(10000).optional(), earlyConfirmed: z.boolean().optional(), confirmed: z.boolean().optional(), rating: z.enum(['forgotten', 'fuzzy', 'remembered']).optional() }).strict().parse(raw);
                const matches=state.plan.read().tasks.filter(t=>t.recallReference?.pointId===body.pointId&&t.recallReference?.cycleId===body.cycleId);
                if(matches.length>1)throw new PracticeError('有多个关联计划，请先整理',409);
                let planTask: (typeof matches)[number] | undefined=matches[0];
                if(body.action==='answer'&&planTask?.status==='pending'){await state.plan.start(planTask.id,state.plan.read().revision);planTask=state.plan.read().tasks.find(t=>t.id===planTask!.id)}
                const result=await state.recalls.command(body,()=>references(body.pointId));
                let planError:string|undefined,planIncompleteReason:string|undefined;
                if(body.action==='confirm'&&planTask&&planTask.status!=='completed'){
                  const proof=result.history.slice(planTask.reviewHistoryCount??0).find(h=>h.cycleId===body.cycleId);
                  if(planTask.status!=='in-progress'||!proof)planIncompleteReason='尚无任务开始后的本次回忆确认，任务保持未完成';
                  else try{await state.plan.complete(planTask.id,state.plan.read().revision,true,{})}catch(error){if(state.plan.read().tasks.find(t=>t.id===planTask!.id)?.status!=='completed')planError=error instanceof Error?error.message:'计划待恢复'}
                }
                send(200,{...present(result),planTask:planTask?state.plan.read().tasks.find(t=>t.id===planTask!.id):null,planPending:!!planError,planError,planIncompleteReason});
            }
            catch (error) {
                send(error instanceof PracticeError ? error.status : 400, { error: error instanceof Error ? error.message : '回忆操作失败' });
            }
        } });
}
