const _ = require('lodash');
const fs = require('fs');
const weatherTW = require('weather-taiwan');
const config = require('./config');

const fetcher = weatherTW.fetch(config.cwb.token);
const parser = weatherTW.parse();
let stations = [];

parser.on('data', function (station) {
  stations.push(station);
});

parser.on('error', function (error) {
  fs.appendFile('update.log', stations, function (err) {
    if (err) {
      console.error('Parser error: ' + error, new Date());
    }
  });
});

parser.on('finish', function () {
  stations = JSON.stringify(stations, null, 2);
  fs.writeFile('data/stations.json', stations, function (err) {
    if (err) {
      console.error('FS error: ' + err, new Date());
    }
  });
});

fetcher.pipe(parser);