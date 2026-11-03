/**
 * Timetable OCR Controller
 *
 * Receives a timetable image (base64 / data URL) or pasted text, and returns the
 * extracted class slots. The route is authenticated, rate-limited and body-validated
 * (see routes/academicRoutes.js); this handler adds the image trust boundary:
 * type, size and magic-byte checks, then a decode + re-encode that strips metadata
 * before the pixels ever reach the OCR engine.
 */

const { scanTimetableImage, processTimetableText } = require('../services/timetableOcrService');
const { sanitizeImage } = require('../utils/imageSecurity');
const { AppError } = require('../errors');

async function handleTimetableOcr(req, res, next) {
  try {
    const { image, text, fileName } = req.body || {};

    // Direct text parse mode for manual testing or text paste
    if (text) {
      const result = await processTimetableText(text);
      return res.status(200).json({
        status: 'success',
        count: result.items.length,
        items: result.items,
        rawText: text,
        parser: result.parser
      });
    }

    // Untrusted upload: verify it is a real PNG/JPEG/WebP within the size cap and
    // rebuild it from its pixels (drops EXIF/GPS metadata and trailing payloads).
    const clean = await sanitizeImage(image, { fileName, maxDimension: 3200, format: 'png' });
    const result = await scanTimetableImage(clean.buffer);

    return res.status(200).json({
      status: 'success',
      count: result.count,
      items: result.items,
      rawText: result.rawText,
      parser: result.parser
    });
  } catch (error) {
    // Validation-style failures (bad type, too large, ...) are safe to show as-is.
    if (error instanceof AppError) return next(error);

    // Anything else (missing Tesseract, decoder crash) stays in the server log;
    // the client gets no paths, binaries or stack traces.
    console.error('[Timetable OCR Error]', error);
    return res.status(500).json({
      status: 'error',
      code: 'OCR_PROCESSING_FAILED',
      message: 'Failed to process the timetable. Try a clearer image or paste the text instead.'
    });
  }
}

module.exports = {
  handleTimetableOcr
};
