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


def test_deskew_preserves_level_lines_and_straightens_tilt_in_either_direction():
    source = np.full((180, 300), 255, dtype=np.uint8)
    cv2.rectangle(source, (35, 80), (265, 99), 0, -1)
    assert np.array_equal(image_processing._deskew(source), source)
    for angle in [-10, 10]:
        matrix = cv2.getRotationMatrix2D((150, 90), angle, 1)
        tilted = cv2.warpAffine(source, matrix, (300, 180), borderValue=255)
        corrected = image_processing._deskew(tilted)
        y, x = np.where(corrected < 128)
        assert np.ptp(y) <= 21
        assert np.ptp(x) >= 228
