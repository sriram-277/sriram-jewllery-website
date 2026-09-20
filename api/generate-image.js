export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
        return res.status(500).json({ error: 'Image generation service not configured.' });
    }

    try {
        const { prompt, referenceImageBase64 } = req.body;

        if (!prompt || typeof prompt !== 'string') {
            return res.status(400).json({ error: 'Image prompt is required.' });
        }

        // Use Gemini's image generation via Imagen model
        const imagePrompt = `Generate a photorealistic jewellery product photograph with these specifications:

${prompt}

Photography requirements:
- Professional jewellery product photography style
- Clean white or subtle gradient background
- Professional studio lighting with soft reflections
- Ultra sharp focus on the jewellery piece
- Show realistic metal reflections and gemstone sparkle
- Hyper-realistic quality suitable for a luxury jewellery website
- Single piece of jewellery centered in frame
- No text, watermarks, or human models`;

        // Try Imagen 3 first for best quality image generation
        let imageData = null;
        let generationMethod = '';

        // Method: Use Gemini 2.0 Flash with image generation capability
        const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: referenceImageBase64 ? [
                            { 
                                inlineData: { 
                                    mimeType: 'image/jpeg',
                                    data: referenceImageBase64
                                }
                            },
                            { text: imagePrompt + "\n\nUse the provided reference image as inspiration for the design while incorporating the requested changes." }
                        ] : [
                            { text: imagePrompt }
                        ]
                    }],
                    generationConfig: {
                        responseModalities: ["TEXT", "IMAGE"],
                        temperature: 1,
                        maxOutputTokens: 8192
                    }
                })
            }
        );

        if (geminiRes.ok) {
            const data = await geminiRes.json();
            const parts = data.candidates?.[0]?.content?.parts;
            if (parts) {
                for (const part of parts) {
                    if (part.inlineData) {
                        imageData = part.inlineData.data;
                        generationMethod = 'gemini-2.0-flash-image';
                        break;
                    }
                }
            }
        }

        if (!imageData) {
            // Fallback: Try Imagen 3 via the Gemini API
            const imagenRes = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${GEMINI_API_KEY}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        instances: [{ prompt: imagePrompt }],
                        parameters: {
                            sampleCount: 1,
                            aspectRatio: '1:1',
                            safetyFilterLevel: 'BLOCK_ONLY_HIGH'
                        }
                    })
                }
            );

            if (imagenRes.ok) {
                const imagenData = await imagenRes.json();
                if (imagenData.predictions?.[0]?.bytesBase64Encoded) {
                    imageData = imagenData.predictions[0].bytesBase64Encoded;
                    generationMethod = 'imagen-3';
                }
            }
        }

        if (!imageData) {
            return res.status(502).json({ 
                error: 'Image generation is temporarily unavailable. The AI has processed your design — please try generating the image again.',
                retryable: true
            });
        }

        return res.status(200).json({
            image: imageData,
            method: generationMethod
        });

    } catch (err) {
        console.error('Image generation error:', err);
        return res.status(500).json({ error: 'Image generation failed. Please try again.' });
    }
}
