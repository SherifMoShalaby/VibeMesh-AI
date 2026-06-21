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

  test('the Engines panel is a card grid; a "+" card expands the connect form in place', async ({ page }) => {
    await loadExample(page)
    await page.getByRole('button', { name: /engine|connect ai/i }).first().click()
    const grid = page.locator('.engine-grid')
    await expect(grid).toBeVisible()
    // the addable catalog cards (their "+" corner control) always render once /api/catalog loads,
    // with or without an AI key — so this works keyless in CI.
    const addBtn = page.locator('.engine-card .ec-corner-btn').first()
    await expect(addBtn).toBeVisible()
    await addBtn.click()
    const drawer = page.locator('.engine-card .ec-drawer').first()
    await expect(drawer).toBeVisible()
    // the connect form is revealed in place (a key / base-URL / name field, depending on the card)
    await expect(drawer.locator('input').first()).toBeVisible()
    // collapse restores focus to the trigger (useFocusTrap only restores on dialog unmount, so the
    // in-place drawer must re-seat focus itself — regression guard for the orphaned-focus bug)
    await addBtn.click()
    await expect(drawer).toBeHidden()
    await expect(addBtn).toBeFocused()
  })

  test('the right panel teaches the slider↔code relationship (Tweak tab + one-time explainer)', async ({ page }) => {
    await loadExample(page)
    await expect(page.locator('.panel-tab', { hasText: 'Tweak' })).toBeVisible() // task-language label
    const hint = page.locator('.tweak-hint') // one-time explainer (fresh context → shown)
    await expect(hint).toBeVisible()
    await expect(hint).toContainText(/recipe/i)
    await hint.locator('.th-x').click()
    await expect(hint).toBeHidden()
  })

  test('export uses the branded confirm, never a native dialog (UX-AUDIT F12)', async ({ page }) => {
    await loadExample(page)
    // a native window.confirm/alert would surface here as a Playwright dialog event; if one
    // fires, the test fails — proving the export path is fully on the styled primitives.
    let nativeDialog = false
    page.on('dialog', (d) => {
      nativeDialog = true
      void d.dismiss()
    })
    await page.locator('#topbar-export').click()
    // Standard preview (default, below Fine) → STL export offers a Fine re-render via the modal
    await page.locator('.menu-item', { hasText: 'STL' }).click()
    const modal = page.locator('.scrim .modal')
    await expect(modal).toBeVisible()
    await expect(modal).toContainText(/Re-render at Fine/i)
    await modal.getByRole('button', { name: /cancel/i }).click()
    await expect(modal).toBeHidden()
    expect(nativeDialog).toBe(false)
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
