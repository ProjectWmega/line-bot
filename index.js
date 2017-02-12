var https = require('https');
var fs = require('fs');
var _ = require('lodash');
var app = require('express')();
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
var linebotParser = bot.parser();
var subscribeList = [];
var muteList = [];

var getAirData = function (callback) {
  unirest.get('http://opendata2.epa.gov.tw/AQX.json')
    .end(function (res) {
      callback(res.body);
    });
}

var airInfoMessageBuilder = function (data) {
  var output = '';
  output += data['County'] + data['SiteName'] + '\n';
  output += data['PublishTime'] + ' 發布\n\n';

  /* 
    List of keys

    測站名稱       SiteName
    縣市           County
    空氣污染指標   PSI
    指標污染物     MajorPollutant
    狀態           Status
    二氧化硫濃度   SO2
    一氧化碳濃度   CO
    臭氧濃度       O3
    懸浮微粒濃度   PM10
    細懸浮微粒濃度 PM2.5
    二氧化氮濃度   NO2
    風速           WindSpeed
    風向           WindDirec
    細懸浮微粒指標 FPMI
    氮氧化物       NOx
    一氧化氮       NO
    發布時間       PublishTime

    Ref: http://opendata.epa.gov.tw/Data/Details/AQX/?show=all
  */

  if (data['MajorPollutant'] !== '') {
    output += '- 指標污染物：' + data['MajorPollutant'] + '\n';
  }

  if (data['Status'] !== '') {
    output += '- 空氣品質指標：' + data['Status'] + '\n';
  }

  if (data['PM2.5'] !== '') {
    output += '- PM2.5：' + data['PM2.5'] + ' μg/m³';
  } else {
    output += '- PM2.5：N/A';
  }
  return output;
}

var airListMessageBuilder = function (data, offset) {
  var output = {
    'type': 'template',
    'altText': '',
    'template': {
        'type': 'buttons',
        'text': '選擇測站',
        'actions': []
    }
  };
  var count = offset + 3;

  if (data.length === 0) {
    output = '哎呀！沒有這個城市\n\n小提醒：\n如果要查詢"台南"，請輸入正體全名"臺南市"';
    return output;
  }

  if (data.length - offset <= 3) {
    count = data.length;
  }

  output.altText += '有下列測站：\n\n';
  _.each(data, function (site) {
    output.altText += site.County + ' ' + site.SiteName + '\n';
  });

  for (offset; offset < count; offset++) {
    var item = {};
    item.type = 'postback';
    item.label = data[offset].County + data[offset].SiteName;
    item.data = '{"action":"getAirData","location":"' + data[offset].County + '|' + data[offset].SiteName + '"}';
    output.template.actions.push(item);
  }
  if (count < data.length) {
    output.template.actions.push({'type': 'postback', 'label': '其他測站...', 'data': '{"action":"nextSet", "offset":' + offset + ', "county":"' + data[0].County + '"}'});
  }
  return output;
}

var replyToEvent = function (event, pushMessage) {

  event.reply(pushMessage).then(function (data) {
    event.source.profile().then(function (profile) {
      consoleLog('info', 'Replied message from ' + profile.displayName);
      consoleLog('info', 'Return data: ', data);
    });
  }).catch(function (error) {
    consoleLog('error', 'Reply failed: ' + error);
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

app.set('port', (process.env.PORT || 5567));
app.set('json spaces', 2);
app.post('/', linebotParser);

bot.on('postback', function (event) {
  var data = JSON.parse(event.postback.data);
  switch(data.action) {
  case 'nextSet':
    var offset = data.offset;
    var county = data.county;
    getAirData(function (airData) {
      var filteredData = [];
      filteredData = _.remove(airData, function (o) {return o.County === county});
      replyToEvent(event, airListMessageBuilder(filteredData, offset));
    });
    break;

  case 'getAirData':
    var location = data.location.split('|');
    var filteredData = [];
    var output = [];
    getAirData(function (airData) {
      filteredData = _.filter(airData, _.matches({'County': location[0], 'SiteName': location[1]}));
      _.each(filteredData, function (site) {
        output.push(airInfoMessageBuilder(site));
      });
      replyToEvent(event, output);
    });
    break;
  }
});

bot.on('message', function (event) {
  var source = event.source;
  var sourceType = source.type;
  var sourceId = '';
  var sourceMessage = event.message.text;
  var splitMessage = '';
  var matchedSubscribe = [];

  sourceId = sourceType === 'room' ? source.roomId : source.userId;

  if (sourceMessage !== undefined) {
    splitMessage = sourceMessage.split(' ');
  } else {
    return;
  }

  switch (splitMessage[0]) {
  case 'air':
  case '空氣':

    if (splitMessage[2]) {
      // If SiteName is specified, show air info.
      var output = [];
      var filteredData = [];
      getAirData(function (airData) {
        filteredData = _.filter(airData, _.matches({'County': splitMessage[1], 'SiteName': splitMessage[2]}));
        _.each(filteredData, function (site) {
          output.push(airInfoMessageBuilder(site));
        });
        replyToEvent(event, output);
      });
      break;
    }

    if (splitMessage[1]) {
      // If only County specified, then show site list
      getAirData(function (airData) {
        var filteredData = [];

        filteredData = _.remove(airData, function (o) {return o.County === splitMessage[1]});
        replyToEvent(event, airListMessageBuilder(filteredData, 0));
      });
    } else {
      replyToEvent(event, '輸入"空氣 <城市名>"查詢空氣品質\n如： 空氣 臺南市');
    }

    break;
  }
});

var server = https.createServer(sslOptions, app).listen(app.get('port'), function() {
  consoleLog('success', 'Listening on port ' + app.get('port'));
});

