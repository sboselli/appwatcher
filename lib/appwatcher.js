var sys = require('sys')
var exec = require('child_process').exec;
var cheerio = require('cheerio');
var request = require('request');
var nodemailer = require('nodemailer');
var schedule = require('node-schedule');
var isIP = require('isipaddress');

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
        function doSetTimeout(watcher) {

          function runPoll() {
            W.icmp(watcher._id);
            handles[watcher._id] = setTimeout(runPoll, watcher.freq * 1000);
          }
          runPoll();
        }
        // Loop through watchers and start monitoring
        for (var j = 0; j < watchers.length; j++) {
          var curr = watchers[j];

          // ICMP
          if (watchers[j].type == 'icmp') {

            // Run once, then create interval
            // W.icmp(curr._id);

            // Helper function to keep scope
            var pollIcmp = function(curr) {
              return function() {
                W.icmp(curr._id);
              }
            }

            function runPoll(curr) {
              var id = curr._id;
              W.icmp(id);
            }

            handles[curr._id] = schedule.scheduleJob('*/1 * * * *', new pollIcmp(curr));


            // The handles arr stores all interval handles
            // doSetTimeout(curr);
            // handles[curr._id] = setInterval(function() {runPoll(curr)}, curr.freq * 1000);
          }

          // // HTTP
          // if (watchers[j].type == 'http') {
          //   // Run once, then create interval
          //   W.http(curr);

          //   // Helper function to keep scope
          //   var pollHttp = function(curr) {
          //     return function() {
          //       W.http(curr);
          //     }
          //   }

          //   // The handles arr stores all interval handles
          //   handles[curr._id] = setInterval(new pollHttp(curr), curr.freq * 1000);
          // }
        }
        console.log('sched start',schedule.scheduledJobs);
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
  stopAll: function(cb) {
    for (var key in handles) {
      if (handles.hasOwnProperty(key)) {
      console.log('sched pre',schedule.scheduledJobs);
        handles[key].cancel();
        handles[key] = null;
      console.log('sched post',schedule.scheduledJobs);
      }
    }
    // for (var i = 0; i < handles.length; i++) {
    //   // clearInterval(handles[i]);
    //   handles[i].cancel();
    // }
    cb();
  },

  /**
   * [stopWatcher Stop a Watcher]
   * @return
   */
  stopWatcher: function(id, cb) {
    handles[id].cancel();
    handles[id] = null;
    console.log('Watcher Stopped:', id);
    cb();
  },
  /**
   * [restart Restart Watchers]
   * @return
   */
  restart: function() {
    appwatcher.stopAll(function() {
      appwatcher.start();
    });
  },
  /**
   * [getStatus Get current status]
   * @param {Function} cb   [Callback function]
   */
  getStatus: function(cb) {
    var status = [];
    var mapWatchers = {};

    // Map groups to watchers
    for(var i = 0; i < lastPoll.length; i++) {
      var group = lastPoll[i].group;
      var groupId = lastPoll[i].groupId;

      if (!mapWatchers[groupId]) {
        mapWatchers[groupId] = [];
      }
      mapWatchers[groupId].push(lastPoll[i]);
    }

    // Push to status obj
    for(var key in mapWatchers) {
      status.push({
        group: mapWatchers[key][0].group,
        groupId: mapWatchers[key][0].groupId,
        watchers: mapWatchers[key]
      });
    }

    cb(null, status);
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
    // Get watcher data
    dbs.watchers.findOne({_id: id}, function(err, doc) {
      if (!err) {
        // Stop the running interval
        console.log('handles', handles);
        console.log('id', id);
        console.log('id from db', handles[doc._id]);

        // clearTimeout(handles[doc._id]);
        console.log('Stopped interval:', id, doc.ip);
        handles[doc._id].cancel();
        // handles[doc._id] = null;


        // Remove from db
        dbs.watchers.remove({_id: id}, {}, function(err, numRemoved) {
          if (!err) {
            cb(null, numRemoved);

            // Finish removing watcher from lastPoll
            for (var i = 0; i < lastPoll.length; i++) {
              if (lastPoll[i].watcher == doc._id) {
                console.log('lastpoll to delete',lastPoll[i]);
                lastPoll.splice(i, 1);
                console.log('lastPoll', lastPoll);
              }
            }

            // Reread watchers
            appwatcher.restart();
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
  icmp: function(watcherId) {
    dbs.watchers.findOne({_id: watcherId}, function(err, watcher) {
    if (debug) console.log("Polling ICMP:", watcher.group, watcher.ip, watcher.freq, watcher._id);

      var id = watcher._id;
      var group = watcher.group;
      var groupId = watcher.groupId;
      var ip = watcher.ip || 'localhost';
      var stats;

      if (!isIP.test(ip)) {
        console.log("ERROR in appwatcher.icmp: Invalid IP Address");
        return false;
      }

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

        // Prepare log
        var log = {
          watcher: id,
          group: group,
          groupId: groupId,
          type: 'icmp',
          dateRun: Date.now(),
          result: {
            ip: ip,
            status: parseInt(stats[1].charAt(0)) > 1 ? 'UP' : 'DOWN',
            transmitted: parseInt(stats[0].charAt(0)),
            received: parseInt(stats[1].charAt(0)),
            packetLoss: parseInt(stats[2].substr(0,2)),
          }
        }

        // Insert to wlog db
        dbs.wlog.insert(log, function(err, newDoc) {
          if (!err) {
            // Log added, now update lastPoll
            var exists = false;
            for (var i = 0; i < lastPoll.length; i++) {
              if (lastPoll[i].watcher == watcher._id) {
                lastPoll[i] = log;
                console.log('Updated on existing:', watcher._id, ip);
                exists = true;
              }
            }
            if (!exists) {
              if (!watcher.disabled) {
                lastPoll.push(log);
                console.log('Updated on new:', watcher._id, ip);
              }
            }
          } else {
            return err;
          }
        })

        // Handle status DOWN
        if (log.result.status == 'DOWN') {
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
        if (log.result.status == 'UP') {
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
    });
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

    // Prepare log
    var log = {
      watcher: id,
      group: group,
      groupId: groupId,
      type: 'http',
      dateRun: Date.now(),
      result: {
        url: url,
        status: '',
        matchData: matchData
      }
    }

    function insertLog(log) {
      // Insert to wlog db
      dbs.wlog.insert(log, function(err, newDoc) {
        if (!err) {
          // Log added, now update lastPoll
          var exists = false;
          for (var i = 0; i < lastPoll.length; i++) {
            if (lastPoll[i].watcher == watcher._id) {
              lastPoll[i] = log;
              exists = true;
            }
          }
          if (!exists) {
            if (!watcher.disabled) {
              lastPoll.push(log);
            }
          }
        } else {
          return err;
        }
      })
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
          log.result.status = 'UP';
          insertLog(log);
        } else {
          // Element not found, assume down
          log.result.status = 'DOWN';
          insertLog(log);
        }
      } else { // Res err/down
        log.result.status = 'DOWN';
        insertLog(log);
      }

      // Handle status DOWN
      if (log.result.status == 'DOWN') {
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
      if (log.result.status == 'UP') {
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