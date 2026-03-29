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

      // Look up real product from Open Food Facts
      let productName = null;
      let ingredientsList = null;
      let brandName = null;
      try {
        // Try world database first, then AU specific
        const offRes = await fetch(`https://world.openfoodfacts.org/api/v2/product/${text}?fields=product_name,product_name_en,ingredients_text,ingredients_text_en,brands,categories`);
        const offData = await offRes.json();
        if (offData.status === 1 && offData.product) {
          const p = offData.product;
          productName = p.product_name || p.product_name_en || null;
          ingredientsList = p.ingredients_text || p.ingredients_text_en || null;
          brandName = p.brands || null;
          // Clean up ingredients text
          if (ingredientsList) {
            ingredientsList = ingredientsList.replace(/_/g, '').replace(/\[.*?\]/g, '').trim();
          }
          // Combine brand + product name
          if (brandName && productName && !productName.toLowerCase().includes(brandName.toLowerCase().split(',')[0].toLowerCase())) {
            productName = brandName.split(',')[0].trim() + ' ' + productName;
          }
        }
      } catch(e) {
        console.error('Open Food Facts error:', e);
      }
      
      console.log('Barcode lookup:', text, '-> Product:', productName, 'Ingredients:', ingredientsList ? 'found' : 'not found');

      if (productName && ingredientsList) {
        messageContent = `Product: ${productName}\n\nIngredients: ${ingredientsList}\n\nAnalyse these real ingredients. Respond ONLY with valid JSON starting with { and ending with }`;
      } else if (productName) {
        messageContent = `Product: ${productName} (barcode: ${text}). Analyse the typical ingredients of this product. Respond ONLY with valid JSON starting with { and ending with }`;
      } else {
        messageContent = `Barcode: ${text}. Identify this food product and analyse its typical ingredients. Respond ONLY with valid JSON starting with { and ending with }`;
      }
    } else {
      return res.status(400).json({ error: 'Invalid mode' });
    }

    const system = `IMPORTANT: Respond with ONLY valid JSON. Start with { end with }.

You are PURE — a food intelligence tool built on The Five Pillars. Plain English only.

THE FIVE PILLARS — score every product against all five:
01 PURE PROVENANCE — Is it organic, pasture-raised, wild-caught? Conventional farming = lower score.
02 WHOLE INGREDIENT INTEGRITY — Are ingredients real and recognisable? If you can't picture it growing, it fails.
03 ZERO INDUSTRIAL PROCESSING — Any seed oils (canola, soybean, sunflower, cottonseed, corn oil)? Any artificial additives, emulsifiers, colours, flavours? Automatic fail.
04 TRADITIONAL FOOD CRAFT — Is it fermented, slow-made, or traditionally crafted? Ultra-processed = fail.
05 COMPLETE TRANSPARENCY — Are all ingredients fully disclosed? Vague terms like "natural flavours" or "spices" = partial fail.

SCORING RUBRIC — apply consistently every time:
- 9-10: Passes all 5 pillars. Whole single-ingredient foods. e.g. fresh fruit, vegetables, eggs, quality butter, grass-fed meat
- 7-8: Passes 4 pillars. Minimal real ingredients, no seed oils, no additives. e.g. Weet-Bix, plain yoghurt, real sourdough
- 5-6: Passes 3 pillars. Some processing but no seed oils or artificial additives. e.g. most plain cereals, basic sauces
- 3-4: Passes 1-2 pillars. Contains seed oils OR multiple additives OR highly refined ingredients. e.g. most packaged snacks, energy gels with maltodextrin
- 1-2: Fails all pillars. Seed oils + artificial additives + ultra-processed. e.g. sports drinks, fast food, confectionery

AUTOMATIC SCORE CAPS:
- Contains ANY seed oil → maximum score of 4
- Contains artificial colours, flavours or preservatives → maximum score of 5
- Contains maltodextrin or high fructose corn syrup → maximum score of 4
- Ultra-processed with 10+ ingredients → maximum score of 5

Be consistent. The same product should always get the same score.

Respond ONLY with valid JSON, no markdown, no backticks.
{"productName":"string","overallScore":number 1-10,"overallVerdict":"Pure"|"Good"|"Moderate"|"Poor","summary":"2-3 plain English sentences. Reference which pillars pass or fail. No scare language.","ingredients":[{"name":"string","risk":"danger"|"warn"|"safe","tag":"Natural|Added Sugar|Seed Oil|Preservative|Artificial Additive|Caution|Whole Food","detail":"One plain English sentence."}]}
Return only valid JSON.`;

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
