var sys = require('sys')
var exec = require('child_process').exec;
var cheerio = require('cheerio');
var request = require('request');
var nodemailer = require('nodemailer');

var counterHttp = 0;
var counterIcmp = 0;
var handles = [];
var handleInterval;

// create reusable transporter object using SMTP transport
var transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: 'sboselli@despegar.com',
        pass: ''
    }
});

// Setup mail options, modifcar subject y body !
var mailOptions = {
    from: 'Reservalia - Alarmas <alarmas@reservalia.com>', // sender address
    to: 'sboselli@gmail.com', // list of receivers, comma separated
    subject: 'Reservalia', // Subject line
};

// var status = global.status;
var appwatcher = {
  /**
   * [start Start all enabled Watchers]
   * @return
   */
  start: function() {
    var W = appwatcher;
    var groupMap = {};

    // Get groups
    W.getGroups(function(err, groups) {
      if (!err) {
        for (var i = 0; i < groups.length; i++) {
          groupMap[groups[i]._id] = groups[i].name;
        }

        // Get all watchers
        W.getWatchers(function(err, watchers) {
          if (!err) {
            // Loop through watchers and start monitoring
            for (var j = 0; j < watchers.length; j++) {
              var curr = watchers[j];
              var currGroup = groupMap[watchers[j].group];


              // ICMP
              if (watchers[j].type == 'icmp') {

                // Run once, then create interval
                W.icmp(curr, currGroup);

                // Helper function to keep scope
                var pollIcmp = function(curr, currGroup) {
                  return function() {
                    W.icmp(curr, currGroup);
                  }
                }

                // The handles arr stores all interval handles
                handles.push(setInterval(new pollIcmp(curr, currGroup), curr.freq * 1000));
              }

              // HTTP
              if (watchers[j].type == 'http') {
                // Run once, then create interval
                W.http(curr, currGroup);

                // Helper function to keep scope
                var pollHttp = function(curr, currGroup) {
                  return function() {
                    W.http(curr, currGroup);
                  }
                }

                // The handles arr stores all interval handles
                handles.push(setInterval(new pollHttp(curr, currGroup), curr.freq * 1000));
              }
            }
          } else {
            console.log(err);
            return false;
          };
        })

      } else {
        console.log(err);
        return false;
      }
    });
  },
  /**
   * [stop Stop all active Watchers]
   * @return
   */
  stop: function(cb) {
    // clearInterval(handleInterval);
    for (var i = 0; i < handles.length; i++) {
      clearInterval(handles[i]);
    }
    cb();
  },
  /**
   * [restart Restart Watchers]
   * @return
   */
  restart: function() {
    appwatcher.stop(function() {
      appwatcher.start();
    });
  },
  /**
   * [addGroup Add a new group]
   * @param {String}   name [Name of the group (or device)]
   * @param {Function} cb   [Callback function]
   */
  addGroup: function(name, cb) {
    dbs.groups.insert(name, function(err, newGroup) {
      if (!err) {
        cb(null, newGroup);
      } else {
        cb(err);
      };
    });
  },
  /**
   * [getGroups Get Groups/Devices]
   * @param  {Function} cb [Callback function]
   */
  getGroups: function(cb) {
    dbs.groups.find({}, function(err, docs) {
      if (!err) {
        cb(null, docs);
      } else {
        cb(err);
      };
    });
  },
  /**
   * [addWatcher Add new service Watcher]
   * @param {Object} watcher [New Watcher configuration data]
   * @param {Function} cb [Callback function]
   */
  addWatcher: function(watcher, cb) {
    dbs.watchers.insert(watcher, function(err, newDoc) {
      if (!err) {
        cb(null, newDoc);

        // Reread watchers
        appwatcher.restart();
      } else {
        cb(err);
      };
    });
  },
  /**
   * [getWatchers Get all Watchers]
   * @param  {Function} cb [Callback function]
   */
  getWatchers: function(cb) {
    dbs.watchers.find({}, function(err, docs) {
      if (!err) {
        cb(null, docs);
      } else {
        cb(err);
      };
    });
  },
  /**
   * [icmp Check devices using ICMP ]
   * @param  {String} watcher   [Watcher object]
   * @param  {String} group     [Parent group/device]
   * @param  {Int}    freq [Polling frequency in seconds]
   */
  icmp: function(watcher, group) {
    if (debug) console.log("Polling ICMP:", group, watcher.ip, watcher.freq, watcher._id);
    var ip = watcher.ip || 'localhost';
    var stats;

    // Create flag and counter objs
    if (!flags.hasOwnProperty(group)) flags[group] = {};
    if (!counters.hasOwnProperty(group)) counters[group] = {};
    counters[group].icmp = 0;

    function puts(error, stdout, stderr) {
      // Get results from stdout
      var result = stdout.split("\n");

      // Parse results
      for (var i = result.length - 1 ; i >= 0 ; i--) {
        if (result[i].indexOf('transmitted') != -1) {
        stats = result[i];
        }
      }
      stats = stats.split(', ');
      stats.pop();

      // Prepare icmp results
      var icmp = {
        type: 'icmp',
        ip: ip,
        status: parseInt(stats[1].charAt(0)) > 1 ? 'UP' : 'DOWN',
        transmitted: parseInt(stats[0].charAt(0)),
        received: parseInt(stats[1].charAt(0)),
        packetLoss: parseInt(stats[2].substr(0,2)),
        _id: watcher._id
      }

      //// Update status
      ///
      // Check if group exists first
      var curr = '';
      for (var i = 0; i < status.length; i++) {
        if (status[i].group == group) {
          curr = status[i];
        }
      }
      if (curr == '') {
        //  Create if needed
        status.push({group: group, watchers: []});
        curr = status[status.length-1];
      }
      // Make sure we have a watchers array
      if (!curr.watchers) curr.watchers = [];

      //// Add watcher results
      // Check & replace if we have a previous entry
      var exists = false;
      var wLen = curr.watchers.length
      for (var w = 0; w < wLen; w++) {
        if (curr.watchers[w]._id == icmp._id) {
          exists = true;
          curr.watchers[w] = icmp;
        }
      }
      // Push to watchers if a previous doc doesn't exist
      if (!exists) {
        curr.watchers.push(icmp);
      }


      // Handle status DOWN
      if (icmp.status == 'DOWN') {
          if (counters[group].icmp == 0) {
              // send mail
            mailOptions.subject = "Reservalia DOWN: " + group + " ICMP";
              transporter.sendMail(mailOptions, function(error, info){
                if(error){ return error;}
            });
          }

          counters[group].icmp++;
          if (counters[group].icmp > 2) counters[group].icmp = 0;
        flags[group].icmpSendMailUp = true;
      }

      // Handle status UP
      if (icmp.status == 'UP') {
        if (flags[group].icmpSendMailUp == true) {
              // send mail
          mailOptions.subject = "Reservalia UP: " + group + " ICMP";
              transporter.sendMail(mailOptions, function(error, info){
                if(error){ return error;}
            });

          counters[group].icmp = 0;
          flags[group].icmpSendMailUp = false;
        }
      }

    // sys.puts(stdout)
    }
    exec("ping -c 5 " + ip, puts);
  },
  /**
   * [http Check HTTP service]
   * @param  {String} watcher   [Watcher object]
   * @param  {String} group     [Parent group/device]
   */
  http: function(watcher, group) {
    if (debug) console.log("Polling HTTP:", group, watcher.url, watcher.freq, watcher._id);
    // Create flag and counter objs
    if (!flags.hasOwnProperty(group)) flags[group] = {};
    if (!counters.hasOwnProperty(group)) counters[group] = {};
    counters[group].http = 0;

    var url = watcher.url;
    var matchData = watcher.matchData;
  /**
   * @param  {Object} matchData [Matching options object. Example: {
   *                              selector: '.powered',   // Any valid JQuery selector
   *                              getter: 'text',         // 'text' or 'val'
   *                              operator: '==',         // '==' or '==='
   *                              expected: 'Powered by'  // Expected text to match
   *                            }]
   */

    // Prepare results obj
    var http = {
      type: 'http',
      url: watcher.url,
      status: '',
      matchData: watcher.matchData,
      _id: watcher._id
    }

    //// Update status
    ///
    // Check if group exists first
    var curr = '';
    for (var i = 0; i < status.length; i++) {
      if (status[i].group == group) {
        curr = status[i];
      }
    }
    if (curr == '') {
      //  Create if needed
      status.push({group: group, watchers: []});
      curr = status[status.length-1];
    }
    // Make sure we have a watchers array
    if (!curr.watchers) curr.watchers = [];

    //// Add watcher results
    // Check & replace if we have a previous entry
    var exists = false;
    var currW = false;
    var wLen = curr.watchers.length
    for (var w = 0; w < wLen; w++) {
      if (curr.watchers[w]._id == http._id) {
        exists = true;
        // curr.watchers[w] = http;
        currW = curr.watchers[w]
      }
    }

    // Push to watchers if a previous doc doesn't exist
    if (!exists) {
      var newLen = curr.watchers.push(http);
      currW = curr.watchers[newLen-1];
    }

    // Request page
    request(url, function (error, response, html) {
      // Response ok
      if (!error && response.statusCode == 200) {
        var $ = cheerio.load(html);

        // Try to match
        var isMatch;
        if (matchData.getter == 'text') {
          switch(matchData.operator) {
              case "==":
                  isMatch = $(matchData.selector).text() == matchData.expected;
                  break;
              case "===":
                  isMatch = $(matchData.selector).text() === matchData.expected;
                  break;
              default:
                isMatch = $(matchData.selector).text() == matchData.expected;
          }
        }
        // Set new status
        if (isMatch) {
          // Service UP !
          http.status = 'UP';
          currW = http;
        } else {
          // Element not found, assume down
          http.status = 'DOWN';
          currW = http
        }
      } else { // Res err/down
        http.status = 'DOWN';
        curW = http;
      }

      // Handle status DOWN
      if (currW.status == 'DOWN') {
          if (counters[group].http == 0) {
          // send mail
            mailOptions.subject = "Reservalia DOWN: " + group + " HTTP";
          transporter.sendMail(mailOptions, function(error, info){
                if(error){ return error;}
          });
          }

          counters[group].http++;
          if (counters[group].http > 2) counters[group].http = 0;
          flags[group].httpSendMailUp = true;
      }

      // Handle status UP
      if (currW == 'UP') {
        if (flags[group].httpSendMailUp == true) {
          // send mail
            mailOptions.subject = "Reservalia UP: " + group + " HTTP";
          transporter.sendMail(mailOptions, function(error, info){
                if(error){ return error;}
          });

            counters[group].http = 0;
            flags[group].httpSendMailUp = false;
        }
      }
    });
  }
}
module.exports = appwatcher;