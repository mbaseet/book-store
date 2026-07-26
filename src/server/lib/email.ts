import type { Bindings } from '../types'

export async function sendPasswordResetEmail(
  env: Bindings,
  { recipient, resetUrl }: { recipient: string; resetUrl: string },
) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    if (env.ENVIRONMENT === 'development') {
      console.info(`Password reset link for ${recipient}: ${resetUrl}`)
      return
    }
    throw new Error('Password reset email is not configured.')
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [recipient],
      subject: 'Reset your password',
      text: `Use this link to reset your password. It expires in 30 minutes: ${resetUrl}`,
    }),
  })

  if (!response.ok) {
    throw new Error(`Password reset email failed with status ${response.status}.`)
  }
}
