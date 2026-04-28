/* ============================================================
   PROCESSES.JS — OS Simulator Pro
   Process Manager:
   System process list, fork, kill, state transitions,
   CPU/memory simulation, statistics panel.
   ============================================================ */

'use strict';

// ============================================================
// CONSTANTS
// ============================================================

/** Valid process states and their CSS class suffixes. */
const PROCESS_STATES = {
    running:  'running',
    waiting:  'waiting',
    sleeping: 'sleeping',
    zombie:   'zombie',
};

/** Names used when spawning random system processes. */
const SYS_PROCESS_NAMES = [
    'webserver', 'database', 'logger',   'monitor',
    'cron',      'backup',   'compiler', 'indexer',
    'cache',     'proxy',    'worker',   'daemon',
    'scanner',   'updater',  'reporter',
];

/** Initial set of system processes present at boot. */
const BOOT_PROCESSES = [
    { name: 'init',        state: 'running',  cpu: 0.1,  mem:   4 },
    { name: 'kernel',      state: 'running',  cpu: 2.3,  mem: 128 },
    { name: 'scheduler',   state: 'running',  cpu: 0.5,  mem:   8 },
    { name: 'memory_mgr',  state: 'running',  cpu: 1.2,  mem:  16 },
    { name: 'disk_io',     state: 'waiting',  cpu: 0.0,  mem:  12 },
    { name: 'net_driver',  state: 'sleeping', cpu: 0.0,  mem:   8 },
    { name: 'shell',       state: 'running',  cpu: 0.3,  mem:   4 },
    { name: 'sim_gui',     state: 'running',  cpu: 5.1,  mem:  64 },
];

// Interval handle so we can clear it if needed
let _procUpdateInterval = null;

// ============================================================
// INITIALISATION
// ============================================================

/**
 * Populate state.systemProcesses with boot processes
 * and start the live-update interval.
 * Called once from main.js after the boot screen finishes.
 */
function initProcessManager() {
    // Build initial process list from boot definitions
    state.systemProcesses = BOOT_PROCESSES.map(p => ({
        pid:       state.nextPID++,
        name:      p.name,
        state:     p.state,
        cpu:       p.cpu,
        mem:       p.mem,
        startTime: state.uptime,
        selected:  false,
    }));

    renderProcessList();

    // Live CPU fluctuation every 2 seconds
    if (_procUpdateInterval) clearInterval(_procUpdateInterval);
    _procUpdateInterval = setInterval(_liveUpdate, 2000);
}

/**
 * Slightly randomise CPU usage of running processes
 * and re-render the list if the Processes page is visible.
 */
function _liveUpdate() {
    state.systemProcesses.forEach(p => {
        if (p.state === 'running') {
            // Random walk with bounds [0.1, 99]
            const delta = (Math.random() - 0.48) * 1.5;
            p.cpu = clamp(p.cpu + delta, 0.1, 99);
        }
    });

    // Only re-render if the page is currently visible
    const page = document.getElementById('page-processes');
    if (page && page.classList.contains('active')) {
        renderProcessList();
    }
}

// ============================================================
// PROCESS CREATION
// ============================================================

/**
 * Fork: create a child process that inherits the parent's name
 * with a "_fork" suffix. Parent is the first running process.
 */
function forkProcess() {
    const parent = state.systemProcesses.find(p => p.state === 'running');
    const base   = parent ? parent.name : 'proc';
    const name   = `${base}_fork`;

    const child = _makeProcess(name, 'running',
        clamp(Math.random() * 3, 0.1, 10),
        randInt(4, 48));

    state.systemProcesses.push(child);
    renderProcessList();
    addLog(`🌿 Forked "${child.name}" from "${base}" (PID ${child.pid})`);
}

/**
 * Spawn a random named system process in a random state.
 */
function addSysProcess() {
    const name  = SYS_PROCESS_NAMES[
        randInt(0, SYS_PROCESS_NAMES.length - 1)];
    const states = ['running', 'waiting', 'sleeping'];
    const st    = states[randInt(0, 2)];
    const cpu   = st === 'running' ? Math.random() * 5 : 0;
    const mem   = randInt(4, 128);

    const proc  = _makeProcess(name, st, cpu, mem);
    state.systemProcesses.push(proc);
    renderProcessList();
    addLog(`➕ System process "${name}" started (PID ${proc.pid}, ${st})`);
}

/**
 * Build a process object with all required fields.
 * @private
 */
function _makeProcess(name, procState, cpu, mem) {
    return {
        pid:       state.nextPID++,
        name,
        state:     procState,
        cpu:       parseFloat(cpu.toFixed(2)),
        mem,
        startTime: state.uptime,
        selected:  false,
    };
}

// ============================================================
// PROCESS TERMINATION
// ============================================================

/**
 * Transition a process to ZOMBIE then remove it after 1.5 s.
 * Mirrors real Unix behaviour where a process becomes a zombie
 * briefly before being reaped by its parent (init).
 *
 * @param {number} pid - PID of the process to kill
 */
function killProcess(pid) {
    const proc = state.systemProcesses.find(p => p.pid === pid);
    if (!proc) {
        addLog(`❌ kill: PID ${pid} not found`);
        return;
    }

    // Protect core kernel processes
    if (['init', 'kernel', 'scheduler'].includes(proc.name)) {
        addLog(`⚠ Cannot kill critical system process "${proc.name}"`);
        return;
    }

    // Transition → ZOMBIE
    proc.state    = 'zombie';
    proc.cpu      = 0;
    proc.selected = false;
    renderProcessList();
    addLog(`💀 Process "${proc.name}" (PID ${pid}) → ZOMBIE`);

    // Reap after 1.5 s (parent "waits" for it)
    setTimeout(() => {
        state.systemProcesses =
            state.systemProcesses.filter(p => p.pid !== pid);
        if (state.selectedProcess === pid) state.selectedProcess = null;
        renderProcessList();
        addLog(`🗑 Process "${proc.name}" (PID ${pid}) reaped`);
    }, 1500);
}

/**
 * Kill whichever process is currently selected.
 */
function killSelected() {
    if (!state.selectedProcess) {
        addLog('❌ No process selected — click a process row first');
        return;
    }
    killProcess(state.selectedProcess);
}

// ============================================================
// PROCESS SELECTION
// ============================================================

/**
 * Toggle selection on a process row.
 * Clicking the same row twice deselects it.
 *
 * @param {number} pid
 */
function selectProcess(pid) {
    if (state.selectedProcess === pid) {
        // Deselect
        state.selectedProcess = null;
        state.systemProcesses.forEach(p => { p.selected = false; });
    } else {
        state.selectedProcess = pid;
        state.systemProcesses.forEach(p => {
            p.selected = (p.pid === pid);
        });
    }
    renderProcessList();
}

// ============================================================
// STATE TRANSITIONS
// ============================================================

/**
 * Cycle a process through its valid next states.
 * running → waiting → sleeping → running
 * zombie processes cannot be cycled.
 *
 * @param {number} pid
 */
function cycleProcessState(pid) {
    const proc = state.systemProcesses.find(p => p.pid === pid);
    if (!proc || proc.state === 'zombie') return;

    const cycle = { running: 'waiting', waiting: 'sleeping', sleeping: 'running' };
    const next  = cycle[proc.state] || 'running';
    const prev  = proc.state;
    proc.state  = next;

    // Adjust CPU when leaving/entering running state
    if (next === 'running')  proc.cpu = clamp(Math.random() * 3, 0.1, 5);
    if (next !== 'running')  proc.cpu = 0;

    renderProcessList();
    addLog(`🔄 PID ${pid} "${proc.name}": ${prev} → ${next}`);
}

// ============================================================
// RENDERER
// ============================================================

/**
 * Re-render the full process list and statistics panel.
 */
function renderProcessList() {
    _renderProcItems();
    _updateProcBadge();
    updateProcStats();
}

/**
 * Build and inject the process item HTML.
 * @private
 */
function _renderProcItems() {
    const list = document.getElementById('processList');
    if (!list) return;

    if (state.systemProcesses.length === 0) {
        list.innerHTML = `
            <div style="text-align:center;
                        color:var(--text-muted);
                        padding:40px 0;
                        font-size:13px;">
                No processes running
            </div>`;
        return;
    }

    list.innerHTML = state.systemProcesses.map(p => {
        const selectedClass = p.selected ? 'selected-proc' : '';
        const stateClass    = `state-${p.state}`;
        // Clamp CPU bar width to [0, 100]
        const barWidth      = clamp(p.cpu * 10, 0, 100).toFixed(1);
        // Runtime in seconds
        const runtime       = state.uptime - (p.startTime || 0);
        // CPU bar colour changes with load
        const barColor      = p.cpu > 70
            ? 'linear-gradient(90deg,var(--danger),#ff8c00)'
            : p.cpu > 40
                ? 'linear-gradient(90deg,var(--warning),var(--accent-green))'
                : 'linear-gradient(90deg,var(--accent-green),var(--accent-cyan))';

        return `
            <div class="process-item ${selectedClass}"
                 onclick="selectProcess(${p.pid})">

                <!-- PID -->
                <span class="process-pid tooltip"
                      data-tip="Click to select · Double-click state to cycle">
                    PID ${p.pid}
                </span>

                <!-- Name + details -->
                <div>
                    <div class="process-name">${p.name}</div>
                    <div style="font-size:10px;color:var(--text-muted);">
                        CPU: ${p.cpu.toFixed(1)}% &nbsp;|&nbsp;
                        MEM: ${p.mem} MB &nbsp;|&nbsp;
                        UP: ${_fmtRuntime(runtime)}
                    </div>
                </div>

                <!-- State badge (click to cycle) -->
                <span class="process-state ${stateClass}"
                      title="Click to cycle state"
                      onclick="event.stopPropagation();
                               cycleProcessState(${p.pid});"
                      style="cursor:pointer;">
                    ${p.state.toUpperCase()}
                </span>

                <!-- CPU mini-bar -->
                <div>
                    <div class="cpu-bar-mini">
                        <div class="cpu-bar-fill"
                             style="width:${barWidth}%;
                                    background:${barColor};">
                        </div>
                    </div>
                    <div style="font-size:9px;
                                color:var(--text-muted);
                                text-align:right;
                                margin-top:2px;">
                        ${p.cpu.toFixed(1)}%
                    </div>
                </div>

                <!-- Kill button -->
                <button class="btn btn-danger"
                        style="padding:4px 10px;font-size:10px;"
                        title="Terminate process"
                        onclick="event.stopPropagation();
                                 killProcess(${p.pid});">
                    ✕
                </button>
            </div>`;
    }).join('');
}

/**
 * Update the "N PROCESSES" badge in the section header.
 * @private
 */
function _updateProcBadge() {
    const badge = document.getElementById('procCountBadge');
    if (!badge) return;
    const n   = state.systemProcesses.length;
    badge.textContent = `${n} PROCESS${n !== 1 ? 'ES' : ''}`;
}

// ============================================================
// STATISTICS PANEL
// ============================================================

/**
 * Count processes by state and update the stats panel.
 */
function updateProcStats() {
    const counts = {
        running:  0,
        waiting:  0,
        sleeping: 0,
        zombie:   0,
    };

    let totalCPU = 0;

    state.systemProcesses.forEach(p => {
        if (counts[p.state] !== undefined) counts[p.state]++;
        totalCPU += p.cpu;
    });

    setText('psRunning',  counts.running);
    setText('psWaiting',  counts.waiting);
    setText('psSleeping', counts.sleeping);
    setText('psZombie',   counts.zombie);
    setText('psTotalCPU', totalCPU.toFixed(1) + '%');
}

// ============================================================
// PRIVATE HELPERS
// ============================================================

/**
 * Format a runtime in seconds as "Xh Ym Zs" or "Ym Zs" or "Zs".
 * @param {number} seconds
 * @returns {string}
 */
function _fmtRuntime(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;

    if (h > 0)  return `${h}h ${m}m ${sec}s`;
    if (m > 0)  return `${m}m ${sec}s`;
    return `${sec}s`;
}