import nodemailer from "nodemailer";

function getMailer() {
  const user = process.env.GMAIL_USER;
  const password = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, "");
  if (!user || !password) {
    throw new Error("GMAIL_USER and GMAIL_APP_PASSWORD must be configured to send verification email.");
  }
  return {
    user,
    transporter: nodemailer.createTransport({
      service: "gmail",
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
      auth: { user, pass: password }
    })
  };
}

export async function sendRegistrationOtp(email: string, code: string) {
  const { user, transporter } = getMailer();
  await transporter.sendMail({
    from: { name: "EduPrepX", address: user },
    to: email,
    subject: "EduPrepX email verification code",
    text: `Your EduPrepX verification code is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#17232d"><h2>Verify your EduPrepX email</h2><p>Enter this code to complete your student registration:</p><p style="font-size:30px;font-weight:bold;letter-spacing:8px;color:#137d66">${code}</p><p>This code expires in 10 minutes. If you did not request it, ignore this email.</p></div>`
  });
}
