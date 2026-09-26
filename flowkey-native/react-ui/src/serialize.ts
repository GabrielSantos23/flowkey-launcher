import type {
  DetailTree,
  GridTree,
  ListTree,
  UiAction,
  UiEmptyView,
  UiFilter,
  UiItem,
  UiPane,
  UiPaneField,
  UiSection,
  UiTree,
} from '@flowkey-cli/native-sdk';
import { Fragment, type ReactElement } from 'react';
import { ReactUiError } from './errors';
import { resolveIntrinsic } from './intrinsic';
import type { HostContainer, HostNode } from './node';
import type { IconSpec } from './props';
import type { ActionHandler, ActionRegistry } from './registry';

function requireIntrinsic(type: unknown, context: string): string {
  const resolved = resolveIntrinsic(type);
  if (resolved !== undefined) return resolved;
  throw new ReactUiError(
    `${context}: expected a FlowKey UI component, got <${describeType(type)}>`,
  );
}

function describeType(type: unknown): string {
  if (typeof type === 'function') return type.name || 'anonymous component';
  return String(type);
}

interface SerializeState {
  registry: ActionRegistry;
  seenActionIds: Set<string>;
  seenItemIds: Set<string>;
  hasPane: boolean;
}

const LIST_ALLOWED = ['layout', 'filter'];
const LIST_SECTION_ALLOWED = ['title'];
const LIST_ITEM_ALLOWED = ['id', 'title', 'subtitle', 'kind', 'icon', 'actions', 'detail'];
const LIST_ITEM_DETAIL_ALLOWED = ['preview', 'previewImageUri'];
const DETAIL_ALLOWED = ['title', 'mediaKeys', 'subtitle', 'imageUri', 'markdown', 'actions'];
const DETAIL_METADATA_ALLOWED: string[] = [];
const DETAIL_FIELD_ALLOWED = ['label', 'value', 'valueIconUri'];
const GRID_ALLOWED = ['columns', 'title', 'filter'];
const GRID_ITEM_ALLOWED = ['id', 'title', 'subtitle', 'kind', 'icon', 'actions'];
const GRID_SECTION_ALLOWED = ['title', 'subtitle'];
const ACTION_PANEL_ALLOWED: string[] = [];
const ACTION_ALLOWED = ['title', 'primary', 'push', 'onAction', 'id'];
const EMPTY_VIEW_ALLOWED = ['title', 'description'];

const ROOT_TYPES = new Set(['list', 'detail', 'grid']);

export function serializeUiTree(container: HostContainer, registry: ActionRegistry): UiTree {
  const roots = container.children;
  if (roots.length === 0) {
    return { type: 'list', sections: [] };
  }
  if (roots.length > 1) {
    throw new ReactUiError(
      `component must render a single <List>, <Detail> or <Grid>, got ${roots.length} root elements`,
    );
  }
  const root = roots[0];
  if (!ROOT_TYPES.has(root.type)) {
    throw new ReactUiError(
      `component must render a <List>, <Detail> or <Grid>, got <${root.type}>`,
    );
  }
  const state: SerializeState = {
    registry,
    seenActionIds: new Set(),
    seenItemIds: new Set(),
    hasPane: false,
  };
  if (root.type === 'list') return serializeList(root, state);
  if (root.type === 'detail') return serializeDetail(root, state);
  return serializeGrid(root, state);
}

function checkProps(type: string, props: Record<string, unknown>, allowed: string[]): void {
  for (const key of Object.keys(props)) {
    if (key === 'children') continue;
    if (!allowed.includes(key)) {
      throw new ReactUiError(`unknown prop '${key}' on <${type}>`);
    }
  }
}

function requireString(type: string, props: Record<string, unknown>, key: string): string {
  const value = props[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new ReactUiError(`<${type}> requires a non-empty string prop '${key}'`);
  }
  return value;
}

function optionalString(
  type: string,
  props: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = props[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new ReactUiError(`<${type}> prop '${key}' must be a string`);
  }
  return value;
}

function optionalBoolean(
  type: string,
  props: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const value = props[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') {
    throw new ReactUiError(`<${type}> prop '${key}' must be a boolean`);
  }
  return value;
}

function optionalIcon(type: string, props: Record<string, unknown>, key: string): Partial<UiItem> {
  const value = props[key];
  if (value === undefined) return {};
  if (typeof value === 'string') {
    return value.length > 0 ? { icon: value } : {};
  }
  if (typeof value !== 'object' || value === null) {
    throw new ReactUiError(`<${type}> prop '${key}' must be a string or an icon object`);
  }
  const spec = value as IconSpec;
  const sources = ['emoji' in spec, 'lucide' in spec, 'uri' in spec, 'svg' in spec].filter(
    Boolean,
  ).length;
  if (sources !== 1) {
    throw new ReactUiError(
      `<${type}> prop '${key}' must set exactly one of emoji, lucide, uri or svg`,
    );
  }
  if ('color' in spec && !('lucide' in spec || 'svg' in spec)) {
    throw new ReactUiError(
      `<${type}> prop '${key}' may only set 'color' together with 'lucide' or 'svg'`,
    );
  }
  if (typeof spec.emoji === 'string') return { icon: spec.emoji };
  if (typeof spec.uri === 'string') return { iconUri: spec.uri };
  if (typeof spec.svg === 'string') {
    if (spec.svg.length === 0) {
      throw new ReactUiError(`<${type}> prop '${key}' has empty svg content`);
    }
    const out: Partial<UiItem> = { iconSvg: spec.svg };
    if (typeof spec.color === 'string') out.iconColor = spec.color;
    return out;
  }
  if (typeof spec.lucide === 'string') {
    const out: Partial<UiItem> = { iconName: spec.lucide };
    if (typeof spec.color === 'string') out.iconColor = spec.color;
    return out;
  }
  throw new ReactUiError(`<${type}> prop '${key}' has empty icon fields`);
}

function optionalFilter(component: string, props: Record<string, unknown>): UiFilter | undefined {
  const filterValue = props['filter'];
  if (filterValue === undefined) {
    return undefined;
  }
  if (!Array.isArray(filterValue)) {
    throw new ReactUiError(`<${component}> prop 'filter' must be an array of {label, value}`);
  }
  const options = filterValue.map((option) => {
    if (
      typeof option !== 'object' ||
      option === null ||
      typeof (option as { label?: unknown }).label !== 'string' ||
      typeof (option as { value?: unknown }).value !== 'string'
    ) {
      throw new ReactUiError(
        `<${component}> prop 'filter' entries must be {label: string, value: string}`,
      );
    }
    const { label, value } = option as { label: string; value: string };
    return { label, value };
  });
  return options.length > 0 ? { options } : undefined;
}

function serializeList(node: HostNode, state: SerializeState): ListTree {
  checkProps('list', node.props, LIST_ALLOWED);
  const layoutValue = node.props['layout'];
  if (layoutValue !== undefined && layoutValue !== 'side-pane') {
    throw new ReactUiError(`<list> prop 'layout' must be 'side-pane'`);
  }
  const filter = optionalFilter('list', node.props);

  const sections: UiSection[] = [];
  let pending: UiItem[] = [];
  let emptyView: UiEmptyView | undefined;
  let emptyViewCount = 0;
  for (const child of node.children) {
    if (child.type === 'list-section') {
      if (pending.length > 0) {
        sections.push({ items: pending });
        pending = [];
      }
      sections.push(serializeSection(child, state));
    } else if (child.type === 'list-item') {
      pending.push(serializeItem(child, state, true));
    } else if (child.type === 'empty-view') {
      emptyViewCount += 1;
      if (emptyViewCount > 1) {
        throw new ReactUiError('a <List> may contain at most one <List.EmptyView>');
      }
      emptyView = serializeEmptyView(child);
    } else {
      throw new ReactUiError(
        `<list> children must be <List.Section>, <List.Item> or <List.EmptyView>, got <${child.type}>`,
      );
    }
  }
  if (pending.length > 0) {
    sections.push({ items: pending });
  }
  const tree: ListTree = { type: 'list', sections };
  const layout = layoutValue !== undefined ? layoutValue : state.hasPane ? 'side-pane' : undefined;
  if (layout !== undefined) tree.layout = layout;
  if (filter !== undefined) tree.filter = filter;
  if (emptyView !== undefined) tree.emptyView = emptyView;
  return tree;
}

function serializeSection(node: HostNode, state: SerializeState): UiSection {
  checkProps('list-section', node.props, LIST_SECTION_ALLOWED);
  const title = optionalString('list-section', node.props, 'title');
  const items = node.children.map((child) => {
    if (child.type !== 'list-item') {
      throw new ReactUiError(`<list-section> children must be <List.Item>, got <${child.type}>`);
    }
    return serializeItem(child, state, true);
  });
  const section: UiSection = { items };
  if (title !== undefined) section.title = title;
  return section;
}

function serializeItem(node: HostNode, state: SerializeState, paneAllowed: boolean): UiItem {
  const type = paneAllowed ? 'list-item' : 'grid-item';
  checkProps(type, node.props, paneAllowed ? LIST_ITEM_ALLOWED : GRID_ITEM_ALLOWED);
  const id = requireString(type, node.props, 'id');
  if (state.seenItemIds.has(id)) {
    throw new ReactUiError(`duplicate item id '${id}' in tree`);
  }
  state.seenItemIds.add(id);
  const title = requireString(type, node.props, 'title');
  const item: UiItem = { id, title };
  const subtitle = optionalString(type, node.props, 'subtitle');
  if (subtitle !== undefined) item.subtitle = subtitle;
  const kind = optionalString(type, node.props, 'kind');
  if (kind !== undefined) item.kind = kind;
  Object.assign(item, optionalIcon(type, node.props, 'icon'));
  const actionsValue = node.props['actions'];
  if (actionsValue !== undefined) {
    const actions = serializeActions(actionsValue, state);
    if (actions.length > 0) item.actions = actions;
  }
  if (paneAllowed) {
    const detailValue = node.props['detail'];
    if (detailValue !== undefined) {
      const pane = serializePaneElement(detailValue, state);
      if (pane !== undefined) {
        item.pane = pane;
        state.hasPane = true;
      }
    }
    for (const child of node.children) {
      if (child.type !== 'list-item-detail') {
        throw new ReactUiError(
          `<list-item> children must be <List.Item.Detail>, got <${child.type}>`,
        );
      }
      if (item.pane !== undefined) {
        throw new ReactUiError(`<list-item> may only have one <List.Item.Detail>`);
      }
      const pane = serializePaneNode(child, state);
      if (pane !== undefined) {
        item.pane = pane;
        state.hasPane = true;
      }
    }
  }
  return item;
}

function serializePaneElement(detailValue: unknown, state: SerializeState): UiPane | undefined {
  if (
    !isElement(detailValue) ||
    requireIntrinsic(detailValue.type, "<list-item> prop 'detail'") !== 'list-item-detail'
  ) {
    throw new ReactUiError(`<list-item> prop 'detail' must be a <List.Item.Detail> element`);
  }
  const element = detailValue as ReactElement<Record<string, unknown>>;
  checkProps('list-item-detail', element.props, LIST_ITEM_DETAIL_ALLOWED);
  return finishPane(
    element.props,
    serializeMetadataFromRaw(element.props['children'], state, true),
  );
}

function serializePaneNode(node: HostNode, state: SerializeState): UiPane | undefined {
  checkProps('list-item-detail', node.props, LIST_ITEM_DETAIL_ALLOWED);
  return finishPane(node.props, serializeMetadataFromHost(node.children, state, true));
}

function finishPane(props: Record<string, unknown>, fields: UiPaneField[]): UiPane | undefined {
  const pane: UiPane = {};
  const preview = optionalString('list-item-detail', props, 'preview');
  if (preview !== undefined) pane.preview = preview;
  const previewImageUri = optionalString('list-item-detail', props, 'previewImageUri');
  if (previewImageUri !== undefined) pane.previewImageUri = previewImageUri;
  if (fields.length > 0) pane.fields = fields;
  if (
    pane.preview === undefined &&
    pane.previewImageUri === undefined &&
    pane.fields === undefined
  ) {
    return undefined;
  }
  return pane;
}

function serializeMetadataFromHost(
  nodes: HostNode[],
  state: SerializeState,
  allowValueIconUri: boolean,
): UiPaneField[] {
  const fields: UiPaneField[] = [];
  for (const node of nodes) {
    if (node.type !== 'detail-metadata') {
      throw new ReactUiError(`<detail> children must be <Detail.Metadata>, got <${node.type}>`);
    }
    checkProps('detail-metadata', node.props, DETAIL_METADATA_ALLOWED);
    for (const fieldNode of node.children) {
      if (fieldNode.type !== 'detail-field') {
        throw new ReactUiError(
          `<Detail.Metadata> children must be <Detail.Metadata.Field>, got <${fieldNode.type}>`,
        );
      }
      fields.push(serializeField(fieldNode.props, state, allowValueIconUri));
    }
  }
  return fields;
}

function serializeMetadataFromRaw(
  children: unknown,
  state: SerializeState,
  allowValueIconUri: boolean,
): UiPaneField[] {
  const fields: UiPaneField[] = [];
  for (const child of flattenElements(children)) {
    if (!isElement(child)) {
      throw new ReactUiError(
        `<list-item-detail> children must be <List.Item.Detail.Metadata>, got ${describeNode(child)}`,
      );
    }
    if (isFragment(child)) {
      fields.push(...serializeMetadataFromRaw(child.props['children'], state, allowValueIconUri));
      continue;
    }
    if (requireIntrinsic(child.type, '<list-item-detail> children') !== 'detail-metadata') {
      throw new ReactUiError(
        `<list-item-detail> children must be <List.Item.Detail.Metadata>, got ${describeNode(child)}`,
      );
    }
    const metadata = child as ReactElement<Record<string, unknown>>;
    checkProps('detail-metadata', metadata.props, DETAIL_METADATA_ALLOWED);
    for (const node of flattenElements(metadata.props['children'])) {
      if (
        !isElement(node) ||
        requireIntrinsic(node.type, '<Metadata> children') !== 'detail-field'
      ) {
        throw new ReactUiError(
          `<Metadata> children must be <Metadata.Field>, got ${describeNode(node)}`,
        );
      }
      fields.push(
        serializeField(
          (node as ReactElement<Record<string, unknown>>).props,
          state,
          allowValueIconUri,
        ),
      );
    }
  }
  return fields;
}

function serializeField(
  props: Record<string, unknown>,
  _state: SerializeState,
  allowValueIconUri: boolean,
): UiPaneField {
  checkProps('detail-field', props, DETAIL_FIELD_ALLOWED);
  if (!allowValueIconUri && props['valueIconUri'] !== undefined) {
    throw new ReactUiError(
      `<Metadata.Field> prop 'valueIconUri' is only supported inside <List.Item.Detail>`,
    );
  }
  const field: UiPaneField = {
    label: requireString('detail-field', props, 'label'),
    value: requireString('detail-field', props, 'value'),
  };
  if (allowValueIconUri) {
    const valueIconUri = optionalString('detail-field', props, 'valueIconUri');
    if (valueIconUri !== undefined) field.valueIconUri = valueIconUri;
  }
  return field;
}

function serializeDetail(node: HostNode, state: SerializeState): DetailTree {
  checkProps('detail', node.props, DETAIL_ALLOWED);
  const tree: DetailTree = {
    type: 'detail',
    title: requireString('detail', node.props, 'title'),
    fields: serializeMetadataFromHost(node.children, state, false),
  };
  const subtitle = optionalString('detail', node.props, 'subtitle');
  if (subtitle !== undefined) tree.subtitle = subtitle;
  const imageUri = optionalString('detail', node.props, 'imageUri');
  if (imageUri !== undefined) tree.imageUri = imageUri;
  if (typeof node.props['mediaKeys'] === 'boolean') tree.mediaKeys = node.props['mediaKeys'];
  const markdown = optionalString('detail', node.props, 'markdown');
  if (markdown !== undefined) tree.description = markdown;
  const actionsValue = node.props['actions'];
  if (actionsValue !== undefined) {
    const actions = serializeActions(actionsValue, state);
    if (actions.length > 0) tree.actions = actions;
  }
  return tree;
}

function serializeGrid(node: HostNode, state: SerializeState): GridTree {
  checkProps('grid', node.props, GRID_ALLOWED);
  const columns = node.props['columns'];
  if (typeof columns !== 'number' || !Number.isInteger(columns) || columns <= 0) {
    throw new ReactUiError(`<grid> requires a positive integer prop 'columns'`);
  }
  const tree: GridTree = { type: 'grid', columns, items: [] };
  const title = optionalString('grid', node.props, 'title');
  if (title !== undefined) tree.title = title;
  const filter = optionalFilter('grid', node.props);
  if (filter !== undefined) tree.filter = filter;
  let emptyView: UiEmptyView | undefined;
  let emptyViewCount = 0;
  let looseItemCount = 0;
  let sections: UiSection[] | undefined;
  for (const child of node.children) {
    if (child.type === 'grid-section') {
      sections ??= [];
      sections.push(serializeGridSection(child, state));
    } else if (child.type === 'grid-item') {
      looseItemCount += 1;
      tree.items.push(serializeItem(child, state, false));
    } else if (child.type === 'empty-view') {
      emptyViewCount += 1;
      if (emptyViewCount > 1) {
        throw new ReactUiError('a <Grid> may contain at most one <Grid.EmptyView>');
      }
      emptyView = serializeEmptyView(child);
    } else {
      throw new ReactUiError(
        `<grid> children must be <Grid.Item>, <Grid.Section> or <Grid.EmptyView>, got <${child.type}>`,
      );
    }
  }
  if (sections !== undefined && looseItemCount > 0) {
    throw new ReactUiError(
      'a <Grid> cannot mix <Grid.Section> children with loose <Grid.Item> children',
    );
  }
  if (sections !== undefined) {
    tree.sections = sections;
    tree.items = [];
  }
  if (emptyView !== undefined) tree.emptyView = emptyView;
  return tree;
}

function serializeGridSection(node: HostNode, state: SerializeState): UiSection {
  checkProps('grid-section', node.props, GRID_SECTION_ALLOWED);
  const title = optionalString('grid-section', node.props, 'title');
  const subtitle = optionalString('grid-section', node.props, 'subtitle');
  const items = node.children.map((child) => {
    if (child.type !== 'grid-item') {
      throw new ReactUiError(`<grid-section> children must be <Grid.Item>, got <${child.type}>`);
    }
    return serializeItem(child, state, false);
  });
  const section: UiSection = { items };
  if (title !== undefined) section.title = title;
  if (subtitle !== undefined) section.subtitle = subtitle;
  return section;
}

function serializeEmptyView(node: HostNode): UiEmptyView {
  checkProps('empty-view', node.props, EMPTY_VIEW_ALLOWED);
  const view: UiEmptyView = { title: requireString('empty-view', node.props, 'title') };
  const description = optionalString('empty-view', node.props, 'description');
  if (description !== undefined) view.description = description;
  return view;
}

function serializeActions(actionsValue: unknown, state: SerializeState): UiAction[] {
  const actions: UiAction[] = [];
  visitActions(actionsValue, actions, state);
  return actions;
}

function visitActions(node: unknown, out: UiAction[], state: SerializeState): void {
  for (const child of flattenElements(node)) {
    if (!isElement(child)) {
      throw new ReactUiError(
        `actions prop children must be <ActionPanel> or <Action>, got ${describeNode(child)}`,
      );
    }
    if (isFragment(child)) {
      visitActions(child.props['children'], out, state);
      continue;
    }
    const intrinsic = requireIntrinsic(child.type, 'actions prop children');
    if (intrinsic === 'action-panel') {
      const panelProps = child.props as Record<string, unknown>;
      checkProps('action-panel', panelProps, ACTION_PANEL_ALLOWED);
      visitActions(panelProps['children'], out, state);
      continue;
    }
    if (intrinsic === 'action') {
      out.push(serializeActionElement(child, state));
      continue;
    }
    throw new ReactUiError(
      `actions prop children must be <ActionPanel> or <Action>, got <${String(child.type)}>`,
    );
  }
}

function serializeActionElement(
  element: ReactElement<Record<string, unknown>>,
  state: SerializeState,
): UiAction {
  const props = element.props;
  checkProps('action', props, ACTION_ALLOWED);
  const title = requireString('action', props, 'title');
  const onAction = props['onAction'];
  if (typeof onAction !== 'function') {
    throw new ReactUiError(`<action> requires a function prop 'onAction'`);
  }
  const primary = optionalBoolean('action', props, 'primary');
  const push = optionalString('action', props, 'push');
  if (push !== undefined && push.length === 0) {
    throw new ReactUiError(`<action> prop 'push' must be a non-empty sub-view key`);
  }
  const explicitId = optionalString('action', props, 'id');
  if (explicitId !== undefined) {
    if (explicitId === '__open__') {
      throw new ReactUiError(
        `action id '__open__' is reserved by the shell; choose a different id for '${title}'`,
      );
    }
    if (state.seenActionIds.has(explicitId)) {
      throw new ReactUiError(`duplicate action id '${explicitId}' in tree`);
    }
    state.seenActionIds.add(explicitId);
    state.registry.registerExplicit(explicitId, onAction as ActionHandler);
    const action: UiAction = { id: explicitId, title };
    if (primary === true) action.primary = true;
    if (push !== undefined) action.push = push;
    return action;
  }
  const action: UiAction = { id: state.registry.register(onAction as ActionHandler), title };
  if (primary === true) action.primary = true;
  if (push !== undefined) action.push = push;
  return action;
}

function flattenElements(node: unknown): unknown[] {
  if (node === null || node === undefined || typeof node === 'boolean') return [];
  if (Array.isArray(node)) return node.flatMap((child) => flattenElements(child));
  return [node];
}

function isElement(value: unknown): value is ReactElement<Record<string, unknown>> {
  return (
    typeof value === 'object' &&
    value !== null &&
    '$$typeof' in value &&
    'props' in value &&
    'type' in value
  );
}

function isFragment(element: ReactElement): boolean {
  return (element.type as unknown) === (Fragment as unknown);
}

function describeNode(node: unknown): string {
  if (typeof node === 'string') return `the string "${node.slice(0, 40)}"`;
  if (node === null || node === undefined) return String(node);
  if (typeof node === 'object' && 'type' in node) {
    return `<${String((node as { type: unknown }).type)}>`;
  }
  return typeof node;
}
