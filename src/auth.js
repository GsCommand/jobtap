// Auth layer for the engine.
//
// Two concerns, two middlewares:
//   1. requireAuth        — internal API endpoints. Accepts EITHER a Supabase user
//                           JWT (Bearer <access_token> from the app) OR the server
//                           API key (x-api-key header, for scripts/cron/dashboard
//                           server-side calls). User JWTs are additionally checked
//                           for business ownership via requireBusinessAccess().
//   2. twilioSignature    — validates X-Twilio-Signature on Twilio webhooks so
//                           spoofed POSTs can't inject missed calls / fake STOPs.
//
// Stripe webhook signature validation already exists in index.js via
// stripe.webhooks.constructEvent — this file completes the set.

const twilio = require('twilio');
const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// ---------- 1. Internal API auth ----------

/**
 * requireAuth: attaches req.auth = { type: 'api_key' } or
 * { type: 'user', userId } on success; 401 otherwise.
 */
async function requireAuth(req, res, next) {
  try {
    // Path A: server-to-server API key (scripts, dashboard backend, cron)
    const apiKey = req.headers['x-api-key'];
    if (apiKey) {
      if (process.env.INTERNAL_API_KEY && apiKey === process.env.INTERNAL_API_KEY) {
        req.auth = { type: 'api_key' };
        return next();
      }
      return res.status(401).json({ error: 'invalid api key' });
    }

    // Path B: Supabase user JWT from the app
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'missing credentials' });

    const { data, error } = await db.auth.getUser(token);
    if (error || !data || !data.user) {
      return res.status(401).json({ error: 'invalid or expired token' });
    }
    req.auth = { type: 'user', userId: data.user.id };
    return next();
  } catch (e) {
    console.error('auth:', e.message);
    return res.status(500).json({ error: 'auth failure' });
  }
}

/**
 * assertBusinessAccess: given a business row (or business_id), verify the
 * authenticated principal may act on it. API key = trusted for all businesses
 * (server-side only). User JWT = must be the owner.
 * Throws a status-tagged error on failure; route handlers pass it to respond().
 */
async function assertBusinessAccess(req, businessOrId) {
  if (req.auth && req.auth.type === 'api_key') return true;

  let business = businessOrId;
  if (typeof businessOrId === 'string') {
    const { data } = await db.from('businesses').select('id, owner_id').eq('id', businessOrId).maybeSingle();
    business = data;
  }
  if (!business) {
    const err = new Error('business not found');
    err.status = 404;
    throw err;
  }
  if (!req.auth || req.auth.type !== 'user' || business.owner_id !== req.auth.userId) {
    const err = new Error('forbidden');
    err.status = 403;
    throw err;
  }
  return true;
}

// ---------- 2. Twilio webhook signature validation ----------

/**
 * Twilio signs each webhook with HMAC-SHA1 over the exact public URL + sorted
 * POST params, keyed by the auth token. Behind Railway/Vercel proxies the
 * public URL must be reconstructed from forwarded headers (or pinned via
 * PUBLIC_URL to be immune to header games).
 */
function publicUrlFor(req) {
  if (process.env.PUBLIC_URL) {
    return `${process.env.PUBLIC_URL.replace(/\/$/, '')}${req.originalUrl}`;
  }
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}${req.originalUrl}`;
}

function twilioSignature(req, res, next) {
  // Escape hatch for local testing only — never set in production
  if (process.env.TWILIO_VALIDATE === 'false') return next();

  const signature = req.headers['x-twilio-signature'];
  if (!signature) return res.status(403).send('missing signature');

  const valid = twilio.validateRequest(
    process.env.TWILIO_AUTH_TOKEN,
    signature,
    publicUrlFor(req),
    req.body || {}
  );
  if (!valid) {
    console.warn(`twilio signature rejected: ${req.originalUrl} from ${req.ip}`);
    return res.status(403).send('invalid signature');
  }
  return next();
}

module.exports = { requireAuth, assertBusinessAccess, twilioSignature };
