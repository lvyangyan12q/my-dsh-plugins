/** Canonical comparison only; imported classification and original bank records stay intact.
 * 原因解释类 was verified against the original question book and independent classification.
 * No substring, suffix removal or broad attribution/explanation aliases are inferred.
 */
export function canonicalKnowledgePoint(subject: string, knowledgePoint: string): string {
  return subject === '行测-判断推理' && knowledgePoint === '原因解释类'
    ? '逻辑判断-原因解释' : knowledgePoint
}
