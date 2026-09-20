import React, { useEffect, useRef, useState } from 'react';
import { Badge } from '../../components/react/Badge';
import { EmptyState } from '../../components/react/Feedback';
import ListItem from '../../components/list/ListItem';
import MeterBar from '../../components/base/MeterBar';
import { renderMarkdown } from '../../utils/markdown';
import { scrollSelectedIntoView, resetListScroll } from '../../lib/listScroll';
import { taskProgressFraction, taskProgressLabel } from './taskProgressLabel';
import { walkthroughService } from '../../services/walkthrough/walkthroughService';
import { walkthroughViewState } from './walkthroughViewState';

function requirement(completion: { type: string; distinctDays?: number; times?: number }) {
  if (completion.type === 'manual') return 'Tick when done';
  if (completion.type === 'count' && completion.distinctDays && completion.distinctDays > 1) {
    return `Use on ${completion.distinctDays} separate days`;
  }
  if (completion.type === 'count' && completion.times && completion.times > 1) {
    return `Use ${completion.times} times`;
  }
  return 'Completes as you use it';
}

export default function WalkthroughDefaultView() {
  const [, setTick] = useState(0);
  const rerender = () => setTick((t) => t + 1);

  const listRef = useRef<HTMLDivElement | null>(null);
  const detailRef = useRef<HTMLDivElement | null>(null);

  const progress = walkthroughService.progress;
  const task = walkthroughViewState.openTask;

  useEffect(() => {
    const index = walkthroughViewState.selectedIndex;
    if (walkthroughViewState.mode !== 'list' || !listRef.current) return;
    requestAnimationFrame(() => {
      if (listRef.current) {
        if (index >= 0) {
          scrollSelectedIntoView(listRef.current, index);
        } else {
          resetListScroll(listRef.current);
        }
      }
    });
  }, [walkthroughViewState.selectedIndex, walkthroughViewState.mode]);

  useEffect(() => {
    const openId = walkthroughViewState.openTaskId;
    if (!openId || !detailRef.current) return;
    detailRef.current.parentElement?.scrollTo({ top: 0 });
  }, [walkthroughViewState.openTaskId]);

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto h-full custom-scrollbar">
      {walkthroughViewState.mode === 'detail' && task ? (
        <article ref={detailRef} className="flex flex-col gap-4 px-2">
          <header className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-[var(--text-primary)] m-0 flex-1">
              {task.title}
            </h1>
            {task.completed ? (
              <Badge text={task.source === 'manual' ? 'Marked done' : 'Done'} variant="success" />
            ) : (
              <Badge text={requirement(task.completion)} variant="info" />
            )}
          </header>

          {!task.completed && taskProgressLabel(task.progress) && (
            <div className="flex flex-col gap-2">
              <MeterBar value={taskProgressFraction(task.progress)} />
              <span className="text-xs text-[var(--text-tertiary)]">
                {taskProgressLabel(task.progress)}
              </span>
            </div>
          )}

          {task.image && (
            <img
              className="w-full rounded-[var(--radius-md)] border border-[var(--separator)]"
              src={task.image}
              alt=""
            />
          )}

          {task.body ? (
            <div
              className="text-sm text-[var(--text-secondary)] leading-relaxed prose max-w-none"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(task.body) }}
            />
          ) : task.summary ? (
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{task.summary}</p>
          ) : null}
        </article>
      ) : (
        <>
          <header className="flex flex-col gap-2 px-2">
            <div className="flex items-baseline justify-between">
              <span className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-semibold">
                Beyond the basics
              </span>
              <span className="text-xs text-[var(--text-tertiary)]">
                {progress.completed} of {progress.total}
              </span>
            </div>
            <MeterBar value={progress.total === 0 ? 0 : progress.completed / progress.total} />
          </header>

          {walkthroughViewState.visible.length === 0 ? (
            <EmptyState
              message={
                walkthroughService.tasks.length === 0
                  ? 'No walkthrough tasks yet'
                  : 'No tasks match your search'
              }
              description={
                walkthroughService.tasks.length === 0
                  ? 'Extensions add their own tasks here as you install them.'
                  : undefined
              }
            />
          ) : (
            <div
              ref={listRef}
              className="flex flex-col"
              role="listbox"
              aria-label="Walkthrough tasks"
            >
              {walkthroughViewState.visible.map((item, i) => (
                <ListItem
                  key={item.id}
                  data-index={i}
                  selected={i === walkthroughViewState.selectedIndex}
                  title={item.title}
                  subtitle={item.summary || requirement(item.completion)}
                  onClick={() => {
                    walkthroughViewState.open(item.id);
                    rerender();
                  }}
                  leading={
                    <span
                      className={`inline-flex items-center justify-center w-5 h-5 rounded-full border text-xs ${
                        item.completed
                          ? 'border-[var(--accent-primary)] text-[var(--accent-primary)]'
                          : 'border-[var(--separator)] text-[var(--text-tertiary)]'
                      }`}
                    >
                      {item.completed ? '★' : '○'}
                    </span>
                  }
                  trailing={
                    item.completed && item.source === 'manual' ? (
                      <Badge text="Marked" variant="default" />
                    ) : item.completed ? (
                      <Badge text="Done" variant="success" />
                    ) : taskProgressLabel(item.progress) ? (
                      <span className="flex flex-col items-end gap-1">
                        <span className="text-xs text-[var(--text-tertiary)] whitespace-nowrap">
                          {taskProgressLabel(item.progress)}
                        </span>
                        <span className="w-20">
                          <MeterBar value={taskProgressFraction(item.progress)} />
                        </span>
                      </span>
                    ) : null
                  }
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
