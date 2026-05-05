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
    const sessions = await stripe.checkout.sessions.list({ limit: 100 });
    
    const match = sessions.data.find(session => 
      session.payment_status === 'paid' &&
      ('TAR-' + session.id.slice(-8).toUpperCase()) === upperCode
    );

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ valid: !!match })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ valid: false, error: err.message })
    };
  }
};
