import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { registerServerStatusRoutes } from './core-routes.js';

describe('core-routes', () => {
  const createApp = () => {
    const app = express();
    let shutdownOpts = null;
    const dependencies = {
      express,
      process,
      gracefulShutdown: vi.fn(async (opts) => {
        shutdownOpts = opts;
      }),
      getHealthSnapshot: () => ({ status: 'ok' }),
      openchamberVersion: '1.0.0',
      runtimeName: 'test',
      serverStartedAt: '2026-01-01T00:00:00.000Z',
    };

    registerServerStatusRoutes(app, dependencies);

    return { app, dependencies, getShutdownOpts: () => shutdownOpts };
  };

  it('returns health JSON from the /api/health compatibility route', async () => {
    const { app } = createApp();

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.type).toBe('application/json');
    expect(response.body).toMatchObject({ status: 'ok' });
    expect(response.text).not.toContain('<!doctype html>');
  });

  it('allows shutdown requests without an origin header', async () => {
    const { app, dependencies, getShutdownOpts } = createApp();

    const response = await request(app).post('/api/system/shutdown');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
    expect(dependencies.gracefulShutdown).toHaveBeenCalledTimes(1);
    expect(getShutdownOpts()).toEqual({ exitProcess: true });
  });

  it('allows same-origin shutdown requests', async () => {
    const { app, dependencies, getShutdownOpts } = createApp();

    const response = await request(app)
      .post('/api/system/shutdown')
      .set('Host', '127.0.0.1:3001')
      .set('Origin', 'http://127.0.0.1:3001');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
    expect(dependencies.gracefulShutdown).toHaveBeenCalledTimes(1);
    expect(getShutdownOpts()).toEqual({ exitProcess: true });
  });

  it('rejects foreign-origin shutdown requests without shutting down', async () => {
    const { app, dependencies } = createApp();

    const response = await request(app)
      .post('/api/system/shutdown')
      .set('Host', '127.0.0.1:3001')
      .set('Origin', 'https://example.com');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ ok: false, error: 'Invalid origin' });
    expect(dependencies.gracefulShutdown).not.toHaveBeenCalled();
  });
});
