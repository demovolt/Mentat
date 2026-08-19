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

This is achieved through a **hook script** that you install once and register with Claude/Codex, plus a **local HTTP status server** that Mentat runs in the background.

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
│                                │  │  POST /agent  → UI update│   │  │
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
│   MENTAT_STATUS_PORT=27182                                         │
│                                                                    │
│   ┌──────────────────────────────────────────────────────────┐    │
│   │  Hook Script (~/.claude/mentat-hook.sh)                   │    │
│   │  called by Claude/Codex lifecycle hooks                   │    │
│   │                                                           │    │
│   │  mentat-hook.sh session_start   ← Notification hook      │    │
│   │  mentat-hook.sh working         ← PreToolUse hook        │    │
│   │  mentat-hook.sh thinking        ← PostToolUse hook       │    │
│   │  mentat-hook.sh idle            ← Stop hook              │    │
│   │  mentat-hook.sh agent_start     ← PreToolUse (dispatch)  │    │
│   │  mentat-hook.sh agent_stop      ← SubagentStop hook      │    │
│   └──────────────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────────────┘
```

### The Hook Script

Mentat ships a single hook script (`mentat-hook.sh` on Linux/macOS, `mentat-hook.ps1` on Windows) that you copy to your `~/.claude/` and `~/.codex/` directories and register with each tool's hook system.

The script receives a single argument — the **action** — and optionally reads a JSON payload from stdin (for `session_start`, `agent_start`, `agent_stop`).

**Actions:**

| Action | Trigger | Transport |
|---|---|---|
| `session_start` | Claude/Codex session begins; reads `session_id` from stdin JSON | POST `/status` |
| `session_stop` | Claude/Codex process exited | POST `/status` |
| `thinking` | AI is processing between tool calls | POST `/status` |
| `working` | AI is actively executing a tool | POST `/status` |
| `idle` | AI finished its current task | POST `/status` |
| `waiting` | AI is waiting for user input | POST `/status` |
| `agent_start` | A subagent was spawned; reads agent info from stdin JSON | POST `/agent` |
| `agent_stop` | A subagent finished; reads agent info from stdin JSON | POST `/agent` |

The script is a no-op when `MENTAT_TERM_ID` is not set, so it is safe to install globally — it only activates inside Mentat terminals.

### Status Server Endpoints

Mentat runs an HTTP server on port **27182** (falls back to 27183–27191 if the port is taken).

| Endpoint | Payload | Purpose |
|---|---|---|
| `POST /status` | `{ termId, status, sessionId? }` | Update terminal status; `session_start` can carry `sessionId` for resume |
| `POST /agent` | `{ termId, agentId, event, description? }` | Track subagent lifecycle (`event`: `start` or `stop`) |

### Session Resumption

When a `session_start` event arrives with a `sessionId`, Mentat stores it. The next time you open an AI terminal for the same worktree, Mentat passes `--resume <sessionId>` to Claude automatically. The conversation continues from where it left off.

### Environment Variables

Every terminal Mentat creates has these variables set:

| Variable | Value | Purpose |
|---|---|---|
| `MENTAT_TERM_ID` | e.g. `term-3-1720000000` | Unique identifier for this terminal tab |
| `MENTAT_STATUS_HOST` | `127.0.0.1` (or WSL host IP) | Address of the Mentat status server |
| `MENTAT_STATUS_PORT` | e.g. `27182` | Port of the Mentat status server |

On Windows + WSL, these variables are forwarded into the WSL environment using `WSLENV`. Mentat automatically resolves the correct Windows host IP so hooks from within WSL can reach the Windows-side status server.

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

### Step 3 — Install the Mentat Hook Script

Mentat's status integration requires a small hook script that Claude and Codex call during their lifecycle events. You install it once; it then works across all projects automatically.

The hook scripts are bundled inside the Mentat app:

| Platform | Script in app |
|---|---|
| Linux / macOS | `resources/app/electron/script/mentat-hook.sh` |
| Windows | `resources/app/electron/script/mentat-hook.ps1` |

When building from source, the scripts are at `electron/script/mentat-hook.sh` (or `.ps1`).

#### Linux / macOS

```bash
# Create target directories
mkdir -p ~/.claude ~/.codex

# Copy the hook script (adjust the source path to match your Mentat installation)
cp /path/to/mentat/electron/script/mentat-hook.sh ~/.claude/mentat-hook.sh
cp /path/to/mentat/electron/script/mentat-hook.sh ~/.codex/mentat-hook.sh

# Make executable
chmod +x ~/.claude/mentat-hook.sh ~/.codex/mentat-hook.sh
```

#### Windows (PowerShell)

```powershell
# Create target directories
New-Item -ItemType Directory -Force "$env:USERPROFILE\.claude"
New-Item -ItemType Directory -Force "$env:USERPROFILE\.codex"

# Copy the hook script
Copy-Item "C:\path\to\mentat\resources\app\electron\script\mentat-hook.ps1" "$env:USERPROFILE\.claude\mentat-hook.ps1"
Copy-Item "C:\path\to\mentat\resources\app\electron\script\mentat-hook.ps1" "$env:USERPROFILE\.codex\mentat-hook.ps1"
```

#### Windows + WSL

Copy the `.sh` script inside your WSL environment (same as Linux above), and the `.ps1` script on the Windows side if you also run native Windows PowerShell terminals.

---

### Step 4 — Register the Hook with Claude Code

Claude Code calls registered hooks at specific lifecycle points. Add the following to `~/.claude/settings.json` (create the file if it doesn't exist):

```json
{
  "hooks": {
    "Notification": [
      {
        "hooks": [
          { "type": "command", "command": "~/.claude/mentat-hook.sh session_start" }
        ]
      }
    ],
    "PreToolUse": [
      {
        "hooks": [
          { "type": "command", "command": "~/.claude/mentat-hook.sh working" }
        ]
      }
    ],
    "PostToolUse": [
      {
        "hooks": [
          { "type": "command", "command": "~/.claude/mentat-hook.sh thinking" }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          { "type": "command", "command": "~/.claude/mentat-hook.sh idle" }
        ]
      }
    ],
    "SubagentStop": [
      {
        "hooks": [
          { "type": "command", "command": "~/.claude/mentat-hook.sh agent_stop" }
        ]
      }
    ]
  }
}
```

If you already have a `settings.json` with other hooks, merge the `hooks` object rather than replacing the whole file.

> **Windows (PowerShell):** Replace `~/.claude/mentat-hook.sh` with the full path to `mentat-hook.ps1` and prefix the command with `powershell -File`.

---

### Step 5 — Register the Hook with Codex

Codex reads its hooks from `~/.codex/hooks.json`. Create or update that file:

```json
{
  "hooks": {
    "PreToolUse": [
      { "command": "~/.codex/mentat-hook.sh working" }
    ],
    "Stop": [
      { "command": "~/.codex/mentat-hook.sh idle" }
    ]
  }
}
```

---

### Step 6 — Launch Mentat

1. Start `Mentat.exe` (Windows) or `Mentat.AppImage` (Linux) or open the macOS app

2. On first launch, Mentat automatically:
   - Starts the status server on port **27182**
   - On Windows: adds a firewall rule for port 27182

3. Open **Settings → Connection** to verify the setup:
   - **Status Server** shows green if the server is reachable
   - **Scripts** section shows a ✓ or ✗ next to each expected hook file

---

### Step 7 — Add a Repository

1. Click the **"+"** button in the top toolbar
2. Select the root folder of a Git repository
3. Mentat will detect the repository and load all existing branches and worktrees into the sidebar

---

### Step 8 — Open a Terminal

Click on any worktree in the sidebar to select it, then:

- **Regular shell terminal** — click the terminal icon to open a shell tab in that worktree's directory
- **AI terminal** — click the AI button (Claude/Codex icon) to open an AI session tab

The terminal opens pre-configured with the correct working directory and with `MENTAT_TERM_ID` already set.

---

### Step 9 — Work with Claude or Codex

**In an AI terminal:**

The AI launches automatically. You can interact with it directly through the terminal. The sidebar shows a live status indicator for each terminal:

| Indicator | Meaning |
|---|---|
| `idle` | AI is ready, waiting for your message |
| `thinking` | AI is processing between tool calls |
| `working` | AI is executing a tool (reading/writing files, running commands) |
| `waiting` | AI needs input from you |

**Session resumption:**

If you close an AI terminal and click the AI button again, Mentat automatically resumes the previous conversation. You do not need to do anything — the `--resume` flag is added behind the scenes using the session ID captured at startup.

**In a shell terminal:**

You can still type `claude` or `codex` manually. The hooks registered in Steps 4–5 are active globally, so Mentat will track the session status automatically as long as `MENTAT_TERM_ID` is set (which it is in every Mentat terminal).

---

### Step 10 — Manage Worktrees

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

### Step 11 — Adjust Settings

Click the **Settings** (gear) icon in the toolbar:

| Setting | Description |
|---|---|
| **AI Command** | Choose `claude` or `codex` as the default for AI terminals |
| **Logging** | Enable to write a `mentat.log` file for debugging |
| **Console Font** | Font family used in all terminals |
| **Console Font Size** | Font size in pixels |

The **Connection** tab lets you verify that the hook scripts are installed and the status server is running.

---

### Troubleshooting

**Status indicators not updating**

1. Open **Settings → Connection** and check:
   - Is the status server shown as running?
   - Are the hook scripts shown as installed (✓)?
2. If a script shows ✗, repeat Step 3 — the file is missing from the expected location.
3. If the server shows as not reachable, restart Mentat.

**Status indicators not updating (Windows + WSL)**

WSL cannot reach the Windows-side status server via `127.0.0.1`. Mentat automatically resolves the correct Windows host IP and adds a firewall rule, but if it fails:

1. Open PowerShell and run:
   ```powershell
   netsh advfirewall firewall add rule name="Mentat Status" dir=in action=allow protocol=TCP localport=27182
   ```
2. Restart Mentat

**Hooks not firing**

Verify that the hook file is executable and the path in `~/.claude/settings.json` is correct:

```bash
# Check permissions
ls -la ~/.claude/mentat-hook.sh

# Test the hook manually (should produce no output and exit 0 when MENTAT_TERM_ID is unset)
~/.claude/mentat-hook.sh idle
echo $?
```

**Claude command not found inside WSL**

Install Claude Code inside WSL (not on Windows):

```bash
# Run inside WSL terminal
npm install -g @anthropic-ai/claude-code
claude --version
```

**Port 27182 conflict**

If another application is using port 27182, Mentat tries ports 27183–27191 automatically. The active port is shown in **Settings → Connection**. If all ports fail, identify and stop the conflicting process:

```bash
# Linux / WSL
lsof -i :27182

# Windows (PowerShell)
netstat -ano | findstr :27182
```

---

*Mentat — Git worktree manager with integrated AI sessions.*
