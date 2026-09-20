import { cx } from '../../utils/cx';

export type StatusDotColor = 'success' | 'warning' | 'danger' | 'info';

export type StatusDotProps = {
  color?: StatusDotColor;
  pulse?: boolean;
  size?: number;
};

export function StatusDot({ color = 'success', pulse = false, size = 8 }: StatusDotProps) {
  return (
    <div
      className={cx('status-dot', `dot-${color}`, { pulse })}
      style={{ '--dot-size': `${size}px` } as React.CSSProperties}
    />
  );
}

export type KeyboardHintProps = {
  keys: string | string[];
  action?: string;
};

export function KeyboardHint({ keys, action }: KeyboardHintProps) {
  const keyList = Array.isArray(keys) ? keys : [keys];
  return (
    <div className="keyboard-hint">
      <div className="key-group">
        {keyList.map((key, i) =>
          key === '↵' ? (
            <kbd key={i} className="text-mono">
              <span className="glyph-return">{key}</span>
            </kbd>
          ) : (
            <kbd key={i} className="text-mono">
              {key}
            </kbd>
          ),
        )}
      </div>
      {action ? <span className="action text-caption">{action}</span> : null}
    </div>
  );
}

export type MeterBarProps = {
  value?: number;
  variant?: 'brand' | 'neutral';
};

export function MeterBar({ value = 0, variant = 'brand' }: MeterBarProps) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="meter-track">
      <div className={cx('meter-fill', variant)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export type SegmentedOption = { value: string; label: string };

export type SegmentedControlProps = {
  options: SegmentedOption[];
  value: string;
  onChange?: (value: string) => void;
};

export function SegmentedControl({ options, value, onChange }: SegmentedControlProps) {
  return (
    <div className="segmented-control" role="radiogroup">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className={cx('segment', { active: value === option.value })}
          onClick={() => {
            if (option.value !== value) onChange?.(option.value);
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
