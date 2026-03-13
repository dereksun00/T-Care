/**
 * T-Care Backend — server.js
 *
 * Exposes two endpoints used by the frontend:
 *
 *   POST /api/resolve-location
 *     Body: { query: "I need to see a counsellor" }
 *     Returns: { address: "214 College St, Toronto, ON", label: "Health & Wellness Centre", serviceKey: "health-counselling" }
 *
 *   GET /api/maps-key
 *     Returns: { key: "<GOOGLE_MAPS_API_KEY>" }  (keeps the key out of the HTML source)
 *
 * Natural-language resolution pipeline:
 *   1. (Optional) Query Amazon Kendra for UofT document matches → extract top result metadata
 *   2. Call Amazon Bedrock (Claude Haiku or Titan) with the query + Kendra context
 *      to classify intent → known campus location
 *   3. Return resolved address + label to the frontend, which then calls
 *      the Google Maps Directions API directly in the browser.
 */

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const {
  BedrockRuntimeClient,
  InvokeModelCommand,
} = require('@aws-sdk/client-bedrock-runtime');
const {
  KendraClient,
  QueryCommand,
} = require('@aws-sdk/client-kendra');

const app = express();
app.use(cors());
app.use(express.json());

// ── AWS clients ──────────────────────────────────────────────────────────────
const awsCreds = {
  region:      process.env.AWS_REGION      || 'us-east-1',
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
};
const bedrock = new BedrockRuntimeClient(awsCreds);
const kendra  = new KendraClient(awsCreds);

// ── Known UofT campus locations ──────────────────────────────────────────────
// These are the ground-truth addresses that get fed to Google Maps.
const CAMPUS_LOCATIONS = {
  'health-counselling': {
    label:   'Health & Wellness Centre',
    address: '214 College St, Toronto, ON M5T 2Z9',
    keywords: ['health', 'wellness', 'walk-in', 'counselling', 'sick', 'doctor', 'nurse'],
  },
  'caps': {
    label:   'CAPS Counselling',
    address: '214 College St Room 100, Toronto, ON M5T 2Z9',
    keywords: ['caps', 'therapy', 'therapist', 'mental health', 'counsellor', 'overwhelmed', 'anxious', 'depressed', 'stress'],
  },
  'tcard': {
    label:   'TCard Office',
    address: '130 St George St, Toronto, ON M5S 1A5',
    keywords: ['tcard', 't-card', 'student card', 'id card', 'lost card'],
  },
  'registrar': {
    label:   "Registrar's Office",
    address: '172 St George St, Toronto, ON M5R 0A3',
    keywords: ['registrar', 'transcript', 'enrolment', 'enrollment', 'verification', 'graduation', 'diploma'],
  },
  'aoda': {
    label:   'Accessibility Services',
    address: '455 Spadina Ave Suite 400, Toronto, ON M5S 2G8',
    keywords: ['accessibility', 'accommodation', 'disability', 'aoda', 'wheelchair', 'elevator', 'ramp'],
  },
  'equity': {
    label:   'Equity, Diversity & Inclusion Office',
    address: '215 Huron St, Toronto, ON M5S 1A2',
    keywords: ['edi', 'equity', 'diversity', 'inclusion', 'trans', 'name change', 'pronoun', 'discrimination', 'harassment'],
  },
  'financial': {
    label:   'Financial Aid & Awards',
    address: '172 St George St, Toronto, ON M5R 0A3',
    keywords: ['financial aid', 'bursary', 'osap', 'awards', 'money', 'funding', 'scholarship', 'emergency'],
  },
  'robarts': {
    label:   'Robarts Library',
    address: '130 St George St, Toronto, ON M5S 1A5',
    keywords: ['robarts', 'library', 'study', 'books'],
  },
  'harthouse': {
    label:   'Hart House',
    address: '7 Hart House Cir, Toronto, ON M5S 3H3',
    keywords: ['hart house', 'gym', 'fitness', 'pool', 'athletics'],
  },
  'ss': {
    label:   'Sidney Smith Hall',
    address: '100 St George St, Toronto, ON M5S 3G3',
    keywords: ['sidney smith', 'ss', 'sid smith'],
  },
  'bahen': {
    label:   'Bahen Centre',
    address: '40 St George St, Toronto, ON M5S 2E4',
    keywords: ['bahen', 'cs', 'computer science', 'engineering'],
  },
  'med': {
    label:   'Medical Sciences Building',
    address: '1 King\'s College Cir, Toronto, ON M5S 1A8',
    keywords: ['medical sciences', 'med sci', 'king\'s college circle'],
  },
  'simcoe': {
    label:   "Simcoe Hall",
    address: '27 King\'s College Cir, Toronto, ON M5S 1A1',
    keywords: ['simcoe', 'president', 'admin', 'administrative'],
  },
};

// ── Step 1: Optional Kendra query ────────────────────────────────────────────
async function queryKendra(userQuery) {
  const indexId = process.env.KENDRA_INDEX_ID;
  if (!indexId) return null; // Kendra not configured — skip

  try {
    const cmd = new QueryCommand({
      IndexId:     indexId,
      QueryText:   userQuery,
      PageSize:    3,
    });
    const res = await kendra.send(cmd);
    const items = res.ResultItems || [];
    // Extract any location metadata attributes from the top result
    const top = items[0];
    if (!top) return null;
    const attrs = (top.DocumentAttributes || []).reduce((acc, a) => {
      acc[a.Key] = a.Value?.StringValue || a.Value?.LongValue;
      return acc;
    }, {});
    return {
      excerpt: top.DocumentExcerpt?.Text || '',
      attrs,
    };
  } catch (err) {
    console.warn('Kendra query failed (non-fatal):', err.message);
    return null;
  }
}

// ── Step 2: Bedrock NLP ───────────────────────────────────────────────────────
async function resolveWithBedrock(userQuery, kendraContext) {
  const locationList = Object.entries(CAMPUS_LOCATIONS)
    .map(([key, v]) => `"${key}": ${v.label} at ${v.address}`)
    .join('\n');

  const contextBlock = kendraContext
    ? `\nRelevant UofT document context (from Kendra):\n"${kendraContext.excerpt}"\n`
    : '';

  const prompt = `You are a UofT campus location resolver. A student has described their need or destination. Your job is to identify the single most relevant campus location from the list below and return it as JSON.

Known locations:
${locationList}
${contextBlock}
Student input: "${userQuery}"

Rules:
- Return ONLY valid JSON, no other text or markdown.
- If the input is a physical place name, match it directly.
- If the input describes a need or service (e.g. "I need therapy", "lost my TCard"), infer the correct location.
- If nothing matches, use "health-counselling" as a safe default.
- isPhysicalLocation should be true if the request relates to a physical place or service with a campus address, false if it's purely informational (e.g. "what is OSAP?").

Response format:
{"key":"<location_key>","label":"<location label>","address":"<full address>","isPhysicalLocation":true}`;

  const modelId = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-haiku-20240307-v1:0';

  // Build request body — format differs between Claude and Titan models
  let body;
  if (modelId.startsWith('anthropic.')) {
    body = JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    });
  } else {
    // Amazon Titan text models
    body = JSON.stringify({
      inputText: prompt,
      textGenerationConfig: { maxTokenCount: 200, temperature: 0 },
    });
  }

  const cmd = new InvokeModelCommand({
    modelId,
    contentType: 'application/json',
    accept:      'application/json',
    body,
  });

  const res  = await bedrock.send(cmd);
  const text = new TextDecoder().decode(res.body);
  const parsed = JSON.parse(text);

  // Extract response text depending on model type
  let raw;
  if (modelId.startsWith('anthropic.')) {
    raw = parsed.content?.[0]?.text || '';
  } else {
    raw = parsed.results?.[0]?.outputText || '';
  }

  // Strip any accidental markdown fences
  const clean = raw.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

// ── /api/resolve-location ─────────────────────────────────────────────────────
app.post('/api/resolve-location', async (req, res) => {
  const { query } = req.body;
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'query is required' });
  }

  try {
    // 1. Kendra (optional)
    const kendraResult = await queryKendra(query);

    // 2. Bedrock
    const resolved = await resolveWithBedrock(query, kendraResult);

    return res.json({
      key:                resolved.key,
      label:              resolved.label,
      address:            resolved.address,
      isPhysicalLocation: resolved.isPhysicalLocation !== false,
    });
  } catch (err) {
    console.error('resolve-location error:', err);

    // Graceful fallback: simple keyword match so the UI never hard-fails
    const q = query.toLowerCase();
    let fallback = CAMPUS_LOCATIONS['health-counselling'];
    let fallbackKey = 'health-counselling';
    for (const [key, loc] of Object.entries(CAMPUS_LOCATIONS)) {
      if (loc.keywords.some(kw => q.includes(kw))) {
        fallback = loc;
        fallbackKey = key;
        break;
      }
    }
    return res.json({
      key:                fallbackKey,
      label:              fallback.label,
      address:            fallback.address,
      isPhysicalLocation: true,
      fallback:           true,
    });
  }
});

// ── /api/maps-key ─────────────────────────────────────────────────────────────
// Serves the Google Maps API key to the frontend so it's not hardcoded in HTML.
app.get('/api/maps-key', (req, res) => {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key || key === 'YOUR_GOOGLE_MAPS_API_KEY_HERE') {
    return res.status(503).json({ error: 'Google Maps API key not configured' });
  }
  res.json({ key });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`T-Care backend running on http://localhost:${PORT}`);
  console.log(`  Bedrock model : ${process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-haiku-20240307-v1:0'}`);
  console.log(`  Kendra index  : ${process.env.KENDRA_INDEX_ID  || '(not configured)'}`);
  console.log(`  Google Maps   : ${process.env.GOOGLE_MAPS_API_KEY ? 'configured' : 'NOT SET'}`);
});
