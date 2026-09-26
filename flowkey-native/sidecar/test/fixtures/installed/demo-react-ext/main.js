// Prebuilt React extension bundle. The build aliases `react` and
// `@flowkey/react-ui` to shims over globalThis.__FLOWKEY_HOST__, which this
// hand-written bundle mirrors directly.
const React = globalThis.__FLOWKEY_HOST__.react;
const { List } = globalThis.__FLOWKEY_HOST__.reactUi;

function DemoView() {
  return React.createElement(List, {
    sections: [
      {
        items: [
          {
            id: 'host-globals',
            title: 'Loaded via host globals',
            actions: [{ id: 'noop', title: 'No-op', primary: true }],
          },
        ],
      },
    ],
  });
}

export default {
  component: DemoView,
};
