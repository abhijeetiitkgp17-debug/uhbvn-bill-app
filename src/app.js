// ============================================================
// Bill Splitter — Main App Logic
// ============================================================

const App = (() => {

  const state = {
    currentScreen: 'home',
    settings: null,
    // Current bill data (being built up in the new bill flow)
    bill: {
      mode: 'pdf',          // 'pdf' | 'photo' | 'manual'
      totalAmount: null,
      totalUnits: null,
      billMonth: null,
      sourceText: null,     // raw extracted text (for debugging)
      photoDataUrl: null    // if from photo
    },
    reading: {
      prev: null,
      curr: null,
      currPhotoDataUrl: null
    },
    result: null            // computed result (after Calculate)
  };

  // ============================================================
  // INIT
  // ============================================================
  async function init() {
    state.settings = await Storage.getSettings();
    bindNavigation();
    bindSettings();
    bindBillFlow();
    bindResults();
    bindHistory();
    await refreshHomeStats();
    populateSettingsForm();
  }

  // ============================================================
  // NAVIGATION
  // ============================================================
  function bindNavigation() {
    document.querySelectorAll('[data-screen]').forEach(el => {
      el.addEventListener('click', (e) => {
        const target = el.getAttribute('data-screen');
        if (target) navigate(target);
      });
    });
  }

  function navigate(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById('screen-' + screenId);
    if (target) {
      target.classList.add('active');
      window.scrollTo(0, 0);
      state.currentScreen = screenId;

      if (screenId === 'home') refreshHomeStats();
      if (screenId === 'history') renderHistoryList();
      if (screenId === 'settings') populateSettingsForm();
      if (screenId === 'bill') prepareNewBill();
    }
  }

  async function refreshHomeStats() {
    const history = await Storage.getHistory();
    const histCountEl = document.getElementById('histCount');
    if (histCountEl) histCountEl.textContent = `${history.length} ${history.length === 1 ? 'entry' : 'entries'}`;

    if (history.length > 0) {
      document.getElementById('quickStats').style.display = 'grid';
      const last = history[0];
      document.getElementById('statLastBill').textContent = last.billMonth || 'recent';
      const reading = state.settings.lastReading;
      document.getElementById('statLastReading').textContent = reading != null ? Number(reading).toFixed(2) : '—';
    } else {
      document.getElementById('quickStats').style.display = 'none';
    }
  }

  // ============================================================
  // NEW BILL FLOW
  // ============================================================
  function prepareNewBill() {
    // Reset bill state
    state.bill = {
      mode: 'pdf',
      totalAmount: null,
      totalUnits: null,
      billMonth: null,
      sourceText: null,
      photoDataUrl: null
    };
    state.reading = { prev: null, curr: null, currPhotoDataUrl: null };
    state.result = null;

    // Reset UI
    document.getElementById('dropLabelPdf').textContent = 'Tap to choose PDF';
    document.getElementById('dropHintPdf').textContent = '— UHBVN bill from email —';
    document.getElementById('dropZonePdf').classList.remove('has-file');
    document.getElementById('pdfInput').value = '';
    document.getElementById('billPreview').style.display = 'none';
    document.getElementById('manualAmount').value = '';
    document.getElementById('manualUnits').value = '';
    document.getElementById('manualMonth').value = '';
    document.getElementById('confirmBill').style.display = 'none';
    document.getElementById('billStatus').className = 'status';
    document.getElementById('billStatus').innerHTML = '';

    // Pre-fill previous reading from last saved
    if (state.settings.lastReading != null) {
      document.getElementById('prev').value = state.settings.lastReading;
      document.getElementById('prevNote').textContent =
        `Auto-filled from last submission` +
        (state.settings.lastReadingDate ? ` (${formatDate(state.settings.lastReadingDate)})` : '');
    } else {
      document.getElementById('prev').value = '';
      document.getElementById('prevNote').textContent = '';
    }
    document.getElementById('curr').value = '';
    document.getElementById('currNote').textContent = '';

    document.getElementById('results').classList.remove('show');
    setActiveTab('pdf');
    updateCalcButton();
  }

  function bindBillFlow() {
    // Tab switching
    document.querySelectorAll('#billTabs .tab').forEach(t => {
      t.addEventListener('click', () => setActiveTab(t.getAttribute('data-tab')));
    });

    // PDF upload
    document.getElementById('pdfInput').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) handlePdfFile(file);
    });

    // Photo of bill
    document.getElementById('captureBillBtn').addEventListener('click', () => handleBillPhoto());
    document.getElementById('retakeBillBtn').addEventListener('click', () => handleBillPhoto());

    // Manual entry — listen for changes
    ['manualAmount', 'manualUnits', 'manualMonth'].forEach(id => {
      document.getElementById(id).addEventListener('input', () => {
        if (state.bill.mode !== 'manual') return;
        state.bill.totalAmount = parseFloat(document.getElementById('manualAmount').value) || null;
        state.bill.totalUnits = parseFloat(document.getElementById('manualUnits').value) || null;
        state.bill.billMonth = document.getElementById('manualMonth').value.trim() || null;
        updateCalcButton();
      });
    });

    // Confirm card edits — keep state in sync
    ['confirmAmount', 'confirmUnits', 'confirmMonth'].forEach(id => {
      document.getElementById(id).addEventListener('input', () => {
        state.bill.totalAmount = parseFloat(document.getElementById('confirmAmount').value) || null;
        state.bill.totalUnits = parseFloat(document.getElementById('confirmUnits').value) || null;
        state.bill.billMonth = document.getElementById('confirmMonth').value.trim() || null;
        updateCalcButton();
      });
    });

    // Submeter readings
    document.getElementById('prev').addEventListener('input', () => {
      state.reading.prev = parseFloat(document.getElementById('prev').value) || null;
      updateCalcButton();
    });
    document.getElementById('curr').addEventListener('input', () => {
      state.reading.curr = parseFloat(document.getElementById('curr').value) || null;
      updateCalcButton();
    });

    // Capture meter reading via OCR
    document.getElementById('captureMeterBtn').addEventListener('click', () => handleMeterCapture());

    // Calculate button
    document.getElementById('calcBtn').addEventListener('click', doCalculation);
  }

  function setActiveTab(tabName) {
    state.bill.mode = tabName;
    document.querySelectorAll('#billTabs .tab').forEach(t => {
      t.classList.toggle('active', t.getAttribute('data-tab') === tabName);
    });
    document.querySelectorAll('#screen-bill .tab-pane').forEach(p => {
      p.classList.toggle('active', p.getAttribute('data-pane') === tabName);
    });

    // Clear extracted data when switching tabs (force re-extract)
    if (tabName !== 'manual') {
      state.bill.totalAmount = null;
      state.bill.totalUnits = null;
      state.bill.billMonth = null;
      document.getElementById('confirmBill').style.display = 'none';
    } else {
      // Manual mode — read from form
      state.bill.totalAmount = parseFloat(document.getElementById('manualAmount').value) || null;
      state.bill.totalUnits = parseFloat(document.getElementById('manualUnits').value) || null;
      state.bill.billMonth = document.getElementById('manualMonth').value.trim() || null;
      document.getElementById('confirmBill').style.display = 'none';
    }
    updateCalcButton();
  }

  // ============================================================
  // PDF HANDLING
  // ============================================================
  async function handlePdfFile(file) {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      showStatus('billStatus', 'error', 'Please choose a PDF file.');
      return;
    }
    showStatus('billStatus', 'info', 'Reading PDF…');
    document.getElementById('dropLabelPdf').textContent = file.name;
    document.getElementById('dropHintPdf').textContent = '— processing —';

    try {
      const text = await UHBVNParser.extractTextFromPdf(file);
      const parsed = UHBVNParser.parseText(text);
      state.bill.sourceText = text;

      if (!parsed.totalAmount || !parsed.totalUnits) {
        showStatus('billStatus', 'error',
          'Could not find amount or units in this PDF. ' +
          'Try the Photo or Manual tab instead.'
        );
        document.getElementById('dropZonePdf').classList.remove('has-file');
        return;
      }

      state.bill.totalAmount = parsed.totalAmount;
      state.bill.totalUnits = parsed.totalUnits;
      state.bill.billMonth = parsed.billMonth;

      document.getElementById('dropZonePdf').classList.add('has-file');
      document.getElementById('dropLabelPdf').textContent = '✓ ' + file.name;
      document.getElementById('dropHintPdf').textContent =
        `₹${parsed.totalAmount.toFixed(2)} · ${parsed.totalUnits.toFixed(2)} kWh`;

      showConfirmCard(parsed);
      showStatus('billStatus', 'success', 'Bill data extracted. Verify below if needed.');
      updateCalcButton();
    } catch (err) {
      console.error(err);
      showStatus('billStatus', 'error', 'Could not read PDF: ' + err.message);
    }
  }

  // ============================================================
  // PHOTO OF BILL (via OCR)
  // ============================================================
  async function handleBillPhoto() {
    try {
      showLoading('Opening camera…');
      const photo = await OCR.capturePhoto('Take photo of bill');
      hideLoading();

      state.bill.photoDataUrl = photo.dataUrl;
      document.getElementById('billPreviewImg').src = photo.dataUrl;
      document.getElementById('billPreview').style.display = 'block';

      showStatus('billStatus', 'info', 'Reading bill…');
      showLoading('Reading text from photo…');

      const text = await OCR.recognizeText(photo.dataUrl, photo.path);
      hideLoading();

      if (!text) {
        showStatus('billStatus', 'error',
          OCR.isNative
            ? 'Could not read any text from the photo. Try better lighting or use Manual tab.'
            : 'OCR is only available on the phone (Android app). Please use Manual tab in browser.'
        );
        return;
      }

      state.bill.sourceText = text;
      const parsed = UHBVNParser.parseOcrText(text);

      if (!parsed.totalAmount || !parsed.totalUnits) {
        showStatus('billStatus', 'error',
          'Could not find amount or units in the photo. ' +
          'Try Manual tab to enter values directly.'
        );
        // Show what we got — let user correct
        showConfirmCard({
          totalAmount: parsed.totalAmount || '',
          totalUnits: parsed.totalUnits || '',
          billMonth: parsed.billMonth || ''
        });
        return;
      }

      state.bill.totalAmount = parsed.totalAmount;
      state.bill.totalUnits = parsed.totalUnits;
      state.bill.billMonth = parsed.billMonth;

      showConfirmCard(parsed);
      showStatus('billStatus', 'success', 'Extracted from photo. Please verify.');
      updateCalcButton();
    } catch (err) {
      hideLoading();
      console.error(err);
      if (err.message && err.message.includes('User cancelled')) {
        return;
      }
      showStatus('billStatus', 'error', 'Photo capture failed: ' + (err.message || err));
    }
  }

  function showConfirmCard(parsed) {
    document.getElementById('confirmAmount').value = parsed.totalAmount || '';
    document.getElementById('confirmUnits').value = parsed.totalUnits || '';
    document.getElementById('confirmMonth').value = parsed.billMonth || '';
    document.getElementById('confirmBill').style.display = 'block';
  }

  // ============================================================
  // METER PHOTO CAPTURE (OCR for current reading)
  // ============================================================
  async function handleMeterCapture() {
    try {
      showLoading('Opening camera…');
      const photo = await OCR.capturePhoto('Take photo of submeter');
      hideLoading();

      state.reading.currPhotoDataUrl = photo.dataUrl;

      showLoading('Reading meter…');
      const text = await OCR.recognizeText(photo.dataUrl, photo.path);
      hideLoading();

      if (!text) {
        toast(OCR.isNative
          ? 'Could not read meter — please type the reading'
          : 'OCR only on phone — type the reading');
        return;
      }

      const candidates = OCR.extractMeterReadingCandidates(text);
      if (candidates.length === 0) {
        toast('No numbers detected — type the reading');
        return;
      }

      // If only one candidate, use it directly
      if (candidates.length === 1) {
        document.getElementById('curr').value = candidates[0];
        state.reading.curr = candidates[0];
        document.getElementById('currNote').textContent =
          `📸 OCR: ${candidates[0]} — please verify`;
        updateCalcButton();
        return;
      }

      // Multiple candidates — show picker
      const picked = await pickFromList(
        'Multiple readings detected. Pick the right one:',
        candidates.map(c => ({ label: String(c), value: c }))
      );
      if (picked != null) {
        document.getElementById('curr').value = picked;
        state.reading.curr = picked;
        document.getElementById('currNote').textContent = `📸 OCR: ${picked} — please verify`;
        updateCalcButton();
      }
    } catch (err) {
      hideLoading();
      if (err.message && err.message.includes('User cancelled')) return;
      console.error(err);
      toast('Camera error: ' + (err.message || err));
    }
  }

  function pickFromList(title, options) {
    return new Promise((resolve) => {
      const text = options.map((o, i) => `${i + 1}. ${o.label}`).join('\n');
      const input = prompt(`${title}\n${text}\n\nEnter the number (1-${options.length}):`);
      if (!input) return resolve(null);
      const idx = parseInt(input, 10) - 1;
      if (isNaN(idx) || idx < 0 || idx >= options.length) return resolve(null);
      resolve(options[idx].value);
    });
  }

  // ============================================================
  // CALCULATION
  // ============================================================
  function updateCalcButton() {
    const ok = state.bill.totalAmount > 0 &&
               state.bill.totalUnits > 0 &&
               state.reading.prev != null &&
               state.reading.curr != null &&
               state.reading.curr > state.reading.prev;
    document.getElementById('calcBtn').disabled = !ok;
  }

  function doCalculation() {
    const totalAmount = state.bill.totalAmount;
    const totalUnits = state.bill.totalUnits;
    const prev = state.reading.prev;
    const curr = state.reading.curr;
    const tenantUnits = curr - prev;
    const ratePerUnit = totalAmount / totalUnits;
    const tenantAmount = tenantUnits * ratePerUnit;

    state.result = {
      timestamp: Date.now(),
      billMonth: state.bill.billMonth,
      totalAmount,
      totalUnits,
      ratePerUnit,
      prevReading: prev,
      currReading: curr,
      tenantUnits,
      tenantAmount,
      message: null  // filled below
    };

    state.result.message = buildMessage(state.result);

    renderResults(state.result);

    // Hide save status — user hasn't saved yet
    document.getElementById('saveStatus').textContent = '';
    document.getElementById('saveBtn').disabled = false;
    document.getElementById('saveBtn').textContent = '💾 Save to history';
  }

  function buildMessage(d) {
    const fmt = (n, dec=2) => Number(n).toLocaleString('en-IN', {
      minimumFractionDigits: dec, maximumFractionDigits: dec
    });

    const lines = [
      `*Electricity Bill Split — ${d.billMonth || 'Current Month'}*`,
      ``,
      `*Main Meter (UHBVN):*`,
      `• Total Bill Amount: ₹${fmt(d.totalAmount)}`,
      `• Total Units Consumed: ${fmt(d.totalUnits)} kWh`,
      `• Rate per Unit: ₹${fmt(d.ratePerUnit, 4)}`,
      ``,
      `*Submeter${state.settings.meterLabel ? ' (' + state.settings.meterLabel + ')' : ''}:*`,
      `• Previous Reading: ${fmt(d.prevReading)}`,
      `• Current Reading: ${fmt(d.currReading)}`,
      `• Units Consumed: ${fmt(d.tenantUnits)} kWh`,
      ``,
      `*Tenant's Share:*`,
      `${fmt(d.tenantUnits)} × ₹${fmt(d.ratePerUnit, 4)} = *₹${fmt(d.tenantAmount)}*`,
      ``,
      `_Calculated automatically_`
    ];
    return lines.join('\n');
  }

  // ============================================================
  // RESULTS / WHATSAPP
  // ============================================================
  function bindResults() {
    document.getElementById('wa-self').addEventListener('click', () => sendWhatsApp('self'));
    document.getElementById('wa-tenant').addEventListener('click', () => sendWhatsApp('tenant'));
    document.getElementById('copyMsgBtn').addEventListener('click', copyMessage);
    document.getElementById('saveBtn').addEventListener('click', saveCurrentBill);
  }

  function renderResults(r) {
    const fmt = (n, dec=2) => Number(n).toLocaleString('en-IN', {
      minimumFractionDigits: dec, maximumFractionDigits: dec
    });

    document.getElementById('r-month').textContent = r.billMonth || '—';
    document.getElementById('r-total').textContent = '₹' + fmt(r.totalAmount);
    document.getElementById('r-units').textContent = fmt(r.totalUnits);
    document.getElementById('r-rate').textContent = '₹' + fmt(r.ratePerUnit, 4);
    document.getElementById('r-tunits').textContent = fmt(r.tenantUnits);
    document.getElementById('r-amount').textContent = fmt(r.tenantAmount);

    const waSelf = document.getElementById('wa-self');
    const waTenant = document.getElementById('wa-tenant');

    waSelf.disabled = false;
    waSelf.querySelector('span').textContent = state.settings.myName
      ? `Send to ${state.settings.myName}'s WhatsApp`
      : 'Send to my WhatsApp';

    if (state.settings.tenantNum) {
      waTenant.disabled = false;
      waTenant.querySelector('span').textContent =
        `Send to ${state.settings.tenantName || 'tenant'}'s WhatsApp`;
    } else {
      waTenant.disabled = true;
      waTenant.querySelector('span').textContent = "Set tenant's number in Settings";
    }

    document.getElementById('results').classList.add('show');
    setTimeout(() => {
      document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }

  function sendWhatsApp(target) {
    if (!state.result) return;
    const message = state.result.message;
    let number = '';
    if (target === 'self') number = state.settings.myNum || '';
    else if (target === 'tenant') number = state.settings.tenantNum || '';

    const url = number
      ? `https://wa.me/${number}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;

    if (Storage.isNative && window.Capacitor.Plugins.Browser) {
      // Use external app intent for WhatsApp specifically
      if (window.Capacitor.Plugins.App && window.Capacitor.Plugins.App.openUrl) {
        window.Capacitor.Plugins.App.openUrl({ url });
      } else {
        window.open(url, '_system');
      }
    } else {
      window.open(url, '_blank');
    }
  }

  async function copyMessage() {
    if (!state.result) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(state.result.message);
        toast('Message copied to clipboard');
      } else {
        // Fallback
        const ta = document.createElement('textarea');
        ta.value = state.result.message;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        toast('Message copied');
      }
    } catch (e) {
      toast('Could not copy: ' + e.message);
    }
  }

  async function saveCurrentBill() {
    if (!state.result) return;
    try {
      const entry = {
        timestamp: state.result.timestamp,
        billMonth: state.result.billMonth || formatDate(state.result.timestamp),
        totalAmount: state.result.totalAmount,
        totalUnits: state.result.totalUnits,
        ratePerUnit: state.result.ratePerUnit,
        prevReading: state.result.prevReading,
        currReading: state.result.currReading,
        tenantUnits: state.result.tenantUnits,
        tenantAmount: state.result.tenantAmount,
        message: state.result.message,
        meterLabel: state.settings.meterLabel || ''
      };
      await Storage.saveHistoryEntry(entry);
      // Update last reading for next month auto-fill
      await Storage.updateLastReading(state.result.currReading);
      state.settings = await Storage.getSettings();

      document.getElementById('saveStatus').textContent = '✓ Saved to history';
      document.getElementById('saveBtn').disabled = true;
      document.getElementById('saveBtn').textContent = '✓ Saved';
      toast('Saved to history');
    } catch (err) {
      toast('Save failed: ' + (err.message || err));
    }
  }

  // ============================================================
  // HISTORY
  // ============================================================
  function bindHistory() {
    document.getElementById('exportCsvBtn').addEventListener('click', exportHistoryCsv);
    document.getElementById('deleteEntryBtn').addEventListener('click', deleteCurrentEntry);
  }

  let currentDetailId = null;

  async function renderHistoryList() {
    const list = await Storage.getHistory();
    const listEl = document.getElementById('historyList');
    const empty = document.getElementById('historyEmpty');

    listEl.innerHTML = '';
    if (list.length === 0) {
      empty.style.display = 'block';
      listEl.style.display = 'none';
      return;
    }

    empty.style.display = 'none';
    listEl.style.display = 'flex';

    const fmt = (n) => Number(n).toLocaleString('en-IN', {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    });

    list.forEach(entry => {
      const btn = document.createElement('button');
      btn.className = 'history-item';
      btn.innerHTML = `
        <div class="hist-info">
          <div class="hist-month">${escape(entry.billMonth || '—')}</div>
          <div class="hist-meta">${escape(formatDate(entry.timestamp))} · ${fmt(entry.tenantUnits)} kWh</div>
        </div>
        <div class="hist-amount">₹${fmt(entry.tenantAmount)}</div>
      `;
      btn.addEventListener('click', () => openHistoryDetail(entry));
      listEl.appendChild(btn);
    });
  }

  function openHistoryDetail(entry) {
    currentDetailId = entry.id;
    document.getElementById('detailTitle').textContent = entry.billMonth || 'Bill Details';
    const fmt = (n, dec=2) => Number(n).toLocaleString('en-IN', {
      minimumFractionDigits: dec, maximumFractionDigits: dec
    });

    const content = document.getElementById('detailContent');
    content.innerHTML = `
      <div class="result-card">
        <h3 class="result-heading">Saved on ${formatDate(entry.timestamp)}</h3>
        <div class="line-item"><span class="label">Bill month</span><span class="val">${escape(entry.billMonth || '—')}</span></div>
        <div class="line-item"><span class="label">Total bill</span><span class="val">₹${fmt(entry.totalAmount)}</span></div>
        <div class="line-item"><span class="label">Total units</span><span class="val">${fmt(entry.totalUnits)} kWh</span></div>
        <div class="line-item"><span class="label">Rate per unit</span><span class="val">₹${fmt(entry.ratePerUnit, 4)}</span></div>
        <div class="line-item"><span class="label">Previous reading</span><span class="val">${fmt(entry.prevReading)}</span></div>
        <div class="line-item"><span class="label">Current reading</span><span class="val">${fmt(entry.currReading)}</span></div>
        <div class="line-item"><span class="label">Tenant units</span><span class="val">${fmt(entry.tenantUnits)} kWh</span></div>
        <div class="total-row">
          <span class="label">Tenant's share</span>
          <span class="val"><span class="currency">₹</span>${fmt(entry.tenantAmount)}</span>
        </div>
      </div>
      <div class="result-card">
        <h3 class="result-heading">WhatsApp message</h3>
        <pre>${escape(entry.message || '')}</pre>
        <button class="btn secondary" id="detailCopyBtn">📋 Copy message</button>
        <button class="btn secondary" id="detailSendSelfBtn">↗ Send to my WhatsApp</button>
        ${state.settings.tenantNum ? '<button class="btn secondary" id="detailSendTenantBtn">↗ Send to tenant</button>' : ''}
      </div>
    `;

    // Wire up detail buttons
    document.getElementById('detailCopyBtn').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(entry.message);
        toast('Copied');
      } catch (e) { toast('Copy failed'); }
    });
    document.getElementById('detailSendSelfBtn').addEventListener('click', () => {
      const num = state.settings.myNum || '';
      const url = num
        ? `https://wa.me/${num}?text=${encodeURIComponent(entry.message)}`
        : `https://wa.me/?text=${encodeURIComponent(entry.message)}`;
      window.open(url, '_system');
    });
    const tenantBtn = document.getElementById('detailSendTenantBtn');
    if (tenantBtn) {
      tenantBtn.addEventListener('click', () => {
        const url = `https://wa.me/${state.settings.tenantNum}?text=${encodeURIComponent(entry.message)}`;
        window.open(url, '_system');
      });
    }

    navigate('history-detail');
  }

  async function deleteCurrentEntry() {
    if (!currentDetailId) return;
    if (!confirm('Delete this entry permanently?')) return;
    await Storage.deleteHistoryEntry(currentDetailId);
    currentDetailId = null;
    toast('Entry deleted');
    navigate('history');
  }

  async function exportHistoryCsv() {
    const list = await Storage.getHistory();
    if (list.length === 0) {
      toast('No history to export');
      return;
    }
    const headers = [
      'Date', 'Bill Month', 'Total Amount', 'Total Units', 'Rate/Unit',
      'Prev Reading', 'Curr Reading', 'Tenant Units', 'Tenant Amount'
    ];
    const rows = list.map(e => [
      formatDate(e.timestamp),
      e.billMonth || '',
      e.totalAmount,
      e.totalUnits,
      e.ratePerUnit?.toFixed(4) || '',
      e.prevReading,
      e.currReading,
      e.tenantUnits,
      e.tenantAmount?.toFixed(2) || ''
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(csvCell).join(','))].join('\n');

    // Trigger download
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bill_history_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('CSV exported');
  }

  function csvCell(v) {
    if (v == null) return '';
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  // ============================================================
  // SETTINGS
  // ============================================================
  function bindSettings() {
    document.getElementById('saveSettingsBtn').addEventListener('click', saveSettingsForm);
    document.getElementById('clearHistoryBtn').addEventListener('click', async () => {
      if (!confirm('Delete ALL history entries? This cannot be undone.')) return;
      await Storage.clearHistory();
      toast('History cleared');
    });
  }

  function populateSettingsForm() {
    if (!state.settings) return;
    document.getElementById('myName').value = state.settings.myName || '';
    document.getElementById('myNum').value = state.settings.myNum || '';
    document.getElementById('tenantName').value = state.settings.tenantName || '';
    document.getElementById('tenantNum').value = state.settings.tenantNum || '';
    document.getElementById('meterLabel').value = state.settings.meterLabel || '';
  }

  async function saveSettingsForm() {
    const cleanNum = (s) => (s || '').replace(/[^0-9]/g, '');
    state.settings.myName = document.getElementById('myName').value.trim();
    state.settings.myNum = cleanNum(document.getElementById('myNum').value);
    state.settings.tenantName = document.getElementById('tenantName').value.trim();
    state.settings.tenantNum = cleanNum(document.getElementById('tenantNum').value);
    state.settings.meterLabel = document.getElementById('meterLabel').value.trim();
    await Storage.saveSettings(state.settings);
    toast('Settings saved');
    navigate('home');
  }

  // ============================================================
  // HELPERS
  // ============================================================
  function showStatus(elId, type, html) {
    const el = document.getElementById(elId);
    el.className = 'status show ' + type;
    el.innerHTML = html;
  }

  function showLoading(text) {
    document.getElementById('loadingText').textContent = text || 'Working…';
    document.getElementById('loadingOverlay').classList.add('show');
  }
  function hideLoading() {
    document.getElementById('loadingOverlay').classList.remove('show');
  }

  let toastTimer;
  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  function formatDate(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function escape(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  return { init };
})();

// Boot
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', App.init);
} else {
  App.init();
}
