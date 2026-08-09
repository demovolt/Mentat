# Проблема: статус Claude не отображается на Windows

## Суть

Приложение (Electron) запущено на Windows, Claude Code работает внутри WSL-терминала.
Статусные индикаторы (работает / ожидает) не обновляются на Windows-сборке, хотя на dev-сборке (Electron в Linux) всё работает.

## Почему так происходит

Хуки Claude Code отправляют HTTP POST на `http://127.0.0.1:27182/status`.

В dev-режиме Electron запущен в Linux (WSL), поэтому `127.0.0.1` — это локальный loopback, всё работает.

В Windows-сборке Electron запущен на Windows. `127.0.0.1` внутри WSL-терминала — это **loopback самого WSL**, а не Windows. Запрос никуда не доходит.

WSL2 → Windows идёт через виртуальный сетевой адаптер (`vEthernet WSL`), и Windows Firewall участвует в этом трафике — даже для "локальной" коммуникации.

## Текущее состояние кода

- Статус-сервер слушает на `0.0.0.0:27182` (вместо `127.0.0.1`) — уже исправлено
- Хуки в `~/.claude/settings.json` используют `127.0.0.1` — не достигают Windows из WSL

## Варианты решения

### Вариант 1 — Сетевой (MENTAT_STATUS_HOST)
- При создании WSL-терминала определять IP Windows-хоста: `grep nameserver /etc/resolv.conf`
- Передавать его в терминал через `MENTAT_STATUS_HOST`
- Хук использует `http://${MENTAT_STATUS_HOST:-127.0.0.1}:27182/status`
- Добавить правило Windows Firewall для порта 27182
- **Минус:** требует firewall rule и сложная настройка

### Вариант 2 — Файловый (без сети)
- Claude записывает статус в temp-файл (например `/tmp/mentat-status-{termId}`)
- Electron следит за файлом через `fs.watch`
- **Плюс:** не требует сети, firewall, работает везде
- **Минус:** нужно менять хуки и добавить watcher в main.js

### Вариант 3 — Mirrored Networking
- В WSL2 2.0+ (Windows 11 22H2+) можно включить mirrored networking в `~/.wslconfig`
- Тогда `127.0.0.1` в WSL достигает Windows
- **Минус:** зависит от версии Windows/WSL, требует настройки пользователем
