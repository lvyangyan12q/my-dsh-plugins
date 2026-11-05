import { useContext, useEffect, useRef, useState } from 'react';
import { KaogongTransportContext, useLearningHttp } from './view-context.tsx';
import { DocumentMarkdown } from './document-markdown.tsx';
import { studyDate } from './study-date.ts';
import type { RecallRecord } from './recalls.ts';
type Item = RecallRecord & {
    referenceChanged?: boolean;
    references?: {
        id: string;
        title: string;
        source: string;
        content: string;
    }[];
};
type Point = {
    id: string;
    subject: string;
    knowledgePoint: string;
};
export function RecallPanel({pointId,onChanged}:{pointId?:string;onChanged?():void}={}) { const transport = useContext(KaogongTransportContext); return <OwnedRecallPanel key={JSON.stringify([transport?.instanceId, transport?.viewId])} profile={transport?.instanceId} view={transport?.viewId} pointId={pointId} onChanged={onChanged}/>; }
function OwnedRecallPanel({ profile, view, pointId, onChanged }: {
    pointId?: string; onChanged?():void; profile?: string;
    view?: string;
}) {
    const presentationKey = profile && view ? 'kaogong/recall-view/' + JSON.stringify([profile, view]) : null;
    const restored = useRef((() => { try {
        const value = JSON.parse(presentationKey ? window.localStorage.getItem(presentationKey) ?? 'null' : 'null');
        return value && typeof value.subject === 'string' && typeof value.point === 'string' && ['all', 'due', 'overdue', 'future'].includes(value.filter) ? value : null;
    }
    catch {
        return null;
    } })()).current;
    const http = useLearningHttp(), alive = useRef(true), generation = useRef(0), owner = useRef(http);
    owner.current = http;
    const isCurrent = () => alive.current && owner.current === http;
    const [points, setPoints] = useState<Point[]>([]), [items, setItems] = useState<Item[]>([]), [selected, setSelected] = useState(''), [subject, setSubject] = useState<string>(restored?.subject ?? ''), [pointFilter, setPointFilter] = useState<string>(restored?.point ?? ''), [filter, setFilter] = useState<string>(restored?.filter ?? 'all'), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    useEffect(() => { try {
        if (presentationKey)
            window.localStorage.setItem(presentationKey, JSON.stringify({ subject, point: pointFilter, filter }));
    }
    catch { } }, [presentationKey, subject, pointFilter, filter]);
    const load = async () => { if (!isCurrent())
        return; const token = ++generation.current; const response = await http.fetch('/api/kaogong/recall'), value = await response.json(); if (!response.ok) {
        if (isCurrent() && token === generation.current)
            setItems(rows => rows.map(({ references, ...row }) => row));
        throw Error(value.error ?? '回忆读取失败');
    } if (isCurrent() && token === generation.current)
        setItems(value.items ?? []); };
    useEffect(() => { alive.current = true; setBusy(false); setError(''); void Promise.all([load(), http.fetch('/api/kaogong/route').then(async (r) => { const value = await r.json(); if (!r.ok)
            throw Error(value.error ?? '大纲读取失败'); if (isCurrent()) {
            setPoints(value.points ?? []);
            setSelected(value.points?.[0]?.id ?? '');
        } })]).catch(e => { if (isCurrent())
        setError(String(e)); }); return () => { alive.current = false; generation.current++; }; }, [http]);
    const command = async (body: unknown): Promise<'success' | 'cancelled'> => { if (!isCurrent())
        return 'cancelled'; const response = await http.fetch('/api/kaogong/recall', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), value = await response.json(); if (!isCurrent())
        return 'cancelled'; if (!response.ok) {
        if (response.status === 403 || response.status === 409)
            setItems(rows => rows.map(({ references, ...row }) => row));
        throw Error(value.error ?? '回忆操作失败');
    } await load(); onChanged?.(); if(value.planPending)throw Error(value.planError??'复习已保存，计划待恢复；返回复习队列重试计划回写。'); return isCurrent() ? 'success' : 'cancelled'; };
    const enroll = async () => { if (busy)
        return; setBusy(true); setError(''); try {
        await command({ action: 'enroll', pointId: selected, confirmed: true });
    }
    catch (e) {
        if (isCurrent())
            setError(String(e));
    }
    finally {
        if (isCurrent())
            setBusy(false);
    } };
    const now = new Date().toISOString(), today = studyDate();
    const visible = items.filter(row => { const point = points.find(p => p.id === row.pointId); if(pointId)return row.pointId===pointId; return (!subject || point?.subject === subject) && (!pointFilter || row.pointId === pointFilter) && (filter === 'all' || filter === 'due' && row.dueAt <= now || filter === 'overdue' && studyDate(new Date(row.dueAt)) < today || filter === 'future' && row.dueAt > now); });
    return <section aria-label="知识点主动回忆" style={{ padding: 24 }}>
        <h2>知识点主动回忆</h2>
        <p>先回忆，再对照获准资料并自评。自评不计入练习正确率，也不改变已学状态。</p>

        {!pointId&&<><label>选择知识点<select value={selected} onChange={e => setSelected(e.target.value)}>
        {points.map(p => <option key={p.id} value={p.id}>
        {p.subject} · {p.knowledgePoint}
        </option>)}
        </select>
        </label>

        <p>确认后首次提醒在1天后；仅加入队列，不占正式计划容量。</p>

        <button disabled={busy || !selected} onClick={() => void enroll()}>确认加入回忆队列</button>

        <label>科目筛选<select value={subject} onChange={e => { setSubject(e.target.value); setPointFilter(''); }}>
        <option value="">全部科目</option>
        {[...new Set(points.map(p => p.subject))].map(s => <option key={s}>
        {s}
        </option>)}
        </select>
        </label>

        <label>知识点筛选<select aria-label="知识点筛选" value={pointFilter} onChange={e => setPointFilter(e.target.value)}>
        <option value="">全部知识点</option>
        {points.filter(p => !subject || p.subject === subject).map(p => <option key={p.id} value={p.id}>
        {p.knowledgePoint}
        </option>)}
        </select>
        </label>

        <label>复习时间<select value={filter} onChange={e => setFilter(e.target.value)}>
        <option value="all">全部</option>
        <option value="due">到期</option>
        <option value="overdue">逾期</option>
        <option value="future">后续</option>
        </select>
        </label>

        </>}<button disabled={busy} onClick={() => void load().catch(e => { if (isCurrent())
        setError(String(e)); })}>刷新回忆及资料</button>

        {error && <p role="alert">
        {error}
        </p>
        }{!visible.length && <p>当前没有符合条件的回忆，可从知识点中自主选择。</p>
        }{visible.map(row => <RecallCard key={row.pointId + row.cycleId} row={row} point={points.find(p => p.id === row.pointId)} profile={profile} command={command}/>)}
        </section>
        ;
}
function RecallCard({ row, point, profile, command }: {
    row: Item;
    point?: Point;
    pointId?: string; onChanged?():void; profile?: string;
    command(body: unknown): Promise<'success' | 'cancelled'>;
}) {
    const key = profile ? 'kaogong/recall-draft/' + JSON.stringify([profile, row.pointId, row.cycleId]) : null;
    const read = () => { try {
        const d = JSON.parse(key ? window.localStorage.getItem(key) ?? 'null' : 'null');
        return d && typeof d.recall === 'string' && d.recall.length <= 10000 && ['', 'forgotten', 'fuzzy', 'remembered'].includes(d.rating) && typeof d.early === 'boolean' ? d : null;
    }
    catch {
        return null;
    } };
    const draft = useRef(read()).current;
    const [recall, setRecall] = useState(row.recall ?? draft?.recall ?? ''), [rating, setRating] = useState(draft?.rating ?? ''), [early, setEarly] = useState(draft?.early === true), [busy, setBusy] = useState(false), [error, setError] = useState('');
    useEffect(() => { try {
        if (key)
            window.localStorage.setItem(key, JSON.stringify({ recall, rating, early }));
    }
    catch { } }, [key, recall, rating, early]);
    const perform = async (action: string) => { if (busy)
        return; setBusy(true); setError(''); try {
        const result = await command({ action, pointId: row.pointId, cycleId: row.cycleId, ...(action === 'answer' ? { recall, earlyConfirmed: early } : action === 'confirm' ? { rating, confirmed: true } : {}) });
        if (result === 'success' && action === 'confirm' && key)
            window.localStorage.removeItem(key);
    }
    catch (e) {
        setError(String(e));
    }
    finally {
        setBusy(false);
    } };
    return <article style={{ border: '1px solid #cdd8cd', padding: 16, margin: '12px 0' }}>
        <h3>
        {point?.subject} · {point?.knowledgePoint ?? '知识点'}
        </h3>
        <p>下次：{studyDate(new Date(row.dueAt))}
        </p>

        {row.dueAt > new Date().toISOString() && !row.recall && <label>
        <input type="checkbox" checked={early} onChange={e => setEarly(e.target.checked)}/>本次提前回忆</label>
        }<label>先写下你的回忆<textarea disabled={!!row.recall || busy} value={recall} onChange={e => setRecall(e.target.value)}/>
        </label>

        {!row.recall ? <button disabled={busy || !recall.trim()} onClick={() => void perform('answer')}>提交本次回忆</button>
         : !row.revealedAt ? <button disabled={busy} onClick={() => void perform('reveal')}>查看参考原文</button>
         : <>
        {row.references?.length ? row.references.map(ref => <section key={ref.id}>
        <h4>
        {ref.title}（参考原文节选）</h4>
        <p>来源：{ref.source}
        </p>

        <DocumentMarkdown content={ref.content} imageContext={{ entryId: ref.id }}/>
        </section>
        ) : <p>
        {row.referenceChanged ? '参考资料已变化，请重新查看原文。' : '暂无获准参考资料，请接入讲义后继续。'}
        </p>
        }<button disabled={busy} onClick={() => void perform('reveal')}>重新查看参考原文</button>

        <label>本次自评<select aria-label="本次自评" value={rating} onChange={e => setRating(e.target.value)}>
        <option value="">请选择自评</option>
        <option value="forgotten">未记住 · 1天后</option>
        <option value="fuzzy">模糊 · 3天后</option>
        <option value="remembered">记住 · 7天后</option>
        </select>
        </label>

        <button disabled={busy || !rating || !row.references?.length} onClick={() => void perform('confirm')}>确认本次回忆完成</button>

        </>}{error && <p role="alert">
        {error}
        </p>
        }<p>已确认回忆 {row.history.length} 次；这是活动记录，不代表客观掌握率。</p>

        {row.history.length > 0 && <details>
        <summary>查看回忆历史</summary>
        {row.history.map(h => <p key={h.cycleId}>
        {h.confirmedAt} · {{ forgotten: '未记住', fuzzy: '模糊', remembered: '记住' }[h.rating]} · {h.recall}
        </p>
        )}
        </details>}
        </article>;
}




