import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

export default function Sidebar({
  workspace = [],
  worktreesMap = {},
  activePath,
  onAddRepo,
  onRemoveRepo,
  onSelectWorktree,
  onRemoveWorktree,
  onDeleteBranch,
  onRemoveBoth,
  onRenameWorktree,
  onNewWorktree,
  terminals = [],
  terminalStatuses = {},
  worktreeNames = {},
}) {
  const [collapsed, setCollapsed] = useState({});

  const toggleCollapsed = (repoPath) => {
    setCollapsed(prev => ({ ...prev, [repoPath]: !prev[repoPath] }));
  };

  return (
    <div className="w-56 shrink-0 flex flex-col bg-[#111] border-r border-[#1c1c1c]">
      <div className="flex-1 overflow-y-auto py-2">
        {workspace.length === 0 ? (
          <p className="text-[11px] text-[#333] text-center mt-10 px-4 leading-relaxed">
            Add a repository<br />to get started
          </p>
        ) : (
          workspace.map(repo => (
            <RepoSection
              key={repo.path}
              repo={repo}
              worktrees={worktreesMap[repo.path] || []}
              activePath={activePath}
              collapsed={!!collapsed[repo.path]}
              onToggle={() => toggleCollapsed(repo.path)}
              onRemoveRepo={() => onRemoveRepo(repo.path)}
              onSelectWorktree={onSelectWorktree}
              onRemoveWorktree={(wtp) => onRemoveWorktree(wtp, repo.path)}
              onDeleteBranch={(wtp) => onDeleteBranch(wtp, repo.path)}
              onRemoveBoth={(wtp) => onRemoveBoth(wtp, repo.path)}
              onRenameWorktree={onRenameWorktree}
              onNewWorktree={() => onNewWorktree(repo.path)}
              terminals={terminals}
              terminalStatuses={terminalStatuses}
              worktreeNames={worktreeNames}
            />
          ))
        )}
      </div>

      <div className="px-3 py-3 border-t border-[#1c1c1c]">
        <button
          onClick={onAddRepo}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md border border-[#2a2a2a] text-[#555] hover:text-[#ccc] hover:border-[#7c3aed33] text-[13px] transition-colors"
        >
          <PlusIcon />
          Add Repository
        </button>
      </div>
    </div>
  );
}

const REPO_COLORS = [
  '#a78bfa', '#34d399', '#60a5fa', '#f97316',
  '#f472b6', '#facc15', '#2dd4bf', '#fb7185',
];

function repoColor(path) {
  let h = 0;
  for (let i = 0; i < path.length; i++) h = (h * 31 + path.charCodeAt(i)) & 0xffffffff;
  return REPO_COLORS[Math.abs(h) % REPO_COLORS.length];
}

function RepoSection({
  repo, worktrees, activePath, collapsed, onToggle, onRemoveRepo,
  onSelectWorktree, onRemoveWorktree, onDeleteBranch, onRemoveBoth, onRenameWorktree, onNewWorktree,
  terminals, terminalStatuses, worktreeNames,
}) {
  const [hovered, setHovered] = useState(false);
  const repoName = repo.path.replace(/\\/g, '/').split('/').filter(Boolean).pop();
  const color = repoColor(repo.path);

  return (
    <div className="mb-1">
      <div
        className="flex items-center gap-1.5 px-2 py-1.5 mx-1 rounded-md cursor-pointer hover:bg-[#181818]"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={onToggle}
      >
        <div className="shrink-0 w-0.5 h-3.5 rounded-full" style={{ backgroundColor: color }} />
        <ChevronIcon collapsed={collapsed} />
        <span
          className="text-[12px] text-white font-semibold truncate flex-1"
          title={repo.path}
        >
          {repoName}
        </span>
        {hovered && (
          <button
            onClick={(e) => { e.stopPropagation(); onRemoveRepo(); }}
            title="Remove from workspace"
            className="shrink-0 w-4 h-4 flex items-center justify-center text-[#444] hover:text-[#f87171] text-[16px] leading-none transition-colors"
          >
            ×
          </button>
        )}
      </div>

      {!collapsed && (
        <div className="pl-3 pr-2 space-y-0.5 mt-0.5">
          {worktrees.map(wt => (
            <WorktreeItem
              key={wt.path}
              wt={wt}
              active={wt.path === activePath}
              customName={worktreeNames[wt.path] || null}
              wtTerminals={terminals.filter(t => t.worktreePath === wt.path)}
              terminalStatuses={terminalStatuses}
              onClick={() => onSelectWorktree(wt)}
              onRemoveWorktree={() => onRemoveWorktree(wt.path)}
              onDeleteBranch={() => onDeleteBranch(wt.path)}
              onRemoveBoth={() => onRemoveBoth(wt.path)}
              onRename={(name) => onRenameWorktree(wt.path, name)}
            />
          ))}
          <button
            onClick={onNewWorktree}
            className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[#3a3a3a] hover:text-[#666] text-[11px] transition-colors"
          >
            <PlusIcon />
            New Worktree
          </button>
        </div>
      )}
    </div>
  );
}

function WorktreeItem({ wt, active, customName, wtTerminals, terminalStatuses, onClick, onRemoveWorktree, onDeleteBranch, onRemoveBoth, onRename }) {
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

  const displayName = customName || wt.branch || '(detached)';

  return (
    <div
      onClick={isRenaming ? undefined : onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { if (!menuOpen) setHovered(false); }}
      className={`relative flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer transition-colors ${
        active
          ? 'bg-[#1a1130] text-white'
          : 'text-[#888] hover:bg-[#181818] hover:text-[#ccc]'
      }`}
    >
      {active && (
        <div className="absolute left-0 inset-y-1.5 w-0.5 bg-[#7c3aed] rounded-full" />
      )}
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
            className="w-full bg-[#0f0f0f] border border-[#7c3aed] rounded px-1.5 py-0.5 text-[12px] text-white focus:outline-none"
          />
        ) : (
          <div className="text-[12px] font-medium truncate leading-tight" title={customName ? wt.branch : undefined}>
            {displayName}
          </div>
        )}
        {!isRenaming && (
          <div className="flex items-center gap-1 mt-1">
            {wtTerminals.length > 0
              ? wtTerminals.map(t => <StatusDot key={t.id} status={terminalStatuses[t.id]} />)
              : <StatusDot status={null} />
            }
          </div>
        )}
      </div>
      {!isRenaming && (hovered || menuOpen) && (
        <button
          ref={dotsRef}
          onClick={handleDotsClick}
          className="shrink-0 w-4 h-4 flex items-center justify-center rounded text-[#555] hover:text-[#aaa] hover:bg-[#222] transition-colors text-[10px] leading-none tracking-tighter"
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

function DropMenuItem({ onClick, danger, children, submenu }) {
  const [subOpen, setSubOpen] = useState(false);

  if (submenu) {
    return (
      <div
        className="relative"
        onMouseEnter={() => setSubOpen(true)}
        onMouseLeave={() => setSubOpen(false)}
      >
        <button
          onClick={(e) => e.stopPropagation()}
          className="w-full text-left px-3 py-1 text-[11px] text-[#aaa] hover:bg-[#222] hover:text-[#ccc] transition-colors flex items-center justify-between"
        >
          {children}
          <span className="text-[#555] ml-2">›</span>
        </button>
        {subOpen && (
          <div className="absolute left-full top-0 ml-1 w-36 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg shadow-xl py-1">
            {submenu}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-1 text-[11px] transition-colors ${
        danger ? 'text-[#f87171] hover:bg-[#2a1414]' : 'text-[#aaa] hover:bg-[#222] hover:text-[#ccc]'
      }`}
    >
      {children}
    </button>
  );
}

function ChevronIcon({ collapsed }) {
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


function PlusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="7" y1="1" x2="7" y2="13" />
      <line x1="1" y1="7" x2="13" y2="7" />
    </svg>
  );
}

function StatusDot({ status }) {
  const styles = {
    working:  { cls: 'bg-green-500',  title: 'Claude работает' },
    thinking: { cls: 'bg-blue-500',   title: 'Claude думает' },
    waiting:  { cls: 'bg-yellow-400', title: 'Claude ожидает разрешения' },
  };
  const s = styles[status];
  return (
    <span
      title={s ? s.title : 'Claude ожидает'}
      className={`shrink-0 w-2 h-2 rounded-full ${s ? s.cls : 'bg-[#444]'}`}
    />
  );
}
