// Segment MIS — 3-year product segment cockpit.
// Reuses the verified item-group aggregation (buildItemGroups) and adds a
// gender-age rollup (Kids / Ladies / Gents / Boys / Girls / Premium) plus
// segment-oriented KPIs. Group = itemGroup (parent). Pure ESM, no HTTP/React.

import { buildItemGroups } from "./itemGroupsBuilder.js";

const round1 = (v) => Math.round(v * 10) / 10;

// Classify a parent item group into a gender-age (or premium) segment by its name.
export function genderAgeOf(group) {
  const g = String(group || "").toUpperCase();
  // Detect gender-age anywhere in the name so brand-prefixed sub-groups
  // (e.g. "WOW KIDS-F", "LADIES-AIRHAWK") classify correctly. Girls before Kids
  // so "GIRLS" is not swallowed. Premium is reserved for explicit premium brands.
  if (g.includes("LADIES")) return "Ladies";
  if (g.includes("GIRLS") || g.includes("GIRL")) return "Girls";
  if (g.includes("BOYS") || g.includes("BOY")) return "Boys";
  if (g.includes("KIDS") || g.includes("KID")) return "Kids";
  if (g.includes("GENTS") || g.includes("GENT")) return "Gents";
  if (g.includes("TOPTRACK") || g.includes("PREMIUM")) return "Premium";
  return "Other";
}

const GENDER_ORDER = ["Kids", "Ladies", "Gents", "Boys", "Girls", "Premium", "Other"];

/**
 * @param {object} dashData - { itemFacts, ledgerFacts }
 * @param {object} [options] - { fy?: string }
 */
export function buildSegmentMis(dashData, options = {}) {
  // The source itemGroup taxonomy is inconsistent across years (FY 2024-25 uses
  // parent groups like KIDS-PU-F; later years use supplier sub-groups like
  // LADIES-AIRHAWK). Grouping by the gender-age SEGMENT collapses both taxonomies
  // to a stable dimension, so 3-year trend and YoY stay valid. We remap each
  // fact's itemGroup to its gender-age segment, then reuse the item-group engine.
  const facts = Array.isArray(dashData?.itemFacts) ? dashData.itemFacts : [];
  const remapped = { ...dashData, itemFacts: facts.map((f) => ({ ...f, itemGroup: genderAgeOf(f.itemGroup) })) };
  const ig = buildItemGroups(remapped, options);
  const { currentFy, prevFy, table } = ig;

  // ---- Gender-age mix (current FY net share) ----
  const gaNet = new Map();
  let totalNet = 0;
  for (const r of table) {
    const net = r.perFy[currentFy] || 0;
    if (net <= 0) continue;
    gaNet.set(r.group, (gaNet.get(r.group) || 0) + net); // r.group is already the segment
    totalNet += net;
  }
  const genderAgeMix = GENDER_ORDER
    .filter((c) => (gaNet.get(c) || 0) > 0)
    .map((c) => ({ segment: c, net: Math.round(gaNet.get(c)), pct: totalNet > 0 ? round1((gaNet.get(c) / totalNet) * 100) : 0 }));

  // ---- Segment-oriented KPIs ----
  const withYoy = table.filter((r) => r.yoyPct != null);
  const fastestGrowing = [...withYoy].sort((a, b) => b.yoyPct - a.yoyPct)[0] || null;
  const declining = [...withYoy].filter((r) => r.yoyPct < 0).sort((a, b) => a.yoyPct - b.yoyPct)[0] || null;
  const totalPairs = table.reduce((s, r) => s + (r.pairsCur || 0), 0);

  const kpis = {
    totalSegments: ig.kpis.activeGroups,
    topSegment: ig.kpis.topGroup,
    fastestGrowing: fastestGrowing ? { name: fastestGrowing.group, yoyPct: fastestGrowing.yoyPct, cur: fastestGrowing.perFy[currentFy] || 0 } : null,
    declining: declining ? { name: declining.group, yoyPct: declining.yoyPct, avgPrice: declining.avgPrice } : null,
    highestAvgPrice: ig.kpis.highestAvgPrice,
    totalPairs: { cur: totalPairs },
  };

  // ---- Season split (H1/H2) for the top 6 groups, grouped bars ----
  const top6 = table.slice(0, 6).map((r) => r.group);
  const seasonSplit = {
    groups: top6,
    h1: top6.map((g) => table.find((r) => r.group === g)?.h1Pct || 0),
    h2: top6.map((g) => { const r = table.find((x) => x.group === g); return r ? round1(100 - r.h1Pct) : 0; }),
  };

  // Detail table gets H2% added
  const segTable = table.map((r) => ({ ...r, h2Pct: round1(100 - (r.h1Pct || 0)) }));

  return {
    fy: currentFy,
    fyList: ig.fyList,
    currentFy,
    prevFy,
    partialFys: ig.partialFys,
    kpis,
    alerts: ig.alerts,
    segTrend: ig.groupTrend,
    genderAgeMix,
    momTop6: ig.momTop6,
    bubble: ig.bubble,
    yoy: ig.yoy,
    seasonSplit,
    priceTrend: ig.priceTrend,
    table: segTable,
  };
}
