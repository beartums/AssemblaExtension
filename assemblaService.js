angular.module("assembla")
  .factory("assemblaService", ['$http', '$rootScope', function($http, $rootScope) {

    var reqObj = {
			method: "GET",
			headers: {
				"X-Api-Key": null,
				"X-Api-Secret": null
			},
			url: ""
		}

    var asf = {
      getSpaces: getSpaces,
      getTickets: getTickets,
      getMilestones: getMilestones,
			getUsers: getUsers,
			getUser: getUser,
			getTags: getTags,
			getStatuses: getStatuses,
			getRoles: getRoles,
			getCustomFields: getCustomFields,
      init: init
    };
		
    return asf;

    var self = this;

    function init(authObj) {
      reqObj.headers["X-Api-Key"] = authObj.key;
      reqObj.headers["X-Api-Secret"] = authObj.secret;
    }
		function getUsers(qObj) {
		  var url = "https://api.assembla.com/v1/spaces/" + qObj.spaceId +
        "/users.json";
			if (qObj.parms) url += makeUrlParms(qObj.parms);
      return $http.get(url,reqObj);
		}
		function getUser(qObj) {
		  var url = "https://api.assembla.com/v1/users/" + qObj.userId + ".json";
			if (qObj.parms) url += makeUrlParms(qObj.parms);
      return $http.get(url,reqObj);
		}
		function getTags(qObj) {
		  var url = "https://api.assembla.com/v1/spaces/" + qObj.spaceId +
        "/tags/active.json";
			if (qObj.parms) url += makeUrlParms(qObj.parms);
      return $http.get(url,reqObj);
		}
		function getRoles(qObj) {
		  var url = "https://api.assembla.com/v1/spaces/" + qObj.spaceId +
        "/user_roles.json";
			if (qObj.parms) url += makeUrlParms(qObj.parms);
      return $http.get(url,reqObj);
		}
		function getCustomFields(qObj) {
		  var url = "https://api.assembla.com/v1/spaces/" + qObj.spaceId +
        "/tickets/custom_fields.json";
			if (qObj.parms) url += makeUrlParms(qObj.parms);
      return $http.get(url,reqObj);
		}
			
    function getTickets(qObj) {
      var url = "https://api.assembla.com/v1/spaces/" + qObj.spaceId +
        "/tickets/milestone/" + qObj.milestoneId + ".json";
			if (qObj.parms) url += makeUrlParms(qObj.parms);
      
      var p = $http.get(url,reqObj)
			
			if (!qObj.dataObject && !qObj.dataHandler) return p;
			return p.success(function(data) {
				if (!data) return qObj.dataObject;
				if (qObj.dataHandler) {
					qObj.dataHandler(data);
				} else if (qObj.dataObject) {
					data.forEach(function(item) { qObj.dataObject.push(item);	});
				}
				if (data.length<qObj.perPage) return qObj.dataObject;
				qObj.parms.page++;
				return getTickets(qObj);
			});
    }

    function getSpaces() {
      var url = "https://api.assembla.com/v1/spaces.json"
      return $http.get(url,reqObj)
    }

    function getMilestones(qObj) {
      var url = "https://www.assembla.com/v1/spaces/" + qObj.spaceId +
          "/milestones" + (qObj.type ? "/" + qObj.type : "") + ".json";
			if (qObj.parms) url += makeUrlParms(qObj.parms);
      return $http.get(url,reqObj);
    }
		
    function getStatuses(qObj) {
      var url = "https://www.assembla.com/v1/spaces/" + qObj.spaceId +
          "/tickets/statuses.json";
			if (qObj.parms) url += makeUrlParms(qObj.parms);
      return $http.get(url,reqObj);
    }
		
		function makeUrlParms(parmObj) {
			var parms = [];
			for (var prop in parmObj) {
				parms.push(prop + "=" + parmObj[prop]);
			}
      if (parms.length > 0) return "?" + parms.join("&");
			return "";
		}
  }]);
