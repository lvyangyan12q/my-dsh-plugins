'use strict';
// 一次性补丁：给 split 引擎的左列增加「多窗上下叠」能力（spec.left 为第一窗，spec.leftMore 为其余）
const fs = require('node:fs');
const path = require('node:path');

const FILE = 'F:\\ai-project\\my-dsh-plugins\\plugins\\worktable\\01_content\\src\\client\\split.tsx';
let src = fs.readFileSync(FILE, 'utf8');
const edits = [];

function rep(from, to, label) {
  if (!src.includes(from)) { edits.push('MISS: ' + label); return; }
  src = src.replace(from, to);
  edits.push('ok  : ' + label);
}

// 1) 类型：允许 leftMore
rep(
  `export type LayoutSpec = {`,
  `export type LayoutSpec = {`,
  'noop-anchor-layoutspec'
);
rep(
  `  /** 左列整高内容窗（可选；存在时右侧列 = top 行 + 底部聊天，chatSide 固定 right） */
  left?: SplitPane | null`,
  `  /** 左列整高内容窗（可选；存在时右侧列 = top 行 + 底部聊天，chatSide 固定 right） */
  left?: SplitPane | null
  /** 左列上下叠放的其余窗（第一窗仍是 left；一起构成左列，均分高度） */
  leftMore?: SplitPane[] | null`,
  'LayoutSpec.leftMore'
);

// 2) 辅助函数（放在 PaneRow 类型之后）
rep(
  `type PaneRow = 'left' | 'top' | 'main'`,
  `type PaneRow = 'left' | 'top' | 'main'

/** 左列窗口列表：left 为第一窗，leftMore 为其余（上下叠放，均分高度） */
function leftPanesOf(spec: any): SplitPane[] {
  if (!spec || !spec.left) return []
  return [spec.left, ...(Array.isArray(spec.leftMore) ? spec.leftMore : [])]
}

/** 把左列窗口列表写回 spec（保持 left / leftMore 两个字段） */
function withLeftPanes(spec: any, panes: SplitPane[]): any {
  const [first, ...rest] = panes
  return { ...spec, left: first ?? null, leftMore: rest.length ? rest : null }
}`,
  'helpers leftPanesOf/withLeftPanes'
);

// 3) 窗口编号：左列 N 窗 → 1..N，顶行接续，主行再接续
rep(
  `  let num = spec.left ? 2 : 1
  if (row === 'left') num = 1
  else if (row === 'top') num = num + index
  else { num += (spec.top?.length ?? 0) + index }
  let label = '窗口' + num
  const pane = row === 'left' ? spec.left : row === 'top' ? spec.top?.[index] : spec.main?.[index]`,
  `  const leftCount = leftPanesOf(spec).length
  let num = leftCount + 1
  if (row === 'left') num = index + 1
  else if (row === 'top') num = leftCount + 1 + index
  else { num = leftCount + 1 + (spec.top?.length ?? 0) + index }
  let label = '窗口' + num
  const pane = row === 'left' ? leftPanesOf(spec)[index] : row === 'top' ? spec.top?.[index] : spec.main?.[index]`,
  'windowLabelOf numbering'
);

// 4) open()：归一化 leftMore
rep(
  `    if (spec.left) this.spec.left = normalize(spec.left)`,
  `    if (spec.left) this.spec.left = normalize(spec.left)
    if (spec.leftMore && spec.leftMore.length) this.spec.leftMore = spec.leftMore.map(normalize)`,
  'open normalize leftMore'
);

// 5) 所有窗格列表（通知用）
rep(
  `    const panes = [...(this.spec?.top ?? []), ...(this.spec?.main ?? []), ...(this.spec?.left ? [this.spec.left] : [])]`,
  `    const panes = [...(this.spec?.top ?? []), ...(this.spec?.main ?? []), ...leftPanesOf(this.spec)]`,
  'panes list'
);

// 6) 左列左边界拖拽守卫保持不变；聊天固定守卫改为按列表判断
rep(
  `    if (spec.left) return // 左列布局：聊天固定右下`,
  `    if (leftPanesOf(spec).length) return // 左列布局：聊天固定右下`,
  'setChatSide guard'
);

// 7) 六个「左列单窗」分支 → 列表分支
const leftBranchOld = `    if (row === 'left') {
      if (!spec.left || i !== 0) return
      this.spec = { ...spec, left: mutate(spec.left) }
    } else if (row === 'top') {`;
const leftBranchNew = `    if (row === 'left') {
      const lp = leftPanesOf(spec)
      if (!lp[i]) return
      this.spec = withLeftPanes(spec, lp.map((p, k) => (k === i ? mutate(p) : p)))
    } else if (row === 'top') {`;
let count = 0;
while (src.includes(leftBranchOld)) { src = src.replace(leftBranchOld, leftBranchNew); count++; }
edits.push('left-branch i/index replacements: ' + count);

const leftBranchOld2 = `    if (row === 'left') {
      if (spec.left && index === 0) this.spec = { ...spec, left: mutate(spec.left) }
    } else if (row === 'top') {`;
const leftBranchNew2 = `    if (row === 'left') {
      const lp = leftPanesOf(spec)
      if (lp[index]) this.spec = withLeftPanes(spec, lp.map((p, k) => (k === index ? mutate(p) : p)))
    } else if (row === 'top') {`;
if (src.includes(leftBranchOld2)) { src = src.replace(leftBranchOld2, leftBranchNew2); edits.push('ok  : setTabContent left branch'); } else edits.push('MISS: setTabContent left branch');

// 8) 三个读访问器
src = src.split(`row === 'left' ? spec.left : row === 'top' ? spec.top?.[index] : spec.main[index]`).join(`row === 'left' ? leftPanesOf(spec)[index] : row === 'top' ? spec.top?.[index] : spec.main[index]`);
src = src.split(`row === 'left' ? spec.left : row === 'top' ? spec.top?.[i] : spec.main[i]`).join(`row === 'left' ? leftPanesOf(spec)[i] : row === 'top' ? spec.top?.[i] : spec.main[i]`);
src = src.split(`props.row === 'left' ? splitStore.spec.left : props.row === 'top' ? splitStore.spec.top?.[props.index] : splitStore.spec.main`).join(`props.row === 'left' ? leftPanesOf(splitStore.spec)[props.index] : props.row === 'top' ? splitStore.spec.top?.[props.index] : splitStore.spec.main`);
src = src.split(`row === 'left' ? splitStore.spec.left : row === 'top' ? splitStore.spec.top?.[index] : splitStore.spec.main[index]`).join(`row === 'left' ? leftPanesOf(splitStore.spec)[index] : row === 'top' ? splitStore.spec.top?.[index] : splitStore.spec.main[index]`);
src = src.split(`props.row === 'left' ? splitStore.spec.left : props.row === 'top' ? splitStore.spec.top?.[props.index] : splitStore.spec.main[props.index]`).join(`props.row === 'left' ? leftPanesOf(splitStore.spec)[props.index] : props.row === 'top' ? splitStore.spec.top?.[props.index] : splitStore.spec.main[props.index]`);
edits.push('accessor replacements done');

// 9) moveTab / swapPanes 的 left 数组化
src = src.split(`    const left = spec.left ? { ...spec.left } : null`).join(`    const left = leftPanesOf(spec).map((p) => ({ ...p }))`);
src = src.split(`    const arrOf = (row: PaneRow): SplitPane[] => (row === 'left' ? (left ? [left] : []) : row === 'top' ? top : main)`).join(`    const arrOf = (row: PaneRow): SplitPane[] => (row === 'left' ? left : row === 'top' ? top : main)`);
src = src.split(`      if (row === 'left') spec.left = pane`).join(`      if (row === 'left') { left[i] = pane }`);
src = src.split(`    this.spec = { ...spec, left: left ?? null, top: top.length > 0 ? top : null, main }`).join(`    this.spec = withLeftPanes({ ...spec, top: top.length > 0 ? top : null, main }, left)`);
edits.push('moveTab/swapPanes array-ified');

// 10) 渲染：左列多窗（均分高度）
rep(
  `  const leftItem = spec.left ? { pane: spec.left, left: 0, width: leftW } : null`,
  `  const leftPanes = leftPanesOf(spec)
  const leftTotalH = g.bottom - barTop - BAR_H
  const leftSlotH = leftPanes.length ? Math.max(80, Math.floor(leftTotalH / leftPanes.length)) : 0`,
  'left render geometry'
);
rep(
  `      {leftItem && renderPane(leftItem, 'left', 0, g.left, barTop + BAR_H, g.bottom - barTop - BAR_H)}`,
  `      {!narrow && leftPanes.map((pane, i) => renderPane({ pane, left: 0, width: leftW }, 'left', i, g.left, barTop + BAR_H + i * leftSlotH, leftSlotH))}`,
  'left render loop'
);

// 11) narrow 模式的 choices：左列多窗都要列出来
rep(
  `  const choices = [...(spec.left ? [{ pane: spec.left, row: 'left' as PaneRow, index: 0 }] : []), ...top.map((pane, index) => ({ pane, row: 'top' as PaneRow, index })), ...main.map((pane, index) => ({ pane, row: 'main' as PaneRow, index }))]`,
  `  const choices = [...leftPanesOf(spec).map((pane, index) => ({ pane, row: 'left' as PaneRow, index })), ...top.map((pane, index) => ({ pane, row: 'top' as PaneRow, index })), ...main.map((pane, index) => ({ pane, row: 'main' as PaneRow, index }))]`,
  'choices left panes'
);

fs.writeFileSync(FILE, src, 'utf8');
console.log(edits.join('\n'));
const misses = edits.filter((e) => e.startsWith('MISS'));
console.log(misses.length ? '\n有未命中的替换：' + misses.length : '\n全部替换完成');
