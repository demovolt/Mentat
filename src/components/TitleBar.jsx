export default function TitleBar({ activeWorktreePath, onGit, repoPath, onPrune, isPruning, onAddRepo, onSettings }) {
  return (
    <div
      className="flex items-center justify-between h-9 px-3 shrink-0 bg-[#0a0a0a] border-b border-[#1c1c1c]"
      style={{ WebkitAppRegion: 'drag' }}
    >
      <div className="flex items-center gap-3">
        <span className="text-[12px] font-bold tracking-[0.2em] text-[#7c3aed] uppercase">
          Mentat
        </span>
        <div style={{ WebkitAppRegion: 'no-drag' }}>
          <button
            onClick={onAddRepo}
            title="Add repository"
            className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[12px] transition-colors
              text-[#666] hover:text-[#a78bfa] hover:bg-[#1e1e1e] cursor-pointer"
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="7" y1="1" x2="7" y2="13" />
              <line x1="1" y1="7" x2="13" y2="7" />
            </svg>
            Add Repository
          </button>
        </div>
        <div style={{ WebkitAppRegion: 'no-drag' }}>
          <button
            onClick={onGit}
            disabled={!activeWorktreePath}
            title="Git pipeline"
            className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[12px] transition-colors
              disabled:opacity-25 disabled:cursor-not-allowed
              text-[#666] hover:text-[#a78bfa] hover:bg-[#1e1e1e] enabled:cursor-pointer"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="5" cy="3" r="1.5" />
              <circle cx="5" cy="13" r="1.5" />
              <circle cx="11" cy="5" r="1.5" />
              <line x1="5" y1="4.5" x2="5" y2="11.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M5 4.5 Q5 8 11 6.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
            </svg>
            Git
          </button>
        </div>
        <div style={{ WebkitAppRegion: 'no-drag' }}>
          <button
            onClick={onPrune}
            disabled={!repoPath || isPruning}
            title="Удалить воркфри смёрженных веток"
            className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[12px] transition-colors
              disabled:opacity-25 disabled:cursor-not-allowed
              text-[#666] hover:text-[#a78bfa] hover:bg-[#1e1e1e] enabled:cursor-pointer"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 13 L13 3" strokeLinecap="round" />
              <path d="M2 14 Q4 11 6 13 Q8 15 5 15 Z" fill="currentColor" stroke="none" />
            </svg>
            {isPruning ? '…' : 'Prune'}
          </button>
        </div>
        <div style={{ WebkitAppRegion: 'no-drag' }}>
          <button
            onClick={onSettings}
            title="Settings"
            className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[12px] transition-colors
              text-[#666] hover:text-[#a78bfa] hover:bg-[#1e1e1e] cursor-pointer"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path fillRule="evenodd" d="M8 1 10 3.2 13 3.1 12.8 6 15 8 12.8 10 13 12.9 10 12.8 8 15 6 12.8 3 12.9 3.2 10 1 8 3.2 6 3 3.1 6 3.2Z M10.5 8A2.5 2.5 0 1 0 5.5 8A2.5 2.5 0 1 0 10.5 8Z" />
            </svg>
            Settings
          </button>
        </div>
      </div>

      <div
        className="flex items-center gap-0.5"
        style={{ WebkitAppRegion: 'no-drag' }}
      >
        <WinBtn onClick={() => window.api.minimize()} title="Minimize">
          <rect x="2" y="7" width="10" height="1.5" rx="0.75" fill="currentColor" />
        </WinBtn>
        <WinBtn onClick={() => window.api.toggleMaximize()} title="Maximize">
          <rect x="2" y="2" width="10" height="10" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </WinBtn>
        <WinBtn onClick={() => window.api.close()} title="Close" danger>
          <line x1="3" y1="3" x2="11" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="11" y1="3" x2="3" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </WinBtn>
      </div>
    </div>
  );
}

function WinBtn({ onClick, title, danger, children }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-7 h-7 rounded flex items-center justify-center transition-colors ${
        danger
          ? 'text-[#555] hover:text-[#ef4444] hover:bg-[#2a1414]'
          : 'text-[#555] hover:text-[#aaa] hover:bg-[#1e1e1e]'
      }`}
    >
      <svg width="14" height="14" viewBox="0 0 14 14">{children}</svg>
    </button>
  );
}
