import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

/**
 * The optional LLM layer.
 *
 * Everything the product does works without this. The deterministic engine — glossary,
 * escalation ladder, corroboration scoring, risk indices — never calls out to anything.
 * This adds the one thing rules cannot do: read several reports of one event in different
 * languages and say how their framings differ.
 */

export const LLM_MODEL = process.env.KAUTILYA_LLM_MODEL ?? 'claude-opus-5';

let _client: Anthropic | null = null;

export function llmEnabled(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export function getLlm(): Anthropic {
  if (!llmEnabled()) {
    throw new Error('LLM layer is not configured. Set ANTHROPIC_API_KEY to enable it.');
  }
  // Otherwise a zero-arg constructor: the SDK resolves ANTHROPIC_API_KEY,
  // ANTHROPIC_AUTH_TOKEN, or a stored `ant auth login` profile, in that order.
  //
  // An identity-linked key additionally has to say which workspace it is acting in, and
  // the API rejects the request outright without it. Sent as a default header so every
  // call carries it; harmless when the key is not identity-linked and the variable is
  // unset, which is why it is not required.
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
  _client ??= new Anthropic(
    workspace ? { defaultHeaders: { 'anthropic-workspace-id': workspace } } : {},
  );
  return _client;
}
