/**
 * Clock sync endpoint — replaces Socket.io PING/PONG for NTP-style clock offset calculation.
 */
import { Router, Request, Response } from 'express';

export const syncRouter = Router();

// GET /api/sync/clock — returns server Unix timestamp for client clock offset calculation
syncRouter.get('/clock', (_req: Request, res: Response) => {
  res.json({ serverTime: Date.now() });
});
