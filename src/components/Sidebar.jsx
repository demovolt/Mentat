import { useState } from 'react';
import RepoSection from './sidebar/RepoSection.jsx';

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
  terminalSessionActive = {},
  terminalAgents = {},
  worktreeNames = {},
}) {
  const [collapsed, setCollapsed] = useState({});

  const toggleCollapsed = (repoPath) => {
    setCollapsed(prev => ({ ...prev, [repoPath]: !prev[repoPath] }));
  };

  return (
    <div className="w-56 shrink-0 flex flex-col bg-[#111] border-r border-[#1c1c1c]">
      <div className="flex-1 overflow-y-auto pt-1 pb-2">
        {workspace.length === 0 ? (
          <p className="text-[12px] text-[#333] text-center mt-10 px-4 leading-relaxed">
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
              terminalSessionActive={terminalSessionActive}
              terminalAgents={terminalAgents}
              worktreeNames={worktreeNames}
            />
          ))
        )}
      </div>
    </div>
  );
}
