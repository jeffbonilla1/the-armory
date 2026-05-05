const Stripe = require('stripe');

const headers = {
  'Access-Control-Allow-Origin': 'https://asktheprecinct.com',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: 'Method Not Allowed' };
  }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'The Precinct — Professional Writer Pack',
              description: '100 Case Consults + lifetime account access',
            },
            unit_amount: 1999,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `https://app.asktheprecinct.com/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `https://asktheprecinct.com`,
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
