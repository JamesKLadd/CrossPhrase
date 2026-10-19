import { createPcRemote } from '../pcRemote';

const pcRemoteForTests = () => createPcRemote('http://pc:8787/');

describe('PC judge client', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    jest.useRealTimers();
  });

  const respond = (status: number, body: unknown) =>
    (global.fetch = jest.fn(async () => new Response(JSON.stringify(body), { status })) as typeof fetch);

  it('parses verdicts from the PC judge', async () => {
    respond(200, { verdicts: [{ entryId: '1A', tier: 'great', reading: 'the moon', reason: '', quip: 'Hoot.' }] });
    const verdicts = await pcRemoteForTests().judge([{ id: '1A', words: ['the', 'moon'] }]);
    expect(verdicts).toEqual([{ entryId: '1A', tier: 'great', valid: true, reading: 'the moon', reason: '', quip: 'Hoot.' }]);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe('http://pc:8787/judge');
  });

  it('treats a refused request as final and an unreachable judge as worth retrying', async () => {
    respond(400, { error: 'bad' });
    await expect(pcRemoteForTests().judge([{ id: '1A', words: ['the', 'moon'] }])).rejects.toMatchObject({ retryable: false });
    global.fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as typeof fetch;
    await expect(pcRemoteForTests().judge([{ id: '1A', words: ['the', 'moon'] }])).rejects.toMatchObject({ retryable: true });
  });

  it('gives up on a judge that never answers', async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))),
    ) as typeof fetch;
    const reachable = pcRemoteForTests().isReachable();
    jest.advanceTimersByTime(3_000);
    await expect(reachable).resolves.toBe(false);
  });
});
