import React from 'react';
import { Icon } from '../react/Icon';
import { KeyboardHint } from '../react/Indicators';

import type { MappedSearchItem } from '../../services/search/types/MappedSearchItem';

export interface CalcResultCardProps {
  item: MappedSearchItem;
  index: number;
  selected?: boolean;
  onclick?: () => void;
}

type CalcIconMeta = { color: string; label: string; name: string };

const CALC_ICONS: Record<string, CalcIconMeta> = {
  '🧮': { color: 'var(--accent-primary)', label: 'Calculator', name: 'calculator' },
  '📏': { color: 'rgb(52,199,89)', label: 'Units', name: 'calc-units' },
  '💵': { color: 'rgb(255,149,0)', label: 'Currency', name: 'calc-currency' },
  '📅': { color: 'rgb(175,82,222)', label: 'Date', name: 'calc-date' },
  '🕑': { color: 'rgb(90,200,250)', label: 'Time', name: 'calc-time' },
  '🔢': { color: 'rgb(255,59,48)', label: 'Base', name: 'calc-base' },
  '🎨': { color: 'rgb(255,45,85)', label: 'Color', name: 'palette' },
  '％': { color: 'rgb(88,86,214)', label: 'Percent', name: 'calc-percent' },
  '➗': { color: 'rgb(0,199,190)', label: 'Ratio', name: 'calc-ratio' },
};

const CALC_ICON_FALLBACK: CalcIconMeta = {
  color: 'var(--accent-primary)',
  label: '',
  name: 'calculator',
};

export default function CalcResultCard({
  item,
  index,
  selected = false,
  onclick,
}: CalcResultCardProps) {
  const calc = (item.icon && CALC_ICONS[item.icon]) || CALC_ICON_FALLBACK;
  const isTwoPlusTwoEasterEgg = item.title === '1' && item.subtitle?.replace(/\s+/g, '') === '2+2';
  const resultLabel = isTwoPlusTwoEasterEgg ? 'Rounded down for optimization 😅' : 'Result';

  return (
    <button
      type="button"
      data-index={index}
      className={`result-item calc-large-item p-0 rounded-[var(--radius-xl)] mb-[var(--space-2)] overflow-hidden w-full text-left ${
        selected ? 'selected-result' : ''
      }`}
      onClick={onclick}
      style={{ '--cat-color': calc.color } as React.CSSProperties}
    >
      <div className="flex flex-col w-full">
        <div className="flex items-center justify-between px-[var(--space-5-5)] pt-[var(--space-4)] pb-[var(--space-3)]">
          <div className="flex items-center gap-[var(--space-3)]">
            <div
              className="w-[26px] h-[26px] rounded-[var(--radius-sm)] flex items-center justify-center text-[var(--text-on-accent)] shrink-0"
              style={{
                background: `linear-gradient(145deg, ${calc.color}, color-mix(in srgb, ${calc.color} 72%, black))`,
                boxShadow: `0 2px 6px color-mix(in srgb, ${calc.color} 35%, transparent), inset 0 1px 0 rgba(255, 255, 255, 0.2)`,
              }}
            >
              <Icon name={calc.name} size={14} strokeWidth={2} />
            </div>
            <span className="text-[var(--font-size-xs)] font-semibold text-[var(--text-tertiary)] tracking-wider uppercase">
              {calc.label}
            </span>
          </div>
          <span className="calc-copy-hint">
            <KeyboardHint keys={['↵']} />
          </span>
        </div>

        <div className="flex items-stretch border-t border-[color-mix(in_srgb,var(--cat-color)_8%,var(--separator))]">
          <div className="flex-1 flex flex-col gap-[var(--space-1-5)] px-[var(--space-7)] pt-[var(--space-5-5)] pb-[var(--space-7)] min-w-0">
            <span className="font-mono text-[var(--font-size-display)] font-light text-[var(--text-primary)] leading-tight whitespace-nowrap overflow-hidden">
              {item.subtitle ?? ''}
            </span>
            <span className="text-[var(--font-size-2xs)] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
              {'Expression'}
            </span>
          </div>

          <div
            className="w-[1px] my-[var(--space-4)] shrink-0"
            style={{
              background: `linear-gradient(to bottom, transparent, color-mix(in srgb, ${calc.color} 25%, var(--separator)), transparent)`,
            }}
          />

          <div className="flex-1 flex flex-col gap-[var(--space-1-5)] px-[var(--space-7)] pt-[var(--space-5-5)] pb-[var(--space-7)] min-w-0">
            <span className="font-mono text-[var(--font-size-display)] font-normal text-[var(--text-primary)] leading-tight whitespace-nowrap overflow-hidden">
              {item.title}
            </span>
            <span className="text-[var(--font-size-2xs)] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
              {resultLabel}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}
