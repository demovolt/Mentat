# Problem: Claude status not displayed on Windows

## Summary

The app (Electron) runs on Windows, Claude Code runs inside a WSL terminal.
Status indicators (running / waiting) do not update in the Windows build, although the dev build (Electron in Linux) works fine.

## Why this happens

Claude Code hooks send an HTTP POST to `http://127.0.0.1:27182/status`.

In dev mode Electron runs in Linux (WSL), so `127.0.0.1` is the local loopback — everything works.

In the Windows build Electron runs on Windows. `127.0.0.1` inside the WSL terminal is the **WSL loopback**, not Windows. The request never arrives.

WSL2 → Windows traffic goes through a virtual network adapter (`vEthernet WSL`), and Windows Firewall is involved in that traffic — even for "local" communication.

## Current state of the code

- The status server listens on `0.0.0.0:27182` (instead of `127.0.0.1`) — already fixed
- Hooks in `~/.claude/settings.json` use `127.0.0.1` — do not reach Windows from WSL

## Solutions

### Option 1 — Network-based (MENTAT_STATUS_HOST)
- When creating a WSL terminal, detect the Windows host IP: `grep nameserver /etc/resolv.conf`
- Pass it to the terminal via `MENTAT_STATUS_HOST`
- Hook uses `http://${MENTAT_STATUS_HOST:-127.0.0.1}:27182/status`
- Add a Windows Firewall rule for port 27182
- **Con:** requires a firewall rule and complex setup

### Option 2 — File-based (no network)
- Claude writes status to a temp file (e.g. `/tmp/mentat-status-{termId}`)
- Electron watches the file via `fs.watch`
- **Pro:** no network or firewall required, works everywhere
- **Con:** hooks need to change and a watcher must be added to main.js

### Option 3 — Mirrored Networking
- In WSL2 2.0+ (Windows 11 22H2+) mirrored networking can be enabled in `~/.wslconfig`
- Then `127.0.0.1` in WSL reaches Windows
- **Con:** depends on Windows/WSL version, requires user configuration
