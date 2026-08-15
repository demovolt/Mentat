import { useState, useEffect, useCallback, useRef } from 'react';
import TitleBar from './components/TitleBar.jsx';
import Sidebar from './components/Sidebar.jsx';
import TerminalTabs from './components/TerminalTabs.jsx';
import Terminal from './components/Terminal.jsx';
import NewWorktreeModal from './components/NewWorktreeModal.jsx';
import GitPipelineModal from './components/GitPipelineModal.jsx';
import PruneConfirmModal from './components/PruneConfirmModal.jsx';
import SettingsModal from './components/SettingsModal.jsx';

let _counter = 0;
function newTermId() { return `term-${++_counter}-${Date.now()}`; }

const DEFAULT_SETTINGS = {
  ai: 'claude',
  console: {
    fontFamily: "'Ubuntu Mono', 'Consolas', monospace",
    fontSize: 13,
    lineHeight: 1.2,
  },
};
function deriveAiLabel(cmd) {
  const name = (cmd || 'claude').split(/[\s/\\]/).pop();
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export default function App() {
  const [workspace, setWorkspace] = useState([]);            // [{ path }]
  const [worktreesMap, setWorktreesMap] = useState({});      // { repoPath: worktree[] }
  const [mainBranchMap, setMainBranchMap] = useState({});    // { repoPath: string }
  const [shellProfiles, setShellProfiles] = useState([]);
  const [activeWorktreePath, setActiveWorktreePath] = useState(null);
  const [terminals, setTerminals] = useState([]);            // { id, worktreePath, label, shellId }
  const [activeTerminalId, setActiveTerminalId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [newWorktreeRepo, setNewWorktreeRepo] = useState(null);
  const [showGitModal, setShowGitModal] = useState(false);
  const [showPruneModal, setShowPruneModal] = useState(false);
  const [prunableWorktrees, setPrunableWorktrees] = useState([]);
  const [pruneRepoPath, setPruneRepoPath] = useState(null);
  const [isPruning, setIsPruning] = useState(false);
  const [error, setError] = useState(null);
  const [terminalStatuses, setTerminalStatuses] = useState({});
  const [terminalSessionActive, setTerminalSessionActive] = useState({});
  const [worktreeNames, setWorktreeNames] = useState({});  // { [path]: customName }
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  const aiCommand = settings.ai === 'codex' ? 'codex' : 'claude';

  const stateLoaded = useRef(false);

  const loadWorktrees = useCallback(async (repoPath) => {
    const wts = await window.api.getWorktrees(repoPath);
    setWorktreesMap(prev => ({ ...prev, [repoPath]: wts }));
  }, []);

  useEffect(() => {
    (async () => {
      const cfg = await window.api.getConfig();
      const ws = cfg.workspace || [];
      if (cfg.settings) {
        setSettings((prev) => ({
          ...prev,
          ...cfg.settings,
          console: { ...prev.console, ...(cfg.settings.console || {}) },
        }));
      }

      const profiles = await window.api.getShellProfiles();
      setShellProfiles(profiles);

      if (ws.length === 0) { stateLoaded.current = true; return; }

      setWorkspace(ws);

      const [allWorktrees, saved, mainBranches] = await Promise.all([
        Promise.all(ws.map(repo => window.api.getWorktrees(repo.path).then(wts => [repo.path, wts]))),
        window.api.getState(),
        Promise.all(ws.map(repo => window.api.gitCurrentBranch(repo.path).then(b => [repo.path, b]))),
      ]);

      const newWorktreesMap = Object.fromEntries(allWorktrees);
      setWorktreesMap(newWorktreesMap);
      setMainBranchMap(Object.fromEntries(mainBranches.filter(([, b]) => b)));

      if (saved?.worktreeNames) setWorktreeNames(saved.worktreeNames);

      if (saved?.terminals?.length > 0) {
        const allValidPaths = new Set(Object.values(newWorktreesMap).flat().map(wt => wt.path));
        const restored = saved.terminals
          .filter(t => allValidPaths.has(t.worktreePath))
          .map(t => ({ id: newTermId(), worktreePath: t.worktreePath, label: t.label, shellId: t.shellId || null, type: t.type || null }));

        setTerminals(restored);

        const activePath = saved.activeWorktreePath && allValidPaths.has(saved.activeWorktreePath)
          ? saved.activeWorktreePath : null;
        setActiveWorktreePath(activePath);

        if (activePath) {
          const activeTerms = restored.filter(t => t.worktreePath === activePath);
          if (activeTerms.length > 0) setActiveTerminalId(activeTerms[activeTerms.length - 1].id);
        }
      }

      stateLoaded.current = true;
    })();
  }, []);

  useEffect(() => {
    if (!stateLoaded.current) return;
    window.api.saveConfig({ workspace, settings });
  }, [workspace, settings]);

  useEffect(() => {
    if (!stateLoaded.current) return;
    window.api.saveState({
      activeWorktreePath,
      terminals: terminals.map(({ worktreePath, label, shellId, type }) => ({ worktreePath, label, shellId, type: type || null })),
      worktreeNames,
    });
  }, [terminals, activeWorktreePath, worktreeNames]);

  useEffect(() => {
    const unsub = window.api.onWorktreeStatus(({ termId, status, sessionActive }) => {
      setTerminalStatuses(prev => ({ ...prev, [termId]: status }));
      setTerminalSessionActive(prev => ({ ...prev, [termId]: sessionActive }));
    });
    return unsub;
  }, []);

  // ── Terminal management ───────────────────────────────────────────────────

  const addTerminal = useCallback((worktreePath, shellId) => {
    const id = newTermId();
    setTerminals((prev) => {
      const existing = prev.filter((t) => t.worktreePath === worktreePath);
      const num = existing.length + 1;
      const profile = shellProfiles.find(p => p.id === shellId);
      const label = profile ? `${profile.name} ${num}` : `Terminal ${num}`;
      return [...prev, { id, worktreePath, shellId: shellId || null, label }];
    });
    setActiveTerminalId(id);
    return id;
  }, [shellProfiles]);

  const addAiTerminal = useCallback((worktreePath) => {
    const id = newTermId();
    setTerminals((prev) => {
      const existingAi = prev.filter(t => t.worktreePath === worktreePath && t.type === 'ai');
      const num = existingAi.length + 1;
      const label = `${deriveAiLabel(aiCommand)} ${num}`;
      return [...prev, { id, worktreePath, shellId: null, label, type: 'ai' }];
    });
    setActiveTerminalId(id);
    return id;
  }, [aiCommand]);

  const handleSelectWorktree = useCallback((wt) => {
    setActiveWorktreePath(wt.path);
    setTerminals((prev) => {
      const existing = prev.filter((t) => t.worktreePath === wt.path);
      if (existing.length === 0) {
        const id = newTermId();
        setActiveTerminalId(id);
        return [...prev, { id, worktreePath: wt.path, shellId: null, label: `${deriveAiLabel(aiCommand)} 1`, type: 'ai' }];
      }
      setActiveTerminalId((cur) => {
        const stillThere = existing.find((t) => t.id === cur);
        return stillThere ? cur : existing[existing.length - 1].id;
      });
      return prev;
    });
  }, [aiCommand]);

  const handleCloseTerminal = useCallback((termId) => {
    setTerminals((prev) => {
      const term = prev.find((t) => t.id === termId);
      const next = prev.filter((t) => t.id !== termId);
      setActiveTerminalId((cur) => {
        if (cur !== termId) return cur;
        const sameWt = next.filter((t) => t.worktreePath === term?.worktreePath);
        return sameWt.length > 0 ? sameWt[sameWt.length - 1].id : null;
      });
      return next;
    });
  }, []);

  const handleRenameWorktree = useCallback((worktreePath, name) => {
    setWorktreeNames(prev => {
      const next = { ...prev };
      if (name) next[worktreePath] = name;
      else delete next[worktreePath];
      return next;
    });
  }, []);

  // ── Workspace management ──────────────────────────────────────────────────

  const addRepo = async () => {
    const folder = await window.api.openFolder();
    if (!folder) return;
    const root = await window.api.detectRepo(folder);
    if (!root) { setError('Git-репозиторий не найден.'); return; }
    if (workspace.some(r => r.path === root)) return;
    setWorkspace(prev => [...prev, { path: root }]);
    window.api.gitCurrentBranch(root).then(b => {
      if (b) setMainBranchMap(prev => ({ ...prev, [root]: b }));
    });
    loadWorktrees(root);
  };

  const removeRepo = (repoPath) => {
    const repoWorktrees = worktreesMap[repoPath] || [];
    const removedPaths = new Set(repoWorktrees.map(wt => wt.path));
    setWorkspace(prev => prev.filter(r => r.path !== repoPath));
    setWorktreesMap(prev => { const next = { ...prev }; delete next[repoPath]; return next; });
    setMainBranchMap(prev => { const next = { ...prev }; delete next[repoPath]; return next; });
    setTerminals(prev => prev.filter(t => !removedPaths.has(t.worktreePath)));
    if (activeWorktreePath && removedPaths.has(activeWorktreePath)) {
      setActiveWorktreePath(null);
      setActiveTerminalId(null);
    }
  };

  // ── Worktree management ───────────────────────────────────────────────────

  const handleNewWorktreeClick = (repoPath) => {
    setNewWorktreeRepo(repoPath);
    setShowModal(true);
  };

  const handleCreateWorktree = async ({ branch }) => {
    if (!newWorktreeRepo) return;
    const baseBranch = mainBranchMap[newWorktreeRepo] || 'master';
    const result = await window.api.createWorktree({ repoPath: newWorktreeRepo, branch, baseBranch });
    if (result.success) { setShowModal(false); loadWorktrees(newWorktreeRepo); }
    else setError(result.error);
  };

  const handleRemoveWorktree = async (worktreePath, repoPath) => {
    const result = await window.api.removeWorktree({ repoPath, worktreePath });
    if (!result.success) { setError(result.error); return; }
    setTerminals(prev => prev.filter(t => t.worktreePath !== worktreePath));
    if (activeWorktreePath === worktreePath) {
      setActiveWorktreePath(null);
      setActiveTerminalId(null);
    }
    loadWorktrees(repoPath);
  };

  const handleDeleteBranch = async (worktreePath, repoPath) => {
    const wt = (worktreesMap[repoPath] || []).find(w => w.path === worktreePath);
    if (!wt?.branch) return;
    const result = await window.api.deleteBranch({ repoPath, branch: wt.branch });
    if (!result.success) setError(result.error);
    else loadWorktrees(repoPath);
  };

  const handleRemoveBoth = async (worktreePath, repoPath) => {
    const wt = (worktreesMap[repoPath] || []).find(w => w.path === worktreePath);
    const rmResult = await window.api.removeWorktree({ repoPath, worktreePath });
    if (!rmResult.success) { setError(rmResult.error); return; }
    setTerminals(prev => prev.filter(t => t.worktreePath !== worktreePath));
    if (activeWorktreePath === worktreePath) {
      setActiveWorktreePath(null);
      setActiveTerminalId(null);
    }
    if (wt?.branch) {
      const delResult = await window.api.deleteBranch({ repoPath, branch: wt.branch });
      if (!delResult.success) setError(delResult.error);
    }
    loadWorktrees(repoPath);
  };

  // ── Prune dead worktrees ──────────────────────────────────────────────────

  const handleCheckPrune = async () => {
    let activeRepoPath = null;
    if (activeWorktreePath) {
      for (const [rp, wts] of Object.entries(worktreesMap)) {
        if (wts.some(wt => wt.path === activeWorktreePath)) { activeRepoPath = rp; break; }
      }
    }
    if (!activeRepoPath) return;
    setIsPruning(true);
    try {
      const result = await window.api.getPrunableWorktrees(activeRepoPath);
      if (!result.success) { setError(result.error); return; }
      if (result.worktrees.length === 0) { setError('Нет смёрженных веток для удаления'); return; }
      setPrunableWorktrees(result.worktrees);
      setPruneRepoPath(activeRepoPath);
      setShowPruneModal(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setIsPruning(false);
    }
  };

  const handleConfirmPrune = async () => {
    const errors = [];
    for (const wt of prunableWorktrees) {
      const branch = wt.branch?.replace('refs/heads/', '');
      const rmResult = await window.api.removeWorktree({ repoPath: pruneRepoPath, worktreePath: wt.path });
      if (!rmResult.success) { errors.push(rmResult.error); continue; }
      if (branch) {
        const delResult = await window.api.deleteBranch({ repoPath: pruneRepoPath, branch });
        if (!delResult.success) errors.push(delResult.error);
      }
      setTerminals(prev => prev.filter(t => t.worktreePath !== wt.path));
      if (activeWorktreePath === wt.path) {
        setActiveWorktreePath(null);
        setActiveTerminalId(null);
      }
    }
    setShowPruneModal(false);
    setPrunableWorktrees([]);
    if (pruneRepoPath) loadWorktrees(pruneRepoPath);
    setPruneRepoPath(null);
    if (errors.length > 0) setError(errors.join('\n'));
  };

  // ── Render ────────────────────────────────────────────────────────────────

  let activeRepoPath = null;
  if (activeWorktreePath) {
    for (const [rp, wts] of Object.entries(worktreesMap)) {
      if (wts.some(wt => wt.path === activeWorktreePath)) { activeRepoPath = rp; break; }
    }
  }

  const currentTabs = terminals.filter((t) => t.worktreePath === activeWorktreePath);

  return (
    <div className="flex flex-col h-screen bg-[#0f0f0f]">
      <TitleBar
        activeWorktreePath={activeWorktreePath}
        onGit={() => setShowGitModal(true)}
        repoPath={activeRepoPath}
        onPrune={handleCheckPrune}
        isPruning={isPruning}
        onAddRepo={addRepo}
        onSettings={() => setShowSettings(true)}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          workspace={workspace}
          worktreesMap={worktreesMap}
          activePath={activeWorktreePath}
          onAddRepo={addRepo}
          onRemoveRepo={removeRepo}
          onSelectWorktree={handleSelectWorktree}
          onRemoveWorktree={handleRemoveWorktree}
          onDeleteBranch={handleDeleteBranch}
          onRemoveBoth={handleRemoveBoth}
          onRenameWorktree={handleRenameWorktree}
          onNewWorktree={handleNewWorktreeClick}
          worktreeNames={worktreeNames}
          terminals={terminals}
          terminalStatuses={terminalStatuses}
          terminalSessionActive={terminalSessionActive}
        />

        <div className="flex-1 flex flex-col overflow-hidden">
          {activeWorktreePath && (
            <TerminalTabs
              tabs={currentTabs}
              activeId={activeTerminalId}
              onSelect={setActiveTerminalId}
              onClose={handleCloseTerminal}
              onNew={(shellId) => addTerminal(activeWorktreePath, shellId)}
              onNewAi={() => addAiTerminal(activeWorktreePath)}
              shellProfiles={shellProfiles}
            />
          )}

          <div className="flex-1 relative overflow-hidden">
            {terminals.map((t) => (
              <Terminal
                key={t.id}
                termId={t.id}
                worktreePath={t.worktreePath}
                shellId={t.shellId}
                active={t.id === activeTerminalId}
                fontFamily={settings.console.fontFamily}
                fontSize={settings.console.fontSize}
                lineHeight={settings.console.lineHeight}
                type={t.type}
                aiCommand={aiCommand}
              />
            ))}
            {!activeTerminalId && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-[#333] select-none">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                  <polyline points="4 17 10 11 4 5" />
                  <line x1="12" y1="19" x2="20" y2="19" />
                </svg>
                <p className="mt-3 text-sm">Select a worktree to open a terminal</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {showGitModal && (
        <GitPipelineModal
          worktreePath={activeWorktreePath}
          onClose={() => setShowGitModal(false)}
        />
      )}

      {showPruneModal && (
        <PruneConfirmModal
          worktrees={prunableWorktrees}
          onConfirm={handleConfirmPrune}
          onClose={() => { setShowPruneModal(false); setPrunableWorktrees([]); setPruneRepoPath(null); }}
        />
      )}

      {showModal && (
        <NewWorktreeModal
          onCreate={handleCreateWorktree}
          onClose={() => setShowModal(false)}
        />
      )}

      {showSettings && (
        <SettingsModal
          settings={settings}
          onSettingsChange={setSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      {error && (
        <div
          className="fixed bottom-4 right-4 bg-[#1a0a0a] border border-[#5a1a1a] text-[#f87171] text-xs px-4 py-2 rounded-lg shadow-lg cursor-pointer max-w-sm"
          onClick={() => setError(null)}
        >
          {error}
        </div>
      )}
    </div>
  );
}
