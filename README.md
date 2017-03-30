# Weather Bot

[![Greenkeeper badge](https://badges.greenkeeper.io/ProjectWmega/line-bot.svg)](https://greenkeeper.io/)

Have fun with LINE!

## Installation

- Create folder named `ssl`, then copy all certs into `ssl`
  - You can create free SSL certificate at [SSL For Free](https://www.sslforfree.com) if you don't have it yet

- Make sure to replace infomations listed in [`config.js`](config.js), including
  - SSL
    1. CA bundle
    2. Private key
    3. Certificate
  - LINE channel
    1. Channel ID
    2. Channel secret
    3. Channel access token
  - CWB
    1. [CWB access token](http://opendata.cwb.gov.tw/usages)
  - Path
    1. Absolute path to the project

- Run `npm install`

## Starting

`$ node .`

## Note

It's recommended to add the script into crontab to run automatically

Below is an example that run script every 15 mins

`*/15  * * * * osk2  /usr/bin/node /var/www/bot/scripts/update-information.js`

## Data Source

 - AQX data fecth from [opendata2.epa.gov.tw](http://opendata2.epa.gov.tw/AQX.json)
 - Weather data fetch from [Taiwan's Weather Maps!](https://github.com/comdan66/weather)
