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

export function isMailConfigured(): boolean {
  const { apiKey, from } = getResendConfig();
  return !!apiKey && !!from;
}

export function assertMailConfigured(): void {
  if (!isMailConfigured()) {
    throw new Error("邮件服务未配置，暂时无法发送验证码");
  }
}

export async function sendMail(params: SendMailParams): Promise<void> {
  assertMailConfigured();
  const { apiKey, from } = getResendConfig();

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
