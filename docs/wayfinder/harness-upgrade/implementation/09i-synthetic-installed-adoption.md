---
id: harness-rc3-synthetic-installed-adoption
parent: harness-rc3-legacy-adoption
status: in-progress
acceptance_status: pending-real-native-identity-and-installed-run
---

本夹具只生成非敏感数据，供独立3097的真实安装流程使用。它不读取正式资料，不创建、移动或替换原生Session，不预先证明原生身份。原生操作者先在同一个独立Host的原生UI创建未归属应用的旧默认老师会话，确认preset为`personal-workbench.kaogong-teacher.v1`、类型为sequenced，并记录真实Session ID和原工作目录。

在插件源码目录运行（所有路径明确填写；输出目录必须不存在）：

```powershell
node scripts/stage-acceptance-source.mjs --output-root <新绝对目录> --session-id <真实未归属SessionID> --preset-id personal-workbench.kaogong-teacher.v1 --cwd <原生已登记的精确cwd> --native-kind sequenced
```

输出七份旧格式存储、10道已批准的合成资料分析题（标准答案均B）、一份私有讲义、确定性PNG柱图（蓝10、橙20），以及私有回执。错题、练习、课堂和按日进度初始为空。图是新编合成数据，不伪造PDF、MinerU作业或人工核验索引；空材料manifest只用于明确没有原始PDF来源。题图原引用为`bars.png`，通过显式图片根、精确原引用与字节哈希读取；没有改动现有练习安全筛选规则。

独立Host配置只合并下列考公插件字段，保留其他配置及模型：

```yaml
legacySourceHome: <回执sourceHome>
questionImageRoot: <回执questionImageRoot>
mineru:
  outputDir: <回执materialRoot>
roleCwd: <原生已登记的精确cwd>
```

只有操作者确认当前运行结束，才重载该独立Host。原生注册、会话和当前三轮AI验收数据不由此脚本改写。源码中的`legacyRoleSource`仅将确知的旧默认教师preset映射到已有私有能力`teacher`，保留资料分析角色、原Session/preset/cwd/selectedPreset；未知自选preset没有猜测映射，仍由公开Host身份检查阻止。

已认证同源客户端依次POST `/api/kaogong/adoption`：`{action:'prepare',sourceKey:'legacy-default'}`，检查返回摘要；`{action:'export',id}`核对具体私有计划。确认仅是本合成源后，使用它返回的精确`id`、`fingerprint`和`confirmed:true`调用apply。未登录、来源变更、冲突身份和不同指纹均不得绕过。完成后从真实工作台打开历史实例，核对同一个老师会话、私有讲义、原图像素，发起10题并由服务端按B评分；资料库只含题库，讲义仍私有。关闭重开和重启后复核源七份哈希及Session身份。该合成通过不能代替正式旧数据的具体预览和人工确认。

离线CLI可用`preview-legacy-plan.mjs --home <sourceHome> --material-root <materialRoot> --question-image-root <questionImageRoot> --plan <新.private.json> --preview <新.md>`交叉核对业务数量和来源；它始终Native-blocked且没有apply入口。

单元/Host回归验证142项通过，包含夹具schema、10题可发题性、正确答案B、PNG实际蓝橙像素、来源重复写入拒绝、旧默认老师映射及未知preset不猜测。真实原生身份及浏览器安装闭环待操作者提供事实后完成。
