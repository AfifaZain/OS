/* ============================================================
   DEADLOCK.JS — OS Simulator Pro
   Deadlock Detection & Avoidance:
   Banker's Algorithm (safety check + safe sequence),
   Resource Allocation Graph (RAG) visualisation,
   Need matrix computation, available vector tracking.
   ============================================================ */

'use strict';

// ============================================================
// MODULE STATE
// ============================================================

/**
 * All Banker's Algorithm data lives here.
 * Populated by initBankers() and mutated by the editable matrix.
 *
 * @typedef {Object} BankersData
 * @property {number}     procs  - number of processes
 * @property {number}     res    - number of resource types
 * @property {number[]}   total  - total instances of each resource
 * @property {number[][]} alloc  - allocation matrix  [proc][res]
 * @property {number[][]} max    - maximum demand matrix [proc][res]
 * @property {number[]}   avail  - currently available resources
 */

/** @type {BankersData} */
let bankersData = {
    procs: 0,
    res:   0,
    total: [],
    alloc: [],
    max:   [],
    avail: [],
};

/**
 * Resource labels — up to 5 resource types (A–E).
 */
const RES_LABELS = ['A', 'B', 'C', 'D', 'E'];

// ============================================================
// DEFAULT DATA SETS
// ============================================================

/**
 * Classic Banker's Algorithm example from Silberschatz OS textbook.
 * 5 processes, 3 resource types, total = [10, 5, 7].
 */
const DEFAULT_ALLOC = [
    [0, 1, 0],
    [2, 0, 0],
    [3, 0, 2],
    [2, 1, 1],
    [0, 0, 2],
];

const DEFAULT_MAX = [
    [7, 5, 3],
    [3, 2, 2],
    [9, 0, 2],
    [2, 2, 2],
    [4, 3, 3],
];

// ============================================================
// INITIALISATION
// ============================================================

/**
 * Read user inputs, build the Banker's data structure,
 * render the editable matrix, and draw the RAG.
 * Called when user clicks "⚙️ INITIALIZE".
 */
function initBankers() {
    const p = getInt('bankProcs', 5, 1, 10);
    const r = getInt('bankRes',   3, 1,  5);

    // Parse total resources string (space separated)
    const totalRaw = getVal('bankTotal', '10 5 7')
        .split(/\s+/)
        .map(s => parseInt(s, 10))
        .filter(n => !isNaN(n) && n >= 0);

    // Pad or trim to exactly r values
    const total = Array.from({ length: r }, (_, i) =>
        totalRaw[i] !== undefined ? totalRaw[i] : 5);

    // ── Build allocation matrix ────────────────────────────
    // Start with defaults (trimmed/padded to p×r), or zeros
    const alloc = Array.from({ length: p }, (_, i) => {
        const defaultRow = DEFAULT_ALLOC[i]
            ? DEFAULT_ALLOC[i].slice(0, r)
            : [];
        return Array.from({ length: r }, (_, j) =>
            defaultRow[j] !== undefined ? defaultRow[j] : 0);
    });

    // ── Build max matrix ──────────────────────────────────
    const max = Array.from({ length: p }, (_, i) => {
        const defaultRow = DEFAULT_MAX[i]
            ? DEFAULT_MAX[i].slice(0, r)
            : [];
        return Array.from({ length: r }, (_, j) =>
            defaultRow[j] !== undefined ? defaultRow[j] : 1);
    });

    // ── Validate: alloc[i][j] must not exceed max[i][j] ──
    // Fix silently rather than reject
    for (let i = 0; i < p; i++) {
        for (let j = 0; j < r; j++) {
            if (alloc[i][j] > max[i][j]) {
                alloc[i][j] = max[i][j];
            }
        }
    }

    // ── Compute available ─────────────────────────────────
    const avail = _computeAvail(total, alloc, r, p);

    // ── Store ─────────────────────────────────────────────
    bankersData = { procs: p, res: r, total, alloc, max, avail };

    // ── Render ────────────────────────────────────────────
    renderBankersMatrix();
    renderRAG();
    showEl('bankersMatrix');
    hideEl('bankersResult');

    addLog(`⚙️ Banker's Algorithm initialised: ` +
           `${p} processes, ${r} resource type(s), ` +
           `total = [${total.join(', ')}]`);
}

// ============================================================
// MATRIX RENDERER
// ============================================================

/**
 * Render the editable Allocation / Max / Need table.
 * Each Allocation and Max cell is an <input> so the user
 * can tweak values before running the safety check.
 */
function renderBankersMatrix() {
    const { procs, res, alloc, max, avail } = bankersData;
    const labels = RES_LABELS.slice(0, res);

    // ── Available vector display ───────────────────────────
    const availStr = labels.map((l, j) =>
        `<span class="text-green bold">${l}:${avail[j]}</span>`
    ).join('  ');

    // ── Column headers ─────────────────────────────────────
    const allocHeaders = labels.map(l =>
        `<th style="color:var(--accent-purple)">ALLOC-${l}</th>`).join('');
    const maxHeaders   = labels.map(l =>
        `<th style="color:var(--accent-cyan)">MAX-${l}</th>`).join('');
    const needHeaders  = labels.map(l =>
        `<th style="color:var(--accent-orange)">NEED-${l}</th>`).join('');

    // ── Rows ──────────────────────────────────────────────
    const rows = Array.from({ length: procs }, (_, i) => {
        const need = _computeNeedRow(alloc[i], max[i]);

        const allocCells = alloc[i].map((v, j) => `
            <td>
                <input type="number"
                       class="bankers-cell"
                       value="${v}"
                       min="0"
                       max="${max[i][j]}"
                       onchange="onAllocChange(${i},${j},this.value)"
                       style="width:50px;
                              background:rgba(124,58,237,0.08);
                              border:1px solid var(--accent-purple);
                              color:var(--text-primary);
                              border-radius:4px;
                              padding:4px;
                              font-family:monospace;
                              font-size:11px;
                              text-align:center;">
            </td>`).join('');

        const maxCells = max[i].map((v, j) => `
            <td>
                <input type="number"
                       class="bankers-cell"
                       value="${v}"
                       min="${alloc[i][j]}"
                       onchange="onMaxChange(${i},${j},this.value)"
                       style="width:50px;
                              background:rgba(0,212,255,0.08);
                              border:1px solid var(--accent-cyan);
                              color:var(--text-primary);
                              border-radius:4px;
                              padding:4px;
                              font-family:monospace;
                              font-size:11px;
                              text-align:center;">
            </td>`).join('');

        const needCells = need.map(v => {
            const isNeg = v < 0;
            const color = isNeg
                ? 'var(--danger)'
                : 'var(--accent-orange)';
            const title = isNeg
                ? 'title="Allocation exceeds Max — invalid!"'
                : '';
            return `<td style="color:${color};font-weight:bold;" ${title}>
                        ${isNeg ? '⚠ ' + v : v}
                    </td>`;
        }).join('');

        return `
            <tr>
                <td class="highlight bold">P${i}</td>
                ${allocCells}
                ${maxCells}
                ${needCells}
            </tr>`;
    }).join('');

    setHTML('bankersTable', `
        <div style="font-size:12px;
                    color:var(--text-secondary);
                    margin-bottom:12px;
                    padding:8px 12px;
                    background:rgba(0,255,136,0.04);
                    border:1px solid rgba(0,255,136,0.15);
                    border-radius:6px;">
            <span class="bold">Available:</span> &nbsp; ${availStr}
            &nbsp;&nbsp;
            <span class="text-muted" style="font-size:10px;">
                (Total − Σ Allocation)
            </span>
        </div>
        <div style="overflow-x:auto;">
            <table class="process-table">
                <thead>
                    <tr>
                        <th>PROC</th>
                        ${allocHeaders}
                        ${maxHeaders}
                        ${needHeaders}
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
        <div style="font-size:11px;
                    color:var(--text-muted);
                    margin-top:8px;">
            💡 Edit Allocation and Max cells directly.
               Need = Max − Allocation.
               Red values indicate invalid entries.
        </div>`);
}

// ============================================================
// CELL CHANGE HANDLERS
// ============================================================

/**
 * Called when an Allocation cell is edited.
 * Clamps value to [0, max[i][j]], recomputes available + need.
 *
 * @param {number} i   - process index
 * @param {number} j   - resource index
 * @param {string} val - new raw string value from input
 */
function onAllocChange(i, j, val) {
    const parsed = parseInt(val, 10);
    if (isNaN(parsed)) return;

    // Allocation cannot exceed Max demand
    const clamped = clamp(parsed, 0, bankersData.max[i][j]);
    bankersData.alloc[i][j] = clamped;

    _refreshDerived();
}

/**
 * Called when a Max cell is edited.
 * Ensures Max >= current Allocation.
 *
 * @param {number} i   - process index
 * @param {number} j   - resource index
 * @param {string} val - new raw string value from input
 */
function onMaxChange(i, j, val) {
    const parsed = parseInt(val, 10);
    if (isNaN(parsed) || parsed < 0) return;

    bankersData.max[i][j] = parsed;

    // If alloc > new max, fix alloc silently
    if (bankersData.alloc[i][j] > parsed) {
        bankersData.alloc[i][j] = parsed;
    }

    _refreshDerived();
}

/**
 * Recompute available vector and re-render matrix + RAG.
 * Called after any cell edit.
 * @private
 */
function _refreshDerived() {
    const { total, alloc, res, procs } = bankersData;
    bankersData.avail = _computeAvail(total, alloc, res, procs);
    renderBankersMatrix();
    renderRAG();
    // Hide stale result card
    hideEl('bankersResult');
}

// ============================================================
// BANKER'S SAFETY ALGORITHM
// ============================================================

/**
 * Run the Banker's safety algorithm.
 * Determines whether the system is in a safe state and,
 * if so, produces a safe sequence.
 *
 * Algorithm (Silberschatz):
 *   Work  = Available
 *   Finish[i] = false for all i
 *   Repeat:
 *     Find i such that Finish[i]=false AND Need[i] <= Work
 *     Work += Alloc[i]; Finish[i] = true
 *   Until no such i exists.
 *   Safe iff all Finish[i] = true.
 */
function runBankers() {
    const { procs, res, alloc, max, avail } = bankersData;

    // ── Validate: check for negative Need values ───────────
    for (let i = 0; i < procs; i++) {
        for (let j = 0; j < res; j++) {
            if (max[i][j] < alloc[i][j]) {
                _showBankersResult(false, [], [],
                    `Process P${i} has Allocation[${j}] > Max[${j}]. ` +
                    `Please fix the matrix before running.`);
                return;
            }
        }
    }

    const need   = alloc.map((row, i) => _computeNeedRow(row, max[i]));
    const work   = [...avail];
    const finish = new Array(procs).fill(false);
    const seq    = [];                 // safe sequence (process indices)
    const steps  = [];                 // trace for display

    // ── Main loop ─────────────────────────────────────────
    // Run at most procs² iterations to guarantee termination
    let found = true;
    while (found) {
        found = false;
        for (let i = 0; i < procs; i++) {
            if (finish[i]) continue;

            // Check if Need[i] <= Work
            const canRun = need[i].every((n, j) => n <= work[j]);
            if (canRun) {
                // Simulate process completion
                const workBefore = [...work];
                need[i].forEach((_, j) => {
                    work[j] += alloc[i][j];
                });
                finish[i] = true;
                seq.push(i);
                steps.push({
                    proc:        i,
                    need:        [...need[i]],
                    workBefore,
                    workAfter:   [...work],
                });
                found = true;
                break;   // restart search from P0 each iteration
            }
        }
    }

    const isSafe = finish.every(Boolean);
    const deadlocked = finish
        .map((f, i) => (!f ? `P${i}` : null))
        .filter(Boolean);

    _showBankersResult(isSafe, seq, steps, '', deadlocked);
    addLog(isSafe
        ? `✅ Banker's: SAFE STATE — sequence: < ${seq.map(i => `P${i}`).join(' → ')} >`
        : `⚠️ Banker's: UNSAFE STATE — deadlocked: ${deadlocked.join(', ')}`);
}

// ============================================================
// RESULT RENDERER
// ============================================================

/**
 * Render the safety check result card.
 *
 * @param {boolean}  isSafe      - true if system is in safe state
 * @param {number[]} seq         - safe sequence (process indices)
 * @param {Object[]} steps       - step trace array
 * @param {string}   errorMsg    - validation error (if any)
 * @param {string[]} deadlocked  - names of deadlocked processes
 */
function _showBankersResult(isSafe, seq, steps, errorMsg = '', deadlocked = []) {
    const card    = document.getElementById('bankersResult');
    const content = document.getElementById('bankersResultContent');
    if (!card || !content) return;

    showEl('bankersResult');

    if (errorMsg) {
        content.innerHTML = `
            <div class="alert alert-danger">
                ⚠ ${errorMsg}
            </div>`;
        return;
    }

    if (isSafe) {
        // ── Safe state ─────────────────────────────────────
        const seqStr = seq.map(i => `P${i}`).join(' → ');

        // Build step trace table
        const labels  = RES_LABELS.slice(0, bankersData.res);
        const traceRows = steps.map((s, idx) => `
            <tr>
                <td class="highlight bold">Step ${idx + 1}</td>
                <td class="text-green bold">P${s.proc}</td>
                <td style="color:var(--accent-orange)">
                    [${s.need.join(', ')}]
                </td>
                <td style="color:var(--text-muted)">
                    [${s.workBefore.join(', ')}]
                </td>
                <td style="color:var(--accent-cyan)">
                    [${s.workAfter.join(', ')}]
                </td>
            </tr>`).join('');

        content.innerHTML = `
            <div class="alert alert-success">
                ✅ SYSTEM IS IN A <strong>SAFE STATE</strong>
                — No deadlock possible
            </div>

            <div style="font-size:13px;
                        color:var(--text-secondary);
                        line-height:2.2;
                        margin-bottom:15px;">
                <div>
                    <span class="text-muted">Safe Sequence:</span>
                    &nbsp;
                    <span class="text-green bold" style="font-size:15px;">
                        &lt; ${seqStr} &gt;
                    </span>
                </div>
                <div style="font-size:11px;color:var(--text-muted);">
                    All ${bankersData.procs} processes can complete
                    in the above order without deadlock.
                </div>
            </div>

            <div class="card-title" style="margin-top:15px;">
                📋 EXECUTION TRACE
            </div>
            <div style="overflow-x:auto;">
                <table class="process-table">
                    <thead>
                        <tr>
                            <th>STEP</th>
                            <th>PROCESS</th>
                            <th>NEED [${labels.join(',')}]</th>
                            <th>WORK BEFORE</th>
                            <th>WORK AFTER</th>
                        </tr>
                    </thead>
                    <tbody>${traceRows}</tbody>
                </table>
            </div>`;
    } else {
        // ── Unsafe state ───────────────────────────────────
        const safeStr = seq.length > 0
            ? `Partial sequence found: &lt; ${seq.map(i => `P${i}`).join(' → ')} &gt;`
            : 'No process could be scheduled.';

        content.innerHTML = `
            <div class="alert alert-danger">
                ⚠ DEADLOCK DETECTED
                — System is in an <strong>UNSAFE STATE</strong>
            </div>

            <div style="font-size:13px;
                        color:var(--text-secondary);
                        line-height:2.2;">
                <div>
                    <span class="text-muted">Deadlocked processes:</span>
                    &nbsp;
                    <span class="text-red bold">
                        ${deadlocked.join(', ')}
                    </span>
                </div>
                <div style="font-size:11px;color:var(--text-muted);">
                    ${safeStr}
                </div>
                <div style="font-size:11px;
                            color:var(--text-muted);
                            margin-top:8px;">
                    These processes cannot complete —
                    their resource needs cannot be satisfied
                    with the current allocation.
                </div>
            </div>

            <div class="mt-10">
                <div class="card-title">💡 RECOVERY OPTIONS</div>
                <div style="font-size:12px;
                            color:var(--text-secondary);
                            line-height:2;">
                    <div>
                        <span class="text-orange bold">1. Process Termination:</span>
                        Kill one or more of:
                        <span class="text-red">${deadlocked.join(', ')}</span>
                    </div>
                    <div>
                        <span class="text-orange bold">2. Resource Preemption:</span>
                        Forcibly reclaim resources from a deadlocked process.
                    </div>
                    <div>
                        <span class="text-orange bold">3. Rollback:</span>
                        Roll back a process to a safe checkpoint and restart.
                    </div>
                </div>
            </div>`;
    }
}

// ============================================================
// RESOURCE ALLOCATION GRAPH (RAG)
// ============================================================

/**
 * Draw the Resource Allocation Graph.
 *
 * Nodes:
 *   • Processes P0…Pn  — circles — left column
 *   • Resources R0…Rm  — squares — right column
 *
 * Edges:
 *   • Allocation edge (R → P): resource assigned to process
 *     Drawn as solid purple dashed arrow.
 *   • Request edge   (P → R): process needs resource
 *     Drawn as solid cyan dotted arrow.
 */
function renderRAG() {
    const { procs, res, alloc, max, avail } = bankersData;
    const need = alloc.map((row, i) => _computeNeedRow(row, max[i]));

    const container = document.getElementById('ragNodes');
    const svg       = document.getElementById('ragSvg');
    if (!container || !svg) return;

    container.innerHTML = '';
    // Clear only the edges (not the <defs> block)
    Array.from(svg.querySelectorAll('line, path, text.rag-label'))
         .forEach(el => el.remove());

    // ── Layout ────────────────────────────────────────────
    // Container is 350px tall, full width (~500px typically).
    const W        = 500;
    const H        = 350;
    const procX    = 80;                          // x for process nodes
    const resX     = W - 80;                     // x for resource nodes
    const maxNodes = Math.max(procs, Math.min(res, 5));

    // ── Compute node positions ─────────────────────────────
    const procPositions = Array.from({ length: procs }, (_, i) => ({
        x: procX,
        y: _nodeY(i, procs, H),
        type: 'p',
        id: i,
    }));

    const resCount = Math.min(res, 5);            // show at most 5
    const resPositions = Array.from({ length: resCount }, (_, j) => ({
        x: resX,
        y: _nodeY(j, resCount, H),
        type: 'r',
        id: j,
    }));

    // ── Render process nodes ──────────────────────────────
    procPositions.forEach(pos => {
        const div = document.createElement('div');
        div.className   = 'rag-node process-node';
        div.style.left  = (pos.x - 30) + 'px';
        div.style.top   = (pos.y - 30) + 'px';
        div.textContent = `P${pos.id}`;
        div.title       = `Process P${pos.id}`;
        container.appendChild(div);
    });

    // ── Render resource nodes ─────────────────────────────
    resPositions.forEach(pos => {
        const div = document.createElement('div');
        div.className   = 'rag-node resource-node';
        div.style.left  = (pos.x - 30) + 'px';
        div.style.top   = (pos.y - 30) + 'px';
        div.textContent = `R${pos.id}`;
        div.title       =
            `Resource R${pos.id} — ` +
            `Total: ${bankersData.total[pos.id] || 0}, ` +
            `Available: ${avail[pos.id] || 0}`;
        container.appendChild(div);
    });

    // ── Draw allocation edges (R → P) ─────────────────────
    for (let i = 0; i < procs; i++) {
        for (let j = 0; j < resCount; j++) {
            if (alloc[i][j] > 0) {
                _drawEdge(svg,
                    resPositions[j],
                    procPositions[i],
                    '#7c3aed',          // purple
                    '6,3',              // dashed
                    'arrow',            // marker
                    `${alloc[i][j]}`    // label
                );
            }
        }
    }

    // ── Draw request / need edges (P → R) ─────────────────
    for (let i = 0; i < procs; i++) {
        for (let j = 0; j < resCount; j++) {
            if (need[i][j] > 0) {
                _drawEdge(svg,
                    procPositions[i],
                    resPositions[j],
                    '#00d4ff',          // cyan
                    '2,4',              // dotted
                    'arrow-need',
                    `${need[i][j]}`
                );
            }
        }
    }

    // ── Draw node column labels ───────────────────────────
    _svgText(svg, procX, 18, 'PROCESSES',
        '10px Courier New', 'var(--accent-purple)', 'middle');
    _svgText(svg, resX,  18, 'RESOURCES',
        '10px Courier New', 'var(--accent-cyan)',   'middle');
}

// ============================================================
// RAG PRIVATE HELPERS
// ============================================================

/**
 * Calculate the Y centre for node index i out of n nodes
 * within a container of height H.
 * @private
 */
function _nodeY(i, n, H) {
    if (n === 1) return H / 2;
    const padding = 50;
    return padding + (i / (n - 1)) * (H - padding * 2);
}

/**
 * Draw an SVG line (edge) between two node positions.
 * Offsets the endpoints to the node border (not centre).
 *
 * @param {SVGElement} svg
 * @param {{x,y}}      from     - source node centre
 * @param {{x,y}}      to       - target node centre
 * @param {string}     color    - stroke colour
 * @param {string}     dash     - stroke-dasharray value
 * @param {string}     marker   - marker-end id
 * @param {string}     label    - weight label text
 * @private
 */
function _drawEdge(svg, from, to, color, dash, marker, label) {
    const NODE_R = 30;   // node radius in px

    // Direction vector
    const dx   = to.x - from.x;
    const dy   = to.y - from.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const ux   = dx / dist;
    const uy   = dy / dist;

    // Start/end points on node borders
    const x1 = from.x + ux * NODE_R;
    const y1 = from.y + uy * NODE_R;
    const x2 = to.x   - ux * NODE_R;
    const y2 = to.y   - uy * NODE_R;

    // Line
    const line = document.createElementNS(
        'http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    line.setAttribute('stroke',           color);
    line.setAttribute('stroke-width',     '1.8');
    line.setAttribute('stroke-dasharray', dash);
    line.setAttribute('marker-end',       `url(#${marker})`);
    line.setAttribute('opacity',          '0.8');
    svg.appendChild(line);

    // Weight label at midpoint
    if (label && label !== '0') {
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2 - 6;
        _svgText(svg, mx, my, label,
            'bold 11px Courier New', color, 'middle', 'rag-label');
    }
}

/**
 * Create and append an SVG text element.
 * @private
 */
function _svgText(svg, x, y, text, font, fill, anchor, className = '') {
    const el = document.createElementNS(
        'http://www.w3.org/2000/svg', 'text');
    el.setAttribute('x',           x);
    el.setAttribute('y',           y);
    el.setAttribute('font',        font);
    el.setAttribute('fill',        fill);
    el.setAttribute('text-anchor', anchor);
    el.style.font = font;
    if (className) el.classList.add(className);
    el.textContent = text;
    svg.appendChild(el);
}

// ============================================================
// COMPUTATION HELPERS
// ============================================================

/**
 * Compute the Need vector for a single process.
 * Need[j] = Max[j] − Alloc[j]
 *
 * @param {number[]} allocRow - allocation for one process
 * @param {number[]} maxRow   - max demand for one process
 * @returns {number[]}
 */
function _computeNeedRow(allocRow, maxRow) {
    return maxRow.map((m, j) => m - (allocRow[j] || 0));
}

/**
 * Compute the Available resource vector.
 * Available[j] = Total[j] − Σ_i Alloc[i][j]
 *
 * @param {number[]}   total  - total resources per type
 * @param {number[][]} alloc  - full allocation matrix
 * @param {number}     res    - number of resource types
 * @param {number}     procs  - number of processes
 * @returns {number[]}
 */
function _computeAvail(total, alloc, res, procs) {
    return Array.from({ length: res }, (_, j) => {
        const allocated = alloc.reduce(
            (sum, row) => sum + (row[j] || 0), 0);
        // Available cannot go negative
        return Math.max(0, (total[j] || 0) - allocated);
    });
}