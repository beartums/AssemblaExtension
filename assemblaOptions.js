angular.module("assembla")
  .controller("assemblaOptionsController", ['$http', '$scope', 'assemblaService', 'assemblaOptionsService',
    function($http, $scope, as, aos) {
      var vm = this
			//aos.setOnReadyHandler(init)
      vm.status = aos.status;
      vm.options = aos.options;
			vm.change = aos.saveOptions;
			
			function change() {
				console.dir(vm.options);
				console.dir(aos.options);
			}

			function init() {
				vm.status = aos.status;
				vm.options=aos.options;
			}
      return vm
    }
  ]);
