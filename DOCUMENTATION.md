# Mentat — Documentation

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [How Mentat Communicates with Claude and Codex](#2-how-mentat-communicates-with-claude-and-codex)
3. [Setting Up Claude / Codex + Mentat from Scratch](#3-setting-up-claude--codex--mentat-from-scratch)

---

## 1. Project Overview

### What is Mentat?

**Mentat** is a desktop application for developers who want to work on multiple Git branches simultaneously — each in its own isolated environment — while running AI coding assistants (Claude Code or Codex) directly alongside their work.

In a typical workflow, a developer has one working directory and must stash or commit before switching branches. Mentat solves this by using **Git worktrees**: each branch lives in its own folder, fully independent. You can have five branches open at the same time, each with its own terminal and its own AI session, without any context-switching cost.

Mentat provides:

- **Worktree management** — create, switch between, and delete Git worktrees from a unified sidebar
- **Integrated terminals** — each worktree has one or more terminal tabs; all terminals run inside the correct directory automatically
- **AI sessions** — open a Claude or Codex terminal directly inside any worktree; Mentat tracks whether the AI is thinking, working, or idle and shows it in the UI
- **Session resumption** — when you close and reopen a Claude terminal, Mentat automatically resumes the previous conversation using `--resume`
- **Cross-platform support** — runs natively on Windows, macOS, and Linux, with full WSL support for Windows users

### Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| Desktop shell | **Electron 32** | Cross-platform native app wrapper |
| UI framework | **React 18** + **Vite** | Component-based interface, fast dev builds |
| Styling | **Tailwind CSS** | Utility-first CSS |
| Terminal emulator | **xterm.js** | In-app terminal rendering |
| Pseudo-terminal | **node-pty** | Spawns real shell processes with PTY support |
| Main process | **Node.js** | Git operations, process management, IPC |
| Status bridge | **HTTP server (port 27182)** | Receives hook events from Claude/Codex |
| Git operations | **child_process** (git CLI) | All worktree and branch management |

### Supported Platforms

| Platform | Status |
|---|---|
| Windows (native) | Supported |
| Windows + WSL | Fully supported (recommended) |
| Linux | Supported |
| macOS | Supported |

---

## 2. How Mentat Communicates with Claude and Codex

This is the core technical feature of Mentat. When you run Claude or Codex inside a Mentat terminal, the app needs to know what the AI is doing at any moment — is it thinking? working on files? done? — so it can update the status indicators in the sidebar.

This is achieved through three complementary mechanisms: **shell wrappers**, **lifecycle hooks**, and a **local HTTP status server**.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Mentat Desktop App                          │
│                                                                     │
│  ┌──────────────┐     IPC      ┌─────────────────────────────────┐  │
│  │  React UI    │◄────────────►│     Electron Main Process       │  │
│  │  (sidebar    │              │                                 │  │
│  │   statuses)  │              │  ┌──────────────────────────┐   │  │
│  └──────────────┘              │  │  Status Server :27182    │   │  │
│                                │  │  POST /status → UI update│   │  │
│                                │  │  POST /session → resume  │   │  │
│                                │  └──────────┬───────────────┘   │  │
│                                └─────────────┼───────────────────┘  │
│                                              │ HTTP                  │
└──────────────────────────────────────────────┼─────────────────────┘
                                               │
               ┌───────────────────────────────┘
               │
┌──────────────▼────────────────────────────────────────────────────┐
│                       Terminal (PTY process)                       │
│                                                                    │
│   MENTAT_TERM_ID=term-3-1720000000                                 │
│   MENTAT_STATUS_HOST=127.0.0.1                                     │
│                                                                    │
│   ┌─────────────────────┐    ┌────────────────────────────────┐   │
│   │  Shell Wrapper       │    │  Codex Lifecycle Hooks         │   │
│   │  (~/.claude/        │    │  (~/.codex/mentat-hook.sh)     │   │
│   │   mentat-wrap.sh)   │    │                                │   │
│   │                     │    │  PreToolUse → POST "working"   │   │
│   │  session_start POST │    │  Stop       → POST "idle"      │   │
│   │  → runs claude      │    └────────────────────────────────┘   │
│   │  session_stop  POST │                                          │
│   └─────────────────────┘    ┌────────────────────────────────┐   │
│                               │  Session ID Hook               │   │
│                               │  (~/.claude/mentat-session-    │   │
│                               │   hook.sh)                     │   │
│                               │                                │   │
│                               │  Reads session_id from JSON    │   │
│                               │  → POST /session               │   │
│                               └────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────┘
```

### Mechanism 1 — Shell Wrappers

When Mentat starts, it automatically writes a shell function into your shell profile (`.bashrc`, `.zshrc`, or PowerShell profile). This function wraps the `claude` and `codex` commands transparently.

**What the wrapper does:**

1. User types `claude` in a Mentat terminal
2. The wrapper intercepts the call and sends a `session_start` status update to Mentat
3. The real `claude` binary is executed with all original arguments passed through
4. When Claude exits, the wrapper sends a `session_stop` update
5. The sidebar status indicator updates accordingly

The wrapper communicates via HTTP POST to `http://$MENTAT_STATUS_HOST:27182/status`:

```json
{ "termId": "term-3-1720000000", "status": "session_start" }
```

The wrapper only activates when the terminal has `MENTAT_TERM_ID` set — terminals outside of Mentat are not affected.

**Hook scripts location:**

| Platform | Claude wrapper | Codex wrapper |
|---|---|---|
| Linux / macOS | `~/.claude/mentat-claude-wrap.sh` | `~/.codex/mentat-codex-wrap.sh` |
| WSL | `~/.claude/mentat-claude-wrap.sh` (inside WSL) | `~/.codex/mentat-codex-wrap.sh` (inside WSL) |
| Windows (PowerShell) | `~/.claude/mentat-claude-wrap.ps1` | `~/.codex/mentat-codex-wrap.ps1` |

### Mechanism 2 — Codex Lifecycle Hooks

For **Codex**, Mentat also registers lifecycle hooks directly into Codex's hook system. This gives finer-grained status updates — the UI knows not just when a session starts or stops, but also when Codex is actively executing a tool.

Mentat creates two files:

- `~/.codex/mentat-hook.sh` — the hook script
- `~/.codex/hooks.json` — registers the hooks with Codex

**Registered hooks:**

| Hook | Trigger | Status sent |
|---|---|---|
| `PreToolUse` | Before Codex executes any tool (file edit, shell command, etc.) | `working` |
| `Stop` | When Codex finishes its response | `idle` |

The hook reads the `MENTAT_TERM_ID` environment variable to know which terminal to update, then POSTs to the status server.

### Mechanism 3 — Session ID Capture (Claude `--resume`)

Claude assigns a unique `session_id` to each conversation. Mentat captures this ID so that if you close a Claude terminal and reopen it, the conversation continues from where it left off.

**How it works:**

1. Mentat installs `~/.claude/mentat-session-hook.sh`
2. This script reads Claude's JSON output from stdin, extracts the `session_id` field
3. It POSTs the ID to `http://$MENTAT_STATUS_HOST:27182/session`:
   ```json
   { "termId": "term-3-1720000000", "sessionId": "abc-123-..." }
   ```
4. Mentat stores the ID and associates it with the terminal
5. When that terminal is reopened, Mentat spawns Claude with `--resume abc-123-...`

### Environment Variables

Every terminal Mentat creates has these variables set in its environment:

| Variable | Value | Purpose |
|---|---|---|
| `MENTAT_TERM_ID` | e.g. `term-3-1720000000` | Unique identifier for this terminal tab |
| `MENTAT_STATUS_HOST` | `127.0.0.1` (or WSL host IP) | Address of the Mentat status server |

On Windows + WSL, these variables are forwarded into the WSL environment using `WSLENV`. Mentat automatically resolves the correct host IP so hooks from within WSL can reach the Windows-side status server.

### Status Values

| Status | Meaning |
|---|---|
| `session_start` | Claude/Codex process launched |
| `working` | AI is actively using a tool (Codex) |
| `thinking` | AI is processing (intermediate state) |
| `waiting` | AI is waiting for user input |
| `idle` | AI finished its current task |
| `session_stop` | Claude/Codex process exited |

---

## 3. Setting Up Claude / Codex + Mentat from Scratch

This section walks through a complete setup on a fresh machine.

### Prerequisites

**Required on all platforms:**
- **Git** — [git-scm.com](https://git-scm.com)
- **Node.js 18+** — [nodejs.org](https://nodejs.org) (check with `node --version`)
- An **Anthropic API key** (for Claude) or **OpenAI API key** (for Codex)

**Required for Claude Code:**
```bash
npm install -g @anthropic-ai/claude-code
```
Verify: `claude --version`

**Required for Codex:**
```bash
npm install -g @openai/codex
```
Verify: `codex --version`

**Windows users (strongly recommended):**
- Install **WSL 2** with Ubuntu: open PowerShell as Administrator and run:
  ```powershell
  wsl --install
  ```
- Then install Node.js and the AI CLI tools inside WSL (Ubuntu), not on Windows directly.

---

### Step 1 — Install Mentat

**Option A: Download the pre-built release**

| Platform | File |
|---|---|
| Windows | `Mentat-portable.exe` |
| Linux | `Mentat.AppImage` |
| macOS | `Mentat.dmg` |

Download the appropriate file and run it directly — no installation required.

**Option B: Build from source**

```bash
git clone <mentat-repo-url>
cd mentat
npm install
npm run build
npm run package
```

The packaged output appears in the `release/` directory.

---

### Step 2 — Configure Your API Key

**For Claude Code:**

```bash
# Option 1: Log in interactively (recommended)
claude login

# Option 2: Set the environment variable
export ANTHROPIC_API_KEY=sk-ant-...
```

Add the export to your `~/.bashrc` or `~/.zshrc` to make it permanent.

**For Codex:**

```bash
export OPENAI_API_KEY=sk-...
```

Add to `~/.bashrc` or `~/.zshrc`.

---

### Step 3 — Launch Mentat

1. Start `Mentat.exe` (Windows) or `Mentat.AppImage` (Linux) or open the macOS app

2. On first launch, Mentat automatically:
   - Starts the status server on port **27182**
   - Writes shell wrapper scripts to `~/.claude/` and `~/.codex/`
   - Appends `source` lines to your `.bashrc` / `.zshrc` / PowerShell profile
   - Registers Codex hooks in `~/.codex/hooks.json`
   - On Windows: adds a firewall rule for port 27182

No manual hook setup is needed — Mentat handles everything automatically.

---

### Step 4 — Add a Repository

1. Click the **"+"** button in the top toolbar
2. Select the root folder of a Git repository
3. Mentat will detect the repository and load all existing branches and worktrees into the sidebar

---

### Step 5 — Open a Terminal

Click on any worktree in the sidebar to select it, then:

- **Regular shell terminal** — click the terminal icon to open a shell tab in that worktree's directory
- **AI terminal** — click the AI button (Claude/Codex icon) to open an AI session tab

The terminal opens pre-configured with the correct working directory and with `MENTAT_TERM_ID` already set.

---

### Step 6 — Work with Claude or Codex

**In an AI terminal:**

The AI launches automatically. You can interact with it directly through the terminal. The sidebar shows a live status indicator for each terminal:

| Indicator | Meaning |
|---|---|
| `idle` | AI is ready, waiting for your message |
| `working` | AI is executing a tool (reading/writing files, running commands) |
| `waiting` | AI needs input from you |

**Session resumption:**

If you close an AI terminal and click the AI button again, Mentat automatically resumes the previous conversation. You do not need to do anything — the `--resume` flag is added behind the scenes.

**In a shell terminal:**

Simply type `claude` or `codex` in any Mentat shell terminal. The wrappers are active, and Mentat will track the session status automatically.

---

### Step 7 — Manage Worktrees

**Create a new worktree (new branch):**

1. Right-click a repository in the sidebar (or use the "+" worktree button)
2. Enter the new branch name
3. Select a base branch
4. Click **Create** — the new worktree folder is created and appears in the sidebar immediately

**Remove a worktree:**

Right-click the worktree in the sidebar and select **Remove**. This deletes the worktree directory. The branch itself is preserved unless you also choose to delete it.

**Prune merged branches:**

Click the **Prune** button in the toolbar. Mentat scans for worktrees whose branches have been merged into the main branch and lists them for removal.

---

### Step 8 — Adjust Settings

Click the **Settings** (gear) icon in the toolbar:

| Setting | Description |
|---|---|
| **AI Command** | Choose `claude` or `codex` as the default for AI terminals |
| **Logging** | Enable to write a `mentat.log` file for debugging |
| **Console Font** | Font family used in all terminals |
| **Console Font Size** | Font size in pixels |

---

### Troubleshooting

**Status indicators not updating (Windows + WSL)**

This happens when WSL cannot reach the Windows-side status server via `127.0.0.1`. Mentat automatically resolves the correct Windows host IP and adds a firewall rule, but if it fails:

1. Open PowerShell and run:
   ```powershell
   netsh advfirewall firewall add rule name="Mentat Status" dir=in action=allow protocol=TCP localport=27182
   ```
2. Restart Mentat

**Hooks not loading in the shell**

Verify that the wrapper source line was added to your shell profile:

```bash
# Check .bashrc
grep mentat ~/.bashrc

# Should contain:
# source ~/.claude/mentat-claude-wrap.sh
# source ~/.codex/mentat-codex-wrap.sh
```

If missing, restart Mentat — it re-writes the hooks on every launch.

**Claude command not found inside WSL**

Install Claude Code inside WSL (not on Windows):

```bash
# Run inside WSL terminal
npm install -g @anthropic-ai/claude-code
claude --version
```

**Port 27182 conflict**

If another application is using port 27182, Mentat's status server will fail to start and status indicators will not work. Identify and stop the conflicting process:

```bash
# Linux / WSL
lsof -i :27182

# Windows (PowerShell)
netstat -ano | findstr :27182
```

---

*Mentat — Git worktree manager with integrated AI sessions.*
