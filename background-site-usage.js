/* Dashify MV3 service worker — local active-site usage tracking. */
const USAGE_KEY = 'dashifySiteUsage';
const STATE_KEY = 'dashifyUsageTrackerState';
const ALARM_NAME = 'dashify-usage-checkpoint';
const EXTENSION_URL_PREFIX = chrome.runtime.getURL('');
let activeTabId = null;
let activeDomain = null;
let lastCheckpoint = Date.now();
let windowFocused = true;
let queue = Promise.resolve();
let stateReady = false;

function localDayKey(timestamp = Date.now()) {
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getDomain(url) {
    try {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol) || parsed.href.startsWith(EXTENSION_URL_PREFIX)) return null;
        return parsed.hostname.replace(/^www\./, '').toLowerCase() || null;
    } catch { return null; }
}

function serialize(operation) {
    queue = queue.then(operation, operation);
    return queue;
}

async function saveState() {
    const state = { activeTabId, activeDomain, lastCheckpoint, windowFocused };
    try {
        if (chrome.storage.session) await chrome.storage.session.set({ [STATE_KEY]: state });
        else await chrome.storage.local.set({ [STATE_KEY]: state });
    } catch {}
}

async function restoreState() {
    if (stateReady) return;
    try {
        const area = chrome.storage.session || chrome.storage.local;
        const stored = await area.get(STATE_KEY);
        const state = stored[STATE_KEY];
        if (state) {
            activeTabId = state.activeTabId ?? null;
            activeDomain = state.activeDomain ?? null;
            lastCheckpoint = Number(state.lastCheckpoint) || Date.now();
            windowFocused = state.windowFocused !== false;
        }
    } catch {}
    stateReady = true;
}

async function checkpoint(now = Date.now()) {
    await restoreState();
    const elapsed = Math.max(0, now - lastCheckpoint);
    const domain = activeDomain; // Snapshot before asynchronous storage work or tab changes.
    const shouldRecord = windowFocused && domain && elapsed >= 1000;
    lastCheckpoint = now;
    await saveState();
    if (!shouldRecord) return;

    const day = localDayKey(now);
    await serialize(async () => {
        const stored = await chrome.storage.local.get(USAGE_KEY);
        const usage = stored[USAGE_KEY] || {};
        usage[day] ||= {};
        usage[day][domain] ||= { milliseconds: 0, visits: 0 };
        usage[day][domain].milliseconds += elapsed;
        await chrome.storage.local.set({ [USAGE_KEY]: usage });
    });
}

async function setActiveTab(tabId) {
    await restoreState();
    await checkpoint();
    activeTabId = tabId ?? null;
    activeDomain = null;
    lastCheckpoint = Date.now();
    if (windowFocused && activeTabId !== null) {
        try {
            const tab = await chrome.tabs.get(activeTabId);
            activeDomain = getDomain(tab.url || tab.pendingUrl);
        } catch { activeDomain = null; }
    }
    await saveState();
}

async function syncActiveTab() {
    await restoreState();
    const win = await chrome.windows.getLastFocused().catch(() => null);
    windowFocused = Boolean(win && win.focused);
    if (!windowFocused) {
        await checkpoint();
        activeTabId = null; activeDomain = null; lastCheckpoint = Date.now();
        await saveState();
        return;
    }
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab?.id !== activeTabId) await setActiveTab(tab?.id);
    else if (tab) {
        const domain = getDomain(tab.url || tab.pendingUrl);
        if (domain !== activeDomain) await setActiveTab(tab.id);
    }
}

async function countVisit(url) {
    const domain = getDomain(url);
    if (!domain) return;
    const day = localDayKey();
    await serialize(async () => {
        const stored = await chrome.storage.local.get(USAGE_KEY);
        const usage = stored[USAGE_KEY] || {};
        usage[day] ||= {};
        usage[day][domain] ||= { milliseconds: 0, visits: 0 };
        usage[day][domain].visits += 1;
        await chrome.storage.local.set({ [USAGE_KEY]: usage });
    });
}

async function initialize() {
    await restoreState();
    await chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
    await syncActiveTab();
}

chrome.runtime.onInstalled.addListener(() => initialize());
chrome.runtime.onStartup.addListener(() => initialize());
chrome.alarms.onAlarm.addListener(async alarm => {
    if (alarm.name !== ALARM_NAME) return;
    await restoreState();
    await checkpoint();
    await syncActiveTab();
});
chrome.tabs.onActivated.addListener(info => setActiveTab(info.tabId));
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.active) {
        countVisit(tab.url || tab.pendingUrl);
        setActiveTab(tabId);
    } else if (tabId === activeTabId && (changeInfo.url || changeInfo.status === 'loading')) {
        setActiveTab(tabId);
    }
});
chrome.tabs.onRemoved.addListener(tabId => { if (tabId === activeTabId) setActiveTab(null); });
chrome.windows.onFocusChanged.addListener(async windowId => {
    await restoreState();
    await checkpoint();
    windowFocused = windowId !== chrome.windows.WINDOW_ID_NONE;
    lastCheckpoint = Date.now();
    if (!windowFocused) { activeDomain = null; activeTabId = null; await saveState(); return; }
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    await setActiveTab(tab?.id);
});
