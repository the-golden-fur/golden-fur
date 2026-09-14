import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sendTransacEmail = vi.fn();

vi.mock('@getbrevo/brevo', () => {
  class BrevoClient {
    transactionalEmails = { sendTransacEmail };
  }
  class BrevoError extends Error {}
  return { BrevoClient, BrevoError };
});

async function freshSendEmail() {
  vi.resetModules();
  return (await import('./brevo.client.ts')).sendEmail;
}

describe('brevo.client sendEmail', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    sendTransacEmail.mockReset().mockResolvedValue(undefined);
    process.env.BREVO_API_KEY = 'test-key';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('parses "Display Name <addr>" into a Brevo sender object', async () => {
    process.env.BREVO_FROM_EMAIL =
      'The Golden Fur <thegoldenfur.dev@gmail.com>';
    const sendEmail = await freshSendEmail();

    await sendEmail({ to: 'c@example.com', subject: 'Hi', html: '<p>x</p>' });

    expect(sendTransacEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        sender: {
          name: 'The Golden Fur',
          email: 'thegoldenfur.dev@gmail.com',
        },
        to: [{ email: 'c@example.com' }],
        subject: 'Hi',
        htmlContent: '<p>x</p>',
      })
    );
  });

  it('treats a bare address (no display name) as the sender email', async () => {
    process.env.BREVO_FROM_EMAIL = 'noreply@goldenfur.com';
    const sendEmail = await freshSendEmail();

    await sendEmail({ to: 'c@example.com', subject: 'Hi', html: '<p>x</p>' });

    expect(sendTransacEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        sender: { name: undefined, email: 'noreply@goldenfur.com' },
      })
    );
  });

  it('throws a wrapped error when BREVO_API_KEY is missing', async () => {
    delete process.env.BREVO_API_KEY;
    const sendEmail = await freshSendEmail();

    await expect(
      sendEmail({ to: 'c@example.com', subject: 'Hi', html: '<p>x</p>' })
    ).rejects.toThrow('BREVO_API_KEY is not configured');
  });

  it('wraps a send failure as "Failed to send email via Brevo"', async () => {
    process.env.BREVO_FROM_EMAIL = 'noreply@goldenfur.com';
    sendTransacEmail.mockRejectedValue(new Error('Key not found'));
    const sendEmail = await freshSendEmail();

    await expect(
      sendEmail({ to: 'c@example.com', subject: 'Hi', html: '<p>x</p>' })
    ).rejects.toThrow('Failed to send email via Brevo: Key not found');
  });
});
