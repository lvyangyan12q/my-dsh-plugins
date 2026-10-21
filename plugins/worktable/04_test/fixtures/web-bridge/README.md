# 合作网页真实验收辅助

这是独立HTTP网页，不是DSH插件、不直接读业务库、不保存网页收到的数据、不调用模型。仅监听127.0.0.1，通过localhost访问。桥接网站必须与DSH使用不同主机名；同主机不同端口仍会共享Cookie，明确拒绝。根代理负责最终安装包与实际DSH用户路径；本fixture单独启动不构成F14通过。

```
node plugins/worktable/04_test/fixtures/web-bridge/server.mjs http://127.0.0.1:3091 18573
```

只启动自己持有并记录PID的进程；结束后关闭自己标签和进程。普通网页URL `http://localhost:18573/`；不接受嵌入CSP的负例 `/uncooperative`；302指向所指定Host的负例 `/redirect`。

最终实际用户路径：在组合应用的网站模块中选择该地址、数据连接和已有角色，显式启用版本；角色必须在Host创建就绪会话，资源必须显式只读授权给当前消费实例。如数据Owner需要选择schema，在模块“字段与展示配置”的config中设置taskSelection。Notes示例为{"ids":[],"filter":{"search":"","includeArchived":false}}，Reading示例为{"ids":[],"filter":{"category":"","status":"","search":""}}；它们属于各应用协议，平台不硬编码。准备时固定附所选resource reference，撤资料授权后待发任务不能提交；无Owner受控上下文时不允许带资料准备任务。在模块里展开“网站能力”，只勾选本次合成资料/任务权限并显式启用。该合作网页接受Host的强制嵌入CSP：脚本/样式/图片/连接仅本站，frame/worker/object/base/form均禁止。浏览器必须通过真实正反CSP探测；普通网站保持原sandbox，未接受CSP则不建立桥接。

网页按钮展示读取结果、准备任务回执（无Session ID），以及错误实例、旧代际、重复请求、submit和直发Host的拒绝。无响应的浏览器入口拒绝不冒充服务器成功。准备任务只出现在Host的AI任务面板，包含不可信网页来源；需用户编辑和显式发送，网页不能submit。撤销、关闭、重载或替换模块后旧请求不再可用；已持久准备/发送任务不自动取消、不清历史。源资源撤销按原ResourceDirectory现时权限生效。

请只使用新合成资料，记录实际包版本、consumer/source实例、任务与原生会话归属、没有发模型的准备行为、撤销及重开结果。不得复用历史N1/N3授权或将此页当成考公迁移证据。
