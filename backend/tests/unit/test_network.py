import socket
import threading
import time

from flowent_api.network import create_http_session


def _capture_raw_request() -> str:
    captured: dict[str, str] = {}
    ready = threading.Event()

    def serve() -> None:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server:
            server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            server.bind(("127.0.0.1", 18084))
            server.listen(1)
            ready.set()
            connection, _ = server.accept()
            with connection:
                payload = b""
                connection.settimeout(2)
                while b"\r\n\r\n" not in payload:
                    chunk = connection.recv(4096)
                    if not chunk:
                        break
                    payload += chunk
                captured["request"] = payload.decode("latin1", errors="replace")
                body = b"{}"
                connection.sendall(
                    b"HTTP/1.1 200 OK\r\n"
                    b"Content-Type: application/json\r\n"
                    b"Content-Length: 2\r\n"
                    b"Connection: close\r\n\r\n" + body
                )

    server_thread = threading.Thread(target=serve, daemon=True)
    server_thread.start()
    ready.wait()
    time.sleep(0.05)

    with create_http_session(timeout=5) as client:
        response = client.post("http://127.0.0.1:18084/v1/messages", json={"x": 1})
    assert response.status_code == 200
    return captured["request"]


def test_create_http_session_does_not_send_upgrade_by_default():
    request = _capture_raw_request()

    assert "Upgrade: h2c" not in request
    assert "Connection: Upgrade" not in request
