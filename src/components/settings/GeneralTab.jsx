import { useState, useEffect } from 'react';

const AI_OPTIONS = [{ id: 'claude', label: 'Claude' }, { id: 'codex', label: 'Codex' }];

function Section({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <label className="text-[13px] text-[#666] shrink-0">{label}</label>
      {children}
    </div>
  );
}

export default function GeneralTab({ settings, set }) {
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
          {AI_OPTIONS.map((ai) => (
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
