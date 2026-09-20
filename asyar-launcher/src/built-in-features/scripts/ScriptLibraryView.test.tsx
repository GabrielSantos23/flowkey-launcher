// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./scriptsManager', () => ({
  scriptsManager: {
    scripts: [],
    issues: [],
    selectedEntryId: null,
    selectedScript: undefined,
    selectedIssue: undefined,
    selectEntry: vi.fn(),
    moveSelection: vi.fn(),
    makeSelectedExecutable: vi.fn(async () => {}),
  },
}));

vi.mock('./runSelected', () => ({
  runSelectedScript: vi.fn(async () => {}),
}));

vi.mock('../../components/base/Modal.logic', () => ({
  isAnyModalOpen: vi.fn(() => false),
}));

vi.mock('../../services/extension/viewManager', () => ({
  viewManager: { activeViewPrimaryActionLabel: null },
}));

vi.mock('../../services/search/commandArguments', () => ({
  commandArgumentsService: { active: null },
}));

import ScriptLibraryView from './ScriptLibraryView';
import { scriptsManager } from './scriptsManager';
import { runSelectedScript } from './runSelected';
import { isAnyModalOpen } from '../../components/base/Modal.logic';
import { viewManager } from '../../services/extension/viewManager';
import { commandArgumentsService } from '../../services/search/commandArguments';

const argumentMode = commandArgumentsService as unknown as { active: unknown };

const script = {
  absolutePath: '/scripts/deploy.sh',
  directoryPath: '/scripts',
  fileName: 'deploy.sh',
  displayName: 'Deploy',
  dynamicId: 'deploy-id',
  header: { mode: 'silent', icon: null, arguments: [], refreshTimeSeconds: null },
};

const notExecutableIssue = {
  absolutePath: '/scripts/broken.sh',
  directoryPath: '/scripts',
  fileName: 'broken.sh',
  message: 'File is not executable',
  reason: 'notExecutable',
  fix: 'makeExecutable',
};

const unreadableIssue = {
  absolutePath: '/scripts/unreadable.sh',
  directoryPath: '/scripts',
  fileName: 'unreadable.sh',
  message: 'File could not be read',
  reason: 'contentUnreadable',
  fix: null,
};

function selectScript() {
  Object.assign(scriptsManager, {
    scripts: [script],
    issues: [],
    selectedEntryId: `script:${script.dynamicId}`,
    selectedScript: script,
    selectedIssue: undefined,
  });
}

function selectIssue(issue: typeof notExecutableIssue | typeof unreadableIssue) {
  Object.assign(scriptsManager, {
    scripts: [],
    issues: [issue],
    selectedEntryId: `issue:${issue.absolutePath}`,
    selectedScript: undefined,
    selectedIssue: issue,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isAnyModalOpen).mockReturnValue(false);
  viewManager.activeViewPrimaryActionLabel = null;
  argumentMode.active = null;
  Object.assign(scriptsManager, {
    scripts: [],
    issues: [],
    selectedEntryId: null,
    selectedScript: undefined,
    selectedIssue: undefined,
  });
});

describe('ScriptLibraryView keyboard', () => {
  it('runs the selected script on Enter', async () => {
    selectScript();
    render(<ScriptLibraryView />);

    const notConsumed = await fireEvent.keyDown(window, { key: 'Enter' });

    expect(runSelectedScript).toHaveBeenCalled();
    expect(notConsumed).toBe(false);
  });

  it('repairs a not-executable script instead of running it', async () => {
    selectIssue(notExecutableIssue);
    render(<ScriptLibraryView />);

    const notConsumed = await fireEvent.keyDown(window, { key: 'Enter' });

    expect(scriptsManager.makeSelectedExecutable).toHaveBeenCalled();
    expect(runSelectedScript).not.toHaveBeenCalled();
    expect(notConsumed).toBe(false);
  });
});
