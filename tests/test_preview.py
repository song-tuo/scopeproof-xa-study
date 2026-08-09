import os

from playwright.sync_api import sync_playwright


BASE = os.environ.get("SCOPEPROOF_TEST_BASE", "http://127.0.0.1:4177/")
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


def verify_scope_preview_gate(page):
    # 正式地址即使被追加 scope=1，也不得把未记录的 C 处理投给被试。
    page.goto(f"{BASE}?scope=1")
    page.wait_for_load_state("networkidle")
    assert page.locator('[data-treatment="scope-content"]').count() == 0

    # 普通预览默认仍是无 scope content 的 X/A 基线。
    page.goto(f"{BASE}?preview=1&skip_intro=1")
    page.wait_for_load_state("networkidle")
    assert page.locator('[data-treatment="scope-content"]').count() == 0

    # 只有显式预览才可查看 C 内容；X/A 必须共用逐字相同的节点。
    texts = []
    for form in ("X", "A"):
        page.goto(f"{BASE}?form={form}&preview=1&skip_intro=1&scope=1")
        page.wait_for_load_state("networkidle")
        note = page.locator('[data-treatment="scope-content"]')
        assert note.count() == 1
        texts.append(note.inner_text())
    assert texts[0] == texts[1]


def verify_cross_version_resume_is_rejected(browser):
    page = browser.new_page()
    page.route(
        "https://cdn.jsdelivr.net/**",
        lambda route: route.fulfill(
            content_type="application/javascript",
            body="""
                export function createClient() {
                  return {
                    rpc: async (name) => {
                      window.__scopeproofRpcCalls = [...(window.__scopeproofRpcCalls || []), name];
                      return {
                        data: {
                          session_id: "00000000-0000-0000-0000-000000000001",
                          platform_user_id: "OLD-VERSION-ID",
                          evidence_form: "X",
                          consent_version: "scopeproof-xa-zh-v4-huixiang",
                          stimulus_order: ["P01", "S02", "C05", "D08"],
                          current_position: 2,
                          poststudy_complete: false,
                          status: "active"
                        },
                        error: null
                      };
                    }
                  };
                }
            """,
        ),
    )
    page.add_init_script(
        """
        localStorage.setItem("scopeproof_xa_cloud_session_v5", JSON.stringify({
          session_id: "00000000-0000-0000-0000-000000000001",
          token: "old-version-token",
          platform_user_id: "OLD-VERSION-ID"
        }));
        """
    )
    page.goto(BASE)
    page.wait_for_load_state("networkidle")
    page.locator("#xa-platform-user-id").fill("OLD-VERSION-ID")
    page.locator("#xa-platform-form").locator('button[type="submit"]').click()
    page.locator("#xa-platform-status").filter(has_text="不属于当前版本").wait_for()
    assert page.evaluate("window.__scopeproofRpcCalls") == ["get_xa_session"]
    assert page.evaluate('localStorage.getItem("scopeproof_xa_cloud_session_v5")') is None
    assert page.locator("#xa-platform-entry").is_visible()
    page.close()


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
        page.locator('input[name="confidence"][value="70"]').check()
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
    scope_page = browser.new_page()
    verify_scope_preview_gate(scope_page)
    verify_cross_version_resume_is_rejected(browser)
    page_x = browser.new_page()
    x_results, x_signatures = complete_form(page_x, "X")
    page_a = browser.new_page()
    a_results, a_signatures = complete_form(page_a, "A")
    assert x_results == a_results
    assert x_signatures == a_signatures
    assert x_results == [
        "两张海报完全一样",
        "两段短文不一样",
        "两段说明每个字都一样",
        "两张图表不一样",
    ]
    browser.close()
    print("X/A flows, scope gate, version rejection, and evidence signatures: PASS")
