# Mentat — Documentation

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [How Mentat Communicates with Claude and Codex](#2-how-mentat-communicates-with-claude-and-codex)
3. [Setting Up Mentat](#3-setting-up-mentat)

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

## 3. Setting Up Mentat

This guide assumes you already have Claude Code and/or Codex installed and configured.

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

### Step 2 — Install the Mentat Hook Script

Mentat's status integration requires a small hook script that Claude and Codex call during their lifecycle events. You install it once; it then works across all projects automatically.

The hook scripts are bundled inside the Mentat app:

| Platform | Script in app |
|---|---|
| Linux / macOS / WSL | `resources/app/script/mentat-hook.sh` |
| Windows (native) | `resources/app/script/mentat-hook.ps1` |

When building from source, the scripts are at `script/mentat-hook.sh` (or `.ps1`).

#### Linux / macOS / WSL

```bash
# Create target directories
mkdir -p ~/.claude ~/.codex

# Copy the hook script (adjust the source path to match your Mentat installation)
cp /path/to/mentat/script/mentat-hook.sh ~/.claude/mentat-hook.sh
cp /path/to/mentat/script/mentat-hook.sh ~/.codex/mentat-hook.sh

# Make executable
chmod +x ~/.claude/mentat-hook.sh ~/.codex/mentat-hook.sh
```

#### Windows (native, PowerShell)

```powershell
# Create target directories
New-Item -ItemType Directory -Force "$env:USERPROFILE\.claude"
New-Item -ItemType Directory -Force "$env:USERPROFILE\.codex"

# Copy the hook script
Copy-Item "C:\path\to\mentat\resources\app\script\mentat-hook.ps1" "$env:USERPROFILE\.claude\mentat-hook.ps1"
Copy-Item "C:\path\to\mentat\resources\app\script\mentat-hook.ps1" "$env:USERPROFILE\.codex\mentat-hook.ps1"
```

---

### Step 3 — Register the Hook with Claude Code

Claude Code calls registered hooks at specific lifecycle points. Ready-to-use example configs are included in the app:

| Platform | Example config |
|---|---|
| Linux / macOS / WSL | `resources/app/script/claude-settings-linux.json` |
| Windows (native) | `resources/app/script/claude-settings-windows.json` |

**Linux / macOS / WSL** — add the contents to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          { "type": "command", "command": "bash ~/.claude/mentat-hook.sh session_start" }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          { "type": "command", "command": "bash ~/.claude/mentat-hook.sh session_stop" }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          { "type": "command", "command": "bash ~/.claude/mentat-hook.sh thinking" }
        ]
      }
    ],
    "PreToolUse": [
      {
        "hooks": [
          { "type": "command", "command": "bash ~/.claude/mentat-hook.sh working" }
        ]
      },
      {
        "matcher": "AskUserQuestion",
        "hooks": [
          { "type": "command", "command": "bash ~/.claude/mentat-hook.sh waiting" }
        ]
      },
      {
        "matcher": "Agent",
        "hooks": [
          { "type": "command", "command": "bash ~/.claude/mentat-hook.sh agent_start" }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Agent",
        "hooks": [
          { "type": "command", "command": "bash ~/.claude/mentat-hook.sh agent_stop" }
        ]
      }
    ],
    "Notification": [
      {
        "hooks": [
          { "type": "command", "command": "bash ~/.claude/mentat-hook.sh waiting" }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          { "type": "command", "command": "bash ~/.claude/mentat-hook.sh idle" }
        ]
      }
    ]
  }
}
```

**Windows (native)** — use the same structure but replace each command with:
```
powershell -ExecutionPolicy Bypass -File PATH_TO_CLAUDE/mentat-hook.ps1 <action>
```
where `PATH_TO_CLAUDE` is the full path to your `.claude` folder (e.g. `C:/Users/User/.claude`). See `claude-settings-windows.json` for the complete example.

If you already have a `settings.json` with other hooks, merge the `hooks` object rather than replacing the whole file.

---

### Step 4 — Register the Hook with Codex

Codex reads its hooks from `~/.codex/hooks.json`. Ready-to-use example configs are included in the app:

| Platform | Example config |
|---|---|
| Linux / macOS / WSL | `resources/app/script/codex-hooks-linux.json` |
| Windows (native) | `resources/app/script/codex-hooks-windows.json` |

**Linux / macOS / WSL** — create or update `~/.codex/hooks.json`:

```json
{
  "description": "mentat",
  "hooks": {
    "session_start": [
      { "command": "bash ~/.codex/mentat-hook.sh session_start" }
    ],
    "session_end": [
      { "command": "bash ~/.codex/mentat-hook.sh session_stop" }
    ],
    "user_prompt_submit": [
      { "command": "bash ~/.codex/mentat-hook.sh thinking" }
    ],
    "pre_tool_use": [
      { "command": "bash ~/.codex/mentat-hook.sh working" }
    ],
    "post_tool_use": [
      { "command": "bash ~/.codex/mentat-hook.sh thinking" }
    ],
    "stop": [
      { "command": "bash ~/.codex/mentat-hook.sh idle" }
    ],
    "subagent_start": [
      { "command": "bash ~/.codex/mentat-hook.sh agent_start" }
    ],
    "subagent_stop": [
      { "command": "bash ~/.codex/mentat-hook.sh agent_stop" }
    ]
  }
}
```

**Windows (native)** — use the same structure but replace each command with:
```
powershell -ExecutionPolicy Bypass -File PATH_TO_CODEX/mentat-hook.ps1 <action>
```
where `PATH_TO_CODEX` is the full path to your `.codex` folder (e.g. `C:/Users/User/.codex`). See `codex-hooks-windows.json` for the complete example.

---

### Step 5 — Launch Mentat

1. Start `Mentat.exe` (Windows), `Mentat.AppImage` (Linux), or open the macOS app
2. Open **Settings → Connection** — make sure the status server is green and hook scripts are marked ✓
3. Click **"+"** in the toolbar and add a Git repository
4. Select a worktree in the sidebar and open an AI terminal — Claude or Codex button

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
