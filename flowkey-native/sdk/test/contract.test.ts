import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  PROTOCOL_VERSION,
  type AckMessage,
  type ActionMessage,
  type DetailTree,
  type GridTree,
  type InitMessage,
  type ListTree,
  type NativeCallMessage,
  type NativeResultMessage,
  type ReadyMessage,
  type SearchMessage,
  type UiPushMessage,
  type UiTree,
  type LaunchCommandMessage,
  type WebAbortMessage,
  type WebCallMessage,
  type WebResultMessage,
  type WebViewMessage,
  type WindowCommandMessage,
} from '../src/types';

const contractDir = resolve(import.meta.dir, '../../contract');
const readFixture = (name: string) => JSON.parse(readFileSync(resolve(contractDir, name), 'utf8'));

const uiFixture = readFixture('ui-tree.fixture.json');
const protocolFixture = readFixture('protocol.fixture.json');

import type { FormTree } from '../src/types';

const asList = (tree: unknown): ListTree => tree as ListTree;
const asDetail = (tree: unknown): DetailTree => tree as DetailTree;
const asGrid = (tree: unknown): GridTree => tree as GridTree;

const isListTree = (tree: UiTree): tree is ListTree => tree.type === 'list';

describe('ui-tree contract fixture', () => {
  test('list tree has sections, items, actions and empty view', () => {
    const list = asList(uiFixture.list);
    expect(list.type).toBe('list');
    expect(list.layout).toBe('side-pane');
    expect(list.filter?.options[0].label).toBe('All Types');
    expect(list.filter?.options.length).toBeGreaterThan(1);
    expect(list.sections.length).toBeGreaterThan(0);
    for (const section of list.sections) {
      expect(section.items.length).toBeGreaterThan(0);
      for (const item of section.items) {
        expect(item.id).toBeTruthy();
        expect(item.title).toBeTruthy();
        expect(item.actions?.length ?? 0).toBeGreaterThan(0);
        expect(item.actions?.some((a) => a.primary)).toBe(true);
      }
    }
    expect(
      list.sections[0].items[0].actions?.some(
        (a) => typeof a.push === 'string' && a.push.length > 0,
      ),
    ).toBe(true);
    expect(list.emptyView?.title).toBeTruthy();
  });

  test('list items may carry a selection pane', () => {
    const list = asList(uiFixture.list);
    const rocket = list.sections[0].items.find((i) => i.id === '🚀');
    expect(rocket?.pane?.preview).toBe('ship, launch');
    expect(rocket?.pane?.fields?.map((f) => f.label)).toEqual(['Source', 'Type', 'Characters']);
    expect(rocket?.pane?.fields?.[0].valueIconUri?.startsWith('data:image/png;base64,')).toBe(true);
    expect(list.sections[0].items[0].pane).toBeUndefined();
  });

  test('detail tree has title, fields, markdown description and a primary action', () => {
    const detail = asDetail(uiFixture.detail);
    expect(detail.type).toBe('detail');
    expect(detail.fields.length).toBeGreaterThan(0);
    expect(typeof detail.description).toBe('string');
    expect(detail.description).toContain('**fast**');
    expect(detail.actions?.some((a) => a.primary)).toBe(true);
    expect(detail.subtitle).toBe('SpaceX mission');
    expect(detail.imageUri).toBe('file:///icon-cache/test.png');
  });

  test('grid tree has sections, filter, vector icons and empty view', () => {
    const grid = asGrid(uiFixture.grid);
    expect(grid.type).toBe('grid');
    expect(grid.title).toBe('Results');
    expect(grid.columns).toBeGreaterThan(0);
    expect(grid.items).toEqual([]);
    expect(grid.sections?.length).toBe(2);
    expect(grid.sections?.[0].title).toBe('Smileys');
    expect(grid.sections?.[0].subtitle).toBe('2');
    expect(grid.sections?.[0].items.length).toBeGreaterThan(0);
    expect(grid.filter?.options.map((o) => o.value)).toEqual(['primary', 'red']);
    expect(grid.emptyView?.title).toBeTruthy();
  });

  test('grid items carry vector icon variants (iconName and iconSvg)', () => {
    const grid = asGrid(uiFixture.grid);
    const lucide = grid.sections?.[1].items.find((i) => i.id === 'lucide-activity');
    expect(lucide?.iconName).toBe('activity');
    expect(lucide?.iconColor).toBe('#EF4444');
    const svg = grid.sections?.[1].items.find((i) => i.id === 'svg-heart');
    expect(svg?.iconSvg).toContain('<svg');
    expect(svg?.iconSvg).toContain('viewBox="0 0 24 24"');
    expect(svg?.iconColor).toBe('#EC4899');
  });

  test('list items may carry an optional kind label', () => {
    const list = asList(uiFixture.list);
    const rocket = list.sections[0].items.find((i) => i.id === '🚀');
    expect(rocket?.kind).toBe('Symbol');
    expect(rocket?.iconName).toBe('rocket');
    expect(rocket?.iconColor).toBe('#8B5CF6');
    expect(list.sections[0].items[0].kind).toBeUndefined();
  });

  test('list items carry keywords and accessories; trees carry loading and placeholder', () => {
    const list = asList(uiFixture.list);
    const rocket = list.sections[0].items.find((i) => i.id === '🚀');
    expect(rocket?.keywords).toContain('rocket');
    expect(rocket?.accessories?.[0]).toEqual({
      text: 'Symbol',
      tooltip: 'Unicode category',
      color: 'secondary',
    });
    expect(list.isLoading).toBe(false);
    expect(list.searchBarPlaceholder).toBe('Search symbols...');
    const grid = asGrid(uiFixture.grid);
    expect(grid.isLoading).toBe(true);
  });

  test('actions may declare a destructive style and a shortcut hint', () => {
    const list = asList(uiFixture.list);
    const remove = list.sections[0].items[0].actions?.find((a) => a.id === 'remove');
    expect(remove?.style).toBe('destructive');
    expect(remove?.shortcut?.key).toBe('backspace');
    expect(remove?.shortcut?.modifiers).toEqual(['ctrl']);
  });

  test('list trees may declare pagination with a registry action id', () => {
    const list = asList(uiFixture.list);
    expect(list.pagination?.hasNextPage).toBe(true);
    expect(list.pagination?.moreActionId).toBe('load-more-1');
    expect(list.pagination?.pageSize).toBe(50);
  });

  test('detail metadata supports link, tags and separator field variants', () => {
    const detail = asDetail(uiFixture.detail);
    const link = detail.fields.find((f) => f.label === 'Repository');
    expect(link?.href).toBe('https://github.com/x/y');
    const tags = detail.fields.find((f) => f.label === 'Tags');
    expect(tags?.kind).toBe('tags');
    expect(tags?.tags).toEqual(['alpha', 'beta']);
    expect(detail.fields.at(-1)?.kind).toBe('separator');
  });

  test('every primary action id across fixtures is unique per item', () => {
    const trees: UiTree[] = [uiFixture.list, uiFixture.grid];
    for (const tree of trees) {
      if (!isListTree(tree)) continue;
      for (const section of tree.sections) {
        const ids = section.items.map((i) => i.actions?.find((a) => a.primary)?.id);
        expect(ids.every((id) => id === ids[0])).toBe(true);
      }
    }
  });
});

describe('form tree contract fixture', () => {
  const asForm = (tree: unknown): FormTree => tree as FormTree;

  test('form tree carries titled fields of every kind and a submit action id', () => {
    const form = asForm(uiFixture.form);
    expect(form.type).toBe('form');
    expect(form.title).toBe('New note');
    const kinds = form.fields.map((f) => f.kind);
    for (const kind of [
      'textfield',
      'password',
      'textarea',
      'checkbox',
      'dropdown',
      'datepicker',
      'tagpicker',
      'filepicker',
      'description',
      'separator',
    ] as const) {
      expect(kinds).toContain(kind);
    }
    const title = form.fields.find((f) => f.id === 'title');
    expect(title?.required).toBe(true);
    expect(title?.placeholder).toBe('Note title');
    const vault = form.fields.find((f) => f.id === 'vault');
    expect(vault?.options?.map((o) => o.value)).toEqual(['personal', 'work']);
    expect(vault?.default).toBe('personal');
    const tags = form.fields.find((f) => f.id === 'tags');
    expect(tags?.defaults).toEqual(['idea']);
    expect(form.actions?.some((a) => a.primary)).toBe(true);
    expect(form.submitActionId).toBe('submit-1');
  });
});

describe('protocol contract fixture', () => {
  test('protocolVersion is 1 and matches the SDK constant', () => {
    expect(protocolFixture.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(protocolFixture.hostToSidecar.init.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(protocolFixture.sidecarToHost.ready.protocolVersion).toBe(PROTOCOL_VERSION);
  });

  test('init declares extensionsDir and a preferences bag', () => {
    const init: InitMessage = protocolFixture.hostToSidecar.init;
    expect(init.type).toBe('init');
    expect(init.extensionsDir.length).toBeGreaterThan(0);
    expect('emoji' in init.preferences).toBe(true);
  });

  test('ready lists extensions with declared nativeMethods and httpHosts', () => {
    const ready: ReadyMessage = protocolFixture.sidecarToHost.ready;
    expect(ready.extensions.length).toBeGreaterThan(0);
    for (const ext of ready.extensions) {
      expect(typeof ext.description).toBe('string');
      expect(Array.isArray(ext.nativeMethods)).toBe(true);
      expect(Array.isArray(ext.httpHosts)).toBe(true);
    }
  });

  test('ready extensions may declare oauth providers', () => {
    const ready: ReadyMessage = protocolFixture.sidecarToHost.ready;
    for (const ext of ready.extensions) {
      expect(Array.isArray(ext.oauth)).toBe(true);
    }
    expect(ready.extensions[0].oauth).toEqual([]);
  });

  test('search and action messages carry requestId and extensionId', () => {
    const search = protocolFixture.hostToSidecar.search;
    const action: ActionMessage = protocolFixture.hostToSidecar.action;
    expect(search.requestId).toBeTruthy();
    expect(search.extensionId).toBeTruthy();
    expect(action.requestId).toBeTruthy();
    expect(action.extensionId).toBeTruthy();
    expect(action.item?.id).toBeTruthy();
    expect(action.arguments).toEqual({ direction: 'push' });
  });

  test('search with a command context carries commandId', () => {
    const search: SearchMessage = protocolFixture.hostToSidecar.searchWithCommand;
    expect(search.commandId).toBe('open');
    expect(search.extensionId).toBe('clipboard-history');
  });

  test('search with a filter context carries filterValue', () => {
    const search: SearchMessage = protocolFixture.hostToSidecar.searchWithCommand;
    expect(search.filterValue).toBe('all');
  });

  test('nativeResult examples cover the ok and error variants', () => {
    const ok: NativeResultMessage = protocolFixture.hostToSidecar.nativeResultOk;
    expect(ok.type).toBe('nativeResult');
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.result).toBeDefined();
    }

    const failure: NativeResultMessage = protocolFixture.hostToSidecar.nativeResultError;
    expect(failure.type).toBe('nativeResult');
    expect(failure.ok).toBe(false);
    if (!failure.ok) {
      expect(failure.error.code).toBe('hostNotAllowed');
      expect(failure.error.message).toBeTruthy();
    }
  });

  test('ready commands may declare keywords, mode and an optional icon', () => {
    const ready: ReadyMessage = protocolFixture.sidecarToHost.ready;
    const command = ready.extensions[0].commands[0];
    expect(Array.isArray(command.keywords)).toBe(true);
    expect(['view', 'background']).toContain(command.mode!);
    expect(command.icon).toBe('smile');
    expect(command.iconColor).toBe('#4F8CFF');
  });

  test('ready may declare a preference schema', () => {
    const ready: ReadyMessage = protocolFixture.sidecarToHost.ready;
    const schema = ready.extensions[0].preferences![0];
    expect(schema.name).toBe('skinTone');
    expect(schema.type).toBe('dropdown');
    expect(schema.options?.length).toBeGreaterThan(0);
  });

  test('ack is emitted on the success path only', () => {
    const ack: AckMessage = protocolFixture.sidecarToHost.ack;
    expect(ack.type).toBe('ack');
    expect(ack.requestId).toBeTruthy();
    expect('ok' in ack).toBe(false);
  });

  test('nativeCall carries extensionId for attribution', () => {
    const call: NativeCallMessage = protocolFixture.sidecarToHost.nativeCall;
    expect(call.extensionId).toBe('emoji');
    expect(call.method).toBeTruthy();
    expect(call.params).toBeDefined();
  });

  test('error and nativeResult error shapes have code and message', () => {
    const err = protocolFixture.sidecarToHost.error.error;
    expect(err.code).toBeTruthy();
    expect(err.message).toBeTruthy();
    expect(protocolFixture.sidecarToHost.nativeCallDenied.method).toBeTruthy();
  });

  test('storage and shell.openUrl native calls follow the wire shape', () => {
    const storageCall: NativeCallMessage = protocolFixture.sidecarToHost.nativeCallStorage;
    expect(storageCall.extensionId).toBe('demo-ext');
    expect(storageCall.method).toBe('storage.get');
    expect(storageCall.params?.key).toBe('last-sync');
    const openUrlCall: NativeCallMessage = protocolFixture.sidecarToHost.nativeCallOpenUrl;
    expect(openUrlCall.method).toBe('shell.openUrl');
    expect(openUrlCall.params?.url).toBe('https://example.com/release');
  });

  test('windowCommand and launchCommand carry extension attribution', () => {
    const windowCommand: WindowCommandMessage = protocolFixture.sidecarToHost.windowCommand;
    expect(windowCommand.type).toBe('windowCommand');
    expect(windowCommand.extensionId).toBe('demo-ext');
    expect(windowCommand.command).toBe('closeMainWindow');

    const launch: LaunchCommandMessage = protocolFixture.sidecarToHost.launchCommand;
    expect(launch.type).toBe('launchCommand');
    expect(launch.extensionId).toBe('demo-ext');
    expect(launch.commandId).toBe('open');
    expect(launch.query).toBe('notes');
  });

  test('web bridge messages follow the wire shape', () => {
    const call: WebCallMessage = protocolFixture.hostToSidecar.webCall;
    expect(call.type).toBe('webCall');
    expect(call.bridgeId).toBe('w-1');
    expect(call.extensionId).toBe('speedtest');
    expect(call.method).toBe('http.fetch');
    expect(call.timeoutMs).toBe(20000);
    expect(call.params?.discardBody).toBe(true);

    const abort: WebAbortMessage = protocolFixture.hostToSidecar.webAbort;
    expect(abort.type).toBe('webAbort');
    expect(abort.bridgeId).toBe('w-1');

    const mount: WebViewMessage = protocolFixture.sidecarToHost.webView;
    expect(mount.type).toBe('webView');
    expect(mount.requestId).toBe('s-9');
    expect(mount.extensionId).toBe('speedtest');
    expect(mount.commandId).toBe('test');
    expect(mount.entry).toBe('main.web.js');
    expect(mount.props.environment.commandMode).toBe('view');

    const result: WebResultMessage = protocolFixture.sidecarToHost.webResult;
    expect(result.type).toBe('webResult');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.result as { bytesReceived?: number }).bytesReceived).toBe(4000000);
    }
  });

  test('toast and alert native calls follow the wire shape', () => {
    const toastCall: NativeCallMessage = protocolFixture.sidecarToHost.nativeCallToast;
    expect(toastCall.method).toBe('toast.show');
    expect(toastCall.params?.title).toBe('Saved');
    expect(toastCall.params?.style).toBe('success');

    const alertCall: NativeCallMessage = protocolFixture.sidecarToHost.nativeCallAlert;
    expect(alertCall.method).toBe('alert.confirm');
    expect(alertCall.params?.title).toBe('Delete note?');
    expect(alertCall.params?.destructive).toBe(true);
  });

  test('uiPush carries extension, command, view state and a tree without a requestId', () => {
    const push = protocolFixture.sidecarToHost.uiPush as UiPushMessage;
    expect(push.type).toBe('uiPush');
    expect(push.extensionId).toBe('clipboard-history');
    expect(push.commandId).toBe('open');
    expect(push.query).toBe('par');
    expect(push.filterValue).toBe('all');
    expect(push.tree.type).toBe('list');
    expect('requestId' in push).toBe(false);
  });
});
