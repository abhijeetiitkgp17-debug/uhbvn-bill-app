// OCR module - captures photo and runs ML Kit text recognition
// Falls back to file picker + manual entry in browser dev

const OCR = (() => {

  const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

  // Capture a photo and return both the image data URL and OCR'd text
  async function capturePhoto(promptLabel = 'Take photo') {
    if (isNative && window.Capacitor.Plugins.Camera) {
      const Camera = window.Capacitor.Plugins.Camera;
      const photo = await Camera.getPhoto({
        quality: 85,
        allowEditing: false,
        resultType: 'dataUrl',     // base64 data URL
        source: 'CAMERA',
        saveToGallery: false,
        correctOrientation: true
      });
      return { dataUrl: photo.dataUrl, path: photo.path || null };
    }

    // Browser fallback: file input
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.capture = 'environment';
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return reject(new Error('No file selected'));
        const reader = new FileReader();
        reader.onload = () => resolve({ dataUrl: reader.result, path: null });
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      };
      input.click();
    });
  }

  // Run text recognition on an image
  // Native: ML Kit. Browser: not available — caller handles fallback to manual.
  async function recognizeText(imageDataUrl, imagePath) {
    if (isNative && window.Capacitor.Plugins.MlKitTextRecognition) {
      const MlKit = window.Capacitor.Plugins.MlKitTextRecognition;
      try {
        // Plugin expects a path or base64. Use data URL stripped of prefix.
        const base64 = imageDataUrl.replace(/^data:image\/[a-zA-Z]+;base64,/, '');
        const result = await MlKit.processImage({
          image: { base64String: base64 }
        });
        // result.text is the full recognized text
        return result.text || '';
      } catch (err) {
        console.error('ML Kit error:', err);
        throw new Error('OCR failed: ' + (err.message || err));
      }
    }
    // Browser dev: no OCR, return empty so caller falls back to manual
    return '';
  }

  // Extract a meter reading from OCR text
  // Meters typically show 5-7 digit numbers, may have decimal
  function extractMeterReading(text) {
    if (!text) return null;
    // Clean text: replace common OCR misreads
    const cleaned = text.replace(/[Oo]/g, '0').replace(/[Il]/g, '1').replace(/[Ss]/g, '5');

    // Find all numeric candidates - prioritize ones with 4-7 digits
    const candidates = [];
    const numberRegex = /\b(\d{3,8}(?:\.\d{1,3})?)\b/g;
    let m;
    while ((m = numberRegex.exec(cleaned)) !== null) {
      const num = parseFloat(m[1]);
      // Typical meter readings: 100 to 9,999,999
      if (num >= 100 && num <= 9999999) {
        candidates.push({
          value: num,
          length: m[1].length,
          raw: m[1]
        });
      }
    }

    if (candidates.length === 0) return null;

    // Prefer longer numbers (more digits = more likely to be the reading)
    candidates.sort((a, b) => b.length - a.length);
    return candidates[0].value;
  }

  // Multiple candidates for user to pick from
  function extractMeterReadingCandidates(text) {
    if (!text) return [];
    const cleaned = text.replace(/[Oo]/g, '0').replace(/[Il]/g, '1').replace(/[Ss]/g, '5');
    const candidates = [];
    const seen = new Set();
    const numberRegex = /\b(\d{3,8}(?:\.\d{1,3})?)\b/g;
    let m;
    while ((m = numberRegex.exec(cleaned)) !== null) {
      const num = parseFloat(m[1]);
      if (num >= 100 && num <= 9999999 && !seen.has(num)) {
        seen.add(num);
        candidates.push(num);
      }
    }
    // Sort by likelihood: prefer 5-7 digit numbers (typical meter range)
    candidates.sort((a, b) => {
      const aDigits = String(Math.floor(a)).length;
      const bDigits = String(Math.floor(b)).length;
      const aPriority = (aDigits >= 4 && aDigits <= 7) ? 1 : 0;
      const bPriority = (bDigits >= 4 && bDigits <= 7) ? 1 : 0;
      if (aPriority !== bPriority) return bPriority - aPriority;
      return b - a; // larger first as fallback
    });
    return candidates.slice(0, 5);
  }

  return {
    capturePhoto,
    recognizeText,
    extractMeterReading,
    extractMeterReadingCandidates,
    isNative
  };
})();

window.OCR = OCR;
