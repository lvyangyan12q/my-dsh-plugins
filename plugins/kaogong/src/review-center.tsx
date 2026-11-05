import { useContext, useEffect, useRef, useState } from 'react';
import { KaogongTransportContext, useLearningHttp } from './view-context.tsx';
import { studyDate } from './study-date.ts';
import { RecallPanel } from './recall-panel.tsx';
import { ErrorReviewPanel } from './error-review-panel.tsx';
import type { StudyPlanState } from './study-plan.ts';
type PlanTask = {
    id: string;
    title: string;
    date: string | null;
    status: string;
    recallReference?: {
        pointId: string;
        cycleId: string;
    };
};
type Entry = {
    id: string;
    kind: 'recall' | 'error';
    subject: string;
    point: string;
    dueAt: string;
    pointId?: string;
    cycleId?: string;
    roundId?: string;
    questionId?: string;
    planTask?: PlanTask;
    planPending?: boolean; planIncompleteReason?:string;
    retry?: unknown;
    reason: string;
};
type Props = {
    initialPointId?: string | null;
    initialOccurrenceId?: string | null;
    onClearTarget?(): void;
};
export function ReviewCenter(props: Props) {
    const context = useContext(KaogongTransportContext);
    return <OwnedCenter key={JSON.stringify([context?.instanceId, context?.viewId, props.initialPointId, props.initialOccurrenceId])} {...props}/>;
}
function OwnedCenter({ initialPointId, initialOccurrenceId, onClearTarget }: Props) {
    const http = useLearningHttp(), context = useContext(KaogongTransportContext), alive = useRef(true);
    const key = 'kaogong/review-center-view/' + JSON.stringify([context?.instanceId, context?.viewId]);
    const saved = () => { try {
        return JSON.parse(window.localStorage.getItem(key) ?? '{}');
    }
    catch {
        return {};
    } };
    const activityKey='kaogong/review-active/'+JSON.stringify([context?.instanceId]);
    const readActive=()=>{try{const value=JSON.parse(window.localStorage.getItem(activityKey)??'null');return typeof value==='string'&&(value.startsWith('recall:')||value.startsWith('error:'))?value:null}catch{return null}};
    const [entries, setEntries] = useState<Entry[]>([]), [error, setError] = useState(''), [activeId, setActiveId] = useState(initialPointId ? 'recall:' + initialPointId : initialOccurrenceId ? 'error:' + initialOccurrenceId : readActive()), [history, setHistory] = useState(false);
    const [subject, setSubject] = useState(saved().subject ?? ''), [point, setPoint] = useState(saved().point ?? ''), [enrolling, setEnrolling] = useState(false), [revision, setRevision] = useState(0), [busy, setBusy] = useState(false), [resumeTaskId, setResumeTaskId] = useState<string | undefined>();
    const target = useRef(activeId);
    target.current = activeId;
    useEffect(()=>{try{window.localStorage.setItem(activityKey,JSON.stringify(activeId))}catch{}},[activityKey,activeId]);
    const [preview, setPreview] = useState<StudyPlanState['drafts'][number] | null>(null);
    useEffect(() => { try {
        window.localStorage.setItem(key, JSON.stringify({ subject, point }));
    }
    catch { } }, [key, subject, point]);
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
    async function request(path: string, body?: unknown) { const response = await http.fetch(path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined), data = await response.json(); if (!response.ok)
        throw Error(data.error ?? '复习操作失败'); return data; }
    useEffect(() => {
        let current = true;
        void Promise.all(['/api/kaogong/recall', '/api/kaogong/errors?mode=review', '/api/kaogong/route'].map(path => request(path))).then(([recall, errors, route]) => {
            if (!current)
                return;
            const recalls: Entry[] = (recall.items ?? []).map((row: any) => { const point = route.points?.find((p: any) => p.id === row.pointId), previous = row.history?.find((h: any) => h.cycleId === row.planTask?.recallReference?.cycleId); return { id: row.pointId, kind: 'recall', pointId: row.pointId, cycleId: row.cycleId, point: point?.knowledgePoint ?? '知识点', subject: point?.subject ?? '', dueAt: row.dueAt, planTask: row.planTask, planPending: row.planPending, planIncompleteReason:row.planIncompleteReason, retry: previous ? { action: 'confirm', pointId: row.pointId, cycleId: previous.cycleId, rating: previous.rating, confirmed: true } : undefined, reason: row.history?.length ? '按上次自评的间隔安排' : '首次知识点回忆' }; });
            const wrongs: Entry[] = (errors.occurrences ?? []).filter((row: any) => row.review && (row.review.status !== 'consolidated' || row.planPending)).map((row: any) => ({ id: row.id, kind: 'error', point: row.knowledgePoint, subject: row.subject, dueAt: row.review.dueAt, roundId: row.roundId, questionId: row.questionId, planTask: row.planTask, planPending: row.planPending, planIncompleteReason:row.planIncompleteReason, retry: row.retryConfirmation, reason: row.review.status === 'pending-correction' ? '上次作答仍需订正' : '历史错题按阶段再次检验' }));
            setEntries([...recalls, ...wrongs]);
        }).catch(e => { if (current)
            setError(String(e)); });
        return () => { current = false; };
    }, [http, revision, activeId, history]);
    async function run(operation: () => Promise<void>) { if (busy)
        return; setBusy(true); setError(''); try {
        await operation();
    }
    catch (e) {
        if (alive.current)
            setError(String(e));
    }
    finally {
        if (alive.current)
            setBusy(false);
    } }
    async function propose(row: Entry) { const requestedTarget = target.current; const plan = await request('/api/kaogong/plan'); const today = studyDate(), due = studyDate(new Date(row.dueAt)); const draft = await request('/api/kaogong/plan', { action: 'preview', baseRevision: plan.revision, operation: 'append', date: due < today ? today : due, task: { subject: row.subject, title: (row.kind === 'recall' ? '知识点回忆：' : '错题复习：') + row.point, kind: 'review', ...(row.kind === 'recall' ? { recallReference: { pointId: row.pointId, cycleId: row.cycleId } } : { requireReflections: true, reviewOccurrence: { roundId: row.roundId, questionId: row.questionId } }) } }); if (alive.current && target.current === requestedTarget)
        setPreview(draft); }
    const back = () => { try{window.localStorage.removeItem(activityKey)}catch{}; setPreview(null); setActiveId(null); setHistory(false); setResumeTaskId(undefined); onClearTarget?.(); setRevision(v => v + 1); };
    const active = entries.find(row => row.kind + ':' + row.id === activeId);
    if (activeId?.startsWith('error:') && !active)
        return <><button onClick={back}>返回复习队列</button><ErrorReviewPanel occurrenceId={activeId.slice(6)}/></>;
    if (history)
        return <><button onClick={back}>返回复习队列</button><ErrorReviewPanel /></>;
    if (active)
        return <section>{active.planIncompleteReason&&<p role='status'>计划仍未完成：{active.planIncompleteReason}</p>}{active.planPending && <div role='status'><p>复习已保存，计划尚待恢复。</p>{!!active.retry && <button disabled={busy} onClick={() => void run(async () => { await request(active.kind === 'recall' ? '/api/kaogong/recall' : '/api/kaogong/errors?mode=review', active.retry); if (alive.current)
            setRevision(v => v + 1); })}>仅重试计划回写</button>}</div>}{error && <p role='alert'>{error}</p>}<button onClick={back}>返回复习队列</button><p>{active.planTask ? `本次符合完成条件后同步完成「${active.planTask.title}」，计划日期 ${active.planTask.date ?? '待安排'}。` : '本次只更新复习队列，不占正式日程容量。'}</p>{active.kind === 'error' && active.planTask?.status === 'in-progress' && <label><input type='checkbox' checked={resumeTaskId === active.planTask.id} onChange={e => setResumeTaskId(e.target.checked ? active.planTask!.id : undefined)}/>本次订正继续原计划任务</label>}{active.kind === 'recall' ? <RecallPanel pointId={active.id} onChanged={() => setRevision(v => v + 1)}/> : <ErrorReviewPanel occurrenceId={active.id} resumeTaskId={resumeTaskId} onChanged={() => setRevision(v => v + 1)}/>}<button onClick={() => { const next = entries.find(row => row.kind + ':' + row.id !== activeId); if (next)
            setActiveId(next.kind + ':' + next.id);
        else
            back(); }}>下一项复习</button></section>;
    const today = studyDate(), now = new Date().toISOString(), groups = [['逾期', (date: string) => date <= now && studyDate(new Date(date)) < today], ['今日到期', (date: string) => date <= now && studyDate(new Date(date)) === today], ['后续', (date: string) => date > now]] as const;
    return <section aria-label="复习中心" style={{ padding: 24 }}><h1>复习中心</h1><p>主动回忆与错题重做分别记录；加入队列不占正式计划容量。</p><label>科目筛选<select value={subject} onChange={e => { setSubject(e.target.value); setPoint(''); }}><option value="">全部科目</option>{[...new Set(entries.map(row => row.subject))].map(s => <option key={s}>{s}</option>)}</select></label><label>知识点筛选<select value={point} onChange={e => setPoint(e.target.value)}><option value="">全部知识点</option>{[...new Set(entries.filter(row => !subject || row.subject === subject).map(row => row.point))].map(p => <option key={p}>{p}</option>)}</select></label><button onClick={() => setHistory(true)}>查看错题历史</button><button onClick={() => setRevision(v => v + 1)}>刷新队列</button>{error && <p role="alert">{error}</p>}
 {preview && <section aria-label="复习排程预览"><h2>确认前核对安排</h2>{preview.diff.map(change => <p key={change.id}>{change.after?.title ?? change.before?.title}：{change.before?.date ?? '未安排'} → {change.after?.date ?? '容量不足，待安排'}</p>)}<p>未排入 {preview.overflow.length} 项</p><button disabled={busy} onClick={() => void run(async () => { await request('/api/kaogong/plan', { action: 'confirm', id: preview.id, revision: preview.baseRevision, confirmed: true }); if (alive.current) {
        setPreview(null);
        setRevision(v => v + 1);
    } })}>确认排入正式计划</button><button disabled={busy} onClick={() => setPreview(null)}>取消预览</button></section>}
 {groups.map(([title, include]) => <section key={title}><h2>{title}</h2>{entries.filter(row => (!subject || subject === row.subject) && (!point || point === row.point) && include(row.dueAt)).map(row => <article key={row.kind + row.id} style={{ borderBottom: '1px solid #d5d9d0', padding: '16px 0' }}><span>{row.kind === 'recall' ? '回忆' : '错题'}</span><h3>{row.subject} · {row.point}</h3><p>{row.reason} · {studyDate(new Date(row.dueAt))}</p>{row.planTask && <p>关联计划：{row.planTask.title} · {row.planTask.date ?? '待安排'} · {row.planTask.status === 'completed' ? '已完成' : '符合条件后同步完成'}</p>}{row.planIncompleteReason&&<p>计划仍未完成：{row.planIncompleteReason}</p>}{row.planPending && <p role="status">复习已保存，计划尚待恢复。</p>}{row.planPending && row.retry ? <button disabled={busy} onClick={() => void run(async () => { await request(row.kind === 'recall' ? '/api/kaogong/recall' : '/api/kaogong/errors?mode=review', row.retry); if (alive.current)
        setRevision(v => v + 1); })}>仅重试计划回写</button> : <button onClick={() => setActiveId(row.kind + ':' + row.id)}>{row.kind === 'recall' ? '开始回忆' : '重做错题'}</button>}{!row.planTask && <button disabled={busy} onClick={() => void run(() => propose(row))}>预览排入计划</button>}</article>)}</section>)}{!entries.length && <p>暂无待复习项，可自主选择知识点加入。</p>}<button onClick={() => setEnrolling(value => !value)}>自主选择知识点</button>{enrolling && <RecallPanel />}</section>;
}
