import { SignJWT, UnsecuredJWT } from 'jose';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { captureLogger } from '../../testing/captureLogger.js';
import { createMemoryUserStore } from '../../testing/memoryUserStore.js';
import { SESSION_COOKIE, SESSION_TTL_SECONDS } from './session.js';

const ORIGIN = 'http://localhost:5173';
const SECRET = 'test-secret-that-is-at-least-32-chars';
const EMAIL = 'ada@example.com';
const PASSWORD = 'correct horse battery';
const NAME = 'Ada Lovelace';

function setup({ secureCookie = false } = {}) {
  const users = createMemoryUserStore();
  const logs = captureLogger();
  const app = createApp({ logger: logs, clientOrigin: ORIGIN, auth: { users, secret: SECRET, secureCookie } });
  return { app, users, logs };
}

function post(app, path, body) {
  return request(app).post(`/api/v1/auth/${path}`).set('Origin', ORIGIN).send(body);
}

function getMe(app, cookie) {
  const req = request(app).get('/api/v1/auth/me');
  return cookie ? req.set('Cookie', cookie) : req;
}

function sessionSetCookie(response) {
  return response.headers['set-cookie']?.find((header) => header.startsWith(`${SESSION_COOKIE}=`));
}

// Returns the "name=value" pair a browser would send back.
function sessionCookie(response) {
  return sessionSetCookie(response).split(';')[0];
}

async function register(app, email = EMAIL) {
  const response = await post(app, 'register', { name: NAME, email, password: PASSWORD });
  return { response, cookie: sessionCookie(response), user: response.body.user };
}

function signToken({ alg = 'HS256', secret = SECRET, sub, ver = 0, iss = 'opspilot-api', exp = '1h', claims }) {
  let jwt = new SignJWT(claims ?? { ver }).setProtectedHeader({ alg }).setIssuedAt();
  if (sub !== undefined) jwt = jwt.setSubject(sub);
  if (iss) jwt = jwt.setIssuer(iss);
  if (exp) jwt = jwt.setExpirationTime(exp);
  return jwt.sign(new TextEncoder().encode(secret));
}

describe('POST /api/v1/auth/register', () => {
  it('creates an account, normalizing the email and name, and returns only safe fields', async () => {
    const { app, users } = setup();

    const response = await post(app, 'register', { name: '  Ada   Lovelace ', email: '  Ada@Example.COM ', password: PASSWORD });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      user: { id: expect.stringMatching(/^[0-9a-f]{24}$/), email: EMAIL, name: NAME, createdAt: expect.any(String) },
    });

    const [stored] = users.records.values();
    expect(stored.email).toBe(EMAIL);
    expect(stored.name).toBe(NAME);
    expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
    expect(response.text).not.toContain(stored.passwordHash);
    expect(response.text).not.toContain(PASSWORD);
  });

  it('stores a salted hash, never the password', async () => {
    const { app, users } = setup();

    await register(app, 'one@example.com');
    await register(app, 'two@example.com');

    const [first, second] = users.records.values();
    expect(first.passwordHash).not.toContain(PASSWORD);
    expect(first.passwordHash).not.toBe(second.passwordHash);
  });

  it('starts a session with a locked-down cookie', async () => {
    const { app } = setup();

    const { response } = await register(app);
    const cookie = sessionSetCookie(response);

    expect(cookie).toMatch(/; HttpOnly/);
    expect(cookie).toMatch(/; SameSite=Strict/);
    expect(cookie).toMatch(/; Path=\//);
    expect(cookie).toMatch(new RegExp(`; Max-Age=${SESSION_TTL_SECONDS}`));
    expect(cookie).toMatch(/; Expires=/);
    expect(cookie).not.toMatch(/; Secure/);
  });

  it('marks the cookie Secure when configured for production', async () => {
    const { app } = setup({ secureCookie: true });

    const { response } = await register(app);

    expect(sessionSetCookie(response)).toMatch(/; Secure/);
  });

  it.each([
    ['missing', { password: PASSWORD }],
    ['not a string', { email: 42, password: PASSWORD }],
    ['without a domain', { email: 'ada@', password: PASSWORD }],
    ['without a dot in the domain', { email: 'ada@example', password: PASSWORD }],
    ['containing spaces', { email: 'ada lovelace@example.com', password: PASSWORD }],
    ['too long', { email: `${'a'.repeat(250)}@example.com`, password: PASSWORD }],
  ])('rejects an email that is %s', async (_, body) => {
    const { app, users } = setup();

    const response = await post(app, 'register', body);

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({ code: 'VALIDATION_FAILED', message: 'Enter a valid email address' });
    expect(users.records.size).toBe(0);
  });

  it.each([
    ['missing', undefined],
    ['too short', 'short12'],
    ['too long', 'x'.repeat(129)],
    ['not a string', 12345678],
  ])('rejects a password that is %s without echoing it', async (_, password) => {
    const { app } = setup();

    const response = await post(app, 'register', { email: EMAIL, password });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: 'VALIDATION_FAILED',
      message: 'Password must be between 8 and 128 characters',
    });
    if (typeof password === 'string') {
      expect(response.text).not.toContain(password);
    }
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['only whitespace', ' \t\n '],
    ['one character', 'A'],
    ['over 80 characters', 'A'.repeat(81)],
    ['without any letters', '12 34'],
    ['containing a control character', 'Ada\u0000Lovelace'],
    ['not a string', 42],
    ['an object', { first: 'Ada' }],
  ])('rejects a name that is %s, creating no account', async (_, name) => {
    const { app, users } = setup();

    const response = await post(app, 'register', { name, email: EMAIL, password: PASSWORD });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({ code: 'VALIDATION_FAILED', message: 'Enter your name, 2 to 80 characters' });
    expect(sessionSetCookie(response)).toBeUndefined();
    expect(users.records.size).toBe(0);
  });

  it.each([
    ['with a hyphen and an apostrophe', 'Mary-Jane O’Neil', 'Mary-Jane O’Neil'],
    ['with a period', 'Sudhanshu K. Thakur', 'Sudhanshu K. Thakur'],
    ['in another script', 'सुधांशु ठाकुर', 'सुधांशु ठाकुर'],
    ['with accents in decomposed form', 'Zoe\u0301 Ange\u0300le', 'Zoé Angèle'],
    ['of exactly 80 characters', 'A'.repeat(80), 'A'.repeat(80)],
  ])('accepts a name %s', async (_, name, stored) => {
    const { app } = setup();

    const response = await post(app, 'register', { name, email: EMAIL, password: PASSWORD });

    expect(response.status).toBe(201);
    expect(response.body.user.name).toBe(stored);
  });

  it('rejects a duplicate email regardless of case, without starting a session', async () => {
    const { app, users } = setup();
    await register(app);

    const response = await post(app, 'register', { name: 'Ada Byron', email: 'ADA@example.com', password: 'another password' });

    expect(response.status).toBe(409);
    expect(response.body.error).toMatchObject({
      code: 'EMAIL_UNAVAILABLE',
      message: 'An account cannot be created with this email',
    });
    expect(sessionSetCookie(response)).toBeUndefined();
    expect(users.records.size).toBe(1);
  });
});

describe('POST /api/v1/auth/login', () => {
  it('signs in with valid credentials', async () => {
    const { app } = setup();
    const { user } = await register(app);

    const response = await post(app, 'login', { email: ' ADA@example.com', password: PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ user });
    expect(response.body.user.name).toBe(NAME);
    expect(sessionSetCookie(response)).toMatch(/; HttpOnly/);

    const me = await getMe(app, sessionCookie(response));
    expect(me.status).toBe(200);
  });

  it('signs in an account created before names were collected, with no name', async () => {
    const { app, users } = setup();
    const { user } = await register(app);
    delete users.records.get(user.id).name;

    const response = await post(app, 'login', { email: EMAIL, password: PASSWORD });
    const me = await getMe(app, sessionCookie(response));

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual({ ...user, name: null });
    expect(me.body.user).toEqual({ ...user, name: null });
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const { app } = setup();
    await register(app);

    const wrongPassword = await post(app, 'login', { email: EMAIL, password: 'not the password' });
    const unknownEmail = await post(app, 'login', { email: 'nobody@example.com', password: PASSWORD });

    for (const response of [wrongPassword, unknownEmail]) {
      expect(response.status).toBe(401);
      expect(response.body.error).toMatchObject({
        code: 'INVALID_CREDENTIALS',
        message: 'Email or password is incorrect',
      });
      expect(sessionSetCookie(response)).toBeUndefined();
    }
  });

  it.each([
    ['an empty body', {}],
    ['a missing password', { email: EMAIL }],
    ['an empty password', { email: EMAIL, password: '' }],
    ['a non-string password', { email: EMAIL, password: { $ne: null } }],
    ['an invalid email', { email: 'nope', password: PASSWORD }],
    ['an array body', []],
  ])('rejects %s with 400', async (_, body) => {
    const { app } = setup();
    await register(app);

    const response = await post(app, 'login', body);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });
});

describe('GET /api/v1/auth/me', () => {
  it('returns the signed-in user without sensitive fields', async () => {
    const { app } = setup();
    const { cookie, user } = await register(app);

    const response = await getMe(app, cookie);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({ user });
    expect(response.body.user.name).toBe(NAME);
    expect(Object.keys(response.body.user).sort()).toEqual(['createdAt', 'email', 'id', 'name']);
    expect(response.text).not.toMatch(/passwordHash|tokenVersion|argon2/);
  });

  it('returns the name stored now, not the one at sign-in', async () => {
    const { app, users } = setup();
    const { cookie, user } = await register(app);
    users.records.get(user.id).name = 'Ada King';

    const response = await getMe(app, cookie);

    expect(response.body.user.name).toBe('Ada King');
  });

  it('rejects a request without a session cookie', async () => {
    const { app } = setup();

    const response = await getMe(app);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Authentication required',
        requestId: response.headers['x-request-id'],
      },
    });
  });

  it.each([
    ['garbage', async () => 'not-a-jwt'],
    ['signed with another secret', async (sub) => signToken({ sub, secret: 'a-different-secret-of-sufficient-size' })],
    ['expired', async (sub) => signToken({ sub, exp: Math.floor(Date.now() / 1000) - 60 })],
    ['signed with HS512', async (sub) => signToken({ sub, alg: 'HS512' })],
    ['unsigned (alg none)', async (sub) => new UnsecuredJWT({ ver: 0 }).setSubject(sub).setIssuer('opspilot-api').setIssuedAt().setExpirationTime('1h').encode()],
    ['from another issuer', async (sub) => signToken({ sub, iss: 'someone-else' })],
    ['without an expiry', async (sub) => signToken({ sub, exp: null })],
    ['without a subject', async () => signToken({})],
    ['with a malformed subject', async () => signToken({ sub: 'admin' })],
    ['for a user that does not exist', async () => signToken({ sub: 'f'.repeat(24) })],
    ['without a token version', async (sub) => signToken({ sub, claims: {} })],
    ['with a non-integer token version', async (sub) => signToken({ sub, claims: { ver: '0' } })],
    ['with a negative token version', async (sub) => signToken({ sub, ver: -1 })],
  ])('rejects a token that is %s', async (_, makeToken) => {
    const { app } = setup();
    const { user } = await register(app);

    const response = await getMe(app, `${SESSION_COOKIE}=${await makeToken(user.id)}`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  // Control case: the token helper itself produces valid tokens, so each rejection above is
  // caused by the one property that test changes.
  it('accepts a well-formed token signed with the server secret', async () => {
    const { app } = setup();
    const { user } = await register(app);

    const response = await getMe(app, `${SESSION_COOKIE}=${await signToken({ sub: user.id })}`);

    expect(response.status).toBe(200);
  });

  it('rejects a token whose version no longer matches the user', async () => {
    const { app, users } = setup();
    const { cookie, user } = await register(app);

    await users.incrementTokenVersion(user.id);

    expect((await getMe(app, cookie)).status).toBe(401);
  });
});

describe('PATCH /api/v1/auth/me', () => {
  function patchMe(app, cookie, body) {
    const req = request(app).patch('/api/v1/auth/me').set('Origin', ORIGIN);
    return (cookie ? req.set('Cookie', cookie) : req).send(body);
  }

  it('changes the signed-in user’s name, normalized, and returns only safe fields', async () => {
    const { app, users } = setup();
    const { cookie, user } = await register(app);

    const response = await patchMe(app, cookie, { name: '  Ada   King  ' });

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({ user: { ...user, name: 'Ada King' } });
    expect(Object.keys(response.body.user).sort()).toEqual(['createdAt', 'email', 'id', 'name']);
    expect(response.text).not.toMatch(/passwordHash|tokenVersion|argon2/);
    expect(users.records.get(user.id).name).toBe('Ada King');
  });

  it('keeps the session valid and the new name visible to /me', async () => {
    const { app, users } = setup();
    const { cookie, user } = await register(app);
    const versionBefore = users.records.get(user.id).tokenVersion;

    await patchMe(app, cookie, { name: 'Ada King' });
    const me = await getMe(app, cookie);

    expect(me.status).toBe(200);
    expect(me.body.user.name).toBe('Ada King');
    expect(users.records.get(user.id).tokenVersion).toBe(versionBefore);
  });

  it('lets an account created before names existed set one', async () => {
    const { app, users } = setup();
    const { cookie, user } = await register(app);
    delete users.records.get(user.id).name;

    const response = await patchMe(app, cookie, { name: 'Ada Lovelace' });

    expect(response.status).toBe(200);
    expect(response.body.user.name).toBe('Ada Lovelace');
    expect((await getMe(app, cookie)).body.user.name).toBe('Ada Lovelace');
  });

  it.each([
    ['missing', {}],
    ['empty', { name: '' }],
    ['only whitespace', { name: '   ' }],
    ['one character', { name: 'A' }],
    ['over 80 characters', { name: 'A'.repeat(81) }],
    ['without any letters', { name: '42' }],
    ['not a string', { name: ['Ada'] }],
  ])('rejects a name that is %s, changing nothing', async (_, body) => {
    const { app, users } = setup();
    const { cookie, user } = await register(app);

    const response = await patchMe(app, cookie, body);

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({ code: 'VALIDATION_FAILED', message: 'Enter your name, 2 to 80 characters' });
    expect(users.records.get(user.id).name).toBe(NAME);
  });

  it.each([
    ['an email', { name: 'Ada King', email: 'other@example.com' }],
    ['a user ID', { name: 'Ada King', id: 'f'.repeat(24) }],
    ['a token version', { name: 'Ada King', tokenVersion: 0 }],
    ['a password', { name: 'Ada King', password: 'new password 123' }],
  ])('refuses %s alongside the name, changing nothing', async (_, body) => {
    const { app, users } = setup();
    const { cookie, user } = await register(app);

    const response = await patchMe(app, cookie, body);

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({ code: 'VALIDATION_FAILED', message: 'Only your name can be changed' });
    expect(users.records.get(user.id)).toMatchObject({ name: NAME, email: EMAIL });
  });

  it.each([
    ['a JSON array', [{ name: 'Ada King' }], 'VALIDATION_FAILED'],
    // The JSON parser only accepts objects and arrays at the top level.
    ['a JSON string', '"Ada King"', 'INVALID_JSON'],
  ])('rejects %s as the body', async (_, body, code) => {
    const { app } = setup();
    const { cookie } = await register(app);

    const response = await request(app)
      .patch('/api/v1/auth/me')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json')
      .send(typeof body === 'string' ? body : JSON.stringify(body));

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe(code);
  });

  it('changes only the signed-in user, whatever account the request names', async () => {
    const { app, users } = setup();
    const ada = await register(app, 'ada@example.com');
    const grace = await register(app, 'grace@example.com');

    const namingGrace = await patchMe(app, ada.cookie, { name: 'Ada King', id: grace.user.id });
    const valid = await patchMe(app, ada.cookie, { name: 'Ada King' });

    expect(namingGrace.status).toBe(400);
    expect(valid.body.user.id).toBe(ada.user.id);
    expect(users.records.get(ada.user.id).name).toBe('Ada King');
    expect(users.records.get(grace.user.id).name).toBe(NAME);
  });

  it.each([
    ['without a session', async () => undefined],
    ['with an invalid token', async () => `${SESSION_COOKIE}=not-a-jwt`],
    [
      'after logging out',
      async (app, cookie) => {
        await post(app, 'logout').set('Cookie', cookie);
        return cookie;
      },
    ],
  ])('rejects a request %s with 401, changing nothing', async (_, getCookie) => {
    const { app, users } = setup();
    const { cookie, user } = await register(app);

    const response = await patchMe(app, await getCookie(app, cookie), { name: 'Mallory' });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
    expect(users.records.get(user.id).name).toBe(NAME);
  });

  it.each([
    ['another site', (req) => req.set('Origin', 'https://evil.example').send({ name: 'Mallory' }), 403],
    ['a form post', (req) => req.set('Origin', ORIGIN).type('form').send('name=Mallory'), 415],
  ])('rejects a request from %s before changing anything', async (_, send, status) => {
    const { app, users } = setup();
    const { cookie, user } = await register(app);

    const response = await send(request(app).patch('/api/v1/auth/me').set('Cookie', cookie));

    expect(response.status).toBe(status);
    expect(users.records.get(user.id).name).toBe(NAME);
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('clears the cookie and invalidates copies of the token', async () => {
    const { app, users } = setup();
    const { cookie, user } = await register(app);

    const response = await request(app).post('/api/v1/auth/logout').set('Origin', ORIGIN).set('Cookie', cookie);

    expect(response.status).toBe(204);
    const cleared = sessionSetCookie(response);
    expect(cleared).toMatch(new RegExp(`^${SESSION_COOKIE}=;`));
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970 00:00:00 GMT/);
    expect(cleared).toMatch(/; Path=\/; .*HttpOnly.*SameSite=Strict/);

    expect(users.records.get(user.id).tokenVersion).toBe(1);
    expect((await getMe(app, cookie)).status).toBe(401);
  });

  it('allows signing in again afterwards', async () => {
    const { app } = setup();
    const { cookie } = await register(app);
    await request(app).post('/api/v1/auth/logout').set('Origin', ORIGIN).set('Cookie', cookie);

    const login = await post(app, 'login', { email: EMAIL, password: PASSWORD });

    expect((await getMe(app, sessionCookie(login))).status).toBe(200);
  });

  it('succeeds without a session', async () => {
    const { app } = setup();

    const response = await request(app).post('/api/v1/auth/logout').set('Origin', ORIGIN);

    expect(response.status).toBe(204);
    expect(sessionSetCookie(response)).toMatch(/Expires=Thu, 01 Jan 1970/);
  });
});

describe('CSRF protection', () => {
  it.each([
    ['missing', undefined],
    ['from another site', 'https://evil.example'],
    ['from another port', 'http://localhost:3000'],
    ['opaque (null)', 'null'],
  ])('rejects a state-changing request whose Origin is %s', async (_, origin) => {
    const { app, users } = setup();

    let req = request(app).post('/api/v1/auth/register');
    if (origin) req = req.set('Origin', origin);
    const response = await req.send({ email: EMAIL, password: PASSWORD });

    expect(response.status).toBe(403);
    expect(response.body.error).toMatchObject({ code: 'ORIGIN_NOT_ALLOWED' });
    expect(users.records.size).toBe(0);
  });

  it('does not let another site log a user out', async () => {
    const { app, users } = setup();
    const { cookie, user } = await register(app);

    const response = await request(app)
      .post('/api/v1/auth/logout')
      .set('Origin', 'https://evil.example')
      .set('Cookie', cookie);

    expect(response.status).toBe(403);
    expect(users.records.get(user.id).tokenVersion).toBe(0);
    expect((await getMe(app, cookie)).status).toBe(200);
  });

  it.each([
    ['text/plain', `{"email":"${EMAIL}","password":"${PASSWORD}"}`],
    ['application/x-www-form-urlencoded', `email=${EMAIL}&password=x`],
  ])('rejects a %s body even from the right origin', async (type, body) => {
    const { app } = setup();

    const response = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', ORIGIN)
      .set('Content-Type', type)
      .send(body);

    expect(response.status).toBe(415);
    expect(response.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('leaves safe GET requests working without an Origin header', async () => {
    const { app } = setup();
    const { cookie } = await register(app);

    expect((await getMe(app, cookie)).status).toBe(200);
    expect((await request(app).get('/api/v1/health')).status).toBe(200);
  });
});

describe('rate limiting', () => {
  it('limits register and login attempts per client', async () => {
    const { app } = setup();

    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const response = await post(app, 'login', { email: 'nobody@example.com', password: 'wrong password' });
      expect(response.status).toBe(401);
    }

    for (const path of ['login', 'register']) {
      const limited = await post(app, path, { email: EMAIL, password: PASSWORD });
      expect(limited.status).toBe(429);
      expect(limited.body.error).toMatchObject({
        code: 'RATE_LIMITED',
        message: 'Too many attempts. Try again later.',
        requestId: limited.headers['x-request-id'],
      });
      expect(limited.headers['retry-after']).toBeDefined();
    }
  });

  it('does not limit session checks', async () => {
    const { app } = setup();

    for (let attempt = 1; attempt <= 12; attempt += 1) {
      expect((await getMe(app)).status).toBe(401);
    }
  });
});

describe('logging', () => {
  it('never logs passwords, hashes or tokens', async () => {
    const { app, users, logs } = setup();
    const { cookie } = await register(app);
    await post(app, 'login', { email: EMAIL, password: 'not the password' });
    await getMe(app, cookie);
    await request(app).post('/api/v1/auth/logout').set('Origin', ORIGIN).set('Cookie', cookie);

    const [stored] = users.records.values();
    const output = JSON.stringify(logs.entries);
    expect(logs.entries.length).toBeGreaterThanOrEqual(4);
    expect(output).not.toContain(PASSWORD);
    expect(output).not.toContain('not the password');
    expect(output).not.toContain(stored.passwordHash);
    expect(output).not.toContain(cookie.split('=')[1]);
    expect(output).not.toContain(SECRET);
  });
});
