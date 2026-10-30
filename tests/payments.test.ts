import { describe, expect, jest, test } from '@jest/globals';
import { PaymentCoordinator } from '../src/payments/PaymentCoordinator';
import { PaymentError } from '../src/payments/types';
import { MockBackendStore, MOCK_BACKEND_KEY } from '../src/mock/MockBackendStore';
import { MockPaymentAPI, ResponseLostError } from '../src/mock/MockPaymentAPI';
import { CLIENT_RECOVERY_KEY } from '../src/storage/ClientRecoveryStore';
import { authorize, CARD, fixture, ORDER } from './helpers';

describe('payment API boundary', () => {
  test('reuses an attempt key and rejects reuse for a different order', async () => {
    const { api } = await fixture();
    const first = await api.createIntent(ORDER, 'attempt');
    expect(await api.createIntent(ORDER, 'attempt')).toEqual(first);
    await api.seedOrder('other-order', 100);
    await expect(api.createIntent('other-order', 'attempt')).rejects.toMatchObject({ code: 'KEY_CONFLICT' });
  });

  test('concurrent identical confirmations across backend instances produce one charge', async () => {
    const f = await fixture();
    const secondAPI = f.restart().api;
    const intent = await f.api.createIntent(ORDER, 'attempt');
    const results = await Promise.all(Array.from({ length: 20 }, (_, index) =>
      (index % 2 === 0 ? f.api : secondAPI).confirmIntent(intent.id, CARD, 'confirm')));
    expect(results.every(result => result.status === 'succeeded')).toBe(true);
    expect((await secondAPI.getOrder(ORDER)).chargeCount).toBe(1);
  });

  test('rejects conflicting confirmation payloads without another charge', async () => {
    const { api } = await fixture();
    const intent = await api.createIntent(ORDER, 'attempt');
    await api.confirmIntent(intent.id, CARD, 'confirm');
    await expect(api.confirmIntent(intent.id, { ...CARD, providerToken: 'mock_token_other' }, 'confirm'))
      .rejects.toMatchObject({ code: 'KEY_CONFLICT' });
    await expect(api.confirmIntent(intent.id, CARD, 'other-key')).rejects.toMatchObject({ code: 'KEY_CONFLICT' });
    expect((await api.getOrder(ORDER)).chargeCount).toBe(1);
  });

  test('only one concurrent new attempt can own an unpaid order', async () => {
    const { api } = await fixture();
    const results = await Promise.allSettled([api.createIntent(ORDER, 'a'), api.createIntent(ORDER, 'b')]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect((await api.getOrder(ORDER)).chargeCount).toBe(0);
  });

  test('processing and paid orders reject a fresh attempt key', async () => {
    const { api, advance } = await fixture({ settlement: 'succeeded', processingMs: 500 });
    const intent = await api.createIntent(ORDER, 'a');
    await api.confirmIntent(intent.id, CARD, 'confirm');
    await expect(api.createIntent(ORDER, 'b')).rejects.toMatchObject({ code: 'ACTIVE_ATTEMPT' });
    advance(500);
    await expect(api.createIntent(ORDER, 'b')).rejects.toMatchObject({ code: 'ORDER_PAID' });
    expect((await api.getOrder(ORDER)).chargeCount).toBe(1);
  });

  test('rejects a stale order without an issuer decline or charge', async () => {
    const { api } = await fixture();
    const intent = await api.createIntent(ORDER, 'a');
    await api.changeOrderAmount(ORDER, 15000);
    await expect(api.confirmIntent(intent.id, CARD, 'confirm')).rejects.toMatchObject({ code: 'ORDER_CHANGED' });
    expect((await api.getIntent(intent.id)).status).toBe('requires_action');
    expect((await api.getOrder(ORDER)).chargeCount).toBe(0);
  });

  test('cannot change an order amount while confirmation is processing', async () => {
    const { api } = await fixture({ settlement: 'succeeded', processingMs: 500 });
    const intent = await api.createIntent(ORDER, 'a');
    await api.confirmIntent(intent.id, CARD, 'confirm');
    await expect(api.changeOrderAmount(ORDER, 20000)).rejects.toMatchObject({ code: 'ACTIVE_ATTEMPT' });
  });

  test('loses the confirmation response only after success and its charge are durable', async () => {
    const f = await fixture({ settlement: 'succeeded', processingMs: 0, loseConfirmResponse: true });
    const intent = await f.api.createIntent(ORDER, 'a');
    await expect(f.api.confirmIntent(intent.id, CARD, 'confirm')).rejects.toBeInstanceOf(ResponseLostError);
    const fresh = f.restart();
    expect((await fresh.api.getIntent(intent.id)).status).toBe('succeeded');
    expect((await fresh.api.getOrder(ORDER)).chargeCount).toBe(1);
  });

  test('a cancelled authorization cannot subsequently confirm', async () => {
    const { api } = await fixture();
    const intent = await api.createIntent(ORDER, 'a');
    await api.cancelIntent(intent.id);
    await expect(api.confirmIntent(intent.id, CARD, 'confirm')).rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect((await api.getOrder(ORDER)).chargeCount).toBe(0);
  });

  test('cancellation racing after confirmation cannot undo its charge', async () => {
    const { api } = await fixture();
    const intent = await api.createIntent(ORDER, 'a');
    const [confirmed, cancelled] = await Promise.all([
      api.confirmIntent(intent.id, CARD, 'confirm'), api.cancelIntent(intent.id),
    ]);
    expect(confirmed.status).toBe('succeeded');
    expect(cancelled.status).toBe('succeeded');
    expect((await api.getOrder(ORDER)).chargeCount).toBe(1);
  });

  test('a failed backend write does not expose a charge and does not poison the write queue', async () => {
    const f = await fixture();
    const intent = await f.api.createIntent(ORDER, 'a');
    f.storage.failWriteKey = MOCK_BACKEND_KEY;
    await expect(f.api.confirmIntent(intent.id, CARD, 'confirm')).rejects.toThrow('disk write');
    f.storage.failWriteKey = null;
    expect((await f.api.getOrder(ORDER)).chargeCount).toBe(0);
    expect((await f.api.getIntent(intent.id)).status).toBe('requires_action');
    await f.api.confirmIntent(intent.id, CARD, 'confirm');
    expect((await f.api.getOrder(ORDER)).chargeCount).toBe(1);
  });

  test('rejects non-integer amounts and non-synthetic tokens', async () => {
    const { api } = await fixture();
    await expect(api.changeOrderAmount(ORDER, 10.5)).rejects.toBeInstanceOf(PaymentError);
    const intent = await api.createIntent(ORDER, 'a');
    await expect(api.confirmIntent(intent.id, { ...CARD, providerToken: '4242424242424242' }, 'c'))
      .rejects.toMatchObject({ code: 'INVALID_REQUEST' });
  });
});

describe('coordinator recovery', () => {
  test('persists the attempt before create and confirmation identity before confirm', async () => {
    const f = await fixture();
    const create = f.api.createIntent.bind(f.api);
    const confirm = f.api.confirmIntent.bind(f.api);
    jest.spyOn(f.api, 'createIntent').mockImplementation(async (orderId, key) => {
      expect(await f.recovery.read()).toMatchObject({ attemptKey: key, phase: 'creating' });
      return await create(orderId, key);
    });
    jest.spyOn(f.api, 'confirmIntent').mockImplementation(async (id, payload, key) => {
      expect(await f.recovery.read()).toMatchObject({ intentId: id, confirmationKey: key, phase: 'confirming' });
      return await confirm(id, payload, key);
    });
    expect((await f.coordinator.submit(ORDER, 'card', authorize)).status).toBe('succeeded');
  });

  test('recovers a committed payment after its confirmation response is lost without charging twice', async () => {
    const f = await fixture({ settlement: 'succeeded', processingMs: 0, loseConfirmResponse: true });
    const confirm = jest.spyOn(f.api, 'confirmIntent');
    const states: string[] = [];
    const unsubscribe = f.coordinator.subscribe(state => states.push(state.status));
    expect((await f.coordinator.submit(ORDER, 'card', authorize)).status).toBe('succeeded');
    unsubscribe();
    expect(states).toContain('checking');
    expect(confirm).toHaveBeenCalledTimes(1);
    expect((await f.api.getOrder(ORDER)).chargeCount).toBe(1);
  });

  test('a cold start GET recovers success when confirmation committed and all immediate status reads timed out', async () => {
    const f = await fixture({ settlement: 'succeeded', processingMs: 0, loseConfirmResponse: true });
    jest.spyOn(f.api, 'getIntent').mockRejectedValue(new Error('network timeout'));
    expect((await f.coordinator.submit(ORDER, 'card', authorize)).status).toBe('checking');
    expect(await f.recovery.read()).toMatchObject({ phase: 'confirming' });
    const fresh = f.restart();
    const get = jest.spyOn(fresh.api, 'getIntent');
    const confirm = jest.spyOn(fresh.api, 'confirmIntent');
    expect((await fresh.coordinator.reconcile(ORDER)).status).toBe('succeeded');
    await fresh.coordinator.reconcile(ORDER);
    await fresh.coordinator.submit(ORDER, 'card', authorize);
    expect(get).toHaveBeenCalledTimes(1);
    expect(confirm).not.toHaveBeenCalled();
    expect((await fresh.api.getOrder(ORDER)).chargeCount).toBe(1);
  });

  test('unknown outcomes block a new attempt while status reads keep failing', async () => {
    const f = await fixture({ settlement: 'succeeded', processingMs: 0, loseConfirmResponse: true });
    jest.spyOn(f.api, 'getIntent').mockRejectedValue(new Error('offline'));
    const create = jest.spyOn(f.api, 'createIntent');
    const confirm = jest.spyOn(f.api, 'confirmIntent');
    await f.coordinator.submit(ORDER, 'card', authorize);
    expect((await f.coordinator.submit(ORDER, 'card', authorize)).status).toBe('checking');
    expect(create).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  test.each(['succeeded', 'failed'] as const)('cold start materializes persisted delayed %s without a live timer', async settlement => {
    const f = await fixture({ settlement, processingMs: 500 });
    expect((await f.coordinator.submit(ORDER, 'card', authorize)).status).toBe('processing');
    const fresh = f.restart();
    expect((await fresh.coordinator.reconcile(ORDER)).status).toBe('processing');
    f.advance(500);
    expect((await fresh.coordinator.reconcile(ORDER)).status).toBe(settlement === 'succeeded' ? 'succeeded' : 'declined');
    await fresh.coordinator.reconcile(ORDER);
    expect((await fresh.api.getOrder(ORDER)).chargeCount).toBe(settlement === 'succeeded' ? 1 : 0);
  });

  test('a lost create response is recovered by replaying the persisted attempt key', async () => {
    const f = await fixture({ settlement: 'succeeded', processingMs: 0, loseCreateResponse: true });
    jest.spyOn(f.api, 'getOrder').mockResolvedValueOnce(await f.api.getOrder(ORDER)).mockRejectedValue(new Error('offline'));
    expect((await f.coordinator.submit(ORDER, 'card', authorize)).status).toBe('checking');
    const pending = await f.recovery.read();
    expect(pending?.intentId).toBeNull();
    expect(pending).not.toBeNull();
    if (!pending) throw new Error('Expected recovery record');
    const fresh = f.restart();
    const original = await fresh.api.createIntent(ORDER, pending.attemptKey);
    expect((await fresh.coordinator.reconcile(ORDER)).status).toBe('cancelled');
    expect((await fresh.api.createIntent(ORDER, pending.attemptKey)).id).toBe(original.id);
    expect((await fresh.api.getOrder(ORDER)).chargeCount).toBe(0);
  });

  test('cold start after persisting a key but before create safely resolves that attempt', async () => {
    const f = await fixture();
    await f.recovery.write({ orderId: ORDER, attemptKey: 'a', confirmationKey: 'c', intentId: null, phase: 'creating' });
    const create = jest.spyOn(f.api, 'createIntent');
    expect((await f.coordinator.reconcile(ORDER)).status).toBe('cancelled');
    expect(create).toHaveBeenCalledWith(ORDER, 'a');
    expect((await f.api.getOrder(ORDER)).chargeCount).toBe(0);
  });

  test('rapid submit calls share one authorization and one confirmation', async () => {
    const f = await fixture();
    const auth = jest.fn(authorize);
    const confirm = jest.spyOn(f.api, 'confirmIntent');
    const results = await Promise.all(Array.from({ length: 20 }, () => f.coordinator.submit(ORDER, 'card', auth)));
    expect(results.every(result => result.status === 'succeeded')).toBe(true);
    expect(auth).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect((await f.api.getOrder(ORDER)).chargeCount).toBe(1);
  });

  test('provider cancellation permits a fresh attempt without an earlier charge', async () => {
    const f = await fixture();
    expect((await f.coordinator.submit(ORDER, 'apple_pay', () => Promise.resolve({ kind: 'cancelled' }))).status).toBe('cancelled');
    expect((await f.api.getOrder(ORDER)).chargeCount).toBe(0);
    expect((await f.coordinator.submit(ORDER, 'card', authorize)).status).toBe('succeeded');
    expect((await f.api.getOrder(ORDER)).chargeCount).toBe(1);
  });

  test('a definitive decline permits a fresh attempt', async () => {
    const f = await fixture({ settlement: 'failed', processingMs: 0 });
    expect((await f.coordinator.submit(ORDER, 'card', authorize)).status).toBe('declined');
    const fresh = f.restart();
    expect((await fresh.coordinator.submit(ORDER, 'card', authorize)).status).toBe('succeeded');
    expect((await fresh.api.getOrder(ORDER)).chargeCount).toBe(1);
  });

  test('a changed order is invalidated and asks for review instead of reporting an issuer decline', async () => {
    const f = await fixture();
    const result = await f.coordinator.submit(ORDER, 'card', async () => {
      await f.api.changeOrderAmount(ORDER, 20000);
      return await authorize();
    });
    expect(result.status).toBe('order_changed');
    expect((await f.api.getOrder(ORDER)).chargeCount).toBe(0);
    expect((await f.coordinator.submit(ORDER, 'card', authorize)).intent?.amountCents).toBe(20000);
  });

  test('failure to persist an attempt prevents create, authorization, and confirmation', async () => {
    const f = await fixture();
    f.storage.failWriteKey = CLIENT_RECOVERY_KEY;
    const create = jest.spyOn(f.api, 'createIntent');
    const auth = jest.fn(authorize);
    expect((await f.coordinator.submit(ORDER, 'card', auth)).status).toBe('error');
    expect(create).not.toHaveBeenCalled();
    expect(auth).not.toHaveBeenCalled();
    expect((await f.api.getOrder(ORDER)).chargeCount).toBe(0);
  });

  test('failure to persist confirmation phase prevents confirmation', async () => {
    const f = await fixture();
    const confirm = jest.spyOn(f.api, 'confirmIntent');
    await f.coordinator.submit(ORDER, 'card', () => {
      f.storage.failWriteKey = CLIENT_RECOVERY_KEY;
      return authorize();
    });
    expect(confirm).not.toHaveBeenCalled();
    expect((await f.api.getOrder(ORDER)).chargeCount).toBe(0);
  });

  test('cleanup failure preserves authoritative success and remains safe on relaunch', async () => {
    const f = await fixture();
    f.storage.failRemove = true;
    expect((await f.coordinator.submit(ORDER, 'card', authorize)).status).toBe('succeeded');
    expect(await f.recovery.read()).not.toBeNull();
    f.storage.failRemove = false;
    expect((await f.restart().coordinator.reconcile(ORDER)).status).toBe('succeeded');
    expect(await f.recovery.read()).toBeNull();
    expect((await f.api.getOrder(ORDER)).chargeCount).toBe(1);
  });

  test.each([0, 500])('client-only reset retains backend state and recovers the order with delay %i', async delay => {
    const f = await fixture({ settlement: 'succeeded', processingMs: delay });
    await f.coordinator.submit(ORDER, 'card', authorize);
    const before = await f.storage.getItem(MOCK_BACKEND_KEY);
    await f.recovery.clear();
    expect(await f.storage.getItem(MOCK_BACKEND_KEY)).toBe(before);
    f.advance(delay);
    const fresh = f.restart();
    expect((await fresh.coordinator.reconcile(ORDER)).status).toBe('succeeded');
    await fresh.coordinator.submit(ORDER, 'card', authorize);
    expect((await fresh.api.getOrder(ORDER)).chargeCount).toBe(1);
    expect([...f.storage.values.keys()].every(key => key.startsWith('@client/') || key.startsWith('@mock_backend/'))).toBe(true);
  });

  test('malformed backend storage fails closed instead of silently resetting the ledger', async () => {
    const f = await fixture();
    await f.storage.setItem(MOCK_BACKEND_KEY, '{}');
    expect((await f.coordinator.reconcile(ORDER)).status).toBe('checking');
    await expect(f.api.createIntent(ORDER, 'a')).rejects.toThrow('Invalid mock backend');
  });

  test('malformed client storage blocks submission instead of forgetting an unresolved attempt', async () => {
    const f = await fixture();
    await f.storage.setItem(CLIENT_RECOVERY_KEY, '{}');
    const create = jest.spyOn(f.api, 'createIntent');
    expect((await f.coordinator.submit(ORDER, 'card', authorize)).status).toBe('error');
    expect(create).not.toHaveBeenCalled();
  });

  test('persistence only contains synthetic authorization data', async () => {
    const f = await fixture();
    await f.coordinator.submit(ORDER, 'card', authorize);
    const serialized = [...f.storage.values.values()].join('');
    expect(serialized).toContain('mock_token_card');
    expect(serialized).not.toMatch(/4242424242424242|"pan"|"cvc"|"expiry"/);
  });

  test('two coordinators cannot charge the same order twice', async () => {
    const f = await fixture();
    const other = new PaymentCoordinator(new MockPaymentAPI(new MockBackendStore(f.storage), f.now, f.id), f.recovery, f.id);
    await Promise.all([f.coordinator.submit(ORDER, 'card', authorize), other.submit(ORDER, 'card', authorize)]);
    const snapshot = await f.api.getOrder(ORDER);
    expect(snapshot.chargeCount).toBeLessThanOrEqual(1);
    await f.restart().coordinator.submit(ORDER, 'card', authorize);
    expect((await f.api.getOrder(ORDER)).chargeCount).toBe(1);
  });

  test('cold recovery cancels interrupted mock authorization and a late token cannot charge', async () => {
    const f = await fixture();
    let release: () => void = () => { throw new Error('Authorization has not started'); };
    let announce: () => void = () => { throw new Error('Start observer not initialized'); };
    const started = new Promise<void>(resolve => { announce = resolve; });
    const authorization = new Promise<void>(resolve => { release = resolve; });
    const submitted = f.coordinator.submit(ORDER, 'affirm', async () => {
      announce();
      await authorization;
      return await authorize();
    });
    await started;
    expect((await f.restart().coordinator.reconcile(ORDER)).status).toBe('cancelled');
    release();
    expect((await submitted).status).toBe('cancelled');
    expect((await f.api.getOrder(ORDER)).chargeCount).toBe(0);
    expect((await f.restart().coordinator.submit(ORDER, 'card', authorize)).status).toBe('succeeded');
    expect((await f.api.getOrder(ORDER)).chargeCount).toBe(1);
  });

  test('foreground reconciliation during authorization joins the existing flow', async () => {
    const f = await fixture();
    let release: () => void = () => { throw new Error('Authorization has not started'); };
    let announce: () => void = () => { throw new Error('Start observer not initialized'); };
    const started = new Promise<void>(resolve => { announce = resolve; });
    const authorization = new Promise<void>(resolve => { release = resolve; });
    const submitted = f.coordinator.submit(ORDER, 'apple_pay', async () => {
      announce();
      await authorization;
      return await authorize();
    });
    await started;
    const foreground = f.coordinator.reconcile(ORDER);
    expect(foreground).toBe(submitted);
    release();
    expect((await foreground).status).toBe('succeeded');
    expect((await f.api.getOrder(ORDER)).chargeCount).toBe(1);
  });

  test('a timeout before backend confirmation commit is reconciled without a blind confirm retry', async () => {
    const f = await fixture();
    const confirm = jest.spyOn(f.api, 'confirmIntent').mockRejectedValue(new Error('Timeout before commit'));
    expect((await f.coordinator.submit(ORDER, 'card', authorize)).status).toBe('cancelled');
    expect(confirm).toHaveBeenCalledTimes(1);
    expect((await f.api.getOrder(ORDER)).chargeCount).toBe(0);
  });

  test('cannot reuse a confirmation key for a different intent', async () => {
    const f = await fixture({ settlement: 'failed', processingMs: 0 });
    const first = await f.api.createIntent(ORDER, 'a');
    await f.api.confirmIntent(first.id, CARD, 'c');
    const next = await f.api.createIntent(ORDER, 'b');
    await expect(f.api.confirmIntent(next.id, CARD, 'c')).rejects.toMatchObject({ code: 'KEY_CONFLICT' });
    expect((await f.api.getOrder(ORDER)).chargeCount).toBe(0);
  });
});
