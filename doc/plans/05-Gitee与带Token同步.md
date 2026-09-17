# Phase 05: Gitee 与带 Token 同步

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Token 校验与持久化；列仓/建仓；**复制带 Token 的 HTTPS 地址即可直接用**；应用内 clone，且 origin 保留该地址后 push/pull 可用。

**Architecture:** Gitee OpenAPI v5（`access_token` query）走 reqwest；`gitee_build_auth_url` 统一拼 URL；clone/push/pull 调系统 `git` 子进程。

**Tech Stack:** reqwest · tokio · clipboard 插件 · 系统 git

## Global Constraints

见 [`00-落地总览.md`](./00-落地总览.md)。依赖阶段 04。  
地址格式：`https://oauth2:<TOKEN>@gitee.com/<owner>/<repo>.git`

---

### Task 1: `gitee_build_auth_url`（纯逻辑优先）

**Files:**
- Modify: `src-tauri/src/commands/gitee_ops.rs`
- Modify: `src/api/tauri.ts`
- Modify: capabilities（`clipboard:allow-write-text`）

**Interfaces:**

```rust
#[tauri::command]
pub fn gitee_build_auth_url(https_url: String, token: String) -> AppResult<String>
```

规则：

1. `token` / `https_url` 空 → `INVALID_ARGUMENT`
2. 输入 `https://gitee.com/a/b.git` → `https://oauth2:{token}@gitee.com/a/b.git`
3. 若已含 `@gitee.com` 用户信息，先剥离再嵌入新 token（便于刷新）

- [ ] **Step 1: 单元测试覆盖上述 3 条**

- [ ] **Step 2: 实现并 PASS**

---

### Task 2: Gitee HTTP API

**Files:**
- Modify: `src-tauri/Cargo.toml`（`reqwest` features：`json`、`rustls-tls` 或 `native-tls`；`tokio`）
- Modify: `src-tauri/src/commands/gitee_ops.rs`
- Modify: `src/types/index.ts`

**Interfaces:**

```rust
const API_BASE: &str = "https://gitee.com/api/v5";
// User-Agent: Note-Workstation/1.0
// timeout: 30s

#[tauri::command]
pub async fn gitee_get_user(token: String) -> AppResult<GiteeUser>

#[tauri::command]
pub async fn gitee_list_repos(token: String) -> AppResult<Vec<GiteeRepo>>
// per_page=100, sort=updated

#[tauri::command]
pub async fn gitee_create_repo(
    token: String,
    name: String,
    private: bool,
    description: Option<String>,
) -> AppResult<GiteeRepo>
```

非 2xx：401/403 → `AUTH`；其它 → `API_ERROR`。

- [ ] **Step 1: 实现客户端与三个命令（网络测 `#[ignore]`）**

- [ ] **Step 2: 用真实 Token 手动跑一次 get_user（不写进仓库）**

```bash
# 本地临时：GITEE_TOKEN=xxx cargo test gitee_get_user_live -- --ignored --nocapture
```

---

### Task 3: `git_clone` / `git_push` / `git_pull`（系统 git）

**Files:**
- Modify: `src-tauri/src/commands/git_ops.rs`

**Interfaces:**

```rust
#[tauri::command]
pub fn git_clone(url: String, dest: String) -> AppResult<()>
// url 应为带 Token 地址；子进程: git clone -- <url> <dest>
// 成功后确认 dest/.git 存在；origin 应为 clone 所用 url

#[tauri::command]
pub fn git_push(root: String) -> AppResult<()>
// git -C root push
// 若 origin 为纯 https://gitee.com/...，则用 store 中 token 临时改写再 push（或先 set-url）
// SSH origin 不改写，失败时返回 GIT_ERROR 说明

#[tauri::command]
pub fn git_pull(root: String) -> AppResult<()>
// git -C root pull --rebase
// 冲突 → code GIT_CONFLICT，message 含 stderr
```

检测系统 git：

```rust
// which/where git；缺失 → GIT_ERROR "系统未找到 git，请先安装 Git"
```

- [ ] **Step 1: 实现子进程封装（捕获 stdout/stderr、非 0 转 AppError）**

- [ ] **Step 2: 手工用带 Token URL clone 私有空仓验证**

---

### Task 4: Settings Token + GiteePanel

**Files:**
- Create: `src/components/GiteePanel.vue`
- Modify: `src/stores/settings.ts`
- Modify: `src/stores/git.ts`（push/pull/clone 方法）
- Modify: `src/components/layout/AppSidebar.vue`
- Modify: `src/components/GitPanel.vue`（推送/拉取按钮）

**Interfaces:**
- 保存 Token → `gitee_get_user` 校验 → plugin-store
- 列表项：「复制带 Token 地址」→ `gitee_build_auth_url` → clipboard；UI 打码预览
- 点击仓库 → dialog 选目录 → `git_clone(authUrl, dest)` → 可选 `openWorkspace(dest)`
- 新建仓库成功 → 自动生成并可复制 auth URL
- GitPanel：推送/拉取成功 → Toast；后续阶段接系统通知

- [ ] **Step 1: 实现面板与复制**

- [ ] **Step 2: 手工 H09 / H10**

Expected: 复制的地址在终端 `git ls-remote <url>` 成功；应用内 clone 后 push 无需再登录。

---

## 阶段验收

- [ ] 可复制带 Token 地址且外部 git 可用
- [ ] 应用内 clone 后 `.git/config` origin 含 `oauth2:`
- [ ] push / pull 主路径通过；无 git 时有明确错误
- [ ] Token 错误返回 `AUTH`

**下一阶段：** [06-桌面增强与设置.md](./06-桌面增强与设置.md)
