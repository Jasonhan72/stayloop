// Tool: validate_id_numbers
// Pure local checksum + format checks on Canadian ID numbers found in text.

import type { CapabilityTool } from '../types'
import { registerTool } from '../registry'
import { extractAndValidateIds } from '../../forensics/id-validation'

interface ValidateIdsInput {
  text: string
  applicant_surname?: string
}

const tool: CapabilityTool<ValidateIdsInput, ReturnType<typeof extractAndValidateIds>> = {
  name: 'validate_id_numbers',
  version: '1.0.0',
  description:
    'Run pure local checksum + format checks on text that may contain Canadian ID numbers. Detects SIN (Luhn checksum), Ontario driver licence (X1234-12345-12345 format + first letter must match surname), Ontario health card (4-3-3 digit), Canadian passport (2 letters + 6 digits). Zero external calls. Use AFTER extracting text from an ID document via OCR / PDF text density. ' +
    '本地校验文本中的加拿大 ID 号：SIN Luhn、安省 DL 格式（首字母 = 姓）、OHIP 4-3-3、加拿大护照格式。无网络调用。需先从 ID 文档抽取文本。',
  inputSchema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'Text content to scan (typically OCR output from an ID PDF).',
      },
      applicant_surname: {
        type: 'string',
        description: 'Applicant surname (uppercase) for Ontario DL first-letter cross-check. Optional.',
      },
    },
    required: ['text'],
  },
  needsApproval: false,
  handler: async (input) => {
    return extractAndValidateIds(input.text || '', input.applicant_surname)
  },
}

registerTool(tool)
export default tool
