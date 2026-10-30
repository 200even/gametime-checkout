import { describe, expect, jest, test } from '@jest/globals';
import { createForegroundHandler } from '../src/bootstrap/foregroundRecovery';
import { authorize, CARD, fixture, ORDER } from './helpers';

describe('foreground payment recovery', () => {
  test('background to active fetches the committed intent after a deliberately lost response and status timeout', async () => {
    const f = await fixture({ settlement: 'succeeded', processingMs: 0,
      loseConfirmResponse: true, statusTimeoutsAfterConfirm: 1 });
    await f.coordinator.submit(ORDER, 'card', authorize);
    expect(f.coordinator.getState().status).toBe('checking');
    expect((await f.api.getOrder(ORDER)).chargeCount).toBe(1);
    const get = jest.spyOn(f.api, 'getIntent');
    const confirm = jest.spyOn(f.api, 'confirmIntent');
    let pending = Promise.resolve();
    const onError = jest.fn();
    const handler = createForegroundHandler('active', () => f.coordinator.getState().status, () => {
      pending = f.coordinator.reconcile(ORDER).then(() => undefined);
      return pending;
    }, onError);
    handler('background');
    handler('active');
    handler('active');
    await pending;
    expect(get).toHaveBeenCalledTimes(1);
    expect(confirm).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(f.coordinator.getState().status).toBe('succeeded');
    expect((await f.api.getOrder(ORDER)).chargeCount).toBe(1);
  });

  test('returning through inactive settles a processing payment using its persisted deadline', async () => {
    const f = await fixture({ settlement: 'succeeded', processingMs: 15000 });
    await f.coordinator.submit(ORDER, 'card', authorize);
    let pending = Promise.resolve();
    const handler = createForegroundHandler('active', () => f.coordinator.getState().status, () => {
      pending = f.coordinator.reconcile(ORDER).then(() => undefined);
      return pending;
    }, () => { throw new Error('Unexpected reconciliation failure'); });
    handler('background');
    f.advance(15000);
    handler('inactive');
    handler('active');
    await pending;
    expect(f.coordinator.getState().status).toBe('succeeded');
    expect((await f.api.getOrder(ORDER)).chargeCount).toBe(1);
  });

  test.each(['idle', 'authorizing', 'succeeded', 'declined', 'cancelled'] as const)('foreground does not interrupt %s', status => {
    const reconcile = jest.fn(() => Promise.resolve());
    const handler = createForegroundHandler('background', () => status, reconcile, jest.fn());
    handler('active');
    expect(reconcile).not.toHaveBeenCalled();
  });

  test('an initial active notification is not mistaken for a foreground return', () => {
    const reconcile = jest.fn(() => Promise.resolve());
    createForegroundHandler(null, () => 'checking', reconcile, jest.fn())('active');
    expect(reconcile).not.toHaveBeenCalled();
  });

  test('a rejected lifecycle task is explicitly handled', async () => {
    const error = jest.fn();
    createForegroundHandler('background', () => 'checking', () => Promise.reject(new Error('offline')), error)('active');
    await Promise.resolve();
    expect(error).toHaveBeenCalledTimes(1);
  });
});

describe('reviewer scenarios retain the payment boundary', () => {
  test('fresh services recover the reviewer network-drop scenario with one charge', async () => {
    const f = await fixture({ settlement: 'succeeded', processingMs: 0,
      loseConfirmResponse: true, statusTimeoutsAfterConfirm: 1 });
    expect((await f.coordinator.submit(ORDER, 'card', authorize)).status).toBe('checking');
    const fresh = f.restart();
    expect((await fresh.coordinator.reconcile(ORDER)).status).toBe('succeeded');
    expect((await fresh.api.getOrder(ORDER)).chargeCount).toBe(1);
    await f.recovery.clear();
    expect((await f.restart().coordinator.reconcile(ORDER)).status).toBe('succeeded');
    expect((await fresh.api.getOrder(ORDER)).chargeCount).toBe(1);
  });

  test('new demo orders preserve earlier charge records and remain discoverable after recreation', async () => {
    const f = await fixture();
    const intent = await f.api.createIntent(ORDER, 'first');
    await f.api.confirmIntent(intent.id, CARD, 'confirm-first');
    await f.api.seedOrder('next-demo', 24000);
    const fresh = f.restart();
    expect(await fresh.api.getReviewOrderId()).toBe('next-demo');
    expect((await fresh.api.getOrder(ORDER)).chargeCount).toBe(1);
    expect((await fresh.api.getOrder('next-demo')).chargeCount).toBe(0);
  });
});
