angular.module("assembla")
  .controller("assemblaOptionsController", ['$http', '$scope', 'assemblaService', 'assemblaOptionsService',
    function($http, $scope, as, aos) {
      var vm = this
			//aos.setOnReadyHandler(init)
      vm.status = aos.status;
      vm.options = aos.options;
			vm.change = aos.saveOptions;

			function init() {
				vm.status = aos.status;
				vm.options=aos.options;
			}
			function toggle(obj,prop) {
				obj[prop] = !obj[prop];
				vm.change()
			}
			
      return vm
    }
  ]);
