import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { HttpError } from '../../lib/httpError.js';
import { findSessionUser } from './auth.middleware.js';
import { authenticateUser, registerUser } from './auth.service.js';
import { validateLogin, validateRegistration } from './auth.validation.js';

// Register and login attempts allowed per client IP in each window.
const ATTEMPT_LIMIT = 10;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

// `name` is null for accounts created before names were collected. It is read from the
// database on every request, never from the session token, so a session always shows the
// current name.
function publicUser(user) {
  return { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt };
}

// `users` is the user store (see modules/users/user.store.js); `sessions` and `requireAuth`
// are shared with the other routers (see app.js).
export function createAuthRouter({ users, sessions, requireAuth }) {
  // Counts every attempt, successful or not. The store is in memory, so counts reset on restart
  // and are per instance. Client IPs are only correct once `trust proxy` is set for the deployment.
  const limitAttempts = rateLimit({
    windowMs: ATTEMPT_WINDOW_MS,
    limit: ATTEMPT_LIMIT,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res, next) => next(new HttpError(429, 'RATE_LIMITED', 'Too many attempts. Try again later.')),
  });

  const router = Router();

  // POST /register { name, email, password } → 201 { user } and a session cookie
  router.post('/register', limitAttempts, async (req, res) => {
    const credentials = validateRegistration(req.body);

    const user = await registerUser(users, credentials);
    if (!user) {
      // Registration cannot avoid revealing that an email is taken until there is email
      // verification; the rate limit keeps this from being used to scan for accounts.
      throw new HttpError(409, 'EMAIL_UNAVAILABLE', 'An account cannot be created with this email');
    }

    await sessions.start(res, user);
    res.status(201).json({ user: publicUser(user) });
  });

  // POST /login { email, password } → 200 { user } and a session cookie
  router.post('/login', limitAttempts, async (req, res) => {
    const user = await authenticateUser(users, validateLogin(req.body));
    if (!user) {
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
    }

    await sessions.start(res, user);
    res.json({ user: publicUser(user) });
  });

  // POST /logout → 204. Clears the cookie and, for a valid session, bumps the token version,
  // which invalidates every token issued to the user (all devices), including copies.
  router.post('/logout', async (req, res) => {
    const user = await findSessionUser(req, { sessions, users });
    if (user) {
      await users.incrementTokenVersion(user.id);
    }

    sessions.end(res);
    res.status(204).end();
  });

  // GET /me → 200 { user }
  router.get('/me', requireAuth, (req, res) => {
    res.set('Cache-Control', 'no-store').json({ user: publicUser(req.user) });
  });

  return router;
}
