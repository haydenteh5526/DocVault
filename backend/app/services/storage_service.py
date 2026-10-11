import uuid

import boto3
from botocore.config import Config

from app.config import settings


def get_s3_client(endpoint: str | None = None):
    # Resolve endpoint: explicit arg > configured endpoint > None (real AWS S3).
    resolved_endpoint = endpoint or settings.S3_ENDPOINT or None
    # When talking to real AWS S3 (no custom endpoint), sign with the deployment
    # region and let boto3 resolve credentials from the environment / IAM task
    # role (empty keys -> None). Against MinIO locally, keep the explicit keys and
    # the us-east-1 signing region MinIO expects, so local behaviour is unchanged.
    if resolved_endpoint is None:
        region = settings.AWS_REGION
        access_key = settings.S3_ACCESS_KEY or None
        secret_key = settings.S3_SECRET_KEY or None
    else:
        region = "us-east-1"
        access_key = settings.S3_ACCESS_KEY
        secret_key = settings.S3_SECRET_KEY
    return boto3.client(
        "s3",
        endpoint_url=resolved_endpoint,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        config=Config(signature_version="s3v4"),
        region_name=region,
    )


def upload_file(file_bytes: bytes, user_id: str, filename: str, content_type: str) -> str:
    s3 = get_s3_client()
    ext = filename.rsplit(".", 1)[-1] if "." in filename else "bin"
    key = f"users/{user_id}/{uuid.uuid4()}.{ext}"
    s3.put_object(
        Bucket=settings.S3_BUCKET,
        Key=key,
        Body=file_bytes,
        ContentType=content_type,
    )
    return key


def get_presigned_url(key: str, expires_in: int = 900) -> str:
    # Sign with the public endpoint so the browser-facing URL has a valid signature
    s3 = get_s3_client(endpoint=settings.S3_PUBLIC_ENDPOINT)
    return s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.S3_BUCKET, "Key": key},
        ExpiresIn=expires_in,
    )


def delete_file(key: str) -> None:
    s3 = get_s3_client()
    s3.delete_object(Bucket=settings.S3_BUCKET, Key=key)


def delete_user_files(user_id: str) -> int:
    """Delete every object owned by a user and return the number removed.

    Listing by the user prefix also catches orphaned objects that no longer
    have a matching database row. S3 accepts at most 1,000 keys per bulk
    delete request, which is also the paginator's normal page size.
    """
    s3 = get_s3_client()
    deleted = 0
    paginator = s3.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=settings.S3_BUCKET, Prefix=f"users/{user_id}/"):
        objects = [{"Key": item["Key"]} for item in page.get("Contents", [])]
        if not objects:
            continue
        s3.delete_objects(Bucket=settings.S3_BUCKET, Delete={"Objects": objects, "Quiet": True})
        deleted += len(objects)
    return deleted


def download_file(key: str) -> tuple[bytes, str]:
    """Fetch an object's bytes and content type from S3."""
    s3 = get_s3_client()
    obj = s3.get_object(Bucket=settings.S3_BUCKET, Key=key)
    return obj["Body"].read(), obj.get("ContentType", "application/octet-stream")


def ensure_bucket_exists() -> None:
    s3 = get_s3_client()
    try:
        s3.head_bucket(Bucket=settings.S3_BUCKET)
    except s3.exceptions.ClientError:
        s3.create_bucket(Bucket=settings.S3_BUCKET)
