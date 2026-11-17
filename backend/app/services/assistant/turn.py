"""One chat turn: answer a pending question, pick a tool (model, then keyword router) and run it."""
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.base import ConversationMessage
from app.schemas.assistant import Selection, SelectorMeta, TurnResult
from app.services.assistant.bills import owner_bills
from app.services.assistant.model import SelectorInput, select_by_model
from app.services.assistant.rules import fill_pending, read_list_number, select_by_rules
from app.services.assistant.tools import run_selection
from app.services.housemates import list_housemates
from app.services.rag_service import ChatTurn


def _document_id(action: dict | None) -> uuid.UUID | None:
    try:
        return uuid.UUID(action["document_id"]) if action and action.get("document_id") else None
    except (ValueError, TypeError, KeyError):
        return None


async def run_turn(
    db: AsyncSession,
    user_id: uuid.UUID,
    question: str,
    scope_id: uuid.UUID | None,
    earlier: list[ConversationMessage],
    scope_title: str | None = None,
) -> TurnResult:
    # Read the earlier messages first: the tools may commit or roll back this session.
    past = [(m.role, m.content, m.action) for m in earlier]
    bills = await owner_bills(db, user_id)
    housemates = [person.label for person in await list_housemates(db, user_id)]
    ref_by_document = {bill.document.id: bill.ref for bill in bills}

    focus_id = None
    for role, _, action in reversed(past):
        document_id = _document_id(action)
        if role == "assistant" and document_id in ref_by_document:
            focus_id = document_id
            break

    rag_history = [ChatTurn(role=role, content=content) for role, content, _ in past]

    if past and past[-1][0] == "assistant":
        action = past[-1][2] or {}
        if action.get("kind") == "question" and action.get("pending"):
            try:
                pending = Selection.model_validate(action["pending"])
                number = read_list_number(question) if action.get("missing") == "which_bill" else None
                if number is not None:
                    # A list number means the list the owner was shown, not today's list of bills.
                    shown = action.get("options") or []
                    matches = (
                        [bill for bill in bills if bill.title == shown[number - 1]]
                        if 1 <= number <= len(shown)
                        else []
                    )
                    filled = (
                        pending.model_copy(update={"document_ref": matches[0].ref}) if len(matches) == 1 else None
                    )
                else:
                    filled = fill_pending(pending, action.get("missing"), question, bills, housemates)
            except Exception:  # noqa: BLE001 - an unreadable stored question is treated as a new request
                filled = None
            if filled is not None:
                meta = SelectorMeta(selector="pending", model=None, fallback_reason=None)
                return await run_selection(db, user_id, filled, bills, scope_id, focus_id, question, rag_history, meta, scope_title)

    history: list[tuple[str, str]] = []
    for role, content, action in past[-6:]:
        if role == "user":
            history.append(("user", content))
            continue
        # Earlier assistant prose is never sent: a retrieval answer can repeat text from a document.
        kind = (action or {}).get("kind", "reply")
        ref = ref_by_document.get(_document_id(action))
        history.append(("assistant", f"[{kind} for {ref}]" if ref else f"[{kind}]"))

    data = SelectorInput(
        question=question,
        history=history,
        bills=[(bill.ref, bill.title) for bill in bills],
        focus_ref=ref_by_document.get(focus_id),
        housemates=housemates,
    )
    try:
        selection, reason = await select_by_model(data)
    except Exception as error:  # noqa: BLE001 - a selector failure of any kind falls back to the router
        selection, reason = None, f"error: {type(error).__name__}"
    if selection is None:
        selection = select_by_rules(question, bills, housemates)
        meta = SelectorMeta(
            selector="rules",
            model=None,
            fallback_reason=None if reason == "no model configured" else reason,
        )
    else:
        meta = SelectorMeta(selector="model", model=settings.ASSISTANT_MODEL, fallback_reason=None)
    return await run_selection(db, user_id, selection, bills, scope_id, focus_id, question, rag_history, meta, scope_title)
