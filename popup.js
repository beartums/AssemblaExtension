chrome.tabs.query({
	title: 'Assembla * Extension'
}, function(tabs) {
	if (!tabs || !tabs.length || tabs.length == 0) {
		chrome.tabs.create({
			url: chrome.extension.getURL('assembla.html')
		});
	} else {
		if (tabs[0].active) {
		// Tab is already shown and active, show popup
		} else {
			chrome.tabs.update(tabs[0].id, {
				active: true
			});
		}
	}
});

angular.module("assembla")
	.filter("authorInitials", function() {
		return function(id,users) {
			var author = users[id];
			var init = '', inits = []
			if (!author) return '--';
			var name = (author.name ? author.name 
									: (author.email ? author.email.substring(0,author.email.indexOf('@')-1)
										: author.login));
			inits = name.replace("."," ").split(" ");
			if (inits.length==1) return inits[0].substring(0,3);
			return inits.reduce(function(init,name) {
				init += name[0];
				return init;
			},"");
		}
	})

	.controller("popupController", ['assemblaService','assemblaOptionsService','$window',popupControllerFunction]);
	
	function popupControllerFunction(as,aos,$window) {
		
		var pu = this;
		pu.bgPage = chrome.extension.getBackgroundPage();
		pu.options = aos.options;
		pu.gotoUrl = gotoUrl;
		pu.authorInitials = authorInitials;
		pu.markAsRead = markAsRead;
		console.dir(pu.bgPage);
		//aos.setOnReadyHandler(init);
		
		function gotoUrl(url) {
			$window.open(url);
		}
		
		function markAsRead(mention) {
			as.markMentionAsRead({mentionId:mention.id
			}).success(function(data) {
				var idx = pu.bgPage.getMentions();
			})
		}
		
		
		// get initials of author or mention from the userid
		function authorInitials(id) {
			var author = pu.bgPage.users(id);
			var init = '', inits = []
			if (!author) return '--';
			var name = (author.name ? author.name 
									: (author.email ? author.email.substring(0,author.email.indexOf('@')-1)
										: author.login));
			inits = name.replace("."," ").split(" ");
			if (inits.length==1) return inits[0].substring(0,3);
			return inits.reduce(function(init,name) {
				init += name[0];
				return init;
			},"");
		}
				
	}
	
	
	