# OS-SIMULATOR PRO v3.0
## Operating System Concepts Simulator

---

## PROJECT OVERVIEW

This is a comprehensive **web-based operating system simulator** built with vanilla JavaScript, HTML, and CSS. It provides interactive visualizations of core operating system concepts typically taught in university-level OS courses.

**Location:** `C:\Users\ASUS\Downloads\afifa\`

---

## ARCHITECTURE

### File Structure

```
afifa/
├── index.html      # Main HTML with all page layouts
├── style.css       # Complete styling with dark/light themes
├── main.js         # Core application logic, boot sequence, navigation
├── cpu.js          # CPU scheduling algorithms
├── memory.js       # Contiguous memory allocation
├── paging.js       # Page replacement algorithms
├── disk.js         # Disk scheduling algorithms
├── processes.js    # Process lifecycle management
├── deadlock.js     # Banker's algorithm & deadlock detection
└── terminal.js     # Simulated shell terminal
```

### Design Pattern

The application uses a **modular architecture** where each OS concept is encapsulated in its own JavaScript file. All modules share a central `state` object defined in `main.js` for cross-module data sharing.

---

## CORE MODULES EXPLAINED

### 1. CPU SCHEDULER (`cpu.js`)

**Purpose:** Simulates CPU process scheduling with visual Gantt charts.

**Algorithms Implemented:**
- **FCFS** (First Come First Serve) - Non-preemptive, processes execute in arrival order
- **SJF** (Shortest Job First) - Non-preemptive, selects shortest burst time
- **SRTF** (Shortest Remaining Time First) - Preemptive SJF
- **Priority Scheduling** - Both preemptive and non-preemptive versions
- **Round Robin** - Time quantum-based fair scheduling

**How It Works:**
1. User adds processes with: name, arrival time, burst time, priority
2. Algorithm sorts/processes based on its logic
3. Timeline is built tracking which process runs when
4. Gantt chart renders with color-coded blocks
5. Metrics calculated: Turnaround Time, Waiting Time, Response Time

**Key Functions:**
- `simulateFCFS/SJF/SRTF/RR()` - Algorithm implementations
- `renderGantt()` - Draws visual timeline
- `renderResults()` - Shows performance metrics table

---

### 2. MEMORY MANAGER (`memory.js`)

**Purpose:** Visualizes contiguous memory allocation strategies.

**Strategies Implemented:**
- **First Fit** - Allocate from first sufficiently large free block
- **Best Fit** - Allocate from smallest block that fits (minimizes waste)
- **Worst Fit** - Allocate from largest block (leaves big fragments)
- **Next Fit** - Like First Fit but starts from last allocation point

**How It Works:**
1. Memory initialized with OS-reserved space + free space
2. User requests allocation with process name and size
3. Strategy selects appropriate free block
4. Block splits into [allocated][remaining free]
5. Visual memory map updates showing colored blocks
6. Fragmentation percentage calculated and displayed

**Features:**
- Memory compaction (slides all processes together)
- Deallocation with coalescing (merges adjacent free blocks)
- Real-time fragmentation tracking

---

### 3. PAGING (`paging.js`)

**Purpose:** Simulates virtual memory page replacement algorithms.

**Algorithms Implemented:**
- **FIFO** (First In First Out) - Evicts oldest page
- **LRU** (Least Recently Used) - Evicts least recently accessed page
- **Optimal** (Belady's) - Evicts page not needed for longest time (theoretical best)
- **Clock** - Second-chance approximation of LRU using reference bits

**How It Works:**
1. User provides page reference string (e.g., 7,0,1,2,0,3...)
2. Sets number of physical frames (1-8)
3. Algorithm processes each reference:
   - **Hit:** Page already in memory
   - **Fault:** Page must be loaded, possibly evicting another
4. Step-by-step trace table shows frame state at each step
5. Statistics: Page faults, hits, hit ratio

**Visual Output:**
- Color-coded frame states
- Sequence display showing hit/fault per reference
- Detailed trace table with evicted pages

---

### 4. DISK SCHEDULER (`disk.js`)

**Purpose:** Visualizes disk head movement for I/O scheduling.

**Algorithms Implemented:**
- **FCFS** - First Come First Serve
- **SSTF** - Shortest Seek Time First (greedy closest-first)
- **SCAN** - Elevator algorithm (goes to boundary, reverses)
- **C-SCAN** - Circular SCAN (jump back without servicing)
- **LOOK** - SCAN but only to last request (not boundary)
- **C-LOOK** - Circular LOOK

**How It Works:**
1. User sets initial head position and request queue
2. Algorithm determines service order
3. Canvas draws head movement path over time
4. Total seek distance and average calculated
5. Service order displayed with seek distances between requests

**Visual Output:**
- Canvas chart with X=cylinder, Y=time
- Glow-effect path showing head movement
- Seek distance annotations on each segment

---

### 5. PROCESS MANAGER (`processes.js`)

**Purpose:** Simulates process lifecycle and state management.

**Features:**
- Process creation (fork, system process)
- Process termination with zombie state transition
- State transitions: Running ↔ Waiting ↔ Sleeping → Zombie
- Real-time CPU usage fluctuation
- Process statistics dashboard

**How It Works:**
1. Boot processes initialized (init, kernel, scheduler, etc.)
2. Live update interval randomizes CPU usage every 2 seconds
3. User can fork processes or spawn system processes
4. Kill transitions process to zombie, then reaps after 1.5s
5. State badge clickable to cycle through states

**Process States:**
- **Running** - Actively using CPU
- **Waiting** - Waiting for I/O or event
- **Sleeping** - Suspended/idle
- **Zombie** - Terminated but not yet reaped

---

### 6. DEADLOCK DETECTOR (`deadlock.js`)

**Purpose:** Implements Banker's Algorithm for deadlock avoidance.

**Features:**
- Configurable processes (1-10) and resource types (1-5)
- Editable Allocation and Max matrices
- Automatic Need calculation (Need = Max - Allocation)
- Safety algorithm execution with step-by-step trace
- Resource Allocation Graph (RAG) visualization

**How Banker's Algorithm Works:**
1. Initialize with total resources, allocation matrix, max matrix
2. Compute Available = Total - ΣAllocation
3. Compute Need = Max - Allocation for each process
4. Safety check:
   - Work = Available, Finish[] = false
   - Find process where Need ≤ Work and not finished
   - If found: Work += Allocation, mark finished, repeat
   - Safe if all processes can finish

**RAG Visualization:**
- Purple dashed arrows: Resource → Process (allocation)
- Cyan dotted arrows: Process → Resource (request/need)
- Visual detection of circular wait conditions

---

### 7. TERMINAL (`terminal.js`)

**Purpose:** Simulated shell terminal for system interaction.

**Commands Available:**
- `ps` - List processes with state/CPU/memory
- `top` - System resource summary
- `free` - Memory information
- `kill [pid]` - Terminate process
- `fork [name]` - Create new process
- `schedule [algo]` - Change CPU scheduler
- `mem` - Show memory block map
- `ls/pwd` - Virtual filesystem navigation
- `history` - Command history
- `theme [dark|light]` - Switch UI theme
- `neofetch` - System info display
- `man [cmd]` - Command manual
- `reset [module]` - Reset simulator module

**Features:**
- Tab completion for commands
- Arrow key history navigation
- Ctrl+C interrupt, Ctrl+L clear
- Command history (up to 50 commands)
- Colored output matching terminal aesthetics

---

## GLOBAL STATE MANAGEMENT

The `state` object in `main.js` serves as the central data store:

```javascript
const state = {
    cpuProcesses: [],      // CPU scheduler queue
    memoryBlocks: [],      // Memory block map
    memAllocated: [],      // Dashboard memory stats
    systemProcesses: [],   // Process manager list
    selectedProcess: null, // Currently selected PID
    nextPID: 1000,         // Auto-incrementing PID counter
    uptime: 0,             // Seconds since boot
    cpuUsageHistory: [],   // CPU % readings
    terminalHistory: [],   // Command history
    currentAlgo: 'fcfs',   // Current scheduler
    theme: 'dark',         // UI theme
};
```

---

## UI/UX FEATURES

### Boot Sequence
- Animated Linux-style boot messages
- Progress bar animation
- Simulated kernel initialization (3 seconds)

### Theme System
- Dark theme (default) and light theme
- Persists to localStorage
- Smooth CSS transitions between themes

### Navigation
- Tab-based navigation between modules
- Dashboard with module cards
- Clickable module cards navigate to pages
- Status bar with clock, CPU usage, theme toggle

### Responsive Design
- CSS Grid and Flexbox layouts
- Breakpoints for tablet/mobile
- Collapsible navigation on small screens

---

## KEY ALGORITHMS SUMMARY

| Module | Algorithm | Complexity | Key Feature |
|--------|-----------|------------|-------------|
| CPU | FCFS | O(n log n) | Simple queue |
| CPU | SJF | O(n²) | Optimal waiting time |
| CPU | SRTF | O(n²) | Preemptive optimal |
| CPU | Round Robin | O(n) | Fair time-sharing |
| Memory | First Fit | O(n) | Fastest |
| Memory | Best Fit | O(n) | Least waste |
| Memory | Worst Fit | O(n) | Largest fragment |
| Paging | FIFO | O(n) | Simple queue |
| Paging | LRU | O(n²) | Good approximation |
| Paging | Optimal | O(n²) | Theoretical best |
| Disk | SSTF | O(n²) | Minimum seek |
| Disk | SCAN | O(n log n) | Elevator pattern |
| Deadlock | Banker's | O(m·n²) | Safety guarantee |

---

## TECHNICAL HIGHLIGHTS

### Canvas Rendering
- Disk scheduler uses HTML5 Canvas for head movement visualization
- Custom drawing with gradients, shadows, and animations
- Responsive redraw on window resize

### SVG Edges
- Resource Allocation Graph uses SVG for dynamic edge drawing
- Marker-end arrows for direction indication
- Dashed/dotted stroke patterns for edge types

### CSS Animations
- Boot sequence fade-in
- Shimmer effect on memory bars
- Hit/fault animations in paging
- Blinking status indicators

### Local Storage
- Theme preference persistence
- Survives page refresh

---

## EDUCATIONAL VALUE

This simulator is designed for **students learning operating systems** and covers:

1. **Process Management** - Scheduling, lifecycle, states
2. **Memory Management** - Allocation, fragmentation, compaction
3. **Virtual Memory** - Paging, page faults, replacement policies
4. **Storage Systems** - Disk scheduling, seek optimization
5. **Concurrency** - Deadlock conditions, Banker's algorithm
6. **System Interface** - Shell commands, process control

Each module includes:
- Algorithm explanation panels
- Visual step-by-step execution
- Performance metrics comparison
- Sample data for quick testing

---

## HOW TO RUN

1. Open `index.html` in any modern web browser
2. No server or build process required
3. All JavaScript runs client-side
4. Works offline after initial load

---

## FILE SIZE & COMPLEXITY

- **Total Lines of Code:** ~9,000+
- **Largest File:** `terminal.js` (~960 lines)
- **Smallest File:** `main.js` (~350 lines)
- **CSS:** ~1,430 lines with animations
- **HTML:** ~790 lines with all page layouts

---

## CONCLUSION

This is a **production-quality educational tool** demonstrating:
- Clean modular architecture
- Multiple algorithm implementations
- Rich interactive visualizations
- Professional UI/UX design
- Comprehensive feature coverage of OS concepts

The codebase serves as both a **learning tool for students** and a **reference implementation** for building educational web applications about computer science concepts.
