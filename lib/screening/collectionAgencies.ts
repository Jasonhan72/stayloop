// Canadian collection agencies and debt buyers as they print on bureau
// files. An inquiry or tradeline from one of these means a creditor has
// handed a debt over — even when no collection appears as a tradeline
// (2026-09-12: "MJR CAPITAL SERVICES INC." three times under non-credit
// inquiries on a file with no collections section entries).
const AGENCIES = [
  /\bMJR\s+CAPITAL/i, /\bCBV\s+COLLECTION/i, /\bGLOBAL\s+CREDIT\s*(?:&|AND)?\s*COLLECTION/i, /\bMETCREDIT\b/i,
  /\bFINANCIAL\s+DEBT\s+RECOVERY/i, /\bALLIED\s+INTERNATIONAL\s+CREDIT/i, /\bD\s*&\s*A\s+COLLECTION/i,
  /\bCREDIT\s+BUREAU\s+(?:OF\s+CANADA\s+)?COLLECTIONS?/i, /\bPRA\s+GROUP/i, /\bCCS\b.*COLLECT/i, /\bCONTACT\s+RESOURCE\s+SERVICES/i,
  /\bTOTAL\s+CREDIT\s+RECOVERY/i, /\bNCB\s+INC/i, /\bPARTNERS\s+IN\s+CREDIT/i, /\bBILL\s+GOSLING/i, /\bCOLLECTCENTS?/i,
  /\bGATESTONE\b/i, /\bCREDITSOLUTIONS?\b/i, /\bCOLLECTION\s+(?:AGENCY|SERVICES?|BUREAU)/i, /\bRECOVERY\s+SERVICES?\b/i,
  /\bPORTFOLIO\s+RECOVERY/i, /\bMIDLAND\s+CREDIT/i, /\bCANADIAN\s+BONDED\s+CREDIT/i, /\bMETROPOLITAN\s+CREDIT/i,
  /\bEOS\s+CANADA/i, /\bCOLLECTION\b/i,
]
export function isCollectionAgency(name: string | null | undefined): boolean {
  const n = (name || '').trim()
  return n.length > 2 && AGENCIES.some(re => re.test(n))
}
