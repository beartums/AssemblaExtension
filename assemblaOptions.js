angular.module("assembla")
  .controller("assemblaOptionsController", ['$http', '$scope', 'assemblaService', 'assemblaOptionsService',
    function($http, $scope, as, aos) {
      var vm = this

      vm.status = aos.status;
      vm.options = aos.options;
      vm.onchange = aos.onchange;

      return vm
    }
  ]);
