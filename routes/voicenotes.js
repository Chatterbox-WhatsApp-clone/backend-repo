const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '../uploads/voicenotes');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer storage setup
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Use timestamp and original extension
    const ext = path.extname(file.originalname);
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + ext;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // Limit: 10MB
  fileFilter: function (req, file, cb) {
    // Accept only audio files
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed!'), false);
    }
  }
});

/**
 * @swagger
 * /api/voicenotes:
 *   post:
 *     summary: Upload a new voice note
 *     tags:
 *       - VoiceNotes
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               voicenote:
 *                 type: string
 *                 format: binary
 *                 description: "The audio file to upload (max size: 10MB)"
 *     responses:
 *       201:
 *         description: Voice note uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 filename:
 *                   type: string
 *                 url:
 *                   type: string
 *       400:
 *         description: No file uploaded or invalid file
 */
// POST /api/voicenotes - upload a voice note
router.post('/', upload.single('voicenote'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  // Respond with file info (you can also save metadata in DB if needed)
  res.status(201).json({
    filename: req.file.filename,
    url: `/api/voicenotes/${req.file.filename}`
  });
});

/**
 * @swagger
 * /api/voicenotes/{filename}:
 *   get:
 *     summary: Download a specific voice note file
 *     tags:
 *       - VoiceNotes
 *     parameters:
 *       - in: path
 *         name: filename
 *         required: true
 *         schema:
 *           type: string
 *         description: Name of the voice note file to retrieve
 *     responses:
 *       200:
 *         description: The requested audio file will be returned as binary data
 *         content:
 *           audio/*:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: File not found
 */
// GET /api/voicenotes/:filename - serve a voicenote file
router.get('/:filename', (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(uploadDir, filename);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

module.exports = router;
