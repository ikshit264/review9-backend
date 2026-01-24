export interface EmailTemplateOptions {
  title: string;
  message: string;
  buttonText?: string;
  buttonLink?: string;
  candidateName?: string;
  details?: Array<{ label: string; value: string }>;
  footerText?: string;
  scheduledAt?: string;
}

const BRAND_COLOR = '#2563eb';
const TEXT_COLOR = '#1e293b';
const MUTED_COLOR = '#64748b';
const BASE_URL = process.env.FRONTEND_URL || 'https://inverv.entrext.in';

export const getProfessionalEmailLayout = (options: EmailTemplateOptions) => {
  const { title, message, buttonText, buttonLink, details, candidateName, footerText } = options;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: ${TEXT_COLOR}; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; }
    .wrapper { background-color: #ffffff; padding: 20px; }
    .container { width: 100%; margin: 0; }
    .brand { font-size: 20px; font-weight: 900; color: ${BRAND_COLOR}; margin-bottom: 32px; text-decoration: none; display: block; }
    .title { font-size: 24px; font-weight: 800; color: #0f172a; margin-bottom: 16px; letter-spacing: -0.025em; }
    .message { font-size: 16px; color: ${MUTED_COLOR}; margin-bottom: 24px; }
    .details { background-color: #f8fafc; border: 1px solid #f1f5f9; border-radius: 12px; padding: 20px; margin-bottom: 30px; }
    .detail-item { margin-bottom: 12px; font-size: 14px; }
    .detail-item:last-child { margin-bottom: 0; }
    .detail-label { font-weight: 700; color: #475569; display: block; margin-bottom: 2px; text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em; }
    .detail-value { color: #0f172a; font-weight: 600; }
    .button-container { margin: 32px 0; }
    .button { background-color: ${BRAND_COLOR}; color: #ffffff !important; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px; display: inline-block; }
    .fallback { font-size: 12px; color: ${MUTED_COLOR}; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 24px; }
    .fallback a { color: ${BRAND_COLOR}; text-decoration: none; word-break: break-all; }
    .footer { margin-top: 40px; font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 24px; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <a href="${BASE_URL}" class="brand">IntervAI</a>
      
      <h1 class="title">${title}</h1>
      
      <p class="message">
        Hi ${candidateName || 'there'},<br><br>
        ${message}
      </p>

      ${details && details.length > 0 ? `
      <div class="details">
        ${details.map(item => `
          <div class="detail-item">
            <span class="detail-label">${item.label}</span>
            <span class="detail-value">${item.value}</span>
          </div>
        `).join('')}
      </div>
      ` : ''}

      ${buttonLink && buttonText ? `
      <div class="button-container">
        <a href="${buttonLink}" class="button">${buttonText}</a>
      </div>
      
      <div class="fallback">
        If the button above doesn't work, copy and paste this URL into your browser:<br>
        <a href="${buttonLink}">${buttonLink}</a>
      </div>
      ` : ''}

      <div class="footer">
        © ${new Date().getFullYear()} Entrext Systems. All rights reserved.<br>
        ${footerText || 'You received this email because you are part of an IntervAI recruitment process.'}
      </div>
    </div>
  </div>
</body>
</html>
  `;
};

export const getScheduleUpdateEmailLayout = (options: EmailTemplateOptions) => {
  const { title, message, buttonText, buttonLink, details, candidateName, footerText } = options;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: ${TEXT_COLOR}; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; }
    .wrapper { background-color: #ffffff; padding: 20px; }
    .container { width: 100%; margin: 0; }
    .brand { font-size: 20px; font-weight: 900; color: ${BRAND_COLOR}; margin-bottom: 32px; text-decoration: none; display: block; }
    .title { font-size: 24px; font-weight: 800; color: #0f172a; margin-bottom: 16px; letter-spacing: -0.025em; }
    .message { font-size: 16px; color: ${MUTED_COLOR}; margin-bottom: 24px; }
    .details { background-color: #f0f9ff; border: 1px solid #e0f2fe; border-radius: 12px; padding: 20px; margin-bottom: 30px; }
    .detail-item { margin-bottom: 12px; font-size: 14px; }
    .detail-item:last-child { margin-bottom: 0; }
    .detail-label { font-weight: 700; color: #0369a1; display: block; margin-bottom: 2px; text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em; }
    .detail-value { color: #0f172a; font-weight: 600; }
    .button-container { margin: 32px 0; }
    .button { background-color: ${BRAND_COLOR}; color: #ffffff !important; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px; display: inline-block; }
    .footer { margin-top: 40px; font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 24px; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <a href="${BASE_URL}" class="brand">IntervAI</a>
      
      <h1 class="title">${title}</h1>
      
      <p class="message">
        Hi ${candidateName || 'there'},<br><br>
        ${message}
      </p>

      ${details && details.length > 0 ? `
      <div class="details">
        <p style="margin-top: 0; font-weight: 800; font-size: 12px; color: #0369a1; text-transform: uppercase; letter-spacing: 0.05em;">Updated Interview Details (UTC)</p>
        ${details.map(item => `
          <div class="detail-item">
            <span class="detail-label">${item.label}</span>
            <span class="detail-value">${item.value}</span>
          </div>
        `).join('')}
      </div>
      ` : ''}

      <p class="message">
        Please make sure to join the interview environment at the newly scheduled time. All timings are mentioned in <strong>UTC (Universal Coordinated Time)</strong>.
      </p>

      ${buttonLink && buttonText ? `
      <div class="button-container">
        <a href="${buttonLink}" class="button">${buttonText}</a>
      </div>
      ` : ''}

      <div class="footer">
        © ${new Date().getFullYear()} Entrext Systems. All rights reserved.<br>
        ${footerText || 'You received this email because there was a change in your scheduled interview on IntervAI.'}
      </div>
    </div>
  </div>
</body>
</html>
  `;
};
