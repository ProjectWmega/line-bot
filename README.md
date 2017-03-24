# Weather Bot

Have fun with LINE!

## Installation

Make sure fill LINE Channel infomation, CWB token and cert path into [`config.js`](config.js) first

You can create free SSL at [SSL For Free](https://www.sslforfree.com) if you don't have it yet

Create folder named `ssl`, then place certs into `ssl`

After all set, run:

`$ npm install`

## Starting

`$ node .`

## Note

It's recommended to add the script into crontab to run automatically

Below is an example that run script every 15 mins

`*/15  * * * *   osk2    /usr/bin/node /var/www/bot/scripts/update-information.js >> /var/www/bot/logs/update.log 2>&1`

## Data Source

 - AQX data fecth from [opendata2.epa.gov.tw](http://opendata2.epa.gov.tw/AQX.json)
 - Weather data fetch from [Taiwan's Weather Maps!](https://github.com/comdan66/weather)
