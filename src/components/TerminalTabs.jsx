import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const STATUS_DOT = {
  working:  'bg-green-500',
  thinking: 'bg-blue-500',
  waiting:  'bg-yellow-400',
};

export default function TerminalTabs({ tabs, activeId, onSelect, onClose, onNew, onNewAi, shellProfiles = [], terminalStatuses = {}, terminalSessionActive = {} }) {
  const [menuPos, setMenuPos] = useState(null);
  const chevronRef = useRef(null);

  useEffect(() => {
    if (!menuPos) return;
    const handler = (e) => {
      if (!chevronRef.current?.contains(e.target)) setMenuPos(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuPos]);

  const toggleMenu = () => {
    if (menuPos) { setMenuPos(null); return; }
    const rect = chevronRef.current?.getBoundingClientRect();
    if (rect) setMenuPos({ top: rect.bottom + 2, right: window.innerWidth - rect.right });
  };

  return (
    <div className="flex items-center h-8 bg-[#0a0a0a] border-b border-[#1c1c1c] overflow-x-auto shrink-0">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          onClick={() => onSelect(tab.id)}
          className={`flex items-center gap-1.5 px-3 h-8 cursor-pointer border-r border-[#1c1c1c] text-[12px] group shrink-0 select-none transition-colors ${
            tab.id === activeId
              ? 'bg-[#0f0f0f] text-[#ddd]'
              : 'text-[#555] hover:text-[#999] hover:bg-[#0d0d0d]'
          }`}
        >
          {tab.type === 'ai' ? (
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              terminalSessionActive[tab.id]
                ? (STATUS_DOT[terminalStatuses[tab.id]] || 'bg-[#555]')
                : 'bg-[#7c3aed]'
            }`} />
          ) : (
            <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[#444]">
              <polyline points="2 4 6 6 2 8" />
              <line x1="7" y1="8" x2="11" y2="8" />
            </svg>
          )}
          <span>{tab.label}</span>
          <button
            onClick={(e) => { e.stopPropagation(); onClose(tab.id); }}
            className={`w-4 h-4 flex items-center justify-center rounded text-[14px] leading-none transition-colors ${
              tab.id === activeId
                ? 'text-[#555] hover:text-[#f87171] hover:bg-[#2a1414]'
                : 'text-transparent group-hover:text-[#444] hover:!text-[#f87171]'
            }`}
          >
            ×
          </button>
        </div>
      ))}

      <div className="flex items-center shrink-0 ml-auto">
        {/* + AI split button */}
        {onNewAi && (
          <div className="flex items-center border-l border-[#1c1c1c]">
            <button
              onClick={onNewAi}
              title="New AI tab"
              className="px-2 h-8 text-[11px] text-[#555] hover:text-[#a78bfa] transition-colors font-medium"
            >
              + AI
            </button>
            <button
              disabled
              className="px-1 h-8 text-[#2a2a2a] cursor-default"
            >
              <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
                <path d="M0 2 L4 6 L8 2Z" />
              </svg>
            </button>
          </div>
        )}

        {/* + Term split button */}
        <div className="flex items-center border-l border-[#1c1c1c]">
          <button
            onClick={() => onNew()}
            title="New terminal"
            className="px-2 h-8 text-[11px] text-[#555] hover:text-[#aaa] transition-colors font-medium"
          >
            + Term
          </button>
          {shellProfiles.length > 1 ? (
            <button
              ref={chevronRef}
              onClick={toggleMenu}
              title="Select shell"
              className="px-1.5 h-8 text-[#333] hover:text-[#888] transition-colors"
            >
              <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
                <path d="M0 2 L4 6 L8 2Z" />
              </svg>
            </button>
          ) : (
            <button
              disabled
              className="px-1.5 h-8 text-[#2a2a2a] cursor-default"
            >
              <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
                <path d="M0 2 L4 6 L8 2Z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {menuPos && createPortal(
        <div
          style={{ position: 'fixed', top: menuPos.top, right: menuPos.right, zIndex: 9999 }}
          className="bg-[#161616] border border-[#2a2a2a] rounded-lg shadow-xl min-w-[160px] py-1"
        >
          {shellProfiles.map(profile => (
            <button
              key={profile.id}
              onMouseDown={(e) => { e.stopPropagation(); setMenuPos(null); onNew(profile.id); }}
              className="w-full text-left px-3 py-1.5 text-[14px] text-[#888] hover:text-white hover:bg-[#1c1c1c] transition-colors"
            >
              {profile.name}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
