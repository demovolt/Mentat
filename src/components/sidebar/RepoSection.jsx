import { useState, useMemo, memo } from 'react';
import { ChevronIcon, PlusIcon } from './SidebarIcons.jsx';
import WorktreeItem from './WorktreeItem.jsx';

function RepoSection({
  repo, worktrees, activePath, collapsed, onToggle, onRemoveRepo,
  onSelectWorktree, onRemoveWorktree, onDeleteBranch, onRemoveBoth, onRenameWorktree, onNewWorktree,
  terminals, terminalStatuses, terminalSessionActive, terminalAgents, worktreeNames,
}) {
  const [hovered, setHovered] = useState(false);
  const repoName = repo.path.replace(/\\/g, '/').split('/').filter(Boolean).pop();

  const terminalsByWorktree = useMemo(() => {
    const map = new Map();
    for (const t of terminals) {
      if (!map.has(t.worktreePath)) map.set(t.worktreePath, []);
      map.get(t.worktreePath).push(t);
    }
    return map;
  }, [terminals]);

  // Pre-compute per-worktree callbacks so they're stable between status updates
  const worktreeItems = useMemo(() =>
    worktrees.map(wt => ({
      wt,
      wtTerminals: terminalsByWorktree.get(wt.path) || [],
      onClick: () => onSelectWorktree(wt),
      onRemoveWorktree: () => onRemoveWorktree(wt.path, repo.path),
      onDeleteBranch: () => onDeleteBranch(wt.path, repo.path),
      onRemoveBoth: () => onRemoveBoth(wt.path, repo.path),
      onRename: (name) => onRenameWorktree(wt.path, name),
    })),
    [worktrees, terminalsByWorktree, repo.path, onSelectWorktree, onRemoveWorktree, onDeleteBranch, onRemoveBoth, onRenameWorktree]
  );

  return (
    <div className="mb-1">
      <div
        className="flex items-center gap-1.5 px-2 py-1.5 mx-1 rounded-md cursor-pointer hover:bg-[#181818]"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={onToggle}
      >
        <ChevronIcon collapsed={collapsed} />
        <span
          className="text-[14px] text-white font-bold truncate flex-1"
          title={repo.path}
        >
          {repoName}
        </span>
        {hovered && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); onNewWorktree(); }}
              title="New Worktree"
              className="shrink-0 w-4 h-4 flex items-center justify-center text-[#444] hover:text-[#a78bfa] transition-colors"
            >
              <PlusIcon />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onRemoveRepo(); }}
              title="Remove from workspace"
              className="shrink-0 w-4 h-4 flex items-center justify-center text-[#444] hover:text-[#f87171] text-[16px] leading-none transition-colors"
            >
              ×
            </button>
          </>
        )}
      </div>

      {!collapsed && (
        <div className="pl-3 pr-2 space-y-1.5 mt-1.5">
          {worktreeItems.map(({ wt, wtTerminals, onClick, onRemoveWorktree: handleRemove, onDeleteBranch: handleDelete, onRemoveBoth: handleRemoveBoth, onRename }) => (
            <WorktreeItem
              key={wt.path}
              wt={wt}
              active={wt.path === activePath}
              customName={worktreeNames[wt.path] || null}
              wtTerminals={wtTerminals}
              terminalStatuses={terminalStatuses}
              terminalSessionActive={terminalSessionActive}
              terminalAgents={terminalAgents}
              onClick={onClick}
              onRemoveWorktree={handleRemove}
              onDeleteBranch={handleDelete}
              onRemoveBoth={handleRemoveBoth}
              onRename={onRename}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default memo(RepoSection);
