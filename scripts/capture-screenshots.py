"""Capture screenshots of every ArchLens page for the README/docs."""
from playwright.sync_api import sync_playwright
import os
import time

OUT_DIR = "/Users/muhsinelcicek/sources/archlens/docs/img"
os.makedirs(OUT_DIR, exist_ok=True)

# (url, filename, post-load action, wait_ms)
PAGES = [
    ("/", "dashboard.png", None, 3000),
    ("/architecture", "architecture.png", None, 5000),
    ("/insights", "insights.png", None, 3000),
    ("/quality", "quality.png", None, 3000),
    ("/hotspots", "hotspots.png", None, 3000),
    ("/diff", "diff.png", None, 2000),
    ("/report", "report.png", None, 3000),
    ("/onboard", "onboard.png", None, 3000),
    ("/processes", "processes.png", None, 3000),
    ("/events", "events.png", None, 2000),
    ("/structure", "structure.png", None, 2500),
    ("/stack", "api-stack.png", None, 2500),
    ("/rules", "rules.png", None, 2000),
    ("/settings", "settings.png", None, 1500),
]


def capture_simulator(page):
    """Run the simulator with the E-commerce template, then capture."""
    page.goto("http://localhost:4849/simulator", wait_until="domcontentloaded")
    page.wait_for_timeout(2000)
    try:
        # Click Templates → E-commerce
        page.get_by_role("button", name="Templates").click(timeout=5000)
        page.wait_for_timeout(300)
        page.get_by_text("E-commerce", exact=False).first.click(timeout=5000)
        page.wait_for_timeout(1000)
        # Click Run
        page.get_by_role("button", name="Run").click(timeout=5000)
        # Let simulation run for a few seconds so KPIs populate
        page.wait_for_timeout(5000)
    except Exception as e:
        print(f"  simulator setup warn: {e}")


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(
        viewport={"width": 1920, "height": 1080},
        device_scale_factor=2,  # retina quality
    )
    page = context.new_page()

    # --- Capture simulator separately with template loaded ---
    print("Capturing: /simulator (with template + running)")
    capture_simulator(page)
    out_path = os.path.join(OUT_DIR, "simulator.png")
    page.screenshot(path=out_path, full_page=False)
    print(f"  → {out_path}")

    # --- Capture all other pages ---
    for url, filename, _, wait_ms in PAGES:
        print(f"Capturing: {url}")
        try:
            page.goto(f"http://localhost:4849{url}", wait_until="domcontentloaded", timeout=30000)
            page.wait_for_timeout(wait_ms)
            out_path = os.path.join(OUT_DIR, filename)
            page.screenshot(path=out_path, full_page=False)
            print(f"  → {out_path}")
        except Exception as e:
            print(f"  ✗ failed: {e}")

    browser.close()

print("\nAll screenshots saved to:", OUT_DIR)
