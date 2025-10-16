// utils/email.js
const sgMail = require("@sendgrid/mail");
require("dotenv").config();

// Set SendGrid API key
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

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

// Generic email sender
async function sendEmail({ to, toEmail, toName, subject, html, text = "" }) {
	const { email, name } = normalizeRecipient({ to, toEmail, toName });

	if (!process.env.SENDGRID_FROM) {
		throw new Error("SENDGRID_FROM environment variable is not set.");
	}

	const msg = {
		to: { email, name },
		from: {
			email: process.env.SENDGRID_FROM,
			name: process.env.MAIL_FROM || "Chatterbox",
		},
		subject: subject || "Message from Chatterbox",
		text: text || html.replace(/<[^>]+>/g, ""), // fallback to plain text
		html: html || "<p>No content</p>",
	};

	try {
		await sgMail.send(msg);
		return { provider: "sendgrid", ok: true };
	} catch (err) {
		const error = new Error(
			`Failed to send email via SendGrid: ${err?.message || err}`
		);
		error.cause = err;
		error.provider = "sendgrid";
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

module.exports = {
	sendEmail,
	buildCodeEmailTemplate,
	sendCodeEmail,
};
