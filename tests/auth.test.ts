import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import authRoutes from '../src/modules/auth/auth.routes';

const app = express();
app.use(express.json());
app.use('/api/v1/auth', authRoutes);

describe('Auth API Tests', () => {
  it('should reject unauthenticated requests', async () => {
    const response = await request(app).get('/api/v1/auth/me');
    expect(response.status).toBe(401);
  });
});
