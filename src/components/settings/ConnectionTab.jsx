import { useState, useEffect, useCallback } from 'react';

const TEST_STATUSES = [
  { id: 'thinking', label: 'Think', color: 'text-blue-500' },
  { id: 'working',  label: 'Work',  color: 'text-green-500' },
  { id: 'waiting',  label: 'Wait',  color: 'text-yellow-400' },
  { id: 'idle',     label: 'Idle',  color: 'text-[#555]' },
];

export default function ConnectionTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [testResults, setTestResults] = useState({});
  const [installing, setInstalling] = useState(false);
  const [installResults, setInstallResults] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await window.api.checkConnection();
    setData(result);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const testStatus = async (status) => {
    setTestResults(prev => ({ ...prev, [status]: 'pending' }));
    const result = await window.api.sendTestStatus(status);
    setTestResults(prev => ({ ...prev, [status]: result.ok ? 'ok' : 'fail' }));
    setTimeout(() => setTestResults(prev => { const n = { ...prev }; delete n[status]; return n; }), 2000);
  };

  const installHooks = async () => {
    setInstalling(true);
    setInstallResults(null);
    const result = await window.api.installHooks();
    setInstallResults(result);
    setInstalling(false);
    if (result.ok) refresh();
  };

  const groups = data ? [...new Set(data.scripts.map(s => s.group))] : [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-[#555] uppercase tracking-wider">Status Server</span>
          <button
            onClick={refresh}
            disabled={loading}
            title="Refresh"
            className="text-[#444] hover:text-[#888] transition-colors disabled:opacity-40"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
              className={loading ? 'animate-spin' : ''}>
              <path d="M13.5 8A5.5 5.5 0 1 1 10 3" />
              <polyline points="10 1 10 4 13 4" />
            </svg>
          </button>
        </div>
        <div className="flex items-center gap-2.5 px-3 py-2 bg-[#0f0f0f] border border-[#1c1c1c] rounded-lg">
          {data ? (
            <>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${data.serverRunning ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-[12px] text-[#aaa]">
                {data.serverRunning ? 'Running on :27182' : 'Not reachable on :27182'}
              </span>
            </>
          ) : (
            <span className="text-[12px] text-[#444]">Checking…</span>
          )}
        </div>
      </div>

      {data && (
        <div className="flex flex-col gap-3">
          <span className="text-[11px] text-[#555] uppercase tracking-wider">Scripts</span>
          {groups.map(group => (
            <div key={group}>
              <p className="text-[11px] text-[#444] mb-1.5 pl-0.5">{group}</p>
              <div className="flex flex-col gap-0.5">
                {data.scripts.filter(s => s.group === group).map(s => (
                  <div key={s.id} className="flex items-center gap-2.5 px-3 py-1.5 bg-[#0f0f0f] border border-[#1c1c1c] rounded-md">
                    <span className={`text-[12px] font-mono shrink-0 ${s.exists ? 'text-green-500' : 'text-red-500'}`}>
                      {s.exists ? '✓' : '✗'}
                    </span>
                    <span className="text-[12px] text-[#666]">{s.label}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <span className="text-[11px] text-[#555] uppercase tracking-wider">Hooks</span>
        <button
          onClick={installHooks}
          disabled={installing}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-[#7c3aed] hover:bg-[#6d28d9] disabled:opacity-50 disabled:cursor-not-allowed text-white text-[13px] rounded-lg transition-colors"
        >
          {installing ? (
            <>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="animate-spin">
                <path d="M13.5 8A5.5 5.5 0 1 1 10 3" /><polyline points="10 1 10 4 13 4" />
              </svg>
              Installing…
            </>
          ) : 'Install hooks'}
        </button>
        {installResults && (
          <div className="flex flex-col gap-0.5 mt-1">
            {installResults.results.map((r, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-[#0f0f0f] border border-[#1c1c1c] rounded-md">
                <span className={`text-[12px] font-mono shrink-0 ${r.ok ? 'text-green-500' : 'text-red-500'}`}>
                  {r.ok ? '✓' : '✗'}
                </span>
                <span className="text-[12px] text-[#666] truncate flex-1">{r.label}</span>
                {r.error && <span className="text-[11px] text-red-400 truncate max-w-[120px]" title={r.error}>{r.error}</span>}
              </div>
            ))}
            {!installResults.error && installResults.results.every(r => r.ok) && (
              <p className="text-[11px] text-green-500 mt-1 pl-0.5">All hooks installed successfully</p>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[11px] text-[#555] uppercase tracking-wider">Test Statuses</span>
        <div className="flex gap-2">
          {TEST_STATUSES.map(({ id, label, color }) => {
            const res = testResults[id];
            return (
              <button
                key={id}
                onClick={() => testStatus(id)}
                disabled={res === 'pending'}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0f0f0f] border border-[#1c1c1c] rounded-lg text-[12px] text-[#666] hover:border-[#333] hover:text-[#aaa] transition-colors disabled:opacity-50"
              >
                <span className={color}>●</span>
                {label}
                {res === 'pending' && <span className="text-[#444] text-[10px]">…</span>}
                {res === 'ok'      && <span className="text-green-500 text-[10px]">✓</span>}
                {res === 'fail'    && <span className="text-red-500 text-[10px]">✗</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
