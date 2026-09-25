import { describe, expect, test } from 'bun:test';
import { createElement, useState, useEffect, type ReactElement } from 'react';
import type { DetailTree, GridTree, ListTree, UiTree } from '@flowkey/native-sdk';
import { Action, ActionPanel, Detail, Grid, List, ReactRoot, ReactUiError } from '../src';
import type { CommittedGeneration, CommandProps, ListItemProps, ListProps } from '../src';

function baseProps(overrides: Partial<CommandProps> = {}): CommandProps {
  return {
    query: '',
    preferences: {},
    native: {
      call: <T>() => Promise.resolve(undefined as T),
      showHud: () => Promise.resolve(),
    },
    signal: new AbortController().signal,
    ...overrides,
  };
}

function renderCounter(): {
  root: ReactRoot;
  generations: CommittedGeneration[];
  errors: unknown[];
} {
  const generations: CommittedGeneration[] = [];
  const errors: unknown[] = [];
  const root = new ReactRoot(Counter, {
    onCommit: (tree, json, registry) => generations.push({ tree, json, registry }),
    onError: (error) => errors.push(error),
  });
  return { root, generations, errors };
}

function Counter(props: CommandProps) {
  const [n, setN] = useState(0);
  useEffect(() => {}, []);
  const item = createElement(List.Item, {
    key: 'i',
    id: 'x',
    title: `${props.query} ${n}`,
    actions: createElement(
      ActionPanel,
      null,
      createElement(Action, { title: 'inc', onAction: () => setN(n + 1) }),
    ),
  });
  return createElement(List, { key: 'l' }, item);
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 25));

describe('ReactRoot', () => {
  test('mounts a list tree with sections, items and token actions', () => {
    const generations: CommittedGeneration[] = [];
    const root = new ReactRoot(
      () =>
        createElement(
          List,
          { filter: [{ label: 'All', value: 'all' }] },
          createElement(
            List.Section,
            { title: 'A' },
            createElement(List.Item, {
              id: 'one',
              title: 'One',
              subtitle: 'sub',
              icon: { lucide: 'rocket', color: '#fff' },
              actions: createElement(
                ActionPanel,
                null,
                createElement(Action, { title: 'Go', primary: true, onAction: () => {} }),
              ),
            }),
          ),
          createElement(List.Item, {
            id: 'two',
            title: 'Two',
            actions: createElement(Action, { title: 'Alt', onAction: () => {} }),
          }),
          createElement(List.EmptyView, { title: 'Empty' }),
        ),
      {
        onCommit: (tree, json, registry) => generations.push({ tree, json, registry }),
        onError: () => {},
      },
    );
    const generation = root.update(baseProps({ query: '' }));
    expect(generation).not.toBeNull();
    const tree = generation!.tree as ListTree;
    expect(tree.type).toBe('list');
    expect(tree.filter).toEqual({ options: [{ label: 'All', value: 'all' }] });
    expect(tree.sections).toHaveLength(2);
    expect(tree.sections[0].title).toBe('A');
    expect(tree.sections[0].items[0].iconName).toBe('rocket');
    expect(tree.sections[0].items[0].iconColor).toBe('#fff');
    expect(tree.sections[1].items[0].id).toBe('two');
    expect(tree.emptyView?.title).toBe('Empty');
    const actionIds = tree.sections[0].items[0].actions?.map((a) => a.id) ?? [];
    expect(actionIds).toHaveLength(1);
    expect(typeof generation!.registry.resolve(actionIds[0])).toBe('function');
    root.unmount();
  });

  test('items with a detail pane auto-set side-pane layout', () => {
    const generations: CommittedGeneration[] = [];
    const root = new ReactRoot(
      () =>
        createElement(
          List,
          null,
          createElement(
            List.Item,
            {
              id: 'one',
              title: 'One',
              actions: createElement(Action, { title: 'Go', onAction: () => {} }),
            },
            createElement(
              List.Item.Detail,
              { preview: 'hello' },
              createElement(
                List.Item.Detail.Metadata,
                null,
                createElement(List.Item.Detail.Metadata.Field, {
                  label: 'Source',
                  value: 'Test',
                  valueIconUri: 'data:image/png;base64,x',
                }),
              ),
            ),
          ),
        ),
      {
        onCommit: (tree, json, registry) => generations.push({ tree, json, registry }),
        onError: () => {},
      },
    );
    const tree = root.update(baseProps())!.tree as ListTree;
    expect(tree.layout).toBe('side-pane');
    const item = tree.sections[0].items[0];
    expect(item.pane?.preview).toBe('hello');
    expect(item.pane?.fields?.[0]).toEqual({
      label: 'Source',
      value: 'Test',
      valueIconUri: 'data:image/png;base64,x',
    });
    root.unmount();
  });

  test('re-renders with new props produce an updated committed tree', () => {
    const { root, generations } = renderCounter();
    root.update(baseProps({ query: 'a' }));
    root.update(baseProps({ query: 'b' }));
    expect(generations.length).toBe(2);
    const tree = generations[1].tree as ListTree;
    expect(tree.sections[0].items[0].title).toBe('b 0');
    root.unmount();
  });

  test('action closures re-render the tree with fresh state', async () => {
    const { root, generations } = renderCounter();
    const first = root.update(baseProps({ query: 'q' }))!;
    const tree = first.tree as ListTree;
    const handler = first.registry.resolve(tree.sections[0].items[0].actions![0].id)!;
    handler();
    await tick();
    const updated = root.current!.tree as ListTree;
    expect(updated.sections[0].items[0].title).toBe('q 1');
    expect(generations.length).toBe(2);
    root.unmount();
  });

  test('effect-driven commits emit new generations', async () => {
    const generations: CommittedGeneration[] = [];
    const errors: unknown[] = [];
    const root = new ReactRoot(
      () => {
        const [n, setN] = useState(0);
        useEffect(() => {
          const timer = setTimeout(() => setN(7), 5);
          return () => clearTimeout(timer);
        }, []);
        return createElement(
          List,
          null,
          createElement(List.Item, {
            id: 'x',
            title: `t${n}`,
            actions: createElement(Action, { title: 'a', onAction: () => {} }),
          }),
        );
      },
      {
        onCommit: (tree, json, registry) => generations.push({ tree, json, registry }),
        onError: (error) => errors.push(error),
      },
    );
    root.update(baseProps());
    await tick();
    root.flushEffects();
    const trees = generations.map((g) => (g.tree as ListTree).sections[0].items[0].title);
    expect(trees).toEqual(['t0', 't7']);
    root.unmount();
  });

  test('unmount clears the tree and runs effect cleanups', () => {
    let cleaned = false;
    const generations: CommittedGeneration[] = [];
    const root = new ReactRoot(
      () => {
        useEffect(
          () => () => {
            cleaned = true;
          },
          [],
        );
        return createElement(
          List,
          null,
          createElement(List.Item, {
            id: 'x',
            title: 't',
            actions: createElement(Action, { title: 'a', onAction: () => {} }),
          }),
        );
      },
      {
        onCommit: (tree, json, registry) => generations.push({ tree, json, registry }),
        onError: () => {},
      },
    );
    root.update(baseProps());
    root.unmount();
    expect(cleaned).toBe(true);
    expect(root.current).toBeNull();
  });

  test('render errors surface as thrown sync errors', () => {
    const errors: unknown[] = [];
    const root = new ReactRoot(
      () => {
        throw new Error('boom');
      },
      { onCommit: () => {}, onError: (error) => errors.push(error) },
    );
    expect(() => root.update(baseProps())).toThrow('boom');
    root.unmount();
  });

  test('a component returning null serializes to an empty list', () => {
    const generations: CommittedGeneration[] = [];
    const root = new ReactRoot(() => null, {
      onCommit: (tree, json, registry) => generations.push({ tree, json, registry }),
      onError: () => {},
    });
    const tree = root.update(baseProps())!.tree as ListTree;
    expect(tree).toEqual({ type: 'list', sections: [] });
    root.unmount();
  });
});

describe('serializer validation', () => {
  function treeOf(element: ReactElement): UiTree {
    const generations: CommittedGeneration[] = [];
    const root = new ReactRoot(() => element, {
      onCommit: (tree, json, registry) => generations.push({ tree, json, registry }),
      onError: () => {},
    });
    try {
      return root.update(baseProps())!.tree;
    } finally {
      root.unmount();
    }
  }

  test('rejects an action with the reserved __open__ id', () => {
    expect(() =>
      treeOf(
        createElement(
          List,
          null,
          createElement(List.Item, {
            id: 'x',
            title: 't',
            actions: createElement(Action, { id: '__open__', title: 'Go', onAction: () => {} }),
          }),
        ),
      ),
    ).toThrow(ReactUiError);
    expect(() =>
      treeOf(
        createElement(
          List,
          null,
          createElement(List.Item, {
            id: 'x',
            title: 't',
            actions: createElement(Action, { id: '__open__', title: 'Go', onAction: () => {} }),
          }),
        ),
      ),
    ).toThrow(/__open__/);
  });

  test('rejects duplicate item ids and duplicate explicit action ids', () => {
    expect(() =>
      treeOf(
        createElement(
          List,
          null,
          createElement(List.Item, {
            id: 'x',
            title: 'a',
            actions: createElement(Action, { id: 'same', title: 'Go', onAction: () => {} }),
          }),
          createElement(List.Item, {
            id: 'x',
            title: 'b',
            actions: createElement(Action, { id: 'same', title: 'Go', onAction: () => {} }),
          }),
        ),
      ),
    ).toThrow(/duplicate/);
  });

  test('rejects missing item id', () => {
    expect(() =>
      treeOf(
        createElement(
          List,
          null,
          createElement(List.Item, {
            title: 't',
            actions: createElement(Action, { title: 'Go', onAction: () => {} }),
          } as unknown as ListItemProps),
        ),
      ),
    ).toThrow(/'id'/);
  });

  test('rejects multiple root elements', () => {
    const generations: CommittedGeneration[] = [];
    const errors: unknown[] = [];
    const root = new ReactRoot(
      () => [
        createElement(
          List,
          null,
          createElement(List.Item, {
            id: 'a',
            title: 't',
            actions: createElement(Action, { title: 'Go', onAction: () => {} }),
          }),
        ),
        createElement(
          Grid,
          { columns: 4 },
          createElement(Grid.Item, {
            id: 'b',
            title: 't',
            actions: createElement(Action, { title: 'Go', onAction: () => {} }),
          }),
        ),
      ],
      {
        onCommit: (tree, json, registry) => generations.push({ tree, json, registry }),
        onError: (e) => errors.push(e),
      },
    );
    expect(() => root.update(baseProps())).toThrow(/single/);
    root.unmount();
  });

  test('rejects string children and unknown props', () => {
    const errors: unknown[] = [];
    const root = new ReactRoot(
      () =>
        createElement(
          List,
          { accesories: 1 } as unknown as ListProps,
          createElement(List.Item, {
            id: 'a',
            title: 't',
            actions: createElement(Action, { title: 'Go', onAction: () => {} }),
          }),
        ),
      { onCommit: () => {}, onError: (e) => errors.push(e) },
    );
    expect(() => root.update(baseProps())).toThrow(/unknown prop 'accesories'/);
    root.unmount();

    const textRoot = new ReactRoot(() => createElement('list', null, 'hello'), {
      onCommit: () => {},
      onError: (e) => errors.push(e),
    });
    expect(() => textRoot.update(baseProps())).toThrow(/string children/);
    textRoot.unmount();
  });

  test('serializes detail and grid trees', () => {
    const detail = treeOf(
      createElement(
        Detail,
        {
          title: 'D',
          subtitle: 'by Raycast',
          imageUri: 'file:///icon-cache/np.png',
          markdown: '# hi',
          actions: createElement(Action, { title: 'Go', primary: true, onAction: () => {} }),
        },
        createElement(
          Detail.Metadata,
          null,
          createElement(Detail.Metadata.Field, { label: 'L', value: 'V' }),
        ),
      ),
    );
    const detailTree = detail as DetailTree;
    expect(detailTree.type).toBe('detail');
    expect(detailTree.title).toBe('D');
    expect(detailTree.subtitle).toBe('by Raycast');
    expect(detailTree.imageUri).toBe('file:///icon-cache/np.png');
    expect(detailTree.description).toBe('# hi');
    expect(detailTree.fields).toEqual([{ label: 'L', value: 'V' }]);
    expect(detailTree.actions?.[0].primary).toBe(true);

    const grid = treeOf(
      createElement(
        Grid,
        { columns: 8, title: 'G' },
        createElement(Grid.Item, {
          id: 'a',
          title: 't',
          icon: '🎉',
          actions: createElement(Action, { title: 'Go', onAction: () => {} }),
        }),
        createElement(Grid.EmptyView, { title: 'none' }),
      ),
    );
    const gridTree = grid as GridTree;
    expect(gridTree.type).toBe('grid');
    expect(gridTree.columns).toBe(8);
    expect(gridTree.items[0].icon).toBe('🎉');
    expect(gridTree.emptyView?.title).toBe('none');
  });

  test('rejects valueIconUri inside a Detail metadata but not inside a pane', () => {
    expect(() =>
      treeOf(
        createElement(
          Detail,
          { title: 'D' },
          createElement(
            Detail.Metadata,
            null,
            createElement(Detail.Metadata.Field, { label: 'L', value: 'V', valueIconUri: 'x' }),
          ),
        ),
      ),
    ).toThrow(/valueIconUri/);

    const ok = treeOf(
      createElement(
        List,
        null,
        createElement(
          List.Item,
          {
            id: 'a',
            title: 't',
            actions: createElement(Action, { title: 'Go', onAction: () => {} }),
          },
          createElement(
            List.Item.Detail,
            null,
            createElement(
              List.Item.Detail.Metadata,
              null,
              createElement(List.Item.Detail.Metadata.Field, {
                label: 'L',
                value: 'V',
                valueIconUri: 'x',
              }),
            ),
          ),
        ),
      ),
    );
    expect((ok as ListTree).sections[0].items[0].pane?.fields?.[0].valueIconUri).toBe('x');
  });
});

describe('push actions', () => {
  function renderAlbum(): { generations: CommittedGeneration[]; root: ReactRoot } {
    const generations: CommittedGeneration[] = [];
    const root = new ReactRoot(
      () =>
        createElement(
          List,
          null,
          createElement(List.Item, {
            id: 'x',
            title: 'Album',
            actions: createElement(
              ActionPanel,
              null,
              createElement(Action, {
                title: 'Songs',
                push: 'album-songs:al1',
                onAction: () => {},
              }),
            ),
          }),
        ),
      {
        onCommit: (tree, json, registry) => generations.push({ tree, json, registry }),
        onError: () => {},
      },
    );
    return { root, generations };
  }

  const props = {
    query: '',
    preferences: {},
    native: { call: async () => null },
    signal: new AbortController().signal,
  } as never;

  test('push keys serialize onto the action', () => {
    const { root, generations } = renderAlbum();
    root.update(props);
    const tree = generations.at(-1)!.tree as Extract<UiTree, { sections: unknown[] }>;
    const actions = tree.sections[0].items[0].actions;
    expect(actions?.[0].push).toBe('album-songs:al1');
  });

  test('empty push keys are rejected', () => {
    const root = new ReactRoot(
      () =>
        createElement(
          List,
          null,
          createElement(List.Item, {
            id: 'x',
            title: 'Album',
            actions: createElement(
              ActionPanel,
              null,
              createElement(Action, { title: 'Songs', push: '', onAction: () => {} }),
            ),
          }),
        ),
      { onCommit: () => {}, onError: () => {} },
    );
    expect(() => root.update(props)).toThrow(/non-empty sub-view key/);
  });
});
