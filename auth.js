// Phone normalization — everything stored and matched as E.164 (+1XXXXXXXXXX).
// Twilio delivers E.164; CSV imports and form typing deliver chaos.
// This module is the single place both meet.

/**
 * Normalize a US/CA phone number to E.164. Returns null if it can't be one.
 * Handles: "(904) 555-1234", "904.555.1234", "1-904-555-1234", "+19045551234",
 * "9045551234", " 904 555 1234 ", "904-555-1234 ext 2" (extension dropped).
 */
function normalizePhone(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;

  // Drop extensions: "x123", "ext 2", "extension 4"
  s = s.replace(/\s*(x|ext\.?|extension)\s*\d+\s*$/i, '');

  // Keep leading +, strip everything else non-digit
  const hasPlus = s.startsWith('+');
  const digits = s.replace(/\D/g, '');

  if (hasPlus) {
    // Already international form — only accept +1 NANP here
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    return null;
  }
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

/**
 * Normalize or throw — for paths where a bad number must stop the request.
 */
function normalizePhoneOrThrow(raw, label = 'phone') {
  const n = normalizePhone(raw);
  if (!n) {
    const err = new Error(`invalid ${label}: ${raw}`);
    err.status = 400;
    throw err;
  }
  return n;
}

/**
 * Candidate list for matching legacy rows that may have been stored
 * un-normalized (pre-migration data): ["+19045551234", "9045551234", "19045551234"].
 * Use with .in('phone', phoneCandidates(x)) so lookups still hit dirty rows.
 */
function phoneCandidates(raw) {
  const e164 = normalizePhone(raw);
  if (!e164) return raw ? [String(raw).trim()] : [];
  const digits = e164.slice(1); // 1XXXXXXXXXX
  return [e164, digits, digits.slice(1)];
}

module.exports = { normalizePhone, normalizePhoneOrThrow, phoneCandidates };
