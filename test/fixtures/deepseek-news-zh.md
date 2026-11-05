# DeepSeek V4.1 Flash 新版本：许愿式编程一键成真

***

## 🚀 DeepSeek-V4.1-Flash-1017 来了！

新模型在基准测试中表现更强、任务完成更快、输出更短，在性能与成本上实现了帕累托改进。现已上线官网、App 与 API。

🛠️ 针对 DeepSeek Harness、腾讯 CodeBuddy 与 WorkBuddy 做了优化。升级到 DeepSeek Harness v0.2.1-rc.1 或更高版本，可获得新模型的最佳体验。

![](https://api-docs.deepseek.com/zh-cn/img/v4.1_261017_benchmark_table_cn.png)

![](https://api-docs.deepseek.com/zh-cn/img/v4.1_261017_perf_cost_cn.png)

DeepSeek V4.1 Flash 1017 使用 mini-swe-v2 框架测试的 DeepSWE v1.1 Pass\@1 与单任务成本对比。

***

## 🎮 从零构建完整项目

DeepSeek-V4.1-Flash-1017 通过带自反馈的强化学习，提升了从游戏开发到 3D 建模的端到端项目开发能力。

**示例 1：故宫 3D 建模**

![](https://api-docs.deepseek.com/zh-cn/img/v4.1_261017_case1.gif)

**示例 2：网页版赛车游戏**

![](https://api-docs.deepseek.com/zh-cn/img/v4.1_261017_case2.gif)

***

## 🔍 搜索与抓取 API 全面开放

由自研搜索引擎提供支持，每天稳定处理全球数亿次请求。

每个接口每千次调用 5 元。

```bash
curl https://api.deepseek.com/search \
  -H "Authorization: Bearer $DEEPSEEK_API_KEY" \
  -d '{"query": "deepseek v4"}'
```

***

## 🔓 模型开源

获取 DeepSeek-V4.1-Flash-1017：

Hugging Face：<https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash-1017>

ModelScope：<https://modelscope.cn/models/deepseek-ai/DeepSeek-V4.1-Flash-1017>
