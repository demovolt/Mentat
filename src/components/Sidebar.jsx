import { useState, useCallback, useMemo, memo } from 'react';
import RepoSection from './sidebar/RepoSection.jsx';

function Sidebar({
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
  terminalSessionActive = {},
  terminalAgents = {},
  terminalProcesses = {},
  worktreeNames = {},
}) {
  const [collapsed, setCollapsed] = useState({});

  const toggleCollapsed = useCallback((repoPath) => {
    setCollapsed(prev => ({ ...prev, [repoPath]: !prev[repoPath] }));
  }, []);

  // Pre-compute per-repo callbacks so they're stable between status updates
  const repoItems = useMemo(() =>
    workspace.map(repo => ({
      repo,
      worktrees: worktreesMap[repo.path] || [],
      onToggle: () => toggleCollapsed(repo.path),
      onRemoveRepo: () => onRemoveRepo(repo.path),
      onNewWorktree: () => onNewWorktree(repo.path),
    })),
    [workspace, worktreesMap, toggleCollapsed, onRemoveRepo, onNewWorktree]
  );

  return (
    <div className="w-56 shrink-0 flex flex-col bg-[#111] border-r border-[#1c1c1c]">
      <div className="flex-1 overflow-y-auto pt-1 pb-2">
        {workspace.length === 0 ? (
          <p className="text-[12px] text-[#333] text-center mt-10 px-4 leading-relaxed">
            Add a repository<br />to get started
          </p>
        ) : (
          repoItems.map(({ repo, worktrees, onToggle, onRemoveRepo: handleRemoveRepo, onNewWorktree: handleNewWorktree }) => (
            <RepoSection
              key={repo.path}
              repo={repo}
              worktrees={worktrees}
              activePath={activePath}
              collapsed={!!collapsed[repo.path]}
              onToggle={onToggle}
              onRemoveRepo={handleRemoveRepo}
              onSelectWorktree={onSelectWorktree}
              onRemoveWorktree={onRemoveWorktree}
              onDeleteBranch={onDeleteBranch}
              onRemoveBoth={onRemoveBoth}
              onRenameWorktree={onRenameWorktree}
              onNewWorktree={handleNewWorktree}
              terminals={terminals}
              terminalStatuses={terminalStatuses}
              terminalSessionActive={terminalSessionActive}
              terminalAgents={terminalAgents}
              terminalProcesses={terminalProcesses}
              worktreeNames={worktreeNames}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default memo(Sidebar);
