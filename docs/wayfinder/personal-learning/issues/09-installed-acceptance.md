# 09: 安装包完整验收

**What to build:** 用实际安装包在当前 DSH `0.2.2-rc.1` 上走完整循环：安装、启用、打开空间、预测、调参、复述、记下、刷新与重启恢复，并覆盖桌面与窄屏、键盘操作。

**Blocked by:** 06 /teach 生成适配；07 配置收纳与追问入口；08 参数与位置恢复

**Status:** complete

- [x] 官方离线安装与激活成功，回执记录精确哈希与宿主版本（`97bd5281…`）。
- [x] 一波真实 `/teach` 生成的课进入实验台并完成一轮预测、调参与复述。
- [x] 刷新页面与重启宿主后，同一节、同一组参数、同一份证据仍在（重启后恢复 B=55，证据在存储中）。
- [x] 桌面 1440 与窄屏 390 各一轮，无横向滚动、无控件遮挡；键盘可完成预测与复述。
- [x] 无协议旧课显示只读说明，且不阻塞其他课程。
- [x] 证据文档写明真实与替身边界、未覆盖项（`evidence/lab-browser-acceptance.json`、`evidence/real-generation-receipt.json`）。

## Evidence

隔离 `DSH_HOME` + 官方离线安装 + 真实宿主 UI：预测门控、解锁、复述、记下、390px 无横向溢出、
键盘完成预测与复述、旧课只读、重启恢复参数、真实模型生成课入实验台并解锁，均已实际验证。
截图 `accept-locked.png`、`accept-lab-1440.png`、`accept-lab-390.png`、`accept-keyboard.png`、
`accept-legacy.png`、`accept-generated-locked.png`、`accept-generated.png`。
