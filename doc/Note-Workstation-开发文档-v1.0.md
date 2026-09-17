# Note Workstation 开发文档

| 项 | 内容 |
|----|------|
| 项目 | 基于 Git / Gitee 的跨平台 Markdown 记事工作站 |
| 版本 | v1.0 |
| 技术栈 | Tauri 2.0 + Vue 3 + TypeScript + Rust |
| 文档更新 | 2026-09-17 |

> **落地执行：** 规格本文只定义「做什么」；按阶段拆解的可执行计划见 [`plans/00-落地总览.md`](./plans/00-落地总览.md)（01–07 阶段文档）。

## 目录

1. [项目概述](#1-项目概述)
2. [技术选型与架构](#2-技术选型与架构)
3. [环境搭建](#3-环境搭建)
4. [项目结构](#4-项目结构)
5. [后端设计（Rust / Tauri）](#5-后端设计rust--tauri)
6. [前端设计（Vue 3）](#6-前端设计vue-3)
7. [核心功能设计](#7-核心功能设计)
8. [桌面特性增强](#8-桌面特性增强)
9. [配置与安全](#9-配置与安全)
10. [构建与发布](#10-构建与发布)
11. [开发规范](#11-开发规范)
12. [测试策略](#12-测试策略)
13. [路线图](#13-路线图)
14. [附录](#14-附录)

---

## 1. 项目概述

### 1.1 项目背景

为个人开发者与知识工作者提供一个 **本地优先、云端同步** 的 Markdown 记事工作站。所有笔记以纯 `.md` 文件存储于本地磁盘，通过 Git 进行版本管理，并可同步至 Gitee 私有仓库。

### 1.2 核心目标

| 目标 | 说明 |
|------|------|
| 本地优先 | 数据存本地，除 Git 仓库外不上传任何服务器 |
| 跨平台 | Windows / macOS / Linux 一致体验 |
| 纯文本 | 所有笔记为标准 Markdown，可被任何编辑器打开 |
| 版本可控 | 集成 Git；v1.0 支持初始化、状态、提交、历史查看、克隆 / 推送 / 拉取；分支切换与回滚为后续版本 |
| 云端同步 | 集成 Gitee，一键推送 / 拉取 / 克隆；支持复制带 Token 的 HTTPS 地址直接使用 |
| 轻量 | 安装包 < 15MB，内存占用 < 200MB |
| 一键使用 | 打包后双击即用，**无需**安装 Node.js / Rust / 数据库；运行时依赖系统 WebView；**推送 / 拉取**另需本机已安装并可调用的 `git` |

### 1.3 目标用户

- 程序员 / 技术写作者
- 需要版本管理笔记的知识工作者
- 希望数据自主可控、拒绝 SaaS 的用户

### 1.4 非目标（明确不做）

- 多人实时协作
- 移动端 App
- 富文本 / 所见即所得（WYSIWYG）
- 自建后端服务器

---

## 2. 技术选型与架构

### 2.1 技术栈

| 层 | 技术 | 版本 | 用途 |
|----|------|------|------|
| 桌面框架 | Tauri | 2.0+ | 跨平台桌面壳 |
| 前端框架 | Vue | 3.4+ | UI 层 |
| 前端语言 | TypeScript | 5.3+ | 类型安全 |
| 状态管理 | Pinia | 2.1+ | 全局状态 |
| 构建工具 | Vite | 5.0+ | 前端构建 |
| Markdown 渲染 | marked | 12.0+ | MD → HTML |
| 代码高亮 | highlight.js | 11.9+ | 代码块着色 |
| HTML 净化 | DOMPurify | 3.0+ | XSS 防护 |
| 后端语言 | Rust | 1.75+ | 原生逻辑 |
| Git 库 | git2-rs | 0.19+ | Git 操作 |
| HTTP 客户端 | reqwest | 0.12+ | Gitee API |
| 异步运行时 | tokio | 1.0+ | 异步支持 |

### 2.2 为什么选 Tauri 而不是 Electron

| 维度 | Tauri | Electron |
|------|-------|----------|
| 安装包 | ~10MB | ~150MB |
| 内存占用 | ~80MB | ~300MB |
| 启动速度 | 快 | 慢 |
| 安全性 | Rust 内核 + 权限白名单 | Node.js 全权限 |
| 学习曲线 | 需懂一点 Rust | 纯 JS |
| 生态成熟度 | 较新 | 非常成熟 |

结论：本项目规模适中，选 Tauri 收益更大。

### 2.3 整体架构图

```text
┌─────────────────────────────────────────────────────┐
│                   桌面窗口 (Tauri Window)             │
│  ┌───────────────────────────────────────────────┐  │
│  │           前端 UI (Vue 3 + TS)                 │  │
│  │  ┌──────────┬──────────────┬──────────────┐   │  │
│  │  │ FileTree │ MD Editor    │ MD Preview   │   │  │
│  │  ├──────────┴──────────────┴──────────────┤   │  │
│  │  │      Git Panel   |   Gitee Panel        │   │  │
│  │  └─────────────────────────────────────────┘   │  │
│  └─────────────────────┬─────────────────────────┘  │
│                        │ Tauri IPC (invoke)          │
│  ┌─────────────────────▼─────────────────────────┐  │
│  │           Rust 后端 (Tauri Commands)           │  │
│  │  ┌──────────┬──────────┬─────────────────┐    │  │
│  │  │ fs_ops   │ git_ops  │ gitee_ops       │    │  │
│  │  └──────────┴──────────┴─────────────────┘    │  │
│  └─────────────────────┬─────────────────────────┘  │
└────────────────────────┼──────────────────────────────┘
                         │
              ┌──────────▼──────────┐
              │   本地磁盘           │
              │  ~/notes/           │
              │   ├── .git/         │
              │   ├── project-a/    │
              │   └── daily/        │
              └──────────┬──────────┘
                         │ git push/pull
              ┌──────────▼──────────┐
              │   Gitee 远程仓库     │
              └─────────────────────┘
```

### 2.4 数据流

```text
用户操作 → Vue 组件 → Pinia store → api/tauri.ts
    → invoke() → Rust command → 文件系统 / Git / Gitee
    → 返回结果 → store 更新 → 组件重渲染
```

---

## 3. 环境搭建

### 3.1 前置依赖

**通用**

- Node.js ≥ 18
- pnpm ≥ 8（推荐）或 npm
- Rust ≥ 1.75（通过 rustup 安装）

**Windows**

- Microsoft Visual Studio C++ Build Tools
- WebView2 Runtime（Win10+ 通常自带）

**macOS**

- Xcode Command Line Tools：`xcode-select --install`

**Linux (Ubuntu / Debian)**

- 需要安装 WebKitGTK、编译工具、SSL 库等基础开发包，具体清单见 Tauri 官方文档对应平台的 Prerequisites 章节。

### 3.2 安装 Rust

通过 rustup 安装，安装后用 `rustc --version` 验证版本 ≥ 1.75。

### 3.3 创建项目

使用 Tauri 官方脚手架，选择 Vue + TypeScript 模板，进入目录后安装前端依赖。

### 3.4 安装项目依赖

**前端依赖**（用于 UI、Markdown 渲染、状态管理、Tauri API 调用）：

- `vue`、`pinia`
- `marked`、`highlight.js`、`dompurify`
- `@tauri-apps/api` 及各官方插件包
- `@types/dompurify`（开发依赖）

**后端依赖**（`src-tauri/Cargo.toml`）：

- `tauri`
- `git2`、`reqwest`、`tokio`、`walkdir`、`thiserror`
- Tauri 官方插件：dialog、fs、store、notification、window-state、single-instance、global-shortcut

### 3.5 启动开发

运行 `pnpm tauri dev`。首次会编译 Rust 依赖，约 3-5 分钟，之后增量编译很快。

### 3.6 一键开发脚本（可选）

可为 Windows 提供 `.bat`、为 macOS / Linux 提供 `.sh` 脚本，内部依次检查 Node.js 与 Rust 是否安装、安装依赖、启动开发服务器，降低新成员上手门槛。

---

## 4. 项目结构

```text
note-workstation/
├── src-tauri/                       # Rust 后端
│   ├── src/
│   │   ├── main.rs                  # 入口
│   │   ├── lib.rs                   # 库入口（Tauri 2.0）
│   │   ├── commands/
│   │   │   ├── mod.rs
│   │   │   ├── fs_ops.rs            # 文件/目录操作
│   │   │   ├── git_ops.rs           # Git 操作
│   │   │   └── gitee_ops.rs         # Gitee API
│   │   ├── config.rs                # 配置读写
│   │   └── error.rs                 # 统一错误类型
│   ├── icons/                       # 应用图标
│   ├── capabilities/
│   │   └── default.json             # 权限配置
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/                             # Vue 前端
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppSidebar.vue
│   │   │   └── AppToolbar.vue
│   │   ├── FileTree.vue
│   │   ├── TreeNode.vue
│   │   ├── MarkdownEditor.vue
│   │   ├── MarkdownPreview.vue
│   │   ├── GitPanel.vue
│   │   ├── GiteePanel.vue
│   │   └── Toast.vue
│   ├── stores/
│   │   ├── workspace.ts             # 工作区状态
│   │   ├── editor.ts                # 编辑器状态
│   │   ├── git.ts                   # Git 状态
│   │   └── settings.ts              # 设置
│   ├── api/
│   │   └── tauri.ts                 # IPC 封装
│   ├── utils/
│   │   ├── markdown.ts              # MD 渲染
│   │   └── debounce.ts
│   ├── types/
│   │   └── index.ts
│   ├── styles/
│   │   ├── global.css
│   │   └── markdown.css
│   ├── App.vue
│   └── main.ts
├── public/
├── index.html
├── package.json
├── pnpm-lock.yaml
├── vite.config.ts
├── tsconfig.json
├── README.md
└── CHANGELOG.md
```

---

## 5. 后端设计（Rust / Tauri）

后端负责所有与操作系统交互的逻辑：文件读写、Git 操作、HTTP 请求。前端不直接触碰本地磁盘，全部通过 Tauri IPC 调用后端命令。

### 5.1 统一错误类型

定义一个序列化的 `AppError` 结构，包含 `code`（错误码）与 `message`（可读信息）两个字段。

为常见的错误来源实现转换：

- `std::io::Error` → `IO_ERROR`
- `git2::Error` → `GIT_ERROR`
- HTTP / 解析错误 → 自定义 code

定义 `AppResult<T> = Result<T, AppError>` 作为所有命令的统一返回类型。前端拿到错误后可根据 `code` 做差异化处理（例如 `NOT_REPO` 时显示「初始化仓库」按钮）。

### 5.2 文件系统模块

#### 5.2.1 数据结构

**FileNode**：表示目录树中的一个节点，字段包括：

- `name` — 文件 / 目录名
- `path` — 绝对路径
- `is_dir` — 是否目录
- `children` — 子节点（仅目录）
- `size` — 文件字节数
- `modified` — 最后修改时间戳

**SearchHit**：搜索结果条目，字段包括 `path`、`line`、`preview`。

#### 5.2.2 命令清单

| 命令 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `scan_workspace` | `root` | `FileNode[]` | 递归扫描目录树 |
| `read_md` | `path` | `string` | 读取文件内容 |
| `write_md` | `path`, `content` | `void` | 原子写入文件 |
| `create_file` | `path` | `void` | 新建空文件 |
| `create_dir` | `path` | `void` | 新建目录（含父级） |
| `delete_path` | `path` | `void` | 删除文件或目录 |
| `rename_path` | `old`, `new` | `void` | 重命名 / 移动 |
| `search_files` | `root`, `keyword` | `SearchHit[]` | 全文搜索 |

#### 5.2.3 设计要点

**扫描规则**

- 只收录 `.md` / `.markdown` / `.txt` 文件与所有目录
- 跳过以 `.` 开头的文件与目录（含 `.git`）
- 排序：目录在前，文件在后，各自按名称升序

**原子写入**

- 写入时先写 `path.tmp`，成功后 rename 到目标路径
- 避免程序崩溃时留下半截文件导致内容损坏
- 若目标路径的父目录不存在，自动创建

**全文搜索**

- 遍历目录，按行匹配关键字（大小写不敏感）
- 命中行取前 120 字符作为预览
- 上限 200 条，防止返回过大阻塞 IPC

**删除策略**

- 默认直接删除。可选进阶：调用系统 API 移入回收站（如 trash crate），降低误删风险

### 5.3 Git 模块

#### 5.3.1 数据结构

- **GitStatus**：`branch`（当前分支）、`ahead` / `behind`（领先 / 落后提交数）、`changes`（变更列表）
- **ChangeItem**：`path`、`status`（中文可读状态）、`staged`（是否已暂存）
- **CommitInfo**：`id`、`short_id`、`message`、`author`、`time`

#### 5.3.2 命令清单

| 命令 | 说明 |
|------|------|
| `git_init` | 在当前工作区初始化仓库 |
| `git_status` | 查询分支与变更 |
| `git_commit` | 暂存全部变更并提交 |
| `git_log` | 拉取最近 N 条提交历史 |
| `git_clone` | 克隆远程仓库到本地目录 |
| `git_push` | 推送到远程 |
| `git_pull` | 从远程拉取（rebase 模式） |
| `git_branches` | 列出本地分支（规划中） |
| `git_checkout` | 切换分支（规划中） |
| `git_discard` | 放弃工作区修改（规划中） |

#### 5.3.3 设计要点

**读操作走 git2-rs**

- 状态查询、提交历史、diff、分支列表等只读操作使用 git2-rs，无需启动外部进程，性能好、无依赖系统 git

**写操作（推 / 拉）走系统 git 命令 + 带 Token 的远程地址**

- git2-rs 对凭证管理支持较弱，特别是 SSH 与 Gitee OAuth
- 推送 / 拉取通过子进程调用系统 `git`，远程 URL 使用 **已嵌入 Token 的 HTTPS 地址**（见 5.4.3），无需再配置 credential helper 即可直接用
- 捕获 stdout / stderr，错误时抛出 stderr 内容供前端展示
- 若用户自行改用 SSH 远程，则仍依赖其本机 SSH 密钥（非 v1.0 主路径）

**提交作者信息**

- 优先读取仓库已有 `user.name` / `user.email`
- 若未配置，使用占位身份（如 `Note User <note@local>`）
- 首次提交时可弹出设置对话框让用户填写

**冲突处理（v1.0 简化）**

- `git pull` 使用 `--rebase` 减少 merge 节点
- 出现冲突时返回明确错误，由用户手动在命令行处理
- v2.0 规划：冲突可视化编辑

### 5.4 Gitee 模块

#### 5.4.1 数据结构

- **GiteeRepo**：`id`、`name`、`full_name`、`html_url`、`ssh_url`、`https_url`、`private`、`description`
- **GiteeUser**：`id`、`login`、`name`、`avatar_url`

#### 5.4.2 命令清单

| 命令 | 说明 |
|------|------|
| `gitee_get_user` | 校验 Token 并获取用户信息 |
| `gitee_list_repos` | 列出当前用户全部仓库（最多 100 个，按更新时间倒序） |
| `gitee_create_repo` | 创建新仓库（可指定私有与描述） |
| `gitee_build_auth_url` | 将普通 HTTPS 地址与 Token 拼成可直接使用的远程地址 |
| `gitee_delete_repo` | 删除仓库（规划中） |
| `gitee_list_branches` | 列出仓库分支（规划中） |

#### 5.4.3 设计要点

**API 版本**

- 统一使用 Gitee OpenAPI v5，Base URL 为 `https://gitee.com/api/v5`

**认证方式**

- 采用 Personal Access Token 方式（在 Gitee 设置中生成）
- Token 通过 query 参数 `access_token` 传递
- 进阶：实现 OAuth2 授权码流程，免去手动粘贴 Token

**HTTP 客户端**

- 使用 reqwest 异步客户端，设置 30 秒超时
- 自定义 User-Agent（如 `Note-Workstation/1.0`），便于服务端统计
- 非 2xx 状态码统一转成 `AUTH` 或 `API` 错误

**带 Token 的 Git 地址（v1.0 主路径：输出即可直接用）**

目标：用户拿到地址后，在本应用或任意 Git 客户端中 `clone` / `push` / `pull` 均可直接使用，无需额外登录或 credential helper。

**地址格式（Gitee HTTPS）**

```text
https://oauth2:<ACCESS_TOKEN>@gitee.com/<owner>/<repo>.git
```

由已保存的 `giteeToken` 与仓库的 `https_url`（去掉原有 `https://` 前缀后拼接）生成。示例：

```text
# 原始
https://gitee.com/alice/notes.git

# 带 Token（可直接用）
https://oauth2:xxxxxxxxxxxxxxxx@gitee.com/alice/notes.git
```

**应用内行为**

| 场景 | 行为 |
|------|------|
| 仓库列表 / 新建仓库成功 | 提供「复制带 Token 的 Git 地址」；一键写入剪贴板 |
| `git_clone` | 使用带 Token 地址执行克隆 |
| 克隆完成后设置 `origin` | 将 **同一带 Token 地址** 写入 `remote.origin.url`，保证后续推拉免再配凭据 |
| `git_push` / `git_pull` | 直接对当前 `origin` 执行；若检测到 origin 为无 Token 的纯 HTTPS，则运行时用 store 中的 Token 临时改写为带 Token 地址再执行（不强制改写用户已有的 SSH remote） |
| Token 更新后 | 可选：一键「刷新 origin 中的 Token」，批量替换已嵌入的旧 Token |

**地址生成**

- 正式命令 `gitee_build_auth_url(https_url, token) -> string`：后端统一生成带 Token 地址，避免前后端格式不一致
- 前端 `GiteePanel` 展示只读地址预览（Token 中间打码，如 `oauth2:xxxx****xxxx@`），完整明文仅进入剪贴板 / 实际 git 调用

### 5.5 应用入口与插件注册

Tauri 2.0 的应用入口负责：

- 注册所有 Tauri 官方插件
- 注册所有 `#[tauri::command]` 后端命令
- 配置单实例逻辑
- 启动应用

**需要注册的插件**

| 插件 | 用途 |
|------|------|
| dialog | 打开系统目录选择 / 文件保存对话框 |
| fs | 前端侧受限文件访问（备用） |
| store | 持久化配置（Token、最近工作区） |
| notification | 系统通知（推送完成、冲突提醒） |
| window-state | 记忆窗口大小与位置 |
| single-instance | 防止多开，二次启动时聚焦主窗口 |
| global-shortcut | 全局快捷键（如 Ctrl+Shift+N 唤起） |

**命令分组**

- 文件系统命令：`scan_workspace`、`read_md`、`write_md`、`create_file`、`create_dir`、`delete_path`、`rename_path`、`search_files`
- Git 命令：`git_init`、`git_status`、`git_commit`、`git_log`、`git_clone`、`git_push`、`git_pull`
- Gitee 命令：`gitee_get_user`、`gitee_list_repos`、`gitee_create_repo`、`gitee_build_auth_url`

---

## 6. 前端设计（Vue 3）

### 6.1 状态管理（Pinia）

前端使用 Pinia 分四个 store，职责清晰隔离。

#### stores/workspace.ts — 工作区

持有：

- `root` — 当前工作区根路径
- `tree` — 目录树数据
- `currentFile` — 当前打开文件路径
- `dirty` — 是否有未保存修改
- 派生属性 `rootName`（路径最后一段）

方法：

- `openWorkspace(path)` — 打开新工作区，刷新树，并将 `lastWorkspace` / `recentWorkspaces` 写入 **tauri-plugin-store**（与设置统一，不用 localStorage 存路径）
- `refresh()` — 重新扫描目录树
- `selectFile(path)` — 切换当前文件，重置 dirty

#### stores/editor.ts — 编辑器

持有：

- `content` — 当前编辑文本
- `mode` — `edit` / `split` / `preview` 三态
- `loading` — 是否正在加载
- `savedAt` — 上次保存时间戳

方法：

- `load(path)` — 从后端读取文件内容
- `save(path)` — 写回后端

#### stores/git.ts — Git

持有：

- `status` — 当前仓库状态（可能为 `null`，表示非仓库）
- `loading`

方法：

- `refresh(root)` — 查询状态
- `commit(root, msg)` — 提交并刷新状态

#### stores/settings.ts — 设置

持有：

- `giteeToken`
- `recentWorkspaces`
- `theme`（`light` / `dark` / `system`）

通过 `tauri-plugin-store` 读写持久化文件。

### 6.2 组件设计

#### 布局层

**App.vue**

- 顶层容器，纵向三段式：工具栏 / 主体 / Toast
- 主体横向三段：侧栏 / 编辑器主区
- 启动时尝试恢复上次工作区

**AppToolbar.vue**

- 左侧：应用标题
- 中间：当前文件路径
- 右侧：打开工作区、保存、设置按钮

**AppSidebar.vue**

- 内部纵向排列：目录树 / Git 面板 / Gitee 面板
- 宽度固定，可折叠

#### 目录树

**FileTree.vue**

- 顶部操作条：根目录名 + 新建文件 / 新建目录
- 下方递归渲染 TreeNode 列表

**TreeNode.vue**

- 单个节点，目录可折叠，文件可点击选中
- 通过 `depth` prop 控制缩进
- 选中态高亮
- 右键菜单：重命名、删除、在系统文件管理器中打开

#### 编辑器

**MarkdownEditor.vue**

- 使用原生 `<textarea>`（v1.0）承载编辑
- v1.5 规划：升级到 CodeMirror 6，支持 Markdown 语法高亮、行号、括号匹配
- 输入防抖 800ms 自动保存
- 支持快捷键：Ctrl/Cmd+S 立即保存、Tab 插入两个空格
- 切换文件时立即保存旧文件再加载新文件

**MarkdownPreview.vue**

- 计算属性监听编辑器内容，调用 `renderMarkdown` 生成 HTML
- 通过 `v-html` 渲染（内容已经过 DOMPurify 净化）
- 支持 GFM 表格、任务列表、代码块高亮

#### Git 面板

**GitPanel.vue**

- 未初始化仓库：显示「初始化仓库」按钮
- 已初始化：显示当前分支、变更列表（带状态色标）、提交信息输入框、提交 / 推送 / 拉取按钮
- 变更状态用颜色区分：未跟踪灰、已修改橙、已暂存绿、已删除红

#### Gitee 面板

**GiteePanel.vue**

- Token 输入框（密码类型）+ 保存按钮
- 「加载我的仓库」按钮，展示仓库列表（含私有标记）
- 每条仓库提供「复制带 Token 的 Git 地址」（依赖已保存 Token；未保存时提示先填写）
- 「新建远程仓库」按钮，弹出输入名称与描述；创建成功后自动生成并可复制带 Token 地址
- 点击仓库条目：选择本地目录 → 用带 Token 地址克隆 → 可选加入工作区

#### 通用

**Toast.vue**

- 顶部浮动提示条，支持 `info` / `success` / `error` 三种类型
- 3 秒后自动消失，可手动关闭
- 通过全局 store 或事件总线触发

### 6.3 API 层

`api/tauri.ts` 统一封装所有 Tauri 命令调用。为每个命令定义：

- 输入参数的 TypeScript 接口
- 返回值的 TypeScript 接口
- 一个薄封装函数，内部 `invoke` 并传递参数

导出的 `api` 对象按模块分组（`fs` / `git` / `gitee`），供 store 与组件调用。

定义在前端共享的类型：`FileNode`、`ChangeItem`、`GitStatus`、`CommitInfo`、`GiteeRepo`、`GiteeUser` 等，与 Rust 侧结构保持字段一致。

**命名约定（已拍板）**：Rust 结构体字段通过 `#[serde(rename_all = "camelCase")]` 序列化为 camelCase，前端类型直接使用 camelCase，不再做二次映射。

### 6.4 工具函数

**utils/markdown.ts**

- 配置 marked：启用 GFM、关闭 breaks（换行即换行）、挂接 highlight.js 做代码高亮
- 导出 `renderMarkdown(src)`：先 `marked.parse` 再 `DOMPurify.sanitize`，防止 XSS

**utils/debounce.ts**

- 通用防抖函数，用于自动保存

---

## 7. 核心功能设计

### 7.1 打开工作区

```text
点击「打开工作区」 → 调用 dialog 插件选择目录
    → workspace.openWorkspace(dir)
    → 后端 scan_workspace 返回目录树
    → 写入 tauri-plugin-store（lastWorkspace / recentWorkspaces）
    → 侧栏渲染
```

### 7.2 编辑与自动保存

```text
选中文件 → editor.load(path) 读取内容 → 渲染到编辑器与预览
    ↓
输入内容 → 更新 editor.content → 预览实时刷新
    ↓
输入停止 800ms → 自动保存 → 后端原子写入
    ↓
切换文件 / Ctrl+S / 关闭窗口 → 立即保存
```

### 7.3 Git 提交流程

```text
进入 Git 面板 → 后端 git_status 展示变更
    ↓
输入提交信息 → 点击「提交」
    ↓
后端 git_commit：暂存全部 → 创建提交对象 → 更新 HEAD
    ↓
前端刷新状态，变更列表清空
```

### 7.4 云端同步流程

**首次接入 Gitee**

```text
设置 Token → gitee_get_user 验证 → 持久化到 store
    ↓
gitee_list_repos 展示仓库
    ↓
（可选）复制「带 Token 的 Git 地址」→ 任意客户端可直接 git clone / 使用
    ↓
或在应用内：选择仓库 → 选择本地目录 → 用带 Token 地址 git_clone
    ↓
origin 保留带 Token 地址 → 克隆完成后可选「加入工作区」
```

**日常同步**

```text
本地编辑提交 → 点击「推送」 → 系统 git push（origin 已含 Token，无需再登录）
    ↓
拉取他人改动 → 点击「拉取」 → 系统 git pull --rebase
```

### 7.5 全文搜索

```text
输入关键字 → 前端调用 search_files
    ↓
后端遍历工作区，逐行匹配
    ↓
返回结果列表（路径 + 行号 + 预览）
    ↓
前端展示，点击跳转到对应文件与行
```

---

## 8. 桌面特性增强

### 8.1 系统托盘

在托盘注册图标与右键菜单，包含「显示主窗口」与「退出」两项。点击菜单项时切换主窗口显示状态或退出应用。

### 8.2 全局快捷键

注册 `Ctrl+Shift+N`（macOS 为 `Cmd+Shift+N`）作为唤起快捷键，按下时显示并聚焦主窗口。适用于应用最小化到托盘后快速唤起。

### 8.3 窗口状态记忆

集成 window-state 插件，自动保存窗口大小与位置，下次启动时恢复。

### 8.4 系统通知

在以下事件发送通知：

- Git 推送完成
- Git 拉取完成
- 检测到冲突
- 自动保存失败

### 8.5 单实例

集成 single-instance 插件，防止用户重复启动造成数据竞争。第二次启动时聚焦已存在的窗口。

### 8.6 深色 / 浅色主题

通过 CSS 变量管理配色，在 settings store 中持久化选择。跟随系统主题变化（`prefers-color-scheme`）。

### 8.7 窗口配置建议

`tauri.conf.json` 中的窗口配置建议：

- 默认尺寸 1280×800
- 最小尺寸 800×500
- 启动居中
- 标题 Note Workstation
- 允许缩放、最大化

---

## 9. 配置与安全

### 9.1 权限配置（capabilities）

Tauri 2.0 采用能力（capabilities）机制控制前端可调用的 API。本项目的 `capabilities/default.json` 只开启必要权限：

| 权限 | 用途 |
|------|------|
| `core:default` | 核心基础能力 |
| `dialog:allow-open` | 打开目录选择对话框 |
| `dialog:allow-save` | 打开保存对话框 |
| `fs:allow-read-text-file` | 读取文本文件（备用） |
| `fs:allow-write-text-file` | 写入文本文件（备用） |
| `notification:default` | 系统通知 |
| `store:default` | 持久化配置 |
| `window-state:default` | 窗口状态记忆 |
| `clipboard:allow-write-text` | 复制带 Token 的 Git 地址到剪贴板 |
| 托盘相关权限 | 系统托盘图标与菜单（按所用 tray 插件声明） |
| `global-shortcut` 相关权限 | 注册全局唤起快捷键 |

遵循「最小权限」原则，不使用 `allow-all`。具体权限标识以所选 Tauri 2 插件文档为准，上表为能力清单而非最终 JSON 原文。

### 9.2 内容安全策略（CSP）

在 `tauri.conf.json` 的 `app.security.csp` 中配置 CSP：

- `default-src 'self'`
- `img-src 'self' data: https:`（允许远程图片）
- `style-src 'self' 'unsafe-inline'`（部分 UI 库需要内联样式）
- `script-src 'self'`

### 9.3 Token 存储方案对比

| 方案 | 安全性 | 复杂度 | 说明 |
|------|--------|--------|------|
| localStorage | 低 | 低 | 明文存储，不推荐 |
| tauri-plugin-store | 中 | 低 | 存于应用数据目录的 JSON 文件 |
| 系统 keyring | 高 | 中 | 调用系统钥匙串 / 凭据管理器 |
| Stronghold | 高 | 高 | 加密保险库，Tauri 官方 |

- v1.0 推荐：`tauri-plugin-store`，同时限制配置文件权限。
- v1.5 规划：升级到系统 keyring。

### 9.4 Markdown 渲染安全

- 所有 HTML 输出必须经过 DOMPurify 净化，防止恶意 Markdown 中的脚本注入
- 禁止 `on*` 事件属性
- 外部链接添加 `rel="noopener noreferrer"`

### 9.5 Git 凭证安全

v1.0 为「复制即可用 / 推拉免配凭据」，采用 **HTTPS URL 内嵌 Token** 方案，安全取舍如下：

| 做法 | 说明 |
|------|------|
| Token 主存储 | 仍在 `tauri-plugin-store`（应用数据目录），勿写入笔记正文 |
| 远程 URL | 允许将 `https://oauth2:<TOKEN>@...` 写入 `.git/config` 的 `origin`，以便任意 Git 客户端直接推拉 |
| 剪贴板 | 「复制带 Token 地址」会暴露完整 Token；提示用户勿粘贴到聊天群、Issue、截图 |
| UI 展示 | 界面内默认打码，完整 Token 仅出现在剪贴板与 git 调用参数中 |
| 仓库权限 | 强烈建议仅用于 **私有** 笔记仓库；不要把带 Token 的 remote 推送到公开地方 |
| 泄漏应对 | Token 泄漏后立即在 Gitee 作废并重新生成；应用提供「刷新 origin Token」 |
| 对比旧方案 | 不再以系统 credential helper 为默认前提；本机未配 Git 凭据也可推拉 |

已知风险：任何能读该仓库 `.git/config` 的人都能看到 Token。接受此风险以换取「输出地址即可直接用」；v1.5 可用 keyring + 运行时注入、不落盘 URL 作为增强选项。

---

## 10. 构建与发布

### 10.1 开发模式

```text
pnpm tauri dev
```

首次编译 Rust 依赖 3-5 分钟，之后增量编译 5-15 秒。

### 10.2 生产打包

```text
pnpm tauri build
```

产物路径：

| 平台 | 产物 |
|------|------|
| Windows | `src-tauri/target/release/bundle/msi/*.msi`、`nsis/*.exe` |
| macOS | `src-tauri/target/release/bundle/dmg/*.dmg`、`macos/*.app` |
| Linux | `src-tauri/target/release/bundle/deb/*.deb`、`appimage/*.AppImage` |

### 10.3 体积优化

在 `Cargo.toml` 的 `[profile.release]` 中：

- `opt-level = "z"` — 优先优化体积
- `lto = true` — 链接时优化
- `codegen-units = 1` — 提升优化强度
- `panic = "abort"` — 去掉 panic 展开代码
- `strip = true` — 去除符号表

前端由 Vite 默认做 tree-shaking 与压缩，无需额外配置。

预计最终安装包：

- Windows `.msi`：约 8-10 MB
- macOS `.dmg`：约 10-12 MB
- Linux `.AppImage`：约 10 MB

### 10.4 图标生成

使用 Tauri 官方命令从一张 1024×1024 PNG 自动生成各平台所需尺寸的图标集。

### 10.5 CI/CD（GitHub Actions 示例思路）

触发条件：推送 `v*` 形式的 tag。

三个平台并行（矩阵策略：ubuntu / windows / macos），每个 job 流程：

1. Checkout 代码
2. 安装 pnpm 与 Node.js
3. 安装 Rust 工具链
4. 安装依赖
5. 调用 `tauri-apps/tauri-action` 完成打包与 Release 上传

### 10.6 用户侧体验

打包产物分发给用户后：

- **Windows**：双击 `.exe` 安装 → 开始菜单 / 桌面快捷方式 → 双击打开
- **macOS**：双击 `.dmg` → 拖入 Applications → 双击图标
- **Linux**：`chmod +x AppImage` → 双击执行；或 `dpkg -i` 安装 `.deb`

用户无需安装 Node.js、Rust、Python、数据库，也无需打开浏览器。仍需：

- 系统自带或可升级的 **WebView**（Windows 为 WebView2）
- 若使用 **推送 / 拉取**：本机 PATH 中可用的 **Git**；仅本地编辑与提交可用 git2-rs，不强制依赖系统 Git

---

## 11. 开发规范

### 11.1 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| Vue 组件 | PascalCase | `FileTree.vue` |
| TypeScript 文件 | kebab-case | `debounce.ts` |
| Rust 文件 | snake_case | `fs_ops.rs` |
| Rust 命令名 | snake_case | `scan_workspace` |
| 常量 | UPPER_SNAKE_CASE | `API_BASE` |
| CSS 类 | kebab-case | `.markdown-body` |

### 11.2 Git 提交规范

使用 Conventional Commits：

| 前缀 | 用途 |
|------|------|
| `feat` | 新功能 |
| `fix` | 修复 bug |
| `docs` | 文档变更 |
| `style` | 格式调整（不影响逻辑） |
| `refactor` | 重构 |
| `test` | 测试 |
| `chore` | 构建 / 依赖等杂项 |
| `perf` | 性能优化 |

示例：`feat(editor): 支持 Tab 键插入空格`

### 11.3 分支策略

| 分支 | 用途 |
|------|------|
| `main` | 稳定发布分支，仅接受 PR 合并 |
| `dev` | 开发主线 |
| `feat/xxx` | 功能分支，从 `dev` 切出 |
| `fix/xxx` | 修复分支 |
| `hotfix/xxx` | 紧急修复，从 `main` 切出 |

### 11.4 代码检查

**前端**

- ESLint + `@typescript-eslint` + `eslint-plugin-vue`
- Prettier 统一格式

**后端**

- `cargo fmt` 统一格式
- `cargo clippy -- -D warnings` 严格检查

### 11.5 提交前检查

建议配置 pre-commit hook：

- 前端：`eslint --fix` + `prettier --write`
- 后端：`cargo fmt` + `cargo clippy`

---

## 12. 测试策略

### 12.1 单元测试

#### Rust 侧

**目标**：`fs_ops`、`git_ops` 中的纯函数与可隔离逻辑。

**工具与环境**

- 使用 `cargo test`
- 使用 `tempfile` crate 创建临时目录，测试结束后自动清理
- 不依赖真实用户主目录或已有仓库

**建议用例**

| 模块 | 用例 | 期望 |
|------|------|------|
| `fs_ops` | 扫描仅含 `.md` / `.txt` 的目录 | 只返回约定扩展名与目录节点 |
| `fs_ops` | 扫描含 `.git` / 点文件 | 隐藏项被跳过 |
| `fs_ops` | `write_md` 原子写入 | 最终文件内容完整，无残留半截 `.tmp` |
| `fs_ops` | `search_files` 大小写不敏感 | 命中正确行号与预览截断（≤120 字符） |
| `fs_ops` | 搜索结果超过 200 条 | 截断至 200，不阻塞 |
| `git_ops` | 临时目录 `git_init` + 写文件 + `git_commit` | `git_status` 无未提交变更 |
| `git_ops` | 非仓库路径调用 `git_status` | 返回 `NOT_REPO` |
| `git_ops` | `git_log` 最近 N 条 | 条数与顺序符合预期 |

**说明**：涉及系统 `git push/pull` 与网络的用例不放在默认单元测试中，见 12.2。

#### 前端侧

**目标**：与 UI 框架弱耦合的纯逻辑。

**工具**：Vitest（与 Vite 同生态）。

**建议用例**

| 模块 | 用例 | 期望 |
|------|------|------|
| `markdown.ts` | 普通 Markdown + 代码块 | 输出含高亮 HTML，且经 DOMPurify |
| `markdown.ts` | 含 `<script>` / `onerror=` 的恶意内容 | 净化后无脚本与事件属性 |
| `debounce.ts` | 短时间多次触发 | 仅最后一次在延迟后执行 |
| store（可选） | `editor` 加载/保存状态机 | `loading` / `savedAt` / `dirty` 迁移正确 |

组件级快照测试 v1.0 非必须，优先保证工具函数与关键 store 逻辑。

### 12.2 集成测试

**目标**：验证 Tauri 命令在真实临时工作区上的端到端后端链路（可不启动完整窗口）。

**范围**

```text
临时目录 → scan_workspace → write_md / read_md
         → git_init → 修改文件 → git_commit → git_status / git_log
```

**Gitee 相关**

- 默认跳过（需 Token 与网络）
- 提供可选的 `#[ignore]` 或环境变量开关（如 `GITEE_TOKEN`）手动跑：`gitee_get_user`、`gitee_list_repos`
- CI 默认不跑需密钥的集成用例，避免密钥泄漏与不稳定失败

**断言要点**

- 错误类型统一为 `AppError`，`code` 稳定可解析
- 路径分隔在 Windows / Unix 下行为一致（测试中用 `PathBuf`，断言时规范化）

### 12.3 E2E / 手工验收清单

v1.0 以 **手工验收清单** 为主；完整 UI 自动化（如 Playwright + Tauri WebDriver）列为后续。

| 编号 | 场景 | 通过标准 |
|------|------|----------|
| H01 | 打开工作区 | 目录树正确展示，隐藏 `.git` |
| H02 | 新建文件 / 目录 | 树刷新后可见，空文件可打开 |
| H03 | 编辑 + 800ms 自动保存 | 磁盘内容与编辑器一致，`dirty` 清除 |
| H04 | Ctrl/Cmd+S 立即保存 | 立即落盘 |
| H05 | 切换文件 | 先保存旧文件再加载新文件 |
| H06 | 预览模式 | GFM 表格、任务列表、代码高亮正常 |
| H07 | 全文搜索 | 结果可点击跳转文件（行号尽力对齐） |
| H08 | Git 初始化与提交 | 变更列表清空，log 可见新提交；可粘贴带 Token 完整地址设为 origin / 克隆 |
| H09 | Git 推送 / 拉取 | 成功发系统通知；冲突时明确报错 |
| H10 | Gitee Token 与带 Token 地址 | 校验成功后可列仓库；可复制带 Token 地址；用该地址克隆后无需再配凭据即可 push/pull |
| H11 | 托盘与全局快捷键 | 隐藏后可唤起，退出干净 |
| H12 | 单实例 | 二次启动聚焦已有窗口 |
| H13 | 主题切换 | 亮/暗持久化，重启后保持 |
| H14 | 窗口状态 | 关闭后再开，尺寸与位置恢复 |

发布前在 Windows 必测；macOS / Linux 至少各跑一轮核心项（H01–H10）。

### 12.4 性能与体积门槛

| 指标 | v1.0 门槛 | 验证方式 |
|------|-----------|----------|
| 安装包体积 | < 15MB | `tauri build` 产物实测 |
| 空闲内存 | < 200MB | 打开中等笔记库后任务管理器观察 |
| 目录扫描 | 千级文件可接受延迟 | 本地样例库计时，无明显卡死 |
| 全文搜索 | ≤200 条返回 | 大关键字场景验证截断 |
| 启动到可交互 | 尽量 < 3s（冷启动视机器而定） | 手工体感 + 可选日志打点 |

不达标时优先：release profile 体积优化、扫描懒加载/按需展开、搜索提前终止。

### 12.5 v1.0 明确不做的测试

- 全量 UI 自动化回归套件
- 全平台矩阵每日必过（仅发版前抽样）
- 真实多用户并发写同一仓库的压力测试（非目标场景）
- 对 Gitee 服务端可用性的 SLA 监控

---

## 13. 路线图

### 13.1 版本总览

| 版本 | 主题 | 状态 |
|------|------|------|
| v1.0 | 本地 Markdown + Git 基础 + Gitee 同步 + 桌面增强 | 当前目标 |
| v1.5 | 编辑体验与安全加固 | 规划 |
| v2.0 | 分支/冲突深度能力与 OAuth | 规划 |

### 13.2 v1.0（当前）

**必须交付**

- 工作区打开 / 目录树 / 读写与原子保存
- 原生 textarea 编辑 + 分栏预览 + DOMPurify
- Git：init / status / commit / log / clone / push / pull（rebase）；**不含**分支切换与丢弃修改（见 v2.0）
- Gitee：Token 校验、列仓库、建仓库、`gitee_build_auth_url`、复制带 Token 地址、用该地址克隆且 origin 可直接推拉
- 运行时说明：WebView 必需；系统 Git 仅推拉需要
- 全文搜索（上限 200）
- 托盘、全局唤起快捷键、窗口状态、单实例、通知、亮暗主题
- 安装包体积与内存门槛（见 1.2 / 12.4）

**明确不做（见 1.4）**

- 实时协作、移动端、WYSIWYG、自建后端

### 13.3 v1.5

| 项 | 说明 |
|----|------|
| CodeMirror 6 | Markdown 语法高亮、行号、括号匹配，替换 textarea |
| 系统 keyring | Token 从 plugin-store 迁移到系统凭据库 |
| 回收站删除 | 误删可恢复（trash API） |
| 冲突提示增强 | 拉取冲突时更清晰的引导文案与「打开所在目录」 |
| 搜索跳转行 | 打开文件后尽量滚动到命中行 |
| 基础自动化 | 关键 Vitest + 部分 Rust 集成测试纳入 CI |

### 13.4 v2.0

| 项 | 说明 |
|----|------|
| `git_branches` / `git_checkout` | 本地分支列表与切换 |
| `git_discard` | 放弃工作区修改 |
| 冲突可视化 | 应用内展示冲突文件并辅助解决 |
| Gitee OAuth2 | 减少手动粘贴 Token |
| `gitee_delete_repo` / `gitee_list_branches` | 远程管理补齐 |
| 可选 diff 视图 | 提交前查看变更内容 |

### 13.5 长期备选（不承诺）

- 插件化导出（PDF / HTML）
- 多工作区快速切换 UI
- 笔记内链 / 反向链接（仍保持纯 Markdown 文件）

不进入路线图：多人实时协作、移动端 App、富文本所见即所得、强制云端账号体系。

---

## 14. 附录

### 附录 A. 错误码表

前端应根据 `code` 做差异化 UI，`message` 仅作展示。

| code | 含义 | 典型前端处理 |
|------|------|----------------|
| `IO_ERROR` | 文件系统读写失败 | Toast 错误；检查路径权限 |
| `NOT_FOUND` | 路径不存在 | 刷新目录树；提示文件已删除 |
| `NOT_REPO` | 当前目录不是 Git 仓库 | 显示「初始化仓库」 |
| `GIT_ERROR` | git2 或 git 子进程失败 | 展示 stderr / message |
| `GIT_CONFLICT` | pull rebase 冲突 | 通知 + 引导命令行处理（v1.0） |
| `AUTH` | Gitee Token 无效或过期 | 引导重新填写 Token |
| `API_ERROR` | Gitee HTTP 非预期响应 | Toast + 保留原始信息摘要 |
| `TIMEOUT` | 网络或操作超时 | 提示重试 |
| `CANCELLED` | 用户取消对话框等 | 静默或轻提示 |
| `INVALID_ARGUMENT` | 参数非法（空路径、空提交信息等） | 表单校验提示 |
| `INTERNAL` | 未归类内部错误 | 通用错误 Toast |

序列化字段约定：`{ "code": "NOT_REPO", "message": "..." }`。

### 附录 B. 快捷键一览

| 快捷键 | 平台 | 作用 |
|--------|------|------|
| `Ctrl+S` / `Cmd+S` | Win/Linux / macOS | 立即保存当前文件 |
| `Tab` | 全平台 | 编辑器中插入两个空格 |
| `Ctrl+Shift+N` / `Cmd+Shift+N` | Win/Linux / macOS | 全局唤起主窗口 |

应用内其它操作（打开工作区、提交、推送等）v1.0 以按钮为主，快捷键可在后续版本扩展。

### 附录 C. 配置项与默认值

| 配置项 | 存储位置 | 默认值 | 说明 |
|--------|----------|--------|------|
| `giteeToken` | tauri-plugin-store | 空 | Personal Access Token |
| `recentWorkspaces` | tauri-plugin-store | `[]` | 最近打开的工作区路径列表 |
| `lastWorkspace` | tauri-plugin-store | 空 | 启动时尝试恢复 |
| `theme` | tauri-plugin-store | `system` | `light` / `dark` / `system` |
| 窗口几何 | window-state 插件 | 1280×800 居中 | 自动记忆 |
| 自动保存延迟 | 代码常量 | 800ms | 输入停止后写入 |
| 搜索结果上限 | 后端常量 | 200 | 防止 IPC 过大 |
| 预览截断 | 后端常量 | 120 字符 | 搜索命中行预览 |
| Gitee API Base | 后端常量 | `https://gitee.com/api/v5` | OpenAPI v5 |
| 带 Token 远程格式 | 后端/工具函数 | `https://oauth2:<TOKEN>@gitee.com/<owner>/<repo>.git` | 复制与 clone/push/pull 主路径 |
| HTTP 超时 | 后端常量 | 30s | reqwest |
| 占位 Git 作者 | 后端常量 | `Note User <note@local>` | 仓库未配置 user 时 |

应用数据目录由 Tauri / 操作系统决定（Windows 多为 `%APPDATA%\<identifier>\`），Token 文件权限应尽量限制为当前用户可读。

### 附录 D. 常见问题（FAQ）

**Q1：是否必须安装系统 Git？**  
A：只读状态、本地提交可用 git2-rs。推送 / 拉取仍调用系统 `git`，故建议安装 Git。v1.0 **不要求**再配置 credential helper：使用「带 Token 的 HTTPS 地址」即可直接推拉。

**Q2：Token 存在哪里？安全吗？**  
A：主副本在 `tauri-plugin-store`；克隆后还可能出现在 `.git/config` 的 `origin` URL 中。不要把带 Token 的地址发到公开场合；泄漏后立即到 Gitee 作废 Token。v1.5 可增强为 keyring + 运行时注入。

**Q2.1：带 Token 的地址长什么样？能直接用吗？**  
A：格式为 `https://oauth2:<你的Token>@gitee.com/<用户名>/<仓库>.git`。复制后可直接 `git clone` / 设为 remote，推拉无需再输密码。

**Q3：为什么 pull 用 rebase？**  
A：减少无意义的 merge 提交，历史更线性。冲突时 v1.0 返回明确错误，需在命令行解决。

**Q4：可以把笔记目录放到网盘同步盘吗？**  
A：不推荐与 Git 同时使用另一套文件同步（易冲突）。优先「本地目录 + Git/Gitee」。

**Q5：支持除 Gitee 外的 GitHub / GitLab 吗？**  
A：v1.0 面板与 API 面向 Gitee。通用 `git clone/push/pull` 对任意远程可用，但无对应托管平台 UI。

**Q6：安装包为什么能这么小？**  
A：Tauri 使用系统 WebView，不捆绑 Chromium；再配合 Rust release 体积优化。

**Q7：误删文件能恢复吗？**  
A：v1.0 默认直接删除；若已提交 Git，可通过历史恢复。v1.5 规划系统回收站。

**Q8：多开两个窗口编辑同一仓库？**  
A：单实例插件禁止多开，避免写冲突与索引损坏。

### 附录 E. 参考链接

| 资源 | URL |
|------|-----|
| Tauri 2 文档 | https://v2.tauri.app/ |
| Tauri Prerequisites | https://v2.tauri.app/start/prerequisites/ |
| Gitee OpenAPI v5 | https://gitee.com/api/v5/swagger |
| Conventional Commits | https://www.conventionalcommits.org/ |
| git2 crate | https://docs.rs/git2/ |
| marked | https://marked.js.org/ |
| DOMPurify | https://github.com/cure53/DOMPurify |

### 附录 F. 文档修订记录

| 日期 | 版本 | 说明 |
|------|------|------|
| 2026-09-17 | v1.0 | 初稿：完成第 1–14 章（含测试策略、路线图、附录） |
| 2026-09-17 | v1.0 | 修订：带 Token 的 Git HTTPS 地址可复制并直接用于 clone/push/pull；origin 可保留该地址 |
| 2026-09-17 | v1.0 | 修订：纠正目标与实现范围矛盾；明确系统 Git/WebView 依赖；统一 store 持久化与 serde camelCase；补齐 auth URL 命令与 capabilities |
| 2026-09-17 | v1.0 | 拆解落地计划：`doc/plans/00`–`07`（脚手架→打包） |

---

*本文档为本地开发参考，默认不纳入版本库提交（除非项目明确要求）。*
