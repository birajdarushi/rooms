/**
 * Ably REST publisher — serverless-safe (no persistent connection).
 * Used by Vercel API routes to broadcast real-time events to all room clients.
 */
import Ably from 'ably';

let ablyClient: Ably.Rest | null = null;

function getClient(): Ably.Rest {
  if (!ablyClient) {
    const key = process.env.ABLY_API_KEY;
    if (!key) {
      console.warn('[Ably] ABLY_API_KEY not set — real-time events will not be broadcast');
      // Return a no-op proxy so missing key doesn't crash the server
      return {
        channels: {
          get: () => ({
            publish: async () => {},
          }),
        },
      } as any;
    }
    ablyClient = new Ably.Rest({ key });
  }
  return ablyClient;
}

/**
 * Publish an event to the room's Ably channel.
 * All clients subscribed to `room:<ROOMCODE>` will receive it instantly.
 */
export async function publishToRoom(roomCode: string, event: string, data: any): Promise<void> {
  try {
    const channel = getClient().channels.get(`room:${roomCode.toUpperCase()}`);
    await channel.publish(event, data);
    console.log(`[Ably] >> ${event} → room:${roomCode.toUpperCase()}`);
  } catch (err: any) {
    console.error(`[Ably] Failed to publish ${event} to room:${roomCode}:`, err?.message || err);
  }
}

/**
 * Publish an event to a specific user's private channel (for ROOM_STATE_SYNC on join).
 */
export async function publishToUser(userId: string, event: string, data: any): Promise<void> {
  try {
    const channel = getClient().channels.get(`user:${userId}`);
    await channel.publish(event, data);
    console.log(`[Ably] >> ${event} → user:${userId}`);
  } catch (err: any) {
    console.error(`[Ably] Failed to publish ${event} to user:${userId}:`, err?.message || err);
  }
}
