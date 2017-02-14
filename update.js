const _ = require('lodash');
const fs = require('fs');
const weatherTW = require('weather-taiwan');
const config = require('./config');
const unirest = require('unirest');

// const fetcher = weatherTW.fetch(config.cwb.token);
const fetcher = weatherTW.fetch('CWB-3DFC8F23-8E9B-48AA-9FBB-2CCE7425A515');
const parser = weatherTW.parse();
let stations = [];

parser.on('data', function (station) {
  stations.push(station);
});

parser.on('error', function (error) {
  fs.appendFile('update.log', 'Error while updating weather: ' + error + '\n', function (err) {
    if (err) {
      console.error('FS error: ' + err, new Date());
    }
  });
});

parser.on('finish', function () {
  stations = JSON.stringify(stations, null, 2);
  fs.writeFile('/var/www/weather-bot/data/weather.json', stations, function (err) {
    if (err) {
      console.error('FS error: ' + err, new Date());
    } else {
      console.log(new Date());
      console.log('Weather updated.');
    }
  });
});

fetcher.pipe(parser);

unirest.get('http://opendata2.epa.gov.tw/AQX.json')
.end(function (res) {
  if (!res.ok) {
    fs.appendFile('update.log', 'Server retrun status code ' + res.code + '\n', function (err) {
      if (err) {
        console.error('FS error: ' + err, new Date());
      }
    });
  } else {
    fs.writeFile('/var/www/weather-bot/data/aqx.json', JSON.stringify(res.body), function (err) {
      if (err) {
        console.error('FS error: ' + err, new Date());
      } else {
        console.log(new Date());
        console.log('AQX updated');
      }
    });
  }
});
