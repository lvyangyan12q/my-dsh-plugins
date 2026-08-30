# my-dsh-plugins

个人 DeepSeek Harness 插件集合。每个插件都是一个独立的 DSH 组合包，统一放在 `plugins/<name>/` 下。

## 当前插件

- [`plugins/kaogong`](plugins/kaogong/)：武汉公务员考试学习套件，包含错题本、倒排学习计划、题库、知识库，以及 Web 学习看板。

## 安装 kaogong

先拉取本仓库：

```sh
git clone https://github.com/lvyangyan12q/my-dsh-plugins.git
```

再把 kaogong 作为独立 bundle 安装到指定 profile：

```sh
dsh plugin --profile web add ./my-dsh-plugins/plugins/kaogong
```

源码启动的 DeepSeek Harness 仓库也可以直接使用：

```sh
pnpm dsh plugin --profile web add ./my-dsh-plugins/plugins/kaogong
```

安装时 `prepare` 会自动构建 Host 与 Web 客户端 bundle。pnpm 10+ 如果提示需要允许构建脚本，请只对
`@deepseek-ai/dsh-tool-kaogong` 开启 `allowBuilds` 后重新执行安装。

安装完成后启动 `dsh web`，侧边栏底部会出现「考公学习」入口。

## 添加其他插件

新增插件时，在 `plugins/` 下创建新的独立目录，并在该目录提供自己的 `package.json`、
`cordis.patch.yml`（如需组合层）和构建产物/`prepare` 脚本。不要把不同插件的源代码、依赖或配置
混在同一个目录。
