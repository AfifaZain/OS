/* ============================================================
   DISK.JS — OS Simulator Pro
   Disk Scheduling Algorithms:
   FCFS, SSTF, SCAN, C-SCAN, LOOK, C-LOOK.
   Canvas-based head-movement visualisation,
   seek-time statistics, and service-order display.
   ============================================================ */

'use strict';

// ============================================================
// MODULE STATE
// ============================================================

/** Stores the last simulation result for potential re-draw. */
let diskResult = null;

// ============================================================
// ENTRY POINT
// ============================================================

/**
 * Read inputs, run the selected algorithm, render all outputs.
 */
function runDiskScheduler() {
    const algo     = getVal('diskAlgo', 'fcfs');
    const head     = getInt('diskHead',     53,  0, 9999);
    const diskSize = getInt('diskSize',    200, 50, 9999);
    const requests = _parseDiskRequests(diskSize);

    if (requests.length === 0) {
        alert('Please enter at least one valid disk request.');
        return;
    }

    // ── Run selected algorithm ─────────────────────────────
    let order;
    switch (algo) {
        case 'fcfs':  order = fcfsDisk(head, requests, diskSize);  break;
        case 'sstf':  order = sstfDisk(head, requests, diskSize);  break;
        case 'scan':  order = scanDisk(head, requests, diskSize);  break;
        case 'cscan': order = cscanDisk(head, requests, diskSize); break;
        case 'look':  order = lookDisk(head, requests, diskSize);  break;
        case 'clook': order = clookDisk(head, requests, diskSize); break;
        default:      order = fcfsDisk(head, requests, diskSize);
    }

    const fullPath  = [head, ...order];
    const totalSeek = calcSeek(fullPath);
    const avgSeek   = requests.length > 0
        ? (totalSeek / requests.length).toFixed(2)
        : '0.00';

    diskResult = { head, order, fullPath, totalSeek, avgSeek, algo, diskSize };

    // ── Update result boxes ────────────────────────────────
    setText('totalSeek', totalSeek);
    setText('avgSeek',   avgSeek);
    setText('diskOrder', requests.length);

    // ── Service order panel ────────────────────────────────
    renderServiceOrder(fullPath);

    // ── Canvas chart ──────────────────────────────────────
    drawDiskChart(fullPath, diskSize);

    addLog(`💿 Disk scheduler (${algo.toUpperCase()}): ` +
           `total seek = ${totalSeek} cylinders, ` +
           `avg = ${avgSeek} cylinders/request`);
}

// ============================================================
// ALGORITHMS
// ============================================================

/* ── FCFS — First Come First Serve ───────────────────────── */
/**
 * Service requests in the exact order they arrived.
 * Simple but can result in high seek times.
 *
 * @param {number}   head     - initial head position
 * @param {number[]} reqs     - request queue
 * @param {number}   _size    - disk size (unused but kept for API consistency)
 * @returns {number[]} service order
 */
function fcfsDisk(head, reqs, _size) {
    return [...reqs];
}

/* ── SSTF — Shortest Seek Time First ────────────────────── */
/**
 * Always service the request closest to the current head position.
 * Greedy algorithm — minimises each individual seek
 * but can cause starvation of distant requests.
 *
 * @param {number}   head
 * @param {number[]} reqs
 * @param {number}   _size
 * @returns {number[]}
 */
function sstfDisk(head, reqs, _size) {
    const remaining = [...reqs];
    const order     = [];
    let   pos       = head;

    while (remaining.length > 0) {
        // Find the request closest to current head
        let minDist = Infinity;
        let minIdx  = 0;

        remaining.forEach((r, i) => {
            const dist = Math.abs(r - pos);
            if (dist < minDist) {
                minDist = dist;
                minIdx  = i;
            }
        });

        pos = remaining[minIdx];
        order.push(pos);
        remaining.splice(minIdx, 1);
    }

    return order;
}

/* ── SCAN (Elevator) ─────────────────────────────────────── */
/**
 * Head moves in one direction servicing requests,
 * reaches the disk boundary, then reverses direction.
 * Default direction: towards higher cylinder numbers first.
 *
 * @param {number}   head
 * @param {number[]} reqs
 * @param {number}   size  - total number of cylinders
 * @returns {number[]}
 */
function scanDisk(head, reqs, size) {
    const sorted = [...reqs].sort((a, b) => a - b);
    const left   = sorted.filter(r => r <  head).reverse(); // descending
    const right  = sorted.filter(r => r >= head);           // ascending

    // Go right to the boundary (size-1), then service left requests
    return [...right, size - 1, ...left];
}

/* ── C-SCAN (Circular SCAN) ──────────────────────────────── */
/**
 * Head moves in one direction only (towards higher cylinders).
 * When it reaches the end it jumps back to cylinder 0
 * without servicing any requests on the return trip.
 * Provides more uniform wait times than SCAN.
 *
 * @param {number}   head
 * @param {number[]} reqs
 * @param {number}   size
 * @returns {number[]}
 */
function cscanDisk(head, reqs, size) {
    const sorted = [...reqs].sort((a, b) => a - b);
    const right  = sorted.filter(r => r >= head);
    const left   = sorted.filter(r => r <  head);

    // Go to end, jump to 0 (without servicing), then service left side
    return [...right, size - 1, 0, ...left];
}

/* ── LOOK ────────────────────────────────────────────────── */
/**
 * Like SCAN but the head only goes as far as the last
 * request in each direction — does NOT travel to the disk boundary.
 * More efficient than SCAN.
 *
 * @param {number}   head
 * @param {number[]} reqs
 * @param {number}   _size
 * @returns {number[]}
 */
function lookDisk(head, reqs, _size) {
    const sorted = [...reqs].sort((a, b) => a - b);
    const left   = sorted.filter(r => r <  head).reverse();
    const right  = sorted.filter(r => r >= head);

    return [...right, ...left];
}

/* ── C-LOOK (Circular LOOK) ──────────────────────────────── */
/**
 * Like C-SCAN but the head only travels as far as the last
 * request — jumps back to the smallest request (not cylinder 0).
 * Most efficient of the SCAN variants for uniform distributions.
 *
 * @param {number}   head
 * @param {number[]} reqs
 * @param {number}   _size
 * @returns {number[]}
 */
function clookDisk(head, reqs, _size) {
    const sorted = [...reqs].sort((a, b) => a - b);
    const right  = sorted.filter(r => r >= head);
    const left   = sorted.filter(r => r <  head);

    return [...right, ...left];
}

// ============================================================
// SEEK TIME CALCULATOR
// ============================================================

/**
 * Calculate the total seek distance for a given head path.
 * @param {number[]} path - full sequence including initial head position
 * @returns {number} total cylinders traversed
 */
function calcSeek(path) {
    let total = 0;
    for (let i = 1; i < path.length; i++) {
        total += Math.abs(path[i] - path[i - 1]);
    }
    return total;
}

// ============================================================
// SERVICE ORDER PANEL
// ============================================================

/**
 * Render the step-by-step service order with seek distances.
 * @param {number[]} fullPath - [initialHead, ...serviceOrder]
 */
function renderServiceOrder(fullPath) {
    const container = document.getElementById('diskServiceOrder');
    if (!container) return;

    if (fullPath.length < 2) {
        container.innerHTML =
            '<span style="color:var(--text-muted)">No data to display.</span>';
        return;
    }

    let html = '';

    fullPath.forEach((pos, i) => {
        if (i === 0) {
            html += `
                <span class="badge badge-blue"
                      style="margin-right:4px;">
                    HEAD: ${pos}
                </span>`;
            return;
        }

        const diff    = Math.abs(pos - fullPath[i - 1]);
        const seekCol = diff > 50
            ? 'var(--danger)'
            : diff > 20
                ? 'var(--warning)'
                : 'var(--accent-green)';

        html += `
            <span style="display:inline-flex;
                         align-items:center;
                         gap:2px;
                         margin-right:4px;
                         margin-bottom:4px;">
                <span style="color:var(--text-muted)">→</span>
                <span class="text-orange bold">${pos}</span>
                <span style="font-size:10px;
                             color:${seekCol};">
                    (+${diff})
                </span>
            </span>`;
    });

    container.innerHTML = html;
}

// ============================================================
// CANVAS CHART
// ============================================================

/**
 * Draw the disk head movement chart on the canvas.
 * X-axis = cylinder number, Y-axis = time (step index).
 * Each point is connected by a line showing the head path.
 *
 * @param {number[]} path      - full path including initial head
 * @param {number}   diskSize  - total cylinders
 */
function drawDiskChart(path, diskSize) {
    const canvas = document.getElementById('diskCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    // ── Dimensions ────────────────────────────────────────
    // Use the canvas's actual pixel dimensions (not CSS size)
    const W    = canvas.width;
    const H    = canvas.height;
    const padL = 55;
    const padR = 25;
    const padT = 30;
    const padB = 40;
    const chartW = W - padL - padR;
    const chartH = H - padT - padB;

    // ── Clear ─────────────────────────────────────────────
    ctx.clearRect(0, 0, W, H);

    // Background
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    ctx.fillStyle = isDark ? 'rgba(0,0,0,0.35)' : 'rgba(240,244,248,0.8)';
    ctx.fillRect(0, 0, W, H);

    // ── Helper: cylinder → x pixel ────────────────────────
    const toX = cyl =>
        padL + clamp(cyl / diskSize, 0, 1) * chartW;

    // Helper: step index → y pixel
    const toY = idx =>
        padT + (idx / (path.length - 1)) * chartH;

    // ── Grid lines ────────────────────────────────────────
    ctx.strokeStyle = isDark
        ? 'rgba(255,255,255,0.04)'
        : 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 1;

    // Horizontal grid (time steps)
    const hLines = Math.min(path.length - 1, 10);
    for (let i = 0; i <= hLines; i++) {
        const y = padT + (i / hLines) * chartH;
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(W - padR, y);
        ctx.stroke();
    }

    // Vertical grid (cylinder divisions)
    const vLines = 5;
    for (let i = 0; i <= vLines; i++) {
        const x = padL + (i / vLines) * chartW;
        ctx.beginPath();
        ctx.moveTo(x, padT);
        ctx.lineTo(x, H - padB);
        ctx.stroke();
    }

    // ── Axes ──────────────────────────────────────────────
    ctx.strokeStyle = isDark
        ? 'rgba(255,255,255,0.2)'
        : 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1.5;

    // Y-axis (left)
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, H - padB);
    ctx.stroke();

    // X-axis (bottom)
    ctx.beginPath();
    ctx.moveTo(padL, H - padB);
    ctx.lineTo(W - padR, H - padB);
    ctx.stroke();

    // ── X-axis labels (cylinder numbers) ─────────────────
    ctx.fillStyle  = isDark ? '#666' : '#888';
    ctx.font       = '11px Courier New';
    ctx.textAlign  = 'center';

    for (let i = 0; i <= vLines; i++) {
        const cyl = Math.round((i / vLines) * diskSize);
        const x   = padL + (i / vLines) * chartW;
        ctx.fillText(cyl, x, H - padB + 16);
    }

    // X-axis title
    ctx.fillStyle = isDark ? '#555' : '#777';
    ctx.font      = '11px Courier New';
    ctx.fillText('CYLINDER NUMBER →', padL + chartW / 2, H - 5);

    // Y-axis title (rotated)
    ctx.save();
    ctx.translate(14, padT + chartH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('TIME (steps) →', 0, 0);
    ctx.restore();

    // ── Y-axis step labels ────────────────────────────────
    ctx.textAlign = 'right';
    ctx.font      = '10px Courier New';
    ctx.fillStyle = isDark ? '#555' : '#888';
    path.forEach((_, i) => {
        if (i === 0 || i === path.length - 1 ||
            path.length <= 12 || i % Math.ceil(path.length / 8) === 0) {
            ctx.fillText(i, padL - 6, toY(i) + 4);
        }
    });

    // ── Build point array ─────────────────────────────────
    const pts = path.map((cyl, i) => ({
        x:   toX(cyl),
        y:   toY(i),
        cyl,
        idx: i,
    }));

    // ── Draw path (shadow glow) ───────────────────────────
    ctx.save();
    ctx.shadowColor = '#00d4ff';
    ctx.shadowBlur  = 8;
    ctx.strokeStyle = '#00d4ff';
    ctx.lineWidth   = 2.5;
    ctx.lineJoin    = 'round';
    ctx.beginPath();
    pts.forEach((pt, i) =>
        i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y));
    ctx.stroke();
    ctx.restore();

    // ── Draw seek-distance annotations ───────────────────
    ctx.font      = '10px Courier New';
    ctx.textAlign = 'left';

    for (let i = 1; i < pts.length; i++) {
        const dist   = Math.abs(path[i] - path[i - 1]);
        const midX   = (pts[i - 1].x + pts[i].x) / 2 + 6;
        const midY   = (pts[i - 1].y + pts[i].y) / 2;
        ctx.fillStyle = isDark
            ? 'rgba(255,255,255,0.35)'
            : 'rgba(0,0,0,0.4)';
        ctx.fillText(`${dist}`, midX, midY);
    }

    // ── Draw points ───────────────────────────────────────
    pts.forEach((pt, i) => {
        // Point colour: green=start, red=end, cyan=middle
        let fillColor;
        if      (i === 0)             fillColor = '#00ff88';
        else if (i === pts.length - 1) fillColor = '#ff4757';
        else                           fillColor = '#00d4ff';

        // Outer glow ring
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, i === 0 ? 9 : 7, 0, Math.PI * 2);
        ctx.fillStyle = fillColor + '33';   // 20% opacity ring
        ctx.fill();

        // Solid dot
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, i === 0 ? 6 : 4, 0, Math.PI * 2);
        ctx.fillStyle = fillColor;
        ctx.fill();

        // Cylinder label next to the point
        ctx.fillStyle  = isDark ? '#ddd' : '#333';
        ctx.font       = '10px Courier New';
        ctx.textAlign  = 'left';
        // Alternate label side to reduce overlap
        const labelX   = pt.x + (i % 2 === 0 ?  8 : -28);
        ctx.fillText(pt.cyl, labelX, pt.y - 5);
    });

    // ── Legend ────────────────────────────────────────────
    _drawLegend(ctx, W, padT, isDark);
}

/**
 * Draw a small legend in the top-right corner of the canvas.
 */
function _drawLegend(ctx, W, padT, isDark) {
    const items = [
        { color: '#00ff88', label: 'Start (head)' },
        { color: '#00d4ff', label: 'Request'      },
        { color: '#ff4757', label: 'Last request' },
    ];

    const x0 = W - 130;
    let   y0 = padT + 10;

    // Background box
    ctx.fillStyle = isDark
        ? 'rgba(0,0,0,0.5)'
        : 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.roundRect(x0 - 8, y0 - 14, 125, items.length * 20 + 10, 6);
    ctx.fill();

    items.forEach(item => {
        ctx.beginPath();
        ctx.arc(x0, y0, 5, 0, Math.PI * 2);
        ctx.fillStyle = item.color;
        ctx.fill();

        ctx.fillStyle  = isDark ? '#ccc' : '#333';
        ctx.font       = '10px Courier New';
        ctx.textAlign  = 'left';
        ctx.fillText(item.label, x0 + 10, y0 + 4);
        y0 += 20;
    });
}

// ============================================================
// INPUT HELPERS
// ============================================================

/**
 * Parse the disk request queue input.
 * Accepts comma or space separated integers.
 * Clamps values to [0, diskSize - 1].
 *
 * @param {number} diskSize
 * @returns {number[]}
 */
function _parseDiskRequests(diskSize) {
    const raw = getVal('diskRequests', '');
    return raw
        .split(/[\s,]+/)
        .map(s => parseInt(s, 10))
        .filter(n => !isNaN(n) && n >= 0)
        .map(n => clamp(n, 0, diskSize - 1));
}

/**
 * Generate a random disk request queue and populate the input.
 */
function randomDiskRequests() {
    const diskSize = getInt('diskSize', 200, 50, 9999);
    const count    = randInt(6, 12);
    const reqs     = Array.from({ length: count }, () =>
        randInt(0, diskSize - 1));
    const el = document.getElementById('diskRequests');
    if (el) el.value = reqs.join(',');
    addLog(`🎲 Random disk request queue generated ` +
           `(${count} requests, disk size ${diskSize})`);
}

// ============================================================
// WINDOW RESIZE — redraw chart if visible
// ============================================================

/**
 * Redraw the disk chart when the window is resized
 * so the canvas stays correctly scaled.
 */
window.addEventListener('resize', () => {
    if (diskResult &&
        document.getElementById('page-disk')
                .classList.contains('active')) {
        drawDiskChart(diskResult.fullPath, diskResult.diskSize);
    }
});