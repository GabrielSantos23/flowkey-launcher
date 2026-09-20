export function groupActionsForDisplay<T extends { displayCategory?: string } = any>(
  actions: T[],
): Array<{ category: string; actions: T[] }> {
  const groupMap = new Map<string, T[]>();

  for (const action of actions) {
    const cat = (action as any).displayCategory || 'Actions';
    if (!groupMap.has(cat)) {
      groupMap.set(cat, []);
    }
    groupMap.get(cat)!.push(action);
  }

  return Array.from(groupMap.entries()).map(([category, acts]) => ({
    category,
    actions: acts,
  }));
}
