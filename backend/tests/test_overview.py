"""The overview: one owner-scoped answer for attention, coming up, recent documents, counts and statuses."""

import uuid
from datetime import date, datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event

from app.dependencies import async_session, engine
from app.main import app
from app.models.base import BillRevision, BillSplit, Document, ReminderProposal, User, Warranty
from app.services import overview as overview_service
from app.services.auth_service import create_access_token, hash_password
from app.services.bill_review import extract_bill_review
from app.services.overview import build_overview
from tests.accounts import delete_users
from tests.fixtures import household_texts

TODAY = date(2026, 11, 15)
BASE_TIME = datetime(2026, 11, 1, 9, 0)
# Renewal 40 days after TODAY.
INSURANCE_40_DAYS = household_texts.HOME_INSURANCE_RENEWAL.replace("12 December 2026", "25 December 2026")
MANUAL_WITH_BILL_WORDS = (
    "Smart meter M3 user manual\nYour electricity invoice and statement show:\n"
    "Total amount due: EUR 45.00\nPayment due date: 20 November 2026\nRenewal date: 1 December 2026"
)


@pytest.fixture
async def owner():
    user = User(email=f"overview-{uuid.uuid4()}@example.com", hashed_password=hash_password("testing123"),
                is_verified=True)
    async with async_session() as db:
        db.add(user)
        await db.commit()
        user_id = user.id
    yield user_id
    await delete_users(user_id)


_order = iter(range(1, 10_000))


async def _doc(user_id, title, text=None, kind=None, status="complete", minutes=None):
    minutes = next(_order) if minutes is None else minutes
    async with async_session() as db:
        doc = Document(user_id=user_id, title=title, raw_text=text, document_type=kind,
                       processing_status=status, s3_key_original=f"users/{user_id}/{uuid.uuid4()}.pdf",
                       created_at=BASE_TIME + timedelta(minutes=minutes))
        db.add(doc)
        await db.commit()
        return doc.id


async def _revision(doc_id, text, number=1, cents=12347, due=date(2026, 11, 23)):
    async with async_session() as db:
        row = BillRevision(document_id=doc_id, revision_number=number, amount_due_cents=cents, due_date=due,
                           billing_period_start=date(2026, 10, 1), billing_period_end=date(2026, 10, 31),
                           evidence=extract_bill_review(text).model_dump())
        db.add(row)
        await db.commit()
        return row.id


async def _warranty(doc_id, expiry):
    async with async_session() as db:
        db.add(Warranty(document_id=doc_id, expiry_date=datetime.combine(expiry, datetime.min.time())))
        await db.commit()


async def _split(doc_id, revision_id):
    shares = [{"housemate_id": str(uuid.uuid4()), "label": label, "cents": 6000} for label in ("Aoife", "Ben")]
    async with async_session() as db:
        db.add(BillSplit(document_id=doc_id, bill_revision_id=revision_id, split_number=1, rule="equal",
                         total_cents=12000, shares=shares))
        await db.commit()


async def _proposal(doc_id, user_id, revision_id, amount="125.00", due=date(2026, 11, 23), days=3):
    details = {"bill_revision": 1, "amount_due": amount, "due_date": due.isoformat(),
               "billing_period_start": "2026-10-01", "billing_period_end": "2026-10-31",
               "days_before_due": days, "remind_on": (due - timedelta(days=days)).isoformat(), "split": None}
    async with async_session() as db:
        row = ReminderProposal(document_id=doc_id, user_id=user_id, proposal_number=1, action="bill_reminder",
                               source="owner", bill_revision_id=revision_id, details=details, status="pending")
        db.add(row)
        await db.commit()
        return row.id


async def _overview(user_id, today=TODAY):
    async with async_session() as db:
        return await build_overview(db, user_id, today)


def _kinds(items):
    return [(item.kind, item.title) for item in items]


async def test_the_live_run_scenario(owner):
    electricity = await _doc(owner, "Electricity bill", household_texts.ELECTRICITY_BILL_LIVE, "Bill")
    laptop = await _doc(owner, "Laptop receipt", household_texts.LAPTOP_RECEIPT, "Receipt")
    await _warranty(laptop, TODAY + timedelta(days=700))
    await _doc(owner, "Home insurance renewal", INSURANCE_40_DAYS, "Insurance")
    broadband = await _doc(owner, "Broadband bill", household_texts.BROADBAND_BILL_LIVE, "Bill")

    out = await _overview(owner)

    assert _kinds(out.attention) == [("bill_unconfirmed", "Broadband bill"), ("bill_unconfirmed", "Electricity bill")]
    assert out.attention_count == 2
    assert _kinds(out.upcoming) == [
        ("bill_due", "Broadband bill"), ("bill_due", "Electricity bill"), ("renewal", "Home insurance renewal"),
    ]
    broadband_due, electricity_due, renewal = out.upcoming
    assert (broadband_due.date, broadband_due.confirmed, broadband_due.amount_due) == (date(2026, 11, 20), False, "45.00")
    assert broadband_due.source.text == "Payment due date: 20 November 2026"
    assert electricity_due.date == date(2026, 11, 23)
    assert (renewal.date, renewal.confirmed) == (TODAY + timedelta(days=40), False)
    assert (renewal.source.line, renewal.source.text) == (4, "Renewal date: 25 December 2026")
    assert out.statuses[broadband].label == out.statuses[electricity].label == "Needs confirming"
    assert out.statuses[broadband].tone == "attention"
    assert out.statuses[broadband].bill.model_dump() == {
        "amount_due": "45.00", "due_date": date(2026, 11, 20), "confirmed": False,
    }
    assert out.statuses[laptop].label == "Ready" and out.statuses[laptop].bill is None
    assert out.counts == {"total": 4, "Bill": 2, "Receipt": 1, "Insurance": 1}
    assert out.processing == 0


async def test_live_run_sources_and_outcomes(owner):
    await _doc(owner, "Electricity bill", household_texts.ELECTRICITY_BILL_LIVE, "Bill")
    laptop = await _doc(owner, "Laptop receipt", household_texts.LAPTOP_RECEIPT, "Receipt")
    await _warranty(laptop, TODAY + timedelta(days=700))
    await _doc(owner, "Home insurance renewal", INSURANCE_40_DAYS, "Insurance")
    broadband = await _doc(owner, "Broadband bill", household_texts.BROADBAND_BILL_LIVE, "Bill")

    out = await _overview(owner)

    [item] = [item for item in out.attention if item.document_id == broadband]
    assert item.amount_due == "45.00"
    assert item.date == date(2026, 11, 20)
    assert (item.source.line, item.source.text) == (5, "Payment due date: 20 November 2026")
    labels = {doc.title: (doc.outcome, doc.outcome_label) for doc in out.recent}
    assert labels["Broadband bill"] == ("due_date_flagged", "Due date flagged")
    assert labels["Laptop receipt"] == ("warranty_added", "Warranty added")
    assert labels["Home insurance renewal"] == ("renewal_found", "Renewal found")


async def test_processing_failed_and_manual_outcomes(owner):
    await _doc(owner, "Still reading", None, None, status="processing")
    await _doc(owner, "Queued", None, None, status="pending")
    await _doc(owner, "Blurry photo", None, None, status="failed")
    await _doc(owner, "Washer manual", household_texts.WASHER_MANUAL, "Manual")

    out = await _overview(owner)

    labels = {doc.title: (doc.outcome, doc.outcome_label) for doc in out.recent}
    assert labels == {
        "Still reading": ("processing", "Processing"),
        "Queued": ("processing", "Processing"),
        "Blurry photo": ("failed", "Could not read"),
        "Washer manual": ("ready", "Ready"),
    }
    assert out.processing == 2


async def test_a_confirmed_bill_with_a_pending_proposal(owner):
    bill = await _doc(owner, "October bill", household_texts.OCTOBER_BILL, "Bill")
    revision = await _revision(bill, household_texts.OCTOBER_BILL, cents=12500)
    proposal = await _proposal(bill, owner, revision)

    out = await _overview(owner)

    [item] = out.attention
    assert (item.kind, item.proposal_id, item.date, item.amount_due) == (
        "reminder_pending", proposal, date(2026, 11, 20), "125.00",
    )
    assert item.source.text == "Payment due date: 23 November 2026"
    [due] = out.upcoming
    assert (due.kind, due.confirmed, due.amount_due, due.date, due.source) == (
        "bill_due", True, "125.00", date(2026, 11, 23), None,
    )
    assert out.statuses[bill].label == "Reminder awaiting approval"
    assert out.statuses[bill].bill.model_dump() == {
        "amount_due": "125.00", "due_date": date(2026, 11, 23), "confirmed": True,
    }


async def test_a_confirmed_bill_without_a_proposal_is_confirmed(owner):
    bill = await _doc(owner, "October bill", household_texts.OCTOBER_BILL, "Bill")
    await _revision(bill, household_texts.OCTOBER_BILL)

    out = await _overview(owner)

    assert out.attention == []
    assert (out.statuses[bill].label, out.statuses[bill].tone) == ("Confirmed · revision 1", "neutral")
    [recent] = out.recent
    assert (recent.outcome, recent.outcome_label) == ("bill_confirmed", "Bill confirmed")


async def test_a_stale_split_needs_attention(owner):
    bill = await _doc(owner, "October bill", household_texts.OCTOBER_BILL, "Bill")
    first = await _revision(bill, household_texts.OCTOBER_BILL, cents=12000)
    await _split(bill, first)
    await _revision(bill, household_texts.OCTOBER_BILL, number=2, cents=12347)

    out = await _overview(owner)

    [item] = out.attention
    assert (item.kind, item.amount_due) == ("split_stale", "123.47")
    assert item.source.text == "Total amount due: EUR 123.47"
    assert out.statuses[bill].label == "Split out of date"


async def test_a_failed_upload_needs_attention(owner):
    failed = await _doc(owner, "Blurry photo", None, None, status="failed")

    out = await _overview(owner)

    [item] = out.attention
    assert (item.kind, item.document_id, item.source) == ("processing_failed", failed, None)
    assert (out.statuses[failed].label, out.statuses[failed].tone) == ("Could not read this file", "danger")


async def test_a_warranty_ending_within_30_days(owner):
    soon = await _doc(owner, "Kettle receipt", household_texts.KETTLE_RECEIPT, "Receipt")
    await _warranty(soon, TODAY + timedelta(days=30))
    later = await _doc(owner, "Laptop receipt", household_texts.LAPTOP_RECEIPT, "Receipt")
    await _warranty(later, TODAY + timedelta(days=31))
    gone = await _doc(owner, "Old receipt", household_texts.KETTLE_RECEIPT, "Receipt")
    await _warranty(gone, TODAY - timedelta(days=1))

    out = await _overview(owner)

    assert [(item.kind, item.document_id, item.date) for item in out.attention] == [
        ("warranty_ending", soon, TODAY + timedelta(days=30)),
    ]
    assert [(item.kind, item.document_id, item.confirmed) for item in out.upcoming] == [
        ("warranty_end", soon, True), ("warranty_end", later, True),
    ]


async def test_attention_follows_the_kind_order(owner):
    await _doc(owner, "A failed", None, None, status="failed")
    bill = await _doc(owner, "Z bill", household_texts.ELECTRICITY_BILL_LIVE, "Bill")
    confirmed = await _doc(owner, "M bill", household_texts.OCTOBER_BILL, "Bill")
    revision = await _revision(confirmed, household_texts.OCTOBER_BILL)
    await _proposal(confirmed, owner, revision)
    receipt = await _doc(owner, "B receipt", household_texts.KETTLE_RECEIPT, "Receipt")
    await _warranty(receipt, TODAY + timedelta(days=3))

    out = await _overview(owner)

    assert [item.kind for item in out.attention] == [
        "reminder_pending", "bill_unconfirmed", "processing_failed", "warranty_ending",
    ]
    assert out.attention_count == len(out.attention) == 4
    assert out.statuses[bill].label == "Needs confirming"


async def test_past_dates_are_left_out_of_upcoming(owner):
    await _doc(owner, "September bill", household_texts.SEPTEMBER_BILL, "Bill")

    out = await _overview(owner)

    assert out.upcoming == []
    assert out.next_after_window is None
    [item] = out.attention
    assert item.date == date(2026, 10, 24)


async def test_calm_when_the_only_date_is_90_days_away(owner):
    end = TODAY + timedelta(days=90)
    text = f"TENANCY AGREEMENT\nTerm: 1 March 2026 to {end.day} {end:%B %Y}"
    contract = await _doc(owner, "Tenancy", text, "Contract")
    await _doc(owner, "Washer manual", household_texts.WASHER_MANUAL, "Manual")

    out = await _overview(owner)

    assert out.attention == []
    assert out.attention_count == 0
    assert out.upcoming == []
    assert (out.next_after_window.kind, out.next_after_window.document_id) == ("contract_end", contract)
    assert out.next_after_window.date == end
    assert out.next_after_window.source.text == text.splitlines()[1]


async def test_recent_is_the_newest_five(owner):
    for number in range(7):
        await _doc(owner, f"Doc {number}", household_texts.WASHER_MANUAL, "Manual", minutes=number)

    out = await _overview(owner)

    assert [doc.title for doc in out.recent] == ["Doc 6", "Doc 5", "Doc 4", "Doc 3", "Doc 2"]
    assert out.recent[0].kind == "Manual"
    assert len(out.statuses) == 7
    assert out.counts == {"total": 7, "Manual": 7}


# One test per row of the outcome table, each with a single document.
@pytest.mark.parametrize("setup, outcome, label", [
    ("failed", "failed", "Could not read"),
    ("processing", "processing", "Processing"),
    ("flagged", "due_date_flagged", "Due date flagged"),
    ("confirmed", "bill_confirmed", "Bill confirmed"),
    ("warranty", "warranty_added", "Warranty added"),
    ("renewal", "renewal_found", "Renewal found"),
    ("term_end", "term_end_found", "Term end found"),
    ("ready", "ready", "Ready"),
])
async def test_each_outcome_row(owner, setup, outcome, label):
    if setup == "failed":
        await _doc(owner, "Doc", household_texts.ELECTRICITY_BILL_LIVE, "Bill", status="failed")
    elif setup == "processing":
        await _doc(owner, "Doc", household_texts.ELECTRICITY_BILL_LIVE, "Bill", status="processing")
    elif setup == "flagged":
        await _doc(owner, "Doc", household_texts.ELECTRICITY_BILL_LIVE, "Bill")
    elif setup == "confirmed":
        doc = await _doc(owner, "Doc", household_texts.OCTOBER_BILL, "Bill")
        await _revision(doc, household_texts.OCTOBER_BILL)
    elif setup == "warranty":
        doc = await _doc(owner, "Doc", household_texts.LAPTOP_RECEIPT, "Receipt")
        await _warranty(doc, date(2028, 1, 8))
    elif setup == "renewal":
        await _doc(owner, "Doc", household_texts.CAR_INSURANCE, "Insurance")
    elif setup == "term_end":
        await _doc(owner, "Doc", household_texts.TENANCY, "Contract")
    else:
        await _doc(owner, "Doc", household_texts.KETTLE_RECEIPT, "Receipt")

    [recent] = (await _overview(owner)).recent

    assert (recent.outcome, recent.outcome_label) == (outcome, label)


async def test_a_manual_is_never_text_scanned(owner, monkeypatch):
    calls = []
    monkeypatch.setattr(overview_service, "extract_bill_review", lambda text: calls.append(text))
    monkeypatch.setattr(overview_service, "extract_key_dates", lambda text, kind: calls.append(text) or [])
    manual = await _doc(owner, "Smart meter manual", MANUAL_WITH_BILL_WORDS, "Manual")

    out = await _overview(owner)

    assert calls == []
    [recent] = out.recent
    assert (recent.outcome, recent.outcome_label) == ("ready", "Ready")
    assert out.attention == [] and out.upcoming == []
    assert out.statuses[manual].label == "Ready"


async def test_the_same_text_typed_bill_has_an_overview_item(owner):
    bill = await _doc(owner, "Smart meter bill", MANUAL_WITH_BILL_WORDS, "Bill")

    out = await _overview(owner)

    assert [(item.kind, item.document_id) for item in out.attention] == [("bill_unconfirmed", bill)]


async def test_scope_150_manuals_and_3_bills(owner, monkeypatch):
    reviews, key_dates = [], []
    real_review, real_dates = overview_service.extract_bill_review, overview_service.extract_key_dates
    monkeypatch.setattr(overview_service, "extract_bill_review", lambda text: reviews.append(1) or real_review(text))
    monkeypatch.setattr(overview_service, "extract_key_dates",
                        lambda text, kind: key_dates.append(1) or real_dates(text, kind))
    big = ("Washer-dryer WD8 user manual. Clean the filter once a month.\n" * 3300)[:200_000]
    async with async_session() as db:
        manuals = [
            Document(user_id=owner, title=f"Manual {n}", raw_text=big, document_type="Manual",
                     processing_status="complete", s3_key_original=f"users/{owner}/m{n}.pdf")
            for n in range(150)
        ]
        db.add_all(manuals)
        await db.commit()
        manual_ids = {str(doc.id) for doc in manuals}
    for name in ("Electricity", "Broadband", "October"):
        await _doc(owner, f"{name} bill", household_texts.ELECTRICITY_BILL_LIVE, "Bill")

    statements = []

    def record(conn, cursor, statement, parameters, context, executemany):
        statements.append((statement, parameters))

    event.listen(engine.sync_engine, "before_cursor_execute", record)
    try:
        out = await _overview(owner)
    finally:
        event.remove(engine.sync_engine, "before_cursor_execute", record)

    assert len(reviews) == 3
    assert len(key_dates) == 3
    text_queries = [(sql, params) for sql, params in statements if "raw_text" in sql]
    assert len(text_queries) == 1
    [(_, params)] = text_queries
    assert not manual_ids & {str(value) for value in params}
    assert out.counts == {"total": 153, "Manual": 150, "Bill": 3}
    assert len(out.statuses) == 153


async def test_the_route_serves_the_signed_in_owner(owner):
    bill = await _doc(owner, "Broadband bill", household_texts.ELECTRICITY_BILL_LIVE, "Bill")
    headers = {"Authorization": f"Bearer {create_access_token(owner)}"}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/overview", headers=headers)
        unauthenticated = await client.get("/api/v1/overview")
    assert response.status_code == 200
    body = response.json()
    assert body["attention_count"] == 1
    assert body["attention"][0]["document_id"] == str(bill)
    assert body["statuses"][str(bill)]["label"] == "Needs confirming"
    assert set(body) == {"attention", "attention_count", "upcoming", "next_after_window", "recent", "counts",
                         "statuses", "processing"}
    assert unauthenticated.status_code == 401
