// -----------------------------------------------------------------------------
// Anthropic SDK adapter
// -----------------------------------------------------------------------------
// Convert our framework-agnostic CapabilityTool definitions into the schema
// shape that @anthropic-ai/sdk's tool_use API expects. Kept isolated here so
// switching SDK versions or providers doesn't ripple through tool files.
// -----------------------------------------------------------------------------

import type { CapabilityTool } from './types'

/**
 * Anthropic Messages API tool definition shape (as of API version 2023-06-01).
 * https://docs.anthropic.com/en/docs/build-with-claude/tool-use/overview
 */
export interface AnthropicToolDef {
  name: string
  description: string
  input_schema: object
}

/**
 * Convert a single CapabilityTool to Anthropic's tool definition format.
 * Description gets a version suffix so model can distinguish behavior across
 * tool revisions (rare but possible).
 */
export function toAnthropicTool(tool: CapabilityTool): AnthropicToolDef {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  }
}

export function toAnthropicTools(tools: CapabilityTool[]): AnthropicToolDef[] {
  return tools.map(toAnthropicTool)
}
