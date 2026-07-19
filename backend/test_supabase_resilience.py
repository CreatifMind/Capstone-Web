import json
import unittest
from unittest.mock import patch

import httpx

from backend import main


class FakeResponse:
    data = {"id": "job-1"}


class FakeQuery:
    def __init__(self, state):
        self.state = state

    def eq(self, *_args):
        return self

    def execute(self):
        self.state["calls"] += 1
        if self.state["calls"] == 1:
            raise httpx.RemoteProtocolError("Server disconnected")
        return FakeResponse()


class FakeTable:
    def __init__(self, state):
        self.state = state

    def update(self, _fields):
        return FakeQuery(self.state)


class FakeClient:
    def __init__(self, state):
        self.state = state

    def table(self, _name):
        return FakeTable(self.state)


class SupabaseResilienceTests(unittest.TestCase):
    def test_reconnects_after_one_protocol_disconnect(self):
        calls, sleeps = [], []
        first = object()
        executor = main.SupabaseExecutor(
            client=first,
            client_factory=lambda: object(),
            sleeper=sleeps.append,
            random_value=lambda: 0,
        )

        def operation(client):
            calls.append(client)
            if len(calls) == 1:
                raise httpx.RemoteProtocolError("Server disconnected")
            return "saved"

        self.assertEqual(executor.execute(operation), "saved")
        self.assertEqual(len(calls), 2)
        self.assertIsNot(calls[0], calls[1])
        self.assertEqual(sleeps, [0.25])

    def test_progress_update_retries_after_disconnect(self):
        state = {"calls": 0}
        executor = main.SupabaseExecutor(
            client=FakeClient(state),
            client_factory=lambda: FakeClient(state),
            sleeper=lambda _delay: None,
            random_value=lambda: 0,
        )

        main._update_job("job-1", executor, processed_count=10)

        self.assertEqual(state["calls"], 2)

    def test_get_job_returns_retryable_503_after_exhausted_retries(self):
        class UnavailableExecutor:
            def execute(self, _operation):
                raise main.SupabaseTemporarilyUnavailable("temporary")

        principal = main.Principal("public", "public", frozenset({"job:read"}))
        with patch.object(main, "_new_supabase_client", return_value=object()), patch.object(main, "SupabaseExecutor", UnavailableExecutor):
            response = main.get_job("job-1", principal)

        self.assertEqual(response.status_code, 503)
        self.assertTrue(json.loads(response.body)["retryable"])


if __name__ == "__main__":
    unittest.main()
