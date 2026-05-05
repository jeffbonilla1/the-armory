// netlify/functions/claude-proxy.js
// ============================================================
// Copyright © 2026 Jeff Bonilla — The Precinct
// Serverless streaming proxy to keep the Anthropic API key hidden.
// ============================================================
const { stream } = require('@netlify/functions');

exports.handler = stream(async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'API key not configured on server.' })
    };
  }

  try {
    const body = JSON.parse(event.body);
    const anthropicBody = { ...body, stream: true };

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(anthropicBody)
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no'
      },
      body: response.body
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Proxy error: ' + err.message })
    };
  }
});
