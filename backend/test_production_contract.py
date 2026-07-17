import unittest

from fastapi import HTTPException

from backend.main import IngestInput, _api_key_digest, _image_content_type


class ProductionContractTests(unittest.TestCase):
    def test_image_boundary_accepts_webp_and_rejects_mp4(self):
        self.assertEqual(_image_content_type("frame.webp", "image/webp"), (".webp", "image/webp"))
        with self.assertRaises(HTTPException):
            _image_content_type("line.mp4", "video/mp4")

    def test_api_key_digest_is_stable(self):
        self.assertEqual(_api_key_digest("pl_live_test"), _api_key_digest("pl_live_test"))
        self.assertNotEqual(_api_key_digest("pl_live_test"), _api_key_digest("pl_live_other"))

    def test_ingest_contract_rejects_missing_fields(self):
        with self.assertRaises(Exception):
            IngestInput(source="drive_file")


if __name__ == "__main__":
    unittest.main()
