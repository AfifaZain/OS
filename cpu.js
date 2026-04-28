/* ============================================================
   CPU.JS — OS Simulator Pro
   CPU Scheduling algorithms:
   FCFS, SJF, SRTF, Priority (non-preemptive & preemptive),
   Round Robin.
   Gantt chart rendering & performance metrics.
   ============================================================ */

'use strict';

// ============================================================
// ALGORITHM INFO TEXT
// ============================================================
const ALGO_INFO = {
    fcfs: `
        <div><span class="text-green bold">FCFS — First Come First Serve</span></div>
        <div class="mt-10">Processes are executed in the order of arrival.
        Non-preemptive. Simple but suffers from the
        <span class="text-orange">"Convoy Effect"</span> where short
        processes wait behind long ones.</div>
        <div class="mt-10">
            <span class="highlight bold">Characteristics:</span>
            <div>• Non-preemptive</div>
            <div>• Easy to implement</div>
            <div>• Poor average waiting time when burst times vary widely</div>
        </div>`,

    sjf: `
        <div><span class="text-green bold">SJF — Shortest Job First (Non-Preemptive)</span></div>
        <div class="mt-10">Selects the process with the
        <span class="text-green">smallest burst time</span> from the
        ready queue. Optimal for minimising average waiting time but
        requires advance knowledge of burst times.</div>
        <div class="mt-10">
            <span class="highlight bold">Characteristics:</span>
            <div>• Non-preemptive</div>
            <div>• Optimal average waiting time (non-preemptive)</div>
            <div>• May cause starvation of long processes</div>
        </div>`,

    sjfp: `
        <div><span class="text-green bold">SRTF — Shortest Remaining Time First (Preemptive)</span></div>
        <div class="mt-10">Preemptive version of SJF. If a new process
        arrives with a shorter remaining burst time than the current
        process, it preempts it. Achieves
        <span class="text-green">optimal average waiting time</span>.</div>
        <div class="mt-10">
            <span class="highlight bold">Characteristics:</span>
            <div>• Preemptive</div>
            <div>• Optimal average waiting time overall</div>
            <div>• High context-switch overhead</div>
        </div>`,

    priority: `
        <div><span class="text-green bold">Priority Scheduling (Non-Preemptive)</span></div>
        <div class="mt-10">Each process is assigned a priority number.
        The process with the
        <span class="text-green">lowest priority number</span> (highest
        priority) runs first. Can cause
        <span class="text-orange">starvation</span> — solved with aging.</div>
        <div class="mt-10">
            <span class="highlight bold">Characteristics:</span>
            <div>• Non-preemptive</div>
            <div>• Lower number = higher priority in this simulator</div>
            <div>• Starvation possible for low-priority processes</div>
        </div>`,

    priorityp: `
        <div><span class="text-green bold">Priority Scheduling (Preemptive)</span></div>
        <div class="mt-10">If a higher-priority process arrives while
        another is running, it immediately preempts the CPU.
        More responsive to high-priority tasks.</div>
        <div class="mt-10">
            <span class="highlight bold">Characteristics:</span>
            <div>• Preemptive</div>
            <div>• Better response for critical tasks</div>
            <div>• Starvation still possible</div>
        </div>`,

    rr: `
        <div><span class="text-green bold">Round Robin</span></div>
        <div class="mt-10">Each process receives a fixed
        <span class="text-green">time quantum</span>. After the quantum
        expires the process is placed back in the ready queue.
        Fair allocation — prevents starvation.</div>
        <div class="mt-10">
            <span class="highlight bold">Characteristics:</span>
            <div>• Preemptive</div>
            <div>• Fair — no starvation</div>
            <div>• Performance depends heavily on quantum size</div>
            <div>• Large quantum → behaves like FCFS</div>
            <div>• Small quantum → high context-switch overhead</div>
        </div>`,
};

const METRICS_LEGEND = `
    <div class="mt-10"><span class="highlight bold">Metrics:</span></div>
    <div>• <span class="text-green">TAT</span>
         = Finish Time &minus; Arrival Time
         &nbsp;(Turnaround Time)</div>
    <div>• <span class="text-green">WT</span>
         = TAT &minus; Burst Time
         &nbsp;(Waiting Time)</div>
    <div>• <span class="text-green">RT</span>
         = First CPU access &minus; Arrival Time
         &nbsp;(Response Time)</div>`;

// ============================================================
// UI HELPERS
// ============================================================

/** Show/hide the quantum input depending on algorithm. */
function toggleQuantum() {
    const algo = getVal('cpuAlgorithm', 'fcfs');
    const qg   = document.getElementById('quantumGroup');
    if (qg) qg.style.display = (algo === 'rr') ? 'block' : 'none';
    updateAlgoInfo(algo);
    state.currentAlgo = algo;
}

/** Populate the algorithm info panel. */
function updateAlgoInfo(algo) {
    const info = ALGO_INFO[algo] || ALGO_INFO['fcfs'];
    setHTML('algoInfo', info + METRICS_LEGEND);
}

// ============================================================
// PROCESS MANAGEMENT (UI)
// ============================================================

/** Add a single process entered by the user to the list. */
function addCPUProcess() {
    const name     = getVal('cpuPName', `P${state.cpuProcesses.length + 1}`);
    const arrival  = getInt('cpuArrival',  0, 0);
    const burst    = getInt('cpuBurst',    1, 1);
    const priority = getInt('cpuPriority', 1, 1);

    if (burst < 1) {
        alert('Burst time must be at least 1.');
        return;
    }

    const color = PROCESS_COLORS[state.cpuProcesses.length % PROCESS_COLORS.length];
    state.cpuProcesses.push({
        id:       state.cpuProcesses.length,
        name:     name || `P${state.cpuProcesses.length + 1}`,
        arrival,
        burst,
        priority,
        color,
        // runtime fields (filled during simulation)
        remaining: burst,
        finish:    0,
        start:     -1,
    });

    // Advance the name field to the next default
    const next = state.cpuProcesses.length + 1;
    const nameEl = document.getElementById('cpuPName');
    if (nameEl) nameEl.value = `P${next}`;

    // Randomise the next burst suggestion
    const burstEl = document.getElementById('cpuBurst');
    if (burstEl) burstEl.value = randInt(2, 10);

    renderCPUTable();
    addLog(`✓ Process ${name} added (AT:${arrival}, BT:${burst}, PR:${priority})`);
}

/** Load a pre-built sample set of processes. */
function loadSampleCPU() {
    state.cpuProcesses = [];
    const samples = [
        { name:'P1', arrival:0, burst:8,  priority:3 },
        { name:'P2', arrival:1, burst:4,  priority:1 },
        { name:'P3', arrival:2, burst:9,  priority:2 },
        { name:'P4', arrival:3, burst:5,  priority:4 },
        { name:'P5', arrival:4, burst:2,  priority:1 },
    ];
    samples.forEach((s, i) => {
        state.cpuProcesses.push({
            ...s,
            id:        i,
            color:     PROCESS_COLORS[i],
            remaining: s.burst,
            finish:    0,
            start:     -1,
        });
    });
    renderCPUTable();
    addLog('📋 Sample CPU processes loaded');
}

/** Remove a process from the list by its array index. */
function removeCPUProcess(index) {
    if (index < 0 || index >= state.cpuProcesses.length) return;
    const removed = state.cpuProcesses.splice(index, 1)[0];
    renderCPUTable();
    addLog(`✕ Process ${removed.name} removed from list`);
}

/** Clear all processes and reset the output panels. */
function clearCPU() {
    state.cpuProcesses = [];
    renderCPUTable();
    setHTML('ganttContainer',
        '<div style="color:var(--text-muted);font-size:12px;' +
        'text-align:center;padding:40px 0;">' +
        'Add processes and run the scheduler to see the Gantt chart</div>');
    hideEl('cpuResultsCard');
    addLog('🗑 CPU process list cleared');
}

// ============================================================
// TABLE RENDERER
// ============================================================

/** Re-render the process input table. */
function renderCPUTable() {
    const tbody = document.getElementById('cpuProcessBody');
    if (!tbody) return;

    if (state.cpuProcesses.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align:center;
                    color:var(--text-muted);padding:20px;">
                    No processes added yet
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = state.cpuProcesses.map((p, i) => `
        <tr>
            <td>
                <div class="process-color"
                     style="background:${p.color}"></div>
            </td>
            <td><span class="bold">${p.name}</span></td>
            <td>${p.arrival}</td>
            <td>${p.burst}</td>
            <td>${p.priority}</td>
            <td>
                <button class="btn btn-danger"
                        style="padding:4px 10px;font-size:10px;"
                        onclick="removeCPUProcess(${i})">✕</button>
            </td>
        </tr>`).join('');
}

// ============================================================
// SCHEDULER DISPATCHER
// ============================================================

/** Validate inputs, pick the algorithm, run it, render output. */
function runCPUScheduler() {
    if (state.cpuProcesses.length === 0) {
        alert('Please add at least one process first.');
        return;
    }

    const algo    = getVal('cpuAlgorithm', 'fcfs');
    const quantum = getInt('timeQuantum', 2, 1);

    // Deep-clone so simulations never mutate the original list
    const procs = state.cpuProcesses.map(p => ({
        ...p,
        remaining: p.burst,
        finish:    0,
        start:     -1,
    }));

    let timeline = [];

    switch (algo) {
        case 'fcfs':      timeline = simulateFCFS(procs);          break;
        case 'sjf':       timeline = simulateSJF(procs);           break;
        case 'sjfp':      timeline = simulateSRTF(procs);          break;
        case 'priority':  timeline = simulatePriority(procs);      break;
        case 'priorityp': timeline = simulatePriorityP(procs);     break;
        case 'rr':        timeline = simulateRR(procs, quantum);   break;
        default:          timeline = simulateFCFS(procs);
    }

    renderGantt(timeline);
    renderResults(procs, timeline);
    addLog(`⚡ Scheduler run: ${algo.toUpperCase()} | ` +
           `${state.cpuProcesses.length} processes`);
}

// ============================================================
// SCHEDULING ALGORITHMS
// ============================================================

/* ── FCFS ─────────────────────────────────────────────────── */
function simulateFCFS(procs) {
    const sorted   = [...procs].sort((a, b) =>
        a.arrival - b.arrival || a.id - b.id);
    let time       = 0;
    const timeline = [];

    sorted.forEach(p => {
        // CPU is idle until this process arrives
        if (time < p.arrival) time = p.arrival;
        p.start  = (p.start === -1) ? time : p.start;
        timeline.push({
            name:  p.name,
            start: time,
            end:   time + p.burst,
            color: p.color,
        });
        time    += p.burst;
        p.finish = time;
    });

    // Write results back to the original array
    _copyBack(procs, sorted);
    return timeline;
}

/* ── SJF (Non-Preemptive) ────────────────────────────────── */
function simulateSJF(procs) {
    let time       = 0;
    const timeline = [];
    const done     = new Set();
    const ps       = procs.map(p => ({ ...p }));

    while (done.size < ps.length) {
        const available = ps.filter(p =>
            p.arrival <= time && !done.has(p.name));

        if (available.length === 0) {
            // CPU idle — jump to next arrival
            const next = ps
                .filter(p => !done.has(p.name))
                .reduce((a, b) => a.arrival < b.arrival ? a : b);
            time = next.arrival;
            continue;
        }

        // Tie-break: smaller arrival time first, then by id
        available.sort((a, b) =>
            a.burst - b.burst || a.arrival - b.arrival || a.id - b.id);

        const p = available[0];
        p.start  = (p.start === -1) ? time : p.start;
        timeline.push({
            name:  p.name,
            start: time,
            end:   time + p.burst,
            color: p.color,
        });
        time    += p.burst;
        p.finish = time;
        done.add(p.name);
    }

    _copyBack(procs, ps);
    return timeline;
}

/* ── SRTF (Preemptive SJF) ───────────────────────────────── */
function simulateSRTF(procs) {
    const ps       = procs.map(p => ({ ...p }));
    let time       = 0;
    let last       = null;
    const timeline = [];

    while (ps.some(p => p.remaining > 0)) {
        const available = ps.filter(p =>
            p.arrival <= time && p.remaining > 0);

        if (available.length === 0) {
            time++;
            continue;
        }

        available.sort((a, b) =>
            a.remaining - b.remaining || a.arrival - b.arrival);

        const p = available[0];
        if (p.start === -1) p.start = time;

        // Extend or start a new block
        if (last === p.name && timeline.length > 0) {
            timeline[timeline.length - 1].end++;
        } else {
            timeline.push({
                name:  p.name,
                start: time,
                end:   time + 1,
                color: p.color,
            });
        }

        p.remaining--;
        if (p.remaining === 0) p.finish = time + 1;
        last = p.name;
        time++;
    }

    _copyBack(procs, ps);
    return mergeTimeline(timeline);
}

/* ── Priority (Non-Preemptive) ───────────────────────────── */
function simulatePriority(procs) {
    let time       = 0;
    const timeline = [];
    const done     = new Set();
    const ps       = procs.map(p => ({ ...p }));

    while (done.size < ps.length) {
        const available = ps.filter(p =>
            p.arrival <= time && !done.has(p.name));

        if (available.length === 0) {
            const next = ps
                .filter(p => !done.has(p.name))
                .reduce((a, b) => a.arrival < b.arrival ? a : b);
            time = next.arrival;
            continue;
        }

        // Lower priority number = higher priority
        available.sort((a, b) =>
            a.priority - b.priority || a.arrival - b.arrival);

        const p = available[0];
        p.start  = (p.start === -1) ? time : p.start;
        timeline.push({
            name:  p.name,
            start: time,
            end:   time + p.burst,
            color: p.color,
        });
        time    += p.burst;
        p.finish = time;
        done.add(p.name);
    }

    _copyBack(procs, ps);
    return timeline;
}

/* ── Priority (Preemptive) ───────────────────────────────── */
function simulatePriorityP(procs) {
    const ps       = procs.map(p => ({ ...p }));
    let time       = 0;
    let last       = null;
    const timeline = [];

    while (ps.some(p => p.remaining > 0)) {
        const available = ps.filter(p =>
            p.arrival <= time && p.remaining > 0);

        if (available.length === 0) {
            time++;
            continue;
        }

        available.sort((a, b) =>
            a.priority - b.priority || a.arrival - b.arrival);

        const p = available[0];
        if (p.start === -1) p.start = time;

        if (last === p.name && timeline.length > 0) {
            timeline[timeline.length - 1].end++;
        } else {
            timeline.push({
                name:  p.name,
                start: time,
                end:   time + 1,
                color: p.color,
            });
        }

        p.remaining--;
        if (p.remaining === 0) p.finish = time + 1;
        last = p.name;
        time++;
    }

    _copyBack(procs, ps);
    return mergeTimeline(timeline);
}

/* ── Round Robin ─────────────────────────────────────────── */
function simulateRR(procs, quantum) {
    const ps       = procs.map(p => ({ ...p }))
                          .sort((a, b) => a.arrival - b.arrival || a.id - b.id);
    let time       = 0;
    let i          = 0;           // index into sorted arrival list
    const queue    = [];          // ready queue (FIFO)
    const timeline = [];
    const inQueue  = new Set();   // track who is already enqueued

    // Seed with processes that arrive at time 0
    while (i < ps.length && ps[i].arrival <= time) {
        queue.push(ps[i]);
        inQueue.add(ps[i].name);
        i++;
    }

    while (queue.length > 0 || i < ps.length) {
        if (queue.length === 0) {
            // CPU idle — jump to next arrival
            time = ps[i].arrival;
            while (i < ps.length && ps[i].arrival <= time) {
                queue.push(ps[i]);
                inQueue.add(ps[i].name);
                i++;
            }
        }

        const p    = queue.shift();
        inQueue.delete(p.name);
        if (p.start === -1) p.start = time;

        const exec = Math.min(quantum, p.remaining);
        timeline.push({
            name:  p.name,
            start: time,
            end:   time + exec,
            color: p.color,
        });
        time       += exec;
        p.remaining -= exec;

        // Enqueue newly arrived processes BEFORE re-queuing current
        while (i < ps.length && ps[i].arrival <= time) {
            if (!inQueue.has(ps[i].name)) {
                queue.push(ps[i]);
                inQueue.add(ps[i].name);
            }
            i++;
        }

        if (p.remaining > 0) {
            queue.push(p);
            inQueue.add(p.name);
        } else {
            p.finish = time;
        }
    }

    _copyBack(procs, ps);
    return timeline;
}

// ============================================================
// HELPERS
// ============================================================

/**
 * Merge consecutive timeline blocks for the same process.
 * Needed for preemptive algorithms to produce cleaner Gantt charts.
 */
function mergeTimeline(tl) {
    if (tl.length === 0) return [];
    const merged = [{ ...tl[0] }];

    for (let i = 1; i < tl.length; i++) {
        const last = merged[merged.length - 1];
        if (last.name === tl[i].name && last.end === tl[i].start) {
            last.end = tl[i].end;   // extend the existing block
        } else {
            merged.push({ ...tl[i] });
        }
    }
    return merged;
}

/**
 * Copy simulation results (finish, start) back to the original
 * procs array using process name as the key.
 */
function _copyBack(original, simulated) {
    const map = {};
    simulated.forEach(p => { map[p.name] = p; });
    original.forEach(p => {
        if (map[p.name]) {
            p.finish = map[p.name].finish;
            p.start  = map[p.name].start;
        }
    });
}

// ============================================================
// GANTT CHART RENDERER
// ============================================================

function renderGantt(timeline) {
    const container = document.getElementById('ganttContainer');
    if (!container) return;

    if (timeline.length === 0) {
        container.innerHTML =
            '<div style="color:var(--text-muted);font-size:12px;' +
            'text-align:center;padding:40px 0;">No timeline to display</div>';
        return;
    }

    const totalTime = timeline[timeline.length - 1].end;
    // Scale: aim for ~700 px wide but keep blocks at least 40 px wide
    const scale = clamp(700 / totalTime, 20, 80);

    // ── Gantt blocks ───────────────────────────────────────
    const blocksHTML = timeline.map(block => {
        const w        = (block.end - block.start) * scale;
        const duration = block.end - block.start;
        return `
            <div class="gantt-block tooltip"
                 style="width:${w}px; background:${block.color};"
                 data-tip="${block.name}: ${block.start}→${block.end} (${duration} unit${duration !== 1 ? 's' : ''})">
                ${w > 35 ? block.name : ''}
            </div>`;
    }).join('');

    // ── Time labels ────────────────────────────────────────
    // Collect unique time points to label
    const timePoints = [];
    timeline.forEach(block => {
        if (!timePoints.includes(block.start)) timePoints.push(block.start);
    });
    timePoints.push(totalTime);   // always show the end time

    // Build labels aligned to block widths
    let labelHTML  = '';
    let coveredPx  = 0;
    timeline.forEach(block => {
        const w = (block.end - block.start) * scale;
        labelHTML += `<div class="gantt-label" style="width:${w}px">${block.start}</div>`;
        coveredPx += w;
    });
    // Final time label
    labelHTML += `<div class="gantt-label">${totalTime}</div>`;

    container.innerHTML = `
        <div class="gantt-chart">${blocksHTML}</div>
        <div class="gantt-labels">${labelHTML}</div>`;
}

// ============================================================
// RESULTS TABLE & METRICS
// ============================================================

function renderResults(procs, timeline) {
    const tbody = document.getElementById('cpuResultsBody');
    if (!tbody) return;

    // Build a map of first-start time from timeline
    // (more accurate than p.start for preemptive algorithms)
    const firstStart = {};
    timeline.forEach(block => {
        if (firstStart[block.name] === undefined) {
            firstStart[block.name] = block.start;
        }
    });

    let totalTAT = 0;
    let totalWT  = 0;
    let totalRT  = 0;

    const rows = procs.map(p => {
        const tat = p.finish - p.arrival;
        const wt  = tat - p.burst;
        // Response time = first time the process got the CPU
        const rt  = (firstStart[p.name] !== undefined)
                    ? firstStart[p.name] - p.arrival
                    : p.start - p.arrival;

        totalTAT += tat;
        totalWT  += Math.max(0, wt);   // clamp — can't be negative
        totalRT  += Math.max(0, rt);

        return `
            <tr>
                <td>
                    <span style="color:${p.color}">●</span>
                    <span class="bold">${p.name}</span>
                </td>
                <td>${p.arrival}</td>
                <td>${p.burst}</td>
                <td>${p.finish}</td>
                <td class="text-green">${tat}</td>
                <td class="text-yellow">${Math.max(0, wt)}</td>
                <td class="highlight">${Math.max(0, rt)}</td>
            </tr>`;
    });

    tbody.innerHTML = rows.join('');

    const n = procs.length;
    setHTML('cpuAvgResults', `
        <div class="result-box">
            <div class="result-value text-green">${fmt(totalTAT / n)}</div>
            <div class="result-label">Avg Turnaround</div>
        </div>
        <div class="result-box">
            <div class="result-value text-yellow">${fmt(totalWT / n)}</div>
            <div class="result-label">Avg Wait Time</div>
        </div>
        <div class="result-box">
            <div class="result-value highlight">${fmt(totalRT / n)}</div>
            <div class="result-label">Avg Response</div>
        </div>`);

    showEl('cpuResultsCard');
}