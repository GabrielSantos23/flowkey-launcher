import type { IslandShowOptions, IIslandService } from './IIslandService';
import { BaseServiceProxy } from './BaseServiceProxy';

/**
 * SDK proxy for the host's Dynamic Island service.
 *
 * Both Tier 1 (built-in features running in the launcher window) and Tier 2
 * (sandboxed iframes) consume this same proxy via
 * `context.getService('island')`. Every call serializes to a postMessage
 * routed through `MessageBroker` → `ExtensionIpcRouter` → host
 * `islandService`.
 */
export class IslandServiceProxy extends BaseServiceProxy implements IIslandService {
  show(options: IslandShowOptions): Promise<void> {
    return this.broker.invoke<void>('island:show', { options });
  }

  dismiss(): Promise<void> {
    return this.broker.invoke<void>('island:dismiss');
  }
}
