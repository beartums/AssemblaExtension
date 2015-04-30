localforage.config({
    storeName   : 'assembla', // Should be alphanumeric, with underscores.
});

var options = {};
var userMentions = [];
var users = {};
var intervalFunc;

getOptions()

function getOptionsLF() {
	//var timeout = options.mentionWatchInterval;
	return localforage.getItem('options').then(function(data) {
		options=data;
	}, function(err) {
		console.dir(err)
	});
}
function getOptions() {
		chrome.storage.sync.get({
			secret: '',
			key: '',
			mentionWatchInterval: '60000'
		}, function(items) {
			options.secret = items.secret;
			options.key = items.key;
			options.mentionWatchInterval = items.mentionWatchInterval;
			
			startMentionWatch(options.mentionWatchInterval);
		});
	}
	
function startMentionWatch(interval) {
	getMentions().always(function(data) {
		options = options || {};
		interval = interval || options.mentionWatchInterval || 60000
		setTimeout(function() {
			getOptions();
		},interval);
	});
}

	
function getMentions() {
	var url = "https://api.assembla.com/v1/user/mentions.json?unread=true"
	headers = {
		'X-api-key': options ? options.key : null,
		'X-api-secret': options ? options.secret : null
	}
	var configObj = {
		"headers": headers
	}
	
	return $.ajax(url,configObj).done(function(data) {
		userMentions = [];
		if (!data) data=[];
		data.forEach(function(mention) {
			userMentions.push(mention);
			var user = users[mention.author_id]
			if (!user || user.name=='not found') {
				getUser(mention.author_id);
			}
		})
		chrome.browserAction.setBadgeText({text: !userMentions || userMentions.length==0 ? '0' : userMentions.length.toString()});
		var color = userMentions.length==0 ? '#A8A8A8' : '#FF0000'
		chrome.browserAction.setBadgeBackgroundColor({'color':color});
		return data;
	}).fail(function (err) {
		chrome.browserAction.setBadgeText({text:"?!"});
		var color =  '#FF0000'
		chrome.browserAction.setBadgeBackgroundColor({'color':color});
	});
}

function getUser(id) {
	var url = "https://api.assembla.com/v1/users/" + id;
	headers = {
		'X-api-key': options.key,
		'X-api-secret': options.secret
	}
	var configObj = {
		"headers": headers
	}
	return $.ajax(url,configObj).done(function(data) {
		users[id] = data;
	}).fail(function(err) {
		console.dir(err);
		users[id]={name:'not found'}
	});
}

function markMentionRead(id) {
	var url =  "https://api.assembla.com/v1/user/mentions/" + id +
				"/mark_as_read.json"
	headers = {
		'X-api-key': options.key,
		'X-api-secret': options.secret
	}
	var configObj = {
		"headers": headers,
		"method": "PUT"
	}
	return $.ajax(url,configObj).done(function(data) {
		console.dir(data);
		return getMentions();
	}).fail(function(err) {
		console.dir(err);
	});
}

function cancelInterval() {
	clearInterval(intervalFunc);
}
