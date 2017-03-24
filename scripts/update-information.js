// Update AQX and weather information, save them into data/aqx.json and data/weather.json

const _ = require('lodash');
const fs = require('fs');
const weatherTW = require('weather-taiwan');
const config = require('../config');
const unirest = require('unirest');

const fetcher = weatherTW.fetch(config.cwb.token);
const parser = weatherTW.parse();
let stations = [];

parser.on('data', function (station) {
  stations.push(station);
});

parser.on('error', function (error) {
  fs.appendFile('../logs/update.log', 'Error while updating weather: ' + error + '\n', function (err) {
    if (err) {
      console.error('FS error: ' + err, new Date());
    }
  });
});

parser.on('finish', function () {
  stations = JSON.stringify(stations, null, 2);
  fs.writeFile(config.path + '/data/weather.json', stations, function (err) {
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
    fs.appendFile(config.path + '/logs/update.log', 'Server retrun status code ' + res.code + '\n', function (err) {
      if (err) {
        console.error('FS error: ' + err, new Date());
      }
    });
  } else {
    fs.writeFile(config.path + '/data/aqx.json', JSON.stringify(res.body), function (err) {
      if (err) {
        console.error('FS error: ' + err, new Date());
      } else {
        console.log(new Date());
        console.log('AQX updated');
      }
    });
  }
});
