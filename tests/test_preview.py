from playwright.sync_api import sync_playwright


BASE = "http://127.0.0.1:4177/"
CALLBACK_URL = (
    "https://www.huixiangdata.com/transferPage?url="
    "https%3A%2F%2Fwww.huixiangdata.com%2Fquestionnaire%2Fapi%2Fv1%2Fanswer%2Fthird%2Fcallback%2Fsubmit%2F202608085411"
)


def verify_platform_entry(page):
    page.goto(BASE)
    page.wait_for_load_state("networkidle")
    platform_id = page.locator("#xa-platform-user-id")
    assert platform_id.get_attribute("maxlength") is None
    assert platform_id.get_attribute("minlength") is None
    platform_id.fill("HXUSER202608081234")
    page.locator("#xa-platform-form").locator('button[type="submit"]').click()
    page.locator("#xa-intro").wait_for(state="visible")


def complete_form(page, form):
    page.goto(f"{BASE}?form={form}&preview=1&skip_intro=1")
    page.wait_for_load_state("networkidle")
    results = []
    signatures = []
    for index in range(4):
        page.locator("#xa-evidence-button").click()
        page.locator("#xa-report").wait_for(state="visible")
        results.append(page.locator("#xa-comparison-heading").inner_text())
        detail = page.locator("#xa-technical-detail").text_content()
        signatures.append(detail.rsplit("证据签名 ", 1)[1])
        page.locator('input[name="judgment"][value="cannot_determine"]').check()
        page.locator("#xa-confidence").fill(str(60 + index))
        page.locator("#xa-confidence").dispatch_event("input")
        page.locator('input[name="evidence_strength"][value="4"]').check()
        page.locator("#xa-submit").click()
        if index < 3:
            page.locator("#xa-evidence-button").wait_for(state="visible")
    page.locator("#xa-poststudy-form").wait_for(state="visible")
    page.locator('input[name="source_identity"][value="independent_verifier"]').check()
    expected_timing = "during_session" if form == "X" else "before_session"
    page.locator(f'input[name="evidence_timing"][value="{expected_timing}"]').check()
    page.locator('input[name="operations_recall"][value="read_generate_compare"]').check()
    page.locator('input[name="original_production_observed"][value="no"]').check()
    page.locator('input[name="source_confidence"][value="6"]').check()
    page.locator("#xa-explanation").fill("能够证明公开材料可按所示步骤重放；不能证明最初制作历史或其他电脑当前状态。")
    page.locator("#xa-poststudy-submit").click()
    page.locator("#xa-completion").wait_for(state="visible")
    completion_code = page.locator("#xa-completion-code").inner_text()
    assert completion_code == ("000001" if form == "X" else "000002")
    assert len(completion_code) == 6
    assert page.locator("#xa-platform-return").get_attribute("href") == CALLBACK_URL
    return results, signatures


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    entry_page = browser.new_page()
    verify_platform_entry(entry_page)
    page_x = browser.new_page()
    x_results, x_signatures = complete_form(page_x, "X")
    page_a = browser.new_page()
    a_results, a_signatures = complete_form(page_a, "A")
    assert x_results == a_results
    assert x_signatures == a_signatures
    assert x_results == [
        "两张海报完全一样",
        "两段摘要不完全一样",
        "两段说明每个字都一样",
        "两张图表不完全一样",
    ]
    browser.close()
    print("X/A preview flows and logical evidence signatures: PASS")
