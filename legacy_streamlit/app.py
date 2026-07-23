"""
Drafter — SME IPO offer-document prototype (Streamlit UI).

Run it with:   streamlit run app.py

The app tells the full demo story on the fictional auto-components SME:
  1. Guided intake wizard (8 steps, pre-filled from the sample company)
  2. One-click draft generation (LangGraph -> Groq, template fallback)
  3. Live Gap & Consistency Checker that catches the two planted defects
  4. DOCX export of the draft + gap report

You do not need to be a coder to run this. See BUILD_GUIDE.md.
"""

import json
from pathlib import Path

import streamlit as st

from engine import (
    load_registry,
    load_sample_company,
    load_json,
    run_full,
)
from export_docx import export_draft

BASE = Path(__file__).parent
DATA = BASE / "data"

st.set_page_config(page_title="Drafter — SME IPO Draft", page_icon="📄", layout="wide")

# ---- header ----
st.markdown(
    "<h1 style='margin-bottom:0'>📄 Drafter</h1>"
    "<p style='color:#c4a860;font-size:1.05rem;margin-top:0'>"
    "From Business Reality to Disclosure-Ready — AI-guided SME IPO offer-document preparation</p>",
    unsafe_allow_html=True,
)
st.caption("SEBI Securities Market TechSprint @ GFF 2026 · Track 04: Fund Raising · Prototype")

# ---- load data ----
questionnaire = load_json(DATA / "intake_questionnaire.json")
sample = load_sample_company()

if "answers" not in st.session_state:
    # Pre-fill the wizard from the sample company for a fast on-screen run.
    st.session_state.answers = sample
if "result" not in st.session_state:
    st.session_state.result = None

tab_intake, tab_draft, tab_gap, tab_about = st.tabs(
    ["1 · Guided Intake", "2 · Generated Draft", "3 · Gap & Consistency", "About / Demo Notes"]
)

# ======================================================================
# TAB 1 — GUIDED INTAKE
# ======================================================================
with tab_intake:
    st.subheader("Guided Intake — “Speak Business, Not Legalese”")
    st.write(
        "Eight plain-language steps, each tagged to the SEBI disclosure item it feeds. "
        "For the demo the answers are pre-filled from **Shreeji Auto Components Limited** "
        "(a fictional issuer) so you can run end-to-end in under a minute."
    )

    identity = sample.get("identity", {})
    business = sample.get("business", {})
    issue = sample.get("issue", {})
    legal = sample.get("legal", {})
    mgmt = sample.get("management", {})
    fin = sample.get("financials", {})

    with st.expander("Step 1 · Company Identity", expanded=True):
        st.text_input("Company name", identity.get("company_name", ""))
        st.text_input("CIN", identity.get("cin", ""))
        st.text_input("Registered office", identity.get("registered_office", ""))

    with st.expander("Step 2 · Business Overview"):
        st.text_area("What does the company make/do?", business.get("business_description", ""), height=80)
        st.number_input("Total revenue from operations, FY26 (INR crore)",
                        value=float(business.get("revenue_stated", 0)))
        st.text_area("Top 5 customers and revenue share", business.get("top_customers", ""), height=80)

    with st.expander("Step 3 · Financials & Objects of the Issue"):
        st.write(f"Restated revenue (FY24–FY26): {fin.get('revenue_3yr')} (INR crore)")
        st.write("Objects of the issue:")
        for o in issue.get("objects_breakup", []):
            st.write(f"• {o['purpose']} — INR {o['amount']} crore")

    with st.expander("Step 5 · Risk Factors (AI-suggested, promoter confirms)"):
        st.info("Drafter suggests company-specific risks from the answers: customer concentration, "
                "raw-material/supplier dependence, working-capital intensity. Promoter confirms.")

    with st.expander("Step 7 · Legal & Statutory"):
        st.text_area("Pending litigation / tax demands / regulatory matters",
                     legal.get("litigation", ""), height=60)
        st.caption("⚠ Note for demo: the Legal answer says 'None pending', but a GST demand is "
                   "referenced in the business & related-party data — this is planted DEFECT-2.")

    st.divider()
    if st.button("⚙️ Generate draft offer document", type="primary", use_container_width=True):
        with st.spinner("Running pipeline: intake → generate → gap-check…"):
            st.session_state.result = run_full(st.session_state.answers)
        st.success("Draft generated. Open tab **2 · Generated Draft** and **3 · Gap & Consistency**.")

# ======================================================================
# TAB 2 — GENERATED DRAFT
# ======================================================================
with tab_draft:
    st.subheader("Generated Draft — mapped to disclosure requirements")
    result = st.session_state.result
    if result is None:
        st.info("Go to **1 · Guided Intake** and click *Generate draft offer document* first.")
    else:
        sections = result["sections"]
        for sec_id in ["S2", "S3", "S4", "S5", "S6"]:
            if sec_id not in sections:
                continue
            sec = sections[sec_id]
            st.markdown(f"### {sec['title']}")
            st.caption(f"Maps to disclosure requirements: {', '.join(sec.get('maps_to', []))}")
            st.write(sec["text"])
            st.divider()

        # export
        if st.button("⬇️ Export draft + gap report to DOCX", use_container_width=True):
            path = export_draft(st.session_state.answers, result["sections"], result["gap_report"])
            with open(path, "rb") as f:
                st.download_button(
                    "Download Drafter_Offer_Document_Draft.docx",
                    f,
                    file_name="Drafter_Offer_Document_Draft.docx",
                    use_container_width=True,
                )

# ======================================================================
# TAB 3 — GAP & CONSISTENCY
# ======================================================================
with tab_gap:
    st.subheader("Gap & Consistency Checker — the trust layer")
    result = st.session_state.result
    if result is None:
        st.info("Generate a draft first (tab 1).")
    else:
        gap = result["gap_report"]
        c1, c2, c3 = st.columns(3)
        c1.metric("Disclosure coverage", f"{gap['coverage_pct']}%")
        c2.metric("Items complete", f"{gap['complete_items']}/{gap['total_items']}")
        c3.metric("Defects flagged", len(gap["defects"]))

        if gap["defects"]:
            st.error("Defects caught at DRAFT stage (before the exchange ever sees it):")
            for d in gap["defects"]:
                st.markdown(f"- **[{d['id']}]** {d['detail']}")

        st.divider()
        st.write("**Full disclosure checklist**")
        rows = [
            {
                "Item": i["id"],
                "Section": i["section"],
                "Requirement": i["requirement"],
                "Status": i["status"],
            }
            for i in gap["items"]
        ]
        st.dataframe(rows, use_container_width=True, hide_index=True)

# ======================================================================
# TAB 4 — ABOUT
# ======================================================================
with tab_about:
    st.subheader("About this prototype")
    st.markdown(
        """
This prototype demonstrates the **Drafter** concept end-to-end on one fictional SME issuer.

**Pipeline (LangGraph):** `intake → generate → gap-check`.
- *Factual* sections (financials, capital structure) are populated deterministically from issuer data — no invented numbers.
- *Narrative* sections (business, risk factors, legal) are drafted by an LLM on **Groq** when a key is set, constrained by the disclosure knowledge base. Without a key, built-in templates are used so the demo always runs.

**Two defects are deliberately planted** in the sample company so the checker can catch them live:
1. A **revenue mismatch** between the Business Overview and the Financial Information.
2. An **undisclosed litigation** reference (a GST demand mentioned but marked 'None pending' in Legal).

**Guardrails:** output is an explicit *preparatory draft* for the merchant banker — not for filing. Every section is source-linked and mapped to the requirement it satisfies.
        """
    )
    st.caption("All issuer data is fictional. Team Drafter · PGDM (Securities Markets), NISM.")
