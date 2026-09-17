# Phase 04: Git 本地操作

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在工作区完成 `git init`、查看状态与变更、全部暂存并提交、查看最近提交历史（不含 clone/push/pull）。

**Architecture:** 读与本地写提交用 **git2**；统一错误 `NOT_REPO` / `GIT_ERROR`；前端 `GitPanel` + `git` store。

**Tech Stack:** git2 · tempfile（测试）

## Global Constraints

见 [`00-落地总览.md`](./00-落地总览.md)。依赖阶段 02–03。v1.0 **不做** `git_branches` / `git_checkout` / `git_discard`。

---

### Task 1: 数据结构与 `git_init` / `git_status`

**Files:**
- Modify: `src-tauri/Cargo.toml`（`git2`）
- Modify: `src-tauri/src/commands/git_ops.rs`
- Modify: `src/types/index.ts`
- Modify: `src/api/tauri.ts`

**Interfaces:**

```rust
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangeItem {
    pub path: String,
    pub status: String,  // 中文：未跟踪/已修改/已暂存/已删除 等
    pub staged: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub branch: String,
    pub ahead: u32,
    pub behind: u32,
    pub changes: Vec<ChangeItem>,
}

#[tauri::command]
pub fn git_init(root: String) -> AppResult<()>

#[tauri::command]
pub fn git_status(root: String) -> AppResult<GitStatus>
// 非仓库 → AppError::new("NOT_REPO", ...)
```

- [ ] **Step 1: tempfile 测试 — 非仓库 status 返回 NOT_REPO**

- [ ] **Step 2: init 后 status 成功，空 changes**

- [ ] **Step 3: 写文件后 status 出现未跟踪**

```bash
cd src-tauri && cargo test git_ -- --nocapture
```

---

### Task 2: `git_commit` / `git_log`

**Files:**
- Modify: `src-tauri/src/commands/git_ops.rs`

**Interfaces:**

```rust
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitInfo {
    pub id: String,
    pub short_id: String,
    pub message: String,
    pub author: String,
    pub time: i64,
}

#[tauri::command]
pub fn git_commit(root: String, message: String) -> AppResult<String>
// 空 message → INVALID_ARGUMENT
// 暂存全部变更（含 untracked）→ commit
// 作者：config user.name/email，否则 "Note User" / "note@local"

#[tauri::command]
pub fn git_log(root: String, limit: u32) -> AppResult<Vec<CommitInfo>>
```

- [ ] **Step 1: 测试 init → write → commit → status 无变更 → log 长度 1**

- [ ] **Step 2: 实现并通过测试**

- [ ] **Step 3: 注册 invoke_handler**

---

### Task 3: GitPanel UI

**Files:**
- Create: `src/components/GitPanel.vue`
- Modify: `src/stores/git.ts`
- Modify: `src/components/layout/AppSidebar.vue`

**Interfaces:**
- Consumes: `api.git.gitInit|gitStatus|gitCommit|gitLog`
- `git.refresh(root)`；`commit(root, msg)` 后 refresh
- UI：
  - `status === null` 或错误码 `NOT_REPO` → 「初始化仓库」按钮
  - 否则：分支名、变更列表（颜色：未跟踪灰 / 修改橙 / 暂存绿 / 删除红）、message 输入、提交按钮
  - 可选折叠区：最近 20 条 `git_log`

- [ ] **Step 1: 实现 store + 面板**

- [ ] **Step 2: 手工 H08**

Expected: 改笔记 → 提交 → 变更清空 → log 可见。

---

## 阶段验收

- [ ] H08 通过
- [ ] `cargo test` git 相关 PASS
- [ ] 非仓库路径展示初始化，不崩溃

**下一阶段：** [05-Gitee与带Token同步.md](./05-Gitee与带Token同步.md)
