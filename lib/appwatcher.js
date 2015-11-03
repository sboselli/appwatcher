var sys = require('sys')
var exec = require('child_process').exec;
var cheerio = require('cheerio');
var request = require('request');
var nodemailer = require('nodemailer');

var counterHttp = 0;
var counterIcmp = 0;
var handles = {};

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

    // Get all watchers
    W.getWatchers(function(err, watchers) {
      if (!err) {
        // Loop through watchers and start monitoring
        for (var j = 0; j < watchers.length; j++) {
          var curr = watchers[j];

          // ICMP
          if (watchers[j].type == 'icmp') {

            // Run once, then create interval
            W.icmp(curr);

            // Helper function to keep scope
            var pollIcmp = function(curr) {
              return function() {
                W.icmp(curr);
              }
            }

            // The handles arr stores all interval handles
            handles[curr._id] = setInterval(new pollIcmp(curr), curr.freq * 1000);
            // handles.push(setInterval(new pollIcmp(curr), curr.freq * 1000));
          }

          // HTTP
          if (watchers[j].type == 'http') {
            // Run once, then create interval
            W.http(curr);

            // Helper function to keep scope
            var pollHttp = function(curr) {
              return function() {
                W.http(curr);
              }
            }

            // The handles arr stores all interval handles
            handles[curr._id] = setInterval(new pollHttp(curr), curr.freq * 1000);
            // handles.push(setInterval(new pollHttp(curr), curr.freq * 1000));
          }
        }
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
   * [deleteWatcher Delete a Watcher]
   * @param  {[type]}   id [Watcher id]
   * @param  {Function} cb [Callback function]
   */
  deleteWatcher: function(id, cb) {
    var statusWatchers = [];
    var swIndex = '';

    // Get watcher data
    dbs.watchers.findOne({_id: id}, function(err, doc) {
      if (!err) {
        console.log('found watcher');
        // Find in status object for late removal
        for (var i = 0; i < status.length; i++) {
          if (status[i].groupId == doc.groupId) {
            console.log('status[i].groupId == doc.groupId');
            if (status[i].watchers) {
              console.log('status[i].watchers');
              statusWatchers = status[i].watchers;
            }
          }
        }
        for (var i = 0; i < statusWatchers.length; i++) {
          if (statusWatchers[i]._id == id) {
            console.log('FOUND ONE BITCH');
            swIndex = i;
          }
        }

        // Remove from db
        dbs.watchers.remove({_id: id}, {}, function(err, numRemoved) {
          if (!err) {
            cb(null, numRemoved);
            console.log('removed');
            // Reread watchers
            appwatcher.restart();

            // Finish removing watcher from status obj
            var rem = statusWatchers.splice(swIndex, 1);
            console.log(rem);
          } else {
            cb(err);
          };
        });

      } else {
        cb(err);
      }
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
  icmp: function(watcher) {
    if (debug) console.log("Polling ICMP:", watcher.group, watcher.ip, watcher.freq, watcher._id);
    var id = watcher._id;
    var group = watcher.group;
    var groupId = watcher.groupId;
    var ip = watcher.ip || 'localhost';
    var stats;

    // Create flag and counter objs
    if (!flags.hasOwnProperty(id)) flags[id] = {};
    if (!counters.hasOwnProperty(id)) counters[id] = {};
    counters[id] = 0;

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
      var currGroup = '';
      for (var i = 0; i < status.length; i++) {
        if (status[i].groupId == groupId) {
          currGroup = status[i];
        }
      }
      if (currGroup == '') {
        //  Create if needed
        status.push({group: group, groupId: groupId, watchers: []});
        currGroup = status[status.length-1];
      }
      // Make sure we have a watchers array
      if (!currGroup.watchers) currGroup.watchers = [];

      //// Add watcher results
      // Check & replace if we have a previous entry
      var exists = false;
      var wLen = currGroup.watchers.length
      for (var w = 0; w < wLen; w++) {
        if (currGroup.watchers[w]._id == icmp._id) {
          exists = true;
          currGroup.watchers[w] = icmp;
        }
      }
      // Push to watchers if a previous doc doesn't exist
      if (!exists) {
        currGroup.watchers.push(icmp);
      }


      // Handle status DOWN
      if (icmp.status == 'DOWN') {
        if (counters[id] == 0) {
          // send mail
          mailOptions.subject = group + " DOWN: ICMP " + ip;
          transporter.sendMail(mailOptions, function(error, info){
            if(error){ return error;}
          });
        }

        counters[id]++;
        if (counters[id] > 2) counters[id] = 0;
        flags[id] = true;
      }

      // Handle status UP
      if (icmp.status == 'UP') {
        if (flags[id] == true) {
          // send mail
          mailOptions.subject = group + " UP: ICMP " + ip;
          transporter.sendMail(mailOptions, function(error, info){
            if(error){ return error;}
          });

          counters[id] = 0;
          flags[id] = false;
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
  http: function(watcher) {
    if (debug) console.log("Polling HTTP:", watcher.group, watcher.url, watcher.freq, watcher._id);
    var id = watcher._id;
    var group = watcher.group;
    var groupId = watcher.groupId;
    var url = watcher.url;
    var matchData = watcher.matchData;

    // Create flag and counter objs
    if (!flags.hasOwnProperty(id)) flags[id] = {};
    if (!counters.hasOwnProperty(id)) counters[id] = {};
    counters[id] = 0;

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
    var currGroup = '';
    for (var i = 0; i < status.length; i++) {
      if (status[i].groupId == groupId) {
        currGroup = status[i];
      }
    }
    if (currGroup == '') {
      //  Create if needed
      status.push({group: group, groupId: groupId, watchers: []});
      currGroup = status[status.length-1];
    }
    // Make sure we have a watchers array
    if (!currGroup.watchers) currGroup.watchers = [];

    //// Add watcher results
    // Check & replace if we have a previous entry
    var exists = false;
    var currW = false;
    var wLen = currGroup.watchers.length
    for (var w = 0; w < wLen; w++) {
      if (currGroup.watchers[w]._id == http._id) {
        exists = true;
        // currGroup.watchers[w] = http;
        currW = currGroup.watchers[w]
      }
    }

    // Push to watchers if a previous doc doesn't exist
    if (!exists) {
      var newLen = currGroup.watchers.push(http);
      currW = currGroup.watchers[newLen-1];
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
        if (counters[id] == 0) {
          // send mail
          mailOptions.subject = group + " DOWN: HTTP " + url;
          transporter.sendMail(mailOptions, function(error, info){
                if(error){ return error;}
          });
        }

        counters[id]++;
        if (counters[id] > 2) counters[id] = 0;
        flags[id] = true;
      }

      // Handle status UP
      if (currW == 'UP') {
        if (flags[id] == true) {
          // send mail
          mailOptions.subject = group + " UP: HTTP " + url;
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