import ActionBtn from './ActionBtn.jsx';
import PipelineOutput from './PipelineOutput.jsx';

export default function StepStage({ files, selected, running, output, error, isError, onToggle, onSelectAll, onDeselectAll, onStage }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-[14px] text-[#888]">Выберите файлы для стейджинга:</p>
        <div className="flex gap-3">
          <button onClick={onSelectAll} className="text-[12px] text-[#555] hover:text-[#a78bfa] transition-colors">все</button>
          <button onClick={onDeselectAll} className="text-[12px] text-[#555] hover:text-[#a78bfa] transition-colors">снять</button>
        </div>
      </div>
      {files.length === 0 ? (
        <p className="text-[12px] text-[#444] italic">Нет изменённых файлов</p>
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
              <span className="text-[12px] font-mono text-[#666] w-6 shrink-0">{f.xy.trim()}</span>
              <span className="text-[12px] text-[#999] group-hover:text-[#ccc] truncate transition-colors">{f.file}</span>
            </label>
          ))}
        </div>
      )}
      <ActionBtn onClick={onStage} disabled={running || selected.length === 0} primary>
        {running ? 'Добавляю…' : `Добавить (${selected.length})`}
      </ActionBtn>
      <PipelineOutput text={error || output} isError={isError} />
    </div>
  );
}
