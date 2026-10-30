import { useState, useEffect } from 'react';
import GeneralTab from './settings/GeneralTab.jsx';
import ConsoleTab from './settings/ConsoleTab.jsx';
import ConnectionTab from './settings/ConnectionTab.jsx';
import AboutTab from './settings/AboutTab.jsx';

const NAV = [
  { id: 'general',    label: 'General' },
  { id: 'git',        label: 'Git' },
  { id: 'console',    label: 'Console' },
  { id: 'connection', label: 'Connection' },
  { id: 'about',      label: 'About' },
];

export default function SettingsModal({ settings, onSettingsChange, shellProfiles = [], onClose }) {
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
            {active === 'general'    && <GeneralTab settings={settings} set={set} shellProfiles={shellProfiles} />}
            {active === 'git'        && <p className="text-[14px] text-[#444]">Git settings will appear here.</p>}
            {active === 'console'    && <ConsoleTab settings={settings} set={set} />}
            {active === 'connection' && <ConnectionTab />}
            {active === 'about'      && <AboutTab />}
          </div>
        </div>
      </div>
    </div>
  );
}
