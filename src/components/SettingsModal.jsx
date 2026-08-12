import { useState, useEffect } from 'react';

const NAV = [
  { id: 'general', label: 'General' },
  { id: 'git',     label: 'Git' },
  { id: 'console', label: 'Console' },
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
            {active === 'general' && <GeneralTab settings={settings} set={set} />}
            {active === 'git'     && <GitTab />}
            {active === 'console' && <ConsoleTab settings={settings} set={set} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function GeneralTab({ settings, set }) {
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

function Section({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <label className="text-[13px] text-[#666] shrink-0">{label}</label>
      {children}
    </div>
  );
}
