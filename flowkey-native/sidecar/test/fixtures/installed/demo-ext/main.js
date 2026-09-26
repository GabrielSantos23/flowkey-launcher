// Prebuilt (hand-written) bundle for the demo functional extension. In real
// installs this file is emitted by the `flowkey build` CLI command.
export default {
  handlers: {
    async search(query) {
      const items = ['alpha', 'beta', 'gamma']
        .filter((name) => name.includes(query.toLowerCase()))
        .map((name) => ({
          id: name,
          title: name,
          actions: [{ id: 'copy', title: 'Copy', primary: true }],
        }));
      return {
        type: 'list',
        sections: [{ items }],
        emptyView: { title: 'No matches' },
      };
    },
  },
};
