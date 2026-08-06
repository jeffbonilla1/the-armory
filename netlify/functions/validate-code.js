const Stripe = require('stripe');

const VIP_CODES = new Set([
  'TAR-DAVEVIP',
  'TAR-DALEVIP',
  'TAR-BETHVIP',
  'TAR-PREVIEW'
]);

exports.handler = async (event) => {
  const code = event.queryStringParameters?.code;

  if (!code) {
    return {
      statusCode: 400,
      body: JSON.stringify({ valid: false, error: 'Missing code' })
    };
  }

  const upperCode = code.toUpperCase().trim();

  // Check VIP codes first — no Stripe needed
  if (VIP_CODES.has(upperCode)) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ valid: true })
    };
  }

  // Code format check
  if (!upperCode.startsWith('TAR-') || upperCode.length !== 12) {
    return {
      statusCode: 200,
      body: JSON.stringify({ valid: false })
    };
  }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

  try {
    // Search checkout sessions for the one whose ID suffix matches this code.
    // Paginate up to 500 sessions (5 pages) so codes don't silently fail to
    // validate once lifetime session volume grows past a single page --
    // this is still a linear search and will eventually need a proper
    // code -> subscription/session mapping stored at purchase time instead
    // of searching Stripe live on every validation call.
    let match = null;
    let startingAfter = undefined;
    for (let page = 0; page < 5 && !match; page++) {
      const sessions = await stripe.checkout.sessions.list({
        limit: 100,
        starting_after: startingAfter
      });

      match = sessions.data.find(session =>
        session.payment_status === 'paid' &&
        ('TAR-' + session.id.slice(-8).toUpperCase()) === upperCode
      );

      if (!sessions.has_more) break;
      startingAfter = sessions.data[sessions.data.length - 1].id;
    }

    if (!match) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ valid: false })
      };
    }

    // One-time purchases (old pre-subscription model, e.g. legacy Consult
    // Packs) have no recurring subscription attached -- those customers
    // paid for lifetime access under the terms that existed at the time,
    // so they stay valid forever, same as before.
    if (match.mode !== 'subscription' || !match.subscription) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ valid: true })
      };
    }

    // Subscription purchases: check the LIVE status of the subscription,
    // not just whether the original checkout was once paid. This is what
    // makes "cancel anytime" actually mean access ends when you cancel.
    const subscriptionId = typeof match.subscription === 'string'
      ? match.subscription
      : match.subscription.id;

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const isActive = subscription.status === 'active' || subscription.status === 'trialing';

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ valid: isActive })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ valid: false, error: err.message })
    };
  }
};
