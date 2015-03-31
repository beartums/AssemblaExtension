angular.module("assembla", ['ui.bootstrap'])
	.controller("assemblaController", ['$http', '$scope', 'assemblaService', 'assemblaOptionsService',
		assemblaControllerFunction
	]);

function assemblaControllerFunction($http, $scope, as, aos) {
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
	vm.pageby = pageby;
	vm.pageChanged = pageChanged;
	vm.repaginate = getTickets;
	vm.getUserLogin = getUserLogin;
	vm.isValidTicket = isValidTicket;
	vm.parseDescription = parseDescription;
	vm.addToFilter = addToFilter;
	vm.filterTickets = filterTickets;
	vm.sort = sort;
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
	
	function pageChanged() {
		console.log(vm.options.currentPage);
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
		id = id && id.trim() != "" ? id : "unassigned";
		if (!ignoreUser && !vm.options.filters.user[id]) return false;
		if (!ignoreStatus && !vm.options.filters.status[ticket.status]) return false;
		for (var prop in ignoreCustomFields) {
			var val = ticket.custom_fields[prop];
			val = val + val.trim() != '' ? val : vm._blank;
			if (!ignoreCustomFields[prop] && !vm.options.filters[prop][val]) return false;
		}
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

	function pageby(inc) {
		vm.options.currentPage += inc;
		getTickets();
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
		d=d.replace(/(?:^|[\r\f\n\v])(?:F?(?:riendly))?\s?D(?:esc(?:ription)?)?\:/i, delim + "FD" + delim);
		d=d.replace(/(?:^|[\r\f\n\v])\D(?:esc(?:ription)?)?\:/i, delim + "D" + delim);
		d=d.replace(/(?:^|[\r\f\n\v])\*D(?:esc(?:ription)?)?\*/i, delim + "D" + delim);
		d=d.replace(/(?:^|[\r\f\n\v])L(?:oc(?:ation)?)?\:/i, delim + "L" + delim);
		d=d.replace(/(?:^|[\r\f\n\v])\*L(?:oc(?:ation)?)?\*/i, delim + "L" + delim);
		d=d.replace(/(?:^|[\r\f\n\v])T(?:est(?:ing|s))(?:\s?I?(?:deas)?)?\:/i, delim + "T" + delim);
		d=d.replace(/(?:^|[\r\f\n\v])\*T(?:est(?:ing|s))(?:\s?I?(?:deas)?)?\*/i, delim + "T" + delim);
		d=d.replace(/(?:^|[\r\f\n\v])P(?:erm(?:issions)?)?\:/i, delim + "P" + delim);
		d=d.replace(/(?:^|[\r\f\n\v])(?:A(?:uth(?:orization)?)?\s?)?(?:S(?:cope)?)?\:/i, delim + "P" + delim);
		d=d.replace(/(?:^|[\r\f\n\v])R(?:ole(?:s)?)?\:/i, delim + "P" + delim);
		d=d.replace(/(?:^|[\r\f\n\v])R(?:eported)?(?:\s?B?(?:y)?)?\:/i, delim + "RB" + delim);
		var parts = d.split(delim);
		if (!/TD|FD|T|L|RP|P/.test(parts[0])) parts.unshift('D');
		for (var i = 2; i < parts.length; i = i + 2) {
			parsed[parts[i-1]] = parts[i];
		}
		ticket.parsed = parsed;		
	}
	function isValidTicket(ticket) {
		if (!ticket.parsed) parseDescription(ticket);
		return (ticket.parsed.T && ticket.parsed.L && (ticket.parsed.TD || ticket.parsed.FD || ticket.parsed.D));
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
	
	function updateTicketCount(ticket,countObj) {
		countObj = countObj || vm.ticketCount;
		var at = ticket.assigned_to_id;
		at = at && at.trim() != "" ? at : vm._unassigned;
		if (!countObj.assignedTo) countObj.assignedTo = {};
		if (!countObj.assignedTo[at]) countObj.assignedTo[at]=0;
		countObj.assignedTo[at] = countObj.assignedTo[at] + 1;
		
		var tags = ticket.tags;
		if (!countObj.tag) countObj.tag = {};
		if (tags && angular.isArray(tags)) {
			tags.forEach(function(tag) {
				if (!countObj.tag[tag]) countObj.tag[tag]=0;
				countObj.tag[tag]++;
			});
		}
		
		var s = ticket.status;
		if (!countObj.status) countObj.status = {};
		if (!countObj.status[s]) countObj.status[s]=0;
		countObj.status[s]++;
		
		var cfs = ticket.custom_fields;
		for (var prop in cfs) {
			if (!countObj[prop]) countObj[prop] = {};
			var cfVal = cfs[prop] && cfs[prop].trim() != "" ? cfs[prop] : vm._blank;
			if (!countObj[prop][cfVal]) countObj[prop][cfVal]=0;
			countObj[prop][cfVal]++;
		}
		
	}

}
