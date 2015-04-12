angular.module("assembla", ['ui.bootstrap','directiveModule','LocalForageModule','pageslide-directive'])

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
	vm.milestones = [];
	vm.epics = [];
	vm.associations = [];
	vm.selectedSpace = null
	vm.selectedMilestone = null;
	vm.users = [];
	vm.data = {};
	vm.tags = [];
	vm.statuses = [],
	vm.customFields = [];
	vm.showUsers = false;;
	vm.data.ticketCount = {}

	vm.selectMilestone = selectMilestone;
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
	vm.createdSinceFilterChange = createdSinceFilterChange;
	vm.getCount = getCount;
	vm.updateTicket = updateTicket;
	vm.getUpdatedTickets=getUpdatedTickets;
	vm.resetCounts = resetCounts;
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
	
	function getInitials(string) {
		if (!string || !string.length || string.length<5) return string;
		words = string.split(' ');
		return words.reduce(function(inits,word) {
			return inits+word.substring(0,1);
		}, '');
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
	
	
	// TODO: Tickets found during Assembla Update: check hidden AND live tickets for matches
	function toggleTicketsInCompletedMilestones(showCompletedMilestones) {
		if (showCompletedMilestones) {  // If we are going to be showing tickets in completed milestones
			vm.data.hiddenTickets.forEach(function(ticket) {
				vm.data.tickets.push(ticket);
				updateTicketCount(ticket,vm.data.ticketCount); // update category indexes for incoming tickets
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
					updateTicketCount(ticket,vm.data.ticketCount,true); // remove from live indexes
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
			var valA, valB
			if (sortField == "milestone") {
				valA = getFromList(a.milestone_id,vm.milestones,'id','initials');
				valB = getFromList(b.milestone_id,vm.milestones,'id','initials');
			} else {
				valA = getValueByPropPath(sortField,a,"");
				valB = getValueByPropPath(sortField,b,"");
			}
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
					ticketCount: {},
					hiddenTickets: [],
					hiddenTicketCount: {},
					epics: {},
					lastCompletedUpdateDate: '2006-01-01',
					mostRecentUpdateDate: null
				}
			}).then(function() {
				getUpdatedTickets(vm.data.lastCompletedUpdateDate).success(function(data) {
					vm.data.lastCompletedUpdateDate = new Date();
					vm.data.mostRecentUpdateDate = null;
				});
			});
			// get upcoming milestones
			as.getMilestones({spaceId: vm.selectedSpace.id,per_page:100}).success(function(data) {
				vm.milestones = data;
				vm.milestones.forEach(function(milestone, idx) {
					vm.milestones[idx].initials = getInitials(milestone.title);
				});
				// get past milestones
				as.getMilestones({spaceId: vm.selectedSpace.id, 
												type: 'completed',
												parms: {due_date_order:"DESC"}
											}).success(function(data) {
					var found = data.some(function(milestone) { 
						return milestone.id == vm.options.currentMilestone;
					});
					//if (found) selectMilestone();
					data.forEach(function(item) { 
						item.initials = getInitials(item.title);
						vm.milestones.unshift(item);
					});
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
						user.initials = getUserInitials(user);
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
		initPropPath(uData,propName,propValue);
		//uData[propName]=propValue;
		
		as.updateTicket({
			spaceId: vm.selectedSpace.id,
			ticketNumber: ticket.number,
			data: uData
		}).success(function(data) {
			updateCount(propName,ticket,propValue,oldValue)
			setValueByPropPath(propName,ticket,propValue);
		}).error(function(err) {
			console.dir(err);
			setValueByPropPath(propName,ticket,oldValue);
		});
	}
	
	function selectMilestone() {
		//getTickets();
	}
	// determine whether the new ticket is an updated ticket and respond accordingly
	function addOrUpdateTicket(ticket) {
		//HACK: Direct references to the two global arrays because I'm lazy and it is easiest
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
		
		if (oldTicket) {
			var udpateHidden = !vm.showCompletedMilestones 
													&& getValueByPropPath(oldTicket.milestone_id,vm.milestones,'id','is_completed');
			if (updateHidden) { // remove from counts
				updateTicketCount(oldTicket,vm.data.hiddenTicketCount,true);
				vm.data.hiddenTickets.splice(index,1);
			} else {
				updateTicketCount(oldTicket,vm.data.ticketCount,true);
				vm.data.tickets.splice(index,1);
			}
		}

		var updateHidden = !vm.showCompletedMilestones 
												&& getValueByPropPath(ticket.milestone_id,vm.milestones,'id','is_completed');
		if (updateHidden) {
			vm.data.hiddenTickets.push(ticket);
			updateTicketCount(ticket,vm.data.hiddenTicketCount);
		} else {
			vm.data.tickets.push(ticket);
			updateTicketCount(ticket,vm.data.ticketCount);
		}
	}
	
	function resetCounts(tickets, ticketCount) {
		//vm.data.ticketCount={};
		tickets = tickets || vm.data.tickets;
		ticketCount = ticketCount || vm.data.ticketCount;
		for (var key in ticketCount) {
			delete ticketCount[key];
		}
		tickets.forEach(function(ticket) {
			updateTicketCount(ticket,ticketCount);
		});
	}
	
	function getUpdatedTickets(lastUpdatedDate) {
		lastUpdatedDate = lastUpdatedDate || new Date('2006-01-01')
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
			vm.data.lastCompletedUpdateDate = new Date();
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
		/**
		if (ticket.hierarchy_type=='3') { // if this is an epic
			if (!vm.data.epics[ticket.id]) vm.data.epics[ticket.id] = {}
			var t = vm.data.epics[ticket.id];
			t.title = ticket.title;
			t.number = ticket.number;
			t.id = ticket.id
		}
		**/
			
		
	}

}
