/**
 * Ably Realtime client — subscribes to room channels for real-time events.
 * Replaces Socket.io client.
 */
import Ably from 'ably';

// Default to the scoped frontend subscribe key
const FALLBACK_PUBLIC_KEY = 'SRttRA.TIs0aA:kx9aNlwUwhYjh_c70yVoFF6ib7cmaHplLm2JYJcU6v0';
const ABLY_KEY = process.env.EXPO_PUBLIC_ABLY_KEY || FALLBACK_PUBLIC_KEY;

let realtimeClient: Ably.Realtime | null = null;

function getClient(): Ably.Realtime | null {
  if (!realtimeClient || realtimeClient.connection.state === 'closed') {
    const key = ABLY_KEY || FALLBACK_PUBLIC_KEY;
    try {
      realtimeClient = new Ably.Realtime({
        key,
        autoConnect: true,
      });
    } catch (err: any) {
      console.warn('[Ably] Failed to initialize Ably Realtime client:', err?.message || err);
      return null;
    }
  }
  return realtimeClient;
}

export function getAblyChannel(roomCode: string): Ably.RealtimeChannel {
  const client = getClient();
  if (!client) {
    // Return a safe mock channel to prevent unhandled React crashes
    return {
      subscribe: () => {},
      unsubscribe: () => {},
      publish: async () => {},
      attach: async () => {},
      detach: async () => {},
    } as any;
  }
  return client.channels.get(`room:${roomCode.toUpperCase()}`);
}

export function getUserChannel(userId: string): Ably.RealtimeChannel {
  const client = getClient();
  if (!client) {
    return {
      subscribe: () => {},
      unsubscribe: () => {},
      publish: async () => {},
      attach: async () => {},
      detach: async () => {},
    } as any;
  }
  return client.channels.get(`user:${userId}`);
}

export function closeAbly(): void {
  if (realtimeClient) {
    try {
      realtimeClient.close();
    } catch (_) {}
    realtimeClient = null;
  }
}

export function getAblyConnectionState(): string {
  return realtimeClient?.connection.state ?? 'closed';
}
