import Resolver from 'resolver';

var App = Ember.Application.extend({
  LOG_ACTIVE_GENERATION: true,
  LOG_MODULE_RESOLVER: true,
  LOG_TRANSITIONS: true,
  LOG_TRANSITIONS_INTERNAL: true,
  LOG_VIEW_LOOKUPS: true,
  modulePrefix: 'appkit', // TODO: loaded via config
  Resolver: Resolver['default'],
  init: function () {
    window.ENV.firebaseRoot = new Firebase("https://" + window.ENV.dbName + ".firebaseio.com/");

    // Open a connection to the local web socket, and set up send command
    var localSocket = new window.WebSocket('ws://localhost:6557');
    var connected = false;
    var storedCommands = [];
    var emptyCallback = function() { };
    var doneCallback = emptyCallback;

    window.ENV.sendGruntCommand = function(command, callback) {
      if(connected) {
        localSocket.send(command);
        if(callback) doneCallback = callback;
      } else {
        storedCommands.push(command);
      }
    };

    localSocket.onmessage = function(event) {
      if(event.data === 'done') {
        doneCallback();
        doneCallback = emptyCallback; //Reset so done doesn't get called twice
      }
    };

    localSocket.onopen = function() {
      connected = true;

      storedCommands.forEach(function(item) {
        window.ENV.sendGruntCommand(item);
      });
      storedCommands = [];
    };

    this._super.apply(this, arguments);
  }
});

Ember.Application.initializer({
  name: "FirebaseSimpleLogin",
  initialize: function (container, application) {
    application.deferReadiness();

    var session = Ember.Object.create();

    // Add `session` to all the things
    application.register('firebase-simple-login:session:current', session, { instantiate: false, singleton: true });
    Ember.A(['model', 'controller', 'view', 'route']).forEach(function(component) {
      application.inject(component, 'session', 'firebase-simple-login:session:current');
    });

    session.set('auth', new FirebaseSimpleLogin(window.ENV.firebaseRoot, function(error, user) {

      var siteName = Ember.$('meta[name="siteName"]').attr('content');

      if (error) {
        // an error occurred while attempting login
        session.set('error', error);
        application.advanceReadiness();
      } else if (user) {
        // user authenticated with Firebase
        session.set('user', user);
        session.set('error', null);

        window.ENV.firebaseRoot.child('management/sites/' + siteName + '/key').once('value', function (snapshot) {

          var bucket = snapshot.val();

          window.ENV.firebase = window.ENV.firebaseRoot.child('buckets/' + siteName + '/' + bucket + '/dev');

          application.advanceReadiness();
        }, function (error) {
          session.get('auth').logout();
          session.set('error', error);
          application.advanceReadiness();
        });
      } else {
        // user is logged out
        session.set('user', null);
        application.advanceReadiness();
      }

    }));
  }
});


Ember.Route.reopen({
  beforeModel: function (transition) {
    var openRoutes = ['login', 'password-reset', 'create-user'];
    if (Ember.$.inArray(transition.targetName, openRoutes) === -1 && !this.get('session.user')) {
      transition.abort();
      this.transitionTo('login');
    }
  }
});

// This helps ember-validations not blow up
// https://github.com/dockyard/ember-validations/issues/26#issuecomment-31877071
DS.Model.reopen({
  isValid: false
});

export default App;
