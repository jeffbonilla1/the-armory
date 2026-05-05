const Stripe = require('stripe');
const nodemailer = require('nodemailer');

exports.handler = async (event) => {
  const sessionId = event.queryStringParameters?.session_id;

  if (!sessionId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing session_id' })
    };
  }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

  const transporter = nodemailer.createTransport({
    host: 'mail.privateemail.com',
    port: 587,
    secure: false,
    auth: {
      user: 'jeff@asktheprecinct.com',
      pass: process.env.PRIVATE_EMAIL_PASSWORD
    }
  });

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== 'paid') {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Payment not confirmed' })
      };
    }

    // Generate access code from session ID
    const code = 'TAR-' + session.id.slice(-8).toUpperCase();
    const customerEmail = session.customer_details?.email;

    // Send email if we have an address
    if (customerEmail) {
      await transporter.sendMail({
        from: 'The Precinct <jeff@asktheprecinct.com>',
        to: customerEmail,
        subject: 'Your Precinct Access Code',
        html: `
          <div style="background:#0e0e0f;padding:40px;font-family:Georgia,serif;max-width:520px;margin:0 auto;">
            <div style="color:#c8782a;font-family:monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;margin-bottom:16px;">Payment Confirmed</div>
            <h1 style="color:#e8e6e0;font-size:28px;margin:0 0 12px;font-family:sans-serif;">Access Granted.</h1>
            <p style="color:#a7a39a;line-height:1.7;margin:0 0 28px;">Save your access code below — you'll need it every time you return to The Precinct. Keep it somewhere safe.</p>
            <div style="background:#161618;border:1px solid #c8782a;border-radius:8px;padding:20px;text-align:center;margin:0 0 12px;">
              <div style="font-family:monospace;font-size:11px;color:#7d7a73;letter-spacing:.1em;text-transform:uppercase;margin-bottom:10px;">Your Access Code</div>
              <div style="font-family:monospace;font-size:26px;color:#c8782a;letter-spacing:.15em;">${code}</div>
            </div>
            <p style="color:#7d7a73;font-size:12px;font-family:monospace;margin:0 0 28px;text-align:center;">Keep this email — this is the only record of your code.</p>
            <a href="https://app.asktheprecinct.com" style="display:block;background:#c8782a;color:#120b05;text-decoration:none;font-family:sans-serif;font-weight:700;font-size:15px;padding:14px;border-radius:8px;text-align:center;">Enter The Precinct →</a>
            <p style="color:#7d7a73;font-size:11px;font-family:monospace;margin:28px 0 0;text-align:center;">Questions? Email jeff@asktheprecinct.com</p>
          </div>
        `
      });
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
