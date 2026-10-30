import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import TitleBar from './components/TitleBar.jsx';
import Sidebar from './components/Sidebar.jsx';
import TerminalTabs from './components/TerminalTabs.jsx';
import Terminal from './components/Terminal.jsx';
import NewWorktreeModal from './components/NewWorktreeModal.jsx';
import SettingsModal from './components/SettingsModal.jsx';

let _counter = 0;
function newTermId() { return `term-${++_counter}-${Date.now()}`; }

const MAX_TABS = 3;

const DEFAULT_SETTINGS = {
  ai: 'claude',
  loggingEnabled: false,
  defaultShellId: null,
  console: {
    fontFamily: "'Ubuntu Mono', 'Consolas', monospace",
    fontSize: 13,
    lineHeight: 1.2,
    gpuOnly: true,
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
  const [mountedTerminalIds, setMountedTerminalIds] = useState(() => new Set());
  const [showModal, setShowModal] = useState(false);
  const [newWorktreeRepo, setNewWorktreeRepo] = useState(null);
  const [error, setError] = useState(null);
  const errorTimerRef = useRef(null);
  const saveConfigTimer = useRef(null);
  const saveStateTimer = useRef(null);
  // Refs for stable callbacks that need current state without deps
  const worktreesMapRef = useRef({});
  const activeWorktreePathRef = useRef(null);
  const aiCommandRef = useRef('claude');
  const shellProfilesRef = useRef([]);
  const settingsRef = useRef(DEFAULT_SETTINGS);
  const lastActiveTerminalRef = useRef({});  // { [worktreePath]: termId }
  const [terminalStatuses, setTerminalStatuses] = useState({});
  const [terminalSessionActive, setTerminalSessionActive] = useState({});
  const [terminalAgents, setTerminalAgents] = useState({});
  const [terminalProcesses, setTerminalProcesses] = useState({});
  const [worktreeNames, setWorktreeNames] = useState({});  // { [path]: customName }
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  const aiCommand = settings.ai === 'codex' ? 'codex' : 'claude';

  // Keep refs in sync with latest values for stable callbacks
  worktreesMapRef.current = worktreesMap;
  activeWorktreePathRef.current = activeWorktreePath;
  aiCommandRef.current = aiCommand;
  shellProfilesRef.current = shellProfiles;
  settingsRef.current = settings;

  const showError = useCallback((msg) => {
    setError(msg);
    clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setError(null), 5000);
  }, []);

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
          .map(t => ({ id: newTermId(), worktreePath: t.worktreePath, label: t.label, shellId: t.shellId || null, type: t.type || null, sessionId: t.sessionId || null }));

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
    clearTimeout(saveConfigTimer.current);
    saveConfigTimer.current = setTimeout(() => {
      window.api.saveConfig({ workspace, settings });
    }, 300);
  }, [workspace, settings]);

  useEffect(() => {
    if (!stateLoaded.current) return;
    window.api.setLoggingEnabled(settings.loggingEnabled ?? false);
  }, [settings.loggingEnabled]);

  useEffect(() => {
    if (!stateLoaded.current) return;
    clearTimeout(saveStateTimer.current);
    saveStateTimer.current = setTimeout(() => {
      window.api.saveState({
        activeWorktreePath,
        terminals: terminals.map(({ worktreePath, label, shellId, type, sessionId }) => ({ worktreePath, label, shellId, type: type || null, sessionId: sessionId || null })),
        worktreeNames,
      });
    }, 300);
  }, [terminals, activeWorktreePath, worktreeNames]);

  useEffect(() => {
    return window.api.onWorktreeStatus(({ termId, status, sessionActive, sessionId }) => {
      setTerminalStatuses(prev => ({ ...prev, [termId]: status }));
      setTerminalSessionActive(prev => ({ ...prev, [termId]: sessionActive }));
      if (sessionId) {
        setTerminals(prev => prev.map(t => t.id === termId ? { ...t, sessionId } : t));
      }
    });
  }, []);

  useEffect(() => {
    return window.api.onWorktreeAgent(({ termId, agents }) => {
      setTerminalAgents(prev => ({ ...prev, [termId]: agents }));
    });
  }, []);

  useEffect(() => {
    return window.api.onWorktreeProcess(({ termId, processes }) => {
      setTerminalProcesses(prev => ({ ...prev, [termId]: processes }));
    });
  }, []);

  // ── Terminal management ───────────────────────────────────────────────────

  const addTerminal = useCallback((worktreePath, shellId) => {
    const resolvedShellId = shellId ?? settingsRef.current.defaultShellId ?? null;
    const id = newTermId();
    setTerminals((prev) => {
      const existing = prev.filter((t) => t.worktreePath === worktreePath);
      if (existing.length >= MAX_TABS) return prev;
      const num = existing.length + 1;
      const profile = shellProfilesRef.current.find(p => p.id === resolvedShellId);
      const label = profile ? `${profile.name} ${num}` : `Terminal ${num}`;
      return [...prev, { id, worktreePath, shellId: resolvedShellId, label }];
    });
    setActiveTerminalId(id);
    return id;
  }, []);

  const addAiTerminal = useCallback((worktreePath) => {
    const id = newTermId();
    setTerminals((prev) => {
      if (prev.filter(t => t.worktreePath === worktreePath).length >= MAX_TABS) return prev;
      const existingAi = prev.filter(t => t.worktreePath === worktreePath && t.type === 'ai');
      const num = existingAi.length + 1;
      const label = `${deriveAiLabel(aiCommandRef.current)} ${num}`;
      return [...prev, { id, worktreePath, shellId: null, label, type: 'ai' }];
    });
    setActiveTerminalId(id);
    return id;
  }, []);

  const handleSelectWorktree = useCallback((wt) => {
    setActiveWorktreePath(wt.path);
    setTerminals((prev) => {
      const existing = prev.filter((t) => t.worktreePath === wt.path);
      if (existing.length === 0) {
        const id = newTermId();
        setActiveTerminalId(id);
        return [...prev, { id, worktreePath: wt.path, shellId: null, label: `${deriveAiLabel(aiCommandRef.current)} 1`, type: 'ai' }];
      }
      const lastId = lastActiveTerminalRef.current[wt.path];
    const lastTerm = lastId && existing.find(t => t.id === lastId);
    setActiveTerminalId(lastTerm ? lastId : existing[existing.length - 1].id);
      return prev;
    });
  }, []);

  useEffect(() => {
    if (activeTerminalId) {
      setMountedTerminalIds(prev => {
        if (prev.has(activeTerminalId)) return prev;
        return new Set([...prev, activeTerminalId]);
      });
    }
  }, [activeTerminalId]);

  useEffect(() => {
    if (activeTerminalId && activeWorktreePath) {
      lastActiveTerminalRef.current[activeWorktreePath] = activeTerminalId;
    }
  }, [activeTerminalId, activeWorktreePath]);

  const handleCloseTerminal = useCallback((termId) => {
    setMountedTerminalIds(prev => {
      const next = new Set(prev);
      next.delete(termId);
      return next;
    });
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

  useEffect(() => {
    const unsub = window.api.onTerminalExited(({ termId }) => {
      handleCloseTerminal(termId);
    });
    return unsub;
  }, [handleCloseTerminal]);

  const handleRenameWorktree = useCallback((worktreePath, name) => {
    setWorktreeNames(prev => {
      const next = { ...prev };
      if (name) next[worktreePath] = name;
      else delete next[worktreePath];
      return next;
    });
  }, []);

  // ── Workspace management ──────────────────────────────────────────────────

  const addRepo = useCallback(async () => {
    const folder = await window.api.openFolder();
    if (!folder) return;
    const root = await window.api.detectRepo(folder);
    if (!root) { showError('Git repository not found.'); return; }
    setWorkspace(prev => {
      if (prev.some(r => r.path === root)) return prev;
      return [...prev, { path: root }];
    });
    window.api.gitCurrentBranch(root).then(b => {
      if (b) setMainBranchMap(prev => ({ ...prev, [root]: b }));
    });
    loadWorktrees(root);
  }, [showError, loadWorktrees]);

  const removeRepo = useCallback((repoPath) => {
    const repoWorktrees = worktreesMapRef.current[repoPath] || [];
    const removedPaths = new Set(repoWorktrees.map(wt => wt.path));
    setWorkspace(prev => prev.filter(r => r.path !== repoPath));
    setWorktreesMap(prev => { const next = { ...prev }; delete next[repoPath]; return next; });
    setMainBranchMap(prev => { const next = { ...prev }; delete next[repoPath]; return next; });
    setTerminals(prev => prev.filter(t => !removedPaths.has(t.worktreePath)));
    if (activeWorktreePathRef.current && removedPaths.has(activeWorktreePathRef.current)) {
      setActiveWorktreePath(null);
      setActiveTerminalId(null);
    }
  }, []);

  // ── Worktree management ───────────────────────────────────────────────────

  const handleNewWorktreeClick = useCallback((repoPath) => {
    setNewWorktreeRepo(repoPath);
    setShowModal(true);
  }, []);

  const handleCreateWorktree = async ({ branch, worktreeName, customName }) => {
    if (!newWorktreeRepo) return;
    const baseBranch = mainBranchMap[newWorktreeRepo] || 'master';
    const result = await window.api.createWorktree({ repoPath: newWorktreeRepo, branch, baseBranch, worktreeName });
    if (result.success) {
      if (customName && result.worktreePath) handleRenameWorktree(result.worktreePath, customName);
      setShowModal(false);
      loadWorktrees(newWorktreeRepo);
    } else showError(result.error);
  };

  const handleRemoveWorktree = async (worktreePath, repoPath) => {
    const result = await window.api.removeWorktree({ repoPath, worktreePath });
    if (!result.success) { showError(result.error); return; }
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
    if (!result.success) showError(result.error);
    else loadWorktrees(repoPath);
  };

  const handleRemoveBoth = async (worktreePath, repoPath) => {
    const wt = (worktreesMap[repoPath] || []).find(w => w.path === worktreePath);
    const rmResult = await window.api.removeWorktree({ repoPath, worktreePath });
    if (!rmResult.success) { showError(rmResult.error); return; }
    setTerminals(prev => prev.filter(t => t.worktreePath !== worktreePath));
    if (activeWorktreePath === worktreePath) {
      setActiveWorktreePath(null);
      setActiveTerminalId(null);
    }
    if (wt?.branch) {
      const delResult = await window.api.deleteBranch({ repoPath, branch: wt.branch });
      if (!delResult.success) showError(delResult.error);
    }
    loadWorktrees(repoPath);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const currentTabs = useMemo(
    () => terminals.filter((t) => t.worktreePath === activeWorktreePath),
    [terminals, activeWorktreePath]
  );

  const handleNewTerminal = useCallback(
    (shellId) => addTerminal(activeWorktreePath, shellId),
    [addTerminal, activeWorktreePath]
  );

  const handleNewAiTerminal = useCallback(
    () => addAiTerminal(activeWorktreePath),
    [addAiTerminal, activeWorktreePath]
  );

  return (
    <div className="flex flex-col h-screen bg-[#0f0f0f]">
      <TitleBar
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
          terminalAgents={terminalAgents}
          terminalProcesses={terminalProcesses}
        />

        <div className="flex-1 flex flex-col overflow-hidden">
          {activeWorktreePath && (
            <TerminalTabs
              tabs={currentTabs}
              activeId={activeTerminalId}
              onSelect={setActiveTerminalId}
              onClose={handleCloseTerminal}
              onNew={handleNewTerminal}
              onNewAi={handleNewAiTerminal}
              shellProfiles={shellProfiles}
              terminalStatuses={terminalStatuses}
              terminalSessionActive={terminalSessionActive}
            />
          )}

          <div className="flex-1 relative overflow-hidden">
            {terminals.map((t) => (
              mountedTerminalIds.has(t.id) && (
                <Terminal
                  key={t.id}
                  termId={t.id}
                  worktreePath={t.worktreePath}
                  shellId={t.shellId}
                  active={t.id === activeTerminalId}
                  fontFamily={settings.console.fontFamily}
                  fontSize={settings.console.fontSize}
                  lineHeight={settings.console.lineHeight}
                  gpuOnly={settings.console.gpuOnly}
                  type={t.type}
                  aiCommand={aiCommand}
                  sessionId={t.sessionId}
                />
              )
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
          shellProfiles={shellProfiles}
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
