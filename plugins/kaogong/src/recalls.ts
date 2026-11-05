import { z } from 'zod';
import { randomUUID, createHash } from 'node:crypto';
import type { KvTable } from '@deepseek-ai/dsh-storage-domain';
import { learningOutline } from './learning-outline.ts';
import { PracticeError } from './practice-rounds.ts';
const referenceEvidence = z.array(z.object({ id: z.string(), fingerprint: z.string() }));
export function recallReferenceEvidence(references: {
    id: string;
    content: string;
}[]) { return references.map(ref => ({ id: ref.id, fingerprint: createHash('sha256').update(ref.content).digest('hex') })).sort((a, b) => a.id.localeCompare(b.id)); }
export const recallRecord = z.object({ version: z.literal(1), pointId: z.string(), cycleId: z.string().uuid(), enrolledAt: z.string(), dueAt: z.string(), recall: z.string().optional(), revealedAt: z.string().optional(), referenceIds: z.array(z.string()).optional(), referenceEvidence: referenceEvidence.optional(), history: z.array(z.object({ cycleId: z.string(), recall: z.string(), rating: z.enum(['forgotten', 'fuzzy', 'remembered']), referenceIds: z.array(z.string()).default([]), referenceEvidence: referenceEvidence.default([]), confirmedAt: z.string() })).default([]) });
export type RecallRecord = z.infer<typeof recallRecord>;
export class Recalls {
    private tail: Promise<unknown> = Promise.resolve();
    constructor(private table: KvTable<string, RecallRecord>) { }
    list() { return [...this.table.entries()].map(([, row]) => row); }
    enroll(pointId: string, confirmed: boolean) {
        const work = this.tail.then(async () => {
            if (confirmed !== true)
                throw new PracticeError('请明确确认加入回忆队列', 409);
            if (!learningOutline.some(point => point.id === pointId))
                throw new PracticeError('知识点不存在', 409);
            const existing = this.table.get(pointId);
            if (existing)
                return existing;
            const now = new Date(), row: RecallRecord = { version: 1, pointId, cycleId: randomUUID(), enrolledAt: now.toISOString(), dueAt: new Date(now.getTime() + 86400000).toISOString(), history: [] };
            await this.table.put(pointId, row);
            return row;
        });
        this.tail = work.catch(() => { });
        return work;
    }
    command(body: {
        action: 'answer' | 'reveal' | 'confirm';
        pointId: string;
        cycleId: string;
        recall?: string;
        earlyConfirmed?: boolean;
        confirmed?: boolean;
        rating?: 'forgotten' | 'fuzzy' | 'remembered';
    }, references: () => {
        id: string;
        content: string;
    }[]) {
        const work = this.tail.then(async () => {
            const row = this.table.get(body.pointId);
            if (!row)
                throw new PracticeError('请先加入回忆队列', 409);
            const previous = row.history.find(h => h.cycleId === body.cycleId);
            if (previous && body.action === 'confirm') {
                if (body.confirmed !== true || body.rating !== previous.rating)
                    throw new PracticeError('已确认自评冲突', 409);
                return row;
            }
            if (row.cycleId !== body.cycleId)
                throw new PracticeError('复习周期已变化', 409);
            if (body.action === 'answer') {
                const recall = z.string().trim().min(1).max(10000).parse(body.recall);
                if (row.recall) {
                    if (row.recall !== recall)
                        throw new PracticeError('本周期回忆已提交', 409);
                    return row;
                }
                if (row.dueAt > new Date().toISOString() && body.earlyConfirmed !== true)
                    throw new PracticeError('请明确选择提前回忆', 409);
                const next = { ...row, recall };
                await this.table.put(row.pointId, next);
                return next;
            }
            if (!row.recall)
                throw new PracticeError('请先提交本次回忆', 409);
            const evidence = recallReferenceEvidence(references()), referenceIds = evidence.map(reference => reference.id);
            if (!referenceIds.length)
                throw new PracticeError('暂无获准参考资料，请接入讲义后继续', 409);
            if (body.action === 'reveal') {
                const next = { ...row, referenceIds, referenceEvidence: evidence, revealedAt: row.revealedAt ?? new Date().toISOString() };
                await this.table.put(row.pointId, next);
                return next;
            }
            if (!row.revealedAt || body.confirmed !== true || !body.rating)
                throw new PracticeError('请对照资料、自评并明确确认', 409);
            if (JSON.stringify(row.referenceEvidence) !== JSON.stringify(evidence))
                throw new PracticeError('参考资料已变化，请重新查看原文再确认', 409);
            const now = new Date(), days = { forgotten: 1, fuzzy: 3, remembered: 7 }[body.rating];
            const next: RecallRecord = { version: 1, pointId: row.pointId, cycleId: randomUUID(), enrolledAt: row.enrolledAt, dueAt: new Date(now.getTime() + days * 86400000).toISOString(), history: [...row.history, { cycleId: row.cycleId, recall: row.recall, rating: body.rating, referenceIds, referenceEvidence: evidence, confirmedAt: now.toISOString() }] };
            await this.table.put(row.pointId, next);
            return next;
        });
        this.tail = work.catch(() => { });
        return work;
    }
    async close() { await this.tail; }
}
