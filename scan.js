export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { mode, text, imageBase64, imageMime } = req.body;

    if (mode === 'receipt_photo' || mode === 'receipt_text') {
      let messageContent;
      if (mode === 'receipt_photo') {
        if (!imageBase64) return res.status(400).json({ error: 'Missing image' });
        messageContent = [
          { type: 'image', source: { type: 'base64', media_type: imageMime || 'image/jpeg', data: imageBase64 } },
          { type: 'text', text: 'Read all the product/food names from this grocery receipt and analyse each one.' }
        ];
      } else {
        if (!text) return res.status(400).json({ error: 'Missing products text' });
        messageContent = `Analyse these grocery products:\n\n${text}`;
      }

      const receiptSystem = `You are PURE — a friendly food safety checker. Analyse each grocery product based on typical ingredients. Keep language simple and easy to understand.
A "Pure Shop" means 80%+ of products are genuinely healthy. Be honest — most supermarket shops score 30-60%.
Respond ONLY with valid JSON, no markdown, no backticks.
{"pureScore":number 0-100,"verdict":"Pure Shop"|"Getting There"|"Needs Work","summary":"2-3 friendly simple sentences","products":[{"name":"string","status":"pass"|"warn"|"fail","badge":"Clean|Okay|Avoid|Seed Oils|Too Processed|Too Much Sugar","reason":"1 simple sentence"}],"swaps":[{"from":"product to replace","to":"better alternative"}]}`;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1200, system: receiptSystem, messages: [{ role: 'user', content: messageContent }] })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'API error');
      const parsed = JSON.parse(data.content.map(b => b.text || '').join('').replace(/```json|```/g, '').trim());
      return res.status(200).json(parsed);
    }

    let messageContent;
    if (mode === 'camera') {
      if (!imageBase64) return res.status(400).json({ error: 'Missing image' });
      messageContent = [
        { type: 'image', source: { type: 'base64', media_type: imageMime || 'image/jpeg', data: imageBase64 } },
        { type: 'text', text: 'Read ALL ingredients from this food label photo and analyse each one.' }
      ];
    } else if (mode === 'paste') {
      if (!text) return res.status(400).json({ error: 'Missing ingredients text' });
      messageContent = `Analyse these food ingredients:\n\n${text}`;
    } else if (mode === 'search') {
      if (!text) return res.status(400).json({ error: 'Missing product name' });
      messageContent = `Analyse the typical ingredients of: "${text}".`;
    } else if (mode === 'barcode') {
      if (!text) return res.status(400).json({ error: 'Missing barcode' });
      messageContent = `Barcode number: ${text}\n\nRespond ONLY with valid JSON. No explanation, no preamble, no markdown. Start your response with { and end with }`;
    } else {
      return res.status(400).json({ error: 'Invalid mode' });
    }

    const system = `IMPORTANT: You must respond with ONLY valid JSON. No text before or after. Start with { end with }.

You are PURE — a friendly food safety checker. Plain English, no jargon.
Respond ONLY with valid JSON, no markdown, no backticks.
{"productName":"string","overallScore":number 1-10,"overallVerdict":"Safe"|"Okay"|"Be Careful"|"Avoid","summary":"2-3 plain simple sentences. Honest but kind. No technical words.","ingredients":[{"name":"string","risk":"danger"|"warn"|"safe","tag":"Safe|Caution|Avoid|Artificial Colour|Added Sugar|Seed Oil|Preservative|Natural","detail":"One simple sentence in plain English."}]}
Keep it simple. Return only valid JSON.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1000, system, messages: [{ role: 'user', content: messageContent }] })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'API error');
    const parsed = JSON.parse(data.content.map(b => b.text || '').join('').replace(/```json|```/g, '').trim());
    return res.status(200).json(parsed);

  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: err.message || 'Something went wrong. Please try again.' });
  }
}
