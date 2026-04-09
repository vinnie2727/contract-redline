import type { ClauseFamily } from "@/lib/types/repository";

const RULES: { family: ClauseFamily; re: RegExp }[] = [
  { family: "Payment Terms", re: /payment|net\s*\d+|invoice|milestone|cash\s*flow/i },
  {
    family: "Warranty Duration",
    re: /warranty.*(term|duration|month|year|period)|months?\s+from|years?\s+from/i,
  },
  {
    family: "Limitation of Liability",
    re: /liabilit|consequential|cap\b|limitation\s+of/i,
  },
  { family: "Liquidated Damages", re: /liquidated|\blds?\b|ld\b|penalt/i },
  { family: "Indemnity Scope", re: /indemn/i },
  {
    family: "Termination for Convenience",
    re: /termination.*convenience|without\s+cause|for\s+convenience|tfc\b/i,
  },
  {
    family: "Delivery / Delay Penalties",
    re: /deliver|delay|schedule|late\s+delivery|time\s+of\s+the\s+essence/i,
  },
  { family: "Price Escalation", re: /escalat|price\s+adjust|inflation|tariff|index/i },
  { family: "Governing Law", re: /governing\s+law|jurisdiction|venue|forum/i },
  {
    family: "Warranty Start Trigger",
    re: /warranty\s+start|commence|energization|acceptance|delivery\s+trigger/i,
  },
];

export function mapIssueTextToClauseFamily(
  primaryCategory: string,
  clauseTitle: string,
  problem: string
): ClauseFamily | null {
  const blob = `${primaryCategory} ${clauseTitle} ${problem}`.toLowerCase();
  for (const { family, re } of RULES) {
    if (re.test(blob)) return family;
  }
  return null;
}
