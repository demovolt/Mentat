export function ChevronIcon({ collapsed }) {
  return (
    <svg
      width="10" height="10"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      className="shrink-0 text-[#444] transition-transform"
      style={{ transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
    >
      <polyline points="2,3 5,7 8,3" />
    </svg>
  );
}

export function BranchIcon() {
  return (
    <svg width="9" height="10" viewBox="0 0 9 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[#555]">
      <circle cx="2" cy="2" r="1" />
      <circle cx="2" cy="8" r="1" />
      <circle cx="7" cy="4" r="1" />
      <line x1="2" y1="3" x2="2" y2="7" />
      <path d="M2 3 Q2 4 7 4" />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="7" y1="1" x2="7" y2="13" />
      <line x1="1" y1="7" x2="13" y2="7" />
    </svg>
  );
}

export function TerminalIndicator() {
  return (
    <span className="flex-1 flex items-center gap-1">
      <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[#444]">
        <polyline points="2 4 6 6 2 8" />
        <line x1="7" y1="8" x2="11" y2="8" />
      </svg>
      <span className="text-[12px] leading-none text-[#444]">Term</span>
    </span>
  );
}

export function AgentTreeItem({ agent }) {
  return (
    <div className="flex flex-col">
      <div className="w-px h-2 bg-[#2a2a2a] ml-[2.5px]" />
      <div className="flex items-center gap-1 min-w-0">
        <span className="w-1.5 h-1.5 rounded-full bg-[#7c3aed] shrink-0" />
        <span className="text-[11px] leading-none text-[#555]">
          Agent
        </span>
      </div>
    </div>
  );
}

export function ProcessTreeItem({ process }) {
  return (
    <div className="flex flex-col">
      <div className="w-px h-2 bg-[#2a2a2a] ml-[2.5px]" />
      <div className="flex items-center gap-1 min-w-0">
        <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
        <span className="text-[11px] leading-none text-[#555]">Proc</span>
      </div>
    </div>
  );
}

export function StatusDot({ status }) {
  const styles = {
    working:  { dot: 'bg-green-500',  text: 'text-green-500',  label: 'Work' },
    thinking: { dot: 'bg-blue-500',   text: 'text-blue-500',   label: 'Think' },
    waiting:  { dot: 'bg-yellow-400', text: 'text-yellow-400', label: 'Wait' },
  };
  const s = styles[status];
  return (
    <span className="flex-1 flex items-center gap-1">
      <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${s ? s.dot : 'bg-[#444]'}`} />
      <span className={`text-[12px] leading-none ${s ? s.text : 'text-[#444]'}`}>
        {s ? s.label : 'Idle'}
      </span>
    </span>
  );
}
