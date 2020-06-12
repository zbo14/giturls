# giturls

A command-line tool that searches GitHub for URLs

## Install

`$ npm i @zbo14/giturls`

## Usage

```
Usage: giturls [options] <query>

Options:
  -V, --version          output the version number
  -c, --cookie <string>  cookie for your GitHub account
  -q, --quiet            don't show banner and info
  -w, --window           open the browser window
  -h, --help             display help for command
```

**Note:** `giturls` might output the same URL multiple times.

To process unique URLs, you can pipe `giturls` to `sort`:

`$ giturls -c <cookie> <query> | sort -u > unique-urls.txt`
