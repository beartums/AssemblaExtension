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
			['$q','$http', '$scope', '$filter', '$timeout', 'assemblaService', 'assemblaPersistenceService', '$localForage',
		assemblaControllerFunction
	]);

function assemblaControllerFunction($q, $http, $scope, $filter,$timeout, as, aps, $lf) {
	var vm = this

	vm._unassigned = '[unassigned]';
	vm._blank = '[blank]';
	vm._ignore = '@_@ignore@_@';
	vm._fetchingText = "fetching..."
	vm._successText = "success"
	vm._failureText = "failure"

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
	vm.selectedTickets = [];

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
	vm.getCount = getCount;
	vm.updateTickets = updateTickets;
	vm.getUpdatedTickets=getUpdatedTickets;
	vm.resetCounts = resetCounts;
	vm.cancel = cancel;
	vm.optionChange = aps.onchange;
	vm.cancelClick = cancelClick;
	vm.toggleTicketSelected = toggleTicketSelected;
	vm.toggleTicketsInCompletedMilestones =  toggleTicketsInCompletedMilestones;
	vm.updateRelatedEntities= updateRelatedEntities;
	
	aps.setOnReadyHandler(refresh);
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
	
	function toggleTicketSelected(ticket) {
		if (!vm.selectedTickets) vm.selectedTickets = [];
		var idx = vm.selectedTickets.indexOf(ticket);
		if (idx==-1) {
			vm.selectedTickets.push(ticket);
		} else {
			vm.selectedTickets.splice(idx,1);
		}
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
				var isCompleted = vm.data.milestones[vm.data.tickets[i].milestone_id].is_completed;
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
		aps.saveDataObjects(['tickets','hiddenTickets','ticketCount','hiddenTicketCount']);
	}
	function sort(sortField) {
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
	
	function getCount(ticketPropName, comp, value) {
		var cnt = 0
		if (!vm.data || !vm.data.tickets) return 0;
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
		
	function addToFilter(propName,id) {
		var filter = initPropPath(vm.options.filters,propName,{});
		filter[id] = !filter[id];
		vm.optionChange();
	}
	
	function filterTickets(ticket,idx) {
		var include = false;
		var opts = vm.options;
	
		var ignoreUser =  !opts.filters || !hasTrueProperty(vm.options.filters.user,true);
		var ignoreMilestone =  !opts.filters || !hasTrueProperty(vm.options.filters.milestone,true);
		var ignoreStatus = !opts.filters || !hasTrueProperty(vm.options.filters.status,true);
		var ignoreText = !vm.filterText || vm.filterText.trim()=="";
		var ignoreCustomFields = {};
		vm.data.customFields.forEach(function(field) {
			ignoreCustomFields[field.title] = !opts.filters.custom_fields 
																				|| !hasTrueProperty(vm.options.filters.custom_fields[field.title],true);
		});
		// check dates
		if (opts.filters.updated_at && new Date(opts.filters.updated_at)<new Date(ticket.updated_at)) return false;
		if (opts.filters.created_on && new Date(opts.filters.created_on)<new Date(ticket.created_on)) return false;
		// dev id
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
		// Get tickets
		aps.getAllData().then(function(results) {
			if (!vm.data.selectedSpace ) {
				var p = $q.when(updateRelatedEntities({
					spaces:true,milestones:true,users:true,tags:true,customFields:true,statuses:true
				}));
			} else {
				var p = $q.when('');
			}
			p.then(function() {
				getUpdatedTickets(vm.data.lastCompletedUpdateDate).success(function(data) {
					vm.data.lastCompletedUpdateDate = new Date();
					vm.data.mostRecentUpdateDate = null;
					if (vm.options.currentSortColumn) sort;
					aps.saveAllData();
				});
			});
		});
		// get upcoming milestones
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
	function getSelectedSpace() {
		return as.getSpaces().then(function(data) {
			vm.data.selectedSpace=data.data[0];
			aps.saveData('selectedSpace');
			return data.data[0];
		});
	}
	function getMilestones() {
		return as.getMilestones({spaceId: vm.data.selectedSpace.id,per_page:100}).success(function(data) {
			data.forEach(function(item) {
				item.initials = getInitials(item.title);
				vm.data.milestones[item.id]=item
			});
			aps.saveData('milestones');
			// get past milestones
			return as.getMilestones({spaceId: vm.data.selectedSpace.id, 
											type: 'completed',
											parms: {due_date_order:"DESC"}
										}).success(function(data) {
				//if (found) selectMilestone();
				data.forEach(function(item) { 
					item.initials = getInitials(item.title);
					vm.data.milestones[item.id]=item;
				});
				aps.saveData('milestones');
				return vm.data.milestones;
			});
		});
	}
	function getUsers() {
		var qObj = {spaceId: vm.data.selectedSpace.id, parms: {per_page: 100}};
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
	function recalcEpics() {
		angular.copy(vm.data.epics,epics);
		vm.data.epics = {};
		[vm.data.tickets,vm.data.hiddenTickets].forEach(function(tickets, i) {
			tickets.forEach(function(ticket,j) {
				if (ticket.hierarchy_type=='3') {
					vm.data.epics[ticket.id] = {
						ticket: ticket,
						shortName: epics[ticket.id] && epics[ticket.id].shortName ? epics[ticket.id].shortName : '',
						children: []
					}
				}
			});
		});
		aps.saveData('epics');
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

	function updateTickets(tickets,prop,newVal) {
		tickets = tickets || [];
		var oldVal;
		tickets.forEach(function(ticket) {
			getValueByPropPath(prop,ticket,newVal);
			if (oldVal==newVal) return $q.when(ticket);
			var idx = vm.data.tickets.indexOf(ticket);
			updateTicket(ticket,prop,newVal,oldVal)
				.then(function() {
					aps.saveDataObjects(['tickets','hiddenTickets','ticketCount','hiddenTicketCount'])
					//selectedTickets.splice(selectedTickets.indexOf(ticket),1);
				},function(err) {
					ticket.updateFailure=true;
					$timeout(function() {
						delete ticket.updateSuccess;
					},1000);
					//selectedTickets.splice(selectedTickets.indexOf(ticket),1);
				});	
		});
		
	}
	
	function updateTicket(ticket, propName, propValue, oldValue) {
		var uData = {};
		initPropPath(uData,propName,propValue);
		//uData[propName]=propValue;
		
		return as.updateTicket({
			spaceId: vm.data.selectedSpace.id,
			ticketNumber: ticket.number,
			data: uData
		}).success(function(data) {
			var newTicket = angular.copy(ticket);
			setValueByPropPath(propName,newTicket,propValue);
			addOrUpdateTicket(newTicket); // push through addOrUpdateTicket so that proper counting prop counting and maint can happen
			newTicket.updateSuccess=true;
			$timeout(function() {
				delete newTicket.updateSuccess;
			},1000);
			return newTicket;
		}).error(function(err) {
			console.dir(err);
			setValueByPropPath(propName,ticket,oldValue);
			ticket.updateFailure=true;
			$timeout(function() {
				delete ticket.updateSuccess;
			},1000);

			return err
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
													&& vm.data.milestones[oldTicket.milestone_id].is_completed;
			if (updateHidden) { // remove from counts
				updateTicketCount(oldTicket,vm.data.hiddenTicketCount,true);
				//vm.data.hiddenTickets.splice(index,1);
			} else {
				updateTicketCount(oldTicket,vm.data.ticketCount,true);
				//vm.data.tickets.splice(index,1);
			}
		}
		var isCompleted = vm.data.milestones[ticket.milestone_id].is_completed;
		var updateHidden = !vm.showCompletedMilestones && isCompleted
		if (updateHidden) {
			if (!oldTicket) vm.data.hiddenTickets.push(ticket);
			updateTicketCount(ticket,vm.data.hiddenTicketCount);
		} else {
			if (!oldTicket) vm.data.tickets.push(ticket);
			updateTicketCount(ticket,vm.data.ticketCount);
		}
		if (oldTicket) angular.merge(oldTicket,ticket);
	}
	
	function resetCounts() {
		vm.data.ticketCount = {};
		vm.data.hiddenTicketCount = {};
		
		var openTickets = [], hiddenTickets = [];
		[vm.data.tickets,vm.data.hiddenTickets].forEach(function(tickets) {
			tickets.forEach(function(ticket) {
				vm.refreshCurrentTicket++;
				var milestone = vm.data.milestones[ticket.milestone_id];
				var isHidden = !vm.showCompletedMilestones && milestone && milestone.is_completed;
				if (isHidden) {
					updateTicketCount(ticket,vm.data.hiddenTicketCount);
					hiddenTickets.push(ticket);
				} else {
					updateTicketCount(ticket,vm.data.ticketCount);
					openTickets.push(ticket);
				}
			});
		});
		vm.data.tickets=openTickets;
		vm.data.hiddenTickets=hiddenTickets;
		vm.resetSuccess=true;
		$timeout(function() { vm.resetSuccess=false },1000);
	}
	
	function getUpdatedTickets(lastUpdatedDate) {
		lastUpdatedDate = lastUpdatedDate || new Date('2006-01-01')
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
			},
			completionHandler: function(pageCount) {
				vm.data.ticketsDownloading = false;
			}
		}).success(function(AllDownloaded) {
			vm.data.lastCompletedUpdateDate = new Date();
		}).error(function(err) {
			throw err;
		})
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
