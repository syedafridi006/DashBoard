/* Dashify — persistent wallpaper presets and custom image uploads. */
(() => {
    const gallery = document.getElementById('wallpaper-gallery');
    const fileInput = document.getElementById('wallpaper-file-input');
    const uploadButton = document.getElementById('wallpaper-upload-trigger');
    if (!gallery || !fileInput || !uploadButton) return;

    const STORAGE_KEY = 'dashifyWallpaper';
    const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
    const presets = [...gallery.querySelectorAll('.wallpaper-thumb')].map((button, index) => ({
        button, index, url: parseCssUrl(button.style.getPropertyValue('--bg-img'))
    }));
    function parseCssUrl(value) { return value.trim().replace(/^url\(["']?/, '').replace(/["']?\)$/, ''); }
    async function storageGet() {
        try { return (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY] || null; } catch { return null; }
    }
    async function storageSet(value) { try { await chrome.storage.local.set({ [STORAGE_KEY]: value }); } catch {} }

    function select(button, url, persist = true, metadata = {}) {
        gallery.querySelectorAll('.wallpaper-thumb').forEach(item => item.classList.toggle('wallpaper-selected', item === button));
        document.body.style.backgroundImage = `url("${url.replaceAll('"', '%22')}")`;
        if (persist) storageSet({ url, ...metadata });
    }

    presets.forEach(({ button, url, index }) => {
        button.type = 'button';
        button.addEventListener('click', event => {
            event.stopPropagation(); select(button, url, true, { kind: 'preset', index });
        });
    });

    uploadButton.addEventListener('click', event => { event.stopPropagation(); fileInput.click(); });
    fileInput.addEventListener('change', () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) { alert('Choose an image file.'); fileInput.value = ''; return; }
        if (file.size > MAX_UPLOAD_BYTES) { alert('Please choose an image smaller than 4 MB so it can be saved reliably.'); fileInput.value = ''; return; }
        const reader = new FileReader();
        reader.addEventListener('load', () => {
            if (typeof reader.result !== 'string') return;
            let thumb = gallery.querySelector('[data-custom-wallpaper="true"]');
            if (!thumb) {
                thumb = document.createElement('button'); thumb.type = 'button';
                thumb.className = 'wallpaper-thumb'; thumb.dataset.customWallpaper = 'true';
                thumb.setAttribute('aria-label', 'Custom uploaded wallpaper');
                uploadButton.after(thumb);
            }
            thumb.style.setProperty('--bg-img', `url("${reader.result}")`);
            thumb.title = file.name;
            thumb.onclick = event => {
                event.stopPropagation(); select(thumb, reader.result, true, { kind: 'custom', name: file.name });
            };
            select(thumb, reader.result, true, { kind: 'custom', name: file.name });
            fileInput.value = '';
        }, { once: true });
        reader.addEventListener('error', () => { alert('Could not read that image.'); fileInput.value = ''; }, { once: true });
        reader.readAsDataURL(file);
    });

    (async () => {
        const saved = await storageGet();
        if (!saved) return;
        if (saved.kind === 'custom' && typeof saved.url === 'string' && saved.url.startsWith('data:image/')) {
            let thumb = gallery.querySelector('[data-custom-wallpaper="true"]');
            if (!thumb) {
                thumb = document.createElement('button'); thumb.type = 'button';
                thumb.className = 'wallpaper-thumb'; thumb.dataset.customWallpaper = 'true';
                thumb.setAttribute('aria-label', 'Custom uploaded wallpaper'); uploadButton.after(thumb);
            }
            thumb.style.setProperty('--bg-img', `url("${saved.url}")`);
            thumb.onclick = event => { event.stopPropagation(); select(thumb, saved.url, true, saved); };
            select(thumb, saved.url, false, saved);
        } else if (Number.isInteger(saved.index) && presets[saved.index]) {
            select(presets[saved.index].button, presets[saved.index].url, false, saved);
        }
    })();
})();
