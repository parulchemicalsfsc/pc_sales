import os
import requests
import time
import subprocess

# Start uvicorn server in a subprocess
print("Starting local FastAPI server...")
proc = subprocess.Popen(
    [r".\venv\Scripts\python", "main.py"],
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True
)

# Wait 5 seconds for server to start
time.sleep(5)

try:
    print("Testing GET http://127.0.0.1:8000/api/demos/redemo...")
    # Get user email from DB or use the standard admin
    headers = {"x-user-email": "admin@gmail.com"}
    res = requests.get("http://127.0.0.1:8000/api/demos/redemo", headers=headers)
    print("Response status:", res.status_code)
    print("Response JSON:")
    import pprint
    pprint.pprint(res.json())
finally:
    print("Terminating server...")
    proc.terminate()
