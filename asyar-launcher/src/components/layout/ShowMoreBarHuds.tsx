import React from 'react';
import { Icon } from '../react/Icon';
import { StatusDot } from '../react/Indicators';
import { runService } from '../../services/run/runService';
import { aggregateKindCounts } from '../../services/launcher/itemStatusLogic';

export default function ShowMoreBarHuds() {
  const counts = aggregateKindCounts(
    runService.active,
    runService.keptAgents,
    runService.unacknowledgedScriptResults,
  );
  const scriptsVisible = counts.scripts.active > 0 || counts.scripts.done > 0;

  return (
    <div
      className="show-more-bar-huds flex items-center gap-[var(--space-5)] text-[var(--text-secondary)] text-[var(--font-size-sm)] min-w-0"
      role="group"
      aria-label="Active runs summary"
    >
      {scriptsVisible ? (
        <div className="hud-chip inline-flex items-center gap-[var(--space-3)] text-[var(--text-secondary)]">
          <Icon name="dev-tools" size={14} />
          {counts.scripts.active > 0 ? (
            <span className="hud-pair inline-flex items-center gap-[var(--space-2)]">
              <StatusDot color="info" pulse size={6} />
              <span className="hud-text whitespace-nowrap">{counts.scripts.active} Active</span>
            </span>
          ) : null}
          {counts.scripts.done > 0 ? (
            <span className="hud-pair inline-flex items-center gap-[var(--space-2)]">
              <StatusDot color="success" size={6} />
              <span className="hud-text whitespace-nowrap">{counts.scripts.done} Done</span>
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
