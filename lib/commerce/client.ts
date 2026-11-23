import type { BirthInfo } from '@/lib/ziwei/types';

export const draftKey = 'ziwei:checkout:compatibility';
export const ziweiDraftKey = 'ziwei:checkout:ziwei';
type CheckoutBirth = Pick<BirthInfo, 'year' | 'month' | 'day' | 'hour' | 'gender'>;
export type CheckoutDraft = { requestId: string; birthA: CheckoutBirth; birthB: CheckoutBirth; expiresAt: number };
export type ZiweiCheckoutDraft = { requestId: string; birthA: CheckoutBirth; expiresAt: number };
const accountChannel = 'ziwei:account';

export function clearCheckoutDraft() {
  try { sessionStorage.removeItem(draftKey); } catch { /* Storage can be disabled. */ }
}

export function clearZiweiCheckoutDraft() {
  try { sessionStorage.removeItem(ziweiDraftKey); } catch { /* Storage can be disabled. */ }
}

export function readCheckoutDraft(): CheckoutDraft | null {
  try {
    const draft: CheckoutDraft | null = JSON.parse(sessionStorage.getItem(draftKey) ?? 'null');
    if (draft && draft.expiresAt > Date.now()) return draft;
  } catch { /* Discard unreadable drafts. */ }
  clearCheckoutDraft();
  return null;
}

export function readZiweiCheckoutDraft(): ZiweiCheckoutDraft | null {
  try {
    const draft: ZiweiCheckoutDraft | null = JSON.parse(sessionStorage.getItem(ziweiDraftKey) ?? 'null');
    if (draft && draft.expiresAt > Date.now()) return draft;
  } catch { /* Discard unreadable drafts. */ }
  clearZiweiCheckoutDraft();
  return null;
}

export function watchAccountChanges(onChange: (action: string) => void) {
  if (typeof BroadcastChannel === 'undefined') return () => {};
  const channel = new BroadcastChannel(accountChannel);
  channel.onmessage = ({ data }) => {
    if (typeof data === 'string') onChange(data);
  };
  return () => channel.close();
}

export async function commercePost<T>(action: string, body: object = {}): Promise<T> {
  const response = await fetch('/api/commerce/' + action, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? '请求失败，请稍后重试。');
  if (action === 'logout') clearCheckoutDraft();
  if (['logout', 'local-login', 'login', 'register'].includes(action) && typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel(accountChannel);
    channel.postMessage(action);
    channel.close();
  }
  return data;
}
