import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export type Classification = {
  type: 'acute' | 'environmental';
  severity: 'low' | 'medium' | 'high';
  summary: string;
};

const SYSTEM = `You classify safety reports from women in Amsterdam.
Output ONLY a single JSON object with keys: type, severity, summary.
- type: "acute" if something is happening or just happened (followed, harassed, attacked).
        "environmental" if it's a feeling about the place (dark, isolated, sketchy).
- severity: "low" | "medium" | "high"
- summary: one short sentence in past tense, third person, ≤120 chars.
        Used to ask other women: "someone reported {summary} — same?"
No prose, no markdown, just the JSON object.`;

export async function classifyReport(transcript: string): Promise<Classification> {
  const resp = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: transcript }],
  });

  const text = resp.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { text: string }).text)
    .join('')
    .trim();

  // Strip codefences if the model adds them anyway.
  const json = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const parsed = JSON.parse(json) as Classification;

  // Defensive validation — model can drift.
  if (!['acute', 'environmental'].includes(parsed.type)) parsed.type = 'environmental';
  if (!['low', 'medium', 'high'].includes(parsed.severity)) parsed.severity = 'medium';
  if (typeof parsed.summary !== 'string' || !parsed.summary.trim()) {
    parsed.summary = 'Reported feeling unsafe in this area';
  }
  if (parsed.summary.length > 200) parsed.summary = parsed.summary.slice(0, 200);

  return parsed;
}
