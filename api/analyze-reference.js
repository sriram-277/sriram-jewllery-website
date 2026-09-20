export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
        return res.status(500).json({ error: 'AI service not configured.' });
    }

    try {
        const { imageBase64, customerMessage } = req.body;

        if (!imageBase64) {
            return res.status(400).json({ error: 'Reference image is required.' });
        }

        // Use Gemini Vision to analyze the jewellery reference image
        const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            {
                                inlineData: {
                                    mimeType: 'image/jpeg',
                                    data: imageBase64
                                }
                            },
                            {
                                text: `You are an expert jewellery designer and gemologist. Analyze this jewellery reference image in detail.

Describe:
1. Type of jewellery (ring, necklace, pendant, earrings, bracelet, etc.)
2. Metal type and colour (yellow gold, white gold, rose gold, silver, platinum, etc.)
3. Metal finish (polished, matte, brushed, hammered, textured, etc.)
4. Gemstones present (type, colour, cut, approximate size, quantity)
5. Stone setting style (prong, bezel, pave, channel, tension, cluster, etc.)
6. Overall design style (traditional, modern, vintage, art deco, minimalist, ornate, etc.)
7. Pattern and decorative elements (filigree, milgrain, engraving, enamel, etc.)
8. Chain/link structure if applicable
9. Approximate proportions and dimensions
10. Unique or notable design features

${customerMessage ? `\nThe customer says: "${customerMessage}"\nNote what the customer wants to keep and what they want to change.` : ''}

Provide a comprehensive but concise description that could be used to recreate or modify this design.`
                            }
                        ]
                    }],
                    generationConfig: {
                        temperature: 0.3,
                        maxOutputTokens: 2048
                    }
                })
            }
        );

        if (!geminiRes.ok) {
            const errText = await geminiRes.text();
            console.error('Gemini Vision error:', errText);
            return res.status(502).json({ error: 'Could not analyze the reference image. Please try again.' });
        }

        const data = await geminiRes.json();
        const analysis = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!analysis) {
            return res.status(502).json({ error: 'Could not extract design details from the image.' });
        }

        return res.status(200).json({ analysis });

    } catch (err) {
        console.error('Reference analysis error:', err);
        return res.status(500).json({ error: 'Reference image analysis failed. Please try again.' });
    }
}
