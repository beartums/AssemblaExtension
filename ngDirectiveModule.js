var directiveModule = angular.module("directiveModule", []);

// click-to-edit, 
//  adapted fromt he code on Tim Riley's blog: http://icelab.com.au/articles/levelling-up-with-angularjs-building-a-reusable-click-to-edit-directive/
//
directiveModule.directive("clickToEdit", function ($timeout) {
    var editorTemplate = '<span class="click-to-edit">' +
        '<pre data-ng-hide="view.editorEnabled" data-ng-click="enableEditor($event)" class="c2e-display">{{value}}</pre>' +
        '<span data-ng-show="view.editorEnabled" class="c2e-input">' +
            '<textarea cols="120" rows="10" data-ng-model="view.editableValue" data-ng-keydown="keydown($event)" data-ng-blur="save()" class="c2e-input"></textarea>' +
        '</span>' +
    '</span>';

    return {
        restrict: "A",
        replace: true,
        template: editorTemplate,
        scope: {
            value: "=clickToEdit",
            changeCallback: "@onValueChange",
						changeParms: "@valueChangeParms"
        },
        controller: function ($scope,$timeout) {
            $scope.view = {
                editableValue: $scope.value,
                editorEnabled: false,
								test: $scope.test
            };

            $scope.enableEditor = function ($event) {

                $scope.view.editorEnabled = true;
                $scope.view.editableValue = $scope.value;
                var thisElement = $event.target;
                var editElement = thisElement.nextSibling.children[0];
                $timeout(function () {
                    editElement.focus();
										editElement.selectionStart=0;
										editElement.selectionEnd=0;
                }); 
            };

            $scope.disableEditor = function () {
                $scope.view.editorEnabled = false;
            };

            $scope.save = function () {
							var parms = [];
							if (!$scope.changeParms) parms = ['@newVal','@oldVal'];
							else if (angular.isArray($scope.changeParms)) parms = $scope.changeParms;
							else parms=[$scope.changeParms];
							parms.forEach(function(parm,idx) {
								if (parms[idx]=='@oldVal') {
									parms[idx] = $scope.value;
								} else if (parms[idx]=='@newVal') {
									parms[idx] = $scope.view.editableValue;
								}
							}); 
							
							if ($scope.value != $scope.view.editableValue) {
									var oldValue = $idxscope.value;
									$scope.value = $scope.view.editableValue;
									if ($scope.changeCallback) {
											$scope.changeCallback(parms[0],parms[1],parms[2],parms[3],parms[4],parms[5],parms[6],parms[7]);
									}
							}
							$scope.disableEditor();
            };

            $scope.keydown = function ($event) {
								var idx=$event.target.selectionStart;
                if ($event.keyCode==16 && $event.shiftKey) { // shifttab imsert a tab
									$scope.cursorIdx = $event.target.selectionStart;
								} else if ($event.keyCode == '9' && $event.shiftKey) { // shifttab imsert a tab
									$event.preventDefault();
									//var idx = $event.target.selectionStart;
									var chars = $scope.view.editableValue.split("")
									chars.splice(idx,0,'\t');
									$scope.view.editableValue = chars.join("");
									$timeout(function() {
											$event.target.setSelectionRange($scope.cursorIdx+1,$scope.cursorIdx+1);
									});
                } else if ($event.keyCode == '27') { // escape
										$scope.view.editableValue = $scope.value;
                    $scope.disableEditor();
                }
            }
        }
    };
});

directiveModule.directive('focusOn', function ($timeout) {
    return {
        restrict: 'A',
        link: function ($scope, $element, $attr) {
            $scope.$watch($attr.focusOn, function (_focusVal) {
                $timeout(function () {
                    _focusVal ? $element.focus() :
                        $element.blur();
                });
            });
        }
    }
})