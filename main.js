/* ============================================================
   MAIN.JS — OS Simulator Pro
   Global state, boot sequence, navigation, system monitor,
   theme toggle, and activity log.
   ============================================================ */

'use strict';

// ============================================================
// GLOBAL STATE
// ============================================================
const state = {
    cpuProcesses:       [],   // processes added to CPU scheduler
    memoryBlocks:       [],   // current memory block map
    memAllocated:       [],   // allocated process list for dashboard
    systemProcesses:    [],   // process manager list
    selectedProcess:    null, // currently selected PID
    nextPID:            1000, // auto-incrementing PID counter
    uptime:             0,    // seconds since boot
    cpuUsageHistory:    [],   // last N cpu % readings
    diskSchedulerResult: null,
    terminalHistory:    [],   // command history (newest first)
    historyIndex:       -1,   // arrow-key history cursor
    currentAlgo:        'fcfs',
    theme:              'dark',
};

// Shared process color palette
const PROCESS_COLORS = [
    '#e74c3c','#3498db','#2ecc71','#9b59b6','#f39c12',
    '#1abc9c','#e67e22','#e91e63','#00bcd4','#8bc34a',
    '#ff5722','#607d8b','#673ab7','#009688','#ff9800',
];

// ============================================================
// BOOT SEQUENCE
// ============================================================
const BOOT_MESSAGES = [
    '[  0.000000] Booting OS-SIM PRO v3.0...',
    '[  0.001234] Initializing memory subsystem................. OK',
    '[  0.002891] Loading CPU scheduler modules................. OK',
    '[  0.004102] Mounting virtual filesystem................... OK',
    '[  0.005678] Starting process manager...................... OK',
    '[  0.007234] Loading paging module......................... OK',
    '[  0.008901] Initializing disk I/O subsystem.............. OK',
    '[  0.010234] Starting deadlock detection service........... OK',
    '[  0.011890] Loading terminal emulator..................... OK',
    '[  0.013456] All modules loaded successfully.',
    '[  0.015000] Welcome to OS-SIM PRO — OS Concepts Simulator',
];

/**
 * Runs the animated boot sequence, then reveals the main app.
 */
function runBoot() {
    const container = document.getElementById('bootText');
    let i = 0;

    function addLine() {
        if (i < BOOT_MESSAGES.length) {
            const div = document.createElement('div');
            div.className = 'boot-line';
            div.style.animationDelay = (i * 0.12) + 's';
            div.textContent = BOOT_MESSAGES[i];
            container.appendChild(div);
            i++;
            setTimeout(addLine, 200);
        } else {
            // All lines printed — fade out boot screen
            setTimeout(() => {
                const boot = document.getElementById('bootScreen');
                boot.style.transition = 'opacity 0.8s ease';
                boot.style.opacity = '0';

                setTimeout(() => {
                    boot.style.display = 'none';
                    const app = document.getElementById('mainApp');
                    app.style.display = 'block';

                    // Initialise all modules
                    startSystemMonitor();
                    initProcessManager();
                    initMemory();
                    addLog('✓ OS-SIM PRO v3.0 fully initialised');
                }, 800);
            }, 600);
        }
    }

    addLine();
}

// ============================================================
// NAVIGATION
// ============================================================

/**
 * Show a page by ID and highlight the matching nav tab.
 * @param {string} pageId  - e.g. 'dashboard', 'cpu', 'memory' …
 * @param {HTMLElement|null} clickedTab - the button element that was clicked
 */
function showPage(pageId, clickedTab) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(p => {
        p.classList.remove('active');
    });

    // Remove active from all tabs
    document.querySelectorAll('.nav-tab').forEach(t => {
        t.classList.remove('active');
    });

    // Show target page
    const target = document.getElementById('page-' + pageId);
    if (target) {
        target.classList.add('active');
    } else {
        console.warn(`showPage: no element with id "page-${pageId}"`);
        return;
    }

    // Highlight correct nav tab
    if (clickedTab) {
        // Called from a navbar button — use the passed reference directly
        clickedTab.classList.add('active');
    } else {
        // Called programmatically (e.g. from a module card) —
        // find the tab whose onclick contains the pageId
        document.querySelectorAll('.nav-tab').forEach(tab => {
            const handler = tab.getAttribute('onclick') || '';
            if (handler.includes(`'${pageId}'`)) {
                tab.classList.add('active');
            }
        });
    }
}

// ============================================================
// THEME TOGGLE
// ============================================================

/**
 * Toggles between dark and light theme.
 * Persists the choice to localStorage.
 */
function toggleTheme() {
    const html = document.documentElement;
    const btn  = document.querySelector('.theme-toggle');
    const isDark = html.getAttribute('data-theme') === 'dark';

    if (isDark) {
        html.setAttribute('data-theme', 'light');
        state.theme = 'light';
        if (btn) btn.textContent = '☀️';
        localStorage.setItem('os-sim-theme', 'light');
        addLog('ℹ Theme switched to Light Mode');
    } else {
        html.setAttribute('data-theme', 'dark');
        state.theme = 'dark';
        if (btn) btn.textContent = '🌙';
        localStorage.setItem('os-sim-theme', 'dark');
        addLog('ℹ Theme switched to Dark Mode');
    }
}

/**
 * Loads saved theme from localStorage on startup.
 */
function loadSavedTheme() {
    const saved = localStorage.getItem('os-sim-theme');
    const btn   = document.querySelector('.theme-toggle');
    if (saved === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        state.theme = 'light';
        if (btn) btn.textContent = '☀️';
    } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        state.theme = 'dark';
        if (btn) btn.textContent = '🌙';
    }
}

// ============================================================
// SYSTEM MONITOR
// ============================================================

/**
 * Starts the 1-second interval that updates the clock,
 * CPU usage display, and dashboard stat cards.
 */
function startSystemMonitor() {
    function update() {
        // ── Clock ──────────────────────────────────────────
        const now = new Date();
        const timeEl = document.getElementById('sysTime');
        if (timeEl) timeEl.textContent = now.toLocaleTimeString();

        // ── Simulated CPU usage ────────────────────────────
        // Weighted random walk so the value feels organic
        const lastCPU = state.cpuUsageHistory.length
            ? state.cpuUsageHistory[state.cpuUsageHistory.length - 1]
            : 30;
        const delta  = (Math.random() - 0.48) * 8;          // slight upward bias
        const newCPU = Math.min(95, Math.max(5, lastCPU + delta));
        state.cpuUsageHistory.push(Math.round(newCPU));
        if (state.cpuUsageHistory.length > 60) {
            state.cpuUsageHistory.shift();                   // keep last 60 samples
        }

        const cpuPct = Math.round(newCPU);
        const cpuEl  = document.getElementById('cpuUsage');
        if (cpuEl) cpuEl.textContent = `CPU: ${cpuPct}%`;

        // ── Dashboard stat cards ───────────────────────────
        const dashCPU = document.getElementById('dash-cpu');
        if (dashCPU) dashCPU.textContent = `${cpuPct}%`;

        const allocatedMB = state.memAllocated.reduce((a, b) => a + (b.size || 0), 0);
        const dashMem = document.getElementById('dash-mem');
        if (dashMem) dashMem.textContent = `${128 + allocatedMB} MB`;

        const dashProc = document.getElementById('dash-proc');
        if (dashProc) dashProc.textContent = state.systemProcesses.length;

        const dashDisk = document.getElementById('dash-disk');
        if (dashDisk) dashDisk.textContent = `${Math.floor(Math.random() * 50 + 10)} ms`;

        // ── Uptime counter ─────────────────────────────────
        state.uptime++;
    }

    update();                          // run immediately
    setInterval(update, 1000);         // then every second
}

// ============================================================
// ACTIVITY LOG
// ============================================================

/**
 * Appends a timestamped message to the dashboard activity log.
 * @param {string} msg - plain-text or HTML message
 */
function addLog(msg) {
    const log = document.getElementById('activityLog');
    if (!log) return;

    const now = new Date().toLocaleTimeString();
    const div = document.createElement('div');
    div.style.animation = 'slideIn 0.3s ease';
    div.innerHTML = `<span class="text-muted">[${now}]</span> ${msg}`;
    log.appendChild(div);

    // Auto-scroll to bottom
    log.scrollTop = log.scrollHeight;

    // Keep at most 100 log entries to prevent memory bloat
    while (log.children.length > 100) {
        log.removeChild(log.firstChild);
    }
}

// ============================================================
// UTILITY HELPERS  (used by multiple modules)
// ============================================================

/**
 * Clamps a number between min and max.
 */
function clamp(val, min, max) {
    return Math.min(max, Math.max(min, val));
}

/**
 * Generates a random integer in [min, max] inclusive.
 */
function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Formats a float to n decimal places as a string.
 */
function fmt(n, decimals = 2) {
    return Number(n).toFixed(decimals);
}

/**
 * Safely reads an integer from an input element.
 * @param {string} id        - element id
 * @param {number} fallback  - value if parse fails
 * @param {number} [min]     - optional minimum clamp
 * @param {number} [max]     - optional maximum clamp
 */
function getInt(id, fallback, min = -Infinity, max = Infinity) {
    const el  = document.getElementById(id);
    const val = el ? parseInt(el.value, 10) : NaN;
    return isNaN(val) ? fallback : clamp(val, min, max);
}

/**
 * Safely reads a string value from an input/select element.
 * @param {string} id       - element id
 * @param {string} fallback - value if element not found
 */
function getVal(id, fallback = '') {
    const el = document.getElementById(id);
    return el ? el.value.trim() : fallback;
}

/**
 * Sets the textContent of an element by id safely.
 * @param {string} id
 * @param {string|number} text
 */
function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

/**
 * Sets the innerHTML of an element by id safely.
 * @param {string} id
 * @param {string} html
 */
function setHTML(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
}

/**
 * Shows an element (removes display:none).
 * @param {string} id
 */
function showEl(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = '';
}

/**
 * Hides an element (sets display:none).
 * @param {string} id
 */
function hideEl(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
}

// ============================================================
// STARTUP  — runs after all <script> tags are parsed
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    loadSavedTheme();   // apply persisted theme before anything renders
    runBoot();          // kick off the animated boot sequence
});