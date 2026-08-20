#!/bin/bash
action="$1"
[ -z "$MENTAT_TERM_ID" ] && exit 0
h="${MENTAT_STATUS_HOST:-127.0.0.1}"
port="${MENTAT_STATUS_PORT:-27182}"
base="http://$h:$port"
case "$action" in
  thinking|working|idle|waiting|session_stop)
    curl -sf -m 2 -X POST "$base/status" \
      -H 'Content-Type: application/json' \
      -d "{\"termId\":\"$MENTAT_TERM_ID\",\"status\":\"$action\"}" 2>/dev/null || true
    ;;
  session_start)
    python3 -c "
import sys,json,os
d=json.load(sys.stdin)
print(json.dumps({'termId':os.environ['MENTAT_TERM_ID'],'status':'session_start','sessionId':d.get('session_id','')}))" \
      2>/dev/null | curl -sf -m 2 -X POST "$base/status" \
      -H 'Content-Type: application/json' --data-binary @- 2>/dev/null || true
    ;;
  agent_start)
    python3 -c "
import sys,json,os
d=json.load(sys.stdin)
aid=d.get('tool_use_id') or d.get('agent_id','')
desc=(d.get('tool_input',{}).get('description','') or str(d.get('agent_type','')))[:60]
print(json.dumps({'termId':os.environ['MENTAT_TERM_ID'],'agentId':aid,'event':'start','description':desc}))" \
      2>/dev/null | curl -sf -m 2 -X POST "$base/agent" \
      -H 'Content-Type: application/json' --data-binary @- 2>/dev/null || true
    ;;
  agent_stop)
    python3 -c "
import sys,json,os
d=json.load(sys.stdin)
aid=d.get('tool_use_id') or d.get('agent_id','')
print(json.dumps({'termId':os.environ['MENTAT_TERM_ID'],'agentId':aid,'event':'stop'}))" \
      2>/dev/null | curl -sf -m 2 -X POST "$base/agent" \
      -H 'Content-Type: application/json' --data-binary @- 2>/dev/null || true
    ;;
esac
