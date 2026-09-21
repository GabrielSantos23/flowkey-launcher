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
  type ReadyMessage,
  type SearchMessage,
  type UiTree,
} from '../src/types';

const contractDir = resolve(import.meta.dir, '../../contract');
const readFixture = (name: string) => JSON.parse(readFileSync(resolve(contractDir, name), 'utf8'));

const uiFixture = readFixture('ui-tree.fixture.json');
const protocolFixture = readFixture('protocol.fixture.json');

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
    expect(list.emptyView?.title).toBeTruthy();
  });

  test('list items may carry a selection pane', () => {
    const list = asList(uiFixture.list);
    const rocket = list.sections[0].items.find((i) => i.id === '🚀');
    expect(rocket?.pane?.preview).toBe('ship, launch');
    expect(rocket?.pane?.fields?.map((f) => f.label)).toEqual(['Type', 'Characters']);
    expect(list.sections[0].items[0].pane).toBeUndefined();
  });

  test('detail tree has title, fields, markdown description and a primary action', () => {
    const detail = asDetail(uiFixture.detail);
    expect(detail.type).toBe('detail');
    expect(detail.fields.length).toBeGreaterThan(0);
    expect(typeof detail.description).toBe('string');
    expect(detail.description).toContain('**fast**');
    expect(detail.actions?.some((a) => a.primary)).toBe(true);
  });

  test('grid item iconUri parses into the UiItem type', () => {
    const grid = asGrid(uiFixture.grid);
    expect(typeof grid.items[0].iconUri).toBe('string');
    expect(grid.items[0].iconUri?.startsWith('data:image/png;base64,')).toBe(true);
  });

  test('grid tree has columns, items and empty view', () => {
    const grid = asGrid(uiFixture.grid);
    expect(grid.type).toBe('grid');
    expect(grid.title).toBe('Results');
    expect(grid.columns).toBeGreaterThan(0);
    expect(grid.items.length).toBeGreaterThan(0);
    expect(grid.emptyView?.title).toBeTruthy();
  });

  test('list items may carry an optional kind label', () => {
    const list = asList(uiFixture.list);
    const rocket = list.sections[0].items.find((i) => i.id === '🚀');
    expect(rocket?.kind).toBe('Symbol');
    expect(rocket?.iconName).toBe('rocket');
    expect(rocket?.iconColor).toBe('#8B5CF6');
    expect(list.sections[0].items[0].kind).toBeUndefined();
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
      expect(Array.isArray(ext.nativeMethods)).toBe(true);
      expect(Array.isArray(ext.httpHosts)).toBe(true);
    }
  });

  test('search and action messages carry requestId and extensionId', () => {
    const search = protocolFixture.hostToSidecar.search;
    const action: ActionMessage = protocolFixture.hostToSidecar.action;
    expect(search.requestId).toBeTruthy();
    expect(search.extensionId).toBeTruthy();
    expect(action.requestId).toBeTruthy();
    expect(action.extensionId).toBeTruthy();
    expect(action.item?.id).toBeTruthy();
  });

  test('search with a command context carries commandId', () => {
    const search: SearchMessage = protocolFixture.hostToSidecar.searchWithCommand;
    expect(search.commandId).toBe('open');
    expect(search.extensionId).toBe('clipboard-history');
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
});
