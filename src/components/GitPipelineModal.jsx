import { useState, useEffect, useRef } from 'react';

const STEP_LABELS = ['Pull', 'Stage', 'Commit', 'Push'];

function parseStatus(output) {
  return output.split('\n').filter(Boolean).map((line) => ({
    xy: line.slice(0, 2),
    file: line.slice(3),
  }));
}

function statusColor(st) {
  if (st === 'done')    return 'bg-green-500';
  if (st === 'error')   return 'bg-red-500';
  if (st === 'active')  return 'bg-[#7c3aed]';
  if (st === 'skipped') return 'bg-[#444]';
  return 'bg-[#333]';
}

function Output({ text, isError }) {
  if (!text) return null;
  return (
    <pre className={`mt-3 p-2 rounded text-[11px] font-mono max-h-24 overflow-y-auto bg-[#0a0a0a] border border-[#1c1c1c] whitespace-pre-wrap break-all ${isError ? 'text-[#f87171]' : 'text-[#888]'}`}>
      {text}
    </pre>
  );
}

export default function GitPipelineModal({ worktreePath, onClose }) {
  const [step, setStep] = useState(0);
  const [branch, setBranch] = useState('');
  const [statuses, setStatuses] = useState(['active', 'pending', 'pending', 'pending']);
  const [outputs, setOutputs] = useState(['', '', '', '']);
  const [errors, setErrors] = useState(['', '', '', '']);
  const [changedFiles, setChangedFiles] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [commitMsg, setCommitMsg] = useState('');
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const commitRef = useRef(null);

  useEffect(() => {
    Promise.all([
      window.api.gitCurrentBranch(worktreePath),
      window.api.gitStatus(worktreePath),
    ]).then(([br, st]) => {
      setBranch(br || '(unknown)');
      if (st.success) {
        const files = parseStatus(st.output);
        setChangedFiles(files);
        setSelectedFiles(files.map((f) => f.file));
      }
    });
  }, [worktreePath]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (step === 2 && commitRef.current) commitRef.current.focus();
  }, [step]);

  function markStatus(i, st) {
    setStatuses((prev) => prev.map((s, idx) => (idx === i ? st : s)));
  }

  function markOutput(i, out, err) {
    setOutputs((prev) => prev.map((o, idx) => (idx === i ? out : o)));
    setErrors((prev) => prev.map((e, idx) => (idx === i ? err : e)));
  }

  function advance(i) {
    markStatus(i, 'done');
    const next = i + 1;
    if (next < 4) {
      setStep(next);
      setStatuses((prev) => prev.map((s, idx) => (idx === next ? 'active' : s)));
    } else {
      setDone(true);
    }
  }

  async function handlePull() {
    setRunning(true);
    const result = await window.api.gitPull(worktreePath, branch);
    setRunning(false);
    markOutput(0, result.output || '', result.error || '');
    if (result.success) advance(0);
    else markStatus(0, 'error');
  }

  function handleSkipPull() {
    markStatus(0, 'skipped');
    advance(0);
  }

  async function handleStage() {
    setRunning(true);
    const result = await window.api.gitAdd(worktreePath, selectedFiles);
    setRunning(false);
    markOutput(1, result.output || '', result.error || '');
    if (result.success) {
      const st = await window.api.gitStatus(worktreePath);
      if (st.success) {
        const files = parseStatus(st.output);
        setChangedFiles(files);
        setSelectedFiles(files.map((f) => f.file));
      }
      advance(1);
    } else {
      markStatus(1, 'error');
    }
  }

  async function handleCommit() {
    setRunning(true);
    const result = await window.api.gitCommit(worktreePath, commitMsg.trim());
    setRunning(false);
    markOutput(2, result.output || '', result.error || '');
    if (result.success) advance(2);
    else markStatus(2, 'error');
  }

  async function handlePush() {
    setRunning(true);
    const result = await window.api.gitPush(worktreePath, branch);
    setRunning(false);
    markOutput(3, result.output || '', result.error || '');
    if (result.success) advance(3);
    else markStatus(3, 'error');
  }

  function toggleFile(file) {
    setSelectedFiles((prev) =>
      prev.includes(file) ? prev.filter((f) => f !== file) : [...prev, file]
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[500px] bg-[#161616] border border-[#2a2a2a] rounded-xl shadow-2xl p-5 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold text-[#ccc]">Git Pipeline</span>
          <span className="text-[11px] text-[#555]">{branch}</span>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-0">
          {STEP_LABELS.map((label, i) => (
            <div key={i} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1">
                <div className={`w-2 h-2 rounded-full transition-colors ${statusColor(statuses[i])}`} />
                <span className={`text-[10px] ${step === i ? 'text-[#a78bfa]' : statuses[i] === 'done' ? 'text-[#4ade80]' : 'text-[#444]'}`}>
                  {label}
                </span>
              </div>
              {i < 3 && (
                <div className={`flex-1 h-px mx-2 mb-3 transition-colors ${statuses[i] === 'done' || statuses[i] === 'skipped' ? 'bg-[#333]' : 'bg-[#222]'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step body */}
        <div className="min-h-[120px]">
          {done ? (
            <div className="flex flex-col items-center justify-center gap-3 py-6">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="9 12 11 14 15 10" />
              </svg>
              <p className="text-[13px] text-[#4ade80]">Готово! Изменения запушены.</p>
              <button
                onClick={onClose}
                className="mt-1 px-4 py-1.5 rounded-lg bg-[#7c3aed] hover:bg-[#6d28d9] text-white text-[12px] transition-colors"
              >
                Закрыть
              </button>
            </div>
          ) : step === 0 ? (
            <StepPull
              branch={branch}
              running={running}
              output={outputs[0]}
              error={errors[0]}
              isError={statuses[0] === 'error'}
              onPull={handlePull}
              onSkip={handleSkipPull}
            />
          ) : step === 1 ? (
            <StepStage
              files={changedFiles}
              selected={selectedFiles}
              running={running}
              output={outputs[1]}
              error={errors[1]}
              isError={statuses[1] === 'error'}
              onToggle={toggleFile}
              onSelectAll={() => setSelectedFiles(changedFiles.map((f) => f.file))}
              onDeselectAll={() => setSelectedFiles([])}
              onStage={handleStage}
            />
          ) : step === 2 ? (
            <StepCommit
              commitMsg={commitMsg}
              commitRef={commitRef}
              running={running}
              output={outputs[2]}
              error={errors[2]}
              isError={statuses[2] === 'error'}
              onChange={setCommitMsg}
              onCommit={handleCommit}
            />
          ) : (
            <StepPush
              branch={branch}
              running={running}
              output={outputs[3]}
              error={errors[3]}
              isError={statuses[3] === 'error'}
              onPush={handlePush}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function StepPull({ branch, running, output, error, isError, onPull, onSkip }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] text-[#888]">
        Синхронизировать с удалённым репозиторием:&nbsp;
        <span className="text-[#a78bfa]">origin/{branch}</span>
      </p>
      <div className="flex gap-2">
        <ActionBtn onClick={onPull} disabled={running} primary>
          {running ? 'Pulling…' : 'Pull'}
        </ActionBtn>
        <ActionBtn onClick={onSkip} disabled={running}>
          Пропустить
        </ActionBtn>
      </div>
      <Output text={error || output} isError={isError} />
    </div>
  );
}

function StepStage({ files, selected, running, output, error, isError, onToggle, onSelectAll, onDeselectAll, onStage }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-[#888]">Выберите файлы для стейджинга:</p>
        <div className="flex gap-3">
          <button onClick={onSelectAll} className="text-[10px] text-[#555] hover:text-[#a78bfa] transition-colors">все</button>
          <button onClick={onDeselectAll} className="text-[10px] text-[#555] hover:text-[#a78bfa] transition-colors">снять</button>
        </div>
      </div>
      {files.length === 0 ? (
        <p className="text-[11px] text-[#444] italic">Нет изменённых файлов</p>
      ) : (
        <div className="max-h-32 overflow-y-auto flex flex-col gap-0.5 border border-[#1c1c1c] rounded-lg p-2 bg-[#0f0f0f]">
          {files.map((f) => (
            <label key={f.file} className="flex items-center gap-2 cursor-pointer group py-0.5">
              <input
                type="checkbox"
                checked={selected.includes(f.file)}
                onChange={() => onToggle(f.file)}
                className="accent-[#7c3aed] w-3 h-3"
              />
              <span className="text-[10px] font-mono text-[#666] w-6 shrink-0">{f.xy.trim()}</span>
              <span className="text-[11px] text-[#999] group-hover:text-[#ccc] truncate transition-colors">{f.file}</span>
            </label>
          ))}
        </div>
      )}
      <ActionBtn
        onClick={onStage}
        disabled={running || selected.length === 0}
        primary
      >
        {running ? 'Добавляю…' : `Добавить (${selected.length})`}
      </ActionBtn>
      <Output text={error || output} isError={isError} />
    </div>
  );
}

function StepCommit({ commitMsg, commitRef, running, output, error, isError, onChange, onCommit }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] text-[#888]">Сообщение коммита:</p>
      <textarea
        ref={commitRef}
        value={commitMsg}
        onChange={(e) => onChange(e.target.value)}
        placeholder="feat: добавить новую функцию"
        rows={3}
        className="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg px-3 py-2 text-[12px] text-white placeholder-[#444] focus:outline-none focus:border-[#7c3aed] resize-none font-mono"
      />
      <ActionBtn
        onClick={onCommit}
        disabled={running || !commitMsg.trim()}
        primary
      >
        {running ? 'Коммичу…' : 'Commit'}
      </ActionBtn>
      <Output text={error || output} isError={isError} />
    </div>
  );
}

function StepPush({ branch, running, output, error, isError, onPush }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] text-[#888]">
        Отправить изменения в&nbsp;
        <span className="text-[#a78bfa]">origin/{branch}</span>
      </p>
      <ActionBtn onClick={onPush} disabled={running} primary>
        {running ? 'Pushing…' : 'Push'}
      </ActionBtn>
      <Output text={error || output} isError={isError} />
    </div>
  );
}

function ActionBtn({ onClick, disabled, primary, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-1.5 rounded-lg text-[12px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        primary
          ? 'bg-[#7c3aed] hover:bg-[#6d28d9] text-white'
          : 'border border-[#2a2a2a] text-[#888] hover:text-[#ccc] hover:border-[#444]'
      }`}
    >
      {children}
    </button>
  );
}
