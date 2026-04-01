"""
Realtime camera perception helpers for websocket_server.py.

The service is intentionally tolerant of missing ML dependencies:
- `mediapipe + opencv` enables face, expression, rough gaze, and basic hand gestures.
- `opencv` alone falls back to Haar-based face detection.
- If neither backend is available, the websocket server still starts and reports
  a structured vision availability error instead of crashing.
"""

from __future__ import annotations

import asyncio
import base64
import contextlib
import math
import os
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any


def _clip(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


def _distance(a: Any, b: Any) -> float:
    return math.hypot(float(a.x) - float(b.x), float(a.y) - float(b.y))


def _point_average(items: list[Any]) -> tuple[float, float]:
    if not items:
        return 0.0, 0.0

    return (
        sum(float(item.x) for item in items) / len(items),
        sum(float(item.y) for item in items) / len(items),
    )


def _normalize_axis(value: float, lower: float, upper: float) -> float:
    span = upper - lower
    if abs(span) < 1e-4:
        return 0.0

    ratio = (value - lower) / span
    return _clip((ratio - 0.5) * 2.0, -1.0, 1.0)


def _build_error_event(message: str) -> dict[str, Any]:
    return {'type': 'vision_error', 'message': message}


DEFAULT_EXPRESSION_MODEL_PATH = 'models/vision/emotion-ferplus/model.onnx'


@dataclass
class VisionSessionConfig:
    session_id: str = 'camera'
    vision_backend: str = 'mediapipe-opencv'
    face_detection_enabled: bool = True
    expression_recognition_enabled: bool = True
    expression_model_path: str = DEFAULT_EXPRESSION_MODEL_PATH
    gaze_tracking_enabled: bool = True
    gesture_recognition_enabled: bool = False


@dataclass
class VisionSessionState:
    hand_x_history: deque[tuple[float, float]] = field(
        default_factory=lambda: deque(maxlen=8)
    )
    gaze_history: deque[tuple[float, float]] = field(
        default_factory=lambda: deque(maxlen=5)
    )
    expression_history: deque[tuple[str, float]] = field(
        default_factory=lambda: deque(maxlen=6)
    )
    eye_contact_confidence_history: deque[float] = field(
        default_factory=lambda: deque(maxlen=5)
    )
    stable_expression: str = 'neutral'
    stable_expression_confidence: float = 0.58
    stable_eye_contact: bool = False

    def reset_face_state(self) -> None:
        self.gaze_history.clear()
        self.expression_history.clear()
        self.eye_contact_confidence_history.clear()
        self.stable_expression = 'neutral'
        self.stable_expression_confidence = 0.58
        self.stable_eye_contact = False


class ExpressionModelClassifier:
    LABEL_MAP = (
        'neutral',
        'happy',
        'surprised',
        'sad',
        'angry',
        'angry',
        'surprised',
        'angry',
    )

    def __init__(self, cv2_module: Any, np_module: Any, model_path: str) -> None:
        import onnxruntime as ort  # type: ignore

        resolved_path = model_path.strip() or DEFAULT_EXPRESSION_MODEL_PATH
        if not os.path.isabs(resolved_path):
            resolved_path = os.path.join(os.getcwd(), resolved_path)

        if not os.path.exists(resolved_path):
            raise FileNotFoundError(
                f"Expression model was not found at '{resolved_path}'."
            )

        self.cv2 = cv2_module
        self.np = np_module
        self.path = resolved_path
        self.session = ort.InferenceSession(
            resolved_path,
            providers=['CPUExecutionProvider'],
        )
        self.input_name = self.session.get_inputs()[0].name
        self.output_name = self.session.get_outputs()[0].name

    def classify(self, frame: Any, bounds: tuple[int, int, int, int]) -> tuple[str, float] | None:
        x1, y1, x2, y2 = bounds
        crop = frame[y1:y2, x1:x2]
        if crop is None or getattr(crop, 'size', 0) == 0:
            return None

        gray = self.cv2.cvtColor(crop, self.cv2.COLOR_BGR2GRAY)
        resized = self.cv2.resize(gray, (64, 64))
        normalized = (resized.astype(self.np.float32) - 127.5) / 127.5
        input_tensor = normalized.reshape(1, 1, 64, 64)
        output = self.session.run(
            [self.output_name],
            {self.input_name: input_tensor},
        )[0]
        scores = self.np.asarray(output).reshape(-1)
        if scores.size == 0:
            return None

        shifted = scores - scores.max()
        probabilities = self.np.exp(shifted)
        probabilities = probabilities / probabilities.sum()

        index = int(probabilities.argmax())
        confidence = float(probabilities[index])
        if index >= len(self.LABEL_MAP):
            return None

        return self.LABEL_MAP[index], confidence


class DummyVisionEngine:
    available = False

    def __init__(self, backend: str, reason: str) -> None:
        self.backend = backend
        self.reason = reason

    def close(self) -> None:
        return None

    def process_frame(
        self,
        image_base64: str,
        config: VisionSessionConfig,
        state: VisionSessionState,
    ) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        _ = image_base64
        _ = config
        _ = state
        return {'detected': False}, []


class OpenCvVisionEngine:
    available = True

    def __init__(self, backend: str = 'opencv') -> None:
        import cv2  # type: ignore
        import numpy as np  # type: ignore

        self.backend = backend
        self.reason = ''
        self.cv2 = cv2
        self.np = np

        cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
        self.face_cascade = cv2.CascadeClassifier(cascade_path)
        if self.face_cascade.empty():
            raise RuntimeError(f'Unable to load Haar cascade from {cascade_path}.')

    def close(self) -> None:
        return None

    def decode_image(self, image_base64: str):
        image_bytes = base64.b64decode(image_base64)
        image_array = self.np.frombuffer(image_bytes, dtype=self.np.uint8)
        frame = self.cv2.imdecode(image_array, self.cv2.IMREAD_COLOR)
        if frame is None:
            raise ValueError('Unable to decode camera frame.')
        return frame

    def process_frame(
        self,
        image_base64: str,
        config: VisionSessionConfig,
        state: VisionSessionState,
    ) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        frame = self.decode_image(image_base64)
        height, width = frame.shape[:2]

        face_state: dict[str, Any] = {'detected': False}
        gestures: list[dict[str, Any]] = []

        if not config.face_detection_enabled:
            return face_state, gestures

        gray = self.cv2.cvtColor(frame, self.cv2.COLOR_BGR2GRAY)
        faces = self.face_cascade.detectMultiScale(
            gray,
            scaleFactor=1.1,
            minNeighbors=5,
            minSize=(80, 80),
        )

        if len(faces) == 0:
            state.reset_face_state()
            return face_state, gestures

        x, y, w, h = max(faces, key=lambda item: item[2] * item[3])
        face_center_x = _clip((x + (w / 2.0)) / width, 0.0, 1.0)
        face_center_y = _clip((y + (h / 2.0)) / height, 0.0, 1.0)

        face_state = {
            'detected': True,
            'expression': 'neutral' if config.expression_recognition_enabled else None,
            'faceCenterX': face_center_x,
            'faceCenterY': face_center_y,
            'gazeX': _clip((face_center_x - 0.5) * 2.0, -1.0, 1.0)
            if config.gaze_tracking_enabled
            else None,
            'gazeY': _clip((0.5 - face_center_y) * 2.0, -1.0, 1.0)
            if config.gaze_tracking_enabled
            else None,
            'confidence': 0.55,
        }

        return face_state, gestures


class MediaPipeVisionEngine(OpenCvVisionEngine):
    def __init__(self, expression_model_path: str = DEFAULT_EXPRESSION_MODEL_PATH) -> None:
        super().__init__(backend='mediapipe-opencv')

        import mediapipe as mp  # type: ignore

        self.mp = mp
        self.face_detector = mp.solutions.face_detection.FaceDetection(
            model_selection=0,
            min_detection_confidence=0.5,
        )
        self.face_mesh = mp.solutions.face_mesh.FaceMesh(
            static_image_mode=False,
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        self.hands = mp.solutions.hands.Hands(
            static_image_mode=False,
            max_num_hands=1,
            model_complexity=0,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        self.expression_model: ExpressionModelClassifier | None = None
        if expression_model_path.strip():
            try:
                self.expression_model = ExpressionModelClassifier(
                    self.cv2,
                    self.np,
                    expression_model_path,
                )
            except Exception as error:
                self.reason = f'Expression model unavailable: {error}'

    def close(self) -> None:
        with contextlib.suppress(Exception):
            self.face_detector.close()
        with contextlib.suppress(Exception):
            self.face_mesh.close()
        with contextlib.suppress(Exception):
            self.hands.close()

    def process_frame(
        self,
        image_base64: str,
        config: VisionSessionConfig,
        state: VisionSessionState,
    ) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        frame = self.decode_image(image_base64)
        rgb_frame = self.cv2.cvtColor(frame, self.cv2.COLOR_BGR2RGB)

        face_state: dict[str, Any] = {'detected': False}
        gestures: list[dict[str, Any]] = []

        if (
            config.face_detection_enabled
            or config.expression_recognition_enabled
            or config.gaze_tracking_enabled
        ):
            detection_result = self.face_detector.process(rgb_frame)
            if detection_result.detections:
                detection = detection_result.detections[0]
                bbox = detection.location_data.relative_bounding_box
                face_center_x = _clip(bbox.xmin + (bbox.width / 2.0), 0.0, 1.0)
                face_center_y = _clip(bbox.ymin + (bbox.height / 2.0), 0.0, 1.0)
                score = (
                    float(detection.score[0])
                    if getattr(detection, 'score', None)
                    else 0.7
                )

                face_state = {
                    'detected': True,
                    'faceCenterX': face_center_x,
                    'faceCenterY': face_center_y,
                    'gazeX': _clip((face_center_x - 0.5) * 2.0, -1.0, 1.0)
                    if config.gaze_tracking_enabled
                    else None,
                    'gazeY': _clip((0.5 - face_center_y) * 2.0, -1.0, 1.0)
                    if config.gaze_tracking_enabled
                    else None,
                    'confidence': score,
                }

            mesh_result = self.face_mesh.process(rgb_frame)
            if mesh_result.multi_face_landmarks:
                landmarks = mesh_result.multi_face_landmarks[0].landmark
                face_state.update(
                    self._build_face_state_from_landmarks(
                        frame,
                        landmarks,
                        config,
                        state,
                        face_state,
                    )
                )

        if config.gesture_recognition_enabled:
            hands_result = self.hands.process(rgb_frame)
            if hands_result.multi_hand_landmarks:
                hand_landmarks = hands_result.multi_hand_landmarks[0].landmark
                hand_x = sum(
                    float(hand_landmarks[index].x) for index in (0, 5, 9, 13, 17)
                ) / 5.0
                state.hand_x_history.append((time.time(), hand_x))

                gesture_name, confidence = self._classify_hand_gesture(
                    hand_landmarks,
                    state,
                )
                if gesture_name:
                    gestures.append(
                        {
                            'name': gesture_name,
                            'confidence': confidence,
                        }
                    )

        if not face_state.get('detected'):
            state.reset_face_state()

        return face_state, gestures

    def _build_face_state_from_landmarks(
        self,
        frame: Any,
        landmarks: list[Any],
        config: VisionSessionConfig,
        state: VisionSessionState,
        current_state: dict[str, Any],
    ) -> dict[str, Any]:
        left_eye_outer = landmarks[33]
        left_eye_inner = landmarks[133]
        right_eye_outer = landmarks[263]
        right_eye_inner = landmarks[362]
        left_eye_top = landmarks[159]
        left_eye_bottom = landmarks[145]
        right_eye_top = landmarks[386]
        right_eye_bottom = landmarks[374]
        mouth_left = landmarks[61]
        mouth_right = landmarks[291]
        upper_lip = landmarks[13]
        lower_lip = landmarks[14]
        left_brow = landmarks[105]
        right_brow = landmarks[334]
        nose = landmarks[1]
        left_face = landmarks[234]
        right_face = landmarks[454]
        forehead = landmarks[10]
        chin = landmarks[152]

        left_eye_width = max(_distance(left_eye_outer, left_eye_inner), 1e-4)
        right_eye_width = max(_distance(right_eye_outer, right_eye_inner), 1e-4)
        eye_openness = (
            (_distance(left_eye_top, left_eye_bottom) / left_eye_width)
            + (_distance(right_eye_top, right_eye_bottom) / right_eye_width)
        ) / 2.0

        mouth_width = max(_distance(mouth_left, mouth_right), 1e-4)
        mouth_openness = _distance(upper_lip, lower_lip) / mouth_width

        face_width = max(abs(float(right_face.x) - float(left_face.x)), 1e-4)
        face_height = max(abs(float(chin.y) - float(forehead.y)), 1e-4)
        smile_width = mouth_width / face_width
        smile_curve = (
            (float(upper_lip.y) - float(mouth_left.y))
            + (float(upper_lip.y) - float(mouth_right.y))
        ) / (2.0 * face_height)
        brow_lift = (
            (float(left_eye_top.y) - float(left_brow.y))
            + (float(right_eye_top.y) - float(right_brow.y))
        ) / (2.0 * face_height)
        face_mid_x = (float(left_face.x) + float(right_face.x)) / 2.0
        face_mid_y = (float(forehead.y) + float(chin.y)) / 2.0

        yaw = _clip(((float(nose.x) - face_mid_x) / face_width) * 120.0, -35.0, 35.0)
        pitch = _clip(
            ((float(face_mid_y) - float(nose.y)) / face_height) * 120.0,
            -25.0,
            25.0,
        )
        roll = _clip(
            math.degrees(
                math.atan2(
                    float(right_eye_outer.y) - float(left_eye_outer.y),
                    float(right_eye_outer.x) - float(left_eye_outer.x),
                )
            ),
            -30.0,
            30.0,
        )

        face_center_x = current_state.get('faceCenterX')
        face_center_y = current_state.get('faceCenterY')
        if face_center_x is None:
            face_center_x = _clip(
                (float(left_face.x) + float(right_face.x) + float(nose.x)) / 3.0,
                0.0,
                1.0,
            )
        if face_center_y is None:
            face_center_y = _clip(
                (float(forehead.y) + float(chin.y) + float(nose.y)) / 3.0,
                0.0,
                1.0,
            )

        gaze_x = current_state.get('gazeX')
        gaze_y = current_state.get('gazeY')
        eye_contact = None
        eye_contact_confidence = None
        if config.gaze_tracking_enabled and len(landmarks) >= 478:
            left_iris_x, left_iris_y = _point_average(landmarks[468:473])
            right_iris_x, right_iris_y = _point_average(landmarks[473:478])

            left_eye_x = _normalize_axis(
                left_iris_x,
                min(float(left_eye_outer.x), float(left_eye_inner.x)),
                max(float(left_eye_outer.x), float(left_eye_inner.x)),
            )
            right_eye_x = _normalize_axis(
                right_iris_x,
                min(float(right_eye_outer.x), float(right_eye_inner.x)),
                max(float(right_eye_outer.x), float(right_eye_inner.x)),
            )
            left_eye_y = _normalize_axis(
                left_iris_y,
                min(float(left_eye_top.y), float(left_eye_bottom.y)),
                max(float(left_eye_top.y), float(left_eye_bottom.y)),
            )
            right_eye_y = _normalize_axis(
                right_iris_y,
                min(float(right_eye_top.y), float(right_eye_bottom.y)),
                max(float(right_eye_top.y), float(right_eye_bottom.y)),
            )

            gaze_x = _clip(
                ((left_eye_x + right_eye_x) / 2.0) + ((yaw / 35.0) * 0.18),
                -1.0,
                1.0,
            )
            gaze_y = _clip(
                ((left_eye_y + right_eye_y) / 2.0) + ((pitch / 25.0) * 0.12),
                -1.0,
                1.0,
            )
            eye_contact_confidence = _clip(
                1.0 - ((abs(gaze_x) * 0.65) + (abs(gaze_y) * 0.35)),
                0.0,
                1.0,
            )
            gaze_x, gaze_y = self._smooth_gaze(gaze_x, gaze_y, state)
            eye_contact, eye_contact_confidence = self._stabilize_eye_contact(
                eye_contact_confidence,
                state,
            )

        expression = current_state.get('expression')
        expression_confidence = current_state.get('expressionConfidence')
        if config.expression_recognition_enabled:
            heuristic_expression, heuristic_confidence = self._classify_expression(
                eye_openness,
                mouth_openness,
                smile_width,
                smile_curve,
                brow_lift,
                gaze_x or 0.0,
                gaze_y or 0.0,
                eye_contact_confidence or 0.0,
            )
            expression, expression_confidence = self._classify_expression_with_model(
                frame,
                landmarks,
                heuristic_expression,
                heuristic_confidence,
            )
            expression, expression_confidence = self._stabilize_expression(
                expression,
                expression_confidence,
                state,
            )

        return {
            'detected': True,
            'yaw': yaw,
            'pitch': pitch,
            'roll': roll,
            'expression': expression,
            'expressionConfidence': expression_confidence,
            'faceCenterX': face_center_x,
            'faceCenterY': face_center_y,
            'gazeX': gaze_x if config.gaze_tracking_enabled else None,
            'gazeY': gaze_y if config.gaze_tracking_enabled else None,
            'eyeContact': eye_contact if config.gaze_tracking_enabled else None,
            'eyeContactConfidence': eye_contact_confidence
            if config.gaze_tracking_enabled
            else None,
        }

    def _weighted_average(self, values: list[float]) -> float:
        if not values:
            return 0.0

        weights = [float(index + 1) for index in range(len(values))]
        return sum(value * weight for value, weight in zip(values, weights)) / sum(weights)

    def _smooth_gaze(
        self,
        gaze_x: float,
        gaze_y: float,
        state: VisionSessionState,
    ) -> tuple[float, float]:
        state.gaze_history.append((gaze_x, gaze_y))
        history = list(state.gaze_history)
        smoothed_x = self._weighted_average([item[0] for item in history])
        smoothed_y = self._weighted_average([item[1] for item in history])
        return _clip(smoothed_x, -1.0, 1.0), _clip(smoothed_y, -1.0, 1.0)

    def _stabilize_eye_contact(
        self,
        raw_confidence: float,
        state: VisionSessionState,
    ) -> tuple[bool, float]:
        state.eye_contact_confidence_history.append(raw_confidence)
        confidence = _clip(
            self._weighted_average(list(state.eye_contact_confidence_history)),
            0.0,
            1.0,
        )
        threshold = 0.64 if state.stable_eye_contact else 0.74
        state.stable_eye_contact = confidence >= threshold
        return state.stable_eye_contact, confidence

    def _stabilize_expression(
        self,
        raw_expression: str,
        raw_confidence: float,
        state: VisionSessionState,
    ) -> tuple[str, float]:
        state.expression_history.append((raw_expression, raw_confidence))
        history = list(state.expression_history)
        scores: dict[str, float] = {}

        for index, (label, confidence) in enumerate(history):
            weight = 0.75 + ((index + 1) * 0.2)
            scores[label] = scores.get(label, 0.0) + (confidence * weight)

        current_label = state.stable_expression
        current_score = scores.get(current_label, 0.0)
        next_label, next_score = max(scores.items(), key=lambda item: item[1])

        if next_label != current_label:
            immediate_switch = raw_expression == next_label and raw_confidence >= 0.86
            stable_switch = next_score >= 1.18 and next_score >= (current_score + 0.18)
            if immediate_switch or stable_switch:
                state.stable_expression = next_label

        stable_samples = [
            confidence
            for label, confidence in history
            if label == state.stable_expression
        ]
        state.stable_expression_confidence = _clip(
            self._weighted_average(stable_samples),
            0.0,
            0.98,
        )
        return state.stable_expression, round(state.stable_expression_confidence, 4)

    def _classify_expression_with_model(
        self,
        frame: Any,
        landmarks: list[Any],
        heuristic_expression: str,
        heuristic_confidence: float,
    ) -> tuple[str, float]:
        if self.expression_model is None:
            return heuristic_expression, heuristic_confidence

        bounds = self._build_face_crop_bounds(frame, landmarks)
        if bounds is None:
            return heuristic_expression, heuristic_confidence

        try:
            model_result = self.expression_model.classify(frame, bounds)
        except Exception:
            return heuristic_expression, heuristic_confidence

        if model_result is None:
            return heuristic_expression, heuristic_confidence

        model_expression, model_confidence = model_result
        model_confidence = _clip(model_confidence, 0.0, 0.98)

        if heuristic_expression in ('tired', 'focused') and heuristic_confidence >= 0.62:
            return heuristic_expression, heuristic_confidence

        if model_expression != 'neutral' and model_confidence >= 0.52:
            return model_expression, model_confidence

        if heuristic_confidence >= max(model_confidence + 0.04, 0.6):
            return heuristic_expression, heuristic_confidence

        return model_expression, max(model_confidence, 0.56)

    def _build_face_crop_bounds(
        self,
        frame: Any,
        landmarks: list[Any],
    ) -> tuple[int, int, int, int] | None:
        if len(landmarks) <= 454:
            return None

        height, width = frame.shape[:2]
        if height <= 0 or width <= 0:
            return None

        x_values = [
            float(landmarks[234].x),
            float(landmarks[454].x),
            float(landmarks[10].x),
            float(landmarks[152].x),
        ]
        y_values = [
            float(landmarks[10].y),
            float(landmarks[152].y),
            float(landmarks[234].y),
            float(landmarks[454].y),
        ]

        padding_x = 0.08
        padding_y = 0.1
        x1 = int(max(0.0, min(x_values) - padding_x) * width)
        x2 = int(min(1.0, max(x_values) + padding_x) * width)
        y1 = int(max(0.0, min(y_values) - padding_y) * height)
        y2 = int(min(1.0, max(y_values) + padding_y) * height)

        if x2 <= x1 or y2 <= y1:
            return None

        return x1, y1, x2, y2

    def _classify_expression(
        self,
        eye_openness: float,
        mouth_openness: float,
        smile_width: float,
        smile_curve: float,
        brow_lift: float,
        gaze_x: float,
        gaze_y: float,
        eye_contact_confidence: float,
    ) -> tuple[str, float]:
        if (
            mouth_openness > 0.22
            and brow_lift > 0.045
            and eye_openness > 0.24
        ):
            confidence = _clip(
                0.62
                + ((mouth_openness - 0.22) * 1.6)
                + ((brow_lift - 0.045) * 3.2),
                0.0,
                0.96,
            )
            return 'surprised', confidence

        if (
            smile_width > 0.35
            and (smile_curve > 0.01 or mouth_openness > 0.1)
        ):
            confidence = _clip(
                0.58
                + ((smile_width - 0.35) * 2.2)
                + max(smile_curve, 0.0) * 8.0,
                0.0,
                0.95,
            )
            return 'happy', confidence

        if eye_openness < 0.18:
            confidence = _clip(0.56 + ((0.18 - eye_openness) * 3.2), 0.0, 0.92)
            return 'tired', confidence

        if (
            eye_contact_confidence >= 0.72
            and abs(gaze_x) < 0.18
            and abs(gaze_y) < 0.18
            and eye_openness >= 0.22
            and mouth_openness < 0.1
        ):
            confidence = _clip(
                0.54 + ((eye_contact_confidence - 0.72) * 1.6),
                0.0,
                0.91,
            )
            return 'focused', confidence

        return 'neutral', 0.58

    def _classify_hand_gesture(
        self,
        landmarks: list[Any],
        state: VisionSessionState,
    ) -> tuple[str | None, float]:
        thumb_tip = landmarks[4]
        thumb_ip = landmarks[3]
        thumb_mcp = landmarks[2]
        index_tip = landmarks[8]
        index_pip = landmarks[6]
        middle_tip = landmarks[12]
        middle_pip = landmarks[10]
        middle_mcp = landmarks[9]
        ring_tip = landmarks[16]
        ring_pip = landmarks[14]
        ring_mcp = landmarks[13]
        pinky_tip = landmarks[20]
        pinky_pip = landmarks[18]
        pinky_mcp = landmarks[17]
        wrist = landmarks[0]
        index_mcp = landmarks[5]

        index_extended = float(index_tip.y) < float(index_pip.y) < float(index_mcp.y)
        middle_extended = (
            float(middle_tip.y) < float(middle_pip.y) < float(middle_mcp.y)
        )
        ring_extended = float(ring_tip.y) < float(ring_pip.y) < float(ring_mcp.y)
        pinky_extended = float(pinky_tip.y) < float(pinky_pip.y) < float(pinky_mcp.y)
        thumb_extended = _distance(thumb_tip, index_mcp) > (
            _distance(thumb_ip, index_mcp) * 1.18
        )
        palm_scale = max(
            _distance(wrist, middle_mcp),
            _distance(index_mcp, pinky_mcp),
            1e-4,
        )

        is_thumbs_up = (
            float(thumb_tip.y) < float(thumb_ip.y) < float(thumb_mcp.y)
            and not index_extended
            and not middle_extended
            and not ring_extended
            and not pinky_extended
        )
        if is_thumbs_up:
            return 'thumbs_up', 0.88

        is_ok = (
            _distance(thumb_tip, index_tip) < (palm_scale * 0.42)
            and middle_extended
            and ring_extended
            and pinky_extended
        )
        if is_ok:
            return 'ok', 0.82

        is_peace = (
            index_extended
            and middle_extended
            and not ring_extended
            and not pinky_extended
        )
        if is_peace:
            return 'peace', 0.8

        is_open_palm = (
            thumb_extended
            and index_extended
            and middle_extended
            and ring_extended
            and pinky_extended
        )

        now = time.time()
        recent_positions = [x for ts, x in state.hand_x_history if (now - ts) <= 2.0]
        if is_open_palm and len(recent_positions) >= 4:
            deltas = [
                recent_positions[index] - recent_positions[index - 1]
                for index in range(1, len(recent_positions))
            ]
            direction_changes = sum(
                1
                for index in range(1, len(deltas))
                if deltas[index] * deltas[index - 1] < 0
            )
            amplitude = max(recent_positions) - min(recent_positions)
            if amplitude > 0.12 and direction_changes >= 1:
                return 'wave', 0.78

        if is_open_palm:
            return 'open_palm', 0.76

        is_point = (
            index_extended
            and not middle_extended
            and not ring_extended
            and not pinky_extended
        )
        if is_point:
            return 'point', 0.73

        return None, 0.0


def build_vision_engine(backend: str, config: VisionSessionConfig):
    if backend == 'opencv':
        try:
            return OpenCvVisionEngine('opencv')
        except Exception as error:
            return DummyVisionEngine(backend, str(error))

    if backend == 'mediapipe-opencv':
        try:
            return MediaPipeVisionEngine(config.expression_model_path)
        except Exception as error:
            fallback_reason = str(error)
            try:
                engine = OpenCvVisionEngine('opencv-fallback')
                engine.reason = f'Fell back to OpenCV face detection: {fallback_reason}'
                return engine
            except Exception as secondary_error:
                return DummyVisionEngine(
                    backend,
                    f'{fallback_reason}; OpenCV fallback failed: {secondary_error}',
                )

    return DummyVisionEngine(backend, f'{backend} is not implemented')


class RealtimeVisionSession:
    def __init__(self, app_config: dict[str, Any], runtime_config: dict[str, Any] | None = None):
        _ = app_config
        runtime_config = runtime_config or {}
        self.config = self._build_config(runtime_config)
        self.state = VisionSessionState()
        self.engine = build_vision_engine(self.config.vision_backend, self.config)

    def _build_config(self, runtime_config: dict[str, Any]) -> VisionSessionConfig:
        return VisionSessionConfig(
            session_id=str(runtime_config.get('sessionId') or 'camera'),
            vision_backend=str(runtime_config.get('visionBackend') or 'mediapipe-opencv'),
            face_detection_enabled=bool(runtime_config.get('faceDetectionEnabled', True)),
            expression_recognition_enabled=bool(
                runtime_config.get('expressionRecognitionEnabled', True)
            ),
            expression_model_path=str(
                runtime_config.get('expressionModelPath') or DEFAULT_EXPRESSION_MODEL_PATH
            ),
            gaze_tracking_enabled=bool(runtime_config.get('gazeTrackingEnabled', True)),
            gesture_recognition_enabled=bool(
                runtime_config.get('gestureRecognitionEnabled', False)
            ),
        )

    def start(self) -> list[dict[str, Any]]:
        events: list[dict[str, Any]] = [
            {
                'type': 'vision_session_ready',
                'sessionId': self.config.session_id,
                'backend': getattr(self.engine, 'backend', self.config.vision_backend),
                'available': bool(getattr(self.engine, 'available', False)),
                'reason': getattr(self.engine, 'reason', ''),
                'faceDetectionEnabled': self.config.face_detection_enabled,
                'expressionRecognitionEnabled': self.config.expression_recognition_enabled,
                'gazeTrackingEnabled': self.config.gaze_tracking_enabled,
                'gestureRecognitionEnabled': self.config.gesture_recognition_enabled,
            }
        ]

        if getattr(self.engine, 'available', False):
            events.append({'type': 'vision_state', 'state': 'watching'})
        else:
            reason = getattr(self.engine, 'reason', '') or 'Vision backend is unavailable.'
            events.append({'type': 'vision_state', 'state': 'error'})
            events.append(_build_error_event(reason))

        return events

    def stop(self) -> list[dict[str, Any]]:
        with contextlib.suppress(Exception):
            self.engine.close()
        self.state = VisionSessionState()
        return [{'type': 'vision_state', 'state': 'idle'}]

    async def process_frame(
        self,
        image_base64: str,
        mime_type: str,
        width: int,
        height: int,
        timestamp: int,
    ) -> list[dict[str, Any]]:
        _ = mime_type
        _ = width
        _ = height
        _ = timestamp

        if not getattr(self.engine, 'available', False):
            return []

        try:
            face_state, gestures = await asyncio.to_thread(
                self.engine.process_frame,
                image_base64,
                self.config,
                self.state,
            )
        except Exception as error:
            return [
                _build_error_event(f'Vision frame processing failed: {error}'),
                {'type': 'vision_state', 'state': 'error'},
            ]

        events: list[dict[str, Any]] = [
            {'type': 'vision_face_state', 'face': face_state},
        ]

        if self.config.gesture_recognition_enabled:
            events.append({'type': 'vision_gesture_state', 'gestures': gestures})

        return events
