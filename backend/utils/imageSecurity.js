/**
 * Untrusted image handling (profile pictures, timetable scans).
 *
 * A browser-supplied image is never trusted because of its declared type or
 * file name. Every image goes through the same pipeline:
 *
 *  1. only png / jpg / jpeg / webp are accepted (declared type and extension);
 *  2. the size is capped (5 MB decoded) *before* any decoding work;
 *  3. magic bytes must confirm a real PNG, JPEG or WebP, so an executable or
 *     HTML file renamed to ".png" is refused;
 *  4. the pixels are decoded and re-encoded with sharp, which downscales the
 *     image and drops EXIF/GPS/ICC/XMP metadata and any trailing payload bytes.
 *
 * Failures throw BadRequestError with a generic message: nothing about the
 * decoder or the host is revealed to the client.
 */

const sharp = require('sharp');
const { BadRequestError } = require('../errors');

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // decoded bytes
const MAX_INPUT_PIXELS = 40_000_000; // decompression-bomb guard
const ALLOWED_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp']);
const MIME_TO_TYPE = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/jpg': 'jpeg',
  'image/webp': 'webp'
};

/**
 * Identifies an image purely from its leading bytes.
 *
 * @param {Buffer} buf
 * @returns {'png'|'jpeg'|'webp'|null}
 */
function detectImageType(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

/**
 * @param {string} [fileName] - optional client file name; its extension must be allowed
 */
function assertAllowedExtension(fileName) {
  if (fileName === undefined || fileName === null || fileName === '') return;
  const match = /\.([A-Za-z0-9]{1,8})$/.exec(String(fileName));
  if (!match || !ALLOWED_EXTENSIONS.has(match[1].toLowerCase())) {
    throw new BadRequestError('Only PNG, JPG and WebP images are accepted.', 'UNSUPPORTED_IMAGE_TYPE');
  }
}

/**
 * Decodes a base64 string or `data:image/...;base64,` URL into a Buffer after
 * checking the declared type and the size, without allocating oversized buffers.
 *
 * @param {string} input
 * @returns {{ buffer: Buffer, declaredType: string|null }}
 */
function decodeImagePayload(input) {
  if (typeof input !== 'string' || input.length === 0) {
    throw new BadRequestError('An image is required.', 'INVALID_IMAGE');
  }

  let declaredType = null;
  let b64 = input;
  const dataUrl = /^data:([a-zA-Z0-9.+/-]+);base64,/.exec(input);
  if (dataUrl) {
    declaredType = MIME_TO_TYPE[dataUrl[1].toLowerCase()] || null;
    if (!declaredType) {
      throw new BadRequestError('Only PNG, JPG and WebP images are accepted.', 'UNSUPPORTED_IMAGE_TYPE');
    }
    b64 = input.slice(dataUrl[0].length);
  } else if (/^data:/i.test(input)) {
    throw new BadRequestError('Only base64 image data is accepted.', 'INVALID_IMAGE');
  }

  b64 = b64.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/_-]*={0,2}$/.test(b64)) {
    throw new BadRequestError('Invalid image data.', 'INVALID_IMAGE');
  }
  const estimatedBytes = Math.floor((b64.length * 3) / 4);
  if (estimatedBytes > MAX_IMAGE_BYTES) {
    throw new BadRequestError('Image is too large. The maximum size is 5 MB.', 'IMAGE_TOO_LARGE');
  }
  const buffer = Buffer.from(b64, 'base64');
  if (buffer.length === 0) throw new BadRequestError('Invalid image data.', 'INVALID_IMAGE');
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new BadRequestError('Image is too large. The maximum size is 5 MB.', 'IMAGE_TOO_LARGE');
  }
  return { buffer, declaredType };
}

/**
 * Validates and re-encodes an untrusted image.
 *
 * @param {string|Buffer} input - data URL / base64 string, or raw bytes
 * @param {object} [options]
 * @param {string} [options.fileName] - client file name (extension is checked)
 * @param {number} [options.maxDimension=1600] - longest edge after downscaling
 * @param {'png'|'jpeg'|'webp'} [options.format='png'] - output format
 * @param {number} [options.quality=85]
 * @param {boolean} [options.square=false] - crop to a square (avatars)
 * @returns {Promise<{ buffer: Buffer, mime: string, width: number, height: number }>}
 */
async function sanitizeImage(input, options = {}) {
  const { fileName, maxDimension = 1600, format = 'png', quality = 85, square = false } = options;
  assertAllowedExtension(fileName);

  let buffer;
  let declaredType = null;
  if (Buffer.isBuffer(input)) {
    if (input.length > MAX_IMAGE_BYTES) {
      throw new BadRequestError('Image is too large. The maximum size is 5 MB.', 'IMAGE_TOO_LARGE');
    }
    buffer = input;
  } else {
    ({ buffer, declaredType } = decodeImagePayload(input));
  }

  const actualType = detectImageType(buffer);
  if (!actualType) {
    throw new BadRequestError('The file is not a valid PNG, JPG or WebP image.', 'INVALID_IMAGE');
  }
  if (declaredType && declaredType !== actualType) {
    throw new BadRequestError('The image content does not match its declared type.', 'INVALID_IMAGE');
  }

  try {
    let pipeline = sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' }).rotate(); // honour EXIF orientation, then drop it
    pipeline = pipeline.resize({
      width: maxDimension,
      height: maxDimension,
      fit: square ? 'cover' : 'inside',
      withoutEnlargement: !square
    });
    // sharp omits all input metadata unless withMetadata() is called.
    if (format === 'jpeg') pipeline = pipeline.jpeg({ quality, mozjpeg: true });
    else if (format === 'webp') pipeline = pipeline.webp({ quality });
    else pipeline = pipeline.png({ compressionLevel: 9 });

    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    return { buffer: data, mime: `image/${format}`, width: info.width, height: info.height };
  } catch {
    throw new BadRequestError('The image could not be processed. Please try a different file.', 'INVALID_IMAGE');
  }
}

/**
 * Normalises a profile-picture value for storage:
 *  - null / empty            -> null
 *  - https URL (e.g. Google) -> kept (http:, javascript:, data:text/html ... refused)
 *  - image data URL          -> validated, square-cropped to 256px, re-encoded as JPEG
 *
 * @param {string|null|undefined} value
 * @returns {Promise<string|null>}
 */
async function sanitizeProfilePicture(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw new BadRequestError('Invalid profile picture.', 'INVALID_IMAGE');

  if (/^https:\/\//i.test(value)) {
    if (value.length > 2048) throw new BadRequestError('Invalid profile picture URL.', 'INVALID_IMAGE');
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error('bad');
    } catch {
      throw new BadRequestError('Invalid profile picture URL.', 'INVALID_IMAGE');
    }
    return value;
  }

  if (!/^data:image\//i.test(value)) {
    throw new BadRequestError('Profile picture must be an uploaded image or an https URL.', 'INVALID_IMAGE');
  }
  const { buffer, mime } = await sanitizeImage(value, { maxDimension: 256, format: 'jpeg', quality: 85, square: true });
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

module.exports = {
  MAX_IMAGE_BYTES,
  ALLOWED_EXTENSIONS,
  detectImageType,
  assertAllowedExtension,
  decodeImagePayload,
  sanitizeImage,
  sanitizeProfilePicture
};
