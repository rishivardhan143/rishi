// Simulated IoT and Blockchain data management
class PharmaChainDashboard {
    constructor() {
        this.batches = [];
        this.transactions = [];
        this.alerts = [];
        this.iotData = {};
        this.charts = {};
        this.showBatchDetails = false; // whether to render manufacture date/quantity in the table
        this.boxes = []; // box monitoring data
        this.map = null; // Leaflet map instance
        this.markers = new Map(); // box markers on map
        this.boxes = []; // box monitoring records
        this.map = null;
        this.boxMarkers = [];
    this.boxFilter = null; // current batch filter for boxes
        this.routeLayers = new Map();
        this.animationIntervals = new Map();
        this.animMarkers = new Map();
        // seed some batches (none approved by default except one for demo)
        this.batches = [
            { id: 'BATCH-2024-001', drugName: 'Aspirin', stage: 'Manufacturing', location: 'Plant A', approved: true },
            { id: 'BATCH-2024-002', drugName: 'Paracetamol', stage: 'Distribution', location: 'Hub 3', approved: false },
            { id: 'BATCH-2024-003', drugName: 'Ibuprofen', stage: 'Pharmacy', location: 'Outlet 7', approved: false }
        ];

        // setup event listeners and navigation first so sidebar works even if charts fail
        this.setupEventListeners();
        // initialize charts but don't let failures stop the app
        try {
            this.initCharts();
        } catch (err) {
            console.warn('Chart initialization failed, continuing without charts:', err);
        }
        this.populateBatchTable();
        this.populateBatchSelect();
        // load boxes and initialize map
        this.loadBoxesFromStorage();
        // If no boxes present, seed a couple of demo boxes (design/demo mode)
        if (!this.boxes || this.boxes.length === 0) {
            const now = new Date().toISOString();
            this.boxes = [
                { boxId: 'BOX-2025-001', batchId: 'BATCH-2024-001', contents: 'Aspirin 100mg', status: 'created', lat: 20.5937, lon: 78.9629, timestamp: now, history: [{ status: 'created', role: 'Manufacturer', time: now, location: '20.5937,78.9629' }] },
                { boxId: 'BOX-2025-002', batchId: 'BATCH-2024-001', contents: 'Aspirin 100mg', status: 'created', lat: 21.1458, lon: 79.0882, timestamp: now, history: [{ status: 'created', role: 'Manufacturer', time: now, location: '21.1458,79.0882' }] }
            ];
            this.saveBoxesToStorage();
        }
        try { this.initBoxMap(); } catch(e) { console.warn('Map init failed', e); }
        this.renderBoxesTable();
        // initialize alert counts display
        this.updateAlertCounts();
        this.startIoTSimulation();
    }

    // load current user (from login page) and update UI. If no user, redirect to login.
    loadCurrentUser() {
        try {
            const raw = localStorage.getItem('pharma_user');
            if (!raw) {
                // if on login page already, do nothing
                if (!location.pathname.endsWith('signin.html')) location.href = 'signin.html';
                return null;
            }
            const user = JSON.parse(raw);
            this.currentUser = user;
            return user;
        } catch (e) {
            return null;
        }
    }

    // Render the quick user list in the sidebar for easy switching
    renderUserList() {
        const container = document.getElementById('user-list');
        if (!container) return;
        // Just show a guest option
        const guest = document.createElement('div');
        guest.className = 'user-item';
        guest.innerHTML = `<div class="name">Sign Out</div>`;
        guest.addEventListener('click', () => {
            localStorage.removeItem('pharma_user');
            this.currentUser = null;
            this.updateUIForRole(null);
            location.href = 'login.html';
        });
        container.appendChild(guest);
    }

    // Initialize all charts
    initCharts() {
        // Temperature Gauge
        if (typeof Chart === 'undefined') {
            // Chart.js not available — skip chart initialization
            console.warn('Chart.js not found, skipping charts');
            return;
        }

        this.charts.tempChart = new Chart(document.getElementById('tempChart'), {
            type: 'doughnut',
            data: {
                datasets: [{
                    data: [0, 100],
                    backgroundColor: ['#2563eb', '#e2e8f0']
                }]
            },
            options: {
                circumference: 180,
                rotation: -90,
                cutout: '80%',
                plugins: {
                    legend: { display: false },
                }
            }
        });

        // Pressure Gauge
        this.charts.pressChart = new Chart(document.getElementById('pressChart'), {
            type: 'doughnut',
            data: {
                datasets: [{
                    data: [0, 100],
                    backgroundColor: ['#16a34a', '#e2e8f0']
                }]
            },
            options: {
                circumference: 180,
                rotation: -90,
                cutout: '80%',
                plugins: {
                    legend: { display: false },
                }
            }
        });

        // Temperature Line Chart
        this.charts.lineTemp = new Chart(document.getElementById('lineTemp'), {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Temperature °C',
                    data: [],
                    borderColor: '#2563eb',
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: false }
                }
            }
        });

        // Stages Pie Chart
        this.charts.pieStages = new Chart(document.getElementById('pieStages'), {
            type: 'pie',
            data: {
                labels: ['Manufacturing', 'Distribution', 'Pharmacy', 'Delivered'],
                datasets: [{
                    data: [4, 3, 2, 1],
                    backgroundColor: ['#2563eb', '#16a34a', '#f59e0b', '#64748b']
                }]
            }
        });
    }

    // Set up event listeners
    setupEventListeners() {
        // update user and UI right away
        const user = this.loadCurrentUser();
        this.updateUIForRole(user);
        
    // Initialize box monitoring
    this.loadBoxes();
    this.initBoxMap();
        this.setupBoxMonitoring();

        // render quick user list
        this.renderUserList();

        // logout handler
        const btnLogout = document.getElementById('btn-logout');
        if (btnLogout) btnLogout.addEventListener('click', () => {
            localStorage.removeItem('pharma_user');
            location.href = 'signin.html';
        });

        document.getElementById('btn-generate').addEventListener('click', () => {
            this.startIoTSimulation();
        });

        document.getElementById('export-csv').addEventListener('click', () => {
            this.exportToCSV();
        });

        document.getElementById('export-pdf').addEventListener('click', () => {
            this.exportToPDF();
        });
        // navigation behavior: show only the selected section
        this.setupNavigation();

        // role selector (sidebar) - keep in sync if present
        const roleSelector = document.getElementById('roleSelector');
        if (roleSelector) {
            // set value to current user role and disable
            if (this.currentUser) {
                roleSelector.value = this.currentUser.role;
                roleSelector.disabled = true;
            }
            roleSelector.addEventListener('change', () => this.handleRoleChange(roleSelector.value));
        }

        // expose some helpers for inline HTML buttons
        window.showManualForm = () => this.showManualForm();
        window.submitManualIoT = () => this.submitManualIoT();
        // toggle details button (show/hide manufacture date & qty)
        const toggleBtn = document.getElementById('toggle-details');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => this.toggleBatchDetails(toggleBtn));
        }

        // Box monitoring: upload/scan/manual add
        const btnUploadBoxes = document.getElementById('btn-upload-boxes');
        const fileInput = document.getElementById('box-upload-file');
        if (btnUploadBoxes && fileInput) {
            btnUploadBoxes.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', (ev) => this.handleBoxFileUpload(ev));
        }
        const btnScanBoxQr = document.getElementById('btn-scan-box-qr');
        if (btnScanBoxQr) btnScanBoxQr.addEventListener('click', () => this.handleScanBoxQr());
        const btnAddBoxManual = document.getElementById('btn-add-box-manual');
        if (btnAddBoxManual) btnAddBoxManual.addEventListener('click', () => this.addBoxManually());
    }

    toggleBatchDetails(btnEl) {
        this.showBatchDetails = !this.showBatchDetails;
        if (btnEl) btnEl.textContent = this.showBatchDetails ? 'Hide details' : 'Show details';
        // re-render table to reflect change
        this.populateBatchTable();
    }

    // Populate the batch select dropdown with only FDA-approved batches
    populateBatchSelect() {
        const select = document.getElementById('selected-batch');
        if (!select) return;
        select.innerHTML = '';
        this.batches.filter(b => b.approved).forEach(b => {
            const opt = document.createElement('option');
            opt.value = b.id;
            opt.textContent = `${b.id} — ${b.drugName}`;
            select.appendChild(opt);
        });
        // if none approved, add a placeholder
        if (select.options.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'No approved batches';
            opt.disabled = true;
            select.appendChild(opt);
        }
    }

    // Update visibility/enabled state of UI based on role
    updateUIForRole(user) {
        const role = user?.role || null;
        // display current user
        const currentUserEl = document.getElementById('currentUser');
        if (currentUserEl) {
            // Do NOT display the user's name in the UI — show only the role (anonymized)
            currentUserEl.textContent = user ? `${user.role}` : 'Not signed in';
        }

        // Manufacturer form visible only to Manufacturer
        const mfForm = document.getElementById('manufacturer-form');
        if (mfForm) mfForm.style.display = (role === 'Manufacturer') ? 'flex' : 'none';

        // Approve buttons rendered for FDA (renderActionCell uses roleSelector or currentUser)
        this.batches.forEach(b => this.renderActionCell(b));

        // IoT manual inputs only enabled for Distributor
        const tempInput = document.getElementById('manual-temp');
        const pressInput = document.getElementById('manual-press');
        const submitBtn = document.querySelector('button[onclick="submitManualIoT()"]') || document.getElementById('mf-add');
        const manualSubmit = document.getElementById('manual-submit') || null;
        if (tempInput) tempInput.disabled = (role !== 'Distributor');
        if (pressInput) pressInput.disabled = (role !== 'Distributor');
        // If there's a separate submit button element, update it too
        const submitEl = document.querySelector('#manual-submit') || document.querySelector('#manual-submit-btn');
        if (submitEl) submitEl.disabled = (role !== 'Distributor');
    }

    // Populate the batch table from this.batches
    populateBatchTable() {
        const tbody = document.querySelector('#batches-table tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        this.batches.forEach(b => {
            const tr = document.createElement('tr');
            tr.setAttribute('data-batch', b.id);
            let drugCell = `${b.drugName}`;
            if (this.showBatchDetails && (b.manufactureDate || b.quantity)) {
                const mfg = b.manufactureDate ? `MFG: ${b.manufactureDate}` : '';
                const qty = b.quantity ? `Qty: ${b.quantity}` : '';
                drugCell += `<div class="muted small">${mfg}${mfg && qty ? ' • ' : ''}${qty}</div>`;
            }
            tr.innerHTML = `
                <td>${b.id}</td>
                <td>${drugCell}</td>
                <td>${b.stage || ''}</td>
                <td>${b.location || ''}</td>
                <td id="temp-${b.id}">--</td>
                <td id="status-${b.id}">${b.approved ? '<span style="color:var(--success)">Approved</span>' : '<span style="color:var(--muted)">Pending</span>'}</td>
                <td>${new Date().toLocaleString()}</td>
                <td id="action-${b.id}"></td>
            `;
            tbody.appendChild(tr);
            // make the batch ID cell clickable to show box tracking for that batch
            try {
                const idCell = tr.querySelector('td');
                if (idCell) {
                    idCell.style.cursor = 'pointer';
                    idCell.title = 'Show boxes for this batch';
                    idCell.addEventListener('click', () => this.showBoxesForBatch(b.id));
                }
            } catch (e) { /* ignore */ }
            this.renderActionCell(b);
        });
    }

    // Render the approve button or empty area in the action cell depending on role and approval state
    renderActionCell(batch) {
        const cell = document.getElementById(`action-${batch.id}`);
        if (!cell) return;
        const role = this.currentUser?.role || document.getElementById('roleSelector')?.value || 'FDA';
        cell.innerHTML = '';
        // If batch is not approved, FDA can approve
        if (!batch.approved && role === 'FDA') {
            const btn = document.createElement('button');
            btn.textContent = 'Approve';
            btn.className = 'primary';
            btn.addEventListener('click', () => this.approveBatch(batch.id));
            cell.appendChild(btn);
        } else if (batch.approved) {
            // If approved and current user is Distributor, allow transfer action
            if (role === 'Distributor') {
                const tbtn = document.createElement('button');
                tbtn.textContent = 'Transfer → Manufacturer';
                tbtn.className = 'primary';
                tbtn.addEventListener('click', () => this.transferBatch(batch.id, 'Manufacturer'));
                cell.appendChild(tbtn);
            } else {
                cell.innerHTML = '<span style="color:var(--muted); font-size:12px">—</span>';
            }
        }
    }

    // Handle role changes: re-render approve buttons
    handleRoleChange(role) {
        this.batches.forEach(b => this.renderActionCell(b));
    }

    // Show a quick manual input form (prompt-based) to add a batch (unapproved by default)
    showManualForm() {
        // kept for backward compatibility but recommend manufacturer form
        const id = prompt('Enter Batch ID (e.g. BATCH-2025-001):');
        if (!id) return;
        const drug = prompt('Enter Drug Name:');
        if (!drug) return;
        // add to batches list
        const exists = this.batches.find(x => x.id === id);
        if (exists) {
            alert('Batch ID already exists');
            return;
        }
        const newBatch = { id: id.trim(), drugName: drug.trim(), stage: 'Created', location: 'Unknown', approved: false };
        this.batches.unshift(newBatch);
        this.populateBatchTable();
        this.populateBatchSelect();
        alert(`Batch ${newBatch.id} added. It must be approved by FDA to appear in IoT monitoring.`);
    }

    // Approve a batch (only FDA should be able to click this)
    approveBatch(batchId) {
        // Only allow if current user is FDA
        const user = this.currentUser || JSON.parse(localStorage.getItem('pharma_user') || 'null');
        if (!user || user.role !== 'FDA') {
            alert('Only FDA users can approve batches.');
            return;
        }
        const batch = this.batches.find(b => b.id === batchId);
        if (!batch) return;
        batch.approved = true;
        this.populateBatchTable();
        this.populateBatchSelect();
        // Activate any boxes that belong to this batch
        this.activateBoxesForBatch(batchId);
        alert(`Batch ${batchId} approved and added to monitoring.`);
    }

    // Manual IoT submission
    submitManualIoT() {
        // Only Distributor can submit IoT manual data
        const user = this.currentUser || JSON.parse(localStorage.getItem('pharma_user') || 'null');
        if (!user || user.role !== 'Distributor') { alert('Only Distributor can submit IoT readings.'); return; }

        const selected = document.getElementById('selected-batch');
        const batchId = selected?.value;
        if (!batchId) { alert('No approved batch selected'); return; }
        const tempInput = document.getElementById('manual-temp');
        const pressInput = document.getElementById('manual-press');
        const temp = tempInput?.value;
        const pressure = pressInput?.value;
        if (!temp || !pressure) { alert('Enter both temperature and pressure'); return; }
        // ensure batch is approved
        const batch = this.batches.find(b => b.id === batchId);
        if (!batch || !batch.approved) { alert('Selected batch is not approved for monitoring'); return; }

        const t = parseFloat(temp);
        const p = parseFloat(pressure);
        this.updateIoTData(batchId, t, p);
        this.checkAlerts(batchId, t, p);
        this.updateCharts(t, p);
        this.generateBlockchainTransaction(batchId);

        // update table's temp and status with Normal/Critical
        const tempCell = document.getElementById(`temp-${batchId}`);
        if (tempCell) tempCell.textContent = `${t.toFixed(1)}°C`;
        const statusCell = document.getElementById(`status-${batchId}`);
        if (statusCell) {
            let label = '<span style="color:var(--success)">Normal</span>';
            if (t < 2 || t > 8) label = '<span style="color:var(--danger)">Critical</span>';
            statusCell.innerHTML = label;
        }
    }

    // Setup sidebar navigation so clicking shows only the requested section
    setupNavigation() {
        const navLinks = Array.from(document.querySelectorAll('.sidebar .nav a'));
        const allCards = Array.from(document.querySelectorAll('.grid .card'));

        const showOnly = (predicate) => {
            allCards.forEach(card => {
                try {
                    if (predicate(card)) {
                        card.style.display = '';
                    } else {
                        card.style.display = 'none';
                    }
                } catch (e) {
                    // ignore
                }
            });
        };

        const showForHash = (hash) => {
            // normalize
            const id = (hash || '').replace(/^#/, '') || 'overview';

            switch (id) {
                case 'overview':
                    // show only stat cards (overview summary)
                    showOnly(card => card.classList.contains('stat'));
                    break;
                case 'batches':
                    showOnly(card => card.id === 'batches');
                    break;
                case 'iot':
                    showOnly(card => card.id === 'iot');
                    break;
                case 'alerts':
                    showOnly(card => card.id === 'alerts');
                    break;
                case 'blockchain':
                    showOnly(card => card.id === 'blockchain');
                    break;
                case 'analytics':
                    // show both analytics cards: one with id 'analytics' and the pie chart card
                    const pieCard = document.getElementById('pieStages')?.closest('.card');
                    showOnly(card => card.id === 'analytics' || (pieCard && card === pieCard));
                    break;
                default:
                    // fallback: try to find a card with that id
                    showOnly(card => card.id === id);
                    break;
            }

            // update active link classes
            navLinks.forEach(a => {
                const target = (a.getAttribute('href') || '').replace(/^#/, '');
                if ((target || 'overview') === id) {
                    a.classList.add('active');
                } else {
                    a.classList.remove('active');
                }
            });
        };

        // attach click handlers
        navLinks.forEach(a => {
            a.addEventListener('click', (ev) => {
                ev.preventDefault();
                const href = a.getAttribute('href') || '#overview';
                const id = href.replace(/^#/, '') || 'overview';
                // update URL hash without scrolling
                if (location.hash !== '#' + id) {
                    history.pushState(null, '', '#' + id);
                }
                showForHash(id);
            });
        });

        // handle browser back/forward and initial load
        window.addEventListener('hashchange', () => showForHash(location.hash));
        // initial
        showForHash(location.hash || '#overview');
    }

    // Start IoT data simulation
    startIoTSimulation() {
        // avoid multiple intervals
        if (this.simulationInterval) clearInterval(this.simulationInterval);
        this.simulationInterval = setInterval(() => {
            const selectEl = document.getElementById('selected-batch');
            const approved = this.batches.filter(b => b.approved).map(b => b.id);

            if (!approved.length) {
                // nothing approved to simulate
                return;
            }

            let batchId = selectEl?.value;
            // if no selected batch or selected is not approved, pick random approved batch
            if (!batchId || !approved.includes(batchId)) {
                batchId = approved[Math.floor(Math.random() * approved.length)];
            }

            const temp = this.generateRandomTemp();
            const pressure = this.generateRandomPressure();
            const gps = this.generateRandomGPS();

            this.updateIoTData(batchId, temp, pressure, gps);
            this.checkAlerts(batchId, temp, pressure);
            this.updateCharts(temp, pressure);
            this.generateBlockchainTransaction(batchId, gps);
        }, 4000);
    }

    // Generate random temperature between 2-9°C
    generateRandomTemp() {
        return parseFloat((Math.random() * 7 + 2).toFixed(1));
    }

    // Generate random pressure
    generateRandomPressure() {
        return parseFloat((Math.random() * 0.5 + 0.8).toFixed(2));
    }

    // Generate random GPS coordinates (within a reasonable bounding box)
    generateRandomGPS() {
        // pick somewhere within continental-ish coordinates
        const lat = (Math.random() * 40 + 10).toFixed(5); // 10..50
        const lon = (Math.random() * -70 - 60).toFixed(5); // -60..-130 approx
        return { lat: parseFloat(lat), lon: parseFloat(lon) };
    }

    // Update IoT data
    updateIoTData(batchId, temp, pressure, gps) {
        if (!this.iotData[batchId]) {
            this.iotData[batchId] = {
                temps: [],
                pressures: [],
                timestamps: [],
                gps: []
            };
        }

        this.iotData[batchId].temps.push(temp);
        this.iotData[batchId].pressures.push(pressure);
        this.iotData[batchId].timestamps.push(new Date());
        if (gps) this.iotData[batchId].gps.push(gps);

        // Update batch table
        this.updateBatchTable(batchId, temp, pressure);
    }

    // Check for alerts
    checkAlerts(batchId, temp, pressure) {
        if (temp < 2 || temp > 8) {
            this.addAlert({
                type: 'danger',
                batchId: batchId,
                message: `Temperature out of range: ${temp}°C`,
                timestamp: new Date()
            });
        }

        if (pressure < 0.8 || pressure > 1.2) {
            this.addAlert({
                type: 'warning',
                batchId: batchId,
                message: `Abnormal pressure: ${pressure} atm`,
                timestamp: new Date()
            });
        }
    }

    // Add new alert
    addAlert(alert) {
        this.alerts.unshift(alert);
        this.updateAlertsList();
        this.updateAlertsTable();
        this.updateAlertCounts();
    }

    // Update overview alert counters (total and critical)
    updateAlertCounts() {
        const total = this.alerts.length;
        const critical = this.alerts.filter(a => a.type === 'danger' || a.type === 'critical').length;
        const totalEl = document.getElementById('alerts-count');
        const critEl = document.getElementById('critical-alerts-count');
        if (totalEl) totalEl.textContent = total;
        if (critEl) critEl.textContent = critical;
    }

    // Update charts with new data
    updateCharts(temp, pressure) {
        // Update temperature gauge
        this.charts.tempChart.data.datasets[0].data = [temp * 10, 100 - (temp * 10)];
        this.charts.tempChart.update();

        // Update pressure gauge
        this.charts.pressChart.data.datasets[0].data = [pressure * 100, 100 - (pressure * 100)];
        this.charts.pressChart.update();

        // Update temperature line chart
        if (this.charts.lineTemp.data.labels.length > 10) {
            this.charts.lineTemp.data.labels.shift();
            this.charts.lineTemp.data.datasets[0].data.shift();
        }

        this.charts.lineTemp.data.labels.push(new Date().toLocaleTimeString());
        this.charts.lineTemp.data.datasets[0].data.push(temp);
        this.charts.lineTemp.update();

        // refresh overview stats when charts get updated from new readings
        this.updateOverviewStats();
    }

    // Update overview stats: total batches, active alerts, iot status, compliance
    updateOverviewStats() {
        try {
            const totalBatches = this.batches.length;
            const totalEl = document.getElementById('total-batches');
            if (totalEl) totalEl.textContent = totalBatches;

            // alerts count is maintained elsewhere, but ensure sync
            const alertsEl = document.getElementById('alerts-count');
            if (alertsEl) alertsEl.textContent = this.alerts.length;

            // IoT status: count approved batches and how many within safe range
            const approved = this.batches.filter(b => b.approved).map(b => b.id);
            let normal = 0;
            approved.forEach(id => {
                const data = this.iotData[id];
                if (data && data.temps && data.temps.length) {
                    const last = parseFloat(data.temps[data.temps.length-1]);
                    if (!isNaN(last) && last >= 2 && last <= 8) normal++;
                }
            });
            const iotStatusEl = document.getElementById('iot-status');
            if (iotStatusEl) iotStatusEl.textContent = `${normal}/${approved.length}`;

            // compliance rate: percent of readings within 2-8°C
            let totalReadings = 0, normalReadings = 0;
            Object.values(this.iotData).forEach(d => {
                if (d.temps && d.temps.length) {
                    d.temps.forEach(t => {
                        totalReadings++;
                        const v = parseFloat(t);
                        if (!isNaN(v) && v >= 2 && v <= 8) normalReadings++;
                    });
                }
            });
            const complianceEl = document.getElementById('compliance-rate');
            if (complianceEl) {
                const pct = totalReadings ? Math.round((normalReadings/totalReadings)*1000)/10 : 100;
                complianceEl.textContent = `${pct}%`;
            }

            // update small subtitle for total batches
            const sub = document.getElementById('total-batches-sub');
            if (sub) sub.textContent = `${approved.length} approved • ${totalBatches - approved.length} pending`;

            // refresh recent activity and critical panels
            this.updateRecentActivity();
            this.updateCriticalAlertsPanel();
        } catch (e) {
            // ignore UI update errors
            console.warn('updateOverviewStats error', e);
        }
    }

    updateRecentActivity() {
        const el = document.getElementById('recent-activity-list');
        if (!el) return;
        // show up to 5 recent transactions
        const list = this.transactions.slice(0,5);
        if (!list.length) {
            el.innerHTML = '<div class="muted">No recent activity</div>';
            return;
        }
        el.innerHTML = list.map(tx => {
            const batch = this.batches.find(b=>b.id===tx.batchId);
            const drug = batch ? batch.drugName : tx.batchId;
            const locationTag = tx.location ? `<span class="tag">${tx.location}</span>` : '';
            return `
                <div class="activity-item">
                    <div style="width:10px; height:10px; background:#2563eb; border-radius:50%; margin-top:6px"></div>
                    <div style="flex:1">
                        <div style="font-weight:600">${drug}</div>
                        <div class="meta">${tx.batchId} · ${tx.from} → ${tx.to}</div>
                        <div class="meta">${new Date(tx.timestamp).toLocaleString()}</div>
                    </div>
                    <div style="min-width:110px; text-align:right">${locationTag}</div>
                </div>
            `;
        }).join('');
    }

    updateCriticalAlertsPanel() {
        const el = document.getElementById('critical-alerts-panel');
        if (!el) return;
        const criticals = this.alerts.filter(a => a.type === 'danger' || a.type === 'critical');
        if (!criticals.length) {
            el.innerHTML = '<div class="muted">No critical alerts</div>';
            return;
        }
        el.innerHTML = criticals.slice(0,5).map(a => {
            return `
                <div class="critical-item">
                    <div class="label">${a.message}</div>
                    <div class="meta">${a.batchId} · ${new Date(a.timestamp).toLocaleString()}</div>
                </div>
            `;
        }).join('');
    }

    // Generate blockchain transaction
    generateBlockchainTransaction(batchId, gps, from='Manufacturer', to='Distributor') {
        const transaction = {
            txnId: 'TXN-' + Math.random().toString(36).substr(2, 9),
            batchId: batchId,
            from: from,
            to: to,
            timestamp: new Date(),
            location: gps ? `${gps.lat.toFixed(5)}, ${gps.lon.toFixed(5)}` : 'unknown',
            hash: '0x' + Math.random().toString(36).substr(2, 64)
        };

        this.transactions.unshift(transaction);
        // keep transactions reasonably bounded
        if (this.transactions.length > 200) this.transactions.length = 200;
        this.updateBlockchainTable();

        // Also record this transaction against any boxes that belong to this batch
        try {
            const boxes = (this.boxes || []).filter(b => b.batchId === batchId);
            boxes.forEach(box => {
                if (!box.ledger) box.ledger = [];
                box.ledger.unshift(transaction);
                // update box location from gps (if provided)
                if (gps && gps.lat && gps.lon) {
                    // Tamper detection: compare previous location
                    const last = (box.history && box.history.length) ? box.history[box.history.length-1] : null;
                    if (last && last.location && last.location.includes(',')) {
                        const parts = last.location.split(',').map(p => parseFloat(p.trim()));
                        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                            const prev = { lat: parts[0], lon: parts[1] };
                            const distKm = this.haversineDistance(prev.lat, prev.lon, gps.lat, gps.lon);
                            const timeDiffMs = new Date(transaction.timestamp) - new Date(last.time || last.timestamp || Date.now());
                            // if moved more than 200 km in less than 30 minutes => possible tamper
                            if (distKm > 200 && timeDiffMs < (30*60*1000)) {
                                this.addAlert({ type: 'critical', batchId: batchId, message: `Tamper detected for box ${box.boxId} — sudden large location jump (${Math.round(distKm)} km)`, timestamp: new Date() });
                                box.tampered = true;
                            }
                        }
                    }

                    // apply gps update
                    box.lat = gps.lat;
                    box.lon = gps.lon;
                }
                // push history entry
                if (!box.history) box.history = [];
                box.history.push({ status: box.status || 'unknown', role: to, time: transaction.timestamp.toISOString(), location: transaction.location });
            });
            // persist box updates
            this.saveBoxesToStorage();
            this.renderBoxesTable();
            this.renderBoxesOnMap();
        } catch (e) {
            console.warn('Failed to attach txn to boxes', e);
        }
    }

    // Haversine distance between two lat/lon in kilometers
    haversineDistance(lat1, lon1, lat2, lon2) {
        function toRad(x) { return x * Math.PI / 180; }
        const R = 6371; // km
        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lon2 - lon1);
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    // Transfer a batch (role-based). Example: Distributor -> Manufacturer only allowed if FDA approved
    transferBatch(batchId, toRole) {
        const user = this.currentUser || JSON.parse(localStorage.getItem('pharma_user') || 'null');
        if (!user) { alert('You must be logged in to transfer batches.'); return; }

        const batch = this.batches.find(b => b.id === batchId);
        if (!batch) { alert('Batch not found'); return; }

        // Only allow Distributor to transfer to Manufacturer in this flow
        if (user.role === 'Distributor' && toRole === 'Manufacturer') {
            if (!batch.approved) {
                alert('Batch must be FDA-approved before transferring back to Manufacturer.');
                return;
            }
            // perform transfer
            batch.stage = 'Returned to Manufacturer';
            batch.location = 'Manufacturer Facility';
            // create a transaction with explicit from/to
            const gps = this.generateRandomGPS();
            this.generateBlockchainTransaction(batchId, gps, 'Distributor', 'Manufacturer');
            this.populateBatchTable();
            this.updateOverviewStats();
            alert(`Batch ${batchId} transferred to Manufacturer.`);
            return;
        }

        alert('Transfer not authorized for your role or invalid target role.');
    }

    // Update tables
    updateBatchTable(batchId, temp, pressure) {
        const tbody = document.querySelector('#batches-table tbody');
        if (!tbody) return;
        const batch = this.batches.find(b => b.id === batchId) || { id: batchId, drugName: '-', stage: '-', location: '-' };
        const row = tbody.querySelector(`tr[data-batch="${batchId}"]`) || tbody.insertRow(0);
        row.setAttribute('data-batch', batchId);

        let drugCell = `${batch.drugName || '-'}`;
        if (this.showBatchDetails && (batch.manufactureDate || batch.quantity)) {
            const mfg = batch.manufactureDate ? `MFG: ${batch.manufactureDate}` : '';
            const qty = batch.quantity ? `Qty: ${batch.quantity}` : '';
            drugCell += `<div class="muted small">${mfg}${mfg && qty ? ' • ' : ''}${qty}</div>`;
        }
        row.innerHTML = `
            <td>${batchId}</td>
            <td>${drugCell}</td>
            <td>${batch.stage || '-'}</td>
            <td>${batch.location || '-'}</td>
            <td>${typeof temp === 'number' ? temp.toFixed(1) : temp}°C</td>
            <td>${(typeof temp === 'number' && temp >= 2 && temp <= 8) ? '<span style="color:var(--success)">✓ Normal</span>' : '<span style="color:var(--danger)">⚠ Alert</span>'}</td>
            <td>${new Date().toLocaleString()}</td>
        `;
        // re-render action cell (in case DOM recreated)
        this.renderActionCell(batch);
    }

    updateAlertsList() {
        const alertsList = document.getElementById('alerts-list');
        alertsList.innerHTML = this.alerts.slice(0, 3).map(alert => `
            <div class="alert-item ${alert.type}">
                <strong>${alert.batchId}</strong>: ${alert.message}
                <div style="font-size:12px; opacity:0.8">${alert.timestamp.toLocaleTimeString()}</div>
            </div>
        `).join('');
    }

    updateAlertsTable() {
        const tbody = document.querySelector('#alerts-table tbody');
        tbody.innerHTML = this.alerts.map(alert => `
            <tr>
                <td>${alert.type}</td>
                <td>${alert.batchId}</td>
                <td>${alert.message}</td>
                <td>${alert.timestamp.toLocaleString()}</td>
                <td><button class="ghost">Acknowledge</button></td>
            </tr>
        `).join('');
    }

    updateBlockchainTable() {
        const tbody = document.querySelector('#blockchain-table tbody');
        if (!tbody) return;
        tbody.innerHTML = this.transactions.map(tx => `
            <tr>
                <td>${tx.txnId}</td>
                <td>${tx.batchId}</td>
                <td>${tx.from}</td>
                <td>${tx.to}</td>
                <td>${tx.timestamp.toLocaleString()}</td>
                <td>${tx.location || ''}</td>
                <td><span style="font-family:monospace">${tx.hash}</span></td>
            </tr>
        `).join('');
    }

    // ---------------- Box monitoring helpers ----------------
    loadBoxesFromStorage() {
        try {
            const raw = localStorage.getItem('pharma_boxes') || '[]';
            this.boxes = JSON.parse(raw);
        } catch (e) {
            this.boxes = [];
        }
    }

    saveBoxesToStorage() {
        try { localStorage.setItem('pharma_boxes', JSON.stringify(this.boxes || [])); } catch(e){}
    }

    renderBoxesTable() {
        const tbody = document.querySelector('#boxes-table tbody');
        if (!tbody) return;
        // build rows and include an action cell for role-based transfers
        const boxesToShow = this.boxFilter ? (this.boxes || []).filter(x => x.batchId === this.boxFilter) : (this.boxes || []);
        tbody.innerHTML = boxesToShow.map(b => {
            const loc = (b.lat && b.lon) ? `${b.lat.toFixed(5)}, ${b.lon.toFixed(5)}` : (b.location || '—');
            const status = b.status || 'pending';
            // action placeholder — a button will be attached after DOM insertion
            return `
            <tr data-box="${b.boxId}">
                <td>${b.boxId}</td>
                <td>${b.batchId || ''}</td>
                <td>${b.contents || ''}</td>
                <td>${status}</td>
                <td>${loc}</td>
                <td>${new Date(b.timestamp || Date.now()).toLocaleString()}</td>
                <td id="action-${b.boxId}"></td>
            </tr>`;
        }).join('');

        // attach action buttons depending on status and current user role
        const currentUser = this.currentUser || JSON.parse(localStorage.getItem('pharma_user') || 'null');
        boxesToShow.forEach(b => {
            const cell = document.getElementById(`action-${b.boxId}`);
            if (!cell) return;
            cell.innerHTML = '';
            const role = currentUser?.role || null;

            // Only enable monitoring/workflow if the associated batch is approved
            const batch = this.batches.find(x => x.id === b.batchId);
            const batchApproved = batch ? !!batch.approved : false;

            if (!batchApproved) {
                cell.textContent = 'Pending approval';
                return;
            }

            // Action buttons per lifecycle
            if (b.status === 'created' && role === 'Manufacturer') {
                const btn = document.createElement('button');
                btn.className = 'primary';
                btn.textContent = 'Dispatch → Distributor';
                btn.addEventListener('click', () => this.transferBox(b.boxId, 'Distributor'));
                cell.appendChild(btn);
                return;
            }

            if ((b.status === 'created' || b.status === 'in-transit') && role === 'Distributor') {
                const btn = document.createElement('button');
                btn.className = 'primary';
                btn.textContent = b.status === 'in-transit' ? 'Deliver → Patient' : 'Pickup → In-Transit';
                btn.addEventListener('click', () => this.transferBox(b.boxId, 'Patient'));
                cell.appendChild(btn);
                return;
            }

            if (b.status === 'delivered') {
                cell.textContent = 'Delivered';
                return;
            }

            // default: show view history
            const view = document.createElement('button');
            view.className = 'ghost';
            view.textContent = 'View';
            view.addEventListener('click', () => {
                let msg = `Box ${b.boxId} history:\n` + (b.history || []).map(h => `${h.time}: ${h.status} @ ${h.location || '-'} (${h.role})`).join('\n');
                if (b.ledger && b.ledger.length) {
                    msg += '\n\nLedger entries:\n' + b.ledger.map(tx => `${tx.timestamp.toLocaleString ? tx.timestamp.toLocaleString() : new Date(tx.timestamp).toLocaleString()}: ${tx.from}→${tx.to} @ ${tx.location} (${tx.txnId})`).join('\n');
                }
                alert(msg);
            });
            cell.appendChild(view);

            // Route button: request server-side directions and draw on map
            const routeBtn = document.createElement('button');
            routeBtn.className = 'ghost';
            routeBtn.style.marginLeft = '6px';
            routeBtn.textContent = 'Route';
            routeBtn.addEventListener('click', () => this.drawRouteForBox(b.boxId));
            cell.appendChild(routeBtn);
        });

        // re-render map markers
        this.renderBoxesOnMap();
    }

    initBoxMap() {
        // initialize Leaflet map centered roughly
        if (typeof L === 'undefined') return;
        if (!document.getElementById('box-map')) return;
        // ensure we only initialize once
        if (this.map && this.map._leaflet_id) return;
        this.map = L.map('box-map', { zoomControl: true }).setView([20, 0], 2);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap contributors'
        }).addTo(this.map);
        this.renderBoxesOnMap();
        // Sometimes Leaflet needs an explicit invalidateSize after the container is visible
        try {
            this.map.whenReady(() => {
                try { this.map.invalidateSize(); } catch (e) { /* ignore */ }
            });
        } catch (e) {}
        // also handle window resize
        try {
            window.addEventListener('resize', () => { try { if (this.map) this.map.invalidateSize(); } catch(e){} });
        } catch (e) {}
    }

    addBox(box) {
        // minimal normalization
        const b = Object.assign({ boxId: '', batchId: '', contents: '', status: 'unknown', lat: null, lon: null, location: '', timestamp: Date.now() }, box);
        // if exists update
        const idx = this.boxes.findIndex(x => x.boxId === b.boxId);
        if (idx >= 0) this.boxes[idx] = Object.assign(this.boxes[idx], b);
        else this.boxes.unshift(b);
        this.saveBoxesToStorage();
        this.renderBoxesTable();
    }

    // Activate boxes for a batch once the batch is FDA-approved
    activateBoxesForBatch(batchId) {
        const batch = this.batches.find(b => b.id === batchId);
        if (!batch) return;
        this.boxes.forEach(box => {
            if (box.batchId === batchId) {
                // only activate if pending
                if (!box.status || box.status === 'pending' || box.status === 'unknown') {
                    box.status = 'created';
                    // place initial GPS near batch location (randomized)
                    const gps = this.generateRandomGPSNearBatch(batch);
                    if (gps) { box.lat = gps.lat; box.lon = gps.lon; }
                    box.timestamp = new Date().toISOString();
                    if (!box.history) box.history = [];
                    box.history.push({ status: box.status, role: 'Manufacturer', time: new Date().toISOString(), location: box.lat && box.lon ? `${box.lat.toFixed(5)},${box.lon.toFixed(5)}` : batch.location });
                }
            }
        });
        this.saveBoxesToStorage();
        this.renderBoxesTable();
    }

    generateRandomGPSNearBatch(batch) {
        // try to derive a seed lat/lon from batch.location if present (not reliable) — otherwise random
        // For demo, return a random GPS in a fixed bounding box
        const lat = (Math.random() * 40 + 10).toFixed(5); // 10..50
        const lon = (Math.random() * -140 - 10).toFixed(5); // -10..-150 (broad range)
        return { lat: parseFloat(lat), lon: parseFloat(lon) };
    }

    handleBoxFileUpload(ev) {
        const file = ev.target.files && ev.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result;
            // try JSON first
            try {
                const data = JSON.parse(text);
                if (Array.isArray(data)) {
                    data.forEach(d => this.addBox(d));
                    alert(`Imported ${data.length} box records`);
                    ev.target.value = '';
                    return;
                }
            } catch (err) {}
            // fallback to CSV
            const rows = this.parseCSV(text);
            rows.forEach(r => this.addBox(r));
            alert(`Imported ${rows.length} box records from CSV`);
            ev.target.value = '';
        };
        reader.readAsText(file);
    }

    parseCSV(text) {
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (!lines.length) return [];
        const headers = lines[0].split(',').map(h => h.trim());
        const rows = [];
        for (let i=1;i<lines.length;i++){
            const cols = lines[i].split(',');
            const obj = {};
            headers.forEach((h, idx) => {
                obj[h] = (cols[idx] || '').trim();
            });
            // try to parse lat/lon if present
            if (obj.lat) obj.lat = parseFloat(obj.lat);
            if (obj.lon) obj.lon = parseFloat(obj.lon);
            if (obj.timestamp) obj.timestamp = new Date(obj.timestamp).toISOString();
            rows.push(obj);
        }
        return rows;
    }

    async handleScanBoxQr() {
        // use an input type=file to get an image and decode via jsQR if available
        const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
        inp.onchange = async () => {
            const file = inp.files[0]; if (!file) return;
            const img = document.createElement('img'); img.src = URL.createObjectURL(file);
            img.onload = async () => {
                if (typeof jsQR === 'undefined') {
                    const s = document.createElement('script');
                    s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
                    document.head.appendChild(s);
                    await new Promise(r => { s.onload = r; s.onerror = r; });
                }
                try {
                    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
                    const ctx = c.getContext('2d'); ctx.drawImage(img,0,0);
                    const data = ctx.getImageData(0,0,c.width,c.height);
                    const code = jsQR(data.data, data.width, data.height);
                    if (code && code.data) {
                        // assume QR contains JSON or boxId string
                        try {
                            const obj = JSON.parse(code.data);
                            this.addBox(obj);
                            alert('Box data imported from QR');
                        } catch (e) {
                            // treat as boxId only
                            this.addBox({ boxId: code.data, timestamp: Date.now() });
                            alert('Box ID added from QR');
                        }
                    } else {
                        alert('No QR code found in image');
                    }
                } catch (e) { alert('Failed to decode QR image'); }
            };
        };
        inp.click();
    }

    addBoxManually() {
        const boxId = prompt('Box ID (e.g. BOX-2025-001):'); if (!boxId) return;
        const batchId = prompt('Associated Batch ID (optional):') || '';
        const contents = prompt('Contents description (optional):') || '';
        const lat = parseFloat(prompt('Latitude (optional):') || '');
        const lon = parseFloat(prompt('Longitude (optional):') || '');
        const b = { boxId: boxId.trim(), batchId, contents, lat: isFinite(lat)?lat:null, lon: isFinite(lon)?lon:null, status: 'created', timestamp: Date.now() };
        this.addBox(b);
        alert('Box added');
    }

    // Transfer box to next role/location. toRole should be one of 'Distributor' or 'Patient'
    transferBox(boxId, toRole) {
        const box = this.boxes.find(b => b.boxId === boxId);
        if (!box) { alert('Box not found'); return; }

        // ensure batch approved
        const batch = this.batches.find(b => b.id === box.batchId);
        if (!batch || !batch.approved) { alert('Associated batch not approved yet'); return; }

        if (toRole === 'Distributor') {
            // Dispatching to distributor
            box.status = 'in-transit';
            const gps = this.generateRandomGPS();
            box.lat = gps.lat; box.lon = gps.lon;
            box.timestamp = new Date().toISOString();
            if (!box.history) box.history = [];
            box.history.push({ status: box.status, role: 'Distributor', time: box.timestamp, location: `${box.lat.toFixed(5)},${box.lon.toFixed(5)}` });
            this.generateBlockchainTransaction(box.batchId, gps, 'Manufacturer', 'Distributor');
            this.saveBoxes();
            this.renderBoxesTable();
            alert(`Box ${box.boxId} dispatched to Distributor`);
            return;
        }

        if (toRole === 'Patient') {
            if (box.status !== 'in-transit' && box.status !== 'created') {
                alert('Box must be in-transit to deliver to patient');
                return;
            }
            box.status = 'delivered';
            const gps = this.generateRandomGPS();
            box.lat = gps.lat; box.lon = gps.lon;
            box.timestamp = new Date().toISOString();
            if (!box.history) box.history = [];
            box.history.push({ status: box.status, role: 'Patient', time: box.timestamp, location: `${box.lat.toFixed(5)},${box.lon.toFixed(5)}` });
            this.generateBlockchainTransaction(box.batchId, gps, 'Distributor', 'Patient');
            this.saveBoxes();
            this.renderBoxesTable();
            alert(`Box ${box.boxId} delivered to Patient`);
            return;
        }

        alert('Unsupported transfer role');
    }

    // Show boxes for a specific batch (toggle)
    showBoxesForBatch(batchId) {
        if (!batchId) return;
        // toggle off if already filtered
        if (this.boxFilter === batchId) {
            this.boxFilter = null;
        } else {
            this.boxFilter = batchId;
        }
        // switch to boxes section and scroll
        try {
            const boxesCard = document.getElementById('boxes');
            if (boxesCard) boxesCard.scrollIntoView({ behavior: 'smooth' });
            // update a small title indicator (optional)
            const cardTitle = boxesCard?.querySelector('strong');
            if (cardTitle) cardTitle.textContent = this.boxFilter ? `Box Monitoring — ${this.boxFilter}` : 'Box Monitoring';
        } catch (e) {}
        this.renderBoxesTable();
    }

    // Request route from server and draw polyline for the box (origin -> latest location)
    async drawRouteForBox(boxId) {
        try {
            const box = (this.boxes || []).find(b => b.boxId === boxId);
            if (!box) { alert('Box not found'); return; }

            // derive origin and destination from box history (first -> last) or fallback to manufacturer->box
            const hist = box.history || [];
            let originLat = null, originLon = null, destLat = null, destLon = null;
            if (hist.length >= 2) {
                // try parse first and last locations
                const first = hist[0];
                const last = hist[hist.length-1];
                if (first.location && first.location.includes(',')) {
                    const p = first.location.split(',').map(s => parseFloat(s.trim()));
                    originLat = p[0]; originLon = p[1];
                }
                if (last.location && last.location.includes(',')) {
                    const p = last.location.split(',').map(s => parseFloat(s.trim()));
                    destLat = p[0]; destLon = p[1];
                }
            }
            // fallback: use box.lat/lon as destination and generate origin from batch or random
            if (!destLat || !destLon) {
                if (box.lat && box.lon) { destLat = box.lat; destLon = box.lon; }
            }
            if (!originLat || !originLon) {
                // try to use batch location or approximate
                const batch = this.batches.find(b => b.id === box.batchId);
                if (batch && batch.location && typeof batch.location === 'string' && batch.location.includes(',')) {
                    const p = batch.location.split(',').map(s => parseFloat(s.trim()));
                    originLat = p[0]; originLon = p[1];
                }
            }
            if (!originLat || !originLon) {
                // use a nearby random point as origin if nothing else
                const r = this.generateRandomGPSNearBatch({}); originLat = r.lat; originLon = r.lon;
            }
            if (!destLat || !destLon) {
                alert('Insufficient location data to draw route for this box');
                return;
            }

            const origin = `${originLat},${originLon}`;
            const destination = `${destLat},${destLon}`;
            const resp = await fetch(`/api/directions?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`);
            const data = await resp.json();
            if (!data.ok || !data.polyline || !data.polyline.length) { alert('No route available'); return; }

            // remove previous route layer for this box if exists
            if (!this.routeLayers) this.routeLayers = new Map();
            const existing = this.routeLayers.get(boxId);
            if (existing) { try { this.map.removeLayer(existing); } catch(e){} }

            const latlngs = data.polyline.map(p => [p.lat, p.lon]);
            const poly = L.polyline(latlngs, { color: '#ff6600', weight: 4, opacity: 0.85 }).addTo(this.map);
            this.routeLayers.set(boxId, poly);
            // also draw the history segments for the box
            this.drawHistoryForBox(boxId);
            // stop any existing animation and animate along the driving route
            this.stopAnimation(boxId);
            this.animateMarkerAlongPath(boxId, latlngs);
            // fit to bounds
            try { this.map.fitBounds(poly.getBounds().pad(0.1)); } catch(e){}
        } catch (e) {
            console.error('drawRouteForBox error', e);
            alert('Failed to draw route. See console for details.');
        }
    }

    // Draw multi-segment polylines from box.history (chronological). Each segment colored by role.
    drawHistoryForBox(boxId) {
        try {
            const box = (this.boxes || []).find(b => b.boxId === boxId);
            if (!box || !box.history || box.history.length < 2) return;
            // remove previous history layer for this box if exists
            const key = `history-${boxId}`;
            const prev = this.routeLayers.get(key);
            if (prev) { try { this.map.removeLayer(prev); } catch(e){} this.routeLayers.delete(key); }

            const roleColors = { Manufacturer: '#2563eb', Distributor: '#ff6600', Patient: '#16a34a' };
            const segments = [];
            // build latlng points from history entries
            const pts = box.history.map(h => {
                if (!h.location) return null;
                const parts = String(h.location).split(',').map(s => parseFloat(s.trim()));
                if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
                return { lat: parts[0], lon: parts[1], role: h.role || '' };
            }).filter(Boolean);
            // create segments between consecutive points
            for (let i = 0; i < pts.length - 1; i++) {
                const a = pts[i]; const b = pts[i+1];
                const latlngs = [[a.lat, a.lon], [b.lat, b.lon]];
                const color = roleColors[b.role] || '#888';
                const seg = L.polyline(latlngs, { color, weight: 3, opacity: 0.9 }).addTo(this.map);
                segments.push(seg);
            }
            const group = L.featureGroup(segments);
            this.routeLayers.set(key, group);
            try { this.map.fitBounds(group.getBounds().pad(0.1)); } catch(e){}
        } catch (e) {
            console.warn('drawHistoryForBox failed', e);
        }
    }

    // Animate a marker along an array of [lat,lon] points (seconds per segment approximate)
    animateMarkerAlongPath(boxId, latlngs, options={speed: 60}) {
        // speed is km/h approximate for animation pacing; we convert to ms per step
        if (!this.map || !latlngs || !latlngs.length) return;
        // stop existing animation
        this.stopAnimation(boxId);
        // create or reuse marker for this box
        let marker = this.animMarkers.get(boxId);
        if (!marker) {
            marker = L.marker(latlngs[0]).addTo(this.map);
            this.animMarkers.set(boxId, marker);
        } else {
            try { marker.setLatLng(latlngs[0]); } catch(e){}
        }

        // build a list of small interpolation steps between all points
        const steps = [];
        for (let i = 0; i < latlngs.length - 1; i++) {
            const [lat1, lon1] = latlngs[i];
            const [lat2, lon2] = latlngs[i+1];
            const distKm = this.haversineDistance(lat1, lon1, lat2, lon2);
            // duration based on speed km/h -> hours -> ms
            const hours = distKm / (options.speed || 60);
            const durationMs = Math.max(500, Math.round(hours * 3600 * 1000));
            const frames = Math.max(8, Math.round(durationMs / 200));
            for (let f = 0; f <= frames; f++) {
                const t = f/frames;
                const lat = lat1 + (lat2 - lat1) * t;
                const lon = lon1 + (lon2 - lon1) * t;
                const timeOffset = Math.round(durationMs * t);
                steps.push({ lat, lon, timeOffset });
            }
        }

        if (!steps.length) return;

        const start = Date.now();
        let i = 0;
        const interval = setInterval(() => {
            if (i >= steps.length) {
                clearInterval(interval);
                this.animationIntervals.delete(boxId);
                return;
            }
            const s = steps[i++];
            try { marker.setLatLng([s.lat, s.lon]); } catch(e){}
        }, 200);

        this.animationIntervals.set(boxId, interval);
    }

    stopAnimation(boxId) {
        const existing = this.animationIntervals.get(boxId);
        if (existing) { try { clearInterval(existing); } catch(e){} this.animationIntervals.delete(boxId); }
        const marker = this.animMarkers.get(boxId);
        if (marker) { try { this.map.removeLayer(marker); } catch(e){} this.animMarkers.delete(boxId); }
    }

    renderBoxesOnMap() {
        // remove previous markers
        this.clearBoxMarkers();
        if (!this.map) return;
        const boxesToShow = this.boxFilter ? (this.boxes || []).filter(x => x.batchId === this.boxFilter) : (this.boxes || []);
        boxesToShow.forEach(b => {
            if (b.lat && b.lon) {
                const m = L.marker([b.lat, b.lon]).addTo(this.map);
                const popup = `<strong>${b.boxId}</strong><br/>Batch: ${b.batchId || '—'}<br/>${b.contents || ''}`;
                m.bindPopup(popup);
                this.boxMarkers.push(m);
            }
        });
        // if markers exist, fit bounds
        if (this.boxMarkers.length) {
            const group = L.featureGroup(this.boxMarkers);
            this.map.fitBounds(group.getBounds().pad(0.2));
        }
    }

    clearBoxMarkers() {
        try {
            (this.boxMarkers || []).forEach(m => { try { this.map.removeLayer(m); } catch(e){} });
        } catch(e){}
        this.boxMarkers = [];
    }

    // Export functionality
    exportToCSV() {
        // Implementation for CSV export
        console.log('Exporting to CSV...');
    }

    exportToPDF() {
        // Implementation for PDF export using html2pdf
        const element = document.getElementById('content-to-export');
        html2pdf().from(element).save('pharmachain-report.pdf');
    }

    // Box Monitoring Methods
    loadBoxes() {
        try {
            this.boxes = JSON.parse(localStorage.getItem('pharma_boxes') || '[]');
        } catch (e) {
            console.warn('Error loading boxes:', e);
            this.boxes = [];
        }
        this.renderBoxes();
    }

    saveBoxes() {
        try {
            localStorage.setItem('pharma_boxes', JSON.stringify(this.boxes));
        } catch (e) {
            console.warn('Error saving boxes:', e);
        }
    }

    initMap() {
        // Deprecated wrapper — use initBoxMap for all map initialization to ensure consistent container id
        try {
            console.warn('initMap() is deprecated; delegating to initBoxMap()');
            this.initBoxMap();
        } catch (e) {
            console.warn('Error initializing map (alias):', e);
        }
    }

    setupBoxMonitoring() {
        // Upload box details button
        const uploadBtn = document.getElementById('btn-upload-box-file');
        const fileInput = document.getElementById('box-file-input');
        if (uploadBtn && fileInput) {
            uploadBtn.onclick = () => fileInput.click();
            fileInput.onchange = (e) => this.handleBoxFileUpload(e);
        }

        // Scan QR button
        const scanBtn = document.getElementById('btn-scan-box');
        if (scanBtn) {
            scanBtn.onclick = () => this.handleBoxQRScan();
        }

        // Manual add button
        const addBtn = document.getElementById('btn-add-box');
        if (addBtn) {
            addBtn.onclick = () => this.handleManualBoxAdd();
        }
    }

    handleBoxFileUpload(e) {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const content = event.target?.result;
                if (!content) return;

                // Try parsing as JSON first
                try {
                    const data = JSON.parse(content);
                    if (Array.isArray(data)) {
                        data.forEach(box => this.addBox(box));
                        alert(`Imported ${data.length} boxes from JSON`);
                        return;
                    }
                } catch (e) {
                    // Not JSON, try CSV
                    const lines = content.split('\\n').map(line => line.trim()).filter(Boolean);
                    if (lines.length < 2) {
                        alert('Invalid file format');
                        return;
                    }

                    const headers = lines[0].split(',').map(h => h.trim());
                    const boxes = lines.slice(1).map(line => {
                        const values = line.split(',').map(v => v.trim());
                        const box = {};
                        headers.forEach((h, i) => box[h] = values[i]);
                        return box;
                    });

                    boxes.forEach(box => this.addBox(box));
                    alert(`Imported ${boxes.length} boxes from CSV`);
                }
            } catch (error) {
                alert('Error processing file');
                console.error('File processing error:', error);
            }
        };
        reader.readAsText(file);
        e.target.value = ''; // Reset input
    }

    async handleBoxQRScan() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;

            const img = document.createElement('img');
            img.src = URL.createObjectURL(file);
            await img.decode();

            // Load jsQR if needed
            if (typeof jsQR === 'undefined') {
                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
                document.head.appendChild(script);
                await new Promise(r => script.onload = r);
            }

            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);

            if (code) {
                try {
                    const data = JSON.parse(code.data);
                    this.addBox(data);
                    alert('Box details imported from QR code');
                } catch (e) {
                    alert('Invalid QR code format');
                }
            } else {
                alert('No QR code found in image');
            }
        };
        input.click();
    }

    handleManualBoxAdd() {
        const boxId = prompt('Enter Box ID:');
        if (!boxId) return;

        const batchId = prompt('Enter Batch ID (optional):') || '';
        const contents = prompt('Enter Contents (optional):') || '';
        const location = prompt('Enter Location (optional):') || '';
        const lat = parseFloat(prompt('Enter Latitude (optional):') || 'NaN');
        const lon = parseFloat(prompt('Enter Longitude (optional):') || 'NaN');

        const box = {
            boxId,
            batchId,
            contents,
            location,
            lat: isNaN(lat) ? null : lat,
            lon: isNaN(lon) ? null : lon,
            status: 'Active',
            timestamp: new Date().toISOString()
        };

        this.addBox(box);
        alert('Box added successfully');
    }

    addBox(box) {
        // Validate required fields
        if (!box.boxId) {
            console.warn('Box ID is required');
            return;
        }

        // Update existing or add new
        const index = this.boxes.findIndex(b => b.boxId === box.boxId);
        if (index >= 0) {
            this.boxes[index] = { ...this.boxes[index], ...box };
        } else {
            this.boxes.unshift({
                status: 'Active',
                timestamp: new Date().toISOString(),
                ...box
            });
        }

        this.saveBoxes();
        this.renderBoxes();
    }

    renderBoxes() {
        // Update table
        const tbody = document.querySelector('#boxes-table tbody');
        if (tbody) {
            tbody.innerHTML = this.boxes.map(box => `
                <tr>
                    <td>${box.boxId}</td>
                    <td>${box.batchId || '—'}</td>
                    <td>${box.contents || '—'}</td>
                    <td>${box.status || 'Active'}</td>
                    <td>${box.location || (box.lat && box.lon ? `${box.lat.toFixed(6)}, ${box.lon.toFixed(6)}` : '—')}</td>
                    <td>${new Date(box.timestamp).toLocaleString()}</td>
                </tr>
            `).join('');
        }

        // Update map markers
        this.renderMarkers();
    }

    renderMarkers() {
        if (!this.map) return;

        // Clear existing markers
        this.markers.forEach(marker => marker.remove());
        this.markers.clear();

        // Add new markers
        this.boxes.forEach(box => {
            if (box.lat && box.lon) {
                const marker = L.marker([box.lat, box.lon])
                    .bindPopup(`
                        <strong>${box.boxId}</strong><br>
                        ${box.batchId ? `Batch: ${box.batchId}<br>` : ''}
                        ${box.contents ? `Contents: ${box.contents}<br>` : ''}
                        Status: ${box.status || 'Active'}<br>
                        Updated: ${new Date(box.timestamp).toLocaleString()}
                    `)
                    .addTo(this.map);
                this.markers.set(box.boxId, marker);
            }
        });

        // Fit bounds if we have markers
        if (this.markers.size > 0) {
            const group = L.featureGroup(Array.from(this.markers.values()));
            this.map.fitBounds(group.getBounds().pad(0.1));
        }
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new PharmaChainDashboard();

    // wire manufacturer add form
    const addBtn = document.getElementById('mf-add');
        if (addBtn) {
        addBtn.addEventListener('click', () => {
            const user = window.dashboard.currentUser || JSON.parse(localStorage.getItem('pharma_user') || 'null');
            if (!user || user.role !== 'Manufacturer') { alert('Only Manufacturer can add batches.'); return; }
            const id = document.getElementById('mf-batch-id').value?.trim();
            const drug = document.getElementById('mf-drug-name').value?.trim();
            const loc = document.getElementById('mf-location').value?.trim() || 'Unknown';
            const mfgDate = document.getElementById('mf-manufacture-date')?.value || null;
            const qty = parseInt(document.getElementById('mf-qty')?.value || '0', 10) || null;
            if (!id || !drug) { alert('Enter Batch ID and Drug Name'); return; }
            if (window.dashboard.batches.find(b=>b.id===id)) { alert('Batch already exists'); return; }
            const newBatch = { id, drugName: drug, stage: 'Created', location: loc, manufactureDate: mfgDate, quantity: qty, approved: false };
            window.dashboard.batches.unshift(newBatch);
            window.dashboard.populateBatchTable();
            window.dashboard.populateBatchSelect();
            // clear inputs
            document.getElementById('mf-batch-id').value = '';
            document.getElementById('mf-drug-name').value = '';
            document.getElementById('mf-location').value = '';
            const mfgEl = document.getElementById('mf-manufacture-date'); if (mfgEl) mfgEl.value = '';
            const qtyEl = document.getElementById('mf-qty'); if (qtyEl) qtyEl.value = '';
            alert(`Batch ${id} added. FDA must approve it before distribution.`);
        });
    }
    // sync UI role display again
    const user = window.dashboard.currentUser || JSON.parse(localStorage.getItem('pharma_user') || 'null');
    window.dashboard.updateUIForRole(user);
    // refresh overview stats on load
    window.dashboard.updateOverviewStats();
});