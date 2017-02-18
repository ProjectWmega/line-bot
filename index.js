const https = require('https');
const fs = require('fs');
const _ = require('lodash');
const app = require('express')();
const unirest = require('unirest');
const linebot = require('linebot');
const chalk = require('chalk');
const q = require('q');
const dateFormat = require('dateformat');
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
}

const appendJSON = (path, data) => {
  const deferred = q.defer();

  readJSON(path)
  .then((json) => {
    json.push(data)
    fs.writeFile(path, JSON.stringify(json, null, 2), function (err) {
      if (err) {
        deferred.reject(new Error('Error while writing ' + path + ', ' + err));
      } else {
        deferred.resolve(data);
      }
    });
  })
  .fail((error) => {
    deferred.reject();
  });
  return deferred.promise;
}

const saveRegistration = (data) => {
  return appendJSON('data/registration.json', data);
}

const getRegistration = () => {
  return readJSON('data/registration.json');
}

const getBetaList = () => {
 return readJSON('data/beta.json'); 
}

const getAirData = () => {
  return readJSON('data/aqx.json');
}

const getWeatherData = () => {
  return readJSON('data/weather.json');
}

const airInfoMessageBuilder = (data) => {
  let output = '';

  if (!data) {
    return output;
  }

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
  } else {
    output += '- 指標污染物：N/A\n';
  }

  if (data['Status'] !== '') {
    output += '- 空氣品質指標：' + data['Status'] + '\n';
  } else {
    output += '- 空氣品質指標：N/A\n';
  }

  if (data['PM2.5'] !== '') {
    output += '- PM2.5：' + data['PM2.5'] + ' μg/m³';
  } else {
    output += '- PM2.5：N/A';
  }
  return output;
}

const weatherInfoMessageBuilder = (data) => {
  let output = '';

  /*
    STID      測站ID
    STNM      測站編號
    OBS_TIME  觀測資料時間
    TIME      未使用
    LAT       緯度 (座標系統採TWD67)
    LON       經度 (座標系統採TWD67)
    ELEV      高度，單位 公尺
    WDIR      風向，單位 度，風向 0 表示無風
    WDSD      風速，單位 公尺/秒
    TEMP      溫度，單位 攝氏
    HUMD      相對濕度，單位 百分比率，此處以實數 0-1.0 記錄
    PRES      測站氣壓，單位 百帕
    SUN       日照時數，單位 小時
    H_24R     日累積雨量，單位 毫米
    WS15M     觀測時間前推十五分鐘內發生最大風的風速，單位 公尺/秒
    WD15M     觀測時間前推十五分鐘內發生最大風的風速，單位 度
    WS15T     觀測時間前推十五分鐘內發生最大風的發生時間，hhmm (小時分鐘)
    CITY      縣市
    CITY_SN   縣市編號
    TOWN      鄉鎮
    TOWN_SN   鄉鎮編號

    1. 負值 (除溫度外) 皆表示 該時刻因故無資料。
    2. 溫度值小於 -90. 亦表示 該時刻因故無資料。

    ref: http://opendata.cwb.gov.tw/opendatadoc/DIV2/A0001-001.pdf
  */

  if (!data) {
    return output;
  }

  output += dateFormat(data.obsTime, 'yyyy-mm-dd HH:MM') + ' 觀測\n\n';

  if (data.elements.TEMP > -90) {
    output += '- 溫度：' + data.elements.TEMP + '°C\n';
  } else {
    output += '- 溫度：N/A\n';
  }

  if (data.elements.HUMD >= 0) {
    output += '- 濕度：' + (data.elements.HUMD * 100) + '%\n';
  } else {
    output += '- 濕度：N/A\n';
  }

  if (data.elements.WDSD >= 0) {
    output += '- 風速：' + data.elements.WDSD + 'm/s\n';
  } else {
    output += '- 風速：N/A\n';
  }
  output += '\n註：N/A表示測站無回傳資料';
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
  res.setHeader('X-Powered-By', 'Electricity');
  next();
});

app.set('port', (process.env.PORT || 5567));
app.set('json spaces', 2);
app.post('/', linebotParser);

bot.on('postback', (event) => {
  const source = event.source;
  const sourceType = source.type;
  const sourceId = sourceType === 'room' ? source.roomId : source.userId;
  const postbackData = JSON.parse(event.postback.data);

  switch(postbackData.action) {
  case 'nextSet':
    const offset = postbackData.offset;
    let county = postbackData.county;

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
    const location = postbackData.location.split('|');
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

  case 'registration':
    if (postbackData.answer) {
      getRegistration()
      .then((registrations) => {
        if (_.findIndex(registrations, {userId: sourceId}) < 0) {
          return bot.getUserProfile(sourceId);
        } else {
          return false;
        }
      })
      .then((result) => {
        if (!result) {
          replyToEvent(event, '你已經註冊囉');
          return false;
        }
        return saveRegistration(result);
      })
      .then((result) => {
        if (result !== false) {
          replyToEvent(event, ['收到了', {
            type: 'sticker',
            packageId: '2',
            stickerId: '179'
          }]);
        }
      })
      .fail((error) => {
        consoleLog('error', error);
      });
    } else {
      replyToEvent(event, ['都是我不好', {
        type: 'sticker',
        packageId: '1',
        stickerId: '9'
      }]);
    }
    break;
  }
});

bot.on('message', (event) => {
  const source = event.source;
  const sourceType = source.type;
  const sourceMessage = event.message.text;
  const cities = [
    '桃園縣',
    '新竹縣',
    '苗栗縣',
    '彰化縣',
    '南投縣',
    '雲林縣',
    '嘉義縣',
    '屏東縣',
    '宜蘭縣',
    '花蓮縣',
    '臺東縣',
    '澎湖縣',
    '金門縣',
    '連江縣',
    '基隆市',
    '新竹市',
    '嘉義市',
    '臺北市',
    '新北市',
    '臺中市',
    '臺南市',
    '高雄市'
  ];
  let sourceId = '';
  let splitMessage = '';

  sourceId = sourceType === 'room' ? source.roomId : source.userId;

  if (sourceMessage !== undefined) {
    splitMessage = sourceMessage.split(' '); 
  } else { 
    return; 
  }

  if (sourceMessage === '*_DEBUG_*') {
    bot
    .getUserProfile(sourceId)
    .then((profile) => {
      consoleLog('success', JSON.stringify(profile, null, 2));
      replyToEvent(event, '🐞🐞🐞');
    });
    return;
  }

  if (sourceMessage === '選我選我') {
    const output = {
      type: 'template',
      altText: '登記搶先體驗確認',
      template: {
        type: 'confirm',
        text: '確定登記搶先體驗嗎？',
        actions: [{
          type: 'postback',
          label: '沒錯！',
          data: '{"action": "registration", "answer": true}'
        }, {
          type: 'postback',
          label: '後悔了',
          data: '{"action": "registration", "answer": false}'
        }]
      }
    };
    replyToEvent(event, output);
    return;
  }

  getBetaList()
  .then((users) => {
    if (_.findIndex(users, {userId: sourceId}) > -1) {
      // Check if user is in the list

      if (splitMessage[1]) {
        // If town name is supplied.
        if (_.indexOf(cities, splitMessage[0]) > -1) {
          q.all([getAirData(), getWeatherData()])
          .spread((airData, weatherData) => {
            let output = [];
            let airInfoMessage = '';
            let weatherInfoMessage = '';

            weatherInfoMessage = weatherInfoMessageBuilder(_.remove(weatherData, (o) => {
              return o.parameters.TOWN === splitMessage[1];
            })[0]);
            weatherInfoMessage = weatherInfoMessage === '' ? '目前沒有' + splitMessage[1] + '的天氣資訊' : weatherInfoMessage;
            output.push({'type': 'text', 'text': weatherInfoMessage});

            airInfoMessage = airInfoMessageBuilder(_.remove(airData, (o) => {
              let siteName = '';

              if (_.indexOf(['區', '鄉', '鎮'], splitMessage[1][splitMessage[1].length - 1]) > -1) {
                // if last character is one of ['區', '鄉', '鎮'], remove it then
                siteName = splitMessage[1].slice(0, -1);
              } else {
                siteName = splitMessage[1];
              }
              return o.SiteName === siteName;
            })[0]);
            airInfoMessage = airInfoMessage === '' ? '目前沒有' + splitMessage[1] + '的空氣資訊' : airInfoMessage;
            output.push({'type': 'text', 'text': airInfoMessage});

            replyToEvent(event, output);
          })
          .done();
        } else {
          replyToEvent(event, '找不到這個城市的資料\n\n請注意：\n若要查詢的是"台南"，請輸入正體全名"臺南市"');
        }
      } else {
        replyToEvent(event, '輸入"<城市名稱> <鄉鎮區名稱>"查詢氣象及空氣資訊\n如：高雄市 前鎮區');
      }

    }
  });
    
});

https.createServer(sslOptions, app).listen(app.get('port'), function() {
  consoleLog('success', 'Listening on port ' + app.get('port'));
});
