angular.module("assembla", ['ui.bootstrap'])
	.controller("assemblaController", ['$http', '$scope', '$filter', 'assemblaService', 'assemblaOptionsService',
		assemblaControllerFunction
	]);

function assemblaControllerFunction($http, $scope, $filter, as, aos) {
	var vm = this

	vm._unassigned = '[unassigned]';
	vm._blank = '[blank]';
	vm.options = aos.options
	vm.milestones = [];
	vm.selectedSpace = null
	vm.selectedMilestone = null;
	vm.tickets = [];
	vm.users = [];
	vm.tags = [];
	vm.statuses = [],
	vm.customFields = [];
	vm.showUsers = false;
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
	
	aos.setOnReadyHandler(refresh);

	return vm;

	function init() {
		as.init({
			secret: vm.options.secret,
			key: vm.options.key
		});
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

		vm.tickets.sort(function(a,b) {
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
		vm.tickets.forEach(function(t) {
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
			if (aVal==val) return true;
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
							if (isin(data.id,vm.tickets,'id')) return;
							vm.tickets.push(data);
							vm.updateTicketCount(data);
						});
					}
				}
			});
		});
	}
	
	function addToFilter(propName,id) {
		if (!vm.options.filters) vm.options.filters={};
		if (!vm.options.filters[propName]) vm.options.filters[propName]={};
		vm.options.filters[propName][id] = !vm.options.filters[propName][id];
	}
	
	function filterTickets(ticket,idx) {
		var include = false;
		
		var ignoreUser = !hasTrueProperty(vm.options.filters.user,true);
		var ignoreStatus = !hasTrueProperty(vm.options.filters.status,true);
		var ignoreCustomFields = {};
		vm.customFields.forEach(function(field) {
			ignoreCustomFields[field.title] = !hasTrueProperty(vm.options.filters[field.title],true);
		});
		var id = ticket.assigned_to_id;
		id = id && id.trim() != "" ? id : vm._unassigned;
		if (!ignoreUser && !vm.options.filters.user[id]) return false;
		if (!ignoreStatus && !vm.options.filters.status[ticket.status]) return false;
		for (var prop in ignoreCustomFields) {
			var val = ticket.custom_fields[prop];
			val = val + val.trim() != '' ? val : vm._blank;
			if (!ignoreCustomFields[prop] && !vm.options.filters[prop][val]) return false;
		}
		if (vm.createdSince && vm.createdSince > new Date(ticket.created_on)) return false;
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
		vm.tickets = [];
		as.getSpaces().success(function(data) {
			vm.selectedSpace = data[0];
			// get upcoming milestones
			as.getMilestones({spaceId: vm.selectedSpace.id}).success(function(data) {
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
					if (found) selectMilestone();
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

	function toggle(obj, prop) {
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

	function updateTicket(ticket, propName, propValue) {
		var uData = {};
		uData[propName]=propValue;
		
		as.updateTicket({
			spaceId: vm.selectedSpace.id,
			ticketNumber: ticket.number,
			data: uData
		}).success(function(data) {
			updateCount(propName,ticket[propName],propValue)
			ticket[propName] = propValue;
		}).error(function(err) {
			
			console.dir(err)
		});
	}
	
	function selectMilestone() {
		getTickets();
	}

	function getTickets() {
		aos.onchange(); // save the values
		vm.tickets=[];
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
					vm.tickets.push(item);
					updateTicketCount(item)
				});
			},
			completionHandler: function(pageCount) {
				vm.ticketsDownloading = false;
			}
		});
	}
	function updateCount(propName,oldValue,newValue,unassignedValue,countObj) {
		countObj = countObj || vm.ticketCount;
		unassignedValue = unassignedValue || vm._blank;
		
		if (oldValue != '@addonly@') {
			oldValue = (!oldValue || (oldValue && oldValue.trim()=="")) ? unassignedValue : oldValue;
			if (countObj[propName] && countObj[propName][oldValue]) countObj[propName][oldValue]--;
		}
		
		if (newValue != '@deleteonly@') {
			newValue = (!newValue || (newValue && newValue.trim()=="")) ? unassignedValue : newValue;
			if (!countObj[propName]) countObj[propName] = {};
			if (!countObj[propName][newValue]) countObj[propName][newValue] = 0;
			countObj[propName][newValue]++;
		}
	}
	function updateTicketCount(ticket,countObj) {
		countObj = countObj || vm.ticketCount;
		var prop = 'assigned_to_id'
		updateCount(prop,'@addonly@',ticket[prop],vm._unassigned);
		
		var tags = ticket.tags;
		if (!countObj.tag) countObj.tag = {};
		if (tags && angular.isArray(tags)) {
			tags.forEach(function(tag) {
						updateCount('tag','@addonly@',tag);
			});
		}
		
		prop='status';
		updateCount(prop,'@addonly@',ticket[prop]);
		
		var cfs = ticket.custom_fields;
		for (var prop in cfs) {
			updateCount(prop,'@addonly@',cfs[prop]);
		}
		
	}

}
