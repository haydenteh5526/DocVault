import cv2
import numpy as np

from app.services import image_processing


def test_preprocess_returns_original_bytes_when_decode_fails():
    invalid = b"not-an-image"
    assert image_processing.preprocess_image(invalid) == invalid


def test_preprocess_emits_grayscale_png():
    source = np.full((80, 120, 3), 255, dtype=np.uint8)
    cv2.putText(source, "TEST", (5, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 0), 2)
    encoded, buffer = cv2.imencode(".jpg", source)
    assert encoded

    result = image_processing.preprocess_image(buffer.tobytes())
    decoded = cv2.imdecode(np.frombuffer(result, np.uint8), cv2.IMREAD_UNCHANGED)

    assert decoded is not None
    assert decoded.ndim == 2
    assert decoded.shape == source.shape[:2]


def test_deskew_skips_sparse_and_nearly_level_images(monkeypatch):
    sparse = np.full((20, 20), 255, dtype=np.uint8)
    assert image_processing._deskew(sparse) is sparse

    dense = np.zeros((20, 20), dtype=np.uint8)
    monkeypatch.setattr(cv2, "minAreaRect", lambda coords: ((0, 0), (1, 1), -0.2))
    assert image_processing._deskew(dense) is dense


def test_deskew_rotates_for_both_angle_conventions(monkeypatch):
    dense = np.zeros((20, 20), dtype=np.uint8)
    seen_angles = []

    monkeypatch.setattr(cv2, "getRotationMatrix2D", lambda center, angle, scale: seen_angles.append(angle) or "matrix")
    monkeypatch.setattr(cv2, "warpAffine", lambda image, matrix, size, **kwargs: image + 1)

    monkeypatch.setattr(cv2, "minAreaRect", lambda coords: ((0, 0), (1, 1), -60.0))
    assert np.all(image_processing._deskew(dense) == 1)
    monkeypatch.setattr(cv2, "minAreaRect", lambda coords: ((0, 0), (1, 1), 10.0))
    assert np.all(image_processing._deskew(dense) == 1)
    assert seen_angles == [-30.0, -10.0]
