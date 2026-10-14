/**
 * Desktop stub for emailAutomation.ts
 *
 * All email functions are no-ops in desktop mode.
 * The desktop app has no email infrastructure — users receive their
 * completed PDFs directly via the in-app download button.
 */

// ─── Webhook / event triggers ───────────────────────────────────────────────
export async function handleWebhookEvent(_payload: any): Promise<void> {
  // no-op in desktop
}

export async function triggerEmailByEvent(
  _event: string,
  _email: string,
  _data?: any
): Promise<void> {
  // no-op in desktop
}

export async function sendEmailDirect(_opts: {
  to: string;
  subject?: string;
  html?: string;
  text?: string;
  templateId?: string;
  data?: any;
}): Promise<void> {
  // no-op in desktop
}

// ─── Stats / management ─────────────────────────────────────────────────────
export async function getEmailStats(): Promise<any> {
  return { enabled: false, desktop: true };
}

export async function getTemplates(): Promise<any[]> {
  return [];
}

export async function createTemplate(_data: any): Promise<any> {
  return null;
}

export async function updateTemplate(_id: string, _updates: any): Promise<any> {
  return null;
}

export async function deleteTemplate(_id: string): Promise<void> {
  // no-op
}

// ─── Sequences ───────────────────────────────────────────────────────────────
export async function createSequence(_data: any): Promise<any> {
  return null;
}

export async function addSequenceStep(_data: any): Promise<any> {
  return null;
}

export async function getSequenceWithSteps(_id: string): Promise<any> {
  return null;
}

export async function enrollUserInSequence(
  _userId: string,
  _sequenceId: string
): Promise<void> {
  // no-op
}

// ─── Queue processor ─────────────────────────────────────────────────────────
export async function processEmailQueue(): Promise<any> {
  return { processed: 0, desktop: true };
}

export function isEmailAutomationEnabled(): boolean {
  return false;
}

export function startQueueProcessor(_intervalMs?: number): void {
  // no-op in desktop — no email queue to process
}
