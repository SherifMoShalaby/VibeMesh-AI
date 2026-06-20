import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'

const REF_IMAGE = path.resolve('bench/vision-sketch.png')

/** Load the Storage box built-in example (no AI) and wait for the render. */
async function loadExample(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /new chat/i }).click({ timeout: 15_000 }).catch(() => {})
  await page.locator('.example-card', { hasText: 'Storage box' }).click()
  await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 })
}

test.describe('in-chat composer + chrome', () => {
  test('a code-bearing message shows a restorable version chip', async ({ page }) => {
    await loadExample(page)
    await expect(page.locator('.code-chip').first()).toContainText(/current/i)
  })

  test('the in-chat composer attaches a reference image (thumbnail)', async ({ page }) => {
    await loadExample(page)
    await page.locator('.chat-pane input[type="file"]').first().setInputFiles(REF_IMAGE)
    await expect(page.locator('.chat-pane img').first()).toBeVisible({ timeout: 15_000 })
  })

  test('the Engines modal opens from the top bar and closes on Escape', async ({ page }) => {
    await loadExample(page)
    // the top-bar chip reads "Engine · X" when keyed, "Connect AI" when keyless (CI)
    await page.getByRole('button', { name: /engine|connect ai/i }).first().click()
    const modal = page.locator('[class*="modal"], [role="dialog"]').first()
    await expect(modal).toBeVisible()
    await expect(modal).toContainText(/AI engines/i)
    await page.keyboard.press('Escape')
    await expect(modal).toBeHidden()
  })

  test('the shading toggle cycles modes and keeps rendering', async ({ page }) => {
    await loadExample(page)
    const shade = page.locator('.tool-btn[aria-label="Cycle shading mode"]')
    await expect(shade).not.toHaveClass(/active/) // starts at "solid"
    await shade.click()
    await expect(shade).toHaveClass(/active/) // any non-solid mode marks it active
    await expect(page.locator('canvas')).toBeVisible()
  })
})

test.describe('mobile layout (phone width)', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('the bottom tab bar switches Model / Tweak / Chat', async ({ page }) => {
    await loadExample(page)
    await expect(page.locator('.tabbar, [class*="tabbar"]').first()).toBeVisible()
    await page.getByRole('button', { name: /^tweak$/i }).click()
    await page.getByRole('button', { name: /^chat$/i }).click()
    await page.getByRole('button', { name: /^model$/i }).click()
    await expect(page.locator('canvas')).toBeVisible()
  })

  test('the Printable verdict stays visible (not scrolled off) on a phone', async ({ page }) => {
    await loadExample(page)
    await page.getByRole('button', { name: /^model$/i }).click()
    const badge = page.locator('.print-badge')
    await expect(badge).toBeVisible()
    const box = (await badge.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(375 + 1) // within the phone viewport, not off-screen-right
  })

  test('the model menu stays within the viewport at a phone width', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /new chat/i }).click({ timeout: 15_000 }).catch(() => {})
    await expect(page.locator('.empty')).toBeVisible({ timeout: 20_000 })
    const trigger = page.locator('.empty-composer .model-menu button')
    // the menu only renders once /api/health resolves an engine with models — give it a beat,
    // then skip cleanly if this environment has no engine configured (keyless CI).
    await trigger.first().waitFor({ state: 'visible', timeout: 6_000 }).catch(() => {})
    test.skip((await trigger.count()) === 0, 'no engine configured → no model menu')
    await trigger.first().click()
    const pop = page.locator('.model-menu-pop')
    await expect(pop).toBeVisible()
    const box = (await pop.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(375 + 1)
  })
})
