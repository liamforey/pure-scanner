export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { mode, text, imageBase64, imageMime } = req.body;
    let messageContent;

    if (mode === 'paste') {
      messageContent = `Analyse these food ingredients:\n\n${text}`;
    } else if (mode === 'search') {
      messageContent = `Analyse the typical ingredients of: "${text}". Use what you know about this product.`;
    } else if (mode === 'photo') {
      messageContent = [
        { type: 'image', source: { type: 'base64', media_type: imageMime || 'image/jpeg', data: imageBase64 } },
        { type: 'text', text: 'Read ALL ingredients from this food label photo and analyse each one for health risks against the PURE Five Pillars.' }
      ];
    } else {
      return res.status(400).json({ error: 'Invalid mode' });
    }

    const system = `You are the PURE Scanner — food intelligence AI. Simple · Real · Transparent.
The Five Pillars: 01 Pure Provenance (organic, pasture-raised, wild-caught) · 02 Whole Ingredient Integrity (real, recognisable, minimal) · 03 Zero Industrial Processing (no seed oils, no additives) · 04 Traditional Food Craft (fermented, slow-made) · 05 Complete Transparency (full disclosure).
The Pure Rule: Real food should not need more than 5 ingredients.
Respond ONLY with valid JSON, no markdown, no backticks.
{"productName":"string","overallScore":number 1-10,"overallVerdict":"Clean"|"Acceptable"|"Concerning"|"Toxic","ingredientCount":number,"passesFiveRule":boolean,"pillarScores":{"pureProvenance":"pass"|"warn"|"fail","wholeIngredientIntegrity":"pass"|"warn"|"fail","zeroIndustrialProcessing":"pass"|"warn"|"fail","traditionalFoodCraft":"pass"|"warn"|"fail","completeTransparency":"pass"|"warn"|"fail"},"summary":"2-3 sentences honest editorial","ingredients":[{"name":"string","risk":"danger"|"warn"|"safe","tag":"string","detail":"1-2 sentences"}]}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system,
        messages: [{ role: 'user', content: messageContent }]
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'API error');
    const raw = data.content.map(b => b.text || '').join('');
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
