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

    const code = 'TAR-' + session.id.slice(-8).toUpperCase();
    const customerEmail = session.customer_details?.email;

    if (customerEmail) {
      await transporter.sendMail({
        from: 'The Writers Precinct <jeff@asktheprecinct.com>',
        to: customerEmail,
        subject: 'Your Armory Access Code',
        html: `
          <div style="background:#0d0f12;padding:40px;font-family:Georgia,serif;max-width:520px;margin:0 auto;">
            <div style="color:#4a7fa5;font-family:monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;margin-bottom:16px;">Payment Confirmed</div>
            <h1 style="color:#e2e8f0;font-size:28px;margin:0 0 12px;font-family:sans-serif;">Access Granted.</h1>
            <p style="color:#6a8499;line-height:1.7;margin:0 0 28px;">Save your access code below — you'll need it every time you return to The Armory. Keep it somewhere safe.</p>
            <div style="background:#141820;border:1px solid #4a7fa5;border-radius:8px;padding:20px;text-align:center;margin:0 0 12px;">
              <div style="font-family:monospace;font-size:11px;color:#6a8499;letter-spacing:.1em;text-transform:uppercase;margin-bottom:10px;">Your Access Code</div>
              <div style="font-family:monospace;font-size:26px;color:#4a7fa5;letter-spacing:.15em;">${code}</div>
            </div>
            <p style="color:#6a8499;font-size:12px;font-family:monospace;margin:0 0 16px;text-align:center;">Keep this email — this is the only record of your code.</p>
            <div style="background:#141820;border:1px solid #1a2535;border-radius:8px;padding:20px;margin:0 0 24px;">
              <div style="font-family:monospace;font-size:11px;color:#6a8499;letter-spacing:.1em;text-transform:uppercase;margin-bottom:12px;">Your Weapons &amp; Thriller Toolkit</div>
              <p style="color:#6a8499;font-size:13px;font-family:sans-serif;margin:0 0 12px;line-height:1.6;">Your subscription includes the Weapons &amp; Thriller Toolkit PDF — eight sections on firearms, combat reality, covert operations, and writing violence with purpose. Reviewed by The Brit himself.</p>
              <a href="https://thewritersprecinct.com/toolkits/WeaponsThrillerToolkit.pdf" style="display:block;background:#1a2535;color:#4a7fa5;text-decoration:none;font-family:monospace;font-size:13px;padding:12px;border-radius:6px;text-align:center;border:1px solid #4a7fa5;">Download Weapons &amp; Thriller Toolkit →</a>
            </div>
            <a href="https://askthearmory.com" style="display:block;background:#4a7fa5;color:#0d0f12;text-decoration:none;font-family:sans-serif;font-weight:700;font-size:15px;padding:14px;border-radius:8px;text-align:center;">Enter The Armory →</a>
            <p style="color:#6a8499;font-size:11px;font-family:monospace;margin:28px 0 0;text-align:center;">Questions? Email jeff@asktheprecinct.com</p>
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
