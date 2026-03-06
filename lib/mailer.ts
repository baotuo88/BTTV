interface SendMailParams {
  to: string;
  subject: string;
  html: string;
  text: string;
}

function getResendConfig() {
  return {
    apiKey: process.env.RESEND_API_KEY?.trim() || "",
    from: process.env.RESEND_FROM_EMAIL?.trim() || "",
  };
}

export async function sendMail(params: SendMailParams): Promise<void> {
  const { apiKey, from } = getResendConfig();

  // 开发或未配置邮件服务时，退化为日志输出，避免阻塞功能
  if (!apiKey || !from) {
    console.log("📧 [MAIL_FALLBACK]");
    console.log(`To: ${params.to}`);
    console.log(`Subject: ${params.subject}`);
    console.log(params.text);
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`邮件发送失败: ${response.status} ${errorText}`);
  }
}
