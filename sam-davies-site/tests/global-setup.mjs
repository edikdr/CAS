// Runs the static checks before every e2e run (TZ §8A: check-i18n inside the e2e script).
import { execFileSync } from 'node:child_process';

export default function globalSetup() {
  for (const tool of ['tools/check-i18n.mjs', 'tools/check-fonts.mjs']) execFileSync(process.execPath, [tool], { stdio: 'inherit' });
}
