import pytest

from app.services import storage_service


def test_get_s3_client_uses_minio_configuration(monkeypatch):
    captured = {}
    client = object()

    def fake_client(service_name, **kwargs):
        captured["service_name"] = service_name
        captured.update(kwargs)
        return client

    monkeypatch.setattr(storage_service.boto3, "client", fake_client)
    monkeypatch.setattr(storage_service.settings, "S3_ENDPOINT", "http://minio:9000")
    monkeypatch.setattr(storage_service.settings, "S3_ACCESS_KEY", "access")
    monkeypatch.setattr(storage_service.settings, "S3_SECRET_KEY", "secret")

    assert storage_service.get_s3_client() is client
    assert captured == {
        "service_name": "s3",
        "endpoint_url": "http://minio:9000",
        "aws_access_key_id": "access",
        "aws_secret_access_key": "secret",
        "config": captured["config"],
        "region_name": "us-east-1",
    }
    assert captured["config"].signature_version == "s3v4"


def test_get_s3_client_defers_credentials_to_aws(monkeypatch):
    captured = {}

    def fake_client(service_name, **kwargs):
        captured["service_name"] = service_name
        captured.update(kwargs)
        return object()

    monkeypatch.setattr(storage_service.boto3, "client", fake_client)
    monkeypatch.setattr(storage_service.settings, "S3_ENDPOINT", "")
    monkeypatch.setattr(storage_service.settings, "S3_ACCESS_KEY", "")
    monkeypatch.setattr(storage_service.settings, "S3_SECRET_KEY", "")
    monkeypatch.setattr(storage_service.settings, "AWS_REGION", "eu-west-1")

    storage_service.get_s3_client()

    assert captured["endpoint_url"] is None
    assert captured["aws_access_key_id"] is None
    assert captured["aws_secret_access_key"] is None
    assert captured["region_name"] == "eu-west-1"


@pytest.mark.parametrize(
    ("filename", "expected_suffix"),
    [("receipt.PDF", ".PDF"), ("scan", ".bin")],
)
def test_upload_file_uses_user_prefix_and_detected_extension(monkeypatch, filename, expected_suffix):
    calls = []

    class UploadS3:
        def put_object(self, **kwargs):
            calls.append(kwargs)

    monkeypatch.setattr(storage_service, "get_s3_client", lambda: UploadS3())
    monkeypatch.setattr(storage_service.uuid, "uuid4", lambda: "generated-id")

    key = storage_service.upload_file(b"contents", "user-123", filename, "application/pdf")

    assert key == f"users/user-123/generated-id{expected_suffix}"
    assert calls == [{
        "Bucket": "documents",
        "Key": key,
        "Body": b"contents",
        "ContentType": "application/pdf",
    }]


def test_get_presigned_url_uses_public_endpoint(monkeypatch):
    captured = {}

    class PresigningS3:
        def generate_presigned_url(self, operation, **kwargs):
            captured["operation"] = operation
            captured.update(kwargs)
            return "http://public.test/signed"

    def fake_client(endpoint=None):
        captured["endpoint"] = endpoint
        return PresigningS3()

    monkeypatch.setattr(storage_service, "get_s3_client", fake_client)
    monkeypatch.setattr(storage_service.settings, "S3_PUBLIC_ENDPOINT", "http://public.test")

    url = storage_service.get_presigned_url("users/u/receipt.pdf", expires_in=120)

    assert url == "http://public.test/signed"
    assert captured == {
        "endpoint": "http://public.test",
        "operation": "get_object",
        "Params": {"Bucket": "documents", "Key": "users/u/receipt.pdf"},
        "ExpiresIn": 120,
    }


def test_delete_file_deletes_requested_key(monkeypatch):
    calls = []

    class DeleteS3:
        def delete_object(self, **kwargs):
            calls.append(kwargs)

    monkeypatch.setattr(storage_service, "get_s3_client", lambda: DeleteS3())

    storage_service.delete_file("users/u/receipt.pdf")

    assert calls == [{"Bucket": "documents", "Key": "users/u/receipt.pdf"}]


class _Paginator:
    def paginate(self, **kwargs):
        assert kwargs == {"Bucket": "documents", "Prefix": "users/user-123/"}
        return [
            {"Contents": [{"Key": "users/user-123/a.pdf"}, {"Key": "users/user-123/b.png"}]},
            {},
        ]


class _S3:
    def __init__(self):
        self.deleted = []

    def get_paginator(self, operation):
        assert operation == "list_objects_v2"
        return _Paginator()

    def delete_objects(self, **kwargs):
        self.deleted.append(kwargs)


def test_delete_user_files_removes_entire_prefix(monkeypatch):
    s3 = _S3()
    monkeypatch.setattr(storage_service, "get_s3_client", lambda: s3)

    deleted = storage_service.delete_user_files("user-123")

    assert deleted == 2
    assert s3.deleted == [{
        "Bucket": "documents",
        "Delete": {
            "Objects": [
                {"Key": "users/user-123/a.pdf"},
                {"Key": "users/user-123/b.png"},
            ],
            "Quiet": True,
        },
    }]


def test_delete_user_files_handles_empty_prefix(monkeypatch):
    class EmptyPaginator:
        def paginate(self, **kwargs):
            return [{}]

    class EmptyS3:
        def get_paginator(self, operation):
            return EmptyPaginator()

        def delete_objects(self, **kwargs):
            raise AssertionError("delete_objects should not be called")

    monkeypatch.setattr(storage_service, "get_s3_client", lambda: EmptyS3())
    assert storage_service.delete_user_files("nobody") == 0


@pytest.mark.parametrize(
    ("response", "expected_type"),
    [
        ({"Body": None, "ContentType": "image/png"}, "image/png"),
        ({"Body": None}, "application/octet-stream"),
    ],
)
def test_download_file_returns_bytes_and_content_type(monkeypatch, response, expected_type):
    class Body:
        def read(self):
            return b"downloaded"

    class DownloadS3:
        def get_object(self, **kwargs):
            assert kwargs == {"Bucket": "documents", "Key": "users/u/file"}
            return {**response, "Body": Body()}

    monkeypatch.setattr(storage_service, "get_s3_client", lambda: DownloadS3())

    assert storage_service.download_file("users/u/file") == (b"downloaded", expected_type)


def test_ensure_bucket_exists_leaves_existing_bucket_unchanged(monkeypatch):
    calls = []

    class ExistingS3:
        def head_bucket(self, **kwargs):
            calls.append(("head", kwargs))

        def create_bucket(self, **kwargs):
            calls.append(("create", kwargs))

    monkeypatch.setattr(storage_service, "get_s3_client", lambda: ExistingS3())

    storage_service.ensure_bucket_exists()

    assert calls == [("head", {"Bucket": "documents"})]


def test_ensure_bucket_exists_creates_missing_bucket(monkeypatch):
    calls = []

    class ClientError(Exception):
        pass

    class Exceptions:
        pass

    Exceptions.ClientError = ClientError

    class MissingS3:
        exceptions = Exceptions

        def head_bucket(self, **kwargs):
            calls.append(("head", kwargs))
            raise ClientError

        def create_bucket(self, **kwargs):
            calls.append(("create", kwargs))

    monkeypatch.setattr(storage_service, "get_s3_client", lambda: MissingS3())

    storage_service.ensure_bucket_exists()

    assert calls == [
        ("head", {"Bucket": "documents"}),
        ("create", {"Bucket": "documents"}),
    ]
