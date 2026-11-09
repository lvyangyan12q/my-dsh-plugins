# 已知基线红：classroom-empty-practice

记录时间：2026-11-09。集成分支 `feat/kaogong-task-classroom`。本文件只记录诊断，不含修复。

## 现象

`tests/classroom-empty-practice.test.tsx` 断言 `calls.length === 1`，实际为 `2`。该失败在 `5bbd77f`（本轮改造之前的 main）上同样复现，不是本轮引入。

## 诊断

用带调用栈的探针复跑，两次 fetch 的来源是：

1. `POST /api/kaogong/lesson/closeout-preview` —— `lesson-closeout` 挂载时的 `useEffect` 发起，与练习无关。
2. `POST /api/kaogong/practice/start` —— 点击「课后练习」触发，只此一次，且带了正确的 `knowledgePoint`。

**产品侧只发了一次练习请求。** 测试桩把所有 fetch 都 `calls.push` 再统一断言 URL，于是把收尾预览也计成了练习请求。

## 第二个缺陷

该测试的环境只补了 `window`/`document`/`HTMLElement`/`localStorage`，没有 `DOMParser`；补上后又会报 `DOMPurify.sanitize is not a function`，因为在模块导入时 `globalThis.window` 尚未建立，`dompurify` 返回的是工厂而不是实例。

也就是说这个用例此前的「通过」与「失败」都没有真正走到文档渲染路径；它需要一个能初始化 DOM 净化器的测试环境（或在测试内显式构造实例），否则无法验证它声称的行为。

## 未做

未修改该测试。它不在本轮八张票的范围内，且改动会混淆「既有问题」与「本轮回归」的边界。交由 code-review 阶段统一处理，修的时候要同时解决计数口径与 DOMPurify 初始化两件事，而不是只把 `1` 改成 `2`。
