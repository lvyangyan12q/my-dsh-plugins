# 考公插件（kaogong）部署手册

> 本文档指导你从零开始部署 DeepSeek Harness（DSH），并安装考公学习插件（kaogong），最终启动带 Web 看板的完整学习环境。

---

## 目录

1. [环境准备](#1-环境准备)
2. [部署 DeepSeek Harness](#2-部署-deepseek-harness)
3. [安装考公插件](#3-安装考公插件)
4. [配置与启动](#4-配置与启动)
5. [验证安装](#5-验证安装)
6. [常见问题](#6-常见问题)
7. [附录：目录结构参考](#7-附录目录结构参考)

---

## 1. 环境准备

### 1.1 系统要求

| 项目 | 要求 |
|------|------|
| 操作系统 | Windows 10/11、macOS、Linux |
| Node.js | `^22.19.0 \|\| >=24.0.0`（推荐 v24+） |
| 包管理器 | pnpm `11.7.0`（DSH 指定版本） |
| Git | 用于克隆仓库 |
| 内存 | 建议 8GB+（构建时需要） |

### 1.2 安装 Node.js

**Windows（使用 fnm 或 nvm-windows）：**

```powershell
# 使用 fnm（推荐）
fnm install 24
fnm use 24

# 验证
node --version  # 应显示 v24.x.x
```

**macOS/Linux：**

```bash
# 使用 fnm
curl -fsSL https://fnm.vercel.app/install | bash
fnm install 24
fnm use 24

# 或使用 nvm
nvm install 24
nvm use 24
```

### 1.3 安装 pnpm

```bash
npm install -g pnpm@11.7.0

# 验证
pnpm --version  # 应显示 11.7.0
```

> ⚠️ **注意**：DSH 使用 pnpm workspace，必须使用指定版本的 pnpm，否则可能出现依赖解析问题。

---

## 2. 部署 DeepSeek Harness

### 2.1 克隆仓库

```bash
# 选择你的工作目录
cd D:\programming\workspace

# 克隆 DSH 主仓库
git clone https://github.com/deepseek-ai/deepseek-harness.git

# 进入仓库
cd deepseek-harness
```

### 2.2 安装依赖

```bash
# 安装所有依赖（包括 workspace 内的包）
pnpm install
```

> 这一步会安装 200+ 个包，耗时约 2-5 分钟，取决于网络速度。

### 2.3 构建 DSH

```bash
# 构建所有包（host + client）
pnpm run build
```

> 构建过程需要约 4GB 内存，耗时 5-10 分钟。构建产物位于各包的 `lib/` 目录。

### 2.4 验证 DSH 基础运行

```bash
# 启动 Web UI（默认端口 3080）
pnpm dsh web
```

访问 http://127.0.0.1:3080，应能看到 DSH 的 Web 界面。

按 `Ctrl+C` 停止服务。

---

## 3. 安装考公插件

考公插件（`@deepseek-ai/dsh-tool-kaogong`）是一个 DSH 插件，提供错题本、学习计划、专项训练等功能。

### 3.1 获取插件源码

```bash
# 在 DSH 同级目录克隆插件仓库
cd D:\programming\workspace
git clone https://github.com/lvyangyan12q/my-dsh-plugins.git
```

> 插件位于 `my-dsh-plugins/plugins/kaogong/` 目录。

### 3.2 安装方式一：使用 DSH 插件命令（推荐）

DSH 提供了 `dsh plugin` 命令来管理插件：

```bash
# 进入 DSH 目录
cd D:\programming\workspace\deepseek-harness

# 添加插件（从本地路径）
pnpm dsh plugin --profile web add ./my-dsh-plugins/plugins/kaogong
```

安装过程会自动：
- 执行 `pnpm install` 安装插件依赖
- 执行 `prepare` 脚本构建 host/client bundle
- 将 `cordis.patch.yml` 合并到 profile 配置

### 3.3 安装方式二：使用一键安装脚本

插件自带安装脚本，适合开发调试：

```bash
# 进入插件目录
cd D:\programming\workspace\my-dsh-plugins\plugins\kaogong

# 一键接入 DSH（dry-run 先预览）
node scripts/install.mjs --dsh ../../deepseek-harness --dry-run

# 正式安装
node scripts/install.mjs --dsh ../../deepseek-harness
```

脚本会：
1. 拷贝 `src/`, `roles/`, `data/` 等目录到 `<dsh>/kaogong/`
2. 生成 `kaogong.cordis.yml`（存储栈 + 插件配置）
3. 建立 zod 依赖的 junction 链接

### 3.4 安装方式三：手动接入（理解原理）

如果你想完全理解配置，可以手动操作：

#### 步骤 1：拷贝插件到 DSH 仓库

```bash
cp -r my-dsh-plugins/plugins/kaogong deepseek-harness/kaogong
```

#### 步骤 2：修改 DSH 的 `cordis.yml`

在 DSH 的配置文件（如 `profiles/web/cordis.yml` 或 `~/.dsh/cordis.yml`）中追加：

```yaml
# ===== 存储栈（错题本/计划数据持久化） =====
- id: storage
  name: '@deepseek-ai/dsh-storage'

- id: storage-json
  name: '@deepseek-ai/dsh-storage-json'
  config:
    root: './.kaogong/storage'

- id: storage-domain
  name: '@deepseek-ai/dsh-storage-domain'
  config:
    backend: 'json'

# ===== 考公插件 =====
- id: kaogong
  name: './kaogong/src/index.ts'  # 源码方式（开发）
  # name: '@deepseek-ai/dsh-tool-kaogong'  # 构建后（生产）
  config:
    topN: 8  # 总结时返回的薄弱考点数量
```

#### 步骤 3：构建插件

```bash
cd deepseek-harness/kaogong

# 构建 host（服务端）
pnpm exec tsdown -c tsdown.host.config.ts

# 构建 client（Web 看板）
pnpm exec tsdown -c tsdown.config.ts
```

---

## 4. 配置与启动

### 4.1 角色层配置（可选但推荐）

角色层提供「班主任 + 老师/辅导员」的多 agent 协作体验。

将 `kaogong/roles/cordis.yml` 的内容追加到你的 `cordis.yml`：

```yaml
# ===== 子代理委派 =====
- id: subagent
  name: '@deepseek-ai/dsh-subagent'

- id: subagent-spawn-in-process
  name: '@deepseek-ai/dsh-subagent-spawn-in-process'
  config:
    providerName: spawn

- id: tool-subagent
  name: '@deepseek-ai/dsh-tool-subagent'
  config:
    provider: spawn
    toolName: subagent
    backgroundMode: continuable

# ===== 主 Agent：班主任 =====
- id: agent-spine
  name: '@deepseek-ai/dsh-agent-spine-demo'
  config:
    agents:
      - id: head
        provider: deepseek-official
        model: deepseek-v4-flash
        cwd: !!js process.cwd()
    workspaceContext:
      maxBytes: 65536
    persona: |
      # 班主任（备考协调者）
      你是武汉市公务员考试备考的班主任...
      # （完整内容见 kaogong/roles/cordis.yml）
```

### 4.2 配置 LLM 凭据

确保你的 `cordis.yml` 已配置 LLM 凭据：

```yaml
- id: credentials
  name: '@deepseek-ai/dsh-credentials'
  config:
    providers:
      - name: deepseek-official
        apiKey: ${DEEPSEEK_API_KEY}
        baseURL: https://api.deepseek.com
```

或通过环境变量：

```bash
# Windows PowerShell
$env:DEEPSEEK_API_KEY = "your-api-key-here"

# Linux/macOS
export DEEPSEEK_API_KEY="your-api-key-here"
```

### 4.3 启动 DSH Web

```bash
cd D:\programming\workspace\deepseek-harness

# 启动 Web UI（带考公插件）
pnpm dsh web
```

访问 http://127.0.0.1:3080

### 4.4 验证 Web 看板

启动后，在 Web 界面侧边栏底部应出现 **「考公学习」** 入口：

- 考试倒计时
- 今日计划（可勾选打卡）
- 计划完成率
- 做题正确率
- 薄弱考点
- 最近收录的讲义/笔记

---

## 5. 验证安装

### 5.1 工具可用性检查

在 DSH 聊天界面输入：

```
帮我设置一个学习计划，2027年3月考试，每天学2个模块
```

Agent 应调用 `kaogong_plan_set` 生成计划。

### 5.2 数据持久化验证

1. 记录一道错题：
   ```
   记录一道错题：我选C但答案是B，片段阅读题...
   ```

2. 重启 DSH 服务

3. 查询：
   ```
   我最近有哪些错题？
   ```

应能显示之前记录的数据（存储在 `.kaogong/storage/`）。

### 5.3 角色层验证（如配置了角色层）

```
我今天学什么？
```

班主任应返回今日计划，并能委派老师/辅导员 subagent。

---

## 6. 常见问题

### Q1: `pnpm install` 失败，提示引擎不匹配

**解决**：确保 Node.js 版本符合 `^22.19.0 || >=24.0.0`：

```bash
node --version
# 如果不符合，升级 Node.js
```

### Q2: 构建时内存不足（JavaScript heap out of memory）

**解决**：增加 Node.js 内存限制：

```bash
# Windows
$env:NODE_OPTIONS="--max-old-space-size=4096"

# Linux/macOS
export NODE_OPTIONS="--max-old-space-size=4096"
```

### Q3: 插件工具不显示

**排查步骤**：
1. 检查 `cordis.yml` 中存储栈三件套是否齐全：`storage`、`storage-json`、`storage-domain`
2. 检查 `storage-domain` 的 `backend` 是否与 `storage-json` 匹配
3. 查看 DSH 启动日志，确认 `kaogong` 插件已加载

### Q4: Web 看板不出现

**排查步骤**：
1. 确认已构建 client bundle：`pnpm exec tsdown -c tsdown.config.ts`
2. 检查 `package.json` 的 `dsh.client.inject` 是否包含 sidebar/workspace
3. 重启 `pnpm dsh web`

### Q5: zod 依赖找不到

**解决**：运行安装脚本时会自动建立 junction，或手动：

```bash
cd deepseek-harness/kaogong
mkdir node_modules
# Windows: 建立 junction
cmd /c mklink /J node_modules\zod ..\..\node_modules\.pnpm\zod@4.x.x\node_modules\zod
```

### Q6: 数据存在哪里？

默认使用 JSON 存储，位置：

```
deepseek-harness/.kaogong/storage/
  ├── kaogong_notebook/      # 错题本
  ├── kaogong_progress/      # 学习计划
  ├── kaogong_bank/          # 题库
  └── kaogong_knowledge/     # 知识库
```

可改用 SQLite：将 `storage-json` 替换为 `storage-sqlite`。

---

## 7. 附录：目录结构参考

### 部署后完整目录结构

```
D:\programming\workspace\
├── deepseek-harness/              # DSH 主仓库
│   ├── apps/
│   │   ├── cli/                   # 命令行入口
│   │   └── web/                   # Web 应用
│   ├── packages/                  # 核心包（200+）
│   │   ├── core/
│   │   ├── host/
│   │   ├── client/
│   │   ├── storage/
│   │   └── ...
│   ├── vendor/                    # 第三方依赖
│   ├── profiles/                  # 配置文件
│   │   └── web/
│   │       └── cordis.yml         # Web profile 配置
│   ├── kaogong/                   # 考公插件（安装后）
│   │   ├── src/
│   │   │   ├── index.ts           # 插件入口（18个工具）
│   │   │   ├── client.tsx         # Web 看板组件
│   │   │   ├── domain.ts          # 存储域定义
│   │   │   ├── analyze.ts         # 错题分析
│   │   │   ├── schedule.ts        # 倒排计划
│   │   │   ├── practice.ts        # 专项训练
│   │   │   ├── knowledge.ts       # 知识库
│   │   │   └── taxonomy.ts        # 考点大纲
│   │   ├── roles/                 # 角色层配置
│   │   │   ├── cordis.yml         # 班主任+子代理
│   │   │   └── personas/          # 人设文件
│   │   ├── data/                  # 示例数据
│   │   ├── lib/                   # 构建产物
│   │   ├── cordis.patch.yml       # 自动合并的配置片段
│   │   └── package.json
│   ├── .kaogong/                  # 运行时数据（自动创建）
│   │   └── storage/               # JSON/SQLite 存储
│   ├── package.json
│   └── pnpm-workspace.yaml
│
└── my-dsh-plugins/                # 插件源码仓库（可选）
    └── plugins/
        └── kaogong/
```

### 关键配置文件

| 文件 | 作用 |
|------|------|
| `deepseek-harness/package.json` | DSH 根配置，定义 workspace |
| `deepseek-harness/profiles/web/cordis.yml` | Web 启动配置 |
| `kaogong/package.json` | 插件配置，定义构建脚本 |
| `kaogong/cordis.patch.yml` | 插件自动注入的配置 |
| `kaogong/cordis.example.yml` | 完整配置示例（手动安装用） |
| `kaogong/roles/cordis.yml` | 角色层配置 |

---

## 快速命令速查

```bash
# 1. 启动 DSH Web（带考公插件）
cd deepseek-harness && pnpm dsh web

# 2. 重新构建插件（修改源码后）
cd deepseek-harness/kaogong
pnpm exec tsdown -c tsdown.host.config.ts
pnpm exec tsdown -c tsdown.config.ts

# 3. 查看存储数据
cat deepseek-harness/.kaogong/storage/kaogong_notebook/questions.json

# 4. 运行插件测试（无需 DSH）
cd deepseek-harness/kaogong
node scripts/demo.ts

# 5. 清理重建
rm -rf deepseek-harness/kaogong/lib
pnpm run build
```

---

> **文档版本**：v1.0  
> **适用插件版本**：kaogong ≥ 0.1.0  
> **适用 DSH 版本**：≥ 0.1.2-alpha.1
