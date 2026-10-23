/* Dashify stats: website usage, real CPU/RAM readings, and network diagnostics. */
(() => {
    const $ = id => document.getElementById(id);
    const periodSelect = $('usage-period');
    if (!periodSelect) return;

    const DAY_MS = 24 * 60 * 60 * 1000;
    let previousCpuSample = null;
    let hardwareTimer = null;
    let networkTimer = null;
    let usageTimer = null;
    let speedTestRunning = false;

    // -------------------- Website usage --------------------
    function dayKey(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    function formatDuration(milliseconds) {
        const minutes = Math.floor(Math.max(0, milliseconds) / 60000);
        const hours = Math.floor(minutes / 60);
        return hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
    }

    function getRangeKeys(period) {
        const count = period === '30days' ? 30 : period === '7days' ? 7 : 1;
        const today = new Date();
        return Array.from({ length: count }, (_, index) => dayKey(new Date(today.getTime() - index * DAY_MS)));
    }

    async function readUsage() {
        if (typeof chrome === 'undefined' || !chrome.storage?.local) return {};
        try {
            const result = await chrome.storage.local.get('dashifySiteUsage');
            return result.dashifySiteUsage || {};
        } catch { return {}; }
    }

    function renderUsage(data) {
        const period = periodSelect.value;
        const totals = new Map();
        let visits = 0;
        getRangeKeys(period).forEach(key => {
            Object.entries(data[key] || {}).forEach(([domain, entry]) => {
                const previous = totals.get(domain) || { milliseconds: 0, visits: 0 };
                previous.milliseconds += Number(entry.milliseconds) || 0;
                previous.visits += Number(entry.visits) || 0;
                totals.set(domain, previous);
                visits += Number(entry.visits) || 0;
            });
        });

        const sites = [...totals.entries()].map(([domain, values]) => ({ domain, ...values }))
            .sort((a, b) => b.milliseconds - a.milliseconds);
        const totalTime = sites.reduce((sum, site) => sum + site.milliseconds, 0);
        $('usage-total-time').textContent = formatDuration(totalTime);
        $('usage-site-count').textContent = String(sites.length);
        $('usage-visits').textContent = String(visits);
        $('usage-top-site').textContent = sites[0]?.domain || '—';
        $('usage-average').textContent = formatDuration(sites.length ? totalTime / sites.length : 0);
        $('usage-period-caption').textContent = period === '30days' ? 'Last 30 days' : period === '7days' ? 'Last 7 days' : 'Today';

        const list = $('usage-sites-list');
        list.replaceChildren();
        if (!sites.length) {
            const empty = document.createElement('p');
            empty.className = 'stats-empty';
            empty.textContent = 'No activity recorded yet. Browse a few websites and check back.';
            list.appendChild(empty);
        } else {
            sites.slice(0, 6).forEach(site => {
                const row = document.createElement('div'); row.className = 'usage-site';
                const name = document.createElement('span'); name.className = 'usage-site-name';
                name.textContent = site.domain; name.title = site.domain;
                const time = document.createElement('span'); time.className = 'usage-site-time';
                time.textContent = formatDuration(site.milliseconds);
                const track = document.createElement('div'); track.className = 'usage-site-track';
                const fill = document.createElement('span'); fill.className = 'usage-site-fill';
                fill.style.width = `${totalTime ? Math.max(2, site.milliseconds / totalTime * 100) : 0}%`;
                track.appendChild(fill); row.append(name, time, track); list.appendChild(row);
            });
        }
        $('usage-status').textContent = sites.length
            ? `Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
            : 'No tracked activity for this period';
    }

    async function refreshUsage() {
        try { renderUsage(await readUsage()); }
        catch { setMetric('usage-status', 'Could not read saved usage data'); }
    }

    // -------------------- System hardware --------------------
    function setMetric(id, text) { const el = $(id); if (el) el.textContent = text; }
    function setFill(id, percent) {
        const el = $(id);
        if (el) el.style.width = `${Math.max(0, Math.min(100, Number(percent) || 0))}%`;
    }

    async function updateCpu() {
        const logicalCores = navigator.hardwareConcurrency;
        if (Number.isFinite(logicalCores) && logicalCores > 0) setMetric('hardware-cores', String(logicalCores));
        if (typeof chrome === 'undefined' || !chrome.system?.cpu?.getInfo) {
            setMetric('hardware-cpu', 'N/A');
            setFill('hardware-cpu-fill', 0);
            setMetric('hardware-cpu-name', 'System CPU load is not exposed by this browser');
            setMetric('hardware-architecture', 'Logical processor count only');
            return;
        }
        try {
            const info = await chrome.system.cpu.getInfo();
            setMetric('hardware-cpu-name', info.modelName || 'Processor');
            setMetric('hardware-cores', String(info.numOfProcessors ?? info.processors?.length ?? '—'));
            setMetric('hardware-architecture', info.archName ? `Architecture: ${info.archName}` : 'Logical processors');
            const current = (info.processors || []).map(p => p.usage || {});
            if (previousCpuSample && current.length === previousCpuSample.length) {
                let totalDelta = 0, busyDelta = 0;
                current.forEach((usage, i) => {
                    const prev = previousCpuSample[i];
                    const total = Number(usage.total) - Number(prev.total);
                    const busy = (Number(usage.user) - Number(prev.user)) + (Number(usage.kernel) - Number(prev.kernel));
                    if (total > 0 && Number.isFinite(busy)) { totalDelta += total; busyDelta += busy; }
                });
                if (totalDelta > 0) {
                    const load = Math.round(Math.max(0, Math.min(100, busyDelta / totalDelta * 100)));
                    setMetric('hardware-cpu', `${load}%`); setFill('hardware-cpu-fill', load);
                }
            } else {
                setMetric('hardware-cpu', '…');
                setMetric('hardware-cpu-name', `${info.modelName || 'CPU'} · sampling…`);
            }
            previousCpuSample = current;
        } catch {
            setMetric('hardware-cpu', 'N/A');
            setMetric('hardware-cpu-name', 'CPU readings blocked or unavailable');
        }
    }

    async function updateMemory() {
        if (typeof chrome === 'undefined' || !chrome.system?.memory?.getInfo) {
            setMetric('hardware-ram', 'N/A');
            setFill('hardware-ram-fill', 0);
            const estimate = Number(navigator.deviceMemory);
            setMetric('hardware-ram-detail', estimate > 0 ? `Live usage unavailable · browser estimate ${estimate} GB total` : 'Live system RAM is not exposed to this extension');
            return;
        }
        try {
            const info = await chrome.system.memory.getInfo();
            const total = Number(info.capacity);
            const available = Number(info.availableCapacity);
            if (!(total > 0) || !Number.isFinite(available)) throw new Error('Invalid memory values');
            const used = total - available;
            const percent = Math.round(used / total * 100);
            const gb = value => (value / 1073741824).toFixed(1);
            setMetric('hardware-ram', `${percent}%`);
            setMetric('hardware-ram-detail', `${gb(used)} / ${gb(total)} GB used`);
            setFill('hardware-ram-fill', percent);
        } catch {
            setMetric('hardware-ram', 'N/A'); setMetric('hardware-ram-detail', 'RAM readings unavailable');
        }
    }

    async function updateGpu() {
        const label = $('hardware-gpu');
        if (!label) return;
        // WebGL can sometimes reveal a renderer name, but browsers may deliberately mask it.
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (!gl) { label.textContent = 'GPU details blocked by browser'; return; }
            const debug = gl.getExtension('WEBGL_debug_renderer_info');
            const renderer = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
            label.textContent = renderer && renderer !== 'WebKit WebGL' ? `GPU: ${String(renderer).slice(0, 80)} · load unavailable` : 'GPU detected · model hidden; load unavailable';
            const lose = gl.getExtension('WEBGL_lose_context');
            lose?.loseContext();
        } catch {
            label.textContent = 'GPU details blocked by browser';
        }
    }

    async function updateHardware() { await Promise.all([updateCpu(), updateMemory(), updateGpu()]); }

    // -------------------- Network status --------------------
    function getConnection() { return navigator.connection || navigator.mozConnection || navigator.webkitConnection || null; }

    function updateNetwork() {
        const connection = getConnection();
        setMetric('network-online', navigator.onLine ? 'Browser online' : 'Browser offline');
        if (!navigator.onLine) $('network-online').style.color = '#ff9a9a';
        else $('network-online').style.color = '';
        if (connection) {
            setMetric('network-type', connection.type || connection.effectiveType || 'Connected');
            setMetric('network-downlink', Number.isFinite(connection.downlink) ? `${connection.downlink} Mbps` : 'N/A');
            setMetric('network-rtt', Number.isFinite(connection.rtt) ? `${connection.rtt} ms` : 'N/A');
        } else {
            setMetric('network-type', navigator.onLine ? 'Online' : 'Offline');
            setMetric('network-downlink', 'N/A'); setMetric('network-rtt', 'N/A');
        }
        const onlineLabel = $('network-online');
        if (onlineLabel) onlineLabel.title = navigator.onLine ? 'Browser connectivity signal; not a guarantee every site is reachable' : 'The browser reports no network connection';
    }

    async function timedFetch(url, options = {}) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        try { return await fetch(url, { ...options, cache: 'no-store', signal: controller.signal }); }
        finally { clearTimeout(timeout); }
    }

    async function runSpeedTest() {
        if (speedTestRunning) return;
        const button = $('network-speed-test');
        const status = $('network-test-status');
        const downloadLabel = $('network-measured');
        const uploadLabel = $('network-upload');
        speedTestRunning = true; button.disabled = true; button.textContent = 'Testing…';
        status.textContent = 'Measuring download…'; downloadLabel.textContent = 'Testing…'; uploadLabel.textContent = 'Upload: waiting';
        try {
            const bytesToDownload = 5 * 1024 * 1024;
            const downStart = performance.now();
            const downResponse = await timedFetch(`https://speed.cloudflare.com/__down?bytes=${bytesToDownload}&dashify=${Date.now()}`);
            if (!downResponse.ok) throw new Error(`Download test returned HTTP ${downResponse.status}`);
            const blob = await downResponse.blob();
            const downSeconds = Math.max((performance.now() - downStart) / 1000, 0.001);
            const downMbps = blob.size * 8 / downSeconds / 1_000_000;
            downloadLabel.textContent = `${downMbps.toFixed(1)} Mbps`;

            status.textContent = 'Measuring upload…';
            const uploadBytes = 1024 * 1024;
            const payload = new Uint8Array(uploadBytes);
            crypto.getRandomValues(payload.subarray(0, 65536));
            // Repeat the random seed over the buffer; no personal data is included.
            for (let i = 65536; i < payload.length; i += 65536) payload.set(payload.subarray(0, Math.min(65536, payload.length - i)), i);
            const upStart = performance.now();
            const upResponse = await timedFetch('https://speed.cloudflare.com/__up', {
                method: 'POST', body: payload, headers: { 'Content-Type': 'application/octet-stream' }
            });
            if (!upResponse.ok) throw new Error(`Upload test returned HTTP ${upResponse.status}`);
            await upResponse.arrayBuffer();
            const upSeconds = Math.max((performance.now() - upStart) / 1000, 0.001);
            const upMbps = uploadBytes * 8 / upSeconds / 1_000_000;
            uploadLabel.textContent = `Upload: ${upMbps.toFixed(1)} Mbps`;
            status.textContent = 'Test complete. Results vary with Wi-Fi, other traffic and server conditions.';
        } catch (error) {
            status.textContent = error?.name === 'AbortError'
                ? 'Test timed out. Check your connection and try again.'
                : 'Speed test unavailable (network, endpoint or browser policy blocked it).';
            if (downloadLabel.textContent === 'Testing…') downloadLabel.textContent = 'Failed';
            uploadLabel.textContent = 'Upload: unavailable';
        } finally {
            speedTestRunning = false; button.disabled = false; button.textContent = 'Run speed test';
        }
    }

    // -------------------- Startup / listeners --------------------
    periodSelect.addEventListener('change', refreshUsage);
    $('usage-refresh')?.addEventListener('click', async () => { await refreshUsage(); await updateHardware(); updateNetwork(); });
    $('network-speed-test')?.addEventListener('click', runSpeedTest);
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && changes.dashifySiteUsage) refreshUsage();
        });
    }
    window.addEventListener('online', updateNetwork);
    window.addEventListener('offline', updateNetwork);
    const connection = getConnection();
    connection?.addEventListener?.('change', updateNetwork);

    refreshUsage();
    updateHardware();
    updateNetwork();
    hardwareTimer = setInterval(updateHardware, 2500);
    networkTimer = setInterval(updateNetwork, 5000);
    usageTimer = setInterval(refreshUsage, 15000);
    window.DashifyStats = { refresh: async () => { await refreshUsage(); await updateHardware(); updateNetwork(); }, refreshHardware: updateHardware, refreshNetwork: updateNetwork };
})();
