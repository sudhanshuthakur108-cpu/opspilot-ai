import { errors as joseErrors, jwtVerify, SignJWT } from 'jose';

export const SESSION_COOKIE = 'opspilot_session';
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

// Only this algorithm is accepted on verification, so a token cannot pick its own
// (for example "none", or an asymmetric algorithm keyed with our secret).
const ALGORITHM = 'HS256';
const ISSUER = 'opspilot-api';
const OBJECT_ID = /^[0-9a-f]{24}$/;

function readCookie(req, name) {
  for (const pair of req.headers.cookie?.split(';') ?? []) {
    const separator = pair.indexOf('=');
    if (separator !== -1 && pair.slice(0, separator).trim() === name) {
      return pair.slice(separator + 1).trim();
    }
  }
  return null;
}

// Session token: a signed JWT with the user ID as `sub` and the user's token version as `ver`,
// stored in an HttpOnly cookie that browser JavaScript cannot read.
export function createSessions({ secret, secureCookie }) {
  const key = new TextEncoder().encode(secret);
  const cookieOptions = { httpOnly: true, secure: secureCookie, sameSite: 'strict', path: '/' };

  return {
    async start(res, user) {
      const token = await new SignJWT({ ver: user.tokenVersion })
        .setProtectedHeader({ alg: ALGORITHM })
        .setSubject(user.id)
        .setIssuer(ISSUER)
        .setIssuedAt()
        .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
        .sign(key);

      res.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_TTL_SECONDS * 1000 });
    },

    end(res) {
      res.clearCookie(SESSION_COOKIE, cookieOptions);
    },

    // Returns { userId, tokenVersion } for a valid token, or null for a missing or invalid one.
    async readClaims(req) {
      const token = readCookie(req, SESSION_COOKIE);
      if (!token) {
        return null;
      }

      let payload;
      try {
        ({ payload } = await jwtVerify(token, key, {
          algorithms: [ALGORITHM],
          issuer: ISSUER,
          requiredClaims: ['sub', 'iat', 'exp'],
        }));
      } catch (error) {
        if (error instanceof joseErrors.JOSEError) {
          return null;
        }
        throw error;
      }

      if (!OBJECT_ID.test(payload.sub) || !Number.isInteger(payload.ver) || payload.ver < 0) {
        return null;
      }

      return { userId: payload.sub, tokenVersion: payload.ver };
    },
  };
}
