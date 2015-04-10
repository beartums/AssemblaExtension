angular.module("assembla", ['ui.bootstrap','directiveModule','LocalForageModule'])

	.config(['$localForageProvider', function($localForageProvider){
    $localForageProvider.config({
        storeName   : 'assembla', // name of the table
        description : 'assembla tickets and options'
    });
	}])
	
	// startFrom filter for paging
	.filter('startFrom', function () {
		return function (input, start) {
			if (input) {
				start = +start; //parse to int
				return input.slice(start);
			}
			return input;
		}
  })
	// Needed since stoppropagation was causing a page reload
	.directive('preventDefault', function() {
			return function(scope, element, attrs) {
					angular.element(element).bind('click', function(event) {
							event.preventDefault();
							event.stopPropagation();
					});
			}
	})

	// ticket text filter
	.filter('ticketTextSearch', function () {
		return function (tickets, text) {
			if (!text || text.trim() == "") return tickets;
			filteredTickets=[]
			tickets.forEach(function(t,idx) {
				var ticketText = t.number.toString() + '@@' + t.summary + '@@' + t.description;
				if (ticketText.toLowerCase().indexOf(text.toLowerCase())>-1 || !text || text.trim()=="") filteredTickets.push(t);
			});
			return filteredTickets
		}
  })

	.controller("assemblaController", 
			['$http', '$scope', '$filter', '$timeout', 'assemblaService', 'assemblaOptionsService', '$localForage',
		assemblaControllerFunction
	]);

function assemblaControllerFunction($http, $scope, $filter,$timeout, as, aos, $lf) {
	var vm = this

	vm._unassigned = '[unassigned]';
	vm._blank = '[blank]';
	vm._ignore = '@_@ignore@_@';
	vm.options = aos.options
	vm.options.filters = {};
	vm.options.filters = {};
	vm.milestones = [];
	vm.selectedSpace = null
	vm.selectedMilestone = null;
	vm.users = [];
	vm.data = {};
	vm.tags = [];
	vm.statuses = [],
	vm.customFields = [];
	vm.showUsers = false;;
	vm.ticketCount = {
		assignedTo: {},
		tag: {},
		status: {}
	}

	vm.selectMilestone = selectMilestone;
	vm.refresh = refresh;
	vm.abbreviate = abbreviate;
	vm.toggle = toggle;
	vm.getUserLogin = getUserLogin;
	vm.isValidTicket = isValidTicket;
	vm.parseDescription = parseDescription;
	vm.addToFilter = addToFilter;
	vm.filterTickets = filterTickets;
	vm.sort = sort;
	vm.createdSinceFilterChange = createdSinceFilterChange;
	vm.getCount = getCount;
	vm.updateTicket = updateTicket;
	vm.cancel = cancel;
	vm.optionChange = aos.onchange;
	vm.cancelClick = cancelClick;
	vm.toggleTicketsInCompletedMilestones =  toggleTicketsInCompletedMilestones;
	
	aos.setOnReadyHandler(refresh);
	return vm;

	function init() {
		as.init({
			secret: vm.options.secret,
			key: vm.options.key
		});
		
		//if (vm.options.userLogin) startMentionWatch(vm.options.userLogin,vm.userMentions);
		
		chrome.runtime.onMessage.addListener(
			function(request,sender,sendResponse) {
			}
		);
		
	}
	
	function cancelClick($event) {
		$event.stopPropagation();
	}
	function cancel(e,formField) {
		if (e.keyCode==27) {
			formField.$rollbackViewValue();
			return false;
		} 
		if (e.keyCode=='13') return false;
		return true
	}
	
	function getFromList(findText,list,keyProp,valueProp) {
		return list.reduce(function(value,item) {
			if (value) return value;
			var compareText = item && item[keyProp] ? item[keyProp] : null
			if (compareText==findText) {
				value = item[valueProp];
				return value;
			}
			return null;
		},null);
	}
	
	function joinObjProps(obj,delim) {
		delim = delim || ', ';
		var joinString = "";
		for (var prop in obj) {
			joinString += (joinString=="" ? "" : delim) + prop;
		}
		return joinString;
	}
	
	function joinObjVals(objs,propName,delim) {
		delim = delim || ', ';
		return objs.reduce(function(string,obj) {
			if (!obj[propName]) return string;
			return string + (string=="" ? "" : delim) + obj[propName];
		},"");
	}
	
	function getParsedProps(ticket) {
		if (!ticket.parsed) parseDescription(ticket);
		return joinObjProps(ticket.parsed);
	}
	
	function getValueByPropPath(propPath,obj,dflt) {
		dflt = dflt || null
		var props = propPath.split('.');
		return props.reduce(function(val, prop) {
			if (!val || val == dflt) return dflt;
			return val[prop];
		},obj);
	}
	
	// TODO: Tickets found during Assembla Update: check hidden AND live tickets for matches
	function toggleTicketsInCompletedMilestones(showCompletedMilestones) {
		if (showCompletedMilestones) {
			vm.data.hiddenTickets.forEach(function(ticket) {
				vm.data.tickets.push(ticket);
				updateTicketCount(ticket,vm.ticketCount); // update category indexes for incoming tickets
				updateTicketCount(ticket,vm.data.hiddenTicketCount,true); // likewise remove them from the hidden indexes
			});
			vm.data.hiddenTickets = [];
		} else {
			var deletedIdxs = [];
			for (var i=0; i<vm.data.tickets.length; i++) {
				var isCompleted = getFromList(vm.data.tickets[i].milestone_id,vm.milestones,'id','is_completed');
				if (isCompleted) {
					var ticket = vm.data.tickets[i];
					vm.data.hiddenTickets.push(ticket);
					deletedIdxs.push(i);
					updateTicketCount(ticket,vm.ticketCount,true); // remove from live indexes
					updateTicketCount(ticket,vm.data.hiddenTicketCount); // add to hidden indexes
				}
			}
			for (var i = deletedIdxs.length-1; i>=0; i--) {
				delete vm.data.tickets.splice([deletedIdxs[i]],1);
			};
		}
	}
	function sort(sortField) {
		if (sortField == vm.options.currentSortColumn) {
			vm.options.currentSortAscending = !vm.options.currentSortAscending;
		} else {
			vm.options.currentSortColumn = sortField;
			vm.options.currentSortAscending = true;
		}
		vm.sortClasses={} // for display of asc and desc markers
		vm.sortClasses[sortField] = 'glyphicon glyphicon-chevron-' + (vm.options.currentSortAscending ? 'up' : 'down');

		vm.data.tickets.sort(function(a,b) {
			var valA = sortField=="user_login" ? getUserLogin(a.assigned_to_id) : a[sortField];
			var valB = sortField=="user_login" ? getUserLogin(b.assigned_to_id) : b[sortField];
			if (!vm.options.currentSortAscending) { var h = valA; valA=valB; valB = h; }
			
			if (valA<valB) return -1;
			if (valA==valB) return 0;
			if (valA>valB) return 1;
		});
	}
	
	function getUserLogin(id) {
		if (!id || vm.users.length<1) return "";
		return vm.users.reduce(function(login, user) {
			if (login) return login;
			return user.id == id ? user.login : null;
		},null);
	}
	
	function getCount(ticketPropName, comp, value) {
		var cnt = 0
		vm.data.tickets.forEach(function(t) {
			cnt += evalCompare(t, ticketPropName,comp,value) ? 1 : 0;
		});
		return cnt;
	}
	
	function evalCompare(ticket, tPropName, comp, value) {
		var tVal = ticket[tPropName];
		if (isin(comp,['=','eq','==','EQ'])) return (tVal == value);
		if (isin(comp,['>','gt','GT'])) return (tVal > value);
		if (isin(comp,['>=','ge', 'GE','=>'])) return (tVal >= value);
		if (isin(comp,['<=','le','LE','=<'])) return (tVal <= value);
		if (isin(comp,['<','lt','LT'])) return (tVal < value);
		return false;
	}
	function isin(val,arr,prop) {
		
		arr.forEach(function(a) {
			var aVal = prop && a[prop] ? a[prop] : a;
			if (aVal==val) return a;
		});
	}
	
	function createdSinceFilterChange() {
	// get all tickets since createdSince, if not already here
		return;
		
		as.getActivity({
			parms: {
				from: $filter('date')(vm.createdSince,'yyyy-MM-dd'),
				page: 1,
				per_page: 50
			}
		}).success(function(data) {
			data.forEach(function(act) {
				if (act.object.toLowerCase()!=='ticket' && act.operation.toLowerCase()=='created') {
					if (!isin(act.object_id,tickets,'id')) {
						as.getTicket({
							spaceId: vm.selectedSpace.id,
							ticketId: act.object_id
						}).success(function(data) {
							if (isin(data.id,vm.data.tickets,'id')) return;
							vm.data.tickets.push(data);
							vm.updateTicketCount(data);
						});
					}
				}
			});
		});
	}
	
	function addToFilter(propName,id) {
		var filter = initPropPath(vm.options.filters,propName,{})
		filter[id] = !filter[id];
	}
	
	function filterTickets(ticket,idx) {
		var include = false;
		var opts = vm.options;
		
		var ignoreUser =  !opts.filters || !hasTrueProperty(vm.options.filters.user,true);
		var ignoreMilestone =  !opts.filters || !hasTrueProperty(vm.options.filters.milestone,true);
		var ignoreStatus = !opts.filters || !hasTrueProperty(vm.options.filters.status,true);
		var ignoreText = !vm.filterText || vm.filterText.trim()=="";
		var ignoreCustomFields = {};
		vm.customFields.forEach(function(field) {
			ignoreCustomFields[field.title] = !opts.filters.custom_fields 
																				|| !hasTrueProperty(vm.options.filters.custom_fields[field.title],true);
		});
		var id = ticket.assigned_to_id;
		id = id && id.trim() != "" ? id : vm._unassigned;
		if (!ignoreUser && !vm.options.filters.user[id]) return false;
		var id = ticket.milestone_id;
		id = id && id.toString ? id.toString() : id;
		id = id && id.trim() != "" ? id : vm._unassigned;
		if (!ignoreMilestone && !vm.options.filters.milestone[id]) return false;
		if (!ignoreStatus && !vm.options.filters.status[ticket.status]) return false;
		for (var prop in ignoreCustomFields) {
			var val = ticket.custom_fields[prop];
			val = val + val.trim() != '' ? val : vm._blank;
			if (!ignoreCustomFields[prop] && !vm.options.filters.custom_fields[prop][val]) return false;
		}
		if (vm.createdSince && vm.createdSince > new Date(ticket.created_on)) return false;
		var ticketText = ticket.number.toString() + '@@' + ticket.summary + '@@' + ticket.description;
		if (!ignoreText && ticketText.toLowerCase().indexOf(vm.filterText.toLowerCase())==-1) return false;
		return true;
	}
	
	function hasTrueProperty(obj,truthyIsOkay) {
		if (!obj) return false;
		for (var prop in obj) {
			if (obj[prop]===true || (truthyIsOkay && obj[prop])) {
				return true;
			}
		}
		return false;
	}

	function refresh() {
		init();
		as.getSpaces().success(function(data) {
			vm.selectedSpace = data[0];
			// Get tickets
			$lf.bind($scope, {
				key: 'vm.data',
				defaultValue: {
					tickets: [],
					hiddenTickets: [],
					hiddenTicketCount: {},
					lastCompletedUpdateDate: '2006-01-01',
					mostRecentUpdateDate: null
				}
			}).then(function() {
				vm.data.tickets.forEach(function(ticket) {
					updateTicketCount(ticket);
				});
				vm.data.mostRecentUpdateDate = new Date();
				lastUpdated = vm.data.lastCompletedUpdateDate ? 
											new Date(vm.data.lastCompletedUpdateDate) : 
											new Date('2006-01-01')
				getUpdatedTickets(lastUpdated,vm.data.tickets).success(function(data) {
					vm.data.lastCompletedUpdateDate = new Date();
					vm.data.mostRecentUpdateDate = null;
				});
			});
			// get upcoming milestones
			as.getMilestones({spaceId: vm.selectedSpace.id,per_page:100}).success(function(data) {
				vm.milestones = data;
				var found = vm.milestones.some(function(milestone) { 
					return milestone.id == vm.options.currentMilestone;
				});
				if (found) selectMilestone();
				// get past milestones
				as.getMilestones({spaceId: vm.selectedSpace.id, 
												type: 'completed',
												parms: {due_date_order:"DESC"}
											}).success(function(data) {
					var found = data.some(function(milestone) { 
						return milestone.id == vm.options.currentMilestone;
					});
					//if (found) selectMilestone();
					data.forEach(function(item) { vm.milestones.unshift(item)});
				});
			});
			var qObj = {spaceId: vm.selectedSpace.id, parms: {per_page: 100}};
			as.getRoles(qObj).success(function(data){
				var roles = data;
				vm.users = []
				roles.forEach(function(role) {
					var qObj = {userId: role.user_id};
					as.getUser(qObj).success(function(data) {
						user = data;
						user.role = role;
						vm.users.push(user);
					});
				});
			});
			as.getTags(qObj).success(function(data){
				vm.tags = data;
			});
			as.getStatuses(qObj).success(function(data) {
				vm.statuses = data;
			});
			as.getCustomFields(qObj).success(function(data) {
				vm.customFields = data;
			});
		});
		
	}

	function toggle(obj, prop, event ) {
		if (event) event.stopPropagation();
		obj[prop] = !obj[prop];
	}
	
	function abbreviate(text, startLength, endLength, elipsis) {
		elipsis = elipsis || '...';
		startLength = isFinite(startLength) ? startLength : 20;
		endLength = isFinite(endLength) ? endLength : 20;
		if (!text || !text.length || text.length < startLength + endLength) return text;
		return text.substr(0, startLength).trim() + elipsis + text.substr(text.length - endLength, endLength).trim();
	}
	
	function parseDescription(ticket) {
	// parse sections: Technical Description, Tech, TD; Friendly Description, FD, description; Location, L, Loc;
	//									Testing, T, Test, Test<ing> Ideas; Reported By, R, Reported, Reporter, RB; Security, Auth, Sec, S, A , Role R Roles
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
	function isValidTicket(ticket) {
		if (!ticket.parsed) parseDescription(ticket);
		return (ticket.parsed.T && ticket.parsed.L && (ticket.parsed.TD || ticket.parsed.FD || ticket.parsed.D));
	}

	function updateTicket(ticket, propName, propValue, oldValue) {
		var uData = {};
		uData[propName]=propValue;
		
		as.updateTicket({
			spaceId: vm.selectedSpace.id,
			ticketNumber: ticket.number,
			data: uData
		}).success(function(data) {
			updateCount(propName,ticket,propValue,oldValue)
			ticket[propName] = propValue;
		}).error(function(err) {
			console.dir(err);
			ticket[propName] = oldValue;
		});
	}
	
	function selectMilestone() {
		//getTickets();
	}
	// determine whether the new ticket is an updated ticket and respond accordingly
	function addOrUpdateTicket(ticket) {
		//HACK: Direct references to the two global arrays because I'm lazu and it is easiest
		var oldTicket = null, index = -1, ticketArray
		// look in both collections of tickets to see if it needs to be update or simply saved as new
		[vm.data.tickets,vm.data.hiddenTickets].some(function(tickets) {
			if (!tickets) return false;
			return tickets.some(function(t,idx) {
				if (!oldTicket && t.id == ticket.id) {
					oldTicket = t;
					index = idx;
					ticketArray = tickets;
					return true;
				}
			});
		})
		// ticket counts need to be updated only for tickets not going into the hidden tickets
		if (oldTicket && ticketArray===vm.data.tickets) updateTicketCount(oldTicket,vm.ticketCount,true)
		if (!oldTicket || oldticket && ticketArray===vm.data.tickets) updateTicketCount(ticket,vm.ticketCount);
		if (index>-1) {
			ticketArray[index] = ticket;
		} else {
		// if it's new, ALWAYS put it into visible tickets (unhide & then hid will move it to the hidden tickets if that's where it should be
			tickets = ticketArray || vm.data.tickets
			tickets.push(ticket);
		}
	}
	
	function getUpdatedTickets(lastUpdatedDate,tickets) {

		vm. ticketsDownloading = true;
		return as.getUpdatedTickets({
			spaceId: vm.selectedSpace.id,
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
			},
			completionHandler: function(pageCount) {
				vm.data.ticketsDownloading = false;
			}
		}).success(function(AllDownloaded) {
			return {date:new Date()};
		});
	}
	
	
	function getTickets() {
		aos.onchange(); // save the values
		vm.data.tickets=[];
		vm.ticketCount = {};
		vm.options.filters = {};
		vm. ticketsDownloading = true;
		as.getTickets({
			spaceId: vm.selectedSpace.id,
			milestoneId: vm.options.currentMilestone,
			parms: {
				per_page: vm.options.ticketsPerPage,
				page: vm.options.currentPage,
				ticket_status: 'all'
			},
			dataHandler: function(data) {
				data.forEach(function(item) {
					vm.data.tickets.push(item);
					updateTicketCount(item)
				});
				return false // DO NOT cancel the download
			},
			completionHandler: function(pageCount) {
				vm.data.ticketsDownloading = false;
			}
		});
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
	// Add or remove items from the ticketCount object.  Categorizing tickets for filters
	function updateCount(propName,ticket,newValue,oldValue,unassignedValue,countObj) {
		countObj = countObj || vm.ticketCount;
		unassignedValue = unassignedValue || vm._unassigned;
		newValue = !newValue || newValue.trim ? newValue : newValue.toString();
		oldValue = !oldValue || oldValue.trim ? oldValue : oldValue.toString();
		
		if (oldValue && oldValue != vm._ignore) {
			if (countObj[propName] && countObj[propName][oldValue]) {
				var idx = countObj[propName][oldValue].indexOf(ticket);
				if (idx>-1) countObj[propName][oldValue].splice(idx,1);
			}
		}
		
		if (newValue && newValue != vm._ignore) {
			var propArray = initPropPath(countObj,propName+'.'+newValue,[]);
			var idx = propArray.indexOf(ticket)
			if (idx == -1) propArray.push(ticket)
		}
	}
	function updateTicketCount(ticket,countObj,isRemoval) {
		countObj = countObj || vm.ticketCount;
		
		
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
