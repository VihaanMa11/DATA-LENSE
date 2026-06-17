from __future__ import annotations

import csv
import json
import re
from pathlib import Path

import pandas as pd


BASE = Path(r"C:\Users\hp\Downloads\DataLense\csv")
OUT_DIR = Path(r"C:\Users\hp\Documents\DataLence\outputs")
OUT_FILE = OUT_DIR / "MLH_Gobongo_MIS_Dashboard.html"

ITEM_FACT_FILES = {
    "Sales": "Sales25.csv",
    "Sales Return": "SalesReturn25.csv",
    "Purchase": "Purchase25.csv",
    "Purchase Return": "PurchaseReturn25.csv",
}

LEDGER_FILES = {
    "Receipt": "receipt25.csv",
    "Payment": "payment25.csv",
    "Credit Note": "CrNote25.csv",
    "Debit Note": "DrNote25.csv",
    "Journal": "JournalRegister25.csv",
}


def find_header(path: Path) -> int:
    lines = path.read_text(encoding="utf-8-sig", errors="replace").splitlines()
    marker_tokens = [
        "bill date",
        "voucher no",
        "invoice date",
        "doc. no",
        "item name",
        "account name",
        "ledger name",
    ]
    for idx, line in enumerate(lines[:40]):
        low = line.lower()
        if any(token in low for token in marker_tokens):
            try:
                row = next(csv.reader([line]))
            except csv.Error:
                row = [line]
            if len(row) >= 3:
                return idx
    return max(
        range(min(30, len(lines))),
        key=lambda idx: len(next(csv.reader([lines[idx]]))),
    )


def read_csv_table(filename: str) -> pd.DataFrame:
    path = BASE / filename
    df = pd.read_csv(
        path,
        dtype=str,
        encoding="utf-8-sig",
        keep_default_na=False,
        skiprows=find_header(path),
    )
    df.columns = [str(col).strip() for col in df.columns]
    blank_rows = df.astype(str).apply(
        lambda row: all(str(value).strip() == "" for value in row), axis=1
    )
    return df.loc[~blank_rows].copy()


def clean_master(filename: str) -> pd.DataFrame:
    raw = pd.read_excel(BASE / filename, header=None, dtype=str, keep_default_na=False)
    headers = [str(value).strip() for value in raw.iloc[1].tolist()]
    df = raw.iloc[2:].copy()
    df.columns = headers
    blank_rows = df.astype(str).apply(
        lambda row: all(str(value).strip() == "" for value in row), axis=1
    )
    return df.loc[~blank_rows].copy()


def as_number(value: object) -> float:
    text = str(value).strip()
    if not text:
        return 0.0
    negative = text.startswith("(") and text.endswith(")")
    text = (
        text.replace(",", "")
        .replace("₹", "")
        .replace("$", "")
        .replace("(", "")
        .replace(")", "")
    )
    try:
        parsed = float(text)
    except ValueError:
        return 0.0
    return -parsed if negative else parsed


def clean_text(value: object, fallback: str = "Unmapped") -> str:
    text = str(value).strip()
    return text if text else fallback


def iso_date(value: object) -> str:
    parsed = pd.to_datetime(value, dayfirst=True, errors="coerce")
    if pd.isna(parsed):
        return ""
    return parsed.strftime("%Y-%m-%d")


def month_key(value: str) -> str:
    if not value:
        return "Undated"
    parsed = pd.to_datetime(value, errors="coerce")
    if pd.isna(parsed):
        return "Undated"
    return parsed.strftime("%Y-%m")


def short_item_family(name: str) -> str:
    cleaned = re.sub(r"\s+", " ", name.strip())
    cleaned = re.sub(r"\s*MRP[- ]?\d+.*$", "", cleaned, flags=re.IGNORECASE)
    return cleaned[:44] if cleaned else "Unmapped"


def build_data() -> dict:
    items = clean_master("Itemmaster.xlsx")
    accounts = clean_master("accmasterxlsx.xlsx")

    item_map = items.set_index("Name").to_dict("index")
    account_map = accounts.set_index("Name").to_dict("index")

    item_facts: list[dict] = []
    ledger_facts: list[dict] = []
    source_profile: list[dict] = []

    for tx_type, filename in ITEM_FACT_FILES.items():
        df = read_csv_table(filename)
        total_rows = df.apply(
            lambda row: any(str(value).strip().lower() == "total" for value in row),
            axis=1,
        )
        df = df.loc[~total_rows].copy()

        for col in [
            "Vch. Series",
            "Bill Date",
            "Bill No.",
            "Party Name",
            "Final Amt",
            "Transport",
            "Distance",
        ]:
            df[f"{col} Source"] = df[col].astype(str).str.strip() != ""
            df[col] = df[col].replace("", pd.NA).ffill().fillna("")

        for _, row in df.iterrows():
            item_name = clean_text(row.get("Item Name", ""))
            party_name = clean_text(row.get("Party Name", ""))
            item_dim = item_map.get(item_name, {})
            account_dim = account_map.get(party_name, {})
            date = iso_date(row.get("Bill Date", ""))
            is_header = bool(row.get("Bill No. Source", False))
            item_facts.append(
                {
                    "tx": tx_type,
                    "date": date,
                    "month": month_key(date),
                    "voucher": clean_text(row.get("Bill No.", ""), "No Voucher"),
                    "vchSeries": clean_text(row.get("Vch. Series", ""), "Unspecified"),
                    "party": party_name,
                    "accountGroup": clean_text(account_dim.get("Group Name", "")),
                    "state": clean_text(account_dim.get("State", "")),
                    "station": clean_text(account_dim.get("Station", "")),
                    "item": item_name,
                    "itemFamily": short_item_family(item_name),
                    "itemGroup": clean_text(item_dim.get("Group Name", "")),
                    "mainUnit": clean_text(item_dim.get("Main Unit", "")),
                    "altUnit": clean_text(item_dim.get("Alt. Unit", "")),
                    "transport": clean_text(row.get("Transport", ""), "Unspecified"),
                    "distance": as_number(row.get("Distance", "")),
                    "price": as_number(row.get("Price", "")),
                    "qty": as_number(row.get("Main Qt", "")),
                    "altQty": as_number(row.get("Billed Quantity Alt", "")),
                    "amount": as_number(row.get("Amount", "")),
                    "finalAmount": as_number(row.get("Final Amt", "")) if is_header else 0,
                    "isHeader": is_header,
                }
            )

        header_count = int(df["Bill No. Source"].sum())
        source_profile.append(
            {
                "file": filename,
                "role": tx_type,
                "rows": int(len(df)),
                "vouchers": header_count,
                "columns": list(df.columns[:12]),
            }
        )

    for tx_type, filename in LEDGER_FILES.items():
        df = read_csv_table(filename)
        total_rows = df.apply(
            lambda row: any(str(value).strip().lower() == "total" for value in row),
            axis=1,
        )
        df = df.loc[~total_rows].copy()
        for col in ["Bill Date", "Bill No."]:
            df[f"{col} Source"] = df[col].astype(str).str.strip() != ""
            df[col] = df[col].replace("", pd.NA).ffill().fillna("")

        for _, row in df.iterrows():
            account_name = clean_text(row.get("Account Name", ""))
            account_dim = account_map.get(account_name, {})
            date = iso_date(row.get("Bill Date", ""))
            is_header = bool(row.get("Bill Date Source", False))
            debit = as_number(row.get("Debit Amount", ""))
            credit = as_number(row.get("Credit Amount", ""))
            if tx_type == "Receipt":
                business_amount = debit if is_header else 0
            elif tx_type == "Payment":
                business_amount = credit if is_header else 0
            elif tx_type in {"Credit Note", "Debit Note"}:
                business_amount = debit + credit if is_header else 0
            else:
                business_amount = max(debit, credit)
            ledger_facts.append(
                {
                    "tx": tx_type,
                    "date": date,
                    "month": month_key(date),
                    "voucher": clean_text(row.get("Bill No.", ""), "No Voucher"),
                    "account": account_name,
                    "accountGroup": clean_text(account_dim.get("Group Name", "")),
                    "state": clean_text(account_dim.get("State", "")),
                    "station": clean_text(account_dim.get("Station", "")),
                    "debit": debit,
                    "credit": credit,
                    "businessAmount": business_amount,
                    "isHeader": is_header,
                }
            )

        source_profile.append(
            {
                "file": filename,
                "role": tx_type,
                "rows": int(len(df)),
                "vouchers": int(df["Bill Date Source"].sum()),
                "columns": list(df.columns[:5]),
            }
        )

    return {
        "generatedAt": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M:%S"),
        "company": "MLH GOBONGO PVT. LTD.",
        "periodLabel": "FY 2025-26",
        "itemFacts": item_facts,
        "ledgerFacts": ledger_facts,
        "sourceProfile": source_profile,
        "masters": {
            "items": int(len(items)),
            "accounts": int(len(accounts)),
            "itemFields": list(items.columns),
            "accountFields": list(accounts.columns),
        },
    }


HTML_TEMPLATE = r"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>MLH Gobongo - MIS Dashboard</title>
  <style>
    :root{
      --bg:#070b14;--panel:#0d1321;--panel2:#121929;--panel3:#182030;--line:#1e293b;
      --line2:#2d3b55;--text:#f1f5f9;--muted:#94a3b8;--faint:#64748b;
      --orange:#f97316;--orange2:#fb923c;--green:#22c55e;--blue:#3b82f6;
      --yellow:#eab308;--red:#ef4444;--purple:#a855f7;--cyan:#06b6d4;
      --radius:10px;--sidebar:204px;--topbar:58px;
    }
    *{box-sizing:border-box}
    html{scroll-behavior:smooth}
    body{margin:0;background:var(--bg);color:var(--text);font-family:Inter,Segoe UI,Arial,sans-serif}
    button,input,select{font:inherit}
    .topbar{height:var(--topbar);position:sticky;top:0;z-index:20;background:var(--panel);border-bottom:2px solid var(--orange);display:flex;align-items:center;justify-content:space-between;padding:0 16px;box-shadow:0 12px 34px rgba(0,0,0,.28)}
    .brand{display:flex;align-items:center;gap:10px;min-width:260px}
    .logo{width:34px;height:34px;border-radius:9px;background:linear-gradient(135deg,var(--orange),#ea580c);display:grid;place-items:center;font-weight:900;letter-spacing:.02em}
    .brand-title{font-size:13px;font-weight:800;line-height:1}
    .brand-sub{font-size:8px;text-transform:uppercase;letter-spacing:1.4px;color:var(--faint);margin-top:4px}
    .top-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}
    .pill{border:1px solid var(--line);background:var(--panel2);color:var(--muted);border-radius:999px;padding:5px 10px;font-size:10px;font-weight:700;white-space:nowrap}
    .pill.live{color:var(--green);background:rgba(34,197,94,.08);border-color:rgba(34,197,94,.25)}
    .layout{display:flex;min-height:calc(100vh - var(--topbar))}
    .sidebar{width:var(--sidebar);position:sticky;top:var(--topbar);height:calc(100vh - var(--topbar));overflow:auto;background:var(--panel);border-right:1px solid var(--line);flex:0 0 auto;padding:10px 0}
    .nav-title{padding:10px 14px 5px;font-size:8px;color:var(--faint);letter-spacing:2px;text-transform:uppercase;font-weight:800}
    .nav-btn{width:calc(100% - 8px);margin:1px 8px 1px 0;border:0;border-left:2px solid transparent;background:transparent;color:var(--muted);display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:0 8px 8px 0;font-size:11px;font-weight:650;text-align:left;cursor:pointer}
    .nav-btn:hover,.nav-btn.active{background:rgba(249,115,22,.13);color:var(--orange);border-left-color:var(--orange)}
    .nav-ico{width:18px;height:18px;border-radius:5px;display:grid;place-items:center;font-size:9px;font-weight:900;background:var(--panel3);color:var(--muted)}
    .nav-btn.active .nav-ico{background:var(--orange);color:white}
    .main{flex:1;min-width:0;padding:12px 15px 28px}
    .periodbar,.downloadbar{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:8px 12px;margin-bottom:10px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
    .bar-label{font-size:8px;color:var(--faint);font-weight:850;text-transform:uppercase;letter-spacing:1.5px;margin-right:2px}
    .period{border:1px solid var(--line);background:var(--panel2);color:var(--muted);border-radius:999px;padding:5px 10px;font-size:10px;font-weight:750;cursor:pointer}
    .period:hover,.period.active{border-color:var(--orange);background:var(--orange);color:white}
    .filter-grid{display:grid;grid-template-columns:repeat(5,minmax(140px,1fr));gap:8px;width:100%}
    .filter-grid label{display:grid;gap:3px;font-size:8px;color:var(--faint);font-weight:800;text-transform:uppercase;letter-spacing:.8px}
    select,input{width:100%;background:var(--panel2);border:1px solid var(--line);border-radius:8px;color:var(--text);padding:7px 8px;font-size:11px;outline:none}
    .section{display:none;animation:fade .16s ease-out}
    .section.active{display:block}
    @keyframes fade{from{opacity:.55;transform:translateY(3px)}to{opacity:1;transform:translateY(0)}}
    .section-head{display:flex;align-items:center;gap:10px;margin:4px 0 11px;padding-bottom:10px;border-bottom:1px solid var(--line)}
    .section-icon{width:34px;height:34px;border-radius:9px;background:linear-gradient(135deg,var(--orange),#ea580c);display:grid;place-items:center;font-size:12px;font-weight:900}
    .section-title{font-size:15px;font-weight:850}
    .section-sub{font-size:9px;color:var(--faint);margin-top:2px}
    .kpis{display:grid;grid-template-columns:repeat(6,minmax(120px,1fr));gap:9px;margin-bottom:10px}
    .kpi{background:var(--panel);border:1px solid var(--line);border-top:2px solid var(--orange);border-radius:var(--radius);padding:12px 13px;min-height:92px}
    .kpi.green{border-top-color:var(--green)}.kpi.blue{border-top-color:var(--blue)}.kpi.yellow{border-top-color:var(--yellow)}.kpi.red{border-top-color:var(--red)}.kpi.purple{border-top-color:var(--purple)}.kpi.cyan{border-top-color:var(--cyan)}
    .k-label{font-size:8px;color:var(--faint);font-weight:850;text-transform:uppercase;letter-spacing:.8px}
    .k-value{font-family:Consolas,ui-monospace,monospace;font-size:18px;font-weight:850;margin-top:7px;line-height:1;color:var(--text)}
    .k-meta{font-size:8px;color:var(--faint);margin-top:5px;line-height:1.35}
    .grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px}
    .grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:10px}
    .grid31{display:grid;grid-template-columns:2fr 1fr;gap:10px;margin-bottom:10px}
    .card{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:13px;min-width:0}
    .card:hover{border-color:var(--line2)}
    .card-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:10px}
    .card-title{font-size:11px;font-weight:800}
    .card-sub{font-size:8px;color:var(--faint);margin-top:2px}
    .badge{border-radius:5px;padding:3px 8px;font-size:8px;font-weight:850;color:var(--orange);background:rgba(249,115,22,.13);white-space:nowrap}
    .badge.green{color:var(--green);background:rgba(34,197,94,.12)}.badge.blue{color:var(--blue);background:rgba(59,130,246,.13)}.badge.yellow{color:var(--yellow);background:rgba(234,179,8,.1)}.badge.purple{color:var(--purple);background:rgba(168,85,247,.12)}.badge.red{color:var(--red);background:rgba(239,68,68,.12)}.badge.cyan{color:var(--cyan);background:rgba(6,182,212,.12)}
    .chart{min-height:260px;height:auto;position:relative;overflow:hidden}
    .chart.small{min-height:210px}.chart.tall{min-height:320px}
    svg{display:block;width:100%;height:auto;max-width:100%;overflow:hidden}
    .axis{stroke:rgba(148,163,184,.18);stroke-width:1}
    .tick{fill:var(--faint);font-size:10px}
    .svg-label{fill:var(--muted);font-size:10px;font-weight:700}
    .bar-chart{display:grid;gap:8px;padding:8px 2px 2px}
    .bar-row{display:grid;grid-template-columns:minmax(180px,30%) minmax(120px,1fr) max-content;grid-template-areas:"label track value";gap:10px;align-items:center;min-height:25px}
    .bar-label{color:var(--muted);font-size:10px;font-weight:800;line-height:1.25;overflow-wrap:anywhere}
    .bar-track{height:11px;min-width:42px;background:rgba(30,41,59,.9);border-radius:999px;overflow:hidden}
    .bar-fill{height:100%;min-width:3px;border-radius:999px}
    .bar-value{color:var(--faint);font-size:10px;white-space:nowrap}
    .bar-label{grid-area:label}.bar-track{grid-area:track}.bar-value{grid-area:value}
    .progress-list{display:grid;gap:9px;max-height:320px;overflow:auto;padding-right:3px}
    .progress-row{display:grid;grid-template-columns:minmax(130px,1fr) 2fr 70px;gap:8px;align-items:center;font-size:10px;color:var(--muted)}
    .progress-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text);font-weight:700}
    .track{height:7px;background:var(--panel3);border-radius:999px;overflow:hidden}
    .fill{height:100%;border-radius:999px;background:var(--orange)}
    .table-wrap{overflow:auto;border:1px solid var(--line);border-radius:8px}
    table{width:100%;border-collapse:collapse;font-size:11px;min-width:720px}
    thead{background:var(--panel2)}
    th{padding:8px 10px;text-align:left;color:var(--muted);font-size:8px;text-transform:uppercase;letter-spacing:.55px;border-bottom:1px solid var(--line)}
    td{padding:7px 10px;border-bottom:1px solid rgba(30,41,59,.55);color:var(--muted);vertical-align:middle}
    tbody tr:nth-child(even) td{background:rgba(18,25,41,.45)}
    tbody tr:hover td{background:rgba(249,115,22,.06)}
    .rank{display:inline-grid;place-items:center;width:21px;height:21px;border-radius:5px;background:var(--panel3);font-weight:850;color:var(--muted)}
    .rank.r1{background:linear-gradient(135deg,#ffd700,#f59e0b);color:#111827}.rank.r2{background:linear-gradient(135deg,#d1d5db,#9ca3af);color:#111827}.rank.r3{background:linear-gradient(135deg,#cd7f32,#92400e);color:white}
    .strong{color:var(--text);font-weight:800}.money{color:var(--orange);font-weight:850}.pos{color:var(--green);font-weight:850}.neg{color:var(--red);font-weight:850}
    .note-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
    .note{background:var(--panel2);border:1px solid var(--line);border-radius:8px;padding:11px;font-size:10px;color:var(--muted);line-height:1.55}
    .note b{color:var(--text)}
    .empty{display:grid;place-items:center;height:100%;font-size:11px;color:var(--faint);border:1px dashed var(--line);border-radius:8px}
    @media (max-width:1180px){.kpis{grid-template-columns:repeat(3,1fr)}.grid3,.grid2,.grid31{grid-template-columns:1fr}.filter-grid{grid-template-columns:repeat(2,1fr)}}
    @media (max-width:760px){:root{--sidebar:0px}.topbar{height:auto;min-height:58px;align-items:flex-start;padding:10px;gap:8px;flex-direction:column}.layout{display:block}.sidebar{position:static;width:100%;height:auto;display:flex;overflow:auto;border-right:0;border-bottom:1px solid var(--line);padding:6px}.nav-title{display:none}.nav-btn{width:auto;white-space:nowrap;border-left:0;border-bottom:2px solid transparent;border-radius:8px;margin:0}.nav-btn.active{border-left:0;border-bottom-color:var(--orange)}.main{padding:10px}.kpis{grid-template-columns:1fr}.filter-grid{grid-template-columns:1fr}.brand{min-width:0}.chart{overflow-x:auto;overflow-y:hidden}.chart svg{width:760px;max-width:none}.chart.small svg{width:620px}.bar-chart{min-width:0;gap:10px}.bar-row{grid-template-columns:minmax(0,1fr) max-content;grid-template-areas:"label value" "track track";gap:5px 10px;align-items:end}.bar-label{font-size:10px}.bar-value{font-size:10px}.bar-track{width:100%;height:10px}.progress-row{grid-template-columns:1fr}.progress-row .track{height:8px}}
  </style>
</head>
<body>
  <header class="topbar">
    <div class="brand">
      <div class="logo">MIS</div>
      <div>
        <div class="brand-title">MLH GOBONGO PVT. LTD.</div>
        <div class="brand-sub">Full MIS + Accounting Analytics Dashboard</div>
      </div>
    </div>
    <div class="top-actions">
      <span class="pill live">Live local data</span>
      <span class="pill">FY 2025-26</span>
      <span class="pill" id="asOf">Generated</span>
    </div>
  </header>

  <div class="layout">
    <aside class="sidebar" id="nav"></aside>
    <main class="main">
      <div class="periodbar" id="periods"></div>
      <div class="downloadbar">
        <div class="filter-grid">
          <label>Transaction
            <select id="txFilter"><option value="All">All</option></select>
          </label>
          <label>Party / Account
            <select id="partyFilter"><option value="All">All</option></select>
          </label>
          <label>State
            <select id="stateFilter"><option value="All">All</option></select>
          </label>
          <label>Item Group
            <select id="itemGroupFilter"><option value="All">All</option></select>
          </label>
          <label>Search
            <input id="searchFilter" placeholder="Party, item, voucher">
          </label>
        </div>
      </div>

      <section class="section active" id="executive"></section>
      <section class="section" id="parties"></section>
      <section class="section" id="segments"></section>
      <section class="section" id="state"></section>
      <section class="section" id="items"></section>
      <section class="section" id="cash"></section>
      <section class="section" id="transport"></section>
      <section class="section" id="uom"></section>
      <section class="section" id="adjustments"></section>
      <section class="section" id="sources"></section>
    </main>
  </div>

  <script id="dashboard-data" type="application/json">__DATA__</script>
  <script>
    const DATA = JSON.parse(document.getElementById('dashboard-data').textContent);
    const itemFacts = DATA.itemFacts;
    const ledgerFacts = DATA.ledgerFacts;
    const colors = ['#f97316','#22c55e','#3b82f6','#eab308','#a855f7','#06b6d4','#ef4444','#fb923c','#8b5cf6','#14b8a6'];
    const monthLabels = {
      '2025-04':'Apr','2025-05':'May','2025-06':'Jun','2025-07':'Jul','2025-08':'Aug','2025-09':'Sep',
      '2025-10':'Oct','2025-11':'Nov','2025-12':'Dec','2026-01':'Jan','2026-02':'Feb','2026-03':'Mar'
    };
    const monthOrder = Object.keys(monthLabels);
    const periods = [
      ['FY','Full Year'],['2025-04','Apr'],['2025-05','May'],['2025-06','Jun'],['2025-07','Jul'],['2025-08','Aug'],['2025-09','Sep'],
      ['2025-10','Oct'],['2025-11','Nov'],['2025-12','Dec'],['2026-01','Jan'],['2026-02','Feb'],['2026-03','Mar'],
      ['Q1','Q1'],['Q2','Q2'],['Q3','Q3'],['Q4','Q4'],['H1','H1'],['H2','H2'],['ASOF','As on Date']
    ];
    const periodMonths = {
      FY: monthOrder, Q1:['2025-04','2025-05','2025-06'], Q2:['2025-07','2025-08','2025-09'],
      Q3:['2025-10','2025-11','2025-12'], Q4:['2026-01','2026-02','2026-03'],
      H1:['2025-04','2025-05','2025-06','2025-07','2025-08','2025-09'],
      H2:['2025-10','2025-11','2025-12','2026-01','2026-02','2026-03'],
      ASOF: monthOrder
    };
    const navItems = [
      ['executive','EX','Executive Dashboard'],['parties','TP','Top Parties'],['segments','SG','Segments'],
      ['state','ST','State Wise'],['items','IG','Item Groups'],['cash','CB','Cash & Bank'],
      ['transport','TR','Transport'],['uom','UO','UOM & Stock'],['adjustments','AD','Adjustments'],['sources','DS','Data Sources']
    ];
    const state = { section:'executive', period:'FY', tx:'All', party:'All', stateName:'All', itemGroup:'All', search:'' };

    const byId = id => document.getElementById(id);
    const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
    const sum = (rows, field) => rows.reduce((acc, row) => acc + (+row[field] || 0), 0);
    const money = value => 'INR ' + ((+value || 0) / 100000).toLocaleString('en-IN', {maximumFractionDigits: 2}) + 'L';
    const num = value => (+value || 0).toLocaleString('en-IN', {maximumFractionDigits: 2});
    const pct = (part, total) => total ? ((part / total) * 100).toFixed(1) + '%' : '0.0%';
    const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

    function monthsForPeriod(period){
      if(periodMonths[period]) return periodMonths[period];
      return [period];
    }

    function periodLabel(){
      return periods.find(p => p[0] === state.period)?.[1] || 'Full Year';
    }

    function inPeriod(row){
      return monthsForPeriod(state.period).includes(row.month);
    }

    function matchesSearch(row){
      if(!state.search) return true;
      const text = [row.party,row.account,row.item,row.voucher,row.itemGroup,row.accountGroup,row.transport].join(' ').toLowerCase();
      return text.includes(state.search.toLowerCase());
    }

    function filteredItems(extra = {}){
      return itemFacts.filter(row => {
        if(!inPeriod(row) || !matchesSearch(row)) return false;
        if(state.tx !== 'All' && row.tx !== state.tx) return false;
        if(state.party !== 'All' && row.party !== state.party) return false;
        if(state.stateName !== 'All' && row.state !== state.stateName) return false;
        if(state.itemGroup !== 'All' && row.itemGroup !== state.itemGroup) return false;
        return Object.entries(extra).every(([key, value]) => row[key] === value);
      });
    }

    function filteredLedger(extra = {}){
      return ledgerFacts.filter(row => {
        if(!inPeriod(row) || !matchesSearch(row)) return false;
        if(state.tx !== 'All' && row.tx !== state.tx) return false;
        if(state.party !== 'All' && row.account !== state.party) return false;
        if(state.stateName !== 'All' && row.state !== state.stateName) return false;
        return Object.entries(extra).every(([key, value]) => row[key] === value);
      });
    }

    function groupRows(rows, key, field, limit = 10, transform = value => value){
      const map = new Map();
      rows.forEach(row => {
        const label = transform(row[key] || 'Unmapped');
        map.set(label, (map.get(label) || 0) + (+row[field] || 0));
      });
      return [...map.entries()].filter(([,value]) => value !== 0).sort((a,b) => b[1] - a[1]).slice(0, limit);
    }

    function signedGroup(salesRows, returnRows, key, limit = 10){
      const map = new Map();
      salesRows.forEach(row => map.set(row[key] || 'Unmapped', (map.get(row[key] || 'Unmapped') || 0) + row.amount));
      returnRows.forEach(row => map.set(row[key] || 'Unmapped', (map.get(row[key] || 'Unmapped') || 0) - row.amount));
      return [...map.entries()].filter(([,value]) => value !== 0).sort((a,b) => b[1] - a[1]).slice(0, limit);
    }

    function totals(){
      const items = filteredItems();
      const ledgers = filteredLedger();
      const byTx = tx => items.filter(row => row.tx === tx && row.isHeader);
      const lineTx = tx => items.filter(row => row.tx === tx);
      const ledgerTx = tx => ledgers.filter(row => row.tx === tx);
      const grossSales = sum(byTx('Sales'), 'finalAmount');
      const salesReturns = sum(byTx('Sales Return'), 'finalAmount');
      const grossPurchases = sum(byTx('Purchase'), 'finalAmount');
      const purchaseReturns = sum(byTx('Purchase Return'), 'finalAmount');
      const receipts = sum(ledgerTx('Receipt'), 'businessAmount');
      const payments = sum(ledgerTx('Payment'), 'businessAmount');
      return {
        items, ledgers, grossSales, salesReturns, netSales:grossSales - salesReturns,
        grossPurchases, purchaseReturns, netPurchases:grossPurchases - purchaseReturns,
        receipts, payments, netCash:receipts - payments,
        salesLines: lineTx('Sales'), salesReturnLines: lineTx('Sales Return'),
        purchaseLines: lineTx('Purchase'), purchaseReturnLines: lineTx('Purchase Return')
      };
    }

    function card(title, value, meta, variant = ''){
      return `<div class="kpi ${variant}"><div class="k-label">${esc(title)}</div><div class="k-value">${esc(value)}</div><div class="k-meta">${esc(meta)}</div></div>`;
    }

    function sectionHead(code, title, sub){
      return `<div class="section-head"><div class="section-icon">${code}</div><div><div class="section-title">${esc(title)}</div><div class="section-sub">${esc(sub)}</div></div></div>`;
    }

    function chartCard(title, sub, badge, badgeClass, body, chartClass = ''){
      return `<div class="card"><div class="card-head"><div><div class="card-title">${esc(title)}</div><div class="card-sub">${esc(sub)}</div></div><span class="badge ${badgeClass}">${esc(badge)}</span></div><div class="chart ${chartClass}">${body}</div></div>`;
    }

    function emptyState(text){
      return `<div class="empty">${esc(text)}</div>`;
    }

    function barSvg(rows, opts = {}){
      if(!rows.length) return emptyState('No data for current filters');
      const max = Math.max(...rows.map(row => Math.abs(row[1])), 1);
      return `<div class="bar-chart">${rows.map((row, idx) => {
        const percent = Math.max(1, Math.abs(row[1]) / max * 100);
        const color = colors[idx % colors.length];
        return `<div class="bar-row">
          <div class="bar-label" title="${esc(row[0])}">${esc(row[0])}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${percent}%;background:${color}"></div></div>
          <div class="bar-value">${money(row[1])}</div>
        </div>`;
      }).join('')}</div>`;
    }

    function donutSvg(rows){
      if(!rows.length) return emptyState('No data for current filters');
      const total = rows.reduce((acc, row) => acc + Math.abs(row[1]), 0) || 1;
      let start = -90;
      const cx = 145, cy = 124, r = 82;
      const slices = rows.slice(0, 8).map((row, idx) => {
        const value = Math.abs(row[1]);
        const angle = value / total * 360;
        const end = start + angle;
        const large = angle > 180 ? 1 : 0;
        const sx = cx + r * Math.cos(Math.PI * start / 180);
        const sy = cy + r * Math.sin(Math.PI * start / 180);
        const ex = cx + r * Math.cos(Math.PI * end / 180);
        const ey = cy + r * Math.sin(Math.PI * end / 180);
        const path = `<path d="M ${cx} ${cy} L ${sx} ${sy} A ${r} ${r} 0 ${large} 1 ${ex} ${ey} Z" fill="${colors[idx % colors.length]}" opacity=".92"></path>`;
        start = end;
        return path;
      }).join('');
      const legend = rows.slice(0, 8).map((row, idx) => {
        const y = 42 + idx * 22;
        return `<rect x="305" y="${y - 8}" width="9" height="9" rx="2" fill="${colors[idx % colors.length]}"></rect>
          <text x="322" y="${y}" class="svg-label">${esc(String(row[0]).slice(0, 30))}</text>
          <text x="590" y="${y}" class="tick" text-anchor="end">${pct(Math.abs(row[1]), total)}</text>`;
      }).join('');
      return `<svg viewBox="0 0 620 250" style="height:250px" role="img">${slices}<circle cx="${cx}" cy="${cy}" r="50" fill="${cssVar('--panel')}"></circle><text x="${cx}" y="${cy-2}" text-anchor="middle" class="svg-label">Total</text><text x="${cx}" y="${cy+16}" text-anchor="middle" class="tick">${money(total)}</text>${legend}</svg>`;
    }

    function lineSvg(series){
      const width = 760, height = 245, left = 44, right = 18, top = 18, bottom = 34;
      const allValues = series.flatMap(s => s.values);
      const max = Math.max(...allValues, 1);
      const xStep = (width - left - right) / (monthOrder.length - 1);
      const y = value => top + (height - top - bottom) * (1 - value / max);
      const paths = series.map((s, idx) => {
        const points = s.values.map((value, i) => `${left + i * xStep},${y(value)}`).join(' ');
        const circles = s.values.map((value, i) => `<circle cx="${left + i*xStep}" cy="${y(value)}" r="2.5" fill="${colors[idx % colors.length]}"></circle>`).join('');
        return `<polyline points="${points}" fill="none" stroke="${colors[idx % colors.length]}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline>${circles}`;
      }).join('');
      const xLabels = monthOrder.map((m, i) => `<text x="${left+i*xStep}" y="${height-10}" text-anchor="middle" class="tick">${monthLabels[m]}</text>`).join('');
      const grid = [0,.25,.5,.75,1].map(t => {
        const yy = top + (height - top - bottom) * t;
        return `<line x1="${left}" y1="${yy}" x2="${width-right}" y2="${yy}" class="axis"></line>`;
      }).join('');
      const legend = series.map((s, idx) => `<rect x="${left + idx*130}" y="4" width="9" height="9" rx="2" fill="${colors[idx % colors.length]}"></rect><text x="${left+14+idx*130}" y="12" class="tick">${esc(s.name)}</text>`).join('');
      return `<svg viewBox="0 0 ${width} ${height}" style="height:${height}px" role="img">${grid}${legend}${paths}${xLabels}</svg>`;
    }

    function tableHtml(headers, rows){
      const body = rows.length ? rows.map((row, idx) => `<tr>${row.map((cell, colIdx) => {
        if(colIdx === 0) return `<td><span class="rank ${idx===0?'r1':idx===1?'r2':idx===2?'r3':''}">${idx+1}</span></td>`;
        return `<td>${cell}</td>`;
      }).join('')}</tr>`).join('') : `<tr><td colspan="${headers.length}">No data for current filters</td></tr>`;
      return `<div class="table-wrap"><table><thead><tr>${headers.map(header => `<th>${esc(header)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;
    }

    function progressList(rows){
      if(!rows.length) return emptyState('No data for current filters');
      const max = Math.max(...rows.map(row => Math.abs(row[1])), 1);
      return `<div class="progress-list">${rows.map((row, idx) => `<div class="progress-row">
        <div class="progress-name" title="${esc(row[0])}">${esc(row[0])}</div>
        <div class="track"><div class="fill" style="width:${Math.max(1, Math.abs(row[1]) / max * 100)}%;background:${colors[idx % colors.length]}"></div></div>
        <div class="money">${money(row[1])}</div>
      </div>`).join('')}</div>`;
    }

    function monthlySeries(itemRows, ledgerRows){
      const itemTx = tx => monthOrder.map(month => sum(itemRows.filter(row => row.tx === tx && row.isHeader && row.month === month), 'finalAmount'));
      const ledgerTx = tx => monthOrder.map(month => sum(ledgerRows.filter(row => row.tx === tx && row.month === month), 'businessAmount'));
      return [
        {name:'Sales', values:itemTx('Sales')},
        {name:'Purchases', values:itemTx('Purchase')},
        {name:'Receipts', values:ledgerTx('Receipt')},
        {name:'Payments', values:ledgerTx('Payment')}
      ];
    }

    function renderExecutive(){
      const t = totals();
      const topCustomers = signedGroup(t.salesLines, t.salesReturnLines, 'party', 10);
      const mix = [['Net Sales', t.netSales], ['Net Purchases', t.netPurchases], ['Receipts', t.receipts], ['Payments', t.payments], ['Returns', t.salesReturns + t.purchaseReturns]];
      byId('executive').innerHTML = `
        ${sectionHead('EX','Executive Dashboard', `${periodLabel()} - all amounts shown in INR Lakhs`)}
        <div class="kpis">
          ${card('Net Sales', money(t.netSales), `${num(t.salesLines.length)} sales lines`, 'green')}
          ${card('Net Purchases', money(t.netPurchases), `${num(t.purchaseLines.length)} purchase lines`, 'blue')}
          ${card('Receipts', money(t.receipts), 'Voucher-row debit convention', 'cyan')}
          ${card('Payments', money(t.payments), 'Voucher-row credit convention', 'yellow')}
          ${card('Net Cash Movement', money(t.netCash), 'Receipts less payments', t.netCash >= 0 ? 'green' : 'red')}
          ${card('Sales Return Rate', pct(t.salesReturns, t.grossSales), `${money(t.salesReturns)} returns`, 'red')}
        </div>
        <div class="grid2">
          ${chartCard('Monthly MIS Trend','Sales, purchases, receipts and payments','Trend','', lineSvg(monthlySeries(t.items, t.ledgers)), 'small')}
          ${chartCard('Transaction Mix','Share of key MIS flows','Mix','green', donutSvg(mix), 'small')}
        </div>
        <div class="grid31">
          ${chartCard('Top 10 Customers','Net sales after sales returns','Top 10','blue', barSvg(topCustomers), 'tall')}
          <div class="card"><div class="card-head"><div><div class="card-title">Customer Revenue Share</div><div class="card-sub">Progress bars</div></div><span class="badge purple">Share</span></div>${progressList(topCustomers)}</div>
        </div>`;
    }

    function renderParties(){
      const t = totals();
      const customers = signedGroup(t.salesLines, t.salesReturnLines, 'party', 15);
      const suppliers = signedGroup(t.purchaseLines, t.purchaseReturnLines, 'party', 15);
      const receiptAccounts = groupRows(filteredLedger({tx:'Receipt'}).filter(r => !r.isHeader), 'account', 'credit', 10);
      const paymentAccounts = groupRows(filteredLedger({tx:'Payment'}).filter(r => !r.isHeader), 'account', 'debit', 10);
      const rows = customers.map(([label, value]) => [0, `<span class="strong">${esc(label)}</span>`, `<span class="money">${money(value)}</span>`, pct(value, t.netSales), esc((itemFacts.find(r => r.party === label)?.state) || 'Unmapped')]);
      byId('parties').innerHTML = `
        ${sectionHead('TP','Top Parties', 'Customer, supplier, collection and payment concentration')}
        <div class="grid2">
          ${chartCard('Top Customers - Net Sales','Sales amount less return amount','Customer','', barSvg(customers), 'tall')}
          ${chartCard('Top Suppliers - Net Purchase','Purchase amount less purchase return amount','Supplier','green', barSvg(suppliers), 'tall')}
        </div>
        <div class="grid2">
          ${chartCard('Receipt Counterparties','Ledger rows credited in receipt vouchers','Receipts','cyan', donutSvg(receiptAccounts), 'small')}
          ${chartCard('Payment Counterparties','Ledger rows debited in payment vouchers','Payments','yellow', donutSvg(paymentAccounts), 'small')}
        </div>
        <div class="card"><div class="card-head"><div><div class="card-title">Customer Detailed Table</div><div class="card-sub">Ranked by net sales</div></div><span class="badge blue">Table</span></div>${tableHtml(['#','Party Name','Net Sales','Share','State'], rows)}</div>`;
    }

    function renderSegments(){
      const t = totals();
      const vch = groupRows(t.items, 'vchSeries', 'amount', 10);
      const accountGroups = groupRows(t.items, 'accountGroup', 'amount', 12);
      const txRows = [['Gross Sales', t.grossSales], ['Sales Returns', t.salesReturns], ['Gross Purchases', t.grossPurchases], ['Purchase Returns', t.purchaseReturns], ['Receipts', t.receipts], ['Payments', t.payments]];
      const tableRows = txRows.map(([label, value]) => [0, `<span class="strong">${label}</span>`, `<span class="money">${money(value)}</span>`, pct(value, txRows.reduce((a,r)=>a+Math.abs(r[1]),0)), value >= 0 ? '<span class="pos">Active</span>' : '<span class="neg">Review</span>']);
      byId('segments').innerHTML = `
        ${sectionHead('SG','Segment Wise MIS', 'Voucher series, account group and transaction split')}
        <div class="grid3">
          ${chartCard('Voucher Series Split','Line amount by Vch. Series','Series','', donutSvg(vch), 'small')}
          ${chartCard('Account Group Mix','Joined from account master','Group','green', barSvg(accountGroups, {height:220}), 'small')}
          ${chartCard('Transaction Type Mix','Header-level and ledger convention values','Type','yellow', donutSvg(txRows), 'small')}
        </div>
        <div class="card"><div class="card-head"><div><div class="card-title">Segment Summary Table</div><div class="card-sub">Comparable to the reference segment summary</div></div><span class="badge">Summary</span></div>${tableHtml(['#','Segment','Amount','Share','Status'], tableRows)}</div>`;
    }

    function renderState(){
      const t = totals();
      const salesByState = signedGroup(t.salesLines, t.salesReturnLines, 'state', 15);
      const purchaseByState = signedGroup(t.purchaseLines, t.purchaseReturnLines, 'state', 15);
      const rows = salesByState.map(([label, value]) => [0, `<span class="strong">${esc(label)}</span>`, `<span class="money">${money(value)}</span>`, pct(value, t.netSales), money(purchaseByState.find(row => row[0] === label)?.[1] || 0)]);
      byId('state').innerHTML = `
        ${sectionHead('ST','State Wise MIS', 'State mapping from account master')}
        <div class="grid2">
          ${chartCard('State Sales - Top 15','Net sales by party state','Sales','', barSvg(salesByState), 'tall')}
          ${chartCard('State Sales Share','Percent of filtered net sales','Share','green', donutSvg(salesByState), 'tall')}
        </div>
        <div class="card"><div class="card-head"><div><div class="card-title">State Summary Table</div><div class="card-sub">Sales and purchase values by state</div></div><span class="badge blue">State</span></div>${tableHtml(['#','State','Net Sales','Sales Share','Net Purchase'], rows)}</div>`;
    }

    function renderItems(){
      const t = totals();
      const groups = signedGroup(t.salesLines, t.salesReturnLines, 'itemGroup', 15);
      const items = signedGroup(t.salesLines, t.salesReturnLines, 'itemFamily', 15);
      const rows = items.map(([label, value]) => {
        const sample = itemFacts.find(row => row.itemFamily === label);
        const qty = sum(t.salesLines.filter(row => row.itemFamily === label), 'qty') - sum(t.salesReturnLines.filter(row => row.itemFamily === label), 'qty');
        return [0, `<span class="strong">${esc(label)}</span>`, esc(sample?.itemGroup || 'Unmapped'), esc(sample?.mainUnit || 'Unmapped'), num(qty), `<span class="money">${money(value)}</span>`];
      });
      byId('items').innerHTML = `
        ${sectionHead('IG','Item Group / Department Wise', 'Item master-driven product analysis')}
        <div class="grid2">
          ${chartCard('Item Group Revenue','Net sales by item master Group Name','Group','', barSvg(groups), 'tall')}
          ${chartCard('Item Revenue Share','Top item families by net sales','Item','green', donutSvg(items), 'tall')}
        </div>
        <div class="card"><div class="card-head"><div><div class="card-title">Item Detail Table</div><div class="card-sub">Normalized item family, group, unit, quantity and net sales</div></div><span class="badge purple">Items</span></div>${tableHtml(['#','Item Family','Item Group','Unit','Net Qty','Net Sales'], rows)}</div>`;
    }

    function renderCash(){
      const receipts = filteredLedger({tx:'Receipt'});
      const payments = filteredLedger({tx:'Payment'});
      const receiptBanks = groupRows(receipts.filter(row => row.isHeader), 'account', 'businessAmount', 8);
      const paymentBanks = groupRows(payments.filter(row => row.isHeader), 'account', 'businessAmount', 8);
      const rows = receiptBanks.map(([label, value]) => [0, `<span class="strong">${esc(label)}</span>`, `<span class="money">${money(value)}</span>`, pct(value, sum(receipts, 'businessAmount')), money(paymentBanks.find(row => row[0] === label)?.[1] || 0)]);
      byId('cash').innerHTML = `
        ${sectionHead('CB','Cash & Bank Flow', 'Receipt and payment movement by cash/bank account')}
        <div class="grid2">
          ${chartCard('Receipt Accounts','Voucher header debit side','Receipts','cyan', barSvg(receiptBanks), 'tall')}
          ${chartCard('Payment Accounts','Voucher header credit side','Payments','yellow', barSvg(paymentBanks), 'tall')}
        </div>
        <div class="card"><div class="card-head"><div><div class="card-title">Cash / Bank Summary</div><div class="card-sub">Header-side movement by account</div></div><span class="badge cyan">Bank</span></div>${tableHtml(['#','Account','Receipts','Receipt Share','Payments'], rows)}</div>`;
    }

    function renderTransport(){
      const t = totals();
      const salesTransport = groupRows(t.salesLines, 'transport', 'amount', 12);
      const purchaseTransport = groupRows(t.purchaseLines, 'transport', 'amount', 12);
      const distanceBands = t.items.map(row => ({...row, distanceBand: row.distance <= 0 ? '0 / Not captured' : row.distance <= 100 ? '1-100' : row.distance <= 250 ? '101-250' : '250+'}));
      const bands = groupRows(distanceBands, 'distanceBand', 'amount', 8);
      const rows = salesTransport.map(([label, value]) => [0, `<span class="strong">${esc(label)}</span>`, `<span class="money">${money(value)}</span>`, pct(value, sum(t.salesLines, 'amount')), money(purchaseTransport.find(row => row[0] === label)?.[1] || 0)]);
      byId('transport').innerHTML = `
        ${sectionHead('TR','Transport / Distance Analysis', 'Reference delivery terms section remapped to available transport fields')}
        <div class="grid3">
          ${chartCard('Sales by Transport','Transport field from sales register','Sales','', barSvg(salesTransport, {height:220}), 'small')}
          ${chartCard('Purchase by Transport','Transport field from purchase register','Purchase','green', barSvg(purchaseTransport, {height:220}), 'small')}
          ${chartCard('Distance Bands','Amount by captured distance','Distance','yellow', donutSvg(bands), 'small')}
        </div>
        <div class="card"><div class="card-head"><div><div class="card-title">Transport Summary Table</div><div class="card-sub">Sales and purchases by transport mode</div></div><span class="badge">Transport</span></div>${tableHtml(['#','Transport','Sales Amount','Sales Share','Purchase Amount'], rows)}</div>`;
    }

    function renderUom(){
      const t = totals();
      const salesUnits = groupRows(t.salesLines, 'mainUnit', 'amount', 12);
      const altUnits = groupRows(t.salesLines, 'altUnit', 'amount', 12);
      const qtyUnits = groupRows(t.items, 'mainUnit', 'qty', 12);
      const rows = salesUnits.map(([label, value]) => [0, `<span class="strong">${esc(label)}</span>`, `<span class="money">${money(value)}</span>`, pct(value, sum(t.salesLines, 'amount')), num(qtyUnits.find(row => row[0] === label)?.[1] || 0)]);
      byId('uom').innerHTML = `
        ${sectionHead('UO','UOM & Opening Stock Analysis', 'Unit mapping from item master; stock is opening stock only')}
        <div class="grid3">
          ${chartCard('Main Unit Revenue Split','Sales amount by Main Unit','UOM','', donutSvg(salesUnits), 'small')}
          ${chartCard('Alt Unit Revenue Split','Sales amount by Alt. Unit','Alt UOM','green', donutSvg(altUnits), 'small')}
          ${chartCard('Quantity by Unit','Transaction quantity by Main Unit','Qty','blue', barSvg(qtyUnits, {height:220}), 'small')}
        </div>
        <div class="card"><div class="card-head"><div><div class="card-title">UOM Summary Table</div><div class="card-sub">Revenue, share and transaction quantity by unit</div></div><span class="badge purple">UOM</span></div>${tableHtml(['#','Main Unit','Sales Amount','Share','Transaction Qty'], rows)}</div>`;
    }

    function renderAdjustments(){
      const credit = groupRows(filteredLedger({tx:'Credit Note'}), 'account', 'businessAmount', 10);
      const debit = groupRows(filteredLedger({tx:'Debit Note'}), 'account', 'businessAmount', 10);
      const journalDebit = groupRows(filteredLedger({tx:'Journal'}), 'account', 'debit', 10);
      const journalCredit = groupRows(filteredLedger({tx:'Journal'}), 'account', 'credit', 10);
      const rows = [['Credit Notes', sum(filteredLedger({tx:'Credit Note'}), 'businessAmount')], ['Debit Notes', sum(filteredLedger({tx:'Debit Note'}), 'businessAmount')], ['Journal Debits', sum(filteredLedger({tx:'Journal'}), 'debit')], ['Journal Credits', sum(filteredLedger({tx:'Journal'}), 'credit')]]
        .map(([label, value]) => [0, `<span class="strong">${label}</span>`, `<span class="money">${money(value)}</span>`, value ? 'Balanced register source' : 'No value']);
      byId('adjustments').innerHTML = `
        ${sectionHead('AD','Adjustments & Journals', 'Credit notes, debit notes and journal register')}
        <div class="grid2">
          ${chartCard('Credit Note Accounts','Business amount on voucher header rows','Credit Notes','red', barSvg(credit), 'tall')}
          ${chartCard('Debit Note Accounts','Business amount on voucher header rows','Debit Notes','yellow', barSvg(debit), 'tall')}
        </div>
        <div class="grid2">
          ${chartCard('Journal Debit Accounts','Debit side of journal entries','Debit','blue', barSvg(journalDebit), 'small')}
          ${chartCard('Journal Credit Accounts','Credit side of journal entries','Credit','green', barSvg(journalCredit), 'small')}
        </div>
        <div class="card"><div class="card-head"><div><div class="card-title">Adjustment Summary</div><div class="card-sub">Totals by adjustment source</div></div><span class="badge red">Adjustments</span></div>${tableHtml(['#','Source','Amount','Note'], rows)}</div>`;
    }

    function renderSources(){
      const rows = DATA.sourceProfile.map(src => [0, `<span class="strong">${esc(src.file)}</span>`, esc(src.role), num(src.rows), num(src.vouchers), esc(src.columns.join(', '))]);
      byId('sources').innerHTML = `
        ${sectionHead('DS','Data Sources & Caveats', 'Audit trail, schema mapping and limitations')}
        <div class="grid3">
          <div class="note"><b>Data grain.</b><br>Sales, purchases and returns have voucher header rows plus item detail rows. Header values power KPI totals; line values power product and dimension breakdowns.</div>
          <div class="note"><b>Reference remapping.</b><br>Unavailable reference fields such as salesperson, country, currency and delivery terms are replaced with party, state, account group, item group, voucher series and transport.</div>
          <div class="note"><b>Metric caveat.</b><br>Gross margin and stock closing are not calculated because COGS valuation and full inventory movement are not present in the provided files.</div>
        </div>
        <div class="card" style="margin-top:10px"><div class="card-head"><div><div class="card-title">Source File Register</div><div class="card-sub">Fields are preserved from the source exports</div></div><span class="badge blue">Schema</span></div>${tableHtml(['#','File','Role','Rows','Vouchers','Fields'], rows)}</div>`;
    }

    function populateFilters(){
      const txs = [...new Set([...itemFacts.map(r => r.tx), ...ledgerFacts.map(r => r.tx)])].sort();
      const parties = [...new Set([...itemFacts.map(r => r.party), ...ledgerFacts.map(r => r.account)])].filter(Boolean).sort();
      const states = [...new Set([...itemFacts.map(r => r.state), ...ledgerFacts.map(r => r.state)])].filter(Boolean).sort();
      const groups = [...new Set(itemFacts.map(r => r.itemGroup))].filter(Boolean).sort();
      fillSelect('txFilter', txs);
      fillSelect('partyFilter', parties);
      fillSelect('stateFilter', states);
      fillSelect('itemGroupFilter', groups);
    }

    function fillSelect(id, values){
      const select = byId(id);
      select.innerHTML = '<option value="All">All</option>' + values.map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join('');
    }

    function renderChrome(){
      byId('asOf').textContent = 'Generated ' + DATA.generatedAt;
      byId('nav').innerHTML = '<div class="nav-title">Dashboard</div>' + navItems.map(([id, code, label]) => `<button class="nav-btn ${state.section===id?'active':''}" data-section="${id}"><span class="nav-ico">${code}</span><span>${label}</span></button>`).join('');
      byId('periods').innerHTML = '<span class="bar-label">Period</span>' + periods.map(([value,label]) => `<button class="period ${state.period===value?'active':''}" data-period="${value}">${label}</button>`).join('');
      document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', () => { state.section = btn.dataset.section; render(); }));
      document.querySelectorAll('.period').forEach(btn => btn.addEventListener('click', () => { state.period = btn.dataset.period; render(); }));
    }

    function render(){
      document.querySelectorAll('.section').forEach(sec => sec.classList.toggle('active', sec.id === state.section));
      renderChrome();
      renderExecutive();
      renderParties();
      renderSegments();
      renderState();
      renderItems();
      renderCash();
      renderTransport();
      renderUom();
      renderAdjustments();
      renderSources();
    }

    populateFilters();
    byId('txFilter').addEventListener('change', event => { state.tx = event.target.value; render(); });
    byId('partyFilter').addEventListener('change', event => { state.party = event.target.value; render(); });
    byId('stateFilter').addEventListener('change', event => { state.stateName = event.target.value; render(); });
    byId('itemGroupFilter').addEventListener('change', event => { state.itemGroup = event.target.value; render(); });
    byId('searchFilter').addEventListener('input', event => { state.search = event.target.value.trim(); render(); });
    render();
  </script>
</body>
</html>
"""


def main() -> None:
    data = build_data()
    html = HTML_TEMPLATE.replace(
        "__DATA__",
        json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/"),
    )
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    OUT_FILE.write_text(html, encoding="utf-8")
    print(OUT_FILE)


if __name__ == "__main__":
    main()
