// Product Analysis — interactive item-group + SKU cockpit with client-side slicers.
// Per group: net sales, pairs, SKUs, buyers, gross margin (sales - purchase cost),
// sell-through (out qty / in qty), H1 share, return rate, slow-mover count.
// Pure ESM, no HTTP/React.

import { analyzeFys, resolveCurrentFy } from "./fyUtil.js";

const num = (v) => Number(v) || 0;
const round1 = (v) => Math.round(v * 10) / 10;

function fiscalYearMonths(fy) {
  const match = String(fy || "").match(/FY\s*(\d{4})\s*-\s*(\d{2})/i);
  if (!match) return [];
  const startYear = Number(match[1]);
  return [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3].map((month) => {
    const year = month >= 4 ? startYear : startYear + 1;
    return `${year}-${String(month).padStart(2, "0")}`;
  });
}
function sortFys(a) { return [...a].sort((x, y) => Number((x.match(/(\d{4})/) || [])[1] || 0) - Number((y.match(/(\d{4})/) || [])[1] || 0)); }
const H1_MONTHS = new Set([4, 5, 6, 7, 8, 9]);
function mrpFromName(name) { const m = String(name || "").match(/MRP[-\s]*(\d+)/i); return m ? Number(m[1]) : 0; }

export function buildProductAnalysis(dashData, options = {}) {
  const itemFacts = Array.isArray(dashData?.itemFacts) ? dashData.itemFacts : [];
  const ledgerFacts = Array.isArray(dashData?.ledgerFacts) ? dashData.ledgerFacts : [];

  const fySet = new Set();
  for (const r of itemFacts) if ((r.tx === "Sales" || r.tx === "Sales Return") && r.fy) fySet.add(r.fy);
  const fyList = sortFys([...fySet]);
  if (fyList.length === 0) return emptyResult({ fy: options.fy || null });

  const { partialFys, latestCompleteFy } = analyzeFys(itemFacts, ledgerFacts);
  const currentFy = resolveCurrentFy(options.fy, fyList, latestCompleteFy);

  // ---- Per-group aggregation ----
  const gmap = new Map();
  const ensure = (g) => { let e = gmap.get(g); if (!e) { e = { net: 0, cost: 0, outQty: 0, inQty: 0, skus: new Set(), buyers: new Set(), h1: 0, h2: 0, gross: 0, returns: 0, lastSaleBySku: new Map() }; gmap.set(g, e); } return e; };
  for (const r of itemFacts) {
    if (r.fy !== currentFy) continue;
    const party = String(r.party || "");
    if (party.toLowerCase() === "cash") continue;
    const g = r.itemGroup || "Unmapped";
    const e = ensure(g);
    const amt = num(r.amount), q = num(r.qty);
    const mn = Number(String(r.month || "").split("-")[1]) || 0;
    if (r.tx === "Sales") { e.net += amt; e.gross += amt; e.outQty += q; if (r.item) e.skus.add(r.item); if (party) e.buyers.add(party); if (H1_MONTHS.has(mn)) e.h1 += amt; else e.h2 += amt; if (r.item && r.date) { const prev = e.lastSaleBySku.get(r.item); if (!prev || r.date > prev) e.lastSaleBySku.set(r.item, r.date); } }
    else if (r.tx === "Sales Return") { e.net -= amt; e.returns += amt; e.inQty += q; }
    else if (r.tx === "Purchase") { e.cost += amt; e.inQty += q; }
    else if (r.tx === "Purchase Return") { e.cost -= amt; e.outQty += q; }
  }

  // as-of date for slow movers = latest sale overall
  let asOf = null;
  for (const [, e] of gmap) for (const [, d] of e.lastSaleBySku) if (!asOf || d > asOf) asOf = d;
  const daysSince = (d) => (d && asOf ? Math.round((new Date(asOf) - new Date(d)) / 86400000) : Infinity);

  const totalNet = [...gmap.values()].reduce((s, e) => s + Math.max(0, e.net), 0);
  const totalQty = [...gmap.values()].reduce((s, e) => s + e.outQty, 0);

  const groups = [...gmap.entries()].map(([g, e]) => {
    const slow = [...e.lastSaleBySku.values()].filter((d) => daysSince(d) > 90).length;
    const st = e.inQty > 0 ? round1((e.outQty / e.inQty) * 100) : null;
    const margin = e.net > 0 ? round1(((e.net - e.cost) / e.net) * 100) : null;
    const total = e.h1 + e.h2;
    return {
      group: g, sales: Math.round(e.net), qty: Math.round(e.outQty),
      skus: e.skus.size, buyers: e.buyers.size,
      margin, st, avgPrice: e.outQty > 0 ? Math.round(e.net / e.outQty) : 0,
      h1Pct: total > 0 ? round1((e.h1 / total) * 100) : 0,
      retPct: e.gross > 0 ? round1((e.returns / e.gross) * 100) : 0,
      slow, share: totalNet > 0 ? round1((e.net / totalNet) * 100) : 0,
      volPct: totalQty > 0 ? round1((e.outQty / totalQty) * 100) : 0,
      revPct: totalNet > 0 ? round1((e.net / totalNet) * 100) : 0,
    };
  }).filter((g) => g.sales > 0).sort((a, b) => b.sales - a.sales);

  // ---- SKUs ----
  const smap = new Map();
  for (const r of itemFacts) {
    if (r.fy !== currentFy || (r.tx !== "Sales" && r.tx !== "Sales Return")) continue;
    if (String(r.party || "").toLowerCase() === "cash") continue;
    const sku = r.item; if (!sku) continue;
    let e = smap.get(sku); if (!e) { e = { name: sku, group: r.itemGroup, s: 0, qty: 0, buyers: new Set(), bills: new Set(), h1: 0, h2: 0, mrp: mrpFromName(sku) }; smap.set(sku, e); }
    const amt = num(r.amount), q = num(r.qty), mn = Number(String(r.month || "").split("-")[1]) || 0;
    if (r.tx === "Sales") { e.s += amt; e.qty += q; if (r.party) e.buyers.add(r.party); if (r.voucher) e.bills.add(r.voucher); if (H1_MONTHS.has(mn)) e.h1 += amt; else e.h2 += amt; }
    else e.s -= amt;
  }
  const skus = [...smap.values()].map((e) => { const t = e.h1 + e.h2; return { name: e.name, group: e.group, sales: Math.round(e.s), qty: Math.round(e.qty), avgPrice: e.qty > 0 ? Math.round(e.s / e.qty) : 0, buyers: e.buyers.size, bills: e.bills.size, h1Pct: t > 0 ? round1((e.h1 / t) * 100) : 0, share: totalNet > 0 ? round1((e.s / totalNet) * 100) : 0, mrp: e.mrp }; }).filter((s) => s.sales > 0).sort((a, b) => b.sales - a.sales).slice(0, 60);

  // ---- MRP bands ----
  const bands = [{ label: "Budget <₹150", lo: 0, hi: 150 }, { label: "Value ₹150-200", lo: 150, hi: 200 }, { label: "Core ₹200-250", lo: 200, hi: 250 }, { label: "Core+ ₹250-300", lo: 250, hi: 300 }, { label: "Premium ₹300+", lo: 300, hi: Infinity }];
  const mrpBands = bands.map((b) => { let rev = 0, n = 0; for (const s of smap.values()) { const net = s.s; if (net <= 0) continue; if (s.mrp >= b.lo && s.mrp < b.hi) { rev += net; n++; } } return { label: b.label, revenue: Math.round(rev), skus: n, pct: totalNet > 0 ? round1((rev / totalNet) * 100) : 0 }; });

  // ---- 3yr group trend (top 8) ----
  const groupNetFy = (g, fy) => { let s = 0; for (const r of itemFacts) { if (r.fy !== fy || r.itemGroup !== g) continue; if (String(r.party || "").toLowerCase() === "cash") continue; if (r.tx === "Sales") s += num(r.amount); else if (r.tx === "Sales Return") s -= num(r.amount); } return s; };
  const top8 = groups.slice(0, 8).map((g) => g.group);
  const groupTrend = { groups: top8, series: fyList.map((fy) => ({ name: fy, values: top8.map((g) => Math.round(groupNetFy(g, fy))) })) };

  // ---- KPIs ----
  const top = groups[0] || null;
  // Only material groups (>= 2% share) for margin KPIs so tiny groups with no recorded
  // purchase cost do not show a spurious 100% margin.
  const materialG = groups.filter((g) => g.margin != null && g.share >= 2);
  const bestMargin = [...materialG].sort((a, b) => b.margin - a.margin)[0] || null;
  const totalSkus = groups.reduce((s, g) => s + g.skus, 0);
  const totalSlow = groups.reduce((s, g) => s + g.slow, 0);
  const kpis = {
    totalRevenue: { cur: Math.round(totalNet), fy: currentFy },
    totalPairs: { cur: Math.round(totalQty), avgPrice: totalQty > 0 ? Math.round(totalNet / totalQty) : 0 },
    activeSkus: { cur: totalSkus, slow: totalSlow },
    topGroup: top ? { name: top.group, sales: top.sales, share: top.share, st: top.st } : null,
    bestMargin: bestMargin ? { name: bestMargin.group, margin: bestMargin.margin } : null,
    worstMargin: [...materialG].sort((a, b) => a.margin - b.margin)[0] || null,
  };

  const alerts = [];
  const loss = materialG.filter((g) => g.margin < 0).sort((a, b) => a.margin - b.margin)[0];
  if (loss) alerts.push({ tone: "red", title: `${loss.group} sells at a loss (${loss.margin}% margin)`, body: `Sales ${bigMoney(loss.sales)} below purchase cost. Check opening stock cost, returns or pricing.` });
  const h2heavy = groups.filter((g) => g.sales >= totalNet * 0.02 && g.h1Pct <= 25).sort((a, b) => a.h1Pct - b.h1Pct)[0];
  if (h2heavy) alerts.push({ tone: "amber", title: `${h2heavy.group} is ${Math.round(100 - h2heavy.h1Pct)}% H2`, body: `Needs September stocking. Late purchase misses the season.` });
  if (kpis.bestMargin) alerts.push({ tone: "green", title: `${kpis.bestMargin.name} best margin at ${kpis.bestMargin.margin}%`, body: `Highest gross margin group. Protect and grow it.` });
  if (totalSlow) alerts.push({ tone: "blue", title: `${totalSlow} slow-mover SKUs`, body: `No sale in the last 90 days across groups. Clearance candidates.` });
  if (!alerts.length) alerts.push({ tone: "blue", title: "Product mix healthy", body: "No margin or slow-mover concerns." });

  return { fy: currentFy, fyList, currentFy, partialFys, kpis, alerts, groups, skus, mrpBands, groupTrend };
}

function bigMoney(v) { const n = Math.round(num(v)); if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(1)} Cr`; if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`; return `₹${n.toLocaleString("en-IN")}`; }
function emptyResult({ fy }) {
  return { fy, fyList: [], currentFy: fy, partialFys: [], kpis: { totalRevenue: { cur: 0, fy }, totalPairs: { cur: 0, avgPrice: 0 }, activeSkus: { cur: 0, slow: 0 }, topGroup: null, bestMargin: null, worstMargin: null }, alerts: [], groups: [], skus: [], mrpBands: [], groupTrend: { groups: [], series: [] } };
}
