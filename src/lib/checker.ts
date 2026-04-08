import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import chalk from 'chalk'
import type { CheckResult, PolicyDocument, Violation } from '../types.js'

const DEBUG_LOG = path.join(os.homedir(), '.stackguard', 'debug.log')

const SYSTEM_PROMPT = `You are a tech stack compliance checker for an engineering team.
A developer is about to send a prompt to an AI coding assistant.
Your job is to determine whether that prompt would likely cause
the AI to generate code that violates the company's engineering
guidelines.

RULES FOR FLAGGING:

Only flag prompts that explicitly name a prohibited technology,
library, pattern, or approach.
Do NOT flag vague prompts ("build a login page", "add a user
profile screen") — the developer has not specified a prohibited
approach yet, so there is nothing to compare to the policy.
DO flag prompts that name a specific library, framework, database,
service, or pattern that the policy excludes. The match is between
the prompt's explicit words and the policy's explicit words — not
between your own opinion about the named thing and the policy.

Confidence HIGH: prohibited thing is explicitly and unambiguously named.
Confidence MEDIUM: likely prohibited but slightly indirect.
Confidence LOW: ambiguous, inferential, or uncertain.

Respond ONLY with valid JSON. No preamble. No markdown fences.
Exact format required:
{
"passed": true or false,
"violations": [
{
"quote": "exact words from the developer prompt",
"rule": "the relevant guideline quoted from the policy doc",
"explanation": "one sentence explaining the conflict",
"confidence": "high" | "medium" | "low"
}
],
"suggestedRevision": "compliant rewrite of the prompt, or null if no violations",
"confidence": "overall confidence: high | medium | low"
}`

async function logDebug(content: string): Promise<void> {
  try {
    await fs.mkdir(path.dirname(DEBUG_LOG), { recursive: true })
    await fs.appendFile(DEBUG_LOG, `[${new Date().toISOString()}]\n${content}\n\n`, 'utf-8')
  } catch {
    // ignore
  }
}

function passthrough(): CheckResult {
  return {
    passed: true,
    violations: [],
    suggestedRevision: null,
    confidence: 'low',
  }
}

export function extractJson(text: string): string {
  const trimmed = text.trim()
  // Strip markdown fences if present
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) return fenced[1].trim()
  // Find first { and last }
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1)
  }
  return trimmed
}

export async function checkPrompt(
  prompt: string,
  policy: PolicyDocument,
  apiKey: string,
  model: string
): Promise<CheckResult> {
  if (!apiKey) {
    console.error(chalk.yellow('⚠  stackguard: ANTHROPIC_API_KEY not set, passing through'))
    return passthrough()
  }

  const client = new Anthropic({ apiKey })
  const userMessage = `COMPANY ENGINEERING GUIDELINES:
${policy.content}

DEVELOPER PROMPT TO CHECK:
${prompt}`

  let raw: string
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)

    const response = await client.messages.create(
      {
        model,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      },
      { signal: controller.signal }
    )
    clearTimeout(timer)

    const textBlock = response.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      await logDebug(`No text block in response: ${JSON.stringify(response)}`)
      console.error(chalk.yellow('⚠  stackguard: empty API response, passing through'))
      return passthrough()
    }
    raw = textBlock.text
  } catch (err) {
    const msg = (err as Error).message || String(err)
    await logDebug(`API/network error: ${msg}`)
    console.error(chalk.yellow(`⚠  stackguard: check failed (${msg}), passing through`))
    return passthrough()
  }

  let parsed: any
  try {
    parsed = JSON.parse(extractJson(raw))
  } catch (_err) {
    await logDebug(`Non-JSON response: ${raw}`)
    console.error(chalk.yellow('⚠  stackguard: malformed API response, passing through'))
    return passthrough()
  }

  const violations: Violation[] = Array.isArray(parsed.violations)
    ? parsed.violations.map((v: any) => ({
        quote: String(v.quote ?? ''),
        rule: String(v.rule ?? ''),
        explanation: String(v.explanation ?? ''),
        confidence: v.confidence === 'high' || v.confidence === 'medium' ? v.confidence : 'low',
      }))
    : []

  const result: CheckResult = {
    passed: parsed.passed === true,
    violations,
    suggestedRevision:
      typeof parsed.suggestedRevision === 'string' ? parsed.suggestedRevision : null,
    confidence:
      parsed.confidence === 'high' || parsed.confidence === 'medium' ? parsed.confidence : 'low',
  }

  // Low-confidence-only override
  if (
    !result.passed &&
    result.violations.length > 0 &&
    result.violations.every((v) => v.confidence === 'low')
  ) {
    result.passed = true
    result.lowConfidenceOnly = true
  }

  return result
}

/**
 * Apply the "all-low-confidence violations pass through" rule.
 * Exported for testing — see ADR-002.
 */
export function applyLowConfidenceOverride(result: CheckResult): CheckResult {
  if (
    !result.passed &&
    result.violations.length > 0 &&
    result.violations.every((v) => v.confidence === 'low')
  ) {
    return { ...result, passed: true, lowConfidenceOnly: true }
  }
  return result
}
