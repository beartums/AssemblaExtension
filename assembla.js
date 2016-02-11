angular.module("assembla")
	.controller("assemblaController", 
			['$q','$http', '$scope', '$filter', '$timeout', 'assemblaService', 'assemblaPersistenceService', '$localForage',
		assemblaControllerFunction
	]);

	/**
	 * @ngdoc controller
	 * @name assembla.controller:AssemblaController
	 * @description
	 * Controller for the primary Assembla Ticket Manager Interface
	 *
	 **/
function assemblaControllerFunction($q, $http, $scope, $filter,$timeout, as, aps, $lf) {
	var vm = this

	// Constant Values
	vm._unassigned = '[unassigned]';
	vm._blank = '[blank]';
	vm._ignore = '@_@ignore@_@';
	vm._fetchingText = "fetching...";
	vm._successText = "success";
	vm._failureText = "failure";
	

	vm.options = aps.options
	vm.options.filters = {};
	vm.showUsers = false;;
	vm.epics = [];
	vm.associations = [];
	vm.selectedMilestone = null;
	vm.entityUpdateObj = {}
	vm.data = aps.data;
	aps.config = {};
	vm.data.milestones = [];
	vm.data.users = {};
	vm.data.tags = [];
	vm.data.statuses = [],
	vm.data.customFields = [];
	vm.data.ticketCount = {};
	vm.data.selectedSpace = null;
	vm.data.comments = {};
	vm.data.updateStatus = {
		activityLastUpdated: new Date('1/1/2006'),
		ticketLastUpdated: new Date('1/1/2006'),
		comments: {
			syncEnabled: false,
			lastCommentActivitySynced: null
		}
	}
	
	vm.refresh = refresh;
	vm.abbreviate = abbreviate;
	vm.toggle = toggle;
	vm.getUserLogin = getUserLogin;
	vm.getInitials = getInitials;
	vm.getFromList = getFromList;
	vm.isValidTicket = isValidTicket;
	vm.parseDescription = parseDescription;
	vm.addToFilter = addToFilter;
	vm.filterTickets = filterTickets;
	vm.sort = sort;
	vm.getTicketComments = getTicketComments;
	vm.getCount = getCount;
	vm.updateTickets = updateTickets;
	vm.getUpdatedTickets=getUpdatedTickets;
	vm.resetCounts = resetCounts;
	vm.cancel = cancel;
	vm.toggleCommentSync = toggleCommentSync;
	vm.optionChange = aps.onchange;
	vm.cancelClick = cancelClick;
	vm.toggleTicketDetails = toggleTicketDetails;
	vm.toggleTicketSelected = toggleTicketSelected;
	vm.toggleTicketsInCompletedMilestones =  toggleTicketsInCompletedMilestones;
	vm.updateRelatedEntities= updateRelatedEntities;
	vm.parseTicketChanges=parseTicketChanges;
	vm.saveComment = saveComment;
	vm.visibleTicketsCount = visibleTicketsCount;
	
	aps.setOnReadyHandler(refresh);
	return vm;

	/**
	 * @ngdoc method
	 * @name init
	 * @methodOf Assembla.AssemblaController
	 * @description
	 * Initialize the Assembla#AssemblaService with authorization values
	 **/
	function init() {
		as.init({
			secret: vm.options.secret,
			key: vm.options.key
		});
		// Add a listener for messages from other modules in this extension
		// chrome.runtime.onMessage.addListener(
			// function(request,sender,sendResponse) {
			// }
		// );		
	}
	
	/**
	* @ngdoc method
	* @name cancelClick
	* @methodOf Assembla.AssemblaController
	* @description
	* Cancel a click event
	**/
	function cancelClick($event) {
		$event.stopPropagation();
	}
	
	// Cancel the form data entry and roll it back
	function cancel(e,formField) {
		if (e.keyCode==27) {
			formField.$rollbackViewValue();
			return false;
		} 
		if (e.keyCode=='13') return false;
		return true
	}
	/*********************************************************************************************************
	* HELPER methods
	**********************************************************************************************************/
	
	/**
	* @ngdoc method
	* @name getFromList
	* @methodOf Assembla.AssemblaController
	* @description From a list of objects, find one where the keyprop = findText
	* and return the valueProp 
	*
	* @param {string} The text to be found
	* @param {Array} Array of objects to be searched
	* @param {string} The property to be compared to findText
	* @param {string?} The name of the property to be returned.  Optional -- full item if null
	* @returns {string | object | number} The value of the specified property**/
	function getFromList(findText,list,keyProp,valueProp) {
		return list.reduce(function(value,item) {
			if (value) return value;
			var compareText = item && item[keyProp] ? item[keyProp] : null
			if (compareText==findText) {
				value = valueProp? item[valueProp]: item;
				return value;
			}
			return null;
		},null);
	}
	// Given an object and (optional) delimiter, join the property names in a string list separated by
	// the delimieter
	function joinObjProps(obj,delim) {
		delim = delim || ', ';
		var joinString = "";
		for (var prop in obj) {
			joinString += (joinString=="" ? "" : delim) + prop;
		}
		return joinString;
	}

	// From a list of objects, return a concatenated string of the value of specified property for each object
	function joinObjVals(objs,propName,delim) {
		delim = delim || ', ';
		return objs.reduce(function(string,obj) {
			if (!obj[propName]) return string;
			return string + (string=="" ? "" : delim) + obj[propName];
		},"");
	}
			// initialize an object path for properties that don't exist. 
	// DO NOT overwrite the target if it already exists
	// return the property being initialized (or found, if already initialized
	function initPropPath(obj,propPath,dflt) {
		dflt = dflt || {};
		rval = null
		var curObj = obj || {}
		var props = propPath.split('.');
		for (var i = 0; i<props.length; i++) {
			if (!curObj[props[i]]) {
				curObj[props[i]]= i==props.length-1 ? dflt : {};
			}
			curObj = curObj[props[i]];
		} 
		return curObj;
	}
	
	// From the specified object, find the value of the specified property and return it
	// or the dflt value if the property is not defined/null.  Property can be a single words
	// or a property path (properties separated by '.' e.g. "person.name.first"
	function getValueByPropPath(propPath,obj,dflt) {
		dflt = dflt || null
		var props = propPath.split('.');
		return props.reduce(function(val, prop) {
			if (!val || val == dflt) return dflt;
			return val[prop];
		},obj);
	}
	// Set the specified value to the specified property in the object.
	// This method accepts a property path and will create the necessary objects to
	// follow it.
	function setValueByPropPath(propPath,obj,val) {
		var props = propPath.split('.');
		props.forEach(function(prop, idx) {
			if (!obj) return
			if (idx==props.length-1) {
				obj[prop] = val;
			} else {
				obj = obj[prop];
			}
		});
	}

	// Returns true if there is at least on propery in the object that is true
	// (or truthy, if truthyIsOkay is true)
	function hasTrueProperty(obj,truthyIsOkay) {
		if (!obj) return false;
		for (var prop in obj) {
			if (obj[prop]===true || (truthyIsOkay && obj[prop])) {
				return true;
			}
		}
		return false;
	}

	
	/*************************************************************************************************
	* Ticket-Specific Methods
	**************************************************************************************************/
	function visibleTicketsCount() {
		var count = 0;
		if (!vm.data || !vm.data.tickets) return 0;
		console.time('count')
		for (var i = 0; i<vm.data.tickets.length; i++) {
			if (vm.showCompletedMilestones || !isTicketHidden(vm.data.tickets[i])) {
				count++;
			}
		}
		console.timeEnd('count')
			return count;
	}
	// get initials of author or mention from the userid
	function getUserInitials(user) {
		var init = '', inits = []
		if (!user) return '--';
		var name = (user.name ? user.name 
								: (user.email ? user.email.substring(0,user.email.indexOf('@')-1)
									: user.login));
		inits = name.replace("."," ").split(" ");
		if (inits.length==1) return inits[0].substring(0,3);
		return inits.reduce(function(init,name) {
			init += name[0];
			return init;
		},"");
	}
	
	// Get initials from a generic string.  Return fist letter of each word, capitalized and concatenated
	function getInitials(string) {
		if (!string || !string.length || string.length<5) return string;
		words = string.split(' ');
		return words.reduce(function(inits,word) {
			return inits+word.substring(0,1);
		}, '');
	}
	
	// get the properties from the 'parsed' object in the specified ticket
	function getParsedProps(ticket) {
		if (!ticket.parsed) parseDescription(ticket);
		return joinObjProps(ticket.parsed);
	}

	// Set the detail tab as active or inactive
  function toggleTicketDetails(ticket,activeTab) {
		if (ticket.activeTab==activeTab) {
			delete ticket.activeTab;
		} else {
			ticket.activeTab = activeTab;
		}
	}
		
	// If selected, unselect, otherwise select the ticket
	function toggleTicketSelected(ticket) {
		if (!vm.selectedTickets) vm.selectedTickets = [];
		var idx = vm.selectedTickets.indexOf(ticket);
		if (idx==-1) {
			vm.selectedTickets.push(ticket);
		} else {
			vm.selectedTickets.splice(idx,1);
		}
	}
	
	// Turn on or off the toggle that hides tickets in completed milestones
	function toggleTicketsInCompletedMilestones(showCompletedMilestones) {
		// if (showCompletedMilestones) {  // If we are going to be showing tickets in completed milestones
			// vm.data.hiddenTickets = [];
		// } else {
			// vm.data.tickets.forEach(function(ticket) {
				// var isCompleted = vm.data.milestones[ticket.milestone_id].is_completed;
				// if (isCompleted) {
					// vm.data.hiddenTickets.push(ticket); // Tickets in hiddenTickets are not shown
				// }
			// })
		// }
		resetCounts();
		// Save changed objects locally
		aps.saveDataObjects(['tickets','hiddenTickets','ticketCount','hiddenTicketCount']);
	}
	
	// Sortfield specified the ticket property used for sorting
	function sort(sortField) {
		// if the sortfield hasn't changed, just reverse the direction
		if (sortField == vm.options.currentSortColumn) {
			vm.options.currentSortAscending = !vm.options.currentSortAscending;
		} else if (sortField) { // if null, use the current sort column, if any
			vm.options.currentSortColumn = sortField;
			vm.options.currentSortAscending = true;
		}
		if (!vm.options.currentSortColumn || vm.options.currentSortColumn=="") return;
		
		vm.sortClasses={} // for display of asc and desc markers
		vm.sortClasses[sortField] = 'glyphicon glyphicon-chevron-' + (vm.options.currentSortAscending ? 'up' : 'down');

		vm.data.tickets.sort(function(a,b) {
			var valA, valB
			if (sortField == "milestone") {
				valA = vm.data.milestones[a.milestone_id] ? vm.data.milestones[a.milestone_id].initials : '';
				valB = vm.data.milestones[b.milestone_id] ? vm.data.milestones[b.milestone_id].initials : '';
			} else if (sortField == "assigned_to_id") {
				valA = vm.data.users[a.assigned_to_id] ? vm.data.users[a.assigned_to_id].initials : '';
				valB = vm.data.users[b.assigned_to_id] ? vm.data.users[b.assigned_to_id].initials : '';
			} else {
				valA = getValueByPropPath(sortField,a,"");
				valB = getValueByPropPath(sortField,b,"");
			}
			if (sortField=='number') {
				valA = parseInt(valA || 0);
				valB = parseInt(valB || 0);
			} else {
				valA = valA || '';
				valB = valB || '';
				valA = valA.toString ? valA.toString() : valA;
				valB = valB.toString ? valB.toString() : valB;
				valA = valA.toLowerCase();
				valB = valB.toLowerCase();
			}
			
			if (!vm.options.currentSortAscending) { var h = valA; valA=valB; valB = h; }
			
			if (valA<valB) return -1;
			if (valA==valB) return 0;
			if (valA>valB) return 1;
		});
	}
	
	function getUserLogin(id) {
		if (!vm.data.users.id) return "";
		return vm.data.users.id.login
	}
	
	// Generic comparison -- compare a ticket property value to a specified value.
	function getCount(ticketPropName, comp, value) {
		var cnt = 0
		if (!vm.data || !vm.data.tickets) return 0;
		vm.data.tickets.forEach(function(t) {
			cnt += evalCompare(t, ticketPropName,comp,value) ? 1 : 0;
		});
		return cnt;
	}
	
	// function evalCompare(ticket, tPropName, comp, value) {
		// var tVal = ticket[tPropName];
		// if (isin(comp,['=','eq','==','EQ'])) return (tVal == value);
		// if (isin(comp,['>','gt','GT'])) return (tVal > value);
		// if (isin(comp,['>=','ge', 'GE','=>'])) return (tVal >= value);
		// if (isin(comp,['<=','le','LE','=<'])) return (tVal <= value);
		// if (isin(comp,['<','lt','LT'])) return (tVal < value);
		// return false;
	// }
	// function isin(val,arr,prop) {
		
		// arr.forEach(function(a) {
			// var aVal = prop && a[prop] ? a[prop] : a;
			// if (aVal==val) return a;
		// });
	// }
	
	// Add a unique ID to the properties IDs to be included for a specific property
	// e.g. "AssignedUser","12345" will include all the tickets assigned to user 12345 to the filter
	function addToFilter(propName,id) {
		var filter = initPropPath(vm.options.filters,propName,{});
		filter[id] = !filter[id];
		vm.optionChange();
	}
	
	// return true if the ticket IS to be included in the filtered tickets list
	function filterTickets(ticket,idx) {
		var include = false;
		var opts = vm.options;
		
		if (!vm.showCompletedMilestones) {
			if (isTicketHidden(ticket)) return false;
		}
		
		// Do NOT exclude tickets based on a property if that property has no assigned values
		var ignoreUser =  !opts.filters || !hasTrueProperty(vm.options.filters.user,true);
		var ignoreMilestone =  !opts.filters || !hasTrueProperty(vm.options.filters.milestone,true);
		var ignoreStatus = !opts.filters || !hasTrueProperty(vm.options.filters.status,true);
		var ignoreText = !vm.filterText || vm.filterText.trim()=="";
		var ignoreCustomFields = {};
		vm.data.customFields.forEach(function(field) {
			ignoreCustomFields[field.title] = !opts.filters.custom_fields 
																				|| !hasTrueProperty(vm.options.filters.custom_fields[field.title],true);
		});
		// A tickt is included if it it's properties can be found in the list of all properties with
		// and ID list (or, if no id lists are specified, include all tickets
		
		// dev id
		var id = ticket.assigned_to_id;
		id = id && id.trim() != "" ? id : vm._unassigned;
		if (!ignoreUser && !vm.options.filters.user[id]) return false;
		
		// Milestone
		var id = ticket.milestone_id;
		id = id && id.toString ? id.toString() : id;
		id = id && id.trim() != "" ? id : vm._unassigned;
		if (!ignoreMilestone && !vm.options.filters.milestone[id]) return false;
		// status
		if (!ignoreStatus && !vm.options.filters.status[ticket.status]) return false;
		// Custom Fields
		for (var prop in ignoreCustomFields) {
			var val = ticket.custom_fields[prop];
			val = val + val.trim() != '' ? val : vm._blank;
			if (!ignoreCustomFields[prop] && !vm.options.filters.custom_fields[prop][val]) return false;
		}
		if (opts.filters.created_on && opts.filters.created_on > new Date(ticket.created_on)) return false;
		if (opts.filters.updated_at && opts.filters.updated_at > new Date(ticket.updated_at)) return false;
		var ticketText = ticket.number.toString() + '@@' + ticket.summary + '@@' + ticket.description + '@@' + ticket.status;
		if (!ignoreText && ticketText.toLowerCase().indexOf(vm.filterText.toLowerCase())==-1) return false;
		return true;
	}
	
	function refresh() {
		init();
		// Get tickets
		//return;
		console.time('getSavedData')
		aps.getAllData().then(function(results) {
		console.timeEnd('getSavedData')
			if (!vm.data.comments) {
				vm.data.comments = {};
				aps.saveData('comments');
			}
			if (!vm.data.updateStatus) {
				vm.data.updateStatus = {
					activityLastUpdated: new Date('1/1/2006'),
					ticketLastUpdated: new Date('1/1/2006'),
					comments: {
						syncEnabled: false,
						lastCommentActivitySynced: null
					}
				}
				aps.saveData('updateStatus');
			}
			if (!vm.data.updateStatus.comments) {
				vm.data.updateStatus.comments = {
					syncEnabled: false,
					lastCommentActivitySynced: null
				}
				aps.saveData('updateStatus');
			}
			if (!vm.data.selectedSpace ) {
				var p = $q.when(updateRelatedEntities({
					spaces:true,milestones:true,users:true,tags:true,customFields:true,statuses:true
				}));
			} else {
				var p = $q.when('');
			}
			p.then(function() {
				// once the selectedSpace is in place, get the tickets updated since last update...
				console.time('getUpdatedTickets');
				getUpdatedTickets(vm.data.lastCompletedUpdateDate).then(function(data) {
					console.timeEnd('getUpdatedTickets');
					//vm.data.lastCompletedUpdateDate = new Date();
					//vm.data.mostRecentUpdateDate = null;
					if (vm.options.currentSortColumn) sort;
					console.time('SaveData');
					aps.saveAllData().then(function(results) {
						console.timeEnd('SaveData');
					});
				});
				// ... and the comments updated since the last update
				/**
				if (vm.data.updateStatus.comments.syncEnabled) {
					var lastSynced = vm.data.updateStatus.comments.lastCommentActivitySynced;
					getUpdatedComments(lastSynced).then(function(data) {
						vm.data.updateStatus.comments.lastCommentActivitySynced = data.newestCreated
					})
				}
				**/
			});
		});
	}

	function updateRelatedEntities(updateObj) {
		if (updateObj.spaces) {
			updateObj.spaces = 'fetching...'
			var p = getSelectedSpace();
		} else {
			var p = $q.when('');
		}
		
		p.then(function() {
			if (updateObj.spaces == vm._fetchingText) {
				updateObj.spaces = vm._successText;
				$timeout(function() { updateObj.spaces=false },1000);
			}
			
			var tasks = [
				{prop:'milestones',func:getMilestones},
				{prop:'users',func:getUsers},
				{prop:'tags',func:getTags},
				{prop:'customFields',func:getCustomFields},
				{prop:'statuses',func:getStatuses}
			]
			
			tasks.forEach(function(task) {
				if (updateObj[task.prop]) {
					updateObj[task.prop] = vm._fetchingText;
					task.func().then(function() {
						updateObj[task.prop] = vm._successText;
						$timeout(function() { updateObj[task.prop]=false },1000);
					},function(err) {
						console.dir(err);
						updateObj[task.prop] = vm._failureText;
						$timeout(function() { updateObj[task.prop]=false },1000);
					});
				}
			});	
		});
	}
	
	// Assembla allows for different "Spaces" with multiple repositories in each
	// Assume the first Space is the spelected space
	function getSelectedSpace() {
		return as.getSpaces().then(function(data) {
			vm.data.selectedSpace=data.data[0];
			aps.saveData('selectedSpace');
			return data.data[0];
		});
	}
	// get milestones
	function getMilestones() {
		// default milestones are the current milestones
		return as.getMilestones({spaceId: vm.data.selectedSpace.id,
														per_page:100,
														type: 'all',
														parms: {due_date_order: "DESC"}
														}).success(function(data) {
			vm.data.milestones = {}; // clear out the milestones.  Can they be deleted?
			data.forEach(function(item) {
				item.initials = getInitials(item.title);
				vm.data.milestones[item.id]=item
			});
			aps.saveData('milestones');
			return vm.data.milestones;
		});
	}
	function getUsers() {
		var qObj = {spaceId: vm.data.selectedSpace.id, parms: {per_page: 100}};
		// probably more intuitive to get users and then their roles, but this works
		return as.getRoles(qObj).success(function(data){
			var roles = data;
			vm.data.users = {}
			var promises = roles.map(function(role) {
				var qObj = {userId: role.user_id};
				return as.getUser(qObj).success(function(data) {
					user = data;
					user.role = role;
					user.initials = getUserInitials(user);
					vm.data.users[user.id]=user;
					aps.saveData('users');
					return user;
				});
			});
			return $q.all(promises);
		}); 
	}
	
	function getTags() {
		var qObj = {spaceId: vm.data.selectedSpace.id, parms: {per_page: 100}};
		return as.getTags(qObj).success(function(data){
			vm.data.tags = data;
			aps.saveData('tags');
			return data;
		});
	}
	function getStatuses() {	
		var qObj = {spaceId: vm.data.selectedSpace.id, parms: {per_page: 100}};
		return as.getStatuses(qObj).success(function(data) {
			vm.data.statuses = data;
			aps.saveData('statuses');
			return data;
		});
	}
	function getCustomFields() {	
		var qObj = {spaceId: vm.data.selectedSpace.id, parms: {per_page: 100}};
		return as.getCustomFields(qObj).success(function(data) {
			vm.data.customFields = data;
			aps.saveData('customFields');
		});
	}
	/**
	function getUpdatedComments(lastSync) {
		// get all the activity since the last recorded comment sync
		// return (in promise) the most recent comment update date
		var qObj = {
			parms: {
				space_id: vm.data.selectedSpace.id,
				per_page: 100,
				page: 1
			}
		}
		if (lastSync) qObj.parms.from = $filter('date')(lastSync,'dd-MM-yyyy hh-mm');
		return as.getActivity(qObj).then(function(activity) {
		// Collect ONLY the ticket comments ticketids
			var tickets = vm.data.tickets.concat(vm.data.hiddenTickets);
			var commentedTickets = []
			activity.forEach(function(act) {
				if (act.object=='Ticket Comment') {
					if (!act.ticket) {
						// seldom happens.  Maybe only when the comment text is edited
						// TODO: search all tickets for the comment id and use the found ticket??
						var t = act.ticket
					} else {
						var ticket = getFromList(act.ticket.id,tickets,'id');
						if (!ticket) {
							var t = ticket; // ticket is not here in downloaded tickets?
						} else {
							var idx = commentedTickets.indexOf(ticket);
							if (idx<0) commentedTickets.push(ticket)
						}
					}
				}
			});
		// get all comments for the selected tickets (more data, but vastly less logic)
			var promises = commentedTickets.map(function(ticket) {
				//if (testId == comment.id) return proms;
				// Retrieve the entire comment from the API
				var p = getTicketComments(ticket,vm.data.selectedSpace.id);
				return p // return promise array
			})
			$q.all(promises).then(function(results) {
				vm.data.updateStatus.lastCommentActivitySynced=new Date();
				aps.saveDataObjects(['updateStatus','comments']);
			});
		});
	}
	**/
	function syncAllComments() {
		// get comments for every ticket in the list
		//vm.data.comments={};
		var tasks = [];
			vm.data.tickets.forEach(function(ticket) {
				tasks.push(getTicketComments(ticket.number,vm.data.selectedSpace.id,true))
			});
		$q.all(tasks).then(function() {
			aps.saveData('comments');
		})
	}
	
	function getTicketComments(ticket,spaceId,dontSave) {	
		return as.getComments({
			spaceId: spaceId || vm.data.selectedSpace.id,
			ticketNumber: ticket.number
		}).then(function(data) {
			vm.data.comments[ticket.id]=data;
			if (!dontSave) {
				aps.saveData('comments');
			}
		})
	}

	function toggleCommentSync() {
		vm.data.updateStatus.comments.syncEnabled = !vm.data.updateStatus.comments.syncEnabled;
		if (vm.data.updateStatus.comments.syncEnabled) {
			if (vm.data.updateStatus.comments.lastCommentActivitySynced) {
				getUpdatedComments(vm.data.updateStatus.comments.lastCommentActivitySynced);
			} else {
				vm.data.updateStatus.comments.lastCommentActivitySynced == new Date();
				syncAllComments();
			}
		} else {
			// anything need to be done when turning off comment sync?
		}
	}
	
	// When adding a comment through the ui
	function saveComment(ticket,comment) {
		var qObj = {
			spaceId: vm.data.selectedSpace.id,
			ticketNumber: ticket.number,
			data: {comment:comment}
		};
		as.saveComment(qObj).then(function(result) {
			var c = result.data;
			if (!vm.data.comments[ticket.id]) vm.data.comments[ticket.id] = [];
			vm.data.comments[ticket.id].push(c);
			aps.saveData('comments');
		});
	}
	
	function toggle(obj, prop, event ) {
		if (event) event.stopPropagation();
		obj[prop] = !obj[prop];
	}
	
	function parseTicketChanges(text) {
		var changes = text.split("\n- - ");
		changes.shift();
		var parsedChanges = changes.map(function(change) {
			var changeParts = change.split('\n  - ');
			if (changeParts.length>3) {
			}
			return changeParts[0] + ': ' + changeParts[1] + " became " + changeParts[2];
		});
		return parsedChanges.join(';  ');
	}
	
	// take a chunk out of the middle of a long string, like if you want ticket descriptions to be shortened
	function abbreviate(text, startLength, endLength, elipsis) {
		elipsis = elipsis || '...';
		startLength = isFinite(startLength) ? startLength : 20;
		endLength = isFinite(endLength) ? endLength : 20;
		if (!text || !text.length || text.length < startLength + endLength) return text;
		return text.substr(0, startLength).trim() + elipsis + text.substr(text.length - endLength, endLength).trim();
	}
	
	function parseDescription(ticket) {
	// parse sections: Technical Description, Tech, TD; Friendly Description, FD, description; Location, L, Loc;
	//								Testing, T, Test, Test<ing> Ideas; Reported By, R, Reported, Reporter, RB; 
	//								Security, Auth, Sec, S, A , Role R Roles
		var d = ticket.description;
		var parsed = {};
		var delim = "_@&@_"; // delimiter
		d=d.replace(/(?:^|[\r\f\n\v])T(?:ech|echincal)?\s?D(?:esc|escription)?\:/i, delim + "TD" + delim);
		d=d.replace(/(?:^|[\r\f\n\v])(?:F?(?:riendly)?)?\s?D(?:esc(?:ription)?)?\:/i, delim + "FD" + delim);
		d=d.replace(/(?:^|[\r\f\n\v])L(?:oc(?:ation)?)?\:/i, delim + "L" + delim);
		d=d.replace(/(?:^|[\r\f\n\v])\*L(?:oc(?:ation)?)?\*/i, delim + "L" + delim);
		d=d.replace(/(?:^|[\r\f\n\v])T(?:est(?:ing|s)?)?(?:\s?I?(?:deas)?)?\:/i, delim + "T" + delim);
		d=d.replace(/(?:^|[\r\f\n\v])\*T(?:est(?:ing|s)?)?(?:\s?I?(?:deas)?)?\*/i, delim + "T" + delim);
		d=d.replace(/(?:^|[\r\f\n\v])R(?:eported)?(?:\s?B(?:y)?)?\:/i, delim + "RB" + delim);
		d=d.replace(/(?:^|[\r\f\n\v])P(?:erm(?:issions)?)?\:/i, delim + "P" + delim);
		d=d.replace(/(?:^|[\r\f\n\v])(?:A(?:uth(?:orization)?)?\s?)?(?:S(?:cope)?)?\:/i, delim + "P" + delim);
		d=d.replace(/(?:^|[\r\f\n\v])\D(?:esc(?:ription)?)?\:/i, delim + "D" + delim);
		d=d.replace(/(?:^|[\r\f\n\v])\*D(?:esc(?:ription)?)?\*/i, delim + "D" + delim);
		d=d.replace(/(?:^|[\r\f\n\v])R(?:ole(?:s)?)?\:/i, delim + "P" + delim);
		var parts = d.split(delim);
		if (parts[0].trim()=="") parts.shift();
		if (!/^(?:TD|FD|T|L|RP|P|D)$/.test(parts[0])) parts.unshift('O');
		for (var i = 1; i < parts.length; i = i + 2) {
			parsed[parts[i-1]] = parts[i];
		}
		if (parsed.O && !parsed.D) {
			parsed.D = parsed.O;
			delete parsed.O;
		}
		ticket.parsed = parsed;		
	}
	
	// A ticket is valid if certain parsed categories are provided
	function isValidTicket(ticket) {
		if (!ticket.parsed) parseDescription(ticket);
		return (ticket.parsed.T && ticket.parsed.L && (ticket.parsed.TD || ticket.parsed.FD || ticket.parsed.D));
	}

	// A list of tickets with the same change to each of them.  The property being changed and the new value is provided
	function updateTickets(tickets,prop,newVal) {
		tickets = tickets || [];
		var oldVal;
		var tasks = [];
		tickets.forEach(function(ticket) {
			oldVal=getValueByPropPath(prop,ticket,newVal);
			if (oldVal!=newVal) {
				var idx = vm.data.tickets.indexOf(ticket);
				var p = updateTicket(ticket,prop,newVal,oldVal,true);
				tasks.push(p);
			}
		});
		$q.all(tasks).finally(function() {
					aps.saveDataObjects(['tickets','hiddenTickets','ticketCount','hiddenTicketCount']);
					resetCounts();
		});		
	}
	
	function updateTicket(ticket, propName, propValue, oldValue,ignoreResetCounts) {
		var uData = {};
		// make sure the property, by path, exists and set to propvalue
		initPropPath(uData,propName,propValue);
		
		return as.updateTicket({
			spaceId: ticket.space_id,
			ticketNumber: ticket.number,
			data: uData
		}).success(function(data) {
			//var newTicket = angular.copy(ticket);
			setValueByPropPath(propName,ticket,propValue);
			//addOrUpdateTicket(newTicket); // push through addOrUpdateTicket so that proper counting prop counting and maint can happen
			ticket.updateSuccess=true;
			$timeout(function() {
				delete ticket.updateSuccess;
			},1000);
			return newTicket;
		}).error(function(err) {
			console.dir(err);
			//setValueByPropPath(propName,ticket,oldValue);
			ticket.updateFailure=true;
			$timeout(function() {
				delete ticket.updateFailure;
			},1000);
			return err
		}).finally(function() {
			if (!ignoreResetCounts) {
				resetCounts();
			}
		});
	}

	function resetCounts() {
		vm.data.ticketCount = {};
		vm.data.hiddenTicketCount = {};
		
		//var hiddenTickets = [];
		vm.data.tickets.forEach(function(ticket) {
			vm.refreshCurrentTicket++;
			if (isTicketHidden(ticket)) {
				updateTicketCount(ticket,vm.data.hiddenTicketCount);
				//hiddenTickets.push(ticket);
			} else {
				updateTicketCount(ticket,vm.data.ticketCount);
			}
		});
		//vm.data.hiddenTickets=hiddenTickets;
		vm.resetSuccess=true;
		$timeout(function() { vm.resetSuccess=false },1000);
	}
	
	function isTicketHidden(ticket) {
			var milestone = vm.data.milestones[ticket.milestone_id];
			var isHidden = !vm.showCompletedMilestones && milestone && milestone.is_completed;
			return isHidden;
	}		
	
	function getUpdatedTickets(lastUpdatedDate) {
		lastUpdatedDate = lastUpdatedDate || new Date('2006-01-01');
		var mostRecentUpdateDate = lastUpdatedDate;
		vm. ticketsDownloading = true;
		return as.getUpdatedTickets({
			spaceId: vm.data.selectedSpace.id,
			parms: {
				per_page: 50,
				page: 1,
				report: 0,
				sort_by: 'updated_at',
				sort_order: 'desc'
			},
			dataHandler: function(data) {
				var endDownload = false;
				data.forEach(function(item) {
					if (!endDownload && new Date(item.updated_at) >= lastUpdatedDate) {
						addOrUpdateTicket(item);
					} else {
						endDownload = true; // cancel the download
					}
				});
				return endDownload;
			}
		}).then(function(allTickets) {
			vm.data.ticketsDownloading=false;
			if (angular.isArray(allTickets)) {
				allTickets.forEach(function(ticket) {
					if (new Date(ticket.updated_at)>mostRecentUpdateDate) mostRecentUpdateDate=new Date(ticket.updated_at);
				})
				vm.data.lastCompletedUpdateDate = mostRecentUpdateDate;
			};
		});
	}
	
	function addOrUpdateTicket(ticket) {
		var oldTicket = getFromList(ticket.id,vm.data.tickets,'id');
		var idx = vm.data.tickets.indexOf(oldTicket);
		if (idx>-1) vm.data.tickets[idx] = ticket;
		else vm.data.tickets.push(ticket);
	}
		
	// Add or remove items from the ticketCount object.  Categorizing tickets for filters
	function updateCount(propName,ticket,newValue,oldValue,unassignedValue,countObj) {
		countObj = countObj || vm.data.ticketCount;
		unassignedValue = unassignedValue || vm._unassigned;
		newValue = !newValue || newValue.trim ? newValue : newValue.toString();
		oldValue = !oldValue || oldValue.trim ? oldValue : oldValue.toString();
		
		newValue = !newValue || newValue.trim()=="" ? unassignedValue : newValue;
		oldValue = !oldValue || oldValue.trim()=="" ? unassignedValue : oldValue;
		
		if (oldValue && oldValue != vm._ignore) {
			var countProp = getValueByPropPath(propName,countObj);
			if (countProp && countProp[oldValue]) {
				var idx = countProp[oldValue].indexOf(ticket);
				if (idx>-1) countProp[oldValue].splice(idx,1);
			}
		}
		
		if (newValue && newValue != vm._ignore) {
			var propArray = initPropPath(countObj,propName+'.'+newValue,[]);
			var idx = propArray.indexOf(ticket)
			if (idx == -1) propArray.push(ticket)
		}
	}
	function updateTicketCount(ticket,countObj,isRemoval) {
		countObj = countObj || vm.data.ticketCount;
			
		var prop = 'assigned_to_id'
		updateCount(prop,ticket,
								!isRemoval ? getValueByPropPath(prop,ticket,vm._unassigned) : vm._ignore,
								isRemoval ? getValueByPropPath(prop,ticket,vm._unassigned) : vm._ignore,
								vm._unassigned,countObj);
		
		var prop = 'milestone_id'
		updateCount(prop,ticket,
								!isRemoval ? getValueByPropPath(prop,ticket,vm._unassigned) : vm._ignore,
								isRemoval ? getValueByPropPath(prop,ticket,vm._unassigned) : vm._ignore,
								vm._unassigned,countObj);
		
		prop='status';
		updateCount(prop,ticket,
								!isRemoval ? getValueByPropPath(prop,ticket,vm._blank) : vm._ignore,
								isRemoval ? getValueByPropPath(prop,ticket,vm._blank) : vm._ignore,
								vm._blank,countObj);
		
		if (ticket) {
			var cfs = ticket.custom_fields;
			for (var prop in cfs) {
				var propPath = 'custom_fields.' + prop;
				updateCount(propPath,ticket,
								!isRemoval ? getValueByPropPath(propPath,ticket,vm._blank) : vm._ignore,
								isRemoval ? getValueByPropPath(propPath,ticket,vm._blank) : vm._ignore,
								vm._blank,countObj);
			}
		}

	}

}
