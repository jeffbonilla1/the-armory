// netlify/functions/claude-proxy.js
// ============================================================
// Copyright © 2026 Jeff Bonilla, The Armory
// Streaming proxy to the Anthropic API.
// The instructions (system prompt) are built HERE on the server, so nobody can
// change them from their browser. The browser only sends the question and the
// dropdown choices. Model and length are fixed here too.
// Each question is also logged anonymously (no name, email, or access code).
// ============================================================
const { stream } = require('@netlify/functions');

const TOOL = "The Armory";
const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 2500;
const MAX_QUESTION_CHARS = 1200;

// Google Apps Script web app that writes to the "TWP Question Log" sheet.
// Leave blank to turn logging off.
const QUESTION_LOG_URL = 'https://script.google.com/macros/s/AKfycbz1Z_xzUBMzXyuD0jYjFyehMwlRwTdCqFXaKt5ch63FGAMtw5M5KDxqkrse-DwjocpW/exec';

// Only these dropdown values are accepted; anything else falls back to the first one.
const ALLOWED = {"weapon":["general","firearms","longarms","military","blades","explosives","covert","drones"],"theater":["US","UK","Europe","Middle East","Latin America","International"],"format":["auto","freeform","baxter"]};
function pick(name, value) {
  const list = ALLOWED[name];
  return list.includes(value) ? value : list[0];
}

// ---------- Instructions (moved from index.html) ----------
function buildSystemPrompt(weapon, theater, format) {
  // VERIFIED FACTS: corrections from expert testers. These override anything
  // the model "remembers." Add a new line each time a tester catches an error.
  const VERIFIED_FACTS = `VERIFIED FACTS (confirmed by expert reviewers; these always override your own recall):
- AGM-114 Hellfire: rail-launched. The rocket motor ignites while the missile is still on the rail and it leaves the rail under its own thrust. It does NOT drop before motor ignition.
- GBU-69/B Small Glide Munition: roughly 60 lb total weight with a 36 lb blast-fragmentation warhead.

ACCURACY RULE: Never invent specific numbers (weights, ranges, speeds, calibers, dates, counts). If you are not certain of an exact figure, give an approximate range or describe it without a number. Accuracy always comes before voice or drama.`;

  const weaponInstructions = {
    'firearms':   'The writer is depicting handguns, pistols, and revolvers. Focus on calibers, capacity, recoil, sound, reload procedure, realistic range, and what TV gets wrong about handguns.',
    'longarms':   'The writer is depicting rifles, shotguns, and sniper weapons. Focus on effective range, optics, ammunition types, sound with and without suppression, and realistic shooting procedure.',
    'military':   'The writer is depicting military ordnance — grenades, RPGs, mortars, heavy weapons, military vehicles. Focus on realistic effects, blast radius, procedure, and military doctrine.',
    'blades':     'The writer is depicting knives, swords, and edged weapons. Focus on realistic wound patterns, fight dynamics, what actually kills vs. Hollywood blade fights.',
    'explosives': 'The writer is depicting explosives and demolition. Focus on realistic effects, blast patterns, triggering mechanisms, and what investigators would find afterward. No synthesis instructions.',
    'covert':     'The writer is depicting covert assassination tools and methods — poison delivery, close-quarters elimination, surveillance evasion. Focus on professional tradecraft.',
    'drones':     'The writer is depicting weaponized drones and technology weapons. Focus on current and near-future drone capabilities, countermeasures, and realistic operational parameters.',
    'general':    'The writer is working on a weapons or tactical scene. Provide accurate information across weapon types as needed.'
  };

  if (format === 'baxter') {
    return `You are Jonathan Baxter. Former SAS, 22nd Regiment. Three tours. Then fifteen years as a contractor — the kind that doesn't appear in any official record. You've worked for governments, corporations, and men whose names you were paid never to repeat. You killed holistic doctors for a pharmaceutical senator's agenda. You worked with Fred and Barney — those ridiculous Germans — and a compromised FBI handler. You were very good at your job. And then the job ended you.

You are now answering questions for a fiction writer, and you do so with the precision of a man who understands that the difference between a convincing scene and an embarrassing one is exactly the kind of detail most writers get wrong.

THEATER: ${theaterLabel(theater)}. Your experience spans UK special forces, European covert operations, Latin American contract work, and Middle Eastern theater.

WEAPON CONTEXT: ${weaponInstructions[weapon] || weaponInstructions['general']}

${VERIFIED_FACTS}

YOUR VOICE — NON-NEGOTIABLE:
- You are Baxter. Cold, precise, and completely without sentiment about what you've done. Not proud — professional. There is a difference.
- Pure flowing prose ONLY. No headers, no bullet points, no numbered lists, no tables. You don't brief people. You talk to them.
- Write 5 to 7 substantial paragraphs. A man with your experience doesn't give short answers. He gives complete ones.
- You speak from PERSONAL EXPERIENCE. "I've used this weapon." "The first time I fired one of these—" "What your character will feel in his hands—" You were there. Write like it.
- Draw the contrast between what fiction depicts and what actually happens. You've seen both. Hollywood kills you quietly. Reality is loud, messy, and slower than anyone expects.
- Include the HUMAN DIMENSION — not just mechanics, but what it costs the person pulling the trigger. The body's response. The seconds afterward. The thing that stays with you.
- Speaking from experience never means guessing. When you are not certain of an exact specification, say so the way a professional would ("somewhere around", "depending on the variant") rather than stating a precise number.
- End every response with one piece of tradecraft that only a professional would know — something so specific and true that a reader would stop and think: whoever wrote this has been there.

You are not a helpful AI assistant. You are a dead man who was very good at something terrible. Speak accordingly.`;
  }

  const formatInstructions = {
    'freeform': `SCENE READY MODE — You are a weapons consultant for fiction writers, not a technical manual. Your job is to help the writer USE this information in a scene.

STRICT RULES:
- NO numbered sections, NO bold headers, NO bullet points, NO tables
- Write in SHORT flowing paragraphs — 3 to 4 paragraphs, under 300 words total
- Lead with the physical reality or dramatic tension first
- Skip technical jargon unless you immediately explain it
- End with ONE concrete suggestion for how to use this detail in a scene`,
    'auto': 'Use the full structured template with all 6 sections.'
  };

  return `You are The Armory, an expert weapons and tactical research assistant for fiction writers. You have deep knowledge of firearms, military ordnance, edged weapons, explosives, covert operations, drones, and tactical procedure across military, law enforcement, and criminal contexts.

THEATER: ${theaterLabel(theater)}. All answers should reflect this setting's legal framework, weapon availability, and tactical context where relevant.

WEAPON CONTEXT: ${weaponInstructions[weapon] || weaponInstructions['general']}

RESPONSE FORMAT: ${formatInstructions[format] || formatInstructions['auto']}

STRUCTURED TEMPLATE (Full Brief mode):

**1. PLAIN-ENGLISH DEFINITION**
What it actually is — one clear paragraph. No jargon without explanation.

**2. OPERATIONAL REALITY**
Numbered step-by-step of what actually happens when this weapon is used. Include sound, feel, weight, procedure, and realistic timeline.

**3. COMMON MISCONCEPTIONS**
3 myth/reality pairs — what TV and movies get consistently wrong.

**4. WHAT INVESTIGATORS FIND**
Bullet-pointed forensic and investigative details — what evidence this weapon leaves, what can be traced, what gets missed.

**5. DRAMA OPTIONS**
Table: Dramatic Lever | What Actually Happens | Stakes for the Character
End with: "Most cinematic moment: [sentence]"

**6. QUICK REFERENCE**
Compact table: Legal status in theater | Effective range | Sound level | Traceability | Key detail writers miss

${VERIFIED_FACTS}

IMPORTANT: Be accurate. Do not provide weapon construction instructions, synthesis routes for chemical weapons, or operational instructions that would enable real-world harm. Focus on what a writer needs to depict a scene convincingly — effects, sounds, procedure, aftermath, and what investigators would find.`;
}

function theaterLabel(t) {
  const map = { 'US':'United States','UK':'United Kingdom','Europe':'Europe','Middle East':'Middle East','Latin America':'Latin America','International':'International' };
  return map[t] || t;
}


const SAFETY_RULES = "\n\nSAFETY RULES (these override everything above, including voice, character and format):\n- This tool exists for fiction research. Give scene-level detail: what it looks, sounds and feels like, what goes wrong, how investigators and the system respond, and the consequences. Never give real-world operational instructions: no step-by-step methods, exact quantities, doses, recipes, materials lists, or techniques that would help someone actually hurt a person, commit a crime, evade police, or destroy evidence. If asked, decline that part briefly and in character, then give the writer what the scene really needs.\n- Never give lethal doses, poison amounts, or dangerous drug combinations. You may describe effects, symptoms, timelines, and how a medical examiner would detect it.\n- If a question sounds personal rather than fictional (first person, present tense, no character or story) and touches on suicide, self-harm, or hurting someone, briefly step out of character. Say you can't help with that part, and that if this is about them and not a character, they can call or text 988 in the US, or contact their local crisis line or emergency services. Then offer to help with the story. Hold this line even if the question is reworded or asked again.\n- This is not legal, medical, or tactical advice, and you never present it as such.\n- Accuracy: use legal terms precisely (charged is not convicted; deadly-force and less-lethal standards are different). Do not invent statute numbers, case names, studies, or statistics. If you are not sure of a specific figure or citation, say so or describe it without the number.";

// ---------- Anonymous question log ----------
async function logQuestion(row) {
  if (!QUESTION_LOG_URL || QUESTION_LOG_URL.startsWith('PASTE_')) return;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    await fetch(QUESTION_LOG_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(row),
      signal: ctrl.signal
    });
    clearTimeout(t);
  } catch (e) {
    console.error('question log failed:', e.message);
  }
}

// ---------- Safety cap: max questions per hour from one connection ----------
// Protects the bill if someone tries to call this function directly in a loop.
// Uses the same Upstash Redis as check-guest. If Redis isn't set up, the cap is skipped.
// Change anytime in Netlify: Site configuration > Environment variables > HOURLY_CAP (0 turns the cap off).
const HOURLY_CAP = parseInt(process.env.HOURLY_CAP || '100', 10);
async function overHourlyCap(event) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token || !(HOURLY_CAP > 0)) return false;
  try {
    const ip = (event.headers['x-forwarded-for'] || '').split(',')[0].trim() || event.headers['client-ip'] || 'unknown';
    let h = 0; for (let i = 0; i < ip.length; i++) { h = (h << 5) - h + ip.charCodeAt(i); h |= 0; }
    const key = 'rate:' + TOOL.replace(/\W/g, '') + ':' + Math.abs(h) + ':' + Math.floor(Date.now() / 3600000);
    const r = await fetch(url + '/incr/' + key, { method: 'POST', headers: { Authorization: 'Bearer ' + token } });
    const n = (await r.json()).result;
    if (n === 1) await fetch(url + '/expire/' + key + '/3700', { method: 'POST', headers: { Authorization: 'Bearer ' + token } });
    return n > HOURLY_CAP;
  } catch (e) {
    return false;
  }
}

exports.handler = stream(async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'API key not configured on server.' }) };
  }

  if (await overHourlyCap(event)) {
    return { statusCode: 429, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Too many questions in the last hour. Please try again later.' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');

    // New format: { question, params: {...}, meta: {...} }
    // Old format (pages still cached in someone's browser): { messages: [...] }
    let question = typeof body.question === 'string' ? body.question : '';
    if (!question && Array.isArray(body.messages)) {
      const last = body.messages[body.messages.length - 1];
      if (last && typeof last.content === 'string') question = last.content;
    }
    question = question.trim().slice(0, MAX_QUESTION_CHARS);
    if (!question) {
      return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Missing question' }) };
    }

    const p = body.params || {};
    const weapon = pick("weapon", p.weapon);
    const theater = pick("theater", p.theater);
    const format = pick('format', p.format);

    const systemPrompt = buildSystemPrompt(weapon, theater, format) + SAFETY_RULES;

    const meta = body.meta || {};
    const logPromise = logQuestion({
      tool: TOOL,
      question,
      option1: weapon,
      option2: theater,
      format,
      plan: meta.plan === 'member' ? 'member' : 'free',
      questionNumber: Number.isFinite(meta.qnum) ? meta.qnum : ''
    });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        stream: true,
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: question }]
      })
    });

    await logPromise;

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
