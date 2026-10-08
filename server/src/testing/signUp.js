import request from 'supertest';
import { SESSION_COOKIE } from '../modules/auth/session.js';

// Registers through the API and returns the new user and the "name=value" session cookie
// a browser would send back.
export async function signUp(app, { origin, email = 'ada@example.com', password = 'correct horse battery' }) {
  const response = await request(app).post('/api/v1/auth/register').set('Origin', origin).send({ email, password });
  if (response.status !== 201) {
    throw new Error(`Sign-up failed with HTTP ${response.status}: ${response.text}`);
  }

  const setCookie = response.headers['set-cookie'].find((header) => header.startsWith(`${SESSION_COOKIE}=`));
  return { user: response.body.user, cookie: setCookie.split(';')[0] };
}
