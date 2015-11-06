var express = require('express');
var session = require('express-session');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var routes = require('./routes/index');
var users = require('./routes/users');
var W = require('./lib/appwatcher.js');
var helmet = require('helmet');
var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;
var Datastore = require('nedb');

var app = express();

// Globals
global.lastPoll = [];
global.flags = {};
global.counters = {};
global.debug = true;

// Db
global.dbs = {};
dbs.users = new Datastore({ filename: 'db/users.db', autoload: true });
dbs.groups = new Datastore({ filename: 'db/groups.db', autoload: true });
dbs.watchers = new Datastore({ filename: 'db/watchers.db', autoload: true });
dbs.wlog = new Datastore({ filename: 'db/wlog.db', autoload: true });

// Passport
passport.serializeUser(function(user, done) {
  done(null, user._id);
});

passport.deserializeUser(function(id, done) {
  User.findById(id, function(err, user) {
    done(err, user);
  });
});

passport.use(new LocalStrategy(
  function(username, password, done) {
    User.findOne({ username: username }, function(err, user) {
      if (err) { return done(err); }
      if (!user) {
        return done(null, false, { message: 'Incorrect username/password.' });
      }
      if (user.password != password) {
        return done(null, false, { message: 'Incorrect username/password.' });
      }
      return done(null, user);
    });
  }
));

function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) { return next(); }
  res.redirect('/');
}

// Security
app.use(helmet());

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// uncomment after placing your favicon in /public
//app.use(favicon(__dirname + '/public/favicon.ico'));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Configuring Passport
app.use(session({
  secret: 'vladivostok',
  saveUninitialized: true,
  resave: true,
  // using store session on MongoDB using express-session + connect
}));
app.use(passport.initialize());
app.use(passport.session());

// Ensure auth
// app.all('*', function(req,res,next){
//   if (req.path === '/' ||
//       req.path === '/login' ||
//       req.path === '/register') {
//     next();
//   } else ensureAuthenticated(req,res,next);
// });

// Route entry points
app.use('/', routes);
app.use('/users', users);

// Login/Logout
app.post('/login',
  passport.authenticate('local', { successRedirect: '/home',
                                   failureRedirect: '/error',
                                   failureFlash: false })
);
app.get('/logout', function(req, res){
  req.logout();
  res.redirect('/');
});

// Start watching
W.start();

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
  app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
      message: err.message,
      error: err
    });
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  res.render('error', {
    message: err.message,
    error: {}
  });
});


module.exports = app;
