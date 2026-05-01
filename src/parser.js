// UHBVN Bill Parser
// Verified against actual UHBVN bill format

const UHBVNParser = (() => {

  async function extractTextFromPdf(file) {
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const items = content.items.slice().sort((a, b) => {
        const yDiff = b.transform[5] - a.transform[5];
        if (Math.abs(yDiff) > 4) return yDiff;
        return a.transform[4] - b.transform[4];
      });
      const lines = {};
      items.forEach(item => {
        const y = Math.round(item.transform[5]);
        let key = y;
        for (const k of Object.keys(lines)) {
          if (Math.abs(parseInt(k) - y) <= 3) { key = parseInt(k); break; }
        }
        if (!lines[key]) lines[key] = [];
        lines[key].push({ x: item.transform[4], s: item.str });
      });
      const sortedYs = Object.keys(lines).map(Number).sort((a,b) => b - a);
      for (const y of sortedYs) {
        const row = lines[y].sort((a,b) => a.x - b.x).map(p => p.s).join(' ');
        fullText += row + '\n';
      }
      fullText += '\n';
    }
    return fullText;
  }

  // Parse plain text (from PDF or OCR'd bill photo)
  function parseText(text) {
    const r = { totalAmount: null, totalUnits: null, billMonth: null };

    // ---- TOTAL AMOUNT ----
    let m = text.match(/Net\s*Payable\s*Amount\s*on\s*or\s*before\s*Due\s*Date[^0-9-]*([0-9,]+(?:\.[0-9]+)?)/i);
    if (!m) m = text.match(/Total\s*Payable\s*Amount[^0-9-]*\(\s*A\s*\+\s*B\s*\+\s*C\s*\)[^0-9-]*([0-9,]+(?:\.[0-9]+)?)/i);
    if (!m) m = text.match(/Net\s*Payable\s*Amount[^0-9-]*([0-9,]+(?:\.[0-9]+)?)/i);
    if (!m) m = text.match(/Net\s*Amount\s*Payable[^0-9-]*([0-9,]+(?:\.[0-9]+)?)/i);
    if (m) r.totalAmount = parseFloat(m[1].replace(/,/g, ''));

    // ---- CONSUMED UNITS (kWh — not kVAh) ----
    const lines = text.split('\n');
    for (const line of lines) {
      if (/kVAh/i.test(line)) continue;
      if (/\bkWh\b/i.test(line)) {
        const nums = line.match(/[0-9]+\.[0-9]+/g);
        if (nums && nums.length >= 3) {
          // Look for adjacent equal values (consumed = billed pattern)
          for (let i = 0; i < nums.length - 1; i++) {
            const a = parseFloat(nums[i]);
            const b = parseFloat(nums[i+1]);
            if (a === b && a > 0 && a < 50000) {
              r.totalUnits = a;
              break;
            }
          }
          if (r.totalUnits) break;
        }
      }
    }

    // Fallback: scan for kWh pattern in full text
    if (!r.totalUnits) {
      const m2 = text.match(/kWh[\s\S]{0,300}?([0-9]+\.[0-9]+)\s+\1\b/i);
      if (m2) r.totalUnits = parseFloat(m2[1]);
    }

    // ---- BILL MONTH ----
    m = text.match(/Bill\s*Month[:\s]*([A-Z]{3}\/[0-9]{4})/i);
    if (!m) m = text.match(/\b([A-Z]{3})\/(\d{4})\b/i);
    if (m) r.billMonth = m[1] + (m[2] ? '/' + m[2] : '');

    return r;
  }

  // Parse OCR text from bill photo - more lenient since OCR is messier
  function parseOcrText(text) {
    // Reuse the main parser but try harder
    const r = parseText(text);

    if (!r.totalAmount) {
      // Try simpler patterns OCR might produce
      const m = text.match(/(?:Total|Net|Payable)[^0-9]{0,30}?([0-9,]{3,8}\.[0-9]{2})/i);
      if (m) r.totalAmount = parseFloat(m[1].replace(/,/g, ''));
    }

    if (!r.totalUnits) {
      // Look for "kWh" with a number near it
      const kwhMatches = [...text.matchAll(/([0-9]+(?:\.[0-9]+)?)\s*kWh\b/gi)];
      if (kwhMatches.length) {
        // Pick the one that looks like consumed units (typically 50-2000)
        for (const m of kwhMatches) {
          const n = parseFloat(m[1]);
          if (n >= 10 && n <= 5000) {
            r.totalUnits = n;
            break;
          }
        }
      }
    }

    return r;
  }

  return { extractTextFromPdf, parseText, parseOcrText };
})();

window.UHBVNParser = UHBVNParser;
