# 08 安装验收文档图 503 的路径复原

父层实际资料分析练习发现六张 document-image 图片破损，认证 fetch 返回 503。路由代码在读取文件之前检查 `mineru.outputDir` 必须为绝对路径；未配置返回 503，已配置但文件不存在才返回 404。只读实际 owned profile patch 确认 KG 仅配置 roleCwd/questionImageRoot，没有 mineru.outputDir。两受影响 document IDs 在归位原 MinerU 资料根的 150 个引用资产全部存在，因此当前确证原因是隔离历史数据回放配置缺口，未证明产品 resolver 错误，不以产品代码改动掩盖。

安全恢复只操作自有独立验收 root。读取保留的 bank/knowledge 真实 document-image 引用，逐项校验 document ID、相对路径及原资料 realpath 留在固定根内，将 3097 张已引用图片（38,748,972 bytes）复制到新建 owned 绝对 document-results 目录，逐项 SHA256 对照成功。未复制原 PDF、ZIP、密钥；未改原资料或银行记录。准备完成后再次确认当前 live patch 未被其他更新替换，再用 YAML 文档只补 KG mineru.outputDir；与当前 patch 其余配置语义完全一致，凭证文件 SHA256 不变。不使用旧 pre-model baseline 恢复，不重启验收 Host。新解析任务若发生只会写 owned 资料根，原资料根保持只读。

私有恢复 helper/资产 manifest/配置备份仅保留本地，不提交真实资料或题目引用。一次未提权裸 Node localhost读取被 sandbox EACCES 拒绝；授权只读重试得到 401 Image access denied，因为没有浏览器 session。未绕过连接授权。公开认证 Browser 六图恢复验收由父层继续，本证据不声称已经自然加载成功。

后续安装历史业务库必须同时设置持久资料读根。四张业务表不是资料完整性的全部；保留 document IDs 和 assets 相对路径才能保持原有引用。新资料根无需自动重新导入或重写题库，也无需重新上传原 PDF。

父层随后在实际认证安装 Browser 中验证原六张 document-image 均返回 200、content-type image/jpeg，逐项 lazy scroll 后自然宽度为 776、670、479、734、728、742，全部真实加载完成。刷新后保留未提交真实练习轮。该公开 Browser 证据只覆盖本次六张；3097 的证据仍仅为复制及逐项 SHA256，不宣称全部 HTTP/视觉验收。之前“Browser 尚待”的记录是恢复当时状态，本段补齐本次六图验收。历史 873 中其余 872 条仍未完整题面恢复且保持 pending，不因六图恢复而标完成。
