var https = require('https');
var fs = require('fs');
var _ = require('lodash');
var sqlite3 = require('sqlite3').verbose();
var randomString = require("randomstring");
var express = require('express');
var cors = require('cors')
var unirest = require('unirest');
var linebot = require('linebot');
var chalk = require('chalk');
var config = require('./config');
var channelInfo = config.channel;
var sslInfo = config.ssl;
var bot = linebot({
    channelId: channelInfo.id,
    channelSecret: channelInfo.secret,
    channelAccessToken: channelInfo.token
});
var sslOptions = {
  ca: fs.readFileSync(sslInfo.ca),
  key: fs.readFileSync(sslInfo.key),
  cert: fs.readFileSync(sslInfo.cert)
};
var app = express();
var linebotParser = bot.parser();

var getLineId = function (shortId, callback) {
  var output;
  var db = new sqlite3.Database('db.sqlite');
  db.serialize(function() {
    db.get('SELECT line_id from lineid WHERE short_id = ?', [shortId], function (err, row) {
      if (row !== undefined && !err) {
        output = row.line_id;
      } else {
        output = false;
      }
      db.close();
      if (callback && typeof callback === 'function') {
        callback(output);
      }
      return output;
    });
  });
}

var getShortId = function (lineId, callback) {
  // Will create one if `lineId` not exists

  var rdstr = randomString.generate({
    length: 5,
    charset: 'hex'
  });
  var db = new sqlite3.Database('db.sqlite');
  var output;

  db.serialize(function() {
    db.get('SELECT short_id from lineid WHERE line_id = ?', [lineId], function (err, row) {
      if (row === undefined || err) {
        db.run('INSERT OR IGNORE INTO lineid (line_id, short_id)\
                  VALUES (?, ?)', [lineId, rdstr]);
        output = rdstr;
      } else {
        output = row.short_id;
      }
      db.close();
      if (callback && typeof callback === 'function') {
        callback(output);
      }
      return output;
    });
  });
}

var getAirData = function (callback) {
  unirest.get('http://opendata2.epa.gov.tw/AQX.json')
    .end(function (res) {
      callback(res.body);
    });
}

var replyToEvent = function (event, pushMessage) {

  event.reply(pushMessage).then(function (data) {
    event.source.profile().then(function (profile) {
      consoleLog('info', 'Replied message from ' + profile.displayName);
    });
  }).catch(function (error) {
    consoleLog('error', 'Reply failed ' + error);
  });
}

var consoleLog = function (type, message) {
  var log = '';
  switch (type) {
  case 'info':
    log += chalk.blue('INFO ') + ' ' + message;
    console.log(log)
    break;
  case 'error':
    log =+ chalk.red('ERROR ⁉️ ') + ' '  + message;
    console.error(log);
    break;
  case 'success':
    log = chalk.green('YEAH🤘 ') + ' '  + message;
    console.log(log);
    break;
  default:
    console.log(log);
    break;
  }
}

app.use(function (req, res, next) {
  res.setHeader('X-Powered-By', 'electricity');
  next();
});

app.set('port', (process.env.PORT || 5566));
app.post('/', linebotParser);

app.get('/god', function (req, res) {
  var db = new sqlite3.Database('db.sqlite');
  db.all('SELECT * from lineid', function (err, rows) {
    res.json(rows);
    consoleLog('info', 'OH MY GOD');
  });
});

app.get('/push/:id/:message', cors(), function (req, res) {
  getLineId(req.params.id, function (lineId) {
    if (lineId) {
      bot.push(lineId, req.params.message);
      bot.getUserProfile(lineId).then(function (profile) {
        res.json({'result': 'Pushed message to ' + profile.displayName, 'request': {'id': req.params.id, 'message': req.params.message}});
        consoleLog('info', 'Pushed message to ' + profile.displayName + ' (' + req.params.id + ')');
      }).catch(function (error) {
        consoleLog('error', 'Push failed ' + error)
      });
    } else {
      res.json({'result': 'Failed, ID not found', 'request': {'id': req.params.id, 'message': req.params.message}});
    }
  });
});

bot.on('follow', function (event) {
  getShortId(event.source.userId, function (shortId) {
    replyToEvent(event, ['👇你的使用者ID', shortId]);
  });
});

bot.on('join', function (event) {
  getShortId(event.source.userId, function (shortId) {
    replyToEvent(event, ['👇你的使用者ID', shortId]);
  });
});

bot.on('message', function (event) {
  var message = event.message.text.split(' ');

  switch (message[0]) {
  case 'id':
  case 'ID':
    getShortId(event.source.userId, function (shortId) {
      replyToEvent(event, ['👇你的使用者ID', shortId]);
    });
    break;
  case 'air':
  case '空氣':
    var output = '';

    if (message[1]) {
      getAirData(function (airData) {
        _.forEach(airData, function (site) {
          if (site.County === message[1]) {
            output += site['County'] + site['SiteName'] + '\n';
            if (site['WindDirec'] !== '') {
              output += ' - 風向：' + site['WindDirec'] + ' °\n';
            } else {
              output += ' - 風向：N/A\n';
            }

            if (site['WindSpeed'] !== '') {
              output += ' - 風速：' + site['WindSpeed'] + ' m/s\n';
            } else {
              output += ' - 風速：N/A\n';
            }

            if (site['PM2.5'] !== '') {
              output += ' - PM2.5：' + site['PM2.5'] + ' μg/m³\n\n';
            } else {
              output += ' - PM2.5：N/A\n\n';
            }
          }
        });
        if (output === '') {
          output = '哎呀！沒有這個城市\n\n小提醒：\n如果要查詢的是"台南"，請輸入正體全名"臺南市"';
        }
        replyToEvent(event, output);
      });
    }
    break;
  case undefined:
    // if message isn't text
    replyToEvent(event, 
    {
        type: 'sticker',
        packageId: '1',
        stickerId: '8'
    });
    break;
  default:
    unirest.get('http://more.handlino.com/sentences.json')
      .query('limit=1,30')
      .end(function (res) {
        replyToEvent(event, [res.body.sentences[0]]);
      });
    break;
  }
});

https.createServer(sslOptions, app).listen(app.get('port'), function() {
  consoleLog('success', 'Listening on port ' + app.get('port'));
});
