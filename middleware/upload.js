const multer = require("multer");
const { v4: uuidv4 } = require("uuid");

const multerStorageCloudinary = require("multer-storage-cloudinary");
const CloudinaryStorage = multerStorageCloudinary.CloudinaryStorage;

const cloudinary = require("../Cloudinary");

// Base Cloudinary storage config
const baseStorage = new CloudinaryStorage({
	cloudinary,
	params: async (req, file) => {
		const isImage = file.mimetype.startsWith("image/");
		const isVideo = file.mimetype.startsWith("video/");
		const isAudio = file.mimetype.startsWith("audio/");

		let resourceType = "raw";
		if (isImage) resourceType = "image";
		if (isVideo) resourceType = "video";
		if (isAudio) resourceType = "video";

		return {
			folder: "uploads",
			resource_type: resourceType,
			public_id: `${uuidv4()}`,
		};
	},
});

// General file filter
const fileFilter = (req, file, cb) => {
	const allowedTypes = [
		"image/jpeg",
		"image/png",
		"image/gif",
		"image/webp",
		"video/mp4",
		"video/avi",
		"video/mov",
		"video/wmv",
		"audio/mp3",
		"audio/wav",
		"audio/m4a",
		"application/pdf",
		"application/msword",
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		"text/plain",
	];

	if (allowedTypes.includes(file.mimetype)) {
		cb(null, true);
	} else {
		cb(new Error(`File type ${file.mimetype} not allowed`), false);
	}
};

// Base uploader
const upload = multer({
	storage: baseStorage,
	fileFilter,
	limits: {
		fileSize: 10 * 1024 * 1024,
		files: 1,
	},
});

// Image upload
const uploadImage = multer({
	storage: baseStorage,
	fileFilter: (req, file, cb) => {
		file.mimetype.startsWith("image/")
			? cb(null, true)
			: cb(new Error("Only image files are allowed"), false);
	},
	limits: { fileSize: 5 * 1024 * 1024 },
});

// Video upload
const uploadVideo = multer({
	storage: baseStorage,
	fileFilter: (req, file, cb) => {
		file.mimetype.startsWith("video/")
			? cb(null, true)
			: cb(new Error("Only video files are allowed"), false);
	},
	limits: { fileSize: 50 * 1024 * 1024 },
});

// Audio upload
const uploadAudio = multer({
	storage: baseStorage,
	fileFilter: (req, file, cb) => {
		file.mimetype.startsWith("audio/")
			? cb(null, true)
			: cb(new Error("Only audio files are allowed"), false);
	},
	limits: { fileSize: 10 * 1024 * 1024 },
});

// Document upload
const uploadDocument = multer({
	storage: baseStorage,
	fileFilter: (req, file, cb) => {
		const allowedDocs = [
			"application/pdf",
			"application/msword",
			"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
			"text/plain",
		];
		allowedDocs.includes(file.mimetype)
			? cb(null, true)
			: cb(new Error("Only document files are allowed"), false);
	},
	limits: { fileSize: 20 * 1024 * 1024 },
});

// Multer error handler
const handleUploadError = (error, req, res, next) => {
	if (error instanceof multer.MulterError) {
		if (error.code === "LIMIT_FILE_SIZE")
			return res.status(400).json({ success: false, error: "File too large" });

		if (error.code === "LIMIT_FILE_COUNT")
			return res.status(400).json({ success: false, error: "Too many files" });

		if (error.code === "LIMIT_UNEXPECTED_FILE")
			return res
				.status(400)
				.json({ success: false, error: "Unexpected file field" });
	}

	if (error.message) {
		return res.status(400).json({ success: false, error: error.message });
	}

	next(error);
};

module.exports = {
	upload,
	uploadImage,
	uploadVideo,
	uploadAudio,
	uploadDocument,
	handleUploadError,
};
