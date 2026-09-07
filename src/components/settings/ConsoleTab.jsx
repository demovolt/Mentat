const FONTS = [
  { value: "'Ubuntu Mono', 'Consolas', monospace", label: 'Ubuntu Mono' },
  { value: "'JetBrains Mono', monospace",           label: 'JetBrains Mono' },
  { value: "'Cascadia Code', monospace",             label: 'Cascadia Code' },
  { value: "'Fira Code', monospace",                 label: 'Fira Code' },
  { value: "Consolas, monospace",                    label: 'Consolas' },
  { value: "'Courier New', monospace",               label: 'Courier New' },
];

function Section({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <label className="text-[13px] text-[#666] shrink-0">{label}</label>
      {children}
    </div>
  );
}

export default function ConsoleTab({ settings, set }) {
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

      <Section label="GPU Only">
        <button
          onClick={() => set('console.gpuOnly', !c.gpuOnly)}
          className={`relative w-10 h-5 rounded-full transition-colors ${c.gpuOnly ? 'bg-[#7c3aed]' : 'bg-[#2a2a2a]'}`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${c.gpuOnly ? 'translate-x-5' : 'translate-x-0'}`}
          />
        </button>
      </Section>
    </div>
  );
}
