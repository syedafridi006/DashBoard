/* Dashify — clock, interface navigation, and personal settings. */
(() => {
    const $ = id => document.getElementById(id);
    const island = $('dynamicIsland');
    if (!island) return;

    const cards = [...document.querySelectorAll('.options-grid .option-card')];
    const panels = [...document.querySelectorAll('.inner-component-area')];
    const defaults = { use24Hour: false, showSeconds: false, dimWallpaper: false };
    let settings = { ...defaults };

    async function storageGet(key) {
        try {
            if (globalThis.chrome?.storage?.local) return (await chrome.storage.local.get(key))[key];
        } catch {}
        try { return JSON.parse(localStorage.getItem(key)); } catch { return undefined; }
    }
    async function storageSet(values) {
        try {
            if (globalThis.chrome?.storage?.local) { await chrome.storage.local.set(values); return; }
        } catch {}
        for (const [key, value] of Object.entries(values)) {
            try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
        }
    }

    function updateClock() {
        const now = new Date();
        const timeOptions = { hour: 'numeric', minute: '2-digit', hour12: !settings.use24Hour };
        if (settings.showSeconds) timeOptions.second = '2-digit';
        $('compactDay').textContent = new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(now);
        $('compactTime').textContent = new Intl.DateTimeFormat(undefined, timeOptions).format(now);
        $('compactDate').textContent = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(now);
        const preview = $('control-clock-preview');
        if (preview) preview.textContent = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: settings.showSeconds ? '2-digit' : undefined, hour12: !settings.use24Hour }).format(now);
    }

    function applySettings() {
        document.body.classList.toggle('dashify-dim', settings.dimWallpaper);
        $('setting-24hour').checked = settings.use24Hour;
        $('setting-seconds').checked = settings.showSeconds;
        $('setting-dim').checked = settings.dimWallpaper;
        updateClock();
    }

    async function saveSettings() { await storageSet({ dashifySettings: settings }); }

    function closeIsland() {
        island.classList.remove('expanded');
        cards.forEach(card => card.classList.remove('active'));
        panels.forEach(panel => panel.classList.remove('active'));
    }

    island.addEventListener('click', () => {
        if (!island.classList.contains('expanded')) island.classList.add('expanded');
    });
    document.addEventListener('click', event => {
        if (island.classList.contains('expanded') && !island.contains(event.target)) closeIsland();
    });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closeIsland(); });

    cards.forEach(card => card.addEventListener('click', event => {
        event.stopPropagation();
        const target = document.getElementById(`tab-${card.dataset.tab}`);
        if (!target) return;
        cards.forEach(item => item.classList.toggle('active', item === card));
        panels.forEach(panel => panel.classList.toggle('active', panel === target));
        if (card.dataset.tab === 'stats') window.DashifyStats?.refresh();
        if (card.dataset.tab === 'bookmarks') window.DashifyBookmarks?.render();
    }));

    const settingControls = [
        ['setting-24hour', 'use24Hour'],
        ['setting-seconds', 'showSeconds'],
        ['setting-dim', 'dimWallpaper']
    ];
    settingControls.forEach(([id, key]) => $(id)?.addEventListener('change', async event => {
        settings[key] = event.target.checked;
        applySettings();
        await saveSettings();
    }));
    $('reset-settings')?.addEventListener('click', async event => {
        event.stopPropagation();
        settings = { ...defaults };
        applySettings();
        await saveSettings();
    });

    // Bookmarks are stored locally in the extension profile.
    const bookmarkList = $('bookmark-list');
    async function getBookmarks() { return (await storageGet('dashifyBookmarks')) || []; }
    async function renderBookmarks() {
        if (!bookmarkList) return;
        const bookmarks = await getBookmarks();
        bookmarkList.replaceChildren();
        if (!bookmarks.length) {
            const empty = document.createElement('p');
            empty.className = 'empty-state';
            empty.textContent = 'No quick links yet. Add a name and website above.';
            bookmarkList.appendChild(empty);
            return;
        }
        bookmarks.forEach((bookmark, index) => {
            const item = document.createElement('div'); item.className = 'bookmark-item';
            const link = document.createElement('a'); link.className = 'bookmark-link';
            link.href = bookmark.url; link.rel = 'noopener noreferrer'; link.title = bookmark.url;
            const title = document.createElement('strong'); title.textContent = bookmark.name;
            const url = document.createElement('small');
            try { url.textContent = new URL(bookmark.url).hostname; } catch { url.textContent = bookmark.url; }
            link.append(title, url);
            const remove = document.createElement('button'); remove.className = 'bookmark-remove'; remove.type = 'button'; remove.textContent = '×';
            remove.setAttribute('aria-label', `Remove ${bookmark.name}`);
            remove.addEventListener('click', async event => {
                event.stopPropagation();
                const current = await getBookmarks(); current.splice(index, 1);
                await storageSet({ dashifyBookmarks: current }); renderBookmarks();
            });
            item.append(link, remove); bookmarkList.appendChild(item);
        });
    }
    $('bookmark-form')?.addEventListener('submit', async event => {
        event.preventDefault(); event.stopPropagation();
        const nameInput = $('bookmark-name'); const urlInput = $('bookmark-url');
        const name = nameInput.value.trim(); let url;
        try { url = new URL(urlInput.value.trim()); } catch { urlInput.setCustomValidity('Enter a valid website URL.'); urlInput.reportValidity(); return; }
        urlInput.setCustomValidity('');
        if (!['http:', 'https:'].includes(url.protocol)) { urlInput.setCustomValidity('Only HTTP and HTTPS links are supported.'); urlInput.reportValidity(); return; }
        const bookmarks = await getBookmarks();
        if (bookmarks.length >= 18) { alert('You can save up to 18 quick links. Remove one before adding another.'); return; }
        bookmarks.push({ name: name || url.hostname, url: url.href });
        await storageSet({ dashifyBookmarks: bookmarks });
        nameInput.value = ''; urlInput.value = ''; renderBookmarks();
    });
    window.DashifyBookmarks = { render: renderBookmarks };

    (async () => {
        settings = { ...defaults, ...((await storageGet('dashifySettings')) || {}) };
        applySettings();
        await renderBookmarks();
        setInterval(updateClock, 1000);
    })();
})();
