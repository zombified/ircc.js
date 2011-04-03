var sys = require('sys');
var irc = require('./ircc');

var c = new irc.Client('irc.freenode.net', 6667, 'guest', 'guest', 'Guest');
var joined = false;

c.on('001', function() { c.join('#atestchannel'); });
c.on('joined', function(channame) { 
    console.log('joined ' + channame);
    c.names([channame]);
    joined = true;
});
c.on('names', function(names) { console.log(names); });
c.on('msg', function(from, to, message) { 
    if(joined) { 
        c.privmsg(['#atestchannel'], message); 
    } 
});
c.connect();
