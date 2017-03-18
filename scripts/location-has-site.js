// Check if town in data/town.json has site of pm2.5 sensor, and generate result as data/pm-site.json

const fs = require('fs');
const _ = require('lodash');
const q = require('q');

const readJSON = (path) => {
  const deferred = q.defer();

  fs.readFile(path, 'utf-8', (err, data) => {
    if (err) {
      deferred.reject(new Error('Error while reading ' + path + ', ' + err));
    } else {
      if (!_.isEmpty(data)) {
        data = JSON.parse(data);
      } else {
        data = [];
      }
      deferred.resolve(data);
    }
  });
  return deferred.promise;
};

const appendJSON = (path, data) => {
  const deferred = q.defer();
  fs.writeFile(path, JSON.stringify(data, null, 2), function (err) {
    if (err) {
      deferred.reject(new Error('Error while writing ' + path + ', ' + err));
    } else {
      deferred.resolve();
    }
  });
  return deferred.promise;
};

q.spread([readJSON('data/aqx.json'), readJSON('data/town.json')], (sites, towns) => {
  let stations = [];

  _.each(towns, (town) => {
    let townName = '';

    if (_.indexOf(['區', '鄉', '鎮'], town.name[town.name.length - 1]) > -1) {
      townName = town.name.slice(0, -1);
    } else {
      townName = town.name;
    }

    let hasSite = _.find(sites, (site) => {
      return site.SiteName === townName;
    });

    if (hasSite) {
      town.hasSite = true;
      town.bestSite = townName
    } else {
      town.hasSite = false;
      town.bestSite = '';
    }

    stations.push(town);
    appendJSON('../data/pm-site.json', stations);
  });
})
.fail((err) => {
  console.error(err)
})