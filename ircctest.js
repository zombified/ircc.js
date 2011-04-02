var sys = require('sys');
var irc = require('./ircc');

var c = new irc.Client('irc.freenode.net', 6667, 'jkleier', 'jkleier', 'jkleier'); // 'ircdhmn2', 'ircdhmn2', 'ircdhmn2');
c.on('001', function() { 
    console.log('joining');
    c.join('#jkleiertmp'); 
});
c.on('joined', function(channame) { 
    console.log('joined ' + channame);
    //setTimeout(c.disconnect(),10000);
});
c.on('disconnecting', function() { console.log('disconnecting'); });
c.on('disconnected', function() { console.log('disconnected'); });
c.on('nicknameInUse', function() { c.setNick('ircdhmn2'); });
c.connect();
