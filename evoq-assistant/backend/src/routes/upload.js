/**
 * File upload route.
 *
 * POST /api/upload
 *   - Accepts one or more files via multipart/form-data (field name: "files")
 *   - Supports: images (jpeg/png/gif/webp), PDFs, and plain text files
 *   - Returns an array of attachment descriptors with base64-encoded data
 *
 * Response: [{ type, name, mimeType, size, data }]
 *   type:     'image' | 'pdf' | 'text'
 *   name:     original filename
 *   mimeType: MIME type string
 *   size:     file size in bytes
 *   data:     base64-encoded file contents
 */

import { Router }   from 'express';
import multer       from 'multer';
import pdfParse     from 'pdf-parse/lib/pdf-parse.js';

const router = Router();

// ── Multer configuration ──────────────────────────────────────────────────────

const MAX_FILE_SIZE   = parseInt(process.env.MAX_FILE_SIZE ?? String(10 * 1024 * 1024), 10);
const MAX_FILE_COUNT  = 10;

const ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'text/html',
  'application/json',
  'text/javascript',
  'text/typescript',
  'application/javascript',
  'text/x-python',
  'text/x-java-source',
  'text/x-csrc',
  'text/x-c++src',
  'text/x-sh',
]);

/**
 * Resolve a loose MIME type to one of three canonical types
 * expected by the AI provider adapters: 'image' | 'pdf' | 'text'
 */
function resolveType(mimeType) {
  if (mimeType.startsWith('image/'))       return 'image';
  if (mimeType === 'application/pdf')      return 'pdf';
  return 'text';
}

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize:  MAX_FILE_SIZE,
    files:     MAX_FILE_COUNT,
  },
  fileFilter(_req, file, cb) {
    // Normalise the MIME type from the client (can be empty for some OS/browser combos)
    const mime = file.mimetype || 'application/octet-stream';

    // Accept any text/* subtype and explicitly whitelisted types
    if (mime.startsWith('text/') || ALLOWED_MIMES.has(mime)) {
      return cb(null, true);
    }

    cb(new Error(`File type "${mime}" is not supported. Allowed: images, PDF, and text files.`));
  },
});

// ── POST /api/upload ──────────────────────────────────────────────────────────

router.post(
  '/',
  upload.array('files', MAX_FILE_COUNT),
  async (req, res) => {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Bad Request', message: 'No files uploaded' });
    }

    try {
      const attachments = await Promise.all(
        req.files.map(async (file) => {
          const mime        = file.mimetype || 'application/octet-stream';
          const attachType  = resolveType(mime);

          // For PDFs we extract the text content and store it alongside the raw data
          // so providers that don't support PDF natively can still use the text.
          let extractedText = null;
          if (attachType === 'pdf') {
            try {
              const parsed = await pdfParse(file.buffer);
              extractedText = parsed.text;
            } catch {
              // PDF parsing failure is non-fatal — providers will use raw base64
              extractedText = null;
            }
          }

          const attachment = {
            type:     attachType,
            name:     file.originalname,
            mimeType: mime,
            size:     file.size,
            data:     file.buffer.toString('base64'),
          };

          if (extractedText !== null) {
            attachment.extractedText = extractedText;
          }

          return attachment;
        })
      );

      res.json(attachments);
    } catch (err) {
      console.error('[upload] processing error:', err.message);
      res.status(500).json({ error: 'Internal Server Error', message: err.message });
    }
  }
);

// ── Multer error handler ──────────────────────────────────────────────────────
// Must be a 4-argument function to be recognized as an error handler by Express.

router.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: 'Payload Too Large',
        message: `File exceeds the ${Math.round(MAX_FILE_SIZE / 1024 / 1024)} MB size limit.`,
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        error: 'Bad Request',
        message: `Maximum ${MAX_FILE_COUNT} files per upload.`,
      });
    }
    return res.status(400).json({ error: 'Bad Request', message: err.message });
  }

  if (err) {
    return res.status(400).json({ error: 'Bad Request', message: err.message });
  }
});

export default router;
