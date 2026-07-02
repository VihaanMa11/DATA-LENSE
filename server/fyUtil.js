// Shared FY analysis utilities used by all 3-year builder modules.
// A financial year is "partial" if it has data in fewer than 12 distinct months.
// No dependencies — pure ESM.

/**
 * Scan itemFacts and ledgerFacts to determine which FYs are complete vs partial.
 *
 * @param {object[]} itemFacts   - item-level fact rows (each must have .fy and .month)
 * @param {object[]} ledgerFacts - ledger-level fact rows (same shape)
 * @returns {{ fyList: string[], partialFys: string[], completeFys: string[], latestCompleteFy: string|null }}
 */
export function analyzeFys(itemFacts = [], ledgerFacts = []) {
  const monthsByFy = new Map();
  for (const r of [...itemFacts, ...ledgerFacts]) {
    if (!r || !r.fy || !r.month) continue;
    if (!monthsByFy.has(r.fy)) monthsByFy.set(r.fy, new Set());
    monthsByFy.get(r.fy).add(r.month);
  }
  const fyList = [...monthsByFy.keys()].sort();
  const partialFys = fyList.filter((fy) => (monthsByFy.get(fy)?.size || 0) < 12);
  const completeFys = fyList.filter((fy) => !partialFys.includes(fy));
  const latestCompleteFy = completeFys.length
    ? completeFys[completeFys.length - 1]
    : (fyList[fyList.length - 1] || null);
  return { fyList, partialFys, completeFys, latestCompleteFy };
}

/**
 * Resolve the active FY for a builder, preferring the explicitly requested FY
 * when it is valid, otherwise defaulting to the latest complete FY.
 *
 * @param {string|undefined} requestedFy  - options.fy from the caller
 * @param {string[]}         fyList       - sorted list of all known FYs
 * @param {string|null}      latestCompleteFy - result from analyzeFys
 * @returns {string|null}
 */
export function resolveCurrentFy(requestedFy, fyList, latestCompleteFy) {
  if (requestedFy && fyList.includes(requestedFy)) return requestedFy;
  return latestCompleteFy || fyList[fyList.length - 1] || null;
}
