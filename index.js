#!/usr/bin/env node

'use strict'

const commander = require('commander')
const fs = require('fs')
const path = require('path')
const ProgressBar = require('progress')
const puppeteer = require('puppeteer')

const banner = fs.readFileSync(path.join(__dirname, 'banner'), 'utf8')
const error = msg => console.error('\x1b[31m%s\x1b[0m', msg)
const warn = msg => console.warn('\x1b[33m%s\x1b[0m', msg)

const program = new commander.Command()

const goto = async (page, url) => {
  await page.goto(url)
  await new Promise(resolve => setTimeout(resolve, 1e3))
}

const matchAll = (regex, string) => {
  const matches = []

  let match

  while ((match = regex.exec(string))) {
    matches.push(match)
  }

  return matches
}

const getNumPages = async (query, page) => {
  const q = encodeURIComponent(query)

  await goto(page, `https://github.com/search?q=${q}&type=Code`)

  const promise = page.$$eval('div.pagination > a', anchors => {
    return anchors.map(a => (a.getAttribute('aria-label') || '').split(' ').pop())
  })

  return Math.max(1, ...await promise)
}

const gotoPage = async (query, page, pageNum) => {
  const q = encodeURIComponent(query)

  await goto(page, `https://github.com/search?p=${pageNum}&q=${q}&type=Code`)

  let hrefs = await page.$$eval('div.f4 > a', anchors => {
    return anchors.map(a => {
      let url

      try {
        url = new URL(a.href)
      } catch {
        const href = a.href[0] === '/' ? a.href : '/' + a.href
        url = new URL('https://github.com' + href)
      }

      url.hostname = 'raw.githubusercontent.com'
      url.pathname = url.pathname.replace('/blob', '')

      return url.href
    })
  })

  hrefs = hrefs.filter(Boolean)

  if (!hrefs.length) {
    const content = await page.content()

    if (content.includes('abuse detection')) {
      error('[!] GitHub is rate-limiting you')
    } else {
      error(content)
    }

    return
  }

  for (const href of hrefs) {
    try {
      await goto(page, href)
    } catch (err) {
      error('[!] ' + err.message)
      continue
    }

    const regex = /https?:\/\/[^\s,'"|()<>[\]{}]+/g
    const string = await page.$eval('pre', pre => pre.textContent)
    const matches = matchAll(regex, string)

    matches.forEach(([url]) => {
      try {
        url = new URL(url)
        url.href.includes(query) && console.log(url.href)
      } catch {}
    })
  }
}

program
  .version('0.0.0')
  .arguments('<query>')
  .option('-c, --cookie <string>', 'cookie for your GitHub account')
  .option('-q, --quiet', 'don\'t show banner and info')
  .option('-w, --window', 'open the browser window')
  .action(async (query, opts) => {
    const cookies = (opts.cookie || '')
      .split(';')
      .map(cookie => {
        let [name, ...value] = cookie.split('=')
        name = name && name.trim()
        value = value.join('=').trim()
        return name && value && { name, value }
      })
      .filter(Boolean)

    error(banner)

    const browser = await puppeteer.launch({ headless: !opts.window })
    const page = await browser.newPage()

    page.once('close', async () => {
      if (!opts.quiet) {
        warn('[-] Page closed')
        warn('[-] Exiting')
      }

      await browser.close()
      process.exit()
    })

    opts.quiet || warn('[-] Searching GitHub: ' + query)

    await goto(page, 'https://github.com')
    await page.setCookie(...cookies)
    const numPages = await getNumPages(query, page)

    let bar

    if (!opts.quiet && numPages > 1) {
      warn(`[-] Found ${numPages} pages of results`)

      bar = new ProgressBar('[:bar] :percent', {
        complete: '=',
        incomplete: ' ',
        total: numPages,
        width: 30
      })
    }

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      await gotoPage(query, page, pageNum)
      !opts.quiet && bar && bar.tick()
    }

    await browser.close()

    opts.quiet || warn('[-] Done!')
  })
  .parseAsync(process.argv)
  .catch(err => error(err) || 1)
  .then(process.exit)
