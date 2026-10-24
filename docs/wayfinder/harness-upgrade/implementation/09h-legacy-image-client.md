---
id: harness-rc3-legacy-image-client
title: 原始知识和题目图片在实例视图内精确展示
parent: harness-rc3-legacy-adoption
status: open
implementation_status: implemented
acceptance_status: pending-installed-native
blocked_by: [harness-rc3-legacy-bank-image-evidence, harness-rc3-legacy-private-assets]
target: 0.2.1-rc.3
---

客户端仅提供原始引用选择器：资料阅读器传 entryId，练习题干、选项和已提交轮次解析传 questionId。DocumentMarkdown 将本地图片发送到 legacy-image / legacy-question-image，URLSearchParams 只编码一次，现有不可变传输追加 viewId。浏览器不传根、binding、实例或来源证明，不判断读取授权。Markdown 使用原始目标字符串（包括 Windows 分隔符与百分号编码）；HTML 使用 DOM 解码的原 src。Token 处理不会改代码示例、存储正文、题干、选项、答案或评分。

Host 必须匹配当前记录、固定证明和当次权限。私有知识图保持 own history；题图走独立题库来源授权。缺失证明拒绝，客户端不猜路径。外部、协议相对、data 与未知协议图片不转为资产请求；HTML 保持白名单，脚本、事件属性、srcset 不进入渲染。两个随包 verified 图片仍走 material-image。无上下文的新文档保留 document-image；有记录上下文的新 own MinerU 文档由 Host 检查精确记录与当前实例任务元数据，不导入旧全局任务。

预先确认的 TDD 接缝为实际 DocumentMarkdown DOM 和实例传输。红灯分别观察到相对图缺失、随包图误走旧证明；最小修复后两项 DOM 回归通过，覆盖重复 src、私有 HTML、旧 API、Windows 原路径、百分号原文、record/view 选择器与 unsafe 图片/脚本清理。结合既有传输/角色状态回归为 6/6，客户端类型检查与构建通过。

本票仅实现客户端与合成渲染回归。Host 字节及撤销验收、最终浏览器像素联合验收仍待完成；没有正式迁移、模型执行、来源正确性或答案正确性结论。没有启动运行时，未改源材料、正式数据、SDK、版本或原生代码。
