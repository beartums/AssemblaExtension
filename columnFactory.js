angular.module("assembla")
	.factory('ColumnFactory',['$filter', function ($filter) {
	
	function cfInit() {
			cf.addColumn('id','Id');
		cf.addColumn('number','Number');
		cf.addColumn('summary','Summary',{func: abbreviate});
		cf.addColumn('priority','Priority',{lookup:{'1': 'Highest','2':'High','3':'Normal','4':'Low','5':'Lowest'}});
		cf.addColumn('completed_date','Completed',{'filter': 'date','parm1':'yyyy-MM-dd'} );
		cf.addColumn('component_id','Component',{func:getFromList,parms:['@val',vm.components,'id','name']});
		cf.addColumn('created_on','Created',{'filter': 'date','parm1':'yyyy-MM-dd'});
		cf.addColumn('milestone_id','Milestone',{func:getFromList,parms:['@val',vm.milestones,'id','title']});
		cf.addColumn('state','State',{lookup:{'0':'Open','1':'Closed'}});
		cf.addColumn('status','Status');
		cf.addColumn('assigned_to_id','Assigned To',{func:getFromList,parms:['@val',vm.users,'id','login']});
		cf.addColumn('reporter_id','Reported By',{func:getFromList,parms:['@val',vm.users,'id','login']});
		cf.addColumn('updated_at','Updated',{'filter': 'date','parm1':'yyyy-MM-dd'});
		cf.addColumn('space_id','Space',{func:getFromList,parms:['@val',vm.spaces,'id','name']});
		cf.addColumn('custom_fields.Due Date','Due Date',{'filter': 'date','parm1':'yyyy-MM-dd'});
		cf.addColumn('custom_fields.QA','Bug Type');
		cf.addColumn('custom_fields.QA Assigned Person','QA Tester');
		cf.addColumn('custom_fields.Due Date','Due Date',{'filter': 'date','parm1':'yyyy-MM-dd'});
		cf.addColumn('hierarchy_type','Type',{lookup:{'0':'Ticket','1':'Subtask','2':'Story','3':'Epic'}});
		cf.addColumn('@doc_segs','Segments',{func:getParsedProps,parms:['@ticket']});
		cf.addColumn('@is_valid','Segments',{func:isValidTicket,parms:['@ticket'],returnType:'html',
													boolVals: {trueVal: "<span class='glyphicon glyphicon-ok text-success'></span>",
																		falseVal: "<span class='glyphicon glyphicon-remove text-danger'></span>"}});
		
		if (!aos.options.visibleColumns) {
			var col = cf.unhideColumn('number');
			col = cf.unhideColumn('summary',col);
			col = cf.unhideColumn('status',col);
			col = cf.unhideColumn('Created',col);
			col = cf.unhideColumn('Assigned To',col);
		}
	}
	function Column(propertyName, heading, transformObj) {
		this.heading = heading;
		this.propertyName = propertyName;
		this.transform = transformObj;
	}
	
	Column.prototype.getDisplayData = function(obj) {
	// obj: object from which the data is being extracted for this column
		if (this.propertyName.indexOf('@')==0 && !this.transform) return '';
		var props = [], data = '';
		
		if (this.propertyName.indexOf('@')!=0) {
			var props = this.propertyName.split('.');
			var val = props.reduce(function(value,prop) {
				if (!value) return null;
				return value[prop];
			},obj);
			if (!data || !this.transform) return val;
		}
		
		if (this.transform.func) {
			var parms = this.transform.parms;
			if (parms && angular.isArray(parms)) {
				var args = this.transform.parms.map(function(arg) {
					if (arg=='@object') return obj;
					if (arg=='@val' || arg=='@value') return val;
					return arg;
				});
			} else {
				args = [val]; // extracted data ia always the first parm, unless parms are specified
			}
			return this.transform.func(args[0],args[1],args[2],args[3],args[4],args[5],args[6]);
		} else if (this.lookup) {
			return this.transform.lookup[val];
		} else if (this.transform.filter) { // is string, format using angular filters
			return $filter(this.transform.filter)(val, this.transform.parms[0],this.transform.parms[1]);
		}
	}
	
	var visibleColumns = [];
	var visibleColumnNames = []; // a hook for an options service
	var hiddenColumns = [];
	
	var cf = {};
	
	cf.addColumn = addColumn;
	cf.unhideColumn = unhideColumn;
	cf.hideColumn = hideColumn;
	cf.visibleColumns = visibleColumns;
	cf.visibleColumnNames = visibleColumnNames;
	
	return cf;
	
	function getColumnByName(name,columnsToSearch,propToMatch) {
		return columns.ToSearch.reduce(function(found,col) {
			if (found) return found;
			if (col[propToMatch]==name) return col;
			return null;
		},null);
	}
	function unhideColumn(name,preceedingColumn) {
		var prop = 'heading';
		var col = getColumnByName(name,hiddenColumns,prop);
		if (!col) {
			prop = 'propertyName';
			col = getColumnByName(name,hiddenColumns,prop);
		}
		if (!col) return false;
		
		visibleColumns.splice(visibleColumns.indexOf(preceedingColumn)+1,0,col);
		hiddenColumns.splice(hiddenColumns.indexOf(col),1);
		return col;
	}
	function hideColumn(column) {
		var idx = visibleColumns.indexOf(column);
		if (idx<0) return false;
		visibleColumns.splice(idx,1);
		hiddenColumns.push(column)
		return column;
	}
	
	function addColumn(propertyName, heading, transform, transformArgs, makeVisible) {
		var col = new Column(propertyName, heading, transform, transformArgs);
		var idx = visibleColumnNames.indexOf(propertyName);
		idx = -1 ? visibleColumnNames.indexOf(heading) : idx;
		if (idx>-1) {
			visibleColumnNames.splice(idx,1);
			makeVisible=true;
		}
		if (makeVisible) visibleColumns.push(col);
		if (!makeVisible) hiddenColumns.push(col);
		return col
	}
	
}]);