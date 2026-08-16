import ActionBtn from './ActionBtn.jsx';
import PipelineOutput from './PipelineOutput.jsx';

export default function StepPull({ branch, running, output, error, isError, onPull, onSkip }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[14px] text-[#888]">
        Синхронизировать с удалённым репозиторием:&nbsp;
        <span className="text-[#a78bfa]">origin/{branch}</span>
      </p>
      <code className="text-[13px] font-mono text-[#555]">git pull origin {branch}</code>
      <div className="flex gap-2">
        <ActionBtn onClick={onPull} disabled={running} primary>
          {running ? 'Pulling…' : 'Pull'}
        </ActionBtn>
        <ActionBtn onClick={onSkip} disabled={running}>
          Пропустить
        </ActionBtn>
      </div>
      <PipelineOutput text={error || output} isError={isError} />
    </div>
  );
}
