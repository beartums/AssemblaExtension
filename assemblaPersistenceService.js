angular.module("assembla")
  .factory("assemblaPersistenceService", ['$rootScope', '$localForage', '$filter', '$q',
	function($rootScope, $lf, $filter, $q) {

    var aps = {
      options: {},
			data: {},
			config: {},
      status: {
        msg: '',
        mode: ''
      },
      saveOptions: saveOptions,
			onchange: saveOptions,
			setOnReadyHandler: setOnReadyHandler,
			saveAllData: saveAllData,
			getAllData: getAllData,
			saveData: saveData,
			getData: getData,
			deleteDottedKeys: deleteDottedKeys
    }

		var readyHandler = null;
		var isReady = false;
		
		var _delim = "@_@"
		
    restoreOptions();

    return aps;

		function setOnReadyHandler(handler) {
			readyHandler = handler;
			if (isReady) handler();
		}
    
		function saveOptions() {
      chrome.storage.sync.set({
        currentSortAscending: aps.options.currentSortAscending,
        currentSortColumn: aps.options.currentSortColumn,
        secret: aps.options.secret,
        key: aps.options.key,
				itemsPerPage: aps.options.itemsPerPage,
        statusTimeout: aps.options.statusTimeout,
				userLogin: aps.options.userLogin,
				purgeBeforeDate: $filter('date')(aps.options.purgeBeforeDate,'yyyy-MM-dd'),
				loadAllTickets: aps.options.loadAllTickets,
				purgeOpenTickets: aps.options.purgeOpenTickets,
				mentionWatchInterval: aps.options.mentionWatchInterval,
				filters: aps.options.filters,
				hiddenColumns: aps.options.hiddenColumns,
				hiddenFilters: aps.options.hiddenFilters,
				summaryOptions: {
					isTruncated: aps.options.summaryOptions.isTruncated,
					startLength: aps.options.summaryOptions.startLength,
					endLength: aps.options.summaryOptions.endLength
				}
      }, function() {
        // Update status to let user know options were saved.
        aps.status.msg = 'Options saved.';
        aps.status.style = 'alert-success'
        $rootScope.$apply();
        setTimeout(function() {
          aps.status.msg = '';
          aps.status.style = '';
          $rootScope.$apply();
        }, aps.options.statusTimeout);
      });
    }

    function restoreOptions() {
      // Set default values
      chrome.storage.sync.get({
        secret: '', 										// api secret
        key: '',												// api Key
        statusTimeout: 1500,						// stored data status message diplsya time
        currentSortAscending: true,			// Is current sort in ascending direction
        currentSortColumn: null,				// Column currently sorting
				itemsPerPage: 15,
				purgeOpenTickets: false,				// Allow purge function (NYI) to purge opend tickets
				purgeBeforeDate: '2012-01-01',	// Purge all tickets prior to this date (NYI)
				loadAllTickets: false,					// Load all tickets (or only tickets for this report) (NYI)
				mentionWatchInterval: '600000',	// milliseconds between api requests to user mentions by Background page
				filters: {},											// current filters in place
				hiddenColumns: {Dev:false, Status:false, Milestone:false, Created:false, Updated:false, QA:false, "QA By":false, "Desc?":false, Component:false},
				hiddenFilters: {Dev:false, Status:false, Milestone:false, QA:false, "QA By":false, Created:false, Updated:false, Component:false},
				summaryOptions: {
						isTruncated: true,
						startLength: 30,
						endLength: 20
				}
		    }, function(items) {
        aps.options.currentSortAscending = items.currentSortAscending;
        aps.options.currentSortColumn = items.currentSortColumn;
        aps.options.secret = items.secret;
        aps.options.key = items.key;
        aps.options.itemsPerPage = items.itemsPerPage;
        aps.options.statusTimeout = items.statusTimeout;
				aps.options.mentionWatchInterval = items.mentionWatchInterval;
        aps.options.purgeBeforeDate = items.purgeBeforeDate;
        aps.options.loadAllTickets = items.loadAllTickets;
        aps.options.purgeOpenTickets = items.purgeOpenTickets;
				aps.options.filters = items.filters;
				aps.options.hiddenColumns = items.hiddenColumns;
				aps.options.hiddenFilters = items.hiddenFilters;
				aps.options.summaryOptions = {
					isTruncated: items.summaryOptions.isTruncated,
					startLength: items.summaryOptions.startLenght,
					endLength: items.summaryOptions.endLength
				}
        $rootScope.$apply();
				if (readyHandler && !isReady) readyHandler();
				isReady = true;
      });
    }
		
		function saveData(propPath,obj) {
			obj = obj || aps.data;
			var val = getValueByPropPath(obj,propPath);
			return $lf.setItem(propPath,val);
		}
		function saveDataObjects(objs,dataObj) {
			dataObj = dataObj || aps.data;
			return objs.map(function(obj) {
				return saveData(obj,dataObj);
			});
		}
		
		function getData(propPath, obj) {
			obj = obj || aps.data;
			return $lf.getItem(propPath).then(function (val) {
				setValueByPropPath(obj, propPath, val);
				return val;
			});
		}
		
		function getAllData(obj) {
			obj = obj || aps.data;
			return $lf.iterate(function(val, key, count) {
				setValueByPropPath(obj, key, val);
			});
		}
		
		function saveAllData(obj,stub,promises) {
			obj = obj || aps.data;
			stub = stub || '';
			promises = promises || [];
			for (prop in obj) {
				var val = obj[prop];
				var newStub = stub==''? prop: stub+'.'+prop;
				//if (angular.isObject(val) && !angular.isArray(val)) {
				//	saveAllData(val, newStub, promises);
				//} else {
					promises.push($q.when($lf.setItem(newStub,val)));
				//}
			}
			return promises;
		}
		function deleteDottedKeys() {
			$lf.iterate(function(val,key,count) {
				if (key.indexOf('.')>-1) {
					$lf.removeItem(key);
				}
			});
		}
		function getValueByPropPath(obj,path,dflt) {
			if (!path) return dflt;
			var props = path.split('.');
			var val = props.reduce(function(child,prop) {
				if (child && child[prop]) return child[prop];
				else return null;
			}, obj);
			return val || dflt;
		}
		
		function setValueByPropPath(obj,path,val,dflt) {
			if (!path) return false;
			var props = path.split('.');
			var setVal = props.reduce(function(child,prop,idx) {
				if (!child) return false;
				if (child && !child[prop] && idx<props.length-1) child[prop] = {};
				if (child && (!child[prop] || idx==props.length-1)) child[prop] = val || dflt;
				return child[prop];
			}, obj);
			return setVal || false;
		}
				
  }]);
