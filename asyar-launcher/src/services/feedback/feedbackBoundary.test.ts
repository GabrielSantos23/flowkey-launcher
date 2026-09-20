import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const srcRoot = resolve(__dirname, '../..');
const repoRoot = resolve(srcRoot, '../..');

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = resolve(root, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx)$/.test(path) && !path.endsWith('.test.ts') && !path.endsWith('.test.tsx')
      ? [path]
      : [];
  });
}

function violations(pattern: RegExp, allowed: ReadonlySet<string>): string[] {
  return sourceFiles(srcRoot)
    .filter((path) => !allowed.has(relative(srcRoot, path).replace(/\\/g, '/')))
    .filter((path) => pattern.test(readFileSync(path, 'utf8')))
    .map((path) => relative(repoRoot, path).replace(/\\/g, '/'));
}

describe('feedback facade boundary', () => {
  it('is the only launcher module allowed to access native feedback children', () => {
    const allowed = new Set(['services/feedback/feedbackService.ts']);
    const directChildAccess =
      /services\/(?:diagnostics\/diagnosticsService|notification\/notificationService)|\bdiagnosticsService\.|\bcommands\.(?:showHud|hideHud|feedback(?:Publish|GetCurrent|UpdateProgress|FinishProgress|Dismiss|AcceptAnnouncement))\b|\bfeedback(?:Publish|GetCurrent|UpdateProgress|FinishProgress|Dismiss|AcceptAnnouncement)\s*\(/;

    expect(violations(directChildAccess, allowed)).toEqual([]);
  }, 30000);

  it('keeps feedback presenters behind approved composition hosts', () => {
    const allowed = new Set([
      'components/layout/BottomActionBar.tsx',
      'components/layout/FeedbackBar.tsx',
      'App.tsx',
    ]);
    const childPresenterImport =
      /(?:ToastHost|FatalErrorDialog|FeedbackDetailsDialog|FeedbackBar)\.tsx/;

    expect(violations(childPresenterImport, allowed)).toEqual([]);
  });

  it('keeps raw HUD and progress commands behind the feedback facade', () => {
    const allowed = new Set(['services/feedback/feedbackService.ts']);
    const hudOrProgressCommands =
      /(?<!function )\b(?:commands\.)?(?:showHud|hideHud|feedbackUpdateProgress|feedbackFinishProgress)\s*\(/;

    expect(violations(hudOrProgressCommands, allowed)).toEqual([]);
  });
});
