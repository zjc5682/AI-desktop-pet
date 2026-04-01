from __future__ import annotations

import base64
import io
import math
import re
from dataclasses import dataclass
from typing import Any


@dataclass
class ScreenshotOcrFragment:
    text: str
    score: float | None = None
    left: float | None = None
    top: float | None = None
    right: float | None = None
    bottom: float | None = None


@dataclass
class ScreenshotOcrLine:
    text: str
    score: float | None = None


class ScreenshotService:
    def __init__(self) -> None:
        from PIL import Image  # type: ignore
        import numpy as np  # type: ignore
        from rapidocr_onnxruntime import RapidOCR  # type: ignore

        self.Image = Image
        self.np = np
        self.engine = RapidOCR()

    def extract(self, image_base64: str, mime_type: str | None = None) -> dict[str, Any]:
        _ = mime_type
        image_bytes = base64.b64decode(image_base64)
        image = self.Image.open(io.BytesIO(image_bytes)).convert('RGB')
        ocr_result = self.engine(self.np.asarray(image))

        lines = self._normalize_result(ocr_result)
        text = '\n'.join(
            line.text for line in lines if isinstance(line.text, str) and line.text.strip()
        ).strip()

        return {
            'text': text,
            'lines': [
                {
                    'text': line.text,
                    'score': line.score,
                }
                for line in lines
            ],
        }

    def _normalize_result(self, raw_result: Any) -> list[ScreenshotOcrLine]:
        payload = raw_result[0] if isinstance(raw_result, tuple) and raw_result else raw_result
        fragments = self._extract_fragments(payload)
        return self._merge_fragments(fragments)

    def _extract_fragments(self, payload: Any) -> list[ScreenshotOcrFragment]:
        fragments: list[ScreenshotOcrFragment] = []

        txts = getattr(payload, 'txts', None)
        scores = getattr(payload, 'scores', None)
        boxes = getattr(payload, 'boxes', None) or getattr(payload, 'dt_boxes', None)
        if isinstance(txts, list):
            for index, text in enumerate(txts):
                normalized_text = self._normalize_text(text)
                if not normalized_text:
                    continue
                score = self._safe_score(scores[index]) if isinstance(scores, list) and index < len(scores) else None
                box = boxes[index] if isinstance(boxes, list) and index < len(boxes) else None
                fragment = self._build_fragment(normalized_text, score, box)
                if fragment is not None:
                    fragments.append(fragment)
            return fragments

        if isinstance(payload, list):
            for item in payload:
                if isinstance(item, (list, tuple)) and len(item) >= 2:
                    box = item[0]
                    text = self._normalize_text(item[1])
                    score = self._safe_score(item[2]) if len(item) >= 3 else None
                    fragment = self._build_fragment(text, score, box)
                    if fragment is not None:
                        fragments.append(fragment)
            return fragments

        return fragments

    def _build_fragment(
        self,
        text: str,
        score: float | None,
        box: Any = None,
    ) -> ScreenshotOcrFragment | None:
        normalized_text = self._normalize_text(text)
        if not normalized_text:
            return None
        if score is not None and score < 0.12:
            return None
        if self._is_noise(normalized_text, score):
            return None

        left = top = right = bottom = None
        normalized_box = self._normalize_box(box)
        if normalized_box is not None:
            left, top, right, bottom = normalized_box

        return ScreenshotOcrFragment(
            text=normalized_text,
            score=score,
            left=left,
            top=top,
            right=right,
            bottom=bottom,
        )

    def _merge_fragments(
        self,
        fragments: list[ScreenshotOcrFragment],
    ) -> list[ScreenshotOcrLine]:
        if not fragments:
            return []

        positioned = [fragment for fragment in fragments if self._has_position(fragment)]
        if not positioned:
            deduped: list[ScreenshotOcrLine] = []
            seen: set[str] = set()
            for fragment in fragments:
                dedupe_key = self._dedupe_key(fragment.text)
                if dedupe_key in seen:
                    continue
                seen.add(dedupe_key)
                deduped.append(ScreenshotOcrLine(text=fragment.text, score=fragment.score))
            return deduped

        positioned.sort(
            key=lambda fragment: (
                round(self._center_y(fragment), 2),
                round(fragment.left or 0.0, 2),
            )
        )

        grouped: list[list[ScreenshotOcrFragment]] = []
        for fragment in positioned:
            if not grouped:
                grouped.append([fragment])
                continue

            current_group = grouped[-1]
            if self._is_same_line(current_group, fragment):
                current_group.append(fragment)
            else:
                grouped.append([fragment])

        lines: list[ScreenshotOcrLine] = []
        seen: set[str] = set()
        for group in grouped:
            group.sort(key=lambda fragment: fragment.left or 0.0)
            merged_text = ''
            scores: list[float] = []

            for fragment in group:
                merged_text = self._append_fragment_text(merged_text, fragment.text)
                if fragment.score is not None:
                    scores.append(fragment.score)

            merged_text = self._finalize_line_text(merged_text)
            if not merged_text:
                continue

            dedupe_key = self._dedupe_key(merged_text)
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)
            lines.append(
                ScreenshotOcrLine(
                    text=merged_text,
                    score=(sum(scores) / len(scores)) if scores else None,
                )
            )

        return lines

    def _normalize_text(self, text: Any) -> str:
        if not isinstance(text, str):
            return ''
        normalized = re.sub(r'\s+', ' ', text).strip()
        normalized = normalized.replace(' ,', ',').replace(' .', '.')
        normalized = normalized.replace(' :', ':').replace(' ;', ';')
        return normalized

    def _safe_score(self, value: Any) -> float | None:
        if isinstance(value, (int, float)):
            score = float(value)
            if math.isfinite(score):
                return score
        return None

    def _normalize_box(
        self,
        box: Any,
    ) -> tuple[float, float, float, float] | None:
        if not isinstance(box, (list, tuple)) or not box:
            return None

        points: list[tuple[float, float]] = []
        for item in box:
            if (
                isinstance(item, (list, tuple))
                and len(item) >= 2
                and isinstance(item[0], (int, float))
                and isinstance(item[1], (int, float))
            ):
                points.append((float(item[0]), float(item[1])))

        if len(points) >= 2:
            xs = [point[0] for point in points]
            ys = [point[1] for point in points]
            return min(xs), min(ys), max(xs), max(ys)

        if (
            len(box) >= 4
            and all(isinstance(item, (int, float)) for item in box[:4])
        ):
            x1, y1, x2, y2 = box[:4]
            return (
                float(min(x1, x2)),
                float(min(y1, y2)),
                float(max(x1, x2)),
                float(max(y1, y2)),
            )

        return None

    def _has_position(self, fragment: ScreenshotOcrFragment) -> bool:
        return (
            fragment.left is not None
            and fragment.top is not None
            and fragment.right is not None
            and fragment.bottom is not None
        )

    def _center_y(self, fragment: ScreenshotOcrFragment) -> float:
        top = fragment.top or 0.0
        bottom = fragment.bottom or top
        return (top + bottom) / 2.0

    def _line_height(self, fragment: ScreenshotOcrFragment) -> float:
        top = fragment.top or 0.0
        bottom = fragment.bottom or top
        return max(1.0, bottom - top)

    def _is_same_line(
        self,
        fragments: list[ScreenshotOcrFragment],
        candidate: ScreenshotOcrFragment,
    ) -> bool:
        existing_centers = [self._center_y(fragment) for fragment in fragments]
        avg_center = sum(existing_centers) / len(existing_centers)
        avg_height = (
            sum(self._line_height(fragment) for fragment in fragments) / len(fragments)
        )
        tolerance = max(12.0, avg_height * 0.7)
        return abs(self._center_y(candidate) - avg_center) <= tolerance

    def _append_fragment_text(self, prefix: str, fragment: str) -> str:
        cleaned_fragment = self._normalize_text(fragment)
        if not cleaned_fragment:
            return prefix
        if not prefix:
            return cleaned_fragment

        if self._needs_space(prefix, cleaned_fragment):
            return f'{prefix} {cleaned_fragment}'
        return f'{prefix}{cleaned_fragment}'

    def _needs_space(self, left: str, right: str) -> bool:
        left_char = left[-1:]
        right_char = right[:1]
        if not left_char or not right_char:
            return False
        if re.match(r'[\u4e00-\u9fff]', left_char) and re.match(r'[\u4e00-\u9fff]', right_char):
            return False
        if re.match(r'[A-Za-z0-9]', left_char) and re.match(r'[A-Za-z0-9]', right_char):
            return True
        if left_char in {'/', '-', '_'} or right_char in {'/', '-', '_'}:
            return False
        return False

    def _finalize_line_text(self, text: str) -> str:
        normalized = self._normalize_text(text)
        normalized = re.sub(r'\s+([,.;:!?])', r'\1', normalized)
        normalized = re.sub(r'([([{])\s+', r'\1', normalized)
        normalized = re.sub(r'\s+([)\]}])', r'\1', normalized)
        return normalized.strip()

    def _dedupe_key(self, text: str) -> str:
        return re.sub(r'\s+', '', text).lower()

    def _is_noise(self, text: str, score: float | None) -> bool:
        if not text:
            return True
        if score is not None and score < 0.16 and len(text) <= 2:
            return True
        if len(text) == 1 and not re.match(r'[\u4e00-\u9fffA-Za-z0-9]', text):
            return True
        return False
