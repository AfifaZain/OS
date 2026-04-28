/* ============================================================
   MEMORY.JS — OS Simulator Pro
   Contiguous Memory Allocation:
   First Fit, Best Fit, Worst Fit, Next Fit.
   Memory compaction, deallocation, fragmentation tracking,
   and visual memory map renderer.
   ============================================================ */

'use strict';

// ============================================================
// MODULE STATE
// ============================================================

/** Current memory configuration */
let memConfig = {
    total: 1024,   // total memory in MB
    os:    128,    // OS-reserved memory in MB
};

/**
 * Array of memory blocks — each block is one of:
 *   { type:'os',   name:'OS Kernel', size, start }
 *   { type:'proc', name, size, start, color }
 *   { type:'free', name:'FREE',      size, start }
 */
let memBlocks = [];

/** Index into PROCESS_COLORS for the next allocated process */
let memColorIndex = 0;

/**
 * Pointer used by Next Fit — remembers where the last
 * allocation was made (index into memBlocks).
 */
let nextFitPointer = 0;

// ============================================================
// INITIALISE
// ============================================================

/**
 * Reset memory to its initial state:
 *   [ OS block ][ one large FREE block ]
 * Called on boot and when the user clicks "Initialise Memory".
 */
function initMemory() {
    const total = getInt('totalMemory', 1024, 128, 65536);
    const os    = getInt('osMemory',     128,  32, total - 1);

    if (os >= total) {
        alert('OS reserved memory must be less than total memory.');
        return;
    }

    memConfig       = { total, os };
    memColorIndex   = 0;
    nextFitPointer  = 0;

    memBlocks = [
        { type:'os',   name:'OS Kernel', size: os,          start: 0  },
        { type:'free', name:'FREE',       size: total - os,  start: os },
    ];

    // Clear the allocated list used by the dashboard stat
    state.memAllocated = [];

    renderMemory();
    updateMemStats();
    addLog(`🔄 Memory initialised: ${total} MB total, ${os} MB reserved for OS`);
}

// ============================================================
// ALLOCATION
// ============================================================

/**
 * Allocate a process using the selected strategy.
 * Splits the chosen free block into [ proc ][ remaining free ].
 */
function allocateMemory() {
    const name     = getVal('memPName', `P${_procCount() + 1}`);
    const size     = getInt('memPSize', 128, 1);
    const strategy = getVal('memStrategy', 'first');

    if (!name) {
        alert('Please enter a process name.');
        return;
    }
    if (size < 1) {
        alert('Process size must be at least 1 MB.');
        return;
    }

    // Guard: duplicate name
    if (memBlocks.some(b => b.type === 'proc' && b.name === name)) {
        alert(`A process named "${name}" is already allocated.\nChoose a different name.`);
        return;
    }

    // Gather free blocks with enough space, keeping original index
    const freeBlocks = memBlocks
        .map((b, idx) => ({ ...b, idx }))
        .filter(b => b.type === 'free' && b.size >= size);

    if (freeBlocks.length === 0) {
        addLog(`❌ Cannot allocate ${size} MB for "${name}" — insufficient contiguous free memory`);
        _flashVisual();
        return;
    }

    // ── Strategy selection ─────────────────────────────────
    let chosen;

    switch (strategy) {
        case 'first':
            // First block that is large enough
            chosen = freeBlocks[0];
            break;

        case 'best':
            // Smallest block that still fits (minimises wasted space)
            chosen = freeBlocks.reduce((a, b) => a.size <= b.size ? a : b);
            break;

        case 'worst':
            // Largest block (leaves biggest possible remainder)
            chosen = freeBlocks.reduce((a, b) => a.size >= b.size ? a : b);
            break;

        case 'next': {
            // Search from nextFitPointer onwards, wrap around
            const afterPtr = freeBlocks.filter(b => b.idx >= nextFitPointer);
            chosen = afterPtr.length > 0 ? afterPtr[0] : freeBlocks[0];
            break;
        }

        default:
            chosen = freeBlocks[0];
    }

    // ── Split the chosen free block ────────────────────────
    const color     = PROCESS_COLORS[memColorIndex++ % PROCESS_COLORS.length];
    const procBlock = {
        type:  'proc',
        name,
        size,
        start: chosen.start,
        color,
    };
    const remaining = chosen.size - size;

    // Replace the free block with the new proc block
    memBlocks.splice(chosen.idx, 1, procBlock);

    // Insert a smaller free block after it (if any space remains)
    if (remaining > 0) {
        memBlocks.splice(chosen.idx + 1, 0, {
            type:  'free',
            name:  'FREE',
            size:  remaining,
            start: chosen.start + size,
        });
    }

    // Update Next Fit pointer to the block after the one just used
    nextFitPointer = chosen.idx + 1;

    // ── Update dashboard state ─────────────────────────────
    state.memAllocated.push({ name, size, color });

    // Advance the name field
    const nextNum = _procCount() + 1;
    const nameEl  = document.getElementById('memPName');
    if (nameEl) nameEl.value = `P${nextNum}`;

    renderMemory();
    updateMemStats();
    addLog(`✓ "${name}" allocated ${size} MB @ ${chosen.start} MB [${strategy.toUpperCase()} FIT]`);
}

// ============================================================
// DEALLOCATION
// ============================================================

/**
 * Free the memory block belonging to the named process.
 * Adjacent free blocks are merged (coalescing).
 * @param {string} name - process name
 */
function deallocateMemory(name) {
    const idx = memBlocks.findIndex(
        b => b.type === 'proc' && b.name === name);

    if (idx === -1) {
        addLog(`❌ Cannot free "${name}" — block not found`);
        return;
    }

    // Replace proc block with a free block of the same size/start
    const old       = memBlocks[idx];
    memBlocks[idx]  = {
        type:  'free',
        name:  'FREE',
        size:  old.size,
        start: old.start,
    };

    // Remove from dashboard state
    state.memAllocated = state.memAllocated.filter(p => p.name !== name);

    // ── Coalesce adjacent free blocks ──────────────────────
    _coalesce();

    // Reset Next Fit pointer if it is now out of range
    if (nextFitPointer >= memBlocks.length) nextFitPointer = 0;

    renderMemory();
    updateMemStats();
    addLog(`✓ "${name}" deallocated — memory returned to free pool`);
}

/**
 * Merge all adjacent FREE blocks into one.
 * Runs in a single backwards pass (O(n)).
 */
function _coalesce() {
    for (let i = memBlocks.length - 2; i >= 0; i--) {
        if (memBlocks[i].type === 'free' &&
            memBlocks[i + 1] && memBlocks[i + 1].type === 'free') {
            memBlocks[i].size += memBlocks[i + 1].size;
            memBlocks.splice(i + 1, 1);
        }
    }
}

// ============================================================
// COMPACTION
// ============================================================

/**
 * Compact memory: slide all proc blocks to the top (after OS),
 * combining all free space into a single block at the bottom.
 * Simulates physical memory compaction.
 */
function compactMemory() {
    const procs    = memBlocks.filter(b => b.type === 'proc');
    const freeSize = memBlocks
        .filter(b => b.type === 'free')
        .reduce((sum, b) => sum + b.size, 0);

    if (freeSize === 0) {
        addLog('ℹ Memory is fully occupied — nothing to compact');
        return;
    }

    let pos = memConfig.os;
    memBlocks = [
        { type:'os', name:'OS Kernel', size: memConfig.os, start: 0 },
    ];

    procs.forEach(p => {
        memBlocks.push({ ...p, start: pos });
        pos += p.size;
    });

    if (freeSize > 0) {
        memBlocks.push({
            type:  'free',
            name:  'FREE',
            size:  freeSize,
            start: pos,
        });
    }

    nextFitPointer = 0;
    renderMemory();
    updateMemStats();
    addLog(`🔧 Memory compacted — ${freeSize} MB consolidated into one free block`);
}

// ============================================================
// SAMPLE LOADER
// ============================================================

/**
 * Re-initialise memory then allocate a set of sample processes.
 */
function loadSampleMemory() {
    initMemory();
    const samples = [
        { name:'P1', size: 200 },
        { name:'P2', size: 150 },
        { name:'P3', size: 100 },
        { name:'P4', size:  80 },
    ];
    samples.forEach(s => {
        const nameEl = document.getElementById('memPName');
        const sizeEl = document.getElementById('memPSize');
        if (nameEl) nameEl.value = s.name;
        if (sizeEl) sizeEl.value = s.size;
        allocateMemory();
    });
    addLog('📋 Sample memory processes loaded');
}

// ============================================================
// VISUAL RENDERER
// ============================================================

/**
 * Render the memory map as a stacked bar inside #memoryVisual.
 * Each block's height is proportional to its size.
 */
function renderMemory() {
    const visual = document.getElementById('memoryVisual');
    if (!visual) return;

    if (memBlocks.length === 0) {
        visual.innerHTML =
            '<div style="color:var(--text-muted);text-align:center;' +
            'padding-top:150px;font-size:13px;">' +
            'Click "Initialise Memory" to begin</div>';
        return;
    }

    const total     = memConfig.total;
    // Container height — the visual div has max-height:600px in CSS
    const containerH = 560;

    const bars = memBlocks.map(block => {
        // Minimum bar height so tiny blocks are still visible
        const h   = Math.max(28, Math.floor((block.size / total) * containerH));
        const pct = ((block.size / total) * 100).toFixed(1);
        const addrRange = `${block.start} MB – ${block.start + block.size} MB`;

        if (block.type === 'os') {
            return `
                <div class="memory-bar memory-os tooltip"
                     style="height:${h}px"
                     data-tip="${addrRange}">
                    🛡 OS Kernel — ${block.size} MB (${pct}%)
                </div>`;
        }

        if (block.type === 'proc') {
            return `
                <div class="memory-bar memory-occupied tooltip"
                     style="height:${h}px;
                            background:linear-gradient(135deg,
                                ${block.color}cc,
                                ${block.color}88);"
                     data-tip="${addrRange}">
                    ⚙ ${block.name} — ${block.size} MB (${pct}%)
                </div>`;
        }

        // free block
        return `
            <div class="memory-bar memory-free tooltip"
                 style="height:${h}px"
                 data-tip="${addrRange}">
                ░ FREE — ${block.size} MB (${pct}%)
            </div>`;
    });

    visual.innerHTML = bars.join('');
}

// ============================================================
// STATISTICS PANEL
// ============================================================

/**
 * Recalculate and display memory statistics and the
 * allocated-process list with FREE buttons.
 */
function updateMemStats() {
    const usedSize  = memBlocks
        .filter(b => b.type !== 'free')
        .reduce((sum, b) => sum + b.size, 0);

    const freeSize  = memConfig.total - usedSize;
    const freeBlocks = memBlocks.filter(b => b.type === 'free');
    const procCount  = memBlocks.filter(b => b.type === 'proc').length;

    // ── External fragmentation ─────────────────────────────
    // Standard definition: (1 - largest_free / total_free) * 100
    // If there is only one free block (or none) fragmentation = 0 %
    const totalFreeSize   = freeBlocks.reduce((s, b) => s + b.size, 0);
    const largestFreeSize = freeBlocks.length
        ? Math.max(...freeBlocks.map(b => b.size))
        : 0;
    const frag = (totalFreeSize > 0)
        ? Math.round((1 - largestFreeSize / totalFreeSize) * 100)
        : 0;

    // ── Update stat boxes ──────────────────────────────────
    setText('memUsed',  usedSize);
    setText('memFree',  freeSize);
    setText('memFrag',  frag + '%');
    setText('memProcs', procCount);

    // ── Allocated process list ─────────────────────────────
    const listEl = document.getElementById('memProcessList');
    if (!listEl) return;

    const procs = memBlocks.filter(b => b.type === 'proc');

    if (procs.length === 0) {
        listEl.innerHTML =
            '<div style="color:var(--text-muted);padding:8px 0;">' +
            'No processes allocated yet.</div>';
        return;
    }

    listEl.innerHTML = procs.map(p => `
        <div class="flex-row"
             style="justify-content:space-between;
                    padding:8px 0;
                    border-bottom:1px solid var(--border);
                    align-items:center;">
            <span style="color:${p.color};font-weight:bold;">
                ■ ${p.name}
            </span>
            <span style="font-size:11px;color:var(--text-muted);">
                ${p.size} MB @ ${p.start} MB
            </span>
            <button class="btn btn-danger"
                    style="padding:3px 10px;font-size:10px;"
                    onclick="deallocateMemory('${p.name}')">
                FREE
            </button>
        </div>`).join('');
}

// ============================================================
// PRIVATE HELPERS
// ============================================================

/** Count currently allocated process blocks. */
function _procCount() {
    return memBlocks.filter(b => b.type === 'proc').length;
}

/**
 * Briefly flash the memory visual red to signal allocation failure.
 */
function _flashVisual() {
    const visual = document.getElementById('memoryVisual');
    if (!visual) return;
    visual.style.transition = 'border-color 0.1s';
    visual.style.borderColor = 'var(--danger)';
    setTimeout(() => {
        visual.style.borderColor = '';
    }, 600);
}