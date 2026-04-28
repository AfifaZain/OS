/* ============================================================
   PAGING.JS — OS Simulator Pro
   Page Replacement Algorithms:
   FIFO, LRU, Optimal (Belady's), Clock.
   Step-by-step trace table, frame visualisation,
   hit/fault sequence display, and statistics.
   ============================================================ */

'use strict';

// ============================================================
// MODULE STATE
// ============================================================

/**
 * Stores the last simulation result so it can be
 * re-rendered without re-running the algorithm.
 */
let pagingResult = null;

// ============================================================
// ENTRY POINT
// ============================================================

/**
 * Read inputs, run the selected algorithm, render all output panels.
 */
function runPageReplacement() {
    const algo      = getVal('pageAlgo', 'fifo');
    const numFrames = getInt('numFrames', 3, 1, 8);
    const refString = _parseRefString();

    if (refString.length === 0) {
        alert('Please enter a valid page reference string.');
        return;
    }
    if (numFrames < 1) {
        alert('Number of frames must be at least 1.');
        return;
    }

    // ── Run selected algorithm ─────────────────────────────
    let result;
    switch (algo) {
        case 'fifo':    result = runFIFO(refString, numFrames);    break;
        case 'lru':     result = runLRU(refString, numFrames);     break;
        case 'optimal': result = runOptimal(refString, numFrames); break;
        case 'clock':   result = runClock(refString, numFrames);   break;
        default:        result = runFIFO(refString, numFrames);
    }

    pagingResult = result;

    // ── Render all output panels ───────────────────────────
    renderPageStats(result, refString);
    renderPageSequence(result, refString);
    renderFrameState(result, numFrames);
    renderTraceTable(result, numFrames);

    addLog(`📄 Page replacement (${algo.toUpperCase()}): ` +
           `${result.faults} fault(s), ${result.hits} hit(s) ` +
           `— Hit ratio: ${_hitRatio(result, refString)}%`);
}

// ============================================================
// ALGORITHMS
// ============================================================

/* ── FIFO — First In First Out ───────────────────────────── */
/**
 * Replace the page that has been in memory the longest.
 * Uses a simple queue: new pages are pushed to the back,
 * evictions remove from the front.
 *
 * @param {number[]} refs      - page reference string
 * @param {number}   frames   - number of physical frames
 * @returns {SimResult}
 */
function runFIFO(refs, frames) {
    const memory = [];          // acts as a FIFO queue
    let faults   = 0;
    let hits     = 0;
    const trace  = [];

    refs.forEach(page => {
        const isHit = memory.includes(page);

        if (isHit) {
            hits++;
        } else {
            faults++;
            if (memory.length >= frames) {
                memory.shift();           // evict oldest (front of queue)
            }
            memory.push(page);            // newest goes to back
        }

        trace.push({
            page,
            frames:  [...memory],         // snapshot after this step
            fault:   !isHit,
            evicted: isHit ? null : (memory.length > frames ? memory[0] : null),
        });
    });

    return { faults, hits, trace, algo: 'FIFO' };
}

/* ── LRU — Least Recently Used ──────────────────────────── */
/**
 * Replace the page that was used least recently.
 * Implemented by moving a page to the back of the array
 * on every access; the front is always the LRU candidate.
 *
 * @param {number[]} refs
 * @param {number}   frames
 * @returns {SimResult}
 */
function runLRU(refs, frames) {
    const memory = [];
    let faults   = 0;
    let hits     = 0;
    const trace  = [];

    refs.forEach(page => {
        const idx   = memory.indexOf(page);
        const isHit = idx !== -1;

        if (isHit) {
            hits++;
            // Move to the back (most-recently-used position)
            memory.splice(idx, 1);
            memory.push(page);
        } else {
            faults++;
            let evicted = null;
            if (memory.length >= frames) {
                evicted = memory.shift();     // front = LRU page
            }
            memory.push(page);
            trace.push({
                page,
                frames:  [...memory],
                fault:   true,
                evicted,
            });
            return;
        }

        trace.push({
            page,
            frames:  [...memory],
            fault:   false,
            evicted: null,
        });
    });

    return { faults, hits, trace, algo: 'LRU' };
}

/* ── Optimal (Belady's) ──────────────────────────────────── */
/**
 * Replace the page whose next use is farthest in the future.
 * Requires knowledge of the entire future reference string —
 * only feasible as a theoretical benchmark.
 *
 * @param {number[]} refs
 * @param {number}   frames
 * @returns {SimResult}
 */
function runOptimal(refs, frames) {
    const memory = [];
    let faults   = 0;
    let hits     = 0;
    const trace  = [];

    refs.forEach((page, idx) => {
        const isHit = memory.includes(page);

        if (isHit) {
            hits++;
            trace.push({ page, frames: [...memory], fault: false, evicted: null });
            return;
        }

        faults++;
        let evicted = null;

        if (memory.length >= frames) {
            // For each page in memory find its NEXT use index
            let farthestDist  = -1;
            let replaceIdx    = 0;

            memory.forEach((p, i) => {
                // Look for p in the remaining reference string
                const nextUse = refs.indexOf(p, idx + 1);
                // If never used again treat as "infinity"
                const dist    = (nextUse === -1) ? Infinity : nextUse;

                if (dist > farthestDist) {
                    farthestDist = dist;
                    replaceIdx   = i;
                }
            });

            evicted = memory[replaceIdx];
            memory.splice(replaceIdx, 1);
        }

        memory.push(page);
        trace.push({ page, frames: [...memory], fault: true, evicted });
    });

    return { faults, hits, trace, algo: 'Optimal' };
}

/* ── Clock Algorithm ─────────────────────────────────────── */
/**
 * Second-chance / Clock page replacement.
 * Each frame has a reference bit (R).
 * On a fault:
 *   - If R=0 → evict this frame.
 *   - If R=1 → set R=0, advance clock hand, repeat.
 * On a hit: set R=1 for that frame.
 *
 * @param {number[]} refs
 * @param {number}   frames
 * @returns {SimResult}
 */
function runClock(refs, frames) {
    // Circular frame array; null = empty slot
    const memory  = new Array(frames).fill(null);
    const refBits = new Array(frames).fill(0);
    let   hand    = 0;          // clock hand position
    let   faults  = 0;
    let   hits    = 0;
    const trace   = [];

    refs.forEach(page => {
        const idx   = memory.indexOf(page);
        const isHit = idx !== -1;

        if (isHit) {
            hits++;
            refBits[idx] = 1;   // give a second chance
            trace.push({
                page,
                frames:  [...memory],
                fault:   false,
                evicted: null,
                hand,
            });
            return;
        }

        // Page fault — find a victim using the clock hand
        faults++;
        let evicted = null;

        // Scan until we find a frame with R=0
        // Worst case: two full rotations (all R bits flipped once)
        let safetyLimit = frames * 2;
        while (safetyLimit-- > 0) {
            if (refBits[hand] === 0) {
                // Evict this frame
                evicted      = memory[hand];
                memory[hand] = page;
                refBits[hand]= 1;
                hand         = (hand + 1) % frames;
                break;
            } else {
                // Give second chance: clear R bit, advance hand
                refBits[hand] = 0;
                hand          = (hand + 1) % frames;
            }
        }

        trace.push({
            page,
            frames:  [...memory],
            fault:   true,
            evicted,
            hand,
        });
    });

    return { faults, hits, trace, algo: 'Clock' };
}

// ============================================================
// RENDERERS
// ============================================================

/* ── Statistics panel ────────────────────────────────────── */
/**
 * Update the faults / hits / hit-ratio result boxes.
 */
function renderPageStats(result, refs) {
    setText('pageFaults', result.faults);
    setText('pageHits',   result.hits);
    setText('hitRatio',   _hitRatio(result, refs) + '%');
}

/* ── Page reference sequence display ─────────────────────── */
/**
 * Render the colour-coded sequence row (green = hit, red = fault).
 */
function renderPageSequence(result, refs) {
    const container = document.getElementById('pageSeqDisplay');
    if (!container) return;

    if (refs.length === 0) {
        container.innerHTML =
            '<div style="color:var(--text-muted);font-size:12px;">' +
            'Run simulation to see sequence</div>';
        return;
    }

    container.innerHTML = refs.map((page, i) => {
        const step = result.trace[i];
        const cls  = step.fault ? 'done-fault' : 'done-hit';
        const tip  = step.fault
            ? `Fault — "${page}" loaded into memory`
            : `Hit  — "${page}" already in memory`;
        return `
            <div class="seq-item ${cls} tooltip"
                 data-tip="${tip}">
                ${page}
            </div>`;
    }).join('');
}

/* ── Frame state display ─────────────────────────────────── */
/**
 * Show the final frame contents after the simulation ends.
 */
function renderFrameState(result, numFrames) {
    const container = document.getElementById('pageFrames');
    if (!container) return;

    if (result.trace.length === 0) {
        container.innerHTML =
            '<div style="color:var(--text-muted);font-size:12px;">' +
            'Run simulation to see frames</div>';
        return;
    }

    const lastStep = result.trace[result.trace.length - 1];

    container.innerHTML = Array.from({ length: numFrames }, (_, i) => {
        const val    = lastStep.frames[i];
        const filled = val !== undefined && val !== null;
        const cls    = filled ? 'filled' : '';
        return `
            <div class="page-frame ${cls}">
                <div class="frame-label">Frame ${i}</div>
                ${filled ? val : '—'}
            </div>`;
    }).join('');
}

/* ── Step-by-step trace table ────────────────────────────── */
/**
 * Build the full step-by-step table showing frame contents
 * at every reference step.
 *
 * Columns: PAGE | F0 | F1 | … | Fn-1 | STATUS | EVICTED
 */
function renderTraceTable(result, numFrames) {
    const headEl = document.getElementById('pageTraceHead');
    const bodyEl = document.getElementById('pageTraceBody');
    if (!headEl || !bodyEl) return;

    // ── Header ─────────────────────────────────────────────
    const frameCols = Array.from({ length: numFrames }, (_, i) =>
        `<th>F${i}</th>`).join('');
    headEl.innerHTML =
        `<th>REF</th>${frameCols}<th>STATUS</th><th>EVICTED</th>`;

    // ── Body ───────────────────────────────────────────────
    bodyEl.innerHTML = result.trace.map((step, rowIdx) => {
        const frameCells = Array.from({ length: numFrames }, (_, i) => {
            const val      = step.frames[i];
            const hasVal   = val !== undefined && val !== null;
            // Highlight the newly loaded page
            const isNew    = step.fault && hasVal && val === step.page;
            const style    = isNew
                ? 'color:var(--accent-green);font-weight:bold;'
                : 'color:var(--accent-purple);';
            return `<td style="${style}">${hasVal ? val : '—'}</td>`;
        }).join('');

        const statusBadge = step.fault
            ? '<span class="badge badge-red">FAULT</span>'
            : '<span class="badge badge-green">HIT</span>';

        const evictedCell = (step.evicted !== null && step.evicted !== undefined)
            ? `<span class="text-red">${step.evicted}</span>`
            : '<span class="text-muted">—</span>';

        // Zebra stripe every other row
        const rowStyle = rowIdx % 2 === 0
            ? ''
            : 'background:rgba(255,255,255,0.02);';

        return `
            <tr style="${rowStyle}">
                <td class="bold highlight">${step.page}</td>
                ${frameCells}
                <td>${statusBadge}</td>
                <td>${evictedCell}</td>
            </tr>`;
    }).join('');
}

// ============================================================
// INPUT HELPERS
// ============================================================

/**
 * Parse the page reference string input.
 * Accepts comma-separated or space-separated integers.
 * Filters out NaN values silently.
 * @returns {number[]}
 */
function _parseRefString() {
    const raw = getVal('pageRefString', '');
    return raw
        .split(/[\s,]+/)
        .map(s => parseInt(s, 10))
        .filter(n => !isNaN(n) && n >= 0);
}

/**
 * Generate a random page reference string and populate the input.
 * Pages are in the range [0, maxPage].
 */
function randomPageRef() {
    const length  = randInt(15, 25);
    const maxPage = randInt(6, 10);
    const refs    = Array.from({ length }, () => randInt(0, maxPage));
    const el      = document.getElementById('pageRefString');
    if (el) el.value = refs.join(',');
    addLog(`🎲 Random page reference string generated (length ${length}, pages 0–${maxPage})`);
}

// ============================================================
// PRIVATE HELPERS
// ============================================================

/**
 * Calculate hit ratio as a percentage string (1 decimal place).
 * @param {SimResult} result
 * @param {number[]}  refs
 * @returns {string}
 */
function _hitRatio(result, refs) {
    if (!refs || refs.length === 0) return '0.0';
    return ((result.hits / refs.length) * 100).toFixed(1);
}

/**
 * @typedef {Object} SimResult
 * @property {number}      faults  - total page faults
 * @property {number}      hits    - total page hits
 * @property {TraceStep[]} trace   - one entry per reference
 * @property {string}      algo    - algorithm name
 */

/**
 * @typedef {Object} TraceStep
 * @property {number}      page    - page referenced
 * @property {number[]}    frames  - frame contents after this step
 * @property {boolean}     fault   - true if this was a page fault
 * @property {number|null} evicted - page evicted (null if none)
 * @property {number}      [hand]  - clock hand position (Clock only)
 */