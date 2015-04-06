angular.module("assembla")
	.factory('ColumnFactory',['$filter', function ($filter) {
	
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