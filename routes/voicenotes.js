const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();

const { uploadAudio } = require('../middleware/upload');
// Local storage config removed

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
router.post('/', uploadAudio.single('voicenote'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  // Respond with Cloudinary URL
  res.status(201).json({
    filename: req.file.filename, // This is the public_id in Cloudinary
    url: req.file.path // Cloudinary URL
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
