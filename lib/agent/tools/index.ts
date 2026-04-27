// -----------------------------------------------------------------------------
// Tool barrel — importing this side-effects all tool registrations.
//
// Import this once at the top of the agent loop / route entry so every
// tool is in the registry by the time we look anything up.
// -----------------------------------------------------------------------------

import './classify-files'
import './run-pdf-forensics'
import './lookup-corp-registry'
import './lookup-bn'
import './validate-id-numbers'
import './search-canlii'
import './search-ontario-portal'
import './compute-screening-score'

import { allRegisteredToolNames } from '../registry'

/** Returns the names of all tools registered after this barrel imports. */
export function listAllTools(): string[] {
  return allRegisteredToolNames()
}
