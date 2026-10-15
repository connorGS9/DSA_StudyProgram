"""`python -m dsa` starts the server and opens the UI in a browser."""

import argparse
import threading
import webbrowser

import uvicorn


def main() -> None:
    parser = argparse.ArgumentParser(prog="dsa")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--no-browser", action="store_true")
    parser.add_argument("--reload", action="store_true", help="auto-reload on backend code changes")
    args = parser.parse_args()

    url = f"http://{args.host}:{args.port}"
    if not args.no_browser:
        threading.Timer(1.2, lambda: webbrowser.open(url)).start()
    print(f"Study Lab running at {url}  (Ctrl+C to stop)")
    uvicorn.run("dsa.main:app", host=args.host, port=args.port, reload=args.reload, log_level="warning")


if __name__ == "__main__":
    main()
