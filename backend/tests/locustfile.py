"""Load testing with Locust.

Run: locust -f backend/tests/locustfile.py --host http://localhost:8000
"""

from locust import HttpUser, between, task


class DocVaultUser(HttpUser):
    wait_time = between(1, 3)
    token = None

    def on_start(self):
        """Register and login to get token."""
        import time
        email = f"load-{time.time_ns()}@test.com"
        res = self.client.post("/api/v1/auth/register", json={
            "email": email, "password": "loadtest123"
        })
        self.token = res.json().get("access_token")

    def headers(self):
        return {"Authorization": f"Bearer {self.token}"} if self.token else {}

    @task(3)
    def list_documents(self):
        self.client.get("/api/v1/documents", headers=self.headers())

    @task(2)
    def search_documents(self):
        self.client.get("/api/v1/search?q=manual", headers=self.headers())

    @task(1)
    def ask_question(self):
        self.client.post("/api/v1/ai/ask", json={"question": "What temperature for cotton?"},
                         headers=self.headers())

    @task(1)
    def list_categories(self):
        self.client.get("/api/v1/categories", headers=self.headers())

    @task(1)
    def list_warranties(self):
        self.client.get("/api/v1/warranties", headers=self.headers())
