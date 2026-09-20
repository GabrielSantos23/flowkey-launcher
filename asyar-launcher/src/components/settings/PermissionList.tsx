import React from 'react';
import { describePermission } from '../../services/extension/permissionCatalog';

export interface PermissionListProps {
  permissions: string[];
  permissionArgs?: Record<string, unknown>;
}

export default function PermissionList({ permissions, permissionArgs = {} }: PermissionListProps) {
  const argsFor = (permission: string): { chips: string[] | null; json: string | null } => {
    const value = permissionArgs?.[permission];
    if (value === undefined || value === null) return { chips: null, json: null };
    if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
      return { chips: value as string[], json: null };
    }
    return { chips: null, json: JSON.stringify(value, null, 2) };
  };

  return (
    <div className="permission-list flex flex-col gap-[1px] bg-[var(--border-color)] border border-[var(--border-color)] rounded-[var(--radius-lg)] overflow-hidden">
      {permissions.map((permission) => {
        const info = describePermission(permission);
        const args = argsFor(permission);

        return (
          <div
            key={permission}
            className="permission-item bg-[var(--bg-secondary)] p-4 flex flex-col"
          >
            <div className="permission-item-head flex items-baseline gap-3 flex-wrap">
              <span className="permission-title text-sm font-medium text-[var(--text-primary)]">
                {info.title}
              </span>
              <code className="permission-scope text-xs text-[var(--text-secondary)] font-mono">
                {permission}
              </code>
            </div>
            <p className="permission-desc mt-1 mb-0 text-xs text-[var(--text-secondary)] leading-relaxed">
              {info.description}
              {!info.known ? (
                <span className="permission-caution ml-1 text-[var(--accent-danger)]">
                  ⚠️ Review carefully before allowing.
                </span>
              ) : null}
            </p>
            {args.chips ? (
              <div className="permission-args flex flex-wrap gap-1 mt-2">
                {args.chips.map((chip) => (
                  <code
                    key={chip}
                    className="permission-arg-chip font-mono text-xs bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-[var(--radius-xs)] px-2 py-0.5 text-[var(--text-primary)] break-all"
                  >
                    {chip}
                  </code>
                ))}
              </div>
            ) : args.json ? (
              <pre className="permission-arg-json font-mono text-xs overflow-x-auto bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-[var(--radius-xs)] p-2 text-[var(--text-primary)] mt-2">
                {args.json}
              </pre>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
