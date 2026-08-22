import { getActiveLiveStream } from '../sockets/streamHandler';

describe('Stream Signaling & State Unit Tests', () => {
  it('initially has no active live stream for a room', () => {
    expect(getActiveLiveStream('non-existent-room-id')).toBeUndefined();
  });
});
