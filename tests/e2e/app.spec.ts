import { test, expect } from '@playwright/test'
import path from 'node:path'

// Playwright runs from the repo root; resolve the test fixture against cwd (ESM has no __dirname).
const REF_IMAGE = path.resolve('bench/vision-sketch.png')

/** Reach the home / empty state (a fresh chat) before each test. */
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /new chat/i }).click({ timeout: 15_000 }).catch(() => {})
  await expect(page.locator('.empty')).toBeVisible({ timeout: 20_000 })
})

test.describe('home / empty state', () => {
  test('renders the value prop + composer', async ({ page }) => {
    await expect(page.locator('.empty h1')).toContainText(/printable/i)
    await expect(page.locator('.empty-composer textarea')).toBeVisible()
    await expect(page.locator('.ex-chip.starter')).not.toHaveCount(0)
  })

  test('a mechanism starter prefills the composer', async ({ page }) => {
    const starter = page.locator('.ex-chip.starter').first()
    const label = ((await starter.textContent()) ?? '').trim()
    await starter.click()
    await expect(page.locator('.empty-composer textarea')).toHaveValue(label)
  })

  test('BUG-FIX: model menu popup is portaled to <body> and not clipped (was sheared by the composer)', async ({ page }) => {
    const trigger = page.locator('.empty-composer .model-menu button')
    test.skip((await trigger.count()) === 0, 'no engine configured → no model menu to test')
    await trigger.first().click()
    const pop = page.locator('.model-menu-pop')
    await expect(pop).toBeVisible()
    const info = await pop.evaluate((el) => {
      const r = el.getBoundingClientRect()
      return { onBody: el.parentElement === document.body, top: r.top, left: r.left, height: r.height }
    })
    expect(info.onBody).toBe(true) // portaled out of the overflow:hidden composer
    expect(info.top).toBeGreaterThanOrEqual(0) // fully within the viewport, not clipped above
    expect(info.left).toBeGreaterThanOrEqual(0)
    expect(info.height).toBeGreaterThan(0)
  })

  test('BUG-FIX: dragging an image arms the drop overlay on the home state', async ({ page }) => {
    await page.locator('.empty').evaluate((el) => {
      const ev = new DragEvent('dragover', { bubbles: true, cancelable: true })
      Object.defineProperty(ev, 'dataTransfer', { value: { items: [{ type: 'image/png' }], files: [] } })
      el.dispatchEvent(ev)
    })
    await expect(page.locator('.empty .drop-overlay')).toBeVisible()
  })

  test('attaching a reference image via the file picker shows a thumbnail', async ({ page }) => {
    await page.locator('.empty-composer input[type=file]').setInputFiles(REF_IMAGE)
    await expect(page.locator('.empty-thumb img').first()).toBeVisible({ timeout: 15_000 })
  })
})

test.describe('geometry pipeline (built-in example, no AI)', () => {
  test('loads a built-in example → canvas renders + Printable verdict + bounds', async ({ page }) => {
    await page.locator('.example-card', { hasText: 'Storage box' }).click()
    await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('.hud-dims .dim-val')).toContainText('×', { timeout: 30_000 })
    await expect(page.locator('.print-badge .pb-label')).toContainText(/printable/i)
  })

  test('a parameter slider re-renders the model (bounds change)', async ({ page }) => {
    await page.locator('.example-card', { hasText: 'Storage box' }).click()
    const dims = page.locator('.hud-dims .dim-val')
    await expect(dims).toContainText('×', { timeout: 30_000 })
    const before = (await dims.textContent()) ?? ''
    await page.locator('input[type=range]').first().evaluate((el: HTMLInputElement) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      setter.call(el, String(Math.round((Number(el.min) + Number(el.max)) / 2)))
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await expect(dims).not.toHaveText(before, { timeout: 15_000 })
  })

  test('the export menu opens', async ({ page }) => {
    await page.locator('.example-card', { hasText: 'Storage box' }).click()
    await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 })
    await page.locator('#topbar-export').click()
    await expect(page.locator('[role="menu"], .menu').first()).toBeVisible()
  })

  test('BambuStudio-style view hotkeys (0–6) set standard views without error', async ({ page }) => {
    await page.locator('.example-card', { hasText: 'Storage box' }).click()
    await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 })
    // the control hint advertises the scheme
    await expect(page.locator('.ac-hint', { hasText: '0' })).toContainText('views')
    // each standard-view hotkey applies cleanly and the canvas stays alive
    for (const k of ['1', '2', '3', '4', '5', '6', '0']) {
      await page.keyboard.press(k)
      await page.waitForTimeout(80)
    }
    await expect(page.locator('canvas')).toBeVisible()
  })

  test('the X-ray toggle flips the model transparent and back', async ({ page }) => {
    await page.locator('.example-card', { hasText: 'Storage box' }).click()
    await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 })
    const xray = page.locator('.tool-btn[aria-label="Toggle X-ray transparency"]')
    await expect(xray).toHaveAttribute('aria-pressed', 'false')
    await xray.click()
    await expect(xray).toHaveAttribute('aria-pressed', 'true')
    await expect(xray).toHaveClass(/active/)
    await xray.click()
    await expect(xray).toHaveAttribute('aria-pressed', 'false')
  })
})
