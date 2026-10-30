import { useState, useEffect } from 'react';

export default function AboutTab() {
  const [version, setVersion] = useState('...');

  useEffect(() => {
    window.api.getVersion().then(v => setVersion(v || '—'));
  }, []);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-[#7c3aed] flex items-center justify-center shrink-0">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5">
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
        </div>
        <div>
          <p className="text-[15px] font-semibold text-white">Mentat</p>
          <p className="text-[12px] text-[#555] mt-0.5">Version {version}</p>
        </div>
      </div>

      <div className="border-t border-[#1c1c1c]" />

      <div className="flex flex-col gap-3">
        <Row label="Build" value={version} />
        <Row label="Electron" value={typeof process !== 'undefined' ? process.versions?.electron : '—'} />
        <Row label="Node" value={typeof process !== 'undefined' ? process.versions?.node : '—'} />
        <Row label="Chrome" value={typeof process !== 'undefined' ? process.versions?.chrome : '—'} />
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[13px] text-[#555]">{label}</span>
      <span className="text-[13px] text-[#888] font-mono">{value || '—'}</span>
    </div>
  );
}
