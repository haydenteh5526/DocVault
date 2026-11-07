import cv2
import numpy as np


def preprocess_image(file_bytes: bytes) -> bytes:
    """Deskew, enhance contrast, and denoise an image for better OCR."""
    arr = np.frombuffer(file_bytes, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        return file_bytes

    # Convert to grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Denoise
    gray = cv2.fastNlMeansDenoising(gray, h=10)

    # Enhance contrast with CLAHE
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    gray = clahe.apply(gray)

    # Deskew
    gray = _deskew(gray)

    # Encode back to PNG
    _, buf = cv2.imencode(".png", gray)
    return buf.tobytes()


def _deskew(image: np.ndarray) -> np.ndarray:
    """Correct skew using minimum area rectangle on detected edges."""
    rows, columns = np.where(image < 200)
    coords = np.column_stack((columns, rows)).astype(np.float32)
    if len(coords) < 100:
        return image
    # Either edge of a level text block may be reported as 0 or 90 degrees.
    # Use the small tilt of the horizontal edge in image (x, y) coordinates.
    angle = (cv2.minAreaRect(coords)[-1] + 45) % 90 - 45
    if abs(angle) < 0.5:
        return image
    h, w = image.shape[:2]
    center = (w // 2, h // 2)
    M = cv2.getRotationMatrix2D(center, angle, 1.0)
    return cv2.warpAffine(image, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
