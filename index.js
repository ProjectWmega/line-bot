var https = require('https');
var fs = require('fs');
var _ = require('lodash');
var sqlite3 = require('sqlite3').verbose();
var randomString = require("randomstring");
var express = require('express');
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

var replyToEvent = function (event, pushMessage) {

  event.reply(pushMessage).then(function (data) {
    event.source.profile().then(function (profile) {
      console.log(chalk.blue('INFO') + ' Replied message from', profile.displayName);
    });
  }).catch(function (error) {
    console.error(chalk.red('ERROR ⁉️ ') + ' Reply failed ', error);
  });
}

app.use(function (req, res, next) {
  res.setHeader('X-Powered-By', 'electricity');
  next();
});

app.set('port', (process.env.PORT || 5566));
app.post('/', linebotParser);

app.get('/push/:id/:message', function (req, res) {
  getLineId(req.params.id, function (lineId) {
    if (lineId) {
      bot.push(lineId, req.params.message);
      bot.getUserProfile(lineId).then(function (profile) {
        res.json({'result': 'Pushed message to ' + profile.displayName, 'request': {'id': req.params.id, 'message': req.params.message}});
        console.log(chalk.blue('INFO') + ' Pushed message to ' + profile.displayName + ' (' + req.params.id + ')');
      }).catch(function (error) {
        console.error(chalk.red('ERROR ⁉️ ') + ' Push failed ', error);
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
  var message = event.message.text;

  switch (message) {
  case 'id':
  case 'ID':
    getShortId(event.source.userId, function (shortId) {
      replyToEvent(event, ['👇你的使用者ID', shortId]);
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

https.createServer(sslOptions, app).listen(app.get('port'), function(){
  console.log(chalk.green('YEAH🤘 ') + ' Listening on port ' + app.get('port'));
});
