// ==============================================================================
// EXCEL SCHOOL STALL – DIGITAL WALLET & SALES TRACKER
// Client-Side Application Core & Real-time State Controller
// Excel Matriculation Hr. Sec. School
// ==============================================================================

class SchoolStallApp {
  constructor() {
    this.apiBase = (window.location.origin && window.location.origin.startsWith('http')) ? window.location.origin : 'http://localhost:8888';
    this.data = null;
    this.currentStudentId = 'STU001'; // Default: Hari
    this.currentStallId = 'STALL01';  // Default: Mystery Shop
    this.activeView = 'home';
    this.activeRole = 'all';
    this.isOnline = false;
    this.qrScanner = null;
    this.audioCtx = null;
    this.syncTimer = null;
    this.pendingPurchase = null;

    this.init();
  }

  async init() {
    // Unregister any conflicting service worker from other projects (e.g. Nova AI)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(regs => {
        for (const reg of regs) {
          reg.unregister();
        }
      }).catch(e => console.warn('SW unregister error', e));
    }

    this.bindNavigation();
    this.bindRoleSelector();
    this.bindSearch();
    await this.loadInitialData();
    this.setupAutoSync();
    this.renderCurrentView();
    this.renderNavigationState();

    window.addEventListener('resize', () => {
      if (this.activeView === 'admin' && this.data) {
        this.renderAdminCharts(this.data.stalls || [], this.data.transactions || []);
      }
    });
  }

  // ============================================================================
  // AUDIO SYNTHESIS CHIMES (No external audio files needed)
  // ============================================================================
  getAudioContext() {
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.audioCtx = new AudioContext();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  playSuccessChime() {
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'sine';

      osc1.frequency.setValueAtTime(659.25, now); // E5
      osc2.frequency.setValueAtTime(987.77, now + 0.12); // B5

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc1.stop(now + 0.12);
      osc2.start(now + 0.12);
      osc2.stop(now + 0.6);
    } catch (e) {
      console.warn('Audio chime muted', e);
    }
  }

  playErrorBuzzer() {
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.setValueAtTime(120, now + 0.1);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.35);
    } catch (e) {
      console.warn('Audio buzzer muted', e);
    }
  }

  // ============================================================================
  // DATA MANAGEMENT & REAL-TIME SYNC
  // ============================================================================
  async loadInitialData() {
    try {
      const res = await fetch(`${this.apiBase}/api/data`);
      if (res.ok) {
        this.data = await res.json();
        this.isOnline = true;
        this.updateServerStatusBadge(true);
        this.saveLocalBackup(this.data);
        return;
      }
    } catch (err) {
      console.warn('Live API unavailable, checking local storage cache...', err);
    }

    // Fallback to local storage or demo data
    const local = localStorage.getItem('excel_school_stall_db');
    if (local) {
      try {
        this.data = JSON.parse(local);
        this.isOnline = false;
        this.updateServerStatusBadge(false);
        return;
      } catch (e) {
        console.error('Local cache corrupted', e);
      }
    }

    // Default Seed Data
    this.data = this.getDefaultDemoData();
    this.saveLocalBackup(this.data);
    this.isOnline = false;
    this.updateServerStatusBadge(false);
  }

  setupAutoSync() {
    if (this.syncTimer) clearInterval(this.syncTimer);
    this.syncTimer = setInterval(async () => {
      try {
        const res = await fetch(`${this.apiBase}/api/data`);
        if (res.ok) {
          const freshData = await res.json();
          // Check if changed
          if (JSON.stringify(freshData) !== JSON.stringify(this.data)) {
            this.data = freshData;
            this.saveLocalBackup(this.data);
            this.renderCurrentView();
            this.updateHeaderTotal();
          }
          if (!this.isOnline) {
            this.isOnline = true;
            this.updateServerStatusBadge(true);
          }
        } else {
          if (this.isOnline) {
            this.isOnline = false;
            this.updateServerStatusBadge(false);
          }
        }
      } catch (e) {
        if (this.isOnline) {
          this.isOnline = false;
          this.updateServerStatusBadge(false);
        }
      }
    }, 1500);
  }

  saveLocalBackup(data) {
    try {
      localStorage.setItem('excel_school_stall_db', JSON.stringify(data));
    } catch (e) {
      console.warn('Could not save to localStorage', e);
    }
  }

  updateServerStatusBadge(online) {
    const badge = document.getElementById('serverStatusBadge');
    const text = document.getElementById('serverStatusText');
    if (!badge || !text) return;

    if (online) {
      badge.querySelector('.status-dot').className = 'status-dot online';
      text.textContent = 'Live Server';
      badge.title = 'Connected to PowerShell REST Server';
    } else {
      badge.querySelector('.status-dot').className = 'status-dot offline';
      text.textContent = 'Offline Mode';
      badge.title = 'Running locally (Data cached in browser)';
    }
  }

  updateHeaderTotal() {
    if (!this.data) return;
    const stalls = this.data.stalls || [];
    const totalSales = stalls.reduce((sum, s) => sum + (Number(s.totalSales) || 0), 0);
    const el = document.getElementById('headerTotalSales');
    if (el) el.textContent = `₹${totalSales.toLocaleString()}`;
  }

  // ============================================================================
  // NAVIGATION & VIEW SWITCHING
  // ============================================================================
  bindNavigation() {
    document.querySelectorAll('[data-view]').forEach(el => {
      el.addEventListener('click', (e) => {
        const view = el.getAttribute('data-view');
        if (view) this.switchView(view);
      });
    });
  }

  switchView(viewName) {
    this.activeView = viewName;

    // Switch view containers
    document.querySelectorAll('.view-panel').forEach(panel => {
      panel.classList.remove('active');
    });
    const target = document.getElementById(`view-${viewName}`);
    if (target) {
      target.classList.add('active');
    }

    // Update Desktop Tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.classList.toggle('active', tab.getAttribute('data-view') === viewName);
    });

    // Update Mobile Nav
    document.querySelectorAll('.mobile-nav-item').forEach(item => {
      item.classList.toggle('active', item.getAttribute('data-view') === viewName);
    });

    // Re-render active view
    this.renderCurrentView();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  bindRoleSelector() {
    const select = document.getElementById('activeRoleSelect');
    if (!select) return;

    select.addEventListener('change', (e) => {
      this.activeRole = e.target.value;
      this.applyRolePermissions();
    });
  }

  applyRolePermissions() {
    const role = this.activeRole;
    if (role === 'student') {
      this.switchView('student');
    } else if (role === 'stall') {
      this.switchView('stall');
    } else if (role === 'admin') {
      this.switchView('admin');
    }
  }

  renderNavigationState() {
    this.updateHeaderTotal();
  }

  // ============================================================================
  // VIEW RENDER DISPATCHER
  // ============================================================================
  renderCurrentView() {
    if (!this.data) return;
    this.updateHeaderTotal();

    switch (this.activeView) {
      case 'home':
        this.renderHomeView();
        break;
      case 'student':
        this.renderStudentView();
        break;
      case 'stall':
        this.renderStallView();
        break;
      case 'leaderboard':
        this.renderLeaderboardView();
        break;
      case 'admin':
        this.renderAdminView();
        break;
      case 'reports':
        this.renderReportsView();
        break;
    }
  }

  // ============================================================================
  // 1. HOME VIEW
  // ============================================================================
  renderHomeView() {
    const students = this.data.students || [];
    const stalls = this.data.stalls || [];
    const txns = (this.data.transactions || []).filter(t => t.status !== 'REVERSED');

    const totalStudents = students.length;
    const totalStalls = stalls.length;
    const totalSales = stalls.reduce((sum, s) => sum + (Number(s.totalSales) || 0), 0);
    const totalTxns = txns.length;

    // Metrics Cards
    document.getElementById('homeTotalStudents').textContent = totalStudents;
    document.getElementById('homeTotalStalls').textContent = totalStalls;
    document.getElementById('homeTotalSales').textContent = `₹${totalSales.toLocaleString()}`;
    document.getElementById('homeTotalTxns').textContent = totalTxns;

    // Recent Purchases Feed
    const feedContainer = document.getElementById('homeRecentPurchases');
    if (feedContainer) {
      if (txns.length === 0) {
        feedContainer.innerHTML = '<div class="p-3 text-muted text-sm text-center">No transactions recorded yet today.</div>';
      } else {
        const recent = txns.slice(0, 6);
        feedContainer.innerHTML = recent.map(t => `
          <div class="feed-item">
            <div class="feed-icon">🛒</div>
            <div class="feed-details">
              <div class="feed-header">
                <strong>${this.escapeHtml(t.studentName)}</strong>
                <span class="feed-amount">₹${t.amount}</span>
              </div>
              <div class="feed-meta">
                <span>${this.escapeHtml(t.stallName)} • ${this.escapeHtml(t.product)} (${t.quantity}x)</span>
                <span class="feed-time">${t.time}</span>
              </div>
            </div>
          </div>
        `).join('');
      }
    }

    // Top Stalls Widget
    const topStallsContainer = document.getElementById('homeTopStallsList');
    if (topStallsContainer) {
      const sortedStalls = [...stalls].sort((a, b) => (b.totalSales || 0) - (a.totalSales || 0));
      const maxSales = Math.max(1, ...stalls.map(s => s.totalSales || 0));

      topStallsContainer.innerHTML = sortedStalls.slice(0, 4).map((s, idx) => {
        const percent = Math.round(((s.totalSales || 0) / maxSales) * 100);
        const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
        return `
          <div class="top-stall-row">
            <div class="top-stall-rank">${medal}</div>
            <div class="top-stall-info">
              <div class="flex-between">
                <strong class="text-sm">${this.escapeHtml(s.name)}</strong>
                <span class="font-bold text-navy">₹${(s.totalSales || 0).toLocaleString()}</span>
              </div>
              <div class="progress-bar-bg">
                <div class="progress-bar-fill" style="width: ${percent}%;"></div>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // ============================================================================
  // 2. STUDENT WALLET VIEW
  // ============================================================================
  renderStudentView() {
    const students = this.data.students || [];
    const select = document.getElementById('currentStudentSelect');
    if (select) {
      select.innerHTML = students.map(s => `
        <option value="${s.id}" ${s.id === this.currentStudentId ? 'selected' : ''}>
          ${this.escapeHtml(s.name)} (${s.id} - Class ${s.class || ''} ${s.section || ''})
        </option>
      `).join('');
    }

    let student = students.find(s => s.id === this.currentStudentId);
    if (!student && students.length > 0) {
      student = students[0];
      this.currentStudentId = student.id;
    }
    if (!student) return;

    // Student Wallet Card Elements
    document.getElementById('studentWalletBalance').textContent = `₹${student.balance || 0}`;
    document.getElementById('studentWalletName').textContent = student.name;
    document.getElementById('studentWalletId').textContent = student.id;
    document.getElementById('studentWalletClass').textContent = `${student.class || '12'} - ${student.section || 'A'}`;
    document.getElementById('studentStartingBal').textContent = `₹${student.startingBalance || 100}`;
    document.getElementById('studentTotalSpent').textContent = `₹${student.totalSpent || 0}`;

    const statusTag = document.getElementById('studentWalletStatus');
    if (statusTag) {
      if ((student.balance || 0) <= 0) {
        statusTag.textContent = 'Empty • Requires Top-Up';
        statusTag.style.background = '#fef2f2';
        statusTag.style.color = '#dc2626';
      } else {
        statusTag.textContent = 'Active • Ready to Spend';
        statusTag.style.background = '#ecfdf5';
        statusTag.style.color = '#059669';
      }
    }

    // Generate Student QR Pass
    this.renderStudentQrCode(student.id);

    // Filter Student Purchases
    const txns = (this.data.transactions || []).filter(t => t.studentId === student.id);
    const tbody = document.getElementById('studentTxnTableBody');
    const badge = document.getElementById('studentTxnCountBadge');
    if (badge) badge.textContent = `${txns.length} Purchases`;

    if (tbody) {
      if (txns.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" class="text-center py-4 text-muted">
              No purchases recorded yet. Visit any school stall to spend your ₹${student.balance || 0} wallet balance!
            </td>
          </tr>
        `;
      } else {
        tbody.innerHTML = txns.map(t => {
          const isRev = t.status === 'REVERSED';
          return `
            <tr class="${isRev ? 'row-reversed' : ''}">
              <td>${t.time}</td>
              <td><strong>${this.escapeHtml(t.stallName)}</strong></td>
              <td>${this.escapeHtml(t.product)}</td>
              <td>${t.quantity}</td>
              <td class="font-bold ${isRev ? 'text-muted' : 'text-accent'}">
                ${isRev ? '<s>₹' + t.amount + '</s>' : '₹' + t.amount}
              </td>
              <td>₹${t.remainingBalance}</td>
              <td>
                <span class="badge ${isRev ? 'badge-danger' : 'badge-success'}">
                  ${t.status}
                </span>
              </td>
            </tr>
          `;
        }).join('');
      }
    }

    // Stalls & Menu Catalog for Students
    const catalogContainer = document.getElementById('studentStallCatalog');
    if (catalogContainer) {
      const stalls = this.data.stalls || [];
      catalogContainer.innerHTML = stalls.map(st => `
        <div class="stall-catalog-card">
          <div class="catalog-header">
            <h4>${this.escapeHtml(st.name)}</h4>
            <span class="badge badge-neutral text-xs">${this.escapeHtml(st.team || '')}</span>
          </div>
          <div class="catalog-items-list">
            ${(st.products || []).map(p => `
              <div class="catalog-item-row">
                <span>${this.escapeHtml(p.name)}</span>
                <strong class="text-navy">₹${p.price}</strong>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('');
    }
  }

  selectStudent(studentId) {
    this.currentStudentId = studentId;
    this.renderStudentView();
  }

  renderStudentQrCode(studentId) {
    const container = document.getElementById('studentQrCanvas');
    const label = document.getElementById('studentQrCodeText');
    if (!container) return;

    container.innerHTML = '';
    if (label) label.textContent = studentId;

    if (window.QRCode) {
      new QRCode(container, {
        text: studentId,
        width: 140,
        height: 140,
        colorDark: '#0b2265',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
      });
    } else {
      container.innerHTML = `<div class="p-3 font-mono font-bold text-navy">[QR: ${studentId}]</div>`;
    }
  }

  // ============================================================================
  // 3. STALL OPERATOR POS & DASHBOARD VIEW
  // ============================================================================
  renderStallView() {
    const stalls = this.data.stalls || [];
    const select = document.getElementById('currentStallSelect');
    if (select) {
      select.innerHTML = stalls.map(s => `
        <option value="${s.id}" ${s.id === this.currentStallId ? 'selected' : ''}>
          ${this.escapeHtml(s.name)} (${s.id})
        </option>
      `).join('');
    }

    let stall = stalls.find(s => s.id === this.currentStallId);
    if (!stall && stalls.length > 0) {
      stall = stalls[0];
      this.currentStallId = stall.id;
    }
    if (!stall) return;

    // Stall Header Card
    document.getElementById('stallIdBadge').textContent = stall.id;
    document.getElementById('stallBannerName').textContent = stall.name;
    document.getElementById('stallTeamName').textContent = `Operated by ${stall.team || 'Student Team'}`;

    // Stall Metrics
    const txns = (this.data.transactions || []).filter(t => t.stallId === stall.id && t.status !== 'REVERSED');
    const totalSales = Number(stall.totalSales) || 0;
    const txnCount = txns.length;
    const itemsSold = Number(stall.itemsSold) || 0;
    const avg = txnCount > 0 ? (totalSales / txnCount).toFixed(2) : '0.00';

    // Unique Customers count
    const uniqueStudents = new Set(txns.map(t => t.studentId)).size;

    // Best-selling Product
    const prodCounts = {};
    txns.forEach(t => {
      prodCounts[t.product] = (prodCounts[t.product] || 0) + (Number(t.quantity) || 1);
    });
    let bestSeller = '-';
    let maxSold = 0;
    for (const [prod, qty] of Object.entries(prodCounts)) {
      if (qty > maxSold) {
        maxSold = qty;
        bestSeller = `${prod} (${qty})`;
      }
    }

    document.getElementById('stallTotalSales').textContent = `₹${totalSales.toLocaleString()}`;
    document.getElementById('stallTxnCount').textContent = txnCount;
    document.getElementById('stallItemsSold').textContent = itemsSold;
    document.getElementById('stallAvgPurchase').textContent = `₹${avg}`;
    const custEl = document.getElementById('stallUniqueCustomers');
    if (custEl) custEl.textContent = uniqueStudents;
    const bestEl = document.getElementById('stallBestSeller');
    if (bestEl) bestEl.textContent = bestSeller;

    // Populate POS Student Dropdown
    const studentSelect = document.getElementById('posStudentSelect');
    if (studentSelect) {
      const curVal = studentSelect.value;
      studentSelect.innerHTML = '<option value="">-- Choose Student --</option>' +
        (this.data.students || []).map(s => `
          <option value="${s.id}" ${s.id === curVal ? 'selected' : ''}>
            ${this.escapeHtml(s.name)} (ID: ${s.id} | Bal: ₹${s.balance})
          </option>
        `).join('');
    }

    // Populate POS Product Dropdown
    const productSelect = document.getElementById('posProductSelect');
    if (productSelect) {
      const curProd = productSelect.value;
      productSelect.innerHTML = '<option value="">-- Choose Product --</option>' +
        (stall.products || []).map(p => `
          <option value="${p.id}" data-price="${p.price}" data-name="${this.escapeHtml(p.name)}" ${p.id === curProd ? 'selected' : ''}>
            ${this.escapeHtml(p.name)} — ₹${p.price}
          </option>
        `).join('') +
        `<option value="custom" ${curProd === 'custom' ? 'selected' : ''}>✨ [+ Manual Custom Item Entry...]</option>`;
    }

    // Stall Products Management Table
    const prodTbody = document.getElementById('stallProductsTableBody');
    const prodCountBadge = document.getElementById('stallProductCountBadge');
    if (prodCountBadge) prodCountBadge.textContent = `${(stall.products || []).length} Items`;

    if (prodTbody) {
      prodTbody.innerHTML = (stall.products || []).map(p => `
        <tr>
          <td><strong>${this.escapeHtml(p.name)}</strong></td>
          <td><span class="font-bold text-navy">₹${p.price}</span></td>
          <td>
            <div class="flex-gap">
              <button type="button" class="btn btn-xs btn-outline" onclick="app.openEditProductModal('${stall.id}', '${p.id}')">Edit</button>
              <button type="button" class="btn btn-xs btn-danger-outline" onclick="app.deleteProduct('${stall.id}', '${p.id}')">&times;</button>
            </div>
          </td>
        </tr>
      `).join('');
    }

    // Stall Sales Ledger Table
    const stallTxnTbody = document.getElementById('stallTxnTableBody');
    const stallSalesBadge = document.getElementById('stallSalesCountBadge');
    if (stallSalesBadge) stallSalesBadge.textContent = `${txns.length} Sales`;

    if (stallTxnTbody) {
      if (txns.length === 0) {
        stallTxnTbody.innerHTML = '<tr><td colspan="6" class="text-center py-3 text-muted">No sales recorded yet for this stall.</td></tr>';
      } else {
        stallTxnTbody.innerHTML = txns.map(t => `
          <tr>
            <td class="font-mono text-xs font-bold">${t.id}</td>
            <td>${t.time}</td>
            <td>${this.escapeHtml(t.studentName)}</td>
            <td>${this.escapeHtml(t.product)}</td>
            <td>${t.quantity}</td>
            <td class="font-bold text-accent">₹${t.amount}</td>
          </tr>
        `).join('');
      }
    }

    // Recalculate POS preview
    this.updatePosMath();
  }

  selectStall(stallId) {
    this.currentStallId = stallId;
    this.renderStallView();
  }

  onPosStudentChange(studentId) {
    const student = (this.data.students || []).find(s => s.id === studentId);
    const nameEl = document.getElementById('posStudentName');
    const metaEl = document.getElementById('posStudentMeta');
    const balEl = document.getElementById('posStudentAvailableBal');

    if (student) {
      nameEl.textContent = `${student.name} (${student.id})`;
      metaEl.textContent = `Class ${student.class || '12'} - Section ${student.section || 'A'}`;
      balEl.textContent = `₹${student.balance || 0}`;
    } else {
      nameEl.textContent = 'Select a student above';
      metaEl.textContent = 'Class & Section';
      balEl.textContent = '₹0';
    }

    this.updatePosMath();
  }

  filterPosStudentSelect(query) {
    query = (query || '').toLowerCase().trim();
    const studentSelect = document.getElementById('posStudentSelect');
    if (!studentSelect) return;

    const students = this.data.students || [];
    let matchedStudentId = '';

    studentSelect.innerHTML = '<option value="">-- Choose Student --</option>' +
      students.map(s => {
        const matches = s.name.toLowerCase().includes(query) || s.id.toLowerCase().includes(query);
        if (matches && !matchedStudentId && query) matchedStudentId = s.id;
        return `
          <option value="${s.id}" ${matches ? '' : 'style="display:none;"'}>
            ${this.escapeHtml(s.name)} (ID: ${s.id} | Bal: ₹${s.balance})
          </option>
        `;
      }).join('');

    if (matchedStudentId && query) {
      studentSelect.value = matchedStudentId;
      this.onPosStudentChange(matchedStudentId);
    }
  }

  togglePosCustomItem(show) {
    const box = document.getElementById('posCustomItemBox');
    const select = document.getElementById('posProductSelect');
    if (!box || !select) return;

    if (show) {
      select.value = 'custom';
      box.style.display = 'block';
      const nameInput = document.getElementById('posCustomName');
      if (nameInput) nameInput.focus();
    } else {
      if (select.value === 'custom') select.value = '';
      box.style.display = 'none';
    }
    this.updatePosMath();
  }

  onPosCustomChange() {
    this.updatePosMath();
  }

  onPosProductChange() {
    const select = document.getElementById('posProductSelect');
    const box = document.getElementById('posCustomItemBox');
    if (select && select.value === 'custom') {
      if (box) box.style.display = 'block';
    } else {
      if (box) box.style.display = 'none';
    }
    this.updatePosMath();
  }

  onPosQtyChange() {
    const qtyInput = document.getElementById('posQuantity');
    let val = parseInt(qtyInput.value) || 1;
    if (val < 1) val = 1;
    if (val > 50) val = 50;
    qtyInput.value = val;
    this.updatePosMath();
  }

  adjustQty(delta) {
    const qtyInput = document.getElementById('posQuantity');
    let val = (parseInt(qtyInput.value) || 1) + delta;
    if (val < 1) val = 1;
    if (val > 50) val = 50;
    qtyInput.value = val;
    this.updatePosMath();
  }

  updatePosMath() {
    const studentSelect = document.getElementById('posStudentSelect');
    const productSelect = document.getElementById('posProductSelect');
    const qtyInput = document.getElementById('posQuantity');
    const unitPriceEl = document.getElementById('posUnitPrice');
    const totalAmountEl = document.getElementById('posTotalAmount');
    const confirmBtn = document.getElementById('posConfirmBtn');
    const warningBox = document.getElementById('posInsufficientWarning');

    const mathCurrentBal = document.getElementById('mathCurrentBal');
    const mathPurchaseTotal = document.getElementById('mathPurchaseTotal');
    const mathRemainingBal = document.getElementById('mathRemainingBal');

    const studentId = studentSelect ? studentSelect.value : '';
    const student = (this.data.students || []).find(s => s.id === studentId);

    let unitPrice = 0;
    let isCustom = false;
    let customName = '';

    if (productSelect && productSelect.value === 'custom') {
      isCustom = true;
      const customPriceInput = document.getElementById('posCustomPrice');
      const customNameInput = document.getElementById('posCustomName');
      unitPrice = customPriceInput ? (parseFloat(customPriceInput.value) || 0) : 0;
      customName = customNameInput ? customNameInput.value.trim() : '';
    } else {
      const selectedOpt = productSelect && productSelect.selectedIndex >= 0 ? productSelect.options[productSelect.selectedIndex] : null;
      unitPrice = selectedOpt && selectedOpt.dataset.price ? Number(selectedOpt.dataset.price) : 0;
    }

    const qty = parseInt(qtyInput ? qtyInput.value : 1) || 1;
    const total = unitPrice * qty;

    if (unitPriceEl) unitPriceEl.textContent = `₹${unitPrice}`;
    if (totalAmountEl) totalAmountEl.textContent = `₹${total}`;

    const curBal = student ? Number(student.balance) || 0 : 0;
    const remBal = curBal - total;

    if (mathCurrentBal) mathCurrentBal.textContent = `₹${curBal}`;
    if (mathPurchaseTotal) mathPurchaseTotal.textContent = `₹${total}`;
    if (mathRemainingBal) {
      mathRemainingBal.textContent = `₹${remBal}`;
      mathRemainingBal.className = remBal < 0 ? 'text-danger' : 'text-success';
    }

    // Validation checks
    const hasStudent = !!student;
    const hasProduct = isCustom ? (unitPrice > 0 && !!customName) : (unitPrice > 0);
    const isSufficient = curBal >= total && total > 0;

    if (hasStudent && hasProduct && curBal < total) {
      if (warningBox) warningBox.style.display = 'block';
      if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = '⚠️ Insufficient Balance';
      }
    } else {
      if (warningBox) warningBox.style.display = 'none';
      if (confirmBtn) {
        if (hasStudent && hasProduct && isSufficient) {
          confirmBtn.disabled = false;
          confirmBtn.textContent = `✅ CONFIRM PURCHASE (₹${total})`;
        } else {
          confirmBtn.disabled = true;
          confirmBtn.textContent = `✅ CONFIRM PURCHASE (₹${total})`;
        }
      }
    }
  }

  handlePosSubmit(event) {
    event.preventDefault();
    const studentSelect = document.getElementById('posStudentSelect');
    const productSelect = document.getElementById('posProductSelect');
    const qtyInput = document.getElementById('posQuantity');

    const studentId = studentSelect.value;
    const productId = productSelect.value;
    const qty = parseInt(qtyInput.value) || 1;

    const student = (this.data.students || []).find(s => s.id === studentId);
    const stall = (this.data.stalls || []).find(s => s.id === this.currentStallId);

    if (!student || !stall) {
      alert('Please select a valid student and stall.');
      return;
    }

    let productName = '';
    let unitPrice = 0;
    let isCustom = false;
    let saveToMenu = false;

    if (productId === 'custom') {
      isCustom = true;
      productName = (document.getElementById('posCustomName').value || '').trim();
      unitPrice = parseFloat(document.getElementById('posCustomPrice').value) || 0;
      saveToMenu = document.getElementById('posSaveToMenu') ? document.getElementById('posSaveToMenu').checked : false;

      if (!productName || unitPrice <= 0) {
        alert('Please enter a valid item name and price for the manual product.');
        return;
      }
    } else {
      const product = stall ? (stall.products || []).find(p => p.id === productId) : null;
      if (!product) {
        alert('Please select a valid product.');
        return;
      }
      productName = product.name;
      unitPrice = product.price;
    }

    const total = unitPrice * qty;
    if (student.balance < total) {
      this.playErrorBuzzer();
      alert('Insufficient Balance: Student cannot afford this purchase.');
      return;
    }

    // Prepare confirmation modal
    this.pendingPurchase = {
      studentId: student.id,
      studentName: student.name,
      stallId: stall.id,
      stallName: stall.name,
      productId: isCustom ? 'custom' : productId,
      productName: productName,
      unitPrice: unitPrice,
      quantity: qty,
      totalAmount: total,
      currentBalance: student.balance,
      remainingBalance: student.balance - total,
      isCustom: isCustom,
      saveToMenu: saveToMenu
    };

    document.getElementById('confStudentName').textContent = `${student.name} (${student.id})`;
    document.getElementById('confStallName').textContent = stall.name;
    document.getElementById('confProductName').textContent = productName;
    document.getElementById('confQuantity').textContent = `${qty} × ₹${unitPrice}`;
    document.getElementById('confTotalAmount').textContent = `₹${total}`;
    document.getElementById('confCurrentBal').textContent = `₹${student.balance}`;
    document.getElementById('confRemainingBal').textContent = `₹${student.balance - total}`;
    document.getElementById('modalConfirmPurchaseBtn').textContent = `Confirm & Deduct ₹${total}`;

    this.openModal('modalPurchaseConfirm');
  }

  async executePurchase() {
    if (!this.pendingPurchase) return;
    const p = this.pendingPurchase;
    this.closeModal('modalPurchaseConfirm');

    try {
      if (this.isOnline) {
        const res = await fetch(`${this.apiBase}/api/purchase`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            studentId: p.studentId,
            stallId: p.stallId,
            productId: p.productId,
            productName: p.productName,
            price: p.unitPrice,
            quantity: p.quantity,
            isCustom: p.isCustom,
            saveToMenu: p.saveToMenu
          })
        });

        const result = await res.json();
        if (!res.ok || !result.success) {
          this.playErrorBuzzer();
          alert(result.error || 'Purchase failed.');
          return;
        }

        this.data = result.data;
        this.saveLocalBackup(this.data);
        this.showPurchaseSuccess(result.transaction);
      } else {
        // Standalone offline execution
        const student = (this.data.students || []).find(s => s.id === p.studentId);
        const stall = (this.data.stalls || []).find(s => s.id === p.stallId);

        if (student.balance < p.totalAmount) {
          this.playErrorBuzzer();
          alert('Insufficient Balance');
          return;
        }

        student.balance -= p.totalAmount;
        student.totalSpent = (student.totalSpent || 0) + p.totalAmount;
        student.transactionsCount = (student.transactionsCount || 0) + 1;

        stall.totalSales = (stall.totalSales || 0) + p.totalAmount;
        stall.transactionsCount = (stall.transactionsCount || 0) + 1;
        stall.itemsSold = (stall.itemsSold || 0) + p.quantity;

        if (p.isCustom && p.saveToMenu) {
          const newP = {
            id: 'P' + String((stall.products || []).length + 1).padStart(2, '0'),
            name: p.productName,
            price: p.unitPrice
          };
          stall.products.push(newP);
        }

        const txnId = 'TXN' + (1001 + (this.data.transactions || []).length);
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dateStr = now.toISOString().split('T')[0];

        const newTxn = {
          id: txnId,
          studentId: student.id,
          studentName: student.name,
          stallId: stall.id,
          stallName: stall.name,
          product: p.productName,
          quantity: p.quantity,
          price: p.unitPrice,
          amount: p.totalAmount,
          time: timeStr,
          date: dateStr,
          remainingBalance: student.balance,
          status: 'COMPLETED'
        };

        this.data.transactions.unshift(newTxn);
        this.saveLocalBackup(this.data);
        this.showPurchaseSuccess(newTxn);
      }
    } catch (e) {
      console.error('Purchase execution error', e);
      alert('Error recording purchase: ' + e.message);
    }
  }

  showPurchaseSuccess(txn) {
    this.playSuccessChime();

    document.getElementById('succTxnId').textContent = txn.id;
    document.getElementById('succStudentName').textContent = txn.studentName;
    document.getElementById('succItem').textContent = `${txn.product} × ${txn.quantity}`;
    document.getElementById('succAmount').textContent = `₹${txn.amount}`;
    document.getElementById('succRemainingBal').textContent = `₹${txn.remainingBalance}`;

    this.openModal('modalPurchaseSuccess');

    // Reset POS fields
    const prodSelect = document.getElementById('posProductSelect');
    if (prodSelect) prodSelect.value = '';
    const qtyInput = document.getElementById('posQuantity');
    if (qtyInput) qtyInput.value = 1;

    // Refresh active view
    this.renderCurrentView();
  }

  // ============================================================================
  // 4. SALES LEADERBOARD VIEW
  // ============================================================================
  renderLeaderboardView() {
    if (!this.data) return;
    const stalls = [...(this.data.stalls || [])];
    stalls.sort((a, b) => (b.totalSales || 0) - (a.totalSales || 0));

    // Render Dynamic Podium (Top 3)
    const podiumEl = document.getElementById('podiumContainer');
    if (podiumEl) {
      const top1 = stalls[0] || { name: 'None', totalSales: 0, team: '' };
      const top2 = stalls[1] || { name: 'None', totalSales: 0, team: '' };
      const top3 = stalls[2] || { name: 'None', totalSales: 0, team: '' };

      podiumEl.innerHTML = `
        <!-- Rank 2: Silver -->
        <div class="podium-card podium-silver">
          <div class="podium-badge">🥈 #2 SILVER</div>
          <h3 class="podium-name">${this.escapeHtml(top2.name)}</h3>
          <p class="podium-team">${this.escapeHtml(top2.team || '')}</p>
          <div class="podium-sales">₹${(top2.totalSales || 0).toLocaleString()}</div>
          <div class="podium-stats-row">
            <span>${top2.transactionsCount || 0} Orders</span>
            <span>•</span>
            <span>${top2.itemsSold || 0} Items</span>
          </div>
        </div>

        <!-- Rank 1: Gold Champion -->
        <div class="podium-card podium-gold">
          <div class="trophy-icon-crown">🏆</div>
          <div class="podium-badge gold-badge">🥇 #1 GRAND CHAMPION</div>
          <h3 class="podium-name font-xl">${this.escapeHtml(top1.name)}</h3>
          <p class="podium-team">${this.escapeHtml(top1.team || '')}</p>
          <div class="podium-sales font-xxl">₹${(top1.totalSales || 0).toLocaleString()}</div>
          <div class="podium-stats-row font-bold">
            <span>${top1.transactionsCount || 0} Orders</span>
            <span>•</span>
            <span>${top1.itemsSold || 0} Items Sold</span>
          </div>
        </div>

        <!-- Rank 3: Bronze -->
        <div class="podium-card podium-bronze">
          <div class="podium-badge">🥉 #3 BRONZE</div>
          <h3 class="podium-name">${this.escapeHtml(top3.name)}</h3>
          <p class="podium-team">${this.escapeHtml(top3.team || '')}</p>
          <div class="podium-sales">₹${(top3.totalSales || 0).toLocaleString()}</div>
          <div class="podium-stats-row">
            <span>${top3.transactionsCount || 0} Orders</span>
            <span>•</span>
            <span>${top3.itemsSold || 0} Items</span>
          </div>
        </div>
      `;
    }

    // Render Standings Table
    const tbody = document.getElementById('leaderboardTableBody');
    if (tbody) {
      const maxSales = Math.max(1, ...stalls.map(s => s.totalSales || 0));
      tbody.innerHTML = stalls.map((s, idx) => {
        const rank = idx + 1;
        const percent = Math.round(((s.totalSales || 0) / maxSales) * 100);
        const rankIcon = rank === 1 ? '🏆 1' : rank === 2 ? '🥈 2' : rank === 3 ? '🥉 3' : rank;
        return `
          <tr class="${rank === 1 ? 'row-champion' : ''}">
            <td class="text-center font-bold font-mono">${rankIcon}</td>
            <td>
              <strong>${this.escapeHtml(s.name)}</strong>
              ${rank === 1 ? ' <span class="badge badge-gold">Leader</span>' : ''}
            </td>
            <td class="text-muted">${this.escapeHtml(s.team || '')}</td>
            <td><strong class="text-navy font-bold">₹${(s.totalSales || 0).toLocaleString()}</strong></td>
            <td>${s.transactionsCount || 0}</td>
            <td>${s.itemsSold || 0}</td>
            <td width="160">
              <div class="progress-bar-bg">
                <div class="progress-bar-fill" style="width: ${percent}%;"></div>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }

    const updatedTag = document.getElementById('leaderboardLastUpdated');
    if (updatedTag) {
      updatedTag.textContent = `Updated: ${new Date().toLocaleTimeString()}`;
    }
  }

  // ============================================================================
  // 5. ADMIN CONTROL CENTER
  // ============================================================================
  renderAdminView() {
    if (!this.data) return;

    const students = this.data.students || [];
    const stalls = this.data.stalls || [];
    const txns = this.data.transactions || [];
    const completedTxns = txns.filter(t => t.status !== 'REVERSED');

    const totalStudents = students.length;
    const totalStalls = stalls.length;
    const totalSales = stalls.reduce((sum, s) => sum + (Number(s.totalSales) || 0), 0);
    const totalTxns = completedTxns.length;
    const totalItems = stalls.reduce((sum, s) => sum + (Number(s.itemsSold) || 0), 0);
    const circulatingMoney = students.reduce((sum, s) => sum + (Number(s.balance) || 0), 0);

    // KPI Cards
    document.getElementById('adminTotalStudents').textContent = totalStudents;
    document.getElementById('adminTotalStudentMoney').textContent = `Circulating: ₹${circulatingMoney.toLocaleString()}`;
    document.getElementById('adminTotalStalls').textContent = totalStalls;
    document.getElementById('adminTotalSales').textContent = `₹${totalSales.toLocaleString()}`;
    document.getElementById('adminTotalTxns').textContent = totalTxns;
    document.getElementById('adminTotalItemsSold').textContent = `${totalItems} Items Sold`;

    // Render 4 Canvas Charts
    this.renderAdminCharts(stalls, txns);

    // Render Students Table
    this.renderAdminStudentTable(students);

    // Render Stalls Table
    this.renderAdminStallTable(stalls);

    // Render Transactions Table
    this.renderAdminTxnTable(txns);
  }

  renderAdminStudentTable(students) {
    const tbody = document.getElementById('adminStudentTableBody');
    if (!tbody) return;

    tbody.innerHTML = students.map(s => `
      <tr>
        <td class="font-mono font-bold">${s.id}</td>
        <td><strong>${this.escapeHtml(s.name)}</strong></td>
        <td>${s.class || '12'} - ${s.section || 'A'}</td>
        <td>₹${s.startingBalance || 100}</td>
        <td><strong class="text-navy">₹${s.balance || 0}</strong></td>
        <td class="text-spent">₹${s.totalSpent || 0}</td>
        <td>${s.transactionsCount || 0}</td>
        <td>
          <div class="flex-gap">
            <button type="button" class="btn btn-xs btn-success" onclick="app.openTopUpModal('${s.id}')">💰 Top-Up</button>
            <button type="button" class="btn btn-xs btn-outline" onclick="app.openEditStudentModal('${s.id}')">Edit</button>
            <button type="button" class="btn btn-xs btn-danger-outline" onclick="app.deleteStudent('${s.id}')">Delete</button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  renderAdminStallTable(stalls) {
    const tbody = document.getElementById('adminStallTableBody');
    if (!tbody) return;

    tbody.innerHTML = stalls.map(st => {
      const menuSummary = (st.products || []).map(p => `${p.name} (₹${p.price})`).join(', ');
      return `
        <tr>
          <td class="font-mono font-bold">${st.id}</td>
          <td><strong>${this.escapeHtml(st.name)}</strong></td>
          <td>${this.escapeHtml(st.team || '')}</td>
          <td>
            <div class="text-xs text-muted" style="max-width: 260px; line-height: 1.3;">
              <strong>${(st.products || []).length} items:</strong> ${this.escapeHtml(menuSummary)}
            </div>
          </td>
          <td><strong class="text-navy">₹${(st.totalSales || 0).toLocaleString()}</strong></td>
          <td>${st.transactionsCount || 0}</td>
          <td>${st.itemsSold || 0}</td>
          <td>
            <div class="flex-gap">
              <button type="button" class="btn btn-xs btn-outline" onclick="app.openEditStallModal('${st.id}')">Edit</button>
              <button type="button" class="btn btn-xs btn-secondary" onclick="app.openAddProductModal('${st.id}')">+ Product</button>
              <button type="button" class="btn btn-xs btn-outline" onclick="app.openStallQrModal('${st.id}')">QR</button>
              <button type="button" class="btn btn-xs btn-danger-outline" onclick="app.deleteStall('${st.id}')">Delete</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  renderAdminTxnTable(txns) {
    const tbody = document.getElementById('adminTxnTableBody');
    if (!tbody) return;

    if (txns.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="text-center py-4 text-muted">No transactions recorded yet.</td></tr>';
      return;
    }

    tbody.innerHTML = txns.map(t => {
      const isRev = t.status === 'REVERSED';
      return `
        <tr class="${isRev ? 'row-reversed' : ''}">
          <td class="font-mono font-bold text-xs">${t.id}</td>
          <td>${t.time} <span class="text-xs text-muted">(${t.date})</span></td>
          <td>${this.escapeHtml(t.studentName)} <span class="text-xs font-mono text-muted">(${t.studentId})</span></td>
          <td><strong>${this.escapeHtml(t.stallName)}</strong></td>
          <td>${this.escapeHtml(t.product)} (${t.quantity}x)</td>
          <td><strong class="${isRev ? 'text-muted' : 'text-accent'}">${isRev ? '<s>₹' + t.amount + '</s>' : '₹' + t.amount}</strong></td>
          <td>₹${t.remainingBalance}</td>
          <td>
            <span class="badge ${isRev ? 'badge-danger' : 'badge-success'}">
              ${t.status}
            </span>
          </td>
          <td>
            ${isRev ?
              '<span class="text-xs text-muted">Reversed</span>' :
              `<button class="btn btn-xs btn-danger-outline" onclick="app.reverseTransaction('${t.id}')">↩ Undo / Refund</button>`
            }
          </td>
        </tr>
      `;
    }).join('');
  }

  // ============================================================================
  // 6. FOUR HIGH-RESOLUTION CANVAS CHARTS (100% Offline, Self-Contained)
  // ============================================================================
  renderAdminCharts(stalls, txns) {
    // 1. Sales by Stall (Horizontal bar chart)
    this.drawBarChart('chartStallSales', stalls.map(s => ({
      label: s.name,
      value: s.totalSales || 0,
      color: '#0b2265'
    })), 'Sales (₹)');

    // 2. Sales Over Time (Cumulative Line / Area Progression)
    this.drawSalesOverTimeChart('chartSalesOverTime', txns);

    // 3. Transactions Count by Stall (Bar chart)
    this.drawBarChart('chartStallTxns', stalls.map(s => ({
      label: s.name,
      value: s.transactionsCount || 0,
      color: '#2e86de'
    })), 'Orders Count');

    // 4. Top-Selling Products across event (Horizontal bar chart)
    this.drawTopProductsChart('chartTopProducts', stalls, txns);
  }

  drawBarChart(canvasId, items, valuePrefix) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width = canvas.parentElement.clientWidth || 500;
    const height = canvas.height = 240;

    ctx.clearRect(0, 0, width, height);
    if (items.length === 0) return;

    const maxVal = Math.max(10, ...items.map(i => i.value));
    const paddingLeft = 110;
    const paddingBottom = 30;
    const paddingTop = 20;
    const paddingRight = 50;

    const chartW = width - paddingLeft - paddingRight;
    const chartH = height - paddingTop - paddingBottom;
    const barHeight = Math.max(12, Math.min(24, chartH / items.length - 6));
    const gap = (chartH - (barHeight * items.length)) / (items.length + 1);

    items.forEach((item, idx) => {
      const y = paddingTop + gap + idx * (barHeight + gap);
      const barW = Math.max(4, (item.value / maxVal) * chartW);

      // Label
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const labelTrunc = item.label.length > 13 ? item.label.substring(0, 12) + '…' : item.label;
      ctx.fillText(labelTrunc, paddingLeft - 10, y + barHeight / 2);

      // Gradient Bar
      const grad = ctx.createLinearGradient(paddingLeft, y, paddingLeft + barW, y);
      grad.addColorStop(0, item.color);
      grad.addColorStop(1, '#38b6ff');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(paddingLeft, y, barW, barHeight, 4) : ctx.rect(paddingLeft, y, barW, barHeight);
      ctx.fill();

      // Value text
      ctx.fillStyle = '#0b2265';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(` ${item.value}`, paddingLeft + barW + 4, y + barHeight / 2);
    });
  }

  drawSalesOverTimeChart(canvasId, txns) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width = canvas.parentElement.clientWidth || 500;
    const height = canvas.height = 240;

    ctx.clearRect(0, 0, width, height);

    const validTxns = (txns || []).filter(t => t.status !== 'REVERSED').slice().reverse(); // Chronological

    const paddingLeft = 55;
    const paddingRight = 30;
    const paddingTop = 25;
    const paddingBottom = 35;
    const chartW = width - paddingLeft - paddingRight;
    const chartH = height - paddingTop - paddingBottom;

    if (validTxns.length === 0) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No completed transactions yet.', width / 2, height / 2);
      return;
    }

    // Build cumulative points
    let running = 0;
    const points = [{ label: 'Start', value: 0 }];
    validTxns.forEach((t, i) => {
      running += Number(t.amount) || 0;
      points.push({ label: t.time || `#${i+1}`, value: running });
    });

    const maxVal = Math.max(100, points[points.length - 1].value);

    // Draw Gridlines
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = paddingTop + (chartH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(paddingLeft, y);
      ctx.lineTo(width - paddingRight, y);
      ctx.stroke();

      const gridVal = Math.round(maxVal - (maxVal / 4) * i);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(`₹${gridVal}`, paddingLeft - 8, y);
    }

    // Draw Area & Line
    const stepX = chartW / (points.length - 1);
    ctx.beginPath();
    points.forEach((p, idx) => {
      const x = paddingLeft + idx * stepX;
      const y = paddingTop + chartH - (p.value / maxVal) * chartH;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    // Area Fill
    ctx.lineTo(width - paddingRight, paddingTop + chartH);
    ctx.lineTo(paddingLeft, paddingTop + chartH);
    ctx.closePath();

    const areaGrad = ctx.createLinearGradient(0, paddingTop, 0, paddingTop + chartH);
    areaGrad.addColorStop(0, 'rgba(46, 134, 222, 0.35)');
    areaGrad.addColorStop(1, 'rgba(46, 134, 222, 0.02)');
    ctx.fillStyle = areaGrad;
    ctx.fill();

    // Line Stroke
    ctx.beginPath();
    points.forEach((p, idx) => {
      const x = paddingLeft + idx * stepX;
      const y = paddingTop + chartH - (p.value / maxVal) * chartH;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#2e86de';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Points & Labels
    points.forEach((p, idx) => {
      const x = paddingLeft + idx * stepX;
      const y = paddingTop + chartH - (p.value / maxVal) * chartH;

      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#0b2265';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Show time labels on bottom (every other if many points)
      if (points.length <= 8 || idx === 0 || idx === points.length - 1 || idx % 2 === 0) {
        ctx.fillStyle = '#64748b';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(p.label, x, paddingTop + chartH + 8);
      }
    });
  }

  drawTopProductsChart(canvasId, stalls, txns) {
    const counts = {};
    const validTxns = (txns || []).filter(t => t.status !== 'REVERSED');

    validTxns.forEach(t => {
      counts[t.product] = (counts[t.product] || 0) + (Number(t.quantity) || 1);
    });

    const items = Object.entries(counts).map(([name, qty]) => ({
      label: name,
      value: qty,
      color: '#dc2626'
    })).sort((a, b) => b.value - a.value).slice(0, 6);

    if (items.length === 0) {
      // Seed with stalls sample products if no sales yet
      const sample = [];
      stalls.forEach(st => {
        (st.products || []).forEach(p => {
          if (sample.length < 5) sample.push({ label: p.name, value: 0, color: '#dc2626' });
        });
      });
      this.drawBarChart(canvasId, sample, 'Units Sold');
    } else {
      this.drawBarChart(canvasId, items, 'Units Sold');
    }
  }

  // ============================================================================
  // 7. REPORTS & EXPORTS
  // ============================================================================
  renderReportsView() {
    if (!this.data) return;

    const students = this.data.students || [];
    const stalls = [...(this.data.stalls || [])];
    const txns = (this.data.transactions || []).filter(t => t.status !== 'REVERSED');

    const totalStudents = students.length;
    const totalStalls = stalls.length;
    const totalStarting = students.reduce((acc, s) => acc + (Number(s.startingBalance) || 100), 0);
    const totalSpent = stalls.reduce((acc, s) => acc + (Number(s.totalSales) || 0), 0);
    const remainingCirc = students.reduce((acc, s) => acc + (Number(s.balance) || 0), 0);
    const totalItems = stalls.reduce((acc, s) => acc + (Number(s.itemsSold) || 0), 0);
    const avgOrder = txns.length > 0 ? (totalSpent / txns.length).toFixed(2) : '0.00';

    document.getElementById('repStudentsCount').textContent = totalStudents;
    document.getElementById('repStallsCount').textContent = totalStalls;
    document.getElementById('repTotalStarting').textContent = `₹${totalStarting.toLocaleString()}`;
    document.getElementById('repTotalSpent').textContent = `₹${totalSpent.toLocaleString()}`;
    document.getElementById('repRemainingCirculation').textContent = `₹${remainingCirc.toLocaleString()}`;
    document.getElementById('repCompletedTxns').textContent = txns.length;
    document.getElementById('repItemsSold').textContent = totalItems;
    document.getElementById('repAvgOrderVal').textContent = `₹${avgOrder}`;
    document.getElementById('reportGeneratedDate').textContent = `Generated: ${new Date().toLocaleString()}`;

    // Stall-wise Breakdown
    stalls.sort((a, b) => (b.totalSales || 0) - (a.totalSales || 0));
    const tbody = document.getElementById('reportStallsTableBody');
    if (tbody) {
      tbody.innerHTML = stalls.map((s, idx) => {
        const avg = s.transactionsCount > 0 ? (s.totalSales / s.transactionsCount).toFixed(2) : '0.00';
        const share = totalSpent > 0 ? ((s.totalSales / totalSpent) * 100).toFixed(1) : '0.0';
        return `
          <tr>
            <td><strong>#${idx + 1}</strong></td>
            <td><strong>${this.escapeHtml(s.name)}</strong></td>
            <td>${this.escapeHtml(s.team || '')}</td>
            <td><strong>₹${(s.totalSales || 0).toLocaleString()}</strong></td>
            <td>${s.transactionsCount || 0}</td>
            <td>${s.itemsSold || 0}</td>
            <td>₹${avg}</td>
            <td>${share}%</td>
          </tr>
        `;
      }).join('');
    }
  }

  exportTransactionsCsv() {
    const txns = this.data.transactions || [];
    let csv = 'Transaction ID,Date,Time,Student ID,Student Name,Stall ID,Stall Name,Product,Quantity,Unit Price,Amount,Remaining Balance,Status\n';

    txns.forEach(t => {
      csv += `"${t.id}","${t.date}","${t.time}","${t.studentId}","${t.studentName}","${t.stallId}","${t.stallName}","${t.product}",${t.quantity},${t.price},${t.amount},${t.remainingBalance},"${t.status}"\n`;
    });

    this.downloadCsv(csv, `Excel_School_Stall_Transactions_${new Date().toISOString().split('T')[0]}.csv`);
  }

  exportStallSummaryCsv() {
    const stalls = this.data.stalls || [];
    let csv = 'Rank,Stall ID,Stall Name,Team,Total Sales (INR),Transactions,Items Sold\n';

    const sorted = [...stalls].sort((a, b) => (b.totalSales || 0) - (a.totalSales || 0));
    sorted.forEach((s, idx) => {
      csv += `${idx + 1},"${s.id}","${s.name}","${s.team || ''}",${s.totalSales || 0},${s.transactionsCount || 0},${s.itemsSold || 0}\n`;
    });

    this.downloadCsv(csv, `Excel_School_Stall_Summary_${new Date().toISOString().split('T')[0]}.csv`);
  }

  downloadCsv(content, filename) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // ============================================================================
  // 8. TRANSACTION REVERSAL / UNDO (ADMIN)
  // ============================================================================
  async reverseTransaction(txnId) {
    if (!confirm(`Are you sure you want to REVERSE Transaction ${txnId}?\n\nThis will refund the student's digital wallet and deduct the sales amount from the stall.`)) {
      return;
    }

    try {
      if (this.isOnline) {
        const res = await fetch(`${this.apiBase}/api/reverse`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transactionId: txnId })
        });

        const result = await res.json();
        if (!res.ok || !result.success) {
          alert(result.error || 'Failed to reverse transaction');
          return;
        }

        this.data = result.data;
        this.saveLocalBackup(this.data);
      } else {
        // Offline rollback
        const txn = (this.data.transactions || []).find(t => t.id === txnId);
        if (!txn || txn.status === 'REVERSED') return;

        const student = (this.data.students || []).find(s => s.id === txn.studentId);
        if (student) {
          student.balance += txn.amount;
          student.totalSpent = Math.max(0, (student.totalSpent || 0) - txn.amount);
          student.transactionsCount = Math.max(0, (student.transactionsCount || 1) - 1);
        }

        const stall = (this.data.stalls || []).find(st => st.id === txn.stallId);
        if (stall) {
          stall.totalSales = Math.max(0, (stall.totalSales || 0) - txn.amount);
          stall.transactionsCount = Math.max(0, (stall.transactionsCount || 1) - 1);
          stall.itemsSold = Math.max(0, (stall.itemsSold || 0) - txn.quantity);
        }

        txn.status = 'REVERSED';
        this.saveLocalBackup(this.data);
      }

      this.playSuccessChime();
      alert(`Transaction ${txnId} successfully reversed and funds refunded.`);
      this.renderCurrentView();
    } catch (e) {
      console.error('Error reversing transaction', e);
      alert('Error: ' + e.message);
    }
  }

  // ============================================================================
  // 9. STUDENT & STALL CRUD ACTIONS
  // ============================================================================
  openAddStudentModal() {
    this.openModal('modalAddStudent');
  }

  async handleAddStudentSubmit(event) {
    event.preventDefault();
    const name = document.getElementById('newStudentName').value.trim();
    const cls = document.getElementById('newStudentClass').value.trim();
    const sec = document.getElementById('newStudentSection').value.trim();
    const startBal = parseFloat(document.getElementById('newStudentStartBal').value) || 100;

    if (!name) return;

    try {
      if (this.isOnline) {
        const res = await fetch(`${this.apiBase}/api/students`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, class: cls, section: sec, startingBalance: startBal })
        });
        const result = await res.json();
        if (result.success) {
          this.data = result.data;
          this.saveLocalBackup(this.data);
        }
      } else {
        const newId = 'STU' + String((this.data.students || []).length + 1).padStart(3, '0');
        const newStudent = {
          id: newId,
          name,
          class: cls,
          section: sec,
          startingBalance: startBal,
          balance: startBal,
          totalSpent: 0,
          transactionsCount: 0
        };
        this.data.students.push(newStudent);
        this.saveLocalBackup(this.data);
      }

      this.closeModal('modalAddStudent');
      document.getElementById('addStudentForm').reset();
      this.renderCurrentView();
      alert(`Student ${name} registered successfully with ₹${startBal} starting balance!`);
    } catch (e) {
      alert('Failed to add student: ' + e.message);
    }
  }

  openEditStudentModal(studentId) {
    const student = (this.data.students || []).find(s => s.id === studentId);
    if (!student) return;

    document.getElementById('editStudentId').value = student.id;
    document.getElementById('editStudentName').value = student.name;
    document.getElementById('editStudentClass').value = student.class || '12';
    document.getElementById('editStudentSection').value = student.section || 'A';
    document.getElementById('editStudentBalance').value = student.balance || 0;

    this.openModal('modalEditStudent');
  }

  async handleEditStudentSubmit(event) {
    event.preventDefault();
    const id = document.getElementById('editStudentId').value;
    const name = document.getElementById('editStudentName').value.trim();
    const cls = document.getElementById('editStudentClass').value.trim();
    const sec = document.getElementById('editStudentSection').value.trim();
    const balance = parseFloat(document.getElementById('editStudentBalance').value) || 0;

    try {
      if (this.isOnline) {
        const res = await fetch(`${this.apiBase}/api/students/edit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, name, class: cls, section: sec, balance })
        });
        const result = await res.json();
        if (result.success) {
          this.data = result.data;
          this.saveLocalBackup(this.data);
        }
      } else {
        const student = (this.data.students || []).find(s => s.id === id);
        if (student) {
          student.name = name;
          student.class = cls;
          student.section = sec;
          student.balance = balance;
          this.saveLocalBackup(this.data);
        }
      }

      this.closeModal('modalEditStudent');
      this.renderCurrentView();
      alert('Student details updated.');
    } catch (e) {
      alert('Failed to update student: ' + e.message);
    }
  }

  async deleteStudent(studentId) {
    if (!confirm(`Are you sure you want to delete student ${studentId}?`)) return;

    try {
      if (this.isOnline) {
        const res = await fetch(`${this.apiBase}/api/students/delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: studentId })
        });
        const result = await res.json();
        if (result.success) {
          this.data = result.data;
          this.saveLocalBackup(this.data);
        }
      } else {
        this.data.students = (this.data.students || []).filter(s => s.id !== studentId);
        this.saveLocalBackup(this.data);
      }
      this.renderCurrentView();
      alert('Student removed.');
    } catch (e) {
      alert('Failed to delete student: ' + e.message);
    }
  }

  openBulkAllocateModal() {
    this.openModal('modalBulkAllocate');
  }

  async executeBulkAllocate() {
    const amount = parseFloat(document.getElementById('bulkAmountInput').value) || 100;
    const mode = document.querySelector('input[name="bulkAllocMode"]:checked').value;

    try {
      if (this.isOnline) {
        const res = await fetch(`${this.apiBase}/api/students/allocate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount, mode })
        });
        const result = await res.json();
        if (result.success) {
          this.data = result.data;
          this.saveLocalBackup(this.data);
        }
      } else {
        (this.data.students || []).forEach(s => {
          if (mode === 'add') {
            s.balance = (s.balance || 0) + amount;
            s.startingBalance = (s.startingBalance || 0) + amount;
          } else {
            s.startingBalance = amount;
            s.balance = amount;
            s.totalSpent = 0;
            s.transactionsCount = 0;
          }
        });
        this.saveLocalBackup(this.data);
      }

      this.closeModal('modalBulkAllocate');
      this.playSuccessChime();
      this.renderCurrentView();
      alert(`Successfully allocated ₹${amount} starting virtual currency to all registered students!`);
    } catch (e) {
      alert('Bulk allocation failed: ' + e.message);
    }
  }

  // ============================================================================
  // MANUAL WALLET TOP-UP & MANUAL TRANSACTION HANDLERS
  // ============================================================================
  openTopUpModal(studentId) {
    const sId = studentId || this.currentStudentId || 'STU001';
    const student = (this.data && this.data.students ? this.data.students : []).find(s => s.id === sId) || (this.data && this.data.students ? this.data.students[0] : null);
    if (!student) {
      alert('No student found to top up.');
      return;
    }

    const idInput = document.getElementById('topUpStudentId');
    const nameEl = document.getElementById('topUpStudentName');
    const balEl = document.getElementById('topUpCurrentBal');
    const amtInput = document.getElementById('topUpAmountInput');

    if (idInput) idInput.value = student.id;
    if (nameEl) nameEl.textContent = `${student.name} (${student.id})`;
    if (balEl) balEl.textContent = `₹${student.balance || 0}`;
    if (amtInput) amtInput.value = 50;

    this.openModal('modalTopUpStudent');
  }

  setTopUpAmount(amt) {
    const amtInput = document.getElementById('topUpAmountInput');
    if (amtInput) {
      amtInput.value = amt;
    }
  }

  async handleTopUpSubmit(event) {
    event.preventDefault();
    const studentId = document.getElementById('topUpStudentId').value;
    const amount = parseFloat(document.getElementById('topUpAmountInput').value) || 0;

    if (amount <= 0) {
      alert('Please enter a valid amount greater than ₹0.');
      return;
    }

    try {
      if (this.isOnline) {
        const res = await fetch(`${this.apiBase}/api/students/topup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentId, amount })
        });
        const result = await res.json();
        if (result.success) {
          this.data = result.data;
          this.saveLocalBackup(this.data);
        } else {
          alert(result.error || 'Failed to top up balance.');
          return;
        }
      } else {
        const student = (this.data.students || []).find(s => s.id === studentId);
        if (student) {
          student.balance = (student.balance || 0) + amount;
          student.startingBalance = (student.startingBalance || 0) + amount;
          this.saveLocalBackup(this.data);
        }
      }

      this.closeModal('modalTopUpStudent');
      this.playSuccessChime();
      this.renderCurrentView();
      const updatedStu = (this.data.students || []).find(s => s.id === studentId);
      alert(`Successfully added ₹${amount} to student wallet! New balance: ₹${updatedStu ? updatedStu.balance : 0}`);
    } catch (e) {
      alert('Top-up failed: ' + e.message);
    }
  }

  openManualTxnModal() {
    const stuSelect = document.getElementById('manTxnStudentSelect');
    const stallSelect = document.getElementById('manTxnStallSelect');
    const nameInput = document.getElementById('manTxnItemName');
    const priceInput = document.getElementById('manTxnPrice');

    if (stuSelect && this.data && this.data.students) {
      stuSelect.innerHTML = this.data.students.map(s => `
        <option value="${s.id}" ${s.id === this.currentStudentId ? 'selected' : ''}>
          ${this.escapeHtml(s.name)} (${s.id}) — Avail: ₹${s.balance || 0}
        </option>
      `).join('');
    }

    if (stallSelect && this.data && this.data.stalls) {
      stallSelect.innerHTML = this.data.stalls.map(st => `
        <option value="${st.id}" ${st.id === this.currentStallId ? 'selected' : ''}>
          ${this.escapeHtml(st.name)} (${this.escapeHtml(st.team || '')})
        </option>
      `).join('');
    }

    if (nameInput) nameInput.value = '';
    if (priceInput) priceInput.value = '';

    const selStudentId = (stuSelect && stuSelect.value) ? stuSelect.value : this.currentStudentId;
    this.onManTxnStudentChange(selStudentId);

    this.openModal('modalManualTxn');
  }

  onManTxnStudentChange(studentId) {
    const hint = document.getElementById('manTxnStudentBalHint');
    if (!hint) return;
    const student = (this.data && this.data.students ? this.data.students : []).find(s => s.id === studentId);
    if (student) {
      hint.textContent = `Available Balance: ₹${student.balance || 0} (Total Spent: ₹${student.totalSpent || 0})`;
      hint.className = (student.balance || 0) > 0 ? 'text-xs text-navy mt-1 font-bold' : 'text-xs text-danger mt-1 font-bold';
    } else {
      hint.textContent = 'Available Balance: ₹0';
    }
  }

  async handleManualTxnSubmit(event) {
    event.preventDefault();
    const studentId = document.getElementById('manTxnStudentSelect').value;
    const stallId = document.getElementById('manTxnStallSelect').value;
    const itemName = document.getElementById('manTxnItemName').value.trim();
    const price = parseFloat(document.getElementById('manTxnPrice').value) || 0;

    if (!studentId || !stallId || !itemName || price <= 0) {
      alert('Please fill out all transaction fields with a valid price.');
      return;
    }

    const student = (this.data.students || []).find(s => s.id === studentId);
    const stall = (this.data.stalls || []).find(s => s.id === stallId);

    if (!student) {
      alert('Selected student was not found.');
      return;
    }
    if (!stall) {
      alert('Selected stall was not found.');
      return;
    }

    if ((student.balance || 0) < price) {
      this.playErrorBuzzer();
      alert(`Transaction Rejected! Insufficient balance.\nStudent ${student.name} has only ₹${student.balance}, but transaction amount is ₹${price}.`);
      return;
    }

    try {
      if (this.isOnline) {
        const res = await fetch(`${this.apiBase}/api/purchase`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            studentId: student.id,
            stallId: stall.id,
            productId: 'custom',
            productName: itemName,
            price: price,
            quantity: 1,
            isCustom: true,
            saveToMenu: false
          })
        });

        const result = await res.json();
        if (!res.ok || !result.success) {
          this.playErrorBuzzer();
          alert(result.error || 'Transaction recording failed.');
          return;
        }

        this.data = result.data;
        this.saveLocalBackup(this.data);
        this.closeModal('modalManualTxn');
        this.showPurchaseSuccess(result.transaction);
      } else {
        student.balance -= price;
        student.totalSpent = (student.totalSpent || 0) + price;
        student.transactionsCount = (student.transactionsCount || 0) + 1;

        stall.totalSales = (stall.totalSales || 0) + price;
        stall.transactionsCount = (stall.transactionsCount || 0) + 1;
        stall.itemsSold = (stall.itemsSold || 0) + 1;

        const txnId = 'TXN' + (1001 + (this.data.transactions || []).length);
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dateStr = now.toISOString().split('T')[0];

        const newTxn = {
          id: txnId,
          studentId: student.id,
          studentName: student.name,
          stallId: stall.id,
          stallName: stall.name,
          product: itemName,
          quantity: 1,
          price: price,
          amount: price,
          time: timeStr,
          date: dateStr,
          remainingBalance: student.balance,
          status: 'COMPLETED'
        };

        this.data.transactions.unshift(newTxn);
        this.saveLocalBackup(this.data);
        this.closeModal('modalManualTxn');
        this.showPurchaseSuccess(newTxn);
      }

      this.renderCurrentView();
    } catch (e) {
      alert('Failed to record manual transaction: ' + e.message);
    }
  }

  openAddStallModal() {
    this.openModal('modalAddStall');
  }

  addNewStallProductRow() {
    const container = document.getElementById('newStallProductsList');
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'form-row flex-gap mb-2';
    row.innerHTML = `
      <input type="text" class="form-control p-name-input" placeholder="Item Name" required>
      <input type="number" class="form-control p-price-input" placeholder="Price (₹)" min="1" style="max-width: 100px;" required>
      <button type="button" class="btn btn-xs btn-outline" onclick="this.parentElement.remove()">&times;</button>
    `;
    container.appendChild(row);
  }

  async handleAddStallSubmit(event) {
    event.preventDefault();
    const name = document.getElementById('newStallName').value.trim();
    const team = document.getElementById('newStallTeam').value.trim();

    const pNames = document.querySelectorAll('#newStallProductsList .p-name-input');
    const pPrices = document.querySelectorAll('#newStallProductsList .p-price-input');
    const products = [];

    pNames.forEach((nEl, idx) => {
      const pName = nEl.value.trim();
      const pPrice = parseFloat(pPrices[idx].value) || 10;
      if (pName) {
        products.push({
          id: 'P' + String(idx + 1).padStart(2, '0'),
          name: pName,
          price: pPrice
        });
      }
    });

    try {
      if (this.isOnline) {
        const res = await fetch(`${this.apiBase}/api/stalls`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, team, products })
        });
        const result = await res.json();
        if (result.success) {
          this.data = result.data;
          this.saveLocalBackup(this.data);
        }
      } else {
        const newId = 'STALL' + String((this.data.stalls || []).length + 1).padStart(2, '0');
        const newStall = {
          id: newId,
          name,
          team,
          totalSales: 0,
          transactionsCount: 0,
          itemsSold: 0,
          products
        };
        this.data.stalls.push(newStall);
        this.saveLocalBackup(this.data);
      }

      this.closeModal('modalAddStall');
      document.getElementById('addStallForm').reset();
      this.renderCurrentView();
      alert(`Stall "${name}" created successfully!`);
    } catch (e) {
      alert('Failed to add stall: ' + e.message);
    }
  }

  openEditStallModal(stallId) {
    const stall = (this.data.stalls || []).find(s => s.id === stallId);
    if (!stall) return;

    document.getElementById('editStallId').value = stall.id;
    document.getElementById('editStallName').value = stall.name;
    document.getElementById('editStallTeam').value = stall.team || '';

    this.openModal('modalEditStall');
  }

  async handleEditStallSubmit(event) {
    event.preventDefault();
    const id = document.getElementById('editStallId').value;
    const name = document.getElementById('editStallName').value.trim();
    const team = document.getElementById('editStallTeam').value.trim();

    try {
      if (this.isOnline) {
        const res = await fetch(`${this.apiBase}/api/stalls/edit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, name, team })
        });
        const result = await res.json();
        if (result.success) {
          this.data = result.data;
          this.saveLocalBackup(this.data);
        }
      } else {
        const stall = (this.data.stalls || []).find(s => s.id === id);
        if (stall) {
          stall.name = name;
          stall.team = team;
          this.saveLocalBackup(this.data);
        }
      }

      this.closeModal('modalEditStall');
      this.renderCurrentView();
      alert('Stall details updated.');
    } catch (e) {
      alert('Failed to update stall: ' + e.message);
    }
  }

  async deleteStall(stallId) {
    if (!confirm(`Are you sure you want to delete stall ${stallId}?`)) return;

    try {
      if (this.isOnline) {
        const res = await fetch(`${this.apiBase}/api/stalls/delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: stallId })
        });
        const result = await res.json();
        if (result.success) {
          this.data = result.data;
          this.saveLocalBackup(this.data);
        }
      } else {
        this.data.stalls = (this.data.stalls || []).filter(s => s.id !== stallId);
        this.saveLocalBackup(this.data);
      }
      this.renderCurrentView();
      alert('Stall removed.');
    } catch (e) {
      alert('Failed to delete stall: ' + e.message);
    }
  }

  openAddProductModal(stallId) {
    const stall = (this.data.stalls || []).find(s => s.id === stallId);
    if (!stall) return;

    document.getElementById('addProductStallId').value = stall.id;
    document.getElementById('addProductStallName').textContent = `${stall.name} (${stall.id})`;
    document.getElementById('newProductName').value = '';
    document.getElementById('newProductPrice').value = '';

    this.openModal('modalAddProduct');
  }

  async handleAddProductSubmit(event) {
    event.preventDefault();
    const stallId = document.getElementById('addProductStallId').value;
    const name = document.getElementById('newProductName').value.trim();
    const price = parseFloat(document.getElementById('newProductPrice').value) || 10;

    try {
      if (this.isOnline) {
        const res = await fetch(`${this.apiBase}/api/stalls/products/add`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stallId, name, price })
        });
        const result = await res.json();
        if (result.success) {
          this.data = result.data;
          this.saveLocalBackup(this.data);
        }
      } else {
        const stall = (this.data.stalls || []).find(s => s.id === stallId);
        if (stall) {
          const prodId = 'P' + String((stall.products || []).length + 1).padStart(2, '0');
          stall.products.push({ id: prodId, name, price });
          this.saveLocalBackup(this.data);
        }
      }

      this.closeModal('modalAddProduct');
      this.renderCurrentView();
      alert(`Product "${name}" added at ₹${price}.`);
    } catch (e) {
      alert('Failed to add product: ' + e.message);
    }
  }

  openEditProductModal(stallId, productId) {
    const stall = (this.data.stalls || []).find(s => s.id === stallId);
    if (!stall) return;
    const product = (stall.products || []).find(p => p.id === productId);
    if (!product) return;

    document.getElementById('editProductStallId').value = stall.id;
    document.getElementById('editProductId').value = product.id;
    document.getElementById('editProductName').value = product.name;
    document.getElementById('editProductPrice').value = product.price;

    this.openModal('modalEditProduct');
  }

  async handleEditProductSubmit(event) {
    event.preventDefault();
    const stallId = document.getElementById('editProductStallId').value;
    const productId = document.getElementById('editProductId').value;
    const name = document.getElementById('editProductName').value.trim();
    const price = parseFloat(document.getElementById('editProductPrice').value) || 10;

    try {
      if (this.isOnline) {
        const res = await fetch(`${this.apiBase}/api/stalls/products/edit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stallId, productId, name, price })
        });
        const result = await res.json();
        if (result.success) {
          this.data = result.data;
          this.saveLocalBackup(this.data);
        }
      } else {
        const stall = (this.data.stalls || []).find(s => s.id === stallId);
        if (stall) {
          const product = (stall.products || []).find(p => p.id === productId);
          if (product) {
            product.name = name;
            product.price = price;
            this.saveLocalBackup(this.data);
          }
        }
      }

      this.closeModal('modalEditProduct');
      this.renderCurrentView();
      alert('Product price updated.');
    } catch (e) {
      alert('Failed to edit product: ' + e.message);
    }
  }

  async deleteProduct(stallId, productId) {
    if (!confirm('Are you sure you want to delete this product?')) return;

    try {
      if (this.isOnline) {
        const res = await fetch(`${this.apiBase}/api/stalls/products/delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stallId, productId })
        });
        const result = await res.json();
        if (result.success) {
          this.data = result.data;
          this.saveLocalBackup(this.data);
        }
      } else {
        const stall = (this.data.stalls || []).find(s => s.id === stallId);
        if (stall) {
          stall.products = (stall.products || []).filter(p => p.id !== productId);
          this.saveLocalBackup(this.data);
        }
      }
      this.renderCurrentView();
      alert('Product removed.');
    } catch (e) {
      alert('Failed to delete product: ' + e.message);
    }
  }

  openStallQrModal(stallId) {
    const stall = (this.data.stalls || []).find(s => s.id === stallId);
    if (!stall) return;

    document.getElementById('stallQrModalName').textContent = stall.name;
    document.getElementById('stallQrModalTeam').textContent = stall.team || '';
    document.getElementById('stallQrCodeText').textContent = stall.id;

    const container = document.getElementById('stallQrCanvas');
    if (container) {
      container.innerHTML = '';
      if (window.QRCode) {
        new QRCode(container, {
          text: stall.id,
          width: 140,
          height: 140,
          colorDark: '#0b2265',
          colorLight: '#ffffff',
          correctLevel: QRCode.CorrectLevel.M
        });
      }
    }

    this.openModal('modalStallQr');
  }

  // ============================================================================
  // 10. QR CODE CAMERA SCANNER (HTML5 QR CODE)
  // ============================================================================
  openQrScanner() {
    this.openModal('modalQrScanner');

    // Populate fallback student picker
    const picker = document.getElementById('quickStudentQrPicker');
    if (picker) {
      picker.innerHTML = '<option value="">-- Or Quick Select Student --</option>' +
        (this.data.students || []).map(s => `
          <option value="${s.id}">${s.name} (${s.id})</option>
        `).join('');
    }

    if (window.Html5Qrcode) {
      try {
        if (!this.qrScanner) {
          this.qrScanner = new Html5Qrcode('qrScannerViewfinder');
        }
        const config = { fps: 10, qrbox: { width: 220, height: 220 } };

        this.qrScanner.start(
          { facingMode: 'environment' },
          config,
          (decodedText) => {
            this.handleScannedQr(decodedText.trim());
          },
          (errorMessage) => {
            // Ignore scan attempt misses
          }
        ).catch(err => {
          console.warn('Camera scan not supported or permission denied', err);
          const vf = document.getElementById('qrScannerViewfinder');
          if (vf) {
            vf.innerHTML = `
              <div class="p-4 text-center text-white">
                <p class="text-sm">Camera access unavailable or not granted.</p>
                <p class="text-xs text-muted">Use the quick selector below or select student in the POS form.</p>
              </div>
            `;
          }
        });
      } catch (e) {
        console.warn('Html5Qrcode error', e);
      }
    }
  }

  closeQrScanner() {
    if (this.qrScanner) {
      this.qrScanner.stop().then(() => {
        this.qrScanner.clear();
      }).catch(e => {
        console.warn('QR scanner stop error', e);
      });
    }
    this.closeModal('modalQrScanner');
  }

  handleScannedQr(code) {
    const student = (this.data.students || []).find(s => s.id.toUpperCase() === code.toUpperCase() || s.name.toLowerCase() === code.toLowerCase());
    if (student) {
      this.closeQrScanner();
      this.playSuccessChime();

      // Switch to POS and select student
      if (this.activeView !== 'stall') {
        this.switchView('stall');
      }

      const select = document.getElementById('posStudentSelect');
      if (select) {
        select.value = student.id;
        this.onPosStudentChange(student.id);
      }
    } else {
      this.playErrorBuzzer();
      alert(`Scanned code "${code}" does not match any registered student.`);
    }
  }

  onQuickStudentPick(studentId) {
    if (studentId) {
      this.handleScannedQr(studentId);
    }
  }

  // ============================================================================
  // 11. GLOBAL SEARCH OVERLAY
  // ============================================================================
  bindSearch() {
    const openBtn = document.getElementById('openSearchBtn');
    if (openBtn) {
      openBtn.addEventListener('click', () => this.openSearch());
    }
  }

  openSearch() {
    const overlay = document.getElementById('searchOverlay');
    if (overlay) {
      overlay.classList.add('active');
      const input = document.getElementById('globalSearchInput');
      if (input) {
        input.value = '';
        input.focus();
      }
      this.handleGlobalSearch('');
    }
  }

  closeSearch() {
    const overlay = document.getElementById('searchOverlay');
    if (overlay) overlay.classList.remove('active');
  }

  handleGlobalSearch(query) {
    const area = document.getElementById('searchResultsArea');
    if (!area) return;

    query = (query || '').trim().toLowerCase();
    if (!query) {
      area.innerHTML = '<div class="search-empty-hint">Type above to search students, stalls, products, or transactions...</div>';
      return;
    }

    const students = (this.data.students || []).filter(s =>
      s.name.toLowerCase().includes(query) || s.id.toLowerCase().includes(query)
    );

    const stalls = (this.data.stalls || []).filter(s =>
      s.name.toLowerCase().includes(query) || s.id.toLowerCase().includes(query) || (s.team && s.team.toLowerCase().includes(query))
    );

    const products = [];
    (this.data.stalls || []).forEach(s => {
      (s.products || []).forEach(p => {
        if (p.name.toLowerCase().includes(query)) {
          products.push({ stall: s, product: p });
        }
      });
    });

    const txns = (this.data.transactions || []).filter(t =>
      t.id.toLowerCase().includes(query) || t.studentName.toLowerCase().includes(query) || t.stallName.toLowerCase().includes(query) || t.product.toLowerCase().includes(query)
    );

    let html = '';

    // Students
    if (students.length > 0) {
      html += '<div class="search-section-header">👨‍🎓 Students</div>';
      students.forEach(s => {
        html += `
          <div class="search-result-item" onclick="app.jumpToStudent('${s.id}')">
            <div>
              <strong>${this.escapeHtml(s.name)}</strong>
              <span class="text-xs text-muted">(${s.id} • Class ${s.class} ${s.section})</span>
            </div>
            <div class="font-bold text-navy">Balance: ₹${s.balance}</div>
          </div>
        `;
      });
    }

    // Stalls
    if (stalls.length > 0) {
      html += '<div class="search-section-header">🏪 Stalls</div>';
      stalls.forEach(st => {
        html += `
          <div class="search-result-item" onclick="app.jumpToStall('${st.id}')">
            <div>
              <strong>${this.escapeHtml(st.name)}</strong>
              <span class="text-xs text-muted">(${st.id} • ${this.escapeHtml(st.team || '')})</span>
            </div>
            <div class="font-bold text-accent">Sales: ₹${st.totalSales}</div>
          </div>
        `;
      });
    }

    // Products
    if (products.length > 0) {
      html += '<div class="search-section-header">📋 Products</div>';
      products.forEach(p => {
        html += `
          <div class="search-result-item" onclick="app.jumpToStall('${p.stall.id}')">
            <div>
              <strong>${this.escapeHtml(p.product.name)}</strong>
              <span class="text-xs text-muted">at ${this.escapeHtml(p.stall.name)}</span>
            </div>
            <div class="font-bold text-navy">₹${p.product.price}</div>
          </div>
        `;
      });
    }

    // Transactions
    if (txns.length > 0) {
      html += '<div class="search-section-header">🧾 Transactions</div>';
      txns.slice(0, 8).forEach(t => {
        html += `
          <div class="search-result-item" onclick="app.jumpToAdmin()">
            <div>
              <strong class="font-mono">${t.id}</strong>
              <span class="text-xs text-muted">${t.studentName} bought ${t.product} (${t.time})</span>
            </div>
            <div class="font-bold ${t.status === 'REVERSED' ? 'text-muted' : 'text-accent'}">
              ₹${t.amount} ${t.status === 'REVERSED' ? '(Reversed)' : ''}
            </div>
          </div>
        `;
      });
    }

    if (!html) {
      html = `<div class="search-empty-hint">No matches found for "${this.escapeHtml(query)}"</div>`;
    }

    area.innerHTML = html;
  }

  jumpToStudent(studentId) {
    this.closeSearch();
    this.currentStudentId = studentId;
    this.switchView('student');
  }

  jumpToStall(stallId) {
    this.closeSearch();
    this.currentStallId = stallId;
    this.switchView('stall');
  }

  jumpToAdmin() {
    this.closeSearch();
    this.switchView('admin');
  }

  // Filter in tables
  filterAdminStudents(term) {
    term = (term || '').toLowerCase();
    const students = (this.data.students || []).filter(s =>
      s.name.toLowerCase().includes(term) || s.id.toLowerCase().includes(term) || (s.class && s.class.toLowerCase().includes(term))
    );
    this.renderAdminStudentTable(students);
  }

  filterAdminTxns(term) {
    term = (term || '').toLowerCase();
    const txns = (this.data.transactions || []).filter(t =>
      t.id.toLowerCase().includes(term) || t.studentName.toLowerCase().includes(term) || t.stallName.toLowerCase().includes(term) || t.product.toLowerCase().includes(term)
    );
    this.renderAdminTxnTable(txns);
  }

  // ============================================================================
  // 12. RESET DEMO DATA
  // ============================================================================
  resetDemoData() {
    if (!confirm('Are you sure you want to reset all data back to the default demo values? All recent transactions will be reset.')) {
      return;
    }

    this.data = this.getDefaultDemoData();
    this.saveLocalBackup(this.data);

    // If server is online, push to server
    if (this.isOnline) {
      fetch(`${this.apiBase}/api/data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.data)
      }).catch(e => console.warn('Server reset failed', e));
    }

    this.playSuccessChime();
    this.renderCurrentView();
    alert('Event data reset to default demo students, stalls, and transactions.');
  }

  // ============================================================================
  // 13. MODAL CONTROLS & UTILITIES
  // ============================================================================
  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('active');
  }

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  refreshData() {
    this.loadInitialData().then(() => {
      this.renderCurrentView();
    });
  }

  // ============================================================================
  // 14. DEFAULT SEED DEMO DATA
  // ============================================================================
  getDefaultDemoData() {
    return {
      event: {
        name: "Excel Annual Business Bazaar & Entrepreneurship Stall Day",
        school: "Excel Matriculation Hr. Sec. School",
        motto: "School for Excellence",
        date: new Date().toISOString().split('T')[0],
        currency: "₹",
        defaultStartingBalance: 100
      },
      students: [
        { id: "STU001", name: "Hari", class: "12", section: "A", startingBalance: 100, balance: 100, totalSpent: 0, transactionsCount: 0 },
        { id: "STU002", name: "Arun", class: "11", section: "B", startingBalance: 100, balance: 80, totalSpent: 20, transactionsCount: 1 },
        { id: "STU003", name: "Kavi", class: "10", section: "A", startingBalance: 100, balance: 70, totalSpent: 30, transactionsCount: 1 },
        { id: "STU004", name: "Maddy", class: "12", section: "B", startingBalance: 100, balance: 80, totalSpent: 20, transactionsCount: 1 },
        { id: "STU005", name: "Rahul", class: "11", section: "A", startingBalance: 100, balance: 80, totalSpent: 20, transactionsCount: 1 },
        { id: "STU006", name: "Priya", class: "10", section: "B", startingBalance: 100, balance: 65, totalSpent: 35, transactionsCount: 1 },
        { id: "STU007", name: "Divya", class: "12", section: "A", startingBalance: 100, balance: 60, totalSpent: 40, transactionsCount: 1 },
        { id: "STU008", name: "Sanjay", class: "11", section: "C", startingBalance: 100, balance: 100, totalSpent: 0, transactionsCount: 0 }
      ],
      stalls: [
        {
          id: "STALL01",
          name: "Mystery Shop",
          team: "Team Sphinx (Grade 12)",
          totalSales: 70,
          transactionsCount: 2,
          itemsSold: 3,
          products: [
            { id: "P01", name: "Secret Envelope", price: 20 },
            { id: "P02", name: "Mystery Gift Box", price: 30 },
            { id: "P03", name: "Mega Lucky Dip", price: 50 }
          ]
        },
        {
          id: "STALL02",
          name: "Food Stall",
          team: "Master Chefs (Grade 11)",
          totalSales: 20,
          transactionsCount: 1,
          itemsSold: 1,
          products: [
            { id: "P04", name: "Grilled Sandwich", price: 20 },
            { id: "P05", name: "Veg Burger", price: 30 },
            { id: "P06", name: "Crispy Samosa", price: 10 },
            { id: "P07", name: "Spring Rolls", price: 25 }
          ]
        },
        {
          id: "STALL03",
          name: "Juice Stall",
          team: "Citrus Spark (Grade 10)",
          totalSales: 20,
          transactionsCount: 1,
          itemsSold: 1,
          products: [
            { id: "P08", name: "Fresh Orange Juice", price: 20 },
            { id: "P09", name: "Lemon Mint Cooler", price: 15 },
            { id: "P10", name: "Mango Shake", price: 25 },
            { id: "P11", name: "Rose Milk", price: 20 }
          ]
        },
        {
          id: "STALL04",
          name: "Mehendi Stall",
          team: "Henna Artists (Grade 12)",
          totalSales: 35,
          transactionsCount: 1,
          itemsSold: 1,
          products: [
            { id: "P12", name: "Simple Palm Design", price: 25 },
            { id: "P13", name: "Arabic Floral Art", price: 35 },
            { id: "P14", name: "Full Hand Bridal Style", price: 50 }
          ]
        },
        {
          id: "STALL05",
          name: "Games Stall",
          team: "Fun Zone (Grade 11)",
          totalSales: 20,
          transactionsCount: 1,
          itemsSold: 2,
          products: [
            { id: "P15", name: "Ring Toss Challenge", price: 10 },
            { id: "P16", name: "Balloon Dart (3 Shots)", price: 15 },
            { id: "P17", name: "Knock The Can", price: 10 },
            { id: "P18", name: "Mini Basketball", price: 20 }
          ]
        },
        {
          id: "STALL06",
          name: "Secret Envelope",
          team: "Golden Envelopes (Grade 10)",
          totalSales: 0,
          transactionsCount: 0,
          itemsSold: 0,
          products: [
            { id: "P19", name: "Bronze Surprise Envelope", price: 10 },
            { id: "P20", name: "Silver Surprise Envelope", price: 20 },
            { id: "P21", name: "Gold Jackpot Envelope", price: 50 }
          ]
        },
        {
          id: "STALL07",
          name: "Crafts Stall",
          team: "Artisan Guild (Grade 9)",
          totalSales: 0,
          transactionsCount: 0,
          itemsSold: 0,
          products: [
            { id: "P22", name: "Handmade Bookmark", price: 10 },
            { id: "P23", name: "Origami Peacock", price: 15 },
            { id: "P24", name: "Paper Quilling Card", price: 25 }
          ]
        },
        {
          id: "STALL08",
          name: "Gift Stall",
          team: "Novelty Treasures (Grade 12)",
          totalSales: 0,
          transactionsCount: 0,
          itemsSold: 0,
          products: [
            { id: "P25", name: "Customized Keyring", price: 20 },
            { id: "P26", name: "Excel School Pen", price: 15 },
            { id: "P27", name: "Desk Calendar", price: 30 }
          ]
        }
      ],
      transactions: [
        {
          id: "TXN1001",
          studentId: "STU002",
          studentName: "Arun",
          stallId: "STALL02",
          stallName: "Food Stall",
          product: "Grilled Sandwich",
          quantity: 1,
          price: 20,
          amount: 20,
          time: "10:15 AM",
          date: new Date().toISOString().split('T')[0],
          remainingBalance: 80,
          status: "COMPLETED"
        },
        {
          id: "TXN1002",
          studentId: "STU003",
          studentName: "Kavi",
          stallId: "STALL01",
          stallName: "Mystery Shop",
          product: "Mystery Gift Box",
          quantity: 1,
          price: 30,
          amount: 30,
          time: "10:25 AM",
          date: new Date().toISOString().split('T')[0],
          remainingBalance: 70,
          status: "COMPLETED"
        },
        {
          id: "TXN1003",
          studentId: "STU004",
          studentName: "Maddy",
          stallId: "STALL03",
          stallName: "Juice Stall",
          product: "Rose Milk",
          quantity: 1,
          price: 20,
          amount: 20,
          time: "10:35 AM",
          date: new Date().toISOString().split('T')[0],
          remainingBalance: 80,
          status: "COMPLETED"
        },
        {
          id: "TXN1004",
          studentId: "STU005",
          studentName: "Rahul",
          stallId: "STALL05",
          stallName: "Games Stall",
          product: "Ring Toss Challenge",
          quantity: 2,
          price: 10,
          amount: 20,
          time: "10:45 AM",
          date: new Date().toISOString().split('T')[0],
          remainingBalance: 80,
          status: "COMPLETED"
        },
        {
          id: "TXN1005",
          studentId: "STU006",
          studentName: "Priya",
          stallId: "STALL04",
          stallName: "Mehendi Stall",
          product: "Arabic Floral Art",
          quantity: 1,
          price: 35,
          amount: 35,
          time: "10:55 AM",
          date: new Date().toISOString().split('T')[0],
          remainingBalance: 65,
          status: "COMPLETED"
        },
        {
          id: "TXN1006",
          studentId: "STU007",
          studentName: "Divya",
          stallId: "STALL01",
          stallName: "Mystery Shop",
          product: "Secret Envelope",
          quantity: 2,
          price: 20,
          amount: 40,
          time: "11:05 AM",
          date: new Date().toISOString().split('T')[0],
          remainingBalance: 60,
          status: "COMPLETED"
        }
      ]
    };
  }
}

// Instantiate global application
const app = new SchoolStallApp();
window.app = app;

