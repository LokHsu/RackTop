import assert from 'node:assert/strict'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH })
const baseUrl = process.env.RACKTOP_PREVIEW_URL || 'http://127.0.0.1:1421/'
try {
  const page = await browser.newPage()
  for (const platform of ['linux', 'windows', 'macos']) {
    for (const width of [900, 1100, 1320]) {
      await page.setViewportSize({ width, height: 820 })
      await page.goto(`${baseUrl}?previewState=update-active`)
      await page.locator('.brand__mark').waitFor()
      await page.evaluate(platform => {
        document.documentElement.dataset.platform = platform
        const row = document.querySelector('.brand-row')
        row.style.width = '150px'
        row.insertAdjacentHTML('beforeend', '<span style="flex:none;width:32px">123</span>')
      }, platform)
      const actual = await page.locator('.brand__mark').evaluate(element => {
        const bounds = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        return { width: bounds.width, height: bounds.height, shrink: style.flexShrink }
      })
      if (platform === 'linux') {
        assert.equal(actual.width, 32)
        assert.equal(actual.height, 32)
        assert.equal(actual.shrink, '0')
      } else {
        assert.equal(actual.shrink, '1', `${platform} must retain the original flex behavior`)
      }
      console.log(`${platform} ${width}: ${JSON.stringify(actual)}`)
    }
  }
} finally {
  await browser.close()
}
