import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
APP = (ROOT / "app.js").read_text(encoding="utf-8")
MIGRATION = (
    ROOT / "supabase" / "migrations" / "20260809200000_materials_version_isolation.sql"
).read_text(encoding="utf-8")
SCHEMA = (ROOT / "supabase" / "schema.sql").read_text(encoding="utf-8")
SPEC = (
    ROOT.parent
    / "06_DATA_AUDIT"
    / "2026-08-09"
    / "MATERIALS_REVISION_SPEC_2026-08-09_ZH.md"
).read_text(encoding="utf-8")


class MaterialsVersionContractTests(unittest.TestCase):
    def test_scope_content_is_preview_only(self):
        self.assertIn(
            'const scopeContentEnabled = preview && params.get("scope") === "1";',
            APP,
        )
        self.assertNotIn(
            'const scopeContentEnabled = params.get("scope") === "1";',
            APP,
        )

    def test_client_requires_an_exact_server_version(self):
        self.assertIn(
            "if (payload.consent_version !== CONSENT_VERSION)",
            APP,
        )
        self.assertNotIn(
            "if (payload.consent_version && payload.consent_version !== CONSENT_VERSION)",
            APP,
        )
        self.assertRegex(
            APP,
            r"applySession\(\{[\s\S]*?consent_version: CONSENT_VERSION,[\s\S]*?\}, \"preview\"\)",
        )

    def test_migration_returns_version_on_create_and_resume(self):
        self.assertIn("'consent_version', v_session.consent_version", MIGRATION)
        self.assertIn("'consent_version', v_consent", MIGRATION)

    def test_migration_balances_only_within_materials_version(self):
        self.assertRegex(
            MIGRATION,
            r"from public\.xa_probe_sessions\s+where consent_version = v_consent",
        )
        self.assertIn(
            "hashtext('scopeproof-xa-form-balance-' || v_consent)",
            MIGRATION,
        )

    def test_schema_snapshot_matches_the_migration_contract(self):
        self.assertIn("'consent_version', v_session.consent_version", SCHEMA)
        self.assertIn("'consent_version', v_consent", SCHEMA)
        self.assertRegex(
            SCHEMA,
            r"from public\.xa_probe_sessions\s+where consent_version = v_consent",
        )

    def test_spec_has_no_withdrawn_decision_residue(self):
        self.assertNotIn("冻结版 v2", SPEC)
        self.assertNotIn("是否要补已定，不等 D3", SPEC)
        self.assertNotIn("3000 ms 倒计时 disabled", SPEC)
        self.assertIn("代码仅供预览，禁止正式投放", SPEC)


if __name__ == "__main__":
    unittest.main()
