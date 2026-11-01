/**
 * Timetable OCR Controller
 *
 * Exposes endpoint to receive an image payload (base64 or multipart) and invoke local Tesseract OCR.
 */

const { scanTimetableImage, parseTimetableText } = require('../services/timetableOcrService');

async function handleTimetableOcr(req, res, next) {
  try {
    const { image, text } = req.body || {};

    // Direct text parse mode for manual testing or text paste
    if (text && typeof text === 'string') {
      const items = parseTimetableText(text);
      return res.status(200).json({
        status: 'success',
        count: items.length,
        items,
        rawText: text
      });
    }

    if (!image || typeof image !== 'string') {
      return res.status(400).json({
        status: 'error',
        code: 'VALIDATION_ERROR',
        message: 'An image (base64 string or data URL) or text payload is required for timetable OCR.'
      });
    }

    // Extract base64 buffer from data URL if needed (e.g. data:image/png;base64,iVBOR...)
    const base64Data = image.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    if (buffer.length === 0) {
      return res.status(400).json({
        status: 'error',
        code: 'VALIDATION_ERROR',
        message: 'Invalid base64 image data supplied.'
      });
    }

    const result = await scanTimetableImage(buffer);

    return res.status(200).json({
      status: 'success',
      count: result.count,
      items: result.items,
      rawText: result.rawText,
      tesseractPath: result.tesseractPath
    });
  } catch (error) {
    console.error('[Timetable OCR Error]', error);
    return res.status(500).json({
      status: 'error',
      code: 'OCR_PROCESSING_FAILED',
      message: error.message || 'Failed to process timetable image with Tesseract OCR.'
    });
  }
}

module.exports = {
  handleTimetableOcr
};

