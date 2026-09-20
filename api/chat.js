export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
        return res.status(500).json({ error: 'AI service not configured. Please set the GEMINI_API_KEY environment variable.' });
    }

    try {
        const { message, conversationHistory, currentDesign, referenceAnalysis } = req.body;

        if (!message || typeof message !== 'string') {
            return res.status(400).json({ error: 'Message is required.' });
        }

        // Build the system prompt for the jewellery design AI
        const systemPrompt = buildSystemPrompt(currentDesign, referenceAnalysis);

        // Build conversation messages for Gemini
        const contents = buildConversationContents(systemPrompt, conversationHistory, message);

        // Call Gemini API
        const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents,
                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: 4096,
                        responseMimeType: 'application/json',
                        responseSchema: {
                            type: 'object',
                            properties: {
                                response: {
                                    type: 'string',
                                    description: 'Natural conversational response to the customer'
                                },
                                designData: {
                                    type: 'object',
                                    description: 'Structured jewellery design data extracted from the conversation',
                                    properties: {
                                        jewelleryType: { type: 'string' },
                                        shape: { type: 'string' },
                                        style: { type: 'string' },
                                        material: { type: 'string' },
                                        metalColour: { type: 'string' },
                                        gemstones: { type: 'string' },
                                        stoneShapes: { type: 'string' },
                                        stoneSizes: { type: 'string' },
                                        pattern: { type: 'string' },
                                        texture: { type: 'string' },
                                        engraving: { type: 'string' },
                                        dimensions: { type: 'string' },
                                        chainStructure: { type: 'string' },
                                        settingStyle: { type: 'string' },
                                        numberOfStones: { type: 'string' },
                                        decorativeElements: { type: 'string' },
                                        symmetry: { type: 'string' },
                                        functionalElements: { type: 'string' }
                                    }
                                },
                                imagePrompt: {
                                    type: 'string',
                                    description: 'Detailed prompt for generating a photorealistic jewellery product image'
                                },
                                shouldGenerateImage: {
                                    type: 'boolean',
                                    description: 'Whether a new image should be generated for this response'
                                },
                                isModification: {
                                    type: 'boolean',
                                    description: 'Whether this is a modification to an existing design vs a new design'
                                },
                                manufacturability: {
                                    type: 'object',
                                    description: 'Manufacturability assessment of the current design',
                                    properties: {
                                        status: {
                                            type: 'string',
                                            description: 'One of: LIKELY_MANUFACTURABLE, MANUFACTURABLE_WITH_MODIFICATIONS, MAJOR_ISSUES, PROFESSIONAL_VALIDATION_REQUIRED'
                                        },
                                        problems: {
                                            type: 'string',
                                            description: 'Comma-separated list of detected problems, if any'
                                        },
                                        recommendations: {
                                            type: 'string',
                                            description: 'Comma-separated list of recommended changes, if any'
                                        },
                                        details: {
                                            type: 'string',
                                            description: 'Detailed manufacturing analysis covering structural, stone-setting, dimensional, process and wearability aspects'
                                        }
                                    }
                                },
                                versionGoBack: {
                                    type: 'integer',
                                    description: 'If customer wants to go back to a specific version number, put that number here. Otherwise 0.'
                                }
                            },
                            required: ['response', 'shouldGenerateImage', 'isModification']
                        }
                    }
                })
            }
        );

        if (!geminiRes.ok) {
            const errData = await geminiRes.text();
            console.error('Gemini API error:', errData);
            return res.status(502).json({ error: 'AI service temporarily unavailable. Please try again.' });
        }

        const geminiData = await geminiRes.json();

        // Extract the response
        const candidate = geminiData.candidates?.[0];
        if (!candidate || !candidate.content?.parts?.[0]?.text) {
            return res.status(502).json({ error: 'AI returned an unexpected response. Please try again.' });
        }

        let parsed;
        try {
            parsed = JSON.parse(candidate.content.parts[0].text);
        } catch (e) {
            // If JSON parse fails, return raw text as response
            parsed = {
                response: candidate.content.parts[0].text,
                shouldGenerateImage: false,
                isModification: false
            };
        }

        return res.status(200).json(parsed);
    } catch (err) {
        console.error('Chat API error:', err);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
}

function buildSystemPrompt(currentDesign, referenceAnalysis) {
    let prompt = `You are a premium AI Jewellery Design Consultant for "Sriram Jewellery", a prestigious jewellery store in Ilayangudi, India. You help customers design custom jewellery through natural conversation.

YOUR ROLE:
- Understand what the customer wants through natural conversation
- Extract structured design information from their descriptions
- Create detailed image generation prompts for photorealistic jewellery product photography
- Assess manufacturability of each design
- Suggest practical modifications when needed
- Preserve ALL existing design elements unless the customer explicitly asks to change them

CONVERSATION STYLE:
- Warm, professional, and knowledgeable
- Use jewellery industry terminology naturally but explain when needed
- Be enthusiastic about creative designs
- Never force customers through questionnaires — let them describe freely
- Do NOT ask about budget or occasion unless the customer brings it up
- If the description is vague, ask gentle clarifying questions
- Respond in a conversational tone, not as a list of bullet points

IMAGE PROMPT GUIDELINES:
When generating imagePrompt, create a highly detailed prompt for photorealistic jewellery product photography:
- Specify: metal type and finish, stone types and colors, setting style, dimensions feel, surface finish
- Add: "professional jewellery product photography, white/gradient background, studio lighting, sharp focus, hyper-realistic, 4K quality, elegant presentation"
- Describe the exact visual details: reflections, sparkle, metal polish, stone clarity
- For modifications, describe the COMPLETE modified design, not just the changes

MANUFACTURABILITY ASSESSMENT:
After every design, assess manufacturability considering:

1. STRUCTURAL: thin sections, weak areas, unsupported components, fragile connections, weight distribution
2. STONE SETTING: prong feasibility, bezel feasibility, stone support, risk of looseness, compatibility
3. DIMENSIONS: ring shanks, prongs, bezels, chains, clasps, hooks, hinges, fine details
4. MANUFACTURING PROCESS: CAD feasibility, casting, 3D printing, hand fabrication, assembly, finishing
5. ASSEMBLY: physical assembly possibility, clearances, access for stone setters, polishing access
6. WEARABILITY: sharp edges, skin contact, clothing catching, weight comfort, safety

STATUS RULES:
- LIKELY_MANUFACTURABLE: Design appears practical and feasible
- MANUFACTURABLE_WITH_MODIFICATIONS: Feasible but some elements need adjustment — list problems and recommendations
- MAJOR_ISSUES: Serious structural/practical problems — explain clearly and propose alternatives
- PROFESSIONAL_VALIDATION_REQUIRED: Cannot reliably determine — recommend professional CAD/manufacturer review

IMPORTANT:
- Do NOT reject creative designs unnecessarily — unusual ≠ impossible
- If a design could be manufactured differently (e.g., multiple components assembled), say so
- Never claim "100% manufacturable" — always note this is a preliminary AI assessment
- Distinguish between: clearly feasible, potentially feasible with modifications, uncertain, apparently impractical

VERSION CONTROL:
- When customer says "go back to version X", set versionGoBack to that number
- When modifying a design, preserve ALL unchanged elements in the imagePrompt
- Track what changed between versions in your response`;

    if (currentDesign && Object.keys(currentDesign).length > 0) {
        prompt += `\n\nCURRENT DESIGN STATE (preserve these unless customer asks to change):
${JSON.stringify(currentDesign, null, 2)}`;
    }

    if (referenceAnalysis) {
        prompt += `\n\nREFERENCE IMAGE ANALYSIS (customer uploaded this as inspiration):
${referenceAnalysis}`;
    }

    return prompt;
}

function buildConversationContents(systemPrompt, conversationHistory, newMessage) {
    const contents = [];

    // System instruction as first user message
    contents.push({
        role: 'user',
        parts: [{ text: systemPrompt + '\n\nPlease acknowledge you understand your role and wait for the customer.' }]
    });
    contents.push({
        role: 'model',
        parts: [{ text: JSON.stringify({ response: "I understand. I'm ready to help design beautiful jewellery.", shouldGenerateImage: false, isModification: false }) }]
    });

    // Add conversation history
    if (conversationHistory && Array.isArray(conversationHistory)) {
        for (const msg of conversationHistory) {
            contents.push({
                role: msg.role === 'user' ? 'user' : 'model',
                parts: [{ text: msg.content }]
            });
        }
    }

    // Add the new message
    contents.push({
        role: 'user',
        parts: [{ text: newMessage }]
    });

    return contents;
}
