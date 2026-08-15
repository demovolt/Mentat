import { useState, useEffect, useCallback } from 'react';

const NAV = [
  { id: 'general',    label: 'General' },
  { id: 'git',        label: 'Git' },
  { id: 'console',    label: 'Console' },
  { id: 'connection', label: 'Connection' },
];

const FONTS = [
  { value: "'Ubuntu Mono', 'Consolas', monospace", label: 'Ubuntu Mono' },
  { value: "'JetBrains Mono', monospace",           label: 'JetBrains Mono' },
  { value: "'Cascadia Code', monospace",             label: 'Cascadia Code' },
  { value: "'Fira Code', monospace",                 label: 'Fira Code' },
  { value: "Consolas, monospace",                    label: 'Consolas' },
  { value: "'Courier New', monospace",               label: 'Courier New' },
];

export default function SettingsModal({ settings, onSettingsChange, onClose }) {
  const [active, setActive] = useState('general');

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = (path, value) => {
    const keys = path.split('.');
    if (keys.length === 1) {
      onSettingsChange({ ...settings, [keys[0]]: value });
    } else {
      onSettingsChange({ ...settings, [keys[0]]: { ...settings[keys[0]], [keys[1]]: value } });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[640px] h-[420px] bg-[#161616] border border-[#2a2a2a] rounded-xl shadow-2xl flex overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sidebar */}
        <div className="w-44 shrink-0 bg-[#111] border-r border-[#1c1c1c] flex flex-col py-3 px-2 gap-0.5">
          <p className="text-[11px] text-[#444] uppercase tracking-widest px-2 mb-2">Settings</p>
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => setActive(item.id)}
              className={`w-full text-left px-3 py-1.5 rounded-md text-[13px] transition-colors ${
                active === item.id
                  ? 'bg-[#1e1e1e] text-white'
                  : 'text-[#666] hover:text-[#aaa] hover:bg-[#171717]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-[#1c1c1c] shrink-0">
            <span className="text-[14px] font-semibold text-[#ccc]">
              {NAV.find((n) => n.id === active)?.label}
            </span>
            <button
              onClick={onClose}
              className="w-6 h-6 flex items-center justify-center rounded text-[#555] hover:text-[#aaa] hover:bg-[#222] text-[16px] leading-none transition-colors"
            >
              ×
            </button>
          </div>

          <div className="flex-1 px-5 py-5 overflow-y-auto">
            {active === 'general'    && <GeneralTab settings={settings} set={set} />}
            {active === 'git'        && <GitTab />}
            {active === 'console'    && <ConsoleTab settings={settings} set={set} />}
            {active === 'connection' && <ConnectionTab />}
          </div>
        </div>
      </div>
    </div>
  );
}

function GeneralTab({ settings, set }) {
  const [logPath, setLogPath] = useState('');

  useEffect(() => {
    if (settings.loggingEnabled) {
      window.api.getLogPath().then(p => setLogPath(p || ''));
    }
  }, [settings.loggingEnabled]);

  return (
    <div className="flex flex-col gap-6">
      <Section label="Default AI">
        <div className="flex gap-1 p-0.5 bg-[#0f0f0f] border border-[#222] rounded-lg w-fit">
          {[{ id: 'claude', label: 'Claude' }, { id: 'codex', label: 'Codex' }].map((ai) => (
            <button
              key={ai.id}
              onClick={() => set('ai', ai.id)}
              className={`px-5 py-1.5 rounded-md text-[13px] transition-colors ${
                settings.ai === ai.id
                  ? 'bg-[#7c3aed] text-white'
                  : 'text-[#666] hover:text-[#aaa]'
              }`}
            >
              {ai.label}
            </button>
          ))}
        </div>
      </Section>

      <Section label="Logging">
        <div className="flex flex-col items-end gap-1.5">
          <button
            onClick={() => set('loggingEnabled', !settings.loggingEnabled)}
            className={`relative w-10 h-5 rounded-full transition-colors ${
              settings.loggingEnabled ? 'bg-[#7c3aed]' : 'bg-[#2a2a2a]'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                settings.loggingEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
          {settings.loggingEnabled && logPath && (
            <span className="text-[11px] text-[#444] max-w-[180px] truncate text-right" title={logPath}>
              {logPath}
            </span>
          )}
        </div>
      </Section>
    </div>
  );
}

function ConsoleTab({ settings, set }) {
  const c = settings.console;
  return (
    <div className="flex flex-col gap-6">
      <Section label="Font">
        <select
          value={c.fontFamily}
          onChange={(e) => set('console.fontFamily', e.target.value)}
          className="bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg px-3 py-1.5 text-[13px] text-[#ccc] focus:outline-none focus:border-[#7c3aed] transition-colors cursor-pointer"
        >
          {FONTS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </Section>

      <Section label="Font Size">
        <input
          type="number"
          min="8"
          max="32"
          value={c.fontSize}
          onChange={(e) => set('console.fontSize', parseInt(e.target.value, 10) || c.fontSize)}
          className="w-20 bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg px-3 py-1.5 text-[13px] text-[#ccc] focus:outline-none focus:border-[#7c3aed] transition-colors"
        />
      </Section>

      <Section label="Line Height">
        <input
          type="number"
          min="1.0"
          max="3.0"
          step="0.1"
          value={c.lineHeight}
          onChange={(e) => set('console.lineHeight', parseFloat(e.target.value) || c.lineHeight)}
          className="w-20 bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg px-3 py-1.5 text-[13px] text-[#ccc] focus:outline-none focus:border-[#7c3aed] transition-colors"
        />
      </Section>
    </div>
  );
}

function GitTab() {
  return (
    <p className="text-[14px] text-[#444]">Настройки Git появятся здесь.</p>
  );
}

const TEST_STATUSES = [
  { id: 'thinking', label: 'Think', color: 'text-blue-500' },
  { id: 'working',  label: 'Work',  color: 'text-green-500' },
  { id: 'waiting',  label: 'Wait',  color: 'text-yellow-400' },
  { id: 'idle',     label: 'Idle',  color: 'text-[#555]' },
];

function ConnectionTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [testResults, setTestResults] = useState({});

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await window.api.checkConnection();
    setData(result);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const testStatus = async (status) => {
    setTestResults(prev => ({ ...prev, [status]: 'pending' }));
    const result = await window.api.sendTestStatus(status);
    setTestResults(prev => ({ ...prev, [status]: result.ok ? 'ok' : 'fail' }));
    setTimeout(() => setTestResults(prev => { const n = { ...prev }; delete n[status]; return n; }), 2000);
  };

  const groups = data ? [...new Set(data.scripts.map(s => s.group))] : [];

  return (
    <div className="flex flex-col gap-5">
      {/* Server */}
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

      {/* Scripts */}
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

      {/* Test statuses */}
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

function Section({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <label className="text-[13px] text-[#666] shrink-0">{label}</label>
      {children}
    </div>
  );
}
