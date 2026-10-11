import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import Column, ForeignKey, Index, String, Table, Text, func
from sqlalchemy.dialects.postgresql import JSON
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


# Many-to-many: documents <-> tags
document_tags = Table(
    "document_tags",
    Base.metadata,
    Column("document_id", ForeignKey("documents.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(100))
    cognito_id: Mapped[str | None] = mapped_column(String(255), unique=True)
    is_verified: Mapped[bool] = mapped_column(default=False)
    verification_token: Mapped[str | None] = mapped_column(String(255))
    totp_secret: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    documents: Mapped[list["Document"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    categories: Mapped[list["Category"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("categories.id"))
    icon: Mapped[str | None] = mapped_column(String(50))

    user: Mapped["User"] = relationship(back_populates="categories")
    documents: Mapped[list["Document"]] = relationship(back_populates="category")


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    category_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("categories.id", ondelete="SET NULL"))
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    brand: Mapped[str | None] = mapped_column(String(100))
    model: Mapped[str | None] = mapped_column(String(100))
    document_type: Mapped[str | None] = mapped_column(String(50))
    raw_text: Mapped[str | None] = mapped_column(Text)
    summary: Mapped[str | None] = mapped_column(Text)
    s3_key_original: Mapped[str] = mapped_column(String(500), nullable=False)
    s3_key_thumbnail: Mapped[str | None] = mapped_column(String(500))
    file_size: Mapped[int | None]
    page_count: Mapped[int] = mapped_column(default=1)
    ocr_confidence: Mapped[float | None]
    processing_status: Mapped[str] = mapped_column(String(20), server_default="complete")
    is_favourite: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    user: Mapped["User"] = relationship(back_populates="documents")
    category: Mapped["Category | None"] = relationship(back_populates="documents")
    chunks: Mapped[list["DocChunk"]] = relationship(back_populates="document", cascade="all, delete-orphan")
    warranty: Mapped["Warranty | None"] = relationship(back_populates="document", cascade="all, delete-orphan", uselist=False)
    tags: Mapped[list["Tag"]] = relationship(secondary=document_tags, back_populates="documents")
    versions: Mapped[list["DocumentVersion"]] = relationship(back_populates="document", cascade="all, delete-orphan", order_by="desc(DocumentVersion.version_number)")

    __table_args__ = (
        Index("idx_documents_user", "user_id"),
        Index("idx_documents_category", "category_id"),
    )


class DocChunk(Base):
    __tablename__ = "doc_chunks"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"))
    chunk_index: Mapped[int] = mapped_column(nullable=False)
    chunk_text: Mapped[str] = mapped_column(Text, nullable=False)
    section_title: Mapped[str | None] = mapped_column(String(255))
    embedding = mapped_column(Vector(1536))

    document: Mapped["Document"] = relationship(back_populates="chunks")

    __table_args__ = (
        Index("idx_chunks_document", "document_id"),
    )


class Warranty(Base):
    __tablename__ = "warranties"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), unique=True)
    purchase_date: Mapped[datetime | None]
    expiry_date: Mapped[datetime | None]
    notes: Mapped[str | None] = mapped_column(Text)

    document: Mapped["Document"] = relationship(back_populates="warranty")


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    color: Mapped[str | None] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    documents: Mapped[list["Document"]] = relationship(secondary=document_tags, back_populates="tags")

    __table_args__ = (
        Index("idx_tags_user", "user_id"),
        Index("uq_tags_user_name", "user_id", "name", unique=True),
    )


class DocumentVersion(Base):
    __tablename__ = "document_versions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"))
    raw_text: Mapped[str | None] = mapped_column(Text)
    version_number: Mapped[int] = mapped_column(nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    document: Mapped["Document"] = relationship(back_populates="versions")

    __table_args__ = (
        Index("idx_versions_document", "document_id"),
    )


class PushToken(Base):
    __tablename__ = "push_tokens"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    token: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    platform: Mapped[str | None] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    __table_args__ = (
        Index("idx_push_tokens_user", "user_id"),
    )


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    is_pinned: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    messages: Mapped[list["ConversationMessage"]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan", order_by="ConversationMessage.created_at"
    )

    __table_args__ = (
        Index("idx_conversations_user", "user_id"),
        Index("idx_conversations_updated", "user_id", "updated_at"),
    )


class ConversationMessage(Base):
    __tablename__ = "conversation_messages"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    conversation_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"))
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # "user" or "assistant"
    content: Mapped[str] = mapped_column(Text, nullable=False)
    sources: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    conversation: Mapped["Conversation"] = relationship(back_populates="messages")

    __table_args__ = (
        Index("idx_conv_messages_conversation", "conversation_id"),
    )
