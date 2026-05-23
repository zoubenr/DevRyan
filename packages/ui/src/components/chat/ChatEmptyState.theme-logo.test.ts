import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, test } from "bun:test"

const testDir = dirname(fileURLToPath(import.meta.url))
const source = () => readFileSync(resolve(testDir, "ChatEmptyState.tsx"), "utf8")

describe("ChatEmptyState theme logo", () => {
  test("chooses the first-frame logo from the startup theme before hydration", () => {
    const code = source()

    expect(code).toContain("import devRyanLogoUrl from '@/assets/DevRyan.svg'")
    expect(code).toContain("import devRyanWhiteLogoUrl from '@/assets/DevRyanWhite.svg'")
    expect(code).toContain("const root = document.documentElement")
    expect(code).toContain("root.classList.contains('dark')")
    expect(code).toContain("root.getAttribute('data-splash-variant') === 'dark'")
    expect(code).toContain("const variant = currentTheme?.metadata?.variant")
    expect(code).toContain("setLogoPrefersDark(variant === 'dark')")
    expect(code).toContain('const logoUrl = logoPrefersDark ? devRyanWhiteLogoUrl : devRyanLogoUrl')
    expect(code).toContain('src={logoUrl}')
    expect(code).not.toContain('className="block opacity-20 dark:hidden"')
    expect(code).not.toContain('className="hidden opacity-20 dark:block"')
  })

  test("keeps the empty state from being selected or dragged", () => {
    const code = source()

    expect(code).toContain("gap-6 select-none")
    expect(code).toContain("pointer-events-none")
    expect(code).toContain("draggable={false}")
  })
})
