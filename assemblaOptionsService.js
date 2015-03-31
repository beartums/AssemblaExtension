angular.module("assembla")
  .factory("assemblaOptionsService", function($rootScope) {

    var aos = {
      options: {
        key: null,
        secret: null,
        statusTimeout: null,
        ticketsPerPage: null,
        currentPage: null,
        currentMilestone: null,
        currentSortOrder: null,
        currentSortColumn: null
      },
      status: {
        msg: '',
        mode: ''
      },
      onchange: onchange,
			setOnReadyHandler: setOnReadyHandler
    }

		var readyHandler = null;
		var isReady = false;
		
    restoreOptions();

    return aos;
		
    function onchange() {
      saveOptions();
    }
		
		function setOnReadyHandler(handler) {
			readyHandler = handler;
			if (isReady) handler();
		}

    function saveOptions() {
      chrome.storage.sync.set({
        ticketsPerPage: aos.options.ticketsPerPage,
        currentPage: aos.options.currentPage,
        currentMilestone: aos.options.currentMilestone,
        currentSortAscending: aos.options.currentSortAscending,
        currentSortColumn: aos.options.currentSortColumn,
        secret: aos.options.secret,
        key: aos.options.key,
        statusTimeout: aos.options.statusTimeout
      }, function() {
        // Update status to let user know options were saved.
        aos.status.msg = 'Options saved.';
        aos.status.style = 'alert-success'
        $rootScope.$apply();
        setTimeout(function() {
          aos.status.msg = '';
          aos.status.style = '';
          $rootScope.$apply();
        }, aos.options.statusTimeout);
      });
    }

    // Restores select box and checkbox state using the preferences
    // stored in chrome.storage.
    function restoreOptions() {
      // Use default value color = 'red' and likesColor = true.
      chrome.storage.sync.get({
        secret: '',
        key: '',
        statusTimeout: 1500,
        ticketsPerPage: 10,
        currentPage: 1,
        currentMilestone: null,
        currentSortAscending: true,
        currentSortColumn: null
      }, function(items) {
        aos.options.ticketsPerPage = items.ticketsPerPage;
        aos.options.currentPage = items.currentPage;
        aos.options.currentMilestone = items.currentMilestone;
        aos.options.currentSortAscending = items.currentSortAscending;
        aos.options.currentSortColumn = items.currentSortColumn;
        aos.options.secret = items.secret;
        aos.options.key = items.key;
        aos.options.statusTimeout = items.statusTimeout;
        $rootScope.$apply();
				if (readyHandler && !isReady) readyHandler();
				isReady = true;
      });
    }

  });
