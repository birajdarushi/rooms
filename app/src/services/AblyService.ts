/**
 * Ably Realtime client — subscribes to room channels for real-time events.
 * Replaces Socket.io client.
 */
import Ably from 'ably';

const ABLY_KEY = process.env.EXPO_PUBLIC_ABLY_KEY || '';

let realtimeClient: Ably.Realtime | null = null;

function getClient(): Ably.Realtime {
  if (!realtimeClient || realtimeClient.connection.state === 'closed') {
    if (!ABLY_KEY) {
      console.warn('[Ably] EXPO_PUBLIC_ABLY_KEY not set');
    }
    realtimeClient = new Ably.Realtime({
      key: ABLY_KEY,
      autoConnect: true,
    });
  }
  return realtimeClient;
}

export function getAblyChannel(roomCode: string): Ably.RealtimeChannel {
  return getClient().channels.get(`room:${roomCode.toUpperCase()}`);
}

export function getUserChannel(userId: string): Ably.RealtimeChannel {
  return getClient().channels.get(`user:${userId}`);
}

export function closeAbly(): void {
  if (realtimeClient) {
    realtimeClient.close();
    realtimeClient = null;
  }
}

export function getAblyConnectionState(): string {
  return realtimeClient?.connection.state ?? 'closed';
}
