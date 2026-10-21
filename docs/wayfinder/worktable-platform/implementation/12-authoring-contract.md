# 12 组合应用Host合同（源码已实现，安装验收待14/19）

服务 `worktableCompositions`（公开类型见 `src/sdk.d.ts`）；HTTP `/api/worktable/compositions` 经当前Host `connection.admit`，GET返回记录数组，POST `{action:'get',appId}` 或 `save/preview/activate`。后3项均接收 `{appId,expectedRevision}`；save另传 `recipe`。新app预期revision=0，save和activate均增加revision；preview不增加。get/list是独立副本。缺服务/认证/引用时明确拒绝，无模型发送。

`recipe={title,version:'1.0.0',layout:'vertical'|'grid'|'split',pages:[{id,title,modules:[{id,type,config?,connectionId?,roleId?}]}],connections?:[{id,viewId,resourceId}],roles?:RoleDefinition[]}`。模块id跨所有页面唯一，type为website/custom/conversation/animation/resources/statistics/list/detail/filter。展示字段等由13/14的显式config解释，不能执行配方任意代码。角色复用既有SDK RoleDefinition，需要明确绝对creation.cwd与Agent来源；私有能力仍须本组合app所有。

首页固定第一个page的id，运行后不可替换此id；首页面映射view type `page`，其余`page.<id>`。持久视图身份不改；删除的页面不得用当前第N页回填。14渲染器须按稳定view type匹配；不存在时显示不可用。模板复制应新建appId且清除connections/roles/所有运行身份，不能复制已有授权或会话。

save仅保存draft；preview验证数据引用与角色但不注册应用、建实例、建Session或发送Task。activate重新校验、要求running版本递增，并在同一个ProfileFileStore事务里写running。目录从持久running派生，避免先dispose再contribute暴露空窗；现有instance/view/native绑定不动。RoleDirectory按运行定义取组合角色，不影响独立应用的contribute。

**连接不是授权。** recipe.connections的viewId仅是已选来源元数据，preview验证来源可读。运行渲染/任务须使用当前组合目标viewId走worktableResources；如跨实例读取，仍必须由用户显式share给当前consumerInstance。不得用source viewId代替目标身份、不得从配方授予写权。角色配置同样不创建会话，角色ensure/原生发送仍需原有显式准入。

存储仍为profile下worktable-platform/applications.v1.json；含组合记录时schema=3，老版本明确拒绝，不静默回退。新Host保留schema1/2读取。所有者worktable-compositions保留appId防冒领。停用仍走现有lifecycle，卸载/业务数据删除不混同。

源码测试：`node --test plugins/worktable/04_test/compositions.test.mjs plugins/worktable/04_test/composition-http.test.mjs`（在仓库根执行）。这是辅助接缝证据，不能关闭12或替代实际安装、模块交互、原生AI闭环。
