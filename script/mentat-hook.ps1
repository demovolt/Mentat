param([string]$action)
if (-not $env:MENTAT_TERM_ID) { exit 0 }
$h = if ($env:MENTAT_STATUS_HOST) { $env:MENTAT_STATUS_HOST } else { '127.0.0.1' }
$port = if ($env:MENTAT_STATUS_PORT) { $env:MENTAT_STATUS_PORT } else { '27182' }
$base = "http://$($h):$port"

function Read-Stdin {
    $task = [System.Threading.Tasks.Task[string]]::Run([Func[string]]{ [Console]::In.ReadToEnd() })
    if ($task.Wait(1500)) { return $task.Result } else { return '' }
}

function Post-Json($url, $body) {
    try {
        Invoke-RestMethod -Method Post -Uri $url `
            -ContentType 'application/json' -Body $body `
            -TimeoutSec 2 -ErrorAction Stop | Out-Null
    } catch {}
}

switch ($action) {
    { $_ -in 'thinking','working','idle','waiting','session_stop' } {
        $body = "{`"termId`":`"$($env:MENTAT_TERM_ID)`",`"status`":`"$action`"}"
        Post-Json "$base/status" $body
    }
    'session_start' {
        $sid = ''
        try {
            $d = (Read-Stdin) | ConvertFrom-Json -ErrorAction SilentlyContinue
            if ($d -and $d.session_id) { $sid = $d.session_id }
        } catch {}
        $body = "{`"termId`":`"$($env:MENTAT_TERM_ID)`",`"status`":`"session_start`",`"sessionId`":`"$sid`"}"
        Post-Json "$base/status" $body
    }
    'agent_start' {
        $aid = ''; $desc = ''
        try {
            $d = [Console]::In.ReadToEnd() | ConvertFrom-Json -ErrorAction SilentlyContinue
            if ($d) {
                $aid = if ($d.tool_use_id) { $d.tool_use_id } elseif ($d.agent_id) { $d.agent_id } else { '' }
                $raw = if ($d.tool_input -and $d.tool_input.description) { $d.tool_input.description } `
                       elseif ($d.agent_type) { [string]$d.agent_type } else { '' }
                $desc = if ($raw.Length -gt 60) { $raw.Substring(0,60) } else { $raw }
            }
        } catch {}
        $desc = $desc -replace '"', '\"'
        $body = "{`"termId`":`"$($env:MENTAT_TERM_ID)`",`"agentId`":`"$aid`",`"event`":`"start`",`"description`":`"$desc`"}"
        Post-Json "$base/agent" $body
    }
    'agent_stop' {
        $aid = ''
        try {
            $d = [Console]::In.ReadToEnd() | ConvertFrom-Json -ErrorAction SilentlyContinue
            if ($d) {
                $aid = if ($d.tool_use_id) { $d.tool_use_id } elseif ($d.agent_id) { $d.agent_id } else { '' }
            }
        } catch {}
        $body = "{`"termId`":`"$($env:MENTAT_TERM_ID)`",`"agentId`":`"$aid`",`"event`":`"stop`"}"
        Post-Json "$base/agent" $body
    }
    'process_pid' {
        $pid_ = ''; $processId = ''
        try {
            $d = [Console]::In.ReadToEnd() | ConvertFrom-Json -ErrorAction SilentlyContinue
            if ($d -and $d.tool_input -and $d.tool_input.run_in_background) {
                $processId = if ($d.tool_use_id) { $d.tool_use_id } else { '' }
                $resp = $d.tool_response
                if ($resp -and $resp.pid) { $pid_ = [string]$resp.pid }
                if (-not $pid_ -and $resp) {
                    $out = if ($resp.output) { $resp.output } elseif ($resp.stdout) { $resp.stdout } else { [string]$resp }
                    if ($out -match '(?:PID|pid)[\s:]+(\d+)') { $pid_ = $Matches[1] }
                    elseif ($out -match '\b(\d{2,7})\b') { $pid_ = $Matches[1] }
                }
            }
        } catch {}
        if (-not $pid_) { exit 0 }
        $body = "{`"termId`":`"$($env:MENTAT_TERM_ID)`",`"processId`":`"$processId`",`"pid`":`"$pid_`",`"context`":`"win`"}"
        Post-Json "$base/process" $body
    }
    'process_start' {
        $pid_ = ''; $cmd = ''
        try {
            $d = [Console]::In.ReadToEnd() | ConvertFrom-Json -ErrorAction SilentlyContinue
            if ($d) {
                if (-not ($d.tool_input -and $d.tool_input.run_in_background)) { exit 0 }
                $pid_ = if ($d.tool_use_id) { $d.tool_use_id } else { '' }
                $raw = if ($d.tool_input -and $d.tool_input.command) { $d.tool_input.command } else { '' }
                $cmd = if ($raw.Length -gt 60) { $raw.Substring(0,60) } else { $raw }
            }
        } catch {}
        if (-not $pid_) { exit 0 }
        $cmd = $cmd -replace '"', '\"'
        $body = "{`"termId`":`"$($env:MENTAT_TERM_ID)`",`"processId`":`"$pid_`",`"event`":`"start`",`"command`":`"$cmd`"}"
        Post-Json "$base/process" $body
    }
}
