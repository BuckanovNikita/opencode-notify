import { isRecord } from '../../protocol/src/index.js';
import { createNotificationSender, type NotificationDependencies } from './notifications.js';

// Public v2 execution events describe a busy period, rather than individual model steps.
export function createV2Controller(deps: NotificationDependencies) {
  const { notify, sessions } = createNotificationSender(deps);
  const runs = new Map<string, { started: number; active: boolean; pending: Set<string> }>();
  const seen = new Set<string>();
  function remember(key: string): boolean {
    if (seen.has(key)) return false;
    seen.add(key);
    if (seen.size > 4096) seen.delete(seen.values().next().value!);
    return true;
  }
  async function event(value: unknown): Promise<void> {
    if (!isRecord(value) || typeof value.type !== 'string' || !isRecord(value.data)) return;
    const type = value.type; const data = value.data;
    const form = isRecord(data.form) ? data.form : undefined;
    const id = type === 'form.created' ? (typeof form?.sessionID === 'string' ? form.sessionID : undefined) :
      typeof data.sessionID === 'string' ? data.sessionID : undefined;
    if (!id || id === 'global') return;
    if (typeof value.id === 'string' && !remember(`event:${value.id}`)) return;
    if (type === 'session.deleted') { runs.delete(id); sessions.delete(id); return; }
    if (type === 'session.created' || type === 'session.renamed') {
      let info = sessions.get(id);
      if (!info && type === 'session.renamed') {
        try { info = await deps.session(id); }
        catch { deps.log(`Session metadata unavailable for ${id}`); }
      }
      sessions.set(id, { ...info, id,
        ...(typeof data.title === 'string' ? { title: data.title } : {}),
        ...(typeof data.parentID === 'string' ? { parentID: data.parentID } : {}) });
      return;
    }
    let state = runs.get(id);
    if (type === 'session.execution.started') {
      // Duplicate starts with different envelopes must not reset the duration or pending input.
      if (!state?.active) runs.set(id, { started: deps.now(), active: true, pending: new Set() });
      return;
    }
    if (type === 'permission.asked' || type === 'form.created') {
      const kind = type === 'permission.asked' ? 'permission' : 'question';
      if (kind === 'question' && (!form || !isRecord(form.metadata) || form.metadata.kind !== 'question')) return;
      const request = kind === 'question' ? form?.id : data.id;
      if (typeof request !== 'string') return;
      if (!state) { state = { started: deps.now(), active: false, pending: new Set() }; runs.set(id, state); }
      const key = `${kind}:${request}`;
      state.pending.add(key);
      if (remember(`${id}:${key}`)) await notify(kind, id);
      return;
    }
    if (['permission.replied', 'form.replied', 'form.cancelled'].includes(type)) {
      const request = type === 'permission.replied' ? data.requestID : data.id;
      if (typeof request === 'string') state?.pending.delete(`${type === 'permission.replied' ? 'permission' : 'question'}:${request}`);
      return;
    }
    if (!state?.active) return;
    if (type === 'session.execution.failed' || type === 'session.execution.interrupted') {
      state.active = false; state.pending.clear();
      if (type === 'session.execution.failed') await notify('error', id);
    } else if (type === 'session.execution.succeeded' && state.pending.size === 0) {
      // Consume before IO; a repeated success can never send a second completion.
      state.active = false;
      if (deps.now() - state.started >= deps.config.minDurationMs) await notify('complete', id);
    }
  }
  return { event };
}
