import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, test } from "bun:test"

const testDir = dirname(fileURLToPath(import.meta.url))
const source = () => readFileSync(resolve(testDir, "App.tsx"), "utf8")

describe("StartupReadinessScreen logo", () => {
  test("uses theme-aware DevRyan logos for the loading indicator", () => {
    const code = source()

    expect(code).toContain("import devRyanBlackLogoUrl from '@/assets/DevRyanBlack.svg'")
    expect(code).toContain("import devRyanWhiteLogoUrl from '@/assets/DevRyanWhite.svg'")
    expect(code).toContain("const root = document.documentElement")
    expect(code).toContain("root.classList.contains('dark')")
    expect(code).toContain("root.getAttribute('data-splash-variant') === 'dark'")
    expect(code).toContain("root.getAttribute('data-splash-variant') === 'system'")
    expect(code).toContain("window.matchMedia('(prefers-color-scheme: dark)').matches")
    expect(code).toContain("const variant = currentTheme?.metadata?.variant")
    expect(code).toContain("setLogoPrefersDark(variant === 'dark')")
    expect(code).toContain("const logoUrl = logoPrefersDark ? devRyanWhiteLogoUrl : devRyanBlackLogoUrl")
    expect(code).toContain('src={logoUrl}')
    expect(code).toContain('className="flex size-12 items-center justify-center rounded-full border border-border"')
    expect(code).toContain('className="size-8 animate-pulse pointer-events-none"')
    expect(code).not.toContain("size-2 animate-pulse rounded-full bg-primary")
    expect(code).not.toContain("size-10 items-center")
    expect(code).not.toContain("className=\"size-7 animate-pulse pointer-events-none\"")
  })

  test("keeps the destructive indicator for startup errors", () => {
    const code = source()

    expect(code).toContain("size-2 rounded-full bg-destructive")
    expect(code).toContain("isError ? 'Startup needs attention' : 'Starting DevRyan'")
  })
})
