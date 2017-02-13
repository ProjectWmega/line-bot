const https = require('https');
const fs = require('fs');
const _ = require('lodash');
const app = require('express')();
const unirest = require('unirest');
const linebot = require('linebot');
const chalk = require('chalk');
const q = require('q');
const config = require('./config');
const channelInfo = config.channel;
const sslInfo = config.ssl;
const bot = linebot({
    channelId: channelInfo.id,
    channelSecret: channelInfo.secret,
    channelAccessToken: channelInfo.token
});
const sslOptions = {
  ca: fs.readFileSync(sslInfo.ca),
  key: fs.readFileSync(sslInfo.key),
  cert: fs.readFileSync(sslInfo.cert)
};
const linebotParser = bot.parser();
let muteList = [];

const getAirData = () => {
  const deferred = q.defer();

  fs.readFile('data/aqx.json', 'utf-8', (err, data) => {
    data = JSON.parse(data);
    if (err) {
      deferred.reject(new Error('Error while reading data/aqx.json'));
    } else {
      deferred.resolve(data);
    }
  });
  return deferred.promise;
}

const airInfoMessageBuilder = (data) => {
  let output = '';

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

const airListMessageBuilder = (data, offset) => {
  let output = {
    'type': 'template',
    'altText': '',
    'template': {
        'type': 'buttons',
        'text': '選擇測站',
        'actions': []
    }
  };
  let count = offset + 3;

  if (data.length === 0) {
    output = '哎呀！沒有這個城市\n\n小提醒：\n如果要查詢"台南"，請輸入正體全名"臺南市"';
    return output;
  }

  if (data.length - offset <= 3) {
    count = data.length;
  }

  output.altText += '有下列測站：\n\n';
  _.each(data, (site) => {
    output.altText += site.County + ' ' + site.SiteName + '\n';
  });

  for (offset; offset < count; offset++) {
    let item = {};

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

const replyToEvent = (event, pushMessage) => {
  const deferred = q.defer();

  event.reply(pushMessage).then((data) => {
    event.source.profile().then((profile) => {
      consoleLog('info', 'Replied message from ' + profile.displayName);
      consoleLog('info', 'Return data: ', data);
      deferred.resolve();
    });
  }).catch((error) => {
    deferred.reject(new Error('Reply failed: ' + error));
  });
  return deferred.promise;
}

const consoleLog = (type, message) => {
  let log = '';

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

app.use((req, res, next) => {
  res.setHeader('X-Powered-By', 'electricity');
  next();
});

app.set('port', (process.env.PORT || 5567));
app.set('json spaces', 2);
app.post('/', linebotParser);

bot.on('postback', (event) => {
  const data = JSON.parse(event.postback.data);

  switch(data.action) {
  case 'nextSet':
    const offset = data.offset;
    const county = data.county;

    getAirData()
    .then((airData) => {
      let filteredData = [];
      filteredData = _.remove(airData, (o) => {return o.County === county});
      return airListMessageBuilder(filteredData, offset);
    })
    .then((output) => {
      replyToEvent(event, output);
    })
    .fail((error) => {
      consoleLog('error', error);
    });
    break;

  case 'getAirData':
    const location = data.location.split('|');
    let filteredData = [];
    let output = [];

    getAirData()
    .then((airData) => {
      filteredData = _.filter(airData, _.matches({'County': location[0], 'SiteName': location[1]}));
      _.each(filteredData, (site) => {
        output.push(airInfoMessageBuilder(site));
      });
      return output;
    })
    .then((output) => {
      replyToEvent(event, output);
    })
    .fail((error) => {
      consoleLog('error', error);
    });
    break;
  }
});

bot.on('message', (event) => {
  const source = event.source;
  const sourceType = source.type;
  const sourceMessage = event.message.text;
  let sourceId = '';
  let splitMessage = '';
  let matchedSubscribe = [];

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
      // If SiteName is supplied, show air info.
      let output = [];
      let filteredData = [];

      getAirData()
      .then((airData) => {
        filteredData = _.filter(airData, _.matches({'County': splitMessage[1], 'SiteName': splitMessage[2]}));
        _.each(filteredData, (site) => {
          output.push(airInfoMessageBuilder(site));
        });
        return output;
      })
      .then((output) => {
        replyToEvent(event, output);
      })
      .fail((error) => {
        consoleLog('error', error);
      });
      break;
    }

    if (splitMessage[1]) {
      // If only County supplied, then show site list
      getAirData()
      .then((airData) => {
        let filteredData = [];

        filteredData = _.remove(airData, (o) => {return o.County === splitMessage[1]});
        return airListMessageBuilder(filteredData, 0);
      })
      .then((output) => {
        replyToEvent(event, output);
      })
      .fail((error) => {
        consoleLog('error', error);
      });
    } else {
      replyToEvent(event, '輸入"空氣 <城市名>"查詢空氣品質\n如： 空氣 臺南市');
    }
    break;
  }
});

https.createServer(sslOptions, app).listen(app.get('port'), function() {
  consoleLog('success', 'Listening on port ' + app.get('port'));
});
