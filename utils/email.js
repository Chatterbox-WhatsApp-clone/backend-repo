// utils/email.js
const nodemailer = require("nodemailer");
require("dotenv").config();

// Gmail SMTP transporter (SSL)
const transporter = nodemailer.createTransport({
	host: process.env.EMAIL_HOST,
	port: process.env.EMAIL_PORT,
	secure: true,
	auth: {
		user: process.env.EMAIL_USER,
		pass: process.env.EMAIL_PASS,
	},
});

// Normalize recipient shapes
function normalizeRecipient(params) {
	if (params.to && typeof params.to === "string") {
		return { email: params.to, name: params.toName || "User" };
	}
	if (params.to && typeof params.to === "object") {
		const { email, name } = params.to;
		return { email, name: name || "User" };
	}
	if (params.toEmail) {
		return { email: params.toEmail, name: params.toName || "User" };
	}
	throw new Error(
		"No recipient provided. Use `to`, `toEmail`, or `to: { email, name }`."
	);
}

// Generic email sender (SMTP)
async function sendEmail({ to, toEmail, toName, subject, html, text = "" }) {
	const { email, name } = normalizeRecipient({ to, toEmail, toName });

	if (!process.env.EMAIL_FROM) {
		throw new Error("EMAIL_FROM environment variable is not set.");
	}

	const mailOptions = {
		from: {
			name: process.env.MAIL_FROM || "Chatterbox",
			address: process.env.EMAIL_FROM,
		},
		to: { name, address: email },
		subject: subject || "Message from Chatterbox",
		html: html || "<p>No content</p>",
		text: text || html.replace(/<[^>]+>/g, ""),
	};

	try {
		await transporter.sendMail(mailOptions);
		return { provider: "smtp", ok: true };
	} catch (err) {
		const error = new Error(
			`Failed to send email via SMTP: ${err?.message || err}`
		);
		error.cause = err;
		error.provider = "smtp";
		throw error;
	}
}

// Build reset/verification code email
function buildCodeEmailTemplate({ title, code, preface }) {
	return `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family: Arial, sans-serif;">
        <h2>${title}</h2>
        <p>${preface}</p>
        <div style="padding:10px; background:#f0f0f0; display:inline-block; border-radius:6px;">
          <strong style="font-size:24px; letter-spacing:3px;">${code}</strong>
        </div>
        <p>This code expires in 15 minutes.</p>
      </body>
    </html>
  `;
}

// Specialized sender for verification/reset codes
async function sendCodeEmail({ to, toEmail, toName, title, code, preface }) {
	const html = buildCodeEmailTemplate({ title, code, preface });
	return await sendEmail({
		to,
		toEmail,
		toName,
		subject: title,
		html,
		text: `${preface}\n\nYour code: ${code}`,
	});
}

// Transporter verification (optional startup check)
async function verifyEmailTransporter() {
	try {
		await transporter.verify();
		console.log("✅ SMTP transporter verified successfully (SSL).");
	} catch (error) {
		console.error("❌ SMTP verification failed:", error.message);
	}
}

module.exports = {
	sendEmail,
	buildCodeEmailTemplate,
	sendCodeEmail,
	verifyEmailTransporter,
};
