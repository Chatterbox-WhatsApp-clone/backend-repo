const nodemailer = require('nodemailer');
let resend;

// Try to import Resend (optional dependency)
try {
  resend = require('resend');
} catch (e) {
  console.log('ℹ️  Resend not installed. Run: npm install resend');
}

// Nodemailer transporter for traditional SMTP
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Resend client for free email service
const resendClient = resend ? new resend.Resend(process.env.RESEND_API_KEY) : null;

function areEmailEnvVarsPresent() {
  // Check if either SMTP or Resend is configured
  const hasSMTP = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  const hasResend = Boolean(process.env.RESEND_API_KEY);
  return hasSMTP || hasResend;
}

async function sendEmail({ to, subject, html, text }) {
  if (!areEmailEnvVarsPresent()) {
    throw new Error('Email configuration missing. Set either:\n' +
      'SMTP: SMTP_HOST, SMTP_USER, SMTP_PASS\n' +
      'OR\n' +
      'Resend: RESEND_API_KEY (free tier: 3,000 emails/month)');
  }

  // Try Resend first (free, better deliverability)
  if (resendClient && process.env.RESEND_API_KEY) {
    try {
      console.log(`📧 Attempting to send email via Resend to: ${to}`);
      
      const result = await resendClient.emails.send({
        from: process.env.MAIL_FROM || 'Chatterbox <noreply@resend.dev>',
        to: [to],
        subject,
        html
      });
      
      console.log('✅ Email sent via Resend successfully!');
      console.log('Resend Response:', JSON.stringify(result, null, 2));
      
      return { 
        success: true, 
        provider: 'resend', 
        id: result.id || result.data?.id,
        message: 'Email sent via Resend'
      };
    } catch (err) {
      console.error('❌ Resend failed:', err.message);
      console.error('Resend error details:', err);
      
      // If Resend fails, try SMTP fallback
      if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
        console.log('🔄 Falling back to SMTP...');
      } else {
        throw new Error(`Resend failed: ${err.message}`);
      }
    }
  }

  // Fallback to Nodemailer/SMTP
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      console.log(`📧 Attempting to send email via SMTP to: ${to}`);
      
      const from = process.env.MAIL_FROM || process.env.SMTP_USER;
      const info = await transporter.sendMail({ from, to, subject, html, text });
      
      console.log('✅ Email sent via SMTP successfully!');
      console.log('SMTP Response:', JSON.stringify(info, null, 2));
      
      return { 
        success: true, 
        provider: 'smtp', 
        id: info.messageId,
        message: 'Email sent via SMTP'
      };
    } catch (err) {
      console.error('❌ SMTP failed:', err.message);
      throw new Error(`SMTP failed: ${err.message}`);
    }
  }

  throw new Error('No email service configured');
}

async function verifyEmailTransporter() {
  if (!areEmailEnvVarsPresent()) {
    console.warn('⚠️  Email is not configured. Set up either:\n' +
      '• Gmail/Outlook: SMTP_HOST, SMTP_USER, SMTP_PASS\n' +
      '• Resend (free): RESEND_API_KEY');
    return false;
  }

  // Test Resend if available
  if (resendClient && process.env.RESEND_API_KEY) {
    try {
      console.log('✅ Resend configured with API key');
      return true;
    } catch (err) {
      console.error('❌ Resend verification failed:', err.message);
    }
  }

  // Test SMTP if configured
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      await transporter.verify();
      console.log(`✅ SMTP ready: ${process.env.SMTP_HOST} as ${process.env.SMTP_USER}`);
      return true;
    } catch (err) {
      console.error('❌ SMTP verification failed:', err.message);
      return false;
    }
  }

  return false;
}

function buildCodeEmailTemplate({ title, code, preface }) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 10px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 28px; font-weight: bold;">🔐 Chatterbox</h1>
          <p style="color: rgba(255, 255, 255, 0.9); margin: 10px 0 0 0; font-size: 16px;">${title}</p>
        </div>
        
        <!-- Content -->
        <div style="padding: 40px 30px;">
          <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 25px 0;">${preface}</p>
          
          <!-- Reset Code Box -->
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; padding: 25px; text-align: center; margin: 30px 0;">
            <p style="color: white; margin: 0 0 15px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Your Reset Code</p>
            <div style="background: rgba(255, 255, 255, 0.2); border-radius: 8px; padding: 20px; margin: 0 auto; display: inline-block; min-width: 200px;">
              <span style="color: white; font-size: 36px; font-weight: bold; letter-spacing: 8px; font-family: 'Courier New', monospace; text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);">${code}</span>
            </div>
          </div>
          
          <!-- Instructions -->
          <div style="background-color: #f8f9fa; border-left: 4px solid #667eea; padding: 20px; border-radius: 0 8px 8px 0; margin: 25px 0;">
            <h3 style="color: #333; margin: 0 0 10px 0; font-size: 18px;">📝 How to use this code:</h3>
            <ol style="color: #555; margin: 0; padding-left: 20px; line-height: 1.6;">
              <li>Go to your app's password reset page</li>
              <li>Enter your email address</li>
              <li>Enter the code above: <strong>${code}</strong></li>
              <li>Create your new password</li>
            </ol>
          </div>
          
          <!-- Security Notice -->
          <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; padding: 20px; margin: 25px 0;">
            <p style="color: #856404; margin: 0; font-size: 14px; line-height: 1.5;">
              <strong>🔒 Security Notice:</strong> This code expires in 1 hour. If you didn't request this password reset, 
              please ignore this email and ensure your account is secure.
            </p>
          </div>
        </div>
        
        <!-- Footer -->
        <div style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e9ecef;">
          <p style="color: #6c757d; margin: 0; font-size: 14px;">
            Sent from Chatterbox • This is an automated message, please do not reply
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
}

module.exports = { sendEmail, buildCodeEmailTemplate, verifyEmailTransporter }; 