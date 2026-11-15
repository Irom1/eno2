import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createConversationPacer } from './conversationPacing';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('holds a fast reply briefly after the user sends a message', async () => {
  const pacing = createConversationPacer();
  const publish = vi.fn(() => 'reply');
  pacing.userSent();
  const reply = pacing.reply(publish);
  await vi.advanceTimersByTimeAsync(749);
  expect(publish).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  await expect(reply).resolves.toBe('reply');
});

it('serializes assistant messages with a gap even when they are queued together', async () => {
  const pacing = createConversationPacer();
  const shown: string[] = [];
  const first = pacing.reply(() => shown.push('answer'));
  const second = pacing.reply(() => shown.push('review'));
  await first;
  expect(shown).toEqual(['answer']);
  await vi.advanceTimersByTimeAsync(1099);
  expect(shown).toEqual(['answer']);
  await vi.advanceTimersByTimeAsync(1);
  await second;
  expect(shown).toEqual(['answer', 'review']);
});

it('does not add another pause when the network response already took longer', async () => {
  const pacing = createConversationPacer();
  pacing.enoShown();
  pacing.userSent();
  await vi.advanceTimersByTimeAsync(2000);
  await expect(pacing.reply(() => 'ready')).resolves.toBe('ready');
  expect(vi.getTimerCount()).toBe(0);
});

it('cancels pending and queued messages when the conversation is left', async () => {
  const pacing = createConversationPacer();
  const publish = vi.fn();
  pacing.userSent();
  const first = pacing.reply(publish);
  const second = pacing.reply(publish);
  await vi.advanceTimersByTimeAsync(100);
  pacing.dispose();
  await Promise.all([first, second]);
  expect(publish).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
