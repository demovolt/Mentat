<div align="center">
  
# Mentat
### One interface. Many agents  
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-lightgrey.svg)

Mentat — an open source app for working with AI agents. Run Claude Code and Codex in parallel across multiple git worktrees, switch between sessions in tabs, and track the status of each agent — all in one window
<img width="1689" height="950" alt="Mentat" src="https://github.com/user-attachments/assets/c77cd1e3-b249-4cca-af10-370779ed614e" />


</div>

# Installing Mentat

> Assumes you already have **Claude Code CLI** and/or **Codex CLI** installed and configured.

## Step 1 — Install Mentat

**Option A — Download a pre-built release**

**Option B — Build from source**

```bash
git clone git@github.com:demovolt/Mentat.git
cd mentat
npm install && npm run build && npm run package
```

Output appears in the `release/` directory.

---

## Step 2 — Install the hook script

Scripts are located in:
- `script/` — when building from source
- `resources/app/script/` — in the pre-built app

**Linux / macOS / WSL**

```bash
cp /path/to/mentat/script/mentat-hook.sh ~/.claude/mentat-hook.sh
cp /path/to/mentat/script/mentat-hook.sh ~/.codex/mentat-hook.sh
chmod +x ~/.claude/mentat-hook.sh ~/.codex/mentat-hook.sh
```

**Windows**

```powershell
Copy-Item "C:\path\to\mentat\...\mentat-hook.ps1" "$env:USERPROFILE\.claude\mentat-hook.ps1"
Copy-Item "C:\path\to\mentat\...\mentat-hook.ps1" "$env:USERPROFILE\.codex\mentat-hook.ps1"
```

---

## Step 3 — Register hooks with Claude

Ready-to-use configs are included in the app:

| Platform | File |
|---|---|
| Linux / macOS / WSL | `script/claude-settings-linux.json` |
| Windows | `script/claude-settings-windows.json` |

Copy the contents into `~/.claude/settings.json`.

> **Windows:** replace `PATH_TO_CLAUDE` in the file with the full path to your `.claude` folder, e.g. `C:/Users/User/.claude`

> If `settings.json` already exists, merge the `hooks` block into it — don't replace the whole file.

---

## Step 4 — Register hooks with Codex

Ready-to-use configs are included in the app:

| Platform | File |
|---|---|
| Linux / macOS / WSL | `script/codex-hooks-linux.json` |
| Windows | `script/codex-hooks-windows.json` |

Copy the contents into `~/.codex/hooks.json`.

> **Windows:** replace `PATH_TO_CODEX` with the full path to your `.codex` folder, e.g. `C:/Users/User/.codex`

---

## Step 5 — Launch Mentat

1. Start the app
2. Open **Settings → Connection** — confirm the status server is **green** and hook scripts are marked **✓**
3. Click **+** in the toolbar to add a Git repository
4. Select a worktree in the sidebar and open an AI terminal

---

## Troubleshooting

**Status indicators not updating**

Open **Settings → Connection** and check:
- Is the status server running (green)?
- Are hook scripts installed (✓)?

If a script shows ✗ — repeat Step 2, the file is missing from the expected location.

**Windows + WSL: hooks not reaching Mentat**

```powershell
netsh advfirewall firewall add rule name="Mentat Status" dir=in action=allow protocol=TCP localport=27182
```

Then restart Mentat.

**Port 27182 conflict**

Mentat automatically tries ports 27183–27191. The active port is shown in **Settings → Connection**.

```bash
# Linux / WSL
lsof -i :27182

# Windows
netstat -ano | findstr :27182
```

