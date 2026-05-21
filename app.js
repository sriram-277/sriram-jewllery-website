// Configuration
const FAST2SMS_API_KEY = 'YOUR_FAST2SMS_API_KEY'; // Sign up at fast2sms.com for free OTP SMS credits

// Default data (starts empty so the owner has full control to upload products via Admin)
const defaultProducts = [];

// Initialize or update local storage
let currentStorage = localStorage.getItem('sriram_products');
// Reset to empty if empty or if it contains our old demo items
if (!currentStorage || currentStorage.includes("Kundan Gold Necklace") || currentStorage.includes("Traditional Gold Bangles")) {
    localStorage.setItem('sriram_products', JSON.stringify([]));
} else {
    // Migration: Rename old 'Necklaces' or 'Malai' category and titles to 'Maalai' exactly once
    if (!localStorage.getItem('maalai_migrated')) {
        try {
            let products = JSON.parse(currentStorage) || [];
            let migrated = false;
            products = products.map(p => {
                if (p.category === 'Necklaces' || p.category === 'Malai') {
                    p.category = 'Maalai';
                    p.title = p.title.replace(/Necklace/gi, 'Maalai').replace(/Malai/gi, 'Maalai');
                    migrated = true;
                }
                return p;
            });
            if (migrated) {
                localStorage.setItem('sriram_products', JSON.stringify(products));
            }
            localStorage.setItem('maalai_migrated', 'true');
        } catch (e) {
            console.error("Migration failed", e);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const productsGrid = document.getElementById('productsGrid');
    const filterBtns = document.querySelectorAll('.filter-btn');
    const paginationControls = document.getElementById('paginationControls');
    
    let currentPage = 1;
    const itemsPerPage = 12;
    let currentCategory = 'Rings'; // Default category
    let allProducts = [];
    const waNumber = '919865495611'; // Parthiban's number with country code

    // Fetch live rates and update UI
    const fetchLiveRates = async () => {
        const rate24kEl = document.getElementById('rate-24k');
        const rate22kEl = document.getElementById('rate-22k');
        const rateSilverEl = document.getElementById('rate-silver');
        const timestampEl = document.getElementById('rates-timestamp');

        if (timestampEl) timestampEl.innerHTML = `Fetching live rates...`;

        // Exact fallback rates from GoodReturns Madurai (Tamil Nadu)
        const fallbackRates = {
            gold24k: 0,
            gold22k: 0,
            silver: 0
        };

        const updateUI = (gold24k, gold22k, silver) => {
            if (rate24kEl) rate24kEl.innerHTML = typeof gold24k === 'string' ? gold24k : `₹${gold24k.toLocaleString('en-IN')}`;
            if (rate22kEl) rate22kEl.innerHTML = typeof gold22k === 'string' ? gold22k : `₹${gold22k.toLocaleString('en-IN')}`;
            if (rateSilverEl) rateSilverEl.innerHTML = typeof silver === 'string' ? silver : `₹${silver.toLocaleString('en-IN')}`;
            if (timestampEl) {
                const now = new Date();
                const timeString = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
                const dateString = now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
                timestampEl.innerHTML = `Live Madurai Retail Rates as of ${dateString}, ${timeString}`;
            }
        };

        try {
            // We use your Google Apps Script to fetch the live rates securely
            // Replace this with your NEW Google Apps Script URL
            const scriptURL = 'https://script.google.com/macros/s/AKfycbyE9dA5546s-TChdF-lNMuypGeDToUfLex35wgGD1dvIliADOX4IVRY7CIlAM1c-cXt/exec';
            
            const res = await fetch(`${scriptURL}?action=rates`);
            
            if (!res.ok) throw new Error("Proxy fetch failed");
            
            const pbText = await res.text();
            
            const parseNumStr = (str) => {
                if (!str || typeof str !== 'string') return null;
                const matches = str.replace(/,/g, '').match(/[\d.]+/);
                return matches ? matches[0] : null;
            };

            const validateRate = (rateObj, fallback) => {
                if (!rateObj || typeof rateObj !== 'string' || !rateObj.match(/\d/)) return fallback;
                return rateObj;
            };

            // Extract from Priyanka Bullion text
            let pbGold22k = null;
            let pbGold24k = null;
            let pbSilver = null;
            if (pbText) {
                pbText.split('\n').forEach(line => {
                    if (line.includes('"GOLD MADURAI"')) {
                        const parts = line.split('\t');
                        if (parts.length > 4) pbGold22k = `₹${parseFloat(parts[4]).toLocaleString('en-IN')}`;
                    }
                    if (line.includes('"GOLD PURE FT"')) {
                        const parts = line.split('\t');
                        // "GOLD PURE FT" is typically quoted per 10 grams, so we divide by 10 for per gram rate
                        if (parts.length > 4) pbGold24k = `₹${Math.round(parseFloat(parts[4]) / 10).toLocaleString('en-IN')}`;
                    }
                    if (line.includes('"SILVER MADURAI"')) {
                        const parts = line.split('\t');
                        if (parts.length > 4) pbSilver = `₹${parseFloat(parts[4]).toLocaleString('en-IN')}`;
                    }
                });
            }

            const finalGold22k = validateRate(pbGold22k, fallbackRates.gold22k);
            const finalGold24k = validateRate(pbGold24k, fallbackRates.gold24k);
            const finalSilver = validateRate(pbSilver, fallbackRates.silver);

            updateUI(finalGold24k, finalGold22k, finalSilver);
            
            if (timestampEl && pbText && pbGold22k) {
                timestampEl.innerHTML += ` <span style="color:var(--gold-primary); font-size:0.8rem; display:block; margin-top:5px;">✓ Live verified with Local Market</span>`;
            }
        } catch (err) {
            console.error("Error fetching live rates, using fallback:", err);
            updateUI(fallbackRates.gold24k, fallbackRates.gold22k, fallbackRates.silver);
            if (timestampEl) timestampEl.innerHTML = `Rates shown are last known estimates (Network error).`;
        }
    };

    // Initialize rates and auto-refresh every 60s
    fetchLiveRates();
    setInterval(fetchLiveRates, 60000);

    // Mobile Menu Toggle
    const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
    const navLinks = document.querySelector('.nav-links');
    const navLinksItems = document.querySelectorAll('.nav-links li');

    if (mobileMenuBtn && navLinks) {
        mobileMenuBtn.addEventListener('click', () => {
            // Toggle Nav
            navLinks.classList.toggle('nav-active');
            
            // Animate Links
            navLinksItems.forEach((link, index) => {
                if (link.style.animation) {
                    link.style.animation = '';
                } else {
                    link.style.animation = `navLinkFade 0.5s ease forwards ${index / 7 + 0.3}s`;
                }
            });
            
            // Burger Animation
            mobileMenuBtn.classList.toggle('toggle');
        });

        // Close menu when a link is clicked
        navLinksItems.forEach(link => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('nav-active');
                navLinksItems.forEach(link => {
                    link.style.animation = '';
                });
            });
        });
    }

    // Zoom functionality
    let currentZoom = 1;
    const zoomStep = 0.2;
    const maxZoom = 3;
    const minZoom = 0.5;

    // Modal elements
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImage');
    const captionText = document.getElementById('caption');
    const closeModal = document.querySelector('.close-modal');

    const zoomInBtn = document.getElementById('zoomInBtn');
    const zoomOutBtn = document.getElementById('zoomOutBtn');
    const zoomResetBtn = document.getElementById('zoomResetBtn');

    const updateZoom = () => {
        if (modalImg) {
            modalImg.style.transform = `scale(${currentZoom})`;
        }
    };

    if (zoomInBtn) zoomInBtn.onclick = (e) => { e.stopPropagation(); if(currentZoom < maxZoom) { currentZoom += zoomStep; updateZoom(); } };
    if (zoomOutBtn) zoomOutBtn.onclick = (e) => { e.stopPropagation(); if(currentZoom > minZoom) { currentZoom -= zoomStep; updateZoom(); } };
    if (zoomResetBtn) zoomResetBtn.onclick = (e) => { e.stopPropagation(); currentZoom = 1; updateZoom(); };

    // Fetch products from Google Sheets (Replaces Cloudinary List API)
    const getProducts = async () => {
        try {
            // The same scriptURL used for live rates and leads
            const scriptURL = 'https://script.google.com/macros/s/AKfycbyE9dA5546s-TChdF-lNMuypGeDToUfLex35wgGD1dvIliADOX4IVRY7CIlAM1c-cXt/exec';
            
            const res = await fetch(`${scriptURL}?action=getProducts`);
            if (!res.ok) {
                throw new Error("Failed to fetch products from Google Sheets");
            }
            
            const data = await res.json();
            
            if (data && data.length > 0) {
                return data;
            } else {
                return JSON.parse(localStorage.getItem('sriram_products')) || [];
            }
        } catch (err) {
            console.error("Google Sheets fetch failed, falling back to LocalStorage:", err);
            return JSON.parse(localStorage.getItem('sriram_products')) || [];
        }
    };

    // Render products with pagination
    const renderProducts = async (category = currentCategory, page = 1) => {
        if (!productsGrid) return;
        currentCategory = category;
        currentPage = page;

        if (allProducts.length === 0) {
            productsGrid.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 40px 0;">
                    <i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: var(--primary-color); margin-bottom: 10px;"></i>
                    <p style="color: var(--text-light);">Loading collections...</p>
                </div>
            `;
            allProducts = await getProducts();
        }

        productsGrid.innerHTML = '';
        if (paginationControls) paginationControls.innerHTML = '';

        if (allProducts.length === 0) {
            productsGrid.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; background: var(--accent-color); border: 1px dashed rgba(230, 198, 135, 0.3); border-radius: 8px;">
                    <i class="fas fa-gem" style="font-size: 3rem; color: var(--primary-color); margin-bottom: 20px; display: block;"></i>
                    <h3 style="font-family: var(--font-heading); color: var(--text-main); margin-bottom: 10px; font-size: 1.5rem;">Collection is Empty</h3>
                    <p style="color: var(--text-light); max-width: 500px; margin: 0 auto 25px;">
                        No items have been added to the store yet. Please open the Admin Dashboard to upload beautiful jewellery designs.
                    </p>
                    <a href="admin.html" class="btn btn-outline" style="font-size: 0.8rem; padding: 10px 25px;">Go to Admin Panel</a>
                </div>
            `;
            return;
        }

        const filteredProducts = allProducts.filter(p => p.category.toLowerCase() === currentCategory.toLowerCase());
        
        if (filteredProducts.length === 0) {
            productsGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--text-light); padding: 40px 0;">No products found in this category.</p>';
            return;
        }

        // Pagination Logic
        const totalItems = filteredProducts.length;
        const totalPages = Math.ceil(totalItems / itemsPerPage);
        
        // Ensure currentPage is valid
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;

        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        
        const productsToShow = filteredProducts.sort((a, b) => b.id - a.id).slice(startIndex, endIndex);

        productsToShow.forEach(product => {
            const message = encodeURIComponent(`Hello, I'm interested in the ${product.title} from Sriram Jewellery. Can you provide more details?`);
            const waLink = `https://wa.me/${waNumber}?text=${message}`;

            let displayImage = product.image;
            if (displayImage.includes('res.cloudinary.com') && !displayImage.includes('l_text')) {
                const watermark = "l_text:Arial_50_bold:Sriram%20Jewellery,co_rgb:000000,o_70,g_south_east,x_20,y_20";
                displayImage = displayImage.replace('/image/upload/', `/image/upload/${watermark}/`);
            }

            const card = document.createElement('div');
            card.className = 'product-card';
            card.innerHTML = `
                <img src="${displayImage}" alt="${product.title}" class="product-image" data-title="${product.title}">
                <div class="product-info">
                    <div class="product-category">${product.category}</div>
                    <h3 class="product-title">${product.title}</h3>
                    <a href="${waLink}" target="_blank" class="wa-btn">
                        <i class="fab fa-whatsapp"></i> More Details
                    </a>
                </div>
            `;
            productsGrid.appendChild(card);
        });

        // Render Pagination Controls
        if (totalPages > 1 && paginationControls) {
            renderPaginationControls(totalPages);
        }

        // Re-attach modal listeners
        document.querySelectorAll('.product-image').forEach(img => {
            img.addEventListener('click', function() {
                modal.style.display = "block";
                modalImg.src = this.src;
                captionText.innerHTML = this.getAttribute('data-title');
                currentZoom = 1;
                updateZoom();
            });
        });
    };

    const renderPaginationControls = (totalPages) => {
        // Prev button
        const prevBtn = document.createElement('button');
        prevBtn.className = 'page-btn';
        prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
        prevBtn.disabled = currentPage === 1;
        prevBtn.onclick = () => renderProducts(currentCategory, currentPage - 1);
        paginationControls.appendChild(prevBtn);

        // Page buttons
        for (let i = 1; i <= totalPages; i++) {
            const btn = document.createElement('button');
            btn.className = `page-btn ${i === currentPage ? 'active' : ''}`;
            btn.textContent = i;
            btn.onclick = () => renderProducts(currentCategory, i);
            paginationControls.appendChild(btn);
        }

        // Next button
        const nextBtn = document.createElement('button');
        nextBtn.className = 'page-btn';
        nextBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
        nextBtn.disabled = currentPage === totalPages;
        nextBtn.onclick = () => renderProducts(currentCategory, currentPage + 1);
        paginationControls.appendChild(nextBtn);
    };

    // Modal close events
    closeModal.onclick = function() {
        modal.style.display = "none";
        currentZoom = 1;
        updateZoom();
    }

    modal.onclick = function(e) {
        if (e.target === modal || e.target.classList.contains('modal-image-container')) {
            modal.style.display = "none";
            currentZoom = 1;
            updateZoom();
        }
    }

    // Filter functionality
    if (filterBtns) {
        filterBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                filterBtns.forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                renderProducts(e.target.getAttribute('data-filter'), 1);
            });
        });
    }

    // Initial render
    renderProducts();

    // Header scroll effect
    const header = document.querySelector('header');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            header.style.padding = '10px 0';
            header.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
        } else {
            header.style.padding = '15px 0';
            header.style.boxShadow = '0 2px 10px rgba(0,0,0,0.05)';
        }
    });

    // Smooth scrolling for navigation links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                window.scrollTo({
                    top: targetElement.offsetTop - 80, // Offset for header
                    behavior: 'smooth'
                });
            }
        });
    });

    // Lead Generation Logic
    const leadForm = document.getElementById('leadForm');
    const sendOTPBtn = document.getElementById('sendOTPBtn');
    const initialFields = document.getElementById('initial-fields');
    const otpField = document.getElementById('otp-field');
    const formStatus = document.getElementById('formStatus');
    
    let generatedOTP = null;

    if (sendOTPBtn) {
        sendOTPBtn.addEventListener('click', () => {
            const name = document.getElementById('userName').value;
            const phone = document.getElementById('userPhone').value;

            if (!name || !phone) {
                alert("Please fill in your name and phone number first.");
                return;
            }

            // Generate 6-digit OTP
            generatedOTP = Math.floor(100000 + Math.random() * 900000).toString();
            console.log("OTP Generated:", generatedOTP);

            if (typeof FAST2SMS_API_KEY !== 'undefined' && FAST2SMS_API_KEY && FAST2SMS_API_KEY !== 'YOUR_FAST2SMS_API_KEY') {
                formStatus.innerHTML = "Sending OTP via SMS...";
                formStatus.className = "";

                // Send real SMS using Fast2SMS API
                const smsUrl = `https://www.fast2sms.com/dev/bulkV2?authorization=${FAST2SMS_API_KEY}&variables_values=${generatedOTP}&route=otp&numbers=${phone}`;

                fetch(smsUrl)
                    .then(response => response.json())
                    .then(data => {
                        if (data.return) {
                            formStatus.innerHTML = "OTP Sent successfully via SMS!";
                            formStatus.className = "success";
                            alert(`OTP sent successfully to your phone number ${phone}! Please enter it below.`);
                        } else {
                            console.error("Fast2SMS API Error:", data);
                            formStatus.innerHTML = "SMS service error. Fallback OTP shown.";
                            formStatus.className = "error";
                            alert(`Failed to send real SMS: ${data.message || 'Unknown error'}.\n\n[DEMO MODE FALLBACK] Your OTP is: ${generatedOTP}`);
                        }
                    })
                    .catch(err => {
                        console.error("SMS Delivery Network Error:", err);
                        formStatus.innerHTML = "SMS network error. Fallback OTP shown.";
                        formStatus.className = "error";
                        alert(`SMS failed to send due to a network error.\n\n[DEMO MODE FALLBACK] Your OTP is: ${generatedOTP}`);
                    });
            } else {
                // Simulated SMS
                alert(`[DEMO MODE] OTP for ${phone} is: ${generatedOTP}\n\n(To send real SMS to this phone number, please configure your Fast2SMS API Key at the very top of public/js/app.js)`);
            }

            initialFields.style.opacity = '0.5';
            initialFields.querySelectorAll('input').forEach(i => i.disabled = true);
            sendOTPBtn.disabled = true;
            otpField.style.display = 'block';
        });
    }

    if (leadForm) {
        leadForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const enteredOTP = document.getElementById('otpInput').value;

            if (enteredOTP === generatedOTP) {
                const name = document.getElementById('userName').value;
                const phone = document.getElementById('userPhone').value;

                formStatus.innerHTML = "Registering...";
                formStatus.className = "";

                // Google Apps Script Web App URL
                const scriptURL = 'https://script.google.com/macros/s/AKfycbyE9dA5546s-TChdF-lNMuypGeDToUfLex35wgGD1dvIliADOX4IVRY7CIlAM1c-cXt/exec';

                // Use Image() pixel technique — this creates EXACTLY ONE GET request.
                // Unlike fetch(), Image() never causes CORS issues, never duplicates,
                // and never triggers preflight or redirect chains.
                const img = new Image();
                const requestURL = `${scriptURL}?Name=${encodeURIComponent(name)}&Phone=${encodeURIComponent(phone)}`;

                img.onload = img.onerror = () => {
                    // Both onload and onerror mean the request was sent successfully.
                    // Google Apps Script returns HTML, which triggers onerror for Image,
                    // but the server-side script has already executed and written the row.
                    console.log("Registration Successful for:", { name, phone });
                    formStatus.innerHTML = "Registration Successful! We will contact you soon.";
                    formStatus.className = "success";
                    leadForm.reset();
                    otpField.style.display = 'none';
                    initialFields.style.opacity = '1';
                    initialFields.querySelectorAll('input').forEach(i => i.disabled = false);
                    sendOTPBtn.disabled = false;
                };

                // Setting src fires the request — exactly once, guaranteed
                img.src = requestURL;

            } else {
                formStatus.innerHTML = "Invalid OTP. Please try again.";
                formStatus.className = "error";
            }
        });
    }
});
