// ============================================
// AI JEWELLERY DESIGNER — Client Logic
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    // ---- State ----
    let conversationHistory = [];
    let designVersions = []; // { version, image, designData, manufacturability, prompt, timestamp }
    let currentVersion = 0;
    let currentDesignData = {};
    let referenceAnalysis = null;
    let referenceImageBase64 = null;
    let isProcessing = false;

    // ---- DOM Elements ----
    const chatMessages = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput');
    const chatSendBtn = document.getElementById('chatSendBtn');
    const versionStrip = document.getElementById('versionStrip');
    const versionItems = document.getElementById('versionItems');
    const designPreview = document.getElementById('designPreview');
    const mfgBadge = document.getElementById('mfgBadge');
    const mfgDetailsPanel = document.getElementById('mfgDetailsPanel');

    // ---- Mobile Menu ----
    const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
    const navLinks = document.querySelector('.nav-links');
    const navLinksItems = document.querySelectorAll('.nav-links li');
    if (mobileMenuBtn && navLinks) {
        mobileMenuBtn.addEventListener('click', () => {
            navLinks.classList.toggle('nav-active');
            navLinksItems.forEach((link, index) => {
                if (link.style.animation) {
                    link.style.animation = '';
                } else {
                    link.style.animation = `navLinkFade 0.5s ease forwards ${index / 7 + 0.3}s`;
                }
            });
            mobileMenuBtn.classList.toggle('toggle');
        });
        navLinksItems.forEach(link => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('nav-active');
                navLinksItems.forEach(l => { l.style.animation = ''; });
            });
        });
    }

    // ---- Chat Input Handling ----
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    chatInput.addEventListener('input', () => {
        chatInput.style.height = 'auto';
        chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
    });

    chatSendBtn.addEventListener('click', sendMessage);

    // ---- Suggestion Chips ----
    document.querySelectorAll('.suggestion-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            chatInput.value = chip.textContent;
            sendMessage();
        });
    });

    // ---- Send Message ----
    async function sendMessage() {
        const message = chatInput.value.trim();
        if (!message || isProcessing) return;

        isProcessing = true;
        chatSendBtn.disabled = true;

        // Remove welcome message if present
        const welcome = chatMessages.querySelector('.welcome-message');
        if (welcome) welcome.remove();

        // Add user message to UI
        addMessageToUI('user', message);
        chatInput.value = '';
        chatInput.style.height = 'auto';

        // Add to conversation history
        conversationHistory.push({ role: 'user', content: message });

        // Show typing indicator
        const typingEl = showTypingIndicator('Understanding your design...');

        try {
            // Step 1: Send to AI chat
            const chatResponse = await callChatAPI(message);

            if (!chatResponse) {
                removeTypingIndicator(typingEl);
                addMessageToUI('ai', 'I apologize, but I encountered an issue. Please try again.');
                isProcessing = false;
                chatSendBtn.disabled = false;
                return;
            }

            // Handle version go-back
            if (chatResponse.versionGoBack && chatResponse.versionGoBack > 0) {
                const targetVersion = chatResponse.versionGoBack;
                if (targetVersion <= designVersions.length) {
                    currentVersion = targetVersion;
                    const versionData = designVersions[targetVersion - 1];
                    currentDesignData = versionData.designData || {};
                    showDesignImage(versionData.image);
                    updateVersionStrip();
                    if (versionData.manufacturability) {
                        showManufacturability(versionData.manufacturability);
                    }
                }
            }

            // Add AI response to UI
            removeTypingIndicator(typingEl);
            addMessageToUI('ai', chatResponse.response);

            // Add to conversation history
            conversationHistory.push({ role: 'model', content: JSON.stringify(chatResponse) });

            // Update design data
            if (chatResponse.designData) {
                currentDesignData = { ...currentDesignData, ...chatResponse.designData };
                // Remove empty/null values
                Object.keys(currentDesignData).forEach(key => {
                    if (!currentDesignData[key] || currentDesignData[key] === '' || currentDesignData[key] === 'null') {
                        delete currentDesignData[key];
                    }
                });
            }

            // Step 2: Generate image if needed
            if (chatResponse.shouldGenerateImage && chatResponse.imagePrompt) {
                const imgTypingEl = showTypingIndicator('Creating your jewellery concept...');

                const imageResult = await callImageAPI(chatResponse.imagePrompt);

                removeTypingIndicator(imgTypingEl);

                if (imageResult && imageResult.image) {
                    const imageDataUrl = `data:image/png;base64,${imageResult.image}`;

                    // Create new version
                    const newVersion = {
                        version: designVersions.length + 1,
                        image: imageDataUrl,
                        designData: { ...currentDesignData },
                        manufacturability: chatResponse.manufacturability || null,
                        prompt: chatResponse.imagePrompt,
                        timestamp: new Date().toISOString()
                    };
                    designVersions.push(newVersion);
                    currentVersion = newVersion.version;

                    // Show image
                    showDesignImage(imageDataUrl);
                    updateVersionStrip();

                    // Show manufacturability
                    if (chatResponse.manufacturability) {
                        showManufacturability(chatResponse.manufacturability);
                        // If there are issues, add a message
                        if (chatResponse.manufacturability.status === 'MANUFACTURABLE_WITH_MODIFICATIONS' ||
                            chatResponse.manufacturability.status === 'MAJOR_ISSUES') {
                            // Manufacturability info is shown via the badge, no extra message needed
                        }
                    }

                    // Save to localStorage
                    saveDesignSession();
                } else {
                    addMessageToUI('ai', 'I processed your design but the image generation is temporarily unavailable. You can try clicking "Regenerate" or describe your design again.');
                }
            } else if (chatResponse.manufacturability && designVersions.length > 0) {
                // Update manufacturability for current version
                designVersions[currentVersion - 1].manufacturability = chatResponse.manufacturability;
                showManufacturability(chatResponse.manufacturability);
            }

        } catch (err) {
            console.error('Message processing error:', err);
            removeTypingIndicator(typingEl);
            addMessageToUI('ai', 'I\'m sorry, something went wrong. Please check your connection and try again.');
        }

        isProcessing = false;
        chatSendBtn.disabled = false;
        chatInput.focus();
    }

    // ---- API Calls ----
    async function callChatAPI(message) {
        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message,
                    conversationHistory: conversationHistory.slice(-20), // Keep last 20 messages
                    currentDesign: currentDesignData,
                    referenceAnalysis
                })
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                console.error('Chat API error:', err);
                return null;
            }

            return await res.json();
        } catch (err) {
            console.error('Chat API fetch error:', err);
            return null;
        }
    }

    async function callImageAPI(prompt) {
        try {
            const body = { prompt };
            if (referenceImageBase64) {
                body.referenceImageBase64 = referenceImageBase64;
            }

            const res = await fetch('/api/generate-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                console.error('Image API error:', err);
                return null;
            }

            return await res.json();
        } catch (err) {
            console.error('Image API fetch error:', err);
            return null;
        }
    }

    async function callAnalyzeReferenceAPI(imageBase64, customerMessage) {
        try {
            const res = await fetch('/api/analyze-reference', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageBase64, customerMessage })
            });

            if (!res.ok) return null;
            return await res.json();
        } catch (err) {
            console.error('Reference analysis error:', err);
            return null;
        }
    }

    // ---- UI Functions ----
    function addMessageToUI(role, text) {
        const msgEl = document.createElement('div');
        msgEl.className = `chat-message ${role}`;

        const avatarIcon = role === 'ai' ? '<i class="fas fa-gem"></i>' : '<i class="fas fa-user"></i>';

        msgEl.innerHTML = `
            <div class="msg-avatar">${avatarIcon}</div>
            <div class="msg-content">
                <div class="msg-bubble">${formatMessage(text)}</div>
            </div>
        `;

        chatMessages.appendChild(msgEl);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function formatMessage(text) {
        if (!text) return '';
        // Basic markdown-like formatting
        return text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n/g, '<br>');
    }

    function showTypingIndicator(statusText) {
        const el = document.createElement('div');
        el.className = 'typing-indicator';
        el.innerHTML = `
            <div class="msg-avatar" style="background: linear-gradient(135deg, rgba(230, 198, 135, 0.2), rgba(230, 198, 135, 0.05)); border: 1px solid rgba(230, 198, 135, 0.3); color: var(--primary-color);"><i class="fas fa-gem"></i></div>
            <div>
                <div class="typing-dots"><span></span><span></span><span></span></div>
                <div class="typing-status">${statusText}</div>
            </div>
        `;
        chatMessages.appendChild(el);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return el;
    }

    function removeTypingIndicator(el) {
        if (el && el.parentNode) {
            el.parentNode.removeChild(el);
        }
    }

    function showDesignImage(imageDataUrl) {
        designPreview.innerHTML = `
            <div class="design-image-container">
                <img src="${imageDataUrl}" alt="Generated jewellery design" class="design-image" id="currentDesignImage">
            </div>
        `;

        // Add click to zoom
        const img = document.getElementById('currentDesignImage');
        img.addEventListener('click', () => {
            const modal = document.createElement('div');
            modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.95);z-index:5000;display:flex;align-items:center;justify-content:center;cursor:pointer;';
            modal.innerHTML = `<img src="${imageDataUrl}" style="max-width:95%;max-height:95%;object-fit:contain;border-radius:8px;">`;
            modal.addEventListener('click', () => modal.remove());
            document.body.appendChild(modal);
        });
    }

    function updateVersionStrip() {
        if (designVersions.length === 0) {
            versionStrip.classList.remove('has-versions');
            return;
        }

        versionStrip.classList.add('has-versions');
        versionItems.innerHTML = '';

        designVersions.forEach((ver) => {
            const item = document.createElement('div');
            item.className = `version-item ${ver.version === currentVersion ? 'active' : ''}`;
            item.innerHTML = `
                <img src="${ver.image}" alt="Version ${ver.version}">
                <span class="version-number">V${ver.version}</span>
            `;
            item.addEventListener('click', () => {
                currentVersion = ver.version;
                currentDesignData = ver.designData || {};
                showDesignImage(ver.image);
                updateVersionStrip();
                if (ver.manufacturability) {
                    showManufacturability(ver.manufacturability);
                } else {
                    mfgBadge.classList.remove('visible');
                    mfgDetailsPanel.classList.remove('visible');
                }
            });
            versionItems.appendChild(item);
        });

        // Scroll to latest
        versionItems.scrollLeft = versionItems.scrollWidth;
    }

    function showManufacturability(mfg) {
        if (!mfg || !mfg.status) {
            mfgBadge.classList.remove('visible');
            return;
        }

        mfgBadge.classList.add('visible');
        mfgBadge.classList.remove('status-ok', 'status-warning', 'status-error', 'status-info');

        let icon, text, statusClass;
        switch (mfg.status) {
            case 'LIKELY_MANUFACTURABLE':
                icon = '✅'; text = 'Likely Manufacturable'; statusClass = 'status-ok';
                break;
            case 'MANUFACTURABLE_WITH_MODIFICATIONS':
                icon = '⚠️'; text = 'Needs Modifications'; statusClass = 'status-warning';
                break;
            case 'MAJOR_ISSUES':
                icon = '❌'; text = 'Major Issues'; statusClass = 'status-error';
                break;
            case 'PROFESSIONAL_VALIDATION_REQUIRED':
                icon = '🔍'; text = 'Professional Review Needed'; statusClass = 'status-info';
                break;
            default:
                icon = '🔍'; text = 'Assessment Available'; statusClass = 'status-info';
        }

        mfgBadge.className = `mfg-badge visible ${statusClass}`;
        mfgBadge.innerHTML = `<span>${icon}</span> ${text}`;

        // Update details panel content
        updateMfgDetailsPanel(mfg);
    }

    function updateMfgDetailsPanel(mfg) {
        const content = document.getElementById('mfgDetailsContent');
        let html = '';

        if (mfg.problems) {
            const problems = mfg.problems.split(',').map(p => p.trim()).filter(p => p);
            if (problems.length > 0) {
                html += `<div class="mfg-section-label">Problems Detected</div>
                         <ul class="mfg-problem-list">${problems.map(p => `<li>${p}</li>`).join('')}</ul>`;
            }
        }

        if (mfg.recommendations) {
            const recs = mfg.recommendations.split(',').map(r => r.trim()).filter(r => r);
            if (recs.length > 0) {
                html += `<div class="mfg-section-label">Recommended Changes</div>
                         <ul class="mfg-recommendation-list">${recs.map(r => `<li>${r}</li>`).join('')}</ul>`;
            }
        }

        if (mfg.details) {
            html += `<div class="mfg-details-text">${mfg.details}</div>`;
        }

        if (mfg.status === 'MANUFACTURABLE_WITH_MODIFICATIONS' || mfg.status === 'MAJOR_ISSUES') {
            html += `<button class="mfg-generate-practical" onclick="window.aiDesigner.generatePracticalVersion()">
                        <i class="fas fa-magic"></i> Generate Practical Version
                     </button>`;
        }

        content.innerHTML = html || '<p style="color:var(--text-light);font-size:0.85rem;">No detailed assessment available for this version.</p>';
    }

    // ---- Manufacturability Badge Click ----
    mfgBadge.addEventListener('click', () => {
        mfgDetailsPanel.classList.toggle('visible');
    });

    document.getElementById('mfgDetailsClose').addEventListener('click', () => {
        mfgDetailsPanel.classList.remove('visible');
    });

    // ---- Canvas Actions ----
    document.getElementById('btnRegenerate').addEventListener('click', () => {
        if (!currentDesignData || Object.keys(currentDesignData).length === 0 || isProcessing) return;
        chatInput.value = 'Regenerate the current design with a slightly different artistic interpretation.';
        sendMessage();
    });

    document.getElementById('btnDownload').addEventListener('click', () => {
        if (designVersions.length === 0) return;
        const current = designVersions[currentVersion - 1];
        if (!current) return;

        const link = document.createElement('a');
        link.download = `sriram-jewellery-design-v${current.version}.png`;
        link.href = current.image;
        link.click();
    });

    document.getElementById('btnFinalize').addEventListener('click', () => {
        if (designVersions.length === 0) return;
        openFinalizeOverlay();
    });

    // ---- Reference Image Upload ----
    const refOverlay = document.getElementById('referenceUploadOverlay');
    const refDropZone = document.getElementById('referenceDropZone');
    const refFileInput = document.getElementById('referenceFileInput');
    const refPreviewImg = document.getElementById('referencePreviewImg');
    let pendingReferenceFile = null;

    document.getElementById('btnUploadRef').addEventListener('click', () => {
        refOverlay.classList.add('visible');
    });

    document.getElementById('btnUploadRef2').addEventListener('click', () => {
        refOverlay.classList.add('visible');
    });

    document.getElementById('referenceUploadClose').addEventListener('click', () => {
        refOverlay.classList.remove('visible');
        resetReferenceUpload();
    });

    refDropZone.addEventListener('click', () => refFileInput.click());

    refDropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        refDropZone.classList.add('dragover');
    });

    refDropZone.addEventListener('dragleave', () => {
        refDropZone.classList.remove('dragover');
    });

    refDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        refDropZone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            handleReferenceFile(file);
        }
    });

    refFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) handleReferenceFile(file);
    });

    function handleReferenceFile(file) {
        // Check file size (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
            alert('Image is too large. Please use an image under 10MB.');
            return;
        }

        pendingReferenceFile = file;
        const reader = new FileReader();
        reader.onload = (e) => {
            refPreviewImg.src = e.target.result;
            refPreviewImg.style.display = 'block';
            refDropZone.querySelector('.drop-text').textContent = file.name;
            refDropZone.querySelector('.drop-subtext').textContent = 'Click to choose a different image';
        };
        reader.readAsDataURL(file);
    }

    document.getElementById('referenceUseBtn').addEventListener('click', async () => {
        if (!pendingReferenceFile) {
            alert('Please select an image first.');
            return;
        }

        refOverlay.classList.remove('visible');

        // Convert to base64
        const reader = new FileReader();
        reader.onload = async (e) => {
            const base64 = e.target.result.split(',')[1];
            referenceImageBase64 = base64;

            // Add reference preview to chat
            const refMsg = document.createElement('div');
            refMsg.className = 'chat-message user';
            refMsg.innerHTML = `
                <div class="msg-avatar"><i class="fas fa-user"></i></div>
                <div class="msg-content">
                    <div class="msg-bubble">📎 Reference image uploaded</div>
                    <div class="msg-reference-preview"><img src="${e.target.result}" alt="Reference"></div>
                </div>
            `;
            // Remove welcome if present
            const welcome = chatMessages.querySelector('.welcome-message');
            if (welcome) welcome.remove();
            chatMessages.appendChild(refMsg);
            chatMessages.scrollTop = chatMessages.scrollHeight;

            // Analyze reference
            const typingEl = showTypingIndicator('Analyzing your reference image...');

            const analysis = await callAnalyzeReferenceAPI(base64, '');
            removeTypingIndicator(typingEl);

            if (analysis && analysis.analysis) {
                referenceAnalysis = analysis.analysis;
                addMessageToUI('ai', `I've analyzed your reference image. Here's what I see:\n\n${analysis.analysis}\n\nWhat would you like to change or keep from this design? Describe your vision!`);
                conversationHistory.push({ role: 'model', content: `Reference image analyzed: ${analysis.analysis}` });
            } else {
                addMessageToUI('ai', 'I had trouble analyzing the image, but I can still use it as visual reference. Please describe what you\'d like — mention what to keep and what to change.');
            }

            resetReferenceUpload();
        };
        reader.readAsDataURL(pendingReferenceFile);
    });

    function resetReferenceUpload() {
        pendingReferenceFile = null;
        refPreviewImg.style.display = 'none';
        refPreviewImg.src = '';
        refFileInput.value = '';
        refDropZone.querySelector('.drop-text').textContent = 'Drop reference image here or click to browse';
        refDropZone.querySelector('.drop-subtext').textContent = 'JPG, PNG up to 10MB';
    }

    // ---- Finalize Design ----
    function openFinalizeOverlay() {
        const overlay = document.getElementById('finalizeOverlay');
        const current = designVersions[currentVersion - 1];
        if (!current) return;

        document.getElementById('finalizeImage').src = current.image;
        document.getElementById('finalizeVersion').textContent = `Version ${current.version} of ${designVersions.length}`;
        document.getElementById('finalizeType').textContent = current.designData?.jewelleryType || 'Custom Design';
        document.getElementById('finalizeMaterial').textContent = current.designData?.material || current.designData?.metalColour || 'Not specified';
        document.getElementById('finalizeGemstones').textContent = current.designData?.gemstones || 'None specified';
        document.getElementById('finalizeStyle').textContent = current.designData?.style || 'Custom';

        // Build description
        const descParts = [];
        if (current.designData?.shape) descParts.push(`Shape: ${current.designData.shape}`);
        if (current.designData?.pattern) descParts.push(`Pattern: ${current.designData.pattern}`);
        if (current.designData?.settingStyle) descParts.push(`Setting: ${current.designData.settingStyle}`);
        if (current.designData?.decorativeElements) descParts.push(`Details: ${current.designData.decorativeElements}`);
        document.getElementById('finalizeDescription').textContent = descParts.join(' • ') || 'See conversation for full design details.';

        // Manufacturability
        const mfgEl = document.getElementById('finalizeMfgStatus');
        if (current.manufacturability) {
            const mfg = current.manufacturability;
            let statusText, statusColor;
            switch (mfg.status) {
                case 'LIKELY_MANUFACTURABLE':
                    statusText = '✅ Likely Manufacturable'; statusColor = 'rgba(40,167,69,0.15)'; break;
                case 'MANUFACTURABLE_WITH_MODIFICATIONS':
                    statusText = '⚠️ Manufacturable with Modifications'; statusColor = 'rgba(255,193,7,0.15)'; break;
                case 'MAJOR_ISSUES':
                    statusText = '❌ Major Manufacturing Issues'; statusColor = 'rgba(220,53,69,0.15)'; break;
                default:
                    statusText = '🔍 Professional Validation Required'; statusColor = 'rgba(23,162,184,0.15)'; break;
            }
            mfgEl.style.background = statusColor;
            mfgEl.textContent = statusText;
        } else {
            mfgEl.style.background = 'rgba(23,162,184,0.15)';
            mfgEl.textContent = '🔍 Professional Validation Recommended';
        }

        overlay.classList.add('visible');
    }

    document.getElementById('finalizeClose').addEventListener('click', () => {
        document.getElementById('finalizeOverlay').classList.remove('visible');
    });

    document.getElementById('finalizeDownload').addEventListener('click', () => {
        const current = designVersions[currentVersion - 1];
        if (!current) return;
        const link = document.createElement('a');
        link.download = `sriram-jewellery-final-design.png`;
        link.href = current.image;
        link.click();
    });

    document.getElementById('finalizeWhatsApp').addEventListener('click', () => {
        const current = designVersions[currentVersion - 1];
        if (!current) return;
        const type = current.designData?.jewelleryType || 'Custom Jewellery';
        const material = current.designData?.material || '';
        const msg = encodeURIComponent(
            `Hello Sriram Jewellery! 🙏\n\nI've designed a custom ${type} using your AI Jewellery Designer.\n\n` +
            `Design Details:\n- Type: ${type}\n- Material: ${material}\n- Version: ${current.version}\n\n` +
            `I'd like to discuss manufacturing this design. Can we schedule a consultation?\n\n` +
            `(I'll share the design image in the next message)`
        );
        window.open(`https://wa.me/919865495611?text=${msg}`, '_blank');
    });

    document.getElementById('finalizeSendExpert').addEventListener('click', () => {
        document.getElementById('finalizeOverlay').classList.remove('visible');
        openExpertForm();
    });

    // ---- Expert Form ----
    function openExpertForm() {
        document.getElementById('expertFormOverlay').classList.add('visible');
    }

    document.getElementById('expertFormClose').addEventListener('click', () => {
        document.getElementById('expertFormOverlay').classList.remove('visible');
    });

    document.getElementById('expertForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('expertName').value;
        const phone = document.getElementById('expertPhone').value;
        const email = document.getElementById('expertEmail').value;
        const notes = document.getElementById('expertNotes').value;
        const current = designVersions[currentVersion - 1];

        // Build WhatsApp message with all details
        const type = current?.designData?.jewelleryType || 'Custom Design';
        const material = current?.designData?.material || 'Not specified';
        const gemstones = current?.designData?.gemstones || 'Not specified';
        const mfgStatus = current?.manufacturability?.status || 'Not assessed';

        const msg = encodeURIComponent(
            `🔔 AI JEWELLERY DESIGN SUBMISSION\n\n` +
            `Customer: ${name}\n` +
            `Phone: ${phone}\n` +
            `Email: ${email || 'Not provided'}\n\n` +
            `DESIGN DETAILS:\n` +
            `Type: ${type}\n` +
            `Material: ${material}\n` +
            `Gemstones: ${gemstones}\n` +
            `Versions Created: ${designVersions.length}\n` +
            `AI Manufacturability: ${mfgStatus}\n\n` +
            `${notes ? `Customer Notes: ${notes}\n\n` : ''}` +
            `This design was created using the AI Jewellery Designer.\n` +
            `⚠️ Professional CAD validation is required before manufacturing.`
        );
        window.open(`https://wa.me/919865495611?text=${msg}`, '_blank');

        document.getElementById('expertFormOverlay').classList.remove('visible');
        addMessageToUI('ai', `Your design has been submitted! Sriram Jewellery will review your concept and contact you at ${phone} to discuss manufacturing details. 🙏`);
    });

    // ---- New Chat ----
    document.getElementById('chatNewBtn').addEventListener('click', () => {
        if (designVersions.length > 0 && !confirm('Start a new design? Your current conversation will be cleared.')) return;

        conversationHistory = [];
        designVersions = [];
        currentVersion = 0;
        currentDesignData = {};
        referenceAnalysis = null;
        referenceImageBase64 = null;

        chatMessages.innerHTML = getWelcomeHTML();
        designPreview.innerHTML = getEmptyPreviewHTML();
        versionStrip.classList.remove('has-versions');
        versionItems.innerHTML = '';
        mfgBadge.classList.remove('visible');
        mfgDetailsPanel.classList.remove('visible');

        // Re-attach suggestion chips
        document.querySelectorAll('.suggestion-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                chatInput.value = chip.textContent;
                sendMessage();
            });
        });

        localStorage.removeItem('sriram_ai_design_session');
    });

    // ---- Generate Practical Version (exposed globally) ----
    window.aiDesigner = {
        generatePracticalVersion: () => {
            mfgDetailsPanel.classList.remove('visible');
            chatInput.value = 'Generate a practical version of this design that addresses the manufacturing concerns while keeping the design as close to the original as possible.';
            sendMessage();
        }
    };

    // ---- Save/Load Session ----
    function saveDesignSession() {
        try {
            const session = {
                conversationHistory: conversationHistory.slice(-30),
                designVersions: designVersions.map(v => ({
                    ...v,
                    image: v.image.length > 500000 ? v.image.substring(0, 500000) : v.image // Limit stored image size
                })),
                currentVersion,
                currentDesignData,
                timestamp: Date.now()
            };
            localStorage.setItem('sriram_ai_design_session', JSON.stringify(session));
        } catch (e) {
            console.warn('Could not save design session:', e);
        }
    }

    function loadDesignSession() {
        try {
            const saved = localStorage.getItem('sriram_ai_design_session');
            if (!saved) return false;

            const session = JSON.parse(saved);
            // Only restore if session is less than 24 hours old
            if (Date.now() - session.timestamp > 24 * 60 * 60 * 1000) {
                localStorage.removeItem('sriram_ai_design_session');
                return false;
            }

            conversationHistory = session.conversationHistory || [];
            designVersions = session.designVersions || [];
            currentVersion = session.currentVersion || 0;
            currentDesignData = session.currentDesignData || {};

            if (designVersions.length > 0) {
                // Restore chat messages
                const welcome = chatMessages.querySelector('.welcome-message');
                if (welcome) welcome.remove();

                for (const msg of conversationHistory) {
                    if (msg.role === 'user') {
                        addMessageToUI('user', msg.content);
                    } else {
                        try {
                            const parsed = JSON.parse(msg.content);
                            if (parsed.response) addMessageToUI('ai', parsed.response);
                        } catch {
                            if (msg.content && !msg.content.startsWith('Reference image analyzed:')) {
                                addMessageToUI('ai', msg.content);
                            }
                        }
                    }
                }

                // Show latest design
                const current = designVersions[currentVersion - 1];
                if (current && current.image) {
                    showDesignImage(current.image);
                    if (current.manufacturability) {
                        showManufacturability(current.manufacturability);
                    }
                }
                updateVersionStrip();
                return true;
            }
            return false;
        } catch (e) {
            console.warn('Could not load design session:', e);
            return false;
        }
    }

    // ---- Helpers ----
    function getWelcomeHTML() {
        return `
            <div class="welcome-message">
                <div class="welcome-icon"><i class="fas fa-gem"></i></div>
                <h3>Welcome to AI Jewellery Designer</h3>
                <p>Describe any jewellery you imagine — I'll bring it to life with a realistic design concept and check if it can be manufactured.</p>
                <div class="suggestion-chips">
                    <button class="suggestion-chip">Gold pendant with lotus shape and emerald</button>
                    <button class="suggestion-chip">Diamond solitaire ring in platinum</button>
                    <button class="suggestion-chip">Traditional temple necklace in gold</button>
                    <button class="suggestion-chip">Modern rose gold earrings with rubies</button>
                </div>
            </div>
        `;
    }

    function getEmptyPreviewHTML() {
        return `
            <div class="design-preview-empty">
                <div class="empty-icon"><i class="fas fa-wand-magic-sparkles"></i></div>
                <h3>Your Design Will Appear Here</h3>
                <p>Describe your dream jewellery in the chat — the AI will generate a realistic concept image for you.</p>
            </div>
        `;
    }

    // ---- Header scroll ----
    const header = document.querySelector('header');
    if (header) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 50) {
                header.style.padding = '10px 0';
                header.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
            } else {
                header.style.padding = '15px 0';
                header.style.boxShadow = '0 2px 10px rgba(0,0,0,0.05)';
            }
        });
    }

    // ---- Initialize ----
    loadDesignSession();
});
