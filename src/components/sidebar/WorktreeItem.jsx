import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { BranchIcon, TerminalIndicator, StatusDot, AgentTreeItem } from './SidebarIcons.jsx';
import DropMenuItem from './DropMenuItem.jsx';

export default function WorktreeItem({ wt, active, customName, wtTerminals, terminalStatuses, terminalSessionActive, terminalAgents, onClick, onRemoveWorktree, onDeleteBranch, onRemoveBoth, onRename }) {
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const dotsRef = useRef(null);
  const dropdownRef = useRef(null);
  const renameInputRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (!dotsRef.current?.contains(e.target) && !dropdownRef.current?.contains(e.target)) {
        setMenuOpen(false);
        setHovered(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  useEffect(() => {
    if (isRenaming) renameInputRef.current?.focus();
  }, [isRenaming]);

  const handleDotsClick = (e) => {
    e.stopPropagation();
    const rect = dotsRef.current.getBoundingClientRect();
    setMenuPos({ top: rect.top, left: rect.right + 4 });
    setMenuOpen(m => !m);
  };

  const close = () => { setMenuOpen(false); setHovered(false); };

  const startRename = () => {
    close();
    setRenameValue(customName || wt.branch || '');
    setIsRenaming(true);
  };

  const commitRename = () => {
    const name = renameValue.trim();
    onRename(name || null);
    setIsRenaming(false);
  };

  const cancelRename = () => setIsRenaming(false);

  const folderName = wt.path?.replace(/\\/g, '/').split('/').filter(Boolean).pop() || '(detached)';
  const displayName = customName || folderName;

  return (
    <div
      onClick={isRenaming ? undefined : onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { if (!menuOpen) setHovered(false); }}
      className={`relative flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer transition-colors border ${
        active
          ? 'bg-[#1a1130] border-[#7c3aed] text-white'
          : 'bg-[#191919] border-[#252525] text-[#888] hover:border-[#333] hover:text-[#ccc]'
      }`}
    >
      <div className="flex-1 min-w-0" onClick={(e) => isRenaming && e.stopPropagation()}>
        {isRenaming ? (
          <input
            ref={renameInputRef}
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
              if (e.key === 'Escape') { e.preventDefault(); cancelRename(); }
            }}
            onBlur={commitRename}
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-[#0f0f0f] border border-[#7c3aed] rounded px-1.5 py-0.5 text-[14px] text-white focus:outline-none"
          />
        ) : (
          <>
            <div className="text-[14px] font-medium truncate leading-tight">
              {displayName}
            </div>
            {wt.branch && (
              <div className="flex items-center gap-1 mt-0.5">
                <BranchIcon />
                <span className="text-[12px] text-[#555] truncate leading-tight">{wt.branch}</span>
              </div>
            )}
          </>
        )}
        {!isRenaming && wtTerminals.length > 0 && (
          <div className="flex items-start w-full mt-1">
            {wtTerminals.map(t => {
              const agents = terminalAgents?.[t.id] || [];
              if (!terminalSessionActive[t.id]) return <TerminalIndicator key={t.id} />;
              return (
                <div key={t.id} className="flex-1 flex flex-col min-w-0">
                  <div className="flex">
                    <StatusDot status={terminalStatuses[t.id]} />
                  </div>
                  {agents.map((agent) => (
                    <AgentTreeItem key={agent.agentId} agent={agent} />
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {!isRenaming && (hovered || menuOpen) && (
        <button
          ref={dotsRef}
          onClick={handleDotsClick}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center rounded text-[#555] hover:text-[#aaa] hover:bg-[#222] transition-colors text-[10px] leading-none tracking-tighter"
        >
          •••
        </button>
      )}
      {menuOpen && createPortal(
        <div
          ref={dropdownRef}
          style={{ position: 'fixed', top: menuPos.top, left: menuPos.left }}
          className="z-[9999] w-36 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg shadow-xl py-1"
        >
          <DropMenuItem onClick={(e) => { e.stopPropagation(); startRename(); }}>
            Rename
          </DropMenuItem>
          <div className="my-1 border-t border-[#222]" />
          <DropMenuItem submenu={(
            <>
              <DropMenuItem onClick={(e) => { e.stopPropagation(); close(); onRemoveWorktree(); }}>Воркфри</DropMenuItem>
              <DropMenuItem onClick={(e) => { e.stopPropagation(); close(); onDeleteBranch(); }}>Ветку</DropMenuItem>
              <DropMenuItem danger onClick={(e) => { e.stopPropagation(); close(); onRemoveBoth(); }}>Воркфри + ветку</DropMenuItem>
            </>
          )}>
            Удалить
          </DropMenuItem>
        </div>,
        document.body
      )}
    </div>
  );
}
