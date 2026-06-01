# Document Tool Smoke Tests

This folder contains smoke tests for bundled CLI tools under `resources/scripts/`.

## Run all tool smoke tests

From repo root:

```bash
python3 -m unittest discover resources/scripts/tests
```

Or use the root script:

```bash
bun run test:doc-tools
```

## Run a single suite

```bash
python3 -m unittest discover resources/scripts/tests -p 'test_xlsx_tool_smoke.py'
```

## Notes

- Tests execute the **wrapper binaries** in `resources/bin/*` (not scripts directly).
- The shared harness configures `CRAFT_UV`, `CRAFT_SCRIPTS`, and `PATH`.
- If bundled `uv` is missing for your platform, harness falls back to `uv` on PATH.
- Tests create temporary fixtures at runtime and clean them up automatically.

## Contributor expectation

If you modify any script in `resources/scripts/` or wrapper in `resources/bin/`, update/add relevant smoke tests in this folder.
