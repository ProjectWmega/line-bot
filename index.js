var https = require('https');
var fs = require('fs');
var _ = require('lodash');
var express = require('express');
var unirest = require('unirest');
var linebot = require('linebot');
var channelInfo = require('./config').channel;
var sslInfo = require('./config').ssl;
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

app.set('port', (process.env.PORT || 5000));
app.post('/', linebotParser);

bot.on('message', function (event) {
  var message = event.message.text;
  event.reply(message).then(function (data) {
    console.log('Message sent');
  }).catch(function (error) {
    console.error(error);
  });
});

https.createServer(sslOptions, app).listen(app.get('port'), function(){
  console.log('Listening on port ' + app.get('port'));
});
