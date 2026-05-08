# Project Evolution Archive

This folder contains historical project documentation retained for **legal reasons**. Do not delete or rename files here without consulting legal/leadership.

## Operational constraints

- One file (`Hermes : Anna thinking.pdf`) contains a colon, illegal in Windows filenames.
- This folder is **excluded from the Windows build runner** via sparse-checkout in `.github/workflows/build-and-upload.yml` and `.github/workflows/release.yml`. Do not remove that exclusion.
- This folder is **excluded from the OSS mirror** by allow-list (it is not listed in `scripts/oss-allow-list.txt`). Do not add it.
- The CI filename guard in `.github/workflows/validate.yml` exempts this folder, so any new file added here is permitted regardless of its name.

## Local Windows development

If you clone this repo on Windows, the checkout will fail on the file with `:` in its name. Use cone-mode sparse-checkout to skip this folder:

```bash
git clone --no-checkout https://github.com/craft-ai-agents/craft-agents.git
cd craft-agents
git sparse-checkout init --cone
git sparse-checkout set apps packages scripts workers
git checkout main
```

This includes all root files plus the directories listed; `docs/` (and `plans/`) are left out, so the Windows-illegal filename is never materialized.
