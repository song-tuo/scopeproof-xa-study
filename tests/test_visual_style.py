import os

from playwright.sync_api import sync_playwright


BASE = os.environ.get("SCOPEPROOF_TEST_BASE", "http://127.0.0.1:4177/")


def verify_acme_style(page, screenshot_path):
    page.goto(f"{BASE}?form=X&preview=1&skip_intro=1&stimulus=D08")
    page.wait_for_load_state("networkidle")

    assert page.locator("#xa-context").inner_text() == (
        "一个数据团队的网站上有一张图表。团队还公开了图表里的数字和电脑画图的方法。"
    )
    assert page.locator("#xa-claim").inner_text() == (
        "现在，这个网站正在用这些数字和方法，画出页面上的这张图表。"
    )

    body_background = page.locator("body").evaluate(
        "element => getComputedStyle(element).backgroundColor"
    )
    card_border = page.locator(".card").first.evaluate(
        "element => getComputedStyle(element).borderTopWidth"
    )
    heading_family = page.locator("#xa-study h1").evaluate(
        "element => getComputedStyle(element).fontFamily"
    )
    accent_color = page.locator(".eyebrow").evaluate(
        "element => getComputedStyle(element).color"
    )

    assert body_background == "rgb(255, 255, 255)"
    # Chromium may snap a 1.5 CSS-pixel border to 1 physical pixel at DPR=1.
    # The static contract separately freezes the authored 1.5px token.
    assert float(card_border.removesuffix("px")) >= 1
    assert "Georgia" in heading_family
    assert accent_color == "rgb(129, 59, 40)"
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    page.screenshot(path=screenshot_path, full_page=True)


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)

    desktop = browser.new_page(viewport={"width": 1280, "height": 900})
    verify_acme_style(desktop, "/tmp/scopeproof-acme-desktop.png")

    mobile = browser.new_page(viewport={"width": 390, "height": 844})
    verify_acme_style(mobile, "/tmp/scopeproof-acme-mobile.png")
    assert mobile.locator("#xa-evidence-button").evaluate(
        "element => element.getBoundingClientRect().height >= 52"
    )

    browser.close()
    print("Acme white-paper style and D08 v6 desktop/mobile: PASS")
