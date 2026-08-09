import unittest
from types import SimpleNamespace
from unittest.mock import patch

from backend import main


class FakeTensorValue:
    def __init__(self, value):
        self.value = value

    def item(self):
        return self.value


class FakeBoxes:
    def __init__(self, class_ids, confidences):
        self.cls = [FakeTensorValue(value) for value in class_ids]
        self.conf = [FakeTensorValue(value) for value in confidences]

    def __len__(self):
        return len(self.cls)

    def __getitem__(self, indices):
        return FakeBoxes(
            [self.cls[index].item() for index in indices],
            [self.conf[index].item() for index in indices],
        )


class FakeMaskData:
    def __init__(self, values):
        self.values = values

    def __getitem__(self, indices):
        return FakeMaskData([self.values[index] for index in indices])


class FakeModel:
    def __init__(self):
        self.calls = []

    def predict(self, image_input, **kwargs):
        self.calls.append((image_input, kwargs))
        return [
            SimpleNamespace(
                boxes=FakeBoxes([0, 1, 3, 8, 5], [0.11, 0.20, 0.17, 0.10, 0.24]),
                masks=SimpleNamespace(data=FakeMaskData(["plastic", "paper", "metal", "trash", "textile"])),
            )
        ]


class YoloCalibrationTests(unittest.TestCase):
    def test_predict_with_calibration_filters_by_class_threshold_and_masks(self):
        fake_model = FakeModel()
        with patch.object(main, "get_model", return_value=fake_model):
            results = main.predict_with_calibration("image.jpg")

        self.assertEqual(fake_model.calls, [("image.jpg", {"conf": 0.05, "verbose": False})])
        result = results[0]
        self.assertEqual([value.item() for value in result.boxes.cls], [1, 8])
        self.assertEqual([value.item() for value in result.boxes.conf], [0.20, 0.10])
        self.assertEqual(result.masks.data.values, ["paper", "trash"])


if __name__ == "__main__":
    unittest.main()
