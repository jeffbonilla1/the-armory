// netlify/functions/check-guest.js
// ============================================================
// Copyright © 2026 Jeff Bonilla — The Precinct
// Server-side guest question limit enforcement using Upstash Redis.
// Tracks by IP + User Agent fingerprint. Resets after 24 hours.
// ============================================================

const GUEST_LIMIT = 3;
const TTL_SECONDS = 86400; // 24 hours

function getGuestKey(event) {
  const ip =
    event.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    event.headers['client-ip'] ||
    'unknown';
  const ua = event.headers['user-agent'] || 'unknown';
  // Simple hash of IP + User Agent
  let hash = 0;
  const str = ip + '|' + ua;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return `guest:${Math.abs(hash)}`;
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!redisUrl || !redisToken) {
    console.error('[check-guest] Missing Upstash credentials');
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server config error' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const action = body.action; // 'check' or 'increment'

    const key = getGuestKey(event);
    console.log(`[check-guest] Key: ${key} | Action: ${action}`);

    // GET current count
    const getRes = await fetch(`${redisUrl}/get/${key}`, {
      headers: { Authorization: `Bearer ${redisToken}` }
    });
    const getData = await getRes.json();
    const currentCount = parseInt(getData.result) || 0;

    console.log(`[check-guest] Current count: ${currentCount} | Limit: ${GUEST_LIMIT}`);

    if (action === 'check') {
      const allowed = currentCount < GUEST_LIMIT;
      console.log(`[check-guest] Check result: ${allowed ? 'ALLOWED' : 'BLOCKED'}`);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          allowed,
          count: currentCount,
          remaining: Math.max(0, GUEST_LIMIT - currentCount)
        })
      };
    }

    if (action === 'increment') {
      if (currentCount >= GUEST_LIMIT) {
        console.log(`[check-guest] Increment blocked — limit reached`);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ allowed: false, count: currentCount, remaining: 0 })
        };
      }

      // Increment and set TTL
      const incrRes = await fetch(`${redisUrl}/incr/${key}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${redisToken}` }
      });
      const incrData = await incrRes.json();
      const newCount = incrData.result;

      // Set expiry only on first question
      if (newCount === 1) {
        await fetch(`${redisUrl}/expire/${key}/${TTL_SECONDS}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${redisToken}` }
        });
        console.log(`[check-guest] TTL set for ${TTL_SECONDS}s`);
      }

      const remaining = Math.max(0, GUEST_LIMIT - newCount);
      console.log(`[check-guest] Incremented to ${newCount} | Remaining: ${remaining}`);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ allowed: true, count: newCount, remaining })
      };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid action' }) };

  } catch (err) {
    console.error('[check-guest] Error:', err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error: ' + err.message }) };
  }
};
