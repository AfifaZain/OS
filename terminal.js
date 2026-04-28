/* ============================================================
   TERMINAL.JS — OS Simulator Pro
   Simulated shell terminal:
   Command parsing, history navigation, all built-in commands,
   output formatting, and tab-completion.
   ============================================================ */

'use strict';

// ============================================================
// CONSTANTS
// ============================================================

/** All recognised commands and their one-line descriptions. */
const COMMANDS = {
    help:     'Show all available commands',
    ps:       'List all running processes',
    top:      'Show CPU and memory usage summary',
    free:     'Show memory allocation map',
    mem:      'Show detailed memory block map',
    kill:     'kill [pid]    — Terminate a process by PID',
    fork:     'fork [name]   — Fork a new process',
    schedule: 'schedule [algo] — Show/change CPU scheduler',
    uname:    'Print system information',
    uptime:   'Show system uptime and load',
    clear:    'Clear the terminal screen',
    cls:      'Alias for clear',
    ls:       'List virtual filesystem directories',
    pwd:      'Print working directory',
    date:     'Show current date and time',
    echo:     'echo [text]   — Print text to terminal',
    whoami:   'Print current user',
    history:  'Show command history',
    theme:    'theme [dark|light] — Switch UI theme',
    cpu:      'Show CPU scheduler status and processes',
    disk:     'Show last disk scheduler result',
    page:     'Show last page replacement result',
    banner:   'Print the OS-SIM PRO banner',
    man:      'man [cmd]     — Show manual for a command',
    reset:    'reset [module]— Reset a simulator module',
    neofetch: 'Display system info in neofetch style',
};

/** Valid CPU scheduling algorithm names for the schedule command. */
const VALID_ALGOS = ['fcfs', 'sjf', 'sjfp', 'priority', 'priorityp', 'rr'];

// ============================================================
// TERMINAL STATE
// ============================================================

/** Current simulated working directory path. */
let _cwd = '/home/sim';

/** Whether the terminal is "locked" during a running animation. */
let _busy = false;

// ============================================================
// EVENT HANDLER
// ============================================================

/**
 * Handle keydown events on the terminal input.
 * Supports:
 *   Enter       — submit command
 *   ArrowUp/Down— history navigation
 *   Tab         — tab completion
 *   Ctrl+C      — interrupt / clear input
 *   Ctrl+L      — clear screen
 *
 * @param {KeyboardEvent} e
 */
function handleTerminal(e) {
    const input = document.getElementById('terminalInput');
    if (!input) return;

    // ── Ctrl+C — interrupt ─────────────────────────────────
    if (e.ctrlKey && e.key === 'c') {
        e.preventDefault();
        if (input.value.trim()) {
            addTerminalLine(`${_prompt()}${input.value}^C`, 'warn');
        } else {
            addTerminalLine('^C', 'warn');
        }
        input.value      = '';
        _busy            = false;
        state.historyIndex = -1;
        return;
    }

    // ── Ctrl+L — clear screen ──────────────────────────────
    if (e.ctrlKey && e.key === 'l') {
        e.preventDefault();
        setHTML('terminalBody', '');
        return;
    }

    if (_busy) return;   // ignore input while animation runs

    switch (e.key) {
        case 'Enter': {
            e.preventDefault();
            const cmd = input.value.trim();
            if (!cmd) return;

            // Save to history (newest first, no duplicates at top)
            if (state.terminalHistory[0] !== cmd) {
                state.terminalHistory.unshift(cmd);
                if (state.terminalHistory.length > 50) {
                    state.terminalHistory.pop();
                }
            }
            state.historyIndex = -1;

            // Echo the command
            addTerminalLine(`${_prompt()}${cmd}`, 'default');
            input.value = '';

            // Process after a tiny delay so the echo appears first
            setTimeout(() => processCommand(cmd), 10);
            break;
        }

        case 'ArrowUp': {
            e.preventDefault();
            const maxIdx = state.terminalHistory.length - 1;
            state.historyIndex = clamp(state.historyIndex + 1, 0, maxIdx);
            input.value = state.terminalHistory[state.historyIndex] || '';
            // Move cursor to end
            setTimeout(() => {
                input.selectionStart = input.selectionEnd = input.value.length;
            }, 0);
            break;
        }

        case 'ArrowDown': {
            e.preventDefault();
            state.historyIndex--;
            if (state.historyIndex < 0) {
                state.historyIndex = -1;
                input.value = '';
            } else {
                input.value = state.terminalHistory[state.historyIndex] || '';
            }
            break;
        }

        case 'Tab': {
            e.preventDefault();
            _tabComplete(input);
            break;
        }
    }
}

// ============================================================
// OUTPUT HELPERS
// ============================================================

/**
 * Append a line to the terminal body.
 *
 * @param {string} text  - plain text or HTML string
 * @param {string} type  - 'default' | 'info' | 'error' | 'warn'
 */
function addTerminalLine(text, type = 'default') {
    const body = document.getElementById('terminalBody');
    if (!body) return;

    const div       = document.createElement('div');
    div.className   = 'terminal-line' + (type !== 'default' ? ` ${type}` : '');
    div.innerHTML   = text;
    body.appendChild(div);

    // Auto-scroll
    body.scrollTop = body.scrollHeight;

    // Cap at 500 lines to prevent DOM bloat
    while (body.children.length > 500) {
        body.removeChild(body.firstChild);
    }
}

/**
 * Print a blank separator line.
 */
function _blankLine() {
    addTerminalLine('', 'default');
}

/**
 * Build the shell prompt string.
 * @returns {string}
 */
function _prompt() {
    return `<span style="color:#00ff88">sim@os-sim-pro</span>` +
           `<span style="color:#666">:</span>` +
           `<span style="color:#00d4ff">${_cwd}</span>` +
           `<span style="color:#666">$ </span>`;
}

/**
 * Print a section heading inside the terminal.
 * @param {string} title
 */
function _heading(title) {
    addTerminalLine(
        `<span style="color:var(--accent-cyan);font-weight:bold;">` +
        `── ${title} ──</span>`,
        'default');
}

/**
 * Print a key-value pair row.
 * @param {string} key
 * @param {string} val
 * @param {string} [valColor]
 */
function _kvLine(key, val, valColor = '#00d4ff') {
    addTerminalLine(
        `  <span style="color:#666;">${key.padEnd(20)}</span>` +
        `<span style="color:${valColor};">${val}</span>`);
}

// ============================================================
// TAB COMPLETION
// ============================================================

/**
 * Attempt to complete the current input against known commands.
 * If exactly one match: complete it.
 * If multiple matches: list them.
 *
 * @param {HTMLInputElement} input
 */
function _tabComplete(input) {
    const partial  = input.value.trim().toLowerCase();
    if (!partial) return;

    const parts    = partial.split(/\s+/);
    const cmdPart  = parts[0];

    // Only complete the first token (command name)
    if (parts.length > 1) return;

    const matches  = Object.keys(COMMANDS).filter(c =>
        c.startsWith(cmdPart));

    if (matches.length === 1) {
        input.value = matches[0] + ' ';
    } else if (matches.length > 1) {
        addTerminalLine(`${_prompt()}${input.value}`, 'default');
        addTerminalLine(
            matches.map(m =>
                `<span style="color:#00d4ff">${m}</span>`
            ).join('  '),
            'default');
    }
}

// ============================================================
// COMMAND DISPATCHER
// ============================================================

/**
 * Parse and dispatch a raw command string.
 * @param {string} raw - full command line entered by the user
 */
function processCommand(raw) {
    const parts   = raw.trim().split(/\s+/);
    const command = parts[0].toLowerCase();
    const args    = parts.slice(1);

    switch (command) {
        case 'help':     _cmdHelp();               break;
        case 'ps':       _cmdPs();                 break;
        case 'top':      _cmdTop();                break;
        case 'free':     _cmdFree();               break;
        case 'mem':      _cmdMem();                break;
        case 'kill':     _cmdKill(args);           break;
        case 'fork':     _cmdFork(args);           break;
        case 'schedule': _cmdSchedule(args);       break;
        case 'uname':    _cmdUname();              break;
        case 'uptime':   _cmdUptime();             break;
        case 'clear':
        case 'cls':      _cmdClear();              break;
        case 'ls':       _cmdLs(args);             break;
        case 'pwd':      _cmdPwd();                break;
        case 'date':     _cmdDate();               break;
        case 'echo':     _cmdEcho(args);           break;
        case 'whoami':   _cmdWhoami();             break;
        case 'history':  _cmdHistory();            break;
        case 'theme':    _cmdTheme(args);          break;
        case 'cpu':      _cmdCpu();                break;
        case 'disk':     _cmdDisk();               break;
        case 'page':     _cmdPage();               break;
        case 'banner':   _cmdBanner();             break;
        case 'man':      _cmdMan(args);            break;
        case 'reset':    _cmdReset(args);          break;
        case 'neofetch': _cmdNeofetch();           break;
        default:
            addTerminalLine(
                `<span style="color:#ff4757">` +
                `bash: ${command}: command not found</span> ` +
                `<span style="color:#666">` +
                `(type 'help' for available commands)</span>`,
                'error');
    }
}

// ============================================================
// COMMAND IMPLEMENTATIONS
// ============================================================

/* ── help ─────────────────────────────────────────────────── */
function _cmdHelp() {
    _heading('OS-SIM PRO — SIM-SHELL v1.0');
    addTerminalLine(
        '  <span style="color:#666">Available commands:</span>');
    _blankLine();

    Object.entries(COMMANDS).forEach(([cmd, desc]) => {
        addTerminalLine(
            `  <span style="color:#00ff88;font-weight:bold;">` +
            `${cmd.padEnd(12)}</span>` +
            `<span style="color:#666;">${desc}</span>`);
    });

    _blankLine();
    addTerminalLine(
        '  <span style="color:#666;">Tip: use </span>' +
        '<span style="color:#00d4ff;">Tab</span>' +
        '<span style="color:#666;"> for auto-complete, ' +
        '↑↓ for history, Ctrl+C to cancel.</span>',
        'default');
}

/* ── ps ───────────────────────────────────────────────────── */
function _cmdPs() {
    _heading('PROCESS LIST');
    addTerminalLine(
        `  <span style="color:#00d4ff;">` +
        `${'PID'.padEnd(7)}` +
        `${'NAME'.padEnd(18)}` +
        `${'STATE'.padEnd(12)}` +
        `${'CPU%'.padEnd(8)}` +
        `MEM</span>`);
    addTerminalLine(
        '  <span style="color:#333">─────────────────────' +
        '─────────────────────</span>');

    state.systemProcesses.forEach(p => {
        const stateColor = {
            running:  '#00ff88',
            waiting:  '#ffd700',
            sleeping: '#94a3b8',
            zombie:   '#ff4757',
        }[p.state] || '#94a3b8';

        addTerminalLine(
            `  <span style="color:#fff">${String(p.pid).padEnd(7)}</span>` +
            `<span style="color:#e2e8f0">${p.name.padEnd(18)}</span>` +
            `<span style="color:${stateColor}">${p.state.padEnd(12)}</span>` +
            `<span style="color:#00d4ff">${p.cpu.toFixed(1).padEnd(8)}</span>` +
            `<span style="color:#7c3aed">${p.mem} MB</span>`);
    });

    _blankLine();
    addTerminalLine(
        `  <span style="color:#666">` +
        `Total: ${state.systemProcesses.length} process(es)</span>`);
}

/* ── top ──────────────────────────────────────────────────── */
function _cmdTop() {
    const totalCPU  = state.systemProcesses
        .reduce((a, b) => a + b.cpu, 0);
    const usedMem   = 128 + state.memAllocated
        .reduce((a, b) => a + (b.size || 0), 0);
    const freeMem   = 1024 - usedMem;
    const runCount  = state.systemProcesses
        .filter(p => p.state === 'running').length;

    _heading('SYSTEM RESOURCE SUMMARY');
    _kvLine('CPU Usage:',    totalCPU.toFixed(1) + '%',  '#00d4ff');
    _kvLine('Memory Used:',  usedMem  + ' MB / 1024 MB', '#7c3aed');
    _kvLine('Memory Free:',  freeMem  + ' MB',           '#00ff88');
    _kvLine('Processes:',    state.systemProcesses.length, '#ffd700');
    _kvLine('Running:',      runCount,                   '#00ff88');
    _kvLine('Uptime:',       _fmtUptime(state.uptime),   '#00d4ff');

    _blankLine();

    // Top 5 CPU consumers
    const top5 = [...state.systemProcesses]
        .sort((a, b) => b.cpu - a.cpu)
        .slice(0, 5);

    if (top5.length > 0) {
        addTerminalLine(
            '  <span style="color:#666">Top CPU consumers:</span>');
        top5.forEach(p => {
            const bar = '█'.repeat(Math.round(p.cpu / 5));
            addTerminalLine(
                `  <span style="color:#fff">${p.name.padEnd(16)}</span>` +
                `<span style="color:#00d4ff">${p.cpu.toFixed(1).padStart(5)}%  </span>` +
                `<span style="color:#00ff88">${bar}</span>`);
        });
    }
}

/* ── free ─────────────────────────────────────────────────── */
function _cmdFree() {
    const used = 128 + state.memAllocated
        .reduce((a, b) => a + (b.size || 0), 0);
    const free = 1024 - used;

    _heading('MEMORY INFORMATION');
    addTerminalLine(
        `  <span style="color:#00d4ff">` +
        `${''.padEnd(14)}${'total'.padEnd(12)}` +
        `${'used'.padEnd(12)}free</span>`);
    addTerminalLine(
        `  <span style="color:#e2e8f0">` +
        `${'Mem:'.padEnd(14)}` +
        `${'1024 MB'.padEnd(12)}` +
        `${(used + ' MB').padEnd(12)}` +
        `${free} MB</span>`);
    addTerminalLine(
        `  <span style="color:#94a3b8">` +
        `${'Swap:'.padEnd(14)}` +
        `${'2048 MB'.padEnd(12)}` +
        `${'0 MB'.padEnd(12)}` +
        `2048 MB</span>`);
    addTerminalLine(
        `  <span style="color:#666">` +
        `OS reserved: 128 MB | Allocated: ${used - 128} MB</span>`);
}

/* ── mem ──────────────────────────────────────────────────── */
function _cmdMem() {
    _heading('MEMORY BLOCK MAP');

    if (memBlocks.length === 0) {
        addTerminalLine(
            '  <span style="color:#666">Memory not initialised. ' +
            'Go to the Memory page and click "Initialize Memory".</span>');
        return;
    }

    addTerminalLine(
        `  <span style="color:#00d4ff">` +
        `${'START'.padEnd(10)}` +
        `${'END'.padEnd(10)}` +
        `${'SIZE'.padEnd(10)}` +
        `TYPE</span>`);

    memBlocks.forEach(b => {
        const end      = b.start + b.size;
        const typeStr  = b.type === 'free'
            ? `<span style="color:#475569">FREE</span>`
            : b.type === 'os'
                ? `<span style="color:#ff6b35">OS Kernel</span>`
                : `<span style="color:#7c3aed">${b.name}</span>`;

        addTerminalLine(
            `  <span style="color:#e2e8f0">` +
            `${(b.start + ' MB').padEnd(10)}` +
            `${(end + ' MB').padEnd(10)}` +
            `${(b.size + ' MB').padEnd(10)}` +
            `</span>${typeStr}`);
    });
}

/* ── kill ─────────────────────────────────────────────────── */
function _cmdKill(args) {
    if (!args[0]) {
        addTerminalLine(
            '<span style="color:#ff4757">Usage: kill [pid]</span>',
            'error');
        return;
    }

    const pid  = parseInt(args[0], 10);
    if (isNaN(pid)) {
        addTerminalLine(
            `<span style="color:#ff4757">kill: ` +
            `"${args[0]}" is not a valid PID</span>`,
            'error');
        return;
    }

    const proc = state.systemProcesses.find(p => p.pid === pid);
    if (!proc) {
        addTerminalLine(
            `<span style="color:#ff4757">kill: (${pid}): ` +
            `No such process</span>`,
            'error');
        return;
    }

    killProcess(pid);
    addTerminalLine(
        `<span style="color:#ffd700">` +
        `Sent SIGTERM to "${proc.name}" (PID ${pid})</span>`,
        'warn');
}

/* ── fork ─────────────────────────────────────────────────── */
function _cmdFork(args) {
    const name = args[0] || 'unnamed';
    const pid  = state.nextPID++;
    state.systemProcesses.push({
        pid,
        name,
        state:     'running',
        cpu:       clamp(Math.random() * 2, 0.1, 5),
        mem:       randInt(4, 32),
        startTime: state.uptime,
        selected:  false,
    });
    renderProcessList();
    addTerminalLine(
        `<span style="color:#00ff88">` +
        `[${pid}] ${name} &amp; </span>`,
        'info');
    addTerminalLine(
        `<span style="color:#666">` +
        `Process forked successfully (PID ${pid})</span>`);
}

/* ── schedule ─────────────────────────────────────────────── */
function _cmdSchedule(args) {
    if (!args[0]) {
        _heading('CPU SCHEDULER STATUS');
        _kvLine('Current algorithm:', state.currentAlgo.toUpperCase());
        _kvLine('Processes queued:', state.cpuProcesses.length);
        _blankLine();
        addTerminalLine(
            '  <span style="color:#666">Available algorithms:</span>');
        VALID_ALGOS.forEach(a => {
            const cur = a === state.currentAlgo;
            addTerminalLine(
                `  ${cur ? '▶ ' : '  '}` +
                `<span style="color:${cur ? '#00ff88' : '#666'}">` +
                `${a}</span>`);
        });
        return;
    }

    const algo = args[0].toLowerCase();
    if (!VALID_ALGOS.includes(algo)) {
        addTerminalLine(
            `<span style="color:#ff4757">` +
            `schedule: unknown algorithm "${algo}"</span>`,
            'error');
        addTerminalLine(
            `<span style="color:#666">` +
            `Valid options: ${VALID_ALGOS.join(', ')}</span>`);
        return;
    }

    // Update the dropdown on the CPU page
    const sel = document.getElementById('cpuAlgorithm');
    if (sel) sel.value = algo;
    state.currentAlgo = algo;
    toggleQuantum();

    addTerminalLine(
        `<span style="color:#00ff88">` +
        `Scheduler changed to ${algo.toUpperCase()}</span>`,
        'info');
    addLog(`💻 Terminal: scheduler changed to ${algo.toUpperCase()}`);
}

/* ── uname ────────────────────────────────────────────────── */
function _cmdUname() {
    addTerminalLine(
        '<span style="color:#00d4ff">' +
        'Linux os-sim-pro 5.15.0-SIM #1 SMP ' +
        `${new Date().toDateString()} x86_64 GNU/Linux` +
        '</span>',
        'info');
}

/* ── uptime ───────────────────────────────────────────────── */
function _cmdUptime() {
    const running = state.systemProcesses
        .filter(p => p.state === 'running').length;
    const load    = (Math.random() * 1.5).toFixed(2);

    addTerminalLine(
        `<span style="color:#00d4ff">` +
        ` ${new Date().toLocaleTimeString()} ` +
        `up ${_fmtUptime(state.uptime)}, ` +
        `1 user, ` +
        `load average: ${load}, ` +
        `${(+load * 0.8).toFixed(2)}, ` +
        `${(+load * 0.6).toFixed(2)}` +
        `</span>`,
        'info');
    addTerminalLine(
        `<span style="color:#666">` +
        `${state.systemProcesses.length} processes total, ` +
        `${running} running</span>`);
}

/* ── clear / cls ──────────────────────────────────────────── */
function _cmdClear() {
    setHTML('terminalBody', '');
}

/* ── ls ───────────────────────────────────────────────────── */
function _cmdLs(args) {
    const dir = args[0] || _cwd;

    const FS = {
        '/':              ['bin/', 'boot/', 'dev/', 'etc/',
                           'home/', 'lib/', 'proc/', 'sys/',
                           'tmp/', 'usr/', 'var/'],
        '/home':          ['sim/'],
        '/home/sim':      ['Desktop/', 'Documents/', 'os-sim-pro/'],
        '/home/sim/os-sim-pro': [
                           'index.html', 'style.css', 'main.js',
                           'cpu.js', 'memory.js', 'paging.js',
                           'disk.js', 'processes.js',
                           'deadlock.js', 'terminal.js'],
        '/proc':          ['1/', '2/', '3/', 'cpuinfo',
                           'meminfo', 'version'],
        '/etc':           ['hosts', 'hostname', 'os-release',
                           'passwd', 'fstab'],
    };

    const entries = FS[dir] || FS[_cwd] || FS['/'];
    _heading(`ls ${dir}`);

    const dirs  = entries.filter(e => e.endsWith('/'));
    const files = entries.filter(e => !e.endsWith('/'));

    let row = '  ';
    dirs.forEach(d => {
        row += `<span style="color:#00d4ff;font-weight:bold;">${d}  </span>`;
    });
    files.forEach(f => {
        row += `<span style="color:#e2e8f0;">${f}  </span>`;
    });
    addTerminalLine(row);
}

/* ── pwd ──────────────────────────────────────────────────── */
function _cmdPwd() {
    addTerminalLine(
        `<span style="color:#00d4ff">${_cwd}</span>`,
        'info');
}

/* ── date ─────────────────────────────────────────────────── */
function _cmdDate() {
    addTerminalLine(
        `<span style="color:#00d4ff">` +
        `${new Date().toString()}</span>`,
        'info');
}

/* ── echo ─────────────────────────────────────────────────── */
function _cmdEcho(args) {
    // Escape HTML special chars to prevent XSS from echo
    const safe = args.join(' ')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    addTerminalLine(safe || '', 'default');
}

/* ── whoami ───────────────────────────────────────────────── */
function _cmdWhoami() {
    addTerminalLine(
        '<span style="color:#00ff88">root</span>',
        'info');
}

/* ── history ──────────────────────────────────────────────── */
function _cmdHistory() {
    _heading('COMMAND HISTORY');
    if (state.terminalHistory.length === 0) {
        addTerminalLine(
            '  <span style="color:#666">No history yet.</span>');
        return;
    }
    // Display newest-last (reverse the newest-first array)
    [...state.terminalHistory].reverse().forEach((cmd, i) => {
        addTerminalLine(
            `  <span style="color:#666">${String(i + 1).padStart(3)}</span>` +
            `  <span style="color:#e2e8f0">${cmd}</span>`);
    });
}

/* ── theme ────────────────────────────────────────────────── */
function _cmdTheme(args) {
    const t = (args[0] || '').toLowerCase();
    if (t !== 'dark' && t !== 'light') {
        addTerminalLine(
            '<span style="color:#ff4757">' +
            'Usage: theme [dark|light]</span>',
            'error');
        addTerminalLine(
            `<span style="color:#666">` +
            `Current theme: ${state.theme}</span>`);
        return;
    }
    // Sync with the GUI toggle
    const current = document.documentElement.getAttribute('data-theme');
    if (current !== t) toggleTheme();

    addTerminalLine(
        `<span style="color:#00ff88">` +
        `Theme set to ${t}</span>`,
        'info');
}

/* ── cpu ──────────────────────────────────────────────────── */
function _cmdCpu() {
    _heading('CPU SCHEDULER STATUS');
    _kvLine('Algorithm:',   state.currentAlgo.toUpperCase());
    _kvLine('Processes:',   state.cpuProcesses.length);
    _blankLine();

    if (state.cpuProcesses.length === 0) {
        addTerminalLine(
            '  <span style="color:#666">No processes in queue. ' +
            'Go to the CPU Scheduler page to add processes.</span>');
        return;
    }

    addTerminalLine(
        `  <span style="color:#00d4ff">` +
        `${'NAME'.padEnd(8)}` +
        `${'AT'.padEnd(6)}` +
        `${'BT'.padEnd(6)}` +
        `PRIORITY</span>`);

    state.cpuProcesses.forEach(p => {
        addTerminalLine(
            `  <span style="color:${p.color}">${p.name.padEnd(8)}</span>` +
            `<span style="color:#e2e8f0">${String(p.arrival).padEnd(6)}</span>` +
            `<span style="color:#e2e8f0">${String(p.burst).padEnd(6)}</span>` +
            `<span style="color:#ffd700">${p.priority}</span>`);
    });
}

/* ── disk ─────────────────────────────────────────────────── */
function _cmdDisk() {
    _heading('DISK SCHEDULER RESULT');
    if (!diskResult) {
        addTerminalLine(
            '  <span style="color:#666">No simulation run yet. ' +
            'Go to the Disk Scheduler page and run a simulation.</span>');
        return;
    }
    _kvLine('Algorithm:',   diskResult.algo.toUpperCase());
    _kvLine('Total Seek:',  diskResult.totalSeek + ' cylinders');
    _kvLine('Avg Seek:',    diskResult.avgSeek + ' cylinders/req');
    _kvLine('Disk Size:',   diskResult.diskSize + ' cylinders');
    _blankLine();
    addTerminalLine(
        '  <span style="color:#666">Service order:</span>');
    addTerminalLine(
        '  <span style="color:#ff6b35">' +
        diskResult.fullPath.join(' → ') +
        '</span>');
}

/* ── page ─────────────────────────────────────────────────── */
function _cmdPage() {
    _heading('PAGE REPLACEMENT RESULT');
    if (!pagingResult) {
        addTerminalLine(
            '  <span style="color:#666">No simulation run yet. ' +
            'Go to the Paging page and run a simulation.</span>');
        return;
    }
    _kvLine('Algorithm:',  pagingResult.algo);
    _kvLine('Page Faults:', pagingResult.faults);
    _kvLine('Page Hits:',   pagingResult.hits);
    const total = pagingResult.faults + pagingResult.hits;
    _kvLine('Hit Ratio:',
        total > 0
            ? ((pagingResult.hits / total) * 100).toFixed(1) + '%'
            : 'N/A');
}

/* ── banner ───────────────────────────────────────────────── */
function _cmdBanner() {
    const lines = [
        '',
        ' ██████╗ ███████╗      ███████╗██╗███╗   ███╗',
        ' ██╔═══██╗██╔════╝     ██╔════╝██║████╗ ████║',
        ' ██║   ██║███████╗     ███████╗██║██╔████╔██║',
        ' ██║   ██║╚════██║     ╚════██║██║██║╚██╔╝██║',
        ' ╚██████╔╝███████║     ███████║██║██║ ╚═╝ ██║',
        '  ╚═════╝ ╚══════╝     ╚══════╝╚═╝╚═╝     ╚═╝',
        '',
        '        ██████╗ ██████╗  ██████╗',
        '        ██╔══██╗██╔══██╗██╔═══██╗',
        '        ██████╔╝██████╔╝██║   ██║',
        '        ██╔═══╝ ██╔══██╗██║   ██║',
        '        ██║     ██║  ██║╚██████╔╝',
        '        ╚═╝     ╚═╝  ╚═╝ ╚═════╝',
        '',
        '   Operating System Concepts Simulator v3.0',
        '',
    ];
    lines.forEach(l => addTerminalLine(
        `<span style="color:#00d4ff">${l}</span>`));
}

/* ── man ──────────────────────────────────────────────────── */
function _cmdMan(args) {
    if (!args[0]) {
        addTerminalLine(
            '<span style="color:#ff4757">Usage: man [command]</span>',
            'error');
        return;
    }

    const cmd  = args[0].toLowerCase();
    const desc = COMMANDS[cmd];

    if (!desc) {
        addTerminalLine(
            `<span style="color:#ff4757">` +
            `No manual entry for "${cmd}"</span>`,
            'error');
        return;
    }

    _heading(`MAN — ${cmd.toUpperCase()}`);
    _kvLine('NAME:',        cmd);
    _kvLine('SYNOPSIS:',    cmd + ' ' + (desc.split('—')[0] || ''));
    _kvLine('DESCRIPTION:', desc);
}

/* ── reset ────────────────────────────────────────────────── */
function _cmdReset(args) {
    const module = (args[0] || '').toLowerCase();
    const valid  = ['cpu', 'memory', 'mem', 'disk', 'paging', 'processes'];

    if (!module || !valid.includes(module)) {
        addTerminalLine(
            `<span style="color:#ff4757">` +
            `Usage: reset [${valid.join('|')}]</span>`,
            'error');
        return;
    }

    switch (module) {
        case 'cpu':
            clearCPU();
            addTerminalLine(
                '<span style="color:#00ff88">CPU scheduler reset.</span>',
                'info');
            break;
        case 'memory':
        case 'mem':
            initMemory();
            addTerminalLine(
                '<span style="color:#00ff88">Memory manager reset.</span>',
                'info');
            break;
        case 'disk':
            diskResult = null;
            setText('totalSeek', '-');
            setText('avgSeek',   '-');
            setText('diskOrder', '-');
            setHTML('diskServiceOrder',
                'Run the simulation to see service order.');
            addTerminalLine(
                '<span style="color:#00ff88">Disk scheduler reset.</span>',
                'info');
            break;
        case 'paging':
            pagingResult = null;
            setText('pageFaults', '-');
            setText('pageHits',   '-');
            setText('hitRatio',   '-');
            addTerminalLine(
                '<span style="color:#00ff88">Paging module reset.</span>',
                'info');
            break;
        case 'processes':
            initProcessManager();
            addTerminalLine(
                '<span style="color:#00ff88">Process manager reset.</span>',
                'info');
            break;
    }

    addLog(`💻 Terminal: reset ${module}`);
}

/* ── neofetch ─────────────────────────────────────────────── */
function _cmdNeofetch() {
    const used = 128 + state.memAllocated
        .reduce((a, b) => a + (b.size || 0), 0);

    const info = [
        ['OS',       'OS-SIM PRO v3.0'],
        ['Kernel',   'SimKernel 5.15.0-SIM'],
        ['Uptime',   _fmtUptime(state.uptime)],
        ['Shell',    'sim-shell v1.0'],
        ['Theme',    state.theme.charAt(0).toUpperCase() +
                     state.theme.slice(1)],
        ['CPU',      'SimCPU @ 3.6 GHz (virtual)'],
        ['Memory',   `${used} MB / 1024 MB`],
        ['Processes',state.systemProcesses.length],
        ['Scheduler',state.currentAlgo.toUpperCase()],
    ];

    const logo = [
        '  ⬡⬡⬡⬡⬡  ',
        ' ⬡       ⬡ ',
        '⬡  OS-SIM ⬡',
        ' ⬡  PRO  ⬡ ',
        '  ⬡⬡⬡⬡⬡  ',
    ];

    _blankLine();
    info.forEach((row, i) => {
        const logoLine = logo[i] || '           ';
        addTerminalLine(
            `<span style="color:#00d4ff">${logoLine}  </span>` +
            `<span style="color:#00ff88;font-weight:bold;">` +
            `${row[0].padEnd(12)}</span>` +
            `<span style="color:#e2e8f0">${row[1]}</span>`);
    });
    _blankLine();

    // Colour palette swatch
    const colours = [
        '#ff4757','#ff6b35','#ffd700',
        '#00ff88','#00d4ff','#7c3aed','#ff006e',
    ];
    addTerminalLine(
        '  ' + colours.map(c =>
            `<span style="background:${c};color:${c};">███</span>`
        ).join(''));
    _blankLine();
}

// ============================================================
// PRIVATE HELPERS
// ============================================================

/**
 * Format uptime seconds as "Xh Ym Zs".
 * @param {number} seconds
 * @returns {string}
 */
function _fmtUptime(seconds) {
    const s   = Math.max(0, Math.floor(seconds));
    const h   = Math.floor(s / 3600);
    const m   = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}h ${m}m ${sec}s`;
    if (m > 0) return `${m}m ${sec}s`;
    return `${sec}s`;
}