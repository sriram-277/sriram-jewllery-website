document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('addItemForm');
    const adminProductsList = document.getElementById('adminProductsList');
    
    // The same scriptURL used for live rates and leads
    const scriptURL = 'https://script.google.com/macros/s/AKfycbyE9dA5546s-TChdF-lNMuypGeDToUfLex35wgGD1dvIliADOX4IVRY7CIlAM1c-cXt/exec';

    // Cloudinary Credentials (USER MUST FILL THESE IN!)
    const CLOUDINARY_CLOUD_NAME = 'dg0gpggdn';
    const CLOUDINARY_UPLOAD_PRESET = 'sriram_preset';

    // Fetch products from Google Sheets
    const getProducts = async () => {
        try {
            const res = await fetch(`${scriptURL}?action=getProducts`);
            if (!res.ok) throw new Error("Failed to fetch products");
            return await res.json();
        } catch (err) {
            console.error("Google Sheets fetch failed:", err);
            return [];
        }
    };

    // Render admin table
    const renderAdminTable = async () => {
        adminProductsList.innerHTML = '<tr><td colspan="4" style="text-align:center;"><i class="fas fa-spinner fa-spin"></i> Loading Database...</td></tr>';
        
        const products = await getProducts();
        adminProductsList.innerHTML = '';

        if (products.length === 0) {
            adminProductsList.innerHTML = `
                <tr>
                    <td colspan="4" style="text-align: center; color: var(--text-light);">No items in inventory.</td>
                </tr>
            `;
            return;
        }

        // Sort products by ID descending (newest first)
        products.sort((a, b) => b.id - a.id).forEach(product => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><img src="${product.image}" alt="${product.title}"></td>
                <td style="font-weight: 600;">${product.title}</td>
                <td><span style="background: rgba(230, 198, 135, 0.1); color: var(--primary-color); border: 1px solid var(--primary-color); padding: 5px 10px; border-radius: 20px; font-size: 0.85rem; font-weight: bold;">${product.category}</span></td>
                <td>
                    <button class="btn btn-danger delete-btn" data-id="${product.id}">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </td>
            `;
            adminProductsList.appendChild(tr);
        });

        // Add event listeners to delete buttons
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                await deleteProduct(id);
            });
        });
    };

    // Add new product
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (CLOUDINARY_CLOUD_NAME === 'YOUR_CLOUD_NAME' || CLOUDINARY_UPLOAD_PRESET === 'YOUR_UPLOAD_PRESET') {
            alert("STOP! You must open admin.js and app.js and replace YOUR_CLOUD_NAME and YOUR_UPLOAD_PRESET with your real Cloudinary credentials first!");
            return;
        }

        const title = document.getElementById('itemTitle').value;
        const category = document.getElementById('itemCategory').value;
        const fileInput = document.getElementById('itemImage');
        const file = fileInput.files[0];
        
        if (!file) return;

        const submitBtn = form.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading Image...';
        submitBtn.disabled = true;

        try {
            // Step 1: Upload image to Cloudinary (Working perfectly)
            const formData = new FormData();
            formData.append('file', file);
            formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
            formData.append('tags', 'sriram_jewellery');
            
            const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            
            if (data.error) throw new Error(data.error.message);

            const imageUrl = data.secure_url;

            // Step 2: Save Title, Category, and Cloudinary URL to Google Sheets Database
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving to Database...';
            
            const dbRes = await fetch(scriptURL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `action=saveProduct&title=${encodeURIComponent(title)}&category=${encodeURIComponent(category)}&image=${encodeURIComponent(imageUrl)}`
            });
            
            if (!dbRes.ok) throw new Error("Failed to save to database");

            form.reset();
            await renderAdminTable();
            alert('Item securely saved to Google Sheets Database!');
        } catch (err) {
            console.error(err);
            alert('Upload failed: ' + err.message);
        } finally {
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    });

    // Delete product
    const deleteProduct = async (id) => {
        if (confirm('Are you sure you want to delete this item?')) {
            try {
                // Change cursor to indicate loading
                document.body.style.cursor = 'wait';
                
                const res = await fetch(scriptURL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: `action=deleteProduct&id=${encodeURIComponent(id)}`
                });
                
                if (!res.ok) throw new Error("Failed to delete product from database");
                
                await renderAdminTable();
            } catch (err) {
                console.error("Delete failed:", err);
                alert('Delete failed: ' + err.message);
            } finally {
                document.body.style.cursor = 'default';
            }
        }
    };

    // Initial render
    renderAdminTable();
});
