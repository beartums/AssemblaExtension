angular.module("assembla", ['ui.bootstrap','directiveModule','LocalForageModule','pageslide-directive'])

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
