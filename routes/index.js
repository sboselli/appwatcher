var express = require('express');
var router = express.Router();
var W = require('../lib/appwatcher.js');
var moment = require('moment');

// Status
router.get('*', function(req, res, next) {
  W.getStatus(function(err, status) {
    if (!err) {
      req.__status = status;
      next();
    } else {
      req.__status = [];
      next();
    }
  });
});

/* GET home page. */
router.get('/', function(req, res, next) {
  // Render
  res.render('layout', {
    body: 'index',
    title: 'AppWatcher',
    status: req.__status,
    moment: moment
  });
});

router.get('/add', function(req, res, next) {
  // Get groups
  W.getGroups(function(err, groups) {
    if (!err) {
      // Render
      res.render('layout', {
        body: 'add',
        title: 'AppWatcher',
        status: req.__status,
        groups: groups
      });
    } else {
      res.send(err);
    }
  });
});
router.post('/add', function(req, res, next) {
  var type = req.body.type;

  var watcher = {
    group: req.body.groupname,
    groupId: req.body.groupid,
    freq: req.body.freq,
    type: req.body.type,
  };

  if (type == 'icmp') {
    watcher.ip = req.body.ip;
  }
  if (type == 'http') {
    watcher.url = req.body.url;
    watcher.matchData = {
      selector: req.body.selector,
      getter: req.body.getter,
      operator: req.body.operator,
      expected: req.body.expected
    }
  }

  W.addWatcher(watcher, function(err, newDoc) {
    if (!err) {
      res.redirect('/');
    } else {
      res.send(err);
    }
  });

});
router.get('/deleteWatcher/:id', function(req, res, next) {
  W.deleteWatcher(req.params.id, function(err, numRemoved) {
    if (!err) {
      res.redirect('/');
    } else {
      res.send(err);
    }
  });
});
router.get('/addgroup', function(req, res, next) {
  res.render('layout', {
    body: 'addgroup',
    title: 'AppWatcher',
    status: req.__status
  });
});
router.post('/addgroup', function(req, res, next) {

  var gName = {
    name: req.body.name
  };

  W.addGroup(gName, function(err, newGroup) {
    if (!err) {
      res.redirect('/');
    } else {
      res.send(err);
    }
  })

});


// API
router.get('/status', function(req, res, next) {
  res.send(req.__status);
});

module.exports = router;
