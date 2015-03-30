chrome.tabs.query({
	title: 'Assembla * Extension'
}, function(tabs) {
	if (!tabs || !tabs.length || tabs.length == 0) {
		chrome.tabs.create({
			url: chrome.extension.getURL('assembla.html')
		});
	} else {
		chrome.tabs.update(tabs[0].id, {
			active: true
		});
	}
});
